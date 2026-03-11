
import { UseFormReturn } from "react-hook-form";
import { AccountsPayable } from "../../domain/schemas/accounts-payable.schema";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea"; // Assumindo existência
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Loader2, Paperclip } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface PayableDetailsTabProps {
    form: UseFormReturn<AccountsPayable>;
    handleFileUpload: (file: File) => Promise<void>;
    isUploading: boolean;
}

export function PayableDetailsTab({ form, handleFileUpload, isUploading }: PayableDetailsTabProps) {
    const fileUrl = form.watch("file_url");

    return (
        <div className="space-y-4 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                    control={form.control}
                    name="invoice_number"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Nota Fiscal</FormLabel>
                            <FormControl><Input {...field} value={field.value || ''} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="barcode"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Código de Barras</FormLabel>
                            <FormControl><Input {...field} value={field.value || ''} /></FormControl>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                    control={form.control}
                    name="issue_date"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Data de Emissão</FormLabel>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                            {field.value ? format(field.value, "dd/MM/yyyy") : <span>Selecione</span>}
                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar mode="single" selected={field.value} onSelect={field.onChange} />
                                </PopoverContent>
                            </Popover>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="register_date"
                    render={({ field }) => (
                        <FormItem className="flex flex-col">
                            <FormLabel>Data de Registro</FormLabel>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <FormControl>
                                        <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                                            {field.value ? format(field.value, "dd/MM/yyyy") : <span>Selecione</span>}
                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                    </FormControl>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar mode="single" selected={field.value} onSelect={field.onChange} />
                                </PopoverContent>
                            </Popover>
                            <FormMessage />
                        </FormItem>
                    )}
                />
            </div>

            <FormField
                control={form.control}
                name="observations"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Observações</FormLabel>
                        <FormControl><Textarea {...field} value={field.value || ''} /></FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />

            <FormField
                control={form.control}
                name="recurrence"
                render={({ field }) => (
                    <FormItem>
                        <FormLabel>Repetição</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value="none">Não repetir</SelectItem>
                                <SelectItem value="monthly">Mensal</SelectItem>
                                <SelectItem value="weekly">Semanal</SelectItem>
                                <SelectItem value="yearly">Anual</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                    </FormItem>
                )}
            />

            <div className="flex items-center gap-2 mt-4 p-4 border border-dashed rounded-lg bg-[#F8FAFC]">
                <Input
                    type="file"
                    className="hidden"
                    id="file-upload-payable"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFileUpload(file);
                    }}
                    disabled={isUploading}
                />
                <Button type="button" variant="secondary" onClick={() => document.getElementById("file-upload-payable")?.click()} disabled={isUploading}>
                    {isUploading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Paperclip className="w-4 h-4 mr-2" />}
                    {fileUrl ? "Trocar Arquivo" : "Anexar Arquivo"}
                </Button>
                {fileUrl && (
                    <div className="flex flex-col ml-2">
                        <span className="text-xs text-green-600 font-medium">Anexado OK</span>
                        <a href={fileUrl || '#'} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline">
                            Visualizar Anexo
                        </a>
                    </div>
                )}
            </div>
        </div>
    );
}
