import { cn } from "@/lib/utils";

export function HelixOrb({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative mx-auto grid w-full min-w-0 place-items-center",
        className,
      )}
      aria-hidden
    >
      <img
        src="/helix-orb.png"
        alt=""
        className="mx-auto block h-auto w-[min(72vw,22rem)] max-w-full object-contain lg:w-[min(100%,28rem)]"
      />
    </div>
  );
}

export function WorkOrb({ className, live = true }: { className?: string; live?: boolean }) {
  return (
    <div className={cn("relative grid place-items-center bg-transparent", className)} aria-hidden>
      {live ? (
        <span className="absolute inset-[12%] rounded-full bg-accent/20 motion-safe:animate-ping" />
      ) : null}
      <img src="/helix-orb.png" alt="" className="relative z-[1] size-full object-contain" />
    </div>
  );
}
