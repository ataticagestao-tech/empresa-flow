import { useQuery } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { format, subMonths } from "date-fns";

export interface ScoreFinanceiro {
  score_geral: number;
  score_liquidez: number;
  score_lucratividade: number;
  score_compliance: number;
  score_endividamento: number;
  score_inadimplencia: number;
  alertas: { tipo: string; mensagem: string }[];
  tendencia: "subindo" | "caindo" | "estavel" | null;
  historico: { competencia: string; score_geral: number }[];
}

export function useScoreFinanceiro() {
  const { selectedCompany } = useCompany();
  const { activeClient } = useAuth();
  const db = activeClient as any;

  const { data: score, isLoading } = useQuery({
    queryKey: ["score_financeiro", selectedCompany?.id],
    queryFn: async (): Promise<ScoreFinanceiro> => {
      if (!selectedCompany?.id) throw new Error("No company");

      const competencia = format(new Date(), "yyyy-MM");
      const hoje = new Date();
      const seteDias = new Date(hoje);
      seteDias.setDate(seteDias.getDate() + 7);

      // 1. Saldo bancário
      const { data: saldos } = await db
        .from("bank_accounts")
        .select("current_balance")
        .eq("company_id", selectedCompany.id);
      const saldoTotal = (saldos || []).reduce((a: number, s: any) => a + Number(s.current_balance || 0), 0);

      // 2. CP do mês (para liquidez)
      const { data: cpMes } = await db
        .from("contas_pagar")
        .select("valor")
        .eq("company_id", selectedCompany.id)
        .gte("data_vencimento", `${competencia}-01`)
        .lte("data_vencimento", `${competencia}-31`);
      const cpMensal = (cpMes || []).reduce((a: number, p: any) => a + Number(p.valor || 0), 0);

      // Score Liquidez: saldo cobre quantos dias de CP?
      const diasCobertura = cpMensal > 0 ? saldoTotal / (cpMensal / 30) : 90;
      const scoreLiquidez = Math.min(100, Math.max(0, (diasCobertura / 90) * 100));

      // 3. DRE do mês (para lucratividade)
      const { data: movs } = await db
        .from("movimentacoes")
        .select("valor, tipo, origem")
        .eq("company_id", selectedCompany.id)
        .neq("origem", "transferencia")
        .gte("data", `${competencia}-01`)
        .lte("data", `${competencia}-31`);

      const receita = (movs || []).filter((m: any) => m.tipo === "credito").reduce((a: number, m: any) => a + Number(m.valor || 0), 0);
      const despesa = (movs || []).filter((m: any) => m.tipo === "debito").reduce((a: number, m: any) => a + Number(m.valor || 0), 0);
      const margem = receita > 0 ? ((receita - despesa) / receita) * 100 : 0;
      const scoreLucratividade = Math.min(100, Math.max(0, (margem / 20) * 100));

      // 4. Endividamento: CP / Saldo
      const ratioEndiv = saldoTotal > 0 ? cpMensal / saldoTotal : 10;
      const scoreEndividamento = Math.min(100, Math.max(0, (1 - ratioEndiv) * 100));

      // 5. Inadimplência
      const { data: crAll } = await db
        .from("contas_receber")
        .select("valor, status, data_vencimento")
        .eq("company_id", selectedCompany.id)
        .in("status", ["aberto", "parcial", "vencido", "pago"]);

      const crTotal = (crAll || []).reduce((a: number, c: any) => a + Number(c.valor || 0), 0);
      const totalInadimp = (crAll || [])
        .filter((c: any) => (c.status === "vencido" || c.status === "parcial") && new Date(c.data_vencimento) < hoje)
        .reduce((a: number, c: any) => a + Number(c.valor || 0), 0);
      const pctInadimp = crTotal > 0 ? (totalInadimp / crTotal) * 100 : 0;
      const scoreInadimp = Math.min(100, Math.max(0, (1 - pctInadimp / 20) * 100));

      // 6. Compliance (simplificado — 100 se não tiver obrigações)
      const scoreCompliance = 100;

      // Score geral ponderado
      const scoreGeral =
        scoreLiquidez * 0.25 +
        scoreLucratividade * 0.30 +
        scoreCompliance * 0.20 +
        scoreEndividamento * 0.10 +
        scoreInadimp * 0.15;

      // Alertas
      const alertas: { tipo: string; mensagem: string }[] = [];
      if (scoreLiquidez < 40) alertas.push({ tipo: "liquidez", mensagem: "Caixa cobre menos de 36 dias de despesas" });
      if (scoreLucratividade < 30) alertas.push({ tipo: "lucratividade", mensagem: "Margem líquida abaixo de 6%" });
      if (pctInadimp > 10) alertas.push({ tipo: "inadimplencia", mensagem: `${pctInadimp.toFixed(1)}% do faturamento está em atraso` });

      // Buscar score do mês anterior para tendência
      const compAnterior = format(subMonths(new Date(), 1), "yyyy-MM");
      const { data: scoreAnterior } = await db
        .from("score_financeiro")
        .select("score_geral")
        .eq("company_id", selectedCompany.id)
        .eq("competencia", compAnterior)
        .limit(1);

      let tendencia: "subindo" | "caindo" | "estavel" | null = null;
      if (scoreAnterior?.length) {
        const diff = scoreGeral - Number(scoreAnterior[0].score_geral);
        tendencia = diff > 2 ? "subindo" : diff < -2 ? "caindo" : "estavel";
      }

      // Upsert score
      await db.from("score_financeiro").upsert({
        company_id: selectedCompany.id,
        competencia,
        score_geral: Math.round(scoreGeral * 100) / 100,
        score_liquidez: Math.round(scoreLiquidez * 100) / 100,
        score_lucratividade: Math.round(scoreLucratividade * 100) / 100,
        score_compliance: Math.round(scoreCompliance * 100) / 100,
        score_endividamento: Math.round(scoreEndividamento * 100) / 100,
        score_inadimplencia: Math.round(scoreInadimp * 100) / 100,
        liquidez_corrente: cpMensal > 0 ? saldoTotal / cpMensal : null,
        margem_liquida: Math.round(margem * 100) / 100,
        percentual_vencido: Math.round(pctInadimp * 100) / 100,
        obrigacoes_em_dia: true,
        alertas,
        recomendacoes: [],
      }, { onConflict: "company_id,competencia" });

      // Histórico últimos 6 meses
      const { data: hist } = await db
        .from("score_financeiro")
        .select("competencia, score_geral")
        .eq("company_id", selectedCompany.id)
        .order("competencia", { ascending: false })
        .limit(6);

      return {
        score_geral: Math.round(scoreGeral * 100) / 100,
        score_liquidez: Math.round(scoreLiquidez * 100) / 100,
        score_lucratividade: Math.round(scoreLucratividade * 100) / 100,
        score_compliance: Math.round(scoreCompliance * 100) / 100,
        score_endividamento: Math.round(scoreEndividamento * 100) / 100,
        score_inadimplencia: Math.round(scoreInadimp * 100) / 100,
        alertas,
        tendencia,
        historico: (hist || []).reverse(),
      };
    },
    enabled: !!selectedCompany?.id,
    staleTime: 5 * 60 * 1000,
  });

  return { score: score || null, isLoading };
}
