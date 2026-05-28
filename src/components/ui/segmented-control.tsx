import { cn } from "@/lib/utils"

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  title?: string
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  size?: "sm" | "md"
}

/**
 * Segmented control padrão do sistema: container cinza claro com pill branco
 * (sombra sutil) no item ativo. Substitui toggles de texto/abas binárias.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
  size = "md",
}: SegmentedControlProps<T>) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-[#E5E3DA] bg-[#F1EFE8] p-[3px]",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            title={opt.title}
            onClick={() => onChange(opt.value)}
            className={cn(
              "cursor-pointer whitespace-nowrap rounded-md transition-all duration-150",
              size === "sm" ? "px-3 py-1 text-[12px]" : "px-3.5 py-1.5 text-[13px]",
              active
                ? "bg-white font-semibold text-[#059669] shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
                : "bg-transparent font-medium text-[#667085] hover:text-[#1D2939]",
            )}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
