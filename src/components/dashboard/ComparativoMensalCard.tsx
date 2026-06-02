import { useMemo, useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { ChevronDown, ChevronRight, Info, TrendingUp, TrendingDown } from "lucide-react";
import { format, subMonths, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

/* ── Tokens idênticos aos demais cards da Indicadores ── */
const CREME = "#F6F2EB";
const NAVY = "#071D41";

/* Divisores de coluna: linha clara entre os meses + linha forte antes da Variação. */
const MES_DIV = "#BCC4CF";
const VAR_DIV = "#8C96A3";

/* Larguras de coluna ajustáveis por arrasto, persistidas em localStorage (padrão Vendas.tsx). */
const LS_COL_WIDTHS = "comparativo_dre_col_widths";
const COL_DEFAULTS = { conta: 280, mes: 124, consolidado: 140, pct: 86 };

/* Puxador de redimensionamento no canto direito do cabeçalho da coluna. */
function Puxador({ onDown }: { onDown: (e: React.MouseEvent) => void }) {
  return (
    <span
      onMouseDown={onDown}
      onClick={(e) => e.stopPropagation()}
      title="Arraste para ajustar a largura"
      style={{ position: "absolute", top: 0, right: 0, height: "100%", width: 7, cursor: "col-resize", userSelect: "none" }}
    />
  );
}

const INFO =
  "Compara até 12 meses no regime de CAIXA (pelo que foi efetivamente recebido/pago no mês). " +
  "Receitas = contas a receber pagas; Despesas = contas a pagar pagas, ambas pela data de pagamento. " +
  "Variação = último mês − primeiro mês do intervalo. Mesma base do DRE.";

const fmt = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

/** Valor cheio (R$ 1.234,56) — tudo no mesmo tamanho. */
function Moeda({ v }: { v: number }) {
  return <>{fmt(v)}</>;
}

/** "2026-05" → "Mai/26" */
function labelMes(mes: string) {
  const d = parseISO(`${mes}-01`);
  return format(d, "MMM/yy", { locale: ptBR }).replace(/^./, (c) => c.toUpperCase());
}

interface LinhaComp {
  contaId: string;
  codigo: string;
  descricao: string;
  tipo: string; // revenue | expense | cost
  valores: Record<string, number>; // comp "yyyy-MM" → valor pago no mês
}

interface Grupo {
  linhas: LinhaComp[];
  totais: Record<string, number>; // comp → total do grupo no mês
}

interface ComparativoMensalCardProps {
  companyId?: string;
}

/* ── Wrapper visual (igual ao ChartCardLike usado nos outros cards) ── */
function ChartCardLike({ title, info, right, children }: {
  title: string;
  info?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ background: CREME, borderRadius: 10, border: "var(--border-hairline)", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "14px 16px", background: NAVY, borderTopLeftRadius: 10, borderTopRightRadius: 10, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, color: "#fff", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.6 }}>{title}</span>
          {info && (
            <span title={info} style={{ display: "inline-flex", cursor: "help" }}>
              <Info size={13} style={{ color: "rgba(255,255,255,0.6)" }} />
            </span>
          )}
        </div>
        {right}
      </div>
      <div style={{ padding: 14, flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {children}
      </div>
    </div>
  );
}

/* Seleção LIVRE de meses: botão + popover com checkboxes e atalhos (até `max`). */
function SeletorMeses({ opcoes, selected, onChange, max = 12 }: {
  opcoes: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  max?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const set = new Set(selected);
  const toggle = (m: string) => {
    const next = new Set(set);
    if (next.has(m)) next.delete(m);
    else { if (next.size >= max) return; next.add(m); }
    onChange([...next].sort());
  };
  const preset = (n: number) => onChange(opcoes.slice(0, n).map((o) => o.value).sort());

  const ordenado = [...selected].sort();
  const label = selected.length === 0
    ? "Selecionar meses"
    : selected.length <= 2
      ? ordenado.map(labelMes).join(", ")
      : `${ordenado[0] ? labelMes(ordenado[0]) : ""}…${labelMes(ordenado[ordenado.length - 1])} (${selected.length})`;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ background: "#fff", color: "#1D2939", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 7, fontSize: 12, fontWeight: 600, padding: "5px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
      >
        {label}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 50, background: "#fff", border: "1px solid #D0D5DD", borderRadius: 8, boxShadow: "0 10px 28px rgba(0,0,0,0.16)", width: 250, padding: 10 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
            {[3, 6, 12].map((n) => (
              <button key={n} onClick={() => preset(n)} style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: "4px 6px", border: "1px solid #D0D5DD", borderRadius: 6, background: "#F9FAFB", cursor: "pointer", color: "#1D2939" }}>
                Últ. {n}
              </button>
            ))}
            <button onClick={() => onChange([])} style={{ fontSize: 11, fontWeight: 600, padding: "4px 8px", border: "1px solid #D0D5DD", borderRadius: 6, background: "#fff", cursor: "pointer", color: "#B42318" }}>
              Limpar
            </button>
          </div>
          <div style={{ maxHeight: 232, overflowY: "auto", display: "flex", flexDirection: "column" }}>
            {opcoes.map((o) => {
              const checked = set.has(o.value);
              const disabled = !checked && set.size >= max;
              return (
                <label key={o.value} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 6px", fontSize: 12.5, color: disabled ? "#B0B7C3" : "#1D2939", cursor: disabled ? "not-allowed" : "pointer", borderRadius: 6 }}>
                  <input type="checkbox" checked={checked} disabled={disabled} onChange={() => toggle(o.value)} />
                  {o.label}
                </label>
              );
            })}
          </div>
          <div style={{ marginTop: 6, fontSize: 10.5, color: "#98A2B3", textAlign: "right" }}>{selected.length}/{max} selecionados</div>
        </div>
      )}
    </div>
  );
}

