import { Info } from "lucide-react";
import {
  usePontoEquilibrio,
  usePontoEquilibrioConsolidado,
  usePontoEquilibrioSerie,
  type PontoEquilibrioData,
  type PontoEquilibrioSeriePonto,
} from "@/modules/finance/presentation/hooks/usePontoEquilibrio";
import { MiniTrend, ExplicaBloco } from "@/components/dashboard/IndicadorMini";

interface PontoEquilibrioCardProps {
  /** Empresa única (sobrescreve a empresa selecionada). Ignorado se companyIds for passado. */
  companyId?: string;
  /** Consolidado de grupo: soma as empresas informadas. */
  companyIds?: string[];
  periodStart: string;
  periodEnd: string;
}

/* ── Tokens idênticos ao MargensCard / LiquidezCard / CicloCaixaCard ── */
const CREME = "#F6F2EB";
const NAVY = "#071D41";

const INFO =
  "Ponto de Equilíbrio = faturamento mínimo para a empresa não dar prejuízo. " +
  "PE Contábil: lucro zero (cobre custos fixos + variáveis). " +
  "PE Financeiro: o caixa empata (exclui custos que não saem do bolso, como depreciação). " +
  "PE Econômico: cobre tudo e ainda entrega o lucro mínimo desejado. " +
  "Usa a classificação fixo×variável das contas (definida no Plano de Contas; onde não " +
  "classificada, uma heurística decide). Regime de competência: receita = vendas confirmadas; " +
  "custos = contas a pagar atribuídas por competência.";

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

