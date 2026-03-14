
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
            const cleanId = (v: string | undefined | null) => (!v || v === "none") ? null : v;

            const payload = {
                ...data,
                company_id: selectedCompany.id,
                supplier_id: cleanId(data.supplier_id),
                category_id: cleanId(data.category_id),
                department_id: cleanId(data.department_id),
                project_id: cleanId(data.project_id),
                bank_account_id: cleanId(data.bank_account_id),
                payment_method: data.payment_method === "none" ? null : data.payment_method,
                // Corrigir datas: usar formato local yyyy-MM-dd (evita -1 dia por UTC)
                due_date: dateToLocalString(data.due_date),
                payment_date: dateToLocalString(data.payment_date),
                issue_date: dateToLocalString(data.issue_date),
                register_date: dateToLocalString(data.register_date),
            };

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

    return {
        form,
        save: form.handleSubmit((data) => saveMutation.mutate(data)),
        isSaving: saveMutation.isPending,
        handleFileUpload,
        isUploading
    };
}
