import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { CompanyProvider } from "@/contexts/CompanyContext";
import { AdminProvider } from "@/contexts/AdminContext";
import { ReciboModalProvider } from "@/components/finance/BotaoPagarComRecibo";
import { ThemeProvider } from "next-themes";
import { ConfirmDialogProvider } from "@/components/ui/confirm-dialog";
import { LoadingScreen } from "@/components/LoadingScreen";
import { PersistentLayout } from "@/components/layout/PersistentLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/contexts/AdminContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useUserStatus } from "@/hooks/useUserStatus";
import { useProfessionalSelf } from "@/hooks/useProfessionalSelf";
// Telas leves do "esqueleto" (login, 404) ficam embutidas — abrem na hora.
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";

// Code splitting: cada tela vira um arquivo separado, baixado só quando é aberta.
// Isso quebra o bundle único de ~2 MB e faz o sistema abrir muito mais rápido.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const CompanyDashboard = lazy(() => import("./pages/CompanyDashboard"));
const Indicadores = lazy(() => import("./pages/Indicadores"));
const RadarLegislativo = lazy(() => import("./pages/RadarLegislativo"));
const Financeiro = lazy(() => import("./pages/Financeiro"));
const Cadastros = lazy(() => import("./pages/Cadastros"));
const Integracoes = lazy(() => import("./pages/Integracoes"));
const Implantacao = lazy(() => import("./pages/Implantacao"));
const Empresas = lazy(() => import("./pages/Empresas"));
const Clientes = lazy(() => import("./pages/Clientes"));
const Fornecedores = lazy(() => import("./pages/Fornecedores"));
const Movimentacoes = lazy(() => import("./pages/Movimentacoes"));
const Categorias = lazy(() => import("./pages/Categorias"));
const ContasBancarias = lazy(() => import("./pages/ContasBancarias"));
const ContasPagar = lazy(() => import("./pages/ContasPagar"));
const ContasFixas = lazy(() => import("./pages/ContasFixas"));
const ContasReceber = lazy(() => import("./pages/ContasReceber"));
const Conciliacao = lazy(() => import("./pages/Conciliacao"));
const RecebiveisCartao = lazy(() => import("./pages/RecebiveisCartao"));
const LancamentosArquivados = lazy(() => import("./pages/LancamentosArquivados"));
const Relatorios = lazy(() => import("./pages/Relatorios"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const Equipe = lazy(() => import("./pages/Equipe"));
const ImportData = lazy(() => import("./pages/ImportData"));
const Ajuda = lazy(() => import("./pages/Ajuda"));
const CRM = lazy(() => import("./pages/CRM"));
const ProdutosDepartamentos = lazy(() => import("./pages/ProdutosDepartamentos"));
const ProdutosCategoria = lazy(() => import("./pages/ProdutosCategoria"));
const Recibos = lazy(() => import("./pages/Recibos"));
const AdminUsuarios = lazy(() => import("./pages/AdminUsuarios"));
const AdminPlanos = lazy(() => import("./pages/AdminPlanos"));
const AdminTatica = lazy(() => import("./pages/AdminTatica"));
const WhatsappAutorizados = lazy(() => import("./pages/WhatsappAutorizados"));
const WhatsAppInbox = lazy(() => import("./pages/WhatsAppInbox"));
const LogAtividades = lazy(() => import("./pages/LogAtividades"));
const ContaBloqueada = lazy(() => import("./pages/ContaBloqueada"));
const PlanoContas = lazy(() => import("./pages/PlanoContas"));
const Funcionarios = lazy(() => import("./pages/Funcionarios"));
const CadastrosPendentes = lazy(() => import("./pages/CadastrosPendentes"));
const FluxoCaixaProjetado = lazy(() => import("./pages/FluxoCaixaProjetado"));
const Orcamento = lazy(() => import("./pages/Orcamento"));
const PrevisaoReceitas = lazy(() => import("./pages/PrevisaoReceitas"));
const Cenarios = lazy(() => import("./pages/Cenarios"));
const Vendas = lazy(() => import("./pages/Vendas"));
const FichaTecnica = lazy(() => import("./pages/FichaTecnica"));
const ComposicaoCusto = lazy(() => import("./pages/ComposicaoCusto"));
const MargensDesconto = lazy(() => import("./pages/MargensDesconto"));
const TabelaPrecos = lazy(() => import("./pages/TabelaPrecos"));
const MarkupSimulador = lazy(() => import("./pages/MarkupSimulador"));
const CentrosCusto = lazy(() => import("./pages/CentrosCusto"));
const ReguaCobranca = lazy(() => import("./pages/ReguaCobranca"));
const DRE = lazy(() => import("./pages/DRE"));
const EstoqueProdutos = lazy(() => import("./pages/EstoqueProdutos"));
const OrdensCompra = lazy(() => import("./pages/OrdensCompra"));
const Inventario = lazy(() => import("./pages/Inventario"));
const MultiEmpresa = lazy(() => import("./pages/MultiEmpresa"));
const ContratosRecorrentes = lazy(() => import("./pages/ContratosRecorrentes"));
const EmpresaResumo = lazy(() => import("./pages/EmpresaResumo"));
const ImportacaoXML = lazy(() => import("./pages/ImportacaoXML"));
const FolhaPagamento = lazy(() => import("./pages/FolhaPagamento"));
const PontoEletronico = lazy(() => import("./pages/PontoEletronico"));
const FeriasAfastamentos = lazy(() => import("./pages/FeriasAfastamentos"));
const EncargosRH = lazy(() => import("./pages/EncargosRH"));
const AdmissoesDemissoes = lazy(() => import("./pages/AdmissoesDemissoes"));
const FluxoCaixa = lazy(() => import("./pages/FluxoCaixa"));
const MapeamentoContabil = lazy(() => import("./pages/MapeamentoContabil"));
const NfseEmissao = lazy(() => import("./pages/NfseEmissao"));
const NfseConfiguracoes = lazy(() => import("./pages/NfseConfiguracoes"));
const AsaasConfiguracoes = lazy(() => import("./pages/AsaasConfiguracoes"));
const PrevisaoImpostos = lazy(() => import("./pages/PrevisaoImpostos"));
const AreaContador = lazy(() => import("./pages/AreaContador"));
const VendaSistema = lazy(() => import("./pages/VendaSistema"));
const Privacidade = lazy(() => import("./pages/Privacidade"));
const Checkout = lazy(() => import("./pages/Checkout"));
const MinhasComissoes = lazy(() => import("./pages/MinhasComissoes"));
const Comissoes = lazy(() => import("./pages/Comissoes"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dados ficam "frescos" por 1 min: trocar de tela e voltar, ou alternar
      // a aba do navegador, NÃO dispara recarregamento — fica instantâneo.
      staleTime: 60 * 1000,
      // Mantém o resultado em cache por 5 min depois de sair da tela.
      gcTime: 5 * 60 * 1000,
      // Não recarrega tudo só por voltar o foco para a aba do navegador.
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const RequireAuth = () => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <LoadingScreen />
    );
  }

  if (!user) {
    const redirect = location.pathname !== "/" ? `?redirect=${encodeURIComponent(location.pathname)}` : "";
    return <Navigate to={`/auth${redirect}`} replace />;
  }

  return <Outlet />;
};

const RequireSuperAdmin = () => {
  const { isSuperAdmin, loading } = useAdmin();

  if (loading) {
    return (
      <LoadingScreen />
    );
  }

  if (!isSuperAdmin) return <Navigate to="/dashboard" replace />;

  return <Outlet />;
};

const RequireActiveAccount = () => {
  const { status, isLoading } = useUserStatus();
  const location = useLocation();

  if (isLoading) {
    return (
      <LoadingScreen />
    );
  }

  const isBlocked = status === "suspended" || status === "deleted";
  const isBlockedPage = location.pathname === "/conta-bloqueada";

  if (isBlocked && !isBlockedPage) {
    return <Navigate to="/conta-bloqueada" replace />;
  }

  if (!isBlocked && isBlockedPage) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
};

// Confina o profissional (funcionário com login próprio, sem vínculo de empresa)
// à página de comissões dele — ele não deve acessar o resto do sistema.
const RequireNotProfissional = () => {
  const { isProfessional, isLoading } = useProfessionalSelf();
  const { companies, loading } = useCompany();

  if (isLoading || loading) {
    return <LoadingScreen />;
  }

  if (isProfessional && (companies?.length ?? 0) === 0) {
    return <Navigate to="/minhas-comissoes" replace />;
  }

  return <Outlet />;
};

const RootRedirect = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <LoadingScreen />
    );
  }

  return <Navigate to={user ? "/dashboard" : "/auth"} replace />;
};

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <AdminProvider>
          <CompanyProvider>
            <Toaster />
            <Sonner />
            <ReciboModalProvider />
            <ConfirmDialogProvider>
            <BrowserRouter>
              <Suspense fallback={<LoadingScreen />}>
              <Routes>
                <Route path="/" element={<RootRedirect />} />
                <Route path="/venda" element={<VendaSistema />} />
                <Route path="/lp" element={<VendaSistema />} />
                <Route path="/privacidade" element={<Privacidade />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<Auth />} />
                <Route element={<RequireAuth />}>
                  <Route path="/conta-bloqueada" element={<ContaBloqueada />} />
                  <Route path="/minhas-comissoes" element={<MinhasComissoes />} />
                  <Route element={<RequireActiveAccount />}>
                    <Route element={<RequireNotProfissional />}>
                    <Route element={<PersistentLayout />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/dashboard/:id" element={<CompanyDashboard />} />
                    <Route path="/indicadores" element={<Indicadores />} />
                    <Route path="/radar-legislativo" element={<RadarLegislativo />} />
                    <Route path="/financeiro" element={<Financeiro />} />
                    <Route path="/cadastros" element={<Cadastros />} />
                    <Route path="/integracoes" element={<Integracoes />} />
                    <Route path="/implantacao" element={<Implantacao />} />
                    <Route path="/empresas" element={<Empresas />} />
                    <Route path="/empresas/:id" element={<EmpresaResumo />} />
                    <Route path="/clientes" element={<Clientes />} />
                    <Route path="/funcionarios" element={<Funcionarios />} />
                    <Route path="/fornecedores" element={<Fornecedores />} />
                    <Route path="/cadastros-pendentes" element={<CadastrosPendentes />} />
                    <Route path="/movimentacoes" element={<Movimentacoes />} />
                    <Route path="/movimentacoes/*" element={<Movimentacoes />} />
                    <Route path="/categorias" element={<Categorias />} />
                    <Route path="/plano-contas" element={<PlanoContas />} />
                    <Route path="/centros-custo" element={<CentrosCusto />} />
                    <Route path="/contas-bancarias" element={<ContasBancarias />} />
                    <Route path="/contas-pagar" element={<ContasPagar />} />
                    <Route path="/contas-fixas" element={<ContasFixas />} />
                    <Route path="/contas-receber" element={<ContasReceber />} />
                    <Route path="/conciliacao" element={<Conciliacao />} />
                    <Route path="/recebiveis-cartao" element={<RecebiveisCartao />} />
                    <Route path="/lancamentos-arquivados" element={<LancamentosArquivados />} />
                    <Route path="/fluxo-caixa-projetado" element={<FluxoCaixaProjetado />} />
                    <Route path="/orcamento" element={<Orcamento />} />
                    <Route path="/previsao-receitas" element={<PrevisaoReceitas />} />
                    <Route path="/cenarios" element={<Cenarios />} />
                    <Route path="/vendas" element={<Vendas />} />
                    <Route path="/comissoes" element={<Comissoes />} />
                    <Route path="/ficha-tecnica" element={<FichaTecnica />} />
                    <Route path="/composicao-custo" element={<ComposicaoCusto />} />
                    <Route path="/margens-desconto" element={<MargensDesconto />} />
                    <Route path="/tabela-precos" element={<TabelaPrecos />} />
                    <Route path="/markup-simulador" element={<MarkupSimulador />} />
                    <Route path="/relatorios" element={<Relatorios />} />
                    <Route path="/relatorios/*" element={<Relatorios />} />
                    <Route path="/crm" element={<CRM />} />
                    <Route path="/recibos" element={<Recibos />} />
                    <Route path="/import-data" element={<ImportData />} />
                    <Route path="/ajuda" element={<Ajuda />} />
                    <Route path="/contratos-recorrentes" element={<ContratosRecorrentes />} />
                    <Route path="/regua-cobranca" element={<ReguaCobranca />} />
                    <Route path="/dre" element={<DRE />} />
                    <Route path="/demonstrativos/dfc" element={<FluxoCaixa />} />
                    <Route path="/demonstrativos/mapeamento" element={<MapeamentoContabil />} />
                    <Route path="/estoque" element={<EstoqueProdutos />} />
                    <Route path="/ordens-compra" element={<OrdensCompra />} />
                    <Route path="/inventario" element={<Inventario />} />
                    <Route path="/multiempresa" element={<MultiEmpresa />} />
                    <Route path="/multiempresa/*" element={<MultiEmpresa />} />
                    <Route path="/nfse" element={<NfseEmissao />} />
                    <Route path="/previsao-impostos" element={<PrevisaoImpostos />} />
                    <Route path="/configuracoes/nfse" element={<NfseConfiguracoes />} />
                    <Route path="/configuracoes/asaas" element={<AsaasConfiguracoes />} />
                    <Route path="/area-contador" element={<AreaContador />} />
                    <Route path="/importacao-xml" element={<ImportacaoXML />} />
                    <Route path="/folha-pagamento" element={<FolhaPagamento />} />
                    <Route path="/ponto-eletronico" element={<PontoEletronico />} />
                    <Route path="/ferias-afastamentos" element={<FeriasAfastamentos />} />
                    <Route path="/encargos" element={<EncargosRH />} />
                    <Route path="/admissoes-demissoes" element={<AdmissoesDemissoes />} />
                    <Route path="/operacional" element={<ProdutosDepartamentos />} />
                    <Route path="/produtos-categoria" element={<ProdutosCategoria />} />
                    <Route path="/equipe" element={<Equipe />} />
                    <Route element={<RequireSuperAdmin />}>
                      <Route path="/configuracoes" element={<Configuracoes />} />
                      <Route path="/admin/tatica" element={<AdminTatica />} />
                      <Route path="/admin/planos" element={<AdminPlanos />} />
                      <Route path="/admin/usuarios" element={<AdminUsuarios />} />
                      <Route path="/admin/whatsapp-autorizados" element={<WhatsappAutorizados />} />
                      <Route path="/admin/whatsapp-inbox" element={<WhatsAppInbox />} />
                      <Route path="/admin/log-atividades" element={<LogAtividades />} />
                    </Route>
                    </Route>
                    </Route>
                  </Route>
                </Route>
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
              </Suspense>
            </BrowserRouter>
            </ConfirmDialogProvider>
          </CompanyProvider>
        </AdminProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;
