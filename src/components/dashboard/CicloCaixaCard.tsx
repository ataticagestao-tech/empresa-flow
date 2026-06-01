import { Info } from "lucide-react";
import {
  useCicloCaixa,
  useCicloCaixaConsolidado,
  useCicloCaixaSerie,
  CICLO_CAIXA_MIN_CP_SAMPLE,
  type CicloCaixaData,
  type CicloSeriePonto,
} from "@/modules/finance/presentation/hooks/useCicloCaixa";
import { MiniTrend, ExplicaBloco } from "@/components/dashboard/IndicadorMini";

interface CicloCaixaCardProps {
  /** Empresa única (sobrescreve a empresa selecionada). Ignorado se companyIds for passado. */
  companyId?: string;
  /** Consolidado de grupo: soma as empresas informadas. */
  companyIds?: string[];
  periodStart: string;
  periodEnd: string;
}

/* ── Tokens idênticos ao ChartCard inline do CompanyDashboard ── */
const CREME = "#F6F2EB";
const NAVY = "#071D41";

const INFO =
  "PMR = prazo médio de recebimento; PMP = prazo médio de pagamento; " +
  "Ciclo Financeiro = PMR − PMP. Negativo é bom: você recebe antes de pagar. " +
  "Número principal pelo método de giro (saldos sobre o fluxo do período); " +
  "entre parênteses, conferência pelo tempo real entre lançamento e pagamento.";

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

const fmtDias1 = (v: number) =>
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

function cicloColor(value: number | null): string {
  if (value == null) return "#1D2939";
  if (value < 0) return "#039855"; // verde: recebe antes de pagar (bom)
  if (value > 0) return "#B54708"; // âmbar/marrom discreto
  return "#1D2939";
}

function Bloco({
  label,
  giro,
  evento,
  insuficiente,
  destaqueColor,
}: {
  label: string;
  giro: number | null;
  evento: number | null;
  insuficiente?: boolean;
  destaqueColor?: string;
}) {
  const principalIsText = insuficiente || giro == null;
  const principal = insuficiente
    ? "dados insuficientes"
    : giro == null
      ? "dados insuficientes"
      : `${fmtDias1(giro)} dias`;

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
          fontSize: principalIsText ? 14 : 26,
          color: principalIsText ? "#98A2B3" : destaqueColor ?? "#1D2939",
        }}
      >
        {principal}
      </span>
      <span style={{ marginTop: 4, fontSize: 11, color: "#98A2B3" }}>
        {insuficiente
          ? "(evento: indisponível)"
          : `(evento: ${evento == null ? "—" : `${fmtDias1(evento)} d`})`}
      </span>
    </div>
  );
}

