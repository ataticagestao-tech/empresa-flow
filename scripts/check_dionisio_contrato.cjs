// Verifica estado do contrato do Dionisio (HAIR OF BRASIL) apos quitacao
const { Client } = require("pg");

const HAIR = "6d41eb71-e593-4ff2-8e3b-e36089a2aca7";
const CPF = "031.562.626-76";

const CONN =
  "postgres://postgres.onobornmnzemgsduscug:TQHjl8jKrOVhgKga@aws-1-us-east-2.pooler.supabase.com:6543/postgres";

(async () => {
  const client = new Client({
    connectionString: CONN,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  console.log("=== VENDAS Dionisio (qualquer status, incl. deleted) ===");
  const vendas = await client.query(
    `select id, tipo, status, valor_total, data_venda, created_at, deleted_at,
            left(coalesce(observacoes,''),120) as observacoes
       from vendas
      where company_id = $1 and cliente_cpf_cnpj = $2
      order by created_at desc`,
    [HAIR, CPF]
  );
  console.table(vendas.rows);

  const vendaIds = vendas.rows.map((v) => v.id);
  if (vendaIds.length === 0) {
    console.log("Nenhuma venda. Tentando por nome...");
    const byName = await client.query(
      `select id, tipo, status, valor_total, data_venda, created_at, deleted_at
         from vendas
        where company_id = $1 and cliente_nome ilike '%dionisio%'
        order by created_at desc`,
      [HAIR]
    );
    console.table(byName.rows);
    await client.end();
    return;
  }

  console.log("\n=== CONTAS_RECEBER vinculadas (todas, incl. deleted) ===");
  const crs = await client.query(
    `select id, venda_id, status, valor, valor_pago, data_vencimento,
            data_recebimento, deleted_at, bank_account_id, forma_pagamento,
            left(coalesce(observacoes,''),100) as observacoes
       from contas_receber
      where venda_id = ANY($1::uuid[])
      order by data_vencimento asc nulls last, created_at asc`,
    [vendaIds]
  );
  console.table(crs.rows);

  console.log("\n=== MOVIMENTACOES vinculadas as CRs (todas) ===");
  const crIds = crs.rows.map((c) => c.id);
  if (crIds.length) {
    const movs = await client.query(
      `select id, conta_receber_id, data, valor, tipo, bank_account_id,
              status_conciliacao, left(coalesce(descricao,''),100) as descricao
         from movimentacoes
        where conta_receber_id = ANY($1::uuid[])
        order by data desc, created_at desc`,
      [crIds]
    );
    console.table(movs.rows);
  }

  console.log("\n=== RESUMO POR CONTRATO ===");
  for (const c of vendas.rows.filter((v) => v.tipo === "contrato")) {
    const cs = crs.rows.filter((x) => x.venda_id === c.id);
    const ativas = cs.filter((x) => !x.deleted_at);
    const pagas = ativas.filter((x) => x.status === "pago");
    const abertas = ativas.filter((x) => x.status === "aberto");
    const deletadas = cs.filter((x) => x.deleted_at);
    const somaPaga = pagas.reduce(
      (s, x) => s + Number(x.valor_pago || x.valor || 0),
      0
    );
    const somaAberta = abertas.reduce((s, x) => s + Number(x.valor || 0), 0);
    const somaDeletada = deletadas.reduce(
      (s, x) => s + Number(x.valor || 0),
      0
    );
    const saldo = Number(c.valor_total) - somaPaga;
    console.log(
      `Contrato ${c.id}\n  total R$${c.valor_total} | venda_status=${c.status} | deleted=${
        c.deleted_at ? "SIM" : "nao"
      }\n  pagas=${pagas.length} (R$${somaPaga.toFixed(2)}) | abertas=${abertas.length} (R$${somaAberta.toFixed(
        2
      )}) | soft-deletadas=${deletadas.length} (R$${somaDeletada.toFixed(
        2
      )})\n  saldo restante = R$${saldo.toFixed(2)}`
    );
  }

  await client.end();
})().catch((e) => {
  console.error("ERRO:", e);
  process.exit(1);
});
