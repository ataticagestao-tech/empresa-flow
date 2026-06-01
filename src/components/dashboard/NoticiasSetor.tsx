import { Newspaper, RefreshCw, ExternalLink } from "lucide-react";
import { useSetorEmpresa, useNoticiasSetor } from "@/hooks/useSetorEmpresa";

const C = {
    text1: "#1D2939",
    text2: "#667085",
    muted: "#98A2B3",
    border: "#EAECF0",
    surface: "#FFFFFF",
    green: "#059669",
    serif: "Georgia, 'Times New Roman', serif",
};

/** Data da notícia em dd/mm (ou dd/mm/aa se de outro ano). */
const dataNoticia = (pub: string) => {
    if (!pub) return "";
    const d = new Date(pub);
    if (isNaN(d.getTime())) return "";
    const dia = String(d.getDate()).padStart(2, "0");
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const anoAtual = new Date().getFullYear();
    return d.getFullYear() === anoAtual
        ? `${dia}/${mes}`
        : `${dia}/${mes}/${String(d.getFullYear()).slice(-2)}`;
};

export default function NoticiasSetor() {
    const { setor } = useSetorEmpresa();
    // 5 notícias fixas; o excedente fica em "Ver todos" (outra página).
    const { noticias, loading, error, refetch } = useNoticiasSetor(setor, 5);

    const wrap: React.CSSProperties = {
        width: 240, flexShrink: 0,
        background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
        padding: "14px 16px", boxShadow: "0 1px 3px rgba(0,0,0,.05)",
        alignSelf: "flex-start",
    };

    return (
        <aside style={wrap}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 2 }}>
                <h3 style={{ margin: 0, fontFamily: C.serif, fontSize: 16, fontWeight: 700, color: C.text1, letterSpacing: "-0.01em", display: "flex", alignItems: "center", gap: 6 }}>
                    <Newspaper size={14} style={{ color: C.green }} /> Notícias do setor
                </h3>
                <button onClick={() => refetch()} title="Atualizar" style={{ display: "flex", padding: 3, border: "none", background: "transparent", color: C.muted, cursor: "pointer" }}>
                    <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
                </button>
            </div>
            <p style={{ margin: "0 0 8px", fontSize: 10.5, color: C.muted, textTransform: "uppercase", letterSpacing: ".04em", fontWeight: 600 }}>{setor.label}</p>

            {loading ? (
                <div style={{ height: 180, borderRadius: 8, background: "#F2F4F7" }} className="animate-pulse" />
            ) : noticias.length === 0 ? (
                <p style={{ fontSize: 11.5, color: C.muted, margin: "8px 0", lineHeight: 1.4 }}>
                    {error ? "⚠ Não foi possível carregar." : "Sem notícias do setor no momento."}
                </p>
            ) : (
                <div>
                    {noticias.map((n, i) => (
                        <a key={i} href={n.link} target="_blank" rel="noopener noreferrer"
                            style={{ display: "block", textDecoration: "none", padding: "8px 0", borderTop: i === 0 ? "none" : `1px solid ${C.border}` }}>
                            <p style={{ margin: 0, fontSize: 12, color: C.text1, lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                                {n.titulo}
                            </p>
                            <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 3 }}>
                                <span style={{ fontSize: 10, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 130 }}>{n.fonte}</span>
                                {dataNoticia(n.data) && <span style={{ fontSize: 10, color: C.muted }}>· {dataNoticia(n.data)}</span>}
                            </div>
                        </a>
                    ))}
                </div>
            )}

            <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 10, color: C.muted }}>Fonte: Google Notícias</span>
                <ExternalLink size={10} style={{ color: C.muted }} />
            </div>
        </aside>
    );
}
