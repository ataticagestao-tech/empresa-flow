-- ============================================================
-- AGENTE TATICA — Polling state
-- Tabela pra rastrear mensagens já processadas e evitar duplicar.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.agente_msg_processadas (
  message_id text PRIMARY KEY,
  from_phone text NOT NULL,
  conteudo text,
  processada_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agente_msg_processadas_phone_idx
  ON public.agente_msg_processadas (from_phone, processada_em DESC);

-- Limpeza periódica: remove mensagens com mais de 7 dias
CREATE OR REPLACE FUNCTION public.cleanup_agente_msg_processadas()
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM public.agente_msg_processadas
  WHERE processada_em < now() - interval '7 days';
$$;

COMMENT ON TABLE public.agente_msg_processadas IS 'Rastreia mensagens já processadas pelo agente (pra polling não duplicar)';
