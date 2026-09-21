import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { validatePublicEnvironment } from "./environment";

export async function createClient() {
  const env = validatePublicEnvironment();
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // setAll is called from Server Components where cookies
            // cannot be set. This can be safely ignored when the
            // middleware refreshes the session and propagates the cookies.
          }
        },
      },
    },
  );
}
