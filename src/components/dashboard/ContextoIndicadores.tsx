import { Info } from "lucide-react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
  ResponsiveContainer,
} from "recharts";
import { useContextoIndicadores, type ContextoComposicao } from "@/modules/finance/presentation/hooks/useContextoIndicadores";
import { usePontoEquilibrio } from "@/modules/finance/presentation/hooks/usePontoEquilibrio";

/* ── Tokens idênticos aos cards de indicadores ── */
const CREME = "#F6F2EB";
const NAVY = "#071D41";
const VERDE = "#039855";
const VERMELHO = "#E53E3E";
const VERMELHO_SUAVE = "#E5837F";

/** Painel branco com sombra leve — mesmo do dashboard, p/ destacar o gráfico do fundo creme. */
const whitePanel: React.CSSProperties = {
  background: "#FFFFFF",
  border: "var(--border-hairline)",
  borderRadius: 8,
  padding: 14,
  boxShadow: "0 4px 14px rgba(15, 23, 42, 0.10)",
};

interface ContextoIndicadoresProps {
  companyId: string;
  periodStart: string;
  periodEnd: string;
}

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

/** Wrapper visual replicando o ChartCard dos cards de indicador. */
function ChartCardLike({ title, info, children }: { title: string; info?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: CREME,
        borderRadius: 10,
        border: "var(--border-hairline)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ padding: "14px 16px", background: NAVY }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 13,
              color: "#fff",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: 0.6,
            }}
          >
            {title}
          </span>
          {info && (
            <span title={info} style={{ display: "inline-flex", cursor: "help" }}>
              <Info size={13} style={{ color: "rgba(255,255,255,0.6)" }} />
            </span>
          )}
        </div>
      </div>
      <div style={{ padding: 14, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>{children}</div>
    </div>
  );
}

/* ── A) Faixa de KPIs ── */
function KpiBox({ label, value, sign }: { label: string; value: number; sign?: boolean }) {
  const cor = !sign ? "#071D41" : value >= 0 ? VERDE : VERMELHO;
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "var(--border-hairline)",
        borderRadius: 8,
        padding: "14px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "#667085" }}>
        {label}
      </span>
      <span style={{ fontSize: 20, fontWeight: 700, color: cor, lineHeight: 1.1 }}>{fmtMoney(value)}</span>
    </div>
  );
}

/* ── D) Bloco de dado-fonte ── */
function FonteBox({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "var(--border-hairline)",
        borderRadius: 8,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 3,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "#667085" }}>
        {label}
      </span>
      <span style={{ fontSize: 15, fontWeight: 700, color: "#1D2939", lineHeight: 1.1 }}>{value}</span>
    </div>
  );
}

function SubTitulo({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        color: "#000000",
      }}
    >
      {children}
    </div>
  );
}

/** Um grupo de dados-fonte: subtítulo + seus boxes em grade interna.
 *  `comDivisor` desenha uma linha vertical sutil à esquerda (separa dos grupos anteriores). */
function FonteGrupo({
  titulo,
  children,
  comDivisor,
}: {
  titulo: string;
  children: React.ReactNode;
  comDivisor?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        ...(comDivisor
          ? { borderLeft: "1px solid #E2DCCF", paddingLeft: 16 }
          : {}),
      }}
    >
      <SubTitulo>{titulo}</SubTitulo>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        {children}
      </div>
    </div>
  );
}

/** Tooltip do gráfico Faturamento × Despesas: valores + margem do mês (resultado ÷ faturamento). */
function FatDespTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0]?.payload || {};
  const fat = Number(p.faturamento) || 0;
  const desp = Number(p.despesa) || 0;
  const res = Number(p.resultado) || 0;
  const margem = fat > 0 ? (res / fat) * 100 : null;
  const margemTxt =
    margem == null
      ? "—"
      : `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(margem)}%`;
  return (
    <div style={{ background: "#fff", border: "var(--border-hairline)", borderRadius: 6, padding: "8px 10px", fontSize: 11 }}>
      <div style={{ fontWeight: 700, color: "#1D2939", marginBottom: 4 }}>{label}</div>
      <div style={{ color: VERDE }}>Faturamento: {fmtMoney(fat)}</div>
      <div style={{ color: VERMELHO_SUAVE }}>Despesa: {fmtMoney(desp)}</div>
      <div style={{ color: NAVY }}>Resultado: {fmtMoney(res)}</div>
      <div style={{ color: margem != null && margem < 0 ? VERMELHO : "#667085", marginTop: 2 }}>
        Margem: <strong>{margemTxt}</strong>
      </div>
    </div>
  );
}

