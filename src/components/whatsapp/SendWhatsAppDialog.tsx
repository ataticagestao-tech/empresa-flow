import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MessageCircle } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendWhatsApp } from "@/lib/whatsapp/send-whatsapp";

interface SendWhatsAppDialogProps {
    open: boolean;
    onClose: () => void;
    /** Titulo do modal (ex: "Enviar Recibo por WhatsApp") */
    title?: string;
    /** Bloco de contexto no topo (ex: "Recibo #001 — Joao — R$ 100"). Opcional. */
    subtitle?: React.ReactNode;
    /** Telefone pre-preenchido (com ou sem mascara). Aceita undefined. */
    defaultPhone?: string;
    /** Mensagem pre-preenchida. */
    defaultText?: string;
    /** Callback apos envio bem-sucedido. */
    onSent?: (phone: string) => void;
}

export function SendWhatsAppDialog({
    open,
    onClose,
    title = "Enviar via WhatsApp",
    subtitle,
    defaultPhone = "",
    defaultText = "",
    onSent,
}: SendWhatsAppDialogProps) {
    const [phone, setPhone] = useState(defaultPhone);
    const [text, setText] = useState(defaultText);
    const [sending, setSending] = useState(false);

    // Sincroniza com defaults quando o dialog reabre com nova prop
    useEffect(() => {
        if (open) {
            setPhone(defaultPhone);
            setText(defaultText);
        }
    }, [open, defaultPhone, defaultText]);

    const handleSend = async () => {
        if (!phone.trim()) {
            toast.error("Informe o telefone do destinatário.");
            return;
        }
        if (!text.trim()) {
            toast.error("Mensagem vazia.");
            return;
        }
        setSending(true);
        try {
            const result = await sendWhatsApp({ phone, text });
            if (result.ok) {
                toast.success("WhatsApp enviado!", { description: `Para ${result.phone || phone}` });
                onSent?.(result.phone || phone);
                onClose();
            } else {
                toast.error("Falha ao enviar WhatsApp", { description: result.error });
            }
        } finally {
            setSending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <MessageCircle className="h-5 w-5 text-emerald-600" />
                        {title}
                    </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-2">
                    {subtitle && (
                        <div className="rounded-md bg-[#F6F2EB] p-3 text-xs">
                            {subtitle}
                        </div>
                    )}
                    <div className="space-y-1">
                        <Label className="text-[11px] font-bold uppercase tracking-wider text-[#555]">
                            Telefone do destinatário <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="11999999999 (com DDD)"
                            className="h-9"
                        />
                        <p className="text-[11px] text-[#999]">Aceita formatos com ou sem DDI/parênteses/traços.</p>
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[11px] font-bold uppercase tracking-wider text-[#555]">Mensagem</Label>
                        <textarea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            rows={8}
                            className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#1D2939] focus:outline-none focus:border-[#059669] font-mono"
                        />
                    </div>
                </div>
                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onClose} disabled={sending}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleSend}
                        disabled={sending || !phone.trim() || !text.trim()}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                        {sending ? "Enviando..." : "Enviar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
