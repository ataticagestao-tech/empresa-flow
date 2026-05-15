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
import { AlertTriangle, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { maskCPF } from "@/utils/masks";

type LoserInfo = {
    id: string;
    nome: string;
    cpf: string | null;
    status: string | null;
    score: number;
    tem_historico: boolean;
    created_at: string;
};

type DupGroup = {
    group_key: string;
    total: number;
    winner_id: string;
    winner_nome: string;
    winner_score: number;
    losers: LoserInfo[];
    bloqueado: boolean;
    motivo_bloqueio: string | null;
};

type Props = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onApplied: () => void;
};

export function EmployeeDuplicatesDialog({ open, onOpenChange, onApplied }: Props) {
    const { activeClient } = useAuth();
    const { selectedCompany } = useCompany();
    const [loading, setLoading] = useState(false);
    const [applying, setApplying] = useState(false);
    const [groups, setGroups] = useState<DupGroup[]>([]);
    const [selected, setSelected] = useState<Record<string, boolean>>({});

    const loadPreview = async () => {
        if (!selectedCompany?.id) return;
        setLoading(true);
        const { data, error } = await activeClient.rpc("dedup_employees_preview", {
            p_company_id: selectedCompany.id,
        });
        setLoading(false);
        if (error) {
            toast.error("Erro ao buscar duplicados", { description: error.message });
            return;
        }
        const rows = (data ?? []) as DupGroup[];
        setGroups(rows);
        const init: Record<string, boolean> = {};
        rows.forEach((g) => {
            init[g.group_key] = !g.bloqueado;
        });
        setSelected(init);
    };

    useEffect(() => {
        if (open) loadPreview();
        else {
            setGroups([]);
            setSelected({});
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, selectedCompany?.id]);

    const selectableKeys = useMemo(
        () => groups.filter((g) => !g.bloqueado).map((g) => g.group_key),
        [groups],
    );

    const selectedKeys = useMemo(
        () => Object.entries(selected).filter(([, v]) => v).map(([k]) => k),
        [selected],
    );

    const totalLosers = useMemo(
        () =>
            groups
                .filter((g) => selected[g.group_key] && !g.bloqueado)
                .reduce((sum, g) => sum + g.losers.length, 0),
        [groups, selected],
    );

    const toggleAll = (value: boolean) => {
        const next: Record<string, boolean> = {};
        groups.forEach((g) => {
            next[g.group_key] = value && !g.bloqueado;
        });
        setSelected(next);
    };

    const handleApply = async () => {
        if (!selectedCompany?.id || selectedKeys.length === 0) return;
        setApplying(true);
        const { data, error } = await activeClient.rpc("dedup_employees_apply", {
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
            funcionarios_removidos?: number;
            grupos_bloqueados?: number;
        };
        toast.success(
            `${result.funcionarios_removidos ?? 0} funcionário(s) removido(s) em ${result.grupos_processados ?? 0} grupo(s)`,
            result.grupos_bloqueados
                ? { description: `${result.grupos_bloqueados} grupo(s) ignorado(s) por terem histórico.` }
                : undefined,
        );
        onApplied();
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Users className="h-4 w-4" /> Funcionários duplicados
                    </DialogTitle>
                    <DialogDescription>
                        Agrupados por CPF (ou nome). O cadastro mais completo é mantido. Grupos em que o
                        duplicado tem folha/ponto/férias/encargos lançados ficam bloqueados (não podem ser
                        removidos pra não apagar o histórico em cascata).
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto -mx-6 px-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-12 text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Procurando duplicados…
                        </div>
                    ) : groups.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            Nenhum funcionário duplicado encontrado.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-muted-foreground">
                                    {groups.length} grupo(s) · {totalLosers} cadastro(s) serão removidos
                                </span>
                                <div className="flex gap-2">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => toggleAll(true)}
                                        disabled={selectableKeys.length === 0}
                                    >
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
                                    className={`border rounded-lg p-3 flex gap-3 items-start ${
                                        g.bloqueado ? "bg-amber-50 border-amber-200" : ""
                                    }`}
                                >
                                    <Checkbox
                                        checked={!!selected[g.group_key]}
                                        onCheckedChange={(v) =>
                                            setSelected((s) => ({ ...s, [g.group_key]: !!v }))
                                        }
                                        disabled={g.bloqueado}
                                        className="mt-1"
                                    />
                                    <div className="flex-1 space-y-2 text-sm">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Badge variant="default">Mantém</Badge>
                                            <span className="font-medium">{g.winner_nome}</span>
                                            <span className="text-xs text-muted-foreground">
                                                completude: {g.winner_score}
                                            </span>
                                            {g.bloqueado && (
                                                <Badge variant="outline" className="border-amber-400 text-amber-700">
                                                    <AlertTriangle className="h-3 w-3 mr-1" /> Bloqueado
                                                </Badge>
                                            )}
                                        </div>
                                        {g.bloqueado && g.motivo_bloqueio && (
                                            <p className="text-xs text-amber-700">{g.motivo_bloqueio}</p>
                                        )}
                                        <div className="pl-1 space-y-1">
                                            {g.losers.map((l) => (
                                                <div
                                                    key={l.id}
                                                    className="flex items-center gap-2 flex-wrap text-muted-foreground"
                                                >
                                                    <Badge variant={g.bloqueado ? "outline" : "destructive"}>
                                                        {g.bloqueado ? "Manter (tem histórico)" : "Remove"}
                                                    </Badge>
                                                    <span>{l.nome}</span>
                                                    <span className="text-xs">
                                                        · {l.cpf ? maskCPF(l.cpf) : "sem CPF"}
                                                    </span>
                                                    <span className="text-xs">· completude {l.score}</span>
                                                    {l.tem_historico && (
                                                        <span className="text-xs text-amber-700">· tem histórico</span>
                                                    )}
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
