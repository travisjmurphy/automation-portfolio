export const ACTOR_URL = "https://apify.com/loudtzu/canada-building-permits";
export const SCHEMA_URL = `${ACTOR_URL}/output-schema`;
export const MAX_ROWS = 50_000;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export const CITIES = [
  ["Halifax", "NS"], ["Calgary", "AB"], ["Edmonton", "AB"],
  ["Red Deer", "AB"], ["Lethbridge", "AB"], ["Strathcona County", "AB"],
  ["Winnipeg", "MB"], ["Toronto", "ON"], ["Mississauga", "ON"],
  ["Oakville", "ON"], ["Burlington", "ON"], ["Kitchener", "ON"],
  ["Waterloo", "ON"], ["Kingston", "ON"], ["Vancouver", "BC"],
  ["Victoria", "BC"], ["Surrey", "BC"], ["Delta", "BC"], ["Maple Ridge", "BC"],
] as const;

export type RawRow = Record<string, unknown>;
export type Permit = {
  id: string; row: number; city: string; province: string; number: string | null;
  type: string | null; work: string | null; status: string | null;
  date: string | null; dateKind: "Issue date" | "Completion date" | "Permit date";
  value: number | null; address: string | null; description: string | null;
  contractor: string | null; source: string | null; sourceUrl: string | null;
  licence: string | null; retrievedAt: string | null; raw: RawRow;
};
export type Diagnostic = { row?: number; message: string; kind: "warning" | "skipped" };
export type Dataset = {
  name: string; records: Permit[]; totalRows: number; skipped: number;
  diagnostics: Diagnostic[]; importedAt: string; retrievedAt: string | null;
  completeness: string; synthetic: boolean; format: "JSON" | "CSV";
  metadata: RawRow;
};
export type Filters = {
  query: string; city: string; province: string; type: string; status: string;
  dateFrom: string; dateTo: string; minValue: string; maxValue: string;
  valueAvailability: string;
};
export const EMPTY_FILTERS: Filters = {
  query: "", city: "", province: "", type: "", status: "", dateFrom: "",
  dateTo: "", minValue: "", maxValue: "", valueAvailability: "",
};

function text(value: unknown): string | null {
  if (value === null || value === undefined || typeof value === "object") return null;
  const result = String(value).trim();
  return result && !["null", "undefined", "n/a", "nan"].includes(result.toLowerCase()) ? result : null;
}

