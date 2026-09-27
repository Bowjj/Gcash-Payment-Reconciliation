import { expect, test } from "vitest";
import nextConfig from "../../next.config";

test("applies production-compatible security headers to all routes", async () => {
  const rules = await nextConfig.headers?.();
  const headers = new Map(rules?.[0]?.headers.map(({ key, value }) => [key, value]));
  expect(rules?.[0]?.source).toBe("/:path*");
  expect(headers.get("Content-Security-Policy")).toContain("default-src 'self'");
  expect(headers.get("Content-Security-Policy")).toContain("frame-ancestors 'none'");
  expect(headers.get("Content-Security-Policy")).toContain("object-src 'none'");
  expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(headers.get("X-Frame-Options")).toBe("DENY");
  expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  expect(headers.get("Permissions-Policy")).toContain("camera=()");
  expect(headers.has("Strict-Transport-Security")).toBe(process.env.NODE_ENV === "production");
});
