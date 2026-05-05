
CREATE TABLE public.colaboradores_integracao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  matricula text,
  posto text,
  funcao_id uuid REFERENCES public.funcoes(id),
  funcao_nome text,
  data_admissao date,
  status text NOT NULL DEFAULT 'pendente',
  observacoes text,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.colaboradores_integracao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ci select auth" ON public.colaboradores_integracao FOR SELECT TO authenticated USING (true);
CREATE POLICY "ci modify admin/rh" ON public.colaboradores_integracao FOR ALL TO authenticated
  USING (is_admin_or_rh(auth.uid())) WITH CHECK (is_admin_or_rh(auth.uid()));
CREATE TRIGGER ci_updated BEFORE UPDATE ON public.colaboradores_integracao
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS epis_nome_uniq ON public.epis (lower(nome));

DO $$
DECLARE
  v_epi_id uuid;
  v_func_id uuid;
  funcs jsonb := '[
    {"nome":"ASG","itens":[
      {"q":2,"d":"Gandola em Gabardine Azul"},
      {"q":2,"d":"Calça em Gabardine Azul"},
      {"q":1,"d":"Sapato Antiderrapante Spider Pro","ca":"48583"}
    ]},
    {"nome":"Líder ASG","itens":[
      {"q":2,"d":"Calça em Two Way Preto"},
      {"q":2,"d":"Camisa Gola Polo Azul"},
      {"q":1,"d":"Sapato Social"},
      {"q":1,"d":"Cinto em Couro Preto"},
      {"q":2,"d":"Meia 3/4"}
    ]},
    {"nome":"Terno Preto Masculino","itens":[
      {"q":2,"d":"Blazer em Oxford Preto"},
      {"q":2,"d":"Calça em Oxford Preto"},
      {"q":2,"d":"Camisa Social Azul"},
      {"q":1,"d":"Sapato Social em Couro Preto"},
      {"q":1,"d":"Cinto em Couro Preto"},
      {"q":2,"d":"Gravata Preta"}
    ]},
    {"nome":"Terno Preto Feminino","itens":[
      {"q":1,"d":"Blazer em Two Way Preto"},
      {"q":2,"d":"Calça em Two Way Preto"},
      {"q":2,"d":"Camisa Social Azul 3/4"},
      {"q":2,"d":"Meia 3/4 Preta"},
      {"q":1,"d":"Sapatilha Preta Lisa"},
      {"q":1,"d":"Rede com Laço Preto para Cabelo"}
    ]},
    {"nome":"Terno Preto Masculino - PKS","itens":[
      {"q":2,"d":"Blazer em Oxford Preto"},
      {"q":2,"d":"Calça em Oxford Preto"},
      {"q":2,"d":"Camisa Social Branca c/ Logo PKS"},
      {"q":1,"d":"Sapato Social em Couro Preto"},
      {"q":1,"d":"Cinto em Couro Preto"},
      {"q":2,"d":"Gravata Preta"},
      {"q":1,"d":"Caderneta"},
      {"q":3,"d":"Caneta Esferográfica"},
      {"q":1,"d":"Prancheta"}
    ]},
    {"nome":"Terno Preto Feminino - PKS","itens":[
      {"q":2,"d":"Blazer em Two Way Preto"},
      {"q":2,"d":"Calça em Two Way Preto"},
      {"q":2,"d":"Camisa Social Branca 3/4"},
      {"q":2,"d":"Meia 3/4 Preta"},
      {"q":1,"d":"Sapatilha Preta Lisa"},
      {"q":2,"d":"Rede com Laço Preto para Cabelo"}
    ]},
    {"nome":"Vigilante Operacional - PKS","itens":[
      {"q":2,"d":"Gandola em Rip Stop Azul"},
      {"q":2,"d":"Calça em Rip Stop Azul"},
      {"q":1,"d":"Coturno em Couro e Lona Preto"},
      {"q":1,"d":"Cinto em Nylon Preto"},
      {"q":1,"d":"Fiel e Apito Preto"},
      {"q":1,"d":"Boné com Logo 5 Estrelas"},
      {"q":1,"d":"Prancheta"},
      {"q":1,"d":"Caderneta"},
      {"q":3,"d":"Caneta Esferográfica"},
      {"q":1,"d":"Japona"}
    ]},
    {"nome":"Vigilante Motorizado Operacional - PKS","itens":[
      {"q":2,"d":"Gandola em Rip Stop Azul"},
      {"q":2,"d":"Calça em Rip Stop Azul"},
      {"q":1,"d":"Cinto em Nylon Preto"},
      {"q":1,"d":"Fiel e Apito Preto"},
      {"q":1,"d":"Coturno em Couro e Lona Preto"},
      {"q":1,"d":"Boné com Logo 5 Estrelas"},
      {"q":1,"d":"Capa de Chuva Preta"},
      {"q":1,"d":"Capacete Motociclista"},
      {"q":1,"d":"Luvas Motociclista"},
      {"q":1,"d":"Galocha Preta"},
      {"q":1,"d":"Colete Refletivo em X"},
      {"q":1,"d":"Garrafa com Squeeze"},
      {"q":1,"d":"Japona em Oxford Preto"},
      {"q":1,"d":"Prancheta"},
      {"q":1,"d":"Caderneta"},
      {"q":3,"d":"Caneta Esferográfica"}
    ]},
    {"nome":"Vigilante Operacional - Iguatemi","itens":[
      {"q":2,"d":"Gandola em Rip Stop Azul"},
      {"q":2,"d":"Calça em Rip Stop Azul"},
      {"q":1,"d":"Coturno em Couro e Lona Preto"},
      {"q":1,"d":"Cinto em Nylon Preto"},
      {"q":1,"d":"Fiel e Apito Preto"},
      {"q":1,"d":"Boné com Logo 5 Estrelas"},
      {"q":1,"d":"Coldre de Cinto"},
      {"q":1,"d":"Baleiro"},
      {"q":1,"d":"Cinto NA (Operacional)"},
      {"q":1,"d":"Capa de Colete"},
      {"q":1,"d":"Japona"}
    ]},
    {"nome":"Terno Masculino - Iguatemi","itens":[
      {"q":2,"d":"Blazer em Gabardine Preto"},
      {"q":2,"d":"Calça em Gabardine Preto"},
      {"q":2,"d":"Camisa Social Branca"},
      {"q":1,"d":"Cinto em Couro Preto"},
      {"q":2,"d":"Gravata Preta Texturizada"},
      {"q":1,"d":"Sapato Social em Couro Preto"}
    ]},
    {"nome":"Bombeiro Brigadista","itens":[
      {"q":2,"d":"Gandola em Rip Stop Azul e Amarela"},
      {"q":2,"d":"Calça em Rip Stop Azul e Amarela"},
      {"q":1,"d":"Cinto em Nylon Preto"},
      {"q":1,"d":"Coturno em Couro e Lona Preto Kalucci","ca":"151747"},
      {"q":2,"d":"Meião Preto"},
      {"q":2,"d":"Camisa Malha Fria Amarela"},
      {"q":1,"d":"Japona"}
    ]},
    {"nome":"Agente de Portaria Operacional","itens":[
      {"q":1,"d":"Gandola em Rip Stop Azul Manga Longa"},
      {"q":1,"d":"Calça em Rip Stop Azul"},
      {"q":1,"d":"Cinto em Nylon Preto"},
      {"q":1,"d":"Coturno em Couro e Lona Preto"},
      {"q":1,"d":"Boné com Logo 5 Estrelas"},
      {"q":1,"d":"Japona"}
    ]},
    {"nome":"Vigilante Operacional","itens":[
      {"q":2,"d":"Gandola em Rip Stop Azul Manga Longa"},
      {"q":2,"d":"Calça em Rip Stop Azul"},
      {"q":1,"d":"Coturno em Couro e Lona Preto"},
      {"q":1,"d":"Cinto em Nylon Preto"},
      {"q":1,"d":"Fiel e Apito Preto"},
      {"q":1,"d":"Boné com Logo 5 Estrelas"},
      {"q":1,"d":"Capa de Colete s/ Coldre"},
      {"q":1,"d":"Japona"}
    ]},
    {"nome":"Integração","itens":[]}
  ]'::jsonb;
  func jsonb;
  it jsonb;
BEGIN
  FOR func IN SELECT * FROM jsonb_array_elements(funcs) LOOP
    INSERT INTO public.funcoes (nome) VALUES (func->>'nome')
      ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome
      RETURNING id INTO v_func_id;

    FOR it IN SELECT * FROM jsonb_array_elements(func->'itens') LOOP
      INSERT INTO public.epis (nome, categoria, ca_numero)
        VALUES (it->>'d', 'corpo'::epi_categoria, NULLIF(it->>'ca',''))
        ON CONFLICT (lower(nome)) DO UPDATE
          SET ca_numero = COALESCE(EXCLUDED.ca_numero, public.epis.ca_numero)
        RETURNING id INTO v_epi_id;

      IF NOT EXISTS (SELECT 1 FROM public.funcao_epis WHERE funcao_id = v_func_id AND epi_id = v_epi_id) THEN
        INSERT INTO public.funcao_epis (funcao_id, epi_id, quantidade)
        VALUES (v_func_id, v_epi_id, COALESCE((it->>'q')::int, 1));
      END IF;
    END LOOP;
  END LOOP;
END $$;
