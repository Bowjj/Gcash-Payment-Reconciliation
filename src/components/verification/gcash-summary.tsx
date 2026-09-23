import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface GcashSummaryProps {
  readonly filename: string;
  readonly totalRows: number;
  readonly validCount: number;
  readonly errorCount: number;
  readonly incomingCount: number;
  readonly outgoingCount: number;
  readonly unknownDirectionCount: number;
  readonly duplicateReferenceCount: number;
  readonly duplicateTransactionCount: number;
}

export function GcashSummary({
  filename,
  totalRows,
  validCount,
  errorCount,
  incomingCount,
  outgoingCount,
  unknownDirectionCount,
  duplicateReferenceCount,
  duplicateTransactionCount,
}: GcashSummaryProps) {
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
          <p className="text-xs text-muted-foreground">transactions ready</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attention</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-2xl font-semibold text-amber-600">{errorCount}</p>
          <p className="text-xs text-muted-foreground">rows need attention</p>
          {duplicateReferenceCount > 0 && (
            <p className="mt-1 text-xs text-amber-700">
              {duplicateReferenceCount} duplicate references across {duplicateTransactionCount} transactions
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Direction</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Incoming</span>
              <span className="font-mono">{incomingCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Outgoing</span>
              <span className="font-mono">{outgoingCount}</span>
            </div>
            {unknownDirectionCount > 0 && (
              <div className="flex justify-between text-amber-600">
                <span>Unknown</span>
                <span className="font-mono">{unknownDirectionCount}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
