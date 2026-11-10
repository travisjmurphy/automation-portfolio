import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createClip, createEmptyProject, exportCsv, exportMarkdown, exportProject, formatTime, importProject, parseTimestamp, parseTranscript, resolveClip } from "../lib/transcript.ts";

const srt = "1\n00:00:01,250 --> 00:00:03,500\nMaya: First line.\nA second line.\n\n2\n00:00:05,000 --> 00:00:08,750\nMaya: Last line.";
function fixture() {
  const source = parseTranscript(srt, "original-interview.srt");
  return { ...createEmptyProject(), title: "A test handoff", source, clips: [createClip(source, 0, 1, "clip-1", "The selected moment")] };
}

test("SRT imports preserve milliseconds, multiline dialogue, original text, and filename across BOM/CRLF", () => {
  const source = parseTranscript("\uFEFF" + srt.replaceAll("\n", "\r\n"), "interview.srt");
  assert.equal(source.cues.length, 2);
  assert.equal(source.cues[0].startMs, 1250);
  assert.equal(source.cues[0].endMs, 3500);
  assert.equal(source.cues[0].text, "Maya: First line.\nA second line.");
  assert.equal(source.cues[0].rawText, source.cues[0].text);
  assert.equal(source.filename, "interview.srt");
});

test("WebVTT supports short timestamps, IDs, settings, voice tags, and non-cue blocks", () => {
  const source = parseTranscript("WEBVTT\nKind: captions\n\nNOTE this is not dialogue\nmetadata\n\nSTYLE\n::cue { color: red; }\n\nintro\n00:01.250 --> 00:03.500 align:start\n<v Maya><b>A &amp; B</b></v>\n\n00:04.000 --> 00:06.000\nNext line.", "interview.vtt");
  assert.equal(source.format, "vtt");
  assert.equal(source.cues.length, 2);
  assert.equal(source.cues[0].text, "Maya: A & B");
  assert.equal(source.cues[0].rawText, "<v Maya><b>A &amp; B</b></v>");
  assert.equal(source.cues[0].startMs, 1250);
  assert.ok(source.warnings.length > 0);
});

test("timestamp conversion is millisecond-accurate and does not interpret frame counts", () => {
  assert.equal(parseTimestamp("01:02:03,004"), 3723004);
  assert.equal(formatTime(3723004), "01:02:03.004");
  assert.equal(parseTimestamp("00:00:01.2"), 1200);
  assert.throws(() => parseTimestamp("00:62:00,000"), /outside/);
  assert.throws(() => parseTimestamp("00:00:00:24"), /Invalid timestamp/);
});

test("bad cue timing, empty dialogue, and missing blank separators produce actionable errors", () => {
  assert.throws(() => parseTranscript("Just some words"), /no valid cue timing/);
  assert.throws(() => parseTranscript("1\n00:00:04,000 --> 00:00:03,000\nWrong"), /ends before/);
  assert.throws(() => parseTranscript("1\n00:00:00,000 --> 00:00:01,000"), /no subtitle text/);
  assert.throws(() => parseTranscript(srt.replace("\n\n2\n", "\n2\n")), /blank line between cues/);
  assert.throws(() => parseTranscript("WEBVTT\n\nNOTE only metadata", "empty.vtt"), /No subtitle cues/);
});

test("out-of-order cues are rejected rather than silently rearranged", () => {
  assert.throws(() => parseTranscript("1\n00:00:05,000 --> 00:00:08,000\nLater\n\n2\n00:00:01,000 --> 00:00:02,000\nEarlier"), /chronological/);
});

test("clip duration includes source pauses and backwards selection remains consecutive", () => {
  const project = fixture();
  const clip = createClip(project.source, 1, 0, "reverse");
  const resolved = resolveClip(project.source, clip);
  assert.deepEqual(clip.cueIds, ["cue-0001", "cue-0002"]);
  assert.equal(resolved.startMs, 1250);
  assert.equal(resolved.endMs, 8750);
  assert.equal(resolved.durationMs, 7500);
  assert.equal(resolved.sourceFilename, "original-interview.srt");
  assert.equal(resolved.text, "Maya: First line.\nA second line.\nMaya: Last line.");
});

test("overlapping cues use the latest end, including an earlier cue that finishes last", () => {
  const source = parseTranscript("1\n00:00:01,000 --> 00:00:10,000\nLong voice\n\n2\n00:00:02,000 --> 00:00:03,000\nShort voice");
  assert.match(source.warnings[0], /overlapping/);
  assert.equal(resolveClip(source, createClip(source, 0, 1, "overlap")).durationMs, 9000);
});

