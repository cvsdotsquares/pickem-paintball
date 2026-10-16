import fs from "fs";
import path from "path";

/** Minimal RFC 4180 CSV — quoted fields may hold commas, quotes and newlines (captions do). */

export type CsvTable = { cols: string[]; rows: Record<string, string>[] };

export function parseCsv(text: string): CsvTable {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || record.length) {
    record.push(field);
    records.push(record);
  }
  const [cols = [], ...data] = records.filter((r) => r.length > 1 || r[0] !== "");
  const rows = data.map((r) => Object.fromEntries(cols.map((c, j) => [c, r[j] ?? ""])));
  return { cols, rows };
}

const quote = (v: string) => (/[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function serializeCsv({ cols, rows }: CsvTable): string {
  const lines = [cols.map(quote).join(",")];
  for (const r of rows) lines.push(cols.map((c) => quote(r[c] ?? "")).join(","));
  return lines.join("\r\n") + "\r\n";
}

export function readCsv(file: string): CsvTable {
  if (!fs.existsSync(file)) return { cols: [], rows: [] };
  return parseCsv(fs.readFileSync(file, "utf8"));
}

/** Every save first copies the current file into a _backups/ folder beside it. */
export function writeCsvWithBackup(file: string, table: CsvTable): void {
  const dir = path.join(path.dirname(file), "_backups");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  if (fs.existsSync(file)) fs.copyFileSync(file, path.join(dir, `${path.basename(file, ".csv")}_${stamp}.csv`));
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, serializeCsv(table), "utf8");
  fs.renameSync(tmp, file);
}
