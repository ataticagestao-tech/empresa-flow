import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQueryClient } from "@tanstack/react-query";
import { pagarEGerarRecibo } from "@/lib/recibos/recibos-service";

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
}

export function BotaoPagarComRecibo({
    contaId,
    tipo,
    descricao,
    valor,
    emailDestinatario,
    onSuccess,
}: Props) {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const queryClient = useQueryClient();

    const [isPending, setIsPending] = useState(false);
    const [modal, setModal] = useState(false);
    const [enviarEmail, setEnviarEmail] = useState(!!emailDestinatario);
    const [email, setEmail] = useState(emailDestinatario ?? "");
    const [resultado, setResultado] = useState<{ ok: boolean; msg: string } | null>(null);
    const [selectedBankId, setSelectedBankId] = useState("");
    const [bankAccounts, setBankAccounts] = useState<{ id: string; name: string; banco: string; current_balance: number }[]>([]);

    const fmt = (v: number) =>
        new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

    const openModal = async () => {
        if (selectedCompany?.id) {
            const { data } = await activeClient
                .from("bank_accounts")
                .select("id, name, banco, current_balance")
                .eq("company_id", selectedCompany.id);
            if (data) setBankAccounts(data);
        }
        setModal(true);
    };

    const confirmar = async () => {
        if (!selectedBankId) {
            setResultado({ ok: false, msg: "Selecione uma conta bancária." });
            setTimeout(() => setResultado(null), 3000);
            return;
        }

        setIsPending(true);
        try {
            const result = await pagarEGerarRecibo(
                activeClient,
                contaId,
                selectedBankId,
                tipo,
                {
                    enviar_email: enviarEmail && !!email.trim(),
                    email_destino: email.trim() || undefined,
                }
            );

            if (!result.ok) throw new Error(result.erro || "Erro ao processar.");

            setModal(false);
            setResultado({
                ok: true,
                msg: enviarEmail && email.trim()
                    ? "Pagamento confirmado, comprovante gerado e e-mail enviado!"
                    : "Pagamento confirmado e comprovante gerado!",
            });

            queryClient.invalidateQueries({ queryKey: ["accounts_payable"] });
            queryClient.invalidateQueries({ queryKey: ["accounts_receivable"] });
            queryClient.invalidateQueries({ queryKey: ["transactions"] });
            queryClient.invalidateQueries({ queryKey: ["bank_accounts"] });
            queryClient.invalidateQueries({ queryKey: ["receipts"] });

            onSuccess?.();
        } catch (err: any) {
            console.error(err);
            setResultado({ ok: false, msg: err.message || "Erro ao processar pagamento." });
        } finally {
            setIsPending(false);
            setTimeout(() => setResultado(null), 4000);
        }
    };

    return (
        <>
            {resultado && (
                <div style={{
                    position: "fixed", bottom: 24, right: 24, zIndex: 100,
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

            <button
                onClick={openModal}
                disabled={isPending}
                style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "7px 14px", borderRadius: 7, border: "none",
                    background: "#2e7d32", color: "#ffffff",
                    fontSize: 13, fontWeight: 500, cursor: isPending ? "not-allowed" : "pointer",
                    opacity: isPending ? 0.7 : 1, width: "100%",
                }}
            >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <circle cx="7" cy="7" r="5.5" /><path d="M4 7l2.5 2.5L10 5" />
                </svg>
                {isPending ? "Processando..." : "Pagar + Recibo"}
            </button>

            {modal && (
                <div
                    style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}
                    onClick={() => setModal(false)}
                >
                    <div
                        style={{ background: "#fff", borderRadius: 14, padding: 28, width: 440, border: "0.5px solid #e8e4dc" }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ fontSize: 16, fontWeight: 600, color: "#0f172a", marginBottom: 6 }}>
                            Confirmar {tipo === "payable" ? "pagamento" : "recebimento"}
                        </div>
                        <div style={{ fontSize: 13, color: "#64748b", marginBottom: 4, lineHeight: 1.5 }}>
                            <strong>{descricao}</strong>
                        </div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#2e7d32", marginBottom: 16 }}>
                            {fmt(valor)}
                        </div>

                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                                Conta Bancária / Caixa
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
                            O pagamento será marcado como <strong>Pago</strong>, o saldo da conta será atualizado e um comprovante PDF será gerado automaticamente.
                        </div>

                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                            <button onClick={() => setModal(false)}
                                style={{ padding: "9px 18px", borderRadius: 8, border: "0.5px solid #e2e8f0", background: "#f8f9fb", cursor: "pointer", fontSize: 13, color: "#475569" }}>
                                Cancelar
                            </button>
                            <button onClick={confirmar} disabled={isPending}
                                style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: "#2e7d32", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 500, opacity: isPending ? 0.7 : 1 }}>
                                {isPending ? "Processando..." : "Confirmar pagamento"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
