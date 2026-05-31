import { useIndicadores, type AtivoBolsa } from "@/hooks/useIndicadores";

/* ── Faixa rolante de cotações da B3 (estilo "ticker" de bolsa) ── */
const C = {
    text1: "#1D2939",
    text2: "#667085",
    muted: "#98A2B3",
    border: "#EAECF0",
    surface: "#FFFFFF",
    navy: "#071D41",
    green: "#059669",
    red: "#E53E3E",
};

const fmt = (v: number | null | undefined, d = 2) =>
    v == null ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

function precoFormatado(a: AtivoBolsa): string {
    if (a.preco == null) return "—";
    if (a.tipo === "indice") return `${fmt(a.preco, 0)} pts`;
    if (a.tipo === "moeda") return `R$ ${fmt(a.preco, 4)}`;
    return `R$ ${fmt(a.preco, 2)}`;
}

function ItemBolsa({ a }: { a: AtivoBolsa }) {
    const subiu = (a.variacao_pct ?? 0) >= 0;
    const cor = a.variacao_pct == null ? C.muted : subiu ? C.green : C.red;
    return (
        <span
            style={{
                display: "inline-flex", alignItems: "center", gap: 8,
                padding: "0 18px", borderRight: `1px solid ${C.border}`,
                whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums",
            }}
        >
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text1 }}>{a.label}</span>
            <span style={{ fontSize: 13, color: C.text2 }}>{precoFormatado(a)}</span>
            {a.variacao_pct != null && (
                <span style={{ fontSize: 12, fontWeight: 600, color: cor, display: "inline-flex", alignItems: "center", gap: 2 }}>
                    {subiu ? "▲" : "▼"} {fmt(Math.abs(a.variacao_pct))}%
                </span>
            )}
        </span>
    );
}

export default function BolsaTicker() {
    const { bolsa, loading } = useIndicadores();

    if (loading && bolsa.length === 0) {
        return <div style={{ height: 36, borderRadius: 10, background: "#F2F4F7" }} className="animate-pulse" />;
    }
    if (!bolsa || bolsa.length === 0) return null;

    // Duplica a lista para o loop ser contínuo (sem "salto" ao reiniciar).
    const items = [...bolsa, ...bolsa];

    return (
        <div
            className="bolsa-ticker"
            style={{
                display: "flex", alignItems: "center", height: 36,
                background: C.surface, border: `1px solid ${C.border}`, borderRadius: 10,
                overflow: "hidden", boxShadow: "0 1px 3px rgba(0,0,0,.05)",
            }}
        >
            {/* Etiqueta fixa */}
            <span
                style={{
                    display: "inline-flex", alignItems: "center", height: "100%",
                    padding: "0 14px", flexShrink: 0,
                    background: C.navy, color: "#fff",
                    fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em",
                }}
            >
                Bolsa B3
            </span>

            {/* Trilho rolante (pausa ao passar o mouse) */}
            <div style={{ flex: 1, overflow: "hidden" }}>
                <div className="bolsa-ticker__track" style={{ display: "flex", width: "max-content" }}>
                    {items.map((a, i) => (
                        <ItemBolsa key={`${a.symbol}-${i}`} a={a} />
                    ))}
                </div>
            </div>

            <style>{`
                @keyframes bolsa-ticker-scroll {
                    from { transform: translateX(0); }
                    to   { transform: translateX(-50%); }
                }
                .bolsa-ticker__track {
                    animation: bolsa-ticker-scroll 45s linear infinite;
                }
                .bolsa-ticker:hover .bolsa-ticker__track {
                    animation-play-state: paused;
                }
            `}</style>
        </div>
    );
}
