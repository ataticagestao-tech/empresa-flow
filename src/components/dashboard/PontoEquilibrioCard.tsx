import { Info } from "lucide-react";
import {
  usePontoEquilibrio,
  usePontoEquilibrioConsolidado,
  type PontoEquilibrioData,
} from "@/modules/finance/presentation/hooks/usePontoEquilibrio";

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

/* Rótulo SVG com fundo translúcido (marca-texto) — destaca o valor sobre as linhas/áreas. */
function SvgLabel({ x, y, anchor = "middle", size, weight = 700, color, bg = "rgba(255,255,255,0.82)", children }: {
  x: number; y: number; anchor?: "start" | "middle" | "end"; size: number; weight?: number; color: string; bg?: string; children: string;
}) {
  const w = children.length * size * 0.56 + 12;
  const h = size + 6;
  const bx = anchor === "middle" ? x - w / 2 : anchor === "end" ? x - w : x;
  return (
    <g>
      <rect x={bx} y={y - size * 0.8 - 2} width={w} height={h} rx={5} fill={bg} />
      <text x={x} y={y} textAnchor={anchor} fontSize={size} fontWeight={weight} fill={color}>{children}</text>
    </g>
  );
}

/* ── Gráfico CVL (Custo-Volume-Lucro): Receita × Custo Total, com Lucro/Prejuízo ── */
function GraficoPontoEquilibrio({ custoFixo, mcPct, peContabil, receita }: {
  custoFixo: number;
  mcPct: number; // fração 0..1 (margem de contribuição)
  peContabil: number; // faturamento de equilíbrio (R$)
  receita: number;
}) {
  const cvRatio = Math.min(0.98, Math.max(0, 1 - mcPct)); // custo variável / receita
  const xMax = Math.max(peContabil, receita, 1) * 1.4;
  const yMax = xMax; // mesma escala → linha de receita a 45°

  const W = 600, H = 280, padL = 46, padR = 28, padT = 24, padB = 32;
  const x0 = padL, x1 = W - padR, y0 = padT, y1 = H - padB;
  const mapX = (x: number) => x0 + (x / xMax) * (x1 - x0);
  const mapY = (y: number) => y1 - (y / yMax) * (y1 - y0);

  const custoMax = custoFixo + cvRatio * xMax;
  const pe = peContabil;

  const recA = [mapX(0), mapY(0)];
  const recB = [mapX(xMax), mapY(yMax)];
  const cusA = [mapX(0), mapY(custoFixo)];
  const cusB = [mapX(xMax), mapY(custoMax)];
  const beP = [mapX(pe), mapY(pe)];

  const prejuizo = `${recA[0]},${recA[1]} ${beP[0]},${beP[1]} ${cusA[0]},${cusA[1]}`;
  const lucro = `${beP[0]},${beP[1]} ${recB[0]},${recB[1]} ${cusB[0]},${cusB[1]}`;

  const cPrej = [(recA[0] + beP[0] + cusA[0]) / 3, (recA[1] + beP[1] + cusA[1]) / 3];
  const cLucro = [(beP[0] + recB[0] + cusB[0]) / 3, (beP[1] + recB[1] + cusB[1]) / 3];

  const temReceita = receita > 0 && receita <= xMax;
  const atual = [mapX(receita), mapY(receita)];

  return (
    <div style={{ width: "100%", background: "#fff", border: "var(--border-hairline)", borderRadius: 8, padding: 8 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }}>
        {/* áreas de prejuízo (vermelho) e lucro (verde) */}
        <polygon points={prejuizo} fill="#E53E3E" fillOpacity={0.15} />
        <polygon points={lucro} fill="#039855" fillOpacity={0.15} />

        {/* eixos com seta nas pontas */}
        <line x1={x0} y1={y1} x2={x0} y2={y0} stroke="#475467" strokeWidth={1.5} />
        <polygon points={`${x0 - 4},${y0} ${x0 + 4},${y0} ${x0},${y0 - 7}`} fill="#475467" />
        <line x1={x0} y1={y1} x2={x1} y2={y1} stroke="#475467" strokeWidth={1.5} />
        <polygon points={`${x1},${y1 - 4} ${x1},${y1 + 4} ${x1 + 7},${y1}`} fill="#475467" />
        <text x={x0 - 6} y={y0 + 9} textAnchor="end" fontSize={13} fontWeight={700} fill="#475467">R$</text>
        <text x={x1 + 4} y={y1 + 21} textAnchor="end" fontSize={13} fontWeight={700} fill="#475467">Faturamento</text>

        {/* vertical pontilhada do equilíbrio */}
        <line x1={beP[0]} y1={y1} x2={beP[0]} y2={beP[1]} stroke="#98A2B3" strokeWidth={1} strokeDasharray="4 4" />

        {/* linhas receita / custo total */}
        <line x1={recA[0]} y1={recA[1]} x2={recB[0]} y2={recB[1]} stroke="#039855" strokeWidth={3} strokeLinecap="round" />
        <line x1={cusA[0]} y1={cusA[1]} x2={cusB[0]} y2={cusB[1]} stroke="#E53E3E" strokeWidth={3} strokeLinecap="round" />

        {/* rótulos das áreas */}
        <text x={cPrej[0]} y={cPrej[1]} textAnchor="middle" fontSize={14} fontWeight={800} fill="#B42318">PREJUÍZO</text>
        <text x={cLucro[0]} y={cLucro[1]} textAnchor="middle" fontSize={14} fontWeight={800} fill="#027A48">LUCRO</text>

        {/* rótulos das linhas */}
        <text x={mapX(xMax * 0.8)} y={mapY(xMax * 0.86) - 6} textAnchor="middle" fontSize={12.5} fontWeight={700} fill="#039855">RECEITA</text>
        <text x={mapX(xMax * 0.17)} y={mapY(custoFixo + cvRatio * xMax * 0.17) - 8} textAnchor="middle" fontSize={12.5} fontWeight={700} fill="#E53E3E">CUSTO TOTAL</text>

        {/* ponto de equilíbrio */}
        <circle cx={beP[0]} cy={beP[1]} r={5.5} fill="#475467" stroke="#fff" strokeWidth={1.5} />
        <SvgLabel x={beP[0]} y={beP[1] - 14} size={13} weight={700} color="#1D2939">Ponto de Equilíbrio</SvgLabel>
        <SvgLabel x={beP[0]} y={y1 - 6} size={14.5} weight={800} color="#1D2939">{fmtMoney(pe)}</SvgLabel>

        {/* posição atual da empresa */}
        {temReceita && (
          <>
            <line x1={atual[0]} y1={y1} x2={atual[0]} y2={atual[1]} stroke="#071D41" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={atual[0]} cy={atual[1]} r={4.5} fill="#071D41" stroke="#fff" strokeWidth={1.5} />
            <SvgLabel x={atual[0]} y={atual[1] - 10} size={14.5} weight={800} color="#071D41">{`Você: ${fmtMoney(receita)}`}</SvgLabel>
          </>
        )}
      </svg>
      <div style={{ fontSize: 10.5, color: "#98A2B3", textAlign: "center", marginTop: 2 }}>
        Onde a <span style={{ color: "#039855", fontWeight: 700 }}>Receita</span> cruza o{" "}
        <span style={{ color: "#E53E3E", fontWeight: 700 }}>Custo Total</span>, o lucro é zero. Eixo horizontal = faturamento (R$).
      </div>
    </div>
  );
}

