/**
 * Heurística pura (sem React/DB) para classificar uma conta de custo/despesa como
 * CUSTO FIXO ou CUSTO VARIÁVEL — usada no Ponto de Equilíbrio.
 *
 * A classificação MANUAL (chart_of_accounts.expense_nature) sempre tem prioridade
 * sobre esta heurística; ela só entra em campo quando expense_nature está NULL.
 *
 * Regra geral: VARIÁVEL tem PRIORIDADE, porque variável é o que escala junto com a
 * venda (impostos sobre venda, taxa de cartão, comissão, CMV/CPV, insumos/medicamentos,
 * frete/expedição). Tudo o que não for reconhecido como variável é tratado como FIXO.
 */

export type CustoNatureza = "fixa" | "variavel";
/** Classificação gerencial em 3 baldes (espelha chart_of_accounts.expense_nature). */
export type CustoDespesaClasse = "fixa" | "variavel" | "custo";

/** Normaliza: NFD + remove acentos + minúsculas (para casar texto livre). */
function normalize(s: string | null | undefined): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Heurística de 3 baldes a partir de código, nome e dre_group:
 *  - 'custo'    → CMV/CPV/CSP (custo direto do que foi vendido: mercadorias, insumos,
 *                 medicamentos manipulados/injetáveis, equipe cirúrgica, honorário médico).
 *  - 'variavel' → escala com a venda mas não é custo do produto/serviço
 *                 (impostos s/ venda, taxa de cartão/maquininha, comissão/royalties, frete/expedição).
 *  - 'fixa'     → tudo o mais (aluguel, salário, software, energia…).
 *
 * É a fonte da verdade da heurística; `classificaFixoVariavel` (2 baldes, p/ Ponto de
 * Equilíbrio) deriva daqui mapeando 'custo' → 'variavel'.
 */
export function classificaCustoDespesa(
  code: string | null | undefined,
  name: string | null | undefined,
  dreGroup: string | null | undefined,
): CustoDespesaClasse {
  const txt = `${normalize(name)} ${normalize(dreGroup)} ${normalize(code)}`;
  const has = (s: string) => txt.includes(s);
  // Casa a sigla como PALAVRA inteira (evita falso-positivo: "vendas" contém "das",
  // "comissao" não vira "iss", etc.). \b não funciona bem com acento já removido,
  // então delimitamos por início/fim ou não-letra.
  const hasWord = (w: string) => new RegExp(`(^|[^a-z0-9])${w}([^a-z0-9]|$)`).test(txt);

  // ── Bucket 1: IMPOSTOS / TRIBUTOS SOBRE A VENDA (escalam com o faturamento) ──
  // Simples Nacional, DAS, ISS, DAM, ICMS, PIS, COFINS, deduções de receita.
  if (
    has("imposto sobre venda") ||
    has("impostos sobre venda") ||
    has("impostos s") || // "impostos s/ venda", "impostos sobre..."
    has("impostos e contrib") ||
    has("tributos s/ venda") ||
    has("tributos sobre venda") ||
    has("simples nacional") ||
    hasWord("das") ||
    hasWord("iss") ||
    hasWord("dam") ||
    hasWord("icms") ||
    hasWord("pis") ||
    hasWord("cofins") ||
    has("deducoes") || // dre_group "deducoes" também cai aqui (deduções de receita são variáveis)
    has("deducao")
  ) {
    return "variavel";
  }

  // ── Bucket 2: TAXA DE CARTÃO / MAQUININHA / ADQUIRENTE (% sobre a venda) ──
  if (
    has("maquininha") ||
    has("mdr") ||
    has("operadora") ||
    has("processadora") ||
    has("adquirente") ||
    has("antecipa") || // antecipação de recebíveis
    has("taxas de operadora") ||
    has("taxa de cartao") ||
    has("taxas de cartao")
  ) {
    return "variavel";
  }

  // ── Bucket 3: COMISSÕES / ROYALTIES (proporcionais à venda) ──
  if (has("comissa") || has("comissoes") || has("royalt")) {
    return "variavel";
  }

  // ── Bucket 4: CMV / CPV / CSP / MERCADORIAS / INSUMOS / MEDICAMENTOS ──
  // Custo direto do que foi vendido → entra na MARGEM BRUTA (balde 'custo').
  if (
    has("cmv") ||
    has("cpv") ||
    has("csp") ||
    has("compra de mercadoria") ||
    has("mercadorias para revenda") ||
    has("insumo") ||
    has("manipulado") ||
    has("injetav") ||
    has("equipe cirurgica") ||
    has("honorario medico") ||
    has("honorarios medicos") ||
    has("servicos medicos") ||
    has("compra de servicos medicos")
  ) {
    return "custo";
  }

  // ── Bucket 5: FRETE / EMBALAGEM / EXPEDIÇÃO (custo logístico da venda) ──
  if (
    has("frete") ||
    has("sedex") ||
    has("embalagen") ||
    has("expedicao")
  ) {
    return "variavel";
  }

  // ── DEFAULT: FIXA ──
  // Aluguel, condomínio, salário/ordenado, pró-labore, estágio, férias, rescisão,
  // vale transporte/refeição, plano de saúde, FGTS, INSS, contador/contábil,
  // consultoria, BPO, jurídico/advogado, software/ERP/SaaS/licença, energia, água,
  // telefone, internet, seguro, marketing/publicidade/tráfego, manutenção, limpeza,
  // material, depreciação/amortização, tarifa bancária, juros, IOF, IPTU, IRPJ, CSLL,
  // DARF trimestral — e qualquer outra despesa não reconhecida como variável.
  return "fixa";
}

