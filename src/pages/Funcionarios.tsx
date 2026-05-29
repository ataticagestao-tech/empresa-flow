import { useState, useMemo } from "react";
import { Copy } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatBRL, toTitleCase } from "@/lib/format";
import AbaBeneficios from "@/components/funcionarios/AbaBeneficios";
import { EmployeeDuplicatesDialog } from "@/components/funcionarios/DuplicatesDialog";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { gerarRelatorioFuncionarioPDF, type RelatorioFuncionarioData } from "@/lib/funcionario-pdf/gerar-pdf";
import { ExportMenu, type ExportColumn } from "@/components/ExportMenu";
import { WhatsappValidatorButton } from "@/components/whatsapp/WhatsappValidatorButton";
import { SolicitarCadastroDialog } from "@/components/cadastros/SolicitarCadastroDialog";
import { SendWhatsAppDialog } from "@/components/whatsapp/SendWhatsAppDialog";

interface Employee {
  id: string; company_id: string;
  nome_completo?: string | null; name?: string | null;
  role: string | null; email: string | null; phone: string | null;
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

const getName = (e: Employee) => e.nome_completo || e.name || "";

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

const BANCOS_BR = [
  "Banco do Brasil", "Bradesco", "Caixa Econômica Federal", "Itaú Unibanco",
  "Santander", "Nubank", "Inter", "C6 Bank", "BTG Pactual", "Safra",
  "Sicoob", "Sicredi", "Banrisul", "Original", "PagBank", "Mercado Pago",
  "Neon", "Next", "Picpay", "Stone", "Outro",
];

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

// Formatters
const titleCase = (str: string) =>
  str.toLowerCase().replace(/(?:^|\s)\S/g, (c) => c.toUpperCase());

const formatCPF = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return d.slice(0, 3) + "." + d.slice(3);
  if (d.length <= 9) return d.slice(0, 3) + "." + d.slice(3, 6) + "." + d.slice(6);
  return d.slice(0, 3) + "." + d.slice(3, 6) + "." + d.slice(6, 9) + "-" + d.slice(9);
};

const formatPhone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? "(" + d : "";
  if (d.length <= 6) return "(" + d.slice(0, 2) + ") " + d.slice(2);
  if (d.length <= 10) return "(" + d.slice(0, 2) + ") " + d.slice(2, 6) + "-" + d.slice(6);
  return "(" + d.slice(0, 2) + ") " + d.slice(2, 7) + "-" + d.slice(7);
};

const formatSalary = (v: string) => {
  const clean = v.replace(/[^\d,]/g, "");
  const parts = clean.split(",");
  if (parts.length > 2) return parts[0] + "," + parts.slice(1).join("");
  if (parts[1] && parts[1].length > 2) return parts[0] + "," + parts[1].slice(0, 2);
  return clean;
};

const onlyDigits = (v: string) => v.replace(/\D/g, "");

const IC = "border border-[#ccc] rounded-md px-3 py-2 text-sm text-[#1D2939] bg-white focus:border-[#059669] focus:outline-none w-full";
const ICE = "border border-[#c00] rounded-md px-3 py-2 text-sm text-[#1D2939] bg-[#fff8f8] focus:border-[#c00] focus:outline-none w-full";
const LB = "text-[10px] font-bold uppercase tracking-wider text-[#1D2939]";
const REQ = <span className="text-[#E53E3E]">*</span>;

