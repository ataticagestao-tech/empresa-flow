import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";

export interface ContratoParcela {
    id: string;
    numero: number;
    valor: number;
    valor_pago: number;
    data_vencimento: string;
    data_pagamento: string | null;
    status: string;
}

export interface ContratoVenda {
    id: string;
    descricao: string;
    valor_total: number;
    data_venda: string;
    data_contrato: string | null;
    previsao_cirurgia: string | null;
    contrato_url: string | null;
    status: string;
    crs: ContratoParcela[];
    total_pago: number;
    saldo: number;
    parcelas_pagas: number;
}

/**
 * Carrega contratos (vendas tipo=contrato) de um cliente especifico.
 * Relaciona por cliente_cpf_cnpj (vendas nao tem cliente_id).
 */
export function useClientContratos(clientCpfCnpj: string | null | undefined) {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const queryClient = useQueryClient();

    const docLimpo = (clientCpfCnpj || "").replace(/\D/g, "");
    const enabled = !!selectedCompany?.id && !!docLimpo;

    const query = useQuery<ContratoVenda[]>({
        queryKey: ["client-contratos", selectedCompany?.id, docLimpo],
        enabled,
        queryFn: async () => {
            const ac = activeClient as any;

            const { data: vendas, error: vendasErr } = await ac
                .from("vendas")
                .select("id, cliente_nome, cliente_cpf_cnpj, tipo, valor_total, data_venda, data_contrato, previsao_cirurgia, contrato_url, status, observacoes")
                .eq("company_id", selectedCompany!.id)
                .eq("tipo", "contrato")
                .eq("cliente_cpf_cnpj", docLimpo)
                .order("data_venda", { ascending: false });

            if (vendasErr) throw vendasErr;
            if (!vendas || vendas.length === 0) return [];

            const ids = vendas.map((v: any) => v.id);
            const { data: crs, error: crsErr } = await ac
                .from("contas_receber")
                .select("id, venda_id, valor, valor_pago, data_vencimento, data_pagamento, status")
                .in("venda_id", ids)
                .order("data_vencimento", { ascending: true });

            if (crsErr) throw crsErr;

            return vendas.map((v: any): ContratoVenda => {
                const crsVenda = (crs || []).filter((c: any) => c.venda_id === v.id);
                const parcelas: ContratoParcela[] = crsVenda.map((c: any, idx: number) => ({
                    id: c.id,
                    numero: idx + 1,
                    valor: parseFloat(c.valor || 0),
                    valor_pago: parseFloat(c.valor_pago || 0),
                    data_vencimento: c.data_vencimento,
                    data_pagamento: c.data_pagamento,
                    status: c.status,
                }));
                const total_pago = parcelas.reduce((s, p) => s + p.valor_pago, 0);
                const valor_total = parseFloat(v.valor_total || 0);
                return {
                    id: v.id,
                    descricao: v.observacoes || "Contrato",
                    valor_total,
                    data_venda: v.data_venda,
                    data_contrato: v.data_contrato,
                    previsao_cirurgia: v.previsao_cirurgia,
                    contrato_url: v.contrato_url,
                    status: v.status,
                    crs: parcelas,
                    total_pago,
                    saldo: valor_total - total_pago,
                    parcelas_pagas: parcelas.filter((p) => p.status === "pago").length,
                };
            });
        },
    });

    /**
     * Cria contrato (venda tipo=contrato) sem gerar CRs.
     * Pagamentos serao vinculados depois via Contas a Receber ou Conciliacao.
     */
    const createContrato = useMutation({
        mutationFn: async (input: {
            clientName: string;
            descricao: string;
            valor: number;
            data_venda: string;
            previsao_cirurgia?: string | null;
            contrato_url?: string | null;
        }) => {
            if (!selectedCompany?.id) throw new Error("Empresa nao selecionada");
            const ac = activeClient as any;

            const { data: venda, error: vendaErr } = await ac
                .from("vendas")
                .insert({
                    company_id: selectedCompany.id,
                    cliente_nome: input.clientName,
                    cliente_cpf_cnpj: docLimpo,
                    tipo: "contrato",
                    valor_total: input.valor,
                    data_venda: input.data_venda,
                    data_contrato: input.data_venda,
                    previsao_cirurgia: input.previsao_cirurgia || null,
                    contrato_url: input.contrato_url || null,
                    parcelas: 1,
                    status: "confirmado",
                    observacoes: input.descricao,
                })
                .select()
                .single();

            if (vendaErr) throw vendaErr;
            return venda.id as string;
        },
        onSuccess: () => {
            toast.success("Contrato criado com sucesso!");
            queryClient.invalidateQueries({ queryKey: ["client-contratos"] });
        },
        onError: (err: any) => {
            toast.error("Erro ao criar contrato: " + (err?.message || "desconhecido"));
        },
    });

    /**
     * Deleta contrato: apaga CRs abertas + venda. CRs pagas nao sao tocadas (soft protection).
     */
    const deleteContrato = useMutation({
        mutationFn: async (vendaId: string) => {
            const ac = activeClient as any;
            const { data: pagas } = await ac
                .from("contas_receber")
                .select("id")
                .eq("venda_id", vendaId)
                .eq("status", "pago");

            if (pagas && pagas.length > 0) {
                throw new Error(
                    `Contrato tem ${pagas.length} pagamento(s) vinculado(s). Cancele-o em Vendas em vez de excluir.`
                );
            }

            const { error: crsErr } = await ac
                .from("contas_receber")
                .delete()
                .eq("venda_id", vendaId);
            if (crsErr) throw crsErr;

            const { error: vendaErr } = await ac.from("vendas").delete().eq("id", vendaId);
            if (vendaErr) throw vendaErr;
        },
        onSuccess: () => {
            toast.success("Contrato removido.");
            queryClient.invalidateQueries({ queryKey: ["client-contratos"] });
        },
        onError: (err: any) => {
            toast.error(err?.message || "Erro ao remover contrato");
        },
    });

    /**
     * Upload PDF pro bucket 'contratos' e atualiza vendas.contrato_url.
     */
    const uploadContratoPdf = useMutation({
        mutationFn: async (input: { vendaId: string; file: File }) => {
            const ac = activeClient as any;
            const ext = input.file.name.split(".").pop() || "pdf";
            const path = `${selectedCompany?.id}/${input.vendaId}-${Date.now()}.${ext}`;

            const { error: upErr } = await ac.storage
                .from("contratos")
                .upload(path, input.file, { upsert: true });
            if (upErr) throw upErr;

            const { data: urlData } = ac.storage.from("contratos").getPublicUrl(path);

            const { error: updErr } = await ac
                .from("vendas")
                .update({ contrato_url: urlData.publicUrl })
                .eq("id", input.vendaId);
            if (updErr) throw updErr;

            return urlData.publicUrl as string;
        },
        onSuccess: () => {
            toast.success("PDF do contrato anexado.");
            queryClient.invalidateQueries({ queryKey: ["client-contratos"] });
        },
        onError: (err: any) => {
            toast.error("Erro no upload: " + (err?.message || "desconhecido"));
        },
    });

    return {
        contratos: query.data || [],
        isLoading: query.isLoading,
        createContrato,
        deleteContrato,
        uploadContratoPdf,
    };
}
