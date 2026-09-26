import type { Metadata } from "next";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeControl } from "@/components/theme/theme-control";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Login - Payment Reconciliation",
};

export default function LoginPage() {
  return (
    <main className="relative grid min-h-svh place-items-center bg-background px-4 pb-12 pt-24">
      <div className="absolute right-4 top-4 sm:right-6 sm:top-6"><ThemeControl /></div>
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-xl font-semibold tracking-tight">
            Payment Reconciliation
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Sign in to your workspace
          </p>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
