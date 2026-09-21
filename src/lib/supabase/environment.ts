import { z } from "zod";

const environmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required"),
});

export function validatePublicEnvironment() {
  const result = environmentSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env["NEXT_PUBLIC_SUPABASE_URL"],
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
  });

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => i.message)
      .join("; ");
    throw new Error(`Invalid public environment: ${issues}`);
  }

  return result.data;
}

export type PublicEnvironment = z.infer<typeof environmentSchema>;
