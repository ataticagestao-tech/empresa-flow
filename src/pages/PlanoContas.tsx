import { AppLayout } from "@/components/layout/AppLayout";
import { ChartOfAccountsManager } from "@/components/companies/ChartOfAccountsManager";
import { useCompany } from "@/contexts/CompanyContext";

export default function PlanoContas() {
    const { selectedCompany } = useCompany();

    return (
        <AppLayout title="Plano de Contas">
            {selectedCompany?.id ? (
                <ChartOfAccountsManager companyId={selectedCompany.id} />
            ) : (
                <p className="text-center text-muted-foreground mt-10">Selecione uma empresa para ver o plano de contas.</p>
            )}
        </AppLayout>
    );
}
