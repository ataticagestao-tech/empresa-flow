import { useEffect, useMemo, useRef, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, Check, Landmark, Search, TrendingUp, X } from "lucide-react";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { maskCNPJ, maskCPF, unmask } from "@/utils/masks";

export default function Relatorios() {
    const { selectedCompany } = useCompany();
    const { activeClient, isUsingSecondary } = useAuth();
    const queryClient = useQueryClient();
    const [dateRange, setDateRange] = useState({
        start: format(startOfMonth(new Date()), "yyyy-MM-dd"),
        end: format(endOfMonth(new Date()), "yyyy-MM-dd"),
    });
    const [resultsOpen, setResultsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedSearch, setSelectedSearch] = useState<
        | { kind: "client"; id: string; label: string; doc?: string | null; account?: string | null }
        | { kind: "supplier"; id: string; label: string; doc?: string | null; account?: string | null }
        | { kind: "product"; id: string; label: string; code?: string | null }
        | { kind: "term"; label: string }
        | null
    >(null);

    const formatCurrency = (value: number) =>
        new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

    const normalizeSearch = (value: unknown) =>
        String(value ?? "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();

    const selectedSearchKey = useMemo(() => {
        if (!selectedSearch) return null;
        if (selectedSearch.kind === "term") return `term:${selectedSearch.label}`;
        return `${selectedSearch.kind}:${selectedSearch.id}`;
    }, [selectedSearch]);

    const lastAutoSelectedDocRef = useRef<string | null>(null);
    const typedDigits = useMemo(() => unmask(searchTerm), [searchTerm]);
    const isDocOnlyInput = useMemo(() => {
        if (selectedSearch) return false;
        if (/[a-zA-Z]/.test(searchTerm)) return false;
        return typedDigits.length === 11 || typedDigits.length === 14;
    }, [searchTerm, selectedSearch, typedDigits.length]);

    const selectedSearchDisplay = useMemo(() => {
        if (!selectedSearch) return "";
        if (selectedSearch.kind === "product") {
            return [selectedSearch.label, selectedSearch.code ? `(${selectedSearch.code})` : ""].filter(Boolean).join(" ");
        }
        if (selectedSearch.kind === "client" || selectedSearch.kind === "supplier") {
            const docDigits = unmask(String(selectedSearch.doc || ""));
            const docMasked = docDigits
                ? (docDigits.length > 11 ? maskCNPJ(docDigits) : maskCPF(docDigits))
                : "";
            const meta = [docMasked, selectedSearch.account].filter(Boolean).join(" • ");
            return [selectedSearch.label, meta ? `(${meta})` : ""].filter(Boolean).join(" ");
        }
        return selectedSearch.label;
    }, [selectedSearch]);

    const selectedSearchKindLabel = useMemo(() => {
        if (!selectedSearch) return "";
        if (selectedSearch.kind === "client") return "Cliente";
        if (selectedSearch.kind === "supplier") return "Fornecedor";
        if (selectedSearch.kind === "product") return "Produto";
        if (selectedSearch.kind === "term") return "Texto";
        return "";
    }, [selectedSearch]);

    useEffect(() => {
        const stateRaw = sessionStorage.getItem("relatorios_state");
        if (!stateRaw) return;
        try {
            const parsed = JSON.parse(stateRaw) as any;
            if (parsed?.dateRange?.start && parsed?.dateRange?.end) {
                setDateRange({
                    start: String(parsed.dateRange.start),
                    end: String(parsed.dateRange.end),
                });
            }
            if (parsed?.selectedSearch?.kind) {
                setSelectedSearch(parsed.selectedSearch);
            }
        } catch {
            return;
        }
    }, []);

    useEffect(() => {
        sessionStorage.setItem(
            "relatorios_state",
            JSON.stringify({
                dateRange,
                selectedSearch,
            }),
        );
    }, [dateRange, selectedSearch]);

    useEffect(() => {
        const el = document.getElementById("app-scroll-container");
        if (!el) return;

        const key = "scroll:/relatorios";
        const saved = sessionStorage.getItem(key);
        if (saved) {
            const next = Number(saved);
            if (Number.isFinite(next)) {
                requestAnimationFrame(() => {
                    el.scrollTop = next;
                });
            }
        }

        return () => {
            sessionStorage.setItem(key, String(el.scrollTop || 0));
        };
    }, []);

    useEffect(() => {
        if (!selectedCompany?.id) return;

        const companyId = selectedCompany.id;
        const channel = activeClient
            .channel(`reports-${companyId}`)
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "transactions", filter: `company_id=eq.${companyId}` },
                () => {
                    queryClient.invalidateQueries({ queryKey: ["reports_transactions"] });
                },
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "accounts_receivable", filter: `company_id=eq.${companyId}` },
                () => {
                    queryClient.invalidateQueries({ queryKey: ["dfc_summary"] });
                    queryClient.invalidateQueries({ queryKey: ["reports_arap"] });
                },
            )
            .on(
                "postgres_changes",
                { event: "*", schema: "public", table: "accounts_payable", filter: `company_id=eq.${companyId}` },
                () => {
                    queryClient.invalidateQueries({ queryKey: ["reports_arap"] });
                },
            )
            .subscribe();

        return () => {
            activeClient.removeChannel(channel);
        };
    }, [activeClient, queryClient, selectedCompany?.id, isUsingSecondary]);

    type ReportTransaction = {
        date: string;
        type: "credit" | "debit";
        amount: number;
        category?: { name: string; type?: string } | null;
    };

    const { data: transactions, isLoading } = useQuery({
        queryKey: ["reports_transactions", selectedCompany?.id, dateRange, isUsingSecondary],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];

            const { data, error } = await (activeClient as any)
                .from("movimentacoes")
                .select(
                    `
                    data,
                    tipo,
                    valor,
                    category:chart_of_accounts(name,account_type)
                `,
                )
                .eq("company_id", selectedCompany.id)
                .gte("data", dateRange.start)
                .lte("data", dateRange.end)
                .order("data", { ascending: true })
                .order("created_at", { ascending: true })
                .limit(5000);

            if (error) throw error;
            return (data || []).map((t: any) => ({
                date: t.data,
                type: t.tipo === "credito" ? "credit" : "debit",
                amount: Number(t.valor || 0),
                category: t.category ? { name: t.category.name, type: t.category.account_type } : null,
            })) as ReportTransaction[];
        },
        enabled: !!selectedCompany?.id,
    });

    // DFC mensal: últimos 12 meses (independente do filtro de data)
    const dfc12mRange = useMemo(() => {
        const now = new Date();
        return {
            start: format(startOfMonth(subMonths(now, 11)), "yyyy-MM-dd"),
            end: format(endOfMonth(now), "yyyy-MM-dd"),
        };
    }, []);

    const { data: dfcMonthlyTransactions } = useQuery({
        queryKey: ["dfc_monthly_transactions", selectedCompany?.id, isUsingSecondary, dfc12mRange],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];

            const { data, error } = await (activeClient as any)
                .from("movimentacoes")
                .select("data, tipo, valor")
                .eq("company_id", selectedCompany.id)
                .gte("data", dfc12mRange.start)
                .lte("data", dfc12mRange.end)
                .order("data", { ascending: true })
                .limit(10000);

            if (error) throw error;
            return (data || []).map((t: any) => ({
                date: t.data as string,
                type: t.tipo === "credito" ? "credit" : "debit",
                amount: Number(t.valor || 0),
            }));
        },
        enabled: !!selectedCompany?.id,
    });

    const dfcMonthlyBucketed = useMemo(() => {
        const rows = dfcMonthlyTransactions ?? [];
        const map = new Map<string, { key: string; label: string; entradas: number; saidas: number; liquido: number; acumulado: number }>();

        for (const t of rows) {
            const key = t.date.slice(0, 7);
            const label = format(new Date(`${key}-01`), "MM/yyyy");
            const prev = map.get(key) ?? { key, label, entradas: 0, saidas: 0, liquido: 0, acumulado: 0 };
            if (t.type === "credit") prev.entradas += t.amount;
            if (t.type === "debit") prev.saidas -= t.amount;
            prev.liquido = prev.entradas + prev.saidas;
            map.set(key, prev);
        }

        const sorted = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
        let running = 0;
        for (const item of sorted) {
            running += item.liquido;
            item.acumulado = running;
        }
        return sorted;
    }, [dfcMonthlyTransactions]);

    const { data: globalSearchResults, isLoading: isSearching } = useQuery({
        queryKey: ["reports_search", selectedCompany?.id, isUsingSecondary, searchTerm],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const raw = searchTerm.replace(/[,()]/g, " ").trim();
            if (raw.length < 2) return [];

            const digits = unmask(raw);
            const isDocQuery = digits.length === 11 || digits.length === 14;
            const companyId = selectedCompany.id;
            const like = (v: string) => `%${v}%`;

            const [clientsRes, suppliersRes, productsRes] = await Promise.all([
                (activeClient as any)
                    .from("clients")
                    .select("id, razao_social, nome_fantasia, cpf_cnpj, dados_bancarios_conta, dados_bancarios_pix")
                    .eq("company_id", companyId)
                    .or(
                        [
                            `razao_social.ilike.${like(raw)}`,
                            `nome_fantasia.ilike.${like(raw)}`,
                            `cpf_cnpj.ilike.${like(digits || raw)}`,
                            digits ? `dados_bancarios_conta.ilike.${like(digits)}` : null,
                            `dados_bancarios_pix.ilike.${like(raw)}`,
                        ]
                            .filter(Boolean)
                            .join(","),
                    )
                    .limit(8),
                (activeClient as any)
                    .from("suppliers")
                    .select("id, razao_social, nome_fantasia, cpf_cnpj, dados_bancarios_conta, dados_bancarios_pix")
                    .eq("company_id", companyId)
                    .or(
                        [
                            `razao_social.ilike.${like(raw)}`,
                            `nome_fantasia.ilike.${like(raw)}`,
                            `cpf_cnpj.ilike.${like(digits || raw)}`,
                            digits ? `dados_bancarios_conta.ilike.${like(digits)}` : null,
                            `dados_bancarios_pix.ilike.${like(raw)}`,
                        ]
                            .filter(Boolean)
                            .join(","),
                    )
                    .limit(8),
                (activeClient as any)
                    .from("products")
                    .select("id, code, description")
                    .eq("company_id", companyId)
                    .or([`description.ilike.${like(raw)}`, `code.ilike.${like(raw)}`].join(","))
                    .limit(8),
            ]);

            if (clientsRes.error) throw clientsRes.error;
            if (suppliersRes.error) throw suppliersRes.error;
            if (productsRes.error) throw productsRes.error;

            const clients = (clientsRes.data || []).map((c: any) => {
                const doc = String(c.cpf_cnpj || "");
                const masked = doc ? (doc.length > 11 ? maskCNPJ(doc) : maskCPF(doc)) : "";
                const account = String(c.dados_bancarios_conta || "");
                const label = c.nome_fantasia || c.razao_social;
                const meta = [masked, account, c.dados_bancarios_pix].filter(Boolean).join(" • ");
                return {
                    kind: "client" as const,
                    id: String(c.id),
                    label: String(label || "Cliente"),
                    doc: doc || null,
                    account: account || null,
                    meta: meta || "",
                    value: normalizeSearch([label, doc, masked, account, c.dados_bancarios_pix].filter(Boolean).join(" ")),
                };
            });

            const suppliers = (suppliersRes.data || []).map((s: any) => {
                const doc = String(s.cpf_cnpj || "");
                const masked = doc ? (doc.length > 11 ? maskCNPJ(doc) : maskCPF(doc)) : "";
                const account = String(s.dados_bancarios_conta || "");
                const label = s.nome_fantasia || s.razao_social;
                const meta = [masked, account, s.dados_bancarios_pix].filter(Boolean).join(" • ");
                return {
                    kind: "supplier" as const,
                    id: String(s.id),
                    label: String(label || "Fornecedor"),
                    doc: doc || null,
                    account: account || null,
                    meta: meta || "",
                    value: normalizeSearch([label, doc, masked, account, s.dados_bancarios_pix].filter(Boolean).join(" ")),
                };
            });

            const products = (productsRes.data || []).map((p: any) => {
                const label = String(p.description || "Produto");
                const code = p.code ? String(p.code) : "";
                return {
                    kind: "product" as const,
                    id: String(p.id),
                    label,
                    code: code || null,
                    meta: code ? `Código: ${code}` : "",
                    value: normalizeSearch([label, code].filter(Boolean).join(" ")),
                };
            });

            const term = {
                kind: "term" as const,
                label: raw,
                meta: "Buscar em descrições (AR/AP)",
                value: normalizeSearch(raw),
            };

            if (isDocQuery) {
                const isExactDoc = (item: any) => unmask(String(item.doc || "")) === digits;
                const exactClients = clients.filter(isExactDoc);
                const exactSuppliers = suppliers.filter(isExactDoc);
                const otherClients = clients.filter((c: any) => !isExactDoc(c));
                const otherSuppliers = suppliers.filter((s: any) => !isExactDoc(s));
                return [...exactClients, ...exactSuppliers, ...otherClients, ...otherSuppliers, ...products, term].slice(0, 25);
            }

            return [term, ...clients, ...suppliers, ...products].slice(0, 25);
        },
        enabled: !!selectedCompany?.id && searchTerm.trim().length >= 2,
    });

    useEffect(() => {
        if (!isDocOnlyInput) return;
        if (isSearching) return;
        if (typedDigits === lastAutoSelectedDocRef.current) return;

        const matches = (globalSearchResults || []).filter(
            (r: any) =>
                (r.kind === "client" || r.kind === "supplier") &&
                unmask(String(r.doc || "")) === typedDigits,
        );

        if (matches.length !== 1) return;
        const match = matches[0];
        lastAutoSelectedDocRef.current = typedDigits;

        if (match.kind === "client") {
            const nextSelected = {
                kind: "client" as const,
                id: match.id,
                label: match.label,
                doc: match.doc ?? null,
                account: match.account ?? null,
            };
            setSelectedSearch(nextSelected);
            const docDigits = unmask(String(nextSelected.doc || ""));
            const docMasked = docDigits ? (docDigits.length > 11 ? maskCNPJ(docDigits) : maskCPF(docDigits)) : "";
            const meta = [docMasked, nextSelected.account].filter(Boolean).join(" • ");
            setSearchTerm([nextSelected.label, meta ? `(${meta})` : ""].filter(Boolean).join(" "));
            setResultsOpen(false);
            return;
        }

        if (match.kind === "supplier") {
            const nextSelected = {
                kind: "supplier" as const,
                id: match.id,
                label: match.label,
                doc: match.doc ?? null,
                account: match.account ?? null,
            };
            setSelectedSearch(nextSelected);
            const docDigits = unmask(String(nextSelected.doc || ""));
            const docMasked = docDigits ? (docDigits.length > 11 ? maskCNPJ(docDigits) : maskCPF(docDigits)) : "";
            const meta = [docMasked, nextSelected.account].filter(Boolean).join(" • ");
            setSearchTerm([nextSelected.label, meta ? `(${meta})` : ""].filter(Boolean).join(" "));
            setResultsOpen(false);
        }
    }, [globalSearchResults, isDocOnlyInput, isSearching, typedDigits]);

    const { data: arap, isLoading: isLoadingArap } = useQuery({
        queryKey: ["reports_arap", selectedCompany?.id, isUsingSecondary, dateRange, selectedSearchKey],
        queryFn: async () => {
            if (!selectedCompany?.id || !selectedSearch) return { receivable: [], payable: [] };

            const companyId = selectedCompany.id;
            const safeTerm = (selectedSearch.kind === "term" ? selectedSearch.label : selectedSearch.label).replace(/[,()]/g, " ").trim();
            const like = `%${safeTerm}%`;

            let receivableQuery = (activeClient as any)
                .from("contas_receber")
                .select("id, valor, data_vencimento, status, pagador_nome")
                .eq("company_id", companyId)
                .gte("data_vencimento", dateRange.start)
                .lte("data_vencimento", dateRange.end)
                .order("data_vencimento", { ascending: true })
                .order("created_at", { ascending: true })
                .limit(5000);

            let payableQuery = (activeClient as any)
                .from("contas_pagar")
                .select("id, valor, data_vencimento, status, credor_nome")
                .eq("company_id", companyId)
                .gte("data_vencimento", dateRange.start)
                .lte("data_vencimento", dateRange.end)
                .order("data_vencimento", { ascending: true })
                .order("created_at", { ascending: true })
                .limit(5000);

            if (selectedSearch.kind === "client") {
                receivableQuery = receivableQuery.ilike("pagador_nome", `%${selectedSearch.label}%`);
            } else if (selectedSearch.kind === "supplier") {
                payableQuery = payableQuery.ilike("credor_nome", `%${selectedSearch.label}%`);
            } else if (selectedSearch.kind === "product") {
                const tokens = [selectedSearch.code, selectedSearch.label].filter(Boolean).map((t) => String(t).replace(/[,()]/g, " ").trim());
                const orRec = tokens.map((t) => `pagador_nome.ilike.%${t}%`).join(",");
                const orPay = tokens.map((t) => `credor_nome.ilike.%${t}%`).join(",");
                receivableQuery = receivableQuery.or(orRec);
                payableQuery = payableQuery.or(orPay);
            } else if (selectedSearch.kind === "term") {
                receivableQuery = receivableQuery.ilike("pagador_nome", like);
                payableQuery = payableQuery.ilike("credor_nome", like);
            }

            const [receivableRes, payableRes] = await Promise.all([receivableQuery, payableQuery]);
            if (receivableRes.error) throw receivableRes.error;
            if (payableRes.error) throw payableRes.error;

            return {
                receivable: (receivableRes.data || []) as any[],
                payable: (payableRes.data || []) as any[],
            };
        },
        enabled: !!selectedCompany?.id && !!selectedSearchKey,
    });

    const arapSummary = useMemo(() => {
        const receivable = arap?.receivable ?? [];
        const payable = arap?.payable ?? [];

        const sum = (rows: any[]) => rows.reduce((acc, r) => acc + Number(r.amount || 0), 0);

        const totalReceivable = sum(receivable);
        const totalPayable = sum(payable);
        const net = totalReceivable - totalPayable;

        return {
            totalReceivable,
            totalPayable,
            net,
            countReceivable: receivable.length,
            countPayable: payable.length,
        };
    }, [arap]);

    const arapBucketed = useMemo(() => {
        const receivable = arap?.receivable ?? [];
        const payable = arap?.payable ?? [];
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        const dayMs = 24 * 60 * 60 * 1000;
        const totalDays = Math.max(1, Math.floor((end.getTime() - start.getTime()) / dayMs) + 1);
        const groupByMonth = totalDays > 45;

        const map = new Map<string, { key: string; label: string; receber: number; pagar: number; saldo: number }>();

        const upsert = (iso: string, patch: Partial<{ receber: number; pagar: number }>) => {
            const key = groupByMonth ? iso.slice(0, 7) : iso;
            const label = groupByMonth ? format(new Date(`${key}-01`), "MM/yyyy") : format(new Date(iso), "dd/MM");
            const prev = map.get(key) ?? { key, label, receber: 0, pagar: 0, saldo: 0 };
            const receber = prev.receber + Number(patch.receber || 0);
            const pagar = prev.pagar + Number(patch.pagar || 0);
            const next = { ...prev, receber, pagar, saldo: receber - pagar };
            map.set(key, next);
        };

        for (const r of receivable) upsert(String(r.due_date), { receber: Number(r.amount || 0) });
        for (const p of payable) upsert(String(p.due_date), { pagar: Number(p.amount || 0) });

        const data = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
        return { groupByMonth, data };
    }, [arap, dateRange.end, dateRange.start]);

    const summary = useMemo(() => {
        const rows = transactions ?? [];
        let totalIn = 0;
        let totalOut = 0;

        for (const t of rows) {
            const amount = Number(t.amount || 0);
            if (t.type === "credit") totalIn += amount;
            if (t.type === "debit") totalOut += amount;
        }

        return { totalIn, totalOut, net: totalIn - totalOut };
    }, [transactions]);

    const bucketed = useMemo(() => {
        const rows = transactions ?? [];
        const start = new Date(dateRange.start);
        const end = new Date(dateRange.end);
        const dayMs = 24 * 60 * 60 * 1000;
        const totalDays = Math.max(1, Math.floor((end.getTime() - start.getTime()) / dayMs) + 1);
        const groupByMonth = totalDays > 45;

        const map = new Map<
            string,
            { key: string; label: string; receitas: number; despesas: number; saldo: number; acumulado: number }
        >();

        for (const t of rows) {
            const key = groupByMonth ? t.date.slice(0, 7) : t.date;
            const label = groupByMonth
                ? format(new Date(`${key}-01`), "MM/yyyy")
                : format(new Date(t.date), "dd/MM");
            const prev = map.get(key) ?? { key, label, receitas: 0, despesas: 0, saldo: 0, acumulado: 0 };

            const amount = Number(t.amount || 0);
            if (t.type === "credit") prev.receitas += amount;
            if (t.type === "debit") prev.despesas += amount;
            prev.saldo = prev.receitas - prev.despesas;

            map.set(key, prev);
        }

        const sorted = Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
        let running = 0;
        for (const item of sorted) {
            running += item.saldo;
            item.acumulado = running;
        }

        return { groupByMonth, data: sorted };
    }, [transactions, dateRange.start, dateRange.end]);

    const topCategories = useMemo(() => {
        const rows = transactions ?? [];
        const expenses = new Map<string, number>();
        const income = new Map<string, number>();

        for (const t of rows) {
            const name = t.category?.name || "Sem categoria";
            const amount = Number(t.amount || 0);
            if (t.type === "debit") expenses.set(name, (expenses.get(name) ?? 0) + amount);
            if (t.type === "credit") income.set(name, (income.get(name) ?? 0) + amount);
        }

        const top = (m: Map<string, number>) =>
            Array.from(m.entries())
                .map(([name, total]) => ({ name, total }))
                .sort((a, b) => b.total - a.total)
                .slice(0, 8);

        return { expenses: top(expenses), income: top(income) };
    }, [transactions]);

    const { data: dfcSummary, isLoading: isLoadingDfcSummary } = useQuery({
        queryKey: ["dfc_summary", selectedCompany?.id, isUsingSecondary],
        queryFn: async () => {
            if (!selectedCompany?.id) return { bankTotal: 0, overdueReceivables: 0 };

            const todayIso = format(new Date(), "yyyy-MM-dd");

            const [bankAccountsRes, overdueRes] = await Promise.all([
                (activeClient as any)
                    .from("bank_accounts")
                    .select("current_balance")
                    .eq("company_id", selectedCompany.id),
                (activeClient as any)
                    .from("contas_receber")
                    .select("valor")
                    .eq("company_id", selectedCompany.id)
                    .lte("data_vencimento", todayIso)
                    .in("status", ["aberto", "vencido"])
                    .limit(5000),
            ]);

            if (bankAccountsRes.error) throw bankAccountsRes.error;
            if (overdueRes.error) throw overdueRes.error;

            const bankTotal = (bankAccountsRes.data || []).reduce(
                (sum: number, row: any) => sum + Number(row.current_balance || 0),
                0,
            );

            const overdueReceivables = (overdueRes.data || []).reduce(
                (sum: number, row: any) => sum + Number(row.valor || 0),
                0,
            );

            return { bankTotal, overdueReceivables };
        },
        enabled: !!selectedCompany?.id,
    });

    return (
        <AppLayout title="Relatórios">
            <div className="space-y-6 animate-fade-in">
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                    <h2 className="text-lg font-bold tracking-tight">Relatórios</h2>
                    <div className="flex flex-wrap items-center gap-2">
                        <Input
                            type="date"
                            value={dateRange.start}
                            onChange={(e) => setDateRange((prev) => ({ ...prev, start: e.target.value }))}
                            className="h-9 w-40"
                        />
                        <span className="text-muted-foreground">a</span>
                        <Input
                            type="date"
                            value={dateRange.end}
                            onChange={(e) => setDateRange((prev) => ({ ...prev, end: e.target.value }))}
                            className="h-9 w-40"
                        />
                    </div>
                </div>

                <Card>
                    <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                        <CardTitle>Busca avançada</CardTitle>
                        {selectedSearch && (
                            <Button
                                variant="ghost"
                                className="h-8 w-fit px-2 text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                    setSelectedSearch(null);
                                    setSearchTerm("");
                                }}
                            >
                                <X className="h-4 w-4 mr-2" />
                                Limpar
                            </Button>
                        )}
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex flex-col gap-2">
                            <div className="relative">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar por Produto, CPF/CNPJ, Nome fantasia ou Número de conta"
                                    className="pl-9"
                                    value={searchTerm}
                                    onChange={(e) => {
                                        const next = e.target.value;
                                        setSearchTerm(next);
                                        setResultsOpen(true);
                                        if (selectedSearch) setSelectedSearch(null);
                                    }}
                                    onFocus={() => setResultsOpen(true)}
                                    onBlur={() => {
                                        window.setTimeout(() => setResultsOpen(false), 120);
                                    }}
                                />
                            </div>

                            {resultsOpen && searchTerm.trim().length >= 2 && (
                                <div className="rounded-md border bg-popover text-popover-foreground shadow-md">
                                    <div className="max-h-[320px] overflow-auto">
                                        {isSearching ? (
                                            <div className="py-6 text-center text-sm text-muted-foreground">Buscando...</div>
                                        ) : (globalSearchResults || []).length === 0 ? (
                                            <div className="py-6 text-center text-sm text-muted-foreground">Nenhum resultado encontrado.</div>
                                        ) : (
                                            <div className="p-1">
                                                {(globalSearchResults || []).map((item: any) => {
                                                    const itemKey = item.kind === "term" ? `term:${item.label}` : `${item.kind}:${item.id}`;
                                                    return (
                                                        <button
                                                            type="button"
                                                            key={`${item.kind}:${item.id || item.label}`}
                                                            className={cn(
                                                                "w-full text-left flex items-start gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                                                                selectedSearchKey === itemKey && "bg-accent text-accent-foreground",
                                                            )}
                                                            onMouseDown={(e) => {
                                                                e.preventDefault();
                                                                if (item.kind === "term") {
                                                                    const nextSelected = { kind: "term" as const, label: item.label };
                                                                    setSelectedSearch(nextSelected);
                                                                    setSearchTerm(nextSelected.label);
                                                                } else if (item.kind === "client") {
                                                                    const nextSelected = {
                                                                        kind: "client" as const,
                                                                        id: item.id,
                                                                        label: item.label,
                                                                        doc: item.doc ?? null,
                                                                        account: item.account ?? null,
                                                                    };
                                                                    setSelectedSearch(nextSelected);
                                                                    const docDigits = unmask(String(nextSelected.doc || ""));
                                                                    const docMasked = docDigits
                                                                        ? (docDigits.length > 11 ? maskCNPJ(docDigits) : maskCPF(docDigits))
                                                                        : "";
                                                                    const meta = [docMasked, nextSelected.account].filter(Boolean).join(" • ");
                                                                    setSearchTerm([nextSelected.label, meta ? `(${meta})` : ""].filter(Boolean).join(" "));
                                                                } else if (item.kind === "supplier") {
                                                                    const nextSelected = {
                                                                        kind: "supplier" as const,
                                                                        id: item.id,
                                                                        label: item.label,
                                                                        doc: item.doc ?? null,
                                                                        account: item.account ?? null,
                                                                    };
                                                                    setSelectedSearch(nextSelected);
                                                                    const docDigits = unmask(String(nextSelected.doc || ""));
                                                                    const docMasked = docDigits
                                                                        ? (docDigits.length > 11 ? maskCNPJ(docDigits) : maskCPF(docDigits))
                                                                        : "";
                                                                    const meta = [docMasked, nextSelected.account].filter(Boolean).join(" • ");
                                                                    setSearchTerm([nextSelected.label, meta ? `(${meta})` : ""].filter(Boolean).join(" "));
                                                                } else if (item.kind === "product") {
                                                                    const nextSelected = {
                                                                        kind: "product" as const,
                                                                        id: item.id,
                                                                        label: item.label,
                                                                        code: item.code ?? null,
                                                                    };
                                                                    setSelectedSearch(nextSelected);
                                                                    setSearchTerm([nextSelected.label, nextSelected.code ? `(${nextSelected.code})` : ""].filter(Boolean).join(" "));
                                                                }
                                                                setResultsOpen(false);
                                                            }}
                                                        >
                                                            <Check
                                                                className={cn(
                                                                    "mt-0.5 h-4 w-4 shrink-0",
                                                                    selectedSearchKey === itemKey ? "opacity-100" : "opacity-0",
                                                                )}
                                                            />
                                                            <div className="flex flex-col min-w-0">
                                                                <span className="font-medium truncate">{item.label}</span>
                                                                <span className="text-xs text-muted-foreground truncate">
                                                                    {item.kind === "client"
                                                                        ? `Cliente${item.meta ? ` • ${item.meta}` : ""}`
                                                                        : item.kind === "supplier"
                                                                            ? `Fornecedor${item.meta ? ` • ${item.meta}` : ""}`
                                                                            : item.kind === "product"
                                                                                ? `Produto${item.meta ? ` • ${item.meta}` : ""}`
                                                                                : String(item.meta || "Buscar em descrições (AR/AP)")}
                                                                </span>
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        {selectedSearch && (
                            <div className="text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">{selectedSearchKindLabel}:</span>{" "}
                                {selectedSearchDisplay || selectedSearch.label}
                            </div>
                        )}

                        {selectedSearch && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Card className="border-dashed">
                                    <CardHeader className="py-4">
                                        <CardTitle className="text-sm font-medium text-muted-foreground">Contas a receber (vencimento)</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold text-green-600 flex items-center gap-2">
                                            <ArrowUpCircle className="h-6 w-6" />
                                            {isLoadingArap ? "—" : formatCurrency(arapSummary.totalReceivable)}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                            {isLoadingArap ? "—" : `${arapSummary.countReceivable} lançamento(s)`}
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card className="border-dashed">
                                    <CardHeader className="py-4">
                                        <CardTitle className="text-sm font-medium text-muted-foreground">Contas a pagar (vencimento)</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold text-[#EF4444] flex items-center gap-2">
                                            <ArrowDownCircle className="h-6 w-6" />
                                            {isLoadingArap ? "—" : formatCurrency(arapSummary.totalPayable)}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-1">
                                            {isLoadingArap ? "—" : `${arapSummary.countPayable} lançamento(s)`}
                                        </div>
                                    </CardContent>
                                </Card>
                                <Card className="border-dashed">
                                    <CardHeader className="py-4">
                                        <CardTitle className="text-sm font-medium text-muted-foreground">Saldo (AR - AP)</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className={cn("text-2xl font-bold flex items-center gap-2", arapSummary.net >= 0 ? "text-blue-600" : "text-[#EF4444]")}>
                                            <TrendingUp className="h-6 w-6" />
                                            {isLoadingArap ? "—" : formatCurrency(arapSummary.net)}
                                        </div>
                                    </CardContent>
                                </Card>
                            </div>
                        )}

                        {selectedSearch && !isLoadingArap && arapSummary.countReceivable === 0 && arapSummary.countPayable === 0 && (
                            <div className="text-sm text-muted-foreground">
                                <div>Filtro encontrado, mas não há lançamentos AR/AP no período selecionado.</div>
                                {selectedSearch.kind === "term" && (typedDigits.length === 11 || typedDigits.length === 14) && (
                                    <div className="mt-1">
                                        Dica: para CNPJ/CPF, selecione o Cliente/Fornecedor na lista (não “Texto”).
                                    </div>
                                )}
                                <div className="mt-1">
                                    Ajuste o período (datas no topo) para incluir os lançamentos.
                                </div>
                            </div>
                        )}

                        {selectedSearch && (
                            <Card className="border-dashed">
                                <CardHeader>
                                    <CardTitle>Comparativo AR x AP {arapBucketed.groupByMonth ? "(mensal)" : "(diário)"}</CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <ChartContainer
                                        className="w-full min-h-[320px]"
                                        config={{
                                            receber: { label: "A receber", color: "hsl(var(--success))" },
                                            pagar: { label: "A pagar", color: "hsl(var(--destructive))" },
                                        }}
                                    >
                                        <BarChart data={arapBucketed.data} margin={{ left: 8, right: 8, top: 8 }}>
                                            <CartesianGrid vertical={false} />
                                            <XAxis dataKey="label" tickMargin={8} minTickGap={12} />
                                            <YAxis tickFormatter={(v) => new Intl.NumberFormat("pt-BR").format(v)} width={80} />
                                            <ReferenceLine y={0} stroke="hsl(var(--border))" />
                                            <ChartTooltip
                                                content={
                                                    <ChartTooltipContent
                                                        formatter={(value) => (
                                                            <span className="font-mono font-medium tabular-nums text-foreground">
                                                                {formatCurrency(Number(value))}
                                                            </span>
                                                        )}
                                                    />
                                                }
                                            />
                                            <ChartLegend content={<ChartLegendContent />} />
                                            <Bar dataKey="receber" fill="var(--color-receber)" radius={[4, 4, 0, 0]} />
                                            <Bar dataKey="pagar" fill="var(--color-pagar)" radius={[4, 4, 0, 0]} />
                                        </BarChart>
                                    </ChartContainer>
                                </CardContent>
                            </Card>
                        )}
                    </CardContent>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card>
                        <CardHeader className="py-4">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Receitas no período</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-green-600 flex items-center gap-2">
                                <ArrowUpCircle className="h-6 w-6" />
                                {formatCurrency(summary.totalIn)}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="py-4">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Despesas no período</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold text-[#EF4444] flex items-center gap-2">
                                <ArrowDownCircle className="h-6 w-6" />
                                {formatCurrency(summary.totalOut)}
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="py-4">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Resultado do período</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div
                                className={`text-2xl font-bold flex items-center gap-2 ${summary.net >= 0 ? "text-blue-600" : "text-[#EF4444]"}`}
                            >
                                <TrendingUp className="h-6 w-6" />
                                {formatCurrency(summary.net)}
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Receitas x Despesas {bucketed.groupByMonth ? "(mensal)" : "(diário)"}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ChartContainer
                                className="w-full min-h-[320px]"
                                config={{
                                    receitas: { label: "Receitas", color: "hsl(var(--success))" },
                                    despesas: { label: "Despesas", color: "hsl(var(--destructive))" },
                                }}
                            >
                                <BarChart data={bucketed.data} margin={{ left: 8, right: 8, top: 8 }}>
                                    <CartesianGrid vertical={false} />
                                    <XAxis dataKey="label" tickMargin={8} minTickGap={12} />
                                    <YAxis tickFormatter={(v) => new Intl.NumberFormat("pt-BR").format(v)} width={80} />
                                    <ChartTooltip content={<ChartTooltipContent />} />
                                    <ChartLegend content={<ChartLegendContent />} />
                                    <Bar dataKey="receitas" fill="var(--color-receitas)" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="despesas" fill="var(--color-despesas)" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ChartContainer>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Geração de Caixa (acumulada)</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ChartContainer
                                className="w-full min-h-[320px]"
                                config={{
                                    acumulado: { label: "Saldo acumulado", color: "hsl(var(--primary))" },
                                }}
                            >
                                <LineChart data={bucketed.data} margin={{ left: 8, right: 8, top: 8 }}>
                                    <CartesianGrid vertical={false} />
                                    <XAxis dataKey="label" tickMargin={8} minTickGap={12} />
                                    <YAxis tickFormatter={(v) => new Intl.NumberFormat("pt-BR").format(v)} width={80} />
                                    <ChartTooltip content={<ChartTooltipContent />} />
                                    <Line
                                        type="monotone"
                                        dataKey="acumulado"
                                        stroke="var(--color-acumulado)"
                                        strokeWidth={2}
                                        dot={false}
                                    />
                                </LineChart>
                            </ChartContainer>
                        </CardContent>
                    </Card>
                </div>

                <div className="space-y-4">
                    <h3 className="text-xl font-semibold tracking-tight">Saúde Financeira e Liquidez (DFC)</h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <Card>
                            <CardHeader className="py-4">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Caixa atual (saldo bancário total)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold flex items-center gap-2">
                                    <Landmark className="h-6 w-6 text-primary" />
                                    {isLoadingDfcSummary ? "—" : formatCurrency(dfcSummary?.bankTotal ?? 0)}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="py-4">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Geração de caixa (no período)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className={`text-2xl font-bold flex items-center gap-2 ${summary.net >= 0 ? "text-blue-600" : "text-[#EF4444]"}`}>
                                    <TrendingUp className="h-6 w-6" />
                                    {formatCurrency(summary.net)}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="py-4">
                                <CardTitle className="text-sm font-medium text-muted-foreground">Inadimplência (AR atrasado)</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-[#EF4444] flex items-center gap-2">
                                    <AlertTriangle className="h-6 w-6" />
                                    {isLoadingDfcSummary ? "—" : formatCurrency(dfcSummary?.overdueReceivables ?? 0)}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Fluxo de Caixa Operacional — últimos 12 meses</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ChartContainer
                                className="w-full min-h-[320px]"
                                config={{
                                    entradas: { label: "Entradas", color: "hsl(var(--success))" },
                                    saidas: { label: "Saídas", color: "hsl(var(--destructive))" },
                                    acumulado: { label: "Acumulado", color: "hsl(var(--primary))" },
                                }}
                            >
                                <BarChart data={dfcMonthlyBucketed} margin={{ left: 8, right: 8, top: 8 }}>
                                    <CartesianGrid vertical={false} />
                                    <XAxis dataKey="label" tickMargin={8} minTickGap={12} />
                                    <YAxis tickFormatter={(v) => new Intl.NumberFormat("pt-BR").format(v)} width={80} />
                                    <ReferenceLine y={0} stroke="hsl(var(--border))" />
                                    <ChartTooltip content={<ChartTooltipContent />} />
                                    <ChartLegend content={<ChartLegendContent />} />
                                    <Bar dataKey="entradas" fill="var(--color-entradas)" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="saidas" fill="var(--color-saidas)" radius={[0, 0, 4, 4]} />
                                </BarChart>
                            </ChartContainer>
                        </CardContent>
                    </Card>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Top despesas por categoria</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ChartContainer
                                className="w-full min-h-[320px]"
                                config={{
                                    total: { label: "Despesas", color: "hsl(var(--destructive))" },
                                }}
                            >
                                <BarChart data={topCategories.expenses} layout="vertical" margin={{ left: 80, right: 8, top: 8 }}>
                                    <CartesianGrid horizontal={false} />
                                    <XAxis type="number" tickFormatter={(v) => new Intl.NumberFormat("pt-BR").format(v)} />
                                    <YAxis
                                        type="category"
                                        dataKey="name"
                                        width={160}
                                        tickFormatter={(v) => String(v).slice(0, 22)}
                                    />
                                    <ChartTooltip
                                        content={
                                            <ChartTooltipContent
                                                formatter={(value) => (
                                                    <span className="font-mono font-medium tabular-nums text-foreground">
                                                        {formatCurrency(Number(value))}
                                                    </span>
                                                )}
                                            />
                                        }
                                    />
                                    <Bar dataKey="total" fill="var(--color-total)" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ChartContainer>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Top receitas por categoria</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ChartContainer
                                className="w-full min-h-[320px]"
                                config={{
                                    total: { label: "Receitas", color: "hsl(var(--success))" },
                                }}
                            >
                                <BarChart data={topCategories.income} layout="vertical" margin={{ left: 80, right: 8, top: 8 }}>
                                    <CartesianGrid horizontal={false} />
                                    <XAxis type="number" tickFormatter={(v) => new Intl.NumberFormat("pt-BR").format(v)} />
                                    <YAxis
                                        type="category"
                                        dataKey="name"
                                        width={160}
                                        tickFormatter={(v) => String(v).slice(0, 22)}
                                    />
                                    <ChartTooltip
                                        content={
                                            <ChartTooltipContent
                                                formatter={(value) => (
                                                    <span className="font-mono font-medium tabular-nums text-foreground">
                                                        {formatCurrency(Number(value))}
                                                    </span>
                                                )}
                                            />
                                        }
                                    />
                                    <Bar dataKey="total" fill="var(--color-total)" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ChartContainer>
                        </CardContent>
                    </Card>
                </div>

                {isLoading && (
                    <div className="text-center py-8 text-muted-foreground">
                        Carregando dados do relatório...
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
