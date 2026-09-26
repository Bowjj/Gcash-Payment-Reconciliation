import type ExcelJS from "exceljs";
import { annotationColumns, annotationKind, CONFLICT_HEADER, CONFLICT_MARKER, CUSTOMER_HEADER } from "@/lib/gcash/annotations";
import { safeText, textCell } from "./cells";

function header(cell: ExcelJS.Cell, label: string) {
  textCell(cell, label);
  cell.font = { bold: true, color: { argb: "FF243746" } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8EEF3" } };
  cell.alignment = { wrapText: true, vertical: "middle" };
}

function sourceRows(sheet: ExcelJS.Worksheet) {
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: true }, (row, number) => {
    const values: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, column) => { values[column - 1] = cell.text; });
    rows[number - 1] = values;
  });
  return rows;
}

export function existingCustomerHeaderRow(sheet: ExcelJS.Worksheet) {
  const found = annotationColumns(sourceRows(sheet)).customerHeaders[0];
  return found ? found.row + 1 : null;
}

/** Consolidate only annotation cells. Redundant column slots remain blank so
 * financial/source columns never shift. Conflicting names are retained in an
 * explicit note; no historical name is arbitrarily selected as the winner. */
export function annotateGcashSheet(sheet: ExcelJS.Worksheet, headerRow: number, sourceWidth: number, matches: ReadonlyMap<number, string>) {
  const rows = sourceRows(sheet);
  const found = annotationColumns(rows);
  const customerColumns = found.customer.map((c) => c + 1);
  const conflictColumns = found.conflict.map((c) => c + 1);
  const customerColumn = customerColumns[0] ?? Math.max(sheet.columnCount, sourceWidth) + 1;
  const notes = new Map<number, string>();
  const updates = new Map<number, string>();
  const lastRow = sheet.rowCount;
  for (let row = 1; row <= lastRow; row++) {
    const headerLike = !/^\d{4}-\d{2}-\d{2}/.test(sheet.getCell(row, 1).text.trim());
    const values = customerColumns.map((column) => sheet.getCell(row, column).text)
      .filter((value) => value.trim() && !(headerLike && annotationKind(value) === "customer"));
    const oldNotes = conflictColumns.map((column) => sheet.getCell(row, column).text)
      .filter((value) => value.trim() && !(headerLike && annotationKind(value) === "conflict"));
    const messages = new Set(oldNotes.flatMap((note) => note.split("\n")));
    const unresolved = values.includes(CONFLICT_MARKER);
    const names = [...new Set(values.filter((value) => value !== CONFLICT_MARKER))];
    const current = matches.get(row);
    let chosen = names[0] ?? "";
    if (names.length > 1 || unresolved) {
      chosen = CONFLICT_MARKER;
      if (names.length > 1) messages.add(`Historical customer annotations disagree: ${JSON.stringify(names)}. Review required.`);
      else if (!messages.size) messages.add("Unresolved historical annotation. Review required.");
      if (current) messages.add(`Current exact-reference customer: ${JSON.stringify(current)}.`);
    } else if (chosen && current && chosen !== current && chosen !== safeText(current)) {
      messages.add(`Existing customer: ${JSON.stringify(chosen)}; current exact-reference customer: ${JSON.stringify(current)}. Review required.`);
    } else if (!chosen && current && !messages.size) chosen = current;
    else if (!chosen && current && messages.size) messages.add(`Current exact-reference customer: ${JSON.stringify(current)}.`);
    if (messages.size) notes.set(row, [...messages].join("\n"));
    if (chosen) updates.set(row, chosen);
  }
  // Merged annotation cells cannot safely hold independent per-row decisions.
  // Refuse rather than unmerge or overwrite original source data.
  const conflictColumn = notes.size ? conflictColumns[0] ?? Math.max(sheet.columnCount, sourceWidth, customerColumn) + 1 : conflictColumns[0];
  const touched = new Set([...customerColumns, ...conflictColumns, customerColumn, ...(conflictColumn ? [conflictColumn] : [])]);
  for (let row = 1; row <= Math.max(lastRow, headerRow); row++) for (const column of touched) {
    if (sheet.getCell(row, column).isMerged) throw new Error("Merged annotation cells require review before export.");
  }
  if (updates.has(headerRow) || notes.has(headerRow)) throw new Error("Annotation header overlaps historical customer data.");
  for (let row = 1; row <= lastRow; row++) {
    for (const column of customerColumns) if (column !== customerColumn) sheet.getCell(row, column).value = null;
    for (const column of conflictColumns) if (column !== conflictColumn) sheet.getCell(row, column).value = null;
    const cell = sheet.getCell(row, customerColumn);
    const next = updates.get(row) ?? "";
    // Leave existing names and their source formatting intact when unchanged.
    if (cell.text !== next) textCell(cell, next);
    if (conflictColumn) {
      const note = notes.get(row) ?? "";
      if (sheet.getCell(row, conflictColumn).text !== note) textCell(sheet.getCell(row, conflictColumn), note);
      sheet.getCell(row, conflictColumn).alignment = { wrapText: true, vertical: "top" };
    }
  }
  header(sheet.getCell(headerRow, customerColumn), CUSTOMER_HEADER);
  if (!customerColumns.length) sheet.getColumn(customerColumn).width = 25;
  if (conflictColumn) {
    header(sheet.getCell(headerRow, conflictColumn), CONFLICT_HEADER);
    sheet.getColumn(conflictColumn).width = 60;
  }
  return notes.size;
}

export function countAnnotationConflicts(book: ExcelJS.Workbook) {
  let count = 0;
  for (const sheet of book.worksheets) {
    const columns = annotationColumns(sourceRows(sheet)).conflict.map((column) => column + 1);
    sheet.eachRow((row) => {
      if ([...columns].some((col) => { const text = row.getCell(col).text; return !!text.trim() && annotationKind(text) !== "conflict"; })) count++;
    });
  }
  return count;
}