export default function Funcionarios() {
  const { activeClient, user } = useAuth();
  const { selectedCompany } = useCompany();
  const queryClient = useQueryClient();
  const confirm = useConfirm();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState("dados");
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [calcSalario, setCalcSalario] = useState(0);
  const [calcDependentes, setCalcDependentes] = useState(0);
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [isDupOpen, setIsDupOpen] = useState(false);
  const [solicitarOpen, setSolicitarOpen] = useState(false);
  const [solicitarTarget, setSolicitarTarget] = useState<{ id?: string; nome?: string; tel?: string }>({});
  const [whatsOpen, setWhatsOpen] = useState(false);

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
        .from("employees").select("*").eq("company_id", selectedCompany.id).order("created_at", { ascending: false });
      if (error) throw error;
      return data as Employee[];
    },
    enabled: !!selectedCompany?.id,
  });

  const filtered = employees.filter(e => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const n = getName(e).toLowerCase();
    return n.includes(q) || (e.role || "").toLowerCase().includes(q) || (e.cpf || "").includes(q);
  });

  const selected = employees.find(e => e.id === selectedId) || null;
  const set = (k: string, v: string) => {
    setFormData(f => ({ ...f, [k]: v }));
    setErrors(e => ({ ...e, [k]: false }));
  };

  const onlyDigitsHelper = (v: string | null | undefined) => (v || "").replace(/\D/g, "");
  const normalizeName = (v: string | null | undefined) =>
    (v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

  const { data: pagamentos = [], isLoading: loadingPagamentos } = useQuery({
    queryKey: ["pagamentos-funcionario", selected?.id, selected?.cpf, selected?.chave_pix_folha],
    queryFn: async () => {
      if (!selected?.id || !selectedCompany?.id) return [];
      const db = activeClient as any;
      const cpfDigits = onlyDigitsHelper(selected.cpf);
      const fullName = normalizeName(getName(selected));
      const tokens = fullName.split(" ").filter(t => t.length >= 3);
      const pix = (selected.chave_pix_folha || "").trim();

      const [folhaRes, benRes, candidatosRes] = await Promise.all([
        db.from("folha_pagamento")
          .select("id, competencia, tipo, valor_liquido, status, conta_pagar_id, cp:conta_pagar_id(id, status, data_pagamento, valor_pago, valor, deleted_at, conta_bancaria_id, bank:conta_bancaria_id(name))")
          .eq("company_id", selectedCompany.id)
          .eq("employee_id", selected.id)
          .order("competencia", { ascending: false }),
        db.from("employee_benefits_lancamentos")
          .select("id, competencia, vt_custo_empresa, va_custo_empresa, cp_vt_id, cp_va_id, cp_vt:cp_vt_id(id, status, data_pagamento, valor_pago, valor, deleted_at, bank:conta_bancaria_id(name)), cp_va:cp_va_id(id, status, data_pagamento, valor_pago, valor, deleted_at, bank:conta_bancaria_id(name))")
          .eq("company_id", selectedCompany.id)
          .eq("employee_id", selected.id)
          .order("competencia", { ascending: false }),
        (async () => {
          if (!cpfDigits && tokens.length === 0 && !pix) return { data: [] };
          const orParts: string[] = [];
          if (cpfDigits) {
            orParts.push(`credor_cpf_cnpj.ilike.*${cpfDigits.slice(0, 3)}*${cpfDigits.slice(3, 6)}*${cpfDigits.slice(6, 9)}*`);
          }
          for (const t of tokens) orParts.push(`credor_nome.ilike.*${t}*`);
          if (pix) orParts.push(`observacoes.ilike.*${pix}*`);
          let q = db.from("contas_pagar")
            .select("id, valor, valor_pago, data_vencimento, data_pagamento, status, descricao, observacoes, credor_nome, credor_cpf_cnpj, bank:conta_bancaria_id(name), categoria:conta_contabil_id(name)")
            .eq("company_id", selectedCompany.id)
            .is("deleted_at", null)
            .order("data_vencimento", { ascending: false })
            .limit(500);
          if (orParts.length) q = q.or(orParts.join(","));
          return await q;
        })(),
      ]);

      // Strict filter on candidates: must match CPF, full name, all tokens, or PIX
      const manuaisRes = {
        data: ((candidatosRes.data ?? []) as any[]).filter(cp => {
          const cpCpf = onlyDigitsHelper(cp.credor_cpf_cnpj);
          if (cpfDigits && cpCpf === cpfDigits) return true;
          const cpName = normalizeName(cp.credor_nome);
          if (cpName && fullName && (cpName === fullName || cpName.startsWith(fullName) || fullName.startsWith(cpName))) return true;
          if (cpName && tokens.length >= 2 && tokens.every(t => cpName.includes(t))) return true;
          if (pix && cp.observacoes && cp.observacoes.includes(pix)) return true;
          return false;
        }),
      };

      const linkedCpIds = new Set<string>();
      const folhaRows = (folhaRes.data ?? []).map((f: any) => {
        if (f.conta_pagar_id) linkedCpIds.add(f.conta_pagar_id);
        const cpStatus = f.cp?.status;
        const cpDeleted = !!f.cp?.deleted_at;
        const tipoLabel = f.tipo === "mensal" ? "Salário" : f.tipo === "ferias" ? "Férias" : f.tipo === "rescisao" ? "Rescisão" : f.tipo === "13_primeiro" ? "13º — 1ª parc." : f.tipo === "13_segundo" ? "13º — 2ª parc." : f.tipo === "adiantamento" ? "Adiantamento" : f.tipo;
        return {
          id: `folha-${f.id}`,
          tipo: tipoLabel,
          competencia: f.competencia,
          valor: Number(f.cp?.valor_pago ?? f.valor_liquido ?? f.cp?.valor ?? 0),
          data_pagamento: f.cp?.data_pagamento ?? null,
          conta: f.cp?.bank?.name ?? null,
          status: cpDeleted ? "cancelado" : (cpStatus ?? (f.status === "paga" ? "pago" : "aberto")),
          source: "folha" as const,
        };
      });

      const benRows: any[] = [];
      for (const b of benRes.data ?? []) {
        if (b.cp_vt_id) linkedCpIds.add(b.cp_vt_id);
        if (b.cp_va_id) linkedCpIds.add(b.cp_va_id);
        if (Number(b.vt_custo_empresa) > 0) {
          const cpDeleted = !!b.cp_vt?.deleted_at;
          benRows.push({
            id: `ben-vt-${b.id}`,
            tipo: "Vale Transporte",
            competencia: b.competencia,
            valor: Number(b.cp_vt?.valor_pago ?? b.vt_custo_empresa ?? 0),
            data_pagamento: b.cp_vt?.data_pagamento ?? null,
            conta: b.cp_vt?.bank?.name ?? null,
            status: cpDeleted ? "cancelado" : (b.cp_vt?.status ?? "aberto"),
            source: "beneficio" as const,
          });
        }
        if (Number(b.va_custo_empresa) > 0) {
          const cpDeleted = !!b.cp_va?.deleted_at;
          benRows.push({
            id: `ben-va-${b.id}`,
            tipo: "Vale Alimentação",
            competencia: b.competencia,
            valor: Number(b.cp_va?.valor_pago ?? b.va_custo_empresa ?? 0),
            data_pagamento: b.cp_va?.data_pagamento ?? null,
            conta: b.cp_va?.bank?.name ?? null,
            status: cpDeleted ? "cancelado" : (b.cp_va?.status ?? "aberto"),
            source: "beneficio" as const,
          });
        }
      }

      const manuaisRows = ((manuaisRes.data ?? []) as any[])
        .filter(c => !linkedCpIds.has(c.id))
        .map(c => ({
          id: `cp-${c.id}`,
          cp_id: c.id,
          cp_cpf: c.credor_cpf_cnpj ?? null,
          tipo: c.descricao?.trim() || c.observacoes?.trim() || c.credor_nome || "CP manual",
          competencia: c.data_vencimento ? c.data_vencimento.slice(0, 7) : "",
          valor: Number(c.valor_pago ?? c.valor ?? 0),
          data_pagamento: c.data_pagamento ?? null,
          conta: c.bank?.name ?? null,
          status: c.status ?? "aberto",
          source: "manual" as const,
          searchBlob: `${c.descricao || ''} ${c.observacoes || ''} ${c.credor_nome || ''} ${c.categoria?.name || ''}`.toLowerCase(),
        }));

      const all = [...folhaRows, ...benRows, ...manuaisRows];
      all.sort((a, b) => {
        const ak = a.data_pagamento ?? a.competencia ?? "";
        const bk = b.data_pagamento ?? b.competencia ?? "";
        return bk.localeCompare(ak);
      });
      return all;
    },
    enabled: !!selected?.id && !!selectedCompany?.id && (tab === "salarios" || tab === "comissoes"),
  });

  const totalPagoFunc = useMemo(
    () => pagamentos.filter((p: any) => p.status === "pago").reduce((s: number, p: any) => s + (Number(p.valor) || 0), 0),
    [pagamentos]
  );

  const comissoes = useMemo(
    () => pagamentos.filter((p: any) => /comiss/i.test(p.searchBlob || p.tipo || "")),
    [pagamentos]
  );
  const totalComissoesPago = useMemo(
    () => comissoes.filter((p: any) => p.status === "pago").reduce((s: number, p: any) => s + (Number(p.valor) || 0), 0),
    [comissoes]
  );

  const [gerandoPDF, setGerandoPDF] = useState(false);

  const gerarPDFFuncionario = async () => {
    if (!selected || !selectedCompany?.id) return;
    setGerandoPDF(true);
    try {
      const db = activeClient as any;
      const cpfDigits = onlyDigitsHelper(selected.cpf);
      const fullName = normalizeName(getName(selected));
      const tokens = fullName.split(" ").filter(t => t.length >= 3);
      const pix = (selected.chave_pix_folha || "").trim();

      const [folhaRes, benRes, candidatosRes, beneficiosRes, ccRes] = await Promise.all([
        db.from("folha_pagamento")
          .select("id, competencia, tipo, valor_liquido, status, conta_pagar_id, cp:conta_pagar_id(id, status, data_pagamento, valor_pago, valor, deleted_at, bank:conta_bancaria_id(name))")
          .eq("company_id", selectedCompany.id)
          .eq("employee_id", selected.id)
          .order("competencia", { ascending: false }),
        db.from("employee_benefits_lancamentos")
          .select("id, competencia, vt_custo_empresa, va_custo_empresa, cp_vt_id, cp_va_id, cp_vt:cp_vt_id(id, status, data_pagamento, valor_pago, valor, deleted_at, bank:conta_bancaria_id(name)), cp_va:cp_va_id(id, status, data_pagamento, valor_pago, valor, deleted_at, bank:conta_bancaria_id(name))")
          .eq("company_id", selectedCompany.id)
          .eq("employee_id", selected.id)
          .order("competencia", { ascending: false }),
        (async () => {
          if (!cpfDigits && tokens.length === 0 && !pix) return { data: [] };
          const orParts: string[] = [];
          if (cpfDigits) orParts.push(`credor_cpf_cnpj.ilike.*${cpfDigits.slice(0, 3)}*${cpfDigits.slice(3, 6)}*${cpfDigits.slice(6, 9)}*`);
          for (const t of tokens) orParts.push(`credor_nome.ilike.*${t}*`);
          if (pix) orParts.push(`observacoes.ilike.*${pix}*`);
          let q = db.from("contas_pagar")
            .select("id, valor, valor_pago, data_vencimento, data_pagamento, status, descricao, observacoes, credor_nome, credor_cpf_cnpj, bank:conta_bancaria_id(name), categoria:conta_contabil_id(name)")
            .eq("company_id", selectedCompany.id)
            .is("deleted_at", null)
            .order("data_vencimento", { ascending: false })
            .limit(500);
          if (orParts.length) q = q.or(orParts.join(","));
          return await q;
        })(),
        db.from("employee_benefits_lancamentos")
          .select("competencia, dias_uteis, dias_considerados, vt_custo_empresa, va_custo_empresa, total_custo_empresa, status")
          .eq("company_id", selectedCompany.id)
          .eq("employee_id", selected.id)
          .order("competencia", { ascending: false }),
        selected.centro_custo_id
          ? db.from("centros_custo").select("codigo, descricao").eq("id", selected.centro_custo_id).single()
          : Promise.resolve({ data: null }),
      ]);

      const linkedCpIds = new Set<string>();
      const folhaRows = (folhaRes.data ?? []).map((f: any) => {
        if (f.conta_pagar_id) linkedCpIds.add(f.conta_pagar_id);
        const cpDeleted = !!f.cp?.deleted_at;
        const tipoLabel = f.tipo === "mensal" ? "Salário" : f.tipo === "ferias" ? "Férias" : f.tipo === "rescisao" ? "Rescisão" : f.tipo === "13_primeiro" ? "13º — 1ª parc." : f.tipo === "13_segundo" ? "13º — 2ª parc." : f.tipo === "adiantamento" ? "Adiantamento" : f.tipo;
        return {
          tipo: tipoLabel,
          competencia: f.competencia,
          valor: Number(f.cp?.valor_pago ?? f.valor_liquido ?? f.cp?.valor ?? 0),
          data_pagamento: f.cp?.data_pagamento ?? null,
          conta: f.cp?.bank?.name ?? null,
          status: cpDeleted ? "cancelado" : (f.cp?.status ?? (f.status === "paga" ? "pago" : "aberto")),
          source: "folha" as const,
          searchBlob: tipoLabel.toLowerCase(),
        };
      });

      const benRows: any[] = [];
      for (const b of benRes.data ?? []) {
        if (b.cp_vt_id) linkedCpIds.add(b.cp_vt_id);
        if (b.cp_va_id) linkedCpIds.add(b.cp_va_id);
        if (Number(b.vt_custo_empresa) > 0) {
          benRows.push({
            tipo: "Vale Transporte",
            competencia: b.competencia,
            valor: Number(b.cp_vt?.valor_pago ?? b.vt_custo_empresa ?? 0),
            data_pagamento: b.cp_vt?.data_pagamento ?? null,
            conta: b.cp_vt?.bank?.name ?? null,
            status: b.cp_vt?.deleted_at ? "cancelado" : (b.cp_vt?.status ?? "aberto"),
            source: "beneficio" as const,
            searchBlob: "vale transporte",
          });
        }
        if (Number(b.va_custo_empresa) > 0) {
          benRows.push({
            tipo: "Vale Alimentação",
            competencia: b.competencia,
            valor: Number(b.cp_va?.valor_pago ?? b.va_custo_empresa ?? 0),
            data_pagamento: b.cp_va?.data_pagamento ?? null,
            conta: b.cp_va?.bank?.name ?? null,
            status: b.cp_va?.deleted_at ? "cancelado" : (b.cp_va?.status ?? "aberto"),
            source: "beneficio" as const,
            searchBlob: "vale alimentacao",
          });
        }
      }

      const manuaisRows = ((candidatosRes.data ?? []) as any[])
        .filter((cp: any) => {
          if (linkedCpIds.has(cp.id)) return false;
          const cpCpf = onlyDigitsHelper(cp.credor_cpf_cnpj);
          if (cpfDigits && cpCpf === cpfDigits) return true;
          const cpName = normalizeName(cp.credor_nome);
          if (cpName && fullName && (cpName === fullName || cpName.startsWith(fullName) || fullName.startsWith(cpName))) return true;
          if (cpName && tokens.length >= 2 && tokens.every(t => cpName.includes(t))) return true;
          if (pix && cp.observacoes && cp.observacoes.includes(pix)) return true;
          return false;
        })
        .map((c: any) => ({
          tipo: c.descricao?.trim() || c.observacoes?.trim() || c.credor_nome || "CP manual",
          competencia: c.data_vencimento ? c.data_vencimento.slice(0, 7) : "",
          valor: Number(c.valor_pago ?? c.valor ?? 0),
          data_pagamento: c.data_pagamento ?? null,
          conta: c.bank?.name ?? null,
          status: c.status ?? "aberto",
          source: "manual" as const,
          searchBlob: `${c.descricao || ''} ${c.observacoes || ''} ${c.credor_nome || ''} ${c.categoria?.name || ''}`.toLowerCase(),
        }));

      const allPagamentos = [...folhaRows, ...benRows, ...manuaisRows]
        .sort((a, b) => (b.data_pagamento ?? b.competencia ?? "").localeCompare(a.data_pagamento ?? a.competencia ?? ""));
      const comissoes = allPagamentos.filter(p => /comiss/i.test(p.searchBlob || p.tipo || ""));
      const beneficiosMes = ((beneficiosRes.data ?? []) as any[]).map(b => ({
        competencia: b.competencia,
        dias_uteis: Number(b.dias_uteis) || 0,
        dias_considerados: Number(b.dias_considerados) || 0,
        vt_custo_empresa: Number(b.vt_custo_empresa) || 0,
        va_custo_empresa: Number(b.va_custo_empresa) || 0,
        total_custo_empresa: Number(b.total_custo_empresa) || 0,
        status: b.status || "—",
      }));
      const cc = (ccRes as any).data;

      const payload: RelatorioFuncionarioData = {
        empresa_nome: selectedCompany.nome_fantasia || selectedCompany.razao_social || "Empresa",
        empresa_cnpj: selectedCompany.cnpj ?? null,
        empresa_razao: selectedCompany.razao_social ?? null,
        logo_url: (selectedCompany as any).logo_url ?? null,
        funcionario: {
          nome: getName(selected),
          cpf: selected.cpf,
          rg: selected.rg,
          data_nascimento: selected.data_nascimento,
          cargo: selected.role,
          tipo_contrato: selected.tipo_contrato,
          hire_date: selected.hire_date,
          data_demissao: selected.data_demissao,
          salario_base: Number(selected.salario_base || selected.salary || 0),
          centro_custo: cc ? `${cc.codigo ? cc.codigo + " — " : ""}${cc.descricao}` : null,
          email: selected.email,
          phone: selected.phone,
          banco_folha: selected.banco_folha,
          agencia_folha: selected.agencia_folha,
          conta_folha: selected.conta_folha,
          tipo_conta_folha: selected.tipo_conta_folha,
          chave_pix_folha: selected.chave_pix_folha,
          pis: selected.pis,
          ctps_numero: selected.ctps_numero,
          ctps_serie: selected.ctps_serie,
          status: selected.status || "—",
        },
        pagamentos: allPagamentos,
        beneficios: beneficiosMes,
        comissoes,
      };

      const blob = await gerarRelatorioFuncionarioPDF(payload);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = getName(selected).replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
      a.download = `relatorio-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("PDF gerado.");
    } catch (err: any) {
      console.error("Erro ao gerar PDF:", err);
      toast.error("Erro ao gerar PDF: " + (err.message || "desconhecido"));
    } finally {
      setGerandoPDF(false);
    }
  };

  const vincularPagamento = async (cpId: string) => {
    if (!selected?.cpf) {
      toast.error("Cadastre o CPF do funcionário antes de vincular.");
      return;
    }
    const cpfDigits = onlyDigitsHelper(selected.cpf);
    const ok = await confirm({
      title: "Vincular este pagamento ao funcionário?",
      description: `O CPF ${selected.cpf} será gravado nesta conta a pagar e o vínculo passará a ser permanente.`,
      confirmLabel: "Sim, vincular",
    });
    if (!ok) return;
    try {
      const { error } = await (activeClient as any)
        .from("contas_pagar").update({ credor_cpf_cnpj: cpfDigits }).eq("id", cpId);
      if (error) throw error;
      toast.success("Pagamento vinculado ao funcionário.");
      queryClient.invalidateQueries({ queryKey: ["pagamentos-funcionario", selected.id] });
    } catch (err: any) {
      toast.error("Erro ao vincular: " + (err.message || err.details || "desconhecido"));
    }
  };

  const startEdit = (emp: Employee) => {
    setSelectedId(emp.id);
    setIsCreating(false);
    setErrors({});
    setFormData({
      name: getName(emp), role: emp.role || "",
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

  const startNew = () => { setSelectedId(null); setIsCreating(true); setFormData(emptyForm); setErrors({}); setTab("dados"); };

  const validate = () => {
    const errs: Record<string, boolean> = {};
    if (formData.cpf.trim() && formData.cpf.replace(/\D/g, "").length < 11) errs.cpf = true;
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.error("CPF inválido");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!selectedCompany?.id) return;
    if (!validate()) return;
    setSaving(true);
    try {
      const salarioVal = formData.salary ? parseFloat(formData.salary.replace(/\./g, "").replace(",", ".")) : null;
      const nameVal = toTitleCase(formData.name);

      // Build payload dynamically — only include fields with values
      const payload: Record<string, any> = {
        company_id: selectedCompany.id,
        nome_completo: nameVal,
        name: nameVal,
      };

      if (formData.role) payload.role = toTitleCase(formData.role);
      if (formData.email) payload.email = formData.email.trim().toLowerCase();
      if (formData.phone) payload.phone = formData.phone.trim();
      if (formData.cpf) payload.cpf = formData.cpf.trim();
      if (formData.data_nascimento) payload.data_nascimento = formData.data_nascimento;
      if (formData.hire_date) payload.hire_date = formData.hire_date;
      if (formData.data_demissao) payload.data_demissao = formData.data_demissao;
      if (salarioVal !== null) { payload.salary = salarioVal; payload.salario_base = salarioVal; }
      if (formData.tipo_contrato) payload.tipo_contrato = formData.tipo_contrato;
      if (formData.banco_folha) payload.banco_folha = formData.banco_folha;
      if (formData.agencia_folha) payload.agencia_folha = formData.agencia_folha.trim();
      if (formData.conta_folha) payload.conta_folha = formData.conta_folha.trim();
      if (formData.tipo_conta_folha) payload.tipo_conta_folha = formData.tipo_conta_folha;
      if (formData.chave_pix_folha) payload.chave_pix_folha = formData.chave_pix_folha.trim();
      if (formData.centro_custo_id) payload.centro_custo_id = formData.centro_custo_id;
      payload.status = (formData.status || "ativo").toLowerCase();

      console.log("Payload:", JSON.stringify(payload));

      const doSave = async (p: Record<string, any>) => {
        if (selectedId && !isCreating) {
          return await (activeClient as any).from("employees").update(p).eq("id", selectedId);
        }
        return await (activeClient as any).from("employees").insert(p);
      };

      let { error } = await doSave(payload);

      // Retry without 'nome_completo' if DB only has 'name'
      if (error && error.message?.includes("nome_completo")) {
        delete payload.nome_completo;
        ({ error } = await doSave(payload));
      }
      // Retry without 'name' if DB only has 'nome_completo'
      else if (error && error.message?.includes("column") && error.message?.includes("name")) {
        delete payload.name;
        payload.nome_completo = nameVal;
        ({ error } = await doSave(payload));
      }

      if (error) throw error;
      toast.success(selectedId && !isCreating ? "Funcionário atualizado" : "Funcionário cadastrado");
      if (isCreating) setIsCreating(false);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    } catch (err: any) {
      console.error("Erro ao salvar:", err);
      toast.error("Erro: " + (err.message || err.details || err.hint || "Erro desconhecido"));
    }
    finally { setSaving(false); }
  };

  const handleDelete = async (emp: Employee) => {
    const ok = await confirm({
      title: `Excluir "${getName(emp)}"?`,
      description: "Esta ação não pode ser desfeita.",
      confirmLabel: "Sim, excluir",
      variant: "destructive",
    });
    if (!ok) return;
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
  const ic = (field: string) => errors[field] ? ICE : IC;
  const statusLabel = (s: string) => {
    if (s === "active" || s === "ativo") return "Ativo";
    if (s === "inactive" || s === "inativo") return "Inativo";
    return s;
  };
  const isActive = (s: string) => s === "active" || s === "ativo";

  const fmtCadExport = (iso?: string | null) =>
    iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
  const employeesExportRows = [...employees].sort((a, b) => getName(a).localeCompare(getName(b), "pt-BR"));
  const employeesExportColumns: ExportColumn<Employee>[] = [
    { header: "Nome", pdfFlex: 20, value: (e) => getName(e) || "—" },
    { header: "CPF", pdfFlex: 11, value: (e) => (e.cpf ? formatCPF(e.cpf) : "—") },
    { header: "Cargo", pdfFlex: 13, value: (e) => e.role || "—" },
    { header: "Contrato", pdfFlex: 7, align: "center", value: (e) => tipoContratoLabels[e.tipo_contrato || ""] || "—" },
    { header: "Admissão", pdfFlex: 9, align: "center", value: (e) => (e.hire_date ? new Date(e.hire_date + "T12:00:00").toLocaleDateString("pt-BR") : "—") },
    { header: "Cadastro", pdfFlex: 9, align: "center", value: (e) => fmtCadExport(e.created_at) },
    { header: "Salário", pdfFlex: 11, align: "right", value: (e) => formatBRL(Number(e.salario_base || e.salary || 0)), numericValue: (e) => Number(e.salario_base || e.salary || 0) },
    { header: "Telefone", pdfFlex: 11, value: (e) => (e.phone ? formatPhone(e.phone) : "—") },
    { header: "Status", pdfFlex: 7, align: "center", value: (e) => (isActive(e.status) ? "Ativo" : "Inativo") },
  ];

  return (
    <AppLayout title="Funcionários">
      <div className="py-3 h-[calc(100vh-120px)]">
        <div className="bg-white rounded-xl border border-[#EAECF0] shadow-sm p-4 h-full flex flex-col">
        {/* ═══ MENU SUPERIOR (header da página) ═══ */}
        <div className="border border-[#ccc] rounded-lg overflow-hidden bg-white shrink-0 mb-3">
          <div className="bg-[#2A2724] px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-[14px] font-bold uppercase tracking-wider text-white">Funcionários</h1>
              <p className="text-[11px] text-white/80 mt-0.5">Cadastro de funcionários e dados trabalhistas</p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => { setSolicitarTarget({}); setSolicitarOpen(true); }} className="text-white/80 hover:text-white p-1.5 rounded hover:bg-white/10" title="Solicitar dados via WhatsApp"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path fill="#25D366" d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2z"/><path fill="#fff" d="M9.36 7.32c-.18-.4-.36-.41-.53-.42h-.45c-.16 0-.41.06-.63.3-.22.24-.83.81-.83 1.98 0 1.17.85 2.3.97 2.46.12.16 1.65 2.64 4.08 3.6 2.02.8 2.43.64 2.87.6.44-.04 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28-.24-.12-1.42-.7-1.64-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.93-1.19-.71-.64-1.19-1.42-1.33-1.66-.14-.24-.01-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.53-1.31-.74-1.79z"/></svg></button>
              <button onClick={() => setIsDupOpen(true)} className="text-white/80 hover:text-white p-1.5 rounded hover:bg-white/10" title="Localizar duplicados"><Copy className="h-4 w-4" /></button>
              <ExportMenu rows={employeesExportRows} columns={employeesExportColumns} titulo="FUNCIONÁRIOS" baseName="funcionarios" orientacao="portrait" size="sm" disabled={!employees.length} />
              <button onClick={startNew} className="text-[11px] font-bold text-white border border-white/40 hover:bg-white/20 rounded px-2 py-1 ml-1">+ Novo</button>
            </div>
          </div>
        </div>
        <div className="flex gap-4 flex-1 min-h-0">
        {/* LEFT: List */}
        <div className="w-1/3 min-w-[280px] border border-[#ccc] rounded-lg overflow-hidden flex flex-col bg-white">
          <div className="p-3 border-b border-[#eee]">
            <input type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} className={IC} />
          </div>
          <div className="flex-1 overflow-y-auto">
            {employeesError ? <p className="text-center py-8 text-sm text-[#E53E3E]">Erro: {(employeesError as any).message || "Erro ao carregar"}</p> :
             isLoading ? (
               <div>
                 {Array.from({ length: 6 }).map((_, i) => (
                   <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-[#EAECF0]">
                     <Skeleton className="w-9 h-9 rounded-full shrink-0" />
                     <div className="flex-1 space-y-1.5">
                       <Skeleton className="h-3.5 w-3/5" />
                       <Skeleton className="h-3 w-2/5" />
                     </div>
                   </div>
                 ))}
               </div>
             ) :
             filtered.length === 0 ? <p className="text-center py-8 text-sm text-[#555]">Nenhum funcionário</p> :
             filtered.map(emp => (
              <div key={emp.id} onClick={() => startEdit(emp)}
                className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-[#EAECF0] transition-all ${
                  selectedId === emp.id ? "bg-[#ECFDF4] border-l-2 border-l-[#059669]" : "hover:bg-[#F6F2EB]"
                }`}>
                <div className="w-9 h-9 rounded-full bg-[#059669] flex items-center justify-center text-[#064E3B] text-xs font-bold shrink-0">{initials(getName(emp))}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#1D2939] truncate">{getName(emp)}</p>
                  <p className="text-[11px] text-[#555] truncate">{emp.role || "Sem cargo"} · {tipoContratoLabels[emp.tipo_contrato || ""] || "—"}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs font-bold text-[#1D2939]">{formatBRL(emp.salario_base || emp.salary || 0)}</p>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                    isActive(emp.status) ? "bg-[#ECFDF3] text-[#039855]" : "bg-[#EAECF0] text-[#555]"
                  }`}>{statusLabel(emp.status)}</span>
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
              <div className="bg-[#059669] px-3 py-2 flex items-center gap-1 overflow-x-auto">
                {[{ id: "dados", label: "Dados Cadastrais" }, { id: "salarios", label: "Salários" },
                  { id: "comissoes", label: "Comissões" }, { id: "calculadora", label: "Calculadora" }, { id: "beneficios", label: "Benefícios" }].map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={`shrink-0 whitespace-nowrap text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded transition-all ${
                      tab === t.id ? "bg-white text-[#064E3B]" : "text-white/90 hover:bg-white/20"
                    }`}>{t.label}</button>
                ))}
                {selected && <div className="ml-auto" />}
                {selected?.phone && <button onClick={() => setWhatsOpen(true)} title="Enviar mensagem no WhatsApp" className="shrink-0 whitespace-nowrap text-[10px] font-bold text-white border border-white/40 hover:bg-white/20 rounded px-2.5 py-1 flex items-center gap-1"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2z"/></svg>WhatsApp</button>}
                {selected && <button onClick={gerarPDFFuncionario} disabled={gerandoPDF} className="shrink-0 whitespace-nowrap text-[10px] font-bold text-white border border-white/40 hover:bg-white/20 rounded px-2.5 py-1 disabled:opacity-50">{gerandoPDF ? "Gerando…" : "PDF"}</button>}
                {selected && <button onClick={() => handleDelete(selected)} className="shrink-0 whitespace-nowrap text-[10px] font-bold text-white/90 hover:bg-[#991B1B] hover:text-white rounded px-2.5 py-1 transition-colors">Excluir</button>}
              </div>

              <div className="flex-1 overflow-y-auto p-5">
                {tab === "dados" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-[2fr_1fr_1fr] gap-4">
                      <div className="flex flex-col gap-1">
                        <label className={LB}>Nome Completo {REQ}</label>
                        <input value={formData.name} onChange={e => set("name", titleCase(e.target.value))} className={ic("name")} placeholder="Nome Sobrenome" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className={LB}>CPF</label>
                        <input value={formData.cpf} onChange={e => set("cpf", formatCPF(e.target.value))} className={ic("cpf")} placeholder="000.000.000-00" maxLength={14} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className={LB}>Data de Nascimento</label>
                        <input type="date" value={formData.data_nascimento} onChange={e => set("data_nascimento", e.target.value)} className={ic("data_nascimento")} />
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className={LB}>Cargo</label>
                        <input value={formData.role} onChange={e => set("role", titleCase(e.target.value))} className={ic("role")} placeholder="Ex: Vendedora" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className={LB}>Tipo Contrato</label>
                        <select value={formData.tipo_contrato} onChange={e => set("tipo_contrato", e.target.value)} className={ic("tipo_contrato")}>
                          <option value="">Selecione</option>
                          <option value="clt">CLT</option><option value="pj">PJ</option><option value="autonomo">Autônomo</option><option value="estagio">Estágio</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className={LB}>Centro de Custo</label>
                        <select value={formData.centro_custo_id} onChange={e => set("centro_custo_id", e.target.value)} className={ic("centro_custo_id")}>
                          <option value="">Selecione</option>
                          {centrosCusto.map((c: any) => <option key={c.id} value={c.id}>{c.codigo ? `${c.codigo} — ` : ""}{c.descricao}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className={LB}>Data Admissão</label>
                        <input type="date" value={formData.hire_date} onChange={e => set("hire_date", e.target.value)} className={ic("hire_date")} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className={LB}>Salário Base (R$)</label>
                        <input value={formData.salary} onChange={e => set("salary", formatSalary(e.target.value))} className={ic("salary")} placeholder="0,00" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className={LB}>Email</label>
                        <input type="email" value={formData.email} onChange={e => set("email", e.target.value)} className={IC} placeholder="email@exemplo.com" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className={LB}>Telefone</label>
                        <div className="flex gap-2 items-start">
                          <input
                            value={formData.phone}
                            onChange={e => set("phone", formatPhone(e.target.value))}
                            className={IC}
                            placeholder="(00) 00000-0000"
                            maxLength={15}
                          />
                          <WhatsappValidatorButton phone={formData.phone} />
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className={LB}>Banco</label>
                        <select value={formData.banco_folha} onChange={e => set("banco_folha", e.target.value)} className={ic("banco_folha")}>
                          <option value="">Selecione</option>
                          {BANCOS_BR.map(b => <option key={b} value={b}>{b}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className={LB}>Agência</label>
                        <input value={formData.agencia_folha} onChange={e => set("agencia_folha", onlyDigits(e.target.value))} className={ic("agencia_folha")} placeholder="0000" maxLength={6} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className={LB}>Conta</label>
                        <input value={formData.conta_folha} onChange={e => set("conta_folha", onlyDigits(e.target.value))} className={ic("conta_folha")} placeholder="00000000" maxLength={12} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className={LB}>Tipo de Conta</label>
                        <select value={formData.tipo_conta_folha} onChange={e => set("tipo_conta_folha", e.target.value)} className={ic("tipo_conta_folha")}>
                          <option value="">Selecione</option><option value="corrente">Corrente</option><option value="poupanca">Poupança</option><option value="pix">PIX</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={LB}>Chave PIX</label>
                      <input value={formData.chave_pix_folha} onChange={e => set("chave_pix_folha", e.target.value)} className={IC} placeholder="CPF, email, telefone ou chave aleatória" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className={LB}>Status</label>
                      <select value={formData.status} onChange={e => set("status", e.target.value)} className={`${IC} max-w-[200px]`}>
                        <option value="ativo">Ativo</option><option value="inativo">Inativo</option><option value="ferias">Férias</option><option value="afastado">Afastado</option><option value="demitido">Demitido</option>
                      </select>
                    </div>
                    <button onClick={handleSave} disabled={saving} className="bg-[#059669] text-white text-sm font-bold px-6 py-2 rounded-md disabled:opacity-40">
                      {saving ? "Salvando..." : isCreating ? "Cadastrar" : "Salvar Alterações"}
                    </button>
                  </div>
                )}

                {tab === "salarios" && (
                  <div className="space-y-4">
                    <div className="border border-[#ccc] rounded-lg overflow-hidden">
                      <div className="bg-[#F6F2EB] px-3 py-1.5"><span className="text-[9px] font-bold uppercase tracking-wider text-[#555]">Salário Base Atual</span></div>
                      <table className="w-full text-xs">
                        <thead className="bg-[#F6F2EB]">
                          <tr>
                            <th className="text-left px-2.5 py-1.5 text-[9px] font-bold uppercase text-[#555]">Vigência</th>
                            <th className="text-left px-2.5 py-1.5 text-[9px] font-bold uppercase text-[#555]">Salário</th>
                            <th className="text-left px-2.5 py-1.5 text-[9px] font-bold uppercase text-[#555]">Var.</th>
                            <th className="text-left px-2.5 py-1.5 text-[9px] font-bold uppercase text-[#555]">Motivo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selected ? (
                            <tr className="border-t border-[#eee] font-semibold">
                              <td className="px-2.5 py-1.5">{selected.hire_date ? new Date(selected.hire_date + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</td>
                              <td className="px-2.5 py-1.5">{formatBRL(selected.salario_base || selected.salary || 0)}</td>
                              <td className="px-2.5 py-1.5"><span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#ECFDF4] text-[#059669]">Atual</span></td>
                              <td className="px-2.5 py-1.5 text-[#555]">Admissão</td>
                            </tr>
                          ) : <tr><td colSpan={4} className="px-3 py-6 text-center text-[#555]">Selecione um funcionário</td></tr>}
                        </tbody>
                      </table>
                    </div>

                    <div className="border border-[#ccc] rounded-lg overflow-hidden">
                      <div className="bg-[#059669] px-3 py-1.5 flex items-center justify-between gap-2">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-white">Pagamentos</span>
                        <span className="text-[9px] font-bold text-white/90 whitespace-nowrap">Total: {formatBRL(totalPagoFunc)}</span>
                      </div>
                      {loadingPagamentos ? (
                        <div className="p-6 text-center text-[#555] text-xs">Carregando…</div>
                      ) : pagamentos.length === 0 ? (
                        <div className="p-6 text-center text-[#555] text-xs">
                          Nenhum lançamento encontrado.
                          {!selected?.cpf && <div className="mt-1 text-[10px]">Cadastre o CPF para identificar CPs manuais.</div>}
                        </div>
                      ) : (
                        <div className="divide-y divide-[#eee]">
                          {pagamentos.map((p: any) => {
                            const compLabel = p.competencia && /^\d{4}-\d{2}/.test(p.competencia)
                              ? p.competencia.slice(2, 7).split("-").reverse().join("/")
                              : (p.competencia || "—");
                            const statusBadge =
                              p.status === "pago"   ? "bg-[#ECFDF4] text-[#059669]" :
                              p.status === "parcial"? "bg-[#FEF3C7] text-[#92400E]" :
                              p.status === "vencido"? "bg-[#FEE2E2] text-[#991B1B]" :
                              p.status === "cancelado" ? "bg-[#EAECF0] text-[#555]" :
                                                      "bg-[#F6F2EB] text-[#555]";
                            const statusLabel =
                              p.status === "pago" ? "Pago" :
                              p.status === "parcial" ? "Parcial" :
                              p.status === "vencido" ? "Vencido" :
                              p.status === "cancelado" ? "Cancelado" :
                              "Em aberto";
                            const sourceDot =
                              p.source === "folha"     ? "bg-[#3730A3]" :
                              p.source === "beneficio" ? "bg-[#9D174D]" :
                                                        "bg-[#aaa]";
                            const sourceTitle =
                              p.source === "folha" ? "Folha" :
                              p.source === "beneficio" ? "Benefício" :
                              "Manual";
                            const podeVincular = p.source === "manual" && p.cp_id && (!p.cp_cpf || onlyDigitsHelper(p.cp_cpf) !== onlyDigitsHelper(selected?.cpf));
                            const dataPagoLabel = p.data_pagamento ? new Date(p.data_pagamento + "T12:00:00").toLocaleDateString("pt-BR") : null;
                            return (
                              <div key={p.id} className="px-3 py-2 hover:bg-[#FAFAF7]">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${sourceDot}`} title={sourceTitle}></span>
                                    <span className="text-[10px] font-bold text-[#555] tabular-nums shrink-0">{compLabel}</span>
                                    <span className="text-[12px] text-[#1D2939] truncate" title={p.tipo}>{p.tipo}</span>
                                  </div>
                                  <span className="text-[12px] font-bold text-[#1D2939] tabular-nums whitespace-nowrap shrink-0">{formatBRL(p.valor)}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 mt-1 pl-4">
                                  <div className="flex items-center gap-2 text-[10px] text-[#777] min-w-0">
                                    <span className={`font-bold px-1.5 py-0.5 rounded ${statusBadge}`}>{statusLabel}</span>
                                    {dataPagoLabel && <span className="whitespace-nowrap">Pago {dataPagoLabel}</span>}
                                    {p.conta && <span className="truncate">· {p.conta}</span>}
                                  </div>
                                  {podeVincular && selected?.cpf ? (
                                    <button onClick={() => vincularPagamento(p.cp_id)} title="Gravar CPF na conta a pagar" className="text-[10px] font-bold text-[#059669] hover:bg-[#ECFDF4] rounded px-2 py-0.5 shrink-0">Vincular</button>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="bg-[#F6F2EB] px-3 py-1.5 border-t border-[#eee] flex items-center gap-3 text-[9px] text-[#555]">
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#3730A3]"></span>Folha</span>
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#9D174D]"></span>Benefício</span>
                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#aaa]"></span>Manual</span>
                      </div>
                    </div>
                  </div>
                )}

                {tab === "comissoes" && (
                  <div className="space-y-4">
                    <div className="border border-[#ccc] rounded-lg overflow-hidden">
                      <div className="bg-[#059669] px-3 py-1.5 flex items-center justify-between gap-2">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-white">Comissões pagas</span>
                        <span className="text-[9px] font-bold text-white/90 whitespace-nowrap">Total: {formatBRL(totalComissoesPago)}</span>
                      </div>
                      {loadingPagamentos ? (
                        <div className="p-6 text-center text-[#555] text-xs">Carregando…</div>
                      ) : comissoes.length === 0 ? (
                        <div className="p-6 text-center text-[#555] text-xs">
                          Nenhuma comissão encontrada para este funcionário.
                          <div className="mt-1 text-[10px]">Lançamentos identificados pela palavra "comissão" na descrição, observação ou categoria contábil da CP.</div>
                        </div>
                      ) : (
                        <div className="divide-y divide-[#eee]">
                          {comissoes.map((p: any) => {
                            const compLabel = p.competencia && /^\d{4}-\d{2}/.test(p.competencia)
                              ? p.competencia.slice(2, 7).split("-").reverse().join("/")
                              : (p.competencia || "—");
                            const statusBadge =
                              p.status === "pago"   ? "bg-[#ECFDF4] text-[#059669]" :
                              p.status === "parcial"? "bg-[#FEF3C7] text-[#92400E]" :
                              p.status === "vencido"? "bg-[#FEE2E2] text-[#991B1B]" :
                              p.status === "cancelado" ? "bg-[#EAECF0] text-[#555]" :
                                                      "bg-[#F6F2EB] text-[#555]";
                            const statusLabel =
                              p.status === "pago" ? "Pago" :
                              p.status === "parcial" ? "Parcial" :
                              p.status === "vencido" ? "Vencido" :
                              p.status === "cancelado" ? "Cancelado" :
                              "Em aberto";
                            const sourceDot =
                              p.source === "folha"     ? "bg-[#3730A3]" :
                              p.source === "beneficio" ? "bg-[#9D174D]" :
                                                        "bg-[#aaa]";
                            const sourceTitle =
                              p.source === "folha" ? "Folha" :
                              p.source === "beneficio" ? "Benefício" :
                              "Manual";
                            const podeVincular = p.source === "manual" && p.cp_id && (!p.cp_cpf || onlyDigitsHelper(p.cp_cpf) !== onlyDigitsHelper(selected?.cpf));
                            const dataPagoLabel = p.data_pagamento ? new Date(p.data_pagamento + "T12:00:00").toLocaleDateString("pt-BR") : null;
                            return (
                              <div key={p.id} className="px-3 py-2 hover:bg-[#FAFAF7]">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${sourceDot}`} title={sourceTitle}></span>
                                    <span className="text-[10px] font-bold text-[#555] tabular-nums shrink-0">{compLabel}</span>
                                    <span className="text-[12px] text-[#1D2939] truncate" title={p.tipo}>{p.tipo}</span>
                                  </div>
                                  <span className="text-[12px] font-bold text-[#1D2939] tabular-nums whitespace-nowrap shrink-0">{formatBRL(p.valor)}</span>
                                </div>
                                <div className="flex items-center justify-between gap-2 mt-1 pl-4">
                                  <div className="flex items-center gap-2 text-[10px] text-[#777] min-w-0">
                                    <span className={`font-bold px-1.5 py-0.5 rounded ${statusBadge}`}>{statusLabel}</span>
                                    {dataPagoLabel && <span className="whitespace-nowrap">Pago {dataPagoLabel}</span>}
                                    {p.conta && <span className="truncate">· {p.conta}</span>}
                                  </div>
                                  {podeVincular && selected?.cpf ? (
                                    <button onClick={() => vincularPagamento(p.cp_id)} title="Gravar CPF na conta a pagar" className="text-[10px] font-bold text-[#059669] hover:bg-[#ECFDF4] rounded px-2 py-0.5 shrink-0">Vincular</button>
                                  ) : null}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
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
                          <div className="bg-[#059669] px-3 py-2"><span className="text-[10px] font-bold text-white uppercase tracking-wider">INSS — Detalhamento por faixa</span></div>
                          <table className="w-full text-xs">
                            <thead className="bg-[#F6F2EB]"><tr><th className="px-3 py-1.5 text-left text-[9px] font-bold uppercase text-[#555]">Faixa</th><th className="px-3 py-1.5 text-left text-[9px] font-bold uppercase text-[#555]">Alíq.</th><th className="px-3 py-1.5 text-right text-[9px] font-bold uppercase text-[#555]">Valor</th></tr></thead>
                            <tbody>
                              {INSS_2025.map((f, i) => {
                                if (calcSalario <= f.min) return null;
                                const base = Math.min(calcSalario, f.max) - f.min;
                                const val = Math.round(base * f.aliq * 100) / 100;
                                return (<tr key={i} className="border-t border-[#eee]"><td className="px-3 py-1.5">Até {formatBRL(f.max)}</td><td className="px-3 py-1.5">{(f.aliq * 100).toFixed(1)}%</td><td className="px-3 py-1.5 text-right font-semibold">{formatBRL(val)}</td></tr>);
                              })}
                              <tr className="border-t-2 border-[#059669] font-bold"><td className="px-3 py-2" colSpan={2}>Total INSS</td><td className="px-3 py-2 text-right">{formatBRL(inssCalc)}</td></tr>
                            </tbody>
                          </table>
                        </div>
                        <div className="border border-[#ccc] rounded-lg overflow-hidden">
                          <div className="bg-[#059669] px-3 py-2"><span className="text-[10px] font-bold text-white uppercase tracking-wider">IRRF</span></div>
                          <div className="p-3 text-xs space-y-1">
                            <div className="flex justify-between"><span className="text-[#555]">Base de cálculo</span><span className="font-semibold">{formatBRL(Math.max(0, calcSalario - inssCalc - calcDependentes * DEDUCAO_DEPENDENTE))}</span></div>
                            <div className="flex justify-between"><span className="text-[#555]">Dedução dependentes ({calcDependentes})</span><span className="font-semibold">{formatBRL(calcDependentes * DEDUCAO_DEPENDENTE)}</span></div>
                            <div className="flex justify-between border-t border-[#eee] pt-1 font-bold"><span>IRRF</span><span>{formatBRL(irrfCalc)}</span></div>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div className="border-2 border-[#059669] rounded-lg p-5">
                          <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#059669] mb-4">Resumo do Colaborador</h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-[#555]">Salário Bruto</span><span className="font-bold">{formatBRL(calcSalario)}</span></div>
                            <div className="flex justify-between text-[#E53E3E]"><span>(-) INSS</span><span>{formatBRL(inssCalc)}</span></div>
                            <div className="flex justify-between text-[#E53E3E]"><span>(-) IRRF</span><span>{formatBRL(irrfCalc)}</span></div>
                            <div className="flex justify-between border-t-2 border-[#059669] pt-2 mt-2">
                              <span className="font-bold text-[#039855] text-base">Líquido</span>
                              <span className="font-bold text-[#039855] text-base">{formatBRL(liquido)}</span>
                            </div>
                          </div>
                        </div>
                        <div className="border border-[#ccc] rounded-lg p-5">
                          <h4 className="text-[10px] font-bold uppercase tracking-wider text-[#555] mb-4">Custo Empresa</h4>
                          <div className="space-y-2 text-sm">
                            <div className="flex justify-between"><span className="text-[#555]">Salário</span><span>{formatBRL(calcSalario)}</span></div>
                            <div className="flex justify-between"><span className="text-[#555]">FGTS (8%)</span><span>{formatBRL(fgts)}</span></div>
                            <div className="flex justify-between"><span className="text-[#555]">INSS Patronal (20%)</span><span>{formatBRL(inssPatronal)}</span></div>
                            <div className="flex justify-between border-t border-[#eee] pt-2 font-bold"><span>Custo Total</span><span className="text-[#E53E3E]">{formatBRL(custoTotal)}</span></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {tab === "beneficios" && selected && selectedCompany && (
                  <AbaBeneficios
                    companyId={selectedCompany.id}
                    employeeId={selected.id}
                    employeeNome={getName(selected)}
                    salarioBase={Number(selected.salario_base ?? selected.salary ?? 0)}
                    usuarioId={user?.id ?? ""}
                  />
                )}
              </div>
            </>
          )}
        </div>
        </div>
        </div>
      </div>

      <EmployeeDuplicatesDialog
        open={isDupOpen}
        onOpenChange={setIsDupOpen}
        onApplied={() => queryClient.invalidateQueries({ queryKey: ["employees"] })}
      />

      <SolicitarCadastroDialog
        open={solicitarOpen}
        onOpenChange={setSolicitarOpen}
        tipo="funcionario"
        targetId={solicitarTarget.id}
        nomeInicial={solicitarTarget.nome ?? ""}
        telefoneInicial={solicitarTarget.tel ?? ""}
      />

      <SendWhatsAppDialog
        open={whatsOpen}
        onClose={() => setWhatsOpen(false)}
        title="Enviar mensagem WhatsApp"
        subtitle={selected && (
          <p className="font-semibold text-[#1D2939]">{toTitleCase(getName(selected))}</p>
        )}
        defaultPhone={selected?.phone || ""}
        defaultText={selected ? `Olá ${toTitleCase(getName(selected))}!\n\n` : ""}
      />
    </AppLayout>
  );
}