/* Fileira de mini-tendências (PMR/PMP/Ciclo) + explicações, abaixo dos números. */
function CicloCaixaTendencias({ serie }: { serie: CicloSeriePonto[] }) {
  return (
    <div style={{ marginTop: 12, borderTop: "var(--border-hairline)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <MiniTrend titulo="PMR" data={serie.map((s) => ({ mes: s.mes, valor: s.pmr }))} sufixo=" d" corLinha="#071D41" fmt={fmtDias1} />
        <MiniTrend titulo="PMP" data={serie.map((s) => ({ mes: s.mes, valor: s.pmp }))} sufixo=" d" corLinha="#667085" fmt={fmtDias1} />
        <MiniTrend titulo="Ciclo Financeiro" data={serie.map((s) => ({ mes: s.mes, valor: s.ciclo }))} sufixo=" d" corLinha="#B54708" fmt={fmtDias1} refLine={0} refLabel="0" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <ExplicaBloco titulo="PMR" texto="Tempo médio entre vender e receber. Quanto MENOR, mais rápido o dinheiro entra no caixa." />
        <ExplicaBloco titulo="PMP" texto="Tempo médio entre a despesa nascer e ser paga. Quanto MAIOR (sem atrasar), mais fôlego de caixa." />
        <ExplicaBloco titulo="Ciclo Financeiro" texto="PMR menos PMP. NEGATIVO é ótimo: você recebe antes de pagar e o caixa se financia sozinho." />
      </div>
    </div>
  );
}

function CicloCaixaContent({ data, isLoading, serie }: { data: CicloCaixaData; isLoading: boolean; serie: CicloSeriePonto[] }) {
  // CP centralizada na matriz em lojas de franquia → amostra de pagamento baixa.
  const cpInsuficiente = data.evento.nCP < CICLO_CAIXA_MIN_CP_SAMPLE;

  if (isLoading) {
    return <div style={{ padding: "28px 0", textAlign: "center", fontSize: 13, color: "#98A2B3" }}>Carregando…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <Bloco label="PMR" giro={data.giro.pmr} evento={data.evento.pmr} />
        <Bloco label="PMP" giro={data.giro.pmp} evento={data.evento.pmp} insuficiente={cpInsuficiente} />
        <Bloco
          label="Ciclo Financeiro"
          giro={data.giro.ciclo}
          evento={data.evento.ciclo}
          insuficiente={cpInsuficiente}
          destaqueColor={cicloColor(data.giro.ciclo)}
        />
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
        <span>Receita do período: <strong style={{ color: "#1D2939" }}>{fmtMoney(data.receita)}</strong></span>
        <span>Compras do período: <strong style={{ color: "#1D2939" }}>{fmtMoney(data.compras)}</strong></span>
        <span>CR em aberto: <strong style={{ color: "#1D2939" }}>{fmtMoney(data.saldoCRaberto)}</strong></span>
        <span>CP em aberto: <strong style={{ color: "#1D2939" }}>{fmtMoney(data.saldoCPaberto)}</strong></span>
      </div>

      {cpInsuficiente && (
        <p style={{ margin: 0, fontSize: 11, color: "#B54708" }}>
          Amostra de contas a pagar insuficiente ({data.evento.nCP} pagamento(s) no período). PMP e Ciclo
          só são confiáveis no consolidado do grupo quando a CP é centralizada na matriz.
        </p>
      )}

      <CicloCaixaTendencias serie={serie} />
    </div>
  );
}

/** Card de empresa única (ou sobrescrita por companyId). */
function CicloCaixaCardSingle({ companyId, periodStart, periodEnd }: { companyId?: string; periodStart: string; periodEnd: string }) {
  const { isLoading, ...data } = useCicloCaixa({ companyId, periodStart, periodEnd });
  const { serie } = useCicloCaixaSerie({ companyId, meses: 6 });
  return (
    <ChartCardLike title="Ciclo de Caixa" info={INFO}>
      <CicloCaixaContent data={data} isLoading={isLoading} serie={serie} />
    </ChartCardLike>
  );
}

/** Card consolidado de grupo. */
function CicloCaixaCardGrupo({ companyIds, periodStart, periodEnd }: { companyIds: string[]; periodStart: string; periodEnd: string }) {
  const { isLoading, ...data } = useCicloCaixaConsolidado({ companyIds, periodStart, periodEnd });
  const { serie } = useCicloCaixaSerie({ companyIds, meses: 6 });
  return (
    <ChartCardLike title="Ciclo de Caixa" info={INFO}>
      <CicloCaixaContent data={data} isLoading={isLoading} serie={serie} />
    </ChartCardLike>
  );
}

export function CicloCaixaCard({ companyId, companyIds, periodStart, periodEnd }: CicloCaixaCardProps) {
  if (companyIds && companyIds.length > 0) {
    return <CicloCaixaCardGrupo companyIds={companyIds} periodStart={periodStart} periodEnd={periodEnd} />;
  }
  return <CicloCaixaCardSingle companyId={companyId} periodStart={periodStart} periodEnd={periodEnd} />;
}
