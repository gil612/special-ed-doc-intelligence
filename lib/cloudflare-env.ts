export interface Env {
  DOCS_BUCKET: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GEMINI_API_KEY: string;
  DOCUMENTS_API_KEY: string;
  WEBHOOK_URL?: string;
  WEBHOOK_SECRET?: string;
}

// `getCloudflareContext`'s `env` is typed via the ambient `CloudflareEnv`
// interface (declared by @opennextjs/cloudflare). Augment it here, once,
// so every caller of getCloudflareContext() across the app gets `env`
// typed as `Env` without redeclaring this interface in every file.
declare global {
  interface CloudflareEnv extends Env {}
}
