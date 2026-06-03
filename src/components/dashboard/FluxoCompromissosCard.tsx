import { Info } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  useFluxoCompromissos,
  useFluxoCompromissosConsolidado,
  type CompromissosData,
} from "@/modules/finance/presentation/hooks/useFluxoCompromissos";
import { ExplicaBloco } from "@/components/dashboard/IndicadorMini";

interface FluxoCompromissosCardProps {
  /** Empresa única (sobrescreve a empresa selecionada). Ignorado se companyIds for passado. */
  companyId?: string;
  /** Consolidado de grupo: soma as empresas informadas. */
  companyIds?: string[];
  /** Horizonte em dias (default 30). */
  dias?: number;
}

/* ── Tokens idênticos aos outros cards de indicadores ── */
const CREME = "#F6F2EB";
const NAVY = "#071D41";
const AMBAR = "#B54708"; // saídas / compromissos a pagar
const VERDE = "#039855";

const INFO =
  "Compromissos a pagar (CP) em aberto que vencem no próximo mês, dia a dia pela data de vencimento " +
  "(na falta dela, pela competência). O acumulado parte do zero e soma os desembolsos ao longo do mês. " +
  "Considera só o lado a pagar — não inclui o saldo bancário atual nem os recebíveis. " +
  "Contas já vencidas e ainda em aberto entram em hoje.";

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);

const fmtMoney2 = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

/** 'YYYY-MM-DD' → 'dd/MM/aaaa'. */
function fmtData(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
/** 'YYYY-MM-DD' → 'dd/MM'. */
function fmtDiaMes(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : iso;
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

function Bloco({ label, value, sub, destaqueColor }: { label: string; value: string; sub?: string; destaqueColor?: string }) {
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
      <span style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "#667085" }}>{label}</span>
      <span style={{ marginTop: 4, fontWeight: 700, fontSize: 20, color: destaqueColor ?? "#1D2939" }}>{value}</span>
      {sub && <span style={{ marginTop: 4, fontSize: 11, color: "#98A2B3" }}>{sub}</span>}
    </div>
  );
}