/** Percentual com 1 casa, recebendo uma FRAÇÃO (0..1) → "12.3". */
const fmtPctFrac1 = (frac: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(frac * 100);

/** Wrapper visual replicando o ChartCard inline do dashboard. */
function ChartCardLike({ title, info, children }: { title: string; info?: string; children: React.ReactNode }) {
  return (
    <div style={{ background: CREME, borderRadius: 10, border: "var(--border-hairline)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 16px", background: NAVY }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, color: "#fff", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>{title}</span>
          {info && (
            <span title={info} style={{ display: "inline-flex", cursor: "help" }}>
              <Info size={13} style={{ color: "rgba(255,255,255,0.6)" }} />
            </span>
          )}
        </div>
      </div>
      <div style={{ padding: 14, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}

function Bloco({ label, value, invalida }: { label: string; value: number | null; invalida: boolean }) {
  const isText = value == null;
  const principal = value == null ? "—" : fmtMoney(value);

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "var(--border-hairline)",
        borderRadius: 8,
        padding: "16px 12px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "#667085" }}>
        {label}
      </span>
      <span
        style={{
          marginTop: 4,
          fontWeight: 700,
          fontSize: isText ? 22 : 22,
          color: isText ? "#98A2B3" : "#071D41",
        }}
      >
        {principal}
      </span>
      {isText && invalida && (
        <span style={{ marginTop: 4, fontSize: 10, color: "#B54708" }}>margem de contribuição ≤ 0</span>
      )}
    </div>
  );
}

/* Fileira de mini-tendências (R$) + explicações, abaixo dos números. */
function PontoEquilibrioTendencias({ serie }: { serie: PontoEquilibrioSeriePonto[] }) {
  return (
    <div style={{ marginTop: 12, borderTop: "var(--border-hairline)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <MiniTrend titulo="PE Contábil" data={serie.map((s) => ({ mes: s.mes, valor: s.contabil }))} corLinha="#071D41" fmt={fmtMoney} />
        <MiniTrend titulo="PE Financeiro" data={serie.map((s) => ({ mes: s.mes, valor: s.financeiro }))} corLinha="#039855" fmt={fmtMoney} />
        <MiniTrend titulo="PE Econômico" data={serie.map((s) => ({ mes: s.mes, valor: s.economico }))} corLinha="#B54708" fmt={fmtMoney} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <ExplicaBloco titulo="PE Contábil" texto="Faturamento em que o lucro é zero: cobre todos os custos fixos e variáveis. Abaixo dele, a empresa opera no prejuízo." />
        <ExplicaBloco titulo="PE Financeiro" texto="Faturamento em que o CAIXA empata. Exclui custos que não saem do bolso (depreciação). Geralmente menor que o contábil." />
        <ExplicaBloco titulo="PE Econômico" texto="Faturamento que cobre tudo E ainda entrega o lucro mínimo desejado. Defina a meta na ficha da empresa." />
      </div>
    </div>
  );
}

function PontoEquilibrioContent({ data, isLoading, serie }: { data: PontoEquilibrioData; isLoading: boolean; serie: PontoEquilibrioSeriePonto[] }) {
  if (isLoading) {
    return <div style={{ padding: "28px 0", textAlign: "center", fontSize: 13, color: "#98A2B3" }}>Carregando…</div>;
  }

  const ms = data.margemSeguranca;
  const acima = ms != null && ms >= 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <Bloco label="PE Contábil" value={data.peContabil} invalida={data.mcInvalida} />
        <Bloco label="PE Financeiro" value={data.peFinanceiro} invalida={data.mcInvalida} />
        <Bloco label="PE Econômico" value={data.peEconomico} invalida={data.mcInvalida} />
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: "4px 16px",
          borderTop: "var(--border-hairline)",
          paddingTop: 12,
          fontSize: 11,
          color: "#667085",
        }}
      >
        <span>Receita: <strong style={{ color: "#1D2939" }}>{fmtMoney(data.receita)}</strong></span>
        <span>
          Margem de Contribuição:{" "}
          <strong style={{ color: "#1D2939" }}>
            {fmtMoney(data.margemContribuicaoValor)}
            {data.mcPct != null ? ` (${fmtPctFrac1(data.mcPct)}%)` : ""}
          </strong>
        </span>
        <span>Custos Fixos: <strong style={{ color: "#1D2939" }}>{fmtMoney(data.custoFixo)}</strong></span>
        <span>Custos Variáveis: <strong style={{ color: "#1D2939" }}>{fmtMoney(data.custoVariavel)}</strong></span>
        <span>
          Margem de Segurança:{" "}
          <strong style={{ color: ms == null ? "#98A2B3" : ms >= 0 ? "#039855" : "#B54708" }}>
            {ms == null ? "—" : `${fmtPctFrac1(ms)}%`}
          </strong>
        </span>
        {data.lucroDesejado > 0 && (
          <span>Lucro desejado: <strong style={{ color: "#1D2939" }}>{fmtMoney(data.lucroDesejado)}</strong></span>
        )}
      </div>

      {ms != null && (
        <div style={{ fontSize: 11.5, color: acima ? "#039855" : "#B54708" }}>
          Sua receita está <strong>{fmtPctFrac1(Math.abs(ms))}%</strong> {acima ? "acima" : "abaixo"} do ponto de equilíbrio.
        </div>
      )}

      <PontoEquilibrioTendencias serie={serie} />
    </div>
  );
}

/** Card de empresa única (ou sobrescrita por companyId). */
function PontoEquilibrioCardSingle({ companyId, periodStart, periodEnd }: { companyId?: string; periodStart: string; periodEnd: string }) {
  const { isLoading, ...data } = usePontoEquilibrio({ companyId, periodStart, periodEnd });
  const { serie } = usePontoEquilibrioSerie({ companyId, meses: 6 });
  return (
    <ChartCardLike title="Ponto de Equilíbrio" info={INFO}>
      <PontoEquilibrioContent data={data} isLoading={isLoading} serie={serie} />
    </ChartCardLike>
  );
}

/** Card consolidado de grupo. */
function PontoEquilibrioCardGrupo({ companyIds, periodStart, periodEnd }: { companyIds: string[]; periodStart: string; periodEnd: string }) {
  const { isLoading, ...data } = usePontoEquilibrioConsolidado({ companyIds, periodStart, periodEnd });
  const { serie } = usePontoEquilibrioSerie({ companyIds, meses: 6 });
  return (
    <ChartCardLike title="Ponto de Equilíbrio" info={INFO}>
      <PontoEquilibrioContent data={data} isLoading={isLoading} serie={serie} />
    </ChartCardLike>
  );
}

export function PontoEquilibrioCard({ companyId, companyIds, periodStart, periodEnd }: PontoEquilibrioCardProps) {
  if (companyIds && companyIds.length > 0) {
    return <PontoEquilibrioCardGrupo companyIds={companyIds} periodStart={periodStart} periodEnd={periodEnd} />;
  }
  return <PontoEquilibrioCardSingle companyId={companyId} periodStart={periodStart} periodEnd={periodEnd} />;
}
