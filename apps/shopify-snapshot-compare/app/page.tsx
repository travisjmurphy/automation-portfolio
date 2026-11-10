"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileJson,
  FileText,
  CodeXml,
  HelpCircle,
  Info,
  Layers3,
  Leaf,
  LockKeyhole,
  Package,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import {
  compareSnapshots,
  csvReport,
  formatDate,
  formatMoney,
  formatPrice,
  htmlReport,
  parseSnapshot,
  serializeSnapshot,
  stockLabel,
  type ChangeKind,
  type Completeness,
  type ProductComparison,
  type Snapshot,
} from "@/lib/compare";
import demoBefore from "@/public/examples/before.json";
import demoAfter from "@/public/examples/after.json";

type Filter =
  | "all"
  | "changed"
  | "price"
  | "stock"
  | "discount"
  | "added"
  | "absent"
  | "unchanged";
const filterLabels: Record<Filter, string> = {
  all: "All products",
  changed: "Changed",
  price: "Price",
  stock: "Availability",
  discount: "Discount",
  added: "Added",
  absent: "Absent",
  unchanged: "Unchanged",
};
const changeLabels: Record<ChangeKind, string> = {
  price: "Price",
  discount: "Discount",
  stock: "Availability",
  added: "Added",
  absent: "Absent",
  data: "Details",
};
function readDemo() {
  return {
    before: parseSnapshot(JSON.stringify(demoBefore), "before.json"),
    after: parseSnapshot(JSON.stringify(demoAfter), "after.json"),
  };
}
function download(content: string, name: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function Logo({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark ${small ? "small" : ""}`} aria-hidden="true">
      <i />
      <span>
        <i />
        <i />
      </span>
    </span>
  );
}
function Tags({ row }: { row: ProductComparison }) {
  if (row.status === "unchanged")
    return <span className="pill neutral">No changes</span>;
  const kinds = [...new Set(row.changes.map((c) => c.kind))];
  return (
    <span className="tags">
      {kinds.slice(0, 3).map((kind) => (
        <span key={kind} className={`pill ${kind}`}>
          {row.status === "changed" && kind === "added"
            ? "Variant added"
            : row.status === "changed" && kind === "absent"
              ? "Variant absent"
              : changeLabels[kind]}
        </span>
      ))}
      {kinds.length > 3 && (
        <span className="pill neutral">+{kinds.length - 3}</span>
      )}
    </span>
  );
}
function SnapshotCard({
  side,
  snapshot,
  onChange,
  onFile,
  busy,
}: {
  side: "before" | "after";
  snapshot: Snapshot | null;
  onChange: (next: Snapshot | null) => void;
  onFile: (file: File, side: "before" | "after") => void;
  busy: boolean;
}) {
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <section
      className={`snapshot-card ${side} ${dragging ? "dragging" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) onFile(file, side);
      }}
      aria-label={`${side} snapshot`}
    >
      <div className="snapshot-heading">
        <span className={`step-dot ${side}`}>
          {side === "before" ? "01" : "02"}
        </span>
        <span>{side === "before" ? "Before snapshot" : "After snapshot"}</span>
        <span className="snapshot-heading-right">
          {snapshot ? (
            <>
              <CheckCircle2 size={13} /> Ready
            </>
          ) : (
            "JSON export"
          )}
        </span>
      </div>
      {snapshot ? (
        <>
          <div className="file-row">
            <span className={`file-icon ${side}`}>
              <FileJson size={24} strokeWidth={1.5} />
            </span>
            <div className="file-summary">
              <h3 title={snapshot.label}>{snapshot.label}</h3>
              <p>
                {snapshot.products.length.toLocaleString()} products{" "}
                <span>·</span> {formatDate(snapshot.capturedAt)}
              </p>
            </div>
            <button
              className="icon-button subtle"
              onClick={() => onChange(null)}
              aria-label={`Remove ${side} snapshot`}
              title="Remove snapshot"
            >
              <X size={16} />
            </button>
          </div>
          <div className="snapshot-footer">
            <span className={`coverage ${snapshot.completeness}`}>
              <span />
              {snapshot.completeness === "complete"
                ? "Complete export"
                : snapshot.completeness === "partial"
                  ? "Partial export"
                  : "Coverage unknown"}
            </span>
            <button
              className="text-button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              Replace file <Upload size={12} />
            </button>
          </div>
          <details className="metadata-editor">
            <summary>
              Snapshot details <ChevronDown size={12} />
            </summary>
            <div className="metadata-fields">
              <label>
                Snapshot name
                <input
                  value={snapshot.label}
                  maxLength={100}
                  onChange={(e) =>
                    onChange({ ...snapshot, label: e.target.value })
                  }
                />
              </label>
              <div className="metadata-pair">
                <label>
                  Capture date
                  <input
                    type="date"
                    value={snapshot.capturedAt?.slice(0, 10) ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...snapshot,
                        capturedAt: e.target.value || null,
                      })
                    }
                  />
                </label>
                <label>
                  Export coverage
                  <select
                    value={snapshot.completeness}
                    onChange={(e) =>
                      onChange({
                        ...snapshot,
                        completeness: e.target.value as Completeness,
                      })
                    }
                  >
                    <option value="unknown">Unknown</option>
                    <option value="partial">Partial</option>
                    <option value="complete">Complete</option>
                  </select>
                </label>
              </div>
              <p>
                Choose complete only if this export includes all products for
                the same stores and filters. Capture date is the export date.
              </p>
            </div>
          </details>
        </>
      ) : (
        <button
          className="empty-upload"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
        >
          <Upload size={24} strokeWidth={1.5} />
          <strong>{busy ? "Reading file…" : "Choose a JSON export"}</strong>
          <span>or drop it here · up to 10 MB</span>
        </button>
      )}
      <input
        type="file"
        accept=".json,application/json"
        className="visually-hidden"
        ref={fileRef}
        aria-label={`Upload ${side} snapshot JSON`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file, side);
          e.currentTarget.value = "";
        }}
      />
    </section>
  );
}
function Help({ onClose }: { onClose: () => void }) {
  return (
    <>
      <div className="dialog-heading">
        <div>
          <span className="eyebrow">A quick field guide</span>
          <h2 id="help-title">From exports to answers.</h2>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close help"
        >
          <X size={20} />
        </button>
      </div>
      <div className="help-content">
        <div className="help-step">
          <span>1</span>
          <div>
            <h3>Bring two catalogue snapshots</h3>
            <p>
              Export the same stores at two points in time using{" "}
              <a
                href="https://apify.com/loudtzu/shopify-store-products"
                target="_blank"
                rel="noreferrer"
              >
                Shopify Store Products on Apify <ArrowUpRight size={13} />
              </a>
              . Download each dataset as JSON, with variants included for a
              detailed comparison. Other exports following the same schema work
              too.
            </p>
          </div>
        </div>
        <div className="help-step">
          <span>2</span>
          <div>
            <h3>Compare like with like</h3>
            <p>
              Use the same store, collection, filters and export limits. Set the
              capture date and coverage under “Snapshot details.” A partial
              export can omit products that still exist.
            </p>
          </div>
        </div>
        <div className="help-step">
          <span>3</span>
          <div>
            <h3>Explore and share</h3>
            <p>
              Filter by the change you care about, select a product for details,
              then export the visible results to CSV or a standalone HTML
              report.
            </p>
          </div>
        </div>
        <h3>Accepted JSON</h3>
        <p>
          A plain array of product objects works directly. You can also include
          metadata:
        </p>
        <pre>{`{
  "meta": {
    "label": "November catalogue",
    "capturedAt": "2026-11-10",
    "completeness": "complete"
  },
  "products": [{
    "store": "your-store.example",
    "productId": "123",
    "title": "Ceramic mug",
    "currency": "CAD",
    "priceMin": 24,
    "priceMax": 24,
    "available": true,
    "variants": []
  }]
}`}</pre>
        <div className="help-callout">
          <Info size={18} />
          <div>
            <strong>What the comparison can tell you</strong>
            <p>
              IDs are matched within each store. Unknown availability stays
              unknown. Prices are compared only when the currency is known and
              identical. “Added” and “absent” describe these files; they do not
              prove a launch or discontinuation. Nothing is uploaded, and your
              files are cleared when you reload.
            </p>
          </div>
        </div>
        <div className="sample-actions">
          <a className="button secondary" href="/examples/before.json" download>
            <Download size={15} /> Before sample
          </a>
          <a className="button secondary" href="/examples/after.json" download>
            <Download size={15} /> After sample
          </a>
        </div>
      </div>
    </>
  );
}
function Detail({
  row,
  onClose,
}: {
  row: ProductComparison;
  onClose: () => void;
}) {
  return (
    <>
      <div className="dialog-heading">
        <div>
          <span className="eyebrow">Product comparison</span>
          <h2 id="detail-title">{row.product.title}</h2>
          <p>
            {row.product.store} <span>·</span> ID {row.product.id}
          </p>
        </div>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Close product details"
        >
          <X size={20} />
        </button>
      </div>
      <div className="detail-content">
        <Tags row={row} />
        <div className="detail-snapshot-grid">
          {(["before", "after"] as const).map((side) => {
            const p = row[side];
            return (
              <div key={side}>
                <span className="eyebrow">{side}</span>
                <strong>{formatPrice(p)}</strong>
                <span>{p ? stockLabel(p.available) : "Not in snapshot"}</span>
                <small>
                  {p?.variants === null
                    ? "Variants not provided"
                    : p
                      ? `${p.variants?.length ?? 0} variants`
                      : ""}
                </small>
              </div>
            );
          })}
        </div>
        <h3>
          {row.changes.length
            ? `${row.changes.length} recorded ${row.changes.length === 1 ? "change" : "changes"}`
            : "No comparable changes"}
        </h3>
        <div className="change-list">
          {row.changes.map((change, index) => (
            <div className="change-detail" key={index}>
              <div>
                <span className={`tiny-dot ${change.kind}`} />
                <strong>{change.label}</strong>
              </div>
              <p>
                <span>{change.before}</span>
                <ArrowRight size={14} />
                <span>{change.after}</span>
              </p>
            </div>
          ))}
        </div>
        {row.notes.map((note) => (
          <p className="inline-note" key={note}>
            <Info size={15} />
            {note}
          </p>
        ))}
        {row.status === "unchanged" && (
          <p className="muted-text">
            Compared fields and included variants match. This is not a full
            content comparison of the store.
          </p>
        )}
        <p className="detail-fineprint">
          Snapshot presence and availability are separate. Availability means
          whether a product or variant can be bought, not the quantity in stock.
        </p>
      </div>
    </>
  );
}

