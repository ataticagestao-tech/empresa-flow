/**
 * Design System — Tática Gestão
 *
 * Tokens centralizados usados nas telas Dashboard, Vendas, Clientes e demais.
 * Importe e use estas constantes/classes para manter consistência visual.
 *
 * Uso:
 *   import { colors, card, header, typography, layout } from "@/styles/designSystem";
 *   <div className={card.base}>...</div>
 *   <div style={{ color: colors.text1 }}>...</div>
 */

/* ─── Paleta ──────────────────────────────────────────────────── */
export const colors = {
  // Azul primário (brand)
  primary: "#059669",
  primaryHover: "#243d5f",
  primarySoft: "#ECFDF4",
  primaryBorder: "#BFDBFE",

  // Sucesso (faturamento, ativo)
  success: "#039855",
  successBright: "#10B981",
  successSoft: "#ECFDF3",

  // Erro (vencido, inadimplente, excluir)
  danger: "#D92D20",
  dangerSoft: "#FEF3F2",

  // Atenção (em aberto, pendente)
  warning: "#D97706",
  warningBright: "#F59E0B",
  warningSoft: "#FFFBEB",
  warningBorder: "#FEDF89",

  // Texto
  text1: "#1D2939", // títulos e valores principais
  text2: "#667085", // texto secundário
  textMuted: "#98A2B3", // labels e anotações
  textLight: "#888", // placeholders

  // Fundos
  surface: "#FFFFFF",
  canvas: "#F6F2EB", // creme (fundo das páginas)
  panelSoft: "#F9FAFB", // cards internos / stats
  panelHover: "#F6F2EB",

  // Bordas
  border: "#EAECF0",
  borderStrong: "#D0D5DD",
  borderSoft: "#F1F3F5",
} as const;

/* ─── Tipografia (Tailwind classes) ───────────────────────────── */
export const typography = {
  // Títulos de card (quadrantes)
  cardTitle: "text-[22px] font-extrabold tracking-[-0.02em] text-[#1D2939]",
  cardTitleSmall: "text-[18px] font-bold tracking-[-0.01em] text-[#1D2939]",
  cardSubtitle: "text-[13px] text-[#98A2B3]",

  // Labels sobre valor (uppercase pequeno)
  label: "text-[10.5px] font-bold uppercase tracking-[0.04em] text-[#98A2B3]",
  labelWidget: "text-[11.5px] font-medium text-[#98A2B3]",

  // Valores
  valueBig: "text-[26px] font-extrabold tracking-[-0.02em] tabular-nums",
  valueMedium: "text-[18px] font-bold tracking-[-0.01em] tabular-nums",
  valueSmall: "text-[15px] font-bold tabular-nums",

  // Texto corrido
  body: "text-[13px] text-[#1D2939]",
  bodyMuted: "text-[12px] text-[#667085]",
  bodyTiny: "text-[11px] text-[#98A2B3]",

  // Tabela
  tableHead: "text-[11.5px] font-bold text-black uppercase tracking-wider",
  tableRow: "text-[12px] whitespace-nowrap",

  // Badges
  badge: "text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border border-[1.5px] whitespace-nowrap",
} as const;

/* ─── Cards / Painéis ─────────────────────────────────────────── */
export const card = {
  /** Card padrão (fundo branco, borda clara, sombra leve, rounded-xl) */
  base: "bg-white border border-[#EAECF0] rounded-xl p-5 shadow-sm",
  baseCompact: "bg-white border border-[#EAECF0] rounded-xl p-4 shadow-sm",

  /** Painel dividido (lista + detalhe) — borda mais marcada, rounded-lg */
  panel: "bg-white border border-[#ccc] rounded-lg overflow-hidden flex flex-col",

  /** Card soft interno (stats dentro de outro card) */
  soft: "bg-[#F9FAFB] border border-[#EAECF0] rounded-lg p-3",

  /** Box shadow inline (caso precise como style) */
  shadow: {
    boxShadow: "0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)",
  },
} as const;

/* ─── Headers de card (barra azul) ────────────────────────────── */
export const header = {
  /** Header azul grosso (painéis tipo Clientes / Funcionários) */
  blueBar: "bg-[#059669] px-4 py-2.5 flex items-center justify-between",
  blueBarTitle: "text-xs font-bold text-white uppercase tracking-widest",
  blueBarAction: "text-xs font-semibold text-[#BFDBFE] hover:text-white",

  /** Header de card branco com borda inferior (padrão Dashboard) */
  cardHeader: "flex items-center justify-between px-5 py-4 border-b border-[#EAECF0]",
} as const;

