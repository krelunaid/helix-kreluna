import { cn } from "@/lib/utils";

/** Helix sphere — photo cutout, no background, scales as a mark. */
export function HelixMark({ className }: { className?: string; glow?: boolean }) {
  return (
    <img
      src="/helix-orb.png"
      alt="Helix"
      className={cn("object-contain bg-transparent", className)}
      width={256}
      height={256}
      decoding="async"
    />
  );
}

export function KrelunaMark({ className }: { className?: string }) {
  return <HelixMark className={className} />;
}
