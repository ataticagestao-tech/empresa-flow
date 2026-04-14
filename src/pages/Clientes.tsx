import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import {
    Plus, Search, Pencil, Trash2, Bell, ShoppingCart,
    Receipt, DollarSign, Stethoscope, FileText, StickyNote,
    CreditCard, Package,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { ClientSheet } from "@/components/clients/ClientSheet";
import { TabContracts } from "@/modules/clients/presentation/partials/TabContracts";
import { LinkCRToContract } from "@/modules/clients/presentation/components/LinkCRToContract";
import { ContratosKpiCard } from "@/modules/clients/presentation/components/ContratosKpiCard";
import { hasContratosByCompany } from "@/config/features";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/components/ui/use-toast";
import { useSearchParams, useNavigate } from "react-router-dom";
import { logDeletion } from "@/lib/audit";
import { formatBRL, toTitleCase, getIniciais, formatDoc, formatData } from "@/lib/format";
import { maskPhone } from "@/utils/masks";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Dialog, DialogContent,
} from "@/components/ui/dialog";

/* ─── Tipos de filtro ──────────────────────────────────────── */

type FilterTab = "todos" | "ativos" | "inadimplentes" | "inativos";
type DetailTab = "historico" | "dados" | "anotacoes" | "contratos";

/* ─── Interfaces ───────────────────────────────────────────── */

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
    ultimaCompra: string | null;
    totalComprado: number;
    totalCompras: number;
}

/* ─── Helpers de dias ──────────────────────────────────────── */

const diasAtras = (data: string | null): string => {
    if (!data) return "";
    const diff = Math.floor((Date.now() - new Date(data).getTime()) / 86400000);
    if (diff === 0) return "hoje";
    if (diff === 1) return "há 1 dia";
    return `há ${diff} dias`;
};

const diasAtraso = (data: string | null): string => {
    if (!data) return "";
    const diff = Math.floor((Date.now() - new Date(data).getTime()) / 86400000);
    if (diff <= 0) return "";
    if (diff === 1) return "1 dia em atraso";
    return `${diff} dias em atraso`;
};

/* ─── Badge de status ──────────────────────────────────────── */

const StatusBadge = ({ status }: { status: string }) => {
    const estilos: Record<string, string> = {
        inadimplente: "text-[#8b0000] border-[#8b0000] bg-[#fdecea]",
        ativo:        "text-[#0a5c2e] border-[#0a5c2e] bg-[#e6f4ec]",
        inativo:      "text-[#666] border-[#aaa] bg-[#f5f5f5]",
    };
    const labels: Record<string, string> = {
        inadimplente: "Inadimplente",
        ativo:        "Ativo",
        inativo:      "Inativo",
    };
    return (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border border-[1.5px] whitespace-nowrap ${estilos[status] ?? estilos.inativo}`}>
            {labels[status] ?? status}
        </span>
    );
};

/* ─── Badge de CR status ───────────────────────────────────── */

const CRStatusBadge = ({ status }: { status: string }) => {
    const map: Record<string, string> = {
        pago:          "text-[#0a5c2e] border-[#0a5c2e] bg-[#e6f4ec]",
        vencido:       "text-[#8b0000] border-[#8b0000] bg-[#fdecea]",
        parcial:       "text-[#5c3a00] border-[#b8960a] bg-[#fffbe6]",
        aberto:        "text-[#1a2e4a] border-[#1a2e4a] bg-[#f0f4f8]",
        em_andamento:  "text-[#1a2e4a] border-[#1a2e4a] bg-[#f0f4f8]",
        cancelado:     "text-[#555] border-[#aaa] bg-[#f5f5f5]",
    };
    const labels: Record<string, string> = {
        pago: "Pago", vencido: "Vencido", parcial: "Parcial",
        aberto: "Aberto", em_andamento: "Em andamento", cancelado: "Cancelado",
    };
    return (
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border border-[1.5px] whitespace-nowrap ${map[status] ?? map.aberto}`}>
            {labels[status] ?? status}
        </span>
    );
};

/* ─── Icone do historico ───────────────────────────────────── */

