import { Info } from "lucide-react";
import {
  useMargens,
  useMargensConsolidado,
  useMargensSerie,
  type MargensData,
  type MargensSeriePonto,
} from "@/modules/finance/presentation/hooks/useMargens";
import { MiniTrend, ExplicaBloco } from "@/components/dashboard/IndicadorMini";

interface MargensCardProps {
  /** Empresa única (sobrescreve a empresa selecionada). Ignorado se companyIds for passado. */
  companyId?: string;
  /** Consolidado de grupo: soma as empresas informadas. */
  companyIds?: string[];
  periodStart: string;
  periodEnd: string;
}

/* ── Tokens idênticos ao LiquidezCard / CicloCaixaCard ── */
const CREME = "#F6F2EB";
const NAVY = "#071D41";

const INFO =
  "Margem Bruta = (Receita − Custo direto) ÷ Receita. " +
  "Margem Operacional = (Lucro Bruto − Despesas operacionais do dia a dia) ÷ Receita. " +
  "Margem Líquida = (Resultado Operacional − Financeiras e outras) ÷ Receita. " +
  "Receita = vendas confirmadas no período. Custos/despesas = contas a pagar atribuídas por " +
  "competência (regime de competência). Não inclui compras de ativo nem itens fora do resultado.";

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

/** Percentual com 1 casa (sem o símbolo; o sufixo "%" é adicionado pelo card). */
const fmtPct1 = (v: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);

/** Wrapper visual replicando o ChartCard inline (não exportado) do dashboard. */
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

function Bloco({ label, value }: { label: string; value: number | null }) {
  const isText = value == null;
  const principal = value == null ? "—" : `${fmtPct1(value)}%`;
  const color = isText ? "#98A2B3" : value >= 0 ? "#039855" : "#B54708";

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
          fontSize: isText ? 14 : 26,
          color,
        }}
      >
        {principal}
      </span>
    </div>
  );
}

/* Fileira de mini-tendências (Bruta/Operacional/Líquida) + explicações, abaixo dos números. */
function MargensTendencias({ serie }: { serie: MargensSeriePonto[] }) {
  return (
    <div style={{ marginTop: 12, borderTop: "var(--border-hairline)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <MiniTrend titulo="Margem Bruta" data={serie.map((s) => ({ mes: s.mes, valor: s.bruta }))} sufixo="%" corLinha="#071D41" fmt={fmtPct1} refLine={0} />
        <MiniTrend titulo="Margem Operacional" data={serie.map((s) => ({ mes: s.mes, valor: s.operacional }))} sufixo="%" corLinha="#667085" fmt={fmtPct1} refLine={0} />
        <MiniTrend titulo="Margem Líquida" data={serie.map((s) => ({ mes: s.mes, valor: s.liquida }))} sufixo="%" corLinha="#039855" fmt={fmtPct1} refLine={0} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <ExplicaBloco titulo="Margem Bruta" texto="Quanto sobra de cada R$100 vendidos após o custo direto do serviço/produto. É o teto do seu lucro." />
        <ExplicaBloco titulo="Margem Operacional" texto="Após também as despesas do dia a dia (pessoal, aluguel, administrativas). Mostra a eficiência da operação." />
        <ExplicaBloco titulo="Margem Líquida" texto="O que realmente sobra após tudo (inclui financeiras e outras). É o lucro final sobre a receita." />
      </div>
    </div>
  );
}

function MargensContent({ data, isLoading, serie }: { data: MargensData; isLoading: boolean; serie: MargensSeriePonto[] }) {
  if (isLoading) {
    return <div style={{ padding: "28px 0", textAlign: "center", fontSize: 13, color: "#98A2B3" }}>Carregando…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <Bloco label="Margem Bruta" value={data.margemBruta} />
        <Bloco label="Margem Operacional" value={data.margemOperacional} />
        <Bloco label="Margem Líquida" value={data.margemLiquida} />
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
        <span>Custo: <strong style={{ color: "#1D2939" }}>{fmtMoney(data.custo)}</strong></span>
        <span>Lucro Bruto: <strong style={{ color: "#1D2939" }}>{fmtMoney(data.lucroBruto)}</strong></span>
        <span>Despesas op.: <strong style={{ color: "#1D2939" }}>{fmtMoney(data.despesaOperacional)}</strong></span>
        <span>Resultado líquido: <strong style={{ color: data.resultadoLiquido >= 0 ? "#039855" : "#B54708" }}>{fmtMoney(data.resultadoLiquido)}</strong></span>
      </div>

      <MargensTendencias serie={serie} />
    </div>
  );
}

/** Card de empresa única (ou sobrescrita por companyId). */
function MargensCardSingle({ companyId, periodStart, periodEnd }: { companyId?: string; periodStart: string; periodEnd: string }) {
  const { isLoading, ...data } = useMargens({ companyId, periodStart, periodEnd });
  const { serie } = useMargensSerie({ companyId, meses: 6 });
  return (
    <ChartCardLike title="Margens & Rentabilidade" info={INFO}>
      <MargensContent data={data} isLoading={isLoading} serie={serie} />
    </ChartCardLike>
  );
}

/** Card consolidado de grupo. */
function MargensCardGrupo({ companyIds, periodStart, periodEnd }: { companyIds: string[]; periodStart: string; periodEnd: string }) {
  const { isLoading, ...data } = useMargensConsolidado({ companyIds, periodStart, periodEnd });
  const { serie } = useMargensSerie({ companyIds, meses: 6 });
  return (
    <ChartCardLike title="Margens & Rentabilidade" info={INFO}>
      <MargensContent data={data} isLoading={isLoading} serie={serie} />
    </ChartCardLike>
  );
}

export function MargensCard({ companyId, companyIds, periodStart, periodEnd }: MargensCardProps) {
  if (companyIds && companyIds.length > 0) {
    return <MargensCardGrupo companyIds={companyIds} periodStart={periodStart} periodEnd={periodEnd} />;
  }
  return <MargensCardSingle companyId={companyId} periodStart={periodStart} periodEnd={periodEnd} />;
}
