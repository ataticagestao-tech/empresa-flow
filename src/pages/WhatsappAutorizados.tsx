import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePanel } from "@/components/layout/PagePanel";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, MessageCircle, Trash2, RefreshCw, ShieldCheck, ShieldAlert, Clock } from "lucide-react";

interface AcessoRow {
  id: string;
  phone: string;
  nome: string;
  company_id: string;
  permissoes: { consultar?: boolean; lancar_cp?: boolean; baixar_cp?: boolean };
  status: "pendente" | "verificado" | "bloqueado" | "revogado";
  verified_at: string | null;
  created_at: string;
}

function normalizarFone(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("0")) d = d.slice(1);
  if (!d.startsWith("55") && (d.length === 10 || d.length === 11)) d = "55" + d;
  // Remove o 9 do celular brasileiro: 13 dígitos com 9 na 5ª posição → 12 dígitos.
  // O WhatsApp Web BR envia mensagens sem esse 9, então normalizamos pra esse formato.
  if (d.length === 13 && d[4] === "9") {
    d = d.slice(0, 4) + d.slice(5);
  }
  return d;
}

function formatarFone(raw: string): string {
  if (!raw || raw.length < 12) return raw;
  const ddi = raw.slice(0, 2);
  const ddd = raw.slice(2, 4);
  const rest = raw.slice(4);
  if (rest.length === 9) return `+${ddi} ${ddd} ${rest.slice(0, 5)}-${rest.slice(5)}`;
  return `+${ddi} ${ddd} ${rest.slice(0, 4)}-${rest.slice(4)}`;
}

const STATUS_COLORS: Record<string, string> = {
  verificado: "bg-emerald-50 text-emerald-700 border-emerald-200",
  pendente: "bg-amber-50 text-amber-700 border-amber-200",
  bloqueado: "bg-red-50 text-red-700 border-red-200",
  revogado: "bg-gray-100 text-gray-600 border-gray-200",
};

