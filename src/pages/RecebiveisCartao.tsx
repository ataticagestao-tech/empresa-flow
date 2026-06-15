import { useEffect, useRef, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePanel } from "@/components/layout/PagePanel";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Upload, CreditCard, Loader2 } from "lucide-react";
import { parseStoneAgenda, type StoneAgendaItem } from "@/lib/parsers/stoneAgenda";

const NAVY = "#071D41";
const VERDE = "#039855";
const VERMELHO = "#E53E3E";

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(v);
const fmt2 = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
const fmtDia = (iso: string | null) => {
  if (!iso) return "—";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
};

function taxaDe(it: StoneAgendaItem): number {
  return Math.abs(it.descontoMdr || 0) + Math.abs(it.descontoAntecipacao || 0);
}

interface DetItem {
  key: string;
  dataVenda: string | null;
  bandeira: string | null;
  produto: string | null;
  numParcela: number | null;
  qtdParcelas: number | null;
  bruto: number;
  liquido: number;
  taxa: number;
}

interface Grupo {
  data: string; // vencimento
  dataVenda: string | null; // data da venda (fechada) do grupo
  count: number;
  bruto: number;
  liquido: number;
  taxa: number;
  descricao: string;
  itens: DetItem[];
}

interface GrupoBuild {
  data: string;
  dataVenda: string | null;
  count: number;
  bruto: number;
  liquido: number;
  taxa: number;
  bandeiras: Set<string>;
  produtos: Set<string>;
  itens: DetItem[];
}

/** Monta a descrição do grupo: bandeiras (+ produto se for único). */
export function montarDescricao(bandeiras: Set<string>, produtos: Set<string>): string {
  const b = [...bandeiras].filter((x) => x && x !== "—");
  const p = [...produtos].filter(Boolean);
  let d = b.length ? b.join(", ") : "—";
  if (p.length === 1) d += ` · ${p[0]}`;
  return d;
}

function finalizarGrupos(m: Map<string, GrupoBuild>): Grupo[] {
  return [...m.values()]
    .map((g) => ({
      data: g.data,
      dataVenda: g.dataVenda,
      count: g.count,
      bruto: g.bruto,
      liquido: g.liquido,
      taxa: g.taxa,
      descricao: montarDescricao(g.bandeiras, g.produtos),
      itens: [...g.itens].sort((a, b) => (a.dataVenda || "").localeCompare(b.dataVenda || "")),
    }))
    // Ordena por vencimento; dentro do mesmo vencimento, por data da venda.
    .sort((a, b) => (a.data !== b.data ? (a.data < b.data ? -1 : 1) : (a.dataVenda || "").localeCompare(b.dataVenda || "")));
}

/** Agrupa itens da prévia por (vencimento, data da venda). */
function agruparPrevia(items: StoneAgendaItem[]): Grupo[] {
  const m = new Map<string, GrupoBuild>();
  for (const it of items) {
    const chave = `${it.dataVencimento}|${it.dataVenda || ""}`;
    const g = m.get(chave) || { data: it.dataVencimento, dataVenda: it.dataVenda, count: 0, bruto: 0, liquido: 0, taxa: 0, bandeiras: new Set<string>(), produtos: new Set<string>(), itens: [] };
    g.count++; g.bruto += it.valorBruto || 0; g.liquido += it.valorLiquido; g.taxa += taxaDe(it);
    if (it.bandeira) g.bandeiras.add(it.bandeira);
    if (it.produto) g.produtos.add(it.produto);
    g.itens.push({ key: it.contentHash, dataVenda: it.dataVenda, bandeira: it.bandeira, produto: it.produto, numParcela: it.numParcela, qtdParcelas: it.qtdParcelas, bruto: it.valorBruto || 0, liquido: it.valorLiquido, taxa: taxaDe(it) });
    m.set(chave, g);
  }
  return finalizarGrupos(m);
}

