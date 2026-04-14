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
    tipo: "reserva" | "parcela";
}

export interface ContratoVenda {
    id: string;
    descricao: string;
    consultora: string | null;
    procedimento: string | null;
    valor_total: number;
    reserva_valor: number | null;
    reserva_data: string | null;
    forma_pagamento: string | null;
    parcelas_qtd: number;
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

export interface CondicaoPagamento {
    forma: string;          // cartao_credito, pix, boleto, transferencia, dinheiro
    valor: number;          // valor total desta condicao
    parcelas: number;       // 1 = a vista; >1 = parcelado
}

export interface CreateContratoInput {
    clientName: string;
    consultora: string;
    procedimento: string;
    valor_total: number;
    data_venda: string;
    previsao_cirurgia?: string | null;
    reserva_valor: number;
    reserva_data: string | null;
    condicoes: CondicaoPagamento[];
}

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
                .select(
                    "id, cliente_nome, cliente_cpf_cnpj, tipo, valor_total, consultora, procedimento, reserva_valor, reserva_data, forma_pagamento, parcelas, data_venda, data_contrato, previsao_cirurgia, contrato_url, status, observacoes"
                )
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
                    tipo: (c.observacoes || "").toLowerCase().includes("reserva") ? "reserva" : "parcela",
                }));
                const total_pago = parcelas.reduce((s, p) => s + p.valor_pago, 0);
                const valor_total = parseFloat(v.valor_total || 0);
                return {
                    id: v.id,
                    descricao: v.procedimento || v.observacoes || "Contrato",
                    consultora: v.consultora,
                    procedimento: v.procedimento,
                    valor_total,
                    reserva_valor: v.reserva_valor ? parseFloat(v.reserva_valor) : null,
                    reserva_data: v.reserva_data,
                    forma_pagamento: v.forma_pagamento,
                    parcelas_qtd: v.parcelas || 1,
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
     * Cria contrato (venda tipo=contrato) + CRs (reserva + parcelas do saldo).
     */
    const createContrato = useMutation({
        mutationFn: async (input: CreateContratoInput) => {
            if (!selectedCompany?.id) throw new Error("Empresa nao selecionada");
            const ac = activeClient as any;

            // Sumario das condicoes para preencher vendas.forma_pagamento / parcelas
            const totalParcelas = input.condicoes.reduce((s, c) => s + (c.parcelas || 1), 0);
            const formaResumo =
                input.condicoes.length === 0 ? null
                : input.condicoes.length === 1 ? input.condicoes[0].forma
                : "misto";

            const { data: venda, error: vendaErr } = await ac
                .from("vendas")
                .insert({
                    company_id: selectedCompany.id,
                    cliente_nome: input.clientName,
                    cliente_cpf_cnpj: docLimpo,
                    tipo: "contrato",
                    valor_total: input.valor_total,
                    consultora: input.consultora || null,
                    procedimento: input.procedimento,
                    reserva_valor: input.reserva_valor || null,
                    reserva_data: input.reserva_data || null,
                    forma_pagamento: formaResumo,
                    parcelas: Math.max(totalParcelas, 1),
                    data_venda: input.data_venda,
                    data_contrato: input.data_venda,
                    previsao_cirurgia: input.previsao_cirurgia || null,
                    status: "confirmado",
                    observacoes: input.procedimento,
                })
                .select()
                .single();

            if (vendaErr) throw vendaErr;

            // Gera CRs: reserva (se houver) + cada condicao gera suas parcelas
            const crsPayload: any[] = [];

            if (input.reserva_valor && input.reserva_valor > 0 && input.reserva_data) {
                crsPayload.push({
                    company_id: selectedCompany.id,
                    pagador_nome: input.clientName,
                    pagador_cpf_cnpj: docLimpo,
                    valor: input.reserva_valor,
                    valor_pago: 0,
                    data_vencimento: input.reserva_data,
                    status: "aberto",
                    forma_recebimento: "reserva",
                    venda_id: venda.id,
                    observacoes: "Reserva de data — " + input.procedimento,
                });
            }

            const [y, m, d] = input.data_venda.split("-").map((s) => parseInt(s, 10));

            input.condicoes.forEach((cond, condIdx) => {
                const n = Math.max(cond.parcelas || 1, 1);
                const valorParcela = Math.round((cond.valor / n) * 100) / 100;

                for (let i = 0; i < n; i++) {
                    const dataVenc = new Date(y, m - 1 + i + 1, d);
                    const iso = `${dataVenc.getFullYear()}-${String(dataVenc.getMonth() + 1).padStart(2, "0")}-${String(dataVenc.getDate()).padStart(2, "0")}`;
                    const valor =
                        i === n - 1
                            ? Math.round((cond.valor - valorParcela * (n - 1)) * 100) / 100
                            : valorParcela;
                    const condTag = input.condicoes.length > 1 ? ` (${condIdx + 1}/${input.condicoes.length})` : "";
                    crsPayload.push({
                        company_id: selectedCompany.id,
                        pagador_nome: input.clientName,
                        pagador_cpf_cnpj: docLimpo,
                        valor,
                        valor_pago: 0,
                        data_vencimento: iso,
                        status: "aberto",
                        forma_recebimento: cond.forma,
                        venda_id: venda.id,
                        observacoes: `${input.procedimento} — parcela ${i + 1}/${n}${condTag}`,
                    });
                }
            });

            if (crsPayload.length > 0) {
                const { error: crsErr } = await ac.from("contas_receber").insert(crsPayload);
                if (crsErr) throw crsErr;
            }

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
     * Atualiza APENAS metadados (nao-financeiros) de um contrato existente.
     * Financeiros (valor_total, reserva, condicoes) nao sao editaveis — se
     * precisar mudar, excluir e recriar.
     */
    const updateContratoMetadata = useMutation({
        mutationFn: async (input: {
            vendaId: string;
            consultora?: string | null;
            procedimento?: string;
            data_venda?: string;
            previsao_cirurgia?: string | null;
            observacoes?: string | null;
            status?: string;
        }) => {
            const ac = activeClient as any;
            const patch: Record<string, any> = {};
            if (input.consultora !== undefined) patch.consultora = input.consultora;
            if (input.procedimento !== undefined) {
                patch.procedimento = input.procedimento;
                patch.observacoes = input.procedimento;
            }
            if (input.data_venda !== undefined) {
                patch.data_venda = input.data_venda;
                patch.data_contrato = input.data_venda;
            }
            if (input.previsao_cirurgia !== undefined) patch.previsao_cirurgia = input.previsao_cirurgia;
            if (input.observacoes !== undefined) patch.observacoes = input.observacoes;
            if (input.status !== undefined) patch.status = input.status;

            const { error } = await ac.from("vendas").update(patch).eq("id", input.vendaId);
            if (error) throw error;
        },
        onSuccess: () => {
            toast.success("Contrato atualizado");
            queryClient.invalidateQueries({ queryKey: ["client-contratos"] });
        },
        onError: (err: any) => {
            toast.error(err?.message || "Erro ao atualizar contrato");
        },
    });

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
        updateContratoMetadata,
        deleteContrato,
        uploadContratoPdf,
    };
}
