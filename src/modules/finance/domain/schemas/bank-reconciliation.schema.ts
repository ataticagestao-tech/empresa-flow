
import { z } from "zod";

export const BankAccountSchema = z.object({
    id: z.string().uuid().optional(),
    company_id: z.string().uuid(),
    name: z.string().min(1, "Nome é obrigatório"),
    banco: z.string().optional(),
    agencia: z.string().optional(),
    conta: z.string().optional(),
    initial_balance: z.number().default(0),
    current_balance: z.number().default(0),
    is_active: z.boolean().default(true),
});

export type BankAccount = z.infer<typeof BankAccountSchema>;

export const BankTransactionSchema = z.object({
    id: z.string().uuid().optional(),
    bank_account_id: z.string().uuid(),
    company_id: z.string().uuid(),
    date: z.string(), // YYYY-MM-DD
    amount: z.number(),
    description: z.string().optional(),
    memo: z.string().optional(),
    fit_id: z.string(),
    status: z.enum(['pending', 'reconciled', 'ignored']).default('pending'),
    reconciled_payable_id: z.string().uuid().nullable().optional(),
    reconciled_receivable_id: z.string().uuid().nullable().optional(),
});

export type BankTransaction = z.infer<typeof BankTransactionSchema>;
