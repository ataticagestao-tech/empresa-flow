import { useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQueryClient } from "@tanstack/react-query";
import { pagarEGerarRecibo, criarRecibo } from "@/lib/recibos/recibos-service";

interface Props {
    contaId: string;
    tipo: "payable" | "receivable";
    descricao: string;
    valor: number;
    fornecedorOuCliente?: string;
    vencimento: string;
    categoria?: string;
    emailDestinatario?: string | null;
    onSuccess?: () => void;
    apenasRecibo?: boolean;
}

// ── Estado global simples para o modal (evita ser desmontado pelo DropdownMenu) ──
let _globalModal: null | {
    open: (params: ModalParams) => void;
} = null;

interface ModalParams {
    contaId: string;
    tipo: "payable" | "receivable";
    descricao: string;
    valor: number;
    emailDestinatario?: string | null;
    apenasRecibo: boolean;
    onSuccess?: () => void;
}

// ── Modal global renderizado uma vez no root ──
export function ReciboModalProvider() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const queryClient = useQueryClient();

    const [visible, setVisible] = useState(false);
    const [params, setParams] = useState<ModalParams | null>(null);
    const [isPending, setIsPending] = useState(false);
    const [enviarEmail, setEnviarEmail] = useState(false);
    const [email, setEmail] = useState("");
    const [selectedBankId, setSelectedBankId] = useState("");
    const [bankAccounts, setBankAccounts] = useState<{ id: string; name: string; banco: string; current_balance: number }[]>([]);
    const [resultado, setResultado] = useState<{ ok: boolean; msg: string } | null>(null);

    const fmt = (v: number) =>
        new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

    const openModal = useCallback(async (p: ModalParams) => {
        setParams(p);
        setEnviarEmail(!!p.emailDestinatario);
        setEmail(p.emailDestinatario ?? "");
        setSelectedBankId("");
        setResultado(null);
        setIsPending(false);

        if (selectedCompany?.id) {
            const { data } = await activeClient
                .from("bank_accounts")
                .select("id, name, banco, current_balance")
                .eq("company_id", selectedCompany.id);
            if (data) setBankAccounts(data);
        }
        setVisible(true);
    }, [activeClient, selectedCompany]);

    // Registrar o handler global
    _globalModal = { open: openModal };

    const fechar = () => {
        setVisible(false);
        setParams(null);
    };

    const confirmar = async () => {
        if (!params) return;

        if (!params.apenasRecibo && !selectedBankId) {
            setResultado({ ok: false, msg: "Selecione uma conta bancária." });
            setTimeout(() => setResultado(null), 3000);
            return;
        }

        setIsPending(true);
        try {
            let result;
            if (params.apenasRecibo) {
                result = await criarRecibo(activeClient, {
                    account_id: params.contaId,
                    tipo: params.tipo,
                    bank_account_id: selectedBankId || undefined,
                    enviar_email: enviarEmail && !!email.trim(),
                    email_destino: email.trim() || undefined,
                });
            } else {
                result = await pagarEGerarRecibo(
                    activeClient,
                    params.contaId,
                    selectedBankId,
                    params.tipo,
                    {
                        enviar_email: enviarEmail && !!email.trim(),
                        email_destino: email.trim() || undefined,
                    }
                );
            }

            if (!result.ok) throw new Error(result.erro || "Erro ao processar.");

            fechar();
            setResultado({
                ok: true,
                msg: params.apenasRecibo
                    ? (enviarEmail && email.trim()
                        ? "Comprovante gerado e e-mail enviado!"
                        : "Comprovante gerado com sucesso!")
                    : (enviarEmail && email.trim()
                        ? "Pagamento confirmado, comprovante gerado e e-mail enviado!"
                        : "Pagamento confirmado e comprovante gerado!"),
            });

            queryClient.invalidateQueries({ queryKey: ["contas_pagar"] });
            queryClient.invalidateQueries({ queryKey: ["contas_receber"] });
            queryClient.invalidateQueries({ queryKey: ["movimentacoes"] });
            queryClient.invalidateQueries({ queryKey: ["bank_accounts"] });
            queryClient.invalidateQueries({ queryKey: ["receipts"] });

            params.onSuccess?.();
        } catch (err: any) {
            console.error("Erro ao gerar recibo:", err);
            setResultado({ ok: false, msg: err.message || "Erro ao processar." });
        } finally {
            setIsPending(false);
            setTimeout(() => setResultado(null), 5000);
        }
    };

    return createPortal(
        <>
            {resultado && (
                <div style={{
                    position: "fixed", bottom: 24, right: 24, zIndex: 99999,
                    background: resultado.ok ? "#0f172a" : "#fde8e8",
                    color: resultado.ok ? "#ffffff" : "#c62828",
                    padding: "12px 18px", borderRadius: 10, fontSize: 13, fontWeight: 500,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
                    display: "flex", alignItems: "center", gap: 10,
                }}>
                    {resultado.ok
                        ? <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round"><path d="M3 8l4 4 6-6" /></svg>
                        : <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#c62828" strokeWidth="2" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                    }
                    {resultado.msg}
                </div>
            )}

            {visible && params && (
                <div
                    style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 99998 }}
                    onMouseDown={fechar}
                >
                    <div
                        style={{ background: "#fff", borderRadius: 14, padding: 28, width: 440, maxWidth: "90vw", border: "0.5px solid #e8e4dc" }}
                        onMouseDown={e => e.stopPropagation()}
                    >
                        <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", marginBottom: 6 }}>
                            {params.apenasRecibo ? "Gerar Comprovante" : `Confirmar ${params.tipo === "payable" ? "pagamento" : "recebimento"}`}
                        </div>
                        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 4, lineHeight: 1.5 }}>
                            <strong>{params.descricao}</strong>
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#2e7d32", marginBottom: 16 }}>
                            {fmt(params.valor)}
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                                Conta Bancária / Caixa {params.apenasRecibo && <span style={{ fontWeight: 400, color: "#94a3b8" }}>(opcional)</span>}
                            </label>
                            <select
                                value={selectedBankId}
                                onChange={e => setSelectedBankId(e.target.value)}
                                style={{
                                    width: "100%", padding: "9px 12px", borderRadius: 8, fontSize: 13,
                                    border: "1px solid #e2e8f0", outline: "none", background: "#f8f9fb",
                                    color: "#0f172a", cursor: "pointer",
                                }}
                            >
                                <option value="">Selecione...</option>
                                {bankAccounts.map(ba => (
                                    <option key={ba.id} value={ba.id}>
                                        {ba.name} ({ba.banco}) - Saldo: {fmt(ba.current_balance)}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div style={{ background: "#f8f9fb", borderRadius: 8, border: "0.5px solid #e2e8f0", padding: 14, marginBottom: 20 }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: enviarEmail ? 12 : 0 }}>
                                <input
                                    type="checkbox"
                                    checked={enviarEmail}
                                    onChange={e => setEnviarEmail(e.target.checked)}
                                    style={{ width: 16, height: 16, accentColor: "#3b5bdb", cursor: "pointer" }}
                                />
                                <span style={{ fontSize: 13, color: "#334155", fontWeight: 500 }}>
                                    Enviar comprovante por e-mail
                                </span>
                            </label>
                            {enviarEmail && (
                                <input
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="email@exemplo.com"
                                    style={{
                                        width: "100%", padding: "8px 12px", borderRadius: 6, fontSize: 13,
                                        border: "0.5px solid #e2e8f0", outline: "none", background: "#ffffff",
                                        color: "#0f172a", boxSizing: "border-box" as const,
                                    }}
                                />
                            )}
                        </div>

                        <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 16, lineHeight: 1.5 }}>
                            {params.apenasRecibo
                                ? "Um comprovante PDF será gerado e poderá ser baixado ou enviado por e-mail."
                                : <>O pagamento será marcado como <strong>Pago</strong>, o saldo da conta será atualizado e um comprovante PDF será gerado automaticamente.</>
                            }
                        </div>

                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                            <button onClick={fechar}
                                style={{ padding: "9px 18px", borderRadius: 8, border: "0.5px solid #e2e8f0", background: "#f8f9fb", cursor: "pointer", fontSize: 13, color: "#475569" }}>
                                Cancelar
                            </button>
                            <button onClick={confirmar} disabled={isPending}
                                style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: "#2e7d32", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500, opacity: isPending ? 0.7 : 1 }}>
                                {isPending ? "Processando..." : params.apenasRecibo ? "Gerar comprovante" : "Confirmar pagamento"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>,
        document.body
    );
}

// ── Botão leve que apenas dispara a abertura do modal global ──
export function BotaoPagarComRecibo({
    contaId,
    tipo,
    descricao,
    valor,
    emailDestinatario,
    onSuccess,
    apenasRecibo = false,
}: Props) {
    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        _globalModal?.open({
            contaId,
            tipo,
            descricao,
            valor,
            emailDestinatario,
            apenasRecibo,
            onSuccess,
        });
    };

    return (
        <button
            onClick={handleClick}
            style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "7px 14px", borderRadius: 7, border: "none",
                background: "#2e7d32", color: "#ffffff",
                fontSize: 13, fontWeight: 500, cursor: "pointer",
                width: "100%",
            }}
        >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="7" cy="7" r="5.5" /><path d="M4 7l2.5 2.5L10 5" />
            </svg>
            {apenasRecibo ? "Gerar Recibo" : "Pagar + Recibo"}
        </button>
    );
}
