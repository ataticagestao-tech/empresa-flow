import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

/* ──────────────────────────────────────────────────────────────────────────
 * Componentes pequenos e proporcionais para os cards de indicadores:
 *  - MiniTrend: mini-gráfico de tendência (série mensal) de UM indicador.
 *  - ExplicaBloco: bloco de texto explicativo curto.
 * Estilo casado com os blocos brancos dos cards (CicloCaixaCard / LiquidezCard).
 * ──────────────────────────────────────────────────────────────────────── */

const BOX: React.CSSProperties = {
  background: "#FFFFFF",
  border: "var(--border-hairline)",
  borderRadius: 8,
  padding: 10,
};

const TITULO: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: "#667085",
};

export interface MiniTrendProps {
  titulo: string;
  data: Array<{ mes: string; valor: number | null }>;
  sufixo?: string;
  corLinha?: string;
  fmt?: (v: number) => string;
  refLine?: number;
  refLabel?: string;
}

/** Último ponto não-nulo da série (para o destaque). */
function ultimoNaoNulo(data: Array<{ valor: number | null }>): number | null {
  for (let i = data.length - 1; i >= 0; i--) {
    const v = data[i]?.valor;
    if (v != null) return v;
  }
  return null;
}

export function MiniTrend({ titulo, data, sufixo, corLinha, fmt, refLine, refLabel }: MiniTrendProps) {
  const temDados = data.some((d) => d.valor != null);
  const stroke = corLinha ?? "#071D41";
  const fmtVal = (v: number) => (fmt ? fmt(v) : String(v));
  const ultimo = ultimoNaoNulo(data);

  return (
    <div style={BOX}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6 }}>
        <span style={TITULO}>{titulo}</span>
        {ultimo != null && (
          <span style={{ fontSize: 16, fontWeight: 700, color: "#1D2939", lineHeight: 1 }}>
            {fmtVal(ultimo)}
            {sufixo ?? ""}
          </span>
        )}
      </div>

      {temDados ? (
        <div style={{ width: "100%", height: 72, marginTop: 4 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              {refLine != null && (
                <ReferenceLine y={refLine} stroke="#D0D5DD" strokeDasharray="3 3" label={refLabel} />
              )}
              <XAxis
                dataKey="mes"
                tick={{ fontSize: 9, fill: "#98A2B3" }}
                axisLine={false}
                tickLine={false}
                height={14}
                interval="preserveStartEnd"
              />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                formatter={(v: number | string) => {
                  const n = typeof v === "number" ? v : Number(v);
                  return [`${fmtVal(n)}${sufixo ?? ""}`, titulo];
                }}
                contentStyle={{ fontSize: 11, borderRadius: 6, border: "var(--border-hairline)" }}
              />
              <Line
                type="monotone"
                dataKey="valor"
                stroke={stroke}
                strokeWidth={2}
                dot={{ r: 2 }}
                activeDot={{ r: 3 }}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div
          style={{
            height: 72,
            marginTop: 4,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            color: "#98A2B3",
          }}
        >
          sem dados
        </div>
      )}
    </div>
  );
}

export interface ExplicaBlocoProps {
  titulo: string;
  texto: string;
}

export function ExplicaBloco({ titulo, texto }: ExplicaBlocoProps) {
  return (
    <div style={BOX}>
      <span style={TITULO}>{titulo}</span>
      <p style={{ margin: 0, marginTop: 6, fontSize: 11.5, lineHeight: 1.5, color: "#475467" }}>{texto}</p>
    </div>
  );
}
