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
    contrato_url: string | null;
    forma_pagamento: string | null;
    parcelas: number;
    status: string;
    observacoes: string | null;
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
                .select("id, cliente_nome, cliente_cpf_cnpj, tipo, valor_total, data_venda, data_contrato, contrato_url, forma_pagamento, parcelas, status, observacoes")
                .eq("company_id", selectedCompany!.id)
                .eq("tipo", "contrato")
                .eq("cliente_cpf_cnpj", docLimpo)
                .order("data_venda", { ascending: false });

            if (vendasErr) throw vendasErr;
            if (!vendas || vendas.length === 0) return [];

            const ids = vendas.map((v: any) => v.id);
            const { data: crs, error: crsErr } = await ac
                .from("contas_receber")
                .select("id, venda_id, valor, valor_pago, data_vencimento, data_pagamento, status, observacoes")
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
                    descricao: v.observacoes || `Contrato de ${v.data_venda}`,
                    valor_total,
                    data_venda: v.data_venda,
                    data_contrato: v.data_contrato,
                    contrato_url: v.contrato_url,
                    forma_pagamento: v.forma_pagamento,
                    parcelas: v.parcelas || parcelas.length,
                    status: v.status,
                    observacoes: v.observacoes,
                    crs: parcelas,
                    total_pago,
                    saldo: valor_total - total_pago,
                    parcelas_pagas: parcelas.filter((p) => p.status === "pago").length,
                };
            });
        },
    });

    /**
     * Cria contrato (venda tipo=contrato) + CRs das parcelas.
     */
    const createContrato = useMutation({
        mutationFn: async (input: {
            clientName: string;
            descricao: string;
            modalidade: "fixo" | "variavel";
            valor_total: number;
            numero_parcelas: number;
            data_inicio: string;
            dia_vencimento: number;
            data_contrato?: string;
            parcelas_custom?: Array<{ valor: number; data_vencimento: string }>;
            contrato_url?: string | null;
            observacoes?: string;
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
                    valor_total: input.valor_total,
                    data_venda: input.data_inicio,
                    data_contrato: input.data_contrato || input.data_inicio,
                    contrato_url: input.contrato_url || null,
                    forma_pagamento: "parcelado",
                    parcelas: input.numero_parcelas,
                    status: "confirmado",
                    observacoes: input.descricao,
                })
                .select()
                .single();

            if (vendaErr) throw vendaErr;

            const parcelas =
                input.modalidade === "variavel" && input.parcelas_custom
                    ? input.parcelas_custom
                    : gerarParcelasFixas(
                          input.valor_total,
                          input.numero_parcelas,
                          input.data_inicio,
                          input.dia_vencimento
                      );

            const crsPayload = parcelas.map((p, i) => ({
                company_id: selectedCompany.id,
                pagador_nome: input.clientName,
                pagador_cpf_cnpj: docLimpo,
                valor: p.valor,
                valor_pago: 0,
                data_vencimento: p.data_vencimento,
                status: "aberto" as const,
                forma_recebimento: "parcelado",
                venda_id: venda.id,
                observacoes: `Contrato ${input.descricao} — parcela ${i + 1}/${parcelas.length}`,
            }));

            const { error: crsErr } = await ac.from("contas_receber").insert(crsPayload);
            if (crsErr) throw crsErr;

            return venda.id as string;
        },
        onSuccess: () => {
            toast.success("Contrato criado com sucesso!");
            queryClient.invalidateQueries({ queryKey: ["client-contratos"] });
            queryClient.invalidateQueries({ queryKey: ["contas-receber"] });
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
                    `Contrato tem ${pagas.length} parcela(s) paga(s). Cancele-o em Vendas em vez de excluir.`
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

function gerarParcelasFixas(
    valorTotal: number,
    n: number,
    dataInicio: string,
    diaVenc: number
): Array<{ valor: number; data_vencimento: string }> {
    const valorParcela = Math.round((valorTotal / n) * 100) / 100;
    const [y, m] = dataInicio.split("-").map((s) => parseInt(s, 10));

    return Array.from({ length: n }, (_, i) => {
        const d = new Date(y, m - 1 + i + 1, 1);
        const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
        const day = Math.min(diaVenc, lastDay);
        const data = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

        const valor =
            i === n - 1
                ? Math.round((valorTotal - valorParcela * (n - 1)) * 100) / 100
                : valorParcela;
        return { valor, data_vencimento: data };
    });
}
