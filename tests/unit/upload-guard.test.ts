import { expect, test } from "vitest";
import { workbookBuffer } from "../fixtures/workbook";
import { guardSpreadsheetUpload } from "@/lib/excel/upload-guard";

function file(bytes: Buffer, name: string, type = "") {
  return new File([new Uint8Array(bytes)], name, { type });
}

function zip(entries: readonly { name: string; localOffset?: number }[]) {
  const locals: Buffer[] = []; let offset = 0;
  const central: Buffer[] = [];
  for (const entry of entries) {
    const name = Buffer.from(entry.name); const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(name.length, 26); name.copy(local, 30);
    locals.push(local);
    const directory = Buffer.alloc(46 + name.length);
    directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt16LE(name.length, 28); directory.writeUInt32LE(entry.localOffset ?? offset, 42); name.copy(directory, 46);
    central.push(directory); offset += local.length;
  }
  const directory = Buffer.concat(central); const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

test("accepts a valid XLSX workbook before it reaches a parser", async () => {
  const bytes = await workbookBuffer([{ name: "Payments", rows: [["Customer"]] }]);
  await expect(guardSpreadsheetUpload(file(bytes, "payments.xlsx"))).resolves.toMatchObject({ success: true });
});

test("rejects a workbook whose required OOXML entry cannot be inflated", async () => {
  const bytes = Buffer.from(await workbookBuffer([{ name: "Payments", rows: [["Customer"]] }]));
  const localHeader = bytes.lastIndexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), bytes.indexOf("xl/workbook.xml"));
  const dataStart = localHeader + 30 + bytes.readUInt16LE(localHeader + 26) + bytes.readUInt16LE(localHeader + 28);
  const byte = bytes[dataStart];
  if (byte === undefined) throw new Error("Expected workbook entry data");
  bytes[dataStart] = byte ^ 0xff;
  await expect(guardSpreadsheetUpload(file(bytes, "payments.xlsx"))).resolves.toMatchObject({ success: false });
});

test("rejects non-XLSX extensions, MIME types, and signatures", async () => {
  await expect(guardSpreadsheetUpload(file(Buffer.from("not a workbook"), "payments.xls"))).resolves.toMatchObject({ success: false });
  await expect(guardSpreadsheetUpload(file(Buffer.from("not a workbook"), "payments.xlsx", "text/plain"))).resolves.toMatchObject({ success: false, error: expect.stringContaining("type") });
  await expect(guardSpreadsheetUpload(file(Buffer.from("not a workbook"), "payments.xlsx"))).resolves.toMatchObject({ success: false });
});

test("rejects arbitrary ZIPs, unsafe entry names, and invalid local entry offsets", async () => {
  await expect(guardSpreadsheetUpload(file(zip([{ name: "notes.txt" }]), "payments.xlsx"))).resolves.toMatchObject({ success: false });
  await expect(guardSpreadsheetUpload(file(zip([{ name: "[Content_Types].xml" }, { name: "xl/workbook.xml" }, { name: "../evil" }]), "payments.xlsx"))).resolves.toMatchObject({ success: false });
  await expect(guardSpreadsheetUpload(file(zip([{ name: "[Content_Types].xml", localOffset: 1 }, { name: "xl/workbook.xml" }]), "payments.xlsx"))).resolves.toMatchObject({ success: false });
});
