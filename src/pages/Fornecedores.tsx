import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useSearchParams } from "react-router-dom";
import { maskCNPJ, maskCPF, maskPhone } from "@/utils/masks";
import { logDeletion } from "@/lib/audit";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { SupplierSheet } from "@/components/suppliers/SupplierSheet";
import { DuplicatesDialog } from "@/components/suppliers/DuplicatesDialog";
import { SupplierHistoryContent } from "@/components/suppliers/SupplierHistoryContent";

interface Supplier {
    id: string;
    company_id: string;
    razao_social: string;
    nome_fantasia: string | null;
    tipo_pessoa: string | null;
    cpf_cnpj: string | null;
    inscricao_estadual: string | null;
    inscricao_municipal: string | null;
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
    contato_nome: string | null;
    website: string | null;
    optante_simples: boolean | null;
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

const fmtCEP = (v: string | null) => {
    if (!v) return null;
    const d = v.replace(/\D/g, "");
    if (d.length !== 8) return v;
    return `${d.slice(0, 5)}-${d.slice(5)}`;
};

export default function Fornecedores() {
    const { activeClient, user, isUsingSecondary } = useAuth();
    const { selectedCompany } = useCompany();
    const confirm = useConfirm();

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [tab, setTab] = useState<"dados" | "historico">("dados");
    const [search, setSearch] = useState("");
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
    const [isDupOpen, setIsDupOpen] = useState(false);
    const [searchParams, setSearchParams] = useSearchParams();

    const { data: suppliers = [], isLoading, refetch } = useQuery({
        queryKey: ["suppliers", selectedCompany?.id, isUsingSecondary],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await (activeClient as any)
                .from("suppliers")
                .select("*")
                .eq("company_id", selectedCompany.id)
                .order("razao_social");
            if (error) throw error;
            return data as Supplier[];
        },
        enabled: !!selectedCompany?.id,
    });

    useEffect(() => {
        if (searchParams.get("new") === "true") {
            startNew();
            const newParams = new URLSearchParams(searchParams);
            newParams.delete("new");
            setSearchParams(newParams);
        }
    }, [searchParams, setSearchParams]);

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

    const startNew = () => {
        setSelectedId(null);
        setEditingSupplier(null);
        setIsSheetOpen(true);
    };

