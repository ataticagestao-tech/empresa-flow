import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { maskCNPJ } from "@/utils/masks";
import { Building2, MapPin, FileText, User, ArrowLeft, BarChart3, Pencil, Users, Wallet, Receipt, UserCheck, Camera, Check, X, Trash2, FileDown } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCompanies } from "@/hooks/useCompanies";
import { useCompany } from "@/contexts/CompanyContext";

const LB = "text-[10px] font-bold uppercase tracking-wider text-[#555]";

const regimeLabels: Record<string, string> = {
  simples_nacional: "Simples Nacional",
  lucro_presumido: "Lucro Presumido",
  lucro_real: "Lucro Real",
  mei: "MEI",
};

const regimeOptions = [
  { id: "simples_nacional", label: "Simples Nacional" },
  { id: "lucro_presumido", label: "Lucro Presumido" },
  { id: "lucro_real", label: "Lucro Real" },
  { id: "mei", label: "MEI" },
];

export default function EmpresaResumo() {
  const { id } = useParams<{ id: string }>();
  const { user, activeClient } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const db = activeClient as any;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const { forceDeleteCompany } = useCompanies(user?.id);
  const { selectedCompany, setSelectedCompany } = useCompany();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;

    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error("Arquivo muito grande. Máximo 2MB.");
      return;
    }

    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem.");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${id}/logo.${ext}`;

      await db.storage.from("company-logos").remove([path]);

      const { error: uploadError } = await db.storage
        .from("company-logos")
        .upload(path, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = db.storage
        .from("company-logos")
        .getPublicUrl(path);

      const logoUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await db
        .from("companies")
        .update({ logo_url: logoUrl })
        .eq("id", id);

      if (updateError) throw updateError;

      queryClient.invalidateQueries({ queryKey: ["empresa_resumo", id] });
      toast.success("Logo atualizado!");
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error("Erro ao enviar logo: " + (err.message || "Tente novamente."));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const { data: company, isLoading } = useQuery({
    queryKey: ["empresa_resumo", id],
    queryFn: async () => {
      const { data, error } = await db.from("companies").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: qsa = [], isLoading: qsaLoading } = useQuery({
    queryKey: ["empresa_qsa", company?.cnpj],
    queryFn: async () => {
      const cnpj = company.cnpj?.replace(/\D/g, "");
      if (!cnpj || cnpj.length !== 14) return [];
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
      if (!res.ok) return [];
      const d = await res.json();
      return (d.qsa || []) as { nome_socio: string; qualificacao_socio: string; data_entrada_sociedade?: string }[];
    },
    enabled: !!company?.cnpj,
    staleTime: 1000 * 60 * 60,
  });

  const { data: stats } = useQuery({
    queryKey: ["empresa_stats", id],
    queryFn: async () => {
      const [{ count: empCount }, { count: bankCount }, { count: chartCount }, { count: clientCount }] = await Promise.all([
        db.from("employees").select("id", { count: "exact", head: true }).eq("company_id", id),
        db.from("bank_accounts").select("id", { count: "exact", head: true }).eq("company_id", id),
        db.from("chart_of_accounts").select("id", { count: "exact", head: true }).eq("company_id", id),
        db.from("clients").select("id", { count: "exact", head: true }).eq("company_id", id),
      ]);
      return {
        employees: empCount || 0,
        bankAccounts: bankCount || 0,
        chartAccounts: chartCount || 0,
        clients: clientCount || 0,
      };
    },
    enabled: !!id,
  });

  // Populate form when entering edit mode
  useEffect(() => {
    if (editing && company) {
      setForm({
        razao_social: company.razao_social || "",
        nome_fantasia: company.nome_fantasia || "",
        cnpj: company.cnpj || "",
        data_abertura: company.data_abertura || "",
        inscricao_municipal: company.inscricao_municipal || "",
        inscricao_estadual: company.inscricao_estadual || "",
        endereco_logradouro: company.endereco_logradouro || "",
        endereco_numero: company.endereco_numero || "",
        endereco_bairro: company.endereco_bairro || "",
        endereco_cidade: company.endereco_cidade || "",
        endereco_estado: company.endereco_estado || "",
        endereco_cep: company.endereco_cep || "",
        email: company.email || "",
        telefone: company.telefone || "",
        regime_tributario: company.regime_tributario || "",
        responsavel_nome: company.responsavel_nome || "",
        responsavel_cpf: company.responsavel_cpf || "",
        responsavel_email: company.responsavel_email || "",
        responsavel_telefone: company.responsavel_telefone || "",
      });
    }
  }, [editing, company]);

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const payload = {
        razao_social: form.razao_social || null,
        nome_fantasia: form.nome_fantasia || null,
        cnpj: form.cnpj?.replace(/\D/g, "") || null,
        data_abertura: form.data_abertura || null,
        inscricao_municipal: form.inscricao_municipal || null,
        inscricao_estadual: form.inscricao_estadual || null,
        endereco_logradouro: form.endereco_logradouro || null,
        endereco_numero: form.endereco_numero || null,
        endereco_bairro: form.endereco_bairro || null,
        endereco_cidade: form.endereco_cidade || null,
        endereco_estado: form.endereco_estado || null,
        endereco_cep: form.endereco_cep || null,
        email: form.email || null,
        telefone: form.telefone || null,
        regime_tributario: form.regime_tributario || null,
        responsavel_nome: form.responsavel_nome || null,
        responsavel_cpf: form.responsavel_cpf || null,
        responsavel_email: form.responsavel_email || null,
        responsavel_telefone: form.responsavel_telefone || null,
      };

      const { error } = await db.from("companies").update(payload).eq("id", id);
      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["empresa_resumo", id] });
      setEditing(false);
      toast.success("Empresa atualizada!");
    } catch (err: any) {
      toast.error("Erro ao salvar: " + (err.message || "Tente novamente."));
    } finally {
      setSaving(false);
    }
  };

  const set = (key: string, value: string) => setForm(f => ({ ...f, [key]: value }));

  // ─── Exportar ficha cadastral em PDF (ABNT NBR 14724) ─────────────
  const exportarFichaPDF = () => {
    if (!company) {
      toast.error("Empresa nao carregada");
      return;
    }

    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const W = 210;
    const H = 297;
    const MT = 30;
    const MB = 20;
    const ML = 30;
    const MR = 20;
    const contentW = W - ML - MR;
    const FONT = "times";
    const LH12 = 7;     // entrelinha 1,5 para corpo 12pt
    const LH10 = 5.8;   // entrelinha 1,0 para legendas/quadros
    const INDENT = 12.5;

    let pageNum = 1;
    const desenharNumeroPagina = () => {
      doc.setFont(FONT, "normal");
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      doc.text(String(pageNum), W - MR, MT - 10, { align: "right" });
    };
    const novaPagina = () => {
      doc.addPage();
      pageNum += 1;
      desenharNumeroPagina();
      return MT;
    };
    const garantirEspaco = (y: number, necessario: number) => {
      if (y + necessario > H - MB) return novaPagina();
      return y;
    };
    const escreverParagrafo = (
      texto: string,
      y: number,
      opts?: { recuo?: boolean; bold?: boolean; size?: number }
    ) => {
      const size = opts?.size ?? 12;
      const lh = size === 10 ? LH10 : LH12;
      doc.setFont(FONT, opts?.bold ? "bold" : "normal");
      doc.setFontSize(size);
      doc.setTextColor(0, 0, 0);
      const recuoX = opts?.recuo ? INDENT : 0;
      const linhas = doc.splitTextToSize(texto, contentW - recuoX) as string[];
      const primeira = linhas[0];
      const resto = linhas.slice(1);
      y = garantirEspaco(y, lh);
      doc.text(primeira, ML + recuoX, y);
      y += lh;
      for (const ln of resto) {
        y = garantirEspaco(y, lh);
        doc.text(ln, ML, y);
        y += lh;
      }
      return y;
    };

    const fmtData = (iso: string | null | undefined) => {
      if (!iso) return null;
      try {
        return format(new Date(iso + "T12:00:00"), "dd/MM/yyyy");
      } catch {
        return null;
      }
    };
    const ouTraco = (v: string | null | undefined) => (v && String(v).trim() ? String(v).trim() : "—");

    const dataEmissaoExt = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
    const cidadeSede = company.endereco_cidade || "";
    const ufSede = company.endereco_estado || "";
    const localData = `${cidadeSede ? cidadeSede + (ufSede ? "/" + ufSede : "") + ", " : ""}${dataEmissaoExt}.`;

    desenharNumeroPagina();
    let y = MT;

    // Titulo
    doc.setFont(FONT, "bold");
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text("FICHA CADASTRAL DA EMPRESA", W / 2, y, { align: "center" });
    y += LH12;
    if (company.razao_social) {
      doc.setFont(FONT, "bold");
      doc.text(String(company.razao_social).toUpperCase(), W / 2, y, { align: "center" });
      y += LH12;
    }
    if (company.cnpj) {
      doc.setFont(FONT, "normal");
      doc.setFontSize(10);
      doc.text(`CNPJ: ${maskCNPJ(company.cnpj)}`, W / 2, y, { align: "center" });
      y += LH10;
    }
    y += LH12;

    // 1 INTRODUCAO
    y = escreverParagrafo("1 INTRODUCAO", y, { bold: true });
    y += 2;
    const intro =
      `O presente documento consolida as informacoes cadastrais da pessoa juridica ` +
      `${ouTraco(company.razao_social)}` +
      (company.cnpj ? `, inscrita no CNPJ sob o n. ${maskCNPJ(company.cnpj)}` : "") +
      `, conforme registros mantidos no sistema de gestao empresarial. ` +
      `O documento abrange a identificacao da entidade, dados de localizacao e contato, ` +
      `regime tributario, responsavel legal e o quadro societario obtido junto a Receita Federal do Brasil.`;
    y = escreverParagrafo(intro, y, { recuo: true });
    y += LH12;

    // Helper para secao com pares rotulo: valor (justificado em coluna unica, estilo documento)
    const secao = (titulo: string, pares: Array<[string, string | null | undefined]>, yIn: number) => {
      let yy = escreverParagrafo(titulo, yIn, { bold: true });
      yy += 2;
      doc.setFont(FONT, "normal");
      doc.setFontSize(12);
      for (const [rot, val] of pares) {
        const linha = `${rot}: ${ouTraco(val)}.`;
        const lns = doc.splitTextToSize(linha, contentW - INDENT) as string[];
        // Primeira linha com recuo, demais sem
        yy = garantirEspaco(yy, LH12);
        doc.text(lns[0], ML + INDENT, yy);
        yy += LH12;
        for (const ln of lns.slice(1)) {
          yy = garantirEspaco(yy, LH12);
          doc.text(ln, ML, yy);
          yy += LH12;
        }
      }
      return yy + 2;
    };

    // 2 IDENTIFICACAO
    y = secao(
      "2 IDENTIFICACAO",
      [
        ["Razao social", company.razao_social],
        ["Nome fantasia", company.nome_fantasia],
        ["CNPJ", company.cnpj ? maskCNPJ(company.cnpj) : null],
        ["Data de abertura", fmtData(company.data_abertura)],
        ["Inscricao municipal", company.inscricao_municipal],
        ["Inscricao estadual", company.inscricao_estadual],
        ["Situacao", company.is_active ? "Ativa" : "Inativa"],
      ],
      y
    );

    // 3 ENDERECO E CONTATO
    const enderecoFmt = [
      [company.endereco_logradouro, company.endereco_numero].filter(Boolean).join(", "),
      company.endereco_bairro,
    ]
      .filter(Boolean)
      .join(" — ");
    const cidadeUfFmt = [company.endereco_cidade, company.endereco_estado].filter(Boolean).join(" / ");
    y = secao(
      "3 ENDERECO E CONTATO",
      [
        ["Logradouro", enderecoFmt || null],
        ["Cidade / UF", cidadeUfFmt || null],
        ["CEP", company.endereco_cep],
        ["E-mail", company.email],
        ["Telefone", company.telefone],
      ],
      y
    );

    // 4 REGIME TRIBUTARIO
    y = secao(
      "4 REGIME TRIBUTARIO",
      [
        [
          "Regime adotado",
          company.regime_tributario ? (regimeLabels[company.regime_tributario] || company.regime_tributario) : null,
        ],
      ],
      y
    );

    // 5 RESPONSAVEL LEGAL
    y = secao(
      "5 RESPONSAVEL LEGAL",
      [
        ["Nome", company.responsavel_nome],
        ["CPF", company.responsavel_cpf],
        ["E-mail", company.responsavel_email],
        ["Telefone", company.responsavel_telefone],
      ],
      y
    );

    // 6 QUADRO SOCIETARIO
    y = escreverParagrafo("6 QUADRO SOCIETARIO", y, { bold: true });
    y += 2;
    if (qsa && qsa.length > 0) {
      // Legenda do quadro (ABNT §5.6)
      y = garantirEspaco(y, LH10 * 2);
      doc.setFont(FONT, "bold");
      doc.setFontSize(10);
      doc.text("Quadro 1 — Composicao do quadro societario (fonte: Receita Federal)", ML, y);
      y += LH10;

      const cols = [
        { label: "N.", w: 10, align: "left" as const },
        { label: "Nome do socio", w: 90, align: "left" as const },
        { label: "Qualificacao", w: 0, align: "left" as const },
        { label: "Desde", w: 28, align: "left" as const },
      ];
      const usados = cols.reduce((s, c) => s + c.w, 0);
      cols[2].w = contentW - usados;

      const desenharCabecalhoTabela = (yy: number) => {
        yy = garantirEspaco(yy, LH10 + 2);
        doc.setFont(FONT, "bold");
        doc.setFontSize(10);
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.3);
        doc.line(ML, yy - 0.5, ML + contentW, yy - 0.5);
        let xx = ML;
        for (const c of cols) {
          doc.text(c.label, xx + 1, yy + 4);
          xx += c.w;
        }
        yy += 5.5;
        doc.line(ML, yy - 0.5, ML + contentW, yy - 0.5);
        return yy;
      };

      y = desenharCabecalhoTabela(y);
      doc.setFont(FONT, "normal");
      doc.setFontSize(10);

      qsa.forEach((s, i) => {
        const nomeLines = doc.splitTextToSize(s.nome_socio || "—", cols[1].w - 2) as string[];
        const qualLines = doc.splitTextToSize(s.qualificacao_socio || "—", cols[2].w - 2) as string[];
        const altura = Math.max(LH10, Math.max(nomeLines.length, qualLines.length) * LH10);
        y = garantirEspaco(y, altura + 1);
        if (y === MT) y = desenharCabecalhoTabela(y);

        let xx = ML;
        doc.text(String(i + 1), xx + 1, y + 4);
        xx += cols[0].w;
        nomeLines.forEach((ln, k) => doc.text(ln, xx + 1, y + 4 + k * LH10));
        xx += cols[1].w;
        qualLines.forEach((ln, k) => doc.text(ln, xx + 1, y + 4 + k * LH10));
        xx += cols[2].w;
        const desde = s.data_entrada_sociedade ? fmtData(s.data_entrada_sociedade) || "—" : "—";
        doc.text(desde, xx + 1, y + 4);

        y += altura;
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.1);
        doc.line(ML, y, ML + contentW, y);
      });

      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.3);
      doc.line(ML, y, ML + contentW, y);
      y += LH10;

      y = garantirEspaco(y, LH10);
      doc.setFont(FONT, "normal");
      doc.setFontSize(10);
      doc.text(
        `Fonte: BrasilAPI/Receita Federal (consulta em ${format(new Date(), "dd/MM/yyyy HH:mm")}).`,
        ML,
        y
      );
      y += LH12;
    } else {
      y = escreverParagrafo(
        "Nao foram localizados socios cadastrados na base da Receita Federal para o CNPJ informado.",
        y,
        { recuo: true }
      );
      y += LH12;
    }

    // Local e data
    y = garantirEspaco(y, LH12 * 2);
    doc.setFont(FONT, "normal");
    doc.setFontSize(12);
    doc.text(localData, W - MR, y, { align: "right" });

    const slug = String(company.razao_social || "empresa")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
    const nome = `ficha-cadastral-${slug}-${format(new Date(), "yyyy-MM-dd")}.pdf`;
    doc.save(nome);
  };

  const enderecoFull = company
    ? [company.endereco_logradouro, company.endereco_numero, company.endereco_bairro]
        .filter(Boolean)
        .join(", ")
    : "";
  const cidadeUf = company
    ? [company.endereco_cidade, company.endereco_estado].filter(Boolean).join(" / ")
    : "";

  if (isLoading) {
    return (
      <AppLayout title="Empresa">
        <div className="flex items-center justify-center py-20 text-sm text-[#555]">Carregando...</div>
      </AppLayout>
    );
  }

  if (!company) {
    return (
      <AppLayout title="Empresa">
        <div className="flex items-center justify-center py-20 text-sm text-[#555]">
          Empresa não encontrada.
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title={company.razao_social || "Empresa"}>
      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* Toolbar acima do papel — ações fora do "documento" */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <button onClick={() => navigate("/empresas")}
            className="flex items-center gap-1.5 text-xs font-semibold text-[#667085] hover:text-black transition-colors">
            ← Voltar para empresas
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(`/dashboard/${id}`)}
              className="flex items-center gap-1.5 bg-[#1D2939] text-white text-xs font-semibold px-3 py-2 rounded-md hover:bg-[#111827] transition-colors">
              <BarChart3 size={14} /> Dashboard
            </button>
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} disabled={saving}
                  className="flex items-center gap-1.5 bg-white text-[#667085] border border-[#D0D5DD] text-xs font-semibold px-3 py-2 rounded-md hover:bg-gray-50 transition-colors">
                  <X size={14} /> Cancelar
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex items-center gap-1.5 bg-[#039855] text-white text-xs font-semibold px-3 py-2 rounded-md hover:bg-[#027A48] transition-colors">
                  <Check size={14} /> {saving ? "Salvando..." : "Salvar"}
                </button>
              </>
            ) : (
              <>
                <button onClick={exportarFichaPDF}
                  className="flex items-center gap-1.5 bg-white text-black border border-[#D0D5DD] text-xs font-semibold px-3 py-2 rounded-md hover:bg-gray-50 transition-colors"
                  title="Exportar ficha cadastral em PDF (ABNT)">
                  <FileDown size={14} /> PDF
                </button>
                <button onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 bg-white text-black border border-[#D0D5DD] text-xs font-semibold px-3 py-2 rounded-md hover:bg-gray-50 transition-colors">
                  <Pencil size={14} /> Editar
                </button>
                <button onClick={() => { setDeleteConfirmText(""); setDeleteOpen(true); }}
                  className="flex items-center gap-1.5 bg-white text-[#E53E3E] border border-[#FECDCA] text-xs font-semibold px-3 py-2 rounded-md hover:bg-[#FEE2E2] transition-colors"
                  title="Excluir empresa">
                  <Trash2 size={14} /> Excluir
                </button>
              </>
            )}
          </div>
        </div>

        {deleteOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
               onClick={() => !deleting && setDeleteOpen(false)}>
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-base font-bold text-[#E53E3E] mb-2">Excluir empresa definitivamente</h3>
              <p className="text-sm text-black mb-3">
                Esta ação é <strong>irreversível</strong>. Serão apagados permanentemente:
              </p>
              <ul className="text-xs text-[#555] list-disc pl-5 mb-4 space-y-0.5">
                <li>Vendas, contas a receber e a pagar</li>
                <li>Extratos bancários e movimentações</li>
                <li>Funcionários, clientes, fornecedores</li>
                <li>Plano de contas, categorias e contas bancárias</li>
                <li>Todo o histórico fiscal e documentos</li>
              </ul>
              <p className="text-xs text-black mb-2">
                Para confirmar, digite a razão social:
                <br />
                <span className="font-bold">{company.razao_social}</span>
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="Digite a razão social"
                autoFocus
                className="border border-[#ccc] rounded-md px-3 py-2 text-sm text-black bg-white focus:border-[#E53E3E] focus:outline-none w-full mb-4"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setDeleteOpen(false)}
                  disabled={deleting}
                  className="bg-white text-black border border-[#ccc] text-sm font-bold px-4 py-2 rounded-md disabled:opacity-50">
                  Cancelar
                </button>
                <button
                  onClick={async () => {
                    if (!id) return;
                    if (deleteConfirmText.trim() !== (company.razao_social || "").trim()) {
                      toast.error("Digite a razão social exatamente como aparece");
                      return;
                    }
                    setDeleting(true);
                    try {
                      await forceDeleteCompany(id);
                      if (selectedCompany?.id === id) setSelectedCompany(null);
                      setDeleteOpen(false);
                      navigate("/empresas");
                    } finally {
                      setDeleting(false);
                    }
                  }}
                  disabled={deleting || deleteConfirmText.trim() !== (company.razao_social || "").trim()}
                  className="bg-[#E53E3E] text-white text-sm font-bold px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">
                  {deleting ? "Excluindo..." : "Excluir definitivamente"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Ficha — papel/documento */}
        <div className="bg-white border border-[#EAECF0] rounded-lg overflow-hidden shadow-[0_1px_3px_rgba(16,24,40,.06),0_8px_24px_-12px_rgba(16,24,40,.12)]">

          {/* Letterhead: logo prominente centralizado + razão social */}
          <div className="px-10 pt-12 pb-8 flex flex-col items-center text-center gap-5 border-b border-[#EAECF0]">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="relative w-28 h-28 rounded-md bg-[#FAFAFA] flex items-center justify-center text-[#98A2B3] text-3xl font-semibold overflow-hidden group shrink-0 border border-[#EAECF0]"
              title="Alterar logo"
            >
              {company.logo_url ? (
                <img src={company.logo_url} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <span className="text-[40px] font-light text-[#98A2B3]">{(company.razao_social || "E")[0]}</span>
              )}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploading ? (
                  <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <div className="flex flex-col items-center gap-1 text-white">
                    <Camera size={20} />
                    <span className="text-[10px] font-semibold uppercase tracking-wider">Alterar logo</span>
                  </div>
                )}
              </div>
            </button>
            <div className="max-w-full">
              <h1 className="text-[26px] font-bold text-black tracking-tight leading-tight">{company.razao_social}</h1>
              <div className="flex items-center justify-center flex-wrap gap-x-2.5 gap-y-1 mt-2 text-[13px] text-[#667085]">
                {company.nome_fantasia && <span>{company.nome_fantasia}</span>}
                {company.nome_fantasia && company.cnpj && <span className="text-[#D0D5DD]">·</span>}
                {company.cnpj && <span className="tabular-nums">{maskCNPJ(company.cnpj)}</span>}
                <span className="text-[#D0D5DD]">·</span>
                <span className={company.is_active ? "text-[#039855] font-semibold" : "text-[#98A2B3] font-semibold"}>
                  {company.is_active ? "Ativa" : "Inativa"}
                </span>
              </div>
            </div>
          </div>

          {/* Stats inline (sem cards, só números + label) */}
          <div className="grid grid-cols-4 divide-x divide-[#EAECF0] border-b border-[#EAECF0]">
            {[
              { label: "Funcionários", value: stats?.employees ?? "—", url: "/funcionarios" },
              { label: "Clientes", value: stats?.clients ?? "—", url: "/clientes" },
              { label: "Contas Bancárias", value: stats?.bankAccounts ?? "—", url: "/contas-bancarias" },
              { label: "Plano de Contas", value: stats?.chartAccounts ?? "—", url: "/plano-contas" },
            ].map(s => (
              <button key={s.label} onClick={() => navigate(s.url)}
                className="px-6 py-3 text-left hover:bg-gray-50 transition-colors">
                <div className="text-[10.5px] font-semibold uppercase tracking-wider text-[#98A2B3] mb-0.5">{s.label}</div>
                <div className="text-lg font-semibold text-black tabular-nums">{s.value}</div>
              </button>
            ))}
          </div>

          {/* Seções da ficha */}
          <div className="divide-y divide-[#EAECF0]">

            {/* Identificação */}
            <Section icon={Building2} title="Identificação">
              {editing ? (
                <FieldGrid>
                  <EditRow label="Razão Social" value={form.razao_social} onChange={v => set("razao_social", v)} />
                  <EditRow label="Nome Fantasia" value={form.nome_fantasia} onChange={v => set("nome_fantasia", v)} />
                  <EditRow label="CNPJ" value={form.cnpj} onChange={v => set("cnpj", maskCNPJ(v))} />
                  <EditRow label="Data de Abertura" value={form.data_abertura} onChange={v => set("data_abertura", v)} type="date" />
                  <EditRow label="Inscrição Municipal" value={form.inscricao_municipal} onChange={v => set("inscricao_municipal", v)} />
                  <EditRow label="Inscrição Estadual" value={form.inscricao_estadual} onChange={v => set("inscricao_estadual", v)} />
                </FieldGrid>
              ) : (
                <FieldGrid>
                  <Field label="Razão Social" value={company.razao_social} />
                  <Field label="Nome Fantasia" value={company.nome_fantasia} />
                  <Field label="CNPJ" value={company.cnpj ? maskCNPJ(company.cnpj) : null} />
                  <Field label="Data de Abertura" value={company.data_abertura ? new Date(company.data_abertura + "T12:00:00").toLocaleDateString("pt-BR") : null} />
                  <Field label="Inscrição Municipal" value={company.inscricao_municipal} />
                  <Field label="Inscrição Estadual" value={company.inscricao_estadual} />
                </FieldGrid>
              )}
            </Section>

            {/* Endereço */}
            <Section icon={MapPin} title="Endereço & Contato">
              {editing ? (
                <FieldGrid>
                  <EditRow label="Logradouro" value={form.endereco_logradouro} onChange={v => set("endereco_logradouro", v)} />
                  <EditRow label="Número" value={form.endereco_numero} onChange={v => set("endereco_numero", v)} />
                  <EditRow label="Bairro" value={form.endereco_bairro} onChange={v => set("endereco_bairro", v)} />
                  <EditRow label="Cidade" value={form.endereco_cidade} onChange={v => set("endereco_cidade", v)} />
                  <EditRow label="UF" value={form.endereco_estado} onChange={v => set("endereco_estado", v)} />
                  <EditRow label="CEP" value={form.endereco_cep} onChange={v => set("endereco_cep", v)} />
                  <EditRow label="Email" value={form.email} onChange={v => set("email", v)} type="email" />
                  <EditRow label="Telefone" value={form.telefone} onChange={v => set("telefone", v)} />
                </FieldGrid>
              ) : (
                <FieldGrid>
                  <Field label="Logradouro" value={enderecoFull || null} />
                  <Field label="Cidade / UF" value={cidadeUf || null} />
                  <Field label="CEP" value={company.endereco_cep} />
                  <Field label="Email" value={company.email} />
                  <Field label="Telefone" value={company.telefone} />
                </FieldGrid>
              )}
            </Section>

            {/* Regime Tributário */}
            <Section icon={FileText} title="Regime Tributário">
              {editing ? (
                <div className="flex flex-wrap gap-2">
                  {regimeOptions.map(r => (
                    <button key={r.id} type="button"
                      onClick={() => set("regime_tributario", r.id)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-md border transition-colors ${
                        form.regime_tributario === r.id
                          ? "border-[#1D2939] bg-[#1D2939] text-white"
                          : "border-[#D0D5DD] bg-white text-[#667085] hover:border-[#1D2939] hover:text-black"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              ) : company.regime_tributario ? (
                <span className="text-[15px] font-semibold text-black px-4 py-2 rounded-md border border-[#EAECF0] bg-white inline-block">
                  {regimeLabels[company.regime_tributario] || company.regime_tributario}
                </span>
              ) : (
                <p className="text-[15px] text-[#98A2B3]">Não configurado</p>
              )}
            </Section>

            {/* Responsável */}
            <Section icon={User} title="Responsável Legal">
              {editing ? (
                <FieldGrid>
                  <EditRow label="Nome" value={form.responsavel_nome} onChange={v => set("responsavel_nome", v)} />
                  <EditRow label="CPF" value={form.responsavel_cpf} onChange={v => set("responsavel_cpf", v)} />
                  <EditRow label="Email" value={form.responsavel_email} onChange={v => set("responsavel_email", v)} type="email" />
                  <EditRow label="Telefone" value={form.responsavel_telefone} onChange={v => set("responsavel_telefone", v)} />
                </FieldGrid>
              ) : (
                <FieldGrid>
                  <Field label="Nome" value={company.responsavel_nome} />
                  <Field label="CPF" value={company.responsavel_cpf} />
                  <Field label="Email" value={company.responsavel_email} />
                  <Field label="Telefone" value={company.responsavel_telefone} />
                </FieldGrid>
              )}
            </Section>

            {/* Quadro Societário */}
            <Section icon={UserCheck} title="Quadro Societário" subtitle="Receita Federal">
              {qsaLoading ? (
                <p className="text-sm text-[#667085]">Consultando Receita Federal...</p>
              ) : qsa.length === 0 ? (
                <p className="text-sm text-[#98A2B3]">Nenhum sócio encontrado</p>
              ) : (
                <div className="space-y-1">
                  {qsa.map((socio, i) => (
                    <div key={i} className="flex items-center gap-3 py-3 border-b border-[#F1F3F5] last:border-b-0">
                      <div className="w-9 h-9 rounded-full bg-white border border-[#EAECF0] flex items-center justify-center text-black text-[13px] font-semibold shrink-0">
                        {(socio.nome_socio || "?")[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-semibold text-black truncate">{socio.nome_socio}</p>
                        <p className="text-[12.5px] text-[#667085]">{socio.qualificacao_socio || "Sócio"}</p>
                      </div>
                      {socio.data_entrada_sociedade && (
                        <span className="text-xs text-[#98A2B3] shrink-0">
                          Desde {new Date(socio.data_entrada_sociedade + "T12:00:00").toLocaleDateString("pt-BR")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function Section({ icon: Icon, title, subtitle, children }: {
  icon: any;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="px-6 py-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={17} className="text-black" />
        <h3 className="text-[16px] font-bold text-black uppercase tracking-[0.06em]">{title}</h3>
        {subtitle && <span className="text-[12px] text-[#98A2B3]">· {subtitle}</span>}
      </div>
      {children}
    </section>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-8 gap-y-2">{children}</div>;
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-baseline gap-2 min-w-0 py-1 border-b border-dotted border-[#EAECF0] last:border-b-0">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[#98A2B3] shrink-0 w-[130px]">{label}</span>
      <span className="text-[14px] text-black truncate flex-1">{value || <span className="text-[#98A2B3]">—</span>}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-[#EAECF0] last:border-0">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#98A2B3]">{label}</span>
      <span className="text-sm text-black">{value || "—"}</span>
    </div>
  );
}

function EditRow({ label, value, onChange, type = "text" }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-[#98A2B3]">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full h-9 px-3 text-[14px] border border-[#D0D5DD] rounded-md bg-white focus:border-[#1D2939] focus:ring-1 focus:ring-[#1D2939]/10 outline-none transition-colors"
      />
    </div>
  );
}
