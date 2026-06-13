-- =====================================================================
-- DESAPROVAR pontos da HAIR OF BRASIL (reverter "Aprovar todos")
-- Rodar no Supabase → SQL Editor. É reversível: só volta o flag aprovado.
-- =====================================================================

-- (1) Confira ANTES quantos serão revertidos e de quais meses:
select to_char(pe.data, 'YYYY-MM') as mes, count(*) as aprovados
from public.ponto_eletronico pe
where pe.aprovado = true
  and pe.company_id = (
    select id from public.companies
    where (nome_fantasia ilike '%hair of brasil%' or razao_social ilike '%hair of brasil%')
    order by id limit 1
  )
group by 1
order by 1;

-- (2) OPÇÃO A — desaprova TODOS os pontos aprovados da HAIR:
update public.ponto_eletronico pe
set aprovado = false
where pe.aprovado = true
  and pe.company_id = (
    select id from public.companies
    where (nome_fantasia ilike '%hair of brasil%' or razao_social ilike '%hair of brasil%')
    order by id limit 1
  );

-- (2) OPÇÃO B — só um mês específico (ex.: Maio/2026). Use ESTA no lugar da
--     opção A se quiser limitar. Ajuste as datas e remova os "--".
-- update public.ponto_eletronico pe
-- set aprovado = false
-- where pe.aprovado = true
--   and pe.data >= '2026-05-01' and pe.data <= '2026-05-31'
--   and pe.company_id = (
--     select id from public.companies
--     where (nome_fantasia ilike '%hair of brasil%' or razao_social ilike '%hair of brasil%')
--     order by id limit 1
--   );
