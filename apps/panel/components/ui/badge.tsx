import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const badgeVariants = cva("inline-flex items-center rounded-pill border px-2.5 py-0.5 text-xs font-semibold",
  { variants: { rol: {
      exito: "border-transparent text-[hsl(var(--exito))]",
      senal: "border-transparent text-[hsl(var(--senal))]",
      accion: "border-transparent text-primary",
      neutro: "border-border text-muted-foreground",
    } }, defaultVariants: { rol: "neutro" } });
export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}
function Badge({ className, rol, ...props }: BadgeProps) { return <div className={cn(badgeVariants({ rol }), className)} {...props} />; }
export { Badge, badgeVariants };
