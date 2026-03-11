import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Search, FileText, Printer, Mail } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";

export default function Recibos() {
    const { selectedCompany } = useCompany();
    const { activeClient, isUsingSecondary } = useAuth();
    const [searchTerm, setSearchTerm] = useState("");

    const normalizeSearch = (value: unknown) =>
        String(value ?? "")
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim();

    // Fetch Receipts (represented by credit transactions)
    const { data: receipts, isLoading } = useQuery({
        queryKey: ["receipts", selectedCompany?.id, isUsingSecondary],
        queryFn: async () => {
            if (!selectedCompany?.id) return [];
            const { data, error } = await activeClient
                .from("transactions")
                .select(`
                    *,
                    bank_account:bank_accounts(name),
                    category:categories(name)
                `)
                .eq("company_id", selectedCompany.id)
                .eq("type", "credit")
                .order("date", { ascending: false });
            if (error) throw error;
            return data;
        },
        enabled: !!selectedCompany?.id,
    });

    const filteredReceipts = receipts?.filter((r) => {
        const needle = normalizeSearch(searchTerm);
        if (!needle) return true;
        const formattedDate = r.date ? format(new Date(r.date), "dd/MM/yyyy") : "";
        const amountValue = Number(r.amount || 0);
        const formattedAmount = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(amountValue);
        const numberAmount = new Intl.NumberFormat("pt-BR").format(amountValue);
        const amountRaw = String(amountValue);
        const amountComma = amountRaw.replace(".", ",");
        return normalizeSearch(
            [
                formattedDate,
                r.description,
                r.bank_account?.name,
                amountValue,
                formattedAmount,
                numberAmount,
                amountRaw,
                amountComma,
            ]
                .filter(Boolean)
                .join(" "),
        ).includes(needle);
    });

    return (
        <AppLayout title="Recibos">
            <div className="space-y-6 animate-fade-in">
                <div className="flex justify-between items-center">
                    <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                        <FileText className="h-8 w-8 text-green-600" />
                        Recibos
                    </h2>
                </div>

                <Card>
                    <CardHeader className="flex flex-col md:flex-row items-center justify-between space-y-2 md:space-y-0">
                        <CardTitle>Histórico de Recibos Gerados</CardTitle>
                        <div className="relative w-full md:w-72">
                            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Pesquisar recibos..."
                                className="pl-8"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Data</TableHead>
                                    <TableHead>Descrição</TableHead>
                                    <TableHead>Conta Bancária</TableHead>
                                    <TableHead>Valor</TableHead>
                                    <TableHead className="text-right">Ações</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {isLoading ? (
                                    <TableRow><TableCell colSpan={5} className="text-center py-8">Carregando...</TableCell></TableRow>
                                ) : filteredReceipts?.length === 0 ? (
                                    <TableRow><TableCell colSpan={5} className="text-center py-8">Nenhum recibo encontrado.</TableCell></TableRow>
                                ) : (
                                    filteredReceipts?.map((r) => (
                                        <TableRow key={r.id}>
                                            <TableCell>{format(new Date(r.date), "dd/MM/yyyy")}</TableCell>
                                            <TableCell className="font-bold">{r.description}</TableCell>
                                            <TableCell>{r.bank_account?.name || "-"}</TableCell>
                                            <TableCell className="font-bold text-green-600">
                                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(r.amount))}
                                            </TableCell>
                                            <TableCell className="text-right flex justify-end gap-2">
                                                <Button variant="ghost" size="icon" title="Imprimir Recibo">
                                                    <Printer className="h-4 w-4" />
                                                </Button>
                                                <Button variant="ghost" size="icon" title="Enviar por E-mail">
                                                    <Mail className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
