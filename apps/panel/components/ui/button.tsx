import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[16px] font-heading text-sm font-semibold leading-[1.4] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:translate-y-px disabled:translate-y-0",
  { variants: {
      variant: {
        default: "voxia-button-primary border border-primary bg-primary text-primary-foreground",
        secondary: "voxia-button-surface border border-input text-secondary-foreground",
        ghost: "border border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        outline: "voxia-button-surface border border-input text-foreground",
      },
      size: { default: "h-[46px] px-6", sm: "h-9 px-4 text-xs", lg: "h-[50px] px-6", icon: "h-[46px] w-[46px] p-0" },
    }, defaultVariants: { variant: "default", size: "default" } });
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean; }
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";
export { Button, buttonVariants };
