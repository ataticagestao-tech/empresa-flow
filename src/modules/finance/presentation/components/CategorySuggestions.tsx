import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CategorySuggestion {
    account: { id: string; code: string; name: string };
    score: number;
    reason: string;
}

interface CategorySuggestionsProps {
    suggestions: CategorySuggestion[];
    onSelect: (categoryId: string) => void;
    currentValue?: string;
}

export function CategorySuggestions({ suggestions, onSelect, currentValue }: CategorySuggestionsProps) {
    if (!suggestions.length) return null;

    return (
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
            <span className="flex items-center gap-1 text-[10px] font-medium text-amber-600 uppercase tracking-wide">
                <Sparkles className="h-3 w-3" />
                IA sugere:
            </span>
            {suggestions.map((s) => (
                <Badge
                    key={s.account.id}
                    variant="outline"
                    className={`cursor-pointer text-[11px] font-medium transition-all hover:scale-105 ${
                        currentValue === s.account.id
                            ? "bg-primary text-white border-primary"
                            : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100 hover:border-amber-300"
                    }`}
                    onClick={() => onSelect(s.account.id)}
                    title={`Motivo: ${s.reason} (score: ${s.score})`}
                >
                    {s.account.code} {s.account.name}
                </Badge>
            ))}
        </div>
    );
}