export default function WhatsappAutorizados() {
  const { activeClient, session } = useAuth();
  const { selectedCompany } = useCompany();
  const [acessos, setAcessos] = useState<AcessoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [salvando, setSalvando] = useState(false);

  // Form
  const [novoNome, setNovoNome] = useState("");
  const [novoFone, setNovoFone] = useState("");
  const [permConsultar, setPermConsultar] = useState(true);
  const [permLancarCp, setPermLancarCp] = useState(false);
  const [permBaixarCp, setPermBaixarCp] = useState(false);

  const carregar = async () => {
    if (!activeClient || !selectedCompany) return;
    setLoading(true);
    const { data, error } = await activeClient
      .from("whatsapp_acesso")
      .select("id, phone, nome, company_id, permissoes, status, verified_at, created_at")
      .eq("company_id", selectedCompany.id)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar: " + error.message);
    } else {
      setAcessos((data || []) as AcessoRow[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    carregar();
    // eslint-disable-next-line
  }, [selectedCompany?.id]);

  const limparForm = () => {
    setNovoNome("");
    setNovoFone("");
    setPermConsultar(true);
    setPermLancarCp(false);
    setPermBaixarCp(false);
  };

  const enviarCodigo = async (acessoId: string) => {
    if (!session?.access_token) {
      toast.error("Sessão expirou. Recarrega a página e tenta de novo.");
      return false;
    }
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/agente-enviar-codigo`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ acesso_id: acessoId }),
      });
      const data = await resp.json();
      if (resp.ok && data.ok) {
        toast.success(data.mensagem || "Código enviado pelo WhatsApp");
        return true;
      } else {
        toast.error(`Erro envio: ${data.error || resp.statusText} (HTTP ${resp.status})`);
        console.error("[whatsapp-autorizados] enviar-codigo falhou:", { status: resp.status, data });
        return false;
      }
    } catch (err: any) {
      toast.error("Erro de rede: " + err?.message);
      console.error("[whatsapp-autorizados] exceção:", err);
      return false;
    }
  };

  const adicionar = async () => {
    if (!activeClient || !selectedCompany) return;
    if (!novoNome.trim()) return toast.error("Nome obrigatório");
    const foneNorm = normalizarFone(novoFone);
    if (foneNorm.length < 12 || foneNorm.length > 13) return toast.error("Telefone inválido (use DDD + número)");

    setSalvando(true);
    const { data, error } = await activeClient
      .from("whatsapp_acesso")
      .insert({
        phone: foneNorm,
        nome: novoNome.trim(),
        company_id: selectedCompany.id,
        permissoes: {
          consultar: permConsultar,
          lancar_cp: permLancarCp,
          baixar_cp: permBaixarCp,
        },
        status: "pendente",
      })
      .select("id")
      .single();

    if (error) {
      setSalvando(false);
      if (error.code === "23505") return toast.error("Esse telefone já está cadastrado nesta empresa");
      return toast.error("Erro: " + error.message);
    }

    toast.success("Cadastrado! Enviando código pelo WhatsApp...");
    // Envia código via edge function
    if (data?.id) {
      await enviarCodigo(data.id);
    }

    setSalvando(false);
    limparForm();
    setDialogOpen(false);
    carregar();
  };

  const revogar = async (id: string) => {
    if (!confirm("Revogar este acesso? A pessoa perde acesso imediatamente.")) return;
    if (!activeClient) return;
    const { error } = await activeClient
      .from("whatsapp_acesso")
      .update({ status: "revogado" })
      .eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Acesso revogado");
    carregar();
  };

  const excluir = async (id: string) => {
    if (!confirm("Excluir este cadastro? Histórico de uso não é apagado, mas o cadastro some.")) return;
    if (!activeClient) return;
    const { error } = await activeClient.from("whatsapp_acesso").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Cadastro excluído");
    carregar();
  };

  return (
    <AppLayout title="WhatsApp Autorizados">
      <div>
        <PagePanel title="WhatsApp Autorizados">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-[#1D2939]">
                <MessageCircle className="h-5 w-5 text-emerald-600" />
                WhatsApp Autorizados — {selectedCompany?.nome_fantasia || selectedCompany?.razao_social}
              </CardTitle>
              <p className="text-[12px] text-[#667085] mt-1">
                Telefones que podem usar o Assistente Tatica nesta empresa, com permissões granulares.
              </p>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={limparForm}>
                  <Plus className="h-4 w-4 mr-1" /> Autorizar novo
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Autorizar novo WhatsApp</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Nome da pessoa</Label>
                    <Input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} placeholder="Ex: João Silva" />
                  </div>
                  <div>
                    <Label>Telefone (com DDD)</Label>
                    <Input
                      value={novoFone}
                      onChange={(e) => setNovoFone(e.target.value)}
                      placeholder="Ex: 35 99990-5768"
                    />
                    <p className="text-[11px] text-[#667085] mt-1">Adiciono o DDI 55 automaticamente.</p>
                  </div>
                  <div className="border-t pt-3">
                    <Label className="text-[12px] font-medium">Permissões</Label>
                    <div className="space-y-2 mt-2">
                      <label className="flex items-center gap-2 text-[13px]">
                        <Checkbox checked={permConsultar} onCheckedChange={(c) => setPermConsultar(!!c)} />
                        Consultar (saldo, faturamento, contas a pagar, etc.)
                      </label>
                      <label className="flex items-center gap-2 text-[13px]">
                        <Checkbox checked={permLancarCp} onCheckedChange={(c) => setPermLancarCp(!!c)} />
                        Lançar contas a pagar (CP em aberto)
                      </label>
                      <label className="flex items-center gap-2 text-[13px]">
                        <Checkbox checked={permBaixarCp} onCheckedChange={(c) => setPermBaixarCp(!!c)} />
                        Dar baixa em contas a pagar (marcar como pago)
                      </label>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
                  <Button onClick={adicionar} disabled={salvando} className="bg-emerald-600 hover:bg-emerald-700">
                    {salvando ? "Salvando..." : "Cadastrar e enviar código"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardHeader>

          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-[#667085]">Carregando...</div>
            ) : acessos.length === 0 ? (
              <div className="text-center py-8 text-[#667085]">
                Nenhum WhatsApp autorizado nesta empresa. Clique em <strong>"Autorizar novo"</strong> pra começar.
              </div>
            ) : (
              <div className="space-y-2">
                {acessos.map((a) => {
                  const perms = a.permissoes || {};
                  const permLabels: string[] = [];
                  if (perms.consultar) permLabels.push("Consulta");
                  if (perms.lancar_cp) permLabels.push("Lança CP");
                  if (perms.baixar_cp) permLabels.push("Baixa CP");
                  return (
                    <div key={a.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[#1D2939]">{a.nome}</span>
                          <Badge variant="outline" className={STATUS_COLORS[a.status] || ""}>
                            {a.status === "verificado" && <ShieldCheck className="h-3 w-3 mr-1" />}
                            {a.status === "pendente" && <Clock className="h-3 w-3 mr-1" />}
                            {a.status === "bloqueado" && <ShieldAlert className="h-3 w-3 mr-1" />}
                            {a.status}
                          </Badge>
                        </div>
                        <div className="text-[12px] text-[#667085] mt-0.5">{formatarFone(a.phone)}</div>
                        <div className="text-[11px] text-[#667085] mt-0.5">
                          {permLabels.length > 0 ? permLabels.join(" · ") : "Sem permissões"}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {a.status !== "verificado" && a.status !== "revogado" && (
                          <Button variant="outline" size="sm" onClick={() => enviarCodigo(a.id)} title="Reenviar código">
                            <RefreshCw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {a.status !== "revogado" && (
                          <Button variant="outline" size="sm" onClick={() => revogar(a.id)} title="Revogar">
                            <ShieldAlert className="h-3.5 w-3.5 text-red-600" />
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => excluir(a.id)} title="Excluir">
                          <Trash2 className="h-3.5 w-3.5 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        </PagePanel>
      </div>
    </AppLayout>
  );
}
