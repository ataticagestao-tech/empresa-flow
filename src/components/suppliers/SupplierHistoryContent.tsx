import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { formatBRL } from "@/lib/format";
import { FileText } from "lucide-react";
import { gerarRelatorioFornecedorPDF, type RelatorioFornecedorData } from "@/lib/fornecedor-pdf/gerar-pdf";

interface Props {
    supplier: any;
    showPDFButton?: boolean;
}

const onlyDigits = (v: string | null | undefined) => (v || "").replace(/\D/g, "");
const normalizeName = (v: string | null | undefined) =>
    (v || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

export function SupplierHistoryContent({ supplier, showPDFButton = true }: Props) {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const [gerandoPDF, setGerandoPDF] = useState(false);

    const { data: pagamentos = [], isLoading } = useQuery({
        queryKey: ["pagamentos-fornecedor", supplier?.id, supplier?.cpf_cnpj],
        queryFn: async () => {
            if (!supplier?.id || !selectedCompany?.id) return [];
            const db = activeClient as any;
            const cpfDigits = onlyDigits(supplier.cpf_cnpj);
            const fullName = normalizeName(supplier.razao_social);
            const fantasiaName = normalizeName(supplier.nome_fantasia);
            const tokens = Array.from(new Set([
                ...fullName.split(" ").filter((t: string) => t.length >= 3),
                ...fantasiaName.split(" ").filter((t: string) => t.length >= 3),
            ]));
            const pix = (supplier.dados_bancarios_pix || "").trim();

            if (!cpfDigits && tokens.length === 0 && !pix) return [];
            const orParts: string[] = [];
            if (cpfDigits) {
                if (cpfDigits.length === 11) {
                    orParts.push(`credor_cpf_cnpj.ilike.*${cpfDigits.slice(0, 3)}*${cpfDigits.slice(3, 6)}*${cpfDigits.slice(6, 9)}*`);
                } else if (cpfDigits.length === 14) {
                    orParts.push(`credor_cpf_cnpj.ilike.*${cpfDigits.slice(0, 2)}*${cpfDigits.slice(2, 5)}*${cpfDigits.slice(5, 8)}*`);
                } else {
                    orParts.push(`credor_cpf_cnpj.ilike.*${cpfDigits}*`);
                }
            }
            for (const t of tokens) orParts.push(`credor_nome.ilike.*${t}*`);
            if (pix) orParts.push(`observacoes.ilike.*${pix}*`);

            let q = db.from("contas_pagar")
                .select("id, valor, valor_pago, data_vencimento, data_pagamento, status, descricao, observacoes, credor_nome, credor_cpf_cnpj, bank:conta_bancaria_id(name), categoria:conta_contabil_id(name)")
                .eq("company_id", selectedCompany.id)
                .is("deleted_at", null)
                .order("data_vencimento", { ascending: false })
                .limit(500);
            if (orParts.length) q = q.or(orParts.join(","));

            const { data } = await q;
            return ((data ?? []) as any[]).filter(cp => {
                const cpCpf = onlyDigits(cp.credor_cpf_cnpj);
                if (cpfDigits && cpCpf === cpfDigits) return true;
                const cpName = normalizeName(cp.credor_nome);
                if (cpName && fullName && (cpName === fullName || cpName.startsWith(fullName) || fullName.startsWith(cpName))) return true;
                if (cpName && fantasiaName && (cpName === fantasiaName || cpName.startsWith(fantasiaName) || fantasiaName.startsWith(cpName))) return true;
                if (cpName && tokens.length >= 2 && tokens.every((t: string) => cpName.includes(t))) return true;
                if (pix && cp.observacoes && cp.observacoes.includes(pix)) return true;
                return false;
            });
        },
        enabled: !!supplier?.id && !!selectedCompany?.id,
    });

    const totalPago = pagamentos
        .filter((p: any) => p.status === "pago")
        .reduce((s: number, p: any) => s + Number(p.valor_pago ?? p.valor ?? 0), 0);
    const totalAberto = pagamentos
        .filter((p: any) => p.status !== "pago" && p.status !== "cancelado")
        .reduce((s: number, p: any) => s + Number(p.valor ?? 0), 0);

    const vincularCP = async (cpId: string) => {
        if (!supplier?.cpf_cnpj) {
            toast.error("Cadastre o CPF/CNPJ do fornecedor antes de vincular.");
            return;
        }
        const cpfDigits = onlyDigits(supplier.cpf_cnpj);
        const ok = await confirm({
            title: "Vincular este pagamento ao fornecedor?",
            description: `O documento ${supplier.cpf_cnpj} será gravado nesta conta a pagar.`,
            confirmLabel: "Sim, vincular",
        });
        if (!ok) return;
        try {
            const { error } = await (activeClient as any)
                .from("contas_pagar").update({ credor_cpf_cnpj: cpfDigits }).eq("id", cpId);
            if (error) throw error;
            toast.success("Pagamento vinculado ao fornecedor.");
            queryClient.invalidateQueries({ queryKey: ["pagamentos-fornecedor", supplier.id] });
        } catch (err: any) {
            toast.error("Erro ao vincular: " + (err.message || "desconhecido"));
        }
    };

    const gerarPDF = async () => {
        if (!supplier || !selectedCompany) return;
        setGerandoPDF(true);
        try {
            const enderecoParts = [
                supplier.endereco_logradouro,
                supplier.endereco_numero,
                supplier.endereco_complemento,
                supplier.endereco_bairro,
                supplier.endereco_cidade && supplier.endereco_estado
                    ? `${supplier.endereco_cidade} - ${supplier.endereco_estado}`
                    : supplier.endereco_cidade || supplier.endereco_estado,
                supplier.endereco_cep,
            ].filter(Boolean);
            const endereco = enderecoParts.length > 0 ? enderecoParts.join(", ") : null;

            const payload: RelatorioFornecedorData = {
                empresa_nome: selectedCompany.nome_fantasia || selectedCompany.razao_social || "Empresa",
                empresa_cnpj: selectedCompany.cnpj ?? null,
                fornecedor: {
                    razao_social: supplier.razao_social,
                    nome_fantasia: supplier.nome_fantasia ?? null,
                    tipo_pessoa: supplier.tipo_pessoa ?? null,
                    cpf_cnpj: supplier.cpf_cnpj ?? null,
                    inscricao_estadual: supplier.inscricao_estadual ?? null,
                    email: supplier.email ?? null,
                    telefone: supplier.telefone ?? null,
                    celular: supplier.celular ?? null,
                    endereco,
                    banco: supplier.dados_bancarios_banco ?? null,
                    agencia: supplier.dados_bancarios_agencia ?? null,
                    conta: supplier.dados_bancarios_conta ?? null,
                    tipo_conta: supplier.dados_bancarios_tipo ?? null,
                    pix: supplier.dados_bancarios_pix ?? null,
                    observacoes: supplier.observacoes ?? null,
                    tags: supplier.tags ?? null,
                    is_active: !!supplier.is_active,
                },
                pagamentos: pagamentos.map((cp: any) => ({
                    competencia: cp.data_vencimento ? cp.data_vencimento.slice(0, 7) : "",
                    descricao: cp.descricao?.trim() || cp.observacoes?.trim() || cp.credor_nome || "CP",
                    valor: Number(cp.valor_pago ?? cp.valor ?? 0),
                    data_vencimento: cp.data_vencimento ?? null,
                    data_pagamento: cp.data_pagamento ?? null,
                    conta: cp.bank?.name ?? null,
                    categoria: cp.categoria?.name ?? null,
                    status: cp.status ?? "aberto",
                })),
            };

            const blob = await gerarRelatorioFornecedorPDF(payload);
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const safeName = (supplier.razao_social || "fornecedor").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
            a.download = `relatorio-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toast.success("PDF gerado.");
        } catch (err: any) {
            console.error(err);
            toast.error("Erro ao gerar PDF: " + (err.message || "desconhecido"));
        } finally {
            setGerandoPDF(false);
        }
    };

    return (
        <div className="space-y-3">
            <div className="border border-[#ccc] rounded-lg overflow-hidden">
                <div className="bg-[#059669] px-3 py-1.5 flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-white">Histórico de pagamentos</span>
                    <div className="flex items-center gap-3 text-[9px] font-bold text-white/90">
                        <span>Pago: {formatBRL(totalPago)}</span>
                        <span>Em aberto: {formatBRL(totalAberto)}</span>
                        {showPDFButton && (
                            <Button size="sm" onClick={gerarPDF} disabled={gerandoPDF} className="h-6 px-2 py-0 bg-white text-[#059669] hover:bg-white/90 text-[10px]">
                                <FileText className="mr-1 h-3 w-3" />
                                {gerandoPDF ? "Gerando..." : "PDF"}
                            </Button>
                        )}
                    </div>
                </div>
                {isLoading ? (
                    <div className="p-6 text-center text-[#555] text-xs">Carregando…</div>
                ) : pagamentos.length === 0 ? (
                    <div className="p-6 text-center text-[#555] text-xs">
                        Nenhum pagamento encontrado para este fornecedor.
                        {!supplier.cpf_cnpj && <div className="mt-1 text-[10px]">Cadastre o CPF/CNPJ para identificar CPs lançadas manualmente.</div>}
                    </div>
                ) : (
                    <div className="divide-y divide-[#eee]">
                        {pagamentos.map((p: any) => {
                            const desc = p.descricao?.trim() || p.observacoes?.trim() || p.credor_nome || "CP";
                            const competencia = p.data_vencimento ? p.data_vencimento.slice(2, 7).split("-").reverse().join("/") : "—";
                            const statusBadge =
                                p.status === "pago" ? "bg-[#ECFDF4] text-[#059669]" :
                                p.status === "parcial" ? "bg-[#FEF3C7] text-[#92400E]" :
                                p.status === "vencido" ? "bg-[#FEE2E2] text-[#991B1B]" :
                                p.status === "cancelado" ? "bg-[#EAECF0] text-[#555]" :
                                "bg-[#F6F2EB] text-[#555]";
                            const statusLabel =
                                p.status === "pago" ? "Pago" :
                                p.status === "parcial" ? "Parcial" :
                                p.status === "vencido" ? "Vencido" :
                                p.status === "cancelado" ? "Cancelado" :
                                "Em aberto";
                            const valor = Number(p.valor_pago ?? p.valor ?? 0);
                            const dataPagoLabel = p.data_pagamento ? new Date(p.data_pagamento + "T12:00:00").toLocaleDateString("pt-BR") : null;
                            const cpDocDigits = onlyDigits(p.credor_cpf_cnpj);
                            const supplierDocDigits = onlyDigits(supplier.cpf_cnpj);
                            const podeVincular = p.id && (!cpDocDigits || cpDocDigits !== supplierDocDigits);
                            return (
                                <div key={p.id} className="px-3 py-2 hover:bg-[#FAFAF7]">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-[10px] font-bold text-[#555] tabular-nums shrink-0">{competencia}</span>
                                            <span className="text-[12px] text-[#1D2939] truncate" title={desc}>{desc}</span>
                                        </div>
                                        <span className="text-[12px] font-bold text-[#1D2939] tabular-nums whitespace-nowrap shrink-0">{formatBRL(valor)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 mt-1">
                                        <div className="flex items-center gap-2 text-[10px] text-[#777] min-w-0">
                                            <span className={`font-bold px-1.5 py-0.5 rounded ${statusBadge}`}>{statusLabel}</span>
                                            {dataPagoLabel && <span className="whitespace-nowrap">Pago {dataPagoLabel}</span>}
                                            {p.categoria?.name && <span className="truncate">· {p.categoria.name}</span>}
                                            {p.bank?.name && <span className="truncate">· {p.bank.name}</span>}
                                        </div>
                                        {podeVincular && supplier.cpf_cnpj ? (
                                            <button onClick={() => vincularCP(p.id)} title="Gravar CPF/CNPJ na conta a pagar" className="text-[10px] font-bold text-[#059669] hover:bg-[#ECFDF4] rounded px-2 py-0.5 shrink-0">Vincular</button>
                                        ) : null}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
