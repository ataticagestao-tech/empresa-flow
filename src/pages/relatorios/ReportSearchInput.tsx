import { Check, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ReportSearchResult } from "./useReportSearch";

interface ReportSearchInputProps {
    searchTerm: string;
    onSearchChange: (next: string) => void;
    resultsOpen: boolean;
    setResultsOpen: (open: boolean) => void;
    isSearching: boolean;
    globalSearchResults: ReportSearchResult[];
    selectedSearchKey: string | null;
    onSelectResult: (item: ReportSearchResult) => void;
}

export function ReportSearchInput({
    searchTerm,
    onSearchChange,
    resultsOpen,
    setResultsOpen,
    isSearching,
    globalSearchResults,
    selectedSearchKey,
    onSelectResult,
}: ReportSearchInputProps) {
    return (
        <div className="flex flex-col gap-2">
            <div className="relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Buscar por Produto, CPF/CNPJ, Nome fantasia ou Número de conta"
                    className="pl-9"
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                    onFocus={() => setResultsOpen(true)}
                    onBlur={() => {
                        window.setTimeout(() => setResultsOpen(false), 120);
                    }}
                />
            </div>

            {resultsOpen && searchTerm.trim().length >= 2 && (
                <div className="rounded-md border bg-popover text-popover-foreground shadow-md">
                    <div className="max-h-[320px] overflow-auto">
                        {isSearching ? (
                            <div className="py-6 text-center text-sm text-muted-foreground">Buscando...</div>
                        ) : globalSearchResults.length === 0 ? (
                            <div className="py-6 text-center text-sm text-muted-foreground">Nenhum resultado encontrado.</div>
                        ) : (
                            <div className="p-1">
                                {globalSearchResults.map((item) => {
                                    const itemKey = item.kind === "term" ? `term:${item.label}` : `${item.kind}:${item.id}`;
                                    return (
                                        <button
                                            type="button"
                                            key={itemKey}
                                            className={cn(
                                                "w-full text-left flex items-start gap-2 rounded-sm px-2 py-2 text-sm hover:bg-accent hover:text-accent-foreground",
                                                selectedSearchKey === itemKey && "bg-accent text-accent-foreground",
                                            )}
                                            onMouseDown={(e) => {
                                                e.preventDefault();
                                                onSelectResult(item);
                                            }}
                                        >
                                            <Check
                                                className={cn(
                                                    "mt-0.5 h-4 w-4 shrink-0",
                                                    selectedSearchKey === itemKey ? "opacity-100" : "opacity-0",
                                                )}
                                            />
                                            <div className="flex flex-col min-w-0">
                                                <span className="font-medium truncate">{item.label}</span>
                                                <span className="text-xs text-muted-foreground truncate">
                                                    {item.kind === "client"
                                                        ? `Cliente${item.meta ? ` • ${item.meta}` : ""}`
                                                        : item.kind === "supplier"
                                                            ? `Fornecedor${item.meta ? ` • ${item.meta}` : ""}`
                                                            : item.kind === "product"
                                                                ? `Produto${item.meta ? ` • ${item.meta}` : ""}`
                                                                : String(item.meta || "Buscar em descrições (AR/AP)")}
                                                </span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
