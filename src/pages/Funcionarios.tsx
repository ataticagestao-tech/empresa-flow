import { useState, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";

interface Employee {
  id: string; company_id: string; nome_completo: string; role: string | null;
  email: string | null; phone: string | null;
  cpf: string | null; rg: string | null; data_nascimento: string | null;
  hire_date: string | null; data_demissao: string | null;
  salary: number | null; salario_base: number | null;
  tipo_contrato: string | null; pis: string | null;
  ctps_numero: string | null; ctps_serie: string | null;
  banco_folha: string | null; agencia_folha: string | null;
  conta_folha: string | null; tipo_conta_folha: string | null;
  chave_pix_folha: string | null; centro_custo_id: string | null;
  status: string; created_at: string;
}

const emptyForm = {
  name: "", role: "", email: "", phone: "",
  cpf: "", rg: "", data_nascimento: "",
  hire_date: "", data_demissao: "", salary: "", tipo_contrato: "clt",
  pis: "", ctps_numero: "", ctps_serie: "",
  banco_folha: "", agencia_folha: "", conta_folha: "", tipo_conta_folha: "", chave_pix_folha: "",
  centro_custo_id: "",
  status: "ativo",
};

const tipoContratoLabels: Record<string, string> = {
  clt: "CLT", pj: "PJ", autonomo: "Autônomo", estagio: "Estágio", temporario: "Temporário",
};

const INSS_2025 = [
  { min: 0, max: 1518.00, aliq: 0.075 },
  { min: 1518.01, max: 2793.88, aliq: 0.09 },
  { min: 2793.89, max: 4190.83, aliq: 0.12 },
  { min: 4190.84, max: 8157.41, aliq: 0.14 },
];
const IRRF_2025 = [
  { min: 0, max: 2259.20, aliq: 0, ded: 0 },
  { min: 2259.21, max: 2826.65, aliq: 0.075, ded: 169.44 },
  { min: 2826.66, max: 3751.05, aliq: 0.15, ded: 381.44 },
  { min: 3751.06, max: 4664.68, aliq: 0.225, ded: 662.77 },
  { min: 4664.69, max: Infinity, aliq: 0.275, ded: 896.00 },
];
const DEDUCAO_DEPENDENTE = 189.59;

const calcularINSS = (salario: number) => {
  let total = 0;
  for (const faixa of INSS_2025) {
    if (salario <= faixa.min) break;
    const base = Math.min(salario, faixa.max) - faixa.min;
    total += base * faixa.aliq;
    if (salario <= faixa.max) break;
  }
  return Math.round(total * 100) / 100;
};

const calcularIRRF = (salario: number, inss: number, dependentes: number) => {
  const base = salario - inss - (dependentes * DEDUCAO_DEPENDENTE);
  if (base <= 0) return 0;
  for (const faixa of IRRF_2025) {
    if (base <= faixa.max) return Math.max(0, Math.round((base * faixa.aliq - faixa.ded) * 100) / 100);
  }
  return 0;
};

const IC = "border border-[#ccc] rounded-md px-3 py-2 text-sm text-[#0a0a0a] bg-white focus:border-[#1a2e4a] focus:outline-none w-full";
const LB = "text-[10px] font-bold uppercase tracking-wider text-[#0a0a0a]";

export default function Funcionarios() {
  const { activeClient } = useAuth();
  const { selectedCompany } = useCompany();
  const queryClient = useQueryClient();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState("dados");
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [calcSalario, setCalcSalario] = useState(0);
  const [calcDependentes, setCalcDependentes] = useState(0);

  const { data: centrosCusto = [] } = useQuery({
    queryKey: ["centros_custo", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data, error } = await (activeClient as any)
        .from("centros_custo").select("id, codigo, descricao").eq("company_id", selectedCompany.id).eq("ativo", true).order("codigo");
      if (error) throw error;
      return data as { id: string; codigo: string; descricao: string }[];
    },
    enabled: !!selectedCompany?.id,
  });

  const { data: employees = [], isLoading, error: employeesError } = useQuery({
    queryKey: ["employees", selectedCompany?.id],
    queryFn: async () => {
      if (!selectedCompany?.id) return [];
      const { data, error } = await (activeClient as any)
        .from("employees").select("*").eq("company_id", selectedCompany.id).order("nome_completo");
      if (error) throw error;
      return data as Employee[];
    },
    enabled: !!selectedCompany?.id,
  });

  const filtered = employees.filter(e => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (e.nome_completo || "").toLowerCase().includes(q) || (e.role || "").toLowerCase().includes(q) || (e.cpf || "").includes(q);
  });

  const selected = employees.find(e => e.id === selectedId) || null;
  const set = (k: string, v: string) => setFormData(f => ({ ...f, [k]: v }));

  const startEdit = (emp: Employee) => {
    setSelectedId(emp.id);
    setIsCreating(false);
    setFormData({
      name: emp.nome_completo || "", role: emp.role || "",
      email: emp.email || "", phone: emp.phone || "",
      cpf: emp.cpf || "", rg: emp.rg || "", data_nascimento: emp.data_nascimento || "",
      hire_date: emp.hire_date || "", data_demissao: emp.data_demissao || "",
      salary: emp.salario_base ? String(emp.salario_base) : emp.salary ? String(emp.salary) : "",
      tipo_contrato: emp.tipo_contrato || "clt",
      pis: emp.pis || "", ctps_numero: emp.ctps_numero || "", ctps_serie: emp.ctps_serie || "",
      banco_folha: emp.banco_folha || "", agencia_folha: emp.agencia_folha || "",
      conta_folha: emp.conta_folha || "", tipo_conta_folha: emp.tipo_conta_folha || "",
      chave_pix_folha: emp.chave_pix_folha || "", centro_custo_id: emp.centro_custo_id || "",
      status: emp.status || "ativo",
    });
    setCalcSalario(emp.salario_base || emp.salary || 0);
    setTab("dados");
  };

  const startNew = () => { setSelectedId(null); setIsCreating(true); setFormData(emptyForm); setTab("dados"); };

  const handleSave = async () => {
    if (!selectedCompany?.id || !formData.name.trim()) { toast.error("Nome é obrigatório"); return; }
    setSaving(true);
    try {
      const salarioVal = formData.salary ? parseFloat(formData.salary.replace(",", ".")) : null;
      const payload = {
        company_id: selectedCompany.id, nome_completo: formData.name.trim(), name: formData.name.trim(),
        role: formData.role || null,
        email: formData.email || null, phone: formData.phone || null,
        cpf: formData.cpf || null, rg: formData.rg || null,
        data_nascimento: formData.data_nascimento || null,
        hire_date: formData.hire_date || null, data_demissao: formData.data_demissao || null,
        salary: salarioVal, salario_base: salarioVal,
        tipo_contrato: formData.tipo_contrato || null,
        pis: formData.pis || null, ctps_numero: formData.ctps_numero || null, ctps_serie: formData.ctps_serie || null,
        banco_folha: formData.banco_folha || null, agencia_folha: formData.agencia_folha || null,
        conta_folha: formData.conta_folha || null, tipo_conta_folha: formData.tipo_conta_folha || null,
        chave_pix_folha: formData.chave_pix_folha || null,
        centro_custo_id: formData.centro_custo_id || null, status: formData.status,
      };
      if (selectedId && !isCreating) {
        const { error } = await (activeClient as any).from("employees").update(payload).eq("id", selectedId);
        if (error) throw error;
        toast.success("Funcionário atualizado");
      } else {
        const { error } = await (activeClient as any).from("employees").insert(payload);
        if (error) throw error;
        toast.success("Funcionário cadastrado");
        setIsCreating(false);
      }
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    } catch (err: any) { toast.error("Erro: " + (err.message || "Erro desconhecido")); }
    finally { setSaving(false); }
  };

  const handleDelete = async (emp: Employee) => {
    if (!confirm(`Excluir "${emp.nome_completo}"?`)) return;
    try {
      const { error } = await (activeClient as any).from("employees").delete().eq("id", emp.id);
      if (error) throw error;
      toast.success("Excluído");
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      if (selectedId === emp.id) { setSelectedId(null); setIsCreating(false); }
    } catch (err: any) { toast.error("Erro: " + err.message); }
  };

  const inssCalc = useMemo(() => calcularINSS(calcSalario), [calcSalario]);
  const irrfCalc = useMemo(() => calcularIRRF(calcSalario, inssCalc, calcDependentes), [calcSalario, inssCalc, calcDependentes]);
  const fgts = Math.round(calcSalario * 0.08 * 100) / 100;
  const liquido = Math.round((calcSalario - inssCalc - irrfCalc) * 100) / 100;
  const inssPatronal = Math.round(calcSalario * 0.20 * 100) / 100;
  const custoTotal = Math.round((calcSalario + fgts + inssPatronal) * 100) / 100;

  const initials = (name: string) => (name || "?").split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("").toUpperCase();
  const showDetail = selected || isCreating;

  return (
    <AppLayout title="Funcionários">
      <div className="flex gap-4 h-[calc(100vh-120px)]">
        {/* LEFT: List */}
        <div className="w-1/3 min-w-[280px] border border-[#ccc] rounded-lg overflow-hidden flex flex-col bg-white">
          <div className="bg-[#1a2e4a] px-4 py-2.5 flex items-center justify-between">
            <h3 className="text-xs font-bold text-white uppercase tracking-widest">Funcionários</h3>
            <button onClick={startNew} className="text-xs font-semibold text-[#a8bfd4] hover:text-white">+ Novo</button>
          </div>
          <div className="p-3 border-b border-[#eee]">
            <input type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className={IC} />
          </div>
          <div className="flex-1 overflow-y-auto">
            {employeesError ? <p className="text-center py-8 text-sm text-[#8b0000]">Erro: {(employeesError as any).message || "Erro ao carregar"}</p> :
             isLoading ? <p className="text-center py-8 text-sm text-[#555]">Carregando...</p> :
             filtered.length === 0 ? <p className="text-center py-8 text-sm text-[#555]">Nenhum funcionário</p> :
             filtered.map(emp => (
              <div key={emp.id} onClick={() => startEdit(emp)}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-[#f0f0f0] transition-all ${
                  selectedId === emp.id ? "bg-[#f0f4f8] border-l-2 border-l-[#1a2e4a]" : "hover:bg-[#fafafa]"
                }`}>
                <div className="w-9 h-9 rounded-full bg-[#1a2e4a] flex items-center justify-center text-white text-xs font-bold shrink-0">{initials(emp.name)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#0a0a0a] truncate">{emp.name}</p>
                  <p className="text-[11px] text-[#555] truncate">{emp.role || "Sem cargo"} · {tipoContratoLabels[emp.tipo_contrato || ""] || "—"}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold text-[#0a0a0a]">{formatBRL(emp.salario_base || emp.salary || 0)}</p>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    emp.status === "ativo" || emp.status === "active" ? "bg-[#e6f4ec] text-[#0a5c2e]" : "bg-[#f0f0f0] text-[#555]"
                  }`}>{emp.status === "ativo" || emp.status === "active" ? "Ativo" : emp.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Detail */}
        <div className="flex-1 border border-[#ccc] rounded-lg overflow-hidden flex flex-col bg-white">
          {!showDetail ? (
            <div className="flex-1 flex items-center justify-center text-sm text-[#555]">Selecione um funcionário ou clique em "+ Novo"</div>
          ) : (
            <>
              <div className="bg-[#1a2e4a] px-4 py-2 flex items-center gap-1">
                {[{ id: "dados", label: "Dados Cadastrais" }, { id: "salarios", label: "Histórico de Salários" },
                  { id: "comissoes", label: "Comissões" }, { id: "calculadora", label: "Calculadora" }].map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded transition-all ${
                      tab === t.id ? "bg-white/20 text-white" : "text-[#a8bfd4] hover:text-white"
                    }`}>{t.label}</button>
                ))}
                {selected && <button onClick={() => handleDelete(selected)} className="ml-auto text-[10px] font-bold text-[#ff9999] hover:text-white px-2">Excluir</button>}
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                {tab === "dados" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="flex flex-col gap-1"><label className={LB}>Nome Completo <span className="text-[#8b0000]">*</span></label><input value={formData.name} onChange={e => set("name", e.target.value)} className={IC} /></div>
                      <div className="flex flex-col gap-1"><label className={LB}>CPF</label><input value={formData.cpf} onChange={e => set("cpf", e.target.value)} placeholder="000.000.000-00" className={IC} /></div>
                      <div className="flex flex-col gap-1"><label className={LB}>Data de Nascimento</label><input type="date" value={formData.data_nascimento} onChange={e => set("data_nascimento", e.target.value)} className={IC} /></div>
                    </div>
                    <div className="grid grid-cols-5 gap-4">
                      <div className="flex flex-col gap-1"><label className={LB}>Cargo</label><input value={formData.role} onChange={e => set("role", e.target.value)} className={IC} /></div>
                      <div className="flex flex-col gap-1"><label className={LB}>Tipo Contrato</label>
                        <select value={formData.tipo_contrato} onChange={e => set("tipo_contrato", e.target.value)} className={IC}>
                          <option value="clt">CLT</option><option value="pj">PJ</option><option value="autonomo">Autônomo</option><option value="estagio">Estágio</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1"><label className={LB}>Centro de Custo</label>
                        <select value={formData.centro_custo_id} onChange={e => set("centro_custo_id", e.target.value)} className={IC}>
                          <option value="">Nenhum</option>
                          {centrosCusto.map((c: any) => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} — ` : ""}{c.descricao}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1"><label className={LB}>Data Admissão</label><input type="date" value={formData.hire_date} onChange={e => set("hire_date", e.target.value)} className={IC} /></div>
                      <div className="flex flex-col gap-1"><label className={LB}>Salário Base (R$)</label><input value={formData.salary} onChange={e => set("salary", e.target.value)} placeholder="0,00" className={IC} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1"><label className={LB}>Email</label><input type="email" value={formData.email} onChange={e => set("email", e.target.value)} className={IC} /></div>
                      <div className="flex flex-col gap-1"><label className={LB}>Telefone</label><input value={formData.phone} onChange={e => set("phone", e.target.value)} className={IC} /></div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="flex flex-col gap-1"><label className={LB}>Banco</label><input value={formData.banco_folha} onChange={e => set("banco_folha", e.target.value)} className={IC} /></div>
                      <div className="flex flex-col gap-1"><label className={LB}>Agência / Conta</label><input value={formData.agencia_folha} onChange={e => set("agencia_folha", e.target.value)} placeholder="0000 / 00000-0" className={IC} /></div>
                      <div className="flex flex-col gap-1"><label className={LB}>Tipo de Conta</label>
                        <select value={formData.tipo_conta_folha} onChange={e => set("tipo_conta_folha", e.target.value)} className={IC}>
                          <option value="">Selecione</option><option value="corrente">Corrente</option><option value="poupanca">Poupança</option><option value="pix">PIX</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1"><label className={LB}>Status</label>
                      <select value={formData.status} onChange={e => set("status", e.target.value)} className={`${IC} max-w-[200px]`}>
                        <option value="ativo">Ativo</option><option value="inativo">Inativo</option><option value="afastado">Afastado</option><option value="ferias">Férias</option>
                      </select>
                    </div>
                    <button onClick={handleSave} disabled={saving} className="bg-[#1a2e4a] text-white text-sm font-bold px-6 py-2 rounded-md disabled:opacity-40">
                      {saving ? "Salvando..." : isCreating ? "Cadastrar" : "Salvar Alterações"}
                    </button>
                  </div>
                )}

                {tab === "salarios" && (
                  <div className="space-y-4">
                    <div className="border border-[#ccc] rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-[#f5f5f5]">
                          <tr><th className="text-left px-4 py-2 text-[10px] font-bold uppercase text-[#555]">Vigência</th><th className="text-left px-4 py-2 text-[10px] font-bold uppercase text-[#555]">Salário Base</th><th className="text-left px-4 py-2 text-[10px] font-bold uppercase text-[#555]">Variação</th><th className="text-left px-4 py-2 text-[10px] font-bold uppercase text-[#555]">Motivo</th></tr>
                        </thead>
                        <tbody>
                          {selected ? (
                            <tr className="border-t border-[#eee] font-bold">
                              <td className="px-4 py-2.5">{selected.hire_date ? new Date(selected.hire_date + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                              <td className="px-4 py-2.5">{formatBRL(selected.salario_base || selected.salary || 0)}</td>
                              <td className="px-4 py-2.5"><span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[#f0f4f8] text-[#1a2e4a]">Atual</span></td>
                              <td className="px-4 py-2.5 text-[#555]">Admissão</td>
                            </tr>
                          ) : <tr><td colSpan={4} className="px-4 py-8 text-center text-[#555]">Selecione um funcionário</td></tr>}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-[#555]">Histórico completo será carregado quando a tabela salary_history estiver disponível.</p>
                  </div>
                )}

                {tab === "comissoes" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      {["Jan/2026", "Fev/2026", "Mar/2026"].map((mes, i) => (
                        <div key={i} className="border border-[#ccc] rounded-lg overflow-hidden">
                          <div className="bg-[#1a2e4a] px-3 py-2"><span className="text-[10px] font-bold text-white uppercase tracking-wider">{mes}</span></div>
                          <div className="p-3 bg-white text-center">
                            <p className="text-lg font-bold text-[#0a0a0a]">R$ 0,00</p>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded border border-[#ccc] bg-[#f5f5f5] text-[#555]">Sem lançamento</span>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-[#555]">Lançamento de comissões será habilitado quando as tabelas estiverem configuradas.</p>
                  </div>
                )}

                {tab === "calculadora" && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1"><label className={LB}>Salário Base (R$)</label><input type="number" value={calcSalario || ""} onChange={e => setCalcSalario(Number(e.target.value))} className={IC} placeholder="0,00" /></div>
                      <div className="flex flex-col gap-1"><label className={LB}>Dependentes</label>
                        <select value={calcDependentes} onChange={e => setCalcDependentes(Number(e.target.value))} className={IC}>
                          {[0,1,2,3,4].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="border border-[#ccc] rounded-lg overflow-hidden">
                          <div className="bg-[#1a2e4a] px-3 py-2"><span className="text-[10px] font-bold text-white uppercase tracking-wider">INSS — Detalhamento por faixa</span></div>
                          <table className="w-full text-xs">
                            <thead className="bg-[#f5f5f5]"><tr><th className="px-3 py-1.5 text-left text-[9px] font-bold uppercase text-[#555]">Faixa</th><th className="px-3 py-1.5 text-left text-[9px] font-bold uppercase text-[#555]">Alíq.</th><th className="px-3 py-1.5 text-right text-[9px] font-bold uppercase text-[#555]">Valor</th></tr></thead>
                            <tbody>
                              {INSS_2025.map((f, i) => {
                                if (calcSalario <= f.min) return null;
                                const base = Math.min(calcSalario, f.max) - f.min;
                                const val = Math.round(base * f.aliq * 100) / 100;
                                return (<tr key={i} className="border-t border-[#eee]"><td className="px-3 py-1.5">Até {formatBRL(f.max)}</td><td className="px-3 py-1.5">{(f.aliq * 100).toFixed(1)}%</td><td className="px-3 py-1.5 text-right font-semibold">{formatBRL(val)}</td></tr>);
                              })}
                              <tr className="border-t-2 border-[#1a2e4a] font-bold"><td className="px-3 py-2" colSpan={2}>Total INSS</td><td className="px-3 py-2 text-right">{formatBRL(inssCalc)}</td></tr>
                            </tbody>
                          </table>
                        </div>
                        <div className="border border-[#ccc] rounded-lg overflow-hidden">
                          <div className="bg-[#1a2e4a] px-3 py-2"><span className="text-[10px] font-bold text-white uppercase tracking-wider">IRRF</span></div>
                          <div className="p-3 text-xs space-y-1">
                            <div className="flex justify-between"><span className="text-[#555]">Base de cálculo</span><span className="font-semibold">{formatBRL(Math.max(0, calcSalario - inssCalc - calcDependentes * DEDUCAO_DEPENDENTE))}</span></div>
                            <div className="flex justify-between"><span className="text-[#555]">Dedução dependentes ({calcDependentes})</span><span className="font-semibold">{formatBRL(calcDependentes * DEDUCAO_DEPENDENTE)}</span></div>
                            <div className="flex justify-between border-t border-[#eee] pt-1 font-bold"><span>IRRF</span><span>{formatBRL(irrfCalc)}</span></div>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div className="border-2 border-[#1a2e4a] rounded-lg p-5">
                          <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#1a2e4a] mb-4">Resumo do Colaborador</h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-[#555]">Salário Bruto</span><span className="font-bold">{formatBRL(calcSalario)}</span></div>
                            <div className="flex justify-between text-[#8b0000]"><span>(-) INSS</span><span>{formatBRL(inssCalc)}</span></div>
                            <div className="flex justify-between text-[#8b0000]"><span>(-) IRRF</span><span>{formatBRL(irrfCalc)}</span></div>
                            <div className="flex justify-between border-t-2 border-[#1a2e4a] pt-2 mt-2">
                              <span className="font-bold text-[#0a5c2e] text-base">Líquido</span>
                              <span className="font-bold text-[#0a5c2e] text-base">{formatBRL(liquido)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="border border-[#ccc] rounded-lg p-5">
                          <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#555] mb-4">Custo Empresa</h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-[#555]">Salário</span><span>{formatBRL(calcSalario)}</span></div>
                            <div className="flex justify-between"><span className="text-[#555]">FGTS (8%)</span><span>{formatBRL(fgts)}</span></div>
                            <div className="flex justify-between"><span className="text-[#555]">INSS Patronal (20%)</span><span>{formatBRL(inssPatronal)}</span></div>
                            <div className="flex justify-between border-t border-[#eee] pt-2 font-bold"><span>Custo Total</span><span className="text-[#8b0000]">{formatBRL(custoTotal)}</span></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
