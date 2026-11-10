export type Completeness = "complete" | "partial" | "unknown";
export type ChangeKind =
  "price" | "discount" | "stock" | "added" | "absent" | "data";
export type ProductStatus = "changed" | "added" | "absent" | "unchanged";
export interface Variant {
  id: string;
  title: string;
  sku: string;
  price: number | null;
  compareAtPrice: number | null;
  available: boolean | null;
}
export interface Product {
  key: string;
  store: string;
  id: string;
  title: string;
  vendor: string;
  productType: string;
  url: string;
  currency: string | null;
  priceMin: number | null;
  priceMax: number | null;
  available: boolean | null;
  onSale: boolean | null;
  maxDiscountPct: number | null;
  variants: Variant[] | null;
}
export interface Snapshot {
  label: string;
  capturedAt: string | null;
  completeness: Completeness;
  products: Product[];
  fileName: string;
  synthetic: boolean;
}
export interface Change {
  kind: ChangeKind;
  label: string;
  before: string;
  after: string;
  delta?: number;
}
export interface ProductComparison {
  key: string;
  product: Product;
  before: Product | null;
  after: Product | null;
  status: ProductStatus;
  changes: Change[];
  notes: string[];
}
export interface Comparison {
  rows: ProductComparison[];
  warnings: string[];
  totals: {
    before: number;
    after: number;
    changed: number;
    added: number;
    absent: number;
    unchanged: number;
    price: number;
    stock: number;
    discount: number;
  };
}

