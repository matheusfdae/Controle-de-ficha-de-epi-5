-- =========================================================
-- Cópia das fichas do Supabase Cloud (antigo, "dev") para a produção (VM).
-- Rodado por migrar-fichas.sh, que baixa as tabelas do Cloud (API REST)
-- para /tmp/migra-fichas/<tabela>.ndjson dentro do container do banco e
-- define :aplicar (true = COMMIT, false = ensaio com ROLLBACK).
--
-- Copia: fichas_epi + itens, os colaboradores (profiles) que elas usam e
-- os itens de catálogo / funções que faltarem na produção.
-- NÃO copia: estoque, movimentações, tokens de assinatura, termos
-- coletivos, integração, usuários de login do Clerk de desenvolvimento.
-- Fichas cujo funcionário começa com "teste" ficam de fora.
-- Triggers desligados durante a cópia: ficha antiga NÃO dá baixa no estoque.
-- =========================================================
\set ON_ERROR_STOP on

BEGIN;

-- Uma linha JSON por registro do Cloud. QUOTE/DELIMITER com bytes que não
-- aparecem no JSON = cada linha entra inteira, sem interpretar barras.
CREATE TEMP TABLE j_profiles (j jsonb);
CREATE TEMP TABLE j_fichas (j jsonb);
CREATE TEMP TABLE j_itens (j jsonb);
CREATE TEMP TABLE j_epis (j jsonb);
CREATE TEMP TABLE j_funcoes (j jsonb);
\copy j_profiles (j) FROM '/tmp/migra-fichas/profiles.ndjson' WITH (FORMAT csv, QUOTE E'\x01', DELIMITER E'\x02')
\copy j_fichas (j) FROM '/tmp/migra-fichas/fichas_epi.ndjson' WITH (FORMAT csv, QUOTE E'\x01', DELIMITER E'\x02')
\copy j_itens (j) FROM '/tmp/migra-fichas/fichas_epi_itens.ndjson' WITH (FORMAT csv, QUOTE E'\x01', DELIMITER E'\x02')
\copy j_epis (j) FROM '/tmp/migra-fichas/epis.ndjson' WITH (FORMAT csv, QUOTE E'\x01', DELIMITER E'\x02')
\copy j_funcoes (j) FROM '/tmp/migra-fichas/funcoes.ndjson' WITH (FORMAT csv, QUOTE E'\x01', DELIMITER E'\x02')

-- Registros do Cloud no formato das tabelas da PRODUÇÃO (coluna que a
-- produção não tem, ex. uf/modelo_id, é ignorada).
CREATE TEMP TABLE d_profiles AS SELECT r.* FROM j_profiles, jsonb_populate_record(NULL::public.profiles, j) r;
CREATE TEMP TABLE d_fichas   AS SELECT r.* FROM j_fichas,   jsonb_populate_record(NULL::public.fichas_epi, j) r;
CREATE TEMP TABLE d_itens    AS SELECT r.* FROM j_itens,    jsonb_populate_record(NULL::public.fichas_epi_itens, j) r;
CREATE TEMP TABLE d_epis     AS SELECT r.* FROM j_epis,     jsonb_populate_record(NULL::public.epis, j) r;
CREATE TEMP TABLE d_funcoes  AS SELECT r.* FROM j_funcoes,  jsonb_populate_record(NULL::public.funcoes, j) r;

-- ---------- O que a produção já tem ----------
\echo ''
\echo '=== Fichas que JÁ EXISTEM na produção ==='
SELECT 'fichas na produção' AS item, count(*) AS qtd FROM public.fichas_epi
UNION ALL SELECT '  criadas entre', NULL FROM (SELECT 1) x
UNION ALL SELECT '    primeira: ' || COALESCE(min(created_at)::date::text, '-'), NULL FROM public.fichas_epi
UNION ALL SELECT '    última: ' || COALESCE(max(created_at)::date::text, '-'), NULL FROM public.fichas_epi
UNION ALL SELECT '  iguais às do Cloud (mesmo id)', count(*) FROM public.fichas_epi WHERE id IN (SELECT id FROM d_fichas)
UNION ALL SELECT '  parecidas com as do Cloud (mesmo funcionário + data)', count(*) FROM public.fichas_epi p
            WHERE p.id NOT IN (SELECT id FROM d_fichas)
              AND EXISTS (SELECT 1 FROM d_fichas d WHERE lower(trim(d.nome_funcionario)) = lower(trim(p.nome_funcionario))
                                                     AND d.data_entrega = p.data_entrega)
