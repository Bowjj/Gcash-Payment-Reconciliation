import { XMLValidator } from "fast-xml-parser";
import yauzl from "yauzl";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 10_000;
const MAX_ZIP_ENTRY_BYTES = 20 * 1024 * 1024;
const MAX_UNCOMPRESSED_ZIP_BYTES = 100 * 1024 * 1024;

const XLSX_TYPES = new Set([
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/octet-stream",
]);
const REQUIRED_OOXML_PARTS = new Set([
  "[Content_Types].xml",
  "_rels/.rels",
  "xl/workbook.xml",
  "xl/_rels/workbook.xml.rels",
]);
const OOXML_PART_MARKERS = new Map<string, RegExp>([
  ["[Content_Types].xml", /<(?:[A-Za-z_][\w.-]*:)?Types(?:\s|>)[\s\S]*spreadsheetml\.sheet\.main\+xml/],
  ["_rels/.rels", /<(?:[A-Za-z_][\w.-]*:)?Relationships(?:\s|>)[\s\S]*officeDocument/],
  ["xl/workbook.xml", /<(?:[A-Za-z_][\w.-]*:)?workbook(?:\s|>)/],
  ["xl/_rels/workbook.xml.rels", /<(?:[A-Za-z_][\w.-]*:)?Relationships(?:\s|>)/],
]);

export type SpreadsheetUploadGuardResult =
  | { success: true; bytes: Buffer }
  | { success: false; error: string };

function openZip(bytes: Buffer): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) reject(error ?? new Error("Unable to read ZIP archive."));
      else resolve(zip);
    });
  });
}

function openEntry(zip: yauzl.ZipFile, entry: yauzl.Entry) {
  return new Promise<NodeJS.ReadableStream>((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(error ?? new Error("Unable to inflate ZIP entry."));
      else resolve(stream);
    });
  });
}

async function validXlsxZip(bytes: Buffer) {
  const zip = await openZip(bytes);
  if (!zip.entryCount || zip.entryCount > MAX_ZIP_ENTRIES) return false;

  const names = new Set<string>();
  const ooxmlParts = new Map<string, Buffer>();
  let totalInflated = 0;

  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        zip.close();
        reject(error);
      };
      const next = () => {
        if (!settled) zip.readEntry();
      };

      zip.once("error", fail);
      zip.on("end", () => {
        if (!settled) {
          settled = true;
          resolve();
        }
      });
      zip.on("entry", (entry: yauzl.Entry) => {
        void (async () => {
          if (names.has(entry.fileName)) throw new Error("ZIP archive has duplicate entries.");
          names.add(entry.fileName);
          if (entry.uncompressedSize > MAX_ZIP_ENTRY_BYTES) throw new Error("ZIP entry exceeds import limit.");

          const chunks: Buffer[] = [];
          let entryInflated = 0;
          const stream = await openEntry(zip, entry);
          for await (const chunk of stream) {
            const data = Buffer.from(chunk);
            entryInflated += data.length;
            totalInflated += data.length;
            if (entryInflated > MAX_ZIP_ENTRY_BYTES || totalInflated > MAX_UNCOMPRESSED_ZIP_BYTES) {
              throw new Error("ZIP archive exceeds import limit.");
            }
            if (REQUIRED_OOXML_PARTS.has(entry.fileName)) chunks.push(data);
          }
          if (REQUIRED_OOXML_PARTS.has(entry.fileName)) ooxmlParts.set(entry.fileName, Buffer.concat(chunks));
          next();
        })().catch((error: unknown) => fail(error instanceof Error ? error : new Error("Unable to validate ZIP archive.")));
      });
      next();
    });
  } catch {
    return false;
  }

  if (![...REQUIRED_OOXML_PARTS].every((name) => names.has(name) && ooxmlParts.has(name))) return false;
  for (const [name, part] of ooxmlParts) {
    let xml: string;
    try {
      xml = new TextDecoder("utf-8", { fatal: true }).decode(part);
    } catch {
      return false;
    }
    if (!xml.trim() || XMLValidator.validate(xml) !== true || !OOXML_PART_MARKERS.get(name)?.test(xml)) return false;
  }
  return true;
}

export async function guardSpreadsheetUpload(file: File): Promise<SpreadsheetUploadGuardResult> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "xlsx") {
    return { success: false, error: "Upload an Excel .xlsx file." };
  }
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) {
    return { success: false, error: "Each file must be between 1 byte and 10 MB." };
  }
  if (file.type && !XLSX_TYPES.has(file.type.toLowerCase())) {
    return { success: false, error: "The uploaded file type does not match an Excel workbook." };
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.length !== file.size) return { success: false, error: "The uploaded file could not be read safely." };
    if (await validXlsxZip(bytes)) return { success: true, bytes };
  } catch {
    return { success: false, error: "The uploaded file could not be read safely." };
  }
  return { success: false, error: "The uploaded file is not a valid Excel workbook." };
}
