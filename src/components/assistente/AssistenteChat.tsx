import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Bot, User, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  pending?: boolean;
}

/** Sugestões iniciais (clicáveis) quando a conversa está vazia. */
const SUGESTOES = [
  "Qual o saldo das minhas contas?",
  "Qual o faturamento do mês?",
  "Lança uma conta a pagar de R$ 350 de energia, vence amanhã",
  "Quais contas vencem essa semana?",
  "Me mostra o DRE do mês",
];

/**
 * Renderiza o texto do assistente preservando quebras de linha e
 * *negrito* (um asterisco, mesmo padrão do WhatsApp do agente).
 */
function renderConteudo(texto: string) {
  const linhas = texto.split("\n");
  return linhas.map((linha, li) => {
    const partes = linha.split(/(\*[^*]+\*)/g);
    return (
      <span key={li}>
        {partes.map((p, pi) =>
          p.startsWith("*") && p.endsWith("*") && p.length > 2 ? (
            <strong key={pi}>{p.slice(1, -1)}</strong>
          ) : (
            <span key={pi}>{p}</span>
          ),
        )}
        {li < linhas.length - 1 && <br />}
      </span>
    );
  });
}

export function AssistenteChat() {
  const { activeClient, user } = useAuth();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [carregandoHistorico, setCarregandoHistorico] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Carrega o histórico do chat web (RLS deixa o usuário ler as próprias mensagens).
  useEffect(() => {
    let ativo = true;
    async function carregar() {
      if (!user || !companyId) {
        setCarregandoHistorico(false);
        return;
      }
      setCarregandoHistorico(true);
      const { data } = await activeClient
        .from("agente_conversas")
        .select("id, role, content, created_at")
        .eq("user_id", user.id)
        .eq("canal", "web")
        .eq("company_id", companyId)
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: true })
        .limit(100);

      if (!ativo) return;
      const hist: ChatMessage[] = (data || [])
        .filter((r: any) => typeof r.content === "string" && r.content.trim().length > 0)
        .map((r: any) => ({ id: r.id, role: r.role, content: r.content }));
      setMessages(hist);
      setCarregandoHistorico(false);
    }
    carregar();
    return () => {
      ativo = false;
    };
  }, [activeClient, user, companyId]);

  // Auto-scroll pro fim sempre que chega mensagem.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, enviando]);

  const enviar = useCallback(
    async (texto: string) => {
      const msg = texto.trim();
      if (!msg || enviando) return;
      if (!companyId) return;

      const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: msg };
      setMessages((m) => [...m, userMsg]);
      setInput("");
      setEnviando(true);

      try {
        const { data, error } = await activeClient.functions.invoke<{
          ok?: boolean;
          response?: string;
          error?: string;
        }>("agente-chat-web", {
          body: { message: msg, empresa_id: companyId },
        });

        const resposta =
          (data && (data.response || data.error)) ||
          (error ? "Tive um problema técnico aqui. Tenta de novo?" : "Sem resposta.");

        setMessages((m) => [
          ...m,
          { id: `a-${Date.now()}`, role: "assistant", content: resposta },
        ]);
      } catch {
        setMessages((m) => [
          ...m,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            content: "Tive um problema técnico aqui. Tenta de novo em 1 minuto?",
          },
        ]);
      } finally {
        setEnviando(false);
        textareaRef.current?.focus();
      }
    },
    [activeClient, companyId, enviando],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar(input);
    }
  };

  const vazio = messages.length === 0 && !carregandoHistorico;

  return (
    <div className="flex flex-col h-[calc(100vh-260px)] min-h-[420px]">
      {/* Área de mensagens */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-1 py-3 space-y-3">
        {carregandoHistorico && (
          <div className="flex items-center justify-center h-full text-sm text-gray-400 gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando conversa…
          </div>
        )}

        {vazio && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-4">
            <div className="h-12 w-12 rounded-full bg-[#071D41] flex items-center justify-center">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Assistente Tatica</p>
              <p className="text-xs text-gray-500 mt-1 max-w-sm">
                Peça pra consultar, lançar e dar baixa em contas, gerar DRE, cadastrar
                fornecedor — em português, do seu jeito.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  onClick={() => enviar(s)}
                  className="text-xs px-3 py-1.5 rounded-full border border-[#EAECF0] bg-white text-gray-600 hover:border-[#071D41] hover:text-[#071D41] transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div
            key={m.id}
            className={cn("flex gap-2.5", m.role === "user" ? "justify-end" : "justify-start")}
          >
            {m.role === "assistant" && (
              <div className="h-7 w-7 rounded-full bg-[#071D41] flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-4 w-4 text-white" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words",
                m.role === "user"
                  ? "bg-[#071D41] text-white rounded-br-sm"
                  : "bg-gray-100 text-gray-800 rounded-bl-sm",
              )}
            >
              {m.role === "assistant" ? renderConteudo(m.content) : m.content}
            </div>
            {m.role === "user" && (
              <div className="h-7 w-7 rounded-full bg-gray-200 flex items-center justify-center shrink-0 mt-0.5">
                <User className="h-4 w-4 text-gray-600" />
              </div>
            )}
          </div>
        ))}

        {enviando && (
          <div className="flex gap-2.5 justify-start">
            <div className="h-7 w-7 rounded-full bg-[#071D41] flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex items-center gap-1">
              <span className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 bg-gray-400 rounded-full animate-bounce" />
            </div>
          </div>
        )}
      </div>

      {/* Barra de input */}
      <div className="border-t border-[#EAECF0] pt-3">
        {!companyId && (
          <p className="text-xs text-amber-600 mb-2">Selecione uma empresa pra usar o assistente.</p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={!companyId || enviando}
            rows={1}
            placeholder="Escreva uma mensagem… (ex: paguei a conta da Equatorial)"
            className="flex-1 resize-none rounded-xl border border-[#EAECF0] px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#071D41] max-h-32 disabled:bg-gray-50"
          />
          <button
            onClick={() => enviar(input)}
            disabled={!companyId || enviando || !input.trim()}
            className="h-10 w-10 shrink-0 rounded-xl bg-[#071D41] text-white flex items-center justify-center disabled:opacity-40 hover:bg-[#0a2a5e] transition-colors"
            aria-label="Enviar"
          >
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-[10px] text-gray-400 mt-1.5 px-1">
          O assistente executa ações de verdade no sistema. Ações destrutivas pedem confirmação.
        </p>
      </div>
    </div>
  );
}
