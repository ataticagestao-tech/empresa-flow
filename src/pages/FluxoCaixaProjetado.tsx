import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePanel } from "@/components/layout/PagePanel";
import { KpiCard, KpiCardGrid } from "@/components/ui/kpi-card";
import { useCompany } from "@/contexts/CompanyContext";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { AlertTriangle, CheckCircle2, CalendarRange, Wallet, Pencil } from "lucide-react";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { FluxoEntradasSaidas } from "@/components/dashboard/FluxoEntradasSaidas";
import { useFluxoProjetado, type FluxoProjetadoData } from "@/modules/finance/presentation/hooks/useFluxoProjetado";
import { useSaldoBancoVsSistema } from "@/modules/finance/presentation/hooks/useContasSaldo";

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
const NAVY = "#071D41";

/** Parse "1.234,56" / "92.146" / "-99126" → número; null se vazio/inválido. */
function parseBRL(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t.replace(/r\$|\s/gi, "").replace(/\./g, "").replace(",", "."));
  return Number.isNaN(n) ? null : n;
}

/** 'YYYY-MM-DD' → 'dd/MM/aaaa'. */
function fmtData(iso: string | null): string {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Resumo da projeção: KPIs + alerta de dia crítico. */
function ProjecaoResumo({ data, isLoading }: { data: FluxoProjetadoData; isLoading: boolean }) {
  if (isLoading) {
    return <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#98A2B3" }}>Carregando projeção…</div>;
  }

  const saldoFinalNeg = data.saldoFinal < 0;
  const ficaNegativo = data.diaCritico !== null;

  return (
    <div className="space-y-4">
      <KpiCardGrid className="lg:grid-cols-5">
        <KpiCard label="Saldo hoje" value={fmt(data.saldoInicial)} valueColor={data.saldoInicial >= 0 ? "#1D2939" : "#E53E3E"} sub="caixa + banco" />
        <KpiCard label="A receber" value={fmt(data.totalReceber)} valueColor="#039855" sub={data.comReceber ? `${data.horizonteDias} dias` : "fora do saldo (pior caso)"} />
        <KpiCard label="A pagar" value={fmt(data.totalPagar)} valueColor="#E53E3E" sub={`${data.horizonteDias} dias`} />
        <KpiCard label="Saldo projetado" value={fmt(data.saldoFinal)} valueColor={saldoFinalNeg ? "#E53E3E" : "#059669"} sub={`fim de ${data.horizonteDias} dias`} />
        <KpiCard label="Menor saldo" value={fmt(data.menorSaldo)} valueColor={data.menorSaldo < 0 ? "#E53E3E" : "#059669"} sub={`em ${fmtData(data.menorSaldoData)}`} />
      </KpiCardGrid>

      {ficaNegativo ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10, background: "#FEF3F2", border: "1px solid #FDA29B" }}>
          <AlertTriangle size={18} style={{ color: "#D92D20", flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: "#912018" }}>
            O caixa fica <strong>negativo a partir de {fmtData(data.diaCritico)}</strong>
            {data.comReceber ? " (contando com os recebíveis previstos)." : " — mesmo sem contar recebíveis (pior caso)."}
            {" "}Menor saldo: <strong>{fmt(data.menorSaldo)}</strong>.
          </span>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderRadius: 10, background: "#ECFDF3", border: "1px solid #A6F4C5" }}>
          <CheckCircle2 size={18} style={{ color: "#039855", flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: "#054F31" }}>
            O caixa se mantém positivo nos próximos {data.horizonteDias} dias. Menor saldo: <strong>{fmt(data.menorSaldo)}</strong> em {fmtData(data.menorSaldoData)}.
          </span>
        </div>
      )}
    </div>
  );
}

