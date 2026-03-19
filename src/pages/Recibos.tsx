import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { reenviarEmailRecibo } from "@/lib/recibos/recibos-service";

interface Recibo {
    id: string;
    numero: string;
    valor: number;
    favorecido: string;
    forma_pagamento: string | null;
    categoria: string | null;
    conta_bancaria: string | null;
    data_pagamento: string;
    descricao: string | null;
    pdf_url: string | null;
    status_email: "pendente" | "enviado" | "erro";
    email_destino: string | null;
    tipo: "payable" | "receivable";
}

const fmt = (v: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const fmtD = (d: string) =>
    new Intl.DateTimeFormat("pt-BR").format(new Date(d));

const td: React.CSSProperties = {
    padding: "11px 14px",
    fontSize: 13,
    color: "#334155",
    verticalAlign: "middle",
};

const iconBtn = (bg: string, c: string): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    borderRadius: 6,
    background: bg,
    color: c,
    border: "none",
    cursor: "pointer",
    textDecoration: "none",
});

function StatusBadge({ s, override }: { s: Recibo["status_email"]; override?: { id: string; ok: boolean } | null }) {
    const status = override ? (override.ok ? "enviado" : "erro") : s;
    const m: Record<string, [string, string]> = {
        pendente: ["#fff8e1", "#f57f17"],
        enviado: ["#e8f5e9", "#2e7d32"],
        erro: ["#fde8e8", "#c62828"],
    };
    const [bg, color] = m[status] ?? m.pendente;
    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                background: bg,
                color,
                fontSize: 11,
                fontWeight: 500,
                padding: "3px 8px",
                borderRadius: 20,
            }}
        >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
            {status.charAt(0).toUpperCase() + status.slice(1)}
        </span>
    );
}

