import { type TextareaHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-28 w-full resize-y rounded-lg bg-elevated px-3.5 py-3 text-sm text-fg placeholder:text-subtle shadow-[0_0_0_1px_rgb(255_255_255/0.08)] outline-none transition-shadow focus-visible:shadow-[0_0_0_1px_rgb(124_58_237/0.7)]",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";