/* ─── Botões ──────────────────────────────────────────────────── */
export const button = {
  /** Botão primário (azul) */
  primary: "bg-[#059669] hover:bg-[#243d5f] text-white",
  /** Botão secundário (branco com borda) */
  secondary: "bg-white border border-[#EAECF0] hover:bg-[#F9FAFB] text-[#1D2939]",
  /** Botão de destruir */
  danger: "bg-[#D92D20] hover:bg-[#B42318] text-white",
  /** Link discreto (ação secundária) */
  link: "text-[#059669] hover:underline",
} as const;

/* ─── Badges de status ────────────────────────────────────────── */
export const statusBadge = {
  ativo: "text-[#039855] border-[#039855] bg-[#ECFDF3]",
  inadimplente: "text-[#D92D20] border-[#D92D20] bg-[#FEF3F2]",
  inativo: "text-[#666] border-[#aaa] bg-[#F6F2EB]",
  aberto: "text-[#D97706] border-[#D97706] bg-[#FFFBEB]",
  pago: "text-[#039855] border-[#039855] bg-[#ECFDF3]",
  vencido: "text-[#D92D20] border-[#D92D20] bg-[#FEF3F2]",
} as const;

/* ─── Layout helpers ──────────────────────────────────────────── */
export const layout = {
  /** Grid de KPIs (4 colunas responsivas) */
  kpiGrid: "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4",

  /** Split list/detail (Clientes, Funcionários) */
  splitPage: "flex gap-4 h-[calc(100vh-120px)]",
  splitList: "w-1/3 min-w-[360px]",
  splitDetail: "flex-1",

  /** Row de gráficos lado-a-lado (responsivo) */
  chartsRow: "flex gap-4 w-full flex-wrap lg:flex-nowrap",
  chartBox: "flex-1 min-w-0",

  /** Container de página */
  pageContainer: "w-full",
} as const;

/* ─── Tabelas ─────────────────────────────────────────────────── */
export const table = {
  /** Wrapper da tabela (com overflow e scroll horizontal) */
  wrapper: "bg-white border border-[#EAECF0] rounded-lg overflow-hidden",

  /** Header da tabela (título + ações) */
  header: "bg-white border-b border-[#EAECF0] px-4 py-2.5 flex items-center justify-between",
  headerTitle: "text-[12px] font-bold text-black uppercase tracking-widest",

  /** Tabela propriamente dita */
  base: "w-full text-sm",
  thead: "bg-white text-[11.5px] font-bold text-black uppercase tracking-wider border-b-2 border-[#D0D5DD] whitespace-nowrap",
  tr: "border-b border-[#F1F3F5] hover:bg-[#F6F2EB] transition-colors text-[12px] whitespace-nowrap",
  td: "px-2 py-1",
  tdCode: "px-2 py-1 font-mono text-[11px] text-[#667085]",
  tdMoney: "px-2 py-1 text-right font-semibold text-[#1D2939] tabular-nums",
  tdMuted: "px-2 py-1 text-center text-[#667085]",
} as const;

/* ─── Inputs ──────────────────────────────────────────────────── */
export const input = {
  base: "h-9 px-3 text-[13px] border border-[#ddd] rounded-md bg-white focus:border-[#059669] focus:ring-1 focus:ring-[#059669] outline-none",
  withIcon: "h-9 pl-9 pr-3 text-[13px] border border-[#ddd] rounded-md bg-white focus:border-[#059669] focus:ring-1 focus:ring-[#059669] outline-none",
} as const;

/* ─── Formatters (re-export para conveniência) ────────────────── */
export const fmt = {
  /** R$ 1.234,56 */
  brl: (v: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v),

  /** R$ 1.234 (sem centavos) */
  brlInt: (v: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(v),

  /** 12,3% */
  pct: (v: number) => `${v.toFixed(1)}%`,

  /** 15/04 */
  dateShort: (iso: string) =>
    iso ? iso.slice(5, 10).split("-").reverse().join("/") : "—",

  /** 15/04/2026 */
  date: (iso: string) =>
    iso ? iso.split("-").reverse().join("/") : "—",
} as const;
