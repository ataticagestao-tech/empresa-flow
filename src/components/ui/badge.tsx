import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border-transparent px-2.5 py-0.5 text-[12px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-[#EFF6FF] text-[#1E3A8A]",
        secondary: "bg-[#F6F2EB] text-[#667085]",
        destructive: "bg-[#FEF3F2] text-[#D92D20]",
        outline: "text-foreground border border-border",
        success: "bg-[#DCFCE7] text-[#039855]",
        warning: "bg-[#FFFAEB] text-[#92400E]",
        info: "bg-[#EFF6FF] text-[#1E3A8A]",
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
