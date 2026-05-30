import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendEmail } from "@/lib/email/send-email";

interface SendEmailDialogProps {
    open: boolean;
    onClose: () => void;
    title?: string;
    subtitle?: React.ReactNode;
    defaultTo?: string;
    defaultSubject?: string;
    defaultBody?: string;
    /** Opcional: URL de anexo (PDF) que sera baixado e enviado junto */
    attachmentUrl?: string;
    /** Nome do arquivo do anexo (obrigatorio se attachmentUrl) */
    attachmentName?: string;
    onSent?: (to: string) => void;
}

export function SendEmailDialog({
    open,
    onClose,
    title = "Enviar por e-mail",
    subtitle,
    defaultTo = "",
    defaultSubject = "",
    defaultBody = "",
    attachmentUrl,
    attachmentName,
    onSent,
}: SendEmailDialogProps) {
    const [to, setTo] = useState(defaultTo);
    const [subject, setSubject] = useState(defaultSubject);
    const [body, setBody] = useState(defaultBody);
    const [sending, setSending] = useState(false);

    useEffect(() => {
        if (open) {
            setTo(defaultTo);
            setSubject(defaultSubject);
            setBody(defaultBody);
        }
    }, [open, defaultTo, defaultSubject, defaultBody]);

    const handleSend = async () => {
        if (!to.trim()) { toast.error("Informe o e-mail do destinatário."); return; }
        if (!subject.trim()) { toast.error("Assunto vazio."); return; }
        if (!body.trim()) { toast.error("Mensagem vazia."); return; }

        setSending(true);
        try {
            const result = await sendEmail({
                destinatario: to.trim(),
                assunto: subject,
                corpo: body,
                anexoUrl: attachmentUrl,
                anexoNomeArquivo: attachmentName,
            });
            if (result.ok) {
                toast.success("E-mail enviado!", { description: `Para ${to}` });
                onSent?.(to);
                onClose();
            } else {
                toast.error("Falha ao enviar e-mail", { description: result.error });
            }
        } finally {
            setSending(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <DialogContent className="sm:max-w-[520px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Mail className="h-5 w-5 text-[#1E3A8A]" />
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
                            E-mail destinatário <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            type="email"
                            value={to}
                            onChange={(e) => setTo(e.target.value)}
                            placeholder="cliente@exemplo.com"
                            className="h-9"
                        />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[11px] font-bold uppercase tracking-wider text-[#555]">Assunto</Label>
                        <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="h-9" />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-[11px] font-bold uppercase tracking-wider text-[#555]">Mensagem</Label>
                        <textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            rows={8}
                            className="w-full px-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#1D2939] focus:outline-none focus:border-[#1E3A8A]"
                        />
                    </div>
                    {attachmentUrl && (
                        <p className="text-[11px] text-[#667085]">📎 Anexo: <strong>{attachmentName}</strong></p>
                    )}
                </div>
                <DialogFooter className="gap-2">
                    <Button variant="outline" onClick={onClose} disabled={sending}>Cancelar</Button>
                    <Button
                        onClick={handleSend}
                        disabled={sending || !to.trim() || !subject.trim() || !body.trim()}
                        className="bg-[#1E3A8A] hover:bg-[#1D2939] text-white"
                    >
                        {sending ? "Enviando..." : "Enviar"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
