import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui/skeleton";
import { Paperclip } from "lucide-react";

type TipoAlvo = "funcionario" | "fornecedor" | "cliente";

interface Props {
    tipo: TipoAlvo;
    /** id do funcionário / fornecedor / cliente */
    id: string | null | undefined;
}

interface Interacao {
    id: string;
    canal: string | null;
    direcao: string | null;
    tema: string | null;
    resumo: string | null;
    teve_arquivo: boolean;
    arquivo_path: string | null;
    telefone: string | null;
    ocorrido_em: string;
}

const COL_POR_TIPO: Record<TipoAlvo, string> = {
    funcionario: "employee_id",
    fornecedor: "supplier_id",
    cliente: "customer_id",
};

const CANAL_LABEL: Record<string, string> = {
    whatsapp: "WhatsApp",
    assistente: "Assistente",
    sistema: "Sistema",
};

function formatarData(iso: string): string {
    try {
        return new Date(iso).toLocaleString("pt-BR", {
            day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
            timeZone: "America/Sao_Paulo",
        });
    } catch {
        return iso;
    }
}

/**
 * Aba "Interações": histórico de conversas (WhatsApp/assistente/sistema)
 * resumido pela IA e anexado ao cadastro da pessoa.
 * Lê de public.interacoes_cadastro (RLS por empresa).
 */
export function InteracoesCadastro({ tipo, id }: Props) {
    const { activeClient } = useAuth();
    const coluna = COL_POR_TIPO[tipo];

    const { data: interacoes = [], isLoading } = useQuery({
        queryKey: ["interacoes_cadastro", tipo, id],
        queryFn: async () => {
            if (!id) return [];
            const { data, error } = await activeClient
                .from("interacoes_cadastro")
                .select("id, canal, direcao, tema, resumo, teve_arquivo, arquivo_path, telefone, ocorrido_em")
                .eq(coluna, id)
                .order("ocorrido_em", { ascending: false })
                .limit(50);
            if (error) throw error;
            return (data ?? []) as Interacao[];
        },
        enabled: !!id,
    });

    if (isLoading) {
        return (
            <div className="space-y-2 p-3">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="border border-[#EAECF0] rounded p-3 space-y-2">
                        <Skeleton className="h-3.5 w-2/5" />
                        <Skeleton className="h-3 w-4/5" />
                    </div>
                ))}
            </div>
        );
    }

    if (interacoes.length === 0) {
        return (
            <div className="p-6 text-center text-[12px] text-[#888]">
                Nenhuma interação registrada ainda.
                <br />
                Conversas por WhatsApp com essa pessoa aparecem aqui, resumidas automaticamente.
            </div>
        );
    }

    return (
        <div className="space-y-2 p-3">
            {interacoes.map((it) => (
                <div key={it.id} className="border border-[#EAECF0] rounded p-3">
                    <div className="flex items-start justify-between gap-3">
                        <span className="text-[13px] font-semibold text-[#1A1A1A]">
                            {it.tema || "Conversa"}
                        </span>
                        <span className="text-[11px] text-[#888] whitespace-nowrap">
                            {formatarData(it.ocorrido_em)}
                        </span>
                    </div>
                    {it.resumo && (
                        <p className="mt-1 text-[12px] text-[#555] leading-relaxed">{it.resumo}</p>
                    )}
                    <div className="mt-2 flex items-center gap-2 text-[11px] text-[#888]">
                        <span className="px-1.5 py-0.5 rounded bg-[#F2F4F7]">
                            {CANAL_LABEL[it.canal ?? ""] ?? it.canal ?? "—"}
                        </span>
                        {it.teve_arquivo && (
                            <span className="inline-flex items-center gap-1 text-[#059669]">
                                <Paperclip className="h-3 w-3" /> arquivo
                            </span>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
}
