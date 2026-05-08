
import { ReceivableForm } from "@/modules/finance/presentation/components/ReceivableForm";
import { AccountsReceivable } from "@/modules/finance/domain/schemas/accounts-receivable.schema";

interface AccountsReceivableFormProps {
    onSuccess: () => void;
    initialData?: any; // Aceita any para compatibilidade com dados legados
}

/**
 * PROXY COMPONENT
 * Este componente substitui o antigo monolito e redireciona para a nova implementação modular.
 * Mantém a interface de props antiga para não quebrar o resto do sistema.
 */
export function AccountsReceivableForm({ onSuccess, initialData }: AccountsReceivableFormProps) {
    // Adaptador simples de dados se necessário
    // Converte string YYYY-MM-DD para Date local (evita shift de fuso UTC)
    const toLocalDate = (s: string | Date | null | undefined): Date | undefined => {
        if (!s) return undefined;
        if (s instanceof Date) return s;
        return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00") : new Date(s);
    };

    const adaptedData: Partial<AccountsReceivable> | undefined = initialData ? {
        ...initialData,
        // Garante conversão de datas strings para Date objects se vierem do JSON
        due_date: toLocalDate(initialData.due_date),
        issue_date: toLocalDate(initialData.issue_date)
    } : undefined;

    return (
        <ReceivableForm
            onSuccess={onSuccess}
            initialData={adaptedData}
            onCancel={onSuccess} // Usa onSuccess como cancelamento pois o Dialog fecha igual
        />
    );
}
