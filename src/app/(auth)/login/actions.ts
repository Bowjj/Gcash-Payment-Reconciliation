"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(1, "Password is required"),
  next: z.string().default("/dashboard"),
});

export type LoginInput = z.infer<typeof loginSchema>;

export async function login(
  _prevState: { error: string } | null,
  formData: FormData,
) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next"),
  });

  if (!parsed.success) {
    return { error: "Please check your email and password." };
  }

  const { email, password, next } = parsed.data;

  // Sanitize redirect path — only allow relative paths on the same host
  const redirectTo = next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/dashboard";

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: "Invalid email or password." };
  }

  redirect(redirectTo);
}