export default function RecebiveisCartao() {
  const { selectedCompany } = useCompany();
  const { activeClient } = useAuth();
  const db = activeClient as any;
  const queryClient = useQueryClient();
  const cId = selectedCompany?.id;

  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<StoneAgendaItem[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [aplicando, setAplicando] = useState(false);

  // Resumo do que já está importado.
  const { data: resumo } = useQuery({
    queryKey: ["card_receivables_resumo", cId],
    enabled: !!db && !!cId,
    queryFn: async () => {
      const { data } = await db
        .from("card_receivables")
        .select("data_venda, data_vencimento, valor_bruto, valor_liquido, desconto_mdr, desconto_antecipacao, status, bandeira, produto, num_parcela, qtd_parcelas")
        .eq("company_id", cId)
        .limit(100000);
      const rows = (data || []) as any[];
      const hoje = new Date().toISOString().slice(0, 10);
      let aReceber = 0, taxaTotal = 0, futuras = 0, abertas = 0;
      const mv = new Map<string, GrupoBuild>();
      const taxaMes = new Map<string, number>(); // taxa por mês da VENDA (competência)
      for (const r of rows) {
        const liq = Number(r.valor_liquido) || 0;
        const bruto = Number(r.valor_bruto) || 0;
        const taxa = Math.abs(Number(r.desconto_mdr) || 0) + Math.abs(Number(r.desconto_antecipacao) || 0);
        taxaTotal += taxa;
        const mesVenda = r.data_venda ? String(r.data_venda).slice(0, 7) : null;
        if (mesVenda && taxa > 0) taxaMes.set(mesVenda, (taxaMes.get(mesVenda) || 0) + taxa);
        const aberto = (r.status || "").toLowerCase() !== "pago";
        if (aberto) abertas += 1;
        if (aberto && r.data_vencimento >= hoje) { aReceber += liq; futuras += 1; }
        if (aberto) {
          const chave = `${r.data_vencimento}|${r.data_venda || ""}`;
          const g = mv.get(chave) || { data: r.data_vencimento, dataVenda: r.data_venda || null, count: 0, bruto: 0, liquido: 0, taxa: 0, bandeiras: new Set<string>(), produtos: new Set<string>(), itens: [] };
          g.count++; g.bruto += bruto; g.liquido += liq; g.taxa += taxa;
          if (r.bandeira) g.bandeiras.add(r.bandeira);
          if (r.produto) g.produtos.add(r.produto);
          g.itens.push({ key: `${chave}#${g.itens.length}`, dataVenda: r.data_venda || null, bandeira: r.bandeira || null, produto: r.produto || null, numParcela: r.num_parcela ?? null, qtdParcelas: r.qtd_parcelas ?? null, bruto, liquido: liq, taxa });
          mv.set(chave, g);
        }
      }
      const porVencimento = finalizarGrupos(mv);
      const taxaPorMes = [...taxaMes.entries()].sort().map(([mes, total]) => ({ mes, total }));
      return { total: rows.length, aReceber, taxaTotal, futuras, abertas, porVencimento, taxaPorMes };
    },
  });

  // CR de cartão abertos HOJE no sistema (o "antes" da substituição).
  const { data: crSistema } = useQuery({
    queryKey: ["cr_cartao_sistema", cId],
    enabled: !!db && !!cId,
    queryFn: async () => {
      const { data } = await db
        .from("contas_receber")
        .select("valor, valor_pago")
        .eq("company_id", cId)
        .is("deleted_at", null)
        .is("card_receivable_id", null) // só os ORIGINAIS (não os gerados pela agenda)
        .in("status", ["aberto", "parcial", "vencido"])
        .eq("forma_recebimento", "cartao_credito")
        .limit(100000);
      const rows = (data || []) as any[];
      const total = rows.reduce((s, r) => s + ((Number(r.valor) || 0) - (Number(r.valor_pago) || 0)), 0);
      return { count: rows.length, total };
    },
  });

  // CR já gerados pela agenda (substituição ativa).
  const { data: crGerados = 0 } = useQuery({
    queryKey: ["cr_gerados", cId],
    enabled: !!db && !!cId,
    queryFn: async () => {
      const { count } = await db
        .from("contas_receber")
        .select("id", { count: "exact", head: true })
        .eq("company_id", cId)
        .not("card_receivable_id", "is", null)
        .is("deleted_at", null);
      return count || 0;
    },
  });

  // Plano de contas da empresa — pra categorizar os repasses (default: 1.3.01 maquininha/Stone).
  const { data: contasContabeis = [] } = useQuery({
    queryKey: ["chart_accounts_cartao", cId],
    enabled: !!db && !!cId,
    queryFn: async () => {
      const { data } = await db
        .from("chart_of_accounts")
        .select("id, code, name")
        .eq("company_id", cId)
        .order("code");
      return (data || []) as { id: string; code: string; name: string }[];
    },
  });

  // Conta default pros repasses: 1.3.01 (ou nome maquininha/Recebimentos Stone).
  const contaMaquininha =
    contasContabeis.find((c) => c.code === "1.3.01") ||
    contasContabeis.find((c) => /maquininha|recebimentos stone/i.test(c.name));

  // CR de repasse (vindas da agenda) que estão SEM categoria — travam a conciliação.
  const { data: semCategoria = 0 } = useQuery({
    queryKey: ["card_cr_sem_categoria", cId],
    enabled: !!db && !!cId,
    queryFn: async () => {
      const { count } = await db
        .from("contas_receber")
        .select("id", { count: "exact", head: true })
        .eq("company_id", cId)
        .not("card_receivable_id", "is", null)
        .is("conta_contabil_id", null)
        .is("deleted_at", null);
      return count || 0;
    },
  });

  const [catId, setCatId] = useState<string>("");
  const [categorizando, setCategorizando] = useState(false);
  // Pré-seleciona a conta de maquininha assim que o plano de contas carrega.
  useEffect(() => {
    if (!catId && contaMaquininha) setCatId(contaMaquininha.id);
  }, [catId, contaMaquininha]);

  const invalidarTudo = () => {
    for (const k of ["cr_cartao_sistema", "cr_gerados", "card_receivables_resumo", "card_cr_sem_categoria"]) {
      queryClient.invalidateQueries({ queryKey: [k, cId] });
    }
  };

  // ── Categorizar os repasses de cartão sem categoria (destrava a conciliação) ──
  const categorizarRepasses = async () => {
    if (!cId || !catId) return;
    setCategorizando(true);
    try {
      const { error } = await db
        .from("contas_receber")
        .update({ conta_contabil_id: catId })
        .eq("company_id", cId)
        .not("card_receivable_id", "is", null)
        .is("conta_contabil_id", null)
        .is("deleted_at", null);
      if (error) throw error;
      toast.success(`Repasses categorizados. A conciliação agora não vai mais travar.`);
      invalidarTudo();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao categorizar");
    } finally {
      setCategorizando(false);
    }
  };

  // ── Aplicar substituição: arquiva os CR de cartão errados e cria os corretos pela agenda ──
  const aplicarSubstituicao = async () => {
    if (!cId || !crSistema) return;
    const { data: agendaData, error: e1 } = await db
      .from("card_receivables")
      .select("id, valor_liquido, data_vencimento, data_venda, bandeira, produto, num_parcela, qtd_parcelas, status")
      .eq("company_id", cId)
      .limit(100000);
    if (e1) { toast.error(e1.message); return; }
    const agendaOpen = ((agendaData || []) as any[]).filter((a) => (a.status || "").toLowerCase() !== "pago");
    if (agendaOpen.length < (crSistema.count + crGerados) * 0.9) {
      toast.error("A agenda parece incompleta — não vou substituir. Importe os meses que faltam.");
      return;
    }
    if (!window.confirm(
      `Substituir os ${crSistema.count} CR de cartão pelos ${agendaOpen.length} da agenda?\n\n` +
      `• Os atuais (bruto, datas erradas) são ARQUIVADOS (reversível).\n` +
      `• Entram os corretos (líquido, na data certa).\n\nVocê pode desfazer depois.`,
    )) return;

    setAplicando(true);
    try {
      const nowISO = new Date().toISOString();
      // Dedup: agenda que já tem CR ativo.
      const { data: existentes } = await db
        .from("contas_receber")
        .select("card_receivable_id")
        .eq("company_id", cId)
        .not("card_receivable_id", "is", null)
        .is("deleted_at", null)
        .limit(100000);
      const jaTem = new Set(((existentes || []) as any[]).map((e) => e.card_receivable_id));
      const novos = agendaOpen.filter((a) => !jaTem.has(a.id));

      // 1) Arquiva os CR de cartão originais (sem vínculo com agenda).
      const { error: eDel } = await db
        .from("contas_receber")
        .update({ deleted_at: nowISO, substituido_em: nowISO })
        .eq("company_id", cId)
        .is("deleted_at", null)
        .in("status", ["aberto", "parcial", "vencido"])
        .eq("forma_recebimento", "cartao_credito")
        .is("card_receivable_id", null);
      if (eDel) throw eDel;

      // 2) Cria os CR corretos a partir da agenda (líquido, data certa).
      const rows = novos.map((a) => ({
        company_id: cId,
        card_receivable_id: a.id,
        valor: Number(a.valor_liquido) || 0,
        valor_pago: 0,
        data_vencimento: a.data_vencimento,
        competencia: a.data_venda ? String(a.data_venda).slice(0, 7) : null,
        status: "aberto",
        forma_recebimento: "cartao_credito",
        pagador_nome: "Stone (repasse cartão)",
        // Já nasce categorizado (1.3.01 maquininha) pra não travar a conciliação depois.
        conta_contabil_id: catId || contaMaquininha?.id || null,
        descricao: [a.bandeira, a.produto, a.num_parcela ? `${a.num_parcela}/${a.qtd_parcelas}` : null].filter(Boolean).join(" · "),
      }));
      const CHUNK = 500;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const { error } = await db.from("contas_receber").insert(rows.slice(i, i + CHUNK));
        if (error) throw error;
      }
      toast.success(`Substituição feita: ${rows.length} CR de cartão corrigidos pela agenda.`);
      invalidarTudo();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao substituir");
    } finally {
      setAplicando(false);
    }
  };

  // ── Desfazer: arquiva os CR gerados e restaura os originais ──
  const desfazerSubstituicao = async () => {
    if (!cId) return;
    if (!window.confirm("Desfazer a substituição? Os CR gerados pela agenda saem e os originais voltam.")) return;
    setAplicando(true);
    try {
      const nowISO = new Date().toISOString();
      const { error: e1 } = await db
        .from("contas_receber")
        .update({ deleted_at: nowISO })
        .eq("company_id", cId)
        .not("card_receivable_id", "is", null)
        .is("deleted_at", null);
      if (e1) throw e1;
      const { error: e2 } = await db
        .from("contas_receber")
        .update({ deleted_at: null, substituido_em: null })
        .eq("company_id", cId)
        .not("substituido_em", "is", null);
      if (e2) throw e2;
      toast.success("Substituição desfeita — os CR originais voltaram.");
      invalidarTudo();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao desfazer");
    } finally {
      setAplicando(false);
    }
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    try {
      const items = await parseStoneAgenda(file);
      if (!items.length) { toast.error("Nenhuma parcela encontrada na planilha."); return; }
      setPreview(items);
    } catch (err: any) {
      toast.error(err?.message || "Erro ao ler a planilha");
    }
  };

  const handleImport = async () => {
    if (!preview || !cId) return;
    setImporting(true);
    try {
      const rows = preview.map((it) => ({
        company_id: cId,
        documento: it.documento,
        stonecode: it.stonecode,
        categoria: it.categoria,
        data_venda: it.dataVenda,
        data_vencimento: it.dataVencimento,
        data_vencimento_original: it.dataVencimentoOriginal,
        bandeira: it.bandeira,
        produto: it.produto,
        stone_id: it.stoneId,
        qtd_parcelas: it.qtdParcelas,
        num_parcela: it.numParcela,
        valor_bruto: it.valorBruto,
        valor_liquido: it.valorLiquido,
        desconto_mdr: it.descontoMdr,
        desconto_antecipacao: it.descontoAntecipacao,
        desconto_unificado: it.descontoUnificado,
        status: it.status,
        data_status: it.dataStatus,
        content_hash: it.contentHash,
      }));
      const CHUNK = 500;
      let ok = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error } = await db.from("card_receivables").upsert(chunk, { onConflict: "company_id,content_hash" });
        if (error) throw error;
        ok += chunk.length;
      }
      toast.success(`${ok} parcela(s) importada(s) da agenda Stone.`);
      setPreview(null);
      queryClient.invalidateQueries({ queryKey: ["card_receivables_resumo", cId] });
    } catch (err: any) {
      toast.error(err?.message || "Erro ao importar");
    } finally {
      setImporting(false);
    }
  };

  // Agregados da prévia.
  const prevTotais = preview
    ? preview.reduce(
        (acc, it) => {
          acc.bruto += it.valorBruto || 0;
          acc.liquido += it.valorLiquido;
          acc.taxa += taxaDe(it);
          if (!acc.minVenc || it.dataVencimento < acc.minVenc) acc.minVenc = it.dataVencimento;
          if (!acc.maxVenc || it.dataVencimento > acc.maxVenc) acc.maxVenc = it.dataVencimento;
          return acc;
        },
        { bruto: 0, liquido: 0, taxa: 0, minVenc: "", maxVenc: "" },
      )
    : null;

  return (
    <AppLayout title="Recebíveis de Cartão">
      <div style={{ fontFamily: "var(--font-base)" }}>
        <PagePanel title="Recebíveis de Cartão (Stone)" subtitle="Importe a agenda de recebíveis — a verdade do que vai cair, líquido e na data certa">
          {/* Resumo do que já está importado */}
          {resumo && resumo.total > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              <Kpi label="Parcelas importadas" value={String(resumo.total)} sub={`${resumo.futuras} a receber`} />
              <Kpi label="A receber (líquido)" value={fmt2(resumo.aReceber)} sub="futuras, não pagas" cor={VERDE} />
              <Kpi label="Taxa total (MDR+antec.)" value={fmt2(resumo.taxaTotal)} sub="custo de adquirência" cor={VERMELHO} />
            </div>
          )}

          {/* Repasses sem categoria — destrava a conciliação */}
          {semCategoria > 0 && (
            <div style={{ background: "#FFFFFF", border: "1px solid #FDA29B", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", background: "#B42318" }}>
                <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "#fff" }}>Categorizar repasses (destrava a conciliação)</span>
              </div>
              <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 13, color: "#912018" }}>
                  ⚠️ <strong>{semCategoria}</strong> repasse(s) de cartão estão <strong>sem categoria contábil</strong>. A conciliação trava nesses (a movimentação não pode ficar sem categoria). Escolha a conta e aplique.
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <select
                    value={catId}
                    onChange={(e) => setCatId(e.target.value)}
                    style={{ flex: "1 1 320px", minWidth: 260, padding: "9px 12px", border: "1px solid #D0D5DD", borderRadius: 8, fontSize: 13, color: "#1D2939", background: "#fff" }}
                  >
                    <option value="">Selecione a conta…</option>
                    {contasContabeis.map((c) => (
                      <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={categorizarRepasses}
                    disabled={categorizando || !catId}
                    style={{ background: "#059669", color: "#fff", fontWeight: 700, fontSize: 14, padding: "9px 18px", borderRadius: 8, border: "none", cursor: categorizando || !catId ? "default" : "pointer", opacity: categorizando || !catId ? 0.6 : 1 }}
                  >
                    {categorizando ? "Aplicando…" : `Aplicar a ${semCategoria} repasse(s)`}
                  </button>
                </div>
                {contaMaquininha && (
                  <span style={{ fontSize: 11.5, color: "#98A2B3" }}>
                    Sugerido: <strong>{contaMaquininha.code} — {contaMaquininha.name}</strong> — zera o recebível da maquininha, sem duplicar receita no DRE.
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Importação */}
          <div style={{ background: "#FFFFFF", border: "var(--border-hairline)", borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", background: NAVY, display: "flex", alignItems: "center", gap: 8 }}>
              <CreditCard size={15} style={{ color: "#fff" }} />
              <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "#fff" }}>Importar agenda Stone</span>
            </div>
            <div style={{ padding: 16 }}>
              {!cId ? (
                <div style={{ fontSize: 13, color: "#98A2B3" }}>Selecione uma empresa.</div>
              ) : !preview ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{ display: "none" }} />
                  <button
                    onClick={() => fileRef.current?.click()}
                    style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#059669", color: "#fff", fontWeight: 700, fontSize: 14, padding: "10px 16px", borderRadius: 8, border: "none", cursor: "pointer" }}
                  >
                    <Upload size={16} /> Selecionar planilha (Excel/CSV)
                  </button>
                  <span style={{ fontSize: 12, color: "#98A2B3" }}>Use o relatório "Agenda de Recebíveis" exportado do portal Stone.</span>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {/* KPIs da prévia */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                    <Kpi label="Parcelas" value={String(preview.length)} />
                    <Kpi label="Bruto" value={fmt2(prevTotais!.bruto)} />
                    <Kpi label="Líquido (vai cair)" value={fmt2(prevTotais!.liquido)} cor={VERDE} />
                    <Kpi label="Taxa" value={fmt2(prevTotais!.taxa)} cor={VERMELHO} />
                  </div>
                  <div style={{ fontSize: 12, color: "#667085" }}>
                    Liquidações de <strong>{fmtDia(prevTotais!.minVenc)}</strong> até <strong>{fmtDia(prevTotais!.maxVenc)}</strong> · agrupado por vencimento:
                  </div>

                  {/* Agrupado por vencimento */}
                  <GrupoVencimentoTable grupos={agruparPrevia(preview)} />

                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={handleImport}
                      disabled={importing}
                      style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#059669", color: "#fff", fontWeight: 700, fontSize: 14, padding: "10px 16px", borderRadius: 8, border: "none", cursor: importing ? "default" : "pointer", opacity: importing ? 0.7 : 1 }}
                    >
                      {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                      {importing ? "Importando…" : `Importar ${preview.length} parcelas`}
                    </button>
                    <button
                      onClick={() => setPreview(null)}
                      disabled={importing}
                      style={{ background: "#fff", color: "#1D2939", fontWeight: 600, fontSize: 14, padding: "10px 16px", borderRadius: 8, border: "1px solid #D0D5DD", cursor: "pointer" }}
                    >
                      Cancelar
                    </button>
                  </div>
                  <span style={{ fontSize: 11.5, color: "#98A2B3" }}>Re-importar a mesma agenda não duplica (cada parcela tem chave única).</span>
                </div>
              )}
            </div>
          </div>

          {/* Substituição ATIVA: CR gerados pela agenda + desfazer */}
          {!preview && crGerados > 0 && (
            <div style={{ background: "#FFFFFF", border: "var(--border-hairline)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", background: NAVY }}>
                <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "#fff" }}>Substituição de cartão ativa</span>
              </div>
              <div style={{ padding: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: "#027A48" }}>
                  ✅ <strong>{crGerados}</strong> CR de cartão vindos da agenda (líquido, datas certas). Os originais (bruto) estão arquivados.
                </span>
                <button
                  onClick={desfazerSubstituicao}
                  disabled={aplicando}
                  style={{ background: "#fff", color: "#B42318", fontWeight: 700, fontSize: 13, padding: "9px 16px", borderRadius: 8, border: "1px solid #FDA29B", cursor: aplicando ? "default" : "pointer", opacity: aplicando ? 0.6 : 1 }}
                >
                  {aplicando ? "Desfazendo…" : "Desfazer substituição"}
                </button>
              </div>
            </div>
          )}

          {/* Antes × Depois: substituição dos CR de cartão pela agenda */}
          {!preview && crSistema && crSistema.count > 0 && (() => {
            const agendaCount = resumo?.abertas ?? 0;
            const agendaTotal = resumo?.aReceber ?? 0;
            const alvo = crSistema.count + crGerados; // total de parcelas que a agenda completa deve cobrir
            const semAgenda = agendaCount === 0;
            // Completude por CONTAGEM (mais confiável: um lado é bruto, outro líquido).
            const parcial = !semAgenda && agendaCount < alvo * 0.9;
            const faltam = Math.max(0, alvo - agendaCount);
            return (
              <div style={{ background: "#FFFFFF", border: "var(--border-hairline)", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", background: NAVY }}>
                  <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "#fff" }}>Substituir CR de cartão pela agenda</span>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>antes (sistema, valores errados) × depois (agenda, líquido)</div>
                </div>
                <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 16, alignItems: "center" }}>
                    <div style={{ background: "#FEF3F2", border: "1px solid #FDA29B", borderRadius: 8, padding: "12px 14px" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#B42318" }}>Antes · no sistema</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#B42318", marginTop: 2 }}>{fmt2(crSistema.total)}</div>
                      <div style={{ fontSize: 11.5, color: "#912018", marginTop: 2 }}>{crSistema.count} CR de cartão · bruto, datas erradas</div>
                    </div>
                    <div style={{ fontSize: 22, color: "#98A2B3" }}>→</div>
                    <div style={{ background: "#ECFDF3", border: "1px solid #A6F4C5", borderRadius: 8, padding: "12px 14px" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "#027A48" }}>Depois · agenda Stone</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: "#027A48", marginTop: 2 }}>{semAgenda ? "—" : fmt2(agendaTotal)}</div>
                      <div style={{ fontSize: 11.5, color: "#054F31", marginTop: 2 }}>{semAgenda ? "agenda não importada" : `${agendaCount} de ~${alvo} parcelas · líquido`}</div>
                    </div>
                  </div>

                  {semAgenda ? (
                    <div style={{ fontSize: 12.5, color: "#B54708", background: "#FFFAEB", border: "1px solid #FEDF89", borderRadius: 8, padding: "10px 12px" }}>
                      ⚠️ A agenda ainda não foi importada. Suba o relatório <strong>completo</strong> da Stone (todas as parcelas em aberto) acima antes de substituir.
                    </div>
                  ) : parcial ? (
                    <div style={{ fontSize: 12.5, color: "#B54708", background: "#FFFAEB", border: "1px solid #FEDF89", borderRadius: 8, padding: "10px 12px" }}>
                      ⚠️ A agenda tem <strong>{agendaCount} de ~{alvo}</strong> parcelas (faltam ~{faltam}). Importe os outros meses — <strong>os imports se somam</strong> — antes de substituir.
                    </div>
                  ) : (
                    <div style={{ fontSize: 12.5, color: "#027A48", background: "#ECFDF3", border: "1px solid #A6F4C5", borderRadius: 8, padding: "10px 12px" }}>
                      ✅ A agenda tem {agendaCount} parcelas (~{alvo} no sistema) — parece completa. Pode aplicar: arquiva os {crSistema.count} CR a corrigir e cria/atualiza pela agenda.
                    </div>
                  )}
                  {!semAgenda && !parcial ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                      <button
                        onClick={aplicarSubstituicao}
                        disabled={aplicando}
                        style={{ background: "#059669", color: "#fff", fontWeight: 700, fontSize: 14, padding: "10px 18px", borderRadius: 8, border: "none", cursor: aplicando ? "default" : "pointer", opacity: aplicando ? 0.7 : 1 }}
                      >
                        {aplicando ? "Substituindo…" : "Aplicar substituição"}
                      </button>
                      <span style={{ fontSize: 11.5, color: "#98A2B3" }}>Arquiva os {crSistema.count} CR (reversível) e cria os corretos pela agenda. Dá pra desfazer.</span>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11.5, color: "#98A2B3" }}>
                      Os {crSistema.count} CR atuais estão <strong>sem conciliação</strong> (0 linkados ao banco) — substituir é seguro. O botão de aplicar habilita quando a agenda estiver completa (verde).
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Recebíveis por vencimento (já importados) */}
          {!preview && resumo && resumo.porVencimento.length > 0 && (
            <div style={{ background: "#FFFFFF", border: "var(--border-hairline)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", background: NAVY }}>
                <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "#fff" }}>Recebíveis por vencimento</span>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>o que vai cair (líquido) em cada data · em aberto</div>
              </div>
              <div style={{ padding: 14 }}>
                <GrupoVencimentoTable grupos={resumo.porVencimento} />
              </div>
            </div>
          )}

          {/* Custo de adquirência (taxa de cartão) por mês */}
          {!preview && resumo && resumo.taxaPorMes.length > 0 && (
            <div style={{ background: "#FFFFFF", border: "var(--border-hairline)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", background: NAVY }}>
                <span style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: "#fff" }}>Custo de adquirência (taxa) por mês</span>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)" }}>taxa de cartão da agenda, pelo mês da venda · ainda NÃO lançada no DRE</div>
              </div>
              <div style={{ padding: 14 }}>
                <div style={{ border: "var(--border-hairline)", borderRadius: 8, overflow: "hidden" }}>
                  <div style={{ maxHeight: 300, overflowY: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ position: "sticky", top: 0, background: "#fff", borderBottom: "2px solid #D0D5DD" }}>
                          <th style={{ textAlign: "left", padding: "8px 14px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#000" }}>Mês da venda</th>
                          <th style={{ textAlign: "right", padding: "8px 14px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#000" }}>Taxa de cartão</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resumo.taxaPorMes.map((m) => (
                          <tr key={m.mes} style={{ borderBottom: "1px solid #F1F3F5" }}>
                            <td style={{ padding: "6px 14px", color: "#1D2939", whiteSpace: "nowrap" }}>{m.mes.slice(5)}/{m.mes.slice(0, 4)}</td>
                            <td style={{ padding: "6px 14px", textAlign: "right", color: VERMELHO, fontWeight: 600, whiteSpace: "nowrap" }}>{fmt2(m.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: "2px solid #D0D5DD", background: "#FAFAFA" }}>
                          <td style={{ padding: "8px 14px", fontWeight: 700, color: "#1D2939" }}>Total</td>
                          <td style={{ padding: "8px 14px", textAlign: "right", fontWeight: 700, color: VERMELHO }}>{fmt2(resumo.taxaTotal)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
                <div style={{ fontSize: 11.5, color: "#98A2B3", marginTop: 8 }}>
                  Este é o custo real de cartão (MDR + antecipação) que hoje não aparece no DRE. A integração formal na margem está pendente: a HAIR já tem ~R$ 41 mil de taxa lançada manualmente como CP — somar a agenda por cima duplicaria. Precisamos decidir o que fazer com esses lançamentos antes.
                </div>
              </div>
            </div>
          )}
        </PagePanel>
      </div>
    </AppLayout>
  );
}

