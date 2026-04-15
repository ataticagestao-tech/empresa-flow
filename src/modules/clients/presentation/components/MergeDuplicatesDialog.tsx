import { useMemo, useState } from "react";
import { Users, Loader2, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { formatDoc, formatData } from "@/lib/format";

interface Props {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    clients: any[];
    onMerged: () => void;
}

type DupGroup = {
    key: string;
    label: string;
    clients: any[];
};

export function MergeDuplicatesDialog({ open, onOpenChange, clients, onMerged }: Props) {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const confirm = useConfirm();
    const [primarySelection, setPrimarySelection] = useState<Record<string, string>>({});
    const [mergingKey, setMergingKey] = useState<string | null>(null);

    const groups = useMemo<DupGroup[]>(() => {
        const byDoc = new Map<string, any[]>();
        clients.forEach((c) => {
            const doc = (c.cpf_cnpj || "").replace(/\D/g, "");
            if (!doc) return;
            if (!byDoc.has(doc)) byDoc.set(doc, []);
            byDoc.get(doc)!.push(c);
        });
        const list: DupGroup[] = [];
        byDoc.forEach((arr, doc) => {
            if (arr.length > 1) {
                const sorted = [...arr].sort((a, b) =>
                    (a.created_at || "").localeCompare(b.created_at || "")
                );
                list.push({ key: doc, label: formatDoc(doc), clients: sorted });
            }
        });
        return list.sort((a, b) => a.label.localeCompare(b.label));
    }, [clients]);

    const handleMerge = async (group: DupGroup) => {
        const primaryId = primarySelection[group.key] || group.clients[0].id;
        const primary = group.clients.find((c) => c.id === primaryId);
        const secondaries = group.clients.filter((c) => c.id !== primaryId);
        if (!primary || secondaries.length === 0) return;

        const ok = await confirm({
            title: `Mesclar ${secondaries.length + 1} cadastros em "${primary.razao_social}"?`,
            description: `Os outros ${secondaries.length} cadastro(s) serao excluidos. Vendas e contas a receber sao vinculados por CPF/CNPJ, entao o historico financeiro e preservado no cliente principal.`,
            confirmLabel: "Sim, mesclar",
            variant: "destructive",
        });
        if (!ok) return;

        setMergingKey(group.key);
        try {
            for (const sec of secondaries) {
                // Re-vincula accounts_receivable (tabela legada com FK client_id)
                await activeClient
                    .from("accounts_receivable")
                    .update({ client_id: primary.id })
                    .eq("client_id", sec.id);

                // Deleta apenas o registro do cliente secundario
                const { error } = await activeClient
                    .from("clients")
                    .delete()
                    .eq("id", sec.id);
                if (error) throw error;
            }
            toast.success(`${secondaries.length} duplicado(s) removido(s). Historico preservado em "${primary.razao_social}".`);
            onMerged();
        } catch (err: any) {
            console.error("[MergeDuplicates]", err);
            toast.error(err?.message || "Erro ao mesclar duplicados");
        } finally {
            setMergingKey(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Mesclar Clientes Duplicados
                    </DialogTitle>
                    <DialogDescription>
                        Grupos de clientes com mesmo CPF/CNPJ na empresa {selectedCompany?.nome_fantasia || selectedCompany?.razao_social || ""}.
                        Escolha o cadastro principal de cada grupo — os outros serao excluidos preservando o historico financeiro.
                    </DialogDescription>
                </DialogHeader>

                {groups.length === 0 ? (
                    <div className="py-10 text-center text-sm text-muted-foreground">
                        Nenhum cliente duplicado encontrado (match por CPF/CNPJ).
                    </div>
                ) : (
                    <ScrollArea className="max-h-[60vh] pr-4">
                        <div className="space-y-4">
                            {groups.map((group) => {
                                const selected = primarySelection[group.key] || group.clients[0].id;
                                const isMerging = mergingKey === group.key;
                                return (
                                    <div key={group.key} className="border rounded-lg p-4 bg-muted/30">
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="text-sm font-semibold">
                                                CPF/CNPJ: <span className="font-mono">{group.label}</span>
                                                <span className="ml-2 text-xs text-muted-foreground">
                                                    ({group.clients.length} cadastros)
                                                </span>
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                disabled={isMerging}
                                                onClick={() => handleMerge(group)}
                                            >
                                                {isMerging ? (
                                                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                                                )}
                                                Mesclar grupo
                                            </Button>
                                        </div>

                                        <RadioGroup
                                            value={selected}
                                            onValueChange={(v) =>
                                                setPrimarySelection((prev) => ({ ...prev, [group.key]: v }))
                                            }
                                        >
                                            <div className="space-y-2">
                                                {group.clients.map((c) => (
                                                    <div
                                                        key={c.id}
                                                        className="flex items-start gap-3 p-2 bg-white rounded border"
                                                    >
                                                        <RadioGroupItem value={c.id} id={c.id} className="mt-1" />
                                                        <Label
                                                            htmlFor={c.id}
                                                            className="flex-1 cursor-pointer font-normal"
                                                        >
                                                            <div className="text-sm font-medium">{c.razao_social}</div>
                                                            {c.nome_fantasia && c.nome_fantasia !== c.razao_social && (
                                                                <div className="text-xs text-muted-foreground">
                                                                    {c.nome_fantasia}
                                                                </div>
                                                            )}
                                                            <div className="text-xs text-muted-foreground mt-0.5 flex gap-3 flex-wrap">
                                                                {c.email && <span>{c.email}</span>}
                                                                {c.telefone && <span>Tel: {c.telefone}</span>}
                                                                <span>
                                                                    Criado: {c.created_at ? formatData(c.created_at) : "—"}
                                                                </span>
                                                            </div>
                                                        </Label>
                                                    </div>
                                                ))}
                                            </div>
                                        </RadioGroup>
                                    </div>
                                );
                            })}

                            <div className="flex items-start gap-2 text-xs text-muted-foreground p-3 bg-amber-50 border border-amber-200 rounded">
                                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                                <span>
                                    Vendas e contas a receber usam CPF/CNPJ como vinculo (nao FK direta), entao o
                                    historico financeiro continua disponivel no cadastro principal apos a mesclagem.
                                </span>
                            </div>
                        </div>
                    </ScrollArea>
                )}
            </DialogContent>
        </Dialog>
    );
}
