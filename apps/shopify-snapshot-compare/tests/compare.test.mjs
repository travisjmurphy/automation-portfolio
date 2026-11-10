import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  compareSnapshots,
  parseSnapshot,
  csvReport,
  htmlReport,
  serializeSnapshot,
  formatPrice,
} from "../lib/compare.ts";
const product = (extra = {}) => ({
  store: "one.example",
  productId: "123",
  title: "Mug",
  currency: "CAD",
  priceMin: 20,
  priceMax: 20,
  available: true,
  onSale: false,
  maxDiscountPct: 0,
  variants: [
    {
      variantId: "v1",
      title: "Blue",
      price: 20,
      available: true,
      compareAtPrice: null,
    },
  ],
  ...extra,
});
const snapshot = (products, meta = {}) =>
  parseSnapshot(JSON.stringify({ meta, products }));

test("sample compares 10 before / 11 after with six changed, two added, one absent and three unchanged products", () => {
  const a = parseSnapshot(
    readFileSync(
      new URL("../public/examples/before.json", import.meta.url),
      "utf8",
    ),
  );
  const b = parseSnapshot(
    readFileSync(
      new URL("../public/examples/after.json", import.meta.url),
      "utf8",
    ),
  );
  const result = compareSnapshots(a, b);
  assert.deepEqual(result.totals, {
    before: 10,
    after: 11,
    changed: 6,
    added: 2,
    absent: 1,
    unchanged: 3,
    price: 2,
    stock: 1,
    discount: 1,
  });
  assert.equal(result.rows.length, 12);
  assert.equal(result.warnings.length, 0);
  assert.equal(a.synthetic, true);
});

test("matches IDs inside a normalized store domain, never across different stores", () => {
  const a = snapshot([
    product({ store: "https://www.one.example/collections/all" }),
    product({ store: "two.example", priceMin: 100, priceMax: 100 }),
  ]);
  const b = snapshot([
    product({ store: "one.example", priceMin: 25, priceMax: 25 }),
    product({ store: "two.example", priceMin: 100, priceMax: 100 }),
  ]);
  const result = compareSnapshots(a, b);
  assert.equal(result.rows.length, 2);
  assert.equal(result.totals.changed, 1);
  assert.equal(result.totals.unchanged, 1);
  const distinct = compareSnapshots(
    snapshot([product()]),
    snapshot([product({ store: "other.example" })]),
  );
  assert.equal(distinct.totals.added, 1);
  assert.equal(distinct.totals.absent, 1);
  assert.match(distinct.warnings.join(" "), /no stores in common/);
});

test("does not call unknown availability unavailable or count it as a stock change", () => {
  const result = compareSnapshots(
    snapshot([product()]),
    snapshot([
      product({
        available: null,
        variants: [
          { variantId: "v1", title: "Blue", price: 20, available: null },
        ],
      }),
    ]),
  );
  assert.equal(result.totals.stock, 0);
  assert.equal(result.rows[0].after.available, null);
  assert.ok(
    result.rows[0].changes.some(
      (c) => c.kind === "data" && c.after === "Unknown",
    ),
  );
});

test("skips price comparison for different or missing currencies, including variants", () => {
  for (const currency of [null, "USD"]) {
    const result = compareSnapshots(
      snapshot([product()]),
      snapshot([
        product({
          currency,
          priceMin: 2,
          priceMax: 2,
          variants: [
            { variantId: "v1", title: "Blue", price: 2, available: true },
          ],
        }),
      ]),
    );
    assert.equal(result.totals.price, 0);
    assert.match(result.rows[0].notes.join(" "), /Price comparison skipped/);
  }
});

test("missing price data is data change, not a zero price, and true zero remains comparable", () => {
  const result = compareSnapshots(
    snapshot([product()]),
    snapshot([product({ priceMin: null, priceMax: null })]),
  );
  assert.equal(result.totals.price, 0);
  assert.ok(
    result.rows[0].changes.some(
      (c) => c.kind === "data" && c.after === "Unknown",
    ),
  );
  const zero = compareSnapshots(
    snapshot([product()]),
    snapshot([product({ priceMin: 0, priceMax: 0 })]),
  );
  assert.equal(zero.totals.price, 1);
  assert.equal(formatPrice(zero.rows[0].after), "CAD 0.00");
});

