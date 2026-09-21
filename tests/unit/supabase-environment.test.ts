import { describe, expect, test } from "vitest";

// Test environment validation without real credentials
describe("supabase environment validation", () => {
  test("throws when NEXT_PUBLIC_SUPABASE_URL is missing", async () => {
    const original = process.env["NEXT_PUBLIC_SUPABASE_URL"];
    delete process.env["NEXT_PUBLIC_SUPABASE_URL"];
    try {
      const { validatePublicEnvironment } = await import(
        "@/lib/supabase/environment"
      );
      expect(() => validatePublicEnvironment()).toThrow("Invalid public environment");
    } finally {
      if (original !== undefined) {
        process.env["NEXT_PUBLIC_SUPABASE_URL"] = original;
      }
    }
  });

  test("throws when NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing", async () => {
    const origUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
    const origKey = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://test.supabase.co";
    delete process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
    try {
      const { validatePublicEnvironment } = await import(
        "@/lib/supabase/environment"
      );
      expect(() => validatePublicEnvironment()).toThrow(
        "Invalid public environment",
      );
    } finally {
      if (origUrl !== undefined) process.env["NEXT_PUBLIC_SUPABASE_URL"] = origUrl;
      if (origKey !== undefined) process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = origKey;
    }
  });

  test("throws when URL is invalid", async () => {
    const origUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
    const origKey = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = "not-a-url";
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = "test-key";
    try {
      const { validatePublicEnvironment } = await import(
        "@/lib/supabase/environment"
      );
      expect(() => validatePublicEnvironment()).toThrow("valid URL");
    } finally {
      if (origUrl !== undefined) process.env["NEXT_PUBLIC_SUPABASE_URL"] = origUrl;
      if (origKey !== undefined) process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = origKey;
    }
  });

  test("returns validated environment with valid inputs", async () => {
    const origUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
    const origKey = process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];
    process.env["NEXT_PUBLIC_SUPABASE_URL"] = "https://xyz.supabase.co";
    process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = "sb-publishable-key";
    try {
      const { validatePublicEnvironment } = await import(
        "@/lib/supabase/environment"
      );
      const env = validatePublicEnvironment();
      expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://xyz.supabase.co");
      expect(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).toBe("sb-publishable-key");
    } finally {
      if (origUrl !== undefined) process.env["NEXT_PUBLIC_SUPABASE_URL"] = origUrl;
      if (origKey !== undefined) process.env["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"] = origKey;
    }
  });
});
