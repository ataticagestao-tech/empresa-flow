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
  ArrowRight,
  Sparkles,
  Wallet,
  MapPin,
  MailCheck,
  ChevronRight,
  PlusCircle,
} from "lucide-react";
import { useCompanies } from "@/hooks/useCompanies";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { maskCNPJ } from "@/utils/masks";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { useCompany } from "@/contexts/CompanyContext";
import { formatCurrency } from "@/utils/formatters";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useAdmin } from "@/contexts/AdminContext";

export default function Dashboard() {
  const { user } = useAuth();
  const { companies, isLoading, error } = useCompanies(user?.id);
  const { setSelectedCompany } = useCompany();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const { t } = useTranslation();
  const { isSuperAdmin } = useAdmin();

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

  const shortcuts = [
    {
      id: "empresas",
      label: t("dashboard.tabs.companies"),
      subtitle: "Gestão cadastral",
      icon: Building2,
      route: "/empresas",
      chip: "bg-[#2F80ED]/10 text-[#2F80ED] border-[#2F80ED]/20",
      hover: "hover:border-[#2F80ED]/35 hover:shadow-[0_16px_36px_rgba(47,128,237,0.16)]",
    },
    {
      id: "produtos",
      label: t("dashboard.tabs.products"),
      subtitle: "Catálogo e operação",
      icon: Package,
      route: "/operacional",
      adminOnly: true,
      chip: "bg-[#F2994A]/12 text-[#C7771B] border-[#F2994A]/25",
      hover: "hover:border-[#F2994A]/35 hover:shadow-[0_16px_36px_rgba(242,153,74,0.16)]",
    },
    {
      id: "contas_pagar",
      label: t("dashboard.tabs.payables"),
      subtitle: "Saídas financeiras",
      icon: ArrowDownCircle,
      route: "/contas-pagar",
      chip: "bg-[#EB5757]/10 text-[#D63E3E] border-[#EB5757]/20",
      hover: "hover:border-[#EB5757]/35 hover:shadow-[0_16px_36px_rgba(235,87,87,0.16)]",
    },
    {
      id: "contas_receber",
      label: t("dashboard.tabs.receivables"),
      subtitle: "Entradas financeiras",
      icon: ArrowUpCircle,
      route: "/contas-receber",
      chip: "bg-[#27AE60]/10 text-[#208C4D] border-[#27AE60]/20",
      hover: "hover:border-[#27AE60]/35 hover:shadow-[0_16px_36px_rgba(39,174,96,0.16)]",
    },
    {
      id: "clientes",
      label: t("dashboard.tabs.clients"),
      subtitle: "Relacionamento",
      icon: Users,
      route: "/clientes",
      chip: "bg-[#828282]/10 text-[#6A6A6A] border-[#828282]/20",
      hover: "hover:border-[#828282]/35 hover:shadow-[0_16px_36px_rgba(130,130,130,0.16)]",
    },
    {
      id: "oportunidades",
      label: t("dashboard.tabs.opportunities"),
      subtitle: "Pipeline comercial",
      icon: Target,
      route: "/crm",
      chip: "bg-[#4A67F2]/10 text-[#3A53C5] border-[#4A67F2]/20",
      hover: "hover:border-[#4A67F2]/35 hover:shadow-[0_16px_36px_rgba(74,103,242,0.16)]",
    },
    {
      id: "departamentos",
      label: t("dashboard.tabs.departments"),
      subtitle: "Estrutura interna",
      icon: Layers,
      route: "/operacional",
      adminOnly: true,
      chip: "bg-[#1C3D5A]/10 text-[#1C3D5A] border-[#1C3D5A]/20",
      hover: "hover:border-[#1C3D5A]/35 hover:shadow-[0_16px_36px_rgba(28,61,90,0.16)]",
    },
  ] as const;
  const visibleShortcuts = shortcuts.filter((shortcut) => !("adminOnly" in shortcut) || !shortcut.adminOnly || isSuperAdmin);

  const totalCompanies = companies?.length ?? 0;
  const resultsCount = filteredCompanies?.length ?? 0;
  const totalRevenue = useMemo(
    () =>
      (companies ?? []).reduce((acc, company: any) => {
        const value = Number(company?.faturamento);
        return Number.isFinite(value) ? acc + value : acc;
      }, 0),
    [companies],
  );
  const statesCount = useMemo(
    () =>
      new Set(
        (companies ?? [])
          .map((company: any) => String(company?.endereco_estado ?? "").trim())
          .filter(Boolean),
      ).size,
    [companies],
  );
  const companiesWithEmail = useMemo(
    () => (companies ?? []).filter((company: any) => String(company?.email ?? "").trim().length > 0).length,
    [companies],
  );
  const contactCoverage = totalCompanies > 0 ? Math.round((companiesWithEmail / totalCompanies) * 100) : 0;

  const kpis = [
    {
      id: "total",
      label: "Empresas cadastradas",
      value: String(totalCompanies),
      detail: `${resultsCount} em exibição`,
      icon: Building2,
      iconWrap: "bg-[#2F80ED]/12 text-[#2F80ED]",
      border: "border-[#2F80ED]/20",
    },
    {
      id: "revenue",
      label: "Faturamento informado",
      value: formatCurrency(totalRevenue),
      detail: "Soma das empresas listadas",
      icon: Wallet,
      iconWrap: "bg-[#27AE60]/12 text-[#208C4D]",
      border: "border-[#27AE60]/20",
    },
    {
      id: "states",
      label: "Cobertura geográfica",
      value: `${statesCount}`,
      detail: "Estados diferentes",
      icon: MapPin,
      iconWrap: "bg-[#F2994A]/14 text-[#C7771B]",
      border: "border-[#F2994A]/25",
    },
    {
      id: "contact",
      label: "Dados de contato",
      value: `${contactCoverage}%`,
      detail: `${companiesWithEmail}/${totalCompanies || 0} com email`,
      icon: MailCheck,
      iconWrap: "bg-[#4A67F2]/12 text-[#3A53C5]",
      border: "border-[#4A67F2]/20",
    },
  ];

  return (
    <AppLayout title={t('dashboard.title')}>
      <div className="relative space-y-7 overflow-hidden rounded-[30px] border border-[#cfdbea] bg-[linear-gradient(145deg,#eef4fb_0%,#e8f0f9_45%,#e4edf8_70%,#dde8f6_100%)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] animate-fade-in md:p-5">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 rounded-3xl bg-[radial-gradient(circle_at_2%_4%,rgba(47,128,237,0.25),transparent_35%),radial-gradient(circle_at_96%_0%,rgba(242,153,74,0.22),transparent_36%),radial-gradient(circle_at_60%_100%,rgba(39,174,96,0.18),transparent_40%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-60 [background-image:linear-gradient(rgba(28,61,90,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(28,61,90,0.04)_1px,transparent_1px)] [background-size:36px_36px]"
        />

        <section className="relative overflow-hidden rounded-[30px] border border-[#113657]/40 bg-gradient-to-br from-[#173B5B] via-[#153652] to-[#102B42] shadow-[0_28px_70px_rgba(9,28,44,0.35)]">
          <div className="pointer-events-none absolute right-[-120px] top-[-120px] h-72 w-72 rounded-full bg-[#2F80ED]/20 blur-3xl" />
          <div className="pointer-events-none absolute left-[-90px] bottom-[-120px] h-72 w-72 rounded-full bg-[#C5A03F]/20 blur-3xl" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.10)_0%,rgba(255,255,255,0)_40%)]" />

          <div className="relative grid gap-7 p-6 sm:p-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/75">
                <Sparkles className="h-3.5 w-3.5 text-[#F2C94C]" />
                {t("dashboard.title")}
              </div>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/75 sm:text-lg">
                {t("dashboard.subtitle")}
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-2">
                <Badge className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm hover:bg-white/15">
                  {totalCompanies} empresa{totalCompanies === 1 ? "" : "s"}
                </Badge>
                <Badge className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm hover:bg-white/15">
                  {resultsCount} resultado{resultsCount === 1 ? "" : "s"}
                </Badge>
                <Badge className="rounded-full border-none bg-[#F2C94C] px-3 py-1 text-xs font-bold text-[#173B5B] shadow-[0_8px_20px_rgba(242,201,76,0.45)]">
                  Atalhos do sistema
                </Badge>
              </div>
            </div>

            <div className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur-md">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">Ações rápidas</p>
              <div className="mt-3 grid gap-2">
                <Button
                  onClick={() => navigate("/empresas?new=true")}
                  className="h-10 justify-between rounded-xl bg-white text-[#173B5B] hover:bg-white/90"
                >
                  Nova empresa
                  <PlusCircle className="h-4 w-4" />
                </Button>
                <Button
                  onClick={() => navigate("/financeiro")}
                  className="h-10 justify-between rounded-xl border border-white/25 bg-transparent text-white hover:bg-white/10"
                >
                  Abrir módulo financeiro
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => (
            <Card
              key={kpi.id}
              className={`rounded-2xl border bg-[linear-gradient(130deg,rgba(255,255,255,0.8),rgba(242,247,253,0.72))] shadow-[0_14px_28px_rgba(15,23,42,0.05)] backdrop-blur-sm ${kpi.border}`}
            >
              <CardContent className="flex items-start justify-between p-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-slate-500">{kpi.label}</p>
                  <p className="mt-2 text-xl font-black text-[#173B5B] sm:text-2xl">{kpi.value}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">{kpi.detail}</p>
                </div>
                <div className={`rounded-xl p-2.5 ${kpi.iconWrap}`}>
                  <kpi.icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#173B5B]/65">Atalhos</p>
              <h3 className="text-2xl font-black tracking-tight text-[#173B5B]">Módulos do sistema</h3>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {visibleShortcuts.map((shortcut) => (
              <button
                key={shortcut.id}
                onClick={() => navigate(shortcut.route)}
                className={`group relative overflow-hidden rounded-2xl border border-[#d2dfef] bg-[linear-gradient(145deg,rgba(255,255,255,0.65),rgba(236,244,252,0.8))] p-4 text-left shadow-[0_12px_28px_rgba(15,23,42,0.05)] transition-all duration-300 ${shortcut.hover}`}
              >
                <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_85%_15%,rgba(255,255,255,0.55),transparent_42%)]" />
                <div className={`inline-flex rounded-xl border p-2.5 ${shortcut.chip}`}>
                  <shortcut.icon className="h-5 w-5" />
                </div>
                <p className="mt-4 text-sm font-black uppercase tracking-[0.13em] text-[#173B5B]">{shortcut.label}</p>
                <p className="mt-1 text-xs font-medium text-slate-500">{shortcut.subtitle}</p>
                <div className="mt-4 flex items-center gap-1 text-xs font-bold uppercase tracking-[0.12em] text-[#173B5B]/70">
                  Acessar
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                </div>
              </button>
            ))}
          </div>
        </section>

        <Card className="overflow-hidden rounded-3xl border-[#cad9eb] bg-[linear-gradient(140deg,rgba(255,255,255,0.52),rgba(232,241,250,0.9))] shadow-[0_24px_52px_rgba(15,23,42,0.08)] backdrop-blur-sm">
          <CardHeader className="border-b border-[#c8d8ea] bg-[linear-gradient(120deg,rgba(246,250,255,0.82),rgba(231,240,250,0.8))] p-5 md:p-6">
            <CardTitle className="flex items-center gap-3 text-xl font-bold text-[#1C3D5A]">
              <div className="rounded-xl bg-[linear-gradient(145deg,rgba(47,128,237,0.12),rgba(47,128,237,0.18))] p-2.5 shadow-inner">
                <Building2 className="h-6 w-6 text-[#2F80ED]" />
              </div>
              {t('dashboard.companies_list_title')}
            </CardTitle>

            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm font-medium text-slate-500">
                {resultsCount} resultado{resultsCount === 1 ? "" : "s"} encontrados
              </p>

              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  placeholder={t('dashboard.search_placeholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-10 border-[#c5d6ea] bg-[linear-gradient(145deg,rgba(255,255,255,0.85),rgba(237,244,252,0.95))] pl-9 text-[#173B5B] placeholder:text-slate-500 focus-visible:ring-[#2F80ED]"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="text-center py-20">
                <div className="animate-spin h-10 w-10 border-4 border-[#2F80ED] border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-slate-500 font-medium">{t('dashboard.loading_companies')}</p>
              </div>
            ) : filteredCompanies?.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground flex flex-col items-center gap-4">
                <Building2 className="h-16 w-16 text-slate-200" />
                <p className="text-lg font-medium">{t('dashboard.no_companies_found')}</p>
              </div>
            ) : (
              <div className="w-full overflow-x-auto">
                <Table className="w-full table-fixed">
                  <TableHeader className="sticky top-0 z-10 bg-[linear-gradient(120deg,rgba(225,236,249,0.96),rgba(215,229,245,0.95))] backdrop-blur">
                    <TableRow className="border-b border-slate-100 hover:bg-transparent">
                      <TableHead className="w-auto p-4 pl-6 text-xs font-bold uppercase text-[#1C3D5A]">{t('dashboard.table.company')}</TableHead>
                      <TableHead className="hidden w-[160px] p-4 text-xs font-bold uppercase text-[#1C3D5A] md:table-cell">{t('dashboard.table.cnpj')}</TableHead>
                      <TableHead className="hidden w-[160px] p-4 text-right text-xs font-bold uppercase text-[#1C3D5A] lg:table-cell">{t('dashboard.table.revenue')}</TableHead>
                      <TableHead className="hidden w-[200px] p-4 text-xs font-bold uppercase text-[#1C3D5A] xl:table-cell">{t('dashboard.table.location')}</TableHead>
                      <TableHead className="hidden w-[220px] p-4 text-xs font-bold uppercase text-[#1C3D5A] 2xl:table-cell">{t('dashboard.table.contact')}</TableHead>
                      <TableHead className="w-[150px] p-4 pr-6 text-right text-xs font-bold uppercase text-[#1C3D5A]">{t('dashboard.table.action')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCompanies?.map((company: any, index: number) => (
                      <TableRow
                        key={company.id}
                        className={`group cursor-pointer border-b border-[#dbe6f3] transition-colors hover:bg-[linear-gradient(90deg,rgba(233,242,252,0.6),rgba(242,248,255,0.85))] ${index % 2 === 0 ? "bg-[linear-gradient(90deg,rgba(248,252,255,0.78),rgba(238,246,253,0.82))]" : "bg-[linear-gradient(90deg,rgba(239,247,254,0.75),rgba(231,241,251,0.82))]"}`}
                        onClick={() => handleCompanyClick(company)}
                      >
                        <TableCell className="p-4 pl-6 truncate">
                          <div className="flex flex-col truncate">
                            <span className="font-bold text-slate-800 text-sm sm:text-base group-hover:text-[#2F80ED] transition-colors truncate">
                              {company.razao_social}
                            </span>
                            <span className="mt-0.5 truncate text-[11px] font-medium uppercase text-slate-500">
                              {company.nome_fantasia || "Sem Nome Fantasia"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell p-4">
                          <Badge variant="outline" className="border-[#bfd2e8] bg-[linear-gradient(145deg,rgba(255,255,255,0.72),rgba(230,240,250,0.8))] px-2 py-0.5 font-mono text-[11px] text-slate-600">
                            {company.cnpj ? maskCNPJ(company.cnpj) : "N/D"}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell text-right p-4">
                          <span className="font-mono text-[13px] text-slate-700 tabular-nums font-semibold">
                            {(() => {
                              const value = Number(company.faturamento);
                              return Number.isFinite(value) ? formatCurrency(value) : "-";
                            })()}
                          </span>
                        </TableCell>
                        <TableCell className="hidden xl:table-cell p-4">
                          <div className="flex flex-col text-xs text-slate-600 truncate">
                            <span className="font-semibold truncate">{company.endereco_cidade || "-"}</span>
                            <span className="text-[10px] uppercase text-slate-400 truncate">{company.endereco_estado || "-"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="hidden 2xl:table-cell truncate p-4">
                          <span className="text-xs text-slate-600 truncate" title={company.email || ""}>{company.email || "-"}</span>
                        </TableCell>
                        <TableCell className="p-4 pr-6 text-right">
                          <Button size="sm" className="h-8 w-full bg-[linear-gradient(130deg,#3a8df7,#2F80ED)] px-4 font-medium text-white shadow-[0_8px_16px_rgba(47,128,237,0.28)] hover:bg-[#1C3D5A]">
                            {t('dashboard.table.access')} <ArrowRight className="ml-2 h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
