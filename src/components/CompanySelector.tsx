import { Check, ChevronsUpDown, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useCompany } from "@/contexts/CompanyContext";
import { useState } from "react";
import { maskCNPJ } from "@/utils/masks";

export function CompanySelector() {
  const { companies, selectedCompany, setSelectedCompany, loading } = useCompany();
  const [open, setOpen] = useState(false);

  if (loading) {
    return (
      <Button variant="outline" className="w-[160px] md:w-[250px] justify-start" disabled>
        <Building2 className="mr-2 h-4 w-4" />
        Carregando...
      </Button>
    );
  }

  if (companies.length === 0) {
    return (
      <Button variant="outline" className="w-[160px] md:w-[250px] justify-start" disabled>
        <Building2 className="mr-2 h-4 w-4" />
        Nenhuma empresa
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[160px] md:w-[250px] justify-between bg-background border-border hover:border-primary text-[12px] font-medium h-8"
        >
          <div className="flex items-center gap-1.5 truncate">
            <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">
              {selectedCompany?.nome_fantasia || selectedCompany?.razao_social || "Selecione uma empresa"}
            </span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[160px] md:w-[250px] p-0">
        <Command>
          <CommandInput placeholder="Buscar empresa..." />
          <CommandList>
            <CommandEmpty>Nenhuma empresa encontrada.</CommandEmpty>
            <CommandGroup>
              {companies.map((company) => (
                <CommandItem
                  key={company.id}
                  value={[
                    company.razao_social,
                    company.nome_fantasia,
                    company.cnpj,
                    company.cnpj ? maskCNPJ(company.cnpj) : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onSelect={() => {
                    setSelectedCompany(company);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      selectedCompany?.id === company.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {company.nome_fantasia || company.razao_social}
                    </span>
                    {company.cnpj && (
                      <span className="text-xs text-muted-foreground">
                        {maskCNPJ(company.cnpj)}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
