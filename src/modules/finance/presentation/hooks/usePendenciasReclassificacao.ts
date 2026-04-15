import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";

/**
 * Conta movimentacoes orfas (sem conta_receber_id / conta_pagar_id) que
 * precisam ser reclassificadas pelo usuario. Essas surgem quando CRs/CPs
 * pagas sao excluidas — a movimentacao bancaria continua no sistema mas
 * perde o vinculo com o lancamento original.
 *
 * Filtro: ignora movs com origem identificavel (conta_receber, conta_pagar,
 * transferencia) — essas nasceram com vinculo implicito e nao devem ser
 * tratadas como pendencia de reclassificacao, mesmo que o FK esteja NULL
 * (bug historico da RPC conciliar_lote corrigido em 2026-04-15).
 */
const ORIGENS_IGNORADAS = ["conta_receber", "conta_pagar", "transferencia"];

export function usePendenciasReclassificacao() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();

    const query = useQuery({
        queryKey: ["pendencias-reclassificacao", selectedCompany?.id],
        enabled: !!selectedCompany?.id,
        queryFn: async () => {
            const ac = activeClient as any;
            const origensFilter = `(${ORIGENS_IGNORADAS.join(",")})`;

            // Credito orfao (receita sem CR vinculada e sem origem identificavel)
            const { count: creditoCount } = await ac
                .from("movimentacoes")
                .select("id", { count: "exact", head: true })
                .eq("company_id", selectedCompany!.id)
                .eq("tipo", "credito")
                .is("conta_receber_id", null)
                .eq("status_conciliacao", "pendente")
                .or(`origem.is.null,origem.not.in.${origensFilter}`);

            // Debito orfao (despesa sem CP vinculada e sem origem identificavel)
            const { count: debitoCount } = await ac
                .from("movimentacoes")
                .select("id", { count: "exact", head: true })
                .eq("company_id", selectedCompany!.id)
                .eq("tipo", "debito")
                .is("conta_pagar_id", null)
                .eq("status_conciliacao", "pendente")
                .or(`origem.is.null,origem.not.in.${origensFilter}`);

            // Soma dos valores pendentes (para exibicao)
            const { data: pendencias } = await ac
                .from("movimentacoes")
                .select("tipo, valor")
                .eq("company_id", selectedCompany!.id)
                .or("and(tipo.eq.credito,conta_receber_id.is.null),and(tipo.eq.debito,conta_pagar_id.is.null)")
                .eq("status_conciliacao", "pendente")
                .or(`origem.is.null,origem.not.in.${origensFilter}`);

            const totalCredito = (pendencias || [])
                .filter((m: any) => m.tipo === "credito")
                .reduce((s: number, m: any) => s + Number(m.valor || 0), 0);
            const totalDebito = (pendencias || [])
                .filter((m: any) => m.tipo === "debito")
                .reduce((s: number, m: any) => s + Number(m.valor || 0), 0);

            return {
                creditoCount: creditoCount || 0,
                debitoCount: debitoCount || 0,
                totalCount: (creditoCount || 0) + (debitoCount || 0),
                totalCredito,
                totalDebito,
            };
        },
        staleTime: 30_000,
    });

    return {
        data: query.data,
        isLoading: query.isLoading,
    };
}
