import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { CheckCircle2, Circle, ChevronRight, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY_DISMISSED = "onboarding_checklist_dismissed";

type Step = {
  key: string;
  title: string;
  desc: string;
  cta: string;
  route: string;
  done: boolean;
};

interface OnboardingChecklistProps {
  companyId: string;
}

export function OnboardingChecklist({ companyId }: OnboardingChecklistProps) {
  const { activeClient } = useAuth();
  const navigate = useNavigate();
  const db = activeClient as any;

  const dismissedKey = `${STORAGE_KEY_DISMISSED}_${companyId}`;
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(dismissedKey) === "true"; } catch { return false; }
  });

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

  const steps: Step[] = useMemo(() => {
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

  const doneCount = steps.filter(s => s.done).length;
  const total = steps.length;
  const pct = Math.round((doneCount / total) * 100);
  const allDone = doneCount === total;

  if (isLoading || !status) return null;
  if (allDone && dismissed) return null;
  if (dismissed) return null;

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #EAECF0",
        borderRadius: 16,
        boxShadow: "0 2px 8px rgba(15, 23, 42, 0.06)",
        padding: 20,
        marginBottom: 20,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div
            style={{
              width: 40, height: 40, borderRadius: 10,
              background: allDone ? "#ECFDF3" : "#ECFDF4",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Sparkles size={20} style={{ color: allDone ? "#039855" : "#059669" }} />
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#1D2939", margin: 0, marginBottom: 2 }}>
              {allDone ? "Setup completo!" : "Comece por aqui"}
            </h3>
            <p style={{ fontSize: 13, color: "#667085", margin: 0 }}>
              {allDone
                ? "Você configurou tudo. Pode fechar este card."
                : `${doneCount} de ${total} passos concluídos — siga a ordem para ter o sistema rodando.`}
            </p>
          </div>
        </div>
        <button
          onClick={() => {
            try { localStorage.setItem(dismissedKey, "true"); } catch {}
            setDismissed(true);
          }}
          title="Ocultar"
          style={{
            background: "transparent", border: "none", cursor: "pointer",
            padding: 4, color: "#98A2B3", display: "flex",
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ height: 6, background: "#F2F4F7", borderRadius: 999, overflow: "hidden", marginBottom: 16 }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            background: allDone ? "#039855" : "#059669",
            transition: "width 0.3s ease",
          }}
        />
      </div>

      {/* Steps */}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {steps.map((step, idx) => (
          <button
            key={step.key}
            onClick={() => navigate(step.route)}
            disabled={step.done && idx === 0}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "12px 8px",
              background: "transparent",
              border: "none",
              borderRadius: 8,
              cursor: step.done && idx === 0 ? "default" : "pointer",
              textAlign: "left",
              width: "100%",
              transition: "background 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!(step.done && idx === 0)) e.currentTarget.style.background = "#F9FAFB";
            }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            {step.done ? (
              <CheckCircle2 size={20} style={{ color: "#039855", flexShrink: 0 }} />
            ) : (
              <Circle size={20} style={{ color: "#D0D5DD", flexShrink: 0 }} strokeWidth={1.5} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: step.done ? "#98A2B3" : "#1D2939",
                  textDecoration: step.done ? "line-through" : "none",
                  marginBottom: 2,
                }}
              >
                {step.title}
              </div>
              <div style={{ fontSize: 12, color: "#667085", lineHeight: 1.4 }}>
                {step.desc}
              </div>
            </div>
            {!step.done && (
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  fontSize: 12, fontWeight: 600, color: "#059669",
                  flexShrink: 0,
                }}
              >
                {step.cta}
                <ChevronRight size={14} />
              </div>
            )}
          </button>
        ))}
      </div>

      {!allDone && (
        <div
          style={{
            marginTop: 14, padding: "10px 12px",
            background: "#F9FAFB",
            borderRadius: 8,
            fontSize: 12, color: "#667085",
            display: "flex", gap: 8, alignItems: "center",
          }}
        >
          <span style={{ fontWeight: 600, color: "#1D2939" }}>Dica:</span>
          Cada passo abre a tela certa. Em dúvida, consulte a <a href="/ajuda" style={{ color: "#059669", fontWeight: 600 }}>Central de Ajuda</a>.
        </div>
      )}
    </div>
  );
}

export default OnboardingChecklist;
