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
import { useContextoIndicadores } from "@/modules/finance/presentation/hooks/useContextoIndicadores";
import { usePontoEquilibrio } from "@/modules/finance/presentation/hooks/usePontoEquilibrio";
import { useLiquidez } from "@/modules/finance/presentation/hooks/useLiquidez";
import { useCicloCaixa } from "@/modules/finance/presentation/hooks/useCicloCaixa";

/* ── Tokens idênticos aos cards de indicadores ── */
const CREME = "#F6F2EB";
const NAVY = "#071D41";
const VERDE = "#039855";
const VERMELHO = "#E53E3E";
const VERMELHO_SUAVE = "#E5837F";

interface ContextoIndicadoresProps {
  companyId: string;
  periodStart: string;
  periodEnd: string;
}

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

/** Eixo Y compacto: R$ 12k / R$ 1,2M. */
const fmtCompact = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(1).replace(".", ",")}M`;
  if (abs >= 1_000) return `R$ ${Math.round(v / 1_000)}k`;
  return `R$ ${Math.round(v)}`;
};

/** Percentual sobre a receita ("12,3%"); "—" se receita 0. */
const pctReceita = (valor: number, receita: number) =>
  receita > 0
    ? `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
        (valor / receita) * 100,
      )}%`
    : "—";

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

/* ── C) Linha da composição (rótulo + barra proporcional + valor + %) ── */
function CompLinha({
  label,
  valor,
  receita,
  cor,
  sinal,
}: {
  label: string;
  valor: number;
  receita: number;
  cor: string;
  sinal?: "menos" | "igual" | "base";
}) {
  const larguraPct = receita > 0 ? Math.min(100, Math.max(0, (Math.abs(valor) / receita) * 100)) : 0;
  const prefixo = sinal === "menos" ? "(−) " : sinal === "igual" ? "(=) " : "";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ width: 150, flexShrink: 0, fontSize: 11.5, color: "#475467" }}>
        {prefixo}
        {label}
      </span>
      <div style={{ flex: 1, height: 16, background: "#FFFFFF", border: "var(--border-hairline)", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${larguraPct}%`, height: "100%", background: cor }} />
      </div>
      <span style={{ width: 110, flexShrink: 0, textAlign: "right", fontSize: 12, fontWeight: 600, color: "#1D2939" }}>
        {fmtMoney(valor)}
      </span>
      <span style={{ width: 56, flexShrink: 0, textAlign: "right", fontSize: 11, color: "#667085" }}>
        {pctReceita(valor, receita)}
      </span>
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

