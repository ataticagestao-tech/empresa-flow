
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/components/ui/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { AccountsPayableSchema, AccountsPayable } from "../../domain/schemas/accounts-payable.schema";
import { FinanceService } from "../../infra/finance.services";
import { useState } from "react";
import { format } from "date-fns";

// Corrige timezone: formata Date como "yyyy-MM-dd" local (não UTC)
function dateToLocalString(d: Date | null | undefined): string | null {
    if (!d) return null;
    return format(d, "yyyy-MM-dd");
}

export function usePayableForm(initialData?: AccountsPayable, onSuccess?: () => void) {
    const { toast } = useToast();
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const queryClient = useQueryClient();
    const financeService = new FinanceService(activeClient);

    const [isUploading, setIsUploading] = useState(false);

    const form = useForm<AccountsPayable>({
        resolver: zodResolver(AccountsPayableSchema),
        defaultValues: initialData || {
            description: "",
            supplier_id: "",
            amount: undefined as any, // sem "0" na frente
            due_date: new Date(),
            competencia: "",
            category_id: "",
            status: "pending",
            recurrence: "none",
            is_fixed_cost: false,
            recurrence_day: undefined,
            recurrence_start: "",
            recurrence_end: "",
            recurrence_count: undefined,
            barcode: "",
            pix_key_type: undefined,
            pix_key: "",
            payment_method: "",
            observations: "",
            invoice_number: "",
            pis_amount: 0, pis_retain: false,
            cofins_amount: 0, cofins_retain: false,
            csll_amount: 0, csll_retain: false,
            ir_amount: 0, ir_retain: false,
            iss_amount: 0, iss_retain: false,
            inss_amount: 0, inss_retain: false,
        },
    });

    const saveMutation = useMutation({
        mutationFn: async (data: AccountsPayable) => {
            if (!selectedCompany?.id) throw new Error("Empresa não selecionada");

            // Limpar "none" dos selects
            const cleanId = (v: string | undefined | null) => (!v || v === "none" || v === "") ? null : v;

            // Montar payload apenas com colunas que existem na tabela accounts_payable
            // Apenas colunas que existem na tabela accounts_payable do Supabase
            const payload: Record<string, any> = {
                company_id: selectedCompany.id,
                description: data.description,
                amount: data.amount,
                status: data.status || "pending",
                due_date: dateToLocalString(data.due_date),
                payment_date: dateToLocalString(data.payment_date),
                supplier_id: cleanId(data.supplier_id),
                category_id: cleanId(data.category_id),
                payment_method: (!data.payment_method || data.payment_method === "none") ? null : data.payment_method,
                barcode: data.barcode || null,
                observations: data.observations || null,
                file_url: data.file_url || null,
                recurrence: data.recurrence || null,
            };

            // Adicionar id se for edição
            if (data.id) payload.id = data.id;

            const { data: savedPayable, error } = await financeService.savePayable(payload as any);
            if (error) throw error;

            if (payload.status === 'paid' && payload.bank_account_id) {
                await financeService.createTransactionFromPayable(savedPayable.id, payload, selectedCompany.id);
            }

            return savedPayable;
        },
        onSuccess: () => {
            toast({ title: "Sucesso", description: "Conta a pagar salva com sucesso!" });
            queryClient.invalidateQueries({ queryKey: ["accounts_payable"] });
            queryClient.invalidateQueries({ queryKey: ["transactions"] });
            if (onSuccess) onSuccess();
        },
        onError: (error: any) => {
            console.error(error);
            toast({ title: "Erro", description: error?.message || "Falha ao salvar conta.", variant: "destructive" });
        }
    });

    const handleFileUpload = async (file: File) => {
        if (!selectedCompany) return;
        try {
            setIsUploading(true);
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `${selectedCompany.id}/payables/${fileName}`;

            const { error: uploadError } = await activeClient.storage
                .from('documents')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = activeClient.storage
                .from('documents')
                .getPublicUrl(filePath);

            form.setValue("file_url", publicUrl);
            toast({ title: "Arquivo anexado!" });
        } catch (error) {
            toast({ title: "Erro no upload", variant: "destructive" });
        } finally {
            setIsUploading(false);
        }
    };

    const save = form.handleSubmit(
        (data) => saveMutation.mutate(data),
        (errors) => {
            const msgs = Object.entries(errors)
                .map(([field, err]) => `${field}: ${err?.message || "inválido"}`)
                .join("\n");
            console.error("Validation errors:", errors);
            toast({
                title: "Campos obrigatórios",
                description: msgs || "Verifique os campos em vermelho",
                variant: "destructive"
            });
        }
    );

    return {
        form,
        save,
        isSaving: saveMutation.isPending,
        handleFileUpload,
        isUploading
    };
}
