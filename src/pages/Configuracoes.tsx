import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
    AlertTriangle, Trash2, History, Settings, Shield, Plus,
    Pencil, Search, Plug, CheckCircle2, XCircle, Clock,
    Download, Eye, EyeOff, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { useToast } from "@/components/ui/use-toast";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

// ─── Módulos para a matriz de permissões ────────────────────
const MODULOS = [
    { key: "cadastros", label: "Cadastros" },
    { key: "financeiro", label: "Financeiro" },
    { key: "fiscal", label: "Fiscal" },
    { key: "rh", label: "RH & Folha" },
    { key: "analise", label: "Análise & BI" },
    { key: "comunicacao", label: "Comunicação" },
    { key: "documentos", label: "Documentos" },
    { key: "sistema", label: "Sistema" },
];
const ACOES = ["ler", "escrever", "aprovar"] as const;

const INTEGRACOES_INFO: Record<string, { label: string; desc: string }> = {
    resend: { label: "Resend", desc: "Envio de e-mails transacionais" },
    evolution_api: { label: "Evolution API", desc: "WhatsApp Business" },
    sefaz: { label: "SEFAZ", desc: "Notas fiscais eletrônicas" },
    prefeitura_nfse: { label: "Prefeitura NFS-e", desc: "Notas de serviço" },
    focus_nfe: { label: "Focus NF-e", desc: "Emissão de NF-e" },
    enotas: { label: "eNotas", desc: "Gateway de notas fiscais" },
    nuvem_fiscal: { label: "Nuvem Fiscal", desc: "Plataforma fiscal" },
    pluggy: { label: "Pluggy", desc: "Open finance" },
    belvo: { label: "Belvo", desc: "Open finance" },
    asaas: { label: "Asaas", desc: "Cobranças e pagamentos" },
    stripe: { label: "Stripe", desc: "Pagamentos internacionais" },
    d4sign: { label: "D4Sign", desc: "Assinatura digital" },
    clicksign: { label: "Clicksign", desc: "Assinatura eletrônica" },
};

