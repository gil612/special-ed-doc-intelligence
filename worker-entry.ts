// Cloudflare Cron Triggers invoke a Worker's `scheduled` export directly -
// they don't just call a URL - so a scheduled handler can't live inside the
// Next.js app itself. This file wraps the OpenNext-generated worker (a
// build artifact that only exists after `opennextjs-cloudflare build` has
// run, hence the ts-expect-error below - same pattern OpenNext's own
// generated worker uses for its own build-artifact imports) with an
// additional `scheduled` export, and wrangler.toml points `main` here
// instead of directly at `.open-next/worker.js`.
// @ts-expect-error: only exists after `opennextjs-cloudflare build` has run
import openNextWorker from "./.open-next/worker.js";
import { createSupabaseClient, findStaleProcessingDocumentIds, updateDocumentStatus } from "./lib/supabase";
import { sweepStaleProcessingDocuments, STALE_PROCESSING_THRESHOLD_MINUTES } from "./lib/sweep-stale-processing";
import "./lib/cloudflare-env";

export default {
  fetch: openNextWorker.fetch,

  async scheduled(_event: ScheduledController, env: CloudflareEnv, _ctx: ExecutionContext): Promise<void> {
    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    const { sweptCount } = await sweepStaleProcessingDocuments({
      findStaleProcessingDocumentIds: () =>
        findStaleProcessingDocumentIds(supabase, STALE_PROCESSING_THRESHOLD_MINUTES),
      updateDocumentStatus: (documentId, status, errorMessage) =>
        updateDocumentStatus(supabase, documentId, status, errorMessage),
    });

    if (sweptCount > 0) {
      console.log(`Stale-processing sweep: marked ${sweptCount} document(s) as failed`);
    }
  },
};
