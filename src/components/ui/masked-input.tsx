import * as React from "react";
import { Input } from "@/components/ui/input";
import { maskCPF, maskCNPJ, maskPhone, maskCEP } from "@/utils/masks";
import { cn } from "@/lib/utils";

type MaskType = "cpf" | "cnpj" | "cpf_cnpj" | "phone" | "cep";

const maskFns: Record<string, (v: string) => string> = {
  cpf: maskCPF,
  cnpj: maskCNPJ,
  phone: maskPhone,
  cep: maskCEP,
};

interface MaskedInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  mask: MaskType;
  value: string;
  onValueChange: (raw: string, masked: string) => void;
}

const MaskedInput = React.forwardRef<HTMLInputElement, MaskedInputProps>(
  ({ mask, value, onValueChange, className, ...props }, ref) => {
    const applyMask = React.useCallback(
      (v: string) => {
        if (mask === "cpf_cnpj") {
          const digits = v.replace(/\D/g, "");
          return digits.length <= 11 ? maskCPF(v) : maskCNPJ(v);
        }
        return maskFns[mask](v);
      },
      [mask],
    );

    const handleChange = React.useCallback(
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const masked = applyMask(e.target.value);
        const raw = masked.replace(/\D/g, "");
        onValueChange(raw, masked);
      },
      [applyMask, onValueChange],
    );

    return (
      <Input
        ref={ref}
        value={value}
        onChange={handleChange}
        className={cn(className)}
        {...props}
      />
    );
  },
);
MaskedInput.displayName = "MaskedInput";

export { MaskedInput };
export type { MaskType };
