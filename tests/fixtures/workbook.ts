import ExcelJS from "exceljs";

export async function workbookBuffer(sheets: readonly { name: string; rows: readonly unknown[][] }[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  for (const { name, rows } of sheets) {
    const sheet = workbook.addWorksheet(name);
    rows.forEach((row) => sheet.addRow([...row]));
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function workbookUpload(name: string, sheets: readonly { name: string; rows: readonly unknown[][] }[]) {
  return { name, mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: await workbookBuffer(sheets) };
}
