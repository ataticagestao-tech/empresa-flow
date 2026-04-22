import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { maskCNPJ } from "@/utils/masks";
import { Building2, MapPin, FileText, User, ArrowLeft, BarChart3, Pencil, Users, Wallet, Receipt, UserCheck, Camera, Check, X, Trash2 } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { toast } from "sonner";
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

        {deleteOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
               onClick={() => !deleting && setDeleteOpen(false)}>
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
              <h3 className="text-base font-bold text-[#D92D20] mb-2">Excluir empresa definitivamente</h3>
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
                className="border border-[#ccc] rounded-md px-3 py-2 text-sm text-black bg-white focus:border-[#D92D20] focus:outline-none w-full mb-4"
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
                  className="bg-[#D92D20] text-white text-sm font-bold px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed">
                  {deleting ? "Excluindo..." : "Excluir definitivamente"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Ficha única — sem blocos separados, sem cabeçalho azul */}
        <div className="bg-white border border-[#EAECF0] rounded-lg overflow-hidden">

          {/* Header sóbrio: logo + nome + stats inline */}
          <div className="px-6 py-4 flex items-center gap-4 border-b border-[#EAECF0]">
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="relative w-12 h-12 rounded-md bg-[#F6F2EB] flex items-center justify-center text-black text-xl font-semibold overflow-hidden group shrink-0 border border-[#EAECF0]"
              title="Alterar logo"
            >
              {company.logo_url ? (
                <img src={company.logo_url} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                (company.razao_social || "E")[0]
              )}
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Camera size={18} className="text-white" />
                )}
              </div>
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-[22px] font-semibold text-black truncate tracking-tight">{company.razao_social}</h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-[#667085]">
                {company.nome_fantasia && <span className="truncate">{company.nome_fantasia}</span>}
                {company.cnpj && <span>·</span>}
                {company.cnpj && <span>{maskCNPJ(company.cnpj)}</span>}
                <span>·</span>
                <span className={company.is_active ? "text-[#039855] font-semibold" : "text-[#98A2B3] font-semibold"}>
                  {company.is_active ? "Ativa" : "Inativa"}
                </span>
              </div>
            </div>

            {/* Actions inline no header */}
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => navigate(`/dashboard/${id}`)}
                className="flex items-center gap-1.5 bg-[#1D2939] text-white text-xs font-semibold px-3 py-2 rounded-md hover:bg-[#111827] transition-colors">
                <BarChart3 size={14} /> Dashboard
              </button>
              {editing ? (
                <>
                  <button onClick={() => setEditing(false)} disabled={saving}
                    className="flex items-center gap-1.5 bg-white text-[#667085] border border-[#D0D5DD] text-xs font-semibold px-3 py-2 rounded-md hover:bg-[#F6F2EB] transition-colors">
                    <X size={14} /> Cancelar
                  </button>
                  <button onClick={handleSave} disabled={saving}
                    className="flex items-center gap-1.5 bg-[#039855] text-white text-xs font-semibold px-3 py-2 rounded-md hover:bg-[#027A48] transition-colors">
                    <Check size={14} /> {saving ? "Salvando..." : "Salvar"}
                  </button>
                </>
              ) : (
                <>
                  <button onClick={() => setEditing(true)}
                    className="flex items-center gap-1.5 bg-white text-black border border-[#D0D5DD] text-xs font-semibold px-3 py-2 rounded-md hover:bg-[#F6F2EB] transition-colors">
                    <Pencil size={14} /> Editar
                  </button>
                  <button onClick={() => { setDeleteConfirmText(""); setDeleteOpen(true); }}
                    className="flex items-center gap-1.5 bg-white text-[#D92D20] border border-[#FECDCA] text-xs font-semibold px-3 py-2 rounded-md hover:bg-[#FEF3F2] transition-colors"
                    title="Excluir empresa">
                    <Trash2 size={14} /> Excluir
                  </button>
                </>
              )}
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
                className="px-6 py-3 text-left hover:bg-[#F6F2EB] transition-colors">
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
                <span className="text-[15px] font-semibold text-black px-4 py-2 rounded-md border border-[#EAECF0] bg-[#F6F2EB] inline-block">
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
                      <div className="w-9 h-9 rounded-full bg-[#F6F2EB] border border-[#EAECF0] flex items-center justify-center text-black text-[13px] font-semibold shrink-0">
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
