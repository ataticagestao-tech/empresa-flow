import { Link } from "react-router-dom";
import { Scale, ExternalLink, AlertTriangle, ChevronRight } from "lucide-react";
import { useRadarLegislativo } from "@/hooks/useRadarLegislativo";
import { useSetorEmpresa } from "@/hooks/useSetorEmpresa";

/* mesmo vocabulário visual do IndicadoresEconomicos (estilo editorial) */
const C = {
    text1: "#1D2939",
    text2: "#667085",
    muted: "#98A2B3",
    border: "#EAECF0",
    surface: "#FFFFFF",
    green: "#059669",
    amber: "#B45309",
    amberSoft: "#FFFBEB",
    serif: "Georgia, 'Times New Roman', serif",
};

/** Data em dd/mm (ou dd/mm/aa se de outro ano). */
const dataProp = (pub: string | null) => {
    if (!pub) return "";
    const d = new Date(pub);
    if (isNaN(d.getTime())) return "";
    const dia = String(d.getDate()).padStart(2, "0");
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    return d.getFullYear() === new Date().getFullYear()
        ? `${dia}/${mes}`
        : `${dia}/${mes}/${String(d.getFullYear()).slice(-2)}`;
};

export default function RadarLegislativo() {
    const { setor } = useSetorEmpresa();
    const { proposicoes, loading } = useRadarLegislativo({ temas: setor.temas, limit: 5 });

    const wrap: React.CSSProperties = {
        width: 240, flexShrink: 0,
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,.05)",
        // Divide com Notícias o espaço da coluna; rola por dentro se não couber.
        flex: 1, minHeight: 0,
        display: "flex", flexDirection: "column",
    };

    return (
        <aside style={wrap}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6, flexShrink: 0 }}>
                <h3 style={{ margin: 0, fontFamily: C.serif, fontSize: 16, fontWeight: 700, color: C.text1, letterSpacing: "-0.01em", display: "flex", alignItems: "center", gap: 6 }}>
                    <Scale size={14} style={{ color: C.green }} /> Radar Legislativo
                </h3>
                <Link to="/radar-legislativo" style={{ fontSize: 11, fontWeight: 600, color: C.green, textDecoration: "none", display: "flex", alignItems: "center", gap: 1 }}>
                    Ver todos <ChevronRight size={11} />
                </Link>
            </div>
            <p style={{ margin: "0 0 8px", fontSize: 10.5, color: C.muted, textTransform: "uppercase", letterSpacing: ".04em", fontWeight: 600, flexShrink: 0 }}>{setor.label}</p>

            {/* Lista: ocupa o espaço restante e rola internamente (barrinha fina). */}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: `${C.border} transparent` }}>
            {loading ? (
                <div style={{ height: 160, borderRadius: 8, background: "#F2F4F7" }} className="animate-pulse" />
            ) : proposicoes.length === 0 ? (
                <p style={{ fontSize: 11.5, color: C.muted, margin: "12px 0", lineHeight: 1.4 }}>
                    Nenhuma proposição de alta relevância no momento.
                </p>
            ) : (
                <div>
                    {proposicoes.map((p, i) => (
                        <a
                            key={p.id}
                            href={p.url_camara}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                display: "block", textDecoration: "none",
                                padding: "8px 0", borderTop: i === 0 ? "none" : `1px solid ${C.border}`,
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                                {p.relevancia === "alta" ? (
                                    <span style={{ fontSize: 10, fontWeight: 700, color: C.amber, background: C.amberSoft, padding: "1px 5px", borderRadius: 4, display: "inline-flex", alignItems: "center", gap: 3 }}>
                                        <AlertTriangle size={9} /> {p.tipo} {p.numero}/{p.ano}
                                    </span>
                                ) : (
                                    <span style={{ fontSize: 10, fontWeight: 700, color: C.text2, background: "#F2F4F7", padding: "1px 5px", borderRadius: 4 }}>
                                        {p.tipo} {p.numero}/{p.ano}
                                    </span>
                                )}
                                {p.tema && <span style={{ fontSize: 9.5, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.tema}</span>}
                                {dataProp(p.data_apresentacao) && <span style={{ fontSize: 9.5, color: C.muted, marginLeft: "auto", flexShrink: 0 }}>{dataProp(p.data_apresentacao)}</span>}
                            </div>
                            <p style={{
                                margin: 0, fontSize: 11.5, color: C.text2, lineHeight: 1.35,
                                display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                            }}>
                                {p.ementa}
                            </p>
                        </a>
                    ))}
                </div>
            )}
            </div>

            <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <span style={{ fontSize: 10, color: C.muted }}>Fonte: Câmara dos Deputados</span>
                <ExternalLink size={10} style={{ color: C.muted }} />
            </div>
        </aside>
    );
}
