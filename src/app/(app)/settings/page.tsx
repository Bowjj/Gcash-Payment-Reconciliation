import { Card, CardContent } from "@/components/ui/card";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account and workspace settings.
        </p>
      </div>

      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          This feature is not yet available. It will be implemented in a future
          sprint.
        </CardContent>
      </Card>
    </div>
  );
}
