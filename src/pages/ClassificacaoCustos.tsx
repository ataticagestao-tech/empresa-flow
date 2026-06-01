import { useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { classificaFixoVariavel } from "@/modules/finance/domain/custoFixoVariavel";

/**
 * Tela de ajuste FIXO × VARIÁVEL das contas de custo/despesa (Ponto de Equilíbrio).
 *
 * Lista apenas contas analíticas de custo/despesa (account_type in cost,expense) e
 * permite definir manualmente chart_of_accounts.expense_nature ('fixa' | 'variavel' | null).
 * "Auto" = NULL → o cálculo usa a heurística; a sugestão da heurística é mostrada em cinza.
 * Edição manual conta-a-conta (sem bulk write).
 */

interface ContaCusto {
  id: string;
  code: string;
  name: string;
  account_type: string;
  dre_group: string | null;
  expense_nature: string | null;
}

type NatVal = "auto" | "fixa" | "variavel";

const SEL = "border border-[#ccc] rounded-md px-2 py-1 text-[12px] text-[#1D2939] bg-white focus:border-[#059669] focus:outline-none";

export function ClassificacaoCustos() {
  const { activeClient } = useAuth();
  const { selectedCompany } = useCompany();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data: contas = [], isLoading } = useQuery({
    queryKey: ["chart_of_accounts_custos", selectedCompany?.id],
    enabled: !!selectedCompany?.id,
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data, error } = await (activeClient as any)
        .from("chart_of_accounts")
        .select("id, code, name, account_type, dre_group, expense_nature, is_analytical")
        .eq("company_id", selectedCompany.id)
        .eq("status", "active")
        .in("account_type", ["cost", "expense"])
        .order("code");
      if (error) throw error;
      return (data || [])
        .filter((c: any) => (c.is_analytical ?? c.is_analytic ?? false) === true)
        .map((c: any) => ({
          id: c.id,
          code: c.code,
          name: c.name,
          account_type: c.account_type,
          dre_group: c.dre_group ?? null,
          expense_nature: c.expense_nature ?? null,
        })) as ContaCusto[];
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return contas;
    const q = search.toLowerCase();
    return contas.filter((c) => c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q));
  }, [contas, search]);

  const stats = useMemo(() => {
    let fixa = 0,
      variavel = 0,
      auto = 0;
    for (const c of contas) {
      if (c.expense_nature === "fixa") fixa++;
      else if (c.expense_nature === "variavel") variavel++;
      else auto++;
    }
    return { total: contas.length, fixa, variavel, auto };
  }, [contas]);

  const handleChange = async (conta: ContaCusto, val: NatVal) => {
    const expense_nature = val === "auto" ? null : val;
    setSavingId(conta.id);
    try {
      const { error } = await (activeClient as any)
        .from("chart_of_accounts")
        .update({ expense_nature })
        .eq("id", conta.id);
      if (error) throw error;
      toast.success(`${conta.code} — ${val === "auto" ? "Automático" : val === "fixa" ? "Fixo" : "Variável"}`);
      // Atualiza a lista local + invalida o que depende da classificação.
      queryClient.invalidateQueries({ queryKey: ["chart_of_accounts_custos"] });
      queryClient.invalidateQueries({ queryKey: ["ponto_equilibrio"] });
      queryClient.invalidateQueries({ queryKey: ["ponto_equilibrio_consolidado"] });
      queryClient.invalidateQueries({ queryKey: ["ponto_equilibrio_serie"] });
    } catch (err: any) {
      toast.error("Erro: " + (err.message || "Erro desconhecido"));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="border border-[#D0D5DD] rounded bg-white overflow-hidden">
      {/* Aviso explicativo */}
      <div className="bg-[#F6F2EB] border-b border-[#D0D5DD] px-4 py-3">
        <p className="text-[12px] text-[#475467] leading-relaxed m-0">
          Marque cada conta de custo/despesa como <strong>Fixo</strong> (não varia com a venda: aluguel, salários,
          software) ou <strong>Variável</strong> (escala com a venda: impostos sobre venda, taxa de cartão, comissão,
          CMV, insumos). <strong>Automático</strong> deixa o sistema decidir pela heurística. Usado no <strong>Ponto de
          Equilíbrio</strong>.
        </p>
        <div className="flex gap-4 mt-2 text-[11px] font-bold">
          <span className="text-[#667085]">{stats.total} contas</span>
          <span className="text-[#039855]">{stats.variavel} variável</span>
          <span className="text-[#071D41]">{stats.fixa} fixo</span>
          <span className="text-[#98A2B3]">{stats.auto} automático</span>
        </div>
      </div>

      {/* Busca */}
      <div className="px-4 py-2.5 border-b border-[#EAECF0]">
        <input
          type="text"
          placeholder="Buscar conta de custo/despesa..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-[#D0D5DD] rounded px-3 py-1.5 text-[13px] text-black bg-white focus:border-black focus:outline-none w-full"
        />
      </div>

      {/* Cabeçalho */}
      <div className="bg-white border-b-2 border-[#D0D5DD] px-3 py-3 flex items-center gap-4 text-[12px] font-bold uppercase tracking-wider text-black">
        <span className="w-20">Código</span>
        <span className="flex-1 min-w-0">Conta</span>
        <span className="w-40 text-right">Fixo / Variável</span>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-sm text-[#555]">Carregando contas...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-[#555]">Nenhuma conta de custo/despesa encontrada.</div>
      ) : (
        <div className="max-h-[600px] overflow-y-auto">
          {filtered.map((conta) => {
            const val: NatVal =
              conta.expense_nature === "fixa" ? "fixa" : conta.expense_nature === "variavel" ? "variavel" : "auto";
            const sugestao = classificaFixoVariavel(conta.code, conta.name, conta.dre_group);
            return (
              <div
                key={conta.id}
                className="bg-white px-3 py-1.5 flex items-center gap-4 border-b border-[#F1F3F5] hover:bg-[#F6F2EB]"
              >
                <span className="text-[12px] text-[#667085] w-20 font-mono">{conta.code}</span>
                <span className="text-[13px] text-black flex-1 min-w-0 truncate">{conta.name}</span>
                <div className="w-40 flex items-center justify-end gap-2">
                  {val === "auto" && (
                    <span className="text-[10.5px] text-[#98A2B3] whitespace-nowrap">
                      auto ({sugestao === "variavel" ? "variável" : "fixo"})
                    </span>
                  )}
                  <select
                    value={val}
                    disabled={savingId === conta.id}
                    onChange={(e) => handleChange(conta, e.target.value as NatVal)}
                    className={`${SEL} ${savingId === conta.id ? "opacity-50" : ""}`}
                  >
                    <option value="auto">Automático</option>
                    <option value="fixa">Fixo</option>
                    <option value="variavel">Variável</option>
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