/* Bloco de destaque do resultado */
function BlocoResultado({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: "#fff", border: "var(--border-hairline)", borderRadius: 8, padding: "12px 14px", textAlign: "center" }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "#667085" }}>{label}</div>
      <div style={{ marginTop: 4, fontSize: 20, fontWeight: 700, color: value >= 0 ? "#039855" : "#E53E3E" }}><Moeda v={value} /></div>
    </div>
  );
}

/* Seleção de meses persistida + default (últimos N meses). */
const LS_MESES = "comparativo_dre_meses";
function ultimosMeses(n: number): string[] {
  const base = startOfMonth(new Date());
  const arr: string[] = [];
  for (let i = n - 1; i >= 0; i--) arr.push(format(subMonths(base, i), "yyyy-MM"));
  return arr;
}

export function ComparativoMensalCard({ companyId }: ComparativoMensalCardProps) {
  const { activeClient } = useAuth();

  // Opções de mês final: últimos 24 meses
  const mesesOpcoes = useMemo(() => {
    const base = startOfMonth(new Date());
    const opts: { value: string; label: string }[] = [];
    for (let i = 0; i < 24; i++) {
      const m = format(subMonths(base, i), "yyyy-MM");
      opts.push({ value: m, label: labelMes(m) });
    }
    return opts;
  }, []);

  // Meses escolhidos livremente (persistidos); default = últimos 6.
  const [mesesSel, setMesesSel] = useState<string[]>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(LS_MESES) || "null");
      if (Array.isArray(raw) && raw.length) return [...raw].sort();
    } catch { /* ignore */ }
    return ultimosMeses(6);
  });
  useEffect(() => {
    try { localStorage.setItem(LS_MESES, JSON.stringify(mesesSel)); } catch { /* ignore */ }
  }, [mesesSel]);

  // Lista de competências, do mais antigo ao mais recente.
  const mesesArr = useMemo(() => [...mesesSel].sort(), [mesesSel]);

  const primeiro = mesesArr[0];
  const ultimo = mesesArr[mesesArr.length - 1];

  const { data, isLoading } = useQuery({
    queryKey: ["comparativo_dre", companyId, mesesArr.join(",")],
    enabled: !!companyId && mesesArr.length > 0,
    queryFn: async () => {
      if (!companyId || mesesArr.length === 0) return null;
      const db = activeClient as any;
      const pageSize = 1000;

      const rangeStart = `${primeiro}-01`;
      const rangeEnd = format(endOfMonth(parseISO(`${ultimo}-01`)), "yyyy-MM-dd");

      async function fetchPagos(tabela: "contas_receber" | "contas_pagar") {
        const rows: any[] = [];
        let page = 0;
        while (true) {
          const { data, error } = await db
            .from(tabela)
            .select("valor, valor_pago, data_pagamento, conta_contabil_id")
            .eq("company_id", companyId)
            .eq("status", "pago")
            .is("deleted_at", null)
            .not("data_pagamento", "is", null)
            .gte("data_pagamento", rangeStart)
            .lte("data_pagamento", rangeEnd)
            .range(page * pageSize, (page + 1) * pageSize - 1);
          if (error) throw error;
          if (!data || data.length === 0) break;
          rows.push(...data);
          if (data.length < pageSize) break;
          page++;
        }
        return rows;
      }

      const [crPagos, cpPagos, contasRes] = await Promise.all([
        fetchPagos("contas_receber"),
        fetchPagos("contas_pagar"),
        db
          .from("chart_of_accounts")
          .select("id, code, name, account_type")
          .eq("company_id", companyId)
          .in("account_type", ["revenue", "expense", "cost"]),
      ]);

      const contasMap: Record<string, any> = {};
      (((contasRes as any).data) || []).forEach((c: any) => { contasMap[c.id] = c; });

      const mesesSet = new Set(mesesArr);
      const acc: Record<string, LinhaComp> = {};
      function add(rows: any[]) {
        rows.forEach((r) => {
          const id = r.conta_contabil_id;
          if (!id || !contasMap[id]) return;
          const comp = String(r.data_pagamento || "").slice(0, 7);
          if (!mesesSet.has(comp)) return;
          const v = Number(r.valor_pago ?? r.valor ?? 0);
          if (!acc[id]) {
            const c = contasMap[id];
            acc[id] = { contaId: id, codigo: c.code, descricao: c.name, tipo: c.account_type, valores: {} };
          }
          acc[id].valores[comp] = (acc[id].valores[comp] || 0) + v;
        });
      }
      add(crPagos);
      add(cpPagos);

      return { linhas: Object.values(acc) };
    },
  });

  // Agrupa em RECEITAS / DESPESAS com totais por mês
  const grupos = useMemo(() => {
    const map: Record<string, Grupo> = {};
    (data?.linhas || []).forEach((l) => {
      const grupo = l.tipo === "revenue" ? "RECEITAS"
        : (l.tipo === "expense" || l.tipo === "cost") ? "DESPESAS"
        : null;
      if (!grupo) return;
      if (!map[grupo]) map[grupo] = { linhas: [], totais: {} };
      map[grupo].linhas.push(l);
      mesesArr.forEach((m) => { map[grupo].totais[m] = (map[grupo].totais[m] || 0) + (l.valores[m] || 0); });
    });
    Object.values(map).forEach((g) => g.linhas.sort((a, b) => a.codigo.localeCompare(b.codigo)));
    return map;
  }, [data, mesesArr]);

  // Resultado líquido por mês
  const resultadoPorMes = useMemo(() => {
    const out: Record<string, number> = {};
    mesesArr.forEach((m) => {
      const rec = grupos["RECEITAS"]?.totais[m] || 0;
      const desp = Math.abs(grupos["DESPESAS"]?.totais[m] || 0);
      out[m] = rec - desp;
    });
    return out;
  }, [grupos, mesesArr]);

  const resPrimeiro = resultadoPorMes[primeiro] || 0;
  const resUltimo = resultadoPorMes[ultimo] || 0;
  const varResultado = resUltimo - resPrimeiro;

  // Consolidado do período (soma dos meses) + análise vertical (% sobre a receita consolidada).
  const consolDe = (totais: Record<string, number>) => mesesArr.reduce((s, m) => s + (totais[m] || 0), 0);
  const receitaConsol = grupos["RECEITAS"] ? consolDe(grupos["RECEITAS"].totais) : 0;
  const despesaConsol = grupos["DESPESAS"] ? Math.abs(consolDe(grupos["DESPESAS"].totais)) : 0;
  const resultadoConsol = receitaConsol - despesaConsol;
  const fmtAV = (consol: number) => (receitaConsol !== 0 ? `${((consol / receitaConsol) * 100).toFixed(1)}%` : "—");

  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({ RECEITAS: true, DESPESAS: true });

  // ── Larguras de coluna ajustáveis por arrasto (persistidas) ──
  const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem(LS_COL_WIDTHS) || "{}"); } catch { return {}; }
  });
  useEffect(() => {
    try { localStorage.setItem(LS_COL_WIDTHS, JSON.stringify(colWidths)); } catch { /* ignore */ }
  }, [colWidths]);

  const resizingRef = useRef<{ key: string; startX: number; startW: number } | null>(null);
  const startResize = (key: string, current: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const min = key === "conta" ? 140 : 64;
    resizingRef.current = { key, startX: e.clientX, startW: current };
    const onMove = (ev: MouseEvent) => {
      const r = resizingRef.current;
      if (!r) return;
      setColWidths((p) => ({ ...p, [r.key]: Math.max(min, r.startW + (ev.clientX - r.startX)) }));
    };
    const onUp = () => {
      resizingRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const wConta = colWidths["conta"] ?? COL_DEFAULTS.conta;
  const wConsol = colWidths["consolidado"] ?? COL_DEFAULTS.consolidado;
  const wPct = colWidths["pct"] ?? COL_DEFAULTS.pct;
  const wMes = (m: string) => colWidths[m] ?? COL_DEFAULTS.mes;
  const totalWidth = wConta + wConsol + wPct + mesesArr.reduce((s, m) => s + wMes(m), 0);

  return (
    <ChartCardLike
      title="Comparativo Mensal (DRE)"
      info={INFO}
      right={<SeletorMeses opcoes={mesesOpcoes} selected={mesesSel} onChange={setMesesSel} max={12} />}
    >
      {!companyId ? (
        <div style={{ padding: "28px 0", textAlign: "center", fontSize: 13, color: "#98A2B3" }}>
          Selecione uma empresa.
        </div>
      ) : mesesArr.length === 0 ? (
        <div style={{ padding: "28px 0", textAlign: "center", fontSize: 13, color: "#98A2B3" }}>
          Selecione ao menos um mês para comparar.
        </div>
      ) : isLoading ? (
        <div style={{ padding: "28px 0", textAlign: "center", fontSize: 13, color: "#98A2B3" }}>Carregando…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Destaque: resultado do 1º mês × último + variação */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <BlocoResultado label={`Resultado ${labelMes(primeiro)}`} value={resPrimeiro} />
            <BlocoResultado label={`Resultado ${labelMes(ultimo)}`} value={resUltimo} />
            <div style={{ background: "#fff", border: "var(--border-hairline)", borderRadius: 8, padding: "12px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: "#667085" }}>Variação no período</div>
              <div style={{ marginTop: 4, fontSize: 20, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", gap: 4, color: varResultado >= 0 ? "#039855" : "#E53E3E" }}>
                {varResultado !== 0 && (varResultado > 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />)}
                <Moeda v={varResultado} />
              </div>
            </div>
          </div>

          {/* Tabela DRE comparativa (uma coluna por mês) */}
          <div style={{ background: "#fff", border: "var(--border-hairline)", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ tableLayout: "fixed", width: totalWidth, minWidth: "100%", fontSize: 12, borderCollapse: "collapse", whiteSpace: "nowrap" }}>
                <colgroup>
                  <col style={{ width: wConta }} />
                  {mesesArr.map((m) => (<col key={m} style={{ width: wMes(m) }} />))}
                  <col style={{ width: wConsol }} />
                  <col style={{ width: wPct }} />
                </colgroup>
                <thead>
                  <tr style={{ background: NAVY, fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#fff" }}>
                    <th style={{ textAlign: "left", padding: "8px 9px", borderRight: "1px solid rgba(255,255,255,0.14)", position: "sticky", left: 0, background: NAVY, zIndex: 2, overflow: "hidden", textOverflow: "ellipsis" }}>
                      Conta
                      <Puxador onDown={startResize("conta", wConta)} />
                    </th>
                    {mesesArr.map((m) => (
                      <th key={m} style={{ position: "relative", textAlign: "right", padding: "8px 9px", borderLeft: "1px solid rgba(255,255,255,0.14)", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {labelMes(m)}
                        <Puxador onDown={startResize(m, wMes(m))} />
                      </th>
                    ))}
                    <th style={{ position: "relative", textAlign: "right", padding: "8px 9px", borderLeft: "2px solid rgba(255,255,255,0.30)", overflow: "hidden", textOverflow: "ellipsis" }}>
                      Consolidado
                      <Puxador onDown={startResize("consolidado", wConsol)} />
                    </th>
                    <th style={{ position: "relative", textAlign: "right", padding: "8px 9px", borderLeft: "1px solid rgba(255,255,255,0.14)", overflow: "hidden", textOverflow: "ellipsis" }} title="Análise vertical: % sobre a receita do período">
                      %
                      <Puxador onDown={startResize("pct", wPct)} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(["RECEITAS", "DESPESAS"] as const).map((nome) => {
                    const g = grupos[nome];
                    if (!g) return null;
                    return (
                      <GrupoComparativo
                        key={nome}
                        nome={nome}
                        grupo={g}
                        meses={mesesArr}
                        receitaConsol={receitaConsol}
                        isOpen={expandidos[nome] ?? false}
                        onToggle={() => setExpandidos((p) => ({ ...p, [nome]: !p[nome] }))}
                      />
                    );
                  })}
                  {/* Resultado líquido por mês */}
                  <tr style={{ borderTop: "2px solid #000", background: "#1D2939", fontWeight: 700, color: "#fff" }}>
                    <td style={{ padding: "9px", textTransform: "uppercase", letterSpacing: "0.04em", fontSize: 12, position: "sticky", left: 0, background: "#1D2939", zIndex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>RESULTADO LÍQUIDO</td>
                    {mesesArr.map((m) => {
                      const r = resultadoPorMes[m] || 0;
                      return (
                        <td key={m} style={{ textAlign: "right", padding: "9px", fontVariantNumeric: "tabular-nums", borderLeft: "1px solid rgba(255,255,255,0.28)", color: r >= 0 ? "#34D399" : "#FCA5A5", overflow: "hidden", textOverflow: "ellipsis" }}><Moeda v={r} /></td>
                      );
                    })}
                    <td style={{ textAlign: "right", padding: "9px", fontVariantNumeric: "tabular-nums", borderLeft: "2px solid rgba(255,255,255,0.45)", color: resultadoConsol >= 0 ? "#34D399" : "#FCA5A5", overflow: "hidden", textOverflow: "ellipsis" }}><Moeda v={resultadoConsol} /></td>
                    <td style={{ textAlign: "right", padding: "9px", fontVariantNumeric: "tabular-nums", borderLeft: "1px solid rgba(255,255,255,0.2)", color: "rgba(255,255,255,0.85)", overflow: "hidden", textOverflow: "ellipsis" }}>{fmtAV(resultadoConsol)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </ChartCardLike>
  );
}

function GrupoComparativo({ nome, grupo, meses, receitaConsol, isOpen, onToggle }: {
  nome: "RECEITAS" | "DESPESAS";
  grupo: Grupo;
  meses: string[];
  receitaConsol: number;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const consolDe = (vals: Record<string, number>) => meses.reduce((s, m) => s + (vals[m] || 0), 0);
  const fmtAV = (consol: number) => (receitaConsol !== 0 ? `${((consol / receitaConsol) * 100).toFixed(1)}%` : "—");
  const consolGrupo = consolDe(grupo.totais);

  return (
    <>
      <tr style={{ borderBottom: "1px solid #D0D5DD", background: "#F2F4F7", cursor: "pointer" }} onClick={onToggle}>
        <td style={{ padding: "7px 9px", fontWeight: 700, color: "#1D2939", borderRight: `1px solid ${MES_DIV}`, position: "sticky", left: 0, background: "#F2F4F7", zIndex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            {nome}
          </div>
        </td>
        {meses.map((m) => {
          const v = grupo.totais[m] || 0;
          return (
            <td key={m} style={{ textAlign: "right", padding: "7px 9px", fontWeight: 700, color: "#1D2939", fontVariantNumeric: "tabular-nums", borderLeft: `1px solid ${MES_DIV}`, overflow: "hidden", textOverflow: "ellipsis" }}><Moeda v={v} /></td>
          );
        })}
        <td style={{ textAlign: "right", padding: "7px 9px", fontWeight: 700, color: "#1D2939", fontVariantNumeric: "tabular-nums", borderLeft: `2px solid ${VAR_DIV}`, overflow: "hidden", textOverflow: "ellipsis" }}><Moeda v={consolGrupo} /></td>
        <td style={{ textAlign: "right", padding: "7px 9px", fontWeight: 700, color: "#667085", fontVariantNumeric: "tabular-nums", borderLeft: `1px solid ${MES_DIV}`, overflow: "hidden", textOverflow: "ellipsis" }}>{fmtAV(consolGrupo)}</td>
      </tr>
      {isOpen && grupo.linhas.map((l, i) => {
        const consol = consolDe(l.valores);
        const bg = i % 2 === 1 ? "#FAFAFA" : "#fff";
        return (
          <tr key={l.contaId} style={{ borderBottom: "1px solid #EAECF0", background: bg }}>
            <td title={`${l.codigo}  ${l.descricao}`} style={{ padding: "5px 9px 5px 22px", color: "#1D2939", borderRight: `1px solid ${MES_DIV}`, position: "sticky", left: 0, background: bg, zIndex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
              <span style={{ color: "#98A2B3", fontFamily: "var(--font-mono, monospace)", marginRight: 6 }}>{l.codigo}</span>
              {l.descricao}
            </td>
            {meses.map((m) => {
              const val = l.valores[m] || 0;
              return (
                <td key={m} style={{ textAlign: "right", padding: "5px 9px", color: val === 0 ? "#C0C5CD" : "#1D2939", fontVariantNumeric: "tabular-nums", borderLeft: `1px solid ${MES_DIV}`, overflow: "hidden", textOverflow: "ellipsis" }}><Moeda v={val} /></td>
              );
            })}
            <td style={{ textAlign: "right", padding: "5px 9px", fontWeight: 600, color: consol === 0 ? "#C0C5CD" : "#1D2939", fontVariantNumeric: "tabular-nums", borderLeft: `2px solid ${VAR_DIV}`, overflow: "hidden", textOverflow: "ellipsis" }}><Moeda v={consol} /></td>
            <td style={{ textAlign: "right", padding: "5px 9px", color: "#667085", fontVariantNumeric: "tabular-nums", borderLeft: `1px solid ${MES_DIV}`, overflow: "hidden", textOverflow: "ellipsis" }}>{fmtAV(consol)}</td>
          </tr>
        );
      })}
    </>
  );
}
