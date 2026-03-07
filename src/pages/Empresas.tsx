import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
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
    Dialog,
    DialogContent,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Building2, CheckCircle2, CircleOff } from "lucide-react";
import { useCompanies } from "@/hooks/useCompanies";
import { Company } from "@/types/company";
import { maskCNPJ, maskCPF } from "@/utils/masks";
import { CompanyForm } from "@/modules/companies/presentation/CompanyForm";

const formatCompanyDocument = (company: Company) => {
    const documentType = String(company.document_type ?? "").toLowerCase();
    const cnpjDigits = String(company.cnpj ?? "").replace(/\D/g, "");
    const cpfDigits = String(company.cpf ?? "").replace(/\D/g, "");

    if (documentType === "cpf" && cpfDigits) return maskCPF(cpfDigits);
    if (documentType === "cnpj" && cnpjDigits) return maskCNPJ(cnpjDigits);
    if (cnpjDigits) return maskCNPJ(cnpjDigits);
    if (cpfDigits) return maskCPF(cpfDigits);

    return "N/D";
};

export default function Empresas() {
    const COMPANIES_PAGE_SIZE = 10;
    const { user, activeClient } = useAuth();
    const { companies, isLoading, error: companiesError, deleteCompany, refetch: refetchCompanies } = useCompanies(user?.id);

    // UI State
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingCompany, setEditingCompany] = useState<Company | null>(null);
    const [companiesWithCharts, setCompaniesWithCharts] = useState<Set<string>>(new Set());
    const [companiesPage, setCompaniesPage] = useState(1);

    const pagedCompanies = useMemo(() => {
        const list = companies ?? [];
        const start = (companiesPage - 1) * COMPANIES_PAGE_SIZE;
        return list.slice(start, start + COMPANIES_PAGE_SIZE);
    }, [companies, companiesPage]);

    const companiesTotalPages = useMemo(() => {
        const total = companies?.length ?? 0;
        return Math.max(1, Math.ceil(total / COMPANIES_PAGE_SIZE));
    }, [companies]);

    // Verificar quais empresas têm plano de contas
    useEffect(() => {
        if (!companies || companies.length === 0) return;

        const checkChartOfAccounts = async () => {
            const companyIds = companies.map(c => c.id);
            const { data } = await activeClient
                .from('chart_of_accounts')
                .select('company_id')
                .in('company_id', companyIds);

            if (data) {
                const idsWithCharts = new Set(data.map(d => d.company_id));
                setCompaniesWithCharts(idsWithCharts);
            }
        };

        checkChartOfAccounts();
    }, [companies, activeClient]);

    useEffect(() => {
        if (companiesPage > companiesTotalPages) {
            setCompaniesPage(companiesTotalPages);
        }
    }, [companiesPage, companiesTotalPages]);

    const handleEdit = (company: Company) => {
        setEditingCompany(company);
        setIsDialogOpen(true);
    };

    const handleDelete = async (company: Company) => {
        if (!confirm(`Remover empresa ${company.razao_social}?`)) return;
        await deleteCompany(company.id);
    };

    const handleSuccess = () => {
        setIsDialogOpen(false);
        setEditingCompany(null);
        refetchCompanies();
    };

    const companiesSurfaceCardClass =
        "w-full overflow-hidden rounded-xl border border-[#173B5B]/10 bg-[#123754] shadow-[0_20px_48px_rgba(18,55,84,0.18)]";
    const companiesCardHeaderClass = "border-b border-white/10 bg-[#123754] p-6";
    const companiesTableContainerClass = "rounded-none border-none bg-transparent shadow-none ring-0";
    const companiesTableHeaderClass = "bg-white text-slate-900 [&_tr]:border-slate-200";
    const companiesTableHeaderRowClass = "border-slate-200 bg-transparent hover:bg-transparent odd:!bg-white even:!bg-white";
    const companiesTableBodyRowClass = "group border-white/5 odd:!bg-[#123754] even:!bg-[#163E60] hover:!bg-[#1B486E] transition-all";
    const companiesFooterClass = "flex items-center justify-between border-t border-white/10 bg-black/20 px-4 py-3 md:px-6";

    return (
        <AppLayout title="Empresas">
            <div className="w-full space-y-6 animate-fade-in">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight text-slate-800">Empresas</h2>
                        <p className="text-muted-foreground">
                            Gerencie as unidades de negócio cadastradas no seu ecossistema
                        </p>
                    </div>
                    <Button
                        onClick={() => {
                            setEditingCompany(null);
                            setIsDialogOpen(true);
                        }}
                        className="w-full bg-green-600 shadow-md hover:bg-green-700 sm:w-auto"
                    >
                        <Plus className="mr-2 h-4 w-4 font-bold" />
                        Nova Empresa
                    </Button>
                </div>

                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent className="max-w-7xl p-0 border-none shadow-2xl overflow-hidden flex flex-col h-[92vh] max-h-[950px] w-[98vw] md:w-full">
                        <DialogTitle className="sr-only">Formulário de Empresa</DialogTitle>
                        <DialogDescription className="sr-only">
                            Preencha os dados abaixo para cadastrar ou editar uma unidade de negócio.
                        </DialogDescription>
                        <CompanyForm
                            key={editingCompany?.id || 'new'}
                            companyId={editingCompany?.id}
                            onSuccess={handleSuccess}
                            onCancel={() => setIsDialogOpen(false)}
                        />
                    </DialogContent>
                </Dialog>

                <Card className={companiesSurfaceCardClass}>
                    <CardHeader className={companiesCardHeaderClass}>
                        <CardTitle className="flex items-center gap-3 text-2xl font-black tracking-tight text-white">
                            <div className="rounded-lg bg-green-500/15 p-2">
                                <Building2 className="h-6 w-6 text-green-300" />
                            </div>
                            Minhas Unidades de Negócio
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="bg-[#123754] p-0">
                        {isLoading ? (
                            <div className="py-20 text-center text-white/60">
                                <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-green-400 border-t-transparent"></div>
                                <p className="font-bold text-white/75">Sincronizando empresas...</p>
                            </div>
                        ) : companiesError ? (
                            <div className="flex flex-col items-center gap-4 py-20 text-center text-white/60">
                                <Building2 className="h-16 w-16 text-white/15" />
                                <p className="text-lg font-medium text-white/80">Não foi possível carregar as empresas.</p>
                                <Button onClick={() => window.location.reload()} variant="outline" className="border-white/20 bg-white/5 font-bold text-white hover:bg-white/10 hover:text-white">
                                    Tentar novamente
                                </Button>
                            </div>
                        ) : !companies || companies.length === 0 ? (
                            <div className="flex flex-col items-center gap-4 py-20 text-center text-white/60">
                                <Building2 className="h-16 w-16 text-white/15" />
                                <p className="text-lg font-medium text-white/80">Nenhuma empresa encontrada.</p>
                                <Button onClick={() => setIsDialogOpen(true)} variant="outline" className="border-white/20 bg-white/5 font-bold text-white hover:bg-white/10 hover:text-white">Cadastrar Minha Primeira Empresa</Button>
                            </div>
                        ) : (
                            <div className="w-full overflow-x-auto">
                                <Table className="w-full min-w-[1050px] bg-[#123754] text-white" containerClassName={companiesTableContainerClass}>
                                    <TableHeader className={companiesTableHeaderClass}>
                                        <TableRow className={companiesTableHeaderRowClass}>
                                            <TableHead className="p-6 text-xs font-black uppercase text-slate-900">Nome / Razão Social</TableHead>
                                            <TableHead className="text-xs font-black uppercase text-slate-900">Documento</TableHead>
                                            <TableHead className="text-xs font-black uppercase text-slate-900">E-mail de Contato</TableHead>
                                            <TableHead className="text-xs font-black uppercase text-slate-900">Localização</TableHead>
                                            <TableHead className="w-[130px] text-center text-xs font-black uppercase text-slate-900">Plano de Contas</TableHead>
                                            <TableHead className="w-[170px] text-center text-xs font-black uppercase text-slate-900">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {pagedCompanies.map((company) => (
                                            <TableRow key={company.id} className={companiesTableBodyRowClass}>
                                                <TableCell className="p-4">
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="text-[13px] font-semibold leading-tight text-white transition-colors group-hover:text-green-200 md:text-sm">{company.razao_social}</span>
                                                        <span className="text-[10px] font-medium uppercase tracking-wide text-white/45">{company.nome_fantasia || "-"}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="border-white/15 bg-white/10 font-mono text-[11px] text-white/85">
                                                        {formatCompanyDocument(company)}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="text-sm font-medium text-white/75">{company.email || "-"}</span>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                                        <span className="text-sm font-bold text-white/85">{company.endereco_cidade || "-"}</span>
                                                        <span className="text-xs font-black uppercase text-white/40">{company.endereco_estado || ""}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="w-[130px] text-center">
                                                    {companiesWithCharts.has(company.id) ? (
                                                        <span
                                                            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-green-300/35 bg-green-400/15 text-green-200"
                                                            title="Plano de contas configurado"
                                                            aria-label="Plano de contas configurado"
                                                        >
                                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                                        </span>
                                                    ) : (
                                                        <span
                                                            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white/45"
                                                            title="Plano de contas não configurado"
                                                            aria-label="Plano de contas não configurado"
                                                        >
                                                            <CircleOff className="h-3.5 w-3.5" />
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="w-[170px] text-center whitespace-nowrap">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleEdit(company)}
                                                            className="h-11 w-11 rounded-xl border border-white/10 text-white/80 transition-all hover:bg-green-500/15 hover:text-green-200"
                                                            title="Editar empresa"
                                                        >
                                                            <Pencil className="h-5 w-5" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleDelete(company)}
                                                            className="h-11 w-11 rounded-xl border border-white/10 text-white/80 transition-all hover:bg-red-500/15 hover:text-red-200"
                                                            title="Excluir empresa"
                                                        >
                                                            <Trash2 className="h-5 w-5" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        )}
                        {!isLoading && (companies?.length ?? 0) > COMPANIES_PAGE_SIZE && (
                            <div className={companiesFooterClass}>
                                <span className="text-xs text-white/65">
                                    Página {companiesPage} de {companiesTotalPages} ({companies?.length ?? 0} empresas)
                                </span>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                                        disabled={companiesPage <= 1}
                                        onClick={() => setCompaniesPage((prev) => Math.max(1, prev - 1))}
                                    >
                                        Anterior
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
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