function ListaCompromissos({ data }: { data: CompromissosData }) {
  return (
    <div style={{ background: "#FFFFFF", border: "var(--border-hairline)", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ maxHeight: 260, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ position: "sticky", top: 0, background: "#FFFFFF", zIndex: 1 }}>
              <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#667085", borderBottom: "var(--border-hairline)" }}>Venc.</th>
              <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#667085", borderBottom: "var(--border-hairline)" }}>Credor / Descrição</th>
              <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#667085", borderBottom: "var(--border-hairline)" }}>A pagar</th>
              <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#667085", borderBottom: "var(--border-hairline)" }}>Acumulado</th>
            </tr>
          </thead>
          <tbody>
            {data.itens.map((it) => (
              <tr key={it.id} style={{ borderBottom: "1px solid #F1F3F5" }}>
                <td style={{ padding: "6px 10px", color: "#667085", whiteSpace: "nowrap" }}>
                  {fmtDiaMes(it.data)}
                  {it.vencida && (
                    <span style={{ marginLeft: 6, fontSize: 9.5, fontWeight: 700, color: "#E53E3E", textTransform: "uppercase" }}>venc.</span>
                  )}
                </td>
                <td style={{ padding: "6px 10px", color: "#1D2939", maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.descricao}>{it.descricao}</td>
                <td style={{ padding: "6px 10px", textAlign: "right", color: AMBAR, fontWeight: 600, whiteSpace: "nowrap" }}>{fmtMoney2(it.valor)}</td>
                <td style={{ padding: "6px 10px", textAlign: "right", color: "#1D2939", fontWeight: 600, whiteSpace: "nowrap" }}>{fmtMoney2(it.acumulado)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} style={{ padding: "8px 10px", fontSize: 11, fontWeight: 700, color: "#667085", borderTop: "var(--border-hairline)" }}>Total no mês</td>
              <td colSpan={2} style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: AMBAR, borderTop: "var(--border-hairline)" }}>{fmtMoney2(data.totalAPagar)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function FluxoCompromissosContent({ data, isLoading }: { data: CompromissosData; isLoading: boolean }) {
  if (isLoading) {
    return <div style={{ padding: "28px 0", textAlign: "center", fontSize: 13, color: "#98A2B3" }}>Carregando…</div>;
  }

  const semCompromissos = data.totalAPagar <= 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ── Blocos numéricos ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <Bloco
          label={`A pagar (${data.horizonteDias} dias)`}
          value={fmtMoney(data.totalAPagar)}
          sub={`${data.totalTitulos} título${data.totalTitulos === 1 ? "" : "s"}`}
          destaqueColor={AMBAR}
        />
        <Bloco
          label="Maior dia"
          value={data.maiorDia ? fmtMoney(data.maiorDia.valor) : "—"}
          sub={data.maiorDia ? `em ${fmtDiaMes(data.maiorDia.data)}` : "sem compromissos"}
        />
        <Bloco
          label="Em atraso"
          value={fmtMoney(data.vencidoTotal)}
          sub={data.vencidoCount > 0 ? `${data.vencidoCount} vencida${data.vencidoCount === 1 ? "" : "s"}` : "em dia"}
          destaqueColor={data.vencidoTotal > 0 ? "#E53E3E" : VERDE}
        />
      </div>

      {semCompromissos ? (
        <div style={{ padding: "28px 0", textAlign: "center", fontSize: 13, color: "#98A2B3" }}>
          Nenhum compromisso a pagar em aberto nos próximos {data.horizonteDias} dias.
        </div>
      ) : (
        <>
          {/* ── Curva de desembolso acumulado (dia a dia) ── */}
          <div style={{ background: "#FFFFFF", border: "var(--border-hairline)", borderRadius: 8, padding: "12px 8px 4px" }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "#667085", padding: "0 6px 6px" }}>
              Desembolso acumulado no mês
            </div>
            <div style={{ width: "100%", height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.dias} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradCompromissos" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={AMBAR} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={AMBAR} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EAECF0" vertical={false} />
                  <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "#98A2B3" }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#98A2B3" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
                    width={42}
                  />
                  <Tooltip
                    formatter={(v: number | string) => [fmtMoney(typeof v === "number" ? v : Number(v)), "Acumulado"]}
                    labelFormatter={(l) => `Dia ${l}`}
                    contentStyle={{ fontSize: 11, borderRadius: 6, border: "var(--border-hairline)" }}
                  />
                  <Area type="stepAfter" dataKey="acumulado" stroke={AMBAR} strokeWidth={2} fill="url(#gradCompromissos)" isAnimationActive={false} dot={{ r: 1.5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── Lista linha a linha por vencimento ── */}
          <ListaCompromissos data={data} />
        </>
      )}

      {/* ── Rodapé de dados-fonte ── */}
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
        <span>Total no mês: <strong style={{ color: "#1D2939" }}>{fmtMoney(data.totalAPagar)}</strong></span>
        {data.alemHorizonte > 0 && (
          <span>Além de {data.horizonteDias} dias: <strong style={{ color: "#1D2939" }}>{fmtMoney(data.alemHorizonte)}</strong></span>
        )}
        {data.semData > 0 && (
          <span>Sem vencimento: <strong style={{ color: "#1D2939" }}>{fmtMoney(data.semData)}</strong></span>
        )}
      </div>

      {data.vencidoTotal > 0 && (
        <p style={{ margin: 0, fontSize: 11, color: "#E53E3E" }}>
          {fmtMoney(data.vencidoTotal)} em {data.vencidoCount} conta{data.vencidoCount === 1 ? "" : "s"} já vencida{data.vencidoCount === 1 ? "" : "s"} — lançadas em hoje no fluxo.
        </p>
      )}

      {/* ── Explicações ── */}
      <div style={{ marginTop: 2, borderTop: "var(--border-hairline)", paddingTop: 12, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
        <ExplicaBloco titulo="A pagar" texto="Saldo em aberto de cada conta a pagar que vence dentro do mês, na data do vencimento." />
        <ExplicaBloco titulo="Acumulado" texto="Soma dos compromissos do começo do mês até cada dia (parte do zero). A curva mostra o esforço de caixa crescendo." />
        <ExplicaBloco titulo="Em atraso" texto="Contas já vencidas e ainda não pagas. Precisam de caixa imediato e entram em hoje." />
      </div>
    </div>
  );
}

/** Card de empresa única (ou sobrescrita por companyId). */
function FluxoCompromissosCardSingle({ companyId, dias }: { companyId?: string; dias?: number }) {
  const { isLoading, ...data } = useFluxoCompromissos({ companyId, dias });
  return (
    <ChartCardLike title="Compromissos a Pagar (CP)" info={INFO}>
      <FluxoCompromissosContent data={data} isLoading={isLoading} />
    </ChartCardLike>
  );
}

/** Card consolidado de grupo. */
function FluxoCompromissosCardGrupo({ companyIds, dias }: { companyIds: string[]; dias?: number }) {
  const { isLoading, ...data } = useFluxoCompromissosConsolidado({ companyIds, dias });
  return (
    <ChartCardLike title="Compromissos a Pagar (CP)" info={INFO}>
      <FluxoCompromissosContent data={data} isLoading={isLoading} />
    </ChartCardLike>
  );
}

export function FluxoCompromissosCard({ companyId, companyIds, dias }: FluxoCompromissosCardProps) {
  if (companyIds && companyIds.length > 0) {
    return <FluxoCompromissosCardGrupo companyIds={companyIds} dias={dias} />;
  }
  return <FluxoCompromissosCardSingle companyId={companyId} dias={dias} />;
}
