import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ImportSummaryProps {
  readonly filename: string;
  readonly totalRows: number;
  readonly validCount: number;
  readonly errorCount: number;
  readonly gcashCount: number;
  readonly cashCount: number;
  readonly bankCount: number;
  readonly unknownMethodCount: number;
  readonly missingHeaders: readonly string[];
}

export function ImportSummary({
  filename,
  totalRows,
  validCount,
  errorCount,
  gcashCount,
  cashCount,
  bankCount,
  unknownMethodCount,
  missingHeaders,
}: ImportSummaryProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader>
          <CardTitle>File</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="truncate font-mono text-sm">{filename}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {totalRows} rows detected
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Valid</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold text-green-600">{validCount}</p>
          <p className="text-xs text-muted-foreground">rows ready to import</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attention</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold text-amber-600">{errorCount}</p>
          <p className="text-xs text-muted-foreground">rows need attention</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Methods</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>GCash</span>
              <span className="font-mono">{gcashCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Cash</span>
              <span className="font-mono">{cashCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Bank</span>
              <span className="font-mono">{bankCount}</span>
            </div>
            {unknownMethodCount > 0 && (
              <div className="flex justify-between text-amber-600">
                <span>Unknown</span>
                <span className="font-mono">{unknownMethodCount}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {missingHeaders.length > 0 && (
        <Card className="col-span-full border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <p className="mb-1 text-sm font-medium text-amber-800">
              Missing expected headers
            </p>
            <p className="text-xs text-amber-700">
              {missingHeaders.join(", ")}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
