import { useCallback, useEffect, useRef, useState } from "react";
import { Send, Bot, User, Loader2, ImagePlus, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { cn } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string;
  pending?: boolean;
}

/** Imagem anexada: dataUrl pra preview na tela, data (base64 puro) + media_type pra API. */
interface ImagemAnexo {
  dataUrl: string;
  data: string;
  media_type: string;
}

/** Maior dimensão recomendada pela Anthropic pra visão (evita payload gigante). */
const MAX_DIM = 1568;

/**
 * Lê o arquivo, redimensiona no navegador (máx 1568px) e reexporta como JPEG.
 * Mantém o envio leve e dentro do limite de imagem da API.
 */
function lerImagem(file: File): Promise<ImagemAnexo> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const escala = Math.min(1, MAX_DIM / Math.max(img.width, img.height));
        const width = Math.round(img.width * escala);
        const height = Math.round(img.height * escala);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("canvas indisponível"));
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        resolve({ dataUrl, data: dataUrl.split(",")[1], media_type: "image/jpeg" });
      };
      img.onerror = () => reject(new Error("imagem inválida"));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error("falha ao ler arquivo"));
    reader.readAsDataURL(file);
  });
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
 * Renderiza um trecho de texto puro transformando URLs (http/https) em
 * links clicáveis. PDFs de relatório (signed URL longa) viram um rótulo
 * amigável "📄 Baixar PDF" em vez de despejar a URL inteira.
 */
