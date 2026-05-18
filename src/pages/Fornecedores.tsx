import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useSearchParams } from "react-router-dom";
import { maskCNPJ, maskCPF, maskPhone, maskCEP, unmask } from "@/utils/masks";
import { logDeletion } from "@/lib/audit";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { DuplicatesDialog } from "@/components/suppliers/DuplicatesDialog";
import { SupplierHistoryContent } from "@/components/suppliers/SupplierHistoryContent";
import { toTitleCase } from "@/lib/format";
import { toast } from "sonner";
import { Globe } from "lucide-react";

interface Supplier {
    id: string;
    company_id: string;
    razao_social: string;
    nome_fantasia: string | null;
    tipo_pessoa: string | null;
    cpf_cnpj: string | null;
    inscricao_estadual: string | null;
    cnae: string | null;
    cnae_descricao: string | null;
    tipo_atividade: string | null;
    email: string | null;
    telefone: string | null;
    celular: string | null;
    endereco_cep: string | null;
    endereco_logradouro: string | null;
    endereco_numero: string | null;
    endereco_complemento: string | null;
    endereco_bairro: string | null;
    endereco_cidade: string | null;
    endereco_estado: string | null;
    dados_bancarios_banco: string | null;
    dados_bancarios_agencia: string | null;
    dados_bancarios_conta: string | null;
    dados_bancarios_tipo: string | null;
    dados_bancarios_pix: string | null;
    observacoes: string | null;
    tags: string[] | null;
    is_active: boolean;
    [key: string]: any;
}

const initials = (str: string) => {
    if (!str) return "?";
    const parts = str.trim().split(/\s+/).slice(0, 2);
    return parts.map(p => p[0]?.toUpperCase()).join("") || "?";
};

const fmtDoc = (doc: string | null) => {
    if (!doc) return null;
    const d = doc.replace(/\D/g, "");
    if (d.length === 11) return maskCPF(d);
    if (d.length === 14) return maskCNPJ(d);
    return doc;
};

const BANCOS_BR = [
    "Banco do Brasil", "Bradesco", "Caixa Econômica Federal", "Itaú Unibanco",
    "Santander", "Nubank", "Inter", "C6 Bank", "BTG Pactual", "Safra",
    "Sicoob", "Sicredi", "Banrisul", "Original", "PagBank", "Mercado Pago",
    "Neon", "Next", "Picpay", "Stone", "Outro",
];

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];

const emptyForm = {
    razao_social: "",
    nome_fantasia: "",
    tipo_pessoa: "PJ",
    cpf_cnpj: "",
    cnae: "",
    cnae_descricao: "",
    email: "",
    telefone: "",
    celular: "",
    endereco_cep: "",
    endereco_logradouro: "",
    endereco_numero: "",
    endereco_complemento: "",
    endereco_bairro: "",
    endereco_cidade: "",
    endereco_estado: "",
    dados_bancarios_banco: "",
    dados_bancarios_agencia: "",
    dados_bancarios_conta: "",
    dados_bancarios_tipo: "",
    dados_bancarios_pix: "",
    observacoes: "",
    is_active: true,
};

const IC = "border border-[#ccc] rounded-md px-3 py-2 text-sm text-[#1D2939] bg-white focus:border-[#059669] focus:outline-none w-full";
const LB = "text-[10px] font-bold uppercase tracking-wider text-[#1D2939]";
const REQ = <span className="text-[#E53E3E]">*</span>;

