import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Bell, FileText, Clock, ShieldCheck, ShieldAlert, ExternalLink, ChevronLeft, ChevronRight } from "lucide-react";

const POR_PAGINA = 3;

interface Notificacao {
  tipo: "lancamento_cp" | "acesso_pendente" | "acesso_verificado" | "acesso_bloqueado";
  titulo: string;
  descricao: string;
  link: string;
  recurso_id: string;
  created_at: string;
}

const STORAGE_KEY = "notificacoes:ultima_visualizacao";

const ICON_BY_TIPO: Record<string, JSX.Element> = {
  lancamento_cp: <FileText className="h-3.5 w-3.5 text-emerald-600" />,
  acesso_pendente: <Clock className="h-3.5 w-3.5 text-amber-600" />,
  acesso_verificado: <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />,
  acesso_bloqueado: <ShieldAlert className="h-3.5 w-3.5 text-red-600" />,
};

function tempoRelativo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export function NotificationBell() {
  const { user, activeClient } = useAuth();
  const navigate = useNavigate();
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [naoLidas, setNaoLidas] = useState(0);
  const [open, setOpen] = useState(false);
  const [pagina, setPagina] = useState(0);

  const carregar = async () => {
    if (!user || !activeClient) return;
    const { data, error } = await activeClient.rpc("agente_notificacoes", { p_user_id: user.id });
    if (error || !data) return;

    const lista = data as Notificacao[];
    setNotificacoes(lista);

    const ultimaVista = Number(localStorage.getItem(STORAGE_KEY) || "0");
    const novas = lista.filter((n) => new Date(n.created_at).getTime() > ultimaVista);
    setNaoLidas(novas.length);
  };

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [user, activeClient]);

  const marcarLidas = () => {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setNaoLidas(0);
  };

  const abrir = (open: boolean) => {
    setOpen(open);
    if (open) {
      setPagina(0); // reset pra primeira página ao abrir
      if (naoLidas > 0) marcarLidas();
    }
  };

  const clicar = (n: Notificacao) => {
    setOpen(false);
    navigate(n.link);
  };

  const totalPaginas = Math.max(1, Math.ceil(notificacoes.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const inicio = paginaAtual * POR_PAGINA;
  const visiveis = notificacoes.slice(inicio, inicio + POR_PAGINA);

  return (
    <DropdownMenu open={open} onOpenChange={abrir}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded-md border border-sidebar-border text-white/70 hover:bg-sidebar-accent hover:text-white transition-colors"
          aria-label="Notificações"
        >
          <Bell className="h-4 w-4" />
          {naoLidas > 0 && (
            <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
              {naoLidas > 9 ? "9+" : naoLidas}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[340px] max-h-[440px] overflow-auto">
        <DropdownMenuLabel className="text-[13px] font-semibold">
          Notificações
          {notificacoes.length > 0 && (
            <span className="ml-1 text-[11px] font-normal text-[#667085]">
              ({notificacoes.length})
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {notificacoes.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] text-[#667085]">
            Sem notificações por enquanto.
          </div>
        ) : (
          <>
            <div className="space-y-0">
              {visiveis.map((n) => (
                <button
                  key={`${n.tipo}-${n.recurso_id}`}
                  onClick={() => clicar(n)}
                  className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-[#F2F4F7] last:border-b-0 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5 flex-shrink-0">{ICON_BY_TIPO[n.tipo]}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[12px] font-semibold text-[#1D2939] truncate">{n.titulo}</span>
                        <span className="text-[10px] text-[#98A2B3] flex-shrink-0">{tempoRelativo(n.created_at)}</span>
                      </div>
                      <div className="text-[11.5px] text-[#667085] line-clamp-2 mt-0.5">{n.descricao}</div>
                    </div>
                    <ExternalLink className="h-3 w-3 text-[#98A2B3] flex-shrink-0 mt-1" />
                  </div>
                </button>
              ))}
            </div>

            {totalPaginas > 1 && (
              <>
                <DropdownMenuSeparator />
                <div className="flex items-center justify-between px-3 py-2 bg-[#F9FAFB]">
                  <button
                    onClick={(e) => { e.preventDefault(); setPagina((p) => Math.max(0, p - 1)); }}
                    disabled={paginaAtual === 0}
                    className="h-6 w-6 flex items-center justify-center rounded text-[#667085] hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Página anterior"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="text-[10px] text-[#667085] font-medium">
                    {paginaAtual + 1} de {totalPaginas}
                  </span>
                  <button
                    onClick={(e) => { e.preventDefault(); setPagina((p) => Math.min(totalPaginas - 1, p + 1)); }}
                    disabled={paginaAtual >= totalPaginas - 1}
                    className="h-6 w-6 flex items-center justify-center rounded text-[#667085] hover:bg-white disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label="Próxima página"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
