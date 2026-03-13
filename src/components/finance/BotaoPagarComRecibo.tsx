import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQueryClient } from "@tanstack/react-query";
import jsPDF from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

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
    fornecedorOuCliente,
    vencimento,
    categoria,
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
        // Fetch bank accounts
        if (selectedCompany?.id) {
            const { data } = await activeClient
                .from("bank_accounts")
                .select("id, name, banco, current_balance")
                .eq("company_id", selectedCompany.id);
            if (data) setBankAccounts(data);
        }
        setModal(true);
    };

    const gerarReciboPDF = () => {
        const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
        const w = doc.internal.pageSize.getWidth();
        const agora = new Date();

        // Header
        doc.setFillColor(15, 23, 42); // #0f172a
        doc.rect(0, 0, w, 40, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont("helvetica", "bold");
        doc.text(tipo === "payable" ? "COMPROVANTE DE PAGAMENTO" : "COMPROVANTE DE RECEBIMENTO", w / 2, 18, { align: "center" });
        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        doc.text(selectedCompany?.nome_fantasia || selectedCompany?.razao_social || "Empresa", w / 2, 28, { align: "center" });
        doc.text(`Emitido em ${format(agora, "dd/MM/yyyy 'as' HH:mm", { locale: ptBR })}`, w / 2, 34, { align: "center" });

        // Body
        doc.setTextColor(15, 23, 42);
        let y = 55;
        const lineH = 10;
        const leftCol = 20;
        const rightCol = 80;

        const addRow = (label: string, value: string) => {
            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.text(label, leftCol, y);
            doc.setFont("helvetica", "normal");
            doc.setFontSize(11);
            doc.text(value, rightCol, y);
            y += lineH;
        };

        // Separator line
        doc.setDrawColor(226, 232, 240);
        doc.setLineWidth(0.3);
        doc.line(leftCol, y - 5, w - leftCol, y - 5);
        y += 2;

        addRow("Descricao:", descricao);
        addRow(tipo === "payable" ? "Fornecedor:" : "Cliente:", fornecedorOuCliente || "-");
        addRow("Categoria:", categoria || "-");
        addRow("Vencimento:", format(new Date(vencimento), "dd/MM/yyyy"));
        addRow("Data Pagamento:", format(agora, "dd/MM/yyyy"));

        y += 5;
        doc.setDrawColor(226, 232, 240);
        doc.line(leftCol, y, w - leftCol, y);
        y += 10;

        // Value highlight
        doc.setFillColor(232, 245, 233); // greenLt
        doc.roundedRect(leftCol, y - 6, w - leftCol * 2, 20, 4, 4, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(46, 125, 50);
        doc.text("VALOR PAGO", leftCol + 10, y + 2);
        doc.setFontSize(16);
        doc.text(fmt(valor), w - leftCol - 10, y + 3, { align: "right" });

        // Footer
        y += 35;
        doc.setTextColor(148, 163, 184);
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text("Este documento e um comprovante gerado automaticamente pelo sistema Tatica Gestao.", w / 2, y, { align: "center" });
        doc.text(`ID: ${contaId}`, w / 2, y + 5, { align: "center" });

        return doc;
    };

    const confirmar = async () => {
        if (!selectedBankId) {
            setResultado({ ok: false, msg: "Selecione uma conta bancaria." });
            setTimeout(() => setResultado(null), 3000);
            return;
        }

        setIsPending(true);
        try {
            // Process payment via RPC
            const rpcName = tipo === "payable" ? "process_payment" : "process_receipt";
            const dateParam = tipo === "payable" ? "p_payment_date" : "p_receive_date";

            const { error } = await activeClient.rpc(rpcName, {
                p_account_id: contaId,
                p_bank_account_id: selectedBankId,
                p_amount: valor,
                [dateParam]: format(new Date(), "yyyy-MM-dd"),
            });

            if (error) throw error;

            // Generate PDF receipt
            const doc = gerarReciboPDF();
            const nomeArquivo = `comprovante_${descricao.replace(/\s+/g, "_").substring(0, 30)}_${format(new Date(), "ddMMyyyy")}.pdf`;
            doc.save(nomeArquivo);

            // Send email if checked
            if (enviarEmail && email.trim()) {
                try {
                    const pdfBase64 = doc.output("datauristring").split(",")[1];
                    const corpo = `Prezado(a) ${fornecedorOuCliente || ""},\n\nConfirmamos o ${tipo === "payable" ? "pagamento" : "recebimento"} referente a "${descricao}" no valor de ${fmt(valor)}, realizado em ${format(new Date(), "dd/MM/yyyy")}.\n\nAtenciosamente,\n${selectedCompany?.nome_fantasia || selectedCompany?.razao_social || "Tatica Gestao"}`;

                    await activeClient.functions.invoke("enviar-recibo-email", {
                        body: {
                            destinatario: email.trim(),
                            assunto: `Comprovante de ${tipo === "payable" ? "Pagamento" : "Recebimento"} - ${descricao}`,
                            corpo,
                            pdfBase64,
                            nomeArquivo,
                        },
                    });
                } catch (emailErr) {
                    console.warn("Email nao enviado:", emailErr);
                }
            }

            setModal(false);
            setResultado({ ok: true, msg: enviarEmail && email.trim() ? "Pagamento confirmado, comprovante gerado e email enviado!" : "Pagamento confirmado e comprovante gerado!" });

            // Invalidate queries
            queryClient.invalidateQueries({ queryKey: ["accounts_payable"] });
            queryClient.invalidateQueries({ queryKey: ["accounts_receivable"] });
            queryClient.invalidateQueries({ queryKey: ["transactions"] });
            queryClient.invalidateQueries({ queryKey: ["bank_accounts"] });

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
            {/* Toast de resultado */}
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

            {/* Botao */}
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

            {/* Modal de confirmacao */}
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

                        {/* Conta bancaria */}
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#334155", marginBottom: 6 }}>
                                Conta Bancaria / Caixa
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

                        {/* Opcao de enviar e-mail */}
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
                            O pagamento sera marcado como <strong>Pago</strong>, o saldo da conta sera atualizado e um comprovante PDF sera gerado automaticamente.
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
