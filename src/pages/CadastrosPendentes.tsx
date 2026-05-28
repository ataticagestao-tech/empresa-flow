// Pagina /cadastros-pendentes
// Lista todas as solicitacoes de cadastro automatico via WhatsApp,
// com drawer pra revisar, editar e aprovar.

import { useState, useMemo, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageToolbar } from "@/components/layout/PageToolbar";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { ExportMenu } from "@/components/ExportMenu";
import {
    MessageCircle, CheckCircle2, XCircle, Clock, AlertTriangle,
    Loader2, FileImage, FileText, User, Building2,
    ChevronRight, RefreshCw,
} from "lucide-react";

interface Solicitacao {
    id: string;
    company_id: string;
    tipo: "funcionario" | "fornecedor";
    employee_id: string | null;
    supplier_id: string | null;
    nome_destinatario: string;
    telefone: string;
    status: string;
    dados_extraidos: Record<string, any>;
    campos_obrigatorios: string[];
    campos_faltando: string[];
    permite_skip: boolean;
    criado_em: string;
    atualizado_em: string;
    expira_em: string;
    aprovado_em: string | null;
    observacao_admin: string | null;
}

interface Mensagem {
    id: string;
    solicitacao_id: string;
    direcao: "enviada" | "recebida";
    conteudo: string | null;
    media_path: string | null;
    media_mime: string | null;
    media_tipo: string | null;
    criado_em: string;
}

const STATUS_INFO: Record<string, { label: string; cor: string; icone: any }> = {
    aguardando_envio: { label: "Aguardando envio", cor: "bg-slate-100 text-slate-700", icone: Clock },
    enviado:          { label: "Enviado",          cor: "bg-blue-100 text-blue-700",   icone: MessageCircle },
    em_conversa:     { label: "Em conversa",      cor: "bg-amber-100 text-amber-700", icone: MessageCircle },
    pronto_aprovacao: { label: "Pronto p/ aprovar", cor: "bg-emerald-100 text-emerald-700", icone: CheckCircle2 },
    requer_revisao:   { label: "Requer revisão",   cor: "bg-orange-100 text-orange-700", icone: AlertTriangle },
    aprovado:         { label: "Aprovado",         cor: "bg-green-100 text-green-700", icone: CheckCircle2 },
    rejeitado:        { label: "Rejeitado",        cor: "bg-red-100 text-red-700", icone: XCircle },
    expirado:         { label: "Expirado",         cor: "bg-gray-100 text-gray-600", icone: Clock },
};

const formatTel = (t: string) => {
    const d = (t || "").replace(/\D/g, "");
    if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
    if (d.length === 12) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
    return t;
};

const formatDate = (iso: string) => {
    try {
        return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    } catch {
        return iso;
    }
};

const fmtValor = (v: any): string => {
    if (v === null || v === undefined || v === "") return "—";
    if (v === "__pulado__") return "(pulado)";
    if (v === "__falhou__") return "(não consegui validar)";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
};

const CAMPO_LABELS: Record<string, string> = {
    nome_completo: "Nome completo",
    cpf: "CPF",
    cnpj: "CNPJ",
    rg: "RG",
    data_nascimento: "Data nascimento",
    endereco: "Endereço",
    pix: "PIX",
    banco: "Banco",
    email: "Email",
    telefone: "Telefone",
    pis: "PIS",
    razao_social: "Razão social",
    nome_fantasia: "Nome fantasia",
};