export default function Fornecedores() {
    const { activeClient, user, isUsingSecondary } = useAuth();
    const { selectedCompany } = useCompany();
    const queryClient = useQueryClient();
    const confirm = useConfirm();

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [tab, setTab] = useState<"dados" | "historico">("dados");
    const [search, setSearch] = useState("");
    const [isCreating, setIsCreating] = useState(false);
    const [formData, setFormData] = useState(emptyForm);
    const [cnaeOpcoes, setCnaeOpcoes] = useState<Array<{ codigo: string; descricao: string }>>([]);
    const [saving, setSaving] = useState(false);
    const [lookingUp, setLookingUp] = useState(false);
    const [isDupOpen, setIsDupOpen] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();

    const { data: suppliers = [], isLoading } = useQuery({
        queryKey: ["suppliers", selectedCompany?.id, isUsingSecondary],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await (activeClient as any)
                .from("suppliers").select("*").eq("company_id", selectedCompany.id).order("razao_social");
            if (error) throw error;
            return data as Supplier[];
        },
        enabled: !!selectedCompany?.id,
    });

    const selected = suppliers.find(s => s.id === selectedId) || null;

    const filtered = suppliers.filter(s => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        const blob = [
            s.razao_social, s.nome_fantasia, s.cpf_cnpj,
            s.cnae_descricao, s.tipo_atividade, s.email, s.telefone, s.celular,
        ].filter(Boolean).join(" ").toLowerCase();
        return blob.includes(q);
    });

    const set = (k: keyof typeof emptyForm, v: any) => {
        setFormData(f => ({ ...f, [k]: v }));
    };

    const startNew = () => {
        setSelectedId(null);
        setIsCreating(true);
        setFormData(emptyForm);
        setCnaeOpcoes([]);
        setTab("dados");
    };

    const startEdit = (s: Supplier) => {
        setSelectedId(s.id);
        setIsCreating(false);
        setCnaeOpcoes(s.cnae && s.cnae_descricao ? [{ codigo: s.cnae, descricao: s.cnae_descricao }] : []);
        setFormData({
            razao_social: s.razao_social || "",
            nome_fantasia: s.nome_fantasia || "",
            tipo_pessoa: s.tipo_pessoa || "PJ",
            cpf_cnpj: s.cpf_cnpj
                ? (s.cpf_cnpj.length > 11 ? maskCNPJ(s.cpf_cnpj) : maskCPF(s.cpf_cnpj))
                : "",
            cnae: s.cnae || "",
            cnae_descricao: s.cnae_descricao || s.tipo_atividade || "",
            email: s.email || "",
            telefone: s.telefone ? maskPhone(s.telefone) : "",
            celular: s.celular ? maskPhone(s.celular) : "",
            endereco_cep: s.endereco_cep ? maskCEP(s.endereco_cep) : "",
            endereco_logradouro: s.endereco_logradouro || "",
            endereco_numero: s.endereco_numero || "",
            endereco_complemento: s.endereco_complemento || "",
            endereco_bairro: s.endereco_bairro || "",
            endereco_cidade: s.endereco_cidade || "",
            endereco_estado: s.endereco_estado || "",
            dados_bancarios_banco: s.dados_bancarios_banco || "",
            dados_bancarios_agencia: s.dados_bancarios_agencia || "",
            dados_bancarios_conta: s.dados_bancarios_conta || "",
            dados_bancarios_tipo: s.dados_bancarios_tipo || "",
            dados_bancarios_pix: s.dados_bancarios_pix || "",
            observacoes: s.observacoes || "",
            is_active: !!s.is_active,
        });
        setTab("dados");
    };

    useEffect(() => {
        if (searchParams.get("new") === "true") {
            startNew();
            const newParams = new URLSearchParams(searchParams);
            newParams.delete("new");
            setSearchParams(newParams);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    const lookupCNPJ = async () => {
        const doc = unmask(formData.cpf_cnpj || "");
        if (formData.tipo_pessoa !== "PJ" || doc.length !== 14) {
            toast.error("Informe um CNPJ válido.");
            return;
        }
        setLookingUp(true);
        try {
            const resp = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${doc}`);
            if (!resp.ok) {
                toast.error("Não foi possível consultar este CNPJ.");
                return;
            }
            const data = await resp.json();
            const cnaePrincipalCodigo = data?.cnae_fiscal ? String(data.cnae_fiscal) : "";
            const cnaePrincipalDescricao = data?.cnae_fiscal_descricao ? String(data.cnae_fiscal_descricao) : "";
            const secundarias = Array.isArray(data?.cnaes_secundarios) ? data.cnaes_secundarios : [];
            const opcoes = [
                ...(cnaePrincipalCodigo ? [{ codigo: cnaePrincipalCodigo, descricao: cnaePrincipalDescricao }] : []),
                ...secundarias.filter((c: any) => c?.codigo && c?.descricao)
                    .map((c: any) => ({ codigo: String(c.codigo), descricao: String(c.descricao) })),
            ];
            setCnaeOpcoes(opcoes);

            setFormData(f => ({
                ...f,
                razao_social: f.razao_social || data?.razao_social || "",
                nome_fantasia: f.nome_fantasia || data?.nome_fantasia || "",
                email: f.email || data?.email || "",
                telefone: f.telefone || maskPhone(data?.ddd_telefone_1 || data?.telefone || ""),
                endereco_cep: f.endereco_cep || maskCEP(data?.cep || ""),
                endereco_logradouro: f.endereco_logradouro || data?.logradouro || "",
                endereco_numero: f.endereco_numero || data?.numero || "",
                endereco_complemento: f.endereco_complemento || data?.complemento || "",
                endereco_bairro: f.endereco_bairro || data?.bairro || "",
                endereco_cidade: f.endereco_cidade || data?.municipio || "",
                endereco_estado: f.endereco_estado || data?.uf || "",
                cnae: f.cnae || cnaePrincipalCodigo,
                cnae_descricao: f.cnae_descricao || cnaePrincipalDescricao,
            }));
            toast.success("Dados preenchidos a partir do CNPJ.");
        } catch {
            toast.error("Erro ao consultar CNPJ.");
        } finally {
            setLookingUp(false);
        }
    };

    const handleSave = async () => {
        if (!selectedCompany?.id) return;
        if (!formData.razao_social.trim()) {
            toast.error("Razão Social / Nome é obrigatório.");
            return;
        }
        setSaving(true);
        try {
            const payload: Record<string, any> = {
                company_id: selectedCompany.id,
                razao_social: toTitleCase(formData.razao_social),
                nome_fantasia: formData.nome_fantasia ? toTitleCase(formData.nome_fantasia) : null,
                tipo_pessoa: formData.tipo_pessoa,
                cpf_cnpj: unmask(formData.cpf_cnpj) || null,
                cnae: formData.cnae || null,
                cnae_descricao: formData.cnae_descricao || null,
                email: formData.email?.trim().toLowerCase() || null,
                telefone: unmask(formData.telefone) || null,
                celular: unmask(formData.celular) || null,
                endereco_cep: unmask(formData.endereco_cep) || null,
                endereco_logradouro: formData.endereco_logradouro || null,
                endereco_numero: formData.endereco_numero || null,
                endereco_complemento: formData.endereco_complemento || null,
                endereco_bairro: formData.endereco_bairro || null,
                endereco_cidade: formData.endereco_cidade || null,
                endereco_estado: formData.endereco_estado || null,
                dados_bancarios_banco: formData.dados_bancarios_banco || null,
                dados_bancarios_agencia: formData.dados_bancarios_agencia || null,
                dados_bancarios_conta: formData.dados_bancarios_conta || null,
                dados_bancarios_tipo: formData.dados_bancarios_tipo || null,
                dados_bancarios_pix: formData.dados_bancarios_pix || null,
                observacoes: formData.observacoes || null,
                is_active: !!formData.is_active,
            };

            if (isCreating) {
                const { data, error } = await (activeClient as any).from("suppliers").insert(payload).select("id").single();
                if (error) throw error;
                toast.success("Fornecedor cadastrado.");
                setIsCreating(false);
                setSelectedId(data?.id ?? null);
            } else if (selectedId) {
                const { error } = await (activeClient as any).from("suppliers").update(payload).eq("id", selectedId);
                if (error) throw error;
                toast.success("Fornecedor atualizado.");
            }
            queryClient.invalidateQueries({ queryKey: ["suppliers"] });
        } catch (err: any) {
            console.error(err);
            toast.error("Erro: " + (err.message || err.details || "desconhecido"));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (s: Supplier) => {
        const ok = await confirm({
            title: `Excluir o fornecedor "${s.razao_social}"?`,
            description: "Esta ação não pode ser desfeita.",
            confirmLabel: "Sim, excluir",
            variant: "destructive",
        });
        if (!ok) return;
        const { error } = await (activeClient as any).from("suppliers").delete().eq("id", s.id);
        if (!error) {
            if (selectedId === s.id) setSelectedId(null);
            queryClient.invalidateQueries({ queryKey: ["suppliers"] });
            if (user?.id) {
                await logDeletion(activeClient, {
                    userId: user.id,
                    companyId: selectedCompany?.id || null,
                    entity: "suppliers",
                    entityId: s.id,
                    payload: { razao_social: s.razao_social },
                });
            }
        }
    };

    const showDetail = !!selected || isCreating;

    return (
        <AppLayout title="Fornecedores">
            <div className="flex gap-3 h-[calc(100vh-130px)] min-h-[600px]">
                {/* LEFT: List */}
                <div className="w-[340px] shrink-0 border border-[#ccc] rounded-lg overflow-hidden flex flex-col bg-white">
                    <div className="bg-[#1D2939] px-4 py-3 flex items-center justify-between gap-2">
                        <span className="text-[12px] font-bold uppercase tracking-wider text-white">Fornecedores</span>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setIsDupOpen(true)} className="text-[11px] font-bold text-white/90 hover:text-white">Duplicados</button>
                            <button onClick={startNew} className="text-[11px] font-bold text-[#064E3B] bg-[#ECFDF4] hover:bg-white rounded px-2 py-1">+ Novo</button>
                        </div>
                    </div>
                    <div className="p-3 border-b border-[#EAECF0]">
                        <input type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
                            className="w-full border border-[#ccc] rounded-md px-3 py-2 text-sm focus:border-[#059669] focus:outline-none" />
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {isLoading ? (
                            <div className="p-3 space-y-2">
                                {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="p-6 text-center text-sm text-[#555]">
                                {search ? "Nenhum fornecedor encontrado." : "Nenhum fornecedor cadastrado."}
                            </div>
                        ) : (
                            filtered.map(s => {
                                const atividade = s.cnae_descricao || s.tipo_atividade || "Sem atividade";
                                const doc = fmtDoc(s.cpf_cnpj);
                                return (
                                    <div key={s.id} onClick={() => startEdit(s)}
                                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-[#EAECF0] transition-all ${
                                            selectedId === s.id ? "bg-[#ECFDF4] border-l-2 border-l-[#059669]" : "hover:bg-[#F6F2EB]"
                                        }`}>
                                        <div className="w-9 h-9 rounded-full bg-[#059669] flex items-center justify-center text-[#064E3B] text-xs font-bold shrink-0">{initials(s.razao_social)}</div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-[#1D2939] truncate">{s.razao_social}</p>
                                            <p className="text-[11px] text-[#555] truncate" title={atividade}>{atividade}</p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            {doc && <p className="text-[10px] text-[#777] tabular-nums">{doc}</p>}
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                                                s.is_active ? "bg-[#ECFDF3] text-[#039855]" : "bg-[#EAECF0] text-[#555]"
                                            }`}>{s.is_active ? "Ativo" : "Inativo"}</span>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* RIGHT: Detail */}
                <div className="flex-1 border border-[#ccc] rounded-lg overflow-hidden flex flex-col bg-white">
                    {!showDetail ? (
                        <div className="flex-1 flex items-center justify-center text-sm text-[#555]">Selecione um fornecedor ou clique em "+ Novo"</div>
                    ) : (
                        <>
                            <div className="bg-[#059669] px-4 py-2 flex items-center gap-1">
                                {[
                                    { id: "dados" as const, label: "Dados Cadastrais" },
                                    { id: "historico" as const, label: "Histórico de Pagamentos" },
                                ].map(t => (
                                    <button key={t.id} onClick={() => setTab(t.id)} disabled={isCreating && t.id === "historico"}
                                        className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded transition-all ${
                                            tab === t.id ? "bg-white text-[#064E3B]" :
                                            isCreating && t.id === "historico" ? "text-[#064E3B]/40 cursor-not-allowed" :
                                            "text-[#064E3B] hover:bg-white/30"
                                        }`}>{t.label}</button>
                                ))}
                                {selected && <button onClick={() => handleDelete(selected)} className="ml-auto text-[10px] font-bold text-[#991B1B] hover:bg-white/30 rounded px-2 py-1">Excluir</button>}
                            </div>

                            <div className="flex-1 overflow-y-auto p-5">
                                {tab === "dados" && (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-[2fr_1fr] gap-4">
                                            <div className="flex flex-col gap-1">
                                                <label className={LB}>Razão Social / Nome {REQ}</label>
                                                <input value={formData.razao_social} onChange={e => set("razao_social", e.target.value)} className={IC} placeholder="Razão Social ou Nome Completo" />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className={LB}>Tipo Pessoa</label>
                                                <select value={formData.tipo_pessoa} onChange={e => set("tipo_pessoa", e.target.value)} className={IC}>
                                                    <option value="PJ">Pessoa Jurídica</option>
                                                    <option value="PF">Pessoa Física</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-[1fr_2fr] gap-4">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex justify-between items-center">
                                                    <label className={LB}>CPF / CNPJ</label>
                                                    {formData.tipo_pessoa === "PJ" && (
                                                        <button type="button" onClick={lookupCNPJ} disabled={lookingUp}
                                                            className="text-[10px] font-bold text-[#059669] flex items-center gap-1 hover:underline disabled:opacity-50">
                                                            <Globe className="w-3 h-3" /> {lookingUp ? "Buscando..." : "Buscar CNPJ"}
                                                        </button>
                                                    )}
                                                </div>
                                                <input value={formData.cpf_cnpj} onChange={e => set("cpf_cnpj", formData.tipo_pessoa === "PJ" ? maskCNPJ(e.target.value) : maskCPF(e.target.value))} className={IC} placeholder={formData.tipo_pessoa === "PJ" ? "00.000.000/0000-00" : "000.000.000-00"} maxLength={formData.tipo_pessoa === "PJ" ? 18 : 14} />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className={LB}>Nome Fantasia</label>
                                                <input value={formData.nome_fantasia} onChange={e => set("nome_fantasia", e.target.value)} className={IC} placeholder="Nome Fantasia (opcional)" />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-[1fr_3fr] gap-4">
                                            <div className="flex flex-col gap-1">
                                                <label className={LB}>CNAE</label>
                                                {cnaeOpcoes.length > 0 ? (
                                                    <select value={formData.cnae} onChange={e => {
                                                        const code = e.target.value;
                                                        const found = cnaeOpcoes.find(o => o.codigo === code);
                                                        setFormData(f => ({ ...f, cnae: code, cnae_descricao: found?.descricao || f.cnae_descricao }));
                                                    }} className={IC}>
                                                        <option value="">—</option>
                                                        {cnaeOpcoes.map(o => <option key={o.codigo} value={o.codigo}>{o.codigo}</option>)}
                                                    </select>
                                                ) : (
                                                    <input value={formData.cnae} onChange={e => set("cnae", e.target.value)} className={IC} placeholder="0000000" />
                                                )}
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className={LB}>Atividade Principal</label>
                                                <input value={formData.cnae_descricao} onChange={e => set("cnae_descricao", e.target.value)} className={IC} placeholder="Descrição da atividade" />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-4">
                                            <div className="flex flex-col gap-1">
                                                <label className={LB}>E-mail</label>
                                                <input type="email" value={formData.email} onChange={e => set("email", e.target.value)} className={IC} placeholder="email@exemplo.com" />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className={LB}>Telefone</label>
                                                <input value={formData.telefone} onChange={e => set("telefone", maskPhone(e.target.value))} className={IC} placeholder="(00) 0000-0000" maxLength={15} />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className={LB}>Celular / WhatsApp</label>
                                                <input value={formData.celular} onChange={e => set("celular", maskPhone(e.target.value))} className={IC} placeholder="(00) 00000-0000" maxLength={15} />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-[1fr_2fr_1fr] gap-4">
                                            <div className="flex flex-col gap-1">
                                                <label className={LB}>CEP</label>
                                                <input value={formData.endereco_cep} onChange={e => set("endereco_cep", maskCEP(e.target.value))} className={IC} placeholder="00000-000" maxLength={9} />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className={LB}>Endereço</label>
                                                <input value={formData.endereco_logradouro} onChange={e => set("endereco_logradouro", e.target.value)} className={IC} placeholder="Rua / Avenida" />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className={LB}>Número</label>
                                                <input value={formData.endereco_numero} onChange={e => set("endereco_numero", e.target.value)} className={IC} />
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-[1fr_1fr_2fr_1fr] gap-4">
                                            <div className="flex flex-col gap-1">
                                                <label className={LB}>Complemento</label>
                                                <input value={formData.endereco_complemento} onChange={e => set("endereco_complemento", e.target.value)} className={IC} />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className={LB}>Bairro</label>
                                                <input value={formData.endereco_bairro} onChange={e => set("endereco_bairro", e.target.value)} className={IC} />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className={LB}>Cidade</label>
                                                <input value={formData.endereco_cidade} onChange={e => set("endereco_cidade", e.target.value)} className={IC} />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className={LB}>UF</label>
                                                <select value={formData.endereco_estado} onChange={e => set("endereco_estado", e.target.value)} className={IC}>
                                                    <option value="">—</option>
                                                    {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-4 gap-4 pt-2 border-t border-[#EAECF0]">
                                            <div className="flex flex-col gap-1">
                                                <label className={LB}>Banco</label>
                                                <select value={formData.dados_bancarios_banco} onChange={e => set("dados_bancarios_banco", e.target.value)} className={IC}>
                                                    <option value="">—</option>
                                                    {BANCOS_BR.map(b => <option key={b} value={b}>{b}</option>)}
                                                </select>
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className={LB}>Agência</label>
                                                <input value={formData.dados_bancarios_agencia} onChange={e => set("dados_bancarios_agencia", e.target.value.replace(/\D/g, ""))} className={IC} maxLength={6} />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className={LB}>Conta</label>
                                                <input value={formData.dados_bancarios_conta} onChange={e => set("dados_bancarios_conta", e.target.value)} className={IC} />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <label className={LB}>Tipo Conta</label>
                                                <select value={formData.dados_bancarios_tipo} onChange={e => set("dados_bancarios_tipo", e.target.value)} className={IC}>
                                                    <option value="">—</option>
                                                    <option value="corrente">Corrente</option>
                                                    <option value="poupanca">Poupança</option>
                                                    <option value="pix">PIX</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-1">
                                            <label className={LB}>Chave PIX</label>
                                            <input value={formData.dados_bancarios_pix} onChange={e => set("dados_bancarios_pix", e.target.value)} className={IC} placeholder="CPF, CNPJ, email, telefone ou chave aleatória" />
                                        </div>

                                        <div className="flex flex-col gap-1">
                                            <label className={LB}>Observações</label>
                                            <textarea value={formData.observacoes} onChange={e => set("observacoes", e.target.value)} className={IC} rows={2} placeholder="Notas sobre o fornecedor" />
                                        </div>

                                        <div className="flex items-center justify-between pt-2 border-t border-[#EAECF0]">
                                            <div className="flex items-center gap-3">
                                                <label className={LB}>Status</label>
                                                <select value={formData.is_active ? "ativo" : "inativo"} onChange={e => set("is_active", e.target.value === "ativo")} className={`${IC} max-w-[140px]`}>
                                                    <option value="ativo">Ativo</option>
                                                    <option value="inativo">Inativo</option>
                                                </select>
                                            </div>
                                            <button onClick={handleSave} disabled={saving}
                                                className="bg-[#059669] text-white text-sm font-bold px-6 py-2 rounded-md disabled:opacity-40">
                                                {saving ? "Salvando..." : isCreating ? "Cadastrar" : "Salvar Alterações"}
                                            </button>
                                        </div>
                                    </div>
                                )}

                                {tab === "historico" && selected && (
                                    <SupplierHistoryContent supplier={selected} />
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            <DuplicatesDialog
                open={isDupOpen}
                onOpenChange={setIsDupOpen}
                onApplied={() => queryClient.invalidateQueries({ queryKey: ["suppliers"] })}
            />
        </AppLayout>
    );
}
