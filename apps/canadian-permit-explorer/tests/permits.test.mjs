import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { parseCsv, parseDataset, filterPermits, sortPermits, summarize, exportCsv, exportJson, isoDate, reportedValue, safeUrl, EMPTY_FILTERS } from '../lib/permits.ts';

const row = (overrides = {}) => ({ city: 'Halifax', provinceCode: 'NS', permitNumber: 'P-1', permitType: 'Residential', workType: 'Renovation', status: 'Issued', issuedDate: '2026-10-20', estimatedValueCad: 125000, source: 'https://example.org/open-data', licence: 'Example open licence', ...overrides });
const parse = (rows) => parseDataset(JSON.stringify(rows), 'fixture.json', '2026-11-10T00:00:00Z');

test('CSV handles BOM, CRLF, quoted commas, escaped quotes and multiline fields', () => {
  const rows = parseCsv('\uFEFFcity,permitNumber,work_description\r\nHalifax,P-1,"Renovation, with ""quoted"" detail\r\nand another line"\r\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].work_description, 'Renovation, with "quoted" detail\r\nand another line');
});

test('malformed CSV fails clearly instead of shifting source fields', () => {
  for (const input of ['city,city\nHalifax,Calgary', 'city,permitNumber\nHalifax', 'city,permitNumber\nHalifax,"unclosed', 'city,permitNumber\nHalifax,"closed"oops']) assert.throws(() => parseCsv(input));
});

test('missing, zero and invalid project values stay absent; zero unit counts survive', () => {
  const data = parse([row({ estimatedValueCad: null }), row({ estimatedValueCad: 0, residentialUnits: 0 }), row({ estimatedValueCad: '' }), row({ estimatedValueCad: 'unknown' }), row({ estimatedValueCad: '$1,250.75' })]);
  assert.deepEqual(data.records.map((r) => r.value), [null, null, null, null, 1250.75]);
  assert.equal(data.records[1].raw.residentialUnits, 0);
  assert.equal(summarize(data.records).value, 1250.75);
  assert.equal(summarize(data.records).missing, 4);
  assert.equal(reportedValue(-2), null);
  assert.equal(reportedValue(Infinity), null);
  assert.equal(summarize(parse([row({ estimatedValueCad: 0.1 }), row({ estimatedValueCad: 0.2 })]).records).value, 0.3);
});

test('Delta completion and Red Deer permit dates are never called issue dates', () => {
  const data = parse([row({ city: 'Delta', completedDate: '2026-10-18', issuedDate: '2026-01-01' }), row({ city: 'delta', issuedDate: '2026-10-17' }), row({ city: 'red-deer', permitDate: '2026-09-30', issuedDate: '2026-01-01' })]);
  assert.deepEqual(data.records.map((r) => [r.date, r.dateKind]), [['2026-10-18', 'Completion date'], ['2026-10-17', 'Completion date'], ['2026-09-30', 'Permit date']]);
});

test('calendar-invalid dates are retained as undated with a diagnostic', () => {
  assert.equal(isoDate('2026-02-29'), null);
  assert.equal(isoDate('2024-02-29T12:03:00Z'), '2024-02-29');
  const data = parse([row({ issuedDate: '2026-02-30' })]);
  assert.equal(data.records[0].date, null);
  assert.match(data.diagnostics[0].message, /Invalid date/);
});

test('date ranges are inclusive and do not include missing dates', () => {
  const data = parse([row({ issuedDate: '2026-10-01' }), row({ issuedDate: '2026-10-31' }), row({ issuedDate: null }), row({ issuedDate: '2026-11-01' })]);
  assert.equal(filterPermits(data.records, { ...EMPTY_FILTERS, dateFrom: '2026-10-01', dateTo: '2026-10-31' }).length, 2);
});

test('value and text filters intersect without conflating null with zero', () => {
  const data = parse([row({ estimatedValueCad: 100, workType: 'HVAC' }), row({ estimatedValueCad: 200, workType: 'HVAC' }), row({ estimatedValueCad: null, workType: 'HVAC' }), row({ estimatedValueCad: 100, workType: 'New building' })]);
  assert.equal(filterPermits(data.records, { ...EMPTY_FILTERS, query: 'hvac', minValue: '0', maxValue: '150' }).length, 1);
  assert.equal(filterPermits(data.records, { ...EMPTY_FILTERS, valueAvailability: 'missing' }).length, 1);
});

test('mixed sources are explicitly excluded while permit rows are retained', () => {
  const data = parse([row({ signal_type: 'permit' }), { signal_type: 'tender_open', title: 'A tender' }, { foo: 2 }, null]);
  assert.equal(data.records.length, 1); assert.equal(data.totalRows, 4); assert.equal(data.skipped, 3);
  assert.match(data.diagnostics[0].message, /not a building permit/);
  assert.throws(() => parse([{ signal_type: 'business_licence' }]), /no supported building-permit rows/i);
  assert.throws(() => parse([{ arbitrary: 'fields' }]), /No compatible permit rows/);
});

test('permit revisions are preserved as separate source rows with unique UI IDs', () => {
  const data = parse([row({ revisionNumber: '00' }), row({ revisionNumber: '01' })]);
  assert.equal(data.records.length, 2);
  assert.notEqual(data.records[0].id, data.records[1].id);
});

test('CSV exports retain source attribution, nulls and protective formula escaping', () => {
  const data = parse([row({ work_description: '=HYPERLINK("https://bad.example")', estimatedValueCad: null, residentialUnits: 0 })]);
  const csv = exportCsv(data.records, '2026-11-10');
  const exported = parseCsv(csv)[0];
  assert.equal(exported.source, data.records[0].source);
  assert.equal(exported.licence, data.records[0].licence);
  assert.equal(exported.estimatedValueCad, null);
  assert.equal(exported.residentialUnits, '0');
  assert.match(exported.work_description, /^'=/);
  assert.equal(exported.explorer_retrieved_at, '2026-11-10');
});

test('JSON export preserves provenance metadata and synthetic labelling', () => {
  const data = parseDataset(JSON.stringify({ metadata: { synthetic: true, sourceQuery: 'https://example.org/query', completeness: 'partial', description: 'Only two records; not city totals.' }, records: [row(), row({ permitNumber: 'P-2' })] }));
  const exported = JSON.parse(exportJson(data.records.slice(0, 1), data, '2026-11-10'));
  assert.equal(exported.metadata.synthetic, true);
  assert.equal(exported.metadata.sourceQuery, 'https://example.org/query');
  assert.equal(exported.metadata.retrievedAt, '2026-11-10');
  assert.equal(exported.metadata.exportedRows, 1);
  assert.equal(exported.records.length, 1);
  assert.match(data.completeness, /not city totals/);
  assert.equal(parseDataset(JSON.stringify(exported)).synthetic, true);
});

test('sort puts unknown values last, remains stable and does not mutate input', () => {
  const data = parse([row({ estimatedValueCad: null }), row({ estimatedValueCad: 200 }), row({ estimatedValueCad: 100 })]);
  assert.deepEqual(sortPermits(data.records, 'value-desc').map((r) => r.value), [200, 100, null]);
  assert.equal(data.records[0].value, null);
});

test('unsafe source URL schemes cannot become links', () => {
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('data:text/html,test'), null);
  assert.equal(safeUrl('https://example.org/data'), 'https://example.org/data');
});

test('fictional labelling survives CSV reimport', () => {
  const data = parse([row({ synthetic: true })]);
  assert.equal(data.synthetic, true);
  assert.equal(parseDataset(exportCsv(data.records), 'fictional.csv').synthetic, true);
});

test('bundled official sample has 40 source-attributed real rows and bounded provenance', () => {
  const data = parseDataset(fs.readFileSync(new URL('../public/samples/official-permits.json', import.meta.url), 'utf8'));
  assert.equal(data.records.length, 40); assert.equal(data.synthetic, false);
  assert.equal(data.records.every((r) => r.city === 'Calgary' && r.source && r.licence), true);
  assert.equal(data.records.every((r) => !('project_address' in r.raw) && !('contractor_company' in r.raw)), true);
  assert.match(data.completeness, /bounded snapshot/);
  assert.equal(data.retrievedAt.slice(0, 10), '2026-11-10');
});
