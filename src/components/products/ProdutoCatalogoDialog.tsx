import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package, X, Search, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { formatBRL } from "@/lib/format";
import { EmptyState } from "@/components/ui/empty-state";

export interface CatalogoProduto {
  id: string;
  code: string | null;
  description: string;
  price: number | null;
  conta_contabil_id: string | null;
}

/**
 * Catálogo de produtos/serviços — diálogo de seleção compartilhado.
 * Mesmo visual usado no Vendas; reaproveitado também na conciliação ("Lançar venda")
 * pra escolher itens. Devolve o produto escolhido via onPick (com a categoria contábil
 * cadastrada, pra a venda já sair categorizada).
 */
export function ProdutoCatalogoDialog({
  open,
  onClose,
  onPick,
  companyId,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (produto: CatalogoProduto) => void;
  companyId?: string;
}) {
  const { activeClient } = useAuth();
  const [term, setTerm] = useState("");

  const { data: produtos, isLoading } = useQuery({
    queryKey: ["catalogo_produtos", companyId],
    enabled: open && !!companyId,
    queryFn: async (): Promise<CatalogoProduto[]> => {
      if (!companyId) return [];
      const { data } = await (activeClient as any)
        .from("products")
        .select("id, code, description, price, conta_contabil_id")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("description");
      return (data || []) as CatalogoProduto[];
    },
  });

  const filtrados = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return produtos || [];
    return (produtos || []).filter(
      (p) => p.description.toLowerCase().includes(t) || (p.code || "").toLowerCase().includes(t),
    );
  }, [produtos, term]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="bg-[#071D41] px-5 py-3 flex items-center justify-between rounded-t-lg">
          <h2 className="text-sm font-bold text-white uppercase tracking-widest flex items-center gap-2">
            <Package size={16} /> Catálogo de Produtos e Serviços
          </h2>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 border-b border-[#eee]">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999]" />
            <input
              type="text"
              autoFocus
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Buscar por nome ou código..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-[#ccc] rounded-md bg-white text-[#1D2939] placeholder-[#999] focus:outline-none focus:border-[#059669] focus:ring-1 focus:ring-[#059669]"
            />
          </div>
          <p className="text-[11px] text-[#999] mt-1.5">
            {filtrados.length} produto{filtrados.length !== 1 ? "s" : ""} encontrado{filtrados.length !== 1 ? "s" : ""}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-[#999] text-sm">
              <Loader2 size={16} className="animate-spin" /> Carregando catálogo...
            </div>
          ) : (produtos?.length ?? 0) === 0 ? (
            <EmptyState
              icon={Package}
              title="Você ainda não tem produtos"
              description="Cadastre seus produtos e serviços no Operacional para usá-los nas vendas."
              actions={[{ label: "+ Cadastrar produto", to: "/operacional", onClick: onClose }]}
            />
          ) : filtrados.length === 0 ? (
            <div className="text-center py-8 text-[#999] text-sm">Nenhum produto encontrado para “{term}”.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-[#F6F2EB] sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 text-[11px] font-bold text-[#555] uppercase">Nome</th>
                  <th className="text-right px-4 py-2 text-[11px] font-bold text-[#555] uppercase">Preço</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#eee]">
                {filtrados.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => { onPick(p); onClose(); }}
                    className="cursor-pointer hover:bg-[#ECFDF4] transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-[#1D2939]">
                      {p.description}
                      {p.code && <span className="ml-2 text-[11px] text-[#999]">{p.code}</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[#039855] whitespace-nowrap">
                      {p.price != null && p.price > 0 ? formatBRL(p.price) : <span className="text-[#ccc]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="border-t border-[#eee] px-5 py-3 flex justify-end bg-[#F6F2EB] rounded-b-lg">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-[#555] border border-[#ccc] rounded-md hover:bg-[#F6F2EB] transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
