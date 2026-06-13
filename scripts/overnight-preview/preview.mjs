// ============================================================
// Preview local do PDF do Overnight (sem Supabase/Deno).
// Reaproveita EXATAMENTE o mesmo render da edge function
// (../../supabase/functions/gerar-overnight-pdf/render.ts) com
// dados de exemplo, e salva overnight-preview.pdf nesta pasta.
//
// Rodar:
//   node --import ./loader.mjs preview.mjs
//   (ou: npm run preview)
// ============================================================
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { renderizarPdf } from "../../supabase/functions/gerar-overnight-pdf/render.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Dados de exemplo — espelham o PDF de referência da Izabel + exercitam
// o layout novo da Seção 2 (uma linha por venda: produto + forma).
const dados = {
    empresa: { id: "demo", nome: "Tática Gestão Empresarial Ltda." },
    hoje_brt: new Date("2026-06-04T00:00:00Z"),
    saldo_consolidado: 0,

    // Seção 1 — Resumo do mês (faturamento por vendas / competência)
    faturamento_mes: 71212.00,

    // Seção 2 — Vendas do dia (uma linha por venda)
    vendas_dia: [
        { produto: "Corte + Escova",                forma_label: "PIX",                       valor: 120.00 },
        { produto: "Coloração",                     forma_label: "Cartão de Crédito — 3x",    valor: 380.00 },
        { produto: "Hidratação, Selagem",           forma_label: "Cartão de Débito",          valor: 260.00 },
        { produto: "Kit Tratamento Capilar (3 un)", forma_label: "Dinheiro / Espécie",        valor: 200.00 },
    ],
    vendas_total: 960.00,

    // Seção 3 — Contas a pagar vencendo hoje
    contas_pagar: [
        { categoria: "Fornecedores", descricao: "Distribuidora Beleza Ltda", vencimento: "2026-06-04", valor: 540.00 },
        { categoria: "Aluguel",      descricao: "Imobiliária Centro",        vencimento: "2026-06-04", valor: 1800.00 },
    ],
    cp_total: 2340.00,

    // Seção 4 — Contas a receber vencendo hoje
    contas_receber: [
        { categoria: "Vendas a prazo", descricao: "Maria Souza", vencimento: "2026-06-04", valor: 300.00 },
    ],
    cr_total: 300.00,

    // Seção 5 — Consolidado (caixa: CR/CP pagas)
    consolidado_dia: { entradas: 300.00, saidas: 540.00, resultado: -240.00 },
    consolidado_mes: { entradas: 51007.00, saidas: 30941.18, resultado: 20065.82 },
};

const bytes = await renderizarPdf(dados);
const out = join(__dirname, "overnight-preview.pdf");
writeFileSync(out, bytes);
console.log("✓ PDF de preview gerado:", out);
console.log("  ", bytes.length, "bytes — abra o arquivo pra conferir o layout.");
