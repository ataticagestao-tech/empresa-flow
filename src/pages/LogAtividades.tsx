import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageToolbar } from "@/components/layout/PageToolbar";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Activity, FileText, ArrowUpCircle, ShoppingCart, Bot, User, Globe } from "lucide-react";
import { ExportMenu } from "@/components/ExportMenu";

interface Atividade {
  id: string;
  actor_user_id: string | null;
  actor_label: string;
  origem: "web" | "agente_whatsapp" | "sistema";
  action: string;
  entity_type: "cp" | "cr" | "venda";
  entity_id: string | null;
  resumo: string;
  created_at: string;
}

const ENTITY_LABEL: Record<string, string> = {
  cp: "Conta a Pagar",
  cr: "Conta a Receber",
  venda: "Venda",
};

const ENTITY_ICON: Record<string, JSX.Element> = {
  cp: <FileText className="h-4 w-4 text-red-600" />,
  cr: <ArrowUpCircle className="h-4 w-4 text-emerald-600" />,
  venda: <ShoppingCart className="h-4 w-4 text-blue-600" />,
};

const ACTION_LABEL: Record<string, string> = {
  criou: "criou",
  pagou: "pagou",
  recebeu: "recebeu",
  cancelou: "cancelou",
  excluiu: "excluiu",
  editou: "editou",
  mudou_status: "mudou status de",
};

const ACTION_COLOR: Record<string, string> = {
  criou: "bg-blue-50 text-blue-700",
  pagou: "bg-emerald-50 text-emerald-700",
  recebeu: "bg-emerald-50 text-emerald-700",
  cancelou: "bg-amber-50 text-amber-700",
  excluiu: "bg-red-50 text-red-700",
  editou: "bg-gray-50 text-gray-700",
  mudou_status: "bg-gray-50 text-gray-700",
};

const ORIGEM_ICON: Record<string, JSX.Element> = {
  web: <Globe className="h-3 w-3" />,
  agente_whatsapp: <Bot className="h-3 w-3 text-emerald-600" />,
  sistema: <Globe className="h-3 w-3 text-gray-400" />,
};

function formatarData(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const dia = new Date(d);
  dia.setHours(0, 0, 0, 0);
  const diff = Math.floor((hoje.getTime() - dia.getTime()) / (1000 * 60 * 60 * 24));
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  if (diff === 0) return `Hoje ${hora}`;
  if (diff === 1) return `Ontem ${hora}`;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
}

const POR_PAGINA = 50;

