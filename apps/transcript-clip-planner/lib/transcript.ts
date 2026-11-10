/** Deterministic subtitle parsing, selection, and handoff formats. No network access. */
export type Cue = { id: string; startMs: number; endMs: number; text: string; rawText: string };
export type TranscriptSource = { filename: string; format: "srt" | "vtt"; cues: Cue[]; warnings: string[] };
export type Clip = { id: string; title: string; cueIds: string[]; hook: string; broll: string; notes: string };
export type Project = { app: "transcript-clip-planner"; version: 1; title: string; source: TranscriptSource | null; clips: Clip[]; updatedAt: string; sample: boolean };
export type ResolvedClip = Clip & { startMs: number; endMs: number; durationMs: number; text: string; sourceFilename: string; cues: Cue[] };
export const MAX_CUES = 5000;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
// A backup carries original + display text and notes; it can be larger than its source file.
export const MAX_PROJECT_BYTES = 40 * 1024 * 1024;

export class TranscriptError extends Error {
  constructor(message: string) { super(message); this.name = "TranscriptError"; }
}

export function parseTimestamp(input: string): number {
  const match = input.trim().match(/^(?:(\d{2,}):)?(\d{2}):(\d{2})[.,](\d{1,3})$/);
  if (!match) throw new TranscriptError(`Invalid timestamp “${input}”. Use HH:MM:SS,mmm (SRT) or MM:SS.mmm (VTT).`);
  const hours = Number(match[1] ?? 0), minutes = Number(match[2]), seconds = Number(match[3]);
  if (minutes > 59 || seconds > 59 || hours > 999) throw new TranscriptError(`Timestamp “${input}” is outside the supported time range.`);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000 + Number(match[4].padEnd(3, "0"));
}

export function formatTime(ms: number, precise = true): string {
  const value = Math.max(0, Math.round(ms));
  const hours = Math.floor(value / 3600000), minutes = Math.floor(value / 60000) % 60, seconds = Math.floor(value / 1000) % 60;
  const base = [hours, minutes, seconds].map(n => String(n).padStart(2, "0")).join(":");
  return precise ? `${base}.${String(value % 1000).padStart(3, "0")}` : base;
}

export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60), rest = seconds % 60;
  return `${minutes}m ${String(rest).padStart(2, "0")}s`;
}

function plainText(raw: string): string {
  return raw
    .replace(/<v(?:\.[^\s>]*)?\s+([^>]+)>/gi, "$1: ")
    .replace(/<[^>]*>/g, "")
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp);/g, entity => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " " })[entity] ?? entity)
    .trim();
}

export function parseTranscript(input: string, filename = "transcript.srt"): TranscriptSource {
  if (new TextEncoder().encode(input).byteLength > MAX_FILE_BYTES) throw new TranscriptError("This file is too large. Please use a transcript smaller than 5 MB.");
  const normalized = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (!normalized) throw new TranscriptError("The transcript is empty. Choose an SRT or VTT file with timestamped cues.");
  const isVtt = /^WEBVTT(?:\s|$)/.test(normalized) || /\.vtt$/i.test(filename);
  const format: TranscriptSource["format"] = isVtt ? "vtt" : "srt";
  const blocks = normalized.split(/\n[ \t]*\n+/);
  const cues: Cue[] = [], warnings: string[] = [];
  let overlaps = 0, styling = false, furthestEnd = -1;
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const block = blocks[blockIndex].trim();
    if (!block) continue;
    if (isVtt && /^(WEBVTT(?:\s|$)|NOTE(?:\s|$)|STYLE(?:\s|$)|REGION(?:\s|$))/.test(block)) continue;
    const lines = block.split("\n");
    const timingIndex = lines.findIndex(line => line.includes("-->"));
    if (timingIndex < 0 || timingIndex > 1) throw new TranscriptError(`Block ${blockIndex + 1} has no valid cue timing. Each cue needs a start --> end line and a blank line after it.`);
    const timing = lines[timingIndex].trim().match(/^(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/);
    if (!timing) throw new TranscriptError(`Block ${blockIndex + 1} has an invalid timing line.`);
    let startMs: number, endMs: number;
    try { startMs = parseTimestamp(timing[1]); endMs = parseTimestamp(timing[2]); }
    catch (error) { throw new TranscriptError(`Block ${blockIndex + 1}: ${(error as Error).message}`); }
    if (endMs <= startMs) throw new TranscriptError(`Block ${blockIndex + 1} ends before it starts or has zero duration.`);
    if (cues.length && startMs < cues[cues.length - 1].startMs) throw new TranscriptError(`Block ${blockIndex + 1} is out of order. Cues must be in chronological order.`);
    const rawText = lines.slice(timingIndex + 1).join("\n").trim();
    if (rawText.includes("-->")) throw new TranscriptError(`Block ${blockIndex + 1} contains more than one timing line. Add a blank line between cues.`);
    const text = plainText(rawText);
    if (!text) throw new TranscriptError(`Block ${blockIndex + 1} has no subtitle text.`);
    if (text.length > 20000) throw new TranscriptError(`Block ${blockIndex + 1} is too long. Each cue must be under 20,000 characters.`);
    if (startMs < furthestEnd) overlaps++;
    furthestEnd = Math.max(furthestEnd, endMs);
    if (rawText !== text) styling = true;
    cues.push({ id: `cue-${String(cues.length + 1).padStart(4, "0")}`, startMs, endMs, text, rawText });
    if (cues.length > MAX_CUES) throw new TranscriptError(`This transcript has more than ${MAX_CUES.toLocaleString()} cues. Split it into smaller source files.`);
  }
  if (!cues.length) throw new TranscriptError("No subtitle cues were found. Plain text without timestamps cannot create a timed clip plan.");
  if (overlaps) warnings.push(`${overlaps} overlapping cue${overlaps === 1 ? "" : "s"} found. A clip spans its earliest in-point to its latest out-point.`);
  if (styling) warnings.push("Subtitle presentation tags are removed from the reading view. Original cue text is preserved in the project JSON.");
  return { filename: filename.slice(0, 255), format, cues, warnings };
}

