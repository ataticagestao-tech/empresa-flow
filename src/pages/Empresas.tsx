import { useState, useEffect } from "react";
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
import { Plus, Pencil, Trash2, Building2, ListTree } from "lucide-react";
import { useCompanies } from "@/hooks/useCompanies";
import { Company } from "@/types/company";
import { maskCNPJ } from "@/utils/masks";
import { CompanyForm } from "@/modules/companies/presentation/CompanyForm";

export default function Empresas() {
    const { user, activeClient } = useAuth();
    const { companies, isLoading, error: companiesError, deleteCompany, refetch: refetchCompanies } = useCompanies(user?.id);

    // UI State
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingCompany, setEditingCompany] = useState<Company | null>(null);
    const [companiesWithCharts, setCompaniesWithCharts] = useState<Set<string>>(new Set());

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

    return (
        <AppLayout title="Empresas">
            <div className="w-full space-y-6 animate-fade-in">
                <div className="flex justify-between items-center">
                    <div>
                        <h2 className="text-lg font-bold tracking-tight text-foreground">Empresas</h2>
                        <p className="text-muted-foreground">
                            Gerencie as unidades de negócio cadastradas no seu ecossistema
                        </p>
                    </div>
                    <Button
                        onClick={() => {
                            setEditingCompany(null);
                            setIsDialogOpen(true);
                        }}
                        className="bg-green-600 hover:bg-green-700 shadow-md"
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

                <Card className="w-full border-none shadow-xl rounded-xl overflow-hidden bg-white">
                    <CardHeader className="bg-[#F8FAFC] border-b p-6">
                        <CardTitle className="flex items-center gap-3 text-2xl font-black text-foreground tracking-tight">
                            <div className="p-2 bg-green-100 rounded-lg">
                                <Building2 className="h-6 w-6 text-green-600" />
                            </div>
                            Minhas Unidades de Negócio
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        {isLoading ? (
                            <div className="text-center py-20 text-muted-foreground">
                                <div className="animate-spin h-10 w-10 border-4 border-green-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                                <p className="font-bold text-muted-foreground">Sincronizando empresas...</p>
                            </div>
                        ) : companiesError ? (
                            <div className="text-center py-20 text-muted-foreground flex flex-col items-center gap-4">
                                <Building2 className="h-16 w-16 text-slate-100" />
                                <p className="text-lg font-medium">Não foi possível carregar as empresas.</p>
                                <Button onClick={() => window.location.reload()} variant="outline" className="border-green-600 text-green-700 hover:bg-green-50 font-bold">
                                    Tentar novamente
                                </Button>
                            </div>
                        ) : !companies || companies.length === 0 ? (
                            <div className="text-center py-20 text-muted-foreground flex flex-col items-center gap-4">
                                <Building2 className="h-16 w-16 text-slate-100" />
                                <p className="text-lg font-medium">Nenhuma empresa encontrada.</p>
                                <Button onClick={() => setIsDialogOpen(true)} variant="outline" className="border-green-600 text-green-700 hover:bg-green-50 font-bold">Cadastrar Minha Primeira Empresa</Button>
                            </div>
                        ) : (
                            <div className="w-full overflow-x-auto">
                                <Table>
                                    <TableHeader className="bg-[#F8FAFC]">
                                        <TableRow className="border-b border-[#F1F5F9]">
                                            <TableHead className="font-black text-muted-foreground text-xs uppercase p-6">Nome / Razão Social</TableHead>
                                            <TableHead className="font-black text-muted-foreground text-xs uppercase hidden md:table-cell">Documento</TableHead>
                                            <TableHead className="font-black text-muted-foreground text-xs uppercase hidden lg:table-cell">E-mail de Contato</TableHead>
                                            <TableHead className="font-black text-muted-foreground text-xs uppercase hidden xl:table-cell">Localização</TableHead>
                                            <TableHead className="font-black text-muted-foreground text-xs uppercase hidden lg:table-cell text-center">Plano de Contas</TableHead>
                                            <TableHead className="font-black text-muted-foreground text-xs uppercase text-center">Ações</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {companies.map((company) => (
                                            <TableRow key={company.id} className="group hover:bg-[#F8FAFC]/80 transition-all border-b border-[#F8FAFC]">
                                                <TableCell className="p-6">
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="font-bold text-foreground text-lg leading-tight group-hover:text-green-700 transition-colors">{company.razao_social}</span>
                                                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{company.nome_fantasia || "-"}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="hidden md:table-cell">
                                                    <Badge variant="outline" className="font-mono text-[11px] bg-[#F8FAFC] text-muted-foreground border-[#E2E8F0]">
                                                        {company.cnpj ? maskCNPJ(company.cnpj) : "N/D"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="hidden lg:table-cell">
                                                    <span className="text-sm text-muted-foreground font-medium">{company.email || "-"}</span>
                                                </TableCell>
                                                <TableCell className="hidden xl:table-cell">
                                                    <div className="flex items-center gap-1.5">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                                        <span className="text-sm text-muted-foreground font-bold">{company.endereco_cidade || "-"}</span>
                                                        <span className="text-xs text-muted-foreground font-black uppercase">{company.endereco_estado || ""}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="hidden lg:table-cell text-center">
                                                    {companiesWithCharts.has(company.id) ? (
                                                        <Badge className="bg-green-100 text-green-700 border-green-200 gap-1.5 font-bold">
                                                            <ListTree className="w-3 h-3" />
                                                            Configurado
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="text-muted-foreground border-[#E2E8F0] font-bold">
                                                            Não configurado
                                                        </Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleEdit(company)}
                                                        className="w-10 h-10 rounded-xl hover:bg-green-50 hover:text-green-600 transition-all"
                                                    >
                                                        <Pencil className="h-5 w-5" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleDelete(company)}
                                                        className="w-10 h-10 rounded-xl hover:bg-red-50 hover:text-red-600 transition-all"
                                                    >
                                                        <Trash2 className="h-5 w-5" />
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
