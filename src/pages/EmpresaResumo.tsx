import { useParams, useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { maskCNPJ } from "@/utils/masks";
import { Building2, MapPin, FileText, User, ArrowLeft, BarChart3, Pencil, Users, Wallet, Receipt, UserCheck, Camera, Check, X } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import { toast } from "sonner";

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
  const { activeClient } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const db = activeClient as any;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

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
        <div className="text-center py-20">
          <p className="text-sm font-bold text-[#0a0a0a] mb-4">Empresa não encontrada</p>
          <button onClick={() => navigate("/empresas")} className="text-sm text-[#1a2e4a] font-semibold hover:underline">Voltar para lista</button>
        </div>
      </AppLayout>
    );
  }

  const endereco = [company.endereco_logradouro, company.endereco_numero].filter(Boolean).join(", ");
  const enderecoFull = [endereco, company.endereco_bairro].filter(Boolean).join(" — ");
  const cidadeUf = [company.endereco_cidade, company.endereco_estado].filter(Boolean).join(" / ");

  return (
    <AppLayout title={company.razao_social || "Empresa"}>
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Back + Actions */}
        <div className="flex items-center justify-between">
          <button onClick={() => navigate("/empresas")} className="flex items-center gap-1.5 text-sm text-[#555] hover:text-[#0a0a0a] transition-colors">
            <ArrowLeft size={16} /> Voltar
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => navigate(`/dashboard/${id}`)}
              className="flex items-center gap-1.5 bg-[#1a2e4a] text-white text-xs font-bold px-4 py-2 rounded-md hover:bg-[#253d5e] transition-colors">
              <BarChart3 size={14} /> Dashboard Financeiro
            </button>
            {editing ? (
              <>
                <button onClick={() => setEditing(false)} disabled={saving}
                  className="flex items-center gap-1.5 bg-white text-[#555] border border-[#ccc] text-xs font-bold px-4 py-2 rounded-md hover:bg-[#f5f5f5] transition-colors">
                  <X size={14} /> Cancelar
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex items-center gap-1.5 bg-[#0a5c2e] text-white text-xs font-bold px-4 py-2 rounded-md hover:bg-[#08491f] transition-colors">
                  <Check size={14} /> {saving ? "Salvando..." : "Salvar"}
                </button>
              </>
            ) : (
              <button onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 bg-white text-[#1a2e4a] border border-[#1a2e4a] text-xs font-bold px-4 py-2 rounded-md hover:bg-[#f0f4f8] transition-colors">
                <Pencil size={14} /> Editar
              </button>
            )}
          </div>
        </div>

        {/* Company Header */}
        <div className="border border-[#ccc] rounded-lg overflow-hidden">
          <div className="bg-[#1a2e4a] px-6 py-4 flex items-center gap-4">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="relative w-14 h-14 rounded-lg bg-white/10 flex items-center justify-center text-white text-xl font-bold overflow-hidden group shrink-0"
              title="Alterar logo"
            >
              {company.logo_url ? (
                <img src={company.logo_url} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                (company.razao_social || "E")[0]
              )}
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                {uploading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Camera size={18} className="text-white" />
                )}
              </div>
            </button>
            <div>
              <h1 className="text-lg font-bold text-white">{company.razao_social}</h1>
              {company.nome_fantasia && <p className="text-sm text-[#a8bfd4]">{company.nome_fantasia}</p>}
              <div className="flex items-center gap-3 mt-1">
                {company.cnpj && <span className="text-xs text-[#a8bfd4]">{maskCNPJ(company.cnpj)}</span>}
                <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${company.is_active ? "bg-[#0a5c2e]/20 text-[#86efac]" : "bg-white/10 text-[#a8bfd4]"}`}>
                  {company.is_active ? "Ativa" : "Inativa"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: "Funcionários", value: stats?.employees ?? "—", icon: Users, color: "#1a2e4a", url: "/funcionarios" },
            { label: "Clientes", value: stats?.clients ?? "—", icon: User, color: "#0a5c2e", url: "/clientes" },
            { label: "Contas Bancárias", value: stats?.bankAccounts ?? "—", icon: Wallet, color: "#b8960a", url: "/contas-bancarias" },
            { label: "Plano de Contas", value: stats?.chartAccounts ?? "—", icon: Receipt, color: "#8b0000", url: "/plano-contas" },
          ].map(card => (
            <div key={card.label} onClick={() => navigate(card.url)}
              className="border border-[#ccc] rounded-lg p-4 bg-white cursor-pointer hover:shadow-md transition-all group">
              <div className="flex items-center justify-between mb-2">
                <card.icon size={18} className="text-[#555] group-hover:text-[#0a0a0a] transition-colors" />
                <span className="text-2xl font-bold" style={{ color: card.color }}>{card.value}</span>
              </div>
              <p className={LB}>{card.label}</p>
            </div>
          ))}
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-2 gap-4">

          {/* Dados Cadastrais */}
          <div className="border border-[#ccc] rounded-lg overflow-hidden">
            <div className="bg-[#1a2e4a] px-4 py-2.5 flex items-center gap-2">
              <Building2 size={14} className="text-[#a8bfd4]" />
              <h3 className="text-xs font-bold text-white uppercase tracking-widest">Dados Cadastrais</h3>
            </div>
            <div className="p-5 bg-white space-y-3">
              {editing ? (
                <>
                  <EditRow label="Razão Social" value={form.razao_social} onChange={v => set("razao_social", v)} />
                  <EditRow label="Nome Fantasia" value={form.nome_fantasia} onChange={v => set("nome_fantasia", v)} />
                  <EditRow label="CNPJ" value={form.cnpj} onChange={v => set("cnpj", maskCNPJ(v))} />
                  <EditRow label="Data de Abertura" value={form.data_abertura} onChange={v => set("data_abertura", v)} type="date" />
                  <EditRow label="Inscrição Municipal" value={form.inscricao_municipal} onChange={v => set("inscricao_municipal", v)} />
                  <EditRow label="Inscrição Estadual" value={form.inscricao_estadual} onChange={v => set("inscricao_estadual", v)} />
                </>
              ) : (
                <>
                  <Row label="Razão Social" value={company.razao_social} />
                  <Row label="Nome Fantasia" value={company.nome_fantasia} />
                  <Row label="CNPJ" value={company.cnpj ? maskCNPJ(company.cnpj) : null} />
                  <Row label="Data de Abertura" value={company.data_abertura ? new Date(company.data_abertura + "T12:00:00").toLocaleDateString("pt-BR") : null} />
                  <Row label="Inscrição Municipal" value={company.inscricao_municipal} />
                  <Row label="Inscrição Estadual" value={company.inscricao_estadual} />
                </>
              )}
            </div>
          </div>

          {/* Endereço */}
          <div className="border border-[#ccc] rounded-lg overflow-hidden">
            <div className="bg-[#1a2e4a] px-4 py-2.5 flex items-center gap-2">
              <MapPin size={14} className="text-[#a8bfd4]" />
              <h3 className="text-xs font-bold text-white uppercase tracking-widest">Endereço</h3>
            </div>
            <div className="p-5 bg-white space-y-3">
              {editing ? (
                <>
                  <EditRow label="Logradouro" value={form.endereco_logradouro} onChange={v => set("endereco_logradouro", v)} />
                  <div className="grid grid-cols-2 gap-3">
                    <EditRow label="Número" value={form.endereco_numero} onChange={v => set("endereco_numero", v)} />
                    <EditRow label="Bairro" value={form.endereco_bairro} onChange={v => set("endereco_bairro", v)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <EditRow label="Cidade" value={form.endereco_cidade} onChange={v => set("endereco_cidade", v)} />
                    <EditRow label="UF" value={form.endereco_estado} onChange={v => set("endereco_estado", v)} />
                  </div>
                  <EditRow label="CEP" value={form.endereco_cep} onChange={v => set("endereco_cep", v)} />
                  <EditRow label="Email" value={form.email} onChange={v => set("email", v)} type="email" />
                  <EditRow label="Telefone" value={form.telefone} onChange={v => set("telefone", v)} />
                </>
              ) : (
                <>
                  <Row label="Logradouro" value={enderecoFull || null} />
                  <Row label="Cidade / UF" value={cidadeUf || null} />
                  <Row label="CEP" value={company.endereco_cep} />
                  <Row label="Email" value={company.email} />
                  <Row label="Telefone" value={company.telefone} />
                </>
              )}
            </div>
          </div>

          {/* Regime Tributário */}
          <div className="border border-[#ccc] rounded-lg overflow-hidden">
            <div className="bg-[#1a2e4a] px-4 py-2.5 flex items-center gap-2">
              <FileText size={14} className="text-[#a8bfd4]" />
              <h3 className="text-xs font-bold text-white uppercase tracking-widest">Regime Tributário</h3>
            </div>
            <div className="p-5 bg-white">
              {editing ? (
                <div className="flex flex-wrap gap-2">
                  {regimeOptions.map(r => (
                    <button key={r.id} type="button"
                      onClick={() => set("regime_tributario", r.id)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-md border transition-colors ${
                        form.regime_tributario === r.id
                          ? "border-[#1a2e4a] bg-[#1a2e4a] text-white"
                          : "border-[#ccc] bg-white text-[#555] hover:border-[#1a2e4a] hover:text-[#1a2e4a]"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              ) : company.regime_tributario ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-[#1a2e4a] px-3 py-1.5 rounded-md border border-[#1a2e4a] bg-[#f0f4f8]">
                    {regimeLabels[company.regime_tributario] || company.regime_tributario}
                  </span>
                </div>
              ) : (
                <p className="text-sm text-[#999]">Não configurado</p>
              )}
            </div>
          </div>

          {/* Responsável + Quadro Societário */}
          <div className="border border-[#ccc] rounded-lg overflow-hidden">
            <div className="bg-[#1a2e4a] px-4 py-2.5 flex items-center gap-2">
              <User size={14} className="text-[#a8bfd4]" />
              <h3 className="text-xs font-bold text-white uppercase tracking-widest">Responsável & Quadro Societário</h3>
            </div>
            <div className="p-5 bg-white space-y-4">
              <div className="space-y-3">
                {editing ? (
                  <>
                    <EditRow label="Nome" value={form.responsavel_nome} onChange={v => set("responsavel_nome", v)} />
                    <EditRow label="CPF" value={form.responsavel_cpf} onChange={v => set("responsavel_cpf", v)} />
                    <EditRow label="Email" value={form.responsavel_email} onChange={v => set("responsavel_email", v)} type="email" />
                    <EditRow label="Telefone" value={form.responsavel_telefone} onChange={v => set("responsavel_telefone", v)} />
                  </>
                ) : (
                  <>
                    <Row label="Nome" value={company.responsavel_nome} />
                    <Row label="CPF" value={company.responsavel_cpf} />
                    <Row label="Email" value={company.responsavel_email} />
                    <Row label="Telefone" value={company.responsavel_telefone} />
                  </>
                )}
              </div>

              {/* Quadro Societário */}
              <div className="border-t border-[#eee] pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <UserCheck size={14} className="text-[#1a2e4a]" />
                  <span className={LB}>Quadro Societário (Receita Federal)</span>
                </div>
                {qsaLoading ? (
                  <p className="text-xs text-[#555]">Consultando Receita Federal...</p>
                ) : qsa.length === 0 ? (
                  <p className="text-xs text-[#999]">Nenhum sócio encontrado</p>
                ) : (
                  <div className="space-y-2">
                    {qsa.map((socio, i) => (
                      <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-[#f8f9fa] border border-[#eee]">
                        <div className="w-8 h-8 rounded-full bg-[#1a2e4a] flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                          {(socio.nome_socio || "?")[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[#0a0a0a] truncate">{socio.nome_socio}</p>
                          <p className="text-[11px] text-[#555]">{socio.qualificacao_socio || "Sócio"}</p>
                        </div>
                        {socio.data_entrada_sociedade && (
                          <span className="text-[10px] text-[#555] shrink-0">
                            Desde {new Date(socio.data_entrada_sociedade + "T12:00:00").toLocaleDateString("pt-BR")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b border-[#f0f0f0] last:border-0">
      <span className="text-[10px] font-bold uppercase tracking-wider text-[#555]">{label}</span>
      <span className="text-sm text-[#0a0a0a]">{value || "—"}</span>
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
    <div className="space-y-1">
      <label className="text-[10px] font-bold uppercase tracking-wider text-[#555]">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full h-9 px-3 text-sm border border-[#ccc] rounded-md bg-white focus:border-[#1a2e4a] focus:ring-1 focus:ring-[#1a2e4a]/20 outline-none transition-colors"
      />
    </div>
  );
}
