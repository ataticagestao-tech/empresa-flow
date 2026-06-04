import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useEntitlements } from "@/hooks/useEntitlements";

/** Perfil do negócio que adapta o checklist de implantação. */
export interface ImplantacaoPerfil {
  vende: "produto" | "servico" | "ambos";
  emite_nf: boolean;
  controla_estoque: boolean;
  identifica_clientes: boolean;
  preenchido_em?: string | null;
}

export interface ImplantacaoStep {
  key: string;
  title: string;
  desc: string;
  cta: string;
  route: string;
  done: boolean;
}

const mapVendeFromActivity = (ap?: string | null): ImplantacaoPerfil["vende"] =>
  ap === "comercio" ? "produto" : ap === "servico" ? "servico" : ap === "mista" ? "ambos" : "ambos";

/**
 * Checklist de implantação ADAPTATIVO: as etapas que aparecem dependem do
 * perfil do negócio (vende produto/serviço, emite NF, controla estoque,
 * identifica clientes) + dos módulos do plano. Fonte única usada pela página
 * /implantacao e pelo balão "Comece por aqui".
 */
export function useImplantacao(companyId?: string) {
  const { activeClient } = useAuth();
  const { hasModule } = useEntitlements();
  const db = activeClient as any;
  const queryClient = useQueryClient();

  const countSafe = async (table: string, build?: (q: any) => any): Promise<number> => {
    try {
      let q = db.from(table).select("id", { count: "exact", head: true }).eq("company_id", companyId);
      if (build) q = build(q);
      const { count } = await q;
      return count ?? 0;
    } catch {
      return 0;
    }
  };

  const { data, isLoading } = useQuery({
    queryKey: ["implantacao", companyId],
    enabled: !!companyId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data: emp } = await db
        .from("companies")
        .select("onboarding_perfil, activity_profile, enable_nfse, enable_nfe, enable_nfce")
        .eq("id", companyId)
        .single();

      const raw = (emp?.onboarding_perfil ?? {}) as Partial<ImplantacaoPerfil>;
      const perfil: ImplantacaoPerfil = {
        vende: raw.vende ?? mapVendeFromActivity(emp?.activity_profile),
        emite_nf: raw.emite_nf ?? !!(emp?.enable_nfse || emp?.enable_nfe || emp?.enable_nfce),
        controla_estoque: raw.controla_estoque ?? hasModule("estoque"),
        identifica_clientes: raw.identifica_clientes ?? true,
        preenchido_em: raw.preenchido_em ?? null,
      };

      const [coa, banks, prod, cli, sup, emp_, vendas, cr, cp, bt, nfseCfg] = await Promise.all([
        countSafe("chart_of_accounts"),
        countSafe("bank_accounts"),
        countSafe("products"),
        countSafe("clients"),
        countSafe("suppliers"),
        countSafe("employees"),
        countSafe("vendas", (q) => q.is("deleted_at", null)),
        countSafe("contas_receber", (q) => q.is("deleted_at", null)),
        countSafe("contas_pagar", (q) => q.is("deleted_at", null)),
        countSafe("bank_transactions"),
        countSafe("nfse_configuracoes"),
      ]);

      return {
        perfil,
        counts: { coa, banks, prod, cli, sup, emp: emp_, vendas, cr, cp, bt, nfseCfg },
      };
    },
  });

  const perfil = data?.perfil;
  const c = data?.counts;

  const steps: ImplantacaoStep[] = useMemo(() => {
    if (!perfil || !c) return [];
    const vendeProduto = perfil.vende === "produto" || perfil.vende === "ambos";
    const vendeServico = perfil.vende === "servico" || perfil.vende === "ambos";
    const catalogoLabel = vendeProduto && vendeServico ? "produtos e serviços" : vendeServico ? "serviços" : "produtos";

    const all: (ImplantacaoStep | null)[] = [
      { key: "empresa", title: "Empresa cadastrada", desc: "Razão social, CNPJ e regime tributário.", cta: "Ver dados", route: "/empresas", done: true },
      { key: "plano_contas", title: "Plano de contas", desc: "Categorias contábeis (dá pra copiar um modelo pronto).", cta: "Configurar", route: "/plano-contas", done: c.coa > 0 },
      { key: "conta_bancaria", title: "Conta bancária", desc: "Banco, conta e ACCTID do OFX (p/ conciliação).", cta: "Adicionar", route: "/contas-bancarias", done: c.banks > 0 },
      { key: "catalogo", title: `Cadastrar ${catalogoLabel}`, desc: `Seu catálogo de ${catalogoLabel} para usar nas vendas.`, cta: "Cadastrar", route: "/operacional", done: c.prod > 0 },
      (perfil.controla_estoque && hasModule("estoque"))
        ? { key: "estoque", title: "Controle de estoque", desc: "Defina estoque mínimo e a posição inicial dos produtos.", cta: "Abrir estoque", route: "/estoque", done: c.prod > 0 }
        : null,
      perfil.identifica_clientes
        ? { key: "clientes", title: "Cadastrar clientes", desc: "Quem compra de você (pode importar planilha).", cta: "Cadastrar", route: "/clientes", done: c.cli > 0 }
        : null,
      { key: "fornecedores", title: "Cadastrar fornecedores", desc: "Quem você paga (pode importar planilha).", cta: "Cadastrar", route: "/fornecedores", done: c.sup > 0 },
      hasModule("rh")
        ? { key: "funcionarios", title: "Cadastrar funcionários", desc: "Sua equipe, para a folha de pagamento.", cta: "Cadastrar", route: "/funcionarios", done: c.emp > 0 }
        : null,
      (perfil.emite_nf && hasModule("fiscal"))
        ? { key: "nfse", title: "Configurar nota fiscal", desc: "Dados de emissão da NFSe.", cta: "Configurar", route: "/configuracoes/nfse", done: c.nfseCfg > 0 }
        : null,
      { key: "lancamento", title: "Primeira venda ou despesa", desc: "Lance a primeira receita (Vendas) ou despesa (Contas a Pagar).", cta: "Lançar", route: "/vendas", done: c.vendas > 0 || c.cr > 0 || c.cp > 0 },
      { key: "conciliacao", title: "Importar extrato e conciliar", desc: "Suba um OFX/CSV ou conecte o e-mail do banco.", cta: "Conciliar", route: "/conciliacao", done: c.bt > 0 },
    ];
    return all.filter(Boolean) as ImplantacaoStep[];
  }, [perfil, c, hasModule]);

  const doneCount = steps.filter((s) => s.done).length;
  const total = steps.length;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  const allDone = total > 0 && doneCount === total;

  const savePerfil = async (novo: Omit<ImplantacaoPerfil, "preenchido_em">) => {
    if (!companyId) return;
    const payload: ImplantacaoPerfil = { ...novo, preenchido_em: new Date().toISOString() };
    // Sincroniza activity_profile (fallback de setor) com o "vende"; não mexe nas flags de NF (têm tela própria).
    const activity_profile = novo.vende === "produto" ? "comercio" : novo.vende === "servico" ? "servico" : "mista";
    await db.from("companies").update({ onboarding_perfil: payload, activity_profile }).eq("id", companyId);
    await queryClient.invalidateQueries({ queryKey: ["implantacao", companyId] });
  };

  return {
    perfil,
    perfilPreenchido: !!perfil?.preenchido_em,
    steps,
    doneCount,
    total,
    pct,
    allDone,
    isLoading,
    savePerfil,
  };
}
