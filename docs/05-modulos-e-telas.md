# 05 — Módulos e telas

~70 telas (`src/pages/`), agrupadas por módulo. É um ERP multi-empresa.

## Dashboards / visão geral
`Dashboard`, `CompanyDashboard`, `PainelGerencial`, `EmpresaResumo`, `MultiEmpresa` (dashboard consolidado de grupo), `Index`

## Financeiro
`Financeiro`, `ContasPagar`, `ContasReceber`, `ContasFixas`, `Movimentacoes`, `ContasBancarias`, `ContratosRecorrentes`, `FluxoCaixa`, `FluxoCaixaProjetado`, `PrevisaoReceitas`, `ReguaCobranca`, `Recibos`

## Conciliação bancária
`Conciliacao`, `ExtratoReconciliado`
> ⚠️ `Conciliacao.tsx` é versão aprovada e sensível — não reescrever.

## Vendas / comercial
`Vendas`, `Checkout`, `Orcamento`, `OrdensCompra`, `TabelaPrecos`, `MargensDesconto`, `MarkupSimulador`, `CRM`

## Produtos / estoque
`EstoqueProdutos`, `ProdutosCategoria`, `ProdutosDepartamentos`, `Inventario`, `FichaTecnica`, `ComposicaoCusto`

## Cadastros
`Clientes`, `Fornecedores`, `Funcionarios`, `Empresas`, `Equipe`, `Categorias`, `CentrosCusto`, `CadastrosPendentes`, `Documentos`

## Contábil / plano de contas
`PlanoContas`, `MapeamentoContabil`, `DRE`, `DREContabil`, `BalancoPatrimonial`, `Cenarios`
> ⚠️ Plano de contas é sensível (já houve incidente de reset que zerou 184 categorias).

## Fiscal
`NotasFiscais`, `NfseEmissao`, `NfseConfiguracoes`, `ApuracaoImpostos`, `CalendarioFiscal`, `AreaContador` (painel pro contador), `ImportacaoXML`

## RH / folha
`FolhaPagamento`, `Funcionarios`, `PontoEletronico`, `FeriasAfastamentos`, `AdmissoesDemissoes`, `EncargosRH`, `Equipe`
> Folha só calcula CLT/temporário/estágio (PJ/autônomo bloqueados).

## Relatórios
`Relatorios` (Central de Relatórios — catálogo de ~17 relatórios em Excel/PDF), além de `DRE`, `FluxoCaixa`, `BalancoPatrimonial`

## Configuração / administração
`Configuracoes` (inclui painel do Overnight), `AdminUsuarios`, `WhatsappAutorizados` (permissões do assistente por número), `LogAtividades`, `Ajuda`, `Auth`, `ContaBloqueada`

## Importação
`ImportData`, `ImportacaoOmie`, `ImportacaoXML`

## Público
`VendaSistema` (landing page de venda do sistema + BPO)
