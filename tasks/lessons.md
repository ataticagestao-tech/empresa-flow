# Lessons Learned

## Entry Template
- Date:
- Context:
- Symptom:
- Root cause:
- Prevention rule:
- Evidence (test/log/verification):

---

- Date: 2026-02-26
- Context: Importação de extrato PDF na conciliação bancária.
- Symptom: Campos esperados pelo usuário (`tipo`, `saldo`, `instituição`, `agência`, `conta`, `documento`) não apareciam de forma estruturada.
- Root cause: Parser extraía apenas transações básicas e o front não tinha colunas/metadata explícitas para esses dados.
- Prevention rule: Sempre que ajustar parser de extrato, definir contrato explícito (transação + metadados) e cobrir com teste de amostra real.
- Evidence (test/log/verification): `npm run test:run -- src/lib/parsers/bankStatementPdf.test.ts` (passou), `npm run build` (passou).

- Date: 2026-03-07
- Context: Padronização visual da DRE no `CompanyDashboard`.
- Symptom: A área da tabela continuava aparecendo branca mesmo após o card externo mudar para azul.
- Root cause: O componente compartilhado `TableRow` aplica zebra padrão com `odd:bg-white` e `even:bg-slate-50/50`; usar só `bg-transparent` nas linhas não neutraliza essas variantes em superfícies escuras.
- Prevention rule: Sempre que reutilizar `Table` em layout dark, sobrescrever explicitamente `odd:` e `even:` das linhas ou criar uma variante dark do componente base.
- Evidence (test/log/verification): `npm run typecheck` (passou), `npm run build` (passou).

- Date: 2026-03-07
- Context: Ajuste visual da página `Clientes`.
- Symptom: O card com total de clientes e a tabela continuavam claros, quebrando o padrão azul adotado no dashboard e no detalhe da empresa.
- Root cause: A página ainda usava estilos locais antigos (`bg-white`, `border-slate-*`, `text-slate-*`) e não tinha migrado para a superfície dark padronizada.
- Prevention rule: Ao padronizar uma seção do produto, revisar também páginas irmãs do mesmo fluxo para eliminar superfícies legadas antes do deploy.
- Evidence (test/log/verification): `npm run typecheck` (passou), `npm run build` (passou).

- Date: 2026-03-07
- Context: Correção de contraste na faixa superior da página `Clientes`.
- Symptom: A faixa com `Total de clientes` e busca ficou azul demais e perdeu destaque em relação à barra principal do sistema.
- Root cause: O padrão azul do card foi aplicado também ao header de controles, mas o usuário queria contraste visual: barra principal azul e faixa interna branca.
- Prevention rule: Quando o usuário citar "faixa", "barra" ou "menu" em ajuste visual, separar explicitamente navegação global, header interno e corpo do card antes de propagar a cor.
- Evidence (test/log/verification): `npm run typecheck` (passou), `npm run build` (passou).

- Date: 2026-03-07
- Context: Segunda correção visual na página `Clientes` após feedback do usuário.
- Symptom: A faixa de `Total de clientes` e busca ficou branca, mas o pedido real era manter essa faixa azul e deixar branca apenas a linha dos títulos da tabela.
- Root cause: Interpretação incorreta do alvo visual: confundi o header de controles com o header das colunas da tabela.
- Prevention rule: Em ajustes de UI baseados em screenshot, mapear explicitamente cada faixa horizontal por função (`controles`, `thead`, `tbody`) antes de alterar cores.
- Evidence (test/log/verification): `npm run typecheck` (passou), `npm run build` (passou).

