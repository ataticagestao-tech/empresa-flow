import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";

/**
 * IDs de CR/CP que estão REALMENTE conciliados com o extrato — ou seja, linkados a uma
 * bank_transaction (reconciled_receivable_id / reconciled_payable_id). É a verdade do
 * "conciliado": que um título esteja "pago" NÃO quer dizer que bateu com o banco.
 *
 * Usado pelas telas de Movimentações, Contas a Receber e Contas a Pagar.
 */
export function useConciliadasIds(companyId?: string) {
  const { selectedCompany } = useCompany();
  const { activeClient } = useAuth();
  const db = activeClient as any;
  const cId = companyId || selectedCompany?.id;

  const { data } = useQuery({
    queryKey: ["conciliadas_ids", cId],
    enabled: !!db && !!cId,
    queryFn: async (): Promise<{ cr: string[]; cp: string[] }> => {
      if (!db || !cId) return { cr: [], cp: [] };
      const { data } = await db
        .from("bank_transactions")
        .select("reconciled_receivable_id, reconciled_payable_id")
        .eq("company_id", cId)
        .or("reconciled_receivable_id.not.is.null,reconciled_payable_id.not.is.null")
        .limit(100000);
      const cr: string[] = [];
      const cp: string[] = [];
      for (const r of (data || []) as any[]) {
        if (r.reconciled_receivable_id) cr.push(r.reconciled_receivable_id);
        if (r.reconciled_payable_id) cp.push(r.reconciled_payable_id);
      }
      return { cr, cp };
    },
  });

  const crSet = useMemo(() => new Set(data?.cr || []), [data]);
  const cpSet = useMemo(() => new Set(data?.cp || []), [data]);

  return {
    /** CR (a receber) conciliada com o banco? */
    isCRConciliada: (id: string | null | undefined) => !!id && crSet.has(id),
    /** CP (a pagar) conciliada com o banco? */
    isCPConciliada: (id: string | null | undefined) => !!id && cpSet.has(id),
  };
}

/** Selo visual reutilizável: "✓ conciliado" quando bateu com o banco; só o ícone ⏳ quando não. */
export function SeloConciliado({ conciliado }: { conciliado: boolean }) {
  return conciliado ? (
    <span className="inline-block px-1.5 py-0.5 rounded text-[11px] font-bold bg-[#ECFDF3] text-[#027A48]" title="Conciliado com o extrato do banco">
      ✓ conciliado
    </span>
  ) : (
    <span className="inline-block text-[11px] grayscale" title="Ainda não conciliado com o extrato">
      ⏳
    </span>
  );
}
