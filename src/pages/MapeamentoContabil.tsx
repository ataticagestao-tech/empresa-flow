import { useState, useMemo, useCallback, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings2, Wand2, Save, Copy, ChevronDown, ChevronRight, X, Plus, Check, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface LinhaDemonstrativo {
  id: string;
  demonstrativo: string;
  codigo: string;
  nome: string;
  nivel: number;
  tipo_calculo: string;
  ordem: number;
}

interface ContaOperacional {
  id: string;
  code: string;
  name: string;
  account_type: string;
  account_nature: string;
  is_analytical: boolean;
  dre_group: string | null;
}

interface Mapeamento {
  id?: string;
  conta_operacional_id: string;
  linha_demonstrativo_id: string;
  fator: number;
  ativo: boolean;
}

// Regras de sugestão automática: dre_group → codigo da linha DRE
const DRE_SUGGESTION_RULES: Record<string, { codigo: string; fator: number } | ((conta: ContaOperacional) => { codigo: string; fator: number })> = {
  receita_bruta: { codigo: "DRE.RB.01", fator: 1 },
  deducoes: { codigo: "DRE.RB.02", fator: 1 },
  custos: { codigo: "DRE.CMV.01", fator: 1 },
  despesas_operacionais: (conta) => {
    const n = conta.name.toLowerCase();
    if (n.includes("admin") || n.includes("contador") || n.includes("serviço")) return { codigo: "DRE.DO.01", fator: 1 };
    if (n.includes("marketing") || n.includes("publicidade") || n.includes("venda")) return { codigo: "DRE.DO.02", fator: 1 };
    return { codigo: "DRE.DO.03", fator: 1 };
  },
  depreciacoes_amortizacoes: { codigo: "DRE.DO.03", fator: 1 },
  resultado_financeiro: (conta) => {
    if (conta.account_nature === "credit") return { codigo: "DRE.RF.01", fator: 1 };
    return { codigo: "DRE.RF.02", fator: 1 };
  },
};

export default function MapeamentoContabil() {
  const { selectedCompany } = useCompany();
  const { activeClient } = useAuth();
  const db = activeClient as any;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [demFiltro, setDemFiltro] = useState<string>("DRE");
  const [expandedLines, setExpandedLines] = useState<Set<string>>(new Set());
  const [addingToLine, setAddingToLine] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Estado local dos mapeamentos (editável antes de salvar)
  const [localMaps, setLocalMaps] = useState<Mapeamento[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Buscar linhas do demonstrativo
  const { data: linhas = [], isLoading: loadingLinhas } = useQuery({
    queryKey: ["cont_linhas", selectedCompany?.id, demFiltro],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data } = await db
        .from("cont_linha_demonstrativo")
        .select("id, demonstrativo, codigo, nome, nivel, tipo_calculo, ordem")
        .eq("company_id", selectedCompany.id)
        .eq("demonstrativo", demFiltro)
        .eq("ativo", true)
        .order("ordem");
      return (data || []) as LinhaDemonstrativo[];
    },
    enabled: !!selectedCompany?.id,
  });

  // Buscar contas analíticas (com dre_group e account_nature)
  const { data: contas = [] } = useQuery({
    queryKey: ["contas_analiticas_full", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data } = await db
        .from("chart_of_accounts")
        .select("id, code, name, account_type, account_nature, is_analytical, dre_group")
        .eq("company_id", selectedCompany.id)
        .eq("is_analytical", true)
        .eq("status", "active")
        .order("code");
      return (data || []) as ContaOperacional[];
    },
    enabled: !!selectedCompany?.id,
  });

  // Buscar mapeamentos existentes do banco
  const { data: dbMapeamentos = [], isLoading: loadingMap } = useQuery({
    queryKey: ["cont_mapeamentos", selectedCompany?.id, demFiltro],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const linhaIds = linhas.map((l) => l.id);
      if (linhaIds.length === 0) return [];

      const { data } = await db
        .from("cont_mapeamento_contas")
        .select("id, conta_operacional_id, linha_demonstrativo_id, fator, ativo")
        .eq("company_id", selectedCompany.id)
        .in("linha_demonstrativo_id", linhaIds);

      return (data || []) as Mapeamento[];
    },
    enabled: !!selectedCompany?.id && linhas.length > 0,
  });

  // Sincronizar estado local com dados do banco
  useEffect(() => {
    if (dbMapeamentos.length > 0 || (!loadingMap && linhas.length > 0)) {
      setLocalMaps(dbMapeamentos.map((m) => ({ ...m })));
      setHasChanges(false);
    }
  }, [dbMapeamentos, loadingMap, linhas.length]);

  // Linhas que aceitam mapeamento (nivel >= 2, tipo soma)
  const linhasMapeáveis = useMemo(
    () => linhas.filter((l) => l.nivel >= 2 && l.tipo_calculo === "soma"),
    [linhas]
  );

  // Contas ainda não mapeadas
  const contasNaoMapeadas = useMemo(() => {
    const mapeadasIds = new Set(localMaps.filter((m) => m.ativo).map((m) => m.conta_operacional_id));
    return contas.filter((c) => !mapeadasIds.has(c.id));
  }, [contas, localMaps]);

  // Mapeamentos por linha
  const mapsByLine = useMemo(() => {
    const result: Record<string, (Mapeamento & { conta?: ContaOperacional })[]> = {};
    for (const l of linhasMapeáveis) {
      result[l.id] = localMaps
        .filter((m) => m.linha_demonstrativo_id === l.id && m.ativo)
        .map((m) => ({ ...m, conta: contas.find((c) => c.id === m.conta_operacional_id) }))
        .sort((a, b) => (a.conta?.code || "").localeCompare(b.conta?.code || ""));
    }
    return result;
  }, [localMaps, linhasMapeáveis, contas]);

  // ---------- AÇÕES ----------

  const toggleLine = (id: string) => {
    setExpandedLines((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const addMapping = (linhaId: string, contaId: string, fator: number = 1) => {
    // Verifica se já existe
    const existing = localMaps.find(
      (m) => m.conta_operacional_id === contaId && m.linha_demonstrativo_id === linhaId
    );
    if (existing) {
      if (!existing.ativo) {
        setLocalMaps((prev) =>
          prev.map((m) => (m === existing ? { ...m, ativo: true, fator } : m))
        );
        setHasChanges(true);
      }
      return;
    }
    setLocalMaps((prev) => [
      ...prev,
      { conta_operacional_id: contaId, linha_demonstrativo_id: linhaId, fator, ativo: true },
    ]);
    setHasChanges(true);
  };

  const removeMapping = (contaId: string, linhaId: string) => {
    setLocalMaps((prev) =>
      prev.map((m) =>
        m.conta_operacional_id === contaId && m.linha_demonstrativo_id === linhaId
          ? { ...m, ativo: false }
          : m
      )
    );
    setHasChanges(true);
  };

  const toggleFator = (contaId: string, linhaId: string) => {
    setLocalMaps((prev) =>
      prev.map((m) =>
        m.conta_operacional_id === contaId && m.linha_demonstrativo_id === linhaId
          ? { ...m, fator: m.fator === 1 ? -1 : 1 }
          : m
      )
    );
    setHasChanges(true);
  };

  // SUGESTÃO AUTOMÁTICA
  const sugerirMapeamento = useCallback(() => {
    if (linhasMapeáveis.length === 0 || contas.length === 0) return;

    let added = 0;
    const newMaps = [...localMaps];

    for (const conta of contas) {
      if (!conta.dre_group) continue;

      // Já está mapeada ativamente?
      const jaMapeada = newMaps.some(
        (m) => m.conta_operacional_id === conta.id && m.ativo
      );
      if (jaMapeada) continue;

      const rule = DRE_SUGGESTION_RULES[conta.dre_group];
      if (!rule) continue;

      const suggestion = typeof rule === "function" ? rule(conta) : rule;

      // Encontrar a linha pelo código
      const linha = linhasMapeáveis.find((l) => l.codigo === suggestion.codigo);
      if (!linha) continue;

      // Verificar se existe inativo
      const existingInactive = newMaps.find(
        (m) => m.conta_operacional_id === conta.id && m.linha_demonstrativo_id === linha.id
      );
      if (existingInactive) {
        existingInactive.ativo = true;
        existingInactive.fator = suggestion.fator;
      } else {
        newMaps.push({
          conta_operacional_id: conta.id,
          linha_demonstrativo_id: linha.id,
          fator: suggestion.fator,
          ativo: true,
        });
      }
      added++;
    }

    setLocalMaps(newMaps);
    if (added > 0) {
      setHasChanges(true);
      // Expandir todas as linhas que receberam mapeamentos
      setExpandedLines(new Set(linhasMapeáveis.map((l) => l.id)));
      toast({
        title: `${added} sugestões aplicadas`,
        description: "Revise os mapeamentos e clique em Salvar quando estiver pronto.",
      });
    } else {
      toast({
        title: "Nenhuma sugestão nova",
        description: "Todas as contas já estão mapeadas ou não possuem dre_group definido.",
      });
    }
  }, [contas, linhasMapeáveis, localMaps, toast]);

  // SALVAR TUDO
  const salvarTudo = async () => {
    if (!selectedCompany?.id) return;
    setSaving(true);

    try {
      // Separar: existentes (com id) vs novos (sem id)
      const toUpsert = localMaps
        .filter((m) => m.ativo)
        .map((m) => ({
          ...(m.id ? { id: m.id } : {}),
          company_id: selectedCompany.id,
          conta_operacional_id: m.conta_operacional_id,
          linha_demonstrativo_id: m.linha_demonstrativo_id,
          fator: m.fator,
          ativo: true,
        }));

      const toDeactivate = localMaps
        .filter((m) => !m.ativo && m.id)
        .map((m) => m.id!);

      // Upsert ativos
      if (toUpsert.length > 0) {
        const { error } = await db.from("cont_mapeamento_contas").upsert(toUpsert, {
          onConflict: "company_id,conta_operacional_id,linha_demonstrativo_id",
        });
        if (error) throw error;
      }

      // Deletar desativados
      if (toDeactivate.length > 0) {
        const { error } = await db
          .from("cont_mapeamento_contas")
          .delete()
          .in("id", toDeactivate);
        if (error) throw error;
      }

      toast({ title: "Mapeamento salvo com sucesso!" });
      setHasChanges(false);
      queryClient.invalidateQueries({ queryKey: ["cont_mapeamentos"] });
    } catch (err: any) {
      toast({
        title: "Erro ao salvar",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  // Copiar template
  const copiarTemplate = async () => {
    if (!selectedCompany?.id) return;
    const { error } = await db.rpc("fn_copiar_template_demonstrativos", {
      p_company_id: selectedCompany.id,
    });
    if (error) {
      toast({ title: "Erro ao copiar template", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Template copiado com sucesso" });
      queryClient.invalidateQueries({ queryKey: ["cont_linhas"] });
    }
  };

  // Stats
  const totalContas = contas.length;
  const contasMapeadas = new Set(localMaps.filter((m) => m.ativo).map((m) => m.conta_operacional_id)).size;
  const percentMapeado = totalContas > 0 ? Math.round((contasMapeadas / totalContas) * 100) : 0;

  return (
    <AppLayout title="Mapeamento Contábil">
      <div className="space-y-5 animate-fade-in">

        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">Mapeamento Contábil</h2>
            <p className="text-[12.5px] text-muted-foreground mt-0.5">
              Vincule contas do plano de contas às linhas dos demonstrativos
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={demFiltro} onValueChange={setDemFiltro}>
              <SelectTrigger className="w-[140px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DRE">DRE</SelectItem>
                <SelectItem value="BP">Balanço Patrimonial</SelectItem>
                <SelectItem value="DFC">Fluxo de Caixa</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={copiarTemplate}>
              <Copy className="h-3.5 w-3.5 mr-1" /> Importar Template
            </Button>
          </div>
        </div>

        {/* Progress bar + actions */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-semibold text-muted-foreground">
                Progresso do mapeamento
              </span>
              <span className="text-[11px] font-mono text-muted-foreground">
                {contasMapeadas}/{totalContas} contas ({percentMapeado}%)
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-500"
                style={{ width: `${percentMapeado}%` }}
              />
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={sugerirMapeamento}
            className="text-blue-400 border-blue-500/30 hover:bg-blue-500/10"
          >
            <Wand2 className="h-3.5 w-3.5 mr-1" /> Sugerir Automático
          </Button>
          <Button
            size="sm"
            onClick={salvarTudo}
            disabled={!hasChanges || saving}
            className={hasChanges ? "bg-green-600 hover:bg-green-700 text-white" : ""}
          >
            {saving ? (
              <div className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full mr-1" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1" />
            )}
            Salvar Mapeamento
          </Button>
        </div>

        {/* Aviso de alterações não salvas */}
        {hasChanges && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-[11px]">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            Existem alterações não salvas. Clique em "Salvar Mapeamento" para persistir.
          </div>
        )}

        {/* Estrutura do demonstrativo com mapeamentos inline */}
        <Card>
          <CardHeader className="border-b border-border py-3" style={{ backgroundColor: "#1E3A8A" }}>
            <CardTitle className="text-[13px] font-bold tracking-tight text-white flex items-center gap-2">
              <Settings2 className="h-4 w-4" /> Estrutura — {demFiltro}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loadingLinhas ? (
              <div className="text-center py-8">
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full mx-auto mb-2" />
                <p className="text-muted-foreground text-xs">Carregando...</p>
              </div>
            ) : linhas.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground text-sm">Nenhuma linha encontrada.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={copiarTemplate}>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Importar Template Padrão
                </Button>
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {linhas.map((l) => {
                  const isMappeable = l.nivel >= 2 && l.tipo_calculo === "soma";
                  const lineMaps = mapsByLine[l.id] || [];
                  const isExpanded = expandedLines.has(l.id);
                  const isAdding = addingToLine === l.id;

                  return (
                    <div key={l.id}>
                      {/* Linha principal */}
                      <div
                        className={`flex items-center gap-2 py-2.5 px-4 ${
                          l.nivel === 1
                            ? "bg-muted/20 font-semibold"
                            : "hover:bg-muted/10 cursor-pointer"
                        }`}
                        onClick={() => isMappeable && toggleLine(l.id)}
                      >
                        {/* Chevron */}
                        <div className="w-4 flex-shrink-0">
                          {isMappeable && (
                            isExpanded ? (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            )
                          )}
                        </div>

                        {/* Código */}
                        <span className="font-mono text-[11px] text-muted-foreground w-[90px] flex-shrink-0">
                          {l.codigo}
                        </span>

                        {/* Nome */}
                        <span className={`flex-1 text-[12.5px] ${l.nivel === 2 ? "pl-2" : ""}`}>
                          {l.nome}
                        </span>

                        {/* Tipo */}
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                            l.tipo_calculo === "resultado"
                              ? "bg-blue-500/20 text-blue-400"
                              : l.tipo_calculo === "manual"
                              ? "bg-yellow-500/20 text-yellow-400"
                              : "bg-green-500/20 text-green-400"
                          }`}
                        >
                          {l.tipo_calculo}
                        </span>

                        {/* Badge de contas mapeadas */}
                        {isMappeable && (
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-full font-mono flex-shrink-0 ${
                              lineMaps.length > 0
                                ? "bg-green-500/20 text-green-400 border border-green-500/30"
                                : "bg-muted/50 text-muted-foreground"
                            }`}
                          >
                            {lineMaps.length} {lineMaps.length === 1 ? "conta" : "contas"}
                          </span>
                        )}
                        {!isMappeable && l.tipo_calculo !== "soma" && (
                          <span className="text-muted-foreground text-[10px]">—</span>
                        )}
                      </div>

                      {/* Contas mapeadas (expandido) */}
                      {isMappeable && isExpanded && (
                        <div className="bg-muted/5 border-t border-border/30 px-4 py-2 ml-8">
                          {lineMaps.length === 0 && !isAdding && (
                            <p className="text-[11px] text-muted-foreground italic py-1">
                              Nenhuma conta vinculada. Use "Sugerir Automático" ou adicione manualmente.
                            </p>
                          )}

                          {/* Lista de contas mapeadas */}
                          {lineMaps.map((m) => (
                            <div
                              key={m.conta_operacional_id}
                              className="flex items-center gap-2 py-1 group"
                            >
                              <span className="font-mono text-[11px] text-muted-foreground w-[60px]">
                                {m.conta?.code}
                              </span>
                              <span className="flex-1 text-[11.5px]">{m.conta?.name}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleFator(m.conta_operacional_id, l.id);
                                }}
                                className={`text-[10px] px-1.5 py-0.5 rounded font-mono cursor-pointer hover:opacity-80 ${
                                  m.fator === 1
                                    ? "bg-green-500/20 text-green-400"
                                    : "bg-red-500/20 text-red-400"
                                }`}
                              >
                                {m.fator === 1 ? "+1" : "-1"}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeMapping(m.conta_operacional_id, l.id);
                                }}
                                className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 transition-opacity p-0.5"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}

                          {/* Botão/Select para adicionar conta */}
                          {isAdding ? (
                            <div className="flex items-center gap-2 mt-2">
                              <Select
                                onValueChange={(contaId) => {
                                  addMapping(l.id, contaId);
                                  setAddingToLine(null);
                                }}
                              >
                                <SelectTrigger className="h-7 text-[11px] flex-1">
                                  <SelectValue placeholder="Selecione uma conta..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {contasNaoMapeadas.map((c) => (
                                    <SelectItem key={c.id} value={c.id} className="text-[11px]">
                                      {c.code} — {c.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAddingToLine(null);
                                }}
                                className="text-muted-foreground hover:text-foreground p-1"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setAddingToLine(l.id);
                              }}
                              className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 mt-1.5 py-0.5"
                            >
                              <Plus className="h-3 w-3" /> Adicionar conta
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contas não mapeadas */}
        {contasNaoMapeadas.length > 0 && (
          <Card>
            <CardHeader className="border-b border-border py-3">
              <CardTitle className="text-[13px] font-bold tracking-tight flex items-center gap-2 text-yellow-400">
                <AlertCircle className="h-4 w-4" /> Contas sem mapeamento ({contasNaoMapeadas.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <div className="flex flex-wrap gap-1.5">
                {contasNaoMapeadas.slice(0, 30).map((c) => (
                  <span
                    key={c.id}
                    className="text-[10px] px-2 py-1 rounded bg-muted/50 text-muted-foreground border border-border/50"
                    title={`${c.code} — ${c.name} (${c.dre_group || "sem grupo DRE"})`}
                  >
                    {c.code} {c.name}
                  </span>
                ))}
                {contasNaoMapeadas.length > 30 && (
                  <span className="text-[10px] px-2 py-1 text-muted-foreground">
                    +{contasNaoMapeadas.length - 30} mais...
                  </span>
                )}
              </div>
              <p className="text-[10.5px] text-muted-foreground mt-2">
                Use o botão "Sugerir Automático" para mapear automaticamente contas com dre_group definido.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
