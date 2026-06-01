import { useEffect, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useRadarLegislativo, useRadarStats, useRadarTemas } from "@/hooks/useRadarLegislativo";
import { Scale, ExternalLink, AlertTriangle, RefreshCw, ChevronLeft, ChevronRight, Building2 } from "lucide-react";

const C = {
    text1: "#1D2939",
    text2: "#667085",
    muted: "#98A2B3",
    border: "#EAECF0",
    surface: "#FFFFFF",
    green: "#059669",
    amber: "#B45309",
    amberSoft: "#FFFBEB",
    creme: "#F6F2EB",
};

const PAGE_SIZE = 15;
const RELEVANCIAS: { key: string | undefined; label: string }[] = [
    { key: undefined, label: "Todas" },
    { key: "alta", label: "Alta" },
    { key: "media", label: "Média" },
];

const fmtData = (iso: string | null) => {
    if (!iso) return "—";
    try { return new Date(iso).toLocaleDateString("pt-BR"); } catch { return iso.slice(0, 10); }
};

export default function RadarLegislativo() {
    const [relevancia, setRelevancia] = useState<string | undefined>(undefined);
    const [tema, setTema] = useState<number | undefined>(undefined);
    const [page, setPage] = useState(0);

    const { proposicoes, total, loading, error, refetch } = useRadarLegislativo({
        relevancia, tema, limit: PAGE_SIZE, offset: page * PAGE_SIZE,
    });
    const { stats } = useRadarStats();
    const { temas } = useRadarTemas();

    useEffect(() => { setPage(0); }, [relevancia, tema]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const ultima = stats?.ultima_execucao?.data
        ? new Date(stats.ultima_execucao.data).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
        : "—";

    const card = (label: string, value: React.ReactNode, accent?: string) => (
        <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "12px 16px", flex: 1, minWidth: 130 }}>
            <p style={{ margin: 0, fontSize: 10.5, textTransform: "uppercase", letterSpacing: ".04em", color: C.muted, fontWeight: 600 }}>{label}</p>
            <p style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 700, color: accent ?? C.text1, fontVariantNumeric: "tabular-nums" }}>{value}</p>
        </div>
    );

    return (
        <AppLayout title="Radar Legislativo">
            <div className="bg-white rounded-xl border border-[#EAECF0] shadow-sm p-6 pb-8 min-h-[calc(100vh-190px)]" style={{ fontFamily: "var(--font-base)" }}>
                {/* Cabeçalho */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <Scale size={20} style={{ color: C.green }} />
                    <h2 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: C.text1, fontFamily: "Georgia, serif", letterSpacing: "-0.01em" }}>Radar Legislativo</h2>
                </div>
                <p style={{ margin: "0 0 18px", fontSize: 13, color: C.text2 }}>
                    Proposições na Câmara dos Deputados que podem afetar PMEs e clínicas (tributação, trabalhista, saúde, comércio).
                </p>

                {/* Resumo */}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
                    {card("Monitoradas", stats?.total_proposicoes ?? "—")}
                    {card("Alta relevância", stats?.por_relevancia?.alta ?? "—", C.amber)}
                    {card("Temas", stats ? Object.keys(stats.por_tema || {}).length : "—")}
                    {card("Última coleta", <span style={{ fontSize: 13, fontWeight: 600 }}>{ultima}</span>)}
                </div>

                {/* Filtros */}
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
                    <div style={{ display: "flex", gap: 4, background: C.creme, borderRadius: 8, padding: 3 }}>
                        {RELEVANCIAS.map((r) => (
                            <button
                                key={r.label}
                                onClick={() => setRelevancia(r.key)}
                                style={{
                                    border: "none", cursor: "pointer", padding: "5px 12px", borderRadius: 6, fontSize: 12.5, fontWeight: 600,
                                    background: relevancia === r.key ? C.green : "transparent",
                                    color: relevancia === r.key ? "#fff" : C.text2,
                                }}
                            >{r.label}</button>
                        ))}
                    </div>
                    <select
                        value={tema ?? ""}
                        onChange={(e) => setTema(e.target.value ? Number(e.target.value) : undefined)}
                        style={{ padding: "7px 10px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12.5, color: C.text1, background: "#fff" }}
                    >
                        <option value="">Todos os temas</option>
                        {temas.map((t) => <option key={t.codigo} value={t.codigo}>{t.nome}</option>)}
                    </select>
                    <span style={{ fontSize: 12.5, color: C.muted, marginLeft: "auto" }}>
                        {total} {total === 1 ? "proposição" : "proposições"}
                    </span>
                    <button onClick={() => refetch()} title="Atualizar" style={{ display: "flex", padding: 6, border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", color: C.text2, cursor: "pointer" }}>
                        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                    </button>
                </div>

                {error && <div style={{ padding: 12, borderRadius: 8, background: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", fontSize: 13, marginBottom: 12 }}>⚠ {error}</div>}

                {/* Lista */}
                {loading && proposicoes.length === 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {Array.from({ length: 6 }).map((_, i) => <div key={i} style={{ height: 78, borderRadius: 10, background: "#F2F4F7" }} className="animate-pulse" />)}
                    </div>
                ) : proposicoes.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "60px 0", color: C.muted }}>
                        <Scale size={36} style={{ margin: "0 auto 10px", opacity: 0.4 }} />
                        <p style={{ fontSize: 13 }}>Nenhuma proposição encontrada para os filtros selecionados.</p>
                    </div>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {proposicoes.map((p) => {
                            const alta = p.relevancia === "alta";
                            return (
                                <a key={p.id} href={p.url_camara} target="_blank" rel="noopener noreferrer"
                                    style={{ display: "block", textDecoration: "none", border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", background: "#fff" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
                                        <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", background: "#071D41", padding: "2px 8px", borderRadius: 5 }}>{p.tipo} {p.numero}/{p.ano}</span>
                                        <span style={{ fontSize: 10.5, fontWeight: 600, padding: "2px 8px", borderRadius: 99, border: `1px solid ${alta ? "#FDE68A" : C.border}`, background: alta ? C.amberSoft : "#F9FAFB", color: alta ? C.amber : C.text2, display: "inline-flex", alignItems: "center", gap: 3 }}>
                                            {alta && <AlertTriangle size={10} />}{alta ? "Alta relevância" : "Relevância média"}
                                        </span>
                                        {p.tema && <span style={{ fontSize: 11.5, color: C.muted }}>{p.tema}</span>}
                                        {!p.tema && p.keyword_match && <span style={{ fontSize: 11.5, color: C.muted, fontStyle: "italic" }}>{p.keyword_match}</span>}
                                        <ExternalLink size={13} style={{ color: C.muted, marginLeft: "auto" }} />
                                    </div>
                                    <p style={{ margin: "0 0 6px", fontSize: 13, color: C.text1, lineHeight: 1.4 }}>{p.ementa}</p>
                                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11, color: C.muted }}>
                                        <span>Apresentada em {fmtData(p.data_apresentacao)}</span>
                                        {p.status_orgao && <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Building2 size={11} />{p.status_orgao}{p.status_descricao ? ` — ${p.status_descricao}` : ""}</span>}
                                    </div>
                                </a>
                            );
                        })}
                    </div>
                )}

                {/* Paginação */}
                {total > PAGE_SIZE && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18 }}>
                        <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                            style={{ display: "flex", alignItems: "center", gap: 4, padding: "7px 12px", border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", color: C.text2, cursor: page === 0 ? "not-allowed" : "pointer", opacity: page === 0 ? 0.4 : 1, fontSize: 12.5 }}>
                            <ChevronLeft size={14} /> Anterior
                        </button>
                        <span style={{ fontSize: 12.5, color: C.muted }}>Página {page + 1} de {totalPages}</span>
                        <button onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))} disabled={page + 1 >= totalPages}
                            style={{ display: "flex", alignItems: "center", gap: 4, padding: "7px 12px", border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", color: C.text2, cursor: page + 1 >= totalPages ? "not-allowed" : "pointer", opacity: page + 1 >= totalPages ? 0.4 : 1, fontSize: 12.5 }}>
                            Próxima <ChevronRight size={14} />
                        </button>
                    </div>
                )}
            </div>
        </AppLayout>
    );
}
