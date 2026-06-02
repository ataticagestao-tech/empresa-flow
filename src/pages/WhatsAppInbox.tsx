import { useState, useEffect, useRef, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PagePanel } from "@/components/layout/PagePanel";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { MessageCircle, Send, RefreshCw, Bot, User, Megaphone, Loader2 } from "lucide-react";

interface Conversa {
  id: string;
  phone: string;
  nome: string | null;
  company_id: string | null;
  is_lead: boolean;
  ia_ativa: boolean;
  unread_count: number;
  referral: Record<string, unknown> | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_autor: string | null;
  status: string;
}

interface Mensagem {
  id: string;
  direcao: "entrada" | "saida";
  autor: "contato" | "ia" | "humano" | "sistema";
  tipo: string;
  conteudo: string | null;
  midia: Record<string, unknown> | null;
  status: string | null;
  created_at: string;
}

function formatarFone(raw: string): string {
  if (!raw || raw.length < 12) return raw;
  const ddi = raw.slice(0, 2);
  const ddd = raw.slice(2, 4);
  const rest = raw.slice(4);
  if (rest.length === 9) return `+${ddi} ${ddd} ${rest.slice(0, 5)}-${rest.slice(5)}`;
  return `+${ddi} ${ddd} ${rest.slice(0, 4)}-${rest.slice(4)}`;
}

