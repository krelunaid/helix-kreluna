import { createFileRoute, Navigate } from "@tanstack/react-router";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

export const Route = createFileRoute("/dashboard")({ component: Dashboard });

function Dashboard() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return (
      <div
        className="grid min-h-screen place-items-center bg-bg text-sm text-muted"
        aria-busy="true"
      >
        Helix
      </div>
    );
  }
  if (!user) return <RedirectToSignIn />;
  return <Navigate to="/" replace />;
}
