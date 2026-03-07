# Task Plan

## Scope
- [x] Describe objective and expected outcome
- [x] List constraints/risks and affected areas

## Plan
- [x] Step 1
- [x] Step 2
- [x] Step 3

## Verification
- [x] Tests executed
- [x] Typecheck/build executed
- [x] Logs/manual checks executed (if applicable)

## Review
- Summary: Ajustado parser de PDF para extrair campos de transação e metadados da conta; UI atualizada para exibir os campos solicitados.
- Key changes:
  - Parser PDF agora extrai `tipo`, `saldo` e metadados (`instituição`, `agência`, `conta`, `documento`, `nome`, `período`).
  - Upload de PDF persiste `type` e enriquece `memo` com campos estruturados.
  - Tabela de lançamentos agora mostra colunas `Data`, `Tipo`, `Descrição`, `Valor`, `Saldo`.
  - Cabeçalho do extrato ativo mostra metadados da conta.
  - Testes do parser atualizados para cobrir metadados.
- Residual risks: alguns layouts de PDF de bancos diferentes podem exigir ajustes finos de regex para metadados.

## Deployment Task (2026-03-07)
- [x] Mapear arquitetura ativa da VPS e os diretórios de deploy
- [x] Validar `npm run typecheck` e `npm run build` localmente
- [x] Publicar o frontend estático em `/var/www/ataticagestao` via SSH
- [x] Executar smoke checks remotos e registrar evidências objetivas

- Review:
- O fluxo documentado em `deploy_vps.ps1` estava desatualizado para a VPS atual: `nginx` está inativo e o tráfego web está no `Apache`.
- Deploy concluído com upload da build Vite para `/var/www/ataticagestao`; o backend `PM2 empresa-flow` permaneceu online em `/var/www/empresa-flow`.
- Evidências: `npm run typecheck` OK, `npm run build` OK, `npx vitest run --maxWorkers=1` OK, `curl https://ataticagestao.com` servindo `index-DJe2d7m9.js` e `index-Bl_GBcc1.css`, `GET /api/whatsapp/session/status/test` retornando `401`.

## Dashboard Visual Fix (2026-03-07)
- [x] Identificar a seção do dashboard com baixo contraste e o fundo azul de referência
- [x] Ajustar fundo da página para branco e os cards de atalhos para o mesmo azul da tabela de empresas
- [x] Validar com `npm run typecheck` e `npm run build`

## Company Dashboard Visual Fix (2026-03-07)
- [x] Identificar os cards claros na página de detalhe da empresa
- [x] Padronizar os cards e painéis com o mesmo azul do dashboard principal
- [x] Validar com `npm run typecheck` e `npm run build`

## Clients Visual Fix (2026-03-07)
- [x] Identificar os blocos claros na página de clientes
- [x] Padronizar resumo, busca e tabela com o azul das demais telas
- [x] Validar com `npm run typecheck` e `npm run build`

## Companies Visual Fix (2026-03-07)
- [x] Identificar os blocos visuais da listagem de empresas que precisavam seguir o padrão de clientes
- [x] Aplicar header azul, títulos de coluna em fundo branco e corpo da tabela em azul
- [x] Validar com `npm run typecheck` e `npm run build`

## Lint Cleanup (2026-03-07)
- [x] Reproduzir os erros de `eslint` nos arquivos afetados
- [x] Remover `@ts-ignore` do parser de CNPJ sem alterar comportamento
- [x] Eliminar o warning de dependência no hook `useBankAccounts`
- [x] Validar com `npx eslint`, `npx tsc --noEmit` e `npm run build`

