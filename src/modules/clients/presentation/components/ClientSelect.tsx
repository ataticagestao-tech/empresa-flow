
import * as React from "react";
import { Check, ChevronsUpDown, Loader2, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList, // Adicionado CommandList que faltou no raciocínio inicial, mas é padrão shadcn atual
} from "@/components/ui/command";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";

import { useClientSearch } from "../hooks/useClientSearch";
import { ClientSheet } from "./ClientSheet";

interface ClientSelectProps {
    value?: string;
    onChange: (value: string) => void;
    placeholder?: string;
    error?: boolean;
}

export function ClientSelect({ value, onChange, placeholder = "Selecione um cliente...", error }: ClientSelectProps) {
    const [open, setOpen] = React.useState(false);
    const [showSheet, setShowSheet] = React.useState(false);
    const { clients, isLoading, setSearchTerm, refresh } = useClientSearch();

    // Encontrar o label do valor selecionado (opcional, pode vir do hook se quisermos persistência do label)
    const [selectedLabel, setSelectedLabel] = React.useState("");

    React.useEffect(() => {
        if (value && clients.length > 0) {
            const found = clients.find(c => c.id === value);
            if (found) setSelectedLabel(found.razao_social);
        }
    }, [value, clients]);

    return (
        <>
            <Popover open={open} onOpenChange={setOpen}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        className={cn(
                            "w-full justify-between h-9 text-xs font-normal",
                            !value && "text-muted-foreground",
                            error && "border-red-500 bg-red-50"
                        )}
                    >
                        {selectedLabel || (value ? "Carregando..." : placeholder)}
                        <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="start">
                    <Command shouldFilter={false}> {/* Filtragem é feita no backend via hook */}
                        <CommandInput
                            placeholder="Buscar cliente..."
                            onValueChange={setSearchTerm}
                            className="h-9"
                        />
                        <CommandList>
                            {isLoading && (
                                <div className="py-6 text-center text-sm text-muted-foreground flex justify-center items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" /> Buscando...
                                </div>
                            )}
                            {!isLoading && clients.length === 0 && (
                                <CommandEmpty>Nenhum cliente encontrado.</CommandEmpty>
                            )}
                            <CommandGroup>
                                {clients.map((client) => (
                                    <CommandItem
                                        key={client.id}
                                        value={client.id}
                                        onSelect={(currentValue) => {
                                            onChange(currentValue === value ? "" : currentValue);
                                            setSelectedLabel(client.razao_social);
                                            setOpen(false);
                                        }}
                                    >
                                        <Check
                                            className={cn(
                                                "mr-2 h-4 w-4",
                                                value === client.id ? "opacity-100" : "opacity-0"
                                            )}
                                        />
                                        <div className="flex flex-col">
                                            <span className="font-medium truncate">{client.razao_social}</span>
                                            <span className="text-[10px] text-muted-foreground">{client.cnpj}</span>
                                        </div>
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    </Command>
                    <div className="p-2 border-t bg-white">
                        <Button
                            variant="ghost"
                            className="w-full text-xs h-7 justify-start text-blue-600"
                            onClick={() => {
                                setOpen(false);
                                setShowSheet(true);
                            }}
                        >
                            <User className="mr-2 h-3 w-3" /> + Novo Cliente
                        </Button>
                    </div>
                </PopoverContent>
            </Popover>

            <ClientSheet
                isOpen={showSheet}
                onClose={() => {
                    setShowSheet(false);
                    refresh?.();
                }}
            />
        </>
    );
}
