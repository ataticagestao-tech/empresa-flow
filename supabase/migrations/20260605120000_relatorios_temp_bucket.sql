-- ============================================================
-- Bucket privado para PDFs de relatório gerados sob demanda pelo
-- Assistente (tool gerar_relatorio_pdf).
--   • No WhatsApp o documento é mandado direto (NÃO passa por aqui).
--   • No chat web (/assistente) o PDF é salvo aqui e entregue via
--     signed URL de 2h (a tool usa a service key, que ignora RLS).
-- Privado: nada de URL pública. Sem policies — acesso só via service key
-- (upload) e signed URL (download).
-- ============================================================
insert into storage.buckets (id, name, public)
values ('relatorios-temp', 'relatorios-temp', false)
on conflict (id) do nothing;
