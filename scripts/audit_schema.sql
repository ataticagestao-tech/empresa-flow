SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('contas_receber', 'contas_pagar', 'companies', 'clients', 'fornecedores', 'bank_reconciliation_matches', 'movimentacoes')
  AND column_name SIMILAR TO '(id|cliente%|fornecedor%|valor%|data_%|status|deleted_at|created_at|created_via%|pagador%|credor%|descricao|company_id|receivable_id|payable_id|bank_transaction_id|conta_%|nome_fantasia|razao_social)'
ORDER BY table_name, ordinal_position;
