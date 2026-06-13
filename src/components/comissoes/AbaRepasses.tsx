import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { formatBRL } from "@/lib/format";
import { toast } from "sonner";
import {
    gerarDemonstrativoRepassePDF,
    baixarDemonstrativoPDF,
    type DemonstrativoItem,
    type DemonstrativoDeducao,
} from "@/lib/repasse-pdf/gerar-demonstrativo";

// ─── helpers ────────────────────────────────────────────────────────────────
const firstOfMonth = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const today = () => new Date().toISOString().slice(0, 10);
const fmtData = (d: string | null) => (d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—");
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

interface PendItem {
    id: string;
    employee_id: string;
    data_venda: string;
    descricao: string | null;
    cliente_nome: string | null;
    base_valor: number;
    comissao_tipo: string | null;
    comissao_percentual: number | null;
    valor_comissao: number;
    profissional: string;
    cpf: string | null;
    ir_pct: number;
    sala_pct: number;
}
interface Adiantamento {
    id: string;
    employee_id: string;
    data: string;
    valor: number;
    descricao: string | null;
}
interface Grupo {
    employee_id: string;
    profissional: string;
    cpf: string | null;
    ir_pct: number;
    sala_pct: number;
    itens: PendItem[];
    bruto: number;
    adiantamentos: Adiantamento[];
}
interface DedState {
    irPct: number;
    salaPct: number;
    avulsas: { tipo: string; descricao: string; valor: number }[];
    adiant: Record<string, boolean>;
}
interface Repasse {
    id: string;
    employee_id: string;
    profissional: string;
    periodo_inicio: string;
    periodo_fim: string;
    valor_bruto: number;
    deducoes: DemonstrativoDeducao[];
    total_deducoes: number;
    valor_liquido: number;
    status: string;
    conta_pagar_id: string | null;
    data_pagamento: string | null;
}

export default function AbaRepasses() {
    const { activeClient, user } = useAuth();
    const { selectedCompany } = useCompany();
    const companyId = selectedCompany?.id;
    const db = activeClient as any;

    const [inicio, setInicio] = useState(firstOfMonth());
    const [fim, setFim] = useState(today());
    const [contaContabilId, setContaContabilId] = useState("");
    const [edits, setEdits] = useState<Record<string, DedState>>({});
    const [aberto, setAberto] = useState<Record<string, boolean>>({});
    const [gerando, setGerando] = useState<string | null>(null);
    const [showAdiant, setShowAdiant] = useState(false);
    const qc = useQueryClient();

    // ── Comissões pendentes a repassar (status pendente + sem repasse) ──────────
    const { data: grupos = [], isLoading } = useQuery({
        queryKey: ["repasse_pendentes", companyId, inicio, fim],
        enabled: !!companyId,
        queryFn: async (): Promise<Grupo[]> => {
            const { data, error } = await db
                .from("comissoes")
                .select("id, employee_id, data_venda, descricao, cliente_nome, base_valor, comissao_tipo, comissao_percentual, valor_comissao, employees(name, nome_completo, cpf, ir_retido_percentual, taxa_sala_percentual)")
                .eq("company_id", companyId)
                .eq("status", "pendente")
                .is("repasse_id", null)
                .gte("data_venda", inicio)
                .lte("data_venda", fim)
                .order("data_venda", { ascending: true });
            if (error) { console.error("[repasse_pendentes]", error); return []; }

            // Adiantamentos pendentes (não amarrados ao período — acumulam).
            const { data: adiantData } = await db
                .from("adiantamentos_comissao")
                .select("id, employee_id, data, valor, descricao")
                .eq("company_id", companyId)
                .eq("status", "pendente")
                .order("data", { ascending: true });
            const adiantByEmp = new Map<string, Adiantamento[]>();
            (adiantData || []).forEach((a: any) => {
                const list = adiantByEmp.get(a.employee_id) || [];
                list.push(a);
                adiantByEmp.set(a.employee_id, list);
            });

            const map = new Map<string, Grupo>();
            (data || []).forEach((r: any) => {
                const nome = r.employees?.nome_completo || r.employees?.name || "—";
                const item: PendItem = {
                    ...r,
                    profissional: nome,
                    cpf: r.employees?.cpf || null,
                    ir_pct: Number(r.employees?.ir_retido_percentual) || 0,
                    sala_pct: Number(r.employees?.taxa_sala_percentual) || 0,
                };
                const g = map.get(r.employee_id) || {
                    employee_id: r.employee_id,
                    profissional: nome,
                    cpf: item.cpf,
                    ir_pct: item.ir_pct,
                    sala_pct: item.sala_pct,
                    itens: [],
                    bruto: 0,
                    adiantamentos: adiantByEmp.get(r.employee_id) || [],
                };
                g.itens.push(item);
                g.bruto = r2(g.bruto + (Number(r.valor_comissao) || 0));
                map.set(r.employee_id, g);
            });
            return Array.from(map.values()).sort((a, b) => b.bruto - a.bruto);
        },
    });

    // ── Repasses já gerados (no período de geração recente) ─────────────────────
    const { data: repasses = [] } = useQuery({
        queryKey: ["repasses_gerados", companyId],
        enabled: !!companyId,
        queryFn: async (): Promise<Repasse[]> => {
            const { data, error } = await db
                .from("repasses_comissao")
                .select("id, employee_id, periodo_inicio, periodo_fim, valor_bruto, deducoes, total_deducoes, valor_liquido, status, conta_pagar_id, data_pagamento, employees(name, nome_completo)")
                .eq("company_id", companyId)
                .order("created_at", { ascending: false })
                .limit(100);
            if (error) { console.error("[repasses_gerados]", error); return []; }
            return (data || []).map((r: any) => ({
                ...r,
                profissional: r.employees?.nome_completo || r.employees?.name || "—",
                deducoes: Array.isArray(r.deducoes) ? r.deducoes : [],
            }));
        },
    });

    // ── Categorias contábeis p/ o CP do repasse ─────────────────────────────────
    const { data: chartAccounts = [] } = useQuery({
        queryKey: ["chart_accounts_repasse", companyId],
        enabled: !!companyId,
        queryFn: async () => {
            const { data } = await db
                .from("chart_of_accounts")
                .select("id, code, name, type")
                .eq("company_id", companyId)
                .order("code");
            return data || [];
        },
    });

    // ── Funcionários p/ o modal de adiantamento ─────────────────────────────────
    const { data: funcionarios = [] } = useQuery({
        queryKey: ["funcionarios_adiant", companyId],
        enabled: !!companyId && showAdiant,
        queryFn: async () => {
            const { data } = await db
                .from("employees")
                .select("id, name, nome_completo, cpf")
                .eq("company_id", companyId)
                .order("nome_completo");
            return (data || []).map((e: any) => ({ ...e, label: e.nome_completo || e.name || "—" }));
        },
    });

    // Semeia as deduções padrão (IR%/sala% do cadastro) quando os grupos carregam.
    useEffect(() => {
        setEdits((prev) => {
            const next = { ...prev };
            let changed = false;
            grupos.forEach((g) => {
                if (!next[g.employee_id]) {
                    next[g.employee_id] = { irPct: g.ir_pct, salaPct: g.sala_pct, avulsas: [], adiant: {} };
                    changed = true;
                }
            });
            return changed ? next : prev;
        });
    }, [grupos]);

    const calc = (g: Grupo) => {
        const e = edits[g.employee_id] || { irPct: g.ir_pct, salaPct: g.sala_pct, avulsas: [], adiant: {} };
        const irVal = r2((g.bruto * (Number(e.irPct) || 0)) / 100);
        const salaVal = r2((g.bruto * (Number(e.salaPct) || 0)) / 100);
        const avulsasTotal = e.avulsas.reduce((s, a) => s + (Number(a.valor) || 0), 0);
        const adiantTotal = g.adiantamentos
            .filter((a) => e.adiant[a.id])
            .reduce((s, a) => s + (Number(a.valor) || 0), 0);
        const totalDed = r2(irVal + salaVal + avulsasTotal + adiantTotal);
        const liquido = r2(g.bruto - totalDed);
        return { e, irVal, salaVal, avulsasTotal, adiantTotal, totalDed, liquido };
    };

    const patchEdit = (empId: string, patch: Partial<DedState>) =>
        setEdits((prev) => ({ ...prev, [empId]: { ...(prev[empId] || { irPct: 0, salaPct: 0, avulsas: [], adiant: {} }), ...patch } }));

    // ── Gerar repasse de um profissional ────────────────────────────────────────
    const gerarRepasse = async (g: Grupo) => {
        if (!companyId) return;
        const { e, irVal, salaVal, totalDed, liquido } = calc(g);
        const deducoes: DemonstrativoDeducao[] = [];
        if (irVal > 0) deducoes.push({ tipo: "ir", descricao: `${e.irPct}%`, valor: irVal });
        if (salaVal > 0) deducoes.push({ tipo: "sala", descricao: `${e.salaPct}%`, valor: salaVal });
        e.avulsas.forEach((a) => { if (Number(a.valor) > 0) deducoes.push({ tipo: a.tipo, descricao: a.descricao || null, valor: r2(Number(a.valor)) }); });
        const adiantIds = g.adiantamentos.filter((a) => e.adiant[a.id]).map((a) => a.id);
        g.adiantamentos.filter((a) => e.adiant[a.id]).forEach((a) =>
            deducoes.push({ tipo: "adiantamento", descricao: a.descricao || fmtData(a.data), valor: Number(a.valor) || 0 }));

        if (liquido < 0) { toast.error("As deduções superam o bruto — revise os valores."); return; }

        setGerando(g.employee_id);
        const { error } = await db.rpc("gerar_repasse_comissao", {
            p_payload: {
                company_id: companyId,
                employee_id: g.employee_id,
                periodo_inicio: inicio,
                periodo_fim: fim,
                comissao_ids: g.itens.map((i) => i.id),
                deducoes,
                total_deducoes: totalDed,
                adiantamento_ids: adiantIds,
                gerar_cp: true,
                conta_contabil_id: contaContabilId || null,
                competencia: fim.slice(0, 7),
                data_vencimento: today(),
                created_by: user?.id || null,
            },
        });
        setGerando(null);

        if (error) { console.error("[gerarRepasse]", error); toast.error("Erro ao gerar repasse: " + error.message); return; }
        toast.success(`Repasse de ${g.profissional} gerado · líquido ${formatBRL(liquido)} (Conta a Pagar criada).`);
        setEdits((prev) => { const n = { ...prev }; delete n[g.employee_id]; return n; });
        qc.invalidateQueries({ queryKey: ["repasse_pendentes"] });
        qc.invalidateQueries({ queryKey: ["repasses_gerados"] });
    };

    // ── Baixar demonstrativo de um repasse já gerado ────────────────────────────
    const baixarDemonstrativo = async (rp: Repasse) => {
        const { data } = await db
            .from("comissoes")
            .select("data_venda, cliente_nome, descricao, base_valor, comissao_tipo, comissao_percentual, valor_comissao, employees(cpf)")
            .eq("repasse_id", rp.id)
            .order("data_venda", { ascending: true });
        const itens: DemonstrativoItem[] = (data || []).map((c: any) => ({
            data_venda: c.data_venda, cliente_nome: c.cliente_nome, descricao: c.descricao,
            base_valor: Number(c.base_valor) || 0, comissao_tipo: c.comissao_tipo,
            comissao_percentual: c.comissao_percentual, valor_comissao: Number(c.valor_comissao) || 0,
        }));
        const cpf = (data && data[0]?.employees?.cpf) || null;
        try {
            const blob = await gerarDemonstrativoRepassePDF({
                empresa_nome: selectedCompany?.nome_fantasia || selectedCompany?.razao_social || "Empresa",
                empresa_cnpj: selectedCompany?.cnpj ?? null,
                empresa_razao: selectedCompany?.razao_social ?? null,
                empresa_local: [selectedCompany?.endereco_cidade, selectedCompany?.endereco_estado].filter(Boolean).join("/"),
                logo_url: (selectedCompany as any)?.logo_url ?? null,
                profissional_nome: rp.profissional,
                profissional_cpf: cpf,
                periodo_inicio: rp.periodo_inicio,
                periodo_fim: rp.periodo_fim,
                itens,
                deducoes: rp.deducoes || [],
                valor_bruto: Number(rp.valor_bruto) || 0,
                total_deducoes: Number(rp.total_deducoes) || 0,
                valor_liquido: Number(rp.valor_liquido) || 0,
            });
            baixarDemonstrativoPDF(blob, rp.profissional, rp.periodo_fim);
        } catch (err: any) {
            console.error("[demonstrativo]", err);
            toast.error("Não consegui gerar o PDF do demonstrativo.");
        }
    };

    const marcarPago = async (rp: Repasse) => {
        const { error } = await db.rpc("marcar_repasse_pago", {
            p_payload: { repasse_id: rp.id, data_pagamento: today() },
        });
        if (error) { toast.error("Erro: " + error.message); return; }
        toast.success("Repasse marcado como pago.");
        qc.invalidateQueries({ queryKey: ["repasses_gerados"] });
        qc.invalidateQueries({ queryKey: ["repasse_pendentes"] });
    };

    return (
        <div className="space-y-6">
            {/* Filtros */}
            <div className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase text-[#555]">Período de</label>
                    <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)}
                        className="border border-[#ccc] rounded px-2 py-1.5 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase text-[#555]">até</label>
                    <input type="date" value={fim} onChange={(e) => setFim(e.target.value)}
                        className="border border-[#ccc] rounded px-2 py-1.5 text-sm" />
                </div>
                <div className="flex flex-col gap-1 min-w-[220px]">
                    <label className="text-[10px] font-bold uppercase text-[#555]">Categoria do repasse (Contas a Pagar)</label>
                    <select value={contaContabilId} onChange={(e) => setContaContabilId(e.target.value)}
                        className="border border-[#ccc] rounded px-2 py-1.5 text-sm">
                        <option value="">— sem categoria —</option>
                        {chartAccounts.map((c: any) => (
                            <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
                        ))}
                    </select>
                </div>
                <button onClick={() => setShowAdiant(true)}
                    className="ml-auto text-[12px] font-bold text-[#059669] border border-[#059669] rounded px-3 py-1.5">
                    + Registrar adiantamento
                </button>
            </div>

            {/* Pendentes a repassar */}
            {isLoading ? (
                <div className="p-10 text-center text-[#555] text-sm">Carregando…</div>
            ) : grupos.length === 0 ? (
                <div className="p-10 text-center text-[#555] text-sm border border-[#eee] rounded-lg">
                    Nenhuma comissão pendente de repasse no período.
                    <div className="mt-1 text-[11px]">Comissões já incluídas num repasse não aparecem aqui.</div>
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[#555]">A repassar — por profissional</div>
                    {grupos.map((g) => {
                        const c = calc(g);
                        const isOpen = !!aberto[g.employee_id];
                        return (
                            <div key={g.employee_id} className="border border-[#ccc] rounded-lg overflow-hidden">
                                {/* Cabeçalho do card */}
                                <div className="flex items-center justify-between bg-[#F6F2EB] px-3 py-2">
                                    <button onClick={() => setAberto((p) => ({ ...p, [g.employee_id]: !isOpen }))}
                                        className="flex items-center gap-2 text-left">
                                        <span className="text-[#059669] text-xs">{isOpen ? "▼" : "▶"}</span>
                                        <span className="font-bold text-[#1D2939] text-sm">{g.profissional}</span>
                                        <span className="text-[11px] text-[#777]">{g.itens.length} atendimento(s)</span>
                                    </button>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right">
                                            <div className="text-[10px] uppercase text-[#888]">Líquido</div>
                                            <div className="font-bold text-[#064E3B] tabular-nums">{formatBRL(c.liquido)}</div>
                                        </div>
                                        <button disabled={gerando === g.employee_id}
                                            onClick={() => gerarRepasse(g)}
                                            className="text-[12px] font-bold text-white bg-[#059669] rounded px-3 py-1.5 disabled:opacity-40">
                                            {gerando === g.employee_id ? "Gerando…" : "Gerar repasse"}
                                        </button>
                                    </div>
                                </div>

                                {/* Corpo: itens + deduções */}
                                {isOpen && (
                                    <div className="px-3 py-3 space-y-4">
                                        {/* Itens */}
                                        <table className="w-full text-[12px]">
                                            <thead>
                                                <tr className="text-[10px] uppercase text-[#888] border-b border-[#eee]">
                                                    <th className="text-left py-1">Data</th>
                                                    <th className="text-left py-1">Serviço</th>
                                                    <th className="text-left py-1">Cliente</th>
                                                    <th className="text-right py-1">Comissão</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-[#f2f2f2]">
                                                {g.itens.map((i) => (
                                                    <tr key={i.id}>
                                                        <td className="py-1 text-[#666] whitespace-nowrap">{fmtData(i.data_venda)}</td>
                                                        <td className="py-1 text-[#1D2939]">{i.descricao || "—"}</td>
                                                        <td className="py-1 text-[#666]">{i.cliente_nome || "—"}</td>
                                                        <td className="py-1 text-right font-medium tabular-nums">{formatBRL(i.valor_comissao)}</td>
                                                    </tr>
                                                ))}
                                                <tr className="border-t border-[#ddd]">
                                                    <td colSpan={3} className="py-1 text-right font-bold text-[#1D2939]">Bruto</td>
                                                    <td className="py-1 text-right font-bold text-[#1D2939] tabular-nums">{formatBRL(g.bruto)}</td>
                                                </tr>
                                            </tbody>
                                        </table>

                                        {/* Deduções */}
                                        <div className="bg-[#FAFAF7] border border-[#eee] rounded-lg p-3 space-y-2">
                                            <div className="text-[10px] font-bold uppercase text-[#555]">Deduções</div>
                                            <div className="flex flex-wrap gap-4">
                                                <div className="flex items-center gap-2">
                                                    <label className="text-[11px] text-[#666]">IR retido</label>
                                                    <input type="number" step="0.01" value={c.e.irPct}
                                                        onChange={(ev) => patchEdit(g.employee_id, { irPct: Number(ev.target.value) })}
                                                        className="w-16 border border-[#ccc] rounded px-1.5 py-1 text-sm text-right" />
                                                    <span className="text-[11px] text-[#888]">% = {formatBRL(c.irVal)}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <label className="text-[11px] text-[#666]">Taxa de sala</label>
                                                    <input type="number" step="0.01" value={c.e.salaPct}
                                                        onChange={(ev) => patchEdit(g.employee_id, { salaPct: Number(ev.target.value) })}
                                                        className="w-16 border border-[#ccc] rounded px-1.5 py-1 text-sm text-right" />
                                                    <span className="text-[11px] text-[#888]">% = {formatBRL(c.salaVal)}</span>
                                                </div>
                                            </div>

                                            {/* Avulsas (materiais/outros) */}
                                            {c.e.avulsas.map((a, idx) => (
                                                <div key={idx} className="flex items-center gap-2">
                                                    <select value={a.tipo}
                                                        onChange={(ev) => { const av = [...c.e.avulsas]; av[idx] = { ...a, tipo: ev.target.value }; patchEdit(g.employee_id, { avulsas: av }); }}
                                                        className="border border-[#ccc] rounded px-1.5 py-1 text-sm">
                                                        <option value="materiais">Materiais</option>
                                                        <option value="outros">Outros</option>
                                                    </select>
                                                    <input type="text" placeholder="Descrição" value={a.descricao}
                                                        onChange={(ev) => { const av = [...c.e.avulsas]; av[idx] = { ...a, descricao: ev.target.value }; patchEdit(g.employee_id, { avulsas: av }); }}
                                                        className="flex-1 border border-[#ccc] rounded px-1.5 py-1 text-sm" />
                                                    <input type="number" step="0.01" placeholder="0,00" value={a.valor || ""}
                                                        onChange={(ev) => { const av = [...c.e.avulsas]; av[idx] = { ...a, valor: Number(ev.target.value) }; patchEdit(g.employee_id, { avulsas: av }); }}
                                                        className="w-24 border border-[#ccc] rounded px-1.5 py-1 text-sm text-right" />
                                                    <button onClick={() => { const av = c.e.avulsas.filter((_, i) => i !== idx); patchEdit(g.employee_id, { avulsas: av }); }}
                                                        className="text-[#999] hover:text-red-600 text-sm px-1">✕</button>
                                                </div>
                                            ))}
                                            <button onClick={() => patchEdit(g.employee_id, { avulsas: [...c.e.avulsas, { tipo: "materiais", descricao: "", valor: 0 }] })}
                                                className="text-[11px] font-bold text-[#059669]">+ dedução (materiais/outros)</button>

                                            {/* Adiantamentos pendentes */}
                                            {g.adiantamentos.length > 0 && (
                                                <div className="pt-1">
                                                    <div className="text-[10px] font-bold uppercase text-[#555] mb-1">Adiantamentos a abater</div>
                                                    {g.adiantamentos.map((a) => (
                                                        <label key={a.id} className="flex items-center gap-2 text-[12px] text-[#444] py-0.5">
                                                            <input type="checkbox" checked={!!c.e.adiant[a.id]}
                                                                onChange={(ev) => patchEdit(g.employee_id, { adiant: { ...c.e.adiant, [a.id]: ev.target.checked } })} />
                                                            <span>{fmtData(a.data)} · {a.descricao || "Adiantamento"}</span>
                                                            <span className="ml-auto tabular-nums">{formatBRL(a.valor)}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Resumo */}
                                            <div className="border-t border-[#ddd] pt-2 flex justify-end gap-6 text-[12px]">
                                                <span className="text-[#666]">Bruto <b className="text-[#1D2939]">{formatBRL(g.bruto)}</b></span>
                                                <span className="text-[#666]">Deduções <b className="text-red-600">- {formatBRL(c.totalDed)}</b></span>
                                                <span className="text-[#666]">Líquido <b className="text-[#064E3B]">{formatBRL(c.liquido)}</b></span>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Repasses gerados */}
            {repasses.length > 0 && (
                <div className="border border-[#ccc] rounded-lg overflow-hidden">
                    <div className="bg-[#064E3B] px-3 py-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-white">Repasses gerados</span>
                    </div>
                    <table className="w-full text-[12px]">
                        <thead className="bg-[#F6F2EB]">
                            <tr>
                                <th className="text-left px-2.5 py-1.5 text-[10px] font-bold uppercase text-[#555]">Profissional</th>
                                <th className="text-left px-2.5 py-1.5 text-[10px] font-bold uppercase text-[#555]">Período</th>
                                <th className="text-right px-2.5 py-1.5 text-[10px] font-bold uppercase text-[#555]">Bruto</th>
                                <th className="text-right px-2.5 py-1.5 text-[10px] font-bold uppercase text-[#555]">Deduções</th>
                                <th className="text-right px-2.5 py-1.5 text-[10px] font-bold uppercase text-[#555]">Líquido</th>
                                <th className="text-center px-2.5 py-1.5 text-[10px] font-bold uppercase text-[#555]">Status</th>
                                <th className="px-2.5 py-1.5"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#eee]">
                            {repasses.map((rp) => (
                                <tr key={rp.id} className="hover:bg-[#FAFAF7]">
                                    <td className="px-2.5 py-1.5 font-medium text-[#1D2939]">{rp.profissional}</td>
                                    <td className="px-2.5 py-1.5 text-[#666] whitespace-nowrap">{fmtData(rp.periodo_inicio)}–{fmtData(rp.periodo_fim)}</td>
                                    <td className="px-2.5 py-1.5 text-right tabular-nums">{formatBRL(rp.valor_bruto)}</td>
                                    <td className="px-2.5 py-1.5 text-right tabular-nums text-red-600">- {formatBRL(rp.total_deducoes)}</td>
                                    <td className="px-2.5 py-1.5 text-right font-bold text-[#064E3B] tabular-nums">{formatBRL(rp.valor_liquido)}</td>
                                    <td className="px-2.5 py-1.5 text-center">
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${rp.status === "pago" ? "bg-green-100 text-green-700" : rp.status === "cancelado" ? "bg-gray-100 text-gray-500" : "bg-amber-100 text-amber-700"}`}>
                                            {rp.status === "pago" ? "Pago" : rp.status === "cancelado" ? "Cancelado" : "Aberto"}
                                        </span>
                                    </td>
                                    <td className="px-2.5 py-1.5">
                                        <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                                            <button onClick={() => baixarDemonstrativo(rp)}
                                                className="text-[11px] font-bold text-[#059669] hover:underline">Demonstrativo</button>
                                            {rp.status === "aberto" && rp.conta_pagar_id && (
                                                <span className="text-[11px] text-[#888]" title="Pague o título em Contas a Pagar para fechar o repasse">→ Contas a Pagar</span>
                                            )}
                                            {rp.status === "aberto" && !rp.conta_pagar_id && (
                                                <button onClick={() => marcarPago(rp)}
                                                    className="text-[11px] font-bold text-[#064E3B] hover:underline">Marcar pago</button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showAdiant && (
                <RegistrarAdiantamentoModal
                    db={db}
                    companyId={companyId!}
                    userId={user?.id || null}
                    funcionarios={funcionarios}
                    onClose={() => setShowAdiant(false)}
                    onSaved={() => { setShowAdiant(false); qc.invalidateQueries({ queryKey: ["repasse_pendentes"] }); }}
                />
            )}
        </div>
    );
}

// ─── Modal: registrar adiantamento ───────────────────────────────────────────
function RegistrarAdiantamentoModal(props: {
    db: any; companyId: string; userId: string | null;
    funcionarios: { id: string; label: string; cpf: string | null }[];
    onClose: () => void; onSaved: () => void;
}) {
    const { db, companyId, userId, funcionarios, onClose, onSaved } = props;
    const [employeeId, setEmployeeId] = useState("");
    const [data, setData] = useState(today());
    const [valor, setValor] = useState("");
    const [descricao, setDescricao] = useState("");
    const [gerarCp, setGerarCp] = useState(true);
    const [saving, setSaving] = useState(false);

    const salvar = async () => {
        const v = Number(String(valor).replace(/\./g, "").replace(",", ".")) || Number(valor) || 0;
        if (!employeeId) { toast.error("Escolha o profissional."); return; }
        if (v <= 0) { toast.error("Informe um valor."); return; }
        setSaving(true);
        const func = funcionarios.find((f) => f.id === employeeId);

        let cpId: string | null = null;
        if (gerarCp) {
            const { data: cp, error: cpErr } = await db.from("contas_pagar").insert({
                company_id: companyId,
                credor_nome: func?.label || "Profissional",
                credor_cpf_cnpj: func?.cpf || null,
                descricao: "Adiantamento comissão" + (descricao ? ` — ${descricao}` : ""),
                valor: v, valor_pago: 0, status: "aberto", data_vencimento: data,
            }).select("id").single();
            if (cpErr) { console.error("[adiant cp]", cpErr); }
            cpId = cp?.id || null;
        }

        const { error } = await db.from("adiantamentos_comissao").insert({
            company_id: companyId, employee_id: employeeId, data, valor: v,
            descricao: descricao || null, status: "pendente", conta_pagar_id: cpId, created_by: userId,
        });
        setSaving(false);
        if (error) { console.error("[adiant]", error); toast.error("Erro ao registrar: " + error.message); return; }
        toast.success("Adiantamento registrado.");
        onSaved();
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white rounded-xl w-full max-w-md p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
                <div className="text-sm font-bold text-[#1D2939]">Registrar adiantamento</div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase text-[#555]">Profissional</label>
                    <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}
                        className="border border-[#ccc] rounded px-2 py-1.5 text-sm">
                        <option value="">Selecione…</option>
                        {funcionarios.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                    </select>
                </div>
                <div className="flex gap-3">
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-[10px] font-bold uppercase text-[#555]">Data</label>
                        <input type="date" value={data} onChange={(e) => setData(e.target.value)}
                            className="border border-[#ccc] rounded px-2 py-1.5 text-sm" />
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                        <label className="text-[10px] font-bold uppercase text-[#555]">Valor (R$)</label>
                        <input type="number" step="0.01" value={valor} onChange={(e) => setValor(e.target.value)}
                            placeholder="0,00" className="border border-[#ccc] rounded px-2 py-1.5 text-sm text-right" />
                    </div>
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase text-[#555]">Descrição (opcional)</label>
                    <input type="text" value={descricao} onChange={(e) => setDescricao(e.target.value)}
                        className="border border-[#ccc] rounded px-2 py-1.5 text-sm" />
                </div>
                <label className="flex items-center gap-2 text-[12px] text-[#444]">
                    <input type="checkbox" checked={gerarCp} onChange={(e) => setGerarCp(e.target.checked)} />
                    Lançar a saída no Contas a Pagar (desembolso do adiantamento)
                </label>
                <div className="flex justify-end gap-2 pt-2">
                    <button onClick={onClose} className="text-[12px] font-bold text-[#777] px-3 py-1.5">Cancelar</button>
                    <button onClick={salvar} disabled={saving}
                        className="text-[12px] font-bold text-white bg-[#059669] rounded px-3 py-1.5 disabled:opacity-40">
                        {saving ? "Salvando…" : "Registrar"}
                    </button>
                </div>
            </div>
        </div>
    );
}
