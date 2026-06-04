import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * SearchableSelect — substituto direto (drop-in) do <select> nativo, porém com busca.
 *
 * Mesma API do <select>: filhos <option>, prop `value` e `onChange` recebendo
 * um objeto { target: { value } }. Basta trocar a tag:
 *   <select value={x} onChange={e => set(e.target.value)} className={IC}>
 *     <option value="a">A</option>
 *   </select>
 *   →
 *   <SearchableSelect value={x} onChange={e => set(e.target.value)} className={IC}>
 *     <option value="a">A</option>
 *   </SearchableSelect>
 *
 * O campo de busca aparece sozinho quando há mais de `searchThreshold` opções.
 */

type Opt = { value: string; label: string; disabled?: boolean };

const normalize = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function getText(node: React.ReactNode): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getText).join(" ");
  if (React.isValidElement(node)) return getText((node.props as any)?.children);
  return "";
}

function collectOptions(children: React.ReactNode, acc: Opt[] = []): Opt[] {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === "option") {
      const p = child.props as any;
      const label = getText(p.children);
      acc.push({
        value: p.value !== undefined ? String(p.value) : label,
        label,
        disabled: !!p.disabled,
      });
    } else if (child.type === React.Fragment || child.type === "optgroup") {
      collectOptions((child.props as any).children, acc);
    }
  });
  return acc;
}

export interface SearchableSelectProps {
  value?: string | number | null;
  onChange?: (e: any) => void;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  disabled?: boolean;
  placeholder?: string;
  id?: string;
  name?: string;
  searchThreshold?: number;
  searchPlaceholder?: string;
}

export const SearchableSelect = React.forwardRef<HTMLButtonElement, SearchableSelectProps>(
  ({ value, onChange, children, className, style, disabled, placeholder, id, name, searchThreshold = 7, searchPlaceholder = "Buscar...", ...rest }, ref) => {
    const options = React.useMemo(() => collectOptions(children), [children]);
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const inputRef = React.useRef<HTMLInputElement>(null);

    const cur = value == null ? "" : String(value);
    const selected = options.find((o) => o.value === cur);
    const showSearch = options.length > searchThreshold;

    const q = normalize(query.trim());
    const filtered = q ? options.filter((o) => normalize(o.label).includes(q)) : options;

    React.useEffect(() => {
      if (!open) { setQuery(""); return; }
      if (showSearch) {
        const t = setTimeout(() => inputRef.current?.focus(), 0);
        return () => clearTimeout(t);
      }
    }, [open, showSearch]);

    return (
      <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
        <PopoverTrigger asChild>
          <button
            type="button"
            ref={ref}
            id={id}
            data-name={name}
            disabled={disabled}
            role="combobox"
            aria-expanded={open}
            style={style}
            className={cn(
              "flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50",
              className,
            )}
            {...rest}
          >
            <span className={cn("truncate", !selected && "text-[#98A2B3]")}>
              {selected ? selected.label : (placeholder ?? "Selecione...")}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[180px] p-0">
          {showSearch && (
            <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-popover px-2 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 opacity-50" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-transparent text-sm outline-none placeholder:text-[#98A2B3]"
              />
            </div>
          )}
          <div className="max-h-[260px] overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="py-4 text-center text-sm text-[#98A2B3]">Nenhum resultado</div>
            ) : (
              filtered.map((o, i) => (
                <button
                  key={`${o.value}-${i}`}
                  type="button"
                  disabled={o.disabled}
                  onClick={() => {
                    if (o.disabled) return;
                    onChange?.({ target: { value: o.value } });
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50",
                    o.value === cur && "bg-accent/60 font-medium",
                  )}
                >
                  <Check className={cn("h-3.5 w-3.5 shrink-0", o.value === cur ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{o.label}</span>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  },
);
SearchableSelect.displayName = "SearchableSelect";
