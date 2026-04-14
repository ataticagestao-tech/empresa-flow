import { useClientContratos } from "../hooks/useClientContratos";
import { formatBRL } from "@/lib/format";

interface Props {
    clientCpfCnpj: string | null | undefined;
    loading?: boolean;
}

export function ContratosKpiCard({ clientCpfCnpj, loading }: Props) {
    const { contratos, isLoading } = useClientContratos(clientCpfCnpj);

    const ativos = contratos.filter((c) => c.status === "confirmado");
    const saldoTotal = ativos.reduce((s, c) => s + c.saldo, 0);
    const pagoTotal = ativos.reduce((s, c) => s + c.total_pago, 0);

    // Proxima cirurgia (a mais proxima no futuro; se todas passadas, mostra a ultima)
    const hoje = new Date().toISOString().slice(0, 10);
    const comCirurgia = ativos
        .filter((c) => c.previsao_cirurgia)
        .sort((a, b) => (a.previsao_cirurgia! < b.previsao_cirurgia! ? -1 : 1));
    const proximaCirurgia =
        comCirurgia.find((c) => c.previsao_cirurgia! >= hoje) || comCirurgia[comCirurgia.length - 1] || null;

    const busy = loading || isLoading;

    let subtitle: string;
    if (busy) {
        subtitle = "";
    } else if (ativos.length === 0) {
        subtitle = "Nenhum ativo";
    } else if (proximaCirurgia?.previsao_cirurgia) {
        subtitle = `Cirurgia ${formatDateShort(proximaCirurgia.previsao_cirurgia)}`;
    } else {
        subtitle = `${ativos.length} ativo${ativos.length > 1 ? "s" : ""} · ${formatBRL(pagoTotal)} pago`;
    }

    const mainValue = busy ? "..." : ativos.length > 0 ? formatBRL(saldoTotal) : "—";
    const mainColor = saldoTotal > 0 ? "text-[#8b0000]" : "text-[#0a5c2e]";

    return (
        <div className="border border-[#e5e7eb] rounded-lg overflow-hidden">
            <div className="bg-[#1a2e4a] px-3 py-1.5">
                <span className="text-[9px] font-bold text-white uppercase tracking-widest">Contratos</span>
            </div>
            <div className="px-3 py-2.5 bg-white">
                <div className={`text-[17px] font-bold ${ativos.length === 0 ? "text-[#888]" : mainColor}`}>
                    {mainValue}
                </div>
                <div className="text-[10px] text-[#888] mt-0.5">{subtitle}</div>
            </div>
        </div>
    );
}

function formatDateShort(iso: string): string {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y.slice(2)}`;
}
