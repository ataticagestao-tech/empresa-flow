
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext"; // Assumindo contexto de empresa
import { useToast } from "@/components/ui/use-toast";

export interface Stage {
    id: string;
    pipeline_id: string;
    name: string;
    position: number;
    color: string;
}

export interface Opportunity {
    id: string;
    stage_id: string;
    title: string;
    value: number;
    client_name?: string; // Join
    expected_close_date?: string;
    status: string;
}

export function useCRM() {
    const { selectedCompany } = useCompany();
    const queryClient = useQueryClient();
    const { toast } = useToast();

    // 1. Fetch Stages (Assumindo um pipeline padrão único por enquanto)
    const { data: stages, isLoading: isLoadingStages } = useQuery({
        queryKey: ['crm_stages', selectedCompany?.id],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];

            // Tenta pegar o primeiro pipeline
            const { data: pipelines } = await supabase
                .from('crm_pipelines')
                .select('id')
                .eq('company_id', selectedCompany.id)
                .limit(1);

            let pipelineId = pipelines?.[0]?.id;

            // Se não existir, cria um padrão
            if (!pipelineId) {
                const { data: newPipe, error: pipeError } = await supabase
                    .from('crm_pipelines')
                    .insert({ company_id: selectedCompany.id, name: 'Funil de Vendas', is_default: true })
                    .select()
                    .single();

                if (pipeError) throw pipeError;
                pipelineId = newPipe.id;

                // Cria stages padrão
                const defaultStages = [
                    { pipeline_id: pipelineId, name: 'Prospecção', position: 0, color: '#98A2B3' },
                    { pipeline_id: pipelineId, name: 'Qualificação', position: 1, color: '#60a5fa' },
                    { pipeline_id: pipelineId, name: 'Proposta', position: 2, color: '#fbbf24' },
                    { pipeline_id: pipelineId, name: 'Negociação', position: 3, color: '#D92D20' },
                    { pipeline_id: pipelineId, name: 'Fechado Ganho', position: 4, color: '#10b981' },
                ];
                await supabase.from('crm_stages').insert(defaultStages);
            }

            // Busca stages
            const { data, error } = await supabase
                .from('crm_stages')
                .select('*')
                .eq('pipeline_id', pipelineId)
                .order('position');

            if (error) throw error;
            return data as Stage[];
        },
        enabled: !!selectedCompany?.id
    });

    // 2. Fetch Opportunities
    const { data: opportunities, isLoading: isLoadingOpps } = useQuery({
        queryKey: ['crm_opportunities', selectedCompany?.id],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await supabase
                .from('crm_opportunities')
                .select('*, clients(razao_social, nome_fantasia)')
                .eq('company_id', selectedCompany.id); // Pode filtrar por status!=archived depois

            if (error) throw error;

            return data.map((opp: any) => ({
                ...opp,
                client_name: opp.clients?.nome_fantasia || opp.clients?.razao_social || 'Sem Cliente'
            })) as Opportunity[];
        },
        enabled: !!selectedCompany?.id
    });

    // Mutation: Move Opportunity
    const moveOpportunity = useMutation({
        mutationFn: async ({ oppId, newStageId }: { oppId: string, newStageId: string }) => {
            const { error } = await supabase
                .from('crm_opportunities')
                .update({ stage_id: newStageId })
                .eq('id', oppId);
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['crm_opportunities'] });
        },
        onError: () => {
            toast({ title: "Erro ao mover card", variant: "destructive" });
        }
    });

    // Mutation: Create Opportunity
    const createOpportunity = useMutation({
        mutationFn: async (newOpp: Partial<Opportunity>) => {
            // Precisa pipeline_id. Vamos pegar do stage ou buscar o default.
            // Simplicidade: pegar o primeiro pipeline da empresa de novo (ineficiente mas seguro p MVP)
            const { data: pipelines } = await supabase
                .from('crm_pipelines')
                .select('id')
                .eq('company_id', selectedCompany?.id)
                .limit(1);

            const pipelineId = pipelines?.[0]?.id;
            if (!pipelineId) throw new Error("Pipeline não encontrado");

            const { error } = await supabase
                .from('crm_opportunities')
                .insert({
                    ...newOpp,
                    company_id: selectedCompany?.id,
                    pipeline_id: pipelineId
                });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['crm_opportunities'] });
            toast({ title: "Oportunidade criada!" });
        }
    });

    return {
        stages,
        opportunities,
        isLoading: isLoadingStages || isLoadingOpps,
        moveOpportunity,
        createOpportunity
    };
}