export function createEmptyProject(): Project {
  return { app: "transcript-clip-planner", version: 1, title: "Untitled clip plan", source: null, clips: [], updatedAt: new Date().toISOString(), sample: false };
}

export function createClip(source: TranscriptSource, startIndex: number, endIndex: number, id: string, title = "Untitled clip"): Clip {
  const first = Math.min(startIndex, endIndex), last = Math.max(startIndex, endIndex);
  if (!Number.isInteger(first) || !Number.isInteger(last) || first < 0 || last >= source.cues.length) throw new TranscriptError("Select a valid, consecutive range of subtitle cues.");
  return { id, title, cueIds: source.cues.slice(first, last + 1).map(cue => cue.id), hook: "", broll: "", notes: "" };
}

export function resolveClip(source: TranscriptSource, clip: Clip): ResolvedClip {
  const lookup = new Map(source.cues.map(cue => [cue.id, cue]));
  const cues = clip.cueIds.map(id => lookup.get(id));
  if (!cues.length || cues.some(cue => !cue)) throw new TranscriptError("This clip references cues that are missing from the source.");
  const resolved = cues as Cue[];
  const startMs = Math.min(...resolved.map(c => c.startMs)), endMs = Math.max(...resolved.map(c => c.endMs));
  return { ...clip, cues: resolved, startMs, endMs, durationMs: endMs - startMs, text: resolved.map(c => c.text).join("\n"), sourceFilename: source.filename };
}

function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function string(value: unknown, field: string, max = 10000): string {
  if (typeof value !== "string" || value.length > max) throw new TranscriptError(`Project field “${field}” must be text under ${max.toLocaleString()} characters.`);
  return value;
}
function timestamp(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 3600000000) throw new TranscriptError("A project contains an invalid cue timestamp.");
  return value;
}

