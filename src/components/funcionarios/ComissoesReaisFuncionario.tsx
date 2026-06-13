import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { formatNumero } from "@/lib/format";
import {
    exportarRelatorioExcel,
    exportarRelatorioPDF,
    type ColunaRelatorio,
    type EmpresaInfo,
} from "@/lib/relatorios/gerar-relatorio";

interface Props {
    companyId: string;
    employeeId: string;
    employeeNome: string;
}

interface Comissao {
    id: string;
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

export default function ComissoesReaisFuncionario({ companyId, employeeId, employeeNome }: Props) {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const [inicio, setInicio] = useState(firstOfMonth());
    const [fim, setFim] = useState(today());

    const { data: comissoes = [], isLoading } = useQuery({
        queryKey: ["comissoes_func", employeeId, inicio, fim],
        queryFn: async (): Promise<Comissao[]> => {
            const { data, error } = await (activeClient as any)
                .from("comissoes")
                .select("id, data_venda, descricao, cliente_nome, base_valor, comissao_tipo, comissao_percentual, valor_comissao, status")
                .eq("employee_id", employeeId)
                .gte("data_venda", inicio)
                .lte("data_venda", fim)
                .order("data_venda", { ascending: false });
            if (error) return [];
            return data || [];
        },
        enabled: !!employeeId,
    });

    const total = useMemo(() => comissoes.reduce((s, c) => s + (Number(c.valor_comissao) || 0), 0), [comissoes]);

    const colunas: ColunaRelatorio<Comissao>[] = [
        { header: "Data", value: (r) => fmtData(r.data_venda), align: "center", pdfFlex: 10, excelWidth: 12 },
        { header: "Serviço/Produto", value: (r) => r.descricao || "—", pdfFlex: 26, excelWidth: 32 },
        { header: "Cliente", value: (r) => r.cliente_nome || "—", pdfFlex: 22, excelWidth: 26 },
        { header: "Valor base", value: (r) => formatNumero(r.base_valor), numericValue: (r) => Number(r.base_valor) || 0, align: "right", pdfFlex: 12 },
        { header: "Regra", value: (r) => fmtRegra(r), align: "center", pdfFlex: 8 },
        { header: "Comissão", value: (r) => formatNumero(r.valor_comissao), numericValue: (r) => Number(r.valor_comissao) || 0, align: "right", pdfFlex: 12 },
    ];

    const empresa: EmpresaInfo = {
        nome: selectedCompany?.nome_fantasia || selectedCompany?.razao_social || "Empresa",
        razao_social: selectedCompany?.razao_social ?? null,
        cnpj: selectedCompany?.cnpj ?? null,
        local: [selectedCompany?.endereco_cidade, selectedCompany?.endereco_estado].filter(Boolean).join("/"),
    };
    const periodoLabel = `${fmtData(inicio)} a ${fmtData(fim)}`;

    return (
        <div className="border border-[#ccc] rounded-lg overflow-hidden">
            <div className="bg-[#059669] px-3 py-1.5 flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white">Comissões por atendimento (vendas)</span>
                <span className="text-[10px] font-bold text-white/90 whitespace-nowrap">Total: {formatNumero(total)}</span>
            </div>
            <div className="p-3 flex flex-wrap items-end gap-3 border-b border-[#eee]">
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase text-[#555]">De</label>
                    <input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)}
                        className="border border-[#ccc] rounded px-2 py-1 text-[12px]" />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold uppercase text-[#555]">Até</label>
                    <input type="date" value={fim} onChange={(e) => setFim(e.target.value)}
                        className="border border-[#ccc] rounded px-2 py-1 text-[12px]" />
                </div>
                <div className="ml-auto flex gap-2">
                    <button
                        disabled={comissoes.length === 0}
                        onClick={() => exportarRelatorioExcel({ rows: comissoes, columns: colunas, baseName: `comissoes_${employeeNome}` })}
                        className="text-[11px] font-bold text-[#059669] border border-[#059669] rounded px-2.5 py-1 disabled:opacity-30">
                        Excel
                    </button>
                    <button
                        disabled={comissoes.length === 0}
                        onClick={() => exportarRelatorioPDF({
                            rows: comissoes, columns: colunas, titulo: `Comissões — ${employeeNome}`,
                            subtitulo: periodoLabel, baseName: `comissoes_${employeeNome}`, empresa, corPrimaria: "#059669",
                        })}
                        className="text-[11px] font-bold text-[#059669] border border-[#059669] rounded px-2.5 py-1 disabled:opacity-30">
                        PDF
                    </button>
                </div>
            </div>
            {isLoading ? (
                <div className="p-6 text-center text-[#555] text-xs">Carregando…</div>
            ) : comissoes.length === 0 ? (
                <div className="p-6 text-center text-[#555] text-xs">
                    Nenhuma comissão de venda no período.
                    <div className="mt-1 text-[11px]">As comissões aparecem aqui automaticamente quando uma venda registra este profissional como executor de um item comissionável.</div>
                </div>
            ) : (
                <table className="w-full text-[12px]">
                    <thead className="bg-[#F6F2EB]">
                        <tr>
                            <th className="text-left px-2.5 py-1.5 text-[10px] font-bold uppercase text-[#555]">Data</th>
                            <th className="text-left px-2.5 py-1.5 text-[10px] font-bold uppercase text-[#555]">Serviço/Produto</th>
                            <th className="text-left px-2.5 py-1.5 text-[10px] font-bold uppercase text-[#555]">Cliente</th>
                            <th className="text-right px-2.5 py-1.5 text-[10px] font-bold uppercase text-[#555]">Base</th>
                            <th className="text-center px-2.5 py-1.5 text-[10px] font-bold uppercase text-[#555]">Regra</th>
                            <th className="text-right px-2.5 py-1.5 text-[10px] font-bold uppercase text-[#555]">Comissão</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#eee]">
                        {comissoes.map((c) => (
                            <tr key={c.id} className="hover:bg-[#FAFAF7]">
                                <td className="px-2.5 py-1.5 text-[#555] tabular-nums whitespace-nowrap">{fmtData(c.data_venda)}</td>
                                <td className="px-2.5 py-1.5 text-[#1D2939]">{c.descricao || "—"}</td>
                                <td className="px-2.5 py-1.5 text-[#555]">{c.cliente_nome || "—"}</td>
                                <td className="px-2.5 py-1.5 text-right tabular-nums">{formatNumero(c.base_valor)}</td>
                                <td className="px-2.5 py-1.5 text-center text-[#777]">{fmtRegra(c)}</td>
                                <td className="px-2.5 py-1.5 text-right font-bold text-[#1D2939] tabular-nums">{formatNumero(c.valor_comissao)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
