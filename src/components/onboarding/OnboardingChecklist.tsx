import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";

const STORAGE_KEY_DISMISSED = "onboarding_checklist_dismissed";

export type OnboardingStep = {
  key: string;
  title: string;
  desc: string;
  cta: string;
  route: string;
  done: boolean;
};

// Status de onboarding da empresa, consumido pelo sino de notificações no header.
// Antes era um card grande no dashboard; agora é uma notificação discreta.
export function useOnboarding(companyId?: string) {
  const { activeClient } = useAuth();
  const db = activeClient as any;

  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(`${STORAGE_KEY_DISMISSED}_${companyId ?? ""}`) === "true");
    } catch {
      setDismissed(false);
    }
  }, [companyId]);

  const { data: status, isLoading } = useQuery({
    queryKey: ["onboarding_checklist", companyId],
    enabled: !!companyId,
    staleTime: 30_000,
    queryFn: async () => {
      const [coa, banks, cust, sup, emp, vendas, cr, cp, bt] = await Promise.all([
        db.from("chart_of_accounts").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        db.from("bank_accounts").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        db.from("customers").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        db.from("suppliers").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        db.from("employees").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        db.from("vendas").select("id", { count: "exact", head: true }).eq("company_id", companyId).is("deleted_at", null),
        db.from("contas_receber").select("id", { count: "exact", head: true }).eq("company_id", companyId).is("deleted_at", null),
        db.from("contas_pagar").select("id", { count: "exact", head: true }).eq("company_id", companyId).is("deleted_at", null),
        db.from("bank_transactions").select("id", { count: "exact", head: true }).eq("company_id", companyId),
      ]);
      return {
        chartOfAccounts: (coa.count ?? 0) > 0,
        bankAccount: (banks.count ?? 0) > 0,
        cadastros: ((cust.count ?? 0) + (sup.count ?? 0) + (emp.count ?? 0)) > 0,
        primeiraVenda: (vendas.count ?? 0) > 0,
        primeiroLancamento: ((cr.count ?? 0) + (cp.count ?? 0)) > 0,
        primeiraConciliacao: (bt.count ?? 0) > 0,
      };
    },
  });

  const steps: OnboardingStep[] = useMemo(() => {
    const s = status ?? {
      chartOfAccounts: false, bankAccount: false, cadastros: false,
      primeiraVenda: false, primeiroLancamento: false, primeiraConciliacao: false,
    };
    return [
      {
        key: "empresa",
        title: "Empresa cadastrada",
        desc: "Razão social, CNPJ, regime tributário e responsável.",
        cta: "Ver dados",
        route: "/empresas",
        done: true, // se chegou aqui, empresa já existe
      },
      {
        key: "plano_contas",
        title: "Plano de contas",
        desc: "Categorias contábeis (receitas, despesas, transferências). Tem opção de copiar um modelo pronto.",
        cta: "Configurar plano",
        route: "/plano-contas",
        done: s.chartOfAccounts,
      },
      {
        key: "conta_bancaria",
        title: "Conta bancária",
        desc: "Banco, agência, conta e ACCTID do OFX (para conciliação automática).",
        cta: "Adicionar conta",
        route: "/contas-bancarias",
        done: s.bankAccount,
      },
      {
        key: "cadastros",
        title: "Primeiro cliente, fornecedor ou funcionário",
        desc: "Quem você vende, quem você paga, quem trabalha com você.",
        cta: "Cadastrar",
        route: "/clientes",
        done: s.cadastros,
      },
      {
        key: "lancamento",
        title: "Primeira venda ou despesa",
        desc: "Lançar a primeira receita (Vendas) ou despesa (Contas a Pagar).",
        cta: "Lançar agora",
        route: "/vendas",
        done: s.primeiraVenda || s.primeiroLancamento,
      },
      {
        key: "conciliacao",
        title: "Importar extrato e conciliar",
        desc: "Suba um OFX/CSV ou conecte o e-mail do banco. O sistema concilia o que bate sozinho.",
        cta: "Ir para conciliação",
        route: "/conciliacao",
        done: s.primeiraConciliacao,
      },
    ];
  }, [status]);

  const doneCount = steps.filter((s) => s.done).length;
  const total = steps.length;
  const pct = Math.round((doneCount / total) * 100);
  const allDone = doneCount === total;

  // Há onboarding pendente para mostrar no sino?
  const pending = !!companyId && !isLoading && !!status && !allDone && !dismissed;

  const dismiss = () => {
    try { localStorage.setItem(`${STORAGE_KEY_DISMISSED}_${companyId ?? ""}`, "true"); } catch { /* ignore */ }
    setDismissed(true);
  };

  return { steps, doneCount, total, pct, allDone, dismissed, dismiss, isLoading, pending };
}
