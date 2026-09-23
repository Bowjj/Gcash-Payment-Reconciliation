export type GcashDirection = "incoming" | "outgoing" | "unknown";

export type GcashParsedRow = {
  readonly rowIndex: number;
  readonly sheetName: string;
  readonly transactionDate: string;
  readonly description: string;
  readonly referenceNumber: string;
  readonly amountCentavos: number;
  readonly direction: GcashDirection;
  readonly raw: Record<string, unknown>;
};

export type GcashParseIssue = {
  readonly rowIndex: number;
  readonly sheetName: string;
  readonly field: string;
  readonly message: string;
};

export type GcashParseResult = {
  readonly rows: readonly GcashParsedRow[];
  readonly errors: readonly GcashParseIssue[];
  readonly warnings: readonly GcashParseIssue[];
  readonly totalRows: number;
  readonly validCount: number;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly sheetsProcessed: readonly string[];
};
