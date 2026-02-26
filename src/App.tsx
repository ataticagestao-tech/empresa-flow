import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { CompanyProvider } from "@/contexts/CompanyContext";
import { AdminProvider } from "@/contexts/AdminContext";
import { useAuth } from "@/contexts/AuthContext";
import { useAdmin } from "@/contexts/AdminContext";
import { useUserStatus } from "@/hooks/useUserStatus";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
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
import AjudaFluxoCaixa from "./pages/AjudaFluxoCaixa";
import CRM from "./pages/CRM";
import WhatsApp from "./pages/WhatsApp";
import Funcionarios from "./pages/Funcionarios";

import ProdutosDepartamentos from "./pages/ProdutosDepartamentos";
import Recibos from "./pages/Recibos";
import NotFound from "./pages/NotFound";
import AdminUsuarios from "./pages/AdminUsuarios";
import ContaBloqueada from "./pages/ContaBloqueada";

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

  // Verifica se é um redirecionamento de recuperação de senha (hash na URL)
  const hash = window.location.hash;
  if (hash && (hash.includes("type=recovery") || hash.includes("type=magiclink"))) {
    return <Navigate to="/reset-password" replace />;
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
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<RootRedirect />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route element={<RequireAuth />}>
                  <Route path="/conta-bloqueada" element={<ContaBloqueada />} />
                  <Route element={<RequireActiveAccount />}>
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/dashboard/:id" element={<CompanyDashboard />} />
                    <Route path="/financeiro" element={<Financeiro />} />
                    <Route path="/empresas" element={<Empresas />} />
                    <Route path="/clientes" element={<Clientes />} />
                    <Route path="/fornecedores" element={<Fornecedores />} />
                    <Route path="/movimentacoes" element={<Movimentacoes />} />
                    <Route path="/movimentacoes/*" element={<Movimentacoes />} />
                    <Route path="/categorias" element={<Categorias />} />
                    <Route path="/contas-bancarias" element={<ContasBancarias />} />
                    <Route path="/contas-pagar" element={<ContasPagar />} />
                    <Route path="/contas-receber" element={<ContasReceber />} />
                    <Route path="/conciliacao" element={<Conciliacao />} />
                    <Route path="/relatorios" element={<Relatorios />} />
                    <Route path="/relatorios/*" element={<Relatorios />} />
                    <Route path="/crm" element={<CRM />} />
                    <Route path="/whatsapp" element={<WhatsApp />} />
                    <Route path="/funcionarios" element={<Funcionarios />} />
                    <Route path="/recibos" element={<Recibos />} />
                    <Route path="/import-data" element={<ImportData />} />
                    <Route path="/ajuda" element={<Ajuda />} />
                    <Route path="/ajuda/fluxo-caixa" element={<AjudaFluxoCaixa />} />
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