UNION ALL SELECT '  só existem na produção', count(*) FROM public.fichas_epi p
            WHERE p.id NOT IN (SELECT id FROM d_fichas)
              AND NOT EXISTS (SELECT 1 FROM d_fichas d WHERE lower(trim(d.nome_funcionario)) = lower(trim(p.nome_funcionario))
                                                         AND d.data_entrega = p.data_entrega);

-- Ficha que já está na produção não é copiada de novo: nem pelo mesmo id,
-- nem pelo mesmo funcionário + data de entrega (a mesma ficha vinda de outra
-- base, com outro id).
CREATE TEMP TABLE ja_na_producao AS
SELECT d.id FROM d_fichas d
WHERE d.id IN (SELECT id FROM public.fichas_epi)
   OR EXISTS (SELECT 1 FROM public.fichas_epi p
              WHERE lower(trim(p.nome_funcionario)) = lower(trim(d.nome_funcionario))
                AND p.data_entrega = d.data_entrega);
CREATE TEMP TABLE sel_fichas AS
SELECT * FROM d_fichas
WHERE (nome_funcionario IS NULL OR nome_funcionario !~* '^\s*teste\M')
  AND id NOT IN (SELECT id FROM ja_na_producao);
-- Estado da ficha pelo final do posto ("GUARANTA DO NORTE/MT" -> MT);
-- posto sem estado reconhecível -> DF.
CREATE TEMP TABLE uf_ficha AS
SELECT id, COALESCE(substring(upper(trim(posto_snapshot)) FROM '[/ -](DF|GO|MT|SP)$'), 'DF') AS uf
FROM sel_fichas;

-- Número já usado na produção: a ficha recebe o próximo número livre.
CREATE TEMP TABLE renumerar AS
SELECT s.id FROM sel_fichas s WHERE EXISTS (SELECT 1 FROM public.fichas_epi p WHERE p.numero = s.numero);
SELECT setval(pg_get_serial_sequence('public.fichas_epi', 'numero'),
              GREATEST((SELECT COALESCE(max(numero), 0) FROM public.fichas_epi),
                       (SELECT COALESCE(max(numero), 0) FROM sel_fichas), 1)) AS proximo_numero_base;

-- ---------- Colaboradores: casa por e-mail, depois por CPF ----------
CREATE TEMP TABLE map_prof AS
SELECT d.id AS dev_id,
  COALESCE(
    (SELECT p.id FROM public.profiles p
      WHERE NULLIF(trim(d.email), '') IS NOT NULL AND lower(trim(p.email)) = lower(trim(d.email)) LIMIT 1),
    (SELECT p.id FROM public.profiles p
      WHERE NULLIF(regexp_replace(COALESCE(d.cpf, ''), '\D', '', 'g'), '') IS NOT NULL
        AND regexp_replace(COALESCE(p.cpf, ''), '\D', '', 'g') = regexp_replace(d.cpf, '\D', '', 'g') LIMIT 1)
  ) AS prod_id
FROM d_profiles d;

-- Novos = sem correspondente na produção. Login do Clerk de desenvolvimento
-- não vale na produção: só entra quem não tem login ou é usado por ficha.
CREATE TEMP TABLE prof_inserir AS
SELECT d.* FROM d_profiles d JOIN map_prof m ON m.dev_id = d.id
WHERE m.prod_id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = d.id)
  AND (d.clerk_user_id IS NULL
       OR d.id IN (SELECT colaborador_id FROM sel_fichas
                   UNION SELECT criado_por FROM sel_fichas WHERE criado_por IS NOT NULL));
UPDATE map_prof m SET prod_id = m.dev_id FROM prof_inserir i WHERE i.id = m.dev_id;

