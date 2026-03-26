import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import {
    Plus, Search, Pencil, Trash2, MoreHorizontal, Bell, Eye,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ClientSheet } from "@/components/clients/ClientSheet";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/components/ui/use-toast";
import { useSearchParams, useNavigate } from "react-router-dom";
import { logDeletion } from "@/lib/audit";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem,
    DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog, DialogContent,
} from "@/components/ui/dialog";
import { formatBRL, toTitleCase, getIniciais, formatDoc, formatData } from "@/lib/format";
import { maskPhone } from "@/utils/masks";

/* ─── Componentes visuais inline ────────────────────────────── */

const StatusClienteBadge = ({ status }: { status: string }) => {
    const estilos: Record<string, string> = {
        inadimplente: 'text-[#8b0000] border-[#8b0000] bg-[#fdecea]',
        ativo:        'text-[#1a2e4a] border-[#1a2e4a] bg-[#f0f4f8]',
        em_dia:       'text-[#0a5c2e] border-[#0a5c2e] bg-[#e6f4ec]',
        inativo:      'text-[#555]    border-[#aaa]    bg-[#f5f5f5]',
    };
    const labels: Record<string, string> = {
        inadimplente: 'Inadimplente',
        ativo:        'Em aberto',
        em_dia:       'Em dia',
        inativo:      'Inativo',
    };
    return (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border border-[1.5px] whitespace-nowrap ${estilos[status] ?? estilos.inativo}`}>
            {labels[status] ?? status}
        </span>
    );
};

const PontualidadeBadge = ({ pagosNoPrazo, totalPagos }: { pagosNoPrazo: number; totalPagos: number }) => {
    if (totalPagos === 0) {
        return <span className="text-[11px] text-[#555]">—</span>;
    }
    const pct = Math.round((pagosNoPrazo / totalPagos) * 100);
    const estilo =
        pct >= 80
            ? 'text-[#0a5c2e] border-[#0a5c2e] bg-[#e6f4ec]'
            : pct >= 50
            ? 'text-[#5c3a00] border-[#b8960a] bg-[#fffbe6]'
            : 'text-[#8b0000] border-[#8b0000] bg-[#fdecea]';
    return (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border border-[1.5px] ${estilo}`}>
            {pct}% no prazo
        </span>
    );
};

const KPICard = ({ label, valor, sub }: { label: string; valor: string | number; sub: string }) => (
    <div className="border border-[#ccc] rounded-lg overflow-hidden">
        <div className="bg-[#1a2e4a] px-3.5 py-2">
            <span className="text-[10px] font-bold text-white uppercase tracking-widest">{label}</span>
        </div>
        <div className="px-3.5 py-3 bg-white">
            <div className="text-xl font-bold text-[#0a0a0a] tracking-tight">{valor}</div>
            <div className="text-[11px] text-[#555] mt-0.5">{sub}</div>
        </div>
    </div>
);

