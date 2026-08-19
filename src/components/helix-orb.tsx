import { cn } from "@/lib/utils";

export function HelixOrb() {
  return (
    <div className="relative mx-auto w-full max-w-lg lg:max-w-xl" aria-hidden>
      <div className="relative mx-auto aspect-square w-full">
        <img
          src="/helix-orb.png"
          alt=""
          className="size-full object-contain"
        />
      </div>
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
