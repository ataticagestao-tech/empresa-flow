
import { z } from "zod";

// Schema para Contas a Pagar
export const AccountsPayableSchema = z.object({
    id: z.string().uuid().optional(),
    company_id: z.string().uuid("Empresa obrigatória"),

    // Dados Básicos
    description: z.string().min(3, "Descrição muito curta").max(255),
    supplier_id: z.string().uuid("Fornecedor obrigatório").nullable().optional(),
    // Nota: nullable().optional() para permitir 'none' temporariamente ou avulso, 
    // mas idealmente deveria ser obrigatório se a regra de negócio exigir. 
    // No legado era opcional 'none'.

    // Valores e Datas
    amount: z.number().min(0.01, "Valor deve ser maior que zero"),
    due_date: z.date({ required_error: "Data de vencimento obrigatória" }),
    issue_date: z.date().default(() => new Date()),
    register_date: z.date().default(() => new Date()),

    // Classificação
    category_id: z.string().uuid().optional(),
    department_id: z.string().uuid().optional(),
    project_id: z.string().uuid().optional(),

    // Detalhes Pagamento
    payment_method: z.string().optional(), // 'boleto', 'pix', etc
    barcode: z.string().optional(),
    bank_account_id: z.string().uuid().optional().nullable(),

    // Competência (mês/ano de referência, ex: "03/2026")
    competencia: z.string().optional(),

    // Status e Recorrência
    status: z.enum(['pending', 'paid', 'overdue', 'cancelled']).default('pending'),
    recurrence: z.enum(['none', 'monthly', 'weekly', 'yearly', 'daily']).default('none'),
    observations: z.string().optional(),

    // Pagamento Realizado
    payment_date: z.date().optional().nullable(),

    // Arquivo
    file_url: z.string().optional().nullable(),
    invoice_number: z.string().optional(),

    // Impostos (Campos explícitos conforme tabela legada)
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
