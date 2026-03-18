import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { CompanyProvider } from "@/contexts/CompanyContext";
import { AdminProvider } from "@/contexts/AdminContext";
import { ReciboModalProvider } from "@/components/finance/BotaoPagarComRecibo";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/contexts/AdminContext";
import { useUserStatus } from "@/hooks/useUserStatus";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import CompanyDashboard from "./pages/CompanyDashboard";
import Financeiro from "./pages/Financeiro";
import Empresas from "./pages/Empresas";
import Clientes from "./pages/Clientes";
import Fornecedores from "./pages/Fornecedores";
import Movimentacoes from "./pages/Movimentacoes";
import Categorias from "./pages/Categorias";
import ContasBancarias from "./pages/ContasBancarias";
import ContasPagar from "./pages/ContasPagar";
import ContasReceber from "./pages/ContasReceber";
import Conciliacao from "./pages/Conciliacao";
import Relatorios from "./pages/Relatorios";
import Configuracoes from "./pages/Configuracoes";
import ImportData from "./pages/ImportData";
import Ajuda from "./pages/Ajuda";
import CRM from "./pages/CRM";

import ProdutosDepartamentos from "./pages/ProdutosDepartamentos";
import Recibos from "./pages/Recibos";
import NotFound from "./pages/NotFound";
import AdminUsuarios from "./pages/AdminUsuarios";
import ContaBloqueada from "./pages/ContaBloqueada";
import PlanoContas from "./pages/PlanoContas";
import Funcionarios from "./pages/Funcionarios";
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

const queryClient = new QueryClient();

const RequireAuth = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sidebar">
        <div className="animate-pulse text-sidebar-foreground">Carregando...</div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  return <Outlet />;
};

const RequireSuperAdmin = () => {
  const { isSuperAdmin, loading } = useAdmin();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sidebar">
        <div className="animate-pulse text-sidebar-foreground">Carregando...</div>
      </div>
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
      <div className="min-h-screen flex items-center justify-center bg-sidebar">
        <div className="animate-pulse text-sidebar-foreground">Carregando...</div>
      </div>
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
      <div className="min-h-screen flex items-center justify-center bg-sidebar">
        <div className="animate-pulse text-sidebar-foreground">Carregando...</div>
      </div>
    );
  }

  return <Navigate to={user ? "/dashboard" : "/auth"} replace />;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <AdminProvider>
          <CompanyProvider>
            <Toaster />
            <Sonner />
            <ReciboModalProvider />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<RootRedirect />} />
                <Route path="/auth" element={<Auth />} />
                <Route element={<RequireAuth />}>
                  <Route path="/conta-bloqueada" element={<ContaBloqueada />} />
                  <Route element={<RequireActiveAccount />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/dashboard/:id" element={<CompanyDashboard />} />
                    <Route path="/financeiro" element={<Financeiro />} />
                    <Route path="/empresas" element={<Empresas />} />
                    <Route path="/clientes" element={<Clientes />} />
                    <Route path="/funcionarios" element={<Funcionarios />} />
                    <Route path="/fornecedores" element={<Fornecedores />} />
                    <Route path="/movimentacoes" element={<Movimentacoes />} />
                    <Route path="/movimentacoes/*" element={<Movimentacoes />} />
                    <Route path="/categorias" element={<Categorias />} />
                    <Route path="/plano-contas" element={<PlanoContas />} />
                    <Route path="/centros-custo" element={<CentrosCusto />} />
                    <Route path="/contas-bancarias" element={<ContasBancarias />} />
                    <Route path="/contas-pagar" element={<ContasPagar />} />
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
                    <Route element={<RequireSuperAdmin />}>
                      <Route path="/configuracoes" element={<Configuracoes />} />
                      <Route path="/operacional" element={<ProdutosDepartamentos />} />
                      <Route path="/admin/usuarios" element={<AdminUsuarios />} />
                    </Route>
                  </Route>
                </Route>
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </CompanyProvider>
        </AdminProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
