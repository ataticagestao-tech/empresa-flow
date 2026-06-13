import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useProfessionalSelf } from "@/hooks/useProfessionalSelf";
import { LoadingScreen } from "@/components/LoadingScreen";
import { formatNumero } from "@/lib/format";
import {
    exportarRelatorioPDF,
    type ColunaRelatorio,
    type EmpresaInfo,
} from "@/lib/relatorios/gerar-relatorio";

interface Comissao {
    id: string;
    data_venda: string;
    descricao: string | null;
    cliente_nome: string | null;
    base_valor: number;
    comissao_tipo: string | null;
    comissao_percentual: number | null;
    valor_comissao: number;
}

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmtData = (d: string) => (d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—");
const fmtRegra = (c: Comissao) =>
    c.comissao_tipo === "valor" ? "R$/un" : c.comissao_percentual != null ? `${Number(c.comissao_percentual)}%` : "—";

export default function MinhasComissoes() {
    const { activeClient, user, signOut } = useAuth();
    const navigate = useNavigate();
    const { employee, isLoading } = useProfessionalSelf();
    const [dia, setDia] = useState(todayStr());

    const nome = employee?.nome_completo || employee?.name || "Profissional";

    const { data: empresa } = useQuery({
        queryKey: ["minha_empresa", employee?.company_id],
        queryFn: async (): Promise<EmpresaInfo | null> => {
            if (!employee?.company_id) return null;
            const { data } = await (activeClient as any)
                .from("companies")
                .select("nome_fantasia, razao_social, cnpj, endereco_cidade, endereco_estado")
                .eq("id", employee.company_id)
                .maybeSingle();
            if (!data) return null;
            return {
                nome: data.nome_fantasia || data.razao_social || "Empresa",
                razao_social: data.razao_social ?? null,
                cnpj: data.cnpj ?? null,
                local: [data.endereco_cidade, data.endereco_estado].filter(Boolean).join("/"),
            };
        },
        enabled: !!employee?.company_id,
    });

    const { data: comissoes = [], isLoading: loadingCom } = useQuery({
        queryKey: ["minhas_comissoes", employee?.id, dia],
        queryFn: async (): Promise<Comissao[]> => {
            if (!employee?.id) return [];
            const { data, error } = await (activeClient as any)
                .from("comissoes")
                .select("id, data_venda, descricao, cliente_nome, base_valor, comissao_tipo, comissao_percentual, valor_comissao")
                .eq("employee_id", employee.id)
                .eq("data_venda", dia)
                .order("created_at", { ascending: true });
            if (error) return [];
            return data || [];
        },
        enabled: !!employee?.id,
    });

    const total = useMemo(() => comissoes.reduce((s, c) => s + (Number(c.valor_comissao) || 0), 0), [comissoes]);

    if (isLoading) return <LoadingScreen />;

    // Usuário logado que não é um profissional vinculado.
    if (!employee) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#F6F2EB] px-6 text-center">
                <p className="text-[15px] text-[#1D2939] max-w-md">
                    Esta área é exclusiva dos profissionais para ver as próprias comissões.
                    Seu usuário ({user?.email}) não está vinculado a um cadastro de funcionário.
                </p>
                <div className="flex gap-3">
                    <button onClick={() => navigate("/dashboard")}
                        className="text-sm font-bold text-white bg-[#059669] rounded px-4 py-2">Ir para o sistema</button>
                    <button onClick={() => { signOut(); navigate("/auth"); }}
                        className="text-sm font-bold text-[#555] border border-[#ccc] rounded px-4 py-2">Sair</button>
                </div>
            </div>
        );
    }

    const colunas: ColunaRelatorio<Comissao>[] = [
        { header: "Serviço/Produto", value: (r) => r.descricao || "—", pdfFlex: 30 },
        { header: "Cliente", value: (r) => r.cliente_nome || "—", pdfFlex: 24 },
        { header: "Valor base", value: (r) => formatNumero(r.base_valor), numericValue: (r) => Number(r.base_valor) || 0, align: "right", pdfFlex: 14 },
        { header: "Regra", value: (r) => fmtRegra(r), align: "center", pdfFlex: 8 },
        { header: "Comissão", value: (r) => formatNumero(r.valor_comissao), numericValue: (r) => Number(r.valor_comissao) || 0, align: "right", pdfFlex: 14 },
    ];

    const baixarPDF = () => {
        exportarRelatorioPDF({
            rows: comissoes,
            columns: colunas,
            titulo: `Comissões de ${nome}`,
            subtitulo: fmtData(dia),
            baseName: `minhas_comissoes_${dia}`,
            empresa: empresa || { nome: "Comissões" },
            orientacao: "portrait",
            corPrimaria: "#059669",
        });
    };

    return (
        <div className="min-h-screen bg-[#F6F2EB]">
            {/* Topo enxuto — sem menu do sistema */}
            <header className="bg-[#064E3B] text-white px-5 py-3 flex items-center justify-between">
                <div>
                    <p className="text-[11px] uppercase tracking-wider text-white/70 font-bold">Minhas comissões</p>
                    <p className="text-[15px] font-bold">{nome}</p>
                </div>
                <button onClick={() => { signOut(); navigate("/auth"); }}
                    className="text-[12px] font-bold border border-white/40 hover:bg-white/15 rounded px-3 py-1.5">
                    Sair
                </button>
            </header>

            <main className="max-w-3xl mx-auto p-4 sm:p-6">
                <div className="bg-white border border-[#e6e2da] rounded-xl overflow-hidden shadow-sm">
                    {/* Filtro de dia + total */}
                    <div className="px-4 py-3 border-b border-[#eee] flex flex-wrap items-end justify-between gap-3">
                        <div className="flex items-end gap-3">
                            <div className="flex flex-col gap-1">
                                <label className="text-[10px] font-bold uppercase text-[#555]">Dia</label>
                                <input type="date" value={dia} onChange={(e) => setDia(e.target.value)}
                                    className="border border-[#ccc] rounded px-2 py-1.5 text-sm" />
                            </div>
                            <div className="flex gap-1.5">
                                <button onClick={() => setDia(todayStr())}
                                    className="text-[11px] font-bold text-[#059669] border border-[#059669] rounded px-2.5 py-1.5">Hoje</button>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] uppercase tracking-wider text-[#999] font-bold">Total do dia</p>
                            <p className="text-[22px] font-bold text-[#064E3B] tabular-nums">{formatNumero(total)}</p>
                        </div>
                    </div>

                    {/* Lista */}
                    {loadingCom ? (
                        <div className="p-8 text-center text-[#555] text-sm">Carregando…</div>
                    ) : comissoes.length === 0 ? (
                        <div className="p-10 text-center text-[#555] text-sm">
                            Nenhum atendimento com comissão registrado em {fmtData(dia)}.
                        </div>
                    ) : (
                        <table className="w-full text-[13px]">
                            <thead className="bg-[#F6F2EB]">
                                <tr>
                                    <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-[#555]">Serviço/Produto</th>
                                    <th className="text-left px-3 py-2 text-[10px] font-bold uppercase text-[#555]">Cliente</th>
                                    <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-[#555]">Base</th>
                                    <th className="text-center px-3 py-2 text-[10px] font-bold uppercase text-[#555]">Regra</th>
                                    <th className="text-right px-3 py-2 text-[10px] font-bold uppercase text-[#555]">Comissão</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[#eee]">
                                {comissoes.map((c) => (
                                    <tr key={c.id}>
                                        <td className="px-3 py-2 text-[#1D2939]">{c.descricao || "—"}</td>
                                        <td className="px-3 py-2 text-[#555]">{c.cliente_nome || "—"}</td>
                                        <td className="px-3 py-2 text-right tabular-nums">{formatNumero(c.base_valor)}</td>
                                        <td className="px-3 py-2 text-center text-[#777]">{fmtRegra(c)}</td>
                                        <td className="px-3 py-2 text-right font-bold text-[#064E3B] tabular-nums">{formatNumero(c.valor_comissao)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {comissoes.length > 0 && (
                    <div className="mt-4 flex justify-end">
                        <button onClick={baixarPDF}
                            className="text-[13px] font-bold text-white bg-[#059669] rounded px-4 py-2">
                            Baixar PDF do dia
                        </button>
                    </div>
                )}
            </main>
        </div>
    );
}