export default function FluxoCaixaProjetado() {
  const { selectedCompany } = useCompany();
  const cId = selectedCompany?.id;
  const [days, setDays] = useState(30);
  const [cenario, setCenario] = useState<"com" | "sem">("com");
  const incluirCR = cenario === "com";

  // ── Saldo inicial: contas marcáveis (ancoradas no extrato) + override manual ──
  const { comparacao: contas } = useSaldoBancoVsSistema(cId);
  const [excluidas, setExcluidas] = useState<Set<string>>(new Set());
  const [override, setOverride] = useState<string>("");

  useEffect(() => {
    if (!cId) {
      setExcluidas(new Set());
      setOverride("");
      return;
    }
    let e = new Set<string>();
    try {
      const s = localStorage.getItem(`fcproj_excl_${cId}`);
      if (s) e = new Set(JSON.parse(s) as string[]);
    } catch { /* ignore */ }
    setExcluidas(e);
    try {
      setOverride(localStorage.getItem(`fcproj_ovr_${cId}`) || "");
    } catch {
      setOverride("");
    }
  }, [cId]);

  const toggleConta = (id: string) => {
    setExcluidas((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      if (cId) { try { localStorage.setItem(`fcproj_excl_${cId}`, JSON.stringify([...n])); } catch { /* ignore */ } }
      return n;
    });
  };
  const changeOverride = (v: string) => {
    setOverride(v);
    if (cId) { try { localStorage.setItem(`fcproj_ovr_${cId}`, v); } catch { /* ignore */ } }
  };

  const saldoCalculado = contas.filter((c) => !excluidas.has(c.contaId)).reduce((s, c) => s + c.saldoEfetivo, 0);
  const overrideNum = parseBRL(override);
  const saldoEfetivo = overrideNum != null ? overrideNum : saldoCalculado;

  const { isLoading, ...data } = useFluxoProjetado({ dias: days, incluirCR, saldoInicial: saldoEfetivo });

  // Período avaliado: de hoje até hoje + N dias.
  const hoje = new Date();
  const inicioLabel = format(hoje, "dd 'de' MMM 'de' yyyy", { locale: ptBR });
  const fimLabel = format(addDays(hoje, days), "dd 'de' MMM 'de' yyyy", { locale: ptBR });

  return (
    <AppLayout title="Fluxo de Caixa Projetado">
      <div style={{ fontFamily: "var(--font-base)" }}>
        <PagePanel title="Fluxo de Caixa Projetado" subtitle={`Próximos ${days} dias · saldo projetado, entradas e saídas`}>
          {/* ── Controles ── */}
          <div className="flex flex-wrap items-center gap-2 justify-end">
            <SegmentedControl<"com" | "sem">
              value={cenario}
              onChange={setCenario}
              options={[
                { value: "com", label: "Com recebíveis", title: "Conta com os recebíveis previstos (CR) entrando no vencimento" },
                { value: "sem", label: "Pior caso (só CP)", title: "Ignora os recebíveis — só o caixa de hoje contra os compromissos a pagar" },
              ]}
            />
            <SegmentedControl<"30" | "60" | "90">
              value={String(days) as "30" | "60" | "90"}
              onChange={(v) => setDays(Number(v))}
              options={[
                { value: "30", label: "30 dias" },
                { value: "60", label: "60 dias" },
                { value: "90", label: "90 dias" },
              ]}
            />
          </div>

          {/* ── Período avaliado (explícito) ── */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "#F8FAFC", border: "var(--border-hairline)" }}>
            <CalendarRange size={16} style={{ color: "#475467", flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: "#1D2939" }}>
              Período avaliado: <strong>{inicioLabel}</strong> → <strong>{fimLabel}</strong>
              <span style={{ color: "#98A2B3" }}> · {days} dias a partir de hoje</span>
            </span>
          </div>

          {!cId ? (
            <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#98A2B3" }}>
              Selecione uma empresa para ver a projeção.
            </div>
          ) : (
            <div className="space-y-4">
              {/* ── Saldo inicial: contas marcáveis + override manual ── */}
              <div style={{ background: "#FFFFFF", border: "var(--border-hairline)", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", background: NAVY, display: "flex", alignItems: "center", gap: 8 }}>
                  <Wallet size={15} style={{ color: "#fff" }} />
                  <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "#fff" }}>Saldo inicial da projeção</span>
                </div>
                <div style={{ padding: 14, display: "flex", flexWrap: "wrap", gap: 20, alignItems: "flex-start" }}>
                  {/* Contas marcáveis */}
                  <div style={{ flex: "1 1 320px", minWidth: 260 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: "#98A2B3", marginBottom: 6 }}>Contas · saldo do banco quando tem extrato</div>
                    {contas.length === 0 ? (
                      <div style={{ fontSize: 12, color: "#98A2B3", padding: "8px 0" }}>Nenhuma conta encontrada.</div>
                    ) : (
                      contas.map((c) => {
                        const marcada = !excluidas.has(c.contaId);
                        return (
                          <label key={c.contaId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", cursor: "pointer", opacity: marcada ? 1 : 0.5 }}>
                            <input type="checkbox" checked={marcada} onChange={() => toggleConta(c.contaId)} style={{ width: 15, height: 15, accentColor: "#059669" }} />
                            <span style={{ flex: 1, fontSize: 13, color: "#1D2939" }}>
                              {c.nome}
                              <span style={{ marginLeft: 6, fontSize: 10, color: c.fonte === "banco" ? "#039855" : "#98A2B3" }}>
                                {c.fonte === "banco" ? `banco · extrato ${c.asOfDate ? c.asOfDate.split("-").reverse().slice(0, 2).join("/") : ""}` : "sistema"}
                              </span>
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: c.saldoEfetivo < 0 ? "#E53E3E" : "#1D2939", whiteSpace: "nowrap" }}>{fmt(c.saldoEfetivo)}</span>
                          </label>
                        );
                      })
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", borderTop: "var(--border-hairline)", marginTop: 6, paddingTop: 8, fontSize: 12, color: "#667085" }}>
                      <span>Calculado (marcadas)</span>
                      <strong style={{ color: "#1D2939" }}>{fmt(saldoCalculado)}</strong>
                    </div>
                  </div>

                  {/* Override manual + saldo efetivo */}
                  <div style={{ flex: "1 1 240px", minWidth: 220 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: "#98A2B3", marginBottom: 6, display: "flex", alignItems: "center", gap: 5 }}>
                      <Pencil size={12} /> Sobrescrever total (opcional)
                    </div>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={override}
                      onChange={(e) => changeOverride(e.target.value)}
                      placeholder="vazio = usar o calculado"
                      style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid #D0D5DD", fontSize: 14, color: "#1D2939" }}
                    />
                    <div style={{ fontSize: 11, color: "#98A2B3", marginTop: 4 }}>Use só se a conta não tiver extrato ou o saldo do banco também estiver errado.</div>
                    <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "#F0FDF4", border: "1px solid #A6F4C5", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                      <span style={{ fontSize: 12, color: "#054F31" }}>Saldo usado {overrideNum != null ? "(manual)" : "(calculado)"}</span>
                      <strong style={{ fontSize: 18, color: saldoEfetivo < 0 ? "#E53E3E" : "#039855" }}>{fmt(saldoEfetivo)}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Resumo: KPIs + alerta de dia crítico ── */}
              <ProjecaoResumo data={data} isLoading={isLoading} />

              {/* ── 3 colunas: Entradas | Gráfico | Saídas ── */}
              <FluxoEntradasSaidas data={data} isLoading={isLoading} />
            </div>
          )}
        </PagePanel>
      </div>
    </AppLayout>
  );
}
