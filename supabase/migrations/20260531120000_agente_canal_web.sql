-- ============================================================
-- AGENTE TATICA — Canal (WhatsApp x Chat Web)
-- O mesmo assistente passa a atender também por um chat DENTRO do
-- sistema (agente-chat-web), além do WhatsApp (agente-orquestrador).
-- A coluna `canal` separa os dois históricos na mesma tabela, pra
-- que a conversa do chat web não vaze no WhatsApp e vice-versa.
-- ============================================================

ALTER TABLE public.agente_conversas
  ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'whatsapp';

-- Linhas antigas são todas de WhatsApp (o canal web não existia antes).
UPDATE public.agente_conversas SET canal = 'whatsapp' WHERE canal IS NULL;

-- Índice pra carregar histórico recente por canal/usuário/empresa.
CREATE INDEX IF NOT EXISTS agente_conversas_canal_user_idx
  ON public.agente_conversas (canal, user_id, company_id, created_at DESC);