-- Colaborador que a ficha aponta mas que não está no cadastro do Cloud:
-- se o mesmo id já existe na produção, usa; senão cria o cadastro com os
-- dados da própria ficha (nome, CPF, matrícula, posto — a mais recente).
INSERT INTO map_prof (dev_id, prod_id)
SELECT DISTINCT f.colaborador_id, f.colaborador_id FROM sel_fichas f
WHERE f.colaborador_id NOT IN (SELECT dev_id FROM map_prof)
  AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = f.colaborador_id);
CREATE TEMP TABLE prof_da_ficha AS
SELECT DISTINCT ON (f.colaborador_id)
       f.colaborador_id AS id, COALESCE(NULLIF(trim(f.nome_funcionario), ''), 'Colaborador') AS nome_completo,
       NULLIF(trim(f.cpf_snapshot), '') AS cpf, NULLIF(trim(f.matricula_snapshot), '') AS matricula,
       NULLIF(trim(f.posto_snapshot), '') AS posto, f.created_at
FROM sel_fichas f
WHERE f.colaborador_id IS NOT NULL AND f.colaborador_id NOT IN (SELECT dev_id FROM map_prof)
ORDER BY f.colaborador_id, f.created_at DESC;
INSERT INTO map_prof (dev_id, prod_id) SELECT id, id FROM prof_da_ficha;

-- ---------- Catálogo e funções: casa pelo nome ----------
CREATE TEMP TABLE map_epi AS
SELECT d.id AS dev_id,
  (SELECT p.id FROM public.epis p WHERE lower(trim(p.nome)) = lower(trim(d.nome)) LIMIT 1) AS prod_id
FROM d_epis d;
CREATE TEMP TABLE epi_inserir AS
SELECT d.* FROM d_epis d JOIN map_epi m ON m.dev_id = d.id
WHERE m.prod_id IS NULL
  AND d.id IN (SELECT epi_id FROM d_itens WHERE ficha_id IN (SELECT id FROM sel_fichas));
UPDATE map_epi m SET prod_id = m.dev_id FROM epi_inserir i WHERE i.id = m.dev_id;

CREATE TEMP TABLE map_funcao AS
SELECT d.id AS dev_id,
  (SELECT p.id FROM public.funcoes p WHERE lower(trim(p.nome)) = lower(trim(d.nome)) LIMIT 1) AS prod_id
FROM d_funcoes d;
CREATE TEMP TABLE funcao_inserir AS
SELECT d.* FROM d_funcoes d JOIN map_funcao m ON m.dev_id = d.id
WHERE m.prod_id IS NULL AND d.id IN (SELECT funcao_id FROM sel_fichas WHERE funcao_id IS NOT NULL);
UPDATE map_funcao m SET prod_id = m.dev_id FROM funcao_inserir i WHERE i.id = m.dev_id;

-- ---------- Cópia (sem triggers: nada de baixa de estoque/movimentação) ----------
ALTER TABLE public.profiles DISABLE TRIGGER USER;
ALTER TABLE public.fichas_epi DISABLE TRIGGER USER;
ALTER TABLE public.fichas_epi_itens DISABLE TRIGGER USER;

INSERT INTO public.profiles (id, nome_completo, email, cpf, matricula, cargo, departamento, posto,
                             data_admissao, ativo, foto_url, inativado_em, motivo_inativacao,
                             must_change_password, created_at, updated_at)
SELECT id, nome_completo, email, cpf, matricula, cargo, departamento, posto,
       data_admissao, ativo, foto_url, inativado_em, motivo_inativacao,
       false, created_at, updated_at
FROM prof_inserir;

-- Supervisor só se ele também existir na produção.
UPDATE public.profiles p SET supervisor_id = ms.prod_id
FROM prof_inserir i JOIN map_prof ms ON ms.dev_id = i.supervisor_id
WHERE p.id = i.id AND ms.prod_id IS NOT NULL;

