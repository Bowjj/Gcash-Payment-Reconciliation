import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCentavos } from "@/lib/money";

interface GcashPreviewRow {
  readonly rowIndex: number;
  readonly transactionDate: string | null;
  readonly description: string;
  readonly referenceNumber: string;
  readonly amountCentavos: number;
  readonly direction: string;
  readonly referenceOccurrenceCount: number;
}

interface GcashPreviewTableProps {
  readonly rows: readonly GcashPreviewRow[];
  readonly totalCount: number;
}

export function GcashPreviewTable({ rows, totalCount }: GcashPreviewTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Preview ({rows.length} of {totalCount} transactions)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                <th className="pb-2 pr-4">#</th>
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2 pr-4">Description</th>
                <th className="pb-2 pr-4">Reference</th>
                <th className="pb-2 pr-4 text-right">Amount</th>
                <th className="pb-2">Direction</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.rowIndex} className="border-b last:border-0">
                  <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                    {row.rowIndex}
                  </td>
                  <td className="py-2 pr-4 text-xs">
                    {row.transactionDate || (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 max-w-[200px] truncate">
                    {row.description || (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    {row.referenceNumber || (
                      <span className="text-muted-foreground">-</span>
                    )}
                    {row.referenceOccurrenceCount > 1 && (
                      <span className="ml-2 rounded bg-amber-100 px-1 text-amber-800">
                        duplicate ×{row.referenceOccurrenceCount}
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-right font-mono">
                    {formatCentavos(row.amountCentavos)}
                  </td>
                  <td className="py-2">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.direction === "incoming"
                          ? "bg-green-100 text-green-800"
                          : row.direction === "outgoing"
                            ? "bg-red-100 text-red-800"
                            : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {row.direction}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
