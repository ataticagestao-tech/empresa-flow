import { AlertTriangle, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { ScoreFinanceiro } from "@/modules/finance/presentation/hooks/useScoreFinanceiro";

interface ScoreGaugeProps {
  score: ScoreFinanceiro;
}

const dimensoes = [
  { key: "score_liquidez", label: "Liquidez", desc: "Caixa cobre despesas do mês" },
  { key: "score_lucratividade", label: "Lucratividade", desc: "Margem líquida sobre receita" },
  { key: "score_compliance", label: "Compliance", desc: "Obrigações fiscais em dia" },
  { key: "score_endividamento", label: "Endividamento", desc: "Relação CP / Saldo bancário" },
  { key: "score_inadimplencia", label: "Inadimplência", desc: "% de recebíveis em atraso" },
] as const;

function getScoreColor(v: number) {
  if (v >= 70) return "#039855";
  if (v >= 40) return "#f57f17";
  return "#D92D20";
}

function getScoreBg(v: number) {
  if (v >= 70) return "#ECFDF3";
  if (v >= 40) return "#fff8e1";
  return "#FEF3F2";
}

export function ScoreGauge({ score }: ScoreGaugeProps) {
  const color = getScoreColor(score.score_geral);
  const pct = Math.min(100, Math.max(0, score.score_geral));

  const TrendIcon = score.tendencia === "subindo" ? TrendingUp
    : score.tendencia === "caindo" ? TrendingDown
    : Minus;

  const trendLabel = score.tendencia === "subindo" ? "Subindo"
    : score.tendencia === "caindo" ? "Caindo"
    : "Estável";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Score principal */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{
          position: "relative", width: 80, height: 80,
          borderRadius: "50%",
          background: `conic-gradient(${color} ${pct * 3.6}deg, #E5E7EB 0deg)`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            width: 62, height: 62, borderRadius: "50%", background: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexDirection: "column",
          }}>
            <span style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>
              {Math.round(score.score_geral)}
            </span>
          </div>
        </div>
        <div>
          <p style={{ fontSize: 15, fontWeight: 600, color: "#0F172A" }}>Score Financeiro</p>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 4,
            padding: "2px 8px", borderRadius: 99, fontSize: 11, fontWeight: 500,
            background: getScoreBg(score.score_geral), color,
            marginTop: 4,
          }}>
            <TrendIcon size={12} />
            {trendLabel}
          </div>
        </div>
      </div>

      {/* Barras por dimensão */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {dimensoes.map((d) => {
          const val = score[d.key] as number;
          const barColor = getScoreColor(val);
          return (
            <div key={d.key}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                <span style={{ fontSize: 12, color: "#4B5563" }}>{d.label}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: barColor }}>{Math.round(val)}</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "#E5E7EB", overflow: "hidden" }}>
                <div style={{
                  height: "100%", borderRadius: 3,
                  width: `${Math.min(100, val)}%`,
                  background: barColor,
                  transition: "width 0.5s ease",
                }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Alertas */}
      {score.alertas.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
          {score.alertas.map((a, i) => (
            <div key={i} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 12px", borderRadius: 8,
              background: "#FFFAEB", border: "1px solid #FED7AA",
              fontSize: 12, color: "#92400e",
            }}>
              <AlertTriangle size={14} />
              {a.mensagem}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