function PontoEquilibrioContent({ data, isLoading }: { data: PontoEquilibrioData; isLoading: boolean }) {
  if (isLoading) {
    return <div style={{ padding: "28px 0", textAlign: "center", fontSize: 13, color: "#98A2B3" }}>Carregando…</div>;
  }

  const podeGraf = !data.mcInvalida && data.peContabil != null && data.mcPct != null && data.mcPct > 0;
  const ms = data.margemSeguranca;
  const acima = ms != null && ms >= 0;

  // Barra de progresso até o ponto de equilíbrio
  const pe = data.peContabil ?? 0;
  const fillPct = pe > 0 ? Math.min(100, (data.receita / pe) * 100) : 0;
  const gapPct = ms != null ? Math.round(Math.abs(ms) * 100) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", gap: 16, alignItems: "stretch", flexWrap: "wrap" }}>
      {/* Gráfico */}
      <div style={{ flex: "3 1 380px", minWidth: 300 }}>
        {podeGraf ? (
          <GraficoPontoEquilibrio custoFixo={data.custoFixo} mcPct={data.mcPct!} peContabil={data.peContabil!} receita={data.receita} />
        ) : (
          <div style={{ padding: "16px", textAlign: "center", fontSize: 12, color: "#B54708", background: "#fff", border: "var(--border-hairline)", borderRadius: 8 }}>
            Não é possível traçar o gráfico: a margem de contribuição é ≤ 0 (os custos variáveis consomem toda a receita).
          </div>
        )}
      </div>

      {/* Explicação ao lado */}
      <div style={{ flex: "1 1 220px", minWidth: 210, display: "flex", flexDirection: "column", gap: 10, fontSize: 12, color: "#475467", lineHeight: 1.5 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, color: "#071D41" }}>
          Como ler
        </div>
        <p style={{ margin: 0 }}>
          O <strong>ponto de equilíbrio</strong> é o faturamento mínimo para a empresa <strong>não dar prejuízo</strong>.
        </p>
        <p style={{ margin: 0 }}>
          A linha <span style={{ color: "#039855", fontWeight: 700 }}>Receita</span> cresce com as vendas; a{" "}
          <span style={{ color: "#E53E3E", fontWeight: 700 }}>Custo Total</span> parte dos custos fixos e sobe com os variáveis.
          Onde se cruzam, o <strong>lucro é zero</strong>: à esquerda você opera no{" "}
          <span style={{ color: "#B42318", fontWeight: 700 }}>prejuízo</span>; à direita, no{" "}
          <span style={{ color: "#027A48", fontWeight: 700 }}>lucro</span>.
        </p>
        {podeGraf && (
          <div style={{ marginTop: 2, borderTop: "var(--border-hairline)", paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
            <div>
              Seu ponto de equilíbrio: <strong style={{ color: "#071D41" }}>{fmtMoney(data.peContabil!)}</strong>
            </div>
            {ms != null && (
              <div style={{ color: acima ? "#039855" : "#B54708", fontWeight: 600 }}>
                Sua receita está {fmtPctFrac1(Math.abs(ms))}% {acima ? "acima" : "abaixo"} do equilíbrio.
              </div>
            )}
          </div>
        )}
      </div>
      </div>

      {/* Barra: progresso até o ponto de equilíbrio (estilo Vendas por Item) */}
      {podeGraf && gapPct != null && (
        <div style={{ background: "#F6F2EB", border: "var(--border-hairline)", borderRadius: 8, padding: "12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8, gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 12.5, fontWeight: 700, color: "#1D2939" }}>Progresso até o ponto de equilíbrio</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: acima ? "#059669" : "#B42318" }}>
              {acima ? `Equilíbrio atingido · ${gapPct}% acima` : `Falta ${gapPct}% para o equilíbrio`}
            </span>
          </div>
          <div style={{ position: "relative", height: 14 }}>
            {/* trilha amarela = caminho até o equilíbrio (estilo "mês passado" de Vendas por Item) */}
            <div style={{ position: "absolute", left: 0, top: 0, height: 14, width: "100%", background: "rgba(239, 159, 39, 0.42)", borderRadius: 7 }} />
            {/* progresso verde = receita atual */}
            <div style={{ position: "absolute", left: 0, top: 4, height: 6, width: `${fillPct}%`, background: "#059669", borderRadius: 3, transition: "width .3s" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, color: "#667085", fontVariantNumeric: "tabular-nums" }}>
            <span>Receita: <strong style={{ color: "#1D2939" }}>{fmtMoney(data.receita)}</strong></span>
            <span>Equilíbrio: <strong style={{ color: "#1D2939" }}>{fmtMoney(pe)}</strong></span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Card de empresa única (ou sobrescrita por companyId). */
function PontoEquilibrioCardSingle({ companyId, periodStart, periodEnd }: { companyId?: string; periodStart: string; periodEnd: string }) {
  const { isLoading, ...data } = usePontoEquilibrio({ companyId, periodStart, periodEnd });
  return (
    <ChartCardLike title="Ponto de Equilíbrio" info={INFO}>
      <PontoEquilibrioContent data={data} isLoading={isLoading} />
    </ChartCardLike>
  );
}

/** Card consolidado de grupo. */
function PontoEquilibrioCardGrupo({ companyIds, periodStart, periodEnd }: { companyIds: string[]; periodStart: string; periodEnd: string }) {
  const { isLoading, ...data } = usePontoEquilibrioConsolidado({ companyIds, periodStart, periodEnd });
  return (
    <ChartCardLike title="Ponto de Equilíbrio" info={INFO}>
      <PontoEquilibrioContent data={data} isLoading={isLoading} />
    </ChartCardLike>
  );
}

export function PontoEquilibrioCard({ companyId, companyIds, periodStart, periodEnd }: PontoEquilibrioCardProps) {
  if (companyIds && companyIds.length > 0) {
    return <PontoEquilibrioCardGrupo companyIds={companyIds} periodStart={periodStart} periodEnd={periodEnd} />;
  }
  return <PontoEquilibrioCardSingle companyId={companyId} periodStart={periodStart} periodEnd={periodEnd} />;
}