test("a project round trip preserves the source, selection order, and all editorial notes", () => {
  const original = fixture();
  Object.assign(original.clips[0], { hook: "Why it matters", broll: "A quiet desk", notes: "Hold the pause.\nKeep this line." });
  const restored = importProject(exportProject(original));
  assert.deepEqual(restored.source, original.source);
  assert.deepEqual(restored.clips, original.clips);
  assert.equal(restored.title, original.title);
});

test("corrupt and unsupported project imports cannot replace a valid workspace", () => {
  assert.throws(() => importProject("{broken"), /not valid JSON/);
  assert.throws(() => importProject('{"app":"something-else","version":1}'), /not a supported/);
  const missingCue = fixture(); missingCue.clips[0].cueIds = ["nonexistent"];
  assert.throws(() => importProject(JSON.stringify(missingCue)), /consecutive/);
  const reversed = fixture(); reversed.clips[0].cueIds.reverse();
  assert.throws(() => importProject(JSON.stringify(reversed)), /consecutive/);
  const duplicate = fixture(); duplicate.clips.push({ ...duplicate.clips[0] });
  assert.throws(() => importProject(JSON.stringify(duplicate)), /unique ID/);
});

test("project validation rejects impossible timestamps, duplicated cue IDs, and nonconsecutive selections", () => {
  const bad = fixture(); bad.source.cues[0].startMs = -1;
  assert.throws(() => importProject(JSON.stringify(bad)), /invalid cue timestamp/);
  const duplicates = fixture(); duplicates.source.cues[1].id = duplicates.source.cues[0].id;
  assert.throws(() => importProject(JSON.stringify(duplicates)), /unique ID/);
  const separated = fixture();
  separated.source.cues.push({ id: "cue-0003", startMs: 9000, endMs: 10000, text: "Third", rawText: "Third" });
  separated.clips[0].cueIds = ["cue-0001", "cue-0003"];
  assert.throws(() => importProject(JSON.stringify(separated)), /consecutive/);
});

test("CSV keeps quoted multiline dialogue and protects user-controlled spreadsheet formulas", () => {
  const project = fixture();
  project.clips[0].title = '=HYPERLINK("https://example.invalid")';
  project.clips[0].notes = "First, then\n\"hold\"";
  const csv = exportCsv(project);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.invalid"")"'));
  assert.ok(csv.includes('"First, then\n""hold"""'));
  assert.ok(csv.includes('"00:00:01.250","00:00:08.750","7.500"'));
  assert.ok(csv.includes('"Maya: First line.\nA second line.\nMaya: Last line."'));
});

test("Markdown exports precise source timestamps, timing limitations, and escaped user content", () => {
  const project = fixture();
  project.title = "<script>alert(1)</script>";
  project.clips[0].notes = "[Unsafe-looking](javascript:alert(1))";
  const markdown = exportMarkdown(project);
  assert.ok(!markdown.includes("<script>"));
  assert.ok(!markdown.includes("](javascript:"));
  assert.match(markdown, /original\\-interview\\.srt/);
  assert.ok(markdown.includes("00:00:01.250"));
  assert.ok(markdown.includes("7.500s"));
  assert.ok(markdown.includes("including pauses"));
});

test("the bundled SRT and VTT examples contain equivalent fictional dialogue and exact timings", () => {
  const a = parseTranscript(readFileSync(new URL("../public/samples/a-smaller-studio.srt", import.meta.url), "utf8"), "sample.srt");
  const b = parseTranscript(readFileSync(new URL("../public/samples/a-smaller-studio.vtt", import.meta.url), "utf8"), "sample.vtt");
  assert.equal(a.cues.length, 20);
  assert.deepEqual(a.cues, b.cues);
  assert.equal(a.cues.at(-1).endMs, 184500);
});

test("the downloadable example backup restores to the same handoff data", () => {
  const project = importProject(readFileSync(new URL("../public/samples/example.clipplan.json", import.meta.url), "utf8"));
  assert.equal(project.sample, true);
  assert.equal(project.clips.length, 2);
  const times = project.clips.map(clip => resolveClip(project.source, clip));
  assert.deepEqual(times.map(clip => [clip.startMs, clip.endMs]), [[8000, 35800], [81000, 109400]]);
  assert.equal(times.reduce((sum, clip) => sum + clip.durationMs, 0), 56200);
});