export default function Home() {
  const initial = useMemo(readDemo, []);
  const [before, setBefore] = useState<Snapshot | null>(initial.before);
  const [after, setAfter] = useState<Snapshot | null>(initial.after);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [store, setStore] = useState("all");
  const [sort, setSort] = useState("changes");
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<"before" | "after" | null>(null);
  const [selected, setSelected] = useState<ProductComparison | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef<HTMLDialogElement>(null);
  const detailRef = useRef<HTMLDialogElement>(null);
  const compare = useMemo(
    () => (before && after ? compareSnapshots(before, after) : null),
    [before, after],
  );
  const stores = useMemo(
    () =>
      [...new Set(compare?.rows.map((row) => row.product.store) ?? [])].sort(),
    [compare],
  );
  useEffect(() => {
    if (helpOpen) helpRef.current?.showModal();
    else helpRef.current?.close();
  }, [helpOpen]);
  useEffect(() => {
    if (selected) detailRef.current?.showModal();
    else detailRef.current?.close();
  }, [selected]);
  useEffect(() => {
    setPage(1);
  }, [filter, search, store, sort, before, after]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (compare?.rows ?? [])
      .filter((row) => {
        const filterMatch =
          filter === "all" ||
          (filter === "changed" && row.status === "changed") ||
          (filter === "added" && row.status === "added") ||
          (filter === "absent" && row.status === "absent") ||
          (filter === "unchanged" && row.status === "unchanged") ||
          (["price", "stock", "discount"].includes(filter) &&
            row.changes.some((c) => c.kind === filter));
        return (
          filterMatch &&
          (store === "all" || row.product.store === store) &&
          (!query ||
            `${row.product.title} ${row.product.vendor} ${row.product.id} ${row.product.productType} ${row.product.store} ${row.product.variants?.map((v) => v.sku).join(" ") ?? ""}`
              .toLowerCase()
              .includes(query))
        );
      })
      .sort((a, b) =>
        sort === "name"
          ? a.product.title.localeCompare(b.product.title)
          : sort === "store"
            ? a.product.store.localeCompare(b.product.store) ||
              a.product.title.localeCompare(b.product.title)
            : b.changes.length - a.changes.length ||
              a.product.title.localeCompare(b.product.title),
      );
  }, [compare, filter, search, store, sort]);
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleRows = rows.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );
  const synthetic = !!before?.synthetic || !!after?.synthetic;
  async function upload(file: File, side: "before" | "after") {
    setBusy(side);
    setError("");
    try {
      if (file.size > 10 * 1024 * 1024)
        throw new Error(
          "This file is larger than 10 MB. Export a smaller dataset to compare.",
        );
      const snapshot = parseSnapshot(await file.text(), file.name);
      (side === "before" ? setBefore : setAfter)(snapshot);
      setStore("all");
      setNotice(
        `${side === "before" ? "Before" : "After"} snapshot loaded: ${snapshot.products.length.toLocaleString()} products.`,
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Could not read this file. Try a JSON export.",
      );
    } finally {
      setBusy(null);
    }
  }
  function loadDemo() {
    const demo = readDemo();
    setBefore(demo.before);
    setAfter(demo.after);
    setError("");
    setFilter("all");
    setSearch("");
    setStore("all");
    setNotice(
      "Synthetic Northline sample loaded. Upload your own files whenever you're ready.",
    );
  }
  function exportReport(type: "csv" | "html") {
    if (!before || !after) return;
    download(
      type === "csv"
        ? csvReport(rows, before, after)
        : htmlReport(rows, before, after),
      `snapshot-comparison.${type}`,
      type === "csv" ? "text/csv;charset=utf-8" : "text/html;charset=utf-8",
    );
    setNotice(
      `Exported ${rows.length} ${rows.length === 1 ? "product" : "products"} as ${type.toUpperCase()}. Your active filters are included.`,
    );
  }
  const counts: Record<Filter, number> = {
    all: compare?.rows.length ?? 0,
    changed: compare?.totals.changed ?? 0,
    price: compare?.totals.price ?? 0,
    stock: compare?.totals.stock ?? 0,
    discount: compare?.totals.discount ?? 0,
    added: compare?.totals.added ?? 0,
    absent: compare?.totals.absent ?? 0,
    unchanged: compare?.totals.unchanged ?? 0,
  };
  return (
    <div className="app-shell">
      <a className="skip-link" href="#comparison">
        Skip to comparison
      </a>
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="Snapshot Compare home">
          <Logo />
          <span>
            snapshot<span>COMPARE</span>
          </span>
        </a>
        <div className="sidebar-section-label">WORKSPACE</div>
        <nav aria-label="Workspace navigation">
          <a href="#comparison" className="nav-item active">
            <Layers3 size={17} /> Catalogue comparison{" "}
            <span className="nav-active-dot" />
          </a>
          <button className="nav-item" onClick={() => setHelpOpen(true)}>
            <HelpCircle size={17} /> How it works <ArrowUpRight size={14} />
          </button>
        </nav>
        <div className="sidebar-divider" />
        <div className="sidebar-section-label">START WITH A SAMPLE</div>
        <p className="sidebar-copy">
          Get a feel for the details.
          <br />
          Every sample is synthetic.
        </p>
        <button className="sidebar-demo" onClick={loadDemo}>
          <Sparkles size={15} /> Load the demo <ArrowRight size={14} />
        </button>
        <div className="sidebar-bottom">
          <div className="local-illustration" aria-hidden="true">
            <span className="local-box one">
              <FileJson size={18} />
            </span>
            <span className="local-track" />
            <span className="local-box two">
              <Check size={18} />
            </span>
          </div>
          <h3>Your files stay yours.</h3>
          <p>All comparisons happen in your browser. No sign-in. No upload.</p>
          <a
            href="https://github.com/travisjmurphy/automation-portfolio/tree/main/apps/shopify-snapshot-compare"
            target="_blank"
            rel="noreferrer"
            className="builder-link"
          >
            <span className="builder-avatar">TM</span>
            <span>
              Built by Travis Murphy
              <small>
                View on GitHub <ArrowUpRight size={11} />
              </small>
            </span>
          </a>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            <Logo small />
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>Snapshot Compare</strong>
          </div>
          <div className="topbar-right">
            <span className="local-badge">
              <span /> Processing locally
            </span>
            <button
              className="icon-button help-button"
              onClick={() => setHelpOpen(true)}
              aria-label="Open help"
            >
              <HelpCircle size={18} />
            </button>
            <a
              className="icon-button github-button"
              href="https://github.com/travisjmurphy/automation-portfolio/tree/main/apps/shopify-snapshot-compare"
              target="_blank"
              rel="noreferrer"
              aria-label="Travis Murphy on GitHub"
            >
              <CodeXml size={18} />
            </a>
          </div>
        </header>
        <main id="comparison">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-line" /> CATALOGUE INTELLIGENCE
              </div>
              <h1>See what changed.</h1>
              <p>Two Shopify snapshots. One clear comparison.</p>
            </div>
            <button className="button secondary demo-button" onClick={loadDemo}>
              <Sparkles size={15} /> Try the sample
            </button>
          </div>
          {error && (
            <div className="alert error" role="alert">
              <Info size={18} />
              <div>
                <strong>We couldn’t load that file.</strong>
                <p>{error}</p>
              </div>
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {synthetic && (
            <div className="demo-banner">
              <span className="demo-label">
                <Sparkles size={13} /> DEMO DATA
              </span>
              <span>
                You’re exploring Northline Goods, a fictional store. Replace
                either file to begin your own comparison.
              </span>
              <button
                onClick={() => setHelpOpen(true)}
                aria-label="View import instructions"
              >
                <ArrowUpRight size={16} />
              </button>
            </div>
          )}
          <div className="snapshots">
            <SnapshotCard
              side="before"
              snapshot={before}
              onChange={setBefore}
              onFile={upload}
              busy={busy === "before"}
            />
            <button
              className="swap-button"
              disabled={!before || !after || !!busy}
              aria-label="Swap before and after snapshots"
              title="Swap snapshots"
              onClick={() => {
                setBefore(after);
                setAfter(before);
                setNotice("Before and after snapshots swapped.");
              }}
            >
              <ArrowDownUp size={17} />
            </button>
            <SnapshotCard
              side="after"
              snapshot={after}
              onChange={setAfter}
              onFile={upload}
              busy={busy === "after"}
            />
          </div>
          {compare ? (
            <>
              <div className="summary-grid">
                <button
                  className={`summary-card total ${filter === "all" ? "selected" : ""}`}
                  onClick={() => setFilter("all")}
                >
                  <span>
                    Products compared <Layers3 size={15} />
                  </span>
                  <strong>
                    {compare.rows.length.toLocaleString()}
                    <span className="mini-bar">
                      {Array.from({ length: 9 }, (_, i) => (
                        <i
                          key={i}
                          style={{ height: `${11 + ((i * 7) % 19)}px` }}
                        />
                      ))}
                    </span>
                  </strong>
                  <small>
                    {compare.totals.before} before <ArrowRight size={11} />{" "}
                    {compare.totals.after} after
                  </small>
                </button>
                <button
                  className={`summary-card changed ${filter === "changed" ? "selected" : ""}`}
                  onClick={() => setFilter("changed")}
                >
                  <span>
                    Changed products <SlidersHorizontal size={15} />
                  </span>
                  <strong>
                    {compare.totals.changed.toLocaleString()}
                    <span className="stat-icon">
                      <ArrowDownUp size={21} />
                    </span>
                  </strong>
                  <small>Price, stock, variants & details</small>
                </button>
                <button
                  className={`summary-card added ${filter === "added" ? "selected" : ""}`}
                  onClick={() => setFilter("added")}
                >
                  <span>
                    Added to snapshot <Plus size={16} />
                  </span>
                  <strong>
                    {compare.totals.added.toLocaleString()}
                    <span className="stat-icon">
                      <Plus size={24} strokeWidth={1.5} />
                    </span>
                  </strong>
                  <small>Present only in the after file</small>
                </button>
                <button
                  className={`summary-card absent ${filter === "absent" ? "selected" : ""}`}
                  onClick={() => setFilter("absent")}
                >
                  <span>
                    Absent from snapshot <ArrowUpRight size={16} />
                  </span>
                  <strong>
                    {compare.totals.absent.toLocaleString()}
                    <span className="stat-icon">
                      <Package size={22} strokeWidth={1.4} />
                    </span>
                  </strong>
                  <small>Not present in the after file</small>
                </button>
              </div>
              {compare.warnings.map((warning) => (
                <div className="alert warning" key={warning}>
                  <Info size={17} />
                  <p>{warning}</p>
                </div>
              ))}
              <section
                className="results-panel"
                aria-label="Comparison results"
              >
                <div className="results-heading">
                  <div>
                    <h2>
                      The details make the difference
                      <span className="count-tag">{rows.length}</span>
                    </h2>
                    <p>Explore changes at product and variant level.</p>
                  </div>
                  <details className="export-dropdown">
                    <summary className="button secondary">
                      <Download size={15} /> Export report{" "}
                      <ChevronDown size={13} />
                    </summary>
                    <div className="dropdown-menu">
                      <button onClick={() => exportReport("csv")}>
                        <FileText size={16} />
                        <span>
                          Export CSV<small>For spreadsheets</small>
                        </span>
                      </button>
                      <button onClick={() => exportReport("html")}>
                        <FileText size={16} />
                        <span>
                          Export HTML<small>A standalone report</small>
                        </span>
                      </button>
                      <div className="dropdown-note">
                        Exports all {rows.length} filtered products.
                      </div>
                    </div>
                  </details>
                </div>
                <div className="filter-bar">
                  <div
                    className="filter-tabs"
                    role="group"
                    aria-label="Filter by change"
                  >
                    {(
                      [
                        "all",
                        "changed",
                        "price",
                        "stock",
                        "discount",
                        "added",
                        "absent",
                        "unchanged",
                      ] as Filter[]
                    ).map((type) => (
                      <button
                        key={type}
                        aria-pressed={filter === type}
                        onClick={() => setFilter(type)}
                        className={filter === type ? "current" : ""}
                      >
                        {filterLabels[type]}
                        <span>{counts[type]}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="table-tools">
                  <label className="search-field">
                    <Search size={16} />
                    <input
                      aria-label="Search products"
                      placeholder="Search products, IDs or SKUs…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                      <button
                        onClick={() => setSearch("")}
                        aria-label="Clear search"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </label>
                  <div className="select-tools">
                    <label>
                      <span className="visually-hidden">Filter by store</span>
                      <select
                        value={store}
                        onChange={(e) => setStore(e.target.value)}
                      >
                        <option value="all">All stores</option>
                        {stores.map((s) => (
                          <option value={s} key={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="sort-label">Sort:</span>
                      <select
                        aria-label="Sort products"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="changes">Most changes</option>
                        <option value="name">Product name</option>
                        <option value="store">Store name</option>
                      </select>
                    </label>
                  </div>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>What changed</th>
                        <th>Before</th>
                        <th>After</th>
                        <th>Availability</th>
                        <th>
                          <span className="visually-hidden">View details</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRows.map((row) => {
                        const currencyComparable =
                          row.before?.currency &&
                          row.before.currency === row.after?.currency;
                        const priceDelta =
                          currencyComparable &&
                          row.before?.priceMin !== null &&
                          row.after?.priceMin !== null &&
                          row.before &&
                          row.after
                            ? row.after.priceMin! - row.before.priceMin!
                            : null;
                        return (
                          <tr
                            key={row.key}
                            className={
                              row.status === "absent" ? "absent-row" : ""
                            }
                          >
                            <td>
                              <button
                                className="product-button"
                                onClick={() => setSelected(row)}
                              >
                                <span
                                  className={`product-icon ${row.product.productType.toLowerCase().replace(/[^a-z]/g, "")}`}
                                >
                                  <Package size={21} strokeWidth={1.2} />
                                </span>
                                <span className="product-name">
                                  <strong>{row.product.title}</strong>
                                  <small>
                                    {stores.length > 1
                                      ? row.product.store
                                      : row.product.productType || "Product"}
                                    <span>·</span>
                                    {row.product.id}
                                  </small>
                                </span>
                              </button>
                            </td>
                            <td>
                              <Tags row={row} />
                            </td>
                            <td className="price-cell before-price">
                              {formatPrice(row.before)}
                            </td>
                            <td className="price-cell">
                              <span>{formatPrice(row.after)}</span>
                              {priceDelta !== null && priceDelta !== 0 && (
                                <small
                                  className={`price-delta ${priceDelta < 0 ? "down" : "up"}`}
                                >
                                  {priceDelta < 0 ? (
                                    <ArrowDown size={11} />
                                  ) : (
                                    <ArrowUpRight size={11} />
                                  )}
                                  {formatMoney(
                                    Math.abs(priceDelta),
                                    row.after!.currency,
                                  )}
                                </small>
                              )}
                            </td>
                            <td>
                              <span
                                className={`stock-state ${row.after?.available === true ? "available" : row.after?.available === false ? "unavailable" : "unknown"}`}
                              >
                                <i />
                                {row.after
                                  ? stockLabel(row.after.available)
                                  : "Not in snapshot"}
                              </span>
                            </td>
                            <td>
                              <button
                                className="row-detail"
                                aria-label={`View details for ${row.product.title}`}
                                onClick={() => setSelected(row)}
                              >
                                <ArrowUpRight size={18} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {rows.length === 0 && (
                  <div className="empty-results">
                    <Search size={28} strokeWidth={1.4} />
                    <h3>No products match this view.</h3>
                    <p>Try another search or clear your filters.</p>
                    <button
                      className="button secondary"
                      onClick={() => {
                        setFilter("all");
                        setSearch("");
                        setStore("all");
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
                <div className="table-footer">
                  <span>
                    {rows.length
                      ? `Showing ${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, rows.length)} of ${rows.length} products`
                      : "0 matching products"}
                  </span>
                  <span className="table-hint">
                    <span /> Select a product to inspect every change
                  </span>
                  {pageCount > 1 && (
                    <div className="pagination">
                      <button
                        className="icon-button"
                        onClick={() => setPage(currentPage - 1)}
                        disabled={currentPage === 1}
                        aria-label="Previous page"
                      >
                        <ChevronLeft size={17} />
                      </button>
                      <span>
                        {currentPage} / {pageCount}
                      </span>
                      <button
                        className="icon-button"
                        onClick={() => setPage(currentPage + 1)}
                        disabled={currentPage === pageCount}
                        aria-label="Next page"
                      >
                        <ChevronRight size={17} />
                      </button>
                    </div>
                  )}
                </div>
              </section>
              <div className="footnote">
                <Info size={14} />
                <p>
                  “Added” and “absent” refer to these snapshots. Unknown values
                  stay unknown; prices are compared only in a matching, known
                  currency.
                </p>
              </div>
            </>
          ) : (
            <div className="empty-comparison">
              <div className="empty-comparison-icon">
                <Layers3 size={34} strokeWidth={1.3} />
              </div>
              <h2>Good comparisons start with two snapshots.</h2>
              <p>
                Add a before and after export to see what changed.
                <br />
                No account, connection or API key needed.
              </p>
              <button className="button primary" onClick={loadDemo}>
                <Sparkles size={16} /> Explore the sample
              </button>
              <button className="text-button" onClick={() => setHelpOpen(true)}>
                See the file format <ArrowRight size={14} />
              </button>
            </div>
          )}
          <footer className="page-footer">
            <span>
              <Leaf size={14} /> Small tool. Clearer decisions.
            </span>
            <div>
              <button
                onClick={() => {
                  if (before)
                    download(
                      serializeSnapshot(before),
                      "before-snapshot.json",
                      "application/json",
                    );
                }}
                disabled={!before}
              >
                Save before file
              </button>
              <span>·</span>
              <button
                onClick={() => {
                  if (after)
                    download(
                      serializeSnapshot(after),
                      "after-snapshot.json",
                      "application/json",
                    );
                }}
                disabled={!after}
              >
                Save after file
              </button>
              <span>·</span>
              <button onClick={() => setHelpOpen(true)}>How it works</button>
            </div>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <CheckCircle2 size={18} />
          <span>{notice}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      <dialog
        className="app-dialog help-dialog"
        ref={helpRef}
        aria-labelledby="help-title"
        onCancel={() => setHelpOpen(false)}
        onClose={() => setHelpOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setHelpOpen(false);
        }}
      >
        {helpOpen && <Help onClose={() => setHelpOpen(false)} />}
      </dialog>
      <dialog
        className="app-dialog detail-dialog"
        ref={detailRef}
        onCancel={() => setSelected(null)}
        onClose={() => setSelected(null)}
        onClick={(e) => {
          if (e.target === e.currentTarget) setSelected(null);
        }}
        aria-labelledby="detail-title"
      >
        {selected && (
          <Detail row={selected} onClose={() => setSelected(null)} />
        )}
      </dialog>
    </div>
  );
}
