import { useLimit } from "@/hooks/useEntitlements";
import type { LimitKey } from "@/config/entitlements";

/**
 * Badge "X de Y" do consumo de um limite do pacote. Some quando ilimitado
 * (super-admin / empresa sem plano). Fica vermelho ao atingir o limite.
 */
export function LimitBadge({ limitKey, used }: { limitKey: LimitKey; used: number }) {
  const { limit, atLimit, isUnlimited } = useLimit(limitKey, used);
  if (isUnlimited) return null;

  return (
    <span
      className={`text-[11px] font-bold px-2 py-1 rounded border ${
        atLimit
          ? "border-[#E53E3E] bg-[#FEE2E2] text-[#B42318]"
          : "border-[#D0D5DD] bg-[#F9FAFB] text-[#475467]"
      }`}
      title={atLimit ? "Limite do plano atingido" : "Uso do plano"}
    >
      {used} de {limit}
    </span>
  );
}