/**
 * Classifica uma conta como 'fixa' ou 'variavel' (2 baldes) para o Ponto de Equilíbrio.
 * Deriva da heurística de 3 baldes: 'custo' escala com a venda, logo conta como VARIÁVEL.
 */
export function classificaFixoVariavel(
  code: string | null | undefined,
  name: string | null | undefined,
  dreGroup: string | null | undefined,
): CustoNatureza {
  return classificaCustoDespesa(code, name, dreGroup) === "fixa" ? "fixa" : "variavel";
}

/**
 * Resolve a natureza FIXA × VARIÁVEL (Ponto de Equilíbrio) respeitando a classificação
 * manual (chart_of_accounts.expense_nature) com prioridade: 'fixa' → fixa; 'variavel' e
 * 'custo' → variável; qualquer outro valor / NULL → heurística.
 */
export function resolveNaturezaPE(
  expenseNature: string | null | undefined,
  code: string | null | undefined,
  name: string | null | undefined,
  dreGroup: string | null | undefined,
): CustoNatureza {
  if (expenseNature === "fixa") return "fixa";
  if (expenseNature === "variavel" || expenseNature === "custo") return "variavel";
  return classificaFixoVariavel(code, name, dreGroup);
}

/**
 * Verdadeiro se a conta deve ser EXCLUÍDA do resultado (não é custo nem despesa
 * de resultado): ativo/passivo/PL/receita, ou dre_group "não dre".
 * Mesma regra de exclusão usada no useMargens — replicada aqui para o Ponto de
 * Equilíbrio não precisar importar o hook (evita acoplamento React→DB).
 */
export function isExcluidoDoResultado(
  accountType: string | null | undefined,
  dreGroup: string | null | undefined,
): boolean {
  const at = (accountType || "").toLowerCase();
  const norm = normalize(dreGroup);
  if (at === "asset" || at === "liability" || at === "equity" || at === "revenue") return true;
  if (norm.includes("nao dre")) return true;
  return false;
}

/**
 * Verdadeiro se a conta (já classificada como FIXA) é um custo NÃO-DESEMBOLSÁVEL:
 * depreciação / amortização. Usado pelo PE Financeiro, que exclui o que não sai do caixa.
 */
export function isNaoDesembolsavel(
  name: string | null | undefined,
  dreGroup: string | null | undefined,
): boolean {
  const txt = `${normalize(name)} ${normalize(dreGroup)}`;
  return txt.includes("deprecia") || txt.includes("amortiza");
}
