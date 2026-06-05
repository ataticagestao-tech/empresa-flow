-- =============================================================================
-- MENU ENXUTO (lean_menu) — esconde do menu as telas sem dados
-- =============================================================================
-- Flag por usuario+empresa. Quando TRUE, o usuario so ve no menu os modulos
-- que tem registro lancado naquela empresa (telas vazias somem). Pensado para
-- acessos restritos (ex.: visualizador externo que so deve ver "o que tem
-- preenchimento").
--
-- E so uma preferencia de UI/visibilidade de menu — NAO concede nem remove
-- permissao. A protecao real continua sendo o papel (role) + as policies RBAC
-- da migration 20260520140000_roles_permissoes.sql.
-- =============================================================================

ALTER TABLE public.user_companies
  ADD COLUMN IF NOT EXISTS lean_menu BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.user_companies.lean_menu IS
'Quando true, o usuario so ve no menu os modulos que tem dados na empresa (telas vazias somem). Preferencia de visibilidade — nao altera permissao.';
