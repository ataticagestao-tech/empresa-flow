import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Saldo por conta bancária (view oficial v_saldo_contas_bancarias).
 * Usado pelo editor de "Saldo inicial" da projeção de caixa, onde a Izabel
 * marca/desmarca contas e pode sobrescrever o total (contas no sistema furam,
 * ex.: Stone com saldo negativo por repasse de cartão não conciliado).
 */

export interface ContaSaldo {
  id: string;
  nome: string;
  banco: string;
  tipo: string;
  saldoAtual: number;
}

export function useContasSaldo(companyId?: string) {
  const { selectedCompany } = useCompany();
  const { activeClient } = useAuth();
  const db = activeClient as any;
  const cId = companyId || selectedCompany?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["contas_saldo", cId],
    enabled: !!db && !!cId,
    queryFn: async (): Promise<ContaSaldo[]> => {
      if (!db || !cId) return [];
      const { data, error } = await db
        .from("v_saldo_contas_bancarias")
        .select("conta_bancaria_id, nome, banco, tipo, saldo_atual")
        .eq("company_id", cId);
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.conta_bancaria_id,
        nome: r.nome || "Conta",
        banco: r.banco || "",
        tipo: r.tipo || "",
        saldoAtual: Number(r.saldo_atual) || 0,
      }));
    },
  });

  return { contas: data ?? [], isLoading };
}

/* ────────────────────────────────────────────────────────────────────────
 * Fase 1 PLANO_SALDO_CONCILIACAO — comparação Banco × Sistema × Diferença.
 * "Sistema" = saldo da view (initial_balance + movimentações).
 * "Banco" = último saldo de fechamento declarado no extrato (bank_statement_balances).
 * Diferença = sistema − banco (positivo = sistema acha que tem mais que o banco).
 * ──────────────────────────────────────────────────────────────────────── */

export interface SaldoComparacao {
  contaId: string;
  nome: string;
  tipo: string;
  saldoSistema: number;
  /** null se a conta nunca teve extrato importado. */
  saldoBanco: number | null;
  /** Data do saldo do banco ('YYYY-MM-DD'), ou null. */
  asOfDate: string | null;
  /** De onde veio o saldo de referência: 'ofx'/'pdf' = extrato; 'contagem' = caixa contado. */
  fonteSaldo: string | null;
  /** Tipo da conta (cash = caixa físico, sem extrato). */
  accountType: string;
  /** saldoSistema − saldoBanco; null se sem saldo do banco. */
  diferenca: number | null;
  /** Saldo a USAR (Fase 2): banco quando tem extrato, senão sistema (fallback). */
  saldoEfetivo: number;
  /** De onde veio o saldoEfetivo. */
  fonte: "banco" | "sistema";
  /** Fase 3: lançamentos do extrato ainda NÃO conciliados (a explicar a diferença). */
  pendentesCount: number;
  pendentesTotal: number;
  /** Fase 3.2: período fechado até esta data ('YYYY-MM-DD'), ou null se aberto. */
  fechadoAte: string | null;
  /** Diferença registrada no fechamento. */
  fechadoDiferenca: number | null;
}

export function useSaldoBancoVsSistema(companyId?: string) {
  const { selectedCompany } = useCompany();
  const { activeClient } = useAuth();
  const db = activeClient as any;
  const cId = companyId || selectedCompany?.id;

  const { data, isLoading } = useQuery({
    queryKey: ["saldo_banco_vs_sistema", cId],
    enabled: !!db && !!cId,
    queryFn: async (): Promise<SaldoComparacao[]> => {
      if (!db || !cId) return [];

      const [{ data: contas }, { data: balances }, { data: pendentes }, { data: closings }] = await Promise.all([
        db.from("v_saldo_contas_bancarias").select("conta_bancaria_id, nome, tipo, saldo_atual").eq("company_id", cId),
        db.from("bank_statement_balances").select("bank_account_id, as_of_date, closing_balance, source").eq("company_id", cId).order("as_of_date", { ascending: false }),
        db.from("bank_transactions").select("bank_account_id, amount").eq("company_id", cId).eq("status", "pending").limit(100000),
        db.from("reconciliation_closings").select("bank_account_id, period_end, difference").eq("company_id", cId).order("period_end", { ascending: false }),
      ]);

      // Último saldo de banco por conta (já vem ordenado desc → 1ª ocorrência é a mais recente).
      const ultimoPorConta = new Map<string, { saldo: number; data: string; source: string | null }>();
      for (const b of (balances || []) as any[]) {
        if (!ultimoPorConta.has(b.bank_account_id)) {
          ultimoPorConta.set(b.bank_account_id, { saldo: Number(b.closing_balance) || 0, data: b.as_of_date, source: b.source ?? null });
        }
      }

      // Lançamentos pendentes (não conciliados) por conta.
      const pendPorConta = new Map<string, { count: number; total: number }>();
      for (const p of (pendentes || []) as any[]) {
        const g = pendPorConta.get(p.bank_account_id) || { count: 0, total: 0 };
        g.count += 1;
        g.total += Number(p.amount) || 0;
        pendPorConta.set(p.bank_account_id, g);
      }

      // Último fechamento por conta (desc → 1ª ocorrência é o mais recente).
      const fechPorConta = new Map<string, { ate: string; dif: number | null }>();
      for (const f of (closings || []) as any[]) {
        if (!fechPorConta.has(f.bank_account_id)) {
          fechPorConta.set(f.bank_account_id, { ate: f.period_end, dif: f.difference != null ? Number(f.difference) : null });
        }
      }

      return ((contas || []) as any[]).map((c) => {
        const banco = ultimoPorConta.get(c.conta_bancaria_id) ?? null;
        const saldoSistema = Number(c.saldo_atual) || 0;
        const saldoBanco = banco ? banco.saldo : null;
        const pend = pendPorConta.get(c.conta_bancaria_id) ?? { count: 0, total: 0 };
        const fech = fechPorConta.get(c.conta_bancaria_id) ?? null;
        return {
          contaId: c.conta_bancaria_id,
          nome: c.nome || "Conta",
          tipo: c.tipo || "",
          saldoSistema,
          saldoBanco,
          asOfDate: banco ? banco.data : null,
          fonteSaldo: banco ? banco.source : null,
          accountType: c.tipo || "",
          diferenca: saldoBanco != null ? Number((saldoSistema - saldoBanco).toFixed(2)) : null,
          // Fase 2: usa o banco como verdade quando existe extrato; senão, fallback no sistema.
          saldoEfetivo: saldoBanco != null ? saldoBanco : saldoSistema,
          fonte: saldoBanco != null ? "banco" : "sistema",
          pendentesCount: pend.count,
          pendentesTotal: Number(pend.total.toFixed(2)),
          fechadoAte: fech ? fech.ate : null,
          fechadoDiferenca: fech ? fech.dif : null,
        };
      });
    },
  });

  return { comparacao: data ?? [], isLoading };
}
