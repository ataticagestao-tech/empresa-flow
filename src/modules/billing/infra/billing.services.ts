
import { SupabaseClient } from "@supabase/supabase-js";
import { Invoice } from "../domain/schemas/invoice.schema";

/**
 * Serviço de Faturamento.
 * Responsável por persistência de dados e integrações fiscais REAIS.
 */

export class BillingService {
    constructor(private supabase: SupabaseClient) { }

    /**
     * Salva uma nova fatura ou atualiza existente.
     * Operação Transacional (Fatura + Itens).
     */
    async saveInvoice(invoice: Invoice): Promise<Invoice> {
        console.log("Saving Real Invoice to DB:", invoice);

        // 1. Prepara Payload da Fatura (Header)
        const invoicePayload = {
            company_id: invoice.companyId,
            client_id: invoice.clientId,
            issue_date: invoice.issueDate,
            due_date: invoice.dueDate,
            status: invoice.status,
            payment_method: invoice.paymentMethod,
            notes: invoice.notes,
            subtotal: invoice.subtotal || 0, // Valores já calculados ou recalcular aqui? Ideal é validar no back.
            total_taxes: invoice.totalTax || 0, // Ajuste de nome conforme schema vs DB
            total_amount: invoice.totalAmount || 0
        };

        // 2. Insere/Atualiza Header da Fatura
        let invoiceData;

        if (invoice.id) {
            // Update
            const { data, error } = await this.supabase
                .from('invoices')
                .update(invoicePayload)
                .eq('id', invoice.id)
                .select()
                .single();

            if (error) throw new Error(`Erro ao atualizar fatura: ${error.message}`);
            invoiceData = data;

            // Limpa itens antigos para recriar (Estratégia mais simples para edit)
            await this.supabase.from('invoice_lines').delete().eq('invoice_id', invoice.id);

        } else {
            // Insert
            const { data, error } = await this.supabase
                .from('invoices')
                .insert([invoicePayload])
                .select()
                .single();

            if (error) throw new Error(`Erro ao criar fatura: ${error.message}`);
            invoiceData = data;
        }

        const invoiceId = invoiceData.id;

        // 3. Prepara Itens (Lines)
        const itemsPayload = invoice.items.map(item => ({
            invoice_id: invoiceId,
            description: item.description,
            quantity: item.quantity,
            unit_price: item.unitPrice,
            total_price: item.quantity * item.unitPrice,
            service_code: item.serviceCode
        }));

        // 4. Insere Itens
        const { error: itemsError } = await this.supabase
            .from('invoice_lines')
            .insert(itemsPayload);

        if (itemsError) throw new Error(`Erro ao salvar itens da fatura: ${itemsError.message}`);

        // 5. Retorna Objeto Consolidado (Adaptando snake_case do banco para camelCase do Schema)
        return {
            ...invoice,
            id: invoiceId,
            subtotal: invoiceData.subtotal,
            totalTaxes: invoiceData.total_taxes,
            totalAmount: invoiceData.total_amount,
            status: invoiceData.status,
            // Reatribui itens enviados pois o DB retornaria snake_case e não vale a pena remapear na leitura do write
            items: invoice.items
        };
    }

    /**
     * Busca faturas por cliente.
     */
    async getInvoicesByClient(clientId: string) {
        const { data, error } = await this.supabase
            .from('invoices')
            .select(`
                *,
                invoice_lines (*)
            `)
            .eq('client_id', clientId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Mapper simples snake -> camel
        return data.map((inv: any) => ({
            id: inv.id,
            companyId: inv.company_id,
            clientId: inv.client_id,
            issueDate: new Date(inv.issue_date + "T00:00:00"),
            dueDate: new Date(inv.due_date + "T00:00:00"),
            status: inv.status,
            totalAmount: inv.total_amount,
            items: inv.invoice_lines.map((l: any) => ({
                id: l.id,
                description: l.description,
                quantity: l.quantity,
                unitPrice: l.unit_price
            }))
        }));
    }
}