INSERT INTO public.profiles (id, nome_completo, cpf, matricula, posto, ativo, must_change_password, created_at, updated_at)
SELECT id, nome_completo, cpf, matricula, posto, true, false, created_at, created_at FROM prof_da_ficha;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'colaborador'::public.app_role FROM prof_inserir
UNION SELECT id, 'colaborador'::public.app_role FROM prof_da_ficha
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.funcoes (id, nome, descricao, ativo, created_at, updated_at)
SELECT id, nome, descricao, ativo, created_at, updated_at FROM funcao_inserir;

INSERT INTO public.epis (id, nome, codigo, categoria, ca_numero, ca_validade, descricao, fabricante,
                         fornecedor, vida_util_dias, estoque_minimo, ativo, tipo, estoque_atual,
                         created_at, updated_at)
SELECT id, nome, codigo, categoria, ca_numero, ca_validade, descricao, fabricante,
       fornecedor, vida_util_dias, estoque_minimo, ativo, tipo, 0, created_at, updated_at
FROM epi_inserir;

INSERT INTO public.fichas_epi (id, numero, colaborador_id, data_entrega, data_devolucao, status, observacoes,
                               criado_por, assinatura_colaborador_url, assinatura_supervisor_url,
                               data_assinatura_colaborador, data_assinatura_supervisor, ip_assinatura,
                               nome_funcionario, funcao, funcao_id, telefone, cpf_snapshot,
                               matricula_snapshot, posto_snapshot, empresa, motivo, turno,
                               created_at, updated_at, uf)
SELECT f.id,
       CASE WHEN f.id IN (SELECT id FROM renumerar)
            THEN nextval(pg_get_serial_sequence('public.fichas_epi', 'numero')) ELSE f.numero END,
       mc.prod_id, f.data_entrega, f.data_devolucao, f.status, f.observacoes,
       mcr.prod_id, f.assinatura_colaborador_url, f.assinatura_supervisor_url,
       f.data_assinatura_colaborador, f.data_assinatura_supervisor, f.ip_assinatura,
       f.nome_funcionario, f.funcao, mf.prod_id, f.telefone, f.cpf_snapshot,
       f.matricula_snapshot, f.posto_snapshot, f.empresa, f.motivo, f.turno,
       f.created_at, f.updated_at, u.uf
FROM sel_fichas f
JOIN uf_ficha u ON u.id = f.id
-- Ficha criada pela Nova Ficha não tem colaborador_id (só o nome no texto): fica vazio igual.
LEFT JOIN map_prof mc ON mc.dev_id = f.colaborador_id
LEFT JOIN map_prof mcr ON mcr.dev_id = f.criado_por
LEFT JOIN map_funcao mf ON mf.dev_id = f.funcao_id;

INSERT INTO public.fichas_epi_itens (id, ficha_id, epi_id, descricao, ca, quantidade, tamanho, posto_servico,
                                     data_validade, recebido, motivo_entrega, estado, observacao_item, created_at)
SELECT i.id, i.ficha_id, me.prod_id, i.descricao, i.ca, i.quantidade, i.tamanho, i.posto_servico,
       i.data_validade, i.recebido, i.motivo_entrega, i.estado, i.observacao_item, i.created_at
FROM d_itens i
JOIN public.fichas_epi f ON f.id = i.ficha_id
LEFT JOIN map_epi me ON me.dev_id = i.epi_id
WHERE i.ficha_id IN (SELECT id FROM sel_fichas);

ALTER TABLE public.profiles ENABLE TRIGGER USER;
ALTER TABLE public.fichas_epi ENABLE TRIGGER USER;
ALTER TABLE public.fichas_epi_itens ENABLE TRIGGER USER;

-- Próxima ficha continua a numeração.
SELECT setval(pg_get_serial_sequence('public.fichas_epi', 'numero'),
              GREATEST((SELECT COALESCE(max(numero), 0) FROM public.fichas_epi), 1));

-- ---------- Conferência ----------
SELECT 'fichas na origem (total)' AS item, count(*) AS qtd FROM d_fichas
UNION ALL SELECT 'fichas de teste deixadas de fora', count(*) FROM d_fichas WHERE nome_funcionario ~* '^\s*teste\M'
UNION ALL SELECT 'já estavam na produção (mesmo id)', count(*) FROM ja_na_producao j
            WHERE j.id IN (SELECT id FROM public.fichas_epi) AND j.id NOT IN (SELECT id FROM sel_fichas)
