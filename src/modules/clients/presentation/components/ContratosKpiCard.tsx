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

    // Dias até a próxima cirurgia (negativo = passada)
    const diasCirurgia = proximaCirurgia?.previsao_cirurgia
        ? daysUntil(proximaCirurgia.previsao_cirurgia)
        : null;

    let subtitle: string;
    let subtitleClass = "text-[#888]";
    if (busy) {
        subtitle = "";
    } else if (ativos.length === 0) {
        subtitle = "Nenhum ativo";
    } else if (proximaCirurgia?.previsao_cirurgia && diasCirurgia !== null) {
        if (diasCirurgia < 0) {
            subtitle = `Cirurgia ${formatDateShort(proximaCirurgia.previsao_cirurgia)} (passada)`;
        } else if (diasCirurgia === 0) {
            subtitle = `Cirurgia HOJE (${formatDateShort(proximaCirurgia.previsao_cirurgia)})`;
            subtitleClass = "text-[#D92D20] font-bold";
        } else if (diasCirurgia <= 7) {
            subtitle = `Cirurgia em ${diasCirurgia}d (${formatDateShort(proximaCirurgia.previsao_cirurgia)})`;
            subtitleClass = "text-[#D92D20] font-bold";
        } else if (diasCirurgia <= 30) {
            subtitle = `Cirurgia em ${diasCirurgia}d (${formatDateShort(proximaCirurgia.previsao_cirurgia)})`;
            subtitleClass = "text-[#7a5400] font-semibold";
        } else {
            subtitle = `Cirurgia ${formatDateShort(proximaCirurgia.previsao_cirurgia)}`;
        }
    } else {
        subtitle = `${ativos.length} ativo${ativos.length > 1 ? "s" : ""} · ${formatBRL(pagoTotal)} pago`;
    }

    const mainValue = busy ? "..." : ativos.length > 0 ? formatBRL(saldoTotal) : "—";
    const mainColor = saldoTotal > 0 ? "text-[#D92D20]" : "text-[#039855]";

    return (
        <div className="border border-[#EAECF0] rounded-lg overflow-hidden">
            <div className="bg-[#1E3A8A] px-3 py-1.5">
                <span className="text-[9px] font-bold text-white uppercase tracking-widest">Contratos</span>
            </div>
            <div className="px-3 py-2.5 bg-white">
                <div className={`text-[17px] font-bold ${ativos.length === 0 ? "text-[#888]" : mainColor}`}>
                    {mainValue}
                </div>
                <div className={`text-[10px] mt-0.5 ${subtitleClass}`}>{subtitle}</div>
            </div>
        </div>
    );
}

function daysUntil(iso: string): number | null {
    const [y, m, d] = iso.split("-").map((n) => parseInt(n, 10));
    if (!y || !m || !d) return null;
    const target = new Date(y, m - 1, d);
    target.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function formatDateShort(iso: string): string {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y.slice(2)}`;
}
