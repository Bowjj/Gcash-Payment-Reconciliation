import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <Card className="max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-lg">Page not found</CardTitle>
        </CardHeader>
        <CardContent className="text-center text-sm text-muted-foreground">
          The page you are looking for does not exist.
        </CardContent>
      </Card>
    </div>
  );
}
