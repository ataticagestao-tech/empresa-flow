import { AppLayout } from "@/components/layout/AppLayout";
import { PagePanel } from "@/components/layout/PagePanel";
import { AssistenteChat } from "@/components/assistente/AssistenteChat";
import { useCompany } from "@/contexts/CompanyContext";

export default function Assistente() {
  const { selectedCompany } = useCompany();

  return (
    <AppLayout title="Assistente">
      <div>
        <PagePanel
          title="Assistente Tatica"
          subtitle={
            selectedCompany
              ? `Converse e execute ações em ${selectedCompany.nome_fantasia || selectedCompany.razao_social}.`
              : "Converse e execute ações financeiras direto pelo chat."
          }
        >
          <AssistenteChat />
        </PagePanel>
      </div>
    </AppLayout>
  );
}