/** Reconstruct only supported fields; never trust timings or HTML from an imported plan. */
export function importProject(input: string): Project {
  if (new TextEncoder().encode(input).byteLength > MAX_PROJECT_BYTES) throw new TranscriptError("Project files must be smaller than 40 MB.");
  let parsed: unknown;
  try { parsed = JSON.parse(input); } catch { throw new TranscriptError("This is not valid JSON. Import a project exported by Transcript Clip Planner."); }
  if (!object(parsed) || parsed.app !== "transcript-clip-planner" || parsed.version !== 1) throw new TranscriptError("This is not a supported Transcript Clip Planner project (version 1).");
  let source: TranscriptSource | null = null;
  if (parsed.source !== null) {
    if (!object(parsed.source) || !Array.isArray(parsed.source.cues) || !parsed.source.cues.length || parsed.source.cues.length > MAX_CUES) throw new TranscriptError("The project has an invalid source transcript.");
    const raw = parsed.source;
    if (raw.format !== "srt" && raw.format !== "vtt") throw new TranscriptError("The project source format must be SRT or VTT.");
    const seen = new Set<string>();
    const cues: Cue[] = (raw.cues as unknown[]).map((item: unknown) => {
      if (!object(item)) throw new TranscriptError("The project contains an invalid cue.");
      const id = string(item.id, "cue ID", 100), startMs = timestamp(item.startMs), endMs = timestamp(item.endMs);
      if (!id || seen.has(id)) throw new TranscriptError("Every cue needs a unique ID.");
      seen.add(id);
      if (endMs <= startMs) throw new TranscriptError("A project cue has an invalid in/out range.");
      const text = string(item.text, "cue text", 20000), rawText = string(item.rawText ?? item.text, "original cue text", 30000);
      if (!text.trim()) throw new TranscriptError("A project cue is empty.");
      return { id, startMs, endMs, text, rawText };
    });
    if (cues.some((cue, index) => index > 0 && cue.startMs < cues[index - 1].startMs)) throw new TranscriptError("Project cues must be in chronological order.");
    const warnings = Array.isArray(raw.warnings) ? raw.warnings.slice(0, 10).map(w => string(w, "warning", 1000)) : [];
    source = { filename: string(raw.filename, "filename", 255), format: raw.format, cues, warnings };
  }
  if (!Array.isArray(parsed.clips) || parsed.clips.length > 200) throw new TranscriptError("A project can contain up to 200 clips.");
  const usedIds = new Set<string>();
  const positions = new Map(source?.cues.map((cue, index) => [cue.id, index]) ?? []);
  const clips: Clip[] = parsed.clips.map((item: unknown) => {
    if (!object(item) || !source || !Array.isArray(item.cueIds) || !item.cueIds.length || item.cueIds.length > MAX_CUES) throw new TranscriptError("The project contains an invalid clip.");
    const id = string(item.id, "clip ID", 100);
    if (!id || usedIds.has(id)) throw new TranscriptError("Every clip needs a unique ID.");
    usedIds.add(id);
    const cueIds = item.cueIds.map(cueId => string(cueId, "cue reference", 100));
    const cuePositions = cueIds.map(cueId => positions.get(cueId));
    if (cuePositions.some((pos, index) => pos === undefined || (index > 0 && pos !== (cuePositions[index - 1] as number) + 1))) throw new TranscriptError("Clip selections must reference consecutive source cues in their original order.");
    return { id, cueIds, title: string(item.title, "clip title", 160), hook: string(item.hook, "hook"), broll: string(item.broll, "B-roll notes"), notes: string(item.notes, "editor notes") };
  });
  return { app: "transcript-clip-planner", version: 1, title: string(parsed.title, "project title", 160), source, clips, updatedAt: new Date().toISOString(), sample: parsed.sample === true };
}

export function exportProject(project: Project): string { return JSON.stringify(project, null, 2); }

function csvCell(value: string | number): string {
  const text = String(value);
  // Neutralize spreadsheet formulas in user-supplied titles, notes, and transcript text.
  const safe = /^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function exportCsv(project: Project): string {
  const rows: (string | number)[][] = [["Order", "Title", "Source filename", "In", "Out", "Duration seconds", "Cue IDs", "Spoken text", "Hook / angle", "B-roll", "Editor notes"]];
  if (project.source) for (const [index, clip] of project.clips.entries()) {
    const c = resolveClip(project.source, clip);
    rows.push([index + 1, c.title, c.sourceFilename, formatTime(c.startMs), formatTime(c.endMs), (c.durationMs / 1000).toFixed(3), c.cueIds.join("; "), c.text, c.hook, c.broll, c.notes]);
  }
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(",")).join("\r\n");
}

function mdLine(value: string): string { return value.replace(/[\\`*_{}\[\]()#+.!|<>-]/g, "\\$&").replace(/\r?\n/g, " "); }
function quoted(value: string): string { return value.split(/\r?\n/).map(line => `> ${mdLine(line)}`).join("\n"); }

export function exportMarkdown(project: Project): string {
  const clips = project.source ? project.clips.map(clip => resolveClip(project.source!, clip)) : [];
  const lines = [`# ${mdLine(project.title || "Untitled clip plan")}`, "", "Created with Transcript Clip Planner.", "", `- Source: ${mdLine(project.source?.filename ?? "No source")}`, `- Clips: ${clips.length}`, `- Planned runtime: ${formatDuration(clips.reduce((sum, clip) => sum + clip.durationMs, 0))}`, "", "Timing uses source subtitle cue boundaries, including pauses between cues. It is not word-level timing or an edit-ready video timeline. Verify cut points against the original media.", ""];
  if (project.sample) lines.push("**Fictional sample:** This interview and clip plan are demonstration material.", "");
  clips.forEach((clip, index) => {
    lines.push(`## ${index + 1}. ${mdLine(clip.title || "Untitled clip")}`, "", `**Source:** ${mdLine(clip.sourceFilename)}  `, `**In:** ${formatTime(clip.startMs)} · **Out:** ${formatTime(clip.endMs)} · **Duration:** ${(clip.durationMs / 1000).toFixed(3)}s`, "", "### Spoken text", "", quoted(clip.text), "", "### Hook / angle", "", quoted(clip.hook || "Not specified"), "", "### B-roll", "", quoted(clip.broll || "Not specified"), "", "### Editor notes", "", quoted(clip.notes || "Not specified"), "", "---", "");
  });
  return lines.join("\n");
}
