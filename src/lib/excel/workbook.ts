import ExcelJS from "exceljs";

export const MAX_WORKSHEET_CELLS = 500_000;
export const MAX_WORKSHEET_COLUMNS = 16_382;
export const MAX_WORKBOOK_CELLS = 500_000;
export const MAX_WORKBOOK_SHEETS = 100;

export interface WorksheetRows {
  readonly raw: unknown[][];
  readonly formatted: string[][];
}

export interface WorkbookTraversalBudget {
  reserve(sheet: ExcelJS.Worksheet): void;
}

export function workbookTraversalBudget(workbook: ExcelJS.Workbook): WorkbookTraversalBudget {
  if (workbook.worksheets.length > MAX_WORKBOOK_SHEETS) {
    throw new Error("Workbook exceeds the 100-sheet import limit.");
  }
  let cells = 0;
  for (const sheet of workbook.worksheets) {
    const sheetCells = sheet.rowCount * sheet.columnCount;
    if (sheet.columnCount > MAX_WORKSHEET_COLUMNS || sheetCells > MAX_WORKSHEET_CELLS) {
      throw new Error("Worksheet exceeds the 500,000-cell import limit.");
    }
    cells += sheetCells;
    if (cells > MAX_WORKBOOK_CELLS) throw new Error("Workbook exceeds the 500,000-cell import limit.");
  }
  return {
    reserve(sheet) {
      const sheetCells = sheet.rowCount * sheet.columnCount;
      if (sheet.columnCount > MAX_WORKSHEET_COLUMNS || sheetCells > MAX_WORKSHEET_CELLS) {
        throw new Error("Worksheet exceeds the 500,000-cell import limit.");
      }
    },
  };
}

function rawValue(cell: ExcelJS.Cell): unknown {
  const value = cell.value;
  return value && typeof value === "object" && "formula" in value
    ? value.result ?? ""
    : value ?? "";
}

function formattedValue(cell: ExcelJS.Cell): string {
  const value = rawValue(cell);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "number") {
    if (/E\+?0+/i.test(cell.numFmt ?? "")) return value.toExponential(4);
    if (/^0+$/.test(cell.numFmt ?? "")) return String(value).padStart(cell.numFmt?.length ?? 0, "0");
    if (/^#,##0\.00$/.test(cell.numFmt ?? "")) {
      return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (/^#,##0$/.test(cell.numFmt ?? "")) return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  }
  return cell.text ?? "";
}

export async function loadWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(new Uint8Array(buffer).buffer);
  return workbook;
}

export function worksheetRows(sheet: ExcelJS.Worksheet, budget?: WorkbookTraversalBudget): WorksheetRows {
  // ExcelJS reports the declared used range without materializing every cell.
  // Validate it before iterating so a sparse far-away cell cannot cause a dense walk.
  if (sheet.columnCount > MAX_WORKSHEET_COLUMNS || sheet.rowCount * sheet.columnCount > MAX_WORKSHEET_CELLS) {
    throw new Error("Worksheet exceeds the 500,000-cell import limit.");
  }
  budget?.reserve(sheet);
  const raw: unknown[][] = [];
  const formatted: string[][] = [];
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const rawRow: unknown[] = [];
    const formattedRow: string[] = [];
    for (let column = 1; column <= sheet.columnCount; column++) {
      const cell = row.getCell(column);
      rawRow.push(rawValue(cell));
      formattedRow.push(formattedValue(cell));
    }
    raw.push(rawRow);
    formatted.push(formattedRow);
  }
  return { raw, formatted };
}
