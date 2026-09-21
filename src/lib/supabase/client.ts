import { createBrowserClient } from "@supabase/ssr";

import { validatePublicEnvironment } from "./environment";

let client: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (client) return client;

  const env = validatePublicEnvironment();

  client = createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );

  return client;
}
