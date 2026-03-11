import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AlertTriangle, Trash2, History, Settings } from "lucide-react";
import { toast } from "sonner";

export default function Configuracoes() {
    const { activeClient, user, isUsingSecondary } = useAuth();
    const [locale, setLocale] = useState<string>(() => localStorage.getItem("app.locale") || "pt-BR");
    const [currency, setCurrency] = useState<string>(() => localStorage.getItem("app.currency") || "BRL");
    
    // Examples for preview
    const dateExample = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "long", year: "numeric" }).format(new Date());
    const moneyExample = new Intl.NumberFormat(locale, { style: "currency", currency }).format(1234.56);

    const handleSavePreferences = () => {
        localStorage.setItem("app.locale", locale);
        localStorage.setItem("app.currency", currency);
        toast.success("Preferências salvas com sucesso!");
        // Force reload to apply changes globally if needed, or just rely on React state/context in future
        setTimeout(() => window.location.reload(), 1000);
    };

    // Audit Logs Query
    const { data: auditLogs, isLoading: isLoadingLogs } = useQuery({
        queryKey: ["audit_logs", user?.id, isUsingSecondary],
        queryFn: async () => {
            if (!user) return [];
            const { data, error } = await activeClient
                .from("audit_logs")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(50);
            
            if (error) throw error;
            return data;
        },
        enabled: !!user,
    });

    const handleClearData = async () => {
        const confirmText = "DELETAR";
        const input = prompt(`Esta ação apagará TODOS os dados da sua empresa atual. Digite "${confirmText}" para confirmar:`);
        
        if (input === confirmText) {
            toast.error("Funcionalidade de limpeza total ainda em desenvolvimento para segurança.");
            // Implementation pending: would require cascaded deletes or specific logic
        }
    };

    return (
        <AppLayout title="Configurações">
            <div className="space-y-6 animate-fade-in">
                <div className="flex items-center gap-2">
                    <Settings className="h-8 w-8 text-muted-foreground" />
                    <h2 className="text-lg font-bold tracking-tight text-foreground">Configurações</h2>
                </div>

                <Tabs defaultValue="geral" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 max-w-md mb-6">
                        <TabsTrigger value="geral">Geral</TabsTrigger>
                        <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
                        <TabsTrigger value="perigo" className="text-[#EF4444] data-[state=active]:text-red-700">Zona de Perigo</TabsTrigger>
                    </TabsList>

                    <TabsContent value="geral">
                        <Card>
                            <CardHeader>
                                <CardTitle>Preferências Regionais</CardTitle>
                                <CardDescription>Ajuste como datas e valores são exibidos.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <Label>Idioma & Região</Label>
                                        <Select value={locale} onValueChange={setLocale}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                                                <SelectItem value="en-US">English (United States)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">Exemplo: {dateExample}</p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Moeda Padrão</Label>
                                        <Select value={currency} onValueChange={setCurrency}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="BRL">Real Brasileiro (BRL)</SelectItem>
                                                <SelectItem value="USD">Dólar Americano (USD)</SelectItem>
                                                <SelectItem value="EUR">Euro (EUR)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">Exemplo: {moneyExample}</p>
                                    </div>
                                </div>
                                <div className="flex justify-end pt-4">
                                    <Button onClick={handleSavePreferences} className="bg-green-600 hover:bg-green-700">
                                        Salvar Alterações
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="auditoria">
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <History className="h-5 w-5" />
                                    Histórico de Atividades
                                </CardTitle>
                                <CardDescription>Registro de ações importantes e exclusões recentes.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Data/Hora</TableHead>
                                            <TableHead>Ação</TableHead>
                                            <TableHead>Entidade</TableHead>
                                            <TableHead>Detalhes</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoadingLogs ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                                    Carregando histórico...
                                                </TableCell>
                                            </TableRow>
                                        ) : auditLogs?.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                                    Nenhum registro encontrado.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            auditLogs?.map((log: any) => (
                                                <TableRow key={log.id}>
                                                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                                        {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className="uppercase text-[10px]">
                                                            {log.action}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="capitalize">{log.entity}</TableCell>
                                                    <TableCell className="text-xs font-mono text-muted-foreground max-w-[300px] truncate" title={JSON.stringify(log.payload, null, 2)}>
                                                        {log.payload ? JSON.stringify(log.payload).substring(0, 50) + (JSON.stringify(log.payload).length > 50 ? "..." : "") : "-"}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="perigo">
                        <Card className="border-red-200 bg-red-50">
                            <CardHeader>
                                <CardTitle className="text-red-700 flex items-center gap-2">
                                    <AlertTriangle className="h-5 w-5" />
                                    Zona de Perigo
                                </CardTitle>
                                <CardDescription className="text-[#EF4444]">
                                    Ações irreversíveis que afetam seus dados.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="flex items-center justify-between bg-white p-4 rounded-lg border border-red-100">
                                    <div>
                                        <h4 className="font-bold text-foreground">Excluir Dados da Empresa</h4>
                                        <p className="text-sm text-muted-foreground">Remove todos os registros financeiros e cadastros desta empresa.</p>
                                    </div>
                                    <Button variant="destructive" onClick={handleClearData}>
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Excluir Tudo
                                    </Button>
                                </div>
                                
                                <div className="flex items-center justify-between bg-white p-4 rounded-lg border border-red-100 opacity-50 pointer-events-none">
                                    <div>
                                        <h4 className="font-bold text-foreground">Excluir Minha Conta</h4>
                                        <p className="text-sm text-muted-foreground">Encerra o acesso e remove todos os vínculos.</p>
                                    </div>
                                    <Button variant="destructive" disabled>
                                        Excluir Conta
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>
        </AppLayout>
    );
}

function Badge({ children, variant, className }: any) {
    const variants: any = {
        default: "bg-primary text-primary-foreground",
        secondary: "bg-secondary text-secondary-foreground",
        destructive: "bg-destructive text-destructive-foreground",
        outline: "border border-input bg-background",
    }
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${variants[variant || "default"]} ${className}`}>
            {children}
        </span>
    )
}