UNION ALL SELECT 'já estavam na produção (mesmo funcionário + data)', count(*) FROM ja_na_producao j
            WHERE j.id NOT IN (SELECT id FROM public.fichas_epi)
UNION ALL SELECT 'fichas a copiar', count(*) FROM sel_fichas
UNION ALL SELECT '  sem colaborador vinculado (normal na Nova Ficha)', count(*) FROM sel_fichas WHERE colaborador_id IS NULL
UNION ALL SELECT '  assinadas', count(*) FROM sel_fichas WHERE status = 'assinada'
UNION ALL SELECT 'itens a copiar', count(*) FROM d_itens WHERE ficha_id IN (SELECT id FROM sel_fichas)
UNION ALL SELECT 'itens sem item de catálogo', count(*) FROM public.fichas_epi_itens
            WHERE epi_id IS NULL AND ficha_id IN (SELECT id FROM sel_fichas)
UNION ALL SELECT 'colaboradores já existentes (e-mail/CPF)', count(*) FROM map_prof m
            WHERE m.prod_id IS NOT NULL AND m.dev_id NOT IN (SELECT id FROM prof_inserir)
              AND m.dev_id NOT IN (SELECT id FROM prof_da_ficha)
UNION ALL SELECT 'colaboradores criados (cadastro do Cloud)', count(*) FROM prof_inserir
UNION ALL SELECT 'colaboradores criados (dados da ficha)', count(*) FROM prof_da_ficha
UNION ALL SELECT 'fichas selecionadas que NÃO entraram (conferir!)', count(*) FROM sel_fichas
            WHERE id NOT IN (SELECT id FROM public.fichas_epi)
UNION ALL SELECT 'renumeradas (nº já usado na produção)', count(*) FROM renumerar
UNION ALL SELECT 'itens digitados à mão no Cloud (sem catálogo, normal)', count(*) FROM d_itens
            WHERE epi_id IS NULL AND ficha_id IN (SELECT id FROM sel_fichas)
UNION ALL SELECT 'itens de catálogo criados', count(*) FROM epi_inserir
UNION ALL SELECT 'funções criadas', count(*) FROM funcao_inserir;

\echo ''
\echo '=== Fichas a copiar, por estado (pelo posto) ==='
SELECT u.uf, count(*) AS fichas,
       string_agg(DISTINCT CASE WHEN u.uf = 'DF' AND f.posto_snapshot !~* '[/ -]DF\s*$' THEN NULLIF(trim(f.posto_snapshot), '') END, ' | ')
         FILTER (WHERE u.uf = 'DF') AS postos_sem_estado_no_nome
FROM uf_ficha u JOIN sel_fichas f ON f.id = u.id GROUP BY u.uf ORDER BY u.uf;

\echo ''
\echo '=== As 400 que JÁ estão na produção (todas marcadas DF), pelo posto seriam ==='
SELECT COALESCE(substring(upper(trim(posto_snapshot)) FROM '[/ -](DF|GO|MT|SP)$'), 'DF (sem estado no posto)') AS uf_pelo_posto,
       count(*) AS fichas
FROM public.fichas_epi WHERE id NOT IN (SELECT id FROM sel_fichas) GROUP BY 1 ORDER BY 1;

SELECT 'Fichas de teste deixadas de fora:' AS aviso, nome_funcionario, created_at::date
FROM d_fichas WHERE nome_funcionario ~* '^\s*teste\M' ORDER BY created_at;

-- (Produção já tinha 7 fichas sem relação com as do Cloud — conferido no
-- ensaio de 08/10/2026 — então a cópia pode conviver com elas.)

\if :aplicar
COMMIT;
\echo '>>> CÓPIA GRAVADA NA PRODUÇÃO.'
\else
ROLLBACK;
\echo '>>> ENSAIO: nada foi gravado (ROLLBACK).'
\endif