// ─── Componente principal ───────────────────────────────────
export default function Configuracoes() {
    const { activeClient, user, isUsingSecondary } = useAuth();
    const { selectedCompany } = useCompany();
    const queryClient = useQueryClient();
    const { toast: uiToast } = useToast();

    const [locale, setLocale] = useState<string>(() => localStorage.getItem("app.locale") || "pt-BR");
    const [currency, setCurrency] = useState<string>(() => localStorage.getItem("app.currency") || "BRL");

    const dateExample = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "long", year: "numeric" }).format(new Date());
    const moneyExample = new Intl.NumberFormat(locale, { style: "currency", currency }).format(1234.56);

    const handleSavePreferences = () => {
        localStorage.setItem("app.locale", locale);
        localStorage.setItem("app.currency", currency);
        toast.success("Preferências salvas com sucesso!");
        setTimeout(() => window.location.reload(), 1000);
    };

    const handleClearData = async () => {
        const input = prompt('Esta ação apagará TODOS os dados da sua empresa atual. Digite "DELETAR" para confirmar:');
        if (input === "DELETAR") {
            toast.error("Funcionalidade de limpeza total ainda em desenvolvimento para segurança.");
        }
    };

    return (
        <AppLayout title="Configurações">
            <div className="space-y-6 animate-fade-in">
                <div className="flex items-center gap-2">
                    <Settings className="h-8 w-8 text-muted-foreground" />
                    <h2 className="text-lg font-bold tracking-tight text-foreground">Configurações</h2>
                </div>

                <Tabs defaultValue="geral" className="w-full">
                    <TabsList className="flex w-full max-w-2xl mb-6 overflow-x-auto">
                        <TabsTrigger value="geral">Geral</TabsTrigger>
                        <TabsTrigger value="perfis">Perfis de Acesso</TabsTrigger>
                        <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
                        <TabsTrigger value="integracoes">Integrações</TabsTrigger>
                        <TabsTrigger value="perigo" className="text-[#EF4444] data-[state=active]:text-red-700">Zona de Perigo</TabsTrigger>
                    </TabsList>

                    {/* ─── Geral ─── */}
                    <TabsContent value="geral">
                        <Card>
                            <CardHeader>
                                <CardTitle>Preferências Regionais</CardTitle>
                                <CardDescription>Ajuste como datas e valores são exibidos.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label>Idioma & Região</Label>
                                        <Select value={locale} onValueChange={setLocale}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                                                <SelectItem value="en-US">English (United States)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">Exemplo: {dateExample}</p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Moeda Padrão</Label>
                                        <Select value={currency} onValueChange={setCurrency}>
                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="BRL">Real Brasileiro (BRL)</SelectItem>
                                                <SelectItem value="USD">Dólar Americano (USD)</SelectItem>
                                                <SelectItem value="EUR">Euro (EUR)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">Exemplo: {moneyExample}</p>
                                    </div>
                                </div>
                                <div className="flex justify-end pt-4">
                                    <Button onClick={handleSavePreferences} className="bg-green-600 hover:bg-green-700">
                                        Salvar Alterações
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* ─── Perfis de Acesso ─── */}
                    <TabsContent value="perfis">
                        <PerfisDeAcesso />
                    </TabsContent>

                    {/* ─── Auditoria ─── */}
                    <TabsContent value="auditoria">
                        <LogAtividades />
                    </TabsContent>

                    {/* ─── Integrações ─── */}
                    <TabsContent value="integracoes">
                        <IntegracoesPanel />
                    </TabsContent>

                    {/* ─── Zona de Perigo ─── */}
                    <TabsContent value="perigo">
                        <Card className="border-red-200 bg-red-50">
                            <CardHeader>
                                <CardTitle className="text-red-700 flex items-center gap-2">
                                    <AlertTriangle className="h-5 w-5" />
                                    Zona de Perigo
                                </CardTitle>
                                <CardDescription className="text-[#EF4444]">
                                    Ações irreversíveis que afetam seus dados.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between bg-white p-4 rounded-lg border border-red-100">
                                    <div>
                                        <h4 className="font-bold text-foreground">Excluir Dados da Empresa</h4>
                                        <p className="text-sm text-muted-foreground">Remove todos os registros financeiros e cadastros desta empresa.</p>
                                    </div>
                                    <Button variant="destructive" onClick={handleClearData}>
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Excluir Tudo
                                    </Button>
                                </div>
                                <div className="flex items-center justify-between bg-white p-4 rounded-lg border border-red-100 opacity-50 pointer-events-none">
                                    <div>
                                        <h4 className="font-bold text-foreground">Excluir Minha Conta</h4>
                                        <p className="text-sm text-muted-foreground">Encerra o acesso e remove todos os vínculos.</p>
                                    </div>
                                    <Button variant="destructive" disabled>Excluir Conta</Button>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </AppLayout>
    );
}