function horaCurta(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const hoje = new Date();
  const mesmoDia = d.toDateString() === hoje.toDateString();
  if (mesmoDia) return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const AUTOR_LABEL: Record<string, string> = {
  ia: "Assistente",
  humano: "Você",
  sistema: "Sistema",
  contato: "Cliente",
};

export default function WhatsAppInbox() {
  const { session } = useAuth();
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [carregandoLista, setCarregandoLista] = useState(true);
  const [carregandoMsgs, setCarregandoMsgs] = useState(false);
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  const selecionada = conversas.find((c) => c.id === selecionadaId) || null;

  const callInbox = useCallback(
    async (action: string, payload: Record<string, unknown> = {}) => {
      const token = session?.access_token;
      if (!token) throw new Error("Sessão expirada. Recarregue a página.");
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-inbox`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, ...payload }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data.ok === false) {
        throw new Error(data.erro || data.dica || `Erro (HTTP ${resp.status})`);
      }
      return data;
    },
    [session?.access_token],
  );

  const carregarConversas = useCallback(async () => {
    try {
      const data = await callInbox("conversas");
      setConversas(data.conversas || []);
    } catch (e: any) {
      // silencioso no polling; só loga
      console.error("[inbox] carregarConversas:", e?.message);
    } finally {
      setCarregandoLista(false);
    }
  }, [callInbox]);

  const carregarMensagens = useCallback(
    async (conversaId: string, comLoading = false) => {
      if (comLoading) setCarregandoMsgs(true);
      try {
        const data = await callInbox("mensagens", { conversa_id: conversaId });
        setMensagens(data.mensagens || []);
      } catch (e: any) {
        console.error("[inbox] carregarMensagens:", e?.message);
      } finally {
        if (comLoading) setCarregandoMsgs(false);
      }
    },
    [callInbox],
  );

  // Carga inicial + polling da lista (10s)
  useEffect(() => {
    carregarConversas();
    const t = setInterval(carregarConversas, 10000);
    return () => clearInterval(t);
  }, [carregarConversas]);

  // Ao selecionar: carrega histórico, marca lida; polling do thread (6s)
  useEffect(() => {
    if (!selecionadaId) return;
    carregarMensagens(selecionadaId, true);
    callInbox("marcar_lida", { conversa_id: selecionadaId })
      .then(() => setConversas((prev) => prev.map((c) => (c.id === selecionadaId ? { ...c, unread_count: 0 } : c))))
      .catch(() => {});
    const t = setInterval(() => carregarMensagens(selecionadaId), 6000);
    return () => clearInterval(t);
  }, [selecionadaId, carregarMensagens, callInbox]);

  // Auto-scroll pro fim quando chega mensagem
  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens.length]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || !selecionadaId) return;
    setEnviando(true);
    try {
      await callInbox("enviar", { conversa_id: selecionadaId, texto: t });
      setTexto("");
      setConversas((prev) => prev.map((c) => (c.id === selecionadaId ? { ...c, ia_ativa: false } : c)));
      await carregarMensagens(selecionadaId);
      toast.success("Mensagem enviada");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao enviar");
    } finally {
      setEnviando(false);
    }
  };

  const toggleIa = async (ativa: boolean) => {
    if (!selecionadaId) return;
    setConversas((prev) => prev.map((c) => (c.id === selecionadaId ? { ...c, ia_ativa: ativa } : c)));
    try {
      await callInbox("toggle_ia", { conversa_id: selecionadaId, ia_ativa: ativa });
      toast.success(ativa ? "IA reativada nesta conversa" : "IA pausada — você assume a conversa");
    } catch (e: any) {
      toast.error(e?.message || "Falha ao alterar");
      carregarConversas();
    }
  };

  const totalNaoLidas = conversas.reduce((s, c) => s + (c.unread_count || 0), 0);

  return (
    <AppLayout title="WhatsApp Inbox">
      <PagePanel
        title="WhatsApp Inbox"
        subtitle="Conversas recebidas no número oficial da Tática — leads e clientes"
        headerActions={
          <Button
            variant="outline"
            size="sm"
            className="bg-white text-[#071D41]"
            onClick={() => {
              carregarConversas();
              if (selecionadaId) carregarMensagens(selecionadaId, true);
            }}
          >
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Atualizar
          </Button>
        }
      >
        <div className="flex gap-3 h-[calc(100vh-260px)] min-h-[480px]">
          {/* Lista de conversas */}
          <div className="w-[320px] shrink-0 border border-[#EAECF0] rounded-lg overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b border-[#EAECF0] bg-gray-50 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[#1D2939]">Conversas</span>
              {totalNaoLidas > 0 && (
                <Badge className="bg-emerald-600 text-white">{totalNaoLidas} não lidas</Badge>
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {carregandoLista ? (
                <div className="flex items-center justify-center py-10 text-[#667085]">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando...
                </div>
              ) : conversas.length === 0 ? (
                <div className="text-center py-10 px-4 text-[13px] text-[#667085]">
                  Nenhuma conversa ainda. Quando alguém mandar mensagem no WhatsApp da Tática, aparece aqui.
                </div>
              ) : (
                conversas.map((c) => {
                  const ativo = c.id === selecionadaId;
                  return (
                    <button
                      key={c.id}
                      onClick={() => setSelecionadaId(c.id)}
                      className={`w-full text-left px-3 py-2.5 border-b border-[#F2F4F7] hover:bg-gray-50 transition-colors ${ativo ? "bg-emerald-50" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-[13px] text-[#1D2939] truncate">
                          {c.nome || formatarFone(c.phone)}
                        </span>
                        <span className="text-[10px] text-[#98A2B3] shrink-0">{horaCurta(c.last_message_at)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {c.is_lead ? (
                          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-[10px] px-1.5 py-0">
                            {c.referral ? <Megaphone className="h-2.5 w-2.5 mr-0.5" /> : null}Lead
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-[10px] px-1.5 py-0">
                            Cliente
                          </Badge>
                        )}
                        {!c.ia_ativa && (
                          <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200 text-[10px] px-1.5 py-0">
                            IA off
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-0.5">
                        <span className="text-[12px] text-[#667085] truncate">
                          {c.last_message_autor && c.last_message_autor !== "contato" ? "Você: " : ""}
                          {c.last_message_preview || ""}
                        </span>
                        {c.unread_count > 0 && (
                          <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-600 text-white text-[10px] flex items-center justify-center">
                            {c.unread_count}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Thread + composer */}
          <div className="flex-1 border border-[#EAECF0] rounded-lg overflow-hidden flex flex-col bg-[#F7F8FA]">
            {!selecionada ? (
              <div className="flex-1 flex flex-col items-center justify-center text-[#98A2B3]">
                <MessageCircle className="h-10 w-10 mb-2" />
                <p className="text-[13px]">Selecione uma conversa pra ver as mensagens</p>
              </div>
            ) : (
              <>
                {/* Cabeçalho do thread */}
                <div className="px-4 py-2.5 border-b border-[#EAECF0] bg-white flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-[14px] text-[#1D2939] truncate">
                      {selecionada.nome || formatarFone(selecionada.phone)}
                    </div>
                    <div className="text-[11px] text-[#667085]">{formatarFone(selecionada.phone)}</div>
                  </div>
                  <label className="flex items-center gap-2 text-[12px] text-[#344054] shrink-0 cursor-pointer">
                    <Bot className="h-4 w-4 text-emerald-600" />
                    IA responde
                    <Switch checked={selecionada.ia_ativa} onCheckedChange={toggleIa} />
                  </label>
                </div>

                {/* Mensagens */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                  {carregandoMsgs ? (
                    <div className="flex items-center justify-center py-10 text-[#667085]">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" /> Carregando...
                    </div>
                  ) : (
                    mensagens.map((m) => {
                      const minha = m.direcao === "saida";
                      return (
                        <div key={m.id} className={`flex ${minha ? "justify-end" : "justify-start"}`}>
                          <div
                            className={`max-w-[72%] rounded-2xl px-3 py-2 text-[13px] whitespace-pre-wrap break-words shadow-sm ${
                              minha ? "bg-emerald-600 text-white rounded-br-sm" : "bg-white text-[#1D2939] rounded-bl-sm border border-[#EAECF0]"
                            }`}
                          >
                            {minha && (
                              <div className={`flex items-center gap-1 text-[10px] mb-0.5 ${m.autor === "ia" ? "opacity-90" : "opacity-80"}`}>
                                {m.autor === "ia" ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                                {AUTOR_LABEL[m.autor] || m.autor}
                              </div>
                            )}
                            {m.conteudo}
                            <div className={`text-[10px] mt-0.5 text-right ${minha ? "text-white/70" : "text-[#98A2B3]"}`}>
                              {horaCurta(m.created_at)}
                              {minha && m.status ? ` · ${m.status}` : ""}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={fimRef} />
                </div>

                {/* Composer */}
                <div className="border-t border-[#EAECF0] bg-white p-2.5">
                  {selecionada.ia_ativa && (
                    <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-2">
                      A IA está respondendo automaticamente. Ao enviar uma mensagem, você assume a conversa (IA pausa).
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={texto}
                      onChange={(e) => setTexto(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          enviar();
                        }
                      }}
                      placeholder="Escreva uma resposta... (Enter envia, Shift+Enter quebra linha)"
                      className="min-h-[44px] max-h-[140px] resize-none"
                    />
                    <Button
                      onClick={enviar}
                      disabled={enviando || !texto.trim()}
                      className="bg-emerald-600 hover:bg-emerald-700 h-[44px] shrink-0"
                    >
                      {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </PagePanel>
    </AppLayout>
  );
}
