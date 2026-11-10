import { CITIES, parseDataset } from "./permits";

const descriptions = [
  "Interior alteration to an existing commercial unit. Illustrative record only.",
  "Construction of a new multi-unit residential building. Illustrative record only.",
  "Addition to an existing warehouse. Illustrative record only.",
  "Renovation of an existing building envelope. Illustrative record only.",
];

export const sampleEnvelope = {
  metadata: {
    name: "Canadian permits · fictional sample", synthetic: true, retrievedAt: null,
    completeness: "38 fictional records, two per supported municipality. Created only to demonstrate filters, missing values and date semantics. No real project or municipal coverage is represented.",
  },
  records: CITIES.flatMap(([city, provinceCode], cityIndex) => [0, 1].map((offset) => ({
    synthetic: true,
    permitNumber: `DEMO-${city.toUpperCase().replace(/\s/g, "").slice(0, 3)}-${String(offset + 1).padStart(3, "0")}`,
    city, provinceCode,
    permitType: ["Commercial", "Residential", "Industrial"][(cityIndex + offset) % 3],
    workType: ["Renovation", "New Building", "Addition"][(cityIndex + offset) % 3],
    status: ["Issued", "Under review", "Completed", null][(cityIndex + offset) % 4],
    issuedDate: city === "Delta" ? null : `2026-10-${String(28 - ((cityIndex * 2 + offset) % 26)).padStart(2, "0")}`,
    ...(city === "Delta" ? { completedDate: "2026-10-19" } : {}),
    ...(city === "Red Deer" ? { permitDate: `2026-10-${offset ? "18" : "24"}` } : {}),
    estimatedValueCad: ["Winnipeg", "Delta"].includes(city) || (cityIndex + offset) % 6 === 0 ? null : [85000, 420000, 1250000, 275000, 3600000, 190000][(cityIndex * 2 + offset) % 6],
    project_address: null,
    work_description: descriptions[(cityIndex + offset) % descriptions.length],
    contractor_company: null,
    residentialUnits: offset === 0 ? 0 : null,
    source: "Synthetic demonstration data — not a municipal record",
    licence: "CC0-1.0 (fictional sample only)",
  }))),
};

export const makeSample = () => parseDataset(JSON.stringify(sampleEnvelope), "sample-permits.json", "2026-11-10T00:00:00Z");