export function ContextoIndicadores({ companyId, periodStart, periodEnd }: ContextoIndicadoresProps) {
  const { kpis, serie, composicao, isLoading } = useContextoIndicadores({
    companyId,
    periodStart,
    periodEnd,
    meses: 12,
  });

  // Dados-fonte: react-query dedupe pela mesma key dos cards (sem custo extra).
  const pe = usePontoEquilibrio({ companyId, periodStart, periodEnd });
  const liq = useLiquidez({ companyId, periodEnd });
  const ciclo = useCicloCaixa({ companyId, periodStart, periodEnd });

  const fmtPct1 = (frac: number) =>
    new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(frac * 100);

  // Série com a margem do mês (resultado ÷ faturamento) para rótulo de % no gráfico.
  const serieComMargem = serie.map((s) => ({
    ...s,
    margem: s.faturamento > 0 ? (s.resultado / s.faturamento) * 100 : null,
  }));

  // Rótulo de % sobre a linha de resultado (só meses com faturamento).
  const renderMargemLabel = (props: any) => {
    const { x, y, index } = props;
    const m = serieComMargem[index]?.margem;
    if (m == null || x == null || y == null) return null;
    return (
      <text x={x} y={y - 8} textAnchor="middle" fontSize={9} fontWeight={700} fill={m < 0 ? VERMELHO : "#667085"}>
        {`${Math.round(m)}%`}
      </text>
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
            <KpiBox label="Saldo em Caixa" value={kpis.saldoCaixa} sign />
          </div>
        )}
      </ChartCardLike>

      {/* B) Faturamento × Despesas */}
      <ChartCardLike
        title="Faturamento × Despesas"
        info="Barras de faturamento (receita de vendas confirmadas) e despesa total (custos + despesas operacionais + outras), por mês, nos últimos 12 meses. A linha mostra o resultado (faturamento − despesa). Regime de competência."
      >
        {isLoading ? (
          <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "#98A2B3" }}>Carregando…</div>
        ) : (
          <div style={{ width: "100%", height: 240 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={serieComMargem} margin={{ top: 18, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="#EAECF0" vertical horizontal />
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#98A2B3" }} axisLine={false} tickLine={false} />
                <YAxis
                  tick={{ fontSize: 10, fill: "#98A2B3" }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                  tickFormatter={(v: number) => fmtCompact(v)}
                />
                <Tooltip content={<FatDespTooltip />} cursor={{ fill: "rgba(7,29,65,0.04)" }} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="faturamento" name="Faturamento" fill={VERDE} radius={[2, 2, 0, 0]} />
                <Bar dataKey="despesa" name="Despesa" fill={VERMELHO_SUAVE} radius={[2, 2, 0, 0]} />
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
        )}
      </ChartCardLike>

      {/* C) Composição do Resultado */}
      <ChartCardLike
        title="Composição do Resultado"
        info="Como a receita do período se decompõe até o resultado: parte vira custo, parte vira despesa operacional, parte vira outras (financeiras), e o que sobra é o resultado. % é sobre a receita."
      >
        {isLoading ? (
          <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "#98A2B3" }}>Carregando…</div>
        ) : composicao.receita <= 0 ? (
          <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "#98A2B3" }}>
            sem dados no período
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <CompLinha label="Receita" valor={composicao.receita} receita={composicao.receita} cor={VERDE} sinal="base" />
            <CompLinha label="Custo" valor={composicao.custo} receita={composicao.receita} cor={VERMELHO_SUAVE} sinal="menos" />
            <CompLinha
              label="Despesa Operacional"
              valor={composicao.despesaOperacional}
              receita={composicao.receita}
              cor="#F0A6A1"
              sinal="menos"
            />
            <CompLinha label="Outras" valor={composicao.outras} receita={composicao.receita} cor="#F5C6C3" sinal="menos" />
            <div style={{ borderTop: "var(--border-hairline)", paddingTop: 8 }}>
              <CompLinha
                label="Resultado"
                valor={composicao.resultado}
                receita={composicao.receita}
                cor={composicao.resultado >= 0 ? VERDE : VERMELHO}
                sinal="igual"
              />
            </div>
          </div>
        )}
      </ChartCardLike>

      {/* D) Dados-fonte */}
      <ChartCardLike
        title="Dados que alimentam os indicadores"
        info="Os números crus, do mesmo período/posição, que sustentam os 4 indicadores abaixo. Conferem com cada card."
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

          <FonteGrupo titulo="Liquidez" comDivisor>
            <FonteBox label="Disponível" value={liq.isLoading ? "—" : fmtMoney(liq.disponivel)} />
            <FonteBox label="CR em aberto" value={liq.isLoading ? "—" : fmtMoney(liq.crAberto)} />
            <FonteBox label="CP em aberto" value={liq.isLoading ? "—" : fmtMoney(liq.cpAberto)} />
          </FonteGrupo>

          <FonteGrupo titulo="Ciclo de Caixa" comDivisor>
            <FonteBox label="Receita do período" value={ciclo.isLoading ? "—" : fmtMoney(ciclo.receita)} />
            <FonteBox label="Compras do período" value={ciclo.isLoading ? "—" : fmtMoney(ciclo.compras)} />
          </FonteGrupo>
        </div>
      </ChartCardLike>
    </div>
  );
}
