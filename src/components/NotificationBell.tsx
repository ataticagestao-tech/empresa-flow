import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useImplantacao } from "@/hooks/useImplantacao";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Bell, FileText, Clock, ShieldCheck, ShieldAlert, ExternalLink, ChevronLeft, ChevronRight, CheckCheck, Sparkles, CheckCircle2, Circle, X } from "lucide-react";

const POR_PAGINA = 3;
const STORAGE_LIDAS_KEY = "notificacoes:ids_lidas";

function carregarIdsLidas(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_LIDAS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function salvarIdsLidas(set: Set<string>) {
  // Mantém só os últimos 500 pra não crescer infinito
  const arr = Array.from(set).slice(-500);
  localStorage.setItem(STORAGE_LIDAS_KEY, JSON.stringify(arr));
}

function keyDe(n: { tipo: string; recurso_id: string }): string {
  return `${n.tipo}:${n.recurso_id}`;
}

interface Notificacao {
  tipo: "lancamento_cp" | "acesso_pendente" | "acesso_verificado" | "acesso_bloqueado";
  titulo: string;
  descricao: string;
  link: string;
  recurso_id: string;
  created_at: string;
}

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
  const { selectedCompany } = useCompany();
  const navigate = useNavigate();
  const onboarding = useImplantacao(selectedCompany?.id);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [idsLidas, setIdsLidas] = useState<Set<string>>(() => carregarIdsLidas());
  const [open, setOpen] = useState(false);
  const [pagina, setPagina] = useState(0);

  const carregar = async () => {
    if (!user || !activeClient) return;
    const { data, error } = await activeClient.rpc("agente_notificacoes", { p_user_id: user.id });
    if (error || !data) return;
    setNotificacoes(data as Notificacao[]);
  };

  const naoLidas = notificacoes.filter((n) => !idsLidas.has(keyDe(n))).length;
  const badgeCount = naoLidas + (onboarding.pending ? 1 : 0);

  const marcarUmaComoLida = (n: Notificacao) => {
    const nova = new Set(idsLidas);
    nova.add(keyDe(n));
    setIdsLidas(nova);
    salvarIdsLidas(nova);
  };

  const marcarTodasComoLidas = () => {
    const nova = new Set(idsLidas);
    notificacoes.forEach((n) => nova.add(keyDe(n)));
    setIdsLidas(nova);
    salvarIdsLidas(nova);
  };

  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [user, activeClient]);

  const abrir = (open: boolean) => {
    setOpen(open);
    if (open) setPagina(0);
  };

  const clicar = (n: Notificacao) => {
    marcarUmaComoLida(n);
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
          {badgeCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {badgeCount > 9 ? "9+" : badgeCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[340px] max-h-[440px] overflow-auto">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-[13px] font-semibold text-[#1D2939]">
            Notificações
            {notificacoes.length > 0 && (
              <span className="ml-1 text-[11px] font-normal text-[#667085]">
                ({notificacoes.length})
              </span>
            )}
          </span>
          {naoLidas > 0 && (
            <button
              onClick={(e) => { e.preventDefault(); marcarTodasComoLidas(); }}
              className="text-[10.5px] font-medium text-emerald-700 hover:text-emerald-900 flex items-center gap-1"
              title="Marcar todas como lidas"
            >
              <CheckCheck className="h-3 w-3" />
              Marcar lidas
            </button>
          )}
        </div>
        <DropdownMenuSeparator />

        {onboarding.pending && (
          <>
            <div className="px-3 py-2">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-[12px] font-semibold text-[#1D2939]">Comece por aqui</span>
                  <span className="text-[11px] text-[#667085]">{onboarding.doneCount}/{onboarding.total}</span>
                </div>
                <button
                  onClick={(e) => { e.preventDefault(); onboarding.dismiss(); }}
                  className="text-[#98A2B3] hover:text-[#475467]"
                  title="Ocultar"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="h-1.5 bg-[#F2F4F7] rounded-full overflow-hidden mb-2">
                <div className="h-full bg-emerald-600 transition-all" style={{ width: `${onboarding.pct}%` }} />
              </div>
              <div className="space-y-0">
                {onboarding.steps.map((step) => (
                  <button
                    key={step.key}
                    onClick={() => { setOpen(false); navigate(step.route); }}
                    disabled={step.done}
                    className={`w-full flex items-center gap-2 px-1.5 py-1.5 rounded text-left ${
                      step.done ? "cursor-default" : "hover:bg-gray-50"
                    }`}
                  >
                    {step.done ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />
                    ) : (
                      <Circle className="h-3.5 w-3.5 text-[#D0D5DD] flex-shrink-0" strokeWidth={1.5} />
                    )}
                    <span className={`flex-1 text-[12px] truncate ${
                      step.done ? "line-through text-[#98A2B3]" : "text-[#1D2939] font-medium"
                    }`}>
                      {step.title}
                    </span>
                    {!step.done && <ChevronRight className="h-3.5 w-3.5 text-emerald-600 flex-shrink-0" />}
                  </button>
                ))}
              </div>
            </div>
            <DropdownMenuSeparator />
          </>
        )}

        {notificacoes.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] text-[#667085]">
            Sem notificações por enquanto.
          </div>
        ) : (
          <>
            <div className="space-y-0">
              {visiveis.map((n) => {
                const naoLida = !idsLidas.has(keyDe(n));
                return (
                  <button
                    key={`${n.tipo}-${n.recurso_id}`}
                    onClick={() => clicar(n)}
                    className={`w-full text-left px-3 py-2 border-b border-[#F2F4F7] last:border-b-0 transition-colors ${
                      naoLida
                        ? "bg-[#FFF7ED] hover:bg-[#FFEDD5]"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {naoLida && (
                        <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-orange-500 flex-shrink-0" aria-label="Não lida" />
                      )}
                      <div className="mt-0.5 flex-shrink-0">{ICON_BY_TIPO[n.tipo]}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-[12px] truncate ${naoLida ? "font-bold text-[#1D2939]" : "font-semibold text-[#1D2939]"}`}>
                            {n.titulo}
                          </span>
                          <span className="text-[11px] text-[#98A2B3] flex-shrink-0">{tempoRelativo(n.created_at)}</span>
                        </div>
                        <div className="text-[11.5px] text-[#667085] line-clamp-2 mt-0.5">{n.descricao}</div>
                      </div>
                      <ExternalLink className="h-3 w-3 text-[#98A2B3] flex-shrink-0 mt-1" />
                    </div>
                  </button>
                );
              })}
            </div>

            {totalPaginas > 1 && (
              <div className="flex items-center justify-end gap-1 px-2 py-1 border-t border-[#F2F4F7]">
                <button
                  onClick={(e) => { e.preventDefault(); setPagina((p) => Math.max(0, p - 1)); }}
                  disabled={paginaAtual === 0}
                  className="h-4 w-4 flex items-center justify-center rounded text-[#98A2B3] hover:text-[#475467] disabled:opacity-25 disabled:cursor-not-allowed"
                  aria-label="Página anterior"
                >
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <span className="text-[11px] text-[#98A2B3] tabular-nums">
                  {paginaAtual + 1}/{totalPaginas}
                </span>
                <button
                  onClick={(e) => { e.preventDefault(); setPagina((p) => Math.min(totalPaginas - 1, p + 1)); }}
                  disabled={paginaAtual >= totalPaginas - 1}
                  className="h-4 w-4 flex items-center justify-center rounded text-[#98A2B3] hover:text-[#475467] disabled:opacity-25 disabled:cursor-not-allowed"
                  aria-label="Próxima página"
                >
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            )}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
