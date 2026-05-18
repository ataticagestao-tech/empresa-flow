import { useEffect, useState } from "react";
import { validateWhatsAppNumber } from "@/lib/whatsapp/validate-whatsapp";

type Status = "idle" | "validating" | "valid" | "no_whatsapp" | "format" | "error";

interface Props {
    phone: string;
    /** Tamanho do botao. Default: "md". */
    size?: "sm" | "md";
}

/**
 * Botao "Validar WhatsApp" para colocar ao lado de um input de telefone.
 * Verifica via Evolution API (edge function `validar-whatsapp`) se o numero
 * tem WhatsApp ativo. Reseta automaticamente quando `phone` muda.
 *
 * Uso:
 * <div className="flex gap-2">
 *   <Input value={phone} onChange={...} />
 *   <WhatsappValidatorButton phone={phone} />
 * </div>
 */
export function WhatsappValidatorButton({ phone, size = "md" }: Props) {
    const [status, setStatus] = useState<Status>("idle");
    const [message, setMessage] = useState("");

    useEffect(() => {
        setStatus("idle");
        setMessage("");
    }, [phone]);

    async function handleValidate() {
        const value = (phone || "").trim();
        if (!value) {
            setStatus("format");
            setMessage("Preencha o telefone primeiro.");
            return;
        }
        setStatus("validating");
        setMessage("");
        const result = await validateWhatsAppNumber(value);
        if (!result.ok) {
            if (result.reason === "format") {
                setStatus("format");
                setMessage(result.error || "Telefone em formato invalido.");
            } else {
                setStatus("error");
                setMessage(result.error || "Nao foi possivel validar agora.");
            }
            return;
        }
        if (result.exists) {
            setStatus("valid");
            setMessage("Tem WhatsApp ativo — pode receber mensagens.");
        } else {
            setStatus("no_whatsapp");
            setMessage("Numero valido, mas sem WhatsApp.");
        }
    }

    const btnClass =
        size === "sm"
            ? "text-[10px] px-2 h-9"
            : "text-xs px-3 h-9 sm:h-10";

    return (
        <div className="flex flex-col gap-1">
            <button
                type="button"
                onClick={handleValidate}
                disabled={status === "validating" || !phone}
                className={
                    "shrink-0 font-bold uppercase tracking-wider border border-[#25D366] text-[#25D366] hover:bg-[#25D366] hover:text-white rounded-md disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap " +
                    btnClass
                }
                title="Verificar se este numero tem WhatsApp"
            >
                {status === "validating" ? "..." : "Validar WhatsApp"}
            </button>
            {status !== "idle" && status !== "validating" && (
                <div
                    className={
                        "text-[11px] px-2 py-1 rounded " +
                        (status === "valid"
                            ? "bg-[#D1FAE5] text-[#047857]"
                            : status === "no_whatsapp"
                                ? "bg-[#FEE2E2] text-[#B91C1C]"
                                : status === "format"
                                    ? "bg-[#FEF3C7] text-[#B45309]"
                                    : "bg-gray-100 text-gray-600")
                    }
                >
                    {status === "valid" && "✓ "}
                    {status === "no_whatsapp" && "✗ "}
                    {message}
                </div>
            )}
        </div>
    );
}