function GrupoVencimentoTable({ grupos }: { grupos: Grupo[] }) {
  const tot = grupos.reduce(
    (a, g) => ({ count: a.count + g.count, bruto: a.bruto + g.bruto, liquido: a.liquido + g.liquido, taxa: a.taxa + g.taxa }),
    { count: 0, bruto: 0, liquido: 0, taxa: 0 },
  );
  const th: React.CSSProperties = { padding: "7px 12px", fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, color: "#000", whiteSpace: "nowrap" };
  return (
    <div style={{ border: "var(--border-hairline)", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ maxHeight: 380, overflowY: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ position: "sticky", top: 0, background: "#fff", borderBottom: "2px solid #D0D5DD" }}>
              <th style={{ ...th, textAlign: "left" }}>Vencimento</th>
              <th style={{ ...th, textAlign: "left" }}>Data da venda</th>
              <th style={{ ...th, textAlign: "left" }}>Descrição</th>
              <th style={{ ...th, textAlign: "right" }}>Parcelas</th>
              <th style={{ ...th, textAlign: "right" }}>Bruto</th>
              <th style={{ ...th, textAlign: "right" }}>Líquido</th>
              <th style={{ ...th, textAlign: "right" }}>Taxa</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <tr key={`${g.data}|${g.dataVenda}`} style={{ borderBottom: "1px solid #F1F3F5" }}>
                <td style={{ padding: "6px 12px", color: "#1D2939", fontWeight: 600, whiteSpace: "nowrap" }}>{fmtDia(g.data)}</td>
                <td style={{ padding: "6px 12px", color: "#667085", whiteSpace: "nowrap" }}>{fmtDia(g.dataVenda)}</td>
                <td style={{ padding: "6px 12px", color: "#667085", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={g.descricao}>{g.descricao}</td>
                <td style={{ padding: "6px 12px", textAlign: "right", color: "#667085", whiteSpace: "nowrap" }}>{g.count}</td>
                <td style={{ padding: "6px 12px", textAlign: "right", color: "#1D2939", whiteSpace: "nowrap" }}>{fmt2(g.bruto)}</td>
                <td style={{ padding: "6px 12px", textAlign: "right", color: VERDE, fontWeight: 600, whiteSpace: "nowrap" }}>{fmt2(g.liquido)}</td>
                <td style={{ padding: "6px 12px", textAlign: "right", color: VERMELHO, whiteSpace: "nowrap" }}>{fmt2(g.taxa)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: "2px solid #D0D5DD", background: "#FAFAFA" }}>
              <td style={{ padding: "8px 12px", fontWeight: 700, color: "#1D2939" }}>Total · {new Set(grupos.map((g) => g.data)).size} venc.</td>
              <td style={{ padding: "8px 12px" }} />
              <td style={{ padding: "8px 12px" }} />
              <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: "#667085" }}>{tot.count}</td>
              <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: "#1D2939" }}>{fmt2(tot.bruto)}</td>
              <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: VERDE }}>{fmt2(tot.liquido)}</td>
              <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: VERMELHO }}>{fmt2(tot.taxa)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, cor }: { label: string; value: string; sub?: string; cor?: string }) {
  return (
    <div style={{ background: "#fff", border: "var(--border-hairline)", borderRadius: 8, padding: "12px 14px" }}>
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: "#667085" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: cor ?? "#1D2939", marginTop: 2 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#98A2B3", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
