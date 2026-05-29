// Dialog reutilizavel: dispara solicitar-cadastro pra um funcionario/fornecedor existente
// ou pra um destinatario novo (cadastro do zero).

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, MessageCircle } from "lucide-react";

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tipo: "funcionario" | "fornecedor" | "cliente";
    /** Se passado, atualiza esse cadastro. Senão, cria novo */
    targetId?: string;
    /** Nome pré-preenchido (vindo do cadastro existente) */
    nomeInicial?: string;
    /** Telefone pré-preenchido */
    telefoneInicial?: string;
    /** Callback após sucesso */
    onSuccess?: (solicitacaoId: string) => void;
}

export function SolicitarCadastroDialog({
    open,
    onOpenChange,
    tipo,
    targetId,
    nomeInicial = "",
    telefoneInicial = "",
    onSuccess,
}: Props) {
    const { selectedCompany } = useCompany();
    const [nome, setNome] = useState(nomeInicial);
    const [telefone, setTelefone] = useState(telefoneInicial);
    const [enviando, setEnviando] = useState(false);

    useEffect(() => {
        if (open) {
            setNome(nomeInicial);
            setTelefone(telefoneInicial);
        }
    }, [open, nomeInicial, telefoneInicial]);

    const handleEnviar = async () => {
        if (!selectedCompany?.id) {
            toast.error("Selecione uma empresa antes de enviar");
            return;
        }
        if (!nome.trim() || nome.trim().length < 2) {
            toast.error("Informe o nome do destinatário");
            return;
        }
        if (!telefone.trim()) {
            toast.error("Informe o telefone");
            return;
        }

        setEnviando(true);
        try {
            const payload: Record<string, any> = {
                company_id: selectedCompany.id,
                tipo,
                nome: nome.trim(),
                telefone: telefone.trim(),
            };
            if (targetId) {
                if (tipo === "funcionario") payload.employee_id = targetId;
                else if (tipo === "cliente") payload.customer_id = targetId;
                else payload.supplier_id = targetId;
            }

            const { data, error } = await supabase.functions.invoke("solicitar-cadastro", {
                body: payload,
            });

            if (error) {
                let msg = (error as any)?.message || "Falha ao enviar";
                const ctx = (error as any)?.context;
                if (ctx && typeof ctx.json === "function") {
                    try {
                        const corpo = await ctx.json();
                        if (corpo?.error) {
                            msg = corpo.error;
                            if (corpo?.details) {
                                const det = typeof corpo.details === "string"
                                    ? corpo.details
                                    : JSON.stringify(corpo.details);
                                msg += ` — ${det}`;
                            }
                        }
                    } catch { /* corpo não é JSON, mantém msg genérica */ }
                }
                toast.error(msg);
                setEnviando(false);
                return;
            }

            if ((data as any)?.error) {
                toast.error((data as any).error);
                setEnviando(false);
                return;
            }

            const solicId = (data as any)?.solicitacao?.id;
            toast.success("WhatsApp enviado! Acompanhe em Cadastros Pendentes.");
            onOpenChange(false);
            if (onSuccess && solicId) onSuccess(solicId);
        } catch (e: any) {
            toast.error(e?.message || "Erro inesperado");
        } finally {
            setEnviando(false);
        }
    };

    const tituloTipo = tipo === "funcionario" ? "Funcionário" : tipo === "cliente" ? "Cliente" : "Fornecedor";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <MessageCircle className="w-5 h-5 text-emerald-600" />
                        Solicitar dados via WhatsApp
                    </DialogTitle>
                    <DialogDescription>
                        {targetId
                            ? `Vamos enviar uma mensagem para o ${tituloTipo.toLowerCase()} preencher os dados que faltam.`
                            : `Vamos pedir os dados de cadastro do ${tituloTipo.toLowerCase()} via WhatsApp.`}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    <div className="space-y-1.5">
                        <Label htmlFor="nome-destinatario">Nome</Label>
                        <Input
                            id="nome-destinatario"
                            value={nome}
                            onChange={(e) => setNome(e.target.value)}
                            placeholder={`Nome do ${tituloTipo.toLowerCase()}`}
                            disabled={enviando}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="telefone-destinatario">Telefone (com DDD)</Label>
                        <Input
                            id="telefone-destinatario"
                            value={telefone}
                            onChange={(e) => setTelefone(e.target.value)}
                            placeholder="11999998888"
                            disabled={enviando}
                        />
                        <p className="text-xs text-muted-foreground">
                            Será validado se o número tem WhatsApp ativo.
                        </p>
                    </div>

                    <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 text-xs text-emerald-900">
                        <strong>O que o destinatário recebe:</strong>
                        <ul className="mt-1.5 space-y-1 list-disc list-inside">
                            <li>Template com os campos a preencher (CPF/CNPJ, endereço, PIX, banco…)</li>
                            <li>Pode responder em texto ou enviar foto/PDF do RG/CNH/comprovante</li>
                            <li>Solicitação expira em 7 dias</li>
                            <li>Você aprova os dados antes de aplicar no cadastro</li>
                        </ul>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={enviando}>
                        Cancelar
                    </Button>
                    <Button onClick={handleEnviar} disabled={enviando} className="bg-emerald-600 hover:bg-emerald-700">
                        {enviando ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Enviando...
                            </>
                        ) : (
                            <>
                                <MessageCircle className="w-4 h-4 mr-2" />
                                Enviar WhatsApp
                            </>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
