import type { Config } from "@netlify/functions";
import { deleteExpiredGuestPublications } from "../../src/lib/server/persistence/guest-publications";

const BATCH_SIZE = 250;
const MAX_BATCHES_PER_RUN = 8;

export default async function helixGuestPublicationCleanup(): Promise<void> {
  let deletedApps = 0;
  let deletedDeploys = 0;
  let batches = 0;
  let hasMore = false;

  do {
    const result = await deleteExpiredGuestPublications(BATCH_SIZE);
    deletedApps += result.deletedApps;
    deletedDeploys += result.deletedDeploys;
    hasMore = result.hasMore;
    batches += 1;
  } while (hasMore && batches < MAX_BATCHES_PER_RUN);

  console.info(
    JSON.stringify({
      level: hasMore ? "warn" : "info",
      event: "helix_guest_publication_cleanup",
      batches,
      deletedApps,
      deletedDeploys,
      reachedRunLimit: hasMore,
    }),
  );
}

export const config: Config = {
  schedule: "*/15 * * * *",
};