export default function CadastrosPendentes() {
    const { selectedCompany } = useCompany();
    const queryClient = useQueryClient();
    const confirm = useConfirm();

    const [searchParams] = useSearchParams();
    const tipoInicial = searchParams.get("tipo");
    const [statusFilter, setStatusFilter] = useState<string>("todos");
    const [tipoFilter, setTipoFilter] = useState<string>(
        tipoInicial === "funcionario" || tipoInicial === "fornecedor" ? tipoInicial : "todos"
    );
    const [search, setSearch] = useState("");
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [editandoDados, setEditandoDados] = useState<Record<string, any>>({});
    const [aprovando, setAprovando] = useState(false);

    useEffect(() => {
        const t = searchParams.get("tipo");
        if (t === "funcionario" || t === "fornecedor") setTipoFilter(t);
    }, [searchParams]);

    // ---- Carrega solicitacoes ----
    const { data: solicitacoes = [], isLoading } = useQuery({
        queryKey: ["cadastros-pendentes", selectedCompany?.id],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await supabase
                .from("cadastro_solicitacoes")
                .select("*")
                .eq("company_id", selectedCompany.id)
                .order("criado_em", { ascending: false });
            if (error) throw error;
            return data as Solicitacao[];
        },
        enabled: !!selectedCompany?.id,
        refetchInterval: 30000, // poll a cada 30s pra pegar novas respostas
    });

    // ---- Filtra ----
    const filtradas = useMemo(() => {
        return solicitacoes.filter((s) => {
            if (statusFilter !== "todos" && s.status !== statusFilter) return false;
            if (tipoFilter !== "todos" && s.tipo !== tipoFilter) return false;
            if (search) {
                const q = search.toLowerCase();
                if (
                    !s.nome_destinatario.toLowerCase().includes(q) &&
                    !s.telefone.includes(q.replace(/\D/g, ""))
                ) return false;
            }
            return true;
        });
    }, [solicitacoes, statusFilter, tipoFilter, search]);

    const selected = solicitacoes.find((s) => s.id === selectedId) || null;

    // ---- Carrega mensagens da selecionada ----
    const { data: mensagens = [] } = useQuery({
        queryKey: ["cadastro-mensagens", selectedId],
        queryFn: async () => {
            if (!selectedId) return [];
            const { data, error } = await supabase
                .from("cadastro_mensagens")
                .select("*")
                .eq("solicitacao_id", selectedId)
                .order("criado_em", { ascending: true });
            if (error) throw error;
            return data as Mensagem[];
        },
        enabled: !!selectedId,
    });

    // ---- Inicializa editandoDados quando troca a selecionada ----
    useMemo(() => {
        if (selected) setEditandoDados({ ...selected.dados_extraidos });
        else setEditandoDados({});
    }, [selectedId]);

    // ---- Contagens pros filtros ----
    const contagens = useMemo(() => {
        const c: Record<string, number> = { todos: solicitacoes.length };
        for (const s of solicitacoes) c[s.status] = (c[s.status] ?? 0) + 1;
        return c;
    }, [solicitacoes]);

    // ---- Aprovar ----
    const handleAprovar = async () => {
        if (!selected) return;
        const isNovo = !selected.employee_id && !selected.supplier_id;

        const confirmou = await confirm({
            title: isNovo ? "Criar novo cadastro?" : "Aplicar dados no cadastro?",
            description: isNovo
                ? `Vai criar um novo ${selected.tipo} com os dados abaixo. Tem certeza?`
                : `Vai atualizar o cadastro existente. Tem certeza?`,
            confirmLabel: "Aprovar",
        });
        if (!confirmou) return;

        setAprovando(true);
        try {
            const { data, error } = await supabase.functions.invoke("cadastro-aprovar", {
                body: {
                    solicitacao_id: selected.id,
                    dados_editados: editandoDados,
                    confirmar_criacao: isNovo,
                    notificar_destinatario: true,
                },
            });
            if (error || (data as any)?.error) {
                toast.error((error as any)?.message || (data as any)?.error || "Falha ao aprovar");
                return;
            }
            toast.success(isNovo ? "Cadastro criado!" : "Cadastro atualizado!");
            queryClient.invalidateQueries({ queryKey: ["cadastros-pendentes"] });
            queryClient.invalidateQueries({ queryKey: ["employees"] });
            queryClient.invalidateQueries({ queryKey: ["suppliers"] });
            setSelectedId(null);
        } catch (e: any) {
            toast.error(e?.message || "Erro inesperado");
        } finally {
            setAprovando(false);
        }
    };

    const handleRejeitar = async () => {
        if (!selected) return;
        const confirmou = await confirm({
            title: "Rejeitar solicitação?",
            description: "Os dados coletados serão descartados. Esta ação não pode ser desfeita.",
            confirmLabel: "Rejeitar",
            variant: "destructive",
        });
        if (!confirmou) return;

        const { error } = await supabase
            .from("cadastro_solicitacoes")
            .update({ status: "rejeitado", observacao_admin: "Rejeitado manualmente" })
            .eq("id", selected.id);

        if (error) {
            toast.error("Falha ao rejeitar: " + error.message);
            return;
        }
        toast.success("Solicitação rejeitada");
        queryClient.invalidateQueries({ queryKey: ["cadastros-pendentes"] });
        setSelectedId(null);
    };

    // ---- Render preview de documento ----
    const renderDocumentoPreview = async (path: string) => {
        const { data } = await supabase.storage.from("documentos").createSignedUrl(path, 300);
        if (data?.signedUrl) window.open(data.signedUrl, "_blank");
    };

    return (
        <AppLayout title="Cadastros Pendentes">
            <div className="flex flex-col h-[calc(100vh-120px)]">
                <PageToolbar title="Cadastros Pendentes" />
                <div className="flex gap-4 flex-1 min-h-0">
                {/* LEFT: lista */}
                <div className="w-[420px] shrink-0 border border-[#ccc] rounded-lg overflow-hidden flex flex-col bg-white">
                    <div className="bg-[#2A2724] px-4 py-2.5 flex items-center justify-between">
                        <h3 className="text-xs font-bold text-white uppercase tracking-widest">
                            Cadastros Pendentes
                        </h3>
                        <div className="flex items-center gap-2">
                            <ExportMenu
                                rows={filtradas}
                                baseName="cadastros-pendentes"
                                titulo="CADASTROS PENDENTES"
                                columns={[
                                    { header: "Nome", value: (s) => s.nome_destinatario, pdfFlex: 24, excelWidth: 30 },
                                    { header: "Telefone", value: (s) => formatTel(s.telefone), pdfFlex: 16, excelWidth: 20 },
                                    { header: "Tipo", value: (s) => (s.tipo === "funcionario" ? "Funcionário" : "Fornecedor"), pdfFlex: 12 },
                                    { header: "Status", value: (s) => STATUS_INFO[s.status]?.label || s.status, pdfFlex: 14 },
                                    { header: "Criado em", value: (s) => formatDate(s.criado_em), align: "center", pdfFlex: 14 },
                                ]}
                            />
                            <button
                                onClick={() => queryClient.invalidateQueries({ queryKey: ["cadastros-pendentes"] })}
                                className="text-xs font-semibold text-white/80 hover:text-white flex items-center gap-1"
                                title="Atualizar"
                            >
                                <RefreshCw className="w-3 h-3" />
                            </button>
                        </div>
                    </div>

                    {/* Filtros */}
                    <div className="p-3 space-y-2 border-b border-[#eee]">
                        <Input
                            placeholder="Buscar por nome ou telefone..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="text-sm"
                        />
                        <div className="flex flex-wrap gap-1.5">
                            {[
                                { v: "todos", l: "Todos" },
                                { v: "pronto_aprovacao", l: "Aprovar" },
                                { v: "em_conversa", l: "Conversando" },
                                { v: "enviado", l: "Aguardando" },
                                { v: "requer_revisao", l: "Revisão" },
                                { v: "aprovado", l: "Aprovados" },
                            ].map((f) => {
                                const ativo = statusFilter === f.v;
                                const n = contagens[f.v] ?? 0;
                                return (
                                    <button
                                        key={f.v}
                                        onClick={() => setStatusFilter(f.v)}
                                        className={`text-[11px] px-2 py-0.5 rounded border font-medium ${
                                            ativo
                                                ? "bg-[#2A2724] text-white border-[#2A2724]"
                                                : "bg-white text-[#555] border-[#ddd] hover:border-[#aaa]"
                                        }`}
                                    >
                                        {f.l} {n > 0 && `(${n})`}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex gap-1.5">
                            {[
                                { v: "todos", l: "Tipo: todos" },
                                { v: "funcionario", l: "Funcionários" },
                                { v: "fornecedor", l: "Fornecedores" },
                            ].map((f) => (
                                <button
                                    key={f.v}
                                    onClick={() => setTipoFilter(f.v)}
                                    className={`text-[11px] px-2 py-0.5 rounded border ${
                                        tipoFilter === f.v
                                            ? "bg-[#2A2724] text-white border-[#2A2724]"
                                            : "bg-white text-[#555] border-[#ddd]"
                                    }`}
                                >
                                    {f.l}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Lista */}
                    <div className="flex-1 overflow-y-auto">
                        {isLoading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <div key={i} className="px-4 py-3 border-b border-[#EAECF0]">
                                    <Skeleton className="h-4 w-3/5 mb-1" />
                                    <Skeleton className="h-3 w-2/5" />
                                </div>
                            ))
                        ) : filtradas.length === 0 ? (
                            <p className="text-center py-8 text-sm text-[#888]">
                                Nenhuma solicitação encontrada
                            </p>
                        ) : (
                            filtradas.map((s) => {
                                const info = STATUS_INFO[s.status] ?? STATUS_INFO.aguardando_envio;
                                const Icon = info.icone;
                                return (
                                    <button
                                        key={s.id}
                                        onClick={() => setSelectedId(s.id)}
                                        className={`w-full text-left px-4 py-3 border-b border-[#EAECF0] hover:bg-[#FAFAFA] flex items-start gap-3 ${
                                            selectedId === s.id ? "bg-[#F0F9FF]" : ""
                                        }`}
                                    >
                                        <div className="mt-1">
                                            {s.tipo === "funcionario" ? (
                                                <User className="w-4 h-4 text-slate-500" />
                                            ) : (
                                                <Building2 className="w-4 h-4 text-slate-500" />
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-sm font-semibold truncate">{s.nome_destinatario}</span>
                                                <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                                            </div>
                                            <div className="text-xs text-[#666] truncate">{formatTel(s.telefone)}</div>
                                            <div className="flex items-center gap-1.5 mt-1">
                                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium inline-flex items-center gap-1 ${info.cor}`}>
                                                    <Icon className="w-2.5 h-2.5" />
                                                    {info.label}
                                                </span>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>

                {/* RIGHT: detalhe */}
                <div className="flex-1 border border-[#ccc] rounded-lg bg-white overflow-hidden flex flex-col">
                    {!selected ? (
                        <div className="flex-1 flex items-center justify-center text-sm text-[#555]">
                            Selecione uma solicitação na lista ao lado
                        </div>
                    ) : (
                        <>
                            {/* Header */}
                            <div className="bg-[#F8F9FA] px-5 py-3 border-b border-[#EAECF0] flex items-center justify-between">
                                <div>
                                    <h3 className="text-base font-bold text-[#1a1a1a]">{selected.nome_destinatario}</h3>
                                    <p className="text-xs text-[#666]">
                                        {selected.tipo === "funcionario" ? "Funcionário" : "Fornecedor"} ·{" "}
                                        {formatTel(selected.telefone)} ·{" "}
                                        criado em {formatDate(selected.criado_em)}
                                    </p>
                                </div>
                                <Badge className={STATUS_INFO[selected.status]?.cor}>
                                    {STATUS_INFO[selected.status]?.label}
                                </Badge>
                            </div>

                            {/* Body */}
                            <div className="flex-1 overflow-y-auto p-5 space-y-5">
                                {/* Dados extraídos */}
                                <section>
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#555] mb-3">
                                        Dados extraídos (editar antes de aprovar)
                                    </h4>
                                    <div className="grid grid-cols-2 gap-3">
                                        {Object.keys(CAMPO_LABELS)
                                            .filter((c) => editandoDados[c] !== undefined)
                                            .map((campo) => (
                                                <div key={campo} className="space-y-1">
                                                    <Label className="text-xs">{CAMPO_LABELS[campo]}</Label>
                                                    <Input
                                                        value={fmtValor(editandoDados[campo])}
                                                        onChange={(e) => setEditandoDados({ ...editandoDados, [campo]: e.target.value })}
                                                        className="text-sm"
                                                        disabled={["aprovado", "rejeitado", "expirado"].includes(selected.status)}
                                                    />
                                                </div>
                                            ))}
                                    </div>
                                    {selected.campos_faltando.length > 0 && (
                                        <p className="text-xs text-orange-600 mt-3">
                                            ⚠ Ainda faltam: {selected.campos_faltando.map((c) => CAMPO_LABELS[c] ?? c).join(", ")}
                                        </p>
                                    )}
                                </section>

                                {/* Documentos */}
                                {mensagens.some((m) => m.media_path) && (
                                    <section>
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-[#555] mb-3">
                                            Documentos enviados
                                        </h4>
                                        <div className="flex flex-wrap gap-2">
                                            {mensagens
                                                .filter((m) => m.media_path)
                                                .map((m) => (
                                                    <button
                                                        key={m.id}
                                                        onClick={() => renderDocumentoPreview(m.media_path!)}
                                                        className="flex items-center gap-2 px-3 py-2 border border-[#ddd] rounded-md text-sm hover:bg-[#F8F9FA]"
                                                    >
                                                        {m.media_tipo === "image" ? <FileImage className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                                                        <span className="text-xs">
                                                            {m.media_tipo} · {formatDate(m.criado_em)}
                                                        </span>
                                                    </button>
                                                ))}
                                        </div>
                                    </section>
                                )}

                                {/* Mensagens */}
                                <section>
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#555] mb-3">
                                        Histórico de mensagens
                                    </h4>
                                    <div className="space-y-2 max-h-64 overflow-y-auto bg-[#FAFAFA] rounded-md p-3 border border-[#eee]">
                                        {mensagens.length === 0 ? (
                                            <p className="text-xs text-[#999]">Nenhuma mensagem ainda</p>
                                        ) : (
                                            mensagens.map((m) => (
                                                <div
                                                    key={m.id}
                                                    className={`text-xs px-3 py-2 rounded-md max-w-[80%] ${
                                                        m.direcao === "enviada"
                                                            ? "bg-emerald-100 text-emerald-900 ml-auto"
                                                            : "bg-white border border-[#eee]"
                                                    }`}
                                                >
                                                    <div className="text-[10px] opacity-60 mb-1">
                                                        {m.direcao === "enviada" ? "→ enviada" : "← recebida"} ·{" "}
                                                        {formatDate(m.criado_em)}
                                                    </div>
                                                    <div className="whitespace-pre-wrap">
                                                        {m.conteudo || (m.media_path ? `[${m.media_tipo}]` : "(vazia)")}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </section>
                            </div>

                            {/* Footer: ações */}
                            {!["aprovado", "rejeitado", "expirado"].includes(selected.status) && (
                                <div className="border-t border-[#EAECF0] bg-[#F8F9FA] px-5 py-3 flex items-center justify-end gap-2">
                                    <Button variant="outline" onClick={handleRejeitar} disabled={aprovando}>
                                        Rejeitar
                                    </Button>
                                    <Button
                                        onClick={handleAprovar}
                                        disabled={aprovando}
                                        className="bg-emerald-600 hover:bg-emerald-700"
                                    >
                                        {aprovando ? (
                                            <>
                                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                Aplicando...
                                            </>
                                        ) : (
                                            <>
                                                <CheckCircle2 className="w-4 h-4 mr-2" />
                                                Aprovar e aplicar
                                            </>
                                        )}
                                    </Button>
                                </div>
                            )}
                        </>
                    )}
                </div>
                </div>
            </div>
        </AppLayout>
    );
}
