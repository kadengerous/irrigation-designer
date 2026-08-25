import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap font-medium transition-[background-color,color,box-shadow,opacity,border-color,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-btn/50 disabled:pointer-events-none disabled:opacity-40 active:not-disabled:scale-[0.97] [&_svg]:size-3.5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        solid: "bg-btn text-btn-fg border border-btn hover:bg-btn/90",
        ghost: "bg-transparent text-ink-soft hover:bg-btn-soft",
        outline: "bg-transparent text-btn border border-btn-ring hover:bg-btn-soft",
        pressed: "bg-btn text-btn-fg border border-btn",
        bar: "bg-transparent text-tool-fg border border-white/35 hover:bg-white/15",
        "bar-on": "bg-tool-on text-tool-fg border border-white/50 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18)]",
        pale: "bg-transparent text-ink border border-transparent hover:bg-white/60",
        "pale-on": "bg-white text-btn border border-btn/25 shadow-border",
        catalog: "bg-transparent text-catalog border border-catalog/45 hover:bg-catalog-soft",
        "catalog-on": "bg-catalog text-catalog-fg border border-catalog",
      },
      size: {
        xs: "h-8 rounded-sm px-2 text-xs",
        sm: "h-9 rounded-sm px-2.5 text-xs",
        md: "h-10 rounded-md px-3 text-sm",
        icon: "size-8 rounded-sm",
      },
    },
    defaultVariants: { variant: "outline", size: "xs" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
