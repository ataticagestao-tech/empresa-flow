import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp, Search } from "lucide-react";

import { cn } from "@/lib/utils";

/** Normaliza texto pra busca: minúsculo + sem acento. */
const normalizeSearch = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Extrai o texto puro de uma árvore de nós React (pra filtrar itens pela label). */
function getNodeText(node: React.ReactNode): string {
  if (node == null || node === false || node === true) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(getNodeText).join(" ");
  if (React.isValidElement(node)) return getNodeText((node.props as any)?.children);
  return "";
}

const Select = SelectPrimitive.Root;

const SelectGroup = SelectPrimitive.Group;

const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-10 w-full items-center justify-between rounded-[10px] border border-[#EAECF0] bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-[#98A2B3] focus:outline-none focus:border-[#059669] focus:ring-2 focus:ring-[#059669]/10 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1 transition-all duration-150",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollUpButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronUp className="h-4 w-4" />
  </SelectPrimitive.ScrollUpButton>
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownButton>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.ScrollDownButton
    ref={ref}
    className={cn("flex cursor-default items-center justify-center py-1", className)}
    {...props}
  >
    <ChevronDown className="h-4 w-4" />
  </SelectPrimitive.ScrollDownButton>
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

/** Conta quantos <SelectItem> existem (recursivo, atravessa grupos). */
function countSelectItems(nodes: React.ReactNode): number {
  let n = 0;
  React.Children.forEach(nodes, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type === SelectItem) n++;
    else if ((child.props as any)?.children) n += countSelectItems((child.props as any).children);
  });
  return n;
}

/** Filtra os filhos do SelectContent pela busca, preservando grupos/labels. */
function filterSelectChildren(nodes: React.ReactNode, q: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  React.Children.forEach(nodes, (child) => {
    if (!React.isValidElement(child)) return;
    const type = child.type;
    if (type === SelectItem) {
      if (normalizeSearch(getNodeText((child.props as any).children)).includes(q)) out.push(child);
    } else if (type === SelectGroup) {
      let label: React.ReactNode = null;
      const inner: React.ReactNode[] = [];
      React.Children.forEach((child.props as any).children, (c) => {
        if (React.isValidElement(c) && c.type === SelectLabel) label = c;
        else inner.push(...filterSelectChildren(c, q));
      });
      if (inner.length) out.push(React.cloneElement(child, {}, label ? [label, ...inner] : inner));
    } else if (type === SelectLabel || type === SelectSeparator) {
      // ocultos enquanto há busca ativa
    } else {
      // wrapper desconhecido: mantém se o texto casar com a busca
      if (normalizeSearch(getNodeText(child)).includes(q)) out.push(child);
    }
  });
  return out;
}

type SelectContentExtraProps = {
  /** Liga/desliga o campo de busca. Por padrão liga sozinho em listas longas. */
  searchable?: boolean;
  /** A partir de quantos itens a busca aparece sozinha (padrão 7). */
  searchThreshold?: number;
  searchPlaceholder?: string;
};

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & SelectContentExtraProps
>(({ className, children, position = "popper", searchable, searchThreshold = 7, searchPlaceholder = "Buscar...", ...props }, ref) => {
  const [query, setQuery] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const itemCount = React.useMemo(() => countSelectItems(children), [children]);
  const showSearch = searchable ?? itemCount > searchThreshold;

  const q = normalizeSearch(query.trim());
  const content = showSearch && q ? filterSelectChildren(children, q) : children;
  const isEmpty = showSearch && q && (content as React.ReactNode[]).length === 0;

  // Foca o campo de busca ao abrir (o Content remonta a cada abertura, então o estado zera sozinho).
  React.useEffect(() => {
    if (!showSearch) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [showSearch]);

  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        className={cn(
          "relative z-50 max-h-[60vh] min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
          position === "popper" &&
            "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
          className,
        )}
        position={position}
        {...props}
      >
        {showSearch && (
          <div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-popover px-2 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 opacity-50" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                // deixa as setas/enter/esc navegarem a lista; o resto (digitação) não dispara o typeahead do Radix
                if (!["ArrowDown", "ArrowUp", "Enter", "Escape", "Home", "End", "Tab"].includes(e.key)) {
                  e.stopPropagation();
                }
              }}
              placeholder={searchPlaceholder}
              className="w-full bg-transparent text-sm outline-none placeholder:text-[#98A2B3]"
            />
          </div>
        )}
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          className={cn(
            "p-1",
            position === "popper" &&
              "w-full min-w-[var(--radix-select-trigger-width)]",
          )}
        >
          {isEmpty ? (
            <div className="py-4 text-center text-sm text-[#98A2B3]">Nenhum resultado</div>
          ) : (
            content
          )}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
});
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label ref={ref} className={cn("py-1.5 pl-8 pr-2 text-sm font-semibold", className)} {...props} />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 focus:bg-accent focus:text-accent-foreground",
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>

    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
