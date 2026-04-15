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
    primeiro_vencimento: string; // ISO date (YYYY-MM-DD) da 1ª parcela desta condicao
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
                .is("deleted_at", null)
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

            input.condicoes.forEach((cond, condIdx) => {
                const n = Math.max(cond.parcelas || 1, 1);
                const valorParcela = Math.round((cond.valor / n) * 100) / 100;

                // Parse data do 1º vencimento desta condicao (cada condicao tem a sua).
                // Fallback: data_venda + 1 mes (comportamento anterior) para compatibilidade.
                const baseIso = cond.primeiro_vencimento || input.data_venda;
                const [by, bm, bd] = baseIso.split("-").map((s) => parseInt(s, 10));
                const baseOffset = cond.primeiro_vencimento ? 0 : 1;

                for (let i = 0; i < n; i++) {
                    const dataVenc = new Date(by, bm - 1 + i + baseOffset, bd);
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
     * Edicao completa do contrato:
     * - Preserva CRs com valor_pago > 0 (nao podem ser alteradas)
     * - Apaga CRs em aberto (valor_pago = 0) e regera a partir do novo plano
     * - Reserva: se a CR da reserva ja foi paga, o valor/data nao podem mudar;
     *   caso contrario, pode alterar (CR em aberto e regerada).
     */
    const updateContratoFull = useMutation({
        mutationFn: async (input: CreateContratoInput & { vendaId: string }) => {
            if (!selectedCompany?.id) throw new Error("Empresa nao selecionada");
            const ac = activeClient as any;
            const now = new Date().toISOString();

            // 1. Busca CRs atuais do contrato
            const { data: crsExistentes, error: crsErr } = await ac
                .from("contas_receber")
                .select("id, valor, valor_pago, data_vencimento, status, observacoes")
                .eq("venda_id", input.vendaId)
                .is("deleted_at", null);
            if (crsErr) throw crsErr;

            const crsPagas = (crsExistentes || []).filter((c: any) => parseFloat(c.valor_pago || 0) > 0);
            const crsAbertas = (crsExistentes || []).filter((c: any) => parseFloat(c.valor_pago || 0) === 0);
            const totalPreservado = crsPagas.reduce((s: number, c: any) => s + parseFloat(c.valor || 0), 0);

            // 2. Valida: novo valor_total >= ja pago
            if (input.valor_total < totalPreservado - 0.01) {
                throw new Error(`Valor total (${input.valor_total}) nao pode ser menor que o ja pago (${totalPreservado.toFixed(2)})`);
            }

            // 3. Reserva: se a reserva ja foi paga, valor/data sao imutaveis
            const reservaPaga = crsPagas.find((c: any) =>
                (c.observacoes || "").toLowerCase().includes("reserva")
            );

            // 4. Soft-delete das CRs em aberto
            if (crsAbertas.length > 0) {
                const { error: delErr } = await ac
                    .from("contas_receber")
                    .update({ deleted_at: now })
                    .in("id", crsAbertas.map((c: any) => c.id));
                if (delErr) throw delErr;
            }

            // 5. Update da venda
            const totalParcelas = input.condicoes.reduce((s, c) => s + (c.parcelas || 1), 0);
            const formaResumo =
                input.condicoes.length === 0 ? null
                : input.condicoes.length === 1 ? input.condicoes[0].forma
                : "misto";

            const { error: vendaErr } = await ac
                .from("vendas")
                .update({
                    valor_total: input.valor_total,
                    consultora: input.consultora || null,
                    procedimento: input.procedimento,
                    reserva_valor: reservaPaga ? parseFloat(reservaPaga.valor) : (input.reserva_valor || null),
                    reserva_data: reservaPaga ? reservaPaga.data_vencimento : (input.reserva_data || null),
                    forma_pagamento: formaResumo,
                    parcelas: Math.max(totalParcelas, 1),
                    data_venda: input.data_venda,
                    data_contrato: input.data_venda,
                    previsao_cirurgia: input.previsao_cirurgia || null,
                    observacoes: input.procedimento,
                })
                .eq("id", input.vendaId);
            if (vendaErr) throw vendaErr;

            // 6. Gera novas CRs (so se a reserva nao foi paga; se foi, ja esta preservada)
            const crsPayload: any[] = [];

            if (!reservaPaga && input.reserva_valor && input.reserva_valor > 0 && input.reserva_data) {
                crsPayload.push({
                    company_id: selectedCompany.id,
                    pagador_nome: input.clientName,
                    pagador_cpf_cnpj: docLimpo,
                    valor: input.reserva_valor,
                    valor_pago: 0,
                    data_vencimento: input.reserva_data,
                    status: "aberto",
                    forma_recebimento: "reserva",
                    venda_id: input.vendaId,
                    observacoes: "Reserva de data — " + input.procedimento,
                });
            }

            input.condicoes.forEach((cond, condIdx) => {
                const n = Math.max(cond.parcelas || 1, 1);
                const valorParcela = Math.round((cond.valor / n) * 100) / 100;
                const baseIso = cond.primeiro_vencimento || input.data_venda;
                const [by, bm, bd] = baseIso.split("-").map((s) => parseInt(s, 10));
                const baseOffset = cond.primeiro_vencimento ? 0 : 1;

                for (let i = 0; i < n; i++) {
                    const dataVenc = new Date(by, bm - 1 + i + baseOffset, bd);
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
                        venda_id: input.vendaId,
                        observacoes: `${input.procedimento} — parcela ${i + 1}/${n}${condTag}`,
                    });
                }
            });

            if (crsPayload.length > 0) {
                const { error: insErr } = await ac.from("contas_receber").insert(crsPayload);
                if (insErr) throw insErr;
            }

            return input.vendaId;
        },
        onSuccess: () => {
            toast.success("Contrato atualizado com sucesso!");
            queryClient.invalidateQueries({ queryKey: ["client-contratos"] });
            queryClient.invalidateQueries({ queryKey: ["contas-receber"] });
        },
        onError: (err: any) => {
            toast.error("Erro ao atualizar contrato: " + (err?.message || "desconhecido"));
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
            const now = new Date().toISOString();

            // 1. Identifica CRs do contrato que ja tem pagamento
            //    (precisamos orfanizar as movimentacoes delas)
            const { data: crsPagas } = await ac
                .from("contas_receber")
                .select("id")
                .eq("venda_id", vendaId)
                .is("deleted_at", null)
                .or("status.eq.pago,valor_pago.gt.0");

            const crsPagasIds = (crsPagas || []).map((c: any) => c.id);

            // 2. Orfaniza movimentacoes das CRs pagas — dinheiro continua
            //    no saldo do banco, mas volta como pendente de conciliacao
            if (crsPagasIds.length > 0) {
                const { error: movErr } = await ac
                    .from("movimentacoes")
                    .update({
                        conta_receber_id: null,
                        status_conciliacao: "pendente",
                    })
                    .in("conta_receber_id", crsPagasIds);
                if (movErr) console.error("[deleteContrato] erro ao orfanizar movimentacoes:", movErr);
            }

            // 3. Soft-delete das CRs (trigger bloqueia DELETE hard)
            const { error: crsErr } = await ac
                .from("contas_receber")
                .update({ deleted_at: now })
                .eq("venda_id", vendaId)
                .is("deleted_at", null);
            if (crsErr) throw crsErr;

            // 4. vendas nao tem deleted_at nem trigger bloqueando — DELETE hard
            //    (FK contas_receber.venda_id ON DELETE SET NULL nao interfere:
            //     CRs ja estao soft-deletadas)
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
        updateContratoFull,
        updateContratoMetadata,
        deleteContrato,
        uploadContratoPdf,
    };
}
