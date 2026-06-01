import { Info } from "lucide-react";
import {
  useLiquidez,
  useLiquidezConsolidado,
  useLiquidezSerie,
  type LiquidezData,
  type LiquidezSeriePonto,
} from "@/modules/finance/presentation/hooks/useLiquidez";
import { MiniTrend, ExplicaBloco } from "@/components/dashboard/IndicadorMini";

interface LiquidezCardProps {
  /** Empresa única (sobrescreve a empresa selecionada). Ignorado se companyIds for passado. */
  companyId?: string;
  /** Consolidado de grupo: soma as empresas informadas. */
  companyIds?: string[];
  periodEnd: string;
}

/* ── Tokens idênticos ao CicloCaixaCard ── */
const CREME = "#F6F2EB";
const NAVY = "#071D41";

const INFO =
  "Liquidez Corrente = Ativo Circulante ÷ Passivo Circulante (capacidade de pagar obrigações de curto prazo). " +
  "Liquidez Seca = (Ativo Circulante − Estoque) ÷ Passivo Circulante. " +
  "Liquidez Imediata = Disponível (caixa/banco) ÷ Passivo Circulante. " +
  "Capital de Giro Líquido = Ativo Circulante − Passivo Circulante. " +
  "Ativo Circulante = caixa positivo + contas a receber em aberto + estoque; " +
  "Passivo Circulante = contas a pagar em aberto + dívida bancária de curto prazo (cheque especial / fatura de cartão). " +
  "Posição na data de referência (nunca projeta pro futuro).";

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

const fmtIndice = (v: number) =>
  new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

/** Formata 'YYYY-MM-DD' como DD/MM/AAAA (sem shift de timezone). */
function fmtData(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

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

function Bloco({
  label,
  value,
  isMoney,
  destaqueColor,
}: {
  label: string;
  value: number | null;
  isMoney?: boolean;
  destaqueColor?: string;
}) {
  const principalIsText = value == null;
  const principal = value == null ? "—" : isMoney ? fmtMoney(value) : fmtIndice(value);

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
          fontSize: principalIsText ? 14 : isMoney ? 20 : 26,
          color: principalIsText ? "#98A2B3" : destaqueColor ?? "#1D2939",
        }}
      >
        {principal}
      </span>
    </div>
  );
}

/* Fileira de mini-tendências (Corrente/Seca/Imediata) + explicações, abaixo dos números. */
function LiquidezTendencias({ serie }: { serie: LiquidezSeriePonto[] }) {
  return (
    <div style={{ marginTop: 12, borderTop: "var(--border-hairline)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <MiniTrend titulo="Liquidez Corrente" data={serie.map((s) => ({ mes: s.mes, valor: s.corrente }))} corLinha="#071D41" fmt={fmtIndice} refLine={1} />
        <MiniTrend titulo="Liquidez Seca" data={serie.map((s) => ({ mes: s.mes, valor: s.seca }))} corLinha="#667085" fmt={fmtIndice} refLine={1} />
        <MiniTrend titulo="Liquidez Imediata" data={serie.map((s) => ({ mes: s.mes, valor: s.imediata }))} corLinha="#039855" fmt={fmtIndice} refLine={1} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <ExplicaBloco titulo="Liquidez Corrente" texto="Quanto de ativo de curto prazo cobre cada R$1 de dívida de curto prazo. Acima de 1,0 indica folga." />
        <ExplicaBloco titulo="Liquidez Seca" texto="Igual à corrente, mas sem contar estoque. Mede a folga sem depender de vender o estoque." />
        <ExplicaBloco titulo="Liquidez Imediata" texto="Só o dinheiro em caixa/banco sobre as dívidas de curto prazo. Mostra a capacidade de pagar AGORA." />
      </div>
    </div>
  );
}

function LiquidezContent({ data, isLoading, serie }: { data: LiquidezData; isLoading: boolean; serie: LiquidezSeriePonto[] }) {
  if (isLoading) {
    return <div style={{ padding: "28px 0", textAlign: "center", fontSize: 13, color: "#98A2B3" }}>Carregando…</div>;
  }

  const cclColor = data.ccl >= 0 ? "#039855" : "#B54708";
  const lc = data.liquidezCorrente;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        <Bloco label="Liquidez Corrente" value={lc} destaqueColor={lc == null ? undefined : lc >= 1 ? "#039855" : "#B54708"} />
        <Bloco label="Liquidez Seca" value={data.liquidezSeca} />
        <Bloco label="Liquidez Imediata" value={data.liquidezImediata} />
        <Bloco label="Capital de Giro" value={data.ccl} isMoney destaqueColor={cclColor} />
      </div>

      <div style={{ fontSize: 11, color: "#98A2B3", marginTop: -4 }}>
        Posição em {fmtData(data.refDate)}
      </div>

      {lc != null && (
        <p style={{ margin: 0, fontSize: 11, color: lc >= 1 ? "#039855" : "#B54708" }}>
          Cada R$ 1 de obrigação de curto prazo é coberto por R$ {fmtIndice(lc)} de ativo circulante.
        </p>
      )}

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
        <span>Disponível: <strong style={{ color: "#1D2939" }}>{fmtMoney(data.disponivel)}</strong></span>
        <span>A receber (CR): <strong style={{ color: "#1D2939" }}>{fmtMoney(data.crAberto)}</strong></span>
        <span>A pagar (CP): <strong style={{ color: "#1D2939" }}>{fmtMoney(data.cpAberto)}</strong></span>
        {data.estoque > 0 && (
          <span>Estoque: <strong style={{ color: "#1D2939" }}>{fmtMoney(data.estoque)}</strong></span>
        )}
        <span>Ativo Circ.: <strong style={{ color: "#1D2939" }}>{fmtMoney(data.ac)}</strong></span>
        <span>Passivo Circ.: <strong style={{ color: "#1D2939" }}>{fmtMoney(data.pc)}</strong></span>
      </div>

      <LiquidezTendencias serie={serie} />
    </div>
  );
}

/** Card de empresa única (ou sobrescrita por companyId). */
function LiquidezCardSingle({ companyId, periodEnd }: { companyId?: string; periodEnd: string }) {
  const { isLoading, ...data } = useLiquidez({ companyId, periodEnd });
  const { serie } = useLiquidezSerie({ companyId, meses: 6 });
  return (
    <ChartCardLike title="Liquidez & Solvência" info={INFO}>
      <LiquidezContent data={data} isLoading={isLoading} serie={serie} />
    </ChartCardLike>
  );
}

/** Card consolidado de grupo. */
function LiquidezCardGrupo({ companyIds, periodEnd }: { companyIds: string[]; periodEnd: string }) {
  const { isLoading, ...data } = useLiquidezConsolidado({ companyIds, periodEnd });
  const { serie } = useLiquidezSerie({ companyIds, meses: 6 });
  return (
    <ChartCardLike title="Liquidez & Solvência" info={INFO}>
      <LiquidezContent data={data} isLoading={isLoading} serie={serie} />
    </ChartCardLike>
  );
}

export function LiquidezCard({ companyId, companyIds, periodEnd }: LiquidezCardProps) {
  if (companyIds && companyIds.length > 0) {
    return <LiquidezCardGrupo companyIds={companyIds} periodEnd={periodEnd} />;
  }
  return <LiquidezCardSingle companyId={companyId} periodEnd={periodEnd} />;
}
