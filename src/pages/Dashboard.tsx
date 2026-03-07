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
import { maskCNPJ, maskCPF } from "@/utils/masks";
import { useNavigate } from "react-router-dom";
import { Input } from "@/components/ui/input";
import { useCompany } from "@/contexts/CompanyContext";
import { formatCurrency } from "@/utils/formatters";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useAdmin } from "@/contexts/AdminContext";

export default function Dashboard() {
  const COMPANIES_PAGE_SIZE = 10;
  const { user } = useAuth();
  const { companies, isLoading, error } = useCompanies(user?.id);
  const { setSelectedCompany } = useCompany();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [companiesPage, setCompaniesPage] = useState(1);
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

  const formatCompanyDocument = (company: { document_type?: string | null; cnpj?: string | null; cpf?: string | null }) => {
    const documentType = String(company.document_type ?? "").toLowerCase();
    const cnpjDigits = String(company.cnpj ?? "").replace(/\D/g, "");
    const cpfDigits = String(company.cpf ?? "").replace(/\D/g, "");

    if (documentType === "cpf" && cpfDigits) return maskCPF(cpfDigits);
    if (documentType === "cnpj" && cnpjDigits) return maskCNPJ(cnpjDigits);
    if (cnpjDigits) return maskCNPJ(cnpjDigits);
    if (cpfDigits) return maskCPF(cpfDigits);
    return "";
  };

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
        company.cpf,
        formatCompanyDocument(company),
        company.endereco_cidade,
        company.endereco_estado,
        company.email,
      ]
        .filter(Boolean)
        .join(" "),
    ).includes(needle);
  });

  const pagedCompanies = useMemo(() => {
    const list = filteredCompanies ?? [];
    const start = (companiesPage - 1) * COMPANIES_PAGE_SIZE;
    return list.slice(start, start + COMPANIES_PAGE_SIZE);
  }, [filteredCompanies, companiesPage]);

  const companiesTotalPages = useMemo(() => {
    const total = filteredCompanies?.length ?? 0;
    return Math.max(1, Math.ceil(total / COMPANIES_PAGE_SIZE));
  }, [filteredCompanies]);

  useEffect(() => {
    setCompaniesPage(1);
  }, [searchTerm]);

  useEffect(() => {
    if (companiesPage > companiesTotalPages) {
      setCompaniesPage(companiesTotalPages);
    }
  }, [companiesPage, companiesTotalPages]);

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
  const dashboardSurfaceCardClass =
    "border border-[#173B5B]/10 bg-[#123754] shadow-[0_20px_48px_rgba(18,55,84,0.18)]";

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
      <div className="-m-4 md:-m-6 min-h-full relative bg-white p-4 md:p-6 space-y-7 animate-fade-in">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.5] [background-image:linear-gradient(rgba(23,59,91,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(23,59,91,0.05)_1px,transparent_1px)] [background-size:36px_36px]"
        />

        <section className={`relative overflow-hidden rounded-[30px] ${dashboardSurfaceCardClass} backdrop-blur-sm`}>
          <div className="pointer-events-none absolute right-[-120px] top-[-120px] h-72 w-72 rounded-full bg-[#2F80ED]/30 blur-3xl text-emerald-500" />
          <div className="pointer-events-none absolute left-[-90px] bottom-[-120px] h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl text-emerald-500" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0)_40%)]" />

          <div className="relative grid gap-7 p-6 sm:p-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)] lg:items-center">
            <div className="min-w-0">
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

            <div className="min-w-0 rounded-2xl border border-white/10 bg-black/20 p-4 backdrop-blur-md">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">Ações rápidas</p>
              <div className="mt-3 grid gap-2">
                <Button
                  onClick={() => navigate("/empresas?new=true")}
                  className="h-auto min-h-10 whitespace-normal text-left justify-between rounded-xl bg-[#F2C94C] text-[#173B5B] hover:bg-[#E2B93B] border-none font-bold"
                >
                  Nova empresa
                  <PlusCircle className="h-4 w-4" />
                </Button>
                <Button
                  onClick={() => navigate("/financeiro")}
                  className="h-auto min-h-10 whitespace-normal text-left justify-between rounded-xl border border-[#F2C94C]/30 bg-transparent text-[#F2C94C] hover:bg-[#F2C94C]/10 font-bold"
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
              className={`rounded-2xl ${dashboardSurfaceCardClass} backdrop-blur-md`}
            >
              <CardContent className="flex items-start justify-between p-4">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.13em] text-white/50">{kpi.label}</p>
                  <p className="mt-2 text-xl font-black text-white sm:text-2xl">{kpi.value}</p>
                  <p className="mt-1 text-xs font-medium text-white/40">{kpi.detail}</p>
                </div>
                <div className={`rounded-xl p-2.5 bg-white/5 text-white`}>
                  <kpi.icon className="h-5 w-5" />
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="space-y-3">
          <div className="flex items-end justify-between px-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#173B5B]/60">Atalhos</p>
              <h3 className="text-2xl font-black tracking-tight text-[#123754]">Módulos do sistema</h3>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {visibleShortcuts.map((shortcut) => (
              <button
                key={shortcut.id}
                onClick={() => navigate(shortcut.route)}
                className={`group relative overflow-hidden rounded-2xl ${dashboardSurfaceCardClass} p-4 text-left backdrop-blur-md transition-all duration-300 hover:border-[#173B5B]/30 hover:bg-[#173B5B]`}
              >
                <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 bg-[radial-gradient(circle_at_85%_15%,rgba(255,255,255,0.14),transparent_42%)]" />
                <div className="inline-flex rounded-xl border border-white/10 bg-white/5 p-2.5 text-white">
                  <shortcut.icon className="h-5 w-5" />
                </div>
                <p className="mt-4 text-sm font-black uppercase tracking-[0.13em] text-[#F2C94C]">{shortcut.label}</p>
                <p className="mt-1 text-xs font-medium text-white/65">{shortcut.subtitle}</p>
                <div className="mt-4 flex items-center gap-1 text-xs font-bold uppercase tracking-[0.12em] text-[#F2C94C]">
                  Acessar
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                </div>
              </button>
            ))}
          </div>
        </section>

        <Card className="rounded-3xl border border-white/10 bg-[#123754] shadow-2xl backdrop-blur-sm overflow-hidden">
          <CardHeader className="border-b border-white/10 bg-black/20 p-5 md:p-6">
            <CardTitle className="flex items-center gap-3 text-xl font-bold text-white">
              <div className="rounded-xl bg-white/5 border border-white/10 p-2.5 shadow-inner">
                <Building2 className="h-6 w-6 text-sky-400" />
              </div>
              {t('dashboard.companies_list_title')}
            </CardTitle>

            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <p className="text-sm font-medium text-white/50">
                {resultsCount} resultado{resultsCount === 1 ? "" : "s"} encontrados
              </p>

              <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/40" />
                <Input
                  placeholder={t('dashboard.search_placeholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="h-10 border-white/10 bg-black/20 pl-9 text-white placeholder:text-white/30 focus-visible:ring-sky-500"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="text-center py-20">
                <div className="animate-spin h-10 w-10 border-4 border-sky-400 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-white/50 font-medium">{t('dashboard.loading_companies')}</p>
              </div>
            ) : filteredCompanies?.length === 0 ? (
              <div className="text-center py-20 text-white/50 flex flex-col items-center gap-4">
                <Building2 className="h-16 w-16 text-white/20" />
                <p className="text-lg font-medium">{t('dashboard.no_companies_found')}</p>
              </div>
            ) : (
              <div className="w-full overflow-x-auto rounded-xl">
                <Table className="w-full min-w-[600px] text-white" containerClassName="bg-transparent border-none ring-0 shadow-none">
                  <TableHeader
                    className="sticky top-0 z-10 shadow-lg border-none"
                    style={{ backgroundColor: '#F2C94C' }}
                  >
                    <TableRow className="border-none !bg-[#F2C94C] hover:!bg-[#F2C94C]" style={{ backgroundColor: '#F2C94C' }}>
                      <TableHead className="w-[30%] p-3 md:p-4 pl-6 text-xs font-extrabold uppercase text-[#173B5B]">{t('dashboard.table.company')}</TableHead>
                      <TableHead className="w-[16%] p-3 md:p-4 text-xs font-extrabold uppercase text-[#173B5B]">{t('dashboard.table.cnpj')}</TableHead>
                      <TableHead className="w-[14%] p-3 md:p-4 text-right text-xs font-extrabold uppercase text-[#173B5B]">{t('dashboard.table.revenue')}</TableHead>
                      <TableHead className="w-[14%] p-3 md:p-4 text-xs font-extrabold uppercase text-[#173B5B]">{t('dashboard.table.location')}</TableHead>
                      <TableHead className="w-[16%] p-3 md:p-4 text-xs font-extrabold uppercase text-[#173B5B]">{t('dashboard.table.contact')}</TableHead>
                      <TableHead className="w-[10%] p-3 md:p-4 pr-6 text-right text-xs font-extrabold uppercase text-[#173B5B]">{t('dashboard.table.action')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedCompanies.map((company: any) => (
                      <TableRow
                        key={company.id}
                        className={`group cursor-pointer border-b border-white/5 transition-colors hover:bg-white/10 odd:bg-black/10 even:bg-black/20 odd:hover:bg-white/10 even:hover:bg-white/10 data-[state=selected]:bg-white/10`}
                        onClick={() => handleCompanyClick(company)}
                      >
                        <TableCell className="p-3 md:p-4 pl-4 md:pl-6 truncate">
                          <div className="flex flex-col truncate">
                            <span className="font-semibold text-white text-[13px] md:text-sm group-hover:text-sky-400 transition-colors truncate">
                              {company.razao_social}
                            </span>
                            <span className="mt-0.5 truncate text-[10px] font-medium uppercase text-white/40">
                              {company.nome_fantasia || "Sem Nome Fantasia"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="p-3 md:p-4">
                          <Badge variant="outline" className="max-w-full truncate border-white/10 bg-white/5 px-2 py-0.5 font-mono text-[11px] text-white/70">
                            <span className="block max-w-full truncate">{formatCompanyDocument(company) || "N/D"}</span>
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right p-3 md:p-4">
                          <span className="font-mono text-[13px] text-white tabular-nums font-semibold">
                            {(() => {
                              const value = Number(company.faturamento);
                              return Number.isFinite(value) ? formatCurrency(value) : "-";
                            })()}
                          </span>
                        </TableCell>
                        <TableCell className="p-3 md:p-4">
                          <div className="flex max-w-full flex-col text-xs text-white/60 truncate">
                            <span className="font-semibold truncate text-white/80">{company.endereco_cidade || "-"}</span>
                            <span className="text-[10px] uppercase text-white/40 truncate">{company.endereco_estado || "-"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="truncate p-3 md:p-4">
                          <span className="block max-w-full truncate text-xs text-white/60" title={company.email || ""}>{company.email || "-"}</span>
                        </TableCell>
                        <TableCell className="p-3 md:p-4 pr-4 md:pr-6 text-right">
                          <Button size="sm" className="h-8 whitespace-nowrap bg-[#F2C94C] hover:bg-[#E2B93B] px-4 font-bold text-[#173B5B] shadow-[0_8px_16px_rgba(242,201,76,0.3)] border-none transition-all hover:scale-105">
                            {t('dashboard.table.access')} <ArrowRight className="ml-2 h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {!isLoading && (filteredCompanies?.length ?? 0) > COMPANIES_PAGE_SIZE && (
              <div className="flex items-center justify-between border-t border-white/10 bg-black/20 px-4 py-3 md:px-6">
                <span className="text-xs font-medium text-white/50">
                  Página {companiesPage} de {companiesTotalPages} ({filteredCompanies?.length ?? 0} empresas)
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={companiesPage <= 1}
                    onClick={() => setCompaniesPage((prev) => Math.max(1, prev - 1))}
                  >
                    Anterior
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={companiesPage >= companiesTotalPages}
                    onClick={() => setCompaniesPage((prev) => Math.min(companiesTotalPages, prev + 1))}
                  >
                    Próxima
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
