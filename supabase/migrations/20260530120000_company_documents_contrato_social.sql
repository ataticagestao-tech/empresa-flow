-- Contrato Social reusa o bucket de documentos da empresa que JÁ EXISTE em
-- produção: 'company-docs' (público, path <company_id>/...), o mesmo do
-- Cartão CNPJ / Certificado A1. Path do contrato: <company_id>/contrato-social.pdf
--
-- Em produção o bucket já está com 50MB; este UPDATE é idempotente e só
-- garante o limite caso esta migration rode num ambiente novo. NÃO mexe em
-- 'public' nem em allowed_mime_types para não alterar o comportamento atual.
update storage.buckets
   set file_size_limit = 52428800 -- 50MB
 where id = 'company-docs'
   and (file_size_limit is null or file_size_limit < 52428800);
