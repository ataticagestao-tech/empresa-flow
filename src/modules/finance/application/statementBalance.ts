import { format } from "date-fns";
import type { OFXSummary } from "@/lib/parsers/ofx";

/**
 * Fase 1 do PLANO_SALDO_CONCILIACAO — grava o saldo de fechamento declarado pelo banco
 * (LEDGERBAL/BALAMT do OFX) na tabela bank_statement_balances, para depois mostrar a
 * divergência "banco × sistema". Não altera nenhum saldo; só registra a verdade do banco.
 *
 * Idempotente: upsert por (bank_account_id, as_of_date) — re-importar o mesmo extrato
 * apenas atualiza o valor.
 */
export async function recordStatementBalance(
  db: any,
  params: { companyId: string; bankAccountId: string; summary: OFXSummary | null | undefined; importFileId?: string | null },
): Promise<void> {
  const { companyId, bankAccountId, summary, importFileId } = params;
  if (!db || !companyId || !bankAccountId || !summary) return;

  const closingBalance = summary.closingBalance;
  const closingDate = summary.closingDate ?? summary.periodEnd;
  if (closingBalance == null || !Number.isFinite(closingBalance) || !closingDate) return;

  try {
    await db
      .from("bank_statement_balances")
      .upsert(
        {
          company_id: companyId,
          bank_account_id: bankAccountId,
          as_of_date: format(closingDate, "yyyy-MM-dd"),
          closing_balance: closingBalance,
          source: "ofx",
          import_file_id: importFileId ?? null,
        },
        { onConflict: "bank_account_id,as_of_date" },
      );
  } catch (e) {
    // Não-fatal: gravar o saldo do banco nunca pode quebrar a importação do extrato.
    console.warn("[recordStatementBalance] falhou (não-fatal)", e);
  }
}
