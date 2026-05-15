import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Bot, X, ExternalLink } from "lucide-react";

interface LancamentoAgente {
  id: string;
  company_id: string;
  nome_empresa: string;
  credor_nome: string;
  descricao: string;
  valor: number;
  data_vencimento: string;
  created_at: string;
}

const STORAGE_KEY = "agente:ultima_visualizacao";

export function AgenteBanner() {
  const { user, activeClient } = useAuth();
  const navigate = useNavigate();
  const [lancamentos, setLancamentos] = useState<LancamentoAgente[]>([]);
  const [visivel, setVisivel] = useState(false);

  useEffect(() => {
    if (!user || !activeClient) return;

    let cancelled = false;

    const carregar = async () => {
      const { data, error } = await activeClient.rpc("agente_lancamentos_recentes", {
        p_user_id: user.id,
      });
      if (cancelled || error || !data) return;

      const ultimaVista = Number(localStorage.getItem(STORAGE_KEY) || "0");
      const novos = (data as LancamentoAgente[]).filter(
        (l) => new Date(l.created_at).getTime() > ultimaVista,
      );

      if (novos.length > 0) {
        setLancamentos(novos);
        setVisivel(true);
      }
    };

    carregar();
    // Re-checa a cada 60s enquanto o app está aberto
    const t = setInterval(carregar, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [user, activeClient]);

  const fechar = () => {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setVisivel(false);
  };

  const irParaCpAberto = () => {
    fechar();
    navigate("/contas-pagar");
  };

  if (!visivel || lancamentos.length === 0) return null;

  const total = lancamentos.reduce((s, l) => s + Number(l.valor || 0), 0);
  const totalFmt = total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="fixed bottom-6 right-6 z-50 w-[360px] bg-white rounded-xl shadow-2xl border border-emerald-200 overflow-hidden animate-in slide-in-from-bottom-3 fade-in duration-300">
      <div className="bg-gradient-to-r from-emerald-50 to-emerald-100 px-4 py-3 flex items-center justify-between border-b border-emerald-200">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center">
            <Bot className="h-4 w-4 text-white" />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-emerald-900">Assistente Tatica</div>
            <div className="text-[11px] text-emerald-700">
              {lancamentos.length} {lancamentos.length === 1 ? "lançamento novo" : "lançamentos novos"} via WhatsApp
            </div>
          </div>
        </div>
        <button
          onClick={fechar}
          className="text-emerald-700 hover:text-emerald-900 transition-colors"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="px-4 py-3 max-h-[260px] overflow-auto">
        <ul className="space-y-2">
          {lancamentos.slice(0, 5).map((l) => (
            <li key={l.id} className="text-[12px] border-l-2 border-emerald-300 pl-2 py-0.5">
              <div className="font-medium text-[#1D2939] truncate">{l.credor_nome}</div>
              <div className="text-[#667085] flex justify-between">
                <span className="truncate">
                  {l.descricao} · {l.nome_empresa}
                </span>
                <span className="font-semibold text-[#1D2939] ml-2 shrink-0">
                  {Number(l.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                </span>
              </div>
            </li>
          ))}
          {lancamentos.length > 5 && (
            <li className="text-[11px] text-[#667085] italic">+ {lancamentos.length - 5} outros</li>
          )}
        </ul>

        <div className="mt-3 pt-3 border-t border-[#EAECF0] flex items-center justify-between">
          <span className="text-[11px] text-[#667085]">
            Total: <strong className="text-[#1D2939]">{totalFmt}</strong>
          </span>
          <button
            onClick={irParaCpAberto}
            className="text-[12px] font-medium text-emerald-700 hover:text-emerald-900 flex items-center gap-1 transition-colors"
          >
            Ver contas a pagar
            <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
