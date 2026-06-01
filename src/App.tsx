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
import { useUserStatus } from "@/hooks/useUserStatus";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import CompanyDashboard from "./pages/CompanyDashboard";
import Indicadores from "./pages/Indicadores";
import RadarLegislativo from "./pages/RadarLegislativo";
import Financeiro from "./pages/Financeiro";
import Empresas from "./pages/Empresas";
import Clientes from "./pages/Clientes";
import Fornecedores from "./pages/Fornecedores";
import Movimentacoes from "./pages/Movimentacoes";
import Categorias from "./pages/Categorias";
import ContasBancarias from "./pages/ContasBancarias";
import ContasPagar from "./pages/ContasPagar";
import ContasFixas from "./pages/ContasFixas";
import ContasReceber from "./pages/ContasReceber";
import Conciliacao from "./pages/Conciliacao";
import Relatorios from "./pages/Relatorios";
import Configuracoes from "./pages/Configuracoes";
import Equipe from "./pages/Equipe";
import ImportData from "./pages/ImportData";
import Ajuda from "./pages/Ajuda";
import CRM from "./pages/CRM";

import ProdutosDepartamentos from "./pages/ProdutosDepartamentos";
import ProdutosCategoria from "./pages/ProdutosCategoria";
import Recibos from "./pages/Recibos";
import NotFound from "./pages/NotFound";
import AdminUsuarios from "./pages/AdminUsuarios";
import WhatsappAutorizados from "./pages/WhatsappAutorizados";
import LogAtividades from "./pages/LogAtividades";
import ContaBloqueada from "./pages/ContaBloqueada";
import PlanoContas from "./pages/PlanoContas";
import Funcionarios from "./pages/Funcionarios";
import CadastrosPendentes from "./pages/CadastrosPendentes";
import FluxoCaixaProjetado from "./pages/FluxoCaixaProjetado";
import Orcamento from "./pages/Orcamento";
import PrevisaoReceitas from "./pages/PrevisaoReceitas";
import Cenarios from "./pages/Cenarios";
import Vendas from "./pages/Vendas";
import FichaTecnica from "./pages/FichaTecnica";
import ComposicaoCusto from "./pages/ComposicaoCusto";
import MargensDesconto from "./pages/MargensDesconto";
import TabelaPrecos from "./pages/TabelaPrecos";
import MarkupSimulador from "./pages/MarkupSimulador";
import CentrosCusto from "./pages/CentrosCusto";
import ReguaCobranca from "./pages/ReguaCobranca";
import DRE from "./pages/DRE";
import EstoqueProdutos from "./pages/EstoqueProdutos";
import OrdensCompra from "./pages/OrdensCompra";
import Inventario from "./pages/Inventario";
import Documentos from "./pages/Documentos";
import MultiEmpresa from "./pages/MultiEmpresa";
import ContratosRecorrentes from "./pages/ContratosRecorrentes";
import EmpresaResumo from "./pages/EmpresaResumo";
import ImportacaoXML from "./pages/ImportacaoXML";
import FolhaPagamento from "./pages/FolhaPagamento";
import PontoEletronico from "./pages/PontoEletronico";
import FeriasAfastamentos from "./pages/FeriasAfastamentos";
import EncargosRH from "./pages/EncargosRH";
import AdmissoesDemissoes from "./pages/AdmissoesDemissoes";
import FluxoCaixa from "./pages/FluxoCaixa";
import MapeamentoContabil from "./pages/MapeamentoContabil";
import NfseEmissao from "./pages/NfseEmissao";
import NfseConfiguracoes from "./pages/NfseConfiguracoes";
import PrevisaoImpostos from "./pages/PrevisaoImpostos";
import PainelGerencial from "./pages/PainelGerencial";
import AreaContador from "./pages/AreaContador";
import VendaSistema from "./pages/VendaSistema";
import Checkout from "./pages/Checkout";

const queryClient = new QueryClient();

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
              <Routes>
                <Route path="/" element={<RootRedirect />} />
                <Route path="/venda" element={<VendaSistema />} />
                <Route path="/lp" element={<VendaSistema />} />
                <Route path="/checkout" element={<Checkout />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<Auth />} />
                <Route element={<RequireAuth />}>
                  <Route path="/conta-bloqueada" element={<ContaBloqueada />} />
                  <Route element={<RequireActiveAccount />}>
                    <Route element={<PersistentLayout />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/dashboard/:id" element={<CompanyDashboard />} />
                    <Route path="/indicadores" element={<Indicadores />} />
                    <Route path="/radar-legislativo" element={<RadarLegislativo />} />
                    <Route path="/financeiro" element={<Financeiro />} />
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
                    <Route path="/fluxo-caixa-projetado" element={<FluxoCaixaProjetado />} />
                    <Route path="/orcamento" element={<Orcamento />} />
                    <Route path="/previsao-receitas" element={<PrevisaoReceitas />} />
                    <Route path="/cenarios" element={<Cenarios />} />
                    <Route path="/vendas" element={<Vendas />} />
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
                    <Route path="/painel-gerencial" element={<PainelGerencial />} />
                    <Route path="/dre" element={<DRE />} />
                    <Route path="/demonstrativos/dfc" element={<FluxoCaixa />} />
                    <Route path="/demonstrativos/mapeamento" element={<MapeamentoContabil />} />
                    <Route path="/estoque" element={<EstoqueProdutos />} />
                    <Route path="/ordens-compra" element={<OrdensCompra />} />
                    <Route path="/inventario" element={<Inventario />} />
                    <Route path="/documentos" element={<Documentos />} />
                    <Route path="/documentos/*" element={<Documentos />} />
                    <Route path="/multiempresa" element={<MultiEmpresa />} />
                    <Route path="/multiempresa/*" element={<MultiEmpresa />} />
                    <Route path="/nfse" element={<NfseEmissao />} />
                    <Route path="/previsao-impostos" element={<PrevisaoImpostos />} />
                    <Route path="/configuracoes/nfse" element={<NfseConfiguracoes />} />
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
                      <Route path="/admin/usuarios" element={<AdminUsuarios />} />
                      <Route path="/admin/whatsapp-autorizados" element={<WhatsappAutorizados />} />
                      <Route path="/admin/log-atividades" element={<LogAtividades />} />
                    </Route>
                    </Route>
                  </Route>
                </Route>
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
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
