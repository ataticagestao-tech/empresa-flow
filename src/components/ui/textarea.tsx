import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-[10px] border border-[#EAECF0] bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-[#98A2B3] focus-visible:outline-none focus-visible:border-[#059669] focus-visible:ring-2 focus-visible:ring-[#059669]/10 disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-150",
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export { Textarea };
