import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Building2,
  Package,
  ArrowDownCircle,
  ArrowUpCircle,
  Users,
  Target,
  Layers,
  Search,
  Wallet,
  ChevronRight,
  Plus,
  CreditCard,
  BarChart2,
  Kanban,
} from "lucide-react";
import { useCompanies } from "@/hooks/useCompanies";
import { useAuth } from "@/contexts/AuthContext";
import { maskCNPJ } from "@/utils/masks";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { useCompany } from "@/contexts/CompanyContext";
import { formatCurrency } from "@/utils/formatters";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useAdmin } from "@/contexts/AdminContext";
import { useQuery } from "@tanstack/react-query";

export default function Dashboard() {
  const { user } = useAuth();
  const { companies, isLoading, error } = useCompanies(user?.id);
  const { setSelectedCompany, selectedCompany } = useCompany();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const { t } = useTranslation();
  const { isSuperAdmin } = useAdmin();

  // Redireciona para o dashboard da empresa selecionada
  useEffect(() => {
    if (selectedCompany?.id) {
      navigate(`/dashboard/${selectedCompany.id}`, { replace: true });
    }
  }, [selectedCompany, navigate]);

  useEffect(() => {
    if (error) {
      toast.error(t('auth.error_generic'), {
        description: "Não foi possível conectar ao banco de dados. Verifique a conexão.",
      });
      console.error("Erro de conexão:", error);
    }
  }, [error, t]);

  const normalizeSearch = (value: unknown) =>
    String(value ?? "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  useEffect(() => {
    if (!isLoading && user && (companies?.length ?? 0) === 0) {
      navigate("/empresas?new=true", { replace: true });
    }
  }, [companies, isLoading, navigate, user]);

  const handleCompanyClick = (company: any) => {
    setSelectedCompany(company);
    navigate(`/dashboard/${company.id}`);
  };

  const filteredCompanies = companies?.filter((company) => {
    const needle = normalizeSearch(searchTerm);
    if (!needle) return true;
    return normalizeSearch(
      [
        company.razao_social,
        company.nome_fantasia,
        company.cnpj,
        company.endereco_cidade,
        company.endereco_estado,
        company.email,
      ]
        .filter(Boolean)
        .join(" "),
    ).includes(needle);
  });

  const { activeClient } = useAuth();

  const totalCompanies = companies?.length ?? 0;
  const resultsCount = filteredCompanies?.length ?? 0;

  // KPIs financeiros reais — saldo bancário, a receber, a pagar
  const companyIds = useMemo(() => (companies ?? []).map(c => c.id), [companies]);
  const db = activeClient as any;

  // IDs de contas contábeis de transferência (excluir de cálculos)
  const { data: transferAccountIds = [] } = useQuery({
    queryKey: ['dashboard_transfer_ids', companyIds],
    queryFn: async () => {
      if (!companyIds.length) return [];
      const { data } = await db.from('chart_of_accounts')
        .select('id')
        .in('company_id', companyIds)
        .ilike('name', '%transfer%');
      return (data || []).map((a: any) => a.id);
    },
    enabled: companyIds.length > 0,
  });

  const { data: totalBankBalance = 0 } = useQuery({
    queryKey: ['dashboard_total_balance', companyIds],
    queryFn: async () => {
      if (!companyIds.length) return 0;
      const { data, error } = await db
        .from('bank_accounts')
        .select('current_balance')
        .in('company_id', companyIds)
        .is('deleted_at', null);
      if (error) return 0;
      return (data || []).reduce((acc: number, r: any) => acc + (r.current_balance || 0), 0);
    },
    enabled: companyIds.length > 0,
  });

  const { data: totalReceivable = 0 } = useQuery({
    queryKey: ['dashboard_total_receivable', companyIds, transferAccountIds],
    queryFn: async () => {
      if (!companyIds.length) return 0;
      const { data, error } = await db
        .from('contas_receber')
        .select('valor, conta_contabil_id')
        .in('company_id', companyIds)
        .in('status', ['aberto', 'parcial', 'vencido'])
        .is('deleted_at', null);
      if (error) return 0;
      return (data || [])
        .filter((r: any) => !r.conta_contabil_id || !transferAccountIds.includes(r.conta_contabil_id))
        .reduce((acc: number, r: any) => acc + Number(r.valor || 0), 0);
    },
    enabled: companyIds.length > 0,
  });

  const { data: totalPayable = 0 } = useQuery({
    queryKey: ['dashboard_total_payable', companyIds, transferAccountIds],
    queryFn: async () => {
      if (!companyIds.length) return 0;
      const { data, error } = await db
        .from('contas_pagar')
        .select('valor, conta_contabil_id')
        .in('company_id', companyIds)
        .in('status', ['aberto', 'parcial', 'vencido'])
        .is('deleted_at', null);
      if (error) return 0;
      return (data || [])
        .filter((r: any) => !r.conta_contabil_id || !transferAccountIds.includes(r.conta_contabil_id))
        .reduce((acc: number, r: any) => acc + Number(r.valor || 0), 0);
    },
    enabled: companyIds.length > 0,
  });

  const kpis = [
    { id: "total", label: "Empresas Cadastradas", value: String(totalCompanies), detail: `${resultsCount} em exibição`, icon: Building2 },
    { id: "balance", label: "Saldo em Bancos", value: formatCurrency(totalBankBalance), detail: "Soma de todas as contas", icon: Wallet },
    { id: "receivable", label: "A Receber (Pendente)", value: formatCurrency(totalReceivable), detail: "Total pendente de recebimento", icon: ArrowUpCircle },
    { id: "payable", label: "A Pagar (Pendente)", value: formatCurrency(totalPayable), detail: "Total pendente de pagamento", icon: ArrowDownCircle },
  ];

  const quickActions = [
    { label: "Nova Empresa", icon: Plus, route: "/empresas?new=true" },
    { label: "Hub Financeiro", icon: CreditCard, route: "/financeiro" },
    { label: "Relatórios", icon: BarChart2, route: "/relatorios" },
    { label: "CRM", icon: Kanban, route: "/crm" },
  ];

  const shortcuts = [
    { id: "empresas", label: t("dashboard.tabs.companies"), subtitle: "Gestão cadastral", icon: Building2, route: "/empresas" },
    { id: "produtos", label: t("dashboard.tabs.products"), subtitle: "Catálogo e operação", icon: Package, route: "/operacional", adminOnly: true },
    { id: "contas_pagar", label: t("dashboard.tabs.payables"), subtitle: "Saídas financeiras", icon: ArrowDownCircle, route: "/contas-pagar" },
    { id: "contas_receber", label: t("dashboard.tabs.receivables"), subtitle: "Entradas financeiras", icon: ArrowUpCircle, route: "/contas-receber" },
    { id: "clientes", label: t("dashboard.tabs.clients"), subtitle: "Relacionamento", icon: Users, route: "/clientes" },
    { id: "oportunidades", label: t("dashboard.tabs.opportunities"), subtitle: "Pipeline comercial", icon: Target, route: "/crm" },
    { id: "departamentos", label: t("dashboard.tabs.departments"), subtitle: "Estrutura interna", icon: Layers, route: "/operacional", adminOnly: true },
  ] as const;
  const visibleShortcuts = shortcuts.filter((s) => !("adminOnly" in s) || !s.adminOnly || isSuperAdmin);

  return (
    <AppLayout title={t('dashboard.title')}>
      <div className="space-y-6 animate-fade-in">

        {/* Page Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">{t('dashboard.title')}</h2>
            <p className="text-[12.5px] text-muted-foreground mt-0.5">{t("dashboard.subtitle")}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate("/empresas?new=true")}>
              <Plus className="h-3.5 w-3.5" /> Nova Empresa
            </Button>
          </div>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {kpis.map((kpi) => (
            <Card key={kpi.id}>
              <CardContent className="p-[22px]">
                <div className="flex items-start justify-between mb-3.5">
                  <p className="text-[11px] font-bold uppercase tracking-[0.8px] text-primary">{kpi.label}</p>
                  <kpi.icon className="h-[18px] w-[18px] text-muted-foreground opacity-60" />
                </div>
                <p className="kpi-value text-foreground">{kpi.value}</p>
                <p className="text-[11.5px] text-muted-foreground mt-1">{kpi.detail}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Content Grid: Table + Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5">

          {/* Companies Table */}
          <Card className="overflow-hidden">
            <CardHeader className="border-b border-border-light">
              <div className="flex items-center justify-between">
                <CardTitle className="text-[13px] font-bold tracking-tight">
                  {t('dashboard.companies_list_title')}
                </CardTitle>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                      placeholder={t('dashboard.search_placeholder')}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-8 w-[180px] pl-8 text-[12.5px]"
                    />
                  </div>
                  <button
                    onClick={() => navigate("/empresas")}
                    className="text-xs text-primary font-medium hover:underline whitespace-nowrap"
                  >
                    Ver todas
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {isLoading ? (
                <div className="text-center py-16">
                  <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">{t('dashboard.loading_companies')}</p>
                </div>
              ) : filteredCompanies?.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground flex flex-col items-center gap-3">
                  <Building2 className="h-10 w-10 opacity-30" />
                  <p className="text-sm font-medium">{t('dashboard.no_companies_found')}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Empresa</TableHead>
                      <TableHead className="hidden md:table-cell">CNPJ</TableHead>
                      <TableHead className="hidden lg:table-cell">Estado</TableHead>
                      <TableHead className="text-center">Ação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCompanies?.map((company: any) => (
                      <TableRow
                        key={company.id}
                        className="cursor-pointer"
                        onClick={() => handleCompanyClick(company)}
                      >
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-semibold text-foreground text-[12.5px]">
                              {company.razao_social}
                            </span>
                            {company.nome_fantasia && (
                              <span className="text-[11px] text-muted-foreground mt-0.5">
                                {company.nome_fantasia}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <span className="text-[12.5px] text-muted-foreground font-mono">
                            {company.cnpj ? maskCNPJ(company.cnpj) : "-"}
                          </span>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <span className="text-[12.5px] text-muted-foreground">
                            {company.endereco_cidade ? `${company.endereco_cidade}/${company.endereco_estado || ""}` : company.endereco_estado || "-"}
                          </span>
                        </TableCell>
                        <TableCell className="text-center">
                          <Button variant="ghost" size="sm">Ver</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Right Column */}
          <div className="flex flex-col gap-5">
            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-[13px] font-bold tracking-tight">Ações Rápidas</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex flex-col">
                  {quickActions.map((action, i) => (
                    <button
                      key={action.label}
                      onClick={() => navigate(action.route)}
                      className={`flex items-center gap-2.5 py-2.5 text-[12.5px] text-foreground hover:text-primary transition-colors ${i < quickActions.length - 1 ? "border-b border-border-light" : ""}`}
                    >
                      <action.icon className="h-[15px] w-[15px] text-muted-foreground" />
                      {action.label}
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Module Shortcuts */}
            <Card>
              <CardHeader>
                <CardTitle className="text-[13px] font-bold tracking-tight">Módulos do Sistema</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="grid grid-cols-2 gap-2.5">
                  {visibleShortcuts.map((shortcut) => (
                    <button
                      key={shortcut.id}
                      onClick={() => navigate(shortcut.route)}
                      className="group rounded-lg border border-border p-3 text-left hover:border-primary/30 hover:shadow-sm transition-all"
                    >
                      <div className="rounded-md bg-primary/10 p-2 w-fit mb-2.5">
                        <shortcut.icon className="h-4 w-4 text-primary" />
                      </div>
                      <p className="text-[12px] font-semibold text-foreground">{shortcut.label}</p>
                      <p className="text-[10.5px] text-muted-foreground mt-0.5">{shortcut.subtitle}</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
