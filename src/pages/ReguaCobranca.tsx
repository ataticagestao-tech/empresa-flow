import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import {
    Mail, MessageSquare, Plus, Pencil, Trash2, Send, CheckCircle2,
    XCircle, Clock, Eye, Bell, Settings2, History, Zap, RefreshCw
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const fmt = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const TABS = [
    { id: "canais", label: "Canais", icon: Settings2 },
    { id: "reguas", label: "Réguas", icon: Bell },
    { id: "historico", label: "Histórico", icon: History },
] as const;

type TabId = typeof TABS[number]["id"];

const GATILHO_LABELS: Record<string, string> = {
    antes_vencimento: "Antes do vencimento",
    no_vencimento: "No dia do vencimento",
    apos_vencimento: "Após o vencimento",
};

const CANAL_LABELS: Record<string, string> = {
    email: "E-mail",
    whatsapp: "WhatsApp",
    ambos: "E-mail + WhatsApp",
};

const STATUS_BADGE: Record<string, { label: string; color: string; bg: string }> = {
    enviado: { label: "Enviado", color: "#2e7d32", bg: "#e8f5e9" },
    entregue: { label: "Entregue", color: "#2e7d32", bg: "#e8f5e9" },
    lido: { label: "Lido", color: "#3b5bdb", bg: "#eef2ff" },
    falhou: { label: "Falhou", color: "#c62828", bg: "#fde8e8" },
    pendente: { label: "Pendente", color: "#f57f17", bg: "#fff8e1" },
};

const VARIAVEIS = [
    "{{pagador_nome}}", "{{valor}}", "{{data_vencimento}}",
    "{{dias_restantes}}", "{{dias_atraso}}", "{{empresa_nome}}", "{{empresa_telefone}}"
];

export default function ReguaCobranca() {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<TabId>("canais");
    const db = activeClient as any;
    const companyId = selectedCompany?.id;

    // ── CANAIS ──
    const { data: canais = [] } = useQuery({
        queryKey: ["config_canais", companyId],
        queryFn: async () => {
            const { data } = await db.from("config_canais").select("*").eq("company_id", companyId);
            return data || [];
        },
        enabled: !!companyId,
    });

    const emailConfig = canais.find((c: any) => c.canal === "email");
    const whatsappConfig = canais.find((c: any) => c.canal === "whatsapp");

    const [emailForm, setEmailForm] = useState({ remetente: "", nome: "", api_key: "" });
    const [whatsappForm, setWhatsappForm] = useState({ numero: "", instance: "", api_url: "", api_key: "" });

    const salvarCanal = useMutation({
        mutationFn: async ({ canal, payload }: { canal: string; payload: any }) => {
            const existing = canais.find((c: any) => c.canal === canal);
            if (existing) {
                const { error } = await db.from("config_canais").update(payload).eq("id", existing.id);
                if (error) throw error;
            } else {
                const { error } = await db.from("config_canais").insert({ ...payload, company_id: companyId, canal });
                if (error) throw error;
            }
        },
        onSuccess: () => {
            toast({ title: "Canal salvo!" });
            queryClient.invalidateQueries({ queryKey: ["config_canais"] });
        },
        onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
    });

    const handleSaveEmail = () => {
        salvarCanal.mutate({
            canal: "email",
            payload: {
                email_remetente: emailForm.remetente || emailConfig?.email_remetente,
                email_nome_remetente: emailForm.nome || emailConfig?.email_nome_remetente,
                resend_api_key: emailForm.api_key || emailConfig?.resend_api_key,
                status: "ativo",
            },
        });
    };

    const handleSaveWhatsapp = () => {
        salvarCanal.mutate({
            canal: "whatsapp",
            payload: {
                whatsapp_numero: whatsappForm.numero || whatsappConfig?.whatsapp_numero,
                whatsapp_instance: whatsappForm.instance || whatsappConfig?.whatsapp_instance,
                evolution_api_url: whatsappForm.api_url || whatsappConfig?.evolution_api_url,
                evolution_api_key: whatsappForm.api_key || whatsappConfig?.evolution_api_key,
                status: "ativo",
            },
        });
    };

    // ── RÉGUAS ──
    const { data: reguas = [] } = useQuery({
        queryKey: ["regua_cobranca", companyId],
        queryFn: async () => {
            const { data } = await db.from("regua_cobranca").select("*").eq("company_id", companyId).order("dias_referencia");
            return data || [];
        },
        enabled: !!companyId,
    });

    const [reguaDialog, setReguaDialog] = useState(false);
    const [editRegua, setEditRegua] = useState<any>(null);
    const [reguaForm, setReguaForm] = useState({
        nome: "", gatilho_tipo: "antes_vencimento", dias_referencia: 3,
        canal: "ambos", template: "", ativo: true,
    });

    const openReguaDialog = (regua?: any) => {
        if (regua) {
            setEditRegua(regua);
            setReguaForm({
                nome: regua.nome, gatilho_tipo: regua.gatilho_tipo,
                dias_referencia: regua.dias_referencia, canal: regua.canal,
                template: regua.template, ativo: regua.ativo,
            });
        } else {
            setEditRegua(null);
            setReguaForm({
                nome: "", gatilho_tipo: "antes_vencimento", dias_referencia: 3,
                canal: "ambos",
                template: "Olá, {{pagador_nome}}! Seu título de {{valor}} vence em {{dias_restantes}} dias ({{data_vencimento}}). Entre em contato: {{empresa_telefone}}",
                ativo: true,
            });
        }
        setReguaDialog(true);
    };

    const salvarRegua = useMutation({
        mutationFn: async () => {
            const payload = { ...reguaForm, company_id: companyId };
            if (editRegua) {
                const { error } = await db.from("regua_cobranca").update(payload).eq("id", editRegua.id);
                if (error) throw error;
            } else {
                const { error } = await db.from("regua_cobranca").insert(payload);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            toast({ title: "Régua salva!" });
            setReguaDialog(false);
            queryClient.invalidateQueries({ queryKey: ["regua_cobranca"] });
        },
        onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
    });

    const toggleRegua = useMutation({
        mutationFn: async ({ id, ativo }: { id: string; ativo: boolean }) => {
            const { error } = await db.from("regua_cobranca").update({ ativo }).eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["regua_cobranca"] }),
    });

    const deletarRegua = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await db.from("regua_cobranca").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            toast({ title: "Régua removida" });
            queryClient.invalidateQueries({ queryKey: ["regua_cobranca"] });
        },
    });

    // ── PREVIEW ──
    const [previewDialog, setPreviewDialog] = useState(false);
    const previewRendered = useMemo(() => {
        const vars: Record<string, string> = {
            pagador_nome: "João Silva",
            valor: "R$ 1.500,00",
            data_vencimento: "15/01/2026",
            dias_restantes: "3",
            dias_atraso: "5",
            empresa_nome: selectedCompany?.nome_fantasia || selectedCompany?.razao_social || "Empresa",
            empresa_telefone: "(11) 99999-9999",
        };
        let text = reguaForm.template;
        Object.entries(vars).forEach(([k, v]) => { text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), v); });
        return text;
    }, [reguaForm.template, selectedCompany]);

    // ── HISTÓRICO ──
    const { data: historico = [] } = useQuery({
        queryKey: ["regua_cobranca_log", companyId],
        queryFn: async () => {
            const { data } = await db
                .from("regua_cobranca_log")
                .select("*, regua:regua_cobranca(nome)")
                .order("enviado_em", { ascending: false })
                .limit(100);
            return data || [];
        },
        enabled: !!companyId && activeTab === "historico",
    });

    const { data: alertasLog = [] } = useQuery({
        queryKey: ["alertas_log", companyId],
        queryFn: async () => {
            const { data } = await db
                .from("alertas_log")
                .select("*")
                .eq("company_id", companyId)
                .order("enviado_em", { ascending: false })
                .limit(100);
            return data || [];
        },
        enabled: !!companyId && activeTab === "historico",
    });

    const allLogs = useMemo(() => {
        const logs = [
            ...historico.map((h: any) => ({
                id: h.id, tipo: "regua", nome: h.regua?.nome || "—",
                canal: h.canal, destinatario: h.destinatario,
                status: h.status_envio, erro: h.erro_descricao,
                data: h.enviado_em,
            })),
            ...alertasLog.map((a: any) => ({
                id: a.id, tipo: "alerta", nome: a.evento || "—",
                canal: a.canal, destinatario: a.destinatario,
                status: a.status, erro: a.erro_descricao,
                data: a.enviado_em,
            })),
        ].sort((a, b) => (b.data || "").localeCompare(a.data || ""));
        return logs;
    }, [historico, alertasLog]);

    // ── RENDER ──
    return (
        <AppLayout title="Régua de Cobrança">
            <div style={{ fontFamily: "var(--font-base)", display: "flex", flexDirection: "column", gap: 20 }}>
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Régua de Cobrança</h2>
                        <p style={{ fontSize: 13, color: "#94a3b8" }}>Configure canais, réguas automáticas e acompanhe disparos</p>
                    </div>
                </div>

                {/* Tabs */}
                <div style={{ display: "flex", gap: 4, borderBottom: "1px solid #e2e8f0", paddingBottom: 0 }}>
                    {TABS.map(tab => (
                        <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                            style={{
                                display: "flex", alignItems: "center", gap: 6, padding: "10px 16px",
                                fontSize: 13, fontWeight: 600, border: "none", background: "none", cursor: "pointer",
                                color: activeTab === tab.id ? "#3b5bdb" : "#94a3b8",
                                borderBottom: activeTab === tab.id ? "2px solid #3b5bdb" : "2px solid transparent",
                                marginBottom: -1,
                            }}>
                            <tab.icon size={16} />{tab.label}
                        </button>
                    ))}
                </div>

                {/* Tab: Canais */}
                {activeTab === "canais" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                        {/* Email */}
                        <Card style={{ padding: 24, borderRadius: 14, border: "1px solid #e2e8f0" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                                <div style={{ background: "#eef2ff", borderRadius: 10, padding: 8 }}><Mail size={20} color="#3b5bdb" /></div>
                                <div>
                                    <p style={{ fontWeight: 700, fontSize: 14 }}>E-mail (Resend)</p>
                                    {emailConfig && (
                                        <Badge style={{ background: emailConfig.status === "ativo" ? "#e8f5e9" : "#fde8e8", color: emailConfig.status === "ativo" ? "#2e7d32" : "#c62828", fontSize: 10 }}>
                                            {emailConfig.status === "ativo" ? "Ativo" : "Inativo"}
                                        </Badge>
                                    )}
                                </div>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                <div>
                                    <Label style={{ fontSize: 12 }}>API Key (Resend)</Label>
                                    <Input type="password" placeholder="re_xxxxxxxxxxxx"
                                        defaultValue={emailConfig?.resend_api_key || ""}
                                        onChange={e => setEmailForm(f => ({ ...f, api_key: e.target.value }))} />
                                </div>
                                <div>
                                    <Label style={{ fontSize: 12 }}>E-mail Remetente</Label>
                                    <Input placeholder="financeiro@suaempresa.com"
                                        defaultValue={emailConfig?.email_remetente || ""}
                                        onChange={e => setEmailForm(f => ({ ...f, remetente: e.target.value }))} />
                                </div>
                                <div>
                                    <Label style={{ fontSize: 12 }}>Nome do Remetente</Label>
                                    <Input placeholder="Financeiro - Clínica ABC"
                                        defaultValue={emailConfig?.email_nome_remetente || ""}
                                        onChange={e => setEmailForm(f => ({ ...f, nome: e.target.value }))} />
                                </div>
                                <Button onClick={handleSaveEmail} disabled={salvarCanal.isPending} className="w-full">
                                    Salvar Configuração E-mail
                                </Button>
                            </div>
                        </Card>

                        {/* WhatsApp */}
                        <Card style={{ padding: 24, borderRadius: 14, border: "1px solid #e2e8f0" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                                <div style={{ background: "#e8f5e9", borderRadius: 10, padding: 8 }}><MessageSquare size={20} color="#2e7d32" /></div>
                                <div>
                                    <p style={{ fontWeight: 700, fontSize: 14 }}>WhatsApp (Evolution API)</p>
                                    {whatsappConfig && (
                                        <Badge style={{ background: whatsappConfig.status === "ativo" ? "#e8f5e9" : "#fde8e8", color: whatsappConfig.status === "ativo" ? "#2e7d32" : "#c62828", fontSize: 10 }}>
                                            {whatsappConfig.status === "ativo" ? "Ativo" : "Inativo"}
                                        </Badge>
                                    )}
                                </div>
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                <div>
                                    <Label style={{ fontSize: 12 }}>API URL (Evolution)</Label>
                                    <Input placeholder="https://evo.suaempresa.com"
                                        defaultValue={whatsappConfig?.evolution_api_url || ""}
                                        onChange={e => setWhatsappForm(f => ({ ...f, api_url: e.target.value }))} />
                                </div>
                                <div>
                                    <Label style={{ fontSize: 12 }}>API Key</Label>
                                    <Input type="password" placeholder="xxxxxxxx"
                                        defaultValue={whatsappConfig?.evolution_api_key || ""}
                                        onChange={e => setWhatsappForm(f => ({ ...f, api_key: e.target.value }))} />
                                </div>
                                <div>
                                    <Label style={{ fontSize: 12 }}>Nome da Instância</Label>
                                    <Input placeholder="clinica-abc"
                                        defaultValue={whatsappConfig?.whatsapp_instance || ""}
                                        onChange={e => setWhatsappForm(f => ({ ...f, instance: e.target.value }))} />
                                </div>
                                <div>
                                    <Label style={{ fontSize: 12 }}>Número WhatsApp</Label>
                                    <Input placeholder="+55 11 99999-9999"
                                        defaultValue={whatsappConfig?.whatsapp_numero || ""}
                                        onChange={e => setWhatsappForm(f => ({ ...f, numero: e.target.value }))} />
                                </div>
                                <Button onClick={handleSaveWhatsapp} disabled={salvarCanal.isPending} className="w-full"
                                    style={{ background: "#2e7d32" }}>
                                    Salvar Configuração WhatsApp
                                </Button>
                            </div>
                        </Card>
                    </div>
                )}

                {/* Tab: Réguas */}
                {activeTab === "reguas" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <Button onClick={() => openReguaDialog()} size="sm">
                                <Plus className="h-4 w-4 mr-1" /> Nova Régua
                            </Button>
                        </div>

                        {reguas.length === 0 ? (
                            <Card style={{ padding: 40, borderRadius: 14, border: "1px solid #e2e8f0", textAlign: "center" }}>
                                <Bell size={40} color="#94a3b8" style={{ margin: "0 auto 12px" }} />
                                <p style={{ fontSize: 14, color: "#94a3b8" }}>Nenhuma régua configurada. Crie sua primeira régua de cobrança.</p>
                            </Card>
                        ) : reguas.map((regua: any) => (
                            <Card key={regua.id} style={{ padding: 20, borderRadius: 14, border: "1px solid #e2e8f0" }}>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                        <div style={{ background: regua.ativo ? "#eef2ff" : "#f1f5f9", borderRadius: 10, padding: 10 }}>
                                            <Zap size={20} color={regua.ativo ? "#3b5bdb" : "#94a3b8"} />
                                        </div>
                                        <div>
                                            <p style={{ fontWeight: 700, fontSize: 14, color: regua.ativo ? "#0f172a" : "#94a3b8" }}>{regua.nome}</p>
                                            <p style={{ fontSize: 12, color: "#94a3b8" }}>
                                                {GATILHO_LABELS[regua.gatilho_tipo] || regua.gatilho_tipo}
                                                {regua.dias_referencia > 0 && ` — ${regua.dias_referencia} dias`}
                                                {" · "}{CANAL_LABELS[regua.canal] || regua.canal}
                                            </p>
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <Switch checked={regua.ativo} onCheckedChange={v => toggleRegua.mutate({ id: regua.id, ativo: v })} />
                                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openReguaDialog(regua)}>
                                            <Pencil className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => deletarRegua.mutate(regua.id)}>
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </Card>
                        ))}
                    </div>
                )}

                {/* Tab: Histórico */}
                {activeTab === "historico" && (
                    <Card style={{ borderRadius: 14, border: "1px solid #e2e8f0", overflow: "hidden" }}>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Data</TableHead>
                                    <TableHead>Régua/Evento</TableHead>
                                    <TableHead>Canal</TableHead>
                                    <TableHead>Destinatário</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {allLogs.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                            Nenhum disparo registrado ainda.
                                        </TableCell>
                                    </TableRow>
                                ) : allLogs.map((log: any) => {
                                    const st = STATUS_BADGE[log.status] || STATUS_BADGE.pendente;
                                    return (
                                        <TableRow key={log.id}>
                                            <TableCell style={{ fontSize: 12 }}>
                                                {log.data ? format(parseISO(log.data), "dd/MM/yy HH:mm", { locale: ptBR }) : "—"}
                                            </TableCell>
                                            <TableCell style={{ fontSize: 13, fontWeight: 500 }}>{log.nome}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline" style={{ fontSize: 11 }}>
                                                    {log.canal === "email" ? "E-mail" : log.canal === "whatsapp" ? "WhatsApp" : log.canal}
                                                </Badge>
                                            </TableCell>
                                            <TableCell style={{ fontSize: 12, color: "#475569" }}>{log.destinatario || "—"}</TableCell>
                                            <TableCell>
                                                <span style={{ fontSize: 11, fontWeight: 600, color: st.color, background: st.bg, padding: "2px 8px", borderRadius: 6 }}>
                                                    {st.label}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </Card>
                )}

                {/* Dialog: Criar/Editar Régua */}
                <Dialog open={reguaDialog} onOpenChange={setReguaDialog}>
                    <DialogContent className="max-w-lg">
                        <DialogHeader>
                            <DialogTitle>{editRegua ? "Editar Régua" : "Nova Régua de Cobrança"}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            <div className="space-y-2">
                                <Label>Nome</Label>
                                <Input value={reguaForm.nome} onChange={e => setReguaForm(f => ({ ...f, nome: e.target.value }))}
                                    placeholder="Ex: Lembrete 3 dias antes" />
                            </div>

                            <div className="space-y-2">
                                <Label>Quando disparar</Label>
                                <select className="w-full border rounded-md p-2 text-sm" value={reguaForm.gatilho_tipo}
                                    onChange={e => setReguaForm(f => ({ ...f, gatilho_tipo: e.target.value }))}>
                                    <option value="antes_vencimento">X dias ANTES do vencimento</option>
                                    <option value="no_vencimento">No dia do vencimento</option>
                                    <option value="apos_vencimento">X dias APÓS o vencimento</option>
                                </select>
                            </div>

                            {reguaForm.gatilho_tipo !== "no_vencimento" && (
                                <div className="space-y-2">
                                    <Label>Dias de referência</Label>
                                    <Input type="number" min={1} value={reguaForm.dias_referencia}
                                        onChange={e => setReguaForm(f => ({ ...f, dias_referencia: parseInt(e.target.value) || 0 }))} />
                                </div>
                            )}

                            <div className="space-y-2">
                                <Label>Canal</Label>
                                <select className="w-full border rounded-md p-2 text-sm" value={reguaForm.canal}
                                    onChange={e => setReguaForm(f => ({ ...f, canal: e.target.value }))}>
                                    <option value="email">Apenas E-mail</option>
                                    <option value="whatsapp">Apenas WhatsApp</option>
                                    <option value="ambos">E-mail + WhatsApp</option>
                                </select>
                            </div>

                            <div className="space-y-2">
                                <Label>Mensagem</Label>
                                <Textarea rows={5} value={reguaForm.template}
                                    onChange={e => setReguaForm(f => ({ ...f, template: e.target.value }))}
                                    placeholder="Olá, {{pagador_nome}}! Seu título de {{valor}} vence em..." />
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                                    {VARIAVEIS.map(v => (
                                        <button key={v} onClick={() => setReguaForm(f => ({ ...f, template: f.template + " " + v }))}
                                            style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, border: "1px solid #e2e8f0", background: "#f8f9fb", cursor: "pointer", color: "#3b5bdb" }}>
                                            {v}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: "flex", gap: 8 }}>
                                <Button variant="outline" className="flex-1" onClick={() => setPreviewDialog(true)}>
                                    <Eye className="h-4 w-4 mr-1" /> Preview
                                </Button>
                                <Button className="flex-1" onClick={() => salvarRegua.mutate()} disabled={!reguaForm.nome || !reguaForm.template}>
                                    Salvar Régua
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Dialog: Preview */}
                <Dialog open={previewDialog} onOpenChange={setPreviewDialog}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>Preview da Mensagem</DialogTitle>
                        </DialogHeader>
                        <div style={{ background: "#f8f9fb", borderRadius: 10, padding: 16, fontSize: 14, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                            {previewRendered}
                        </div>
                        <p style={{ fontSize: 11, color: "#94a3b8", textAlign: "center" }}>
                            Dados fictícios usados para preview
                        </p>
                    </DialogContent>
                </Dialog>
            </div>
        </AppLayout>
    );
}
