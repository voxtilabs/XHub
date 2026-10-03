import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const badgeVariants = cva("inline-flex items-center gap-2 rounded-pill border px-3 py-1 text-[11px] font-medium leading-5",
  { variants: { rol: {
      exito: "border-[var(--voxia-good-border)] bg-[var(--voxia-good-soft)] text-[hsl(var(--exito))]",
      senal: "border-[var(--xhub-signal-border)] bg-[var(--xhub-signal-soft)] text-[hsl(var(--senal))]",
      accion: "border-[var(--voxia-action-border)] bg-[var(--voxia-action-soft)] text-[var(--voxia-action-text)]",
      aviso: "border-[var(--voxia-warn-border)] bg-[var(--voxia-warn-soft)] text-[hsl(var(--aviso))]",
      critico: "border-[var(--voxia-bad-border)] bg-[var(--voxia-bad-soft)] text-[hsl(var(--critico))]",
      neutro: "border-border bg-background text-muted-foreground",
    } }, defaultVariants: { rol: "neutro" } });
export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}
function Badge({ className, rol, ...props }: BadgeProps) { return <div data-tone={rol ?? "neutro"} className={cn("xhub-badge", badgeVariants({ rol }), className)} {...props} />; }
export { Badge, badgeVariants };
