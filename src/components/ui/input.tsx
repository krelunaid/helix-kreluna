import { type InputHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-11 w-full rounded-lg bg-elevated px-3.5 text-sm text-fg placeholder:text-subtle shadow-[0_0_0_1px_rgb(255_255_255/0.08)] outline-none transition-shadow focus-visible:shadow-[0_0_0_1px_rgb(124_58_237/0.7)]",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