    const startEdit = (s: Supplier) => {
        setEditingSupplier(s);
        setIsSheetOpen(true);
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
            refetch();
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

    const showDetail = !!selected;

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
                        <input
                            type="text"
                            placeholder="Buscar..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full border border-[#ccc] rounded-md px-3 py-2 text-sm focus:border-[#059669] focus:outline-none"
                        />
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
                                    <div key={s.id} onClick={() => { setSelectedId(s.id); setTab("dados"); }}
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
                                {[{ id: "dados" as const, label: "Dados Cadastrais" }, { id: "historico" as const, label: "Histórico de Pagamentos" }].map(t => (
                                    <button key={t.id} onClick={() => setTab(t.id)}
                                        className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded transition-all ${
                                            tab === t.id ? "bg-white text-[#064E3B]" : "text-[#064E3B] hover:bg-white/30"
                                        }`}>{t.label}</button>
                                ))}
                                <button onClick={() => startEdit(selected!)} className="ml-auto text-[10px] font-bold text-white border border-white/40 hover:bg-white/20 rounded px-2 py-1">Editar</button>
                                <button onClick={() => handleDelete(selected!)} className="text-[10px] font-bold text-[#991B1B] hover:bg-white/30 rounded px-2 py-1">Excluir</button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-5">
                                {tab === "dados" && (
                                    <SupplierDetailView supplier={selected!} />
                                )}
                                {tab === "historico" && (
                                    <SupplierHistoryContent supplier={selected!} />
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>

            <SupplierSheet
                isOpen={isSheetOpen}
                onClose={() => {
                    setIsSheetOpen(false);
                    setEditingSupplier(null);
                    refetch();
                }}
                supplierToEdit={editingSupplier}
            />

            <DuplicatesDialog
                open={isDupOpen}
                onOpenChange={setIsDupOpen}
                onApplied={() => refetch()}
            />
        </AppLayout>
    );
}

const LBL = "text-[10px] font-bold uppercase tracking-wider text-[#555]";
const VAL = "text-sm text-[#1D2939]";

function SupplierDetailView({ supplier: s }: { supplier: Supplier }) {
    const doc = fmtDoc(s.cpf_cnpj);
    const tel = s.telefone ? maskPhone(s.telefone) : null;
    const cel = s.celular ? maskPhone(s.celular) : null;
    const cep = fmtCEP(s.endereco_cep);
    const endParts = [
        s.endereco_logradouro && s.endereco_numero ? `${s.endereco_logradouro}, ${s.endereco_numero}` : s.endereco_logradouro,
        s.endereco_complemento,
        s.endereco_bairro,
        s.endereco_cidade && s.endereco_estado ? `${s.endereco_cidade} - ${s.endereco_estado}` : s.endereco_cidade,
        cep,
    ].filter(Boolean);

    const Field = ({ label, value }: { label: string; value: any }) => (
        <div className="flex flex-col gap-1 min-w-0">
            <span className={LBL}>{label}</span>
            <span className={`${VAL} truncate`} title={value || ""}>{value || "—"}</span>
        </div>
    );

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-base font-bold text-[#1D2939]">{s.razao_social}</h3>
                <p className="text-xs text-[#555] mt-0.5">
                    {[s.nome_fantasia, s.tipo_pessoa === "PF" ? "Pessoa Física" : "Pessoa Jurídica", s.is_active ? "Ativo" : "Inativo"].filter(Boolean).join(" · ")}
                </p>
            </div>

            <Section title="Identificação">
                <div className="grid grid-cols-3 gap-4">
                    <Field label="CPF/CNPJ" value={doc} />
                    <Field label="Insc. Estadual" value={s.inscricao_estadual} />
                    <Field label="Insc. Municipal" value={s.inscricao_municipal} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <Field label="CNAE" value={s.cnae} />
                    <Field label="Atividade Principal" value={s.cnae_descricao || s.tipo_atividade} />
                </div>
            </Section>

            <Section title="Contato">
                <div className="grid grid-cols-3 gap-4">
                    <Field label="Contato" value={s.contato_nome} />
                    <Field label="E-mail" value={s.email} />
                    <Field label="Website" value={s.website} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Telefone" value={tel} />
                    <Field label="Celular" value={cel} />
                </div>
            </Section>

            {endParts.length > 0 && (
                <Section title="Endereço">
                    <p className="text-sm text-[#1D2939]">{endParts.join(", ")}</p>
                </Section>
            )}

            {(s.dados_bancarios_banco || s.dados_bancarios_pix) && (
                <Section title="Dados Bancários">
                    <div className="grid grid-cols-3 gap-4">
                        <Field label="Banco" value={s.dados_bancarios_banco} />
                        <Field label="Agência" value={s.dados_bancarios_agencia} />
                        <Field label="Conta" value={s.dados_bancarios_conta} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Field label="Tipo Conta" value={s.dados_bancarios_tipo} />
                        <Field label="Chave PIX" value={s.dados_bancarios_pix} />
                    </div>
                </Section>
            )}

            {s.tags && s.tags.length > 0 && (
                <Section title="Tags">
                    <div className="flex flex-wrap gap-1.5">
                        {s.tags.map((t, i) => (
                            <span key={i} className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#F6F2EB] text-[#555]">{t}</span>
                        ))}
                    </div>
                </Section>
            )}

            {s.observacoes && (
                <Section title="Observações">
                    <p className="text-sm text-[#1D2939] whitespace-pre-wrap">{s.observacoes}</p>
                </Section>
            )}
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2">
                <h4 className={LBL}>{title}</h4>
                <div className="flex-1 h-px bg-[#EAECF0]" />
            </div>
            <div className="space-y-3">{children}</div>
        </div>
    );
}