test("matches variants by ID and detects availability, added and absent variants", () => {
  const a = snapshot([
    product({
      variants: [
        { variantId: "v1", title: "Blue", price: 20, available: true },
        { variantId: "v2", title: "Red", price: 20, available: true },
      ],
    }),
  ]);
  const b = snapshot([
    product({
      variants: [
        { variantId: "v1", title: "Blue", price: 20, available: false },
        { variantId: "v3", title: "Green", price: 20, available: true },
      ],
    }),
  ]);
  const result = compareSnapshots(a, b);
  assert.equal(result.rows.length, 1);
  assert.equal(result.totals.changed, 1);
  assert.deepEqual(result.rows[0].changes.map((c) => c.kind).sort(), [
    "absent",
    "added",
    "stock",
  ]);
  assert.equal(result.totals.added, 0);
});

test("omitted variants do not become an empty list or trigger mass removals", () => {
  const result = compareSnapshots(
    snapshot([product()]),
    snapshot([product({ variants: null })]),
  );
  assert.equal(result.rows[0].changes.length, 0);
  assert.match(result.rows[0].notes[0], /omits variants/);
});

test("partial coverage and missing dates remain explicit and absent is not discontinued", () => {
  const result = compareSnapshots(
    snapshot([product()], { completeness: "complete" }),
    snapshot([], { completeness: "partial" }),
  );
  assert.equal(result.totals.absent, 1);
  assert.match(result.warnings[0], /partial or unknown/);
  assert.match(result.rows[0].notes[0], /not proof of discontinuation/);
  assert.equal(snapshot([]).capturedAt, null);
});

test("warns on reversed chronological dates without silently swapping user input", () => {
  const result = compareSnapshots(
    snapshot([product()], { capturedAt: "2026-11-10" }),
    snapshot([product()], { capturedAt: "2026-11-03" }),
  );
  assert.match(result.warnings.join(" "), /dated later/);
});

test("rejects invalid JSON, IDs, duplicate records, invalid availability and invalid prices", () => {
  assert.throws(() => parseSnapshot("not json"), /not valid JSON/);
  assert.throws(() => snapshot([product({ productId: null })]), /stable ID/);
  assert.throws(() => snapshot([product(), product()]), /Duplicate product/);
  assert.throws(
    () => snapshot([product({ available: "false" })]),
    /true, false, or null/,
  );
  assert.throws(() => snapshot([product({ priceMin: -2 })]), /non-negative/);
  assert.throws(
    () => snapshot([product({ priceMin: 30, priceMax: 20 })]),
    /cannot exceed/,
  );
  assert.throws(
    () =>
      snapshot([
        product({
          variants: [
            { variantId: "v", price: 1 },
            { variantId: "v", price: 2 },
          ],
        }),
      ]),
    /duplicate variant/,
  );
  assert.throws(
    () => snapshot([product({ productId: 9007199254740992 })]),
    /safe/,
  );
  assert.throws(
    () => snapshot([product({ store: "javascript:alert(1)", url: "" })]),
    /domain|URL/,
  );
});

test("accepts the raw Actor array and numeric strings without silently coercing booleans", () => {
  const a = parseSnapshot(
    JSON.stringify([
      product({ productId: 123, priceMin: "20.50", priceMax: "20.50" }),
    ]),
    "actor-export.json",
  );
  assert.equal(a.products[0].priceMin, 20.5);
  assert.equal(a.completeness, "unknown");
  assert.equal(a.products[0].id, "123");
});

test("reports escape HTML and protect formula-like spreadsheet cells", () => {
  const a = snapshot([product({ title: '=HYPERLINK("https://bad.example")' })]);
  const b = snapshot([product({ title: "<script>alert(1)</script>" })]);
  const result = compareSnapshots(a, b);
  const csv = csvReport(compareSnapshots(a, a).rows, a, a);
  assert.match(csv, /'=HYPERLINK/);
  const html = htmlReport(result.rows, a, b);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(csvReport(result.rows, a, b).startsWith("\uFEFF"));
});

test("snapshot round trip keeps metadata, currency, unknowns, string IDs and variants", () => {
  const a = snapshot([product({ currency: null, available: null })], {
    label: "My export",
    capturedAt: "2026-11-03",
    completeness: "partial",
  });
  const b = parseSnapshot(serializeSnapshot(a));
  assert.deepEqual(b.products, a.products);
  assert.equal(b.completeness, "partial");
  assert.equal(b.label, "My export");
  assert.equal(b.capturedAt, "2026-11-03");
});
