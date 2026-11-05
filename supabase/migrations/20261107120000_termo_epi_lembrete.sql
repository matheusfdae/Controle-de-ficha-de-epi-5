-- Lembrete por WhatsApp do Termo de EPI: depois do primeiro aviso (termo_whatsapp_avisado),
-- enquanto o termo não finaliza, a função avisar-pedidos-material manda outro a cada
-- 2 dias, até 3 vezes. Guarda quando foi o último envio e quantos lembretes já foram.
-- Pedidos avisados antes desta mudança não têm data: não recebem lembrete. Re-executável.
ALTER TABLE public.pedidos_material ADD COLUMN IF NOT EXISTS termo_whatsapp_em timestamptz;
ALTER TABLE public.pedidos_material ADD COLUMN IF NOT EXISTS termo_whatsapp_lembretes integer NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
