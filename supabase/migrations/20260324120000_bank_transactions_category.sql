-- Adiciona campo category_id direto na bank_transactions
-- Permite categorizar transações sem precisar conciliar

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_bank_tx_category ON public.bank_transactions(category_id);
