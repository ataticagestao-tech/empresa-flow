// Plano de Contas Patrimoniais — Modelo Padrão de Referência
// Baseado no padrão contábil brasileiro (Lei 6.404/76 e NBC)
// Inclui classificações para integração automática com BP, DRE e DFC

export interface ContaModelo {
  code: string;
  name: string;
  level: number;
  account_type: "asset" | "liability" | "equity" | "revenue" | "expense" | "cost";
  account_nature: "debit" | "credit";
  is_analytical: boolean;
  grupo: string;
  /** Classificação no Balanço Patrimonial: AC, ANC, PC, PNC, PL */
  classificacao_bp?: string;
  /** Classificação no DFC: operacional, investimento, financiamento */
  classificacao_dfc?: string;
  /** Código da linha do demonstrativo BP para mapeamento automático */
  bp_line?: string;
  /** Código da linha do demonstrativo DFC para mapeamento automático */
  dfc_line?: string;
}

export const PLANO_PATRIMONIAL: ContaModelo[] = [
  // ══════════════════════════════════════════════
  // 1 — ATIVO CIRCULANTE (AC)
  // ══════════════════════════════════════════════
  { code: "1", name: "ATIVO CIRCULANTE (AC)", level: 1, account_type: "asset", account_nature: "debit", is_analytical: false, grupo: "ativo_circulante", classificacao_bp: "AC" },

  { code: "1.1", name: "Caixa", level: 2, account_type: "asset", account_nature: "debit", is_analytical: false, grupo: "ativo_circulante", classificacao_bp: "AC" },
  { code: "1.1.01", name: "Caixa geral", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "operacional", bp_line: "BP.AC.01", dfc_line: "DFC.OP.01" },
  { code: "1.1.02", name: "Caixa pequeno (fundo fixo)", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "operacional", bp_line: "BP.AC.01", dfc_line: "DFC.OP.01" },

  { code: "1.2", name: "Bancos conta movimento", level: 2, account_type: "asset", account_nature: "debit", is_analytical: false, grupo: "ativo_circulante", classificacao_bp: "AC" },
  { code: "1.2.01", name: "Banco X — conta corrente", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "operacional", bp_line: "BP.AC.01", dfc_line: "DFC.OP.01" },
  { code: "1.2.02", name: "Banco Y — conta corrente", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "operacional", bp_line: "BP.AC.01", dfc_line: "DFC.OP.01" },
  { code: "1.2.03", name: "Bancos poupança e rende", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "operacional", bp_line: "BP.AC.01", dfc_line: "DFC.OP.01" },

  { code: "1.3", name: "Aplicações financeiras de liquidez imediata", level: 2, account_type: "asset", account_nature: "debit", is_analytical: false, grupo: "ativo_circulante", classificacao_bp: "AC" },
  { code: "1.3.01", name: "CDB e CDI a curto prazo", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "investimento", bp_line: "BP.AC.01", dfc_line: "DFC.INV.02" },
  { code: "1.3.02", name: "Tesouro Selic", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "investimento", bp_line: "BP.AC.01", dfc_line: "DFC.INV.02" },
  { code: "1.3.03", name: "Fundos de investimento CP", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "investimento", bp_line: "BP.AC.01", dfc_line: "DFC.INV.02" },

  { code: "1.4", name: "Contas a receber — clientes", level: 2, account_type: "asset", account_nature: "debit", is_analytical: false, grupo: "ativo_circulante", classificacao_bp: "AC" },
  { code: "1.4.01", name: "Duplicatas a receber", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "operacional", bp_line: "BP.AC.02", dfc_line: "DFC.OP.01" },
  { code: "1.4.02", name: "Cartões a receber", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "operacional", bp_line: "BP.AC.02", dfc_line: "DFC.OP.01" },
  { code: "1.4.03", name: "Cheques a receber", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "operacional", bp_line: "BP.AC.02", dfc_line: "DFC.OP.01" },
  { code: "1.4.04", name: "(-) Provisão para devedores duvidosos (PDD)", level: 3, account_type: "asset", account_nature: "credit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "operacional", bp_line: "BP.AC.02", dfc_line: "DFC.OP.01" },

  { code: "1.5", name: "Estoques", level: 2, account_type: "asset", account_nature: "debit", is_analytical: false, grupo: "ativo_circulante", classificacao_bp: "AC" },
  { code: "1.5.01", name: "Mercadorias para revenda", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "operacional", bp_line: "BP.AC.03", dfc_line: "DFC.OP.02" },
  { code: "1.5.02", name: "Matérias-primas", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "operacional", bp_line: "BP.AC.03", dfc_line: "DFC.OP.02" },
  { code: "1.5.03", name: "Produtos em elaboração", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "operacional", bp_line: "BP.AC.03", dfc_line: "DFC.OP.02" },
  { code: "1.5.04", name: "Produtos acabados", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "operacional", bp_line: "BP.AC.03", dfc_line: "DFC.OP.02" },
  { code: "1.5.05", name: "Almoxarifado / materiais auxiliares", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "operacional", bp_line: "BP.AC.03", dfc_line: "DFC.OP.02" },

  { code: "1.6", name: "Impostos a recuperar", level: 2, account_type: "asset", account_nature: "debit", is_analytical: false, grupo: "ativo_circulante", classificacao_bp: "AC" },
  { code: "1.6.01", name: "ICMS a recuperar", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "operacional", bp_line: "BP.AC.04", dfc_line: "DFC.OP.04" },
  { code: "1.6.02", name: "IPI a recuperar", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "operacional", bp_line: "BP.AC.04", dfc_line: "DFC.OP.04" },
  { code: "1.6.03", name: "PIS a compensar", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "operacional", bp_line: "BP.AC.04", dfc_line: "DFC.OP.04" },
  { code: "1.6.04", name: "COFINS a compensar", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "operacional", bp_line: "BP.AC.04", dfc_line: "DFC.OP.04" },
  { code: "1.6.05", name: "IRRF a compensar", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "operacional", bp_line: "BP.AC.04", dfc_line: "DFC.OP.04" },

  { code: "1.7", name: "Adiantamentos", level: 2, account_type: "asset", account_nature: "debit", is_analytical: false, grupo: "ativo_circulante", classificacao_bp: "AC" },
  { code: "1.7.01", name: "Adiantamento a funcionários", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "operacional", bp_line: "BP.AC.04", dfc_line: "DFC.OP.03" },
  { code: "1.7.02", name: "Adiantamento a fornecedores", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "operacional", bp_line: "BP.AC.04", dfc_line: "DFC.OP.02" },
  { code: "1.7.03", name: "Adiantamento para despesas", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "operacional", bp_line: "BP.AC.04", dfc_line: "DFC.OP.03" },

  { code: "1.8", name: "Despesas antecipadas", level: 2, account_type: "asset", account_nature: "debit", is_analytical: false, grupo: "ativo_circulante", classificacao_bp: "AC" },
  { code: "1.8.01", name: "Seguros a apropriar", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "operacional", bp_line: "BP.AC.04", dfc_line: "DFC.OP.03" },
  { code: "1.8.02", name: "Aluguéis a apropriar", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "operacional", bp_line: "BP.AC.04", dfc_line: "DFC.OP.03" },
  { code: "1.8.03", name: "Assinaturas e anuidades a apropriar", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_circulante", classificacao_bp: "AC", classificacao_dfc: "operacional", bp_line: "BP.AC.04", dfc_line: "DFC.OP.03" },

  // ══════════════════════════════════════════════
  // 2 — ATIVO NÃO CIRCULANTE
  // ══════════════════════════════════════════════
  { code: "2", name: "ATIVO NÃO CIRCULANTE", level: 1, account_type: "asset", account_nature: "debit", is_analytical: false, grupo: "ativo_nao_circulante", classificacao_bp: "ANC" },

  { code: "2.1", name: "Realizável a longo prazo", level: 2, account_type: "asset", account_nature: "debit", is_analytical: false, grupo: "ativo_nao_circulante", classificacao_bp: "ANC" },
  { code: "2.1.01", name: "Títulos a receber LP", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_nao_circulante", classificacao_bp: "ANC", classificacao_dfc: "investimento", bp_line: "BP.ANC.01", dfc_line: "DFC.INV.02" },
  { code: "2.1.02", name: "Empréstimos a recobrar LP", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_nao_circulante", classificacao_bp: "ANC", classificacao_dfc: "investimento", bp_line: "BP.ANC.01", dfc_line: "DFC.INV.02" },
  { code: "2.1.03", name: "Depósitos judiciais", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_nao_circulante", classificacao_bp: "ANC", classificacao_dfc: "investimento", bp_line: "BP.ANC.01", dfc_line: "DFC.INV.02" },

  { code: "2.2", name: "Investimentos permanentes", level: 2, account_type: "asset", account_nature: "debit", is_analytical: false, grupo: "ativo_nao_circulante", classificacao_bp: "ANC" },
  { code: "2.2.01", name: "Participações em coligadas / controladas", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_nao_circulante", classificacao_bp: "ANC", classificacao_dfc: "investimento", bp_line: "BP.ANC.02", dfc_line: "DFC.INV.02" },
  { code: "2.2.02", name: "Outros investimentos permanentes", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_nao_circulante", classificacao_bp: "ANC", classificacao_dfc: "investimento", bp_line: "BP.ANC.02", dfc_line: "DFC.INV.02" },
  { code: "2.2.03", name: "Propriedades para investimento", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_nao_circulante", classificacao_bp: "ANC", classificacao_dfc: "investimento", bp_line: "BP.ANC.02", dfc_line: "DFC.INV.02" },

  { code: "2.3", name: "Imobilizado", level: 2, account_type: "asset", account_nature: "debit", is_analytical: false, grupo: "ativo_nao_circulante", classificacao_bp: "ANC" },
  { code: "2.3.01", name: "Terrenos", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_nao_circulante", classificacao_bp: "ANC", classificacao_dfc: "investimento", bp_line: "BP.ANC.03", dfc_line: "DFC.INV.01" },
  { code: "2.3.02", name: "Edificações", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_nao_circulante", classificacao_bp: "ANC", classificacao_dfc: "investimento", bp_line: "BP.ANC.03", dfc_line: "DFC.INV.01" },
  { code: "2.3.03", name: "Máquinas e equipamentos", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_nao_circulante", classificacao_bp: "ANC", classificacao_dfc: "investimento", bp_line: "BP.ANC.03", dfc_line: "DFC.INV.01" },
  { code: "2.3.04", name: "Veículos", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_nao_circulante", classificacao_bp: "ANC", classificacao_dfc: "investimento", bp_line: "BP.ANC.03", dfc_line: "DFC.INV.01" },
  { code: "2.3.05", name: "Móveis e utensílios", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_nao_circulante", classificacao_bp: "ANC", classificacao_dfc: "investimento", bp_line: "BP.ANC.03", dfc_line: "DFC.INV.01" },
  { code: "2.3.06", name: "Equipamentos de informática", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_nao_circulante", classificacao_bp: "ANC", classificacao_dfc: "investimento", bp_line: "BP.ANC.03", dfc_line: "DFC.INV.01" },
  { code: "2.3.07", name: "Benfeitorias em imóveis de terceiros", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_nao_circulante", classificacao_bp: "ANC", classificacao_dfc: "investimento", bp_line: "BP.ANC.03", dfc_line: "DFC.INV.01" },
  { code: "2.3.08", name: "(-) Depreciação acumulada", level: 3, account_type: "asset", account_nature: "credit", is_analytical: true, grupo: "ativo_nao_circulante", classificacao_bp: "ANC", bp_line: "BP.ANC.05" },

  { code: "2.4", name: "Intangível", level: 2, account_type: "asset", account_nature: "debit", is_analytical: false, grupo: "ativo_nao_circulante", classificacao_bp: "ANC" },
  { code: "2.4.01", name: "Marcas e patentes", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_nao_circulante", classificacao_bp: "ANC", classificacao_dfc: "investimento", bp_line: "BP.ANC.04", dfc_line: "DFC.INV.01" },
  { code: "2.4.02", name: "Softwares e licenças", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_nao_circulante", classificacao_bp: "ANC", classificacao_dfc: "investimento", bp_line: "BP.ANC.04", dfc_line: "DFC.INV.01" },
  { code: "2.4.03", name: "Fundo de comércio (goodwill)", level: 3, account_type: "asset", account_nature: "debit", is_analytical: true, grupo: "ativo_nao_circulante", classificacao_bp: "ANC", classificacao_dfc: "investimento", bp_line: "BP.ANC.04", dfc_line: "DFC.INV.02" },
  { code: "2.4.04", name: "(-) Amortização acumulada", level: 3, account_type: "asset", account_nature: "credit", is_analytical: true, grupo: "ativo_nao_circulante", classificacao_bp: "ANC", bp_line: "BP.ANC.05" },

  // ══════════════════════════════════════════════
  // 3 — PASSIVO CIRCULANTE (PC)
  // ══════════════════════════════════════════════
  { code: "3", name: "PASSIVO CIRCULANTE (PC)", level: 1, account_type: "liability", account_nature: "credit", is_analytical: false, grupo: "passivo_circulante", classificacao_bp: "PC" },

  { code: "3.1", name: "Obrigações trabalhistas", level: 2, account_type: "liability", account_nature: "credit", is_analytical: false, grupo: "passivo_circulante", classificacao_bp: "PC" },
  { code: "3.1.01", name: "Salários e ordenados a pagar", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_circulante", classificacao_bp: "PC", classificacao_dfc: "operacional", bp_line: "BP.PC.04", dfc_line: "DFC.OP.03" },
  { code: "3.1.02", name: "INSS a recolher", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_circulante", classificacao_bp: "PC", classificacao_dfc: "operacional", bp_line: "BP.PC.04", dfc_line: "DFC.OP.04" },
  { code: "3.1.03", name: "FGTS a recolher", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_circulante", classificacao_bp: "PC", classificacao_dfc: "operacional", bp_line: "BP.PC.04", dfc_line: "DFC.OP.04" },
  { code: "3.1.04", name: "IRRF a recolher", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_circulante", classificacao_bp: "PC", classificacao_dfc: "operacional", bp_line: "BP.PC.03", dfc_line: "DFC.OP.04" },
  { code: "3.1.05", name: "Provisão de férias e encargos", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_circulante", classificacao_bp: "PC", classificacao_dfc: "operacional", bp_line: "BP.PC.04", dfc_line: "DFC.OP.03" },
  { code: "3.1.06", name: "Provisão de 13º salário e encargos", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_circulante", classificacao_bp: "PC", classificacao_dfc: "operacional", bp_line: "BP.PC.04", dfc_line: "DFC.OP.03" },
  { code: "3.1.07", name: "Pró-labore a pagar", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_circulante", classificacao_bp: "PC", classificacao_dfc: "operacional", bp_line: "BP.PC.04", dfc_line: "DFC.OP.03" },

  { code: "3.2", name: "Obrigações tributárias", level: 2, account_type: "liability", account_nature: "credit", is_analytical: false, grupo: "passivo_circulante", classificacao_bp: "PC" },
  { code: "3.2.01", name: "ISS a recolher", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_circulante", classificacao_bp: "PC", classificacao_dfc: "operacional", bp_line: "BP.PC.03", dfc_line: "DFC.OP.04" },
  { code: "3.2.02", name: "ICMS a recolher", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_circulante", classificacao_bp: "PC", classificacao_dfc: "operacional", bp_line: "BP.PC.03", dfc_line: "DFC.OP.04" },
  { code: "3.2.03", name: "PIS a recolher", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_circulante", classificacao_bp: "PC", classificacao_dfc: "operacional", bp_line: "BP.PC.03", dfc_line: "DFC.OP.04" },
  { code: "3.2.04", name: "COFINS a recolher", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_circulante", classificacao_bp: "PC", classificacao_dfc: "operacional", bp_line: "BP.PC.03", dfc_line: "DFC.OP.04" },
  { code: "3.2.05", name: "DAS — Simples a recolher", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_circulante", classificacao_bp: "PC", classificacao_dfc: "operacional", bp_line: "BP.PC.03", dfc_line: "DFC.OP.04" },
  { code: "3.2.06", name: "IRPJ a recolher", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_circulante", classificacao_bp: "PC", classificacao_dfc: "operacional", bp_line: "BP.PC.03", dfc_line: "DFC.OP.04" },
  { code: "3.2.07", name: "CSLL a recolher", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_circulante", classificacao_bp: "PC", classificacao_dfc: "operacional", bp_line: "BP.PC.03", dfc_line: "DFC.OP.04" },

  { code: "3.3", name: "Fornecedores", level: 2, account_type: "liability", account_nature: "credit", is_analytical: false, grupo: "passivo_circulante", classificacao_bp: "PC" },
  { code: "3.3.01", name: "Fornecedores nacionais", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_circulante", classificacao_bp: "PC", classificacao_dfc: "operacional", bp_line: "BP.PC.01", dfc_line: "DFC.OP.02" },
  { code: "3.3.02", name: "Fornecedores internacionais", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_circulante", classificacao_bp: "PC", classificacao_dfc: "operacional", bp_line: "BP.PC.01", dfc_line: "DFC.OP.02" },

  { code: "3.4", name: "Empréstimos e financiamentos CP", level: 2, account_type: "liability", account_nature: "credit", is_analytical: false, grupo: "passivo_circulante", classificacao_bp: "PC" },
  { code: "3.4.01", name: "Empréstimos bancários CP", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_circulante", classificacao_bp: "PC", classificacao_dfc: "financiamento", bp_line: "BP.PC.02", dfc_line: "DFC.FIN.03" },
  { code: "3.4.02", name: "Financiamentos CP", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_circulante", classificacao_bp: "PC", classificacao_dfc: "financiamento", bp_line: "BP.PC.02", dfc_line: "DFC.FIN.03" },
  { code: "3.4.03", name: "Cartão de crédito corporativo", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_circulante", classificacao_bp: "PC", classificacao_dfc: "operacional", bp_line: "BP.PC.02", dfc_line: "DFC.OP.03" },

  { code: "3.5", name: "Outras obrigações CP", level: 2, account_type: "liability", account_nature: "credit", is_analytical: false, grupo: "passivo_circulante", classificacao_bp: "PC" },
  { code: "3.5.01", name: "Contas a pagar diversas", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_circulante", classificacao_bp: "PC", classificacao_dfc: "operacional", bp_line: "BP.PC.05", dfc_line: "DFC.OP.03" },
  { code: "3.5.02", name: "Adiantamento de clientes", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_circulante", classificacao_bp: "PC", classificacao_dfc: "operacional", bp_line: "BP.PC.05", dfc_line: "DFC.OP.01" },
  { code: "3.5.03", name: "Dividendos a pagar", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_circulante", classificacao_bp: "PC", classificacao_dfc: "financiamento", bp_line: "BP.PC.05", dfc_line: "DFC.FIN.04" },
  { code: "3.5.04", name: "Aluguéis a pagar", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_circulante", classificacao_bp: "PC", classificacao_dfc: "operacional", bp_line: "BP.PC.05", dfc_line: "DFC.OP.03" },

  // ══════════════════════════════════════════════
  // 4 — PASSIVO NÃO CIRCULANTE (PNC)
  // ══════════════════════════════════════════════
  { code: "4", name: "PASSIVO NÃO CIRCULANTE (PNC)", level: 1, account_type: "liability", account_nature: "credit", is_analytical: false, grupo: "passivo_nao_circulante", classificacao_bp: "PNC" },

  { code: "4.1", name: "Empréstimos e financiamentos LP", level: 2, account_type: "liability", account_nature: "credit", is_analytical: false, grupo: "passivo_nao_circulante", classificacao_bp: "PNC" },
  { code: "4.1.01", name: "Empréstimos bancários LP", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_nao_circulante", classificacao_bp: "PNC", classificacao_dfc: "financiamento", bp_line: "BP.PNC.01", dfc_line: "DFC.FIN.02" },
  { code: "4.1.02", name: "Financiamentos LP", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_nao_circulante", classificacao_bp: "PNC", classificacao_dfc: "financiamento", bp_line: "BP.PNC.01", dfc_line: "DFC.FIN.02" },

  { code: "4.2", name: "Provisões LP", level: 2, account_type: "liability", account_nature: "credit", is_analytical: false, grupo: "passivo_nao_circulante", classificacao_bp: "PNC" },
  { code: "4.2.01", name: "Provisão para contingências trabalhistas", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_nao_circulante", classificacao_bp: "PNC", classificacao_dfc: "operacional", bp_line: "BP.PC.06", dfc_line: "DFC.OP.03" },
  { code: "4.2.02", name: "Provisão para contingências cíveis", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_nao_circulante", classificacao_bp: "PNC", classificacao_dfc: "operacional", bp_line: "BP.PC.06", dfc_line: "DFC.OP.03" },
  { code: "4.2.03", name: "Provisão para contingências tributárias", level: 3, account_type: "liability", account_nature: "credit", is_analytical: true, grupo: "passivo_nao_circulante", classificacao_bp: "PNC", classificacao_dfc: "operacional", bp_line: "BP.PC.06", dfc_line: "DFC.OP.04" },

  // ══════════════════════════════════════════════
  // 5 — PATRIMÔNIO LÍQUIDO (PL)
  // ══════════════════════════════════════════════
  { code: "5", name: "PATRIMÔNIO LÍQUIDO (PL)", level: 1, account_type: "equity", account_nature: "credit", is_analytical: false, grupo: "patrimonio_liquido", classificacao_bp: "PL" },

  { code: "5.1", name: "Capital social", level: 2, account_type: "equity", account_nature: "credit", is_analytical: false, grupo: "patrimonio_liquido", classificacao_bp: "PL" },
  { code: "5.1.01", name: "Capital subscrito", level: 3, account_type: "equity", account_nature: "credit", is_analytical: true, grupo: "patrimonio_liquido", classificacao_bp: "PL", classificacao_dfc: "financiamento", bp_line: "BP.PL.01", dfc_line: "DFC.FIN.01" },
  { code: "5.1.02", name: "(-) Capital a integralizar", level: 3, account_type: "equity", account_nature: "debit", is_analytical: true, grupo: "patrimonio_liquido", classificacao_bp: "PL", classificacao_dfc: "financiamento", bp_line: "BP.PL.01", dfc_line: "DFC.FIN.01" },

  { code: "5.2", name: "Reservas de capital", level: 2, account_type: "equity", account_nature: "credit", is_analytical: false, grupo: "patrimonio_liquido", classificacao_bp: "PL" },
  { code: "5.2.01", name: "Ágio na emissão de ações", level: 3, account_type: "equity", account_nature: "credit", is_analytical: true, grupo: "patrimonio_liquido", classificacao_bp: "PL", bp_line: "BP.PL.02" },
  { code: "5.2.02", name: "Reserva de correção monetária", level: 3, account_type: "equity", account_nature: "credit", is_analytical: true, grupo: "patrimonio_liquido", classificacao_bp: "PL", bp_line: "BP.PL.02" },

  { code: "5.3", name: "Reservas de lucros", level: 2, account_type: "equity", account_nature: "credit", is_analytical: false, grupo: "patrimonio_liquido", classificacao_bp: "PL" },
  { code: "5.3.01", name: "Reserva legal", level: 3, account_type: "equity", account_nature: "credit", is_analytical: true, grupo: "patrimonio_liquido", classificacao_bp: "PL", bp_line: "BP.PL.03" },
  { code: "5.3.02", name: "Reserva estatutária", level: 3, account_type: "equity", account_nature: "credit", is_analytical: true, grupo: "patrimonio_liquido", classificacao_bp: "PL", bp_line: "BP.PL.03" },
  { code: "5.3.03", name: "Reserva para contingências", level: 3, account_type: "equity", account_nature: "credit", is_analytical: true, grupo: "patrimonio_liquido", classificacao_bp: "PL", bp_line: "BP.PL.03" },
  { code: "5.3.04", name: "Reserva de lucros a realizar", level: 3, account_type: "equity", account_nature: "credit", is_analytical: true, grupo: "patrimonio_liquido", classificacao_bp: "PL", bp_line: "BP.PL.03" },

  { code: "5.4", name: "Lucros ou prejuízos acumulados", level: 2, account_type: "equity", account_nature: "credit", is_analytical: false, grupo: "patrimonio_liquido", classificacao_bp: "PL" },
  { code: "5.4.01", name: "Lucros acumulados", level: 3, account_type: "equity", account_nature: "credit", is_analytical: true, grupo: "patrimonio_liquido", classificacao_bp: "PL", bp_line: "BP.PL.04" },
  { code: "5.4.02", name: "(-) Prejuízos acumulados", level: 3, account_type: "equity", account_nature: "debit", is_analytical: true, grupo: "patrimonio_liquido", classificacao_bp: "PL", bp_line: "BP.PL.05" },
];

export const GRUPO_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  ativo_circulante: { label: "Ativo Circulante", color: "#039855", bg: "#ECFDF3" },
  ativo_nao_circulante: { label: "Ativo Não Circulante", color: "#1E3A8A", bg: "#EFF6FF" },
  passivo_circulante: { label: "Passivo Circulante", color: "#D92D20", bg: "#FEF3F2" },
  passivo_nao_circulante: { label: "Passivo Não Circulante", color: "#F79009", bg: "#FFFAEB" },
  patrimonio_liquido: { label: "Patrimônio Líquido", color: "#1E3A8A", bg: "#EFF6FF" },
};
