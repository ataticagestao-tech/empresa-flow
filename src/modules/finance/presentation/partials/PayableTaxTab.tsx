
import { UseFormReturn } from "react-hook-form";
import { AccountsPayable } from "../../domain/schemas/accounts-payable.schema";
import { FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

interface PayableTaxTabProps {
    form: UseFormReturn<AccountsPayable>;
}

const TAXES = [
    { id: 'pis', label: 'PIS' },
    { id: 'cofins', label: 'COFINS' },
    { id: 'csll', label: 'CSLL' },
    { id: 'ir', label: 'IR' },
    { id: 'iss', label: 'ISS' },
    { id: 'inss', label: 'INSS' },
] as const;

export function PayableTaxTab({ form }: PayableTaxTabProps) {
    return (
        <div className="space-y-4 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                {TAXES.map((tax) => (
                    <div key={tax.id} className="flex items-end gap-2 p-2 border rounded bg-[#F8FAFC]">
                        <FormField
                            control={form.control}
                            name={`${tax.id}_amount` as any}
                            render={({ field }) => (
                                <FormItem className="flex-1">
                                    <FormLabel className="uppercase">{tax.label} (R$)</FormLabel>
                                    <FormControl>
                                        <Input
                                            // type="number" step="0.01" // Se quiser numerico nativo
                                            // Ou manter string e parsear no submit? Schema pede number.
                                            // Vou usar number nativo
                                            type="number" step="0.01"
                                            {...field}
                                            onChange={e => {
                                                const val = parseFloat(e.target.value);
                                                field.onChange(isNaN(val) ? 0 : val);
                                            }}
                                            value={field.value || 0}
                                        />
                                    </FormControl>
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name={`${tax.id}_retain` as any}
                            render={({ field }) => (
                                <FormItem className="flex items-center gap-2 pb-2">
                                    <FormControl>
                                        <Checkbox
                                            checked={field.value}
                                            onCheckedChange={field.onChange}
                                        />
                                    </FormControl>
                                    <FormLabel className="font-normal cursor-pointer">Reter</FormLabel>
                                </FormItem>
                            )}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
}