const crStatusBadge = (status: string) => {
    const map: Record<string, string> = {
        pago:      'text-[#0a5c2e] border-[#0a5c2e] bg-[#e6f4ec]',
        vencido:   'text-[#8b0000] border-[#8b0000] bg-[#fdecea]',
        parcial:   'text-[#5c3a00] border-[#b8960a] bg-[#fffbe6]',
        aberto:    'text-[#1a2e4a] border-[#1a2e4a] bg-[#f0f4f8]',
        cancelado: 'text-[#555] border-[#aaa] bg-[#f5f5f5]',
    };
    const labels: Record<string, string> = {
        pago: 'Pago', vencido: 'Vencido', parcial: 'Parcial', aberto: 'Aberto', cancelado: 'Cancelado',
    };
    return (
        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border border-[1.5px] whitespace-nowrap ${map[status] ?? map.aberto}`}>
            {labels[status] ?? status}
        </span>
    );
};

/* ─── Interfaces ────────────────────────────────────────────── */

interface FinancialSummary {
    totalReceber: number;
    totalReceberAberto: number;
    totalReceberVencido: number;
    totalPagar: number;
    totalPagarAberto: number;
    countReceber: number;
    countPagar: number;
    receivables: any[];
    payables: any[];
}

interface DetailFinancial {
    crs: any[];
    aReceber: number;
    vencido: number;
    totalPago: number;
    pagosNoPrazo: number;
    totalPagos: number;
}

/* ─── Componente principal ──────────────────────────────────── */

export default function Clientes() {
    const { selectedCompany } = useCompany();
    const { activeClient, isUsingSecondary, user } = useAuth();
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [editingClient, setEditingClient] = useState<any>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [detailClient, setDetailClient] = useState<any>(null);
    const [detailFinancial, setDetailFinancial] = useState<DetailFinancial | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const { toast } = useToast();
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();

    const normalizeSearch = (value: unknown) =>
        String(value ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    /* ─── Queries ───────────────────────────────────────────── */

    const { data: clients, isLoading, refetch } = useQuery({
        queryKey: ["clients", selectedCompany?.id, isUsingSecondary],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await activeClient
                .from("clients")
                .select("*, category:client_categories(name)")
                .eq("company_id", selectedCompany.id)
                .order("razao_social");
            if (error) throw error;
            return data;
        },
        enabled: !!selectedCompany?.id,
    });

    const { data: receivables } = useQuery({
        queryKey: ["clients_receivables", selectedCompany?.id],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await activeClient
                .from("contas_receber")
                .select("id, pagador_nome, pagador_cpf_cnpj, valor, valor_pago, data_vencimento, data_pagamento, status")
                .eq("company_id", selectedCompany.id);
            if (error) throw error;
            return data || [];
        },
        enabled: !!selectedCompany?.id,
    });

    const { data: payables } = useQuery({
        queryKey: ["clients_payables", selectedCompany?.id],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await activeClient
                .from("contas_pagar")
                .select("id, credor_nome, credor_cpf_cnpj, valor, valor_pago, data_vencimento, status")
                .eq("company_id", selectedCompany.id);
            if (error) throw error;
            return data || [];
        },
        enabled: !!selectedCompany?.id,
    });

    /* ─── Mapa financeiro por cliente ───────────────────────── */

    const financialByClient = useMemo(() => {
        const map = new Map<string, FinancialSummary>();

        const getKey = (client: any) => {
            if (client.cpf_cnpj) return client.cpf_cnpj.replace(/\D/g, "");
            return normalizeSearch(client.razao_social);
        };

        clients?.forEach((c: any) => {
            const key = getKey(c);
            if (!map.has(key)) {
                map.set(key, {
                    totalReceber: 0, totalReceberAberto: 0, totalReceberVencido: 0,
                    totalPagar: 0, totalPagarAberto: 0,
                    countReceber: 0, countPagar: 0,
                    receivables: [], payables: [],
                });
            }
        });

        const today = new Date().toISOString().split("T")[0];

        receivables?.forEach((r: any) => {
            const doc = r.pagador_cpf_cnpj?.replace(/\D/g, "");
            const nameKey = normalizeSearch(r.pagador_nome);
            const key = doc || nameKey;

            let found = map.get(key);
            if (!found && doc) {
                for (const [k, v] of map.entries()) {
                    if (k === doc || k === nameKey) { found = v; break; }
                }
            }
            if (!found) {
                found = {
                    totalReceber: 0, totalReceberAberto: 0, totalReceberVencido: 0,
                    totalPagar: 0, totalPagarAberto: 0,
                    countReceber: 0, countPagar: 0,
                    receivables: [], payables: [],
                };
                map.set(key, found);
            }

            const valor = Number(r.valor || 0);
            found.totalReceber += valor;
            found.countReceber++;
            found.receivables.push(r);
            if (r.status === "aberto" || r.status === "parcial") {
                found.totalReceberAberto += valor - Number(r.valor_pago || 0);
            }
            if ((r.status === "aberto" || r.status === "vencido") && r.data_vencimento < today) {
                found.totalReceberVencido += valor - Number(r.valor_pago || 0);
            }
        });

        payables?.forEach((p: any) => {
            const doc = p.credor_cpf_cnpj?.replace(/\D/g, "");
            const nameKey = normalizeSearch(p.credor_nome);
            const key = doc || nameKey;

            let found = map.get(key);
            if (!found && doc) {
                for (const [k, v] of map.entries()) {
                    if (k === doc || k === nameKey) { found = v; break; }
                }
            }
            if (!found) {
                found = {
                    totalReceber: 0, totalReceberAberto: 0, totalReceberVencido: 0,
                    totalPagar: 0, totalPagarAberto: 0,
                    countReceber: 0, countPagar: 0,
                    receivables: [], payables: [],
                };
                map.set(key, found);
            }

            const valor = Number(p.valor || 0);
            found.totalPagar += valor;
            found.countPagar++;
            found.payables.push(p);
            if (p.status === "aberto" || p.status === "parcial") {
                found.totalPagarAberto += valor - Number(p.valor_pago || 0);
            }
        });

        return map;
    }, [clients, receivables, payables]);

    const getClientFinancial = (client: any): FinancialSummary => {
        const doc = client.cpf_cnpj?.replace(/\D/g, "");
        const nameKey = normalizeSearch(client.razao_social);
        return financialByClient.get(doc || nameKey) || financialByClient.get(nameKey) || {
            totalReceber: 0, totalReceberAberto: 0, totalReceberVencido: 0,
            totalPagar: 0, totalPagarAberto: 0,
            countReceber: 0, countPagar: 0,
            receivables: [], payables: [],
        };
    };

    /* ─── Totais KPI ────────────────────────────────────────── */

    const totals = useMemo(() => {
        let totalReceberAberto = 0;
        let totalVencido = 0;
        let clientesInadimplentes = 0;

        clients?.forEach((c: any) => {
            const fin = getClientFinancial(c);
            totalReceberAberto += fin.totalReceberAberto;
            totalVencido += fin.totalReceberVencido;
            if (fin.totalReceberVencido > 0) clientesInadimplentes++;
        });

        return { totalReceberAberto, totalVencido, clientesInadimplentes };
    }, [clients, financialByClient]);

    /* ─── Status derivado do cliente ────────────────────────── */

    const getClientStatus = (client: any): string => {
        const fin = getClientFinancial(client);
        if (fin.totalReceberVencido > 0) return 'inadimplente';
        if (fin.totalReceberAberto > 0) return 'ativo';
        return 'em_dia';
    };

    /* ─── Busca financeiro detalhado (modal) ────────────────── */

    const buscarFinanceiroCliente = async (cliente: any) => {
        if (!selectedCompany?.id) return;
        setDetailLoading(true);

        const docLimpo = (cliente.cpf_cnpj ?? '').replace(/\D/g, '');
        const docValido = docLimpo.length > 0 && !/^0+$/.test(docLimpo);

        let query = activeClient
            .from('contas_receber')
            .select('id, valor, valor_pago, status, data_vencimento, data_pagamento, forma_recebimento, observacoes')
            .eq('company_id', selectedCompany.id)
            .order('data_vencimento', { ascending: false });

        if (docValido) {
            query = query.eq('pagador_cpf_cnpj', cliente.cpf_cnpj!);
        } else {
            query = query.ilike('pagador_nome', `%${cliente.razao_social.trim()}%`);
        }

        const { data, error } = await query;

        if (error) {
            console.error('[buscarFinanceiroCliente]', error.message);
            setDetailFinancial({ crs: [], aReceber: 0, vencido: 0, totalPago: 0, pagosNoPrazo: 0, totalPagos: 0 });
            setDetailLoading(false);
            return;
        }

        const lista = data ?? [];

        const aReceber = lista
            .filter(cr => !['pago', 'cancelado'].includes(cr.status))
            .reduce((acc, cr) => acc + (Number(cr.valor ?? 0) - Number(cr.valor_pago ?? 0)), 0);

        const vencido = lista
            .filter(cr =>
                cr.status === 'vencido' ||
                (!['pago', 'cancelado'].includes(cr.status) &&
                    cr.data_vencimento != null &&
                    new Date(cr.data_vencimento) < new Date())
            )
            .reduce((acc, cr) => acc + (Number(cr.valor ?? 0) - Number(cr.valor_pago ?? 0)), 0);

        const pagos = lista.filter(cr => cr.status === 'pago');
        const totalPago = pagos.reduce((acc, cr) => acc + Number(cr.valor_pago ?? 0), 0);

        const pagosNoPrazo = pagos.filter(cr =>
            cr.data_pagamento != null &&
            cr.data_vencimento != null &&
            new Date(cr.data_pagamento) <= new Date(cr.data_vencimento)
        ).length;

        setDetailFinancial({
            crs: lista,
            aReceber,
            vencido,
            totalPago,
            pagosNoPrazo,
            totalPagos: pagos.length,
        });
        setDetailLoading(false);
    };

    /* ─── Handlers ──────────────────────────────────────────── */

    useEffect(() => {
        if (searchParams.get("new") === "true") {
            handleNew();
            const newParams = new URLSearchParams(searchParams);
            newParams.delete("new");
            setSearchParams(newParams);
        }
    }, [searchParams, setSearchParams]);

    const handleEdit = (client: any) => { setEditingClient(client); setIsSheetOpen(true); };
    const handleNew = () => { setEditingClient(null); setIsSheetOpen(true); };

    const handleOpenDetail = (client: any) => {
        setDetailClient(client);
        setDetailFinancial(null);
        buscarFinanceiroCliente(client);
    };

    const handleDelete = async (client: any) => {
        const ok = window.confirm(`Excluir o cliente "${client.razao_social}"?`);
        if (!ok) return;
        const { error } = await activeClient.from("clients").delete().eq("id", client.id);
        if (!error) {
            refetch();
            toast({ title: "Sucesso", description: "Cliente excluído" });
            if (user?.id) {
                await logDeletion(activeClient, {
                    userId: user.id, companyId: selectedCompany?.id || null,
                    entity: "clients", entityId: client.id,
                    payload: { razao_social: client.razao_social },
                });
            }
        } else {
            toast({ title: "Erro", description: "Erro ao excluir", variant: "destructive" });
        }
    };

    /* ─── Filtro de busca ───────────────────────────────────── */

    const filteredClients = clients?.filter((client) => {
        const needle = normalizeSearch(searchTerm);
        if (!needle) return true;
        return normalizeSearch(
            [client.razao_social, client.nome_fantasia, client.cpf_cnpj, client.email,
             client.telefone, client.celular, client.category?.name].filter(Boolean).join(" ")
        ).includes(needle);
    });

    /* ─── Render ────────────────────────────────────────────── */

    return (
        <AppLayout title="Clientes">
            <div className="space-y-6 animate-in fade-in duration-500">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h2 className="text-lg font-bold tracking-tight text-foreground">Clientes</h2>
                        <p className="text-[12.5px] text-muted-foreground mt-0.5">
                            Base de clientes com resumo financeiro de contas a pagar e receber.
                        </p>
                    </div>
                    <Button onClick={handleNew}>
                        <Plus className="h-3.5 w-3.5" />
                        Novo Cliente
                    </Button>
                </div>

                {/* KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                    <KPICard label="Total clientes" valor={clients?.length || 0} sub="cadastrados" />
                    <KPICard label="A receber (aberto)" valor={formatBRL(totals.totalReceberAberto)} sub="em aberto" />
                    <KPICard label="Vencido" valor={formatBRL(totals.totalVencido)} sub="em atraso" />
                    <KPICard label="Inadimplentes" valor={totals.clientesInadimplentes} sub="clientes" />
                </div>

                {/* Table */}
                <Card>
                    <CardHeader className="flex flex-col sm:flex-row items-center justify-between space-y-4 sm:space-y-0 border-b border-[#F1F5F9]">
                        <div className="text-[12.5px] font-medium text-muted-foreground">
                            Total de {filteredClients?.length || 0} clientes
                        </div>
                        <div className="relative w-full sm:w-72">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                            <Input placeholder="Buscar clientes..." className="pl-8 h-8 text-[12.5px]"
                                value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent">
                                    <TableHead className="w-[50px]"></TableHead>
                                    <TableHead>Razão Social / Nome</TableHead>
                                    <TableHead>CPF/CNPJ</TableHead>
                                    <TableHead>Contato</TableHead>
                                    <TableHead className="text-right">A Receber</TableHead>
                                    <TableHead className="text-right">A Pagar</TableHead>
                                    <TableHead className="text-center">Status</TableHead>
                                    <TableHead className="w-[60px] text-right"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {!selectedCompany?.id ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                                            Selecione uma empresa para visualizar os clientes.
                                        </TableCell>
                                    </TableRow>
                                ) : isLoading ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="h-24 text-center">
                                            <div className="flex items-center justify-center text-muted-foreground">
                                                <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent mr-2" />
                                                Carregando...
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : filteredClients?.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                                            Nenhum cliente encontrado.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    filteredClients?.map((client) => {
                                        const fin = getClientFinancial(client);
                                        const hasOverdue = fin.totalReceberVencido > 0;
                                        const clientStatus = getClientStatus(client);
                                        return (
                                            <TableRow key={client.id} className="group">
                                                <TableCell>
                                                    <div className="w-8 h-8 rounded-full bg-[#1a2e4a] text-white text-[11px] font-bold flex items-center justify-center flex-shrink-0">
                                                        {getIniciais(client.razao_social)}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-[13px] font-semibold text-[#0a0a0a]">
                                                        {toTitleCase(client.razao_social)}
                                                    </div>
                                                    {client.nome_fantasia && (
                                                        <div className="text-[11px] text-muted-foreground mt-0.5">
                                                            {toTitleCase(client.nome_fantasia)}
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-[12px] text-[#555]">
                                                    {formatDoc(client.cpf_cnpj)}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex flex-col text-[12.5px] text-foreground">
                                                        <span>{client.email || "—"}</span>
                                                        <span className="text-[11px] text-muted-foreground">
                                                            {client.celular ? maskPhone(client.celular) : (client.telefone ? maskPhone(client.telefone) : "")}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {fin.totalReceberAberto > 0 ? (
                                                        <span className="text-[12px] font-medium text-[#1a2e4a]">
                                                            {formatBRL(fin.totalReceberAberto)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[11px] text-muted-foreground">—</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {fin.totalPagarAberto > 0 ? (
                                                        <span className="text-[12px] font-medium text-orange-600">
                                                            {formatBRL(fin.totalPagarAberto)}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[11px] text-muted-foreground">—</span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <StatusClienteBadge status={clientStatus} />
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                <span className="sr-only">Abrir menu</span>
                                                                <MoreHorizontal className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuLabel>Ações</DropdownMenuLabel>
                                                            <DropdownMenuItem onClick={() => handleOpenDetail(client)}>
                                                                <Eye className="mr-2 h-4 w-4 text-muted-foreground" />
                                                                Ver Financeiro
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onClick={() => handleEdit(client)}>
                                                                <Pencil className="mr-2 h-4 w-4 text-muted-foreground" />
                                                                Editar
                                                            </DropdownMenuItem>
                                                            {hasOverdue && (
                                                                <DropdownMenuItem onClick={() => navigate("/regua-cobranca")}>
                                                                    <Bell className="mr-2 h-4 w-4 text-amber-500" />
                                                                    Régua de Cobrança
                                                                </DropdownMenuItem>
                                                            )}
                                                            <DropdownMenuSeparator />
                                                            <DropdownMenuItem onClick={() => handleDelete(client)} className="text-[#EF4444]">
                                                                <Trash2 className="mr-2 h-4 w-4" />
                                                                Excluir
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                {/* ─── Modal Ver Financeiro ──────────────────────── */}
                <Dialog open={!!detailClient} onOpenChange={(open) => { if (!open) { setDetailClient(null); setDetailFinancial(null); } }}>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto p-0">
                        {detailClient && (
                            <>
                                {/* Cabeçalho azul marinho */}
                                <div className="bg-[#1a2e4a] px-5 py-4 flex items-center justify-between rounded-t-lg">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-full bg-white/20 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">
                                            {getIniciais(detailClient.razao_social)}
                                        </div>
                                        <div>
                                            <div className="text-[15px] font-bold text-white leading-tight">
                                                {toTitleCase(detailClient.razao_social)}
                                            </div>
                                            <div className="text-[11px] text-[#a8bfd4] mt-0.5">
                                                {formatDoc(detailClient.cpf_cnpj)}
                                                {detailClient.telefone ? ` · ${maskPhone(detailClient.telefone)}` : ''}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {detailLoading ? (
                                    <div className="flex items-center justify-center py-12 text-muted-foreground">
                                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-primary border-t-transparent mr-2" />
                                        Carregando...
                                    </div>
                                ) : detailFinancial ? (
                                    <>
                                        {/* KPIs do modal */}
                                        <div className="grid grid-cols-3 gap-2.5 p-4 border-b border-[#eee]">
                                            {([
                                                { label: 'A receber', valor: detailFinancial.aReceber, cor: detailFinancial.aReceber > 0 ? '#1a2e4a' : '#555' },
                                                { label: 'Vencido', valor: detailFinancial.vencido, cor: detailFinancial.vencido > 0 ? '#8b0000' : '#0a5c2e' },
                                                { label: 'Total pago', valor: detailFinancial.totalPago, cor: '#0a5c2e' },
                                            ] as const).map(kpi => (
                                                <div key={kpi.label} className="border border-[#ccc] rounded-lg overflow-hidden">
                                                    <div className="bg-[#1a2e4a] px-3 py-1.5">
                                                        <span className="text-[10px] font-bold text-white uppercase tracking-wider">
                                                            {kpi.label}
                                                        </span>
                                                    </div>
                                                    <div className="px-3 py-2.5 bg-white">
                                                        <div className="text-lg font-bold leading-tight" style={{ color: kpi.cor }}>
                                                            {formatBRL(kpi.valor)}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Cabeçalho CRs + pontualidade */}
                                        <div className="px-4 py-2.5 flex items-center justify-between border-b border-[#eee]">
                                            <span className="text-[11px] font-semibold text-[#555]">
                                                Contas a Receber ({detailFinancial.crs.length})
                                            </span>
                                            <PontualidadeBadge pagosNoPrazo={detailFinancial.pagosNoPrazo} totalPagos={detailFinancial.totalPagos} />
                                        </div>

                                        {/* Lista de CRs */}
                                        {detailFinancial.crs.length > 0 ? (
                                            <div className="px-4 pb-4">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow className="hover:bg-transparent">
                                                            <TableHead className="text-[11px]">Vencimento</TableHead>
                                                            <TableHead className="text-[11px] text-right">Valor</TableHead>
                                                            <TableHead className="text-[11px] text-right">Pago</TableHead>
                                                            <TableHead className="text-[11px] text-center">Status</TableHead>
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {detailFinancial.crs.map((cr: any) => (
                                                            <TableRow key={cr.id}>
                                                                <TableCell className="text-[11.5px]">
                                                                    {formatData(cr.data_vencimento)}
                                                                </TableCell>
                                                                <TableCell className="text-[11.5px] text-right font-medium">
                                                                    {formatBRL(Number(cr.valor || 0))}
                                                                </TableCell>
                                                                <TableCell className="text-[11.5px] text-right">
                                                                    {formatBRL(Number(cr.valor_pago || 0))}
                                                                </TableCell>
                                                                <TableCell className="text-center">
                                                                    {crStatusBadge(cr.status)}
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        ) : (
                                            <div className="px-4 py-8 text-center text-[12px] text-muted-foreground">
                                                Nenhuma conta a receber encontrada para este cliente.
                                            </div>
                                        )}

                                        {/* Botão régua */}
                                        {detailFinancial.vencido > 0 && (
                                            <div className="px-4 pb-4">
                                                <Button
                                                    variant="outline"
                                                    className="w-full border-amber-200 text-amber-700 hover:bg-amber-50"
                                                    onClick={() => { setDetailClient(null); navigate("/regua-cobranca"); }}
                                                >
                                                    <Bell className="h-4 w-4 mr-2" />
                                                    Configurar Régua de Cobrança
                                                </Button>
                                            </div>
                                        )}
                                    </>
                                ) : null}
                            </>
                        )}
                    </DialogContent>
                </Dialog>

                <ClientSheet
                    isOpen={isSheetOpen}
                    onClose={() => { setIsSheetOpen(false); setEditingClient(null); }}
                    clientToEdit={editingClient}
                />
            </div>
        </AppLayout>
    );
}
