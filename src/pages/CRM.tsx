
import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { useCRM, Opportunity } from "@/modules/crm/hooks/useCRM";
import { Button } from "@/components/ui/button";
import { Plus, MoreHorizontal, Calendar, DollarSign, User, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { format } from "date-fns";

export default function CRM() {
    const { stages, opportunities, isLoading, createOpportunity, moveOpportunity } = useCRM();
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    // Form State
    const [newOpp, setNewOpp] = useState<Partial<Opportunity>>({
        title: "",
        value: 0,
        stage_id: ""
    });

    const handleCreate = async () => {
        if (!newOpp.title || !newOpp.stage_id) return;
        await createOpportunity.mutateAsync(newOpp);
        setIsDialogOpen(false);
        setNewOpp({ title: "", value: 0, stage_id: "" });
    };

    if (isLoading) {
        return (
            <AppLayout title="CRM - Oportunidades">
                <div className="flex items-center justify-center h-[calc(100vh-100px)]">
                    <div className="animate-spin h-8 w-8 border-4 border-emerald-600 border-t-transparent rounded-full" />
                </div>
            </AppLayout>
        );
    }

    return (
        <AppLayout title="CRM - Gestão de Oportunidades">
            <div className="h-full flex flex-col space-y-4 animate-in fade-in">

                <div className="flex justify-between items-center px-6 pt-4">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight text-foreground">Pipeline de Vendas</h2>
                        <p className="text-muted-foreground">Gerencie suas negociações e acompanhe o progresso.</p>
                    </div>
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button className="bg-emerald-600 hover:bg-emerald-700">
                                <Plus className="mr-2 h-4 w-4" /> Nova Oportunidade
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Nova Oportunidade</DialogTitle>
                            </DialogHeader>
                            <div className="grid gap-4 py-4">
                                <div className="grid gap-2">
                                    <Label>Título do Negócio</Label>
                                    <Input
                                        placeholder="Ex: Contrato Anual - Empresa X"
                                        value={newOpp.title}
                                        onChange={(e) => setNewOpp({ ...newOpp, title: e.target.value })}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label>Valor Estimado (R$)</Label>
                                    <Input
                                        type="number"
                                        placeholder="0.00"
                                        value={newOpp.value}
                                        onChange={(e) => setNewOpp({ ...newOpp, value: Number(e.target.value) })}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label>Etapa Inicial</Label>
                                    <Select
                                        onValueChange={(val) => setNewOpp({ ...newOpp, stage_id: val })}
                                        value={newOpp.stage_id}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Selecione a etapa" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {stages?.map(s => (
                                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                {/* Futuro: Select de Cliente */}
                            </div>
                            <DialogFooter>
                                <Button onClick={handleCreate}>Criar Oportunidade</Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>

                {/* Kanban Board */}
                <div className="flex-1 overflow-x-auto overflow-y-hidden px-6 pb-6">
                    <div className="flex h-full gap-4 min-w-[1200px]"> {/* Min width to ensure scroll horizontal */}
                        {stages?.map((stage) => {
                            const stageOpps = opportunities?.filter(o => o.stage_id === stage.id) || [];
                            const totalValue = stageOpps.reduce((acc, curr) => acc + (curr.value || 0), 0);

                            return (
                                <div key={stage.id} className="flex flex-col w-80 bg-white rounded-xl border border-[#EAECF0] shadow-sm max-h-full">
                                    {/* Column Header */}
                                    <div className="p-3 border-b border-[#EAECF0] rounded-t-xl sticky top-0 z-10">
                                        <div className="flex justify-between items-center mb-1">
                                            <h3 className="font-semibold text-muted-foreground text-sm uppercase tracking-wide flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: stage.color || '#cbd5e1' }} />
                                                {stage.name}
                                            </h3>
                                            <span className="text-xs text-muted-foreground font-mono bg-white px-1.5 py-0.5 rounded">{stageOpps.length}</span>
                                        </div>
                                        <div className="text-lg font-bold text-foreground">
                                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalValue)}
                                        </div>
                                    </div>

                                    {/* Cards Area */}
                                    <ScrollArea className="flex-1 p-2">
                                        <div className="space-y-2">
                                            {stageOpps.map(opp => (
                                                <Card key={opp.id} className="cursor-pointer hover:shadow-md transition-shadow group bg-white border-[#EAECF0]">
                                                    <CardContent className="p-3 space-y-2">
                                                        <div className="flex justify-between items-start">
                                                            <h4 className="font-medium text-foreground leading-tight line-clamp-2 pr-2">
                                                                {opp.title}
                                                            </h4>
                                                            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100 -mr-2 -mt-1">
                                                                <MoreHorizontal className="h-3 w-3" />
                                                            </Button>
                                                        </div>

                                                        {opp.client_name && (
                                                            <div className="flex items-center text-xs text-muted-foreground">
                                                                <User className="h-3 w-3 mr-1" />
                                                                <span className="truncate">{opp.client_name}</span>
                                                            </div>
                                                        )}

                                                        <div className="flex items-center justify-between pt-1">
                                                            <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 border-0 text-[10px] px-1.5 h-5 flex items-center gap-1">
                                                                <DollarSign className="h-2.5 w-2.5" />
                                                                {new Intl.NumberFormat('pt-BR', { notation: "compact", maximumFractionDigits: 1 }).format(opp.value)}
                                                            </Badge>
                                                            {opp.expected_close_date && (
                                                                <div className="flex items-center text-[10px] text-muted-foreground">
                                                                    <Calendar className="h-2.5 w-2.5 mr-1" />
                                                                    {format(new Date(opp.expected_close_date), 'dd/MMM')}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </CardContent>

                                                    {/* Quick Actions (Move Next) */}
                                                    <CardFooter className="p-0 border-t bg-white hidden group-hover:flex">
                                                        {/* Logic to find next stage */}
                                                        {(() => {
                                                            const currentIdx = stages.findIndex(s => s.id === stage.id);
                                                            const nextStage = stages[currentIdx + 1];
                                                            if (nextStage) {
                                                                return (
                                                                    <Button
                                                                        variant="ghost"
                                                                        className="w-full rounded-t-none h-8 text-xs text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50"
                                                                        onClick={() => moveOpportunity.mutate({ oppId: opp.id, newStageId: nextStage.id })}
                                                                    >
                                                                        Mover para {nextStage.name} <ArrowRight className="ml-1 h-3 w-3" />
                                                                    </Button>
                                                                );
                                                            }
                                                            return null;
                                                        })()}
                                                    </CardFooter>
                                                </Card>
                                            ))}
                                        </div>
                                    </ScrollArea>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </AppLayout>
    );
}
