import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings2, Plus, Trash2, RefreshCw, Copy } from "lucide-react";
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
  is_analytical: boolean;
}

interface Mapeamento {
  id: string;
  conta_operacional_id: string;
  linha_demonstrativo_id: string;
  fator: number;
  ativo: boolean;
  conta?: ContaOperacional;
  linha?: LinhaDemonstrativo;
}

export default function MapeamentoContabil() {
  const { selectedCompany } = useCompany();
  const { activeClient } = useAuth();
  const db = activeClient as any;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [demFiltro, setDemFiltro] = useState<string>("DRE");

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

  // Buscar contas analíticas
  const { data: contas = [] } = useQuery({
    queryKey: ["contas_analiticas", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data } = await db
        .from("chart_of_accounts")
        .select("id, code, name, account_type, is_analytical")
        .eq("company_id", selectedCompany.id)
        .eq("is_analytical", true)
        .eq("status", "active")
        .order("code");
      return (data || []) as ContaOperacional[];
    },
    enabled: !!selectedCompany?.id,
  });

  // Buscar mapeamentos existentes
  const { data: mapeamentos = [], isLoading: loadingMap } = useQuery({
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

      return (data || []).map((m: any) => ({
        ...m,
        conta: contas.find((c) => c.id === m.conta_operacional_id),
        linha: linhas.find((l) => l.id === m.linha_demonstrativo_id),
      })) as Mapeamento[];
    },
    enabled: !!selectedCompany?.id && linhas.length > 0 && contas.length > 0,
  });

  // Estado para novo mapeamento
  const [novoContaId, setNovoContaId] = useState("");
  const [novoLinhaId, setNovoLinhaId] = useState("");
  const [novoFator, setNovoFator] = useState("1");

  const adicionarMapeamento = async () => {
    if (!selectedCompany?.id || !novoContaId || !novoLinhaId) return;

    const { error } = await db.from("cont_mapeamento_contas").upsert(
      {
        company_id: selectedCompany.id,
        conta_operacional_id: novoContaId,
        linha_demonstrativo_id: novoLinhaId,
        fator: parseInt(novoFator),
        ativo: true,
      },
      { onConflict: "company_id,conta_operacional_id,linha_demonstrativo_id" }
    );

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Mapeamento salvo" });
      setNovoContaId("");
      setNovoLinhaId("");
      setNovoFator("1");
      queryClient.invalidateQueries({ queryKey: ["cont_mapeamentos"] });
    }
  };

  const removerMapeamento = async (id: string) => {
    const { error } = await db.from("cont_mapeamento_contas").delete().eq("id", id);
    if (!error) {
      toast({ title: "Mapeamento removido" });
      queryClient.invalidateQueries({ queryKey: ["cont_mapeamentos"] });
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

  // Linhas filhas (nível 2, tipo soma) que aceitam mapeamento
  const linhasMapeáveis = linhas.filter((l) => l.nivel >= 2 && l.tipo_calculo === "soma");

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

        {/* Estrutura do demonstrativo */}
        <Card>
          <CardHeader className="border-b border-border py-3" style={{ backgroundColor: "#1a2e4a" }}>
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
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-2 px-4 font-semibold w-[100px]">Código</th>
                    <th className="text-left py-2 px-4 font-semibold">Descrição</th>
                    <th className="text-left py-2 px-4 font-semibold w-[90px]">Tipo</th>
                    <th className="text-left py-2 px-4 font-semibold w-[80px]">Contas</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l) => {
                    const mapsCount = mapeamentos.filter(
                      (m) => m.linha_demonstrativo_id === l.id && m.ativo
                    ).length;
                    return (
                      <tr
                        key={l.id}
                        className={`border-b border-border/50 ${l.nivel === 1 ? "bg-muted/20 font-semibold" : "hover:bg-muted/10"}`}
                      >
                        <td className="py-2 px-4 font-mono text-[11px] text-muted-foreground">{l.codigo}</td>
                        <td className={`py-2 px-4 ${l.nivel === 2 ? "pl-8" : ""}`}>{l.nome}</td>
                        <td className="py-2 px-4">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              l.tipo_calculo === "resultado"
                                ? "bg-blue-500/20 text-blue-400"
                                : l.tipo_calculo === "manual"
                                ? "bg-yellow-500/20 text-yellow-400"
                                : "bg-green-500/20 text-green-400"
                            }`}
                          >
                            {l.tipo_calculo}
                          </span>
                        </td>
                        <td className="py-2 px-4 text-center">
                          {l.tipo_calculo === "soma" && l.nivel >= 2 ? (
                            <span className={`text-xs font-mono ${mapsCount > 0 ? "text-green-400" : "text-muted-foreground"}`}>
                              {mapsCount}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* Adicionar mapeamento */}
        <Card>
          <CardHeader className="border-b border-border py-3">
            <CardTitle className="text-[13px] font-bold tracking-tight flex items-center gap-2">
              <Plus className="h-4 w-4" /> Adicionar Mapeamento
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Conta Operacional</label>
                <Select value={novoContaId} onValueChange={setNovoContaId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Selecione uma conta..." />
                  </SelectTrigger>
                  <SelectContent>
                    {contas.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.code} — {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Linha do {demFiltro}</label>
                <Select value={novoLinhaId} onValueChange={setNovoLinhaId}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Selecione uma linha..." />
                  </SelectTrigger>
                  <SelectContent>
                    {linhasMapeáveis.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.codigo} — {l.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[100px]">
                <label className="text-[11px] font-semibold text-muted-foreground mb-1 block">Fator</label>
                <Select value={novoFator} onValueChange={setNovoFator}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">+1 (natural)</SelectItem>
                    <SelectItem value="-1">-1 (inverter)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={adicionarMapeamento} disabled={!novoContaId || !novoLinhaId}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Lista de mapeamentos existentes */}
        <Card>
          <CardHeader className="border-b border-border py-3">
            <CardTitle className="text-[13px] font-bold tracking-tight flex items-center gap-2">
              Mapeamentos Existentes ({mapeamentos.filter((m) => m.ativo).length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loadingMap ? (
              <div className="text-center py-8">
                <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
              </div>
            ) : mapeamentos.filter((m) => m.ativo).length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground text-xs">Nenhum mapeamento configurado para {demFiltro}.</p>
              </div>
            ) : (
              <table className="w-full text-[12.5px]">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left py-2 px-4 font-semibold">Conta Operacional</th>
                    <th className="text-left py-2 px-4 font-semibold">Linha Demonstrativo</th>
                    <th className="text-center py-2 px-4 font-semibold w-[60px]">Fator</th>
                    <th className="text-center py-2 px-4 font-semibold w-[60px]">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {mapeamentos
                    .filter((m) => m.ativo)
                    .sort((a, b) => (a.linha?.codigo || "").localeCompare(b.linha?.codigo || ""))
                    .map((m) => (
                      <tr key={m.id} className="border-b border-border/50 hover:bg-muted/10">
                        <td className="py-2 px-4">
                          <span className="font-mono text-[11px] text-muted-foreground mr-2">
                            {m.conta?.code}
                          </span>
                          {m.conta?.name}
                        </td>
                        <td className="py-2 px-4">
                          <span className="font-mono text-[11px] text-muted-foreground mr-2">
                            {m.linha?.codigo}
                          </span>
                          {m.linha?.nome}
                        </td>
                        <td className="text-center py-2 px-4">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                              m.fator === 1 ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                            }`}
                          >
                            {m.fator === 1 ? "+1" : "-1"}
                          </span>
                        </td>
                        <td className="text-center py-2 px-4">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                            onClick={() => removerMapeamento(m.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
