import { useEffect, useMemo, useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { maskCNPJ, maskCPF } from "@/utils/masks";

type LoserInfo = {
    id: string;
    razao_social: string;
    nome_fantasia: string | null;
    cpf_cnpj: string | null;
    score: number;
    created_at: string;
    updated_at: string;
};

type DupGroup = {
    group_key: string;
    total: number;
    winner_id: string;
    winner_razao_social: string;
    winner_score: number;
    losers: LoserInfo[];
};

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onApplied: () => void;
};

function maskDoc(doc: string | null) {
    if (!doc) return "—";
    return doc.length > 11 ? maskCNPJ(doc) : maskCPF(doc);
}

export function DuplicatesDialog({ open, onOpenChange, onApplied }: Props) {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const [loading, setLoading] = useState(false);
    const [applying, setApplying] = useState(false);
    const [groups, setGroups] = useState<DupGroup[]>([]);
    const [selected, setSelected] = useState<Record<string, boolean>>({});

    const loadPreview = async () => {
        if (!selectedCompany?.id) return;
        setLoading(true);
        const { data, error } = await activeClient.rpc("dedup_suppliers_preview", {
            p_company_id: selectedCompany.id,
        });
        setLoading(false);
        if (error) {
            toast.error("Erro ao buscar duplicados", { description: error.message });
            return;
        }
        const rows = (data ?? []) as DupGroup[];
        setGroups(rows);
        const allSelected: Record<string, boolean> = {};
        rows.forEach((g) => {
            allSelected[g.group_key] = true;
        });
        setSelected(allSelected);
    };

    useEffect(() => {
        if (open) loadPreview();
        else {
            setGroups([]);
            setSelected({});
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, selectedCompany?.id]);

    const selectedKeys = useMemo(
        () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
        [selected],
    );

    const totalLosers = useMemo(
        () =>
            groups
                .filter((g) => selected[g.group_key])
                .reduce((sum, g) => sum + g.losers.length, 0),
        [groups, selected],
    );

    const toggleAll = (value: boolean) => {
        const next: Record<string, boolean> = {};
        groups.forEach((g) => {
            next[g.group_key] = value;
        });
        setSelected(next);
    };

    const handleApply = async () => {
        if (!selectedCompany?.id || selectedKeys.length === 0) return;
        setApplying(true);
        const { data, error } = await activeClient.rpc("dedup_suppliers_apply", {
            p_company_id: selectedCompany.id,
            p_group_keys: selectedKeys,
        });
        setApplying(false);
        if (error) {
            toast.error("Erro ao mesclar duplicados", { description: error.message });
            return;
        }
        const result = (data?.[0] ?? {}) as {
            grupos_processados?: number;
            fornecedores_removidos?: number;
            refs_reatribuidas?: number;
        };
        toast.success(
            `${result.fornecedores_removidos ?? 0} fornecedor(es) removido(s) em ${result.grupos_processados ?? 0} grupo(s)`,
            { description: `${result.refs_reatribuidas ?? 0} referência(s) reatribuída(s) ao vencedor.` },
        );
        onApplied();
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4" /> Fornecedores duplicados
                    </DialogTitle>
                    <DialogDescription>
                        Agrupados por CPF/CNPJ (ou nome). O cadastro mais completo é mantido; os demais são
                        removidos e suas referências (CP, OC, NF-e, estoque) reatribuídas ao vencedor.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto -mx-6 px-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-12 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Procurando duplicados…
                        </div>
                    ) : groups.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            Nenhum fornecedor duplicado encontrado.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">
                                    {groups.length} grupo(s) · {totalLosers} cadastro(s) serão removidos
                                </span>
                                <div className="flex gap-2">
                                    <Button variant="ghost" size="sm" onClick={() => toggleAll(true)}>
                                        Selecionar todos
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => toggleAll(false)}>
                                        Limpar
                                    </Button>
                                </div>
                            </div>
                            {groups.map((g) => (
                                <div
                                    key={g.group_key}
                                    className="border rounded-lg p-3 flex gap-3 items-start"
                                >
                                    <Checkbox
                                        checked={!!selected[g.group_key]}
                                        onCheckedChange={(v) =>
                                            setSelected((s) => ({ ...s, [g.group_key]: !!v }))
                                        }
                                        className="mt-1"
                                    />
                                    <div className="flex-1 space-y-2 text-sm">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Badge variant="default">Mantém</Badge>
                                            <span className="font-medium">{g.winner_razao_social}</span>
                                            <span className="text-xs text-muted-foreground">
                                                completude: {g.winner_score}
                                            </span>
                                        </div>
                                        <div className="pl-1 space-y-1">
                                            {g.losers.map((l) => (
                                                <div
                                                    key={l.id}
                                                    className="flex items-center gap-2 flex-wrap text-muted-foreground"
                                                >
                                                    <Badge variant="destructive">Remove</Badge>
                                                    <span>{l.razao_social}</span>
                                                    <span className="text-xs">· {maskDoc(l.cpf_cnpj)}</span>
                                                    <span className="text-xs">· completude {l.score}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={applying}>
                        Cancelar
                    </Button>
                    <Button
                        onClick={handleApply}
                        disabled={applying || selectedKeys.length === 0 || groups.length === 0}
                        variant="destructive"
                    >
                        {applying && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Mesclar selecionados
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
