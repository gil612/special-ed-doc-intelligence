import { getCloudflareContext } from "@opennextjs/cloudflare";
import "@/lib/cloudflare-env";
import { createSupabaseClient, listDocumentsWithExtractions } from "@/lib/supabase";
import { DocumentTable } from "@/components/dashboard/document-table";
import { UploadForm } from "@/components/dashboard/upload-form";

// This page reads live Cloudflare bindings (getCloudflareContext) and
// fetches per-request data from Supabase, so it must never be statically
// prerendered. Without this, `next build` fails with: "getCloudflareContext
// has been called in sync mode in either a static route or at the top
// level of a non-static one" — Next.js otherwise tries to prerender `/` at
// build time, before any request context exists. See
// https://github.com/opennextjs/opennextjs-cloudflare/issues/652.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { env } = getCloudflareContext();
  const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const documents = await listDocumentsWithExtractions(supabase);

  return (
    <main className="mx-auto max-w-5xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">מסמכי תח&quot;י שהועלו</h1>
      <UploadForm />
      <DocumentTable documents={documents} />
    </main>
  );
}
