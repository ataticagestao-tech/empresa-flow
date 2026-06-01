import { useIndicadores } from "@/hooks/useIndicadores";
import { RefreshCw, ExternalLink } from "lucide-react";

/* ── Widget lateral: Notícias econômicas (mesma largura/estilo do painel BCB) ── */
const C = {
    text1: "#1D2939",
    text2: "#667085",
    muted: "#98A2B3",
    border: "#EAECF0",
    surface: "#FFFFFF",
    green: "#059669",
    serif: "Georgia, 'Times New Roman', serif",
};

/** dd/MM ou 'há Xh' a partir de uma data ISO/qualquer; fallback: string crua. */
function dataCurta(s: string): string {
    if (!s) return "";
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    const agora = Date.now();
    const diffH = Math.round((agora - d.getTime()) / 3_600_000);
    if (diffH >= 0 && diffH < 24) return diffH <= 1 ? "há 1h" : `há ${diffH}h`;
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export default function NoticiasCard() {
    const { noticias, loading, error, refetch } = useIndicadores();

    const wrap: React.CSSProperties = {
        width: 240,
        flexShrink: 0,
        background: C.surface,
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        padding: "14px 16px",
        boxShadow: "0 1px 3px rgba(0,0,0,.05)",
    };

    return (
        <aside style={wrap}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <h3 style={{ margin: 0, fontFamily: C.serif, fontSize: 16, fontWeight: 700, color: C.text1, letterSpacing: "-0.01em" }}>
                    Notícias
                </h3>
                <button
                    onClick={() => refetch()}
                    title="Atualizar"
                    style={{ display: "flex", padding: 3, border: "none", background: "transparent", color: C.muted, cursor: "pointer" }}
                >
                    <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                </button>
            </div>

            {loading && noticias.length === 0 ? (
                <div style={{ height: 200, borderRadius: 8, background: "#F2F4F7", marginTop: 10 }} className="animate-pulse" />
            ) : noticias.length === 0 ? (
                <p style={{ fontSize: 12, color: C.muted, margin: "12px 0 4px" }}>
                    {error ? "⚠ Não foi possível carregar as notícias." : "Sem notícias no momento."}
                </p>
            ) : (
                <div style={{ marginTop: 8 }}>
                    {noticias.map((n, i) => (
                        <a
                            key={`${n.link}-${i}`}
                            href={n.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                display: "block",
                                textDecoration: "none",
                                padding: "9px 0",
                                borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
                            }}
                            title={n.resumo || n.titulo}
                        >
                            <div
                                style={{
                                    fontSize: 12.5,
                                    fontWeight: 600,
                                    color: C.text1,
                                    lineHeight: 1.3,
                                    display: "-webkit-box",
                                    WebkitLineClamp: 3,
                                    WebkitBoxOrient: "vertical",
                                    overflow: "hidden",
                                }}
                            >
                                {n.titulo}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4, fontSize: 10, color: C.muted }}>
                                <span style={{ fontWeight: 600, color: C.green, textTransform: "uppercase", letterSpacing: ".02em" }}>{n.fonte}</span>
                                {n.data && (
                                    <>
                                        <span style={{ width: 2, height: 2, borderRadius: "50%", background: C.muted, display: "inline-block" }} />
                                        <span>{dataCurta(n.data)}</span>
                                    </>
                                )}
                                <ExternalLink size={9} style={{ marginLeft: "auto", color: C.muted }} />
                            </div>
                        </a>
                    ))}
                </div>
            )}

            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C.border}` }}>
                <span style={{ fontSize: 10, color: C.muted }}>Fonte: Agência Brasil · BCB</span>
            </div>
        </aside>
    );
}
