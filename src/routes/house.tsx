import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/site-header";
import { HouseRoster } from "@/components/house-roster";

export const Route = createFileRoute("/house")({ component: HousePage });

function HousePage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <HouseRoster />
      </main>
    </div>
  );
}