export function safeUrl(value: unknown): string | null {
  const input = text(value);
  if (!input) return null;
  try { const url = new URL(input); return ["https:", "http:"].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}

export function isoDate(value: unknown): string | null {
  const input = text(value);
  if (!input || !/^\d{4}-\d{2}-\d{2}(?:$|T|\s)/.test(input)) return null;
  const day = input.slice(0, 10);
  const date = new Date(`${day}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === day ? day : null;
}

export function reportedValue(value: unknown): number | null {
  if (value === null || value === undefined || typeof value === "boolean") return null;
  const input = typeof value === "number" ? value : Number(String(value).replace(/CAD|\$|,/gi, "").trim());
  // The Actor treats zero estimated project values as not recorded, not $0 projects.
  return Number.isFinite(input) && input > 0 ? Math.round(input * 100) / 100 : null;
}

/** RFC 4180-style CSV: quoted commas, escaped quotes, multiline fields and CRLF. */
export function parseCsv(input: string): RawRow[] {
  const source = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false, closedQuote = false;
  const endField = () => { row.push(field); field = ""; closedQuote = false; };
  const endRow = () => { endField(); if (row.some((cell) => cell.trim() !== "")) rows.push(row); row = []; };
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { quoted = false; closedQuote = true; }
      else field += ch;
    } else if (ch === '"') {
      if (field !== "" || closedQuote) throw new Error("CSV has an unexpected quote. Wrap the entire field in double quotes.");
      quoted = true;
    } else if (ch === ",") endField();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      endRow();
    } else if (closedQuote) {
      if (!/\s/.test(ch)) throw new Error("CSV contains text after a closing quote.");
    } else field += ch;
  }
  if (quoted) throw new Error("CSV has an unclosed quoted field.");
  if (field !== "" || row.length || closedQuote) endRow();
  if (rows.length < 2) throw new Error("CSV needs a header row and at least one data row.");
  const headers = rows[0].map((header) => header.trim());
  if (headers.some((header) => !header)) throw new Error("Every CSV column needs a header.");
  if (new Set(headers).size !== headers.length) throw new Error("CSV column names must be unique.");
  return rows.slice(1).map((cells, index) => {
    if (cells.length !== headers.length) throw new Error(`CSV row ${index + 2} has ${cells.length} fields; the header has ${headers.length}.`);
    return Object.fromEntries(headers.map((header, column) => [header, cells[column] === "" ? null : cells[column]]));
  });
}

function canonicalCity(value: unknown): string {
  const name = text(value);
  if (!name) return "City not supplied";
  const key = name.toLowerCase().replace(/[-_]/g, " ").replace(/\s+/g, " ");
  return CITIES.find(([city]) => city.toLowerCase() === key)?.[0] ?? name;
}

export function parseDataset(input: string, filename = "Imported permits", now = new Date().toISOString()): Dataset {
  if (new TextEncoder().encode(input).length > MAX_FILE_BYTES) throw new Error("Choose a file smaller than 20 MB.");
  const clean = input.replace(/^\uFEFF/, "").trim();
  if (!clean) throw new Error("This file is empty. Choose a JSON array or a CSV export.");
  let rows: unknown[], metadata: RawRow = {};
  const format = /^[\[{]/.test(clean) ? "JSON" : "CSV";
  if (format === "JSON") {
    let parsed: unknown;
    try { parsed = JSON.parse(clean); } catch { throw new Error("This JSON is not valid. Export the Apify dataset as JSON, or check for a missing comma or bracket."); }
    if (Array.isArray(parsed)) rows = parsed;
    else if (parsed && typeof parsed === "object") {
      const envelope = parsed as RawRow;
      const candidate = envelope.records ?? envelope.items ?? envelope.data;
      if (!Array.isArray(candidate)) throw new Error("JSON must be an array of permit records, or an object with a records, items or data array.");
      rows = candidate;
      if (envelope.metadata && typeof envelope.metadata === "object" && !Array.isArray(envelope.metadata)) metadata = envelope.metadata as RawRow;
    } else throw new Error("JSON must contain permit records.");
  } else rows = parseCsv(clean);
  if (!rows.length) throw new Error("The export contains no records.");
  if (rows.length > MAX_ROWS) throw new Error("This workspace supports up to 50,000 rows per file. Split the export into smaller files.");
  const retrievedAt = text(metadata.retrievedAt ?? metadata.retrieved_at);
  const diagnostics: Diagnostic[] = [];
  const records: Permit[] = [];
  rows.forEach((candidate, index) => {
    const rowNumber = index + 1;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      diagnostics.push({ row: rowNumber, kind: "skipped", message: "Not an object; no permit fields to read." }); return;
    }
    const raw = candidate as RawRow;
    const signal = text(raw.signal_type);
    if (signal && signal !== "permit") {
      diagnostics.push({ row: rowNumber, kind: "skipped", message: `“${signal}” is not a building permit. This version excludes other signal types.` }); return;
    }
    if (!["permitNumber", "permitType", "issuedDate", "permitDate", "completedDate", "workType"].some((key) => key in raw)) {
      diagnostics.push({ row: rowNumber, kind: "skipped", message: "No supported building-permit fields. Expected the Canada Building Permits export schema." }); return;
    }
    const city = canonicalCity(raw.city);
    const province = text(raw.provinceCode) ?? text(raw.province) ?? "Not supplied";
    let dateKind: Permit["dateKind"] = "Issue date";
    let dateInput = raw.issuedDate;
    if (city === "Delta") { dateKind = "Completion date"; dateInput = raw.completedDate ?? raw.issuedDate ?? raw.permitDate; }
    else if (city === "Red Deer") { dateKind = "Permit date"; dateInput = raw.permitDate ?? raw.issuedDate; }
    else if (!text(raw.issuedDate) && text(raw.permitDate)) { dateKind = "Permit date"; dateInput = raw.permitDate; }
    const date = isoDate(dateInput);
    if (text(dateInput) && !date) diagnostics.push({ row: rowNumber, kind: "warning", message: `Invalid date “${text(dateInput)}”; kept as an undated record.` });
    if (!CITIES.some(([name]) => name === city)) diagnostics.push({ row: rowNumber, kind: "warning", message: `${city} is outside the published 19-municipality coverage list; retained as supplied.` });
    const source = text(raw.source);
    const sourceUrl = safeUrl(raw.permitUrl) ?? safeUrl(raw.source_url) ?? safeUrl(source);
    if (!source || !text(raw.licence)) diagnostics.push({ row: rowNumber, kind: "warning", message: "Source or licence attribution is missing from this row." });
    const value = reportedValue(raw.estimatedValueCad);
    if (text(raw.estimatedValueCad) && !value && !["0", "0.0", "0.00"].includes(String(raw.estimatedValueCad))) diagnostics.push({ row: rowNumber, kind: "warning", message: "Estimated value could not be read as a positive CAD amount; excluded from value totals." });
    records.push({
      id: `row-${rowNumber}`, row: rowNumber, city, province,
      number: text(raw.permitNumber), type: text(raw.permitType ?? raw.permitClass ?? raw.buildingType),
      work: text(raw.workType ?? raw.workCategory), status: text(raw.status), date, dateKind, value,
      address: text(raw.project_address), description: text(raw.work_description),
      contractor: text(raw.contractor_company), source, sourceUrl, licence: text(raw.licence),
      retrievedAt: text(raw.retrievedAt ?? raw.retrieved_at ?? raw.explorer_retrieved_at), raw,
    });
  });
  if (!records.length) throw new Error(diagnostics.some((item) => item.message.includes("signal types"))
    ? "This file contains no supported building-permit rows. Export the building_permits source; licences, planning, tenders and awards are not supported here."
    : "No compatible permit rows found. Use a Canada Building Permits JSON or CSV export with fields such as permitNumber, permitType and issuedDate.");
  return {
    name: text(metadata.name) ?? filename, records, totalRows: rows.length,
    skipped: rows.length - records.length, diagnostics, importedAt: now, retrievedAt,
    completeness: text(metadata.description) ?? text(metadata.completeness) ?? "Unknown. An export may be capped, filtered or partial; check the Actor run and its ERRORS / SOURCE_DIAGNOSTICS records.",
    synthetic: metadata.synthetic === true || records.every((record) => record.raw.synthetic === true || record.raw.synthetic === "true"), format, metadata,
  };
}

export function filterPermits(records: Permit[], filters: Filters): Permit[] {
  const query = filters.query.trim().toLocaleLowerCase();
  return records.filter((record) => {
    if (filters.city && record.city !== filters.city) return false;
    if (filters.province && record.province !== filters.province) return false;
    if (filters.type && (record.type ?? "Not supplied") !== filters.type) return false;
    if (filters.status && (record.status ?? "Not supplied") !== filters.status) return false;
    if (filters.dateFrom && (!record.date || record.date < filters.dateFrom)) return false;
    if (filters.dateTo && (!record.date || record.date > filters.dateTo)) return false;
    if (filters.minValue && (record.value === null || record.value < Number(filters.minValue))) return false;
    if (filters.maxValue && (record.value === null || record.value > Number(filters.maxValue))) return false;
    if (filters.valueAvailability === "reported" && record.value === null) return false;
    if (filters.valueAvailability === "missing" && record.value !== null) return false;
    if (query && ![record.city, record.province, record.number, record.type, record.work, record.address, record.description, record.contractor, record.status].filter(Boolean).join(" ").toLocaleLowerCase().includes(query)) return false;
    return true;
  });
}

export function sortPermits(records: Permit[], sort: string): Permit[] {
  return [...records].sort((a, b) => {
    if (sort === "value-desc") return (b.value ?? -Infinity) - (a.value ?? -Infinity) || a.row - b.row;
    if (sort === "city") return a.city.localeCompare(b.city) || (b.date ?? "").localeCompare(a.date ?? "");
    if (sort === "date-asc") return (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.row - b.row;
    return (b.date ?? "").localeCompare(a.date ?? "") || a.row - b.row;
  });
}

export function summarize(records: Permit[]) {
  const valued = records.filter((record) => record.value !== null);
  return {
    count: records.length, cities: new Set(records.map((record) => record.city).filter((city) => city !== "City not supplied")).size,
    value: valued.reduce((sum, record) => sum + Math.round((record.value ?? 0) * 100), 0) / 100,
    valued: valued.length, missing: records.length - valued.length,
    latest: records.reduce<string | null>((latest, record) => record.date && (!latest || record.date > latest) ? record.date : latest, null),
  };
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let result = typeof value === "object" ? JSON.stringify(value) : String(value);
  // Prevent spreadsheet formula execution on exported text without changing numeric values.
  if (typeof value !== "number" && /^[\s]*[=+\-@\t\r]/.test(result)) result = `'${result}`;
  return /[",\r\n]/.test(result) ? `"${result.replace(/"/g, '""')}"` : result;
}

export function exportCsv(records: Permit[], retrievedAt: string | null = null): string {
  const keys = [...new Set(records.flatMap((record) => Object.keys(record.raw)))];
  const extra = ["explorer_effective_date", "explorer_date_basis", "explorer_retrieved_at"];
  const headers = [...keys.filter((key) => !extra.includes(key)), ...extra];
  return [headers.map(csvCell).join(","), ...records.map((record) => {
    const row = { ...record.raw, explorer_effective_date: record.date, explorer_date_basis: record.dateKind, explorer_retrieved_at: record.retrievedAt ?? retrievedAt };
    return headers.map((key) => csvCell(row[key as keyof typeof row])).join(",");
  })].join("\r\n");
}

export function exportJson(records: Permit[], dataset: Dataset, retrievedAt: string | null = null): string {
  return JSON.stringify({ metadata: {
    ...dataset.metadata,
    name: `${dataset.name} — filtered export`, synthetic: dataset.synthetic,
    retrievedAt: retrievedAt ?? dataset.retrievedAt, exportedAt: new Date().toISOString(),
    completeness: dataset.completeness, originalRows: dataset.totalRows, exportedRows: records.length,
    note: "Returned records only. Not municipality totals. Date filters use completion date for Delta and source permit date for Red Deer.",
  }, records: records.map((record) => record.raw) }, null, 2);
}
