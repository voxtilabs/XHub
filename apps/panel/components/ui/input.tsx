import * as React from "react";
import { cn } from "@/lib/utils";
const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type, ...props }, ref) => (
  <input type={type} ref={ref}
    className={cn("voxia-input flex h-[46px] w-full rounded-md border border-input bg-[var(--voxia-field)] px-4 text-[13px] text-foreground transition-colors placeholder:text-[var(--voxia-faint)] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50", className)}
    {...props} />));
Input.displayName = "Input";
export { Input };