function obj(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
function id(value: unknown, context: string): string {
  if (typeof value === "number" && (!Number.isSafeInteger(value) || value < 0))
    throw new Error(
      `${context}: numeric IDs must be safe, non-negative integers. Use a string for longer IDs.`,
    );
  const result = typeof value === "number" ? String(value) : str(value);
  if (!result) throw new Error(`${context}: a stable ID is required.`);
  return result;
}
function numberOrNull(value: unknown, context: string): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+(\.\d+)?$/.test(value.trim())
        ? Number(value)
        : NaN;
  if (!Number.isFinite(number) || number < 0 || number > 1e12)
    throw new Error(`${context}: expected a non-negative number or null.`);
  return number;
}
function boolOrNull(value: unknown, context: string): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "boolean")
    throw new Error(
      `${context}: expected true, false, or null. A missing value means unknown.`,
    );
  return value;
}
function storeName(value: unknown, productUrl: unknown): string {
  const candidate = str(value) || str(productUrl);
  if (!candidate)
    throw new Error(
      "Every product needs a store domain, or a valid product URL.",
    );
  let url: URL;
  try {
    url = new URL(
      candidate.includes("://") ? candidate : `https://${candidate}`,
    );
  } catch {
    throw new Error(`Invalid store domain: ${candidate.slice(0, 80)}.`);
  }
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname ||
    !url.hostname.includes(".") ||
    url.username ||
    url.password
  )
    throw new Error("Store must be a plain public domain or an HTTP(S) URL.");
  return url.hostname.toLowerCase().replace(/^www\./, "");
}
function productUrl(value: unknown): string {
  if (!str(value)) return "";
  try {
    const url = new URL(str(value));
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : "";
  } catch {
    return "";
  }
}
function normalizeProduct(value: unknown, index: number): Product {
  const raw = obj(value);
  if (!raw) throw new Error(`Row ${index + 1} must be a product object.`);
  const context = `Row ${index + 1}`;
  const productId = id(raw.productId ?? raw.id, `${context} product ID`);
  const store = storeName(raw.store, raw.url);
  const currency = str(raw.currency).toUpperCase() || null;
  if (currency && !/^[A-Z]{3}$/.test(currency))
    throw new Error(
      `${context}: currency must be a three-letter code or null.`,
    );
  const seen = new Set<string>();
  let variants: Variant[] | null = null;
  if (raw.variants !== undefined && raw.variants !== null) {
    if (!Array.isArray(raw.variants))
      throw new Error(`${context}: variants must be an array or null.`);
    variants = raw.variants.map((value, v) => {
      const variant = obj(value);
      if (!variant)
        throw new Error(`${context}, variant ${v + 1} must be an object.`);
      const variantId = id(
        variant.variantId ?? variant.id,
        `${context}, variant ${v + 1} ID`,
      );
      if (seen.has(variantId))
        throw new Error(`${context}: duplicate variant ID ${variantId}.`);
      seen.add(variantId);
      return {
        id: variantId,
        title: str(variant.title) || "Unnamed variant",
        sku: str(variant.sku),
        price: numberOrNull(variant.price, `${context}, variant price`),
        compareAtPrice: numberOrNull(
          variant.compareAtPrice ?? variant.compare_at_price,
          `${context}, variant compare-at price`,
        ),
        available: boolOrNull(
          variant.available,
          `${context}, variant availability`,
        ),
      };
    });
  }
  const priceMin = numberOrNull(
    raw.priceMin ?? raw.price,
    `${context} minimum price`,
  );
  const priceMax = numberOrNull(
    raw.priceMax ?? raw.priceMin ?? raw.price,
    `${context} maximum price`,
  );
  if (priceMin !== null && priceMax !== null && priceMin > priceMax)
    throw new Error(`${context}: minimum price cannot exceed maximum price.`);
  const maxDiscountPct = numberOrNull(
    raw.maxDiscountPct,
    `${context} discount`,
  );
  if (maxDiscountPct !== null && maxDiscountPct > 100)
    throw new Error(`${context}: discount cannot exceed 100%.`);
  return {
    key: JSON.stringify([store, productId]),
    store,
    id: productId,
    title: str(raw.title) || `Product ${productId}`,
    vendor: str(raw.vendor),
    productType: str(raw.productType ?? raw.product_type),
    url: productUrl(raw.url),
    currency,
    priceMin,
    priceMax,
    available: boolOrNull(raw.available, `${context} availability`),
    onSale: boolOrNull(raw.onSale, `${context} sale status`),
    maxDiscountPct,
    variants,
  };
}
export function parseSnapshot(
  text: string,
  fileName = "snapshot.json",
): Snapshot {
  if (text.length > 12_000_000)
    throw new Error("Use a JSON file smaller than 10 MB.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error(
      "This file is not valid JSON. Export the dataset as JSON, not CSV or JSONL.",
    );
  }
  const wrapper = obj(parsed);
  const list = Array.isArray(parsed)
    ? parsed
    : (wrapper?.products ?? wrapper?.items);
  if (!Array.isArray(list))
    throw new Error(
      'Expected an array of products, or an object containing a "products" array.',
    );
  if (list.length > 50_000)
    throw new Error(
      "This version supports up to 50,000 products per snapshot. Export a smaller set.",
    );
  const meta = obj(wrapper?.meta) ?? {};
  const completeness: Completeness = [
    "complete",
    "partial",
    "unknown",
  ].includes(str(meta.completeness))
    ? (str(meta.completeness) as Completeness)
    : "unknown";
  const capturedAt = str(meta.capturedAt) || null;
  if (capturedAt && !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(capturedAt))
    throw new Error(
      "Snapshot capturedAt must be an ISO date, such as 2026-11-10.",
    );
  if (capturedAt && Number.isNaN(Date.parse(capturedAt)))
    throw new Error("Snapshot capturedAt is not a valid date.");
  const products = list.map(normalizeProduct);
  const seen = new Set<string>();
  for (const product of products) {
    if (seen.has(product.key))
      throw new Error(
        `Duplicate product ID ${product.id} for ${product.store}. Each store/product pair must appear once.`,
      );
    seen.add(product.key);
  }
  return {
    label: str(meta.label) || fileName.replace(/\.json$/i, ""),
    capturedAt,
    completeness,
    products,
    fileName,
    synthetic: meta.synthetic === true,
  };
}
export function formatMoney(
  value: number | null,
  currency: string | null,
): string {
  if (value === null) return "Unknown";
  const amount = value.toLocaleString("en-CA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency ?? "Currency unknown"} ${amount}`;
}
export function formatPrice(product: Product | null): string {
  if (!product) return "—";
  if (product.priceMin === null && product.priceMax === null) return "Unknown";
  if (product.priceMin === product.priceMax)
    return formatMoney(product.priceMin, product.currency);
  if (product.priceMin === null || product.priceMax === null)
    return "Incomplete price range";
  return `${formatMoney(product.priceMin, product.currency)}–${product.priceMax.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
export function stockLabel(value: boolean | null | undefined): string {
  return value === true
    ? "Available"
    : value === false
      ? "Unavailable"
      : "Unknown";
}
export function formatDate(value: string | null): string {
  if (!value) return "Date not provided";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
function pct(value: number | null): string {
  return value === null ? "Unknown" : `${Math.round(value * 100) / 100}%`;
}
function checkStock(
  before: boolean | null,
  after: boolean | null,
  label: string,
  changes: Change[],
) {
  if (before === after) return;
  changes.push({
    kind: before === null || after === null ? "data" : "stock",
    label,
    before: stockLabel(before),
    after: stockLabel(after),
  });
}
function discount(variant: Variant): number | null {
  return variant.price !== null &&
    variant.compareAtPrice !== null &&
    variant.compareAtPrice > 0
    ? Math.max(
        0,
        Math.round((1 - variant.price / variant.compareAtPrice) * 10000) / 100,
      )
    : null;
}
function compareProduct(before: Product, after: Product): ProductComparison {
  const changes: Change[] = [];
  const notes: string[] = [];
  const currencyComparable =
    !!before.currency && before.currency === after.currency;
  if (!currencyComparable)
    notes.push(
      `Price comparison skipped: ${!before.currency || !after.currency ? "currency is unknown in at least one snapshot" : "the currency changed"}. No conversion is performed.`,
    );
  if (before.currency !== after.currency)
    changes.push({
      kind: "data",
      label: "Currency",
      before: before.currency ?? "Unknown",
      after: after.currency ?? "Unknown",
    });
  if (
    currencyComparable &&
    (before.priceMin !== after.priceMin || before.priceMax !== after.priceMax)
  ) {
    const known =
      before.priceMin !== null &&
      after.priceMin !== null &&
      before.priceMax !== null &&
      after.priceMax !== null;
    changes.push({
      kind: known ? "price" : "data",
      label: known ? "Product price range" : "Price information",
      before: formatPrice(before),
      after: formatPrice(after),
      ...(known ? { delta: after.priceMin! - before.priceMin! } : {}),
    });
  }
  checkStock(
    before.available,
    after.available,
    "Product availability",
    changes,
  );
  if (before.onSale !== after.onSale)
    changes.push({
      kind:
        before.onSale === null || after.onSale === null ? "data" : "discount",
      label: "Sale status",
      before:
        before.onSale === null
          ? "Unknown"
          : before.onSale
            ? "On sale"
            : "Not on sale",
      after:
        after.onSale === null
          ? "Unknown"
          : after.onSale
            ? "On sale"
            : "Not on sale",
    });
  if (currencyComparable && before.maxDiscountPct !== after.maxDiscountPct)
    changes.push({
      kind:
        before.maxDiscountPct === null || after.maxDiscountPct === null
          ? "data"
          : "discount",
      label: "Largest reported discount",
      before: pct(before.maxDiscountPct),
      after: pct(after.maxDiscountPct),
    });
  for (const [field, label] of [
    ["title", "Product title"],
    ["vendor", "Vendor"],
    ["productType", "Product type"],
  ] as const)
    if (before[field] !== after[field])
      changes.push({
        kind: "data",
        label,
        before: before[field] || "Not provided",
        after: after[field] || "Not provided",
      });
  if (before.variants === null || after.variants === null)
    notes.push(
      "Variant-level comparison is unavailable because at least one snapshot omits variants.",
    );
  else {
    const a = new Map(before.variants.map((v) => [v.id, v]));
    const b = new Map(after.variants.map((v) => [v.id, v]));
    for (const [id, variant] of b) {
      const old = a.get(id);
      const label = `Variant · ${variant.title}`;
      if (!old) {
        changes.push({
          kind: "added",
          label,
          before: "Not in before snapshot",
          after: "Present in after snapshot",
        });
        continue;
      }
      if (currencyComparable && old.price !== variant.price) {
        const known = old.price !== null && variant.price !== null;
        changes.push({
          kind: known ? "price" : "data",
          label: `${label} · price`,
          before: formatMoney(old.price, before.currency),
          after: formatMoney(variant.price, after.currency),
          ...(known ? { delta: variant.price! - old.price! } : {}),
        });
      }
      checkStock(
        old.available,
        variant.available,
        `${label} · availability`,
        changes,
      );
      if (currencyComparable && old.compareAtPrice !== variant.compareAtPrice)
        changes.push({
          kind: "discount",
          label: `${label} · compare-at price`,
          before:
            old.compareAtPrice === null
              ? "Not provided"
              : formatMoney(old.compareAtPrice, before.currency),
          after:
            variant.compareAtPrice === null
              ? "Not provided"
              : formatMoney(variant.compareAtPrice, after.currency),
        });
      if (
        currencyComparable &&
        discount(old) !== discount(variant) &&
        old.compareAtPrice !== null &&
        variant.compareAtPrice !== null
      )
        changes.push({
          kind: "discount",
          label: `${label} · discount`,
          before: pct(discount(old)),
          after: pct(discount(variant)),
        });
      for (const [field, fieldLabel] of [
        ["title", "title"],
        ["sku", "SKU"],
      ] as const)
        if (old[field] !== variant[field])
          changes.push({
            kind: "data",
            label: `${label} · ${fieldLabel}`,
            before: old[field] || "Not provided",
            after: variant[field] || "Not provided",
          });
    }
    for (const [id, variant] of a)
      if (!b.has(id))
        changes.push({
          kind: "absent",
          label: `Variant · ${variant.title}`,
          before: "Present in before snapshot",
          after: "Not in after snapshot",
        });
  }
  return {
    key: after.key,
    product: after,
    before,
    after,
    status: changes.length ? "changed" : "unchanged",
    changes,
    notes,
  };
}
export function compareSnapshots(
  before: Snapshot,
  after: Snapshot,
): Comparison {
  const a = new Map(before.products.map((p) => [p.key, p]));
  const b = new Map(after.products.map((p) => [p.key, p]));
  const rows: ProductComparison[] = [];
  for (const [key, product] of b) {
    const old = a.get(key);
    rows.push(
      old
        ? compareProduct(old, product)
        : {
            key,
            product,
            before: null,
            after: product,
            status: "added",
            changes: [
              {
                kind: "added",
                label: "Product presence",
                before: "Not in before snapshot",
                after: "Present in after snapshot",
              },
            ],
            notes: [
              "This product appears only in the after snapshot. It may be newly captured, not newly launched.",
            ],
          },
    );
  }
  for (const [key, product] of a)
    if (!b.has(key))
      rows.push({
        key,
        product,
        before: product,
        after: null,
        status: "absent",
        changes: [
          {
            kind: "absent",
            label: "Product presence",
            before: "Present in before snapshot",
            after: "Not in after snapshot",
          },
        ],
        notes: [
          "Absence from an export is not proof of discontinuation. Filters, caps, errors, or feed changes can affect coverage.",
        ],
      });
  const warnings: string[] = [];
  if (before.completeness !== "complete" || after.completeness !== "complete")
    warnings.push(
      "At least one snapshot has partial or unknown coverage. Added and absent mean present in only one imported snapshot, not launched or discontinued.",
    );
  if (
    before.capturedAt &&
    after.capturedAt &&
    Date.parse(before.capturedAt) > Date.parse(after.capturedAt)
  )
    warnings.push(
      "The before snapshot is dated later than the after snapshot. Check the dates or swap the snapshots.",
    );
  const storesA = new Set(before.products.map((p) => p.store));
  const storesB = new Set(after.products.map((p) => p.store));
  if (
    storesA.size &&
    storesB.size &&
    ![...storesA].some((store) => storesB.has(store))
  )
    warnings.push(
      "These snapshots have no stores in common. Products from different stores are never matched.",
    );
  const count = (status: ProductStatus) =>
    rows.filter((r) => r.status === status).length;
  const kind = (kind: ChangeKind) =>
    rows.filter((r) => r.changes.some((c) => c.kind === kind)).length;
  return {
    rows,
    warnings,
    totals: {
      before: before.products.length,
      after: after.products.length,
      changed: count("changed"),
      added: count("added"),
      absent: count("absent"),
      unchanged: count("unchanged"),
      price: kind("price"),
      stock: kind("stock"),
      discount: kind("discount"),
    },
  };
}
export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export function csvReport(
  rows: ProductComparison[],
  before: Snapshot,
  after: Snapshot,
): string {
  const header = [
    "Store",
    "Product ID",
    "Product",
    "Status",
    "Before snapshot",
    "After snapshot",
    "Before coverage",
    "After coverage",
    "Before price",
    "After price",
    "Before availability",
    "After availability",
    "Changes",
    "Notes",
  ];
  return (
    "\uFEFF" +
    [
      header,
      ...rows.map((row) => [
        row.product.store,
        row.product.id,
        row.product.title,
        row.status,
        before.capturedAt ?? "Unknown date",
        after.capturedAt ?? "Unknown date",
        before.completeness,
        after.completeness,
        formatPrice(row.before),
        formatPrice(row.after),
        row.before ? stockLabel(row.before.available) : "Not present",
        row.after ? stockLabel(row.after.available) : "Not present",
        row.changes
          .map((c) => `${c.label}: ${c.before} → ${c.after}`)
          .join(" | "),
        row.notes.join(" "),
      ]),
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n")
  );
}
export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
export function htmlReport(
  rows: ProductComparison[],
  before: Snapshot,
  after: Snapshot,
): string {
  const e = escapeHtml;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shopify Snapshot Compare — report</title><style>body{font:15px/1.6 system-ui,sans-serif;margin:48px auto;padding:0 24px;max-width:1100px;color:#242c29;background:#faf9f5}h1{font-size:34px;letter-spacing:-1px}h2{font-size:20px}p,small{color:#52635c}table{width:100%;border-collapse:collapse;background:#fff}th,td{text-align:left;vertical-align:top;padding:14px;border-bottom:1px solid #dfe5df}th{background:#eef3ef}td small{display:block}.status{text-transform:uppercase;font-size:11px;letter-spacing:.08em}section{margin:32px 0}.note{padding:14px;background:#edf4ef;border-radius:8px}li{margin:5px 0}@media print{body{margin:12px}tr{break-inside:avoid}}</style><h1>Shopify Snapshot Compare</h1><p>${e(before.label)} (${e(formatDate(before.capturedAt))}) → ${e(after.label)} (${e(formatDate(after.capturedAt))})</p><p>Coverage: before ${e(before.completeness)} · after ${e(after.completeness)} · ${rows.length} exported products${before.synthetic || after.synthetic ? " · Includes synthetic demonstration data" : ""}</p><p class="note">This report compares imported snapshots. Absent does not mean discontinued, and added does not prove a new launch. Unknown values remain unknown. Prices are compared only when both currencies are known and identical.</p><table><thead><tr><th>Product</th><th>Status</th><th>Before → after</th><th>Details</th></tr></thead><tbody>${rows.map((row) => `<tr><td><strong>${e(row.product.title)}</strong><small>${e(row.product.store)} · ${e(row.product.id)}</small></td><td class="status">${e(row.status)}</td><td>${e(formatPrice(row.before))}<br>→ ${e(formatPrice(row.after))}</td><td>${row.changes.length ? `<ul>${row.changes.map((c) => `<li>${e(c.label)}: ${e(c.before)} → ${e(c.after)}</li>`).join("")}</ul>` : "No comparable changes"}${row.notes.map((n) => `<small>${e(n)}</small>`).join("")}</td></tr>`).join("")}</tbody></table><p>Created locally with Shopify Snapshot Compare by Travis Murphy. No files were uploaded by this tool.</p></html>`;
}
export function serializeSnapshot(snapshot: Snapshot): string {
  return JSON.stringify(
    {
      meta: {
        label: snapshot.label,
        capturedAt: snapshot.capturedAt,
        completeness: snapshot.completeness,
        synthetic: snapshot.synthetic,
      },
      products: snapshot.products.map((p) => ({
        store: p.store,
        productId: p.id,
        title: p.title,
        vendor: p.vendor,
        productType: p.productType,
        url: p.url || undefined,
        currency: p.currency,
        priceMin: p.priceMin,
        priceMax: p.priceMax,
        available: p.available,
        onSale: p.onSale,
        maxDiscountPct: p.maxDiscountPct,
        variants:
          p.variants?.map((v) => ({
            variantId: v.id,
            title: v.title,
            sku: v.sku,
            price: v.price,
            compareAtPrice: v.compareAtPrice,
            available: v.available,
          })) ?? null,
      })),
    },
    null,
    2,
  );
}