/* ── A2) Composição do Resultado: cascata Faturamento Bruto → deduções → Resultado ── */
function CascataResultado({ c }: { c: ContextoComposicao }) {
  const lucroBruto = c.receitaLiquida - c.custo;
  const resultadoOperacional = lucroBruto - c.despesaOperacional;
  const neg = (v: number) => (v > 0 ? -v : 0);
  type Tipo = "bruto" | "deducao" | "subtotal" | "resultado";
  const linhas: Array<{ label: string; value: number; tipo: Tipo }> = [
    { label: "Faturamento Bruto", value: c.receita, tipo: "bruto" },
    { label: "(−) Taxa de cartão", value: neg(c.taxaCartao), tipo: "deducao" },
    { label: "= Receita Líquida", value: c.receitaLiquida, tipo: "subtotal" },
    { label: "(−) Custo", value: neg(c.custo), tipo: "deducao" },
    { label: "= Lucro Bruto", value: lucroBruto, tipo: "subtotal" },
    { label: "(−) Despesa Operacional", value: neg(c.despesaOperacional), tipo: "deducao" },
    { label: "= Resultado Operacional", value: resultadoOperacional, tipo: "subtotal" },
    { label: "(−) Outras", value: neg(c.outras), tipo: "deducao" },
    { label: "= Resultado", value: c.resultado, tipo: "resultado" },
  ];
  return (
    <div style={{ ...whitePanel, padding: 0, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <tbody>
          {linhas.map((l, i) => {
            const isSub = l.tipo === "subtotal";
            const isRes = l.tipo === "resultado";
            const isDed = l.tipo === "deducao";
            const bg = isRes ? NAVY : isSub ? "#F6F7F9" : "#fff";
            const cor = isRes ? "#fff" : isDed ? VERMELHO : "#1D2939";
            const peso = isDed ? 500 : 700;
            const pad = isRes ? "12px 16px" : "8px 16px";
            return (
              <tr key={i} style={{ background: bg, borderTop: i === 0 ? "none" : "1px solid #EEF1F4" }}>
                <td style={{ padding: pad, paddingLeft: isDed ? 30 : 16, color: cor, fontWeight: peso }}>{l.label}</td>
                <td style={{ padding: pad, textAlign: "right", whiteSpace: "nowrap", fontWeight: peso, color: isRes ? (l.value >= 0 ? "#34D399" : "#FCA5A5") : cor }}>
                  {fmtMoney(l.value)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ContextoIndicadores({ companyId, periodStart, periodEnd }: ContextoIndicadoresProps) {
  const { kpis, serie, composicao, isLoading } = useContextoIndicadores({
    companyId,
    periodStart,
    periodEnd,
    meses: 8,
  });

  // Dados-fonte: react-query dedupe pela mesma key dos cards (sem custo extra).
  const pe = usePontoEquilibrio({ companyId, periodStart, periodEnd });

  const fmtPct1 = (frac: number) =>
    new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(frac * 100);

  // Série com a margem do mês (resultado ÷ faturamento) para rótulo de % no gráfico.
  // Corta meses vazios do início para as barras ocuparem toda a largura.
  const serieComMargem = (() => {
    const arr = serie.map((s) => ({
      ...s,
      margem: s.faturamento > 0 ? (s.resultado / s.faturamento) * 100 : null,
    }));
    const first = arr.findIndex((s) => (s.faturamento || 0) !== 0 || (s.despesa || 0) !== 0);
    return first > 0 ? arr.slice(first) : arr;
  })();

  // Rótulo de % sobre a linha de resultado (só meses com faturamento).
  // Pílula colorida com texto branco em negrito para destacar o indicador.
  const renderMargemLabel = (props: any) => {
    const { x, y, index } = props;
    const m = serieComMargem[index]?.margem;
    if (m == null || x == null || y == null) return null;
    const negativo = m < 0;
    const txt = `${Math.round(m)}%`;
    const w = txt.length * 8.5 + 12;
    const h = 18;
    const bg = negativo ? VERMELHO : NAVY;
    // Positivo → pílula acima do ponto; negativo → abaixo do ponto (fica abaixo do eixo).
    const rectY = negativo ? y + 8 : y - h - 8;
    return (
      <g>
        <rect x={x - w / 2} y={rectY} width={w} height={h} rx={9} fill={bg} />
        <text x={x} y={rectY + h / 2 + 1} textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={800} fill="#FFFFFF">
          {txt}
        </text>
      </g>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* A) Resumo do período */}
      <ChartCardLike title="Resumo do Período">
        {isLoading ? (
          <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "#98A2B3" }}>Carregando…</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
            <KpiBox label="Faturamento" value={kpis.faturamento} />
            <KpiBox label="Despesas" value={kpis.despesaTotal} />
            <KpiBox label="Resultado" value={kpis.resultado} sign />
            <KpiBox label="Geração de Caixa" value={kpis.geracaoCaixa} sign />
          </div>
        )}
      </ChartCardLike>

      {/* A2) Composição do Resultado (cascata com a taxa de cartão explícita) */}
      <ChartCardLike
        title="Composição do Resultado"
        info="Do faturamento bruto, vai descontando: taxa de cartão (MDR + antecipação, da agenda), custos, despesas operacionais e outras — até o resultado. Regime de competência."
      >
        {isLoading ? (
          <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "#98A2B3" }}>Carregando…</div>
        ) : (
          <CascataResultado c={composicao} />
        )}
      </ChartCardLike>

      {/* B) Faturamento × Despesas */}
      <ChartCardLike
        title="Faturamento × Despesas"
        info="Barras de faturamento (receita de vendas confirmadas) e despesa total (custos + despesas operacionais + outras), mês a mês. A linha mostra o resultado (faturamento − despesa) e a pílula, a margem do mês. Regime de competência."
      >
        {isLoading ? (
          <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "#98A2B3" }}>Carregando…</div>
        ) : (
          <div style={whitePanel}>
            <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serieComMargem} margin={{ top: 28, right: 8, left: 0, bottom: 4 }} barCategoryGap="14%" barGap={2}>
                <CartesianGrid stroke="#EAECF0" vertical horizontal />
                <XAxis
                  dataKey="mes"
                  tick={{ fontSize: 12, fontWeight: 700, fill: "#101828" }}
                  axisLine={{ stroke: "#344054", strokeWidth: 1 }}
                  tickLine={{ stroke: "#344054" }}
                  tickMargin={8}
                />
                <YAxis
                  tick={{ fontSize: 12, fontWeight: 700, fill: "#101828" }}
                  axisLine={{ stroke: "#344054", strokeWidth: 1 }}
                  tickLine={{ stroke: "#344054" }}
                  width={84}
                  tickMargin={6}
                  tickFormatter={(v: number) => fmtMoney(v)}
                />
                <Tooltip content={<FatDespTooltip />} cursor={{ fill: "rgba(7,29,65,0.04)" }} />
                <Legend wrapperStyle={{ fontSize: 12, fontWeight: 700, color: "#101828" }} />
                <Bar dataKey="faturamento" name="Faturamento" fill={VERDE} radius={[2, 2, 0, 0]} maxBarSize={64} />
                <Bar dataKey="despesa" name="Despesa" fill={VERMELHO_SUAVE} radius={[2, 2, 0, 0]} maxBarSize={64} />
                <Line
                  type="monotone"
                  dataKey="resultado"
                  name="Resultado"
                  stroke={NAVY}
                  strokeWidth={2}
                  dot={{ r: 2 }}
                  isAnimationActive={false}
                >
                  <LabelList dataKey="resultado" content={renderMargemLabel} />
                </Line>
              </ComposedChart>
            </ResponsiveContainer>
            </div>
          </div>
        )}
      </ChartCardLike>

      {/* D) Dados-fonte */}
      <ChartCardLike
        title="Dados que alimentam os indicadores"
        info="Os números crus, do mesmo período/posição, que sustentam os indicadores abaixo. Conferem com cada card."
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
          <FonteGrupo titulo="Ponto de Equilíbrio">
            <FonteBox label="Custos Fixos" value={pe.isLoading ? "—" : fmtMoney(pe.custoFixo)} />
            <FonteBox label="Custos Variáveis" value={pe.isLoading ? "—" : fmtMoney(pe.custoVariavel)} />
            <FonteBox
              label="Margem de Contribuição"
              value={
                pe.isLoading
                  ? "—"
                  : `${fmtMoney(pe.margemContribuicaoValor)}${pe.mcPct != null ? ` (${fmtPct1(pe.mcPct)}%)` : ""}`
              }
            />
          </FonteGrupo>
        </div>
      </ChartCardLike>
    </div>
  );
}