const HistoryIcon = ({ status }: { status: string }) => {
    if (status === "pago") return (
        <div className="w-9 h-9 rounded-full bg-[#e6f4ec] flex items-center justify-center flex-shrink-0">
            <DollarSign className="h-4 w-4 text-[#0a5c2e]" />
        </div>
    );
    if (status === "vencido") return (
        <div className="w-9 h-9 rounded-full bg-[#fdecea] flex items-center justify-center flex-shrink-0">
            <Receipt className="h-4 w-4 text-[#8b0000]" />
        </div>
    );
    return (
        <div className="w-9 h-9 rounded-full bg-[#f0f4f8] flex items-center justify-center flex-shrink-0">
            <ShoppingCart className="h-4 w-4 text-[#1a2e4a]" />
        </div>
    );
};

/* ─── Componente principal ─────────────────────────────────── */

export default function Clientes() {
    const { selectedCompany } = useCompany();
    const { activeClient, isUsingSecondary, user } = useAuth();
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [editingClient, setEditingClient] = useState<any>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [filterTab, setFilterTab] = useState<FilterTab>("todos");
    const [selectedClient, setSelectedClient] = useState<any>(null);
    const [detailFinancial, setDetailFinancial] = useState<DetailFinancial | null>(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailTab, setDetailTab] = useState<DetailTab>("historico");
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
                .select("id, pagador_nome, pagador_cpf_cnpj, valor, valor_pago, data_vencimento, data_pagamento, status, observacoes, forma_recebimento")
                .eq("company_id", selectedCompany.id)
                .limit(5000);
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
                .eq("company_id", selectedCompany.id)
                .limit(5000);
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

    /* ─── Status derivado ──────────────────────────────────── */

    const getClientStatus = (client: any): string => {
        if (client.status === "inativo") return "inativo";
        const fin = getClientFinancial(client);
        if (fin.totalReceberVencido > 0) return "inadimplente";
        return "ativo";
    };

    /* ─── Busca financeiro detalhado ───────────────────────── */

    const buscarFinanceiroCliente = async (cliente: any) => {
        if (!selectedCompany?.id) return;
        setDetailLoading(true);

        const docLimpo = (cliente.cpf_cnpj ?? "").replace(/\D/g, "");
        const docValido = docLimpo.length > 0 && !/^0+$/.test(docLimpo);

        let query = activeClient
            .from("contas_receber")
            .select("id, valor, valor_pago, status, data_vencimento, data_pagamento, forma_recebimento, observacoes, venda_id, conta_contabil_id, categoria:chart_of_accounts(name, code)")
            .eq("company_id", selectedCompany.id)
            .is("deleted_at", null)
            .order("data_vencimento", { ascending: false });

        if (docValido) {
            query = query.eq("pagador_cpf_cnpj", cliente.cpf_cnpj!);
        } else {
            query = query.ilike("pagador_nome", `%${cliente.razao_social.trim()}%`);
        }

        const { data, error } = await query;

        if (error) {
            console.error("[buscarFinanceiroCliente]", error.message);
            setDetailFinancial({ crs: [], aReceber: 0, vencido: 0, totalPago: 0, pagosNoPrazo: 0, totalPagos: 0, ultimaCompra: null, totalComprado: 0, totalCompras: 0 });
            setDetailLoading(false);
            return;
        }

        const lista = data ?? [];

        // Busca conta bancaria de quitacao via movimentacoes (se houver)
        const pagosIds = lista.filter(cr => cr.status === "pago" || (cr.valor_pago ?? 0) > 0).map(cr => cr.id);
        const bankByCr: Record<string, string> = {};
        if (pagosIds.length > 0) {
            const { data: movs } = await activeClient
                .from("movimentacoes")
                .select("conta_receber_id, conta_bancaria:bank_accounts(name)")
                .in("conta_receber_id", pagosIds)
                .eq("tipo", "credito");
            (movs || []).forEach((m: any) => {
                if (m.conta_receber_id && m.conta_bancaria?.name) {
                    bankByCr[m.conta_receber_id] = m.conta_bancaria.name;
                }
            });
        }

        const listaEnriquecida = lista.map((cr: any) => ({
            ...cr,
            bank_account_name: bankByCr[cr.id] || null,
        }));

        const aReceber = listaEnriquecida
            .filter(cr => !["pago", "cancelado"].includes(cr.status))
            .reduce((acc, cr) => acc + (Number(cr.valor ?? 0) - Number(cr.valor_pago ?? 0)), 0);

        const vencido = lista
            .filter(cr =>
                cr.status === "vencido" ||
                (!["pago", "cancelado"].includes(cr.status) &&
                    cr.data_vencimento != null &&
                    new Date(cr.data_vencimento) < new Date())
            )
            .reduce((acc, cr) => acc + (Number(cr.valor ?? 0) - Number(cr.valor_pago ?? 0)), 0);

        const pagos = listaEnriquecida.filter(cr => cr.status === "pago");
        const totalPago = pagos.reduce((acc, cr) => acc + Number(cr.valor_pago ?? 0), 0);

        const pagosNoPrazo = pagos.filter(cr =>
            cr.data_pagamento != null &&
            cr.data_vencimento != null &&
            new Date(cr.data_pagamento) <= new Date(cr.data_vencimento)
        ).length;

        const totalComprado = listaEnriquecida.reduce((acc, cr) => acc + Number(cr.valor ?? 0), 0);

        const sortedByDate = [...listaEnriquecida].sort((a, b) =>
            (b.data_vencimento ?? "").localeCompare(a.data_vencimento ?? "")
        );
        const ultimaCompra = sortedByDate[0]?.data_vencimento ?? null;

        setDetailFinancial({
            crs: listaEnriquecida,
            aReceber,
            vencido,
            totalPago,
            pagosNoPrazo,
            totalPagos: pagos.length,
            ultimaCompra,
            totalComprado,
            totalCompras: lista.length,
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

    const handleSelectClient = (client: any) => {
        setSelectedClient(client);
        setDetailFinancial(null);
        setDetailTab("historico");
        buscarFinanceiroCliente(client);
    };

    const handleDelete = async (client: any) => {
        const ok = window.confirm(`Excluir o cliente "${client.razao_social}"?`);
        if (!ok) return;
        const { error } = await activeClient.from("clients").delete().eq("id", client.id);
        if (!error) {
            refetch();
            toast({ title: "Sucesso", description: "Cliente excluído" });
            if (selectedClient?.id === client.id) setSelectedClient(null);
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

    /* ─── Filtros ───────────────────────────────────────────── */

    const filteredClients = useMemo(() => {
        let list = clients ?? [];

        // Busca textual
        const needle = normalizeSearch(searchTerm);
        if (needle) {
            list = list.filter((client: any) =>
                normalizeSearch(
                    [client.razao_social, client.nome_fantasia, client.cpf_cnpj, client.email,
                     client.telefone, client.celular, client.category?.name].filter(Boolean).join(" ")
                ).includes(needle)
            );
        }

        // Filtro por aba
        if (filterTab !== "todos") {
            list = list.filter((client: any) => {
                const status = getClientStatus(client);
                if (filterTab === "ativos") return status === "ativo";
                if (filterTab === "inadimplentes") return status === "inadimplente";
                if (filterTab === "inativos") return status === "inativo";
                return true;
            });
        }

        return list;
    }, [clients, searchTerm, filterTab, financialByClient]);

    /* ─── Contagens por aba ─────────────────────────────────── */

    const tabCounts = useMemo(() => {
        const all = clients ?? [];
        let ativos = 0, inadimplentes = 0, inativos = 0;
        all.forEach((c: any) => {
            const s = getClientStatus(c);
            if (s === "ativo") ativos++;
            else if (s === "inadimplente") inadimplentes++;
            else if (s === "inativo") inativos++;
        });
        return { todos: all.length, ativos, inadimplentes, inativos };
    }, [clients, financialByClient]);

    /* ─── Pontualidade ──────────────────────────────────────── */

    const pontualidade = useMemo(() => {
        if (!detailFinancial || detailFinancial.totalPagos === 0) return null;
        return Math.round((detailFinancial.pagosNoPrazo / detailFinancial.totalPagos) * 100);
    }, [detailFinancial]);

    /* ─── Descricao do CR para historico ────────────────────── */

    const crDescription = (cr: any) => {
        const obs = cr.observacoes ?? "";
        if (obs.trim()) return obs;
        if (cr.forma_recebimento) return `Pagamento — ${cr.forma_recebimento}`;
        return "Conta a receber";
    };

    const formaPagamentoLabel = (v: string | null | undefined): string | null => {
        if (!v) return null;
        const map: Record<string, string> = {
            cartao_credito: "Cartão de crédito",
            cartao_debito: "Cartão de débito",
            pix: "PIX",
            boleto: "Boleto",
            dinheiro: "Dinheiro",
            transferencia: "Transferência",
            parcelado: "Parcelado",
            misto: "Misto",
            reserva: "Reserva de data",
        };
        return map[v] || v;
    };

    const crSubtext = (cr: any) => {
        const today = new Date();
        const venc = cr.data_vencimento ? new Date(cr.data_vencimento) : null;

        const parts: string[] = [];

        // Data (vencimento/pagamento com contexto)
        if (cr.status === "pago" && cr.data_pagamento) {
            parts.push(`Pago ${formatData(cr.data_pagamento)}`);
        } else if (cr.status === "vencido" || (venc && venc < today && cr.status !== "pago" && cr.status !== "cancelado")) {
            parts.push(`Venceu ${formatData(cr.data_vencimento)} · ${diasAtraso(cr.data_vencimento)}`);
        } else if (cr.status === "parcial") {
            parts.push(`Parcial · vence ${formatData(cr.data_vencimento)}`);
        } else {
            parts.push(`Vence ${formatData(cr.data_vencimento)}`);
        }

        // Forma de pagamento
        const forma = formaPagamentoLabel(cr.forma_recebimento);
        if (forma) parts.push(forma);

        // Categoria (conta contábil)
        const categoria = cr.categoria?.name;
        if (categoria) parts.push(categoria);

        // Conta bancária (se quitado via movimentacao)
        if (cr.bank_account_name) parts.push(cr.bank_account_name);

        return parts.join(" · ");
    };

    const getCRDisplayStatus = (cr: any) => {
        const today = new Date();
        const venc = cr.data_vencimento ? new Date(cr.data_vencimento) : null;
        if (cr.status === "pago") return "pago";
        if (cr.status === "vencido" || (venc && venc < today && cr.status !== "cancelado")) return "vencido";
        if (cr.status === "parcial") return "em_andamento";
        return "aberto";
    };

    /* ─── Render ────────────────────────────────────────────── */

    const tabs: { key: FilterTab; label: string }[] = [
        { key: "todos", label: "Todos" },
        { key: "ativos", label: "Ativos" },
        { key: "inadimplentes", label: "Inadimp." },
        { key: "inativos", label: "Inativos" },
    ];

    return (
        <AppLayout title="Clientes">
            <div className="flex h-[calc(100vh-80px)] gap-0 animate-in fade-in duration-500">

                {/* ═══ PAINEL ESQUERDO — Lista ═══ */}
                <div className="w-full md:w-[420px] lg:w-[440px] flex-shrink-0 border-r border-[#e5e7eb] bg-white flex flex-col">

                    {/* Header */}
                    <div className="px-5 pt-5 pb-3 flex items-center justify-between">
                        <h2 className="text-lg font-bold tracking-tight text-[#0a0a0a] uppercase">Clientes</h2>
                        <Button onClick={handleNew} size="sm" className="bg-[#1a2e4a] hover:bg-[#243d5f] text-white">
                            <Plus className="h-3.5 w-3.5 mr-1" />
                            Novo cliente
                        </Button>
                    </div>

                    {/* Busca */}
                    <div className="px-5 pb-3">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#999] pointer-events-none" />
                            <Input
                                placeholder="Buscar por nome, CPF/CNPJ..."
                                className="pl-9 h-10 text-[13px] border-[#ddd] rounded-lg bg-[#fafafa] focus:bg-white"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* Tabs de filtro */}
                    <div className="px-5 pb-3 flex gap-1">
                        {tabs.map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setFilterTab(tab.key)}
                                className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all ${
                                    filterTab === tab.key
                                        ? "bg-[#1a2e4a] text-white"
                                        : "bg-[#f0f0f0] text-[#555] hover:bg-[#e0e0e0]"
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Lista de clientes */}
                    <ScrollArea className="flex-1">
                        <div className="px-3 pb-3">
                            {!selectedCompany?.id ? (
                                <div className="py-12 text-center text-[13px] text-[#999]">
                                    Selecione uma empresa para visualizar os clientes.
                                </div>
                            ) : isLoading ? (
                                <div className="py-12 flex items-center justify-center text-[#999]">
                                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#1a2e4a] border-t-transparent mr-2" />
                                    Carregando...
                                </div>
                            ) : filteredClients.length === 0 ? (
                                <div className="py-12 text-center text-[13px] text-[#999]">
                                    Nenhum cliente encontrado.
                                </div>
                            ) : (
                                filteredClients.map((client: any) => {
                                    const fin = getClientFinancial(client);
                                    const status = getClientStatus(client);
                                    const isSelected = selectedClient?.id === client.id;
                                    const hasOpen = fin.totalReceberAberto > 0;
                                    const hasOverdue = fin.totalReceberVencido > 0;

                                    return (
                                        <div
                                            key={client.id}
                                            onClick={() => handleSelectClient(client)}
                                            className={`flex items-center gap-3 px-3 py-3.5 rounded-xl cursor-pointer transition-all mb-0.5 ${
                                                isSelected
                                                    ? "bg-[#1a2e4a]/5 border-l-[3px] border-l-[#1a2e4a]"
                                                    : "hover:bg-[#f8f9fa] border-l-[3px] border-l-transparent"
                                            }`}
                                        >
                                            {/* Avatar */}
                                            <div className={`w-10 h-10 rounded-full text-white text-[12px] font-bold flex items-center justify-center flex-shrink-0 ${
                                                status === "inadimplente" ? "bg-[#8b0000]"
                                                : status === "inativo" ? "bg-[#999]"
                                                : "bg-[#1a2e4a]"
                                            }`}>
                                                {getIniciais(client.razao_social)}
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-[13px] font-semibold text-[#0a0a0a] truncate">
                                                        {toTitleCase(client.razao_social)}
                                                    </span>
                                                    {hasOverdue && (
                                                        <span className="text-[12px] font-bold text-[#8b0000] whitespace-nowrap">
                                                            {formatBRL(fin.totalReceberVencido)} em aberto
                                                        </span>
                                                    )}
                                                    {!hasOverdue && hasOpen && (
                                                        <span className="text-[12px] font-bold text-[#1a2e4a] whitespace-nowrap">
                                                            {formatBRL(fin.totalReceberAberto)} a receber
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="flex items-center justify-between gap-2 mt-1">
                                                    <span className="text-[12px] text-[#888]">
                                                        {client.cpf_cnpj ? (formatDoc(client.cpf_cnpj).length > 14 ? "CNPJ: " : "CPF: ") : ""}
                                                        {formatDoc(client.cpf_cnpj)}
                                                    </span>
                                                    <StatusBadge status={status} />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </ScrollArea>
                </div>

                {/* ═══ PAINEL DIREITO — Detalhe ═══ */}
                <div className="hidden md:flex flex-1 flex-col bg-[#fafbfc] overflow-hidden">
                    {!selectedClient ? (
                        <div className="flex-1 flex items-center justify-center">
                            <div className="text-center">
                                <div className="w-16 h-16 rounded-full bg-[#e8ecf0] flex items-center justify-center mx-auto mb-4">
                                    <Search className="h-7 w-7 text-[#aab4be]" />
                                </div>
                                <p className="text-[14px] text-[#888] font-medium">Selecione um cliente para ver os detalhes</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Header do cliente */}
                            <div className="bg-white border-b border-[#e5e7eb] px-6 py-5">
                                <div className="flex items-start justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className={`w-12 h-12 rounded-full text-white text-[14px] font-bold flex items-center justify-center flex-shrink-0 ${
                                            getClientStatus(selectedClient) === "inadimplente" ? "bg-[#8b0000]"
                                            : getClientStatus(selectedClient) === "inativo" ? "bg-[#999]"
                                            : "bg-[#1a2e4a]"
                                        }`}>
                                            {getIniciais(selectedClient.razao_social)}
                                        </div>
                                        <div>
                                            <h3 className="text-[17px] font-bold text-[#0a0a0a]">
                                                {toTitleCase(selectedClient.razao_social)}
                                            </h3>
                                            <div className="text-[12px] text-[#888] mt-0.5 space-y-0.5">
                                                <div>
                                                    {formatDoc(selectedClient.cpf_cnpj).length > 14 ? "CNPJ: " : "CPF: "}
                                                    {formatDoc(selectedClient.cpf_cnpj)}
                                                </div>
                                                {selectedClient.email && (
                                                    <div>{selectedClient.email}</div>
                                                )}
                                                {(selectedClient.celular || selectedClient.telefone) && (
                                                    <div>{maskPhone(selectedClient.celular || selectedClient.telefone)}</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleEdit(selectedClient)}
                                            className="text-[12px] border-[#ddd]"
                                        >
                                            <Pencil className="h-3 w-3 mr-1.5" />
                                            Editar
                                        </Button>
                                        <Button
                                            size="sm"
                                            onClick={() => navigate(`/vendas?cliente=${selectedClient.id}`)}
                                            className="text-[12px] bg-[#1a2e4a] hover:bg-[#243d5f]"
                                        >
                                            <Plus className="h-3 w-3 mr-1.5" />
                                            Nova venda
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* KPIs do cliente */}
                            <div className={`grid gap-3 px-6 py-4 bg-white border-b border-[#e5e7eb] ${
                                hasContratosByCompany(selectedCompany) ? "grid-cols-5" : "grid-cols-4"
                            }`}>
                                <div className="border border-[#e5e7eb] rounded-lg overflow-hidden">
                                    <div className="bg-[#1a2e4a] px-3 py-1.5">
                                        <span className="text-[9px] font-bold text-white uppercase tracking-widest">Total Comprado</span>
                                    </div>
                                    <div className="px-3 py-2.5 bg-white">
                                        <div className="text-[17px] font-bold text-[#0a0a0a]">
                                            {detailLoading ? "..." : formatBRL(detailFinancial?.totalComprado ?? 0)}
                                        </div>
                                        <div className="text-[10px] text-[#888] mt-0.5">
                                            {detailLoading ? "" : `${detailFinancial?.totalCompras ?? 0} compras`}
                                        </div>
                                    </div>
                                </div>
                                <div className="border border-[#e5e7eb] rounded-lg overflow-hidden">
                                    <div className="bg-[#1a2e4a] px-3 py-1.5">
                                        <span className="text-[9px] font-bold text-white uppercase tracking-widest">Em Aberto</span>
                                    </div>
                                    <div className="px-3 py-2.5 bg-white">
                                        <div className={`text-[17px] font-bold ${(detailFinancial?.aReceber ?? 0) > 0 ? "text-[#8b0000]" : "text-[#0a5c2e]"}`}>
                                            {detailLoading ? "..." : formatBRL(detailFinancial?.aReceber ?? 0)}
                                        </div>
                                        <div className="text-[10px] text-[#888] mt-0.5">
                                            {detailLoading ? "" : detailFinancial?.vencido && detailFinancial.vencido > 0
                                                ? `${detailFinancial.crs.filter((cr: any) => getCRDisplayStatus(cr) === "vencido").length} título${detailFinancial.crs.filter((cr: any) => getCRDisplayStatus(cr) === "vencido").length > 1 ? "s" : ""} vencido${detailFinancial.crs.filter((cr: any) => getCRDisplayStatus(cr) === "vencido").length > 1 ? "s" : ""}`
                                                : "em dia"
                                            }
                                        </div>
                                    </div>
                                </div>
                                <div className="border border-[#e5e7eb] rounded-lg overflow-hidden">
                                    <div className="bg-[#1a2e4a] px-3 py-1.5">
                                        <span className="text-[9px] font-bold text-white uppercase tracking-widest">Última Compra</span>
                                    </div>
                                    <div className="px-3 py-2.5 bg-white">
                                        <div className="text-[17px] font-bold text-[#0a0a0a]">
                                            {detailLoading ? "..." : detailFinancial?.ultimaCompra ? formatData(detailFinancial.ultimaCompra) : "—"}
                                        </div>
                                        <div className="text-[10px] text-[#888] mt-0.5">
                                            {detailLoading ? "" : detailFinancial?.ultimaCompra ? diasAtras(detailFinancial.ultimaCompra) : ""}
                                        </div>
                                    </div>
                                </div>
                                <div className="border border-[#e5e7eb] rounded-lg overflow-hidden">
                                    <div className="bg-[#1a2e4a] px-3 py-1.5">
                                        <span className="text-[9px] font-bold text-white uppercase tracking-widest">Pontualidade</span>
                                    </div>
                                    <div className="px-3 py-2.5 bg-white">
                                        <div className={`text-[17px] font-bold ${
                                            pontualidade === null ? "text-[#888]"
                                            : pontualidade >= 80 ? "text-[#0a5c2e]"
                                            : pontualidade >= 50 ? "text-[#b8960a]"
                                            : "text-[#8b0000]"
                                        }`}>
                                            {detailLoading ? "..." : pontualidade !== null ? `${pontualidade}%` : "—"}
                                        </div>
                                        <div className="text-[10px] text-[#888] mt-0.5">
                                            {detailLoading ? "" : detailFinancial ? `${detailFinancial.pagosNoPrazo} de ${detailFinancial.totalPagos}` : ""}
                                        </div>
                                    </div>
                                </div>
                                {hasContratosByCompany(selectedCompany) && (
                                    <ContratosKpiCard
                                        clientCpfCnpj={selectedClient?.cpf_cnpj}
                                        loading={detailLoading}
                                    />
                                )}
                            </div>

                            {/* Tabs do detalhe */}
                            <div className="flex border-b border-[#e5e7eb] bg-white px-6">
                                {([
                                    { key: "historico" as DetailTab, label: "Histórico financeiro" },
                                    { key: "dados" as DetailTab, label: "Dados cadastrais" },
                                    ...(hasContratosByCompany(selectedCompany)
                                        ? [{ key: "contratos" as DetailTab, label: "Contratos" }]
                                        : []),
                                    { key: "anotacoes" as DetailTab, label: "Anotações" },
                                ]).map(tab => (
                                    <button
                                        key={tab.key}
                                        onClick={() => setDetailTab(tab.key)}
                                        className={`px-4 py-3 text-[13px] font-medium border-b-2 transition-all ${
                                            detailTab === tab.key
                                                ? "border-[#1a2e4a] text-[#1a2e4a]"
                                                : "border-transparent text-[#888] hover:text-[#555]"
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Conteúdo das tabs */}
                            <ScrollArea className="flex-1">
                                {detailTab === "historico" && (
                                    <div className="p-6">
                                        {detailLoading ? (
                                            <div className="flex items-center justify-center py-12 text-[#999]">
                                                <div className="animate-spin rounded-full h-5 w-5 border-2 border-[#1a2e4a] border-t-transparent mr-2" />
                                                Carregando...
                                            </div>
                                        ) : detailFinancial && detailFinancial.crs.length > 0 ? (
                                            <div className="space-y-1">
                                                {detailFinancial.crs.map((cr: any) => {
                                                    const displayStatus = getCRDisplayStatus(cr);
                                                    return (
                                                        <div
                                                            key={cr.id}
                                                            className="flex items-center gap-3.5 px-4 py-3.5 rounded-xl hover:bg-white transition-all border border-transparent hover:border-[#e5e7eb]"
                                                        >
                                                            <HistoryIcon status={displayStatus} />
                                                            <div className="flex-1 min-w-0">
                                                                <div className="text-[13px] font-semibold text-[#0a0a0a] truncate">
                                                                    {crDescription(cr)}
                                                                </div>
                                                                <div className="text-[12px] text-[#888] mt-0.5">
                                                                    {crSubtext(cr)}
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                                {hasContratosByCompany(selectedCompany) && (
                                                                    <LinkCRToContract
                                                                        crId={cr.id}
                                                                        crVendaId={cr.venda_id ?? null}
                                                                        clientCpfCnpj={selectedClient?.cpf_cnpj}
                                                                        onChanged={() => buscarFinanceiroCliente(selectedClient)}
                                                                    />
                                                                )}
                                                                <CRStatusBadge status={displayStatus} />
                                                                <span className="text-[12px] font-semibold text-[#0a0a0a] min-w-[80px] text-right">
                                                                    {formatBRL(Number(cr.valor ?? 0))}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    onClick={async () => {
                                                                        const valorPago = Number(cr.valor_pago ?? 0);
                                                                        const isPago = cr.status === "pago" || valorPago > 0;

                                                                        const msg = isPago
                                                                            ? `Excluir este lançamento PAGO?\n\n${crDescription(cr)}\nValor pago: ${formatBRL(valorPago)}\n\n⚠ ATENÇÃO: o pagamento bancário continua registrado no banco — mas volta como PENDENTE DE CONCILIAÇÃO.\n\nVocê deve reclassificá-lo depois em Conciliação Bancária, vinculando ao cliente e categoria corretos.\n\nDeseja continuar?`
                                                                            : `Excluir este lançamento?\n\n${crDescription(cr)}\nValor: ${formatBRL(Number(cr.valor ?? 0))}`;

                                                                        if (!confirm(msg)) return;

                                                                        const ac = activeClient as any;

                                                                        // 1. Soft-delete da CR
                                                                        const { error: crErr } = await ac
                                                                            .from("contas_receber")
                                                                            .update({ deleted_at: new Date().toISOString() })
                                                                            .eq("id", cr.id);
                                                                        if (crErr) {
                                                                            toast({ title: "Erro ao excluir", description: crErr.message, variant: "destructive" });
                                                                            return;
                                                                        }

                                                                        // 2. Se pago, orfã as movimentacoes vinculadas (dinheiro permanece no banco)
                                                                        if (isPago) {
                                                                            const { error: movErr } = await ac
                                                                                .from("movimentacoes")
                                                                                .update({
                                                                                    conta_receber_id: null,
                                                                                    status_conciliacao: "pendente",
                                                                                })
                                                                                .eq("conta_receber_id", cr.id);
                                                                            if (movErr) {
                                                                                console.error("[excluir CR] erro ao orfanizar movimentacao:", movErr);
                                                                            }
                                                                        }

                                                                        toast({
                                                                            title: "Lançamento excluído",
                                                                            description: isPago
                                                                                ? "Pagamento disponível em Conciliação Bancária para reclassificação"
                                                                                : undefined,
                                                                        });
                                                                        buscarFinanceiroCliente(selectedClient);
                                                                    }}
                                                                    className="p-1 rounded text-[#999] hover:text-[#8b0000] hover:bg-[#fdecea] transition-colors cursor-pointer"
                                                                    title="Excluir lançamento"
                                                                >
                                                                    <Trash2 className="h-3.5 w-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="py-12 text-center text-[13px] text-[#999]">
                                                Nenhum registro financeiro encontrado.
                                            </div>
                                        )}

                                        {/* Botão régua de cobrança */}
                                        {detailFinancial && detailFinancial.vencido > 0 && (
                                            <div className="mt-4">
                                                <Button
                                                    variant="outline"
                                                    className="w-full border-amber-200 text-amber-700 hover:bg-amber-50"
                                                    onClick={() => navigate("/regua-cobranca")}
                                                >
                                                    <Bell className="h-4 w-4 mr-2" />
                                                    Configurar Régua de Cobrança
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {detailTab === "dados" && (
                                    <div className="p-6 space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            {([
                                                { label: "Razão Social", value: selectedClient.razao_social },
                                                { label: "Nome Fantasia", value: selectedClient.nome_fantasia },
                                                { label: "CPF/CNPJ", value: formatDoc(selectedClient.cpf_cnpj) },
                                                { label: "Email", value: selectedClient.email },
                                                { label: "Telefone", value: selectedClient.telefone ? maskPhone(selectedClient.telefone) : null },
                                                { label: "Celular", value: selectedClient.celular ? maskPhone(selectedClient.celular) : null },
                                                { label: "Endereço", value: [selectedClient.endereco, selectedClient.cidade, selectedClient.estado].filter(Boolean).join(", ") || null },
                                                { label: "CEP", value: selectedClient.cep },
                                                { label: "Categoria", value: selectedClient.category?.name },
                                                { label: "Observações", value: selectedClient.observacoes },
                                            ]).map((item, i) => (
                                                <div key={i} className="bg-white rounded-lg border border-[#e5e7eb] p-3.5">
                                                    <div className="text-[10px] font-semibold text-[#888] uppercase tracking-wider mb-1">
                                                        {item.label}
                                                    </div>
                                                    <div className="text-[13px] text-[#0a0a0a]">
                                                        {item.value || "—"}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="flex gap-2 pt-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleEdit(selectedClient)}
                                                className="text-[12px]"
                                            >
                                                <Pencil className="h-3 w-3 mr-1.5" />
                                                Editar dados
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleDelete(selectedClient)}
                                                className="text-[12px] text-[#EF4444] border-[#fca5a5] hover:bg-[#fef2f2]"
                                            >
                                                <Trash2 className="h-3 w-3 mr-1.5" />
                                                Excluir
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {detailTab === "contratos" && hasContratosByCompany(selectedCompany) && (
                                    <div className="p-6">
                                        <TabContracts
                                            clientId={selectedClient.id}
                                            clientName={selectedClient.razao_social || selectedClient.nome_fantasia}
                                            clientCpfCnpj={selectedClient.cpf_cnpj}
                                        />
                                    </div>
                                )}

                                {detailTab === "anotacoes" && (
                                    <div className="p-6">
                                        <div className="py-12 text-center">
                                            <StickyNote className="h-8 w-8 text-[#ccc] mx-auto mb-3" />
                                            <p className="text-[13px] text-[#999]">
                                                Nenhuma anotação registrada para este cliente.
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </ScrollArea>
                        </>
                    )}
                </div>

                {/* ═══ ClientSheet (novo/editar) ═══ */}
                <ClientSheet
                    isOpen={isSheetOpen}
                    onClose={() => { setIsSheetOpen(false); setEditingClient(null); }}
                    clientToEdit={editingClient}
                />
            </div>
        </AppLayout>
    );
}
