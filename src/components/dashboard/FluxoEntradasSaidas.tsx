import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { MoveHorizontal } from "lucide-react";
import type { FluxoProjetadoData, FluxoItem } from "@/modules/finance/presentation/hooks/useFluxoProjetado";

/* ── Tokens (padrão do sistema: header navy #071D41) ── */
const VERDE = "#039855";
const VERMELHO = "#E53E3E";
const NAVY = "#071D41";
/** Tons claros pra número colorido legível sobre o navy (mesmos do FluxoCaixa). */
const VERDE_CLARO = "#34D399";
const VERMELHO_CLARO = "#FCA5A5";

/** Altura da área de conteúdo (rolável) das 3 colunas — alinha os cards. */
const CONTENT_H = 340;
/** Largura por dia no gráfico (garante leitura do tempo; o resto rola pro lado). */
const PX_POR_DIA = 28;

const fmtMoney = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
const fmtMoney2 = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

/** 'YYYY-MM-DD' → 'dd/MM'. */
function fmtDiaMes(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}` : iso;
}

/** Painel-lista de Entradas ou Saídas (uma das colunas laterais). */
/** Rótulo amigável da forma de recebimento/pagamento. */
function fmtForma(forma?: string): string {
  if (!forma) return "";
  const map: Record<string, string> = {
    pix: "Pix", boleto: "Boleto", dinheiro: "Dinheiro", cartao_credito: "Cartão", cartao_debito: "Débito",
    transferencia: "Transferência", pendente: "Pendente", parcelado: "Parcelado", multiplo: "Múltiplo", misto: "Misto",
  };
  return map[forma.toLowerCase()] || forma;
}

function ListaFluxo({
  titulo,
  subtitulo,
  itens,
  cor,
  total,
  vazioMsg,
  nota,
}: {
  titulo: string;
  subtitulo: string;
  itens: FluxoItem[];
  cor: string;
  total: number;
  vazioMsg: string;
  nota?: React.ReactNode;
}) {
  const corClara = cor === VERDE ? VERDE_CLARO : VERMELHO_CLARO;
  return (
    <div style={{ background: "#FFFFFF", border: "var(--border-hairline)", borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "12px 16px", background: NAVY, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "#fff" }}>{titulo}</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>{subtitulo}</div>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: corClara, whiteSpace: "nowrap" }}>{fmtMoney(total)}</div>
      </div>

      <div style={{ height: CONTENT_H, overflowY: "auto" }}>
        {itens.length === 0 ? (
          <div style={{ padding: "32px 14px", textAlign: "center", fontSize: 13, color: "#98A2B3" }}>{vazioMsg}</div>
        ) : (
          itens.map((it) => (
            <div key={it.id} style={{ padding: "9px 14px", borderBottom: "1px solid #F1F3F5" }}>
              {/* Linha 1: descrição (larga) + valor */}
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <span style={{ fontSize: 13, color: "#1D2939", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={it.descricao}>
                  {it.descricao}
                </span>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: cor, whiteSpace: "nowrap" }}>{fmtMoney2(it.valor)}</span>
              </div>
              {/* Linha 2: vencimento + forma (+ tag vencida) */}
              <div style={{ marginTop: 2, fontSize: 11.5, color: "#98A2B3" }}>
                vence {fmtDiaMes(it.data)}
                {it.forma && <span> · {fmtForma(it.forma)}</span>}
                {it.vencida && <span style={{ marginLeft: 6, fontWeight: 700, color: VERMELHO, textTransform: "uppercase" }}>· vencida</span>}
              </div>
            </div>
          ))
        )}
      </div>

      {nota && (
        <div style={{ padding: "8px 14px", borderTop: "1px dashed #EAECF0", fontSize: 11, color: "#98A2B3", display: "flex", flexDirection: "column", gap: 3 }}>{nota}</div>
      )}

      <div style={{ padding: "9px 14px", borderTop: "var(--border-hairline)", display: "flex", justifyContent: "space-between", fontSize: 12, color: "#667085" }}>
        <span>{itens.length} título{itens.length === 1 ? "" : "s"}</span>
        <span>Total: <strong style={{ color: cor }}>{fmtMoney(total)}</strong></span>
      </div>
    </div>
  );
}

/** Coluna central: duas ondas — recursos (verde) × compromissos (vermelho). O cruzamento é o aperto. */
function OndaSaldo({ data }: { data: FluxoProjetadoData }) {
  const larguraGrafico = data.serie.length * PX_POR_DIA;
  const rolavel = data.serie.length > 14;

  return (
    <div style={{ background: "#FFFFFF", border: "var(--border-hairline)", borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "12px 16px", background: NAVY, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "#fff" }}>Onda do caixa</div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>quando o vermelho passa o verde, falta caixa</div>
        </div>
        {rolavel && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
            <MoveHorizontal size={13} /> arraste
          </span>
        )}
      </div>

      {/* Wrapper rolável na horizontal: as ondas têm largura fixa por dia */}
      <div style={{ height: CONTENT_H, overflowX: "auto", overflowY: "hidden" }}>
        <div style={{ width: larguraGrafico, minWidth: "100%", height: CONTENT_H }}>
          <ResponsiveContainer width="100%" height={CONTENT_H}>
            <ComposedChart data={data.serie} margin={{ top: 12, right: 12, left: 8, bottom: 4 }}>
              <defs>
                <linearGradient id="recursosFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={VERDE} stopOpacity={0.24} />
                  <stop offset="100%" stopColor={VERDE} stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#EAECF0" vertical={false} />
              <XAxis dataKey="dia" tick={{ fontSize: 11, fill: "#667085" }} axisLine={false} tickLine={false} interval={0} angle={-90} textAnchor="end" height={42} />
              <YAxis tick={{ fontSize: 11, fill: "#98A2B3" }} axisLine={false} tickLine={false} tickFormatter={(v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} width={46} />
              <Tooltip
                formatter={(v: number | string, name) => [fmtMoney(typeof v === "number" ? v : Number(v)), name === "recursos" ? "Recursos (saldo + entradas)" : "Compromissos (saídas)"]}
                labelFormatter={(l) => `Dia ${l}`}
                contentStyle={{ fontSize: 12, borderRadius: 6, border: "var(--border-hairline)" }}
              />
              <Legend formatter={(value) => (value === "recursos" ? "Recursos (saldo + entradas)" : "Compromissos (saídas)")} wrapperStyle={{ fontSize: 11.5 }} />
              <Area type="monotone" dataKey="recursos" name="recursos" stroke={VERDE} strokeWidth={2.5} fill="url(#recursosFill)" isAnimationActive={false} dot={false} />
              <Line type="monotone" dataKey="compromissos" name="compromissos" stroke={VERMELHO} strokeWidth={2.5} isAnimationActive={false} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ padding: "9px 14px", borderTop: "var(--border-hairline)", display: "flex", justifyContent: "space-between", fontSize: 12, color: "#667085" }}>
        <span>Menor saldo: <strong style={{ color: data.menorSaldo < 0 ? VERMELHO : VERDE }}>{fmtMoney(data.menorSaldo)}</strong></span>
        <span>Fim: <strong style={{ color: data.saldoFinal < 0 ? VERMELHO : VERDE }}>{fmtMoney(data.saldoFinal)}</strong></span>
      </div>
    </div>
  );
}

export function FluxoEntradasSaidas({ data, isLoading }: { data: FluxoProjetadoData; isLoading: boolean }) {
  if (isLoading) {
    return <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#98A2B3" }}>Carregando…</div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
      <ListaFluxo
        titulo="Entradas (a receber)"
        subtitulo={data.comReceber ? "a vencer · sem cartão" : "previstos · fora do saldo (pior caso)"}
        itens={data.entradasItens}
        cor={VERDE}
        total={data.totalReceber}
        vazioMsg="Nenhum recebível a vencer no período."
        nota={
          data.receberAtraso > 0 || data.cartaoReceberExcluido > 0 ? (
            <>
              {data.receberAtraso > 0 && (
                <span>⚠️ Em atraso (não projetado): <strong style={{ color: VERMELHO }}>{fmtMoney(data.receberAtraso)}</strong> em {data.receberAtrasoCount} título{data.receberAtrasoCount === 1 ? "" : "s"}.</span>
              )}
              {data.cartaoReceberExcluido > 0 && (
                <span>Cartão (repasse) fora: {fmtMoney(data.cartaoReceberExcluido)}.</span>
              )}
            </>
          ) : undefined
        }
      />
      <OndaSaldo data={data} />
      <ListaFluxo
        titulo="Saídas (a pagar)"
        subtitulo="compromissos a pagar"
        itens={data.saidasItens}
        cor={VERMELHO}
        total={data.totalPagar}
        vazioMsg="Nenhum compromisso no período."
      />
    </div>
  );
}
