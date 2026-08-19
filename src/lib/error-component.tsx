import type { ErrorComponentProps } from "@tanstack/react-router";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-bg px-6 text-center text-fg">
      <p className="text-[11px] tracking-[0.22em] text-subtle uppercase">Kreluna</p>
      <h1 className="font-display text-4xl italic">Something snagged</h1>
      <p className="max-w-md text-sm break-words text-muted">
        {error.message || "Reload and Helix will pick it up."}
      </p>
    </main>
  );
}
