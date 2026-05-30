-- Contrato Social passa a usar o bucket existente 'company-documents'
-- (criado em 20251228000100_company_documents.sql, privado + RLS por user_companies).
--
-- NÃO mexemos em public nem em allowed_mime_types para não:
--   * expor documentos sensíveis (ex.: Certificado Digital A1) publicamente;
--   * quebrar uploads de .pfx/.p12 do certificado.
--
-- Apenas garantimos um limite de tamanho generoso (50MB) para caber
-- contratos sociais escaneados maiores (antes os uploads travavam menores).
update storage.buckets
   set file_size_limit = 52428800 -- 50MB
 where id = 'company-documents'
   and (file_size_limit is null or file_size_limit < 52428800);