function renderComLinks(texto: string, keyBase: string) {
  const segs = texto.split(/(https?:\/\/[^\s]+)/g);
  return segs.map((s, i) => {
    if (!/^https?:\/\//.test(s)) return <span key={`${keyBase}-t-${i}`}>{s}</span>;
    const ePdf = /\.pdf(\?|$)|relatorios-temp|\/storage\/v1\/object\/sign/i.test(s);
    return (
      <a
        key={`${keyBase}-a-${i}`}
        href={s}
        target="_blank"
        rel="noopener noreferrer"
        className="underline font-medium text-emerald-700 hover:text-emerald-800 break-all"
      >
        {ePdf ? "📄 Baixar PDF" : s}
      </a>
    );
  });
}

/**
 * Renderiza o texto do assistente preservando quebras de linha,
 * *negrito* (um asterisco, mesmo padrão do WhatsApp do agente) e
 * transformando URLs em links clicáveis.
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
            renderComLinks(p, `${li}-${pi}`)
          ),
        )}
        {li < linhas.length - 1 && <br />}
      </span>
    );
  });
}

export function AssistenteChat({ fill = false }: { fill?: boolean }) {
  const { activeClient, user } = useAuth();
  const { selectedCompany } = useCompany();
  const companyId = selectedCompany?.id;

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [imagem, setImagem] = useState<ImagemAnexo | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [carregandoHistorico, setCarregandoHistorico] = useState(true);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const onPickFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reescolher o mesmo arquivo depois
    if (!file || !file.type.startsWith("image/")) return;
    try {
      setImagem(await lerImagem(file));
      textareaRef.current?.focus();
    } catch {
      /* arquivo inválido — ignora */
    }
  }, []);

  const enviar = useCallback(
    async (texto: string, img: ImagemAnexo | null) => {
      const msg = texto.trim();
      if ((!msg && !img) || enviando) return;
      if (!companyId) return;

      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: msg || (img ? "📷 Imagem" : ""),
        imageUrl: img?.dataUrl,
      };
      setMessages((m) => [...m, userMsg]);
      setInput("");
      setImagem(null);
      setEnviando(true);

      try {
        const { data, error } = await activeClient.functions.invoke<{
          ok?: boolean;
          response?: string;
          error?: string;
        }>("agente-chat-web", {
          body: {
            message: msg,
            empresa_id: companyId,
            ...(img ? { image: { data: img.data, media_type: img.media_type } } : {}),
          },
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
      enviar(input, imagem);
    }
  };

  const vazio = messages.length === 0 && !carregandoHistorico;

  return (
    <div className={cn("flex flex-col", fill ? "h-full min-h-0" : "h-[calc(100vh-260px)] min-h-[420px]")}>
      {/* Área de mensagens — quadro bege */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto rounded-xl border border-[#E7DCC6] bg-[#F6F2EB] px-3 py-3 space-y-3"
      >
        {carregandoHistorico && (
          <div className="flex items-center justify-center h-full text-[12px] text-gray-400 gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando conversa…
          </div>
        )}

        {vazio && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4 px-4">
            <div className="h-12 w-12 rounded-full bg-[#25D366] flex items-center justify-center">
              <Bot className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-gray-800">Assistente Tatica</p>
              <p className="text-[11px] text-gray-500 mt-1 max-w-sm">
                Peça pra consultar, lançar e dar baixa em contas, gerar DRE, cadastrar
                fornecedor — em português, do seu jeito.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg">
              {SUGESTOES.map((s) => (
                <button
                  key={s}
                  onClick={() => enviar(s, null)}
                  className="text-[11px] px-3 py-1.5 rounded-full border border-[#EAECF0] bg-white text-gray-600 hover:border-[#25D366] hover:text-[#1B8C4E] transition-colors"
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
              <div className="h-7 w-7 rounded-full bg-[#25D366] flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="h-4 w-4 text-white" />
              </div>
            )}
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-3 py-1.5 text-[12px] leading-relaxed whitespace-pre-wrap break-words",
                m.role === "user"
                  ? "bg-[#DCF8C6] text-[#1D2939] rounded-br-sm"
                  : "bg-white text-gray-800 border border-[#EAECF0] rounded-bl-sm shadow-sm",
              )}
            >
              {m.imageUrl && (
                <img
                  src={m.imageUrl}
                  alt="Imagem enviada"
                  className="mb-1.5 rounded-lg max-h-44 w-auto border border-black/5"
                />
              )}
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
            <div className="h-7 w-7 rounded-full bg-[#25D366] flex items-center justify-center shrink-0">
              <Bot className="h-4 w-4 text-white" />
            </div>
            <div className="bg-white border border-[#EAECF0] shadow-sm rounded-2xl rounded-bl-sm px-3.5 py-2.5 flex items-center gap-1">
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

        {/* Preview do anexo antes de enviar */}
        {imagem && (
          <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-[#EAECF0] bg-white p-1 pr-2">
            <img src={imagem.dataUrl} alt="Anexo" className="h-10 w-10 rounded object-cover" />
            <span className="text-[11px] text-gray-500">Imagem anexada</span>
            <button
              onClick={() => setImagem(null)}
              className="text-gray-400 hover:text-gray-700"
              aria-label="Remover imagem"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onPickFile}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={!companyId || enviando}
            className="h-10 w-10 shrink-0 rounded-xl border border-[#EAECF0] text-gray-500 flex items-center justify-center disabled:opacity-40 hover:border-[#25D366] hover:text-[#1B8C4E] transition-colors"
            aria-label="Anexar imagem"
            title="Anexar foto (nota, recibo, documento, folha de ponto)"
          >
            <ImagePlus className="h-4 w-4" />
          </button>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={!companyId || enviando}
            rows={1}
            placeholder="Escreva uma mensagem… (ex: paguei a conta da Equatorial)"
            className="flex-1 resize-none rounded-xl border border-[#EAECF0] px-3 py-2 text-[12px] focus:outline-none focus:border-[#25D366] max-h-32 disabled:bg-gray-50"
          />
          <button
            onClick={() => enviar(input, imagem)}
            disabled={!companyId || enviando || (!input.trim() && !imagem)}
            className="h-10 w-10 shrink-0 rounded-xl bg-[#25D366] text-white flex items-center justify-center disabled:opacity-40 hover:bg-[#1FB955] transition-colors"
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