// ═════════════════════════════════════════════════════════════
// Perfis de Acesso
// ═════════════════════════════════════════════════════════════
function PerfisDeAcesso() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const [editingPerfil, setEditingPerfil] = useState<any>(null);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const { data: perfis, isLoading } = useQuery({
        queryKey: ["perfis_acesso", selectedCompany?.id],
        queryFn: async () => {
            const { data, error } = await activeClient
                .from("perfis_acesso")
                .select("*")
                .or(`company_id.is.null,company_id.eq.${selectedCompany?.id}`)
                .eq("ativo", true)
                .order("sistema", { ascending: false })
                .order("nome");
            if (error) throw error;
            return data;
        },
        enabled: !!selectedCompany?.id,
    });

    const savePerfil = useMutation({
        mutationFn: async (perfil: any) => {
            const payload = {
                company_id: selectedCompany?.id,
                nome: perfil.nome,
                descricao: perfil.descricao || null,
                permissoes: perfil.permissoes,
                pode_exportar: perfil.pode_exportar,
                pode_deletar: perfil.pode_deletar,
                pode_ver_financeiro: perfil.pode_ver_financeiro,
                pode_ver_rh: perfil.pode_ver_rh,
                acesso_todas_empresas: perfil.acesso_todas_empresas,
            };

            if (perfil.id) {
                const { error } = await activeClient
                    .from("perfis_acesso").update(payload).eq("id", perfil.id);
                if (error) throw error;
            } else {
                const { error } = await activeClient
                    .from("perfis_acesso").insert(payload);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["perfis_acesso"] });
            setIsDialogOpen(false);
            setEditingPerfil(null);
            toast.success("Perfil salvo com sucesso!");
        },
        onError: (err: any) => toast.error(err.message),
    });

    const deletePerfil = async (perfil: any) => {
        const ok = await confirm({
            title: `Excluir o perfil "${perfil.nome}"?`,
            description: "Usuários vinculados podem perder permissões. Esta ação não pode ser desfeita.",
            confirmLabel: "Sim, excluir",
            variant: "destructive",
        });
        if (!ok) return;
        const { error } = await activeClient.from("perfis_acesso").delete().eq("id", perfil.id);
        if (error) { toast.error(error.message); return; }
        queryClient.invalidateQueries({ queryKey: ["perfis_acesso"] });
        toast.success("Perfil excluído!");
    };

    const openNew = () => {
        setEditingPerfil({
            nome: "", descricao: "", permissoes: {},
            pode_exportar: false, pode_deletar: false,
            pode_ver_financeiro: true, pode_ver_rh: false,
            acesso_todas_empresas: false,
        });
        setIsDialogOpen(true);
    };

    const openEdit = (p: any) => { setEditingPerfil({ ...p }); setIsDialogOpen(true); };

    return (
        <>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Shield className="h-5 w-5" />
                            Perfis de Acesso
                        </CardTitle>
                        <CardDescription>Gerencie perfis e permissões por módulo.</CardDescription>
                    </div>
                    <Button onClick={openNew} size="sm">
                        <Plus className="h-3.5 w-3.5 mr-1" /> Novo Perfil
                    </Button>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent">
                                <TableHead>Nome</TableHead>
                                <TableHead>Descrição</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead>Permissões</TableHead>
                                <TableHead className="w-[80px] text-right">Ações</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Carregando...</TableCell>
                                </TableRow>
                            ) : perfis?.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">Nenhum perfil encontrado.</TableCell>
                                </TableRow>
                            ) : (
                                perfis?.map((p: any) => {
                                    const modCount = Object.keys(p.permissoes || {}).length;
                                    return (
                                        <TableRow key={p.id}>
                                            <TableCell className="font-semibold text-[12.5px]">{p.nome}</TableCell>
                                            <TableCell className="text-[12px] text-muted-foreground">{p.descricao || "-"}</TableCell>
                                            <TableCell>
                                                <Badge variant={p.sistema ? "secondary" : "outline"} className="text-[10px]">
                                                    {p.sistema ? "Sistema" : "Customizado"}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-[11px] text-muted-foreground">
                                                {modCount} módulo{modCount !== 1 ? "s" : ""}
                                                {p.pode_exportar && " · Exportar"}
                                                {p.pode_deletar && " · Deletar"}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {p.sistema ? (
                                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                                                        <Eye className="h-3.5 w-3.5" />
                                                    </Button>
                                                ) : (
                                                    <div className="flex gap-1 justify-end">
                                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                                                            <Pencil className="h-3.5 w-3.5" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => deletePerfil(p)}>
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Dialog Editor de Perfil */}
            <Dialog open={isDialogOpen} onOpenChange={(o) => { if (!o) { setIsDialogOpen(false); setEditingPerfil(null); } }}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{editingPerfil?.id ? (editingPerfil.sistema ? "Visualizar Perfil" : "Editar Perfil") : "Novo Perfil"}</DialogTitle>
                    </DialogHeader>
                    {editingPerfil && (
                        <PerfilEditor
                            perfil={editingPerfil}
                            onChange={setEditingPerfil}
                            readOnly={editingPerfil.sistema}
                        />
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setIsDialogOpen(false); setEditingPerfil(null); }}>
                            {editingPerfil?.sistema ? "Fechar" : "Cancelar"}
                        </Button>
                        {!editingPerfil?.sistema && (
                            <Button onClick={() => savePerfil.mutate(editingPerfil)} disabled={savePerfil.isPending || !editingPerfil?.nome}>
                                {savePerfil.isPending ? "Salvando..." : "Salvar"}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

function PerfilEditor({ perfil, onChange, readOnly }: { perfil: any; onChange: (p: any) => void; readOnly: boolean }) {
    const perms = perfil.permissoes || {};

    const togglePerm = (modulo: string, acao: string) => {
        if (readOnly) return;
        const current = perms[modulo] || {};
        const newPerms = { ...perms, [modulo]: { ...current, [acao]: !current[acao] } };
        onChange({ ...perfil, permissoes: newPerms });
    };

    const toggleFlag = (flag: string) => {
        if (readOnly) return;
        onChange({ ...perfil, [flag]: !perfil[flag] });
    };

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <Label className="text-[12px]">Nome</Label>
                    <Input value={perfil.nome} disabled={readOnly}
                        onChange={(e) => onChange({ ...perfil, nome: e.target.value })}
                        className="h-8 text-[12.5px]" />
                </div>
                <div className="space-y-1.5">
                    <Label className="text-[12px]">Descrição</Label>
                    <Input value={perfil.descricao || ""} disabled={readOnly}
                        onChange={(e) => onChange({ ...perfil, descricao: e.target.value })}
                        className="h-8 text-[12.5px]" />
                </div>
            </div>

            <div>
                <Label className="text-[12px] font-semibold">Permissões por Módulo</Label>
                <div className="border rounded-lg mt-2 overflow-hidden">
                    <Table>
                        <TableHeader>
                            <TableRow className="hover:bg-transparent">
                                <TableHead className="text-[11px] w-[160px]">Módulo</TableHead>
                                {ACOES.map((a) => (
                                    <TableHead key={a} className="text-[11px] text-center capitalize w-[90px]">{a}</TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {MODULOS.map((m) => (
                                <TableRow key={m.key}>
                                    <TableCell className="text-[12px] font-medium">{m.label}</TableCell>
                                    {ACOES.map((a) => (
                                        <TableCell key={a} className="text-center">
                                            <Checkbox
                                                checked={!!(perms[m.key] && perms[m.key][a])}
                                                onCheckedChange={() => togglePerm(m.key, a)}
                                                disabled={readOnly}
                                            />
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            </div>

            <div>
                <Label className="text-[12px] font-semibold">Permissões Especiais</Label>
                <div className="grid grid-cols-2 gap-3 mt-2">
                    {[
                        { key: "pode_exportar", label: "Pode exportar dados" },
                        { key: "pode_deletar", label: "Pode excluir registros" },
                        { key: "pode_ver_financeiro", label: "Pode ver dados financeiros" },
                        { key: "pode_ver_rh", label: "Pode ver dados de RH" },
                        { key: "acesso_todas_empresas", label: "Acesso a todas as empresas" },
                    ].map((flag) => (
                        <div key={flag.key} className="flex items-center gap-2 p-2 rounded border">
                            <Checkbox checked={!!perfil[flag.key]} onCheckedChange={() => toggleFlag(flag.key)} disabled={readOnly} />
                            <span className="text-[12px]">{flag.label}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ═════════════════════════════════════════════════════════════
// Log de Atividades
// ═════════════════════════════════════════════════════════════
function LogAtividades() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const [searchTerm, setSearchTerm] = useState("");
    const [filterModulo, setFilterModulo] = useState("todos");
    const [filterAcao, setFilterAcao] = useState("todos");
    const [expandedRow, setExpandedRow] = useState<string | null>(null);

    const { data: logs, isLoading } = useQuery({
        queryKey: ["log_atividades", selectedCompany?.id, filterModulo, filterAcao],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            let query = activeClient
                .from("log_atividades")
                .select("*")
                .eq("company_id", selectedCompany.id)
                .order("created_at", { ascending: false })
                .limit(100);

            if (filterModulo !== "todos") query = query.eq("modulo", filterModulo);
            if (filterAcao !== "todos") query = query.eq("acao", filterAcao);

            const { data, error } = await query;
            if (error) {
                // Fallback to audit_logs if log_atividades is empty
                const { data: fallback, error: fbErr } = await activeClient
                    .from("audit_logs")
                    .select("*")
                    .order("created_at", { ascending: false })
                    .limit(100);
                if (fbErr) throw fbErr;
                return (fallback || []).map((l: any) => ({
                    ...l,
                    acao: l.action || "outros",
                    modulo: l.entity || "sistema",
                    usuario_email: l.user_id,
                    entidade_desc: l.payload ? JSON.stringify(l.payload).substring(0, 80) : null,
                }));
            }
            return data || [];
        },
        enabled: !!selectedCompany?.id,
    });

    const normalizeSearch = (v: unknown) =>
        String(v ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    const filteredLogs = useMemo(() => {
        if (!searchTerm) return logs;
        const needle = normalizeSearch(searchTerm);
        return logs?.filter((l: any) =>
            normalizeSearch([l.usuario_email, l.modulo, l.acao, l.entidade_desc, l.entidade_tipo].join(" ")).includes(needle)
        );
    }, [logs, searchTerm]);

    const acaoBadge = (acao: string) => {
        const colors: Record<string, string> = {
            criou: "bg-emerald-100 text-emerald-700",
            editou: "bg-blue-100 text-blue-700",
            deletou: "bg-red-100 text-red-700",
            exportou: "bg-purple-100 text-purple-700",
            importou: "bg-amber-100 text-amber-700",
            aprovou: "bg-green-100 text-green-700",
            rejeitou: "bg-orange-100 text-orange-700",
            login: "bg-gray-100 text-gray-700",
            logout: "bg-gray-100 text-gray-700",
        };
        return (
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${colors[acao] || "bg-gray-100 text-gray-600"}`}>
                {acao}
            </span>
        );
    };

    const handleExportCSV = () => {
        if (!filteredLogs?.length) return;
        const header = "Data,Usuário,Ação,Módulo,Entidade,Descrição\n";
        const rows = filteredLogs.map((l: any) =>
            `"${l.created_at}","${l.usuario_email || ""}","${l.acao}","${l.modulo}","${l.entidade_tipo || ""}","${l.entidade_desc || ""}"`
        ).join("\n");
        const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = `log_atividades_${format(new Date(), "yyyy-MM-dd")}.csv`;
        a.click(); URL.revokeObjectURL(url);
    };

    return (
        <Card>
            <CardHeader>
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <History className="h-5 w-5" />
                            Log de Atividades
                        </CardTitle>
                        <CardDescription>Trilha de auditoria imutável de todas as ações.</CardDescription>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!filteredLogs?.length}>
                        <Download className="h-3.5 w-3.5 mr-1" /> Exportar CSV
                    </Button>
                </div>

                {/* Filters */}
                <div className="flex flex-wrap gap-3 mt-4">
                    <div className="relative w-64">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input placeholder="Buscar..." className="pl-8 h-8 text-[12.5px]"
                            value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                    </div>
                    <Select value={filterModulo} onValueChange={setFilterModulo}>
                        <SelectTrigger className="w-40 h-8 text-[12.5px]"><SelectValue placeholder="Módulo" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="todos">Todos os módulos</SelectItem>
                            {MODULOS.map((m) => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={filterAcao} onValueChange={setFilterAcao}>
                        <SelectTrigger className="w-36 h-8 text-[12.5px]"><SelectValue placeholder="Ação" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="todos">Todas as ações</SelectItem>
                            {["criou", "editou", "deletou", "exportou", "importou", "aprovou", "rejeitou"].map((a) => (
                                <SelectItem key={a} value={a} className="capitalize">{a}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <Table>
                    <TableHeader>
                        <TableRow className="hover:bg-transparent">
                            <TableHead className="text-[11px] w-[140px]">Data/Hora</TableHead>
                            <TableHead className="text-[11px]">Usuário</TableHead>
                            <TableHead className="text-[11px] w-[90px]">Ação</TableHead>
                            <TableHead className="text-[11px]">Módulo</TableHead>
                            <TableHead className="text-[11px]">Registro</TableHead>
                            <TableHead className="w-[40px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Carregando...</TableCell></TableRow>
                        ) : !filteredLogs?.length ? (
                            <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">Nenhum registro encontrado.</TableCell></TableRow>
                        ) : (
                            filteredLogs.map((log: any) => (
                                <>
                                    <TableRow key={log.id} className="group cursor-pointer" onClick={() => setExpandedRow(expandedRow === log.id ? null : log.id)}>
                                        <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
                                            {log.created_at ? format(new Date(log.created_at), "dd/MM HH:mm", { locale: ptBR }) : "-"}
                                        </TableCell>
                                        <TableCell className="text-[12px]">{log.usuario_email || "-"}</TableCell>
                                        <TableCell>{acaoBadge(log.acao)}</TableCell>
                                        <TableCell className="text-[12px] capitalize">{log.modulo}</TableCell>
                                        <TableCell className="text-[11.5px] text-muted-foreground max-w-[200px] truncate">
                                            {log.entidade_desc || log.entidade_tipo || "-"}
                                        </TableCell>
                                        <TableCell>
                                            {(log.dados_antes || log.dados_depois) && (
                                                expandedRow === log.id ?
                                                    <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> :
                                                    <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                                            )}
                                        </TableCell>
                                    </TableRow>
                                    {expandedRow === log.id && (log.dados_antes || log.dados_depois) && (
                                        <TableRow key={`${log.id}-detail`}>
                                            <TableCell colSpan={6} className="bg-muted/30 p-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    {log.dados_antes && (
                                                        <div>
                                                            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Antes</p>
                                                            <pre className="text-[10px] font-mono bg-white p-2 rounded border overflow-x-auto max-h-40">
                                                                {JSON.stringify(log.dados_antes, null, 2)}
                                                            </pre>
                                                        </div>
                                                    )}
                                                    {log.dados_depois && (
                                                        <div>
                                                            <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Depois</p>
                                                            <pre className="text-[10px] font-mono bg-white p-2 rounded border overflow-x-auto max-h-40">
                                                                {JSON.stringify(log.dados_depois, null, 2)}
                                                            </pre>
                                                        </div>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </>
                            ))
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}

// ═════════════════════════════════════════════════════════════
// Integrações
// ═════════════════════════════════════════════════════════════
function IntegracoesPanel() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();

    const { data: integracoes, isLoading } = useQuery({
        queryKey: ["integracoes", selectedCompany?.id],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await activeClient
                .from("integracoes")
                .select("id, nome, status, ultimo_teste, ultimo_erro, ativo, created_at, updated_at")
                .eq("company_id", selectedCompany.id);
            if (error) return []; // RLS might block, return empty
            return data || [];
        },
        enabled: !!selectedCompany?.id,
    });

    const statusIcon = (status: string) => {
        switch (status) {
            case "ativo": return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
            case "erro": return <XCircle className="h-4 w-4 text-red-500" />;
            case "configurando": return <Clock className="h-4 w-4 text-amber-500" />;
            default: return <XCircle className="h-4 w-4 text-gray-400" />;
        }
    };

    const statusLabel = (status: string) => {
        const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
            ativo: { label: "Ativo", variant: "default" },
            inativo: { label: "Inativo", variant: "outline" },
            erro: { label: "Erro", variant: "destructive" },
            configurando: { label: "Configurando", variant: "secondary" },
        };
        const info = map[status] || { label: status, variant: "outline" as const };
        return <Badge variant={info.variant} className="text-[10px]">{info.label}</Badge>;
    };

    // Build list with all known integrations
    const allIntegrations = useMemo(() => {
        const configured = new Map((integracoes || []).map((i: any) => [i.nome, i]));
        return Object.entries(INTEGRACOES_INFO).map(([key, info]) => ({
            key,
            ...info,
            configured: configured.has(key),
            data: configured.get(key),
        }));
    }, [integracoes]);

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Plug className="h-5 w-5" />
                    Integrações
                </CardTitle>
                <CardDescription>Status das integrações configuradas para esta empresa.</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {allIntegrations.map((integ) => (
                        <div key={integ.key}
                            className={`rounded-lg border p-4 transition-colors ${integ.configured ? "bg-white" : "bg-muted/30 opacity-60"}`}>
                            <div className="flex items-start justify-between">
                                <div>
                                    <h4 className="text-[13px] font-semibold">{integ.label}</h4>
                                    <p className="text-[11px] text-muted-foreground mt-0.5">{integ.desc}</p>
                                </div>
                                {integ.configured ? statusIcon(integ.data?.status) : <XCircle className="h-4 w-4 text-gray-300" />}
                            </div>
                            {integ.configured && integ.data && (
                                <div className="mt-3 flex items-center gap-2">
                                    {statusLabel(integ.data.status)}
                                    {integ.data.ultimo_teste && (
                                        <span className="text-[10px] text-muted-foreground">
                                            Teste: {format(new Date(integ.data.ultimo_teste), "dd/MM HH:mm")}
                                        </span>
                                    )}
                                </div>
                            )}
                            {integ.configured && integ.data?.ultimo_erro && (
                                <p className="text-[10px] text-red-500 mt-1 truncate" title={integ.data.ultimo_erro}>
                                    {integ.data.ultimo_erro}
                                </p>
                            )}
                            {!integ.configured && (
                                <p className="text-[10px] text-muted-foreground mt-2">Não configurado</p>
                            )}
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}
