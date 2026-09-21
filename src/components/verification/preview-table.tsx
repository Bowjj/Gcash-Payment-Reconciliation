import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface PreviewRow {
  readonly rowIndex: number;
  readonly customer: string;
  readonly amount: number;
  readonly method: string;
  readonly referenceNumber: string;
  readonly paymentDate: string | null;
  readonly photoUrl: string | null;
}

interface PreviewTableProps {
  readonly rows: readonly PreviewRow[];
  readonly totalCount: number;
}

export function PreviewTable({ rows, totalCount }: PreviewTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Preview ({rows.length} of {totalCount} rows)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                <th className="pb-2 pr-4">#</th>
                <th className="pb-2 pr-4">Customer</th>
                <th className="pb-2 pr-4 text-right">Amount</th>
                <th className="pb-2 pr-4">Method</th>
                <th className="pb-2 pr-4">Reference</th>
                <th className="pb-2 pr-4">Date</th>
                <th className="pb-2">Photo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.rowIndex}
                  className="border-b last:border-0"
                >
                  <td className="py-2 pr-4 font-mono text-xs text-muted-foreground">
                    {row.rowIndex}
                  </td>
                  <td className="py-2 pr-4">{row.customer}</td>
                  <td className="py-2 pr-4 text-right font-mono">
                    {row.amount.toLocaleString()}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        row.method === "GCASH"
                          ? "bg-blue-100 text-blue-800"
                          : row.method === "CASH"
                            ? "bg-green-100 text-green-800"
                            : row.method === "BANK"
                              ? "bg-purple-100 text-purple-800"
                              : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {row.method}
                    </span>
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs">
                    {row.referenceNumber || (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-xs">
                    {row.paymentDate || (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                  <td className="py-2">
                    {row.photoUrl ? (
                      <a
                        href={row.photoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary underline-offset-4 hover:underline"
                      >
                        View Proof
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">-</span>
                    )}
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
