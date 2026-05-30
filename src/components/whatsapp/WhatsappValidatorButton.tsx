import { useEffect, useState } from "react";
import { Phone, Check, X, Loader2 } from "lucide-react";
import { validateWhatsAppNumber } from "@/lib/whatsapp/validate-whatsapp";

type Status = "idle" | "validating" | "valid" | "no_whatsapp" | "format" | "error";

interface Props {
    phone: string;
    /** Mantido por compatibilidade — o botao agora e sempre o mesmo tamanho discreto. */
    size?: "sm" | "md";
    /** "icon" (padrao) = botao redondo verde; "text" = botao texto estilo header. */
    variant?: "icon" | "text";
}

/**
 * Botao discreto "Validar WhatsApp" — icone redondo verde ao lado do input de telefone.
 * Verifica via Evolution API (edge function `validar-whatsapp`) se o numero
 * tem WhatsApp ativo. Reseta automaticamente quando `phone` muda.
 */
export function WhatsappValidatorButton({ phone, variant = "icon" }: Props) {
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
            setMessage("Tem WhatsApp");
        } else {
            setStatus("no_whatsapp");
            setMessage("Sem WhatsApp");
        }
    }

    const tooltip =
        status === "valid"
            ? "Tem WhatsApp ativo"
            : status === "no_whatsapp"
                ? "Numero sem WhatsApp"
                : status === "format"
                    ? message || "Formato invalido"
                    : status === "error"
                        ? message || "Falha ao validar"
                        : "Validar WhatsApp";

    const colorClasses =
        status === "valid"
            ? "border-[#25D366] bg-[#25D366] text-white"
            : status === "no_whatsapp"
                ? "border-[#DC2626] text-[#DC2626] hover:bg-[#DC2626] hover:text-white"
                : status === "format" || status === "error"
                    ? "border-[#B45309] text-[#B45309] hover:bg-[#B45309] hover:text-white"
                    : "border-[#25D366] text-[#25D366] hover:bg-[#25D366] hover:text-white";

    if (variant === "text") {
        const label =
            status === "validating" ? "Validando…" :
            status === "valid" ? "WhatsApp ✓" :
            status === "no_whatsapp" ? "Sem WhatsApp" :
            status === "format" || status === "error" ? "WhatsApp !" :
            "WhatsApp";
        return (
            <button
                type="button"
                onClick={handleValidate}
                disabled={status === "validating" || !phone}
                title={tooltip}
                aria-label={tooltip}
                className="shrink-0 whitespace-nowrap text-[11px] font-bold text-white border border-white/40 hover:bg-white/20 rounded px-2.5 py-1 disabled:opacity-50"
            >
                {label}
            </button>
        );
    }

    return (
        <button
            type="button"
            onClick={handleValidate}
            disabled={status === "validating" || !phone}
            title={tooltip}
            aria-label={tooltip}
            className={
                "shrink-0 inline-flex items-center justify-center h-9 w-9 rounded-full border transition-colors disabled:opacity-40 disabled:cursor-not-allowed " +
                colorClasses
            }
        >
            {status === "validating" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
            ) : status === "valid" ? (
                <Check className="h-4 w-4" />
            ) : status === "no_whatsapp" ? (
                <X className="h-4 w-4" />
            ) : (
                <Phone className="h-4 w-4" />
            )}
        </button>
    );
}