function ModalEmail({
    r,
    onClose,
    onEnviar,
    isPending,
}: {
    r: Recibo;
    onClose: () => void;
    onEnviar: (email: string) => void;
    isPending: boolean;
}) {
    const [email, setEmail] = useState(r.email_destino ?? "");
    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.4)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 50,
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: "#fff",
                    borderRadius: 12,
                    padding: 24,
                    width: 400,
                    border: "0.5px solid #e8e4dc",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div style={{ fontSize: 15, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>
                    Enviar comprovante por e-mail
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16 }}>
                    {r.numero} — {fmt(r.valor)}
                </div>
                <label
                    style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: "#475569",
                        display: "block",
                        marginBottom: 6,
                    }}
                >
                    E-mail do destinatário
                </label>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@exemplo.com"
                    style={{
                        width: "100%",
                        padding: "9px 12px",
                        borderRadius: 7,
                        fontSize: 13,
                        border: "0.5px solid #e2e8f0",
                        outline: "none",
                        marginBottom: 16,
                        background: "#f8f9fb",
                        color: "#0f172a",
                        boxSizing: "border-box",
                    }}
                />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button
                        onClick={onClose}
                        style={{
                            padding: "8px 16px",
                            borderRadius: 7,
                            border: "0.5px solid #e2e8f0",
                            background: "#f8f9fb",
                            cursor: "pointer",
                            fontSize: 13,
                            color: "#475569",
                        }}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => email && onEnviar(email)}
                        disabled={!email || isPending}
                        style={{
                            padding: "8px 16px",
                            borderRadius: 7,
                            border: "none",
                            background: email && !isPending ? "#3b5bdb" : "#e2e8f0",
                            color: email && !isPending ? "#fff" : "#94a3b8",
                            cursor: email && !isPending ? "pointer" : "not-allowed",
                            fontSize: 13,
                            fontWeight: 500,
                        }}
                    >
                        {isPending ? "Enviando..." : "Enviar comprovante"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function Recibos() {
    const { selectedCompany } = useCompany();
    const { activeClient, isUsingSecondary } = useAuth();
    const [busca, setBusca] = useState("");
    const [modal, setModal] = useState<Recibo | null>(null);
    const [isPending, setIsPending] = useState(false);
    const [fb, setFb] = useState<{ id: string; ok: boolean } | null>(null);

    const { data: recibos, isLoading, refetch } = useQuery({
        queryKey: ["recibos_v2", selectedCompany?.id, isUsingSecondary],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await activeClient
                .from("recibos_v2")
                .select("*")
                .eq("company_id", selectedCompany.id)
                .order("created_at", { ascending: false });
            if (error) throw error;
            // Map to Recibo interface
            return (data || []).map((r: any) => ({
                id: r.id,
                numero: String(r.numero_sequencial || ""),
                valor: Number(r.valor || 0),
                favorecido: r.pagador_nome || "",
                forma_pagamento: r.forma_pagamento,
                categoria: null,
                conta_bancaria: null,
                data_pagamento: r.data,
                descricao: r.descricao_servico,
                pdf_url: r.pdf_url,
                status_email: r.enviado_email ? "enviado" : "pendente",
                email_destino: r.email_destino,
                tipo: "receivable" as const,
            })) as Recibo[];
        },
        enabled: !!selectedCompany?.id,
    });

    const normalizeSearch = (value: unknown) =>
        String(value ?? "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();

    const filtrados = (recibos ?? []).filter((r) => {
        const needle = normalizeSearch(busca);
        if (!needle) return true;
        return normalizeSearch(
            [r.favorecido, r.numero, r.categoria, r.forma_pagamento, r.descricao, fmtD(r.data_pagamento), fmt(r.valor)]
                .filter(Boolean)
                .join(" ")
        ).includes(needle);
    });

    const handleEnviar = async (r: Recibo, email: string) => {
        setModal(null);
        setIsPending(true);
        try {
            const res = await reenviarEmailRecibo(activeClient, r.id, email);
            setFb({ id: r.id, ok: res.ok });
            if (!res.ok) console.warn("Erro email:", res.erro);
            refetch();
        } catch {
            setFb({ id: r.id, ok: false });
        } finally {
            setIsPending(false);
            setTimeout(() => setFb(null), 3000);
        }
    };

    return (
        <AppLayout title="Recibos">
            <div style={{ padding: "24px 32px", fontFamily: "Inter, sans-serif" }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                    <div
                        style={{
                            width: 36,
                            height: 36,
                            borderRadius: 8,
                            background: "#e8f5e9",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <svg
                            width="18"
                            height="18"
                            viewBox="0 0 18 18"
                            fill="none"
                            stroke="#2e7d32"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                        >
                            <rect x="2" y="1" width="14" height="16" rx="2" />
                            <path d="M6 6h6M6 9h6M6 12h4" />
                        </svg>
                    </div>
                    <div>
                        <h1 style={{ fontSize: 18, fontWeight: 600, color: "#0f172a", margin: 0 }}>
                            Recibos
                        </h1>
                        <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>
                            Histórico de comprovantes gerados
                        </p>
                    </div>
                </div>

                {/* Card */}
                <div
                    style={{
                        background: "#ffffff",
                        borderRadius: 12,
                        border: "0.5px solid #e8e4dc",
                        overflow: "hidden",
                    }}
                >
                    {/* Toolbar */}
                    <div
                        style={{
                            padding: "14px 16px",
                            borderBottom: "0.5px solid #e8e4dc",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 12,
                        }}
                    >
                        <div style={{ fontWeight: 500, fontSize: 14, color: "#0f172a" }}>
                            Histórico de Recibos Gerados
                            <span
                                style={{
                                    marginLeft: 8,
                                    fontSize: 11,
                                    padding: "1px 7px",
                                    borderRadius: 10,
                                    background: "#f1f5f9",
                                    color: "#64748b",
                                }}
                            >
                                {filtrados.length}
                            </span>
                        </div>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                border: "0.5px solid #e2e8f0",
                                borderRadius: 8,
                                padding: "7px 12px",
                                background: "#f8f9fb",
                                width: 280,
                            }}
                        >
                            <svg
                                width="14"
                                height="14"
                                viewBox="0 0 14 14"
                                fill="none"
                                stroke="#94a3b8"
                                strokeWidth="1.4"
                                strokeLinecap="round"
                            >
                                <circle cx="6" cy="6" r="4" />
                                <path d="M10 10l2 2" />
                            </svg>
                            <input
                                value={busca}
                                onChange={(e) => setBusca(e.target.value)}
                                placeholder="Pesquisar recibos..."
                                style={{
                                    border: "none",
                                    outline: "none",
                                    background: "transparent",
                                    fontSize: 13,
                                    color: "#0f172a",
                                    width: "100%",
                                }}
                            />
                        </div>
                    </div>

                    {/* Tabela */}
                    <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                                <tr style={{ borderBottom: "0.5px solid #e8e4dc" }}>
                                    {["Data", "Favorecido / Categoria", "Nº Recibo", "Valor", "E-mail", "Ações"].map(
                                        (h, i) => (
                                            <th
                                                key={h}
                                                style={{
                                                    padding: "10px 14px",
                                                    fontSize: 10,
                                                    fontWeight: 600,
                                                    letterSpacing: "0.07em",
                                                    textTransform: "uppercase",
                                                    color: "#94a3b8",
                                                    textAlign: i === 5 ? "right" : "left",
                                                }}
                                            >
                                                {h}
                                            </th>
                                        )
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {isLoading ? (
                                    <tr>
                                        <td
                                            colSpan={6}
                                            style={{
                                                padding: "40px 14px",
                                                textAlign: "center",
                                                color: "#94a3b8",
                                                fontSize: 13,
                                            }}
                                        >
                                            Carregando...
                                        </td>
                                    </tr>
                                ) : filtrados.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={6}
                                            style={{
                                                padding: "40px 14px",
                                                textAlign: "center",
                                                color: "#94a3b8",
                                                fontSize: 13,
                                            }}
                                        >
                                            {busca
                                                ? "Nenhum recibo encontrado."
                                                : "Nenhum recibo gerado ainda."}
                                        </td>
                                    </tr>
                                ) : (
                                    filtrados.map((r, i) => (
                                        <tr
                                            key={r.id}
                                            style={{
                                                borderBottom: "0.5px solid #ede9e1",
                                                background: i % 2 === 0 ? "#ffffff" : "#f7f5f0",
                                                transition: "background 0.15s",
                                            }}
                                            onMouseEnter={(e) =>
                                                (e.currentTarget.style.background = "#f0ece3")
                                            }
                                            onMouseLeave={(e) =>
                                                (e.currentTarget.style.background =
                                                    i % 2 === 0 ? "#ffffff" : "#f7f5f0")
                                            }
                                        >
                                            <td style={td}>{fmtD(r.data_pagamento)}</td>
                                            <td style={td}>
                                                <div style={{ fontWeight: 500, color: "#0f172a" }}>
                                                    {r.favorecido}
                                                </div>
                                                {r.categoria && (
                                                    <div
                                                        style={{
                                                            fontSize: 11,
                                                            color: "#94a3b8",
                                                            marginTop: 1,
                                                        }}
                                                    >
                                                        {r.categoria}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={td}>
                                                <span
                                                    style={{
                                                        fontSize: 11,
                                                        padding: "2px 7px",
                                                        borderRadius: 5,
                                                        background: "#f1f5f9",
                                                        color: "#475569",
                                                        fontFamily: "monospace",
                                                    }}
                                                >
                                                    {r.numero}
                                                </span>
                                            </td>
                                            <td style={{ ...td, fontWeight: 600, color: "#2e7d32" }}>
                                                {fmt(r.valor)}
                                            </td>
                                            <td style={td}>
                                                <StatusBadge
                                                    s={r.status_email}
                                                    override={fb?.id === r.id ? fb : null}
                                                />
                                            </td>
                                            <td style={{ ...td, textAlign: "right" }}>
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        gap: 6,
                                                        justifyContent: "flex-end",
                                                    }}
                                                >
                                                    {r.pdf_url && (
                                                        <a
                                                            href={r.pdf_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            style={iconBtn("#eef2ff", "#3b5bdb")}
                                                            title="Baixar PDF"
                                                        >
                                                            <svg
                                                                width="14"
                                                                height="14"
                                                                viewBox="0 0 14 14"
                                                                fill="none"
                                                                stroke="currentColor"
                                                                strokeWidth="1.4"
                                                                strokeLinecap="round"
                                                            >
                                                                <path d="M7 2v7M4 6l3 3 3-3M2 11h10" />
                                                            </svg>
                                                        </a>
                                                    )}
                                                    <button
                                                        onClick={() => setModal(r)}
                                                        disabled={isPending}
                                                        style={iconBtn(
                                                            r.status_email === "enviado"
                                                                ? "#e8f5e9"
                                                                : "#fff8e1",
                                                            r.status_email === "enviado"
                                                                ? "#2e7d32"
                                                                : "#f57f17"
                                                        )}
                                                        title={
                                                            r.status_email === "enviado"
                                                                ? "Re-enviar e-mail"
                                                                : "Enviar por e-mail"
                                                        }
                                                    >
                                                        <svg
                                                            width="14"
                                                            height="14"
                                                            viewBox="0 0 14 14"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            strokeWidth="1.4"
                                                            strokeLinecap="round"
                                                        >
                                                            <rect
                                                                x="1"
                                                                y="3"
                                                                width="12"
                                                                height="8"
                                                                rx="1.5"
                                                            />
                                                            <path d="M1 5l6 4 6-4" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {modal && (
                    <ModalEmail
                        r={modal}
                        onClose={() => setModal(null)}
                        onEnviar={(email) => handleEnviar(modal, email)}
                        isPending={isPending}
                    />
                )}
            </div>
        </AppLayout>
    );
}
