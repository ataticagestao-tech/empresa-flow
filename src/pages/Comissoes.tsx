import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePanel } from "@/components/layout/PagePanel";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { formatNumero } from "@/lib/format";
import ComissaoConfigEmMassa from "@/components/comissoes/ComissaoConfigEmMassa";
import AbaRepasses from "@/components/comissoes/AbaRepasses";
import {
    exportarRelatorioExcel,
    exportarRelatorioPDF,
    type ColunaRelatorio,
    type EmpresaInfo,
} from "@/lib/relatorios/gerar-relatorio";

interface Comissao {
    id: string;
    employee_id: string;
    profissional: string;
    data_venda: string;
    descricao: string | null;
    cliente_nome: string | null;
    base_valor: number;
    comissao_tipo: string | null;
    comissao_percentual: number | null;
    valor_comissao: number;
    status: string;
}

const firstOfMonth = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const today = () => new Date().toISOString().slice(0, 10);
const fmtData = (d: string) => (d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—");
const fmtRegra = (c: Comissao) =>
    c.comissao_tipo === "valor" ? "R$/un" : c.comissao_percentual != null ? `${Number(c.comissao_percentual)}%` : "—";

export default function Comissoes() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const companyId = selectedCompany?.id;
    const [aba, setAba] = useState<"relatorio" | "repasses" | "config">("relatorio");
    const [inicio, setInicio] = useState(firstOfMonth());
    const [fim, setFim] = useState(today());
    const [profFiltro, setProfFiltro] = useState("__todos__");

    const { data: comissoes = [], isLoading } = useQuery({
        queryKey: ["comissoes_empresa", companyId, inicio, fim],
        enabled: !!companyId,
        queryFn: async (): Promise<Comissao[]> => {
            const { data, error } = await (activeClient as any)
                .from("comissoes")
                .select("id, employee_id, data_venda, descricao, cliente_nome, base_valor, comissao_tipo, comissao_percentual, valor_comissao, status, employees(name, nome_completo)")
                .eq("company_id", companyId)
                .gte("data_venda", inicio)
                .lte("data_venda", fim)
                .order("data_venda", { ascending: false });
            if (error) return [];
            return (data || []).map((r: any) => ({
                ...r,
                profissional: r.employees?.nome_completo || r.employees?.name || "—",
            }));
        },
    });

    // Resumo por profissional
    const resumo = useMemo(() => {
        const map = new Map<string, { profissional: string; qtd: number; total: number }>();
        comissoes.forEach((c) => {
            const cur = map.get(c.employee_id) || { profissional: c.profissional, qtd: 0, total: 0 };
            cur.qtd += 1;
            cur.total += Number(c.valor_comissao) || 0;
            map.set(c.employee_id, cur);
        });
        return Array.from(map.entries())
            .map(([employee_id, v]) => ({ employee_id, ...v }))
            .sort((a, b) => b.total - a.total);
    }, [comissoes]);

    const detalhe = useMemo(
        () => (profFiltro === "__todos__" ? comissoes : comissoes.filter((c) => c.employee_id === profFiltro)),
        [comissoes, profFiltro],
    );
    const totalGeral = useMemo(() => comissoes.reduce((s, c) => s + (Number(c.valor_comissao) || 0), 0), [comissoes]);
    const totalDetalhe = useMemo(() => detalhe.reduce((s, c) => s + (Number(c.valor_comissao) || 0), 0), [detalhe]);

    const empresa: EmpresaInfo = {
        nome: selectedCompany?.nome_fantasia || selectedCompany?.razao_social || "Empresa",
        razao_social: selectedCompany?.razao_social ?? null,
        cnpj: selectedCompany?.cnpj ?? null,
        local: [selectedCompany?.endereco_cidade, selectedCompany?.endereco_estado].filter(Boolean).join("/"),
    };
    const periodoLabel = `${fmtData(inicio)} a ${fmtData(fim)}`;

    const colunas: ColunaRelatorio<Comissao>[] = [
        { header: "Data", value: (r) => fmtData(r.data_venda), align: "center", pdfFlex: 9, excelWidth: 12 },
        { header: "Profissional", value: (r) => r.profissional, pdfFlex: 18, excelWidth: 24 },
        { header: "Serviço/Produto", value: (r) => r.descricao || "—", pdfFlex: 22, excelWidth: 28 },
        { header: "Cliente", value: (r) => r.cliente_nome || "—", pdfFlex: 18, excelWidth: 24 },
        { header: "Valor base", value: (r) => formatNumero(r.base_valor), numericValue: (r) => Number(r.base_valor) || 0, align: "right", pdfFlex: 11 },
        { header: "Regra", value: (r) => fmtRegra(r), align: "center", pdfFlex: 7 },
        { header: "Comissão", value: (r) => formatNumero(r.valor_comissao), numericValue: (r) => Number(r.valor_comissao) || 0, align: "right", pdfFlex: 11 },
    ];

    const baseName = `comissoes_${inicio}_${fim}`;

    return (
        <AppLayout title="Comissões">
            <div className="animate-fade-in">
                <PagePanel title="Comissões" subtitle="Comissões geradas pelas vendas, por profissional">
                    {/* Abas */}
                    <div className="flex gap-1 mb-4 border-b border-[#eee]">
                        {([["relatorio", "Relatório"], ["repasses", "Repasses"], ["config", "Configurar % dos procedimentos"]] as const).map(([id, label]) => (
                            <button key={id} onClick={() => setAba(id)}
                                className={`text-[12px] font-bold px-3 py-2 -mb-px border-b-2 transition-colors ${
                                    aba === id ? "border-[#059669] text-[#064E3B]" : "border-transparent text-[#888] hover:text-[#555]"
                                }`}>{label}</button>
                        ))}
                    </div>

                    {aba === "config" && <ComissaoConfigEmMassa />}

                    {aba === "repasses" && <AbaRepasses />}

                    {aba === "relatorio" && (<>
                    {/* Filtros */}
                    <div className="flex flex-wrap items-end gap-3 mb-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold uppercase text-[#555]">De</label>
                            <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)}
                                className="border border-[#ccc] rounded px-2 py-1.5 text-sm" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold uppercase text-[#555]">Até</label>
                            <input type="date" value={fim} onChange={(e) => setFim(e.target.value)}
                                className="border border-[#ccc] rounded px-2 py-1.5 text-sm" />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[10px] font-bold uppercase text-[#555]">Profissional</label>
                            <select value={profFiltro} onChange={(e) => setProfFiltro(e.target.value)}
                                className="border border-[#ccc] rounded px-2 py-1.5 text-sm min-w-[180px]">
                                <option value="__todos__">Todos</option>
                                {resumo.map((r) => <option key={r.employee_id} value={r.employee_id}>{r.profissional}</option>)}
                            </select>
                        </div>
                        <div className="ml-auto flex items-end gap-2">
                            <button disabled={detalhe.length === 0}
                                onClick={() => exportarRelatorioExcel({ rows: detalhe, columns: colunas, baseName })}
                                className="text-[12px] font-bold text-[#059669] border border-[#059669] rounded px-3 py-1.5 disabled:opacity-30">Excel</button>
                            <button disabled={detalhe.length === 0}
                                onClick={() => exportarRelatorioPDF({ rows: detalhe, columns: colunas, titulo: "Comissões", subtitulo: periodoLabel, baseName, empresa, corPrimaria: "#059669" })}
                                className="text-[12px] font-bold text-[#059669] border border-[#059669] rounded px-3 py-1.5 disabled:opacity-30">PDF</button>
                        </div>
                    </div>

                    {isLoading ? (
                        <div className="p-10 text-center text-[#555] text-sm">Carregando…</div>
                    ) : comissoes.length === 0 ? (
                        <div className="p-10 text-center text-[#555] text-sm border border-[#eee] rounded-lg">
                            Nenhuma comissão no período.
                            <div className="mt-1 text-[11px]">As comissões aparecem aqui quando uma venda registra um profissional num item comissionável.</div>
                        </div>
                    ) : (
                        <div className="space-y-5">
                            {/* Resumo por profissional */}
                            <div className="border border-[#ccc] rounded-lg overflow-hidden">
                                <div className="bg-[#064E3B] px-3 py-1.5 flex items-center justify-between">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-white">Resumo por profissional</span>
                                    <span className="text-[10px] font-bold text-white/90">Total geral: {formatNumero(totalGeral)}</span>
                                </div>
                                <table className="w-full text-[13px]">
                                    <thead className="bg-[#F6F2EB]">
                                        <tr>
                                            <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-[#555]">Profissional</th>
                                            <th className="text-center px-3 py-2 text-[10px] font-bold uppercase text-[#555]">Atendimentos</th>
                                            <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-[#555]">Comissão</th>
                                            <th className="w-20"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#eee]">
                                        {resumo.map((r) => (
                                            <tr key={r.employee_id} className="hover:bg-[#FAFAF7]">
                                                <td className="px-3 py-2 font-medium text-[#1D2939]">{r.profissional}</td>
                                                <td className="px-3 py-2 text-center text-[#555] tabular-nums">{r.qtd}</td>
                                                <td className="px-3 py-2 text-right font-bold text-[#064E3B] tabular-nums">{formatNumero(r.total)}</td>
                                                <td className="px-3 py-2 text-right">
                                                    <button onClick={() => setProfFiltro(r.employee_id)}
                                                        className="text-[11px] font-bold text-[#059669] hover:underline">ver</button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Detalhe */}
                            <div className="border border-[#ccc] rounded-lg overflow-hidden">
                                <div className="bg-[#059669] px-3 py-1.5 flex items-center justify-between">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-white">
                                        Detalhe {profFiltro !== "__todos__" ? `— ${resumo.find((r) => r.employee_id === profFiltro)?.profissional || ""}` : "(todos)"}
                                    </span>
                                    <span className="text-[10px] font-bold text-white/90">Total: {formatNumero(totalDetalhe)}</span>
                                </div>
                                <table className="w-full text-[12px]">
                                    <thead className="bg-[#F6F2EB]">
                                        <tr>
                                            <th className="text-left px-2.5 py-1.5 text-[10px] font-bold uppercase text-[#555]">Data</th>
                                            <th className="text-left px-2.5 py-1.5 text-[10px] font-bold uppercase text-[#555]">Profissional</th>
                                            <th className="text-left px-2.5 py-1.5 text-[10px] font-bold uppercase text-[#555]">Serviço/Produto</th>
                                            <th className="text-left px-2.5 py-1.5 text-[10px] font-bold uppercase text-[#555]">Cliente</th>
                                            <th className="text-right px-2.5 py-1.5 text-[10px] font-bold uppercase text-[#555]">Base</th>
                                            <th className="text-center px-2.5 py-1.5 text-[10px] font-bold uppercase text-[#555]">Regra</th>
                                            <th className="text-right px-2.5 py-1.5 text-[10px] font-bold uppercase text-[#555]">Comissão</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#eee]">
                                        {detalhe.map((c) => (
                                            <tr key={c.id} className="hover:bg-[#FAFAF7]">
                                                <td className="px-2.5 py-1.5 text-[#555] tabular-nums whitespace-nowrap">{fmtData(c.data_venda)}</td>
                                                <td className="px-2.5 py-1.5 text-[#1D2939]">{c.profissional}</td>
                                                <td className="px-2.5 py-1.5 text-[#1D2939]">{c.descricao || "—"}</td>
                                                <td className="px-2.5 py-1.5 text-[#555]">{c.cliente_nome || "—"}</td>
                                                <td className="px-2.5 py-1.5 text-right tabular-nums">{formatNumero(c.base_valor)}</td>
                                                <td className="px-2.5 py-1.5 text-center text-[#777]">{fmtRegra(c)}</td>
                                                <td className="px-2.5 py-1.5 text-right font-bold text-[#1D2939] tabular-nums">{formatNumero(c.valor_comissao)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    </>)}
                </PagePanel>
            </div>
        </AppLayout>
    );
}
