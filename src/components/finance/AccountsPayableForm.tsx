
import { AccountsPayable } from "@/modules/finance/domain/schemas/accounts-payable.schema";
import { PayableForm } from "@/modules/finance/presentation/components/PayableForm";

interface AccountsPayableFormProps {
    onSuccess: () => void;
    initialData?: any; // Usando any no proxy para flexibilidade com legado, mas o interno tipa corretamente
}

/**
 * Componente Proxy para manter compatibilidade com o sistema legado,
 * redirecionando para a nova implementação modular em modules/finance.
 */
export function AccountsPayableForm({ onSuccess, initialData }: AccountsPayableFormProps) {
    // Adaptar dados iniciais se necessário (garantir tipos)
    // Converte string YYYY-MM-DD para Date local (evita shift de fuso UTC)
    const toLocalDate = (s: string | Date | null | undefined): Date | undefined => {
        if (!s) return undefined;
        if (s instanceof Date) return s;
        return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00") : new Date(s);
    };

    const normalizedData: AccountsPayable | undefined = initialData ? {
        ...initialData,
        // Garantir que datas sejam Date objects se vierem strings do DB
        due_date: toLocalDate(initialData.due_date) as Date,
        issue_date: toLocalDate(initialData.issue_date),
        register_date: toLocalDate(initialData.register_date),
        payment_date: toLocalDate(initialData.payment_date),
        // Garantir que valores monetários sejam números
        amount: Number(initialData.amount),
    } : undefined;

    return <PayableForm onSuccess={onSuccess} initialData={normalizedData} />;
}
