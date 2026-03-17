
import { z } from "zod";

// Schema para Contas a Receber Sincronizado com o Banco de Dados
export const AccountsReceivableSchema = z.object({
    id: z.string().uuid().optional(),
    company_id: z.string().uuid("Empresa obrigatória").optional(),

    // Dados Básicos
    description: z.string().min(3, "Descrição muito curta").max(255),
    client_id: z.string().uuid("Cliente obrigatório").nullable().optional(),

    // Valores e Datas
    amount: z.number().min(0.01, "Valor deve ser maior que zero"),
    due_date: z.date({ required_error: "Data de vencimento obrigatória" }),
    issue_date: z.date().default(() => new Date()),
    register_date: z.date().default(() => new Date()),
    receive_date: z.date().optional().nullable(), // Sync com o DB

    // Classificação
    category_id: z.string().uuid("Categoria obrigatória").optional().nullable(),
    department_id: z.string().uuid().optional().nullable(),
    project_id: z.string().uuid().optional().nullable(),

    // Status e Recorrência
    status: z.enum(['pending', 'paid', 'overdue', 'cancelled']).default('pending'), // Lowercase sync
    recurrence: z.enum(['none', 'monthly', 'weekly', 'yearly', 'daily']).nullable().transform(v => v ?? 'none').default('none'),

    // Detalhes Pagamento
    payment_method: z.string().optional().nullable(),
    bank_account_id: z.string().uuid().optional().nullable(),
    transaction_id: z.string().uuid().optional().nullable(),
    invoice_number: z.string().optional().nullable(),

    // Metadados
    observations: z.string().optional().nullable(),
    file_url: z.string().optional().nullable(),

    // Impostos
    pis_amount: z.number().default(0),
    pis_retain: z.boolean().default(false),
    cofins_amount: z.number().default(0),
    cofins_retain: z.boolean().default(false),
    csll_amount: z.number().default(0),
    csll_retain: z.boolean().default(false),
    ir_amount: z.number().default(0),
    ir_retain: z.boolean().default(false),
    iss_amount: z.number().default(0),
    iss_retain: z.boolean().default(false),
    inss_amount: z.number().default(0),
    inss_retain: z.boolean().default(false),
});

export type AccountsReceivable = z.infer<typeof AccountsReceivableSchema>;
