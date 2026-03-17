import { AppLayout } from "@/components/layout/AppLayout";
import { ChartOfAccountsManager } from "@/components/companies/ChartOfAccountsManager";

export default function PlanoContas() {
    return (
        <AppLayout title="Plano de Contas">
            <ChartOfAccountsManager />
        </AppLayout>
    );
}
