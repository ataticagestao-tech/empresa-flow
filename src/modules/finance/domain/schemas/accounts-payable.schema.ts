
import { z } from "zod";

// Schema para Contas a Pagar
export const AccountsPayableSchema = z.object({
    id: z.string().uuid().optional(),
    company_id: z.string().uuid().optional(),

    // Dados Básicos
    description: z.string().min(3, "Descrição obrigatória (mínimo 3 caracteres)").max(255),
    supplier_id: z.string().optional().nullable(),
    amount: z.number().min(0.01, "Valor deve ser maior que zero"),
    due_date: z.date({ required_error: "Data de vencimento obrigatória" }),
    competencia: z.string().optional().default(""),

    // Classificação
    category_id: z.string().optional().nullable(),
    department_id: z.string().uuid().optional().nullable(),
    project_id: z.string().uuid().optional().nullable(),

    // Pagamento
    barcode: z.string().optional().default(""),
    pix_key_type: z.enum(['cpf', 'cnpj', 'telefone', 'email', 'aleatoria']).optional(),
    pix_key: z.string().optional().default(""),
    payment_method: z.string().optional(),
    bank_account_id: z.string().uuid().optional().nullable(),
    invoice_number: z.string().optional(),

    // Datas opcionais
    issue_date: z.date().optional().nullable(),
    register_date: z.date().optional().nullable(),
    payment_date: z.date().optional().nullable(),

    // Status e Recorrência
    status: z.enum(['pending', 'paid', 'overdue', 'cancelled']).default('pending'),
    recurrence: z.enum(['none', 'monthly', 'weekly', 'yearly', 'daily']).default('none'),
    is_fixed_cost: z.boolean().default(false),
    recurrence_day: z.number().min(1).max(31).optional(),
    recurrence_start: z.string().optional(),
    recurrence_end: z.string().optional(),
    recurrence_count: z.number().min(1).optional(),
    observations: z.string().optional(),

    // Arquivo
    file_url: z.string().optional().nullable(),

    // Impostos
    pis_amount: z.number().optional().default(0),
    pis_retain: z.boolean().default(false),
    cofins_amount: z.number().optional().default(0),
    cofins_retain: z.boolean().default(false),
    csll_amount: z.number().optional().default(0),
    csll_retain: z.boolean().default(false),
    ir_amount: z.number().optional().default(0),
    ir_retain: z.boolean().default(false),
    iss_amount: z.number().optional().default(0),
    iss_retain: z.boolean().default(false),
    inss_amount: z.number().optional().default(0),
    inss_retain: z.boolean().default(false),
});

export type AccountsPayable = z.infer<typeof AccountsPayableSchema>;
