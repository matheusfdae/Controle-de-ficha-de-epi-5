-- =========================================================
-- Modelos de Ficha — layout configurável do PDF gerado pra cada ficha.
--
-- Até aqui o layout do PDF era 100% fixo em src/services/pdfService.ts
-- (título, texto do termo de responsabilidade, texto de declaração,
-- colunas da tabela). Esta migration cria a tabela que guarda esses
-- parâmetros por modelo, faz seed do modelo "Padrão" (reproduz o layout
-- atual, sem nenhuma mudança visual) e de um segundo modelo "SS Serviços"
-- (layout de papel próprio dessa empresa), e liga fichas_epi a um modelo
-- via modelo_id (nullable — ficha antiga sem modelo cai no padrão).
-- =========================================================

CREATE TABLE public.modelos_ficha (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  ativo BOOLEAN NOT NULL DEFAULT true,
  padrao BOOLEAN NOT NULL DEFAULT false,
  titulo_documento TEXT NOT NULL,
  texto_termo_responsabilidade TEXT NOT NULL,
  texto_declaracao TEXT NOT NULL,
  layout_cabecalho TEXT NOT NULL DEFAULT 'completo'
    CHECK (layout_cabecalho IN ('completo', 'compacto')),
  coluna_extra TEXT NOT NULL DEFAULT 'tamanho'
    CHECK (coluna_extra IN ('tamanho', 'ca')),
  mostrar_segundo_logo BOOLEAN NOT NULL DEFAULT false,
  texto_secao_extra TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No máximo um modelo padrão por vez.
CREATE UNIQUE INDEX modelos_ficha_unico_padrao ON public.modelos_ficha (padrao) WHERE padrao;

CREATE TRIGGER trg_modelos_ficha_updated BEFORE UPDATE ON public.modelos_ficha
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.fichas_epi
  ADD COLUMN modelo_id UUID REFERENCES public.modelos_ficha(id) ON DELETE SET NULL;

-- =========================================================
-- RLS
-- =========================================================
ALTER TABLE public.modelos_ficha ENABLE ROW LEVEL SECURITY;

CREATE POLICY "modelos_ficha select authenticated"
ON public.modelos_ficha FOR SELECT TO authenticated USING (true);

CREATE POLICY "modelos_ficha insert by permission" ON public.modelos_ficha FOR INSERT TO authenticated
  WITH CHECK (public.has_permission(public.current_profile_id(), 'configuracoes', 'create'));
CREATE POLICY "modelos_ficha update by permission" ON public.modelos_ficha FOR UPDATE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'configuracoes', 'edit'))
  WITH CHECK (public.has_permission(public.current_profile_id(), 'configuracoes', 'edit'));
CREATE POLICY "modelos_ficha delete by permission" ON public.modelos_ficha FOR DELETE TO authenticated
  USING (public.has_permission(public.current_profile_id(), 'configuracoes', 'delete'));

-- =========================================================
-- Seed
-- =========================================================
INSERT INTO public.modelos_ficha (
  nome, ativo, padrao, titulo_documento, texto_termo_responsabilidade,
  texto_declaracao, layout_cabecalho, coluna_extra, mostrar_segundo_logo,
  texto_secao_extra
) VALUES (
  'Padrão', true, true,
  'TERMO DE RECEBIMENTO DE UNIFORME/EPI''s - REV -00',
  'Declaro que recebi gratuitamente nesta data os EPI''S (Equipamentos de Proteção Individual) e UNIFORMES discriminado(s) neste T.R (Termo de Responsabilidade), para uso obrigatório e sistemático no trabalho enquanto for colaborador desta empresa. Estou ciente ainda que a guarda e conservação destes equipamentos fiquem sob minha responsabilidade. Tenho conhecimento ainda do texto do Art. 158 Parágrafo Único, Lei 6.514, 22/12/77 que diz: "Constitui o ato faltoso do empregado, a recusa injustificada ao uso dos EPI''s fornecidos pela empresa". Sendo assim me comprometo a comunicar imediatamente a empresa, quaisquer danos causados nestes equipamentos. Em caso de perda ou extravio ou inutilização proposital, comprometo-me a ressarcir a empresa conforme previsto no Parágrafo 1º do Art. 462 da CLT, inclusive no que couber a título de indenização por rescisão de contrato de trabalho a importância correspondente ao valor do material.',
  'DECLARO para os devidos fins que experimentei o material fornecido pela empresa, e que estes ficaram adequados conforme o padrão necessário para execução dos meus serviços. Acrescento ainda que estou ciente que: quaisquer ajustes feitos neste material que possam impedir prejudicar limitar ou ainda causar algum dano ao meu serviço ou material são de MINHA responsabilidade.',
  'completo', 'tamanho', false, NULL
), (
  'SS Serviços', true, false,
  'TERMO DE RECEBIMENTO DE UNIFORME/EPI''s - REV -00',
  'Declaro que recebi gratuitamente nesta data os EPI''S (Equipamentos de Proteção Individual) e UNIFORMES discriminado(s) neste T.R (Termo de Responsabilidade), para uso obrigatório e sistemático no trabalho enquanto for colaborador desta empresa. Estou ciente ainda que a guarda e conservação destes equipamentos fiquem sob minha responsabilidade. Tenho conhecimento ainda do texto do Art. 158 Parágrafo Único, Lei 6.514, 22/12/77 que diz: "Constitui o ato faltoso do empregado, a recusa injustificada ao uso dos EPI''s fornecidos pela empresa". Sendo assim me comprometo a comunicar imediatamente a empresa, quaisquer danos causados nestes equipamentos. Em caso de perda ou extravio ou inutilização proposital, comprometo-me a ressarcir a empresa conforme previsto no Parágrafo 1º do Art. 462 da CLT, inclusive no que couber a título de indenização por rescisão de contrato de trabalho a importância correspondente ao valor do material.',
  'DECLARO para os devidos fins que experimentei o material fornecido pela empresa, e que estes ficaram adequados conforme o padrão necessário para execução dos meus serviços. Acrescento ainda que estou ciente que: quaisquer ajustes feitos neste material que possam impedir prejudicar limitar ou ainda causar algum dano ao meu serviço ou material são de MINHA responsabilidade.',
  'compacto', 'ca', true,
  'Declaro que não se faz necessário a troca dos seguintes materiais, pois, estes estão em perfeito estado de uso:'
);
