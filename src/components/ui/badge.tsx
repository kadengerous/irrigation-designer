import { cn } from "@/lib/utils";

export function Badge({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-sm bg-bg-2 px-2 py-0.5 text-xs font-medium text-ink-soft",
        className,
      )}
      {...props}
    />
  );
}
