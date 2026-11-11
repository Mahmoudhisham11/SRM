import type { Case, Vendor } from "../types";
import { headersFor, textRows, type ExportOptions } from "./exportRows";

function cell(v: string): string {
  // Quote everything that could break the row; neutralize spreadsheet formula injection.
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return /[",\r\n]/.test(safe) || safe !== v ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** UTF-8 with BOM so Excel opens Arabic text correctly; CRLF line endings. */
export function buildCsv(cases: Case[], vendors: Map<string, Vendor>, opts: ExportOptions): string {
  const lines = [headersFor(opts), ...textRows(cases, vendors, opts)].map((r) => r.map(cell).join(","));
  return "﻿" + lines.join("\r\n") + "\r\n";
}