export default function LogAtividades() {
  const { activeClient } = useAuth();
  const { selectedCompany } = useCompany();
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroOrigem, setFiltroOrigem] = useState<string>("todas");
  const [filtroEntity, setFiltroEntity] = useState<string>("todas");
  const [filtroAction, setFiltroAction] = useState<string>("todas");
  const [pagina, setPagina] = useState(0);

  const carregar = async () => {
    if (!activeClient || !selectedCompany) return;
    setLoading(true);
    const { data } = await activeClient
      .from("activity_log")
      .select("id, actor_user_id, actor_label, origem, action, entity_type, entity_id, resumo, created_at")
      .eq("company_id", selectedCompany.id)
      .order("created_at", { ascending: false })
      .limit(500);
    setAtividades((data || []) as Atividade[]);
    setLoading(false);
  };

  useEffect(() => {
    carregar();
    setPagina(0);
    // eslint-disable-next-line
  }, [selectedCompany?.id]);

  const filtradas = useMemo(() => {
    return atividades.filter((a) => {
      if (filtroOrigem !== "todas" && a.origem !== filtroOrigem) return false;
      if (filtroEntity !== "todas" && a.entity_type !== filtroEntity) return false;
      if (filtroAction !== "todas" && a.action !== filtroAction) return false;
      if (busca && !(`${a.actor_label} ${a.resumo}`.toLowerCase().includes(busca.toLowerCase()))) return false;
      return true;
    });
  }, [atividades, filtroOrigem, filtroEntity, filtroAction, busca]);

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const visiveis = filtradas.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA);

  return (
    <AppLayout title="Log de Atividades">
      <div className="space-y-4">
        <PageToolbar title="Log de Atividades" />
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="flex items-center gap-2 text-[#1D2939]">
                <Activity className="h-5 w-5 text-emerald-600" />
                Log de Atividades — {selectedCompany?.nome_fantasia || "—"}
              </CardTitle>
              <ExportMenu
                rows={filtradas}
                baseName="log-atividades"
                titulo="LOG DE ATIVIDADES"
                disabled={filtradas.length === 0}
                columns={[
                  { header: "Quem", value: (a) => a.actor_label, pdfFlex: 16, excelWidth: 24 },
                  { header: "Ação", value: (a) => ACTION_LABEL[a.action] || a.action, pdfFlex: 12 },
                  { header: "Tipo", value: (a) => ENTITY_LABEL[a.entity_type] || a.entity_type, pdfFlex: 12 },
                  { header: "Resumo", value: (a) => a.resumo, pdfFlex: 34, excelWidth: 50 },
                  { header: "Quando", value: (a) => formatarData(a.created_at), align: "center", pdfFlex: 14 },
                ]}
              />
            </div>
            <p className="text-[12px] text-[#667085]">
              Todas as movimentações da empresa: quem criou, pagou, cancelou e quando.
            </p>
          </CardHeader>

          <CardContent>
            {/* Filtros */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4">
              <Input
                placeholder="Buscar por nome ou resumo..."
                value={busca}
                onChange={(e) => { setBusca(e.target.value); setPagina(0); }}
              />
              <Select value={filtroOrigem} onValueChange={(v) => { setFiltroOrigem(v); setPagina(0); }}>
                <SelectTrigger><SelectValue placeholder="Origem" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas origens</SelectItem>
                  <SelectItem value="web">🌐 Sistema web</SelectItem>
                  <SelectItem value="agente_whatsapp">🤖 Agente WhatsApp</SelectItem>
                  <SelectItem value="sistema">⚙️ Automação</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filtroEntity} onValueChange={(v) => { setFiltroEntity(v); setPagina(0); }}>
                <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todos tipos</SelectItem>
                  <SelectItem value="cp">Contas a Pagar</SelectItem>
                  <SelectItem value="cr">Contas a Receber</SelectItem>
                  <SelectItem value="venda">Vendas</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filtroAction} onValueChange={(v) => { setFiltroAction(v); setPagina(0); }}>
                <SelectTrigger><SelectValue placeholder="Ação" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas ações</SelectItem>
                  <SelectItem value="criou">Criou</SelectItem>
                  <SelectItem value="pagou">Pagou</SelectItem>
                  <SelectItem value="recebeu">Recebeu</SelectItem>
                  <SelectItem value="cancelou">Cancelou</SelectItem>
                  <SelectItem value="excluiu">Excluiu</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Lista */}
            {loading ? (
              <div className="text-center py-8 text-[#667085]">Carregando...</div>
            ) : filtradas.length === 0 ? (
              <div className="text-center py-8 text-[#667085]">
                {atividades.length === 0 ? "Nenhuma atividade registrada ainda nesta empresa." : "Sem resultados com esses filtros."}
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  {visiveis.map((a) => (
                    <div key={a.id} className="flex items-start gap-3 p-2.5 hover:bg-gray-50 rounded border border-[#F2F4F7]">
                      <div className="flex-shrink-0 mt-0.5">{ENTITY_ICON[a.entity_type] || <Activity className="h-4 w-4" />}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-semibold text-[#1D2939] flex items-center gap-1">
                            {a.origem === "agente_whatsapp" ? <Bot className="h-3.5 w-3.5 text-emerald-600" /> : <User className="h-3.5 w-3.5 text-[#667085]" />}
                            {a.actor_label}
                          </span>
                          <Badge variant="outline" className={`${ACTION_COLOR[a.action] || ""} text-[10.5px] font-medium py-0`}>
                            {ACTION_LABEL[a.action] || a.action}
                          </Badge>
                          <span className="text-[11px] text-[#667085]">
                            {ENTITY_LABEL[a.entity_type] || a.entity_type}
                          </span>
                        </div>
                        <div className="text-[12px] text-[#475467] mt-0.5 truncate">{a.resumo}</div>
                      </div>
                      <div className="flex-shrink-0 text-[11px] text-[#98A2B3] flex items-center gap-1 mt-0.5">
                        {ORIGEM_ICON[a.origem]}
                        <span>{formatarData(a.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                {totalPaginas > 1 && (
                  <div className="flex items-center justify-end gap-2 mt-3 text-[12px] text-[#667085]">
                    <button
                      onClick={() => setPagina((p) => Math.max(0, p - 1))}
                      disabled={paginaAtual === 0}
                      className="px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Anterior
                    </button>
                    <span>{paginaAtual + 1} de {totalPaginas} ({filtradas.length} totais)</span>
                    <button
                      onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
                      disabled={paginaAtual >= totalPaginas - 1}
                      className="px-2 py-1 rounded border hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      Próxima
                    </button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
