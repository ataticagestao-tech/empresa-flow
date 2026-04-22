import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border-transparent px-2.5 py-0.5 text-[12px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-[#ECFDF4] text-[#059669]",
        secondary: "bg-[#F6F2EB] text-[#667085]",
        destructive: "bg-[#FEE2E2] text-[#E53E3E]",
        outline: "text-foreground border border-border",
        success: "bg-[#DCFCE7] text-[#039855]",
        warning: "bg-[#FFF0EB] text-[#92400E]",
        info: "bg-[#ECFDF4] text-[#059669]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
