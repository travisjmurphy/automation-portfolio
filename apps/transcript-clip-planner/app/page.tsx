"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpRight, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Download, FileJson2, FileText, FolderOpen, CodeXml, HelpCircle, Layers3, ListOrdered, LockKeyhole, Pencil, Plus, RotateCcw, Scissors, Search, Trash2, Upload, X } from "lucide-react";
import { createClip, createEmptyProject, exportCsv, exportMarkdown, exportProject, formatDuration, formatTime, importProject, MAX_FILE_BYTES, MAX_PROJECT_BYTES, parseTranscript, resolveClip, type Clip, type Project, type TranscriptSource } from "@/lib/transcript";
import { createSampleProject } from "@/lib/sample";

const STORAGE_KEY = "transcript-clip-planner:project:v1";
const fileSlug = (name: string) => (name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "clip-plan");

function download(name: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className={`modal ${wide ? "modal-wide" : ""}`} aria-labelledby={titleId} onCancel={onClose} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="modal-header"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20}/></button></div>
    {children}
  </dialog>;
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const term = query.trim();
  const parts: ReactNode[] = [];
  let cursor = 0, index = text.toLowerCase().indexOf(term.toLowerCase());
  while (index !== -1) {
    parts.push(text.slice(cursor, index), <mark key={index}>{text.slice(index, index + term.length)}</mark>);
    cursor = index + term.length;
    index = text.toLowerCase().indexOf(term.toLowerCase(), cursor);
  }
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}

export default function Home() {
  const [project, setProject] = useState<Project>(createSampleProject);
  const [ready, setReady] = useState(false);
  const [saveState, setSaveState] = useState("Saved on this device");
  const [recovery, setRecovery] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ anchor: number; focus: number } | null>(null);
  const [query, setQuery] = useState("");
  const [matchCursor, setMatchCursor] = useState(-1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modal, setModal] = useState<"import" | "help" | "reset" | "sample" | "restore" | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [importTab, setImportTab] = useState<"file" | "paste">("file");
  const [candidate, setCandidate] = useState<TranscriptSource | null>(null);
  const [pendingProject, setPendingProject] = useState<Project | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [pasteName, setPasteName] = useState("pasted-transcript.srt");
  const [importError, setImportError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState("");
  const [deleted, setDeleted] = useState<{ clip: Clip; index: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const projectFileRef = useRef<HTMLInputElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (!active) return;
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          try { setProject(importProject(saved)); }
          catch { setRecovery(saved); setSaveState("Recovery copy available"); }
        }
      } catch { setSaveState("Browser storage unavailable"); }
      setReady(true);
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!ready || recovery) return;
    const timer = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, exportProject(project)); setSaveState("Saved on this device"); }
      catch { setSaveState("Couldn’t autosave — export a backup"); }
    }, 350);
    return () => clearTimeout(timer);
  }, [project, ready, recovery]);
  useEffect(() => {
    const onPointer = (event: PointerEvent) => { if (exportRef.current && !exportRef.current.contains(event.target as Node)) setExportOpen(false); };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, []);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  const flash = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 5500);
  }, []);
  const update = useCallback((fn: (previous: Project) => Project) => {
    setProject(previous => ({ ...fn(previous), updatedAt: new Date().toISOString() }));
    setSaveState("Saving…");
  }, []);

  const source = project.source;
  const resolvedClips = useMemo(() => source ? project.clips.map(clip => resolveClip(source, clip)) : [], [project.clips, source]);
  const totalDuration = resolvedClips.reduce((sum, clip) => sum + clip.durationMs, 0);
  const sourceDuration = source ? Math.max(...source.cues.map(cue => cue.endMs)) : 0;
  const selectionFirst = selection ? Math.min(selection.anchor, selection.focus) : -1;
  const selectionLast = selection ? Math.max(selection.anchor, selection.focus) : -1;
  const selectedCues = source && selection ? source.cues.slice(selectionFirst, selectionLast + 1) : [];
  const selectedDuration = selectedCues.length ? Math.max(...selectedCues.map(cue => cue.endMs)) - selectedCues[0].startMs : 0;
  const matches = useMemo(() => source && query.trim() ? source.cues.flatMap((cue, index) => cue.text.toLowerCase().includes(query.trim().toLowerCase()) ? [index] : []) : [], [source, query]);
  const usedCueIds = useMemo(() => new Set(project.clips.flatMap(clip => clip.cueIds)), [project.clips]);

  function openImport() { setCandidate(null); setImportError(""); setPasteText(""); setModal("import"); }
  function resetTransient() { setSelection(null); setQuery(""); setExpanded(null); setDeleted(null); setRecovery(null); }
  function replaceProject(next: Project, message: string) { setProject(next); resetTransient(); setModal(null); setSaveState("Saving…"); flash(message); }
  async function readTranscript(file: File) {
    setImportError(""); setCandidate(null); setDragging(false);
    try {
      if (file.size > MAX_FILE_BYTES) throw new Error("Please choose a transcript smaller than 5 MB.");
      if (!/\.(srt|vtt)$/i.test(file.name)) throw new Error("Choose an .srt or .vtt subtitle file. You can also paste timestamped text.");
      setCandidate(parseTranscript(await file.text(), file.name));
    } catch (error) { setImportError((error as Error).message); setCandidate(null); }
  }
  async function readProject(file: File) {
    try {
      if (file.size > MAX_PROJECT_BYTES) throw new Error("Please choose a project smaller than 40 MB.");
      const restored = importProject(await file.text());
      setPendingProject(restored); setModal("restore");
    } catch (error) { flash((error as Error).message); }
  }
  function applyTranscript() {
    if (!candidate) return;
    replaceProject({ ...createEmptyProject(), title: candidate.filename.replace(/\.(srt|vtt)$/i, ""), source: candidate }, "Transcript imported. Choose your first clip.");
  }
  function selectCue(index: number) {
    setSelection(previous => previous?.anchor === index && previous.focus === index ? null : previous ? { anchor: previous.anchor, focus: index } : { anchor: index, focus: index });
  }
  function addClip() {
    if (!source || !selection) return;
    if (project.clips.length >= 200) { flash("This plan has reached its 200-clip limit. Export it and start a new plan."); return; }
    const id = globalThis.crypto?.randomUUID?.() ?? `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const clip = createClip(source, selectionFirst, selectionLast, id, `Clip ${project.clips.length + 1}`);
    update(previous => ({ ...previous, clips: [...previous.clips, clip] }));
    setExpanded(id); setSelection(null);
    flash("Clip added. Give it a title and a little direction.");
    setTimeout(() => document.getElementById(`clip-${id}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" }), 80);
  }
  function editClip(id: string, field: "title" | "hook" | "broll" | "notes", value: string) { update(previous => ({ ...previous, clips: previous.clips.map(clip => clip.id === id ? { ...clip, [field]: value } : clip) })); }
  function moveClip(index: number, direction: -1 | 1) {
    const destination = index + direction;
    if (destination < 0 || destination >= project.clips.length) return;
    update(previous => { const clips = [...previous.clips]; [clips[index], clips[destination]] = [clips[destination], clips[index]]; return { ...previous, clips }; });
    flash(`Clip moved ${direction === -1 ? "earlier" : "later"} in the plan.`);
  }
  function removeClip(id: string) {
    const index = project.clips.findIndex(clip => clip.id === id), clip = project.clips[index];
    if (!clip) return;
    setDeleted({ clip, index });
    update(previous => ({ ...previous, clips: previous.clips.filter(item => item.id !== id) }));
    flash("Clip removed from the plan.");
  }
  function undoDelete() {
    if (!deleted) return;
    update(previous => { const clips = [...previous.clips]; clips.splice(Math.min(deleted.index, clips.length), 0, deleted.clip); return { ...previous, clips }; });
    setDeleted(null); flash("Clip restored.");
  }
  function showSource(clip: Clip) {
    if (!source) return;
    const start = source.cues.findIndex(cue => cue.id === clip.cueIds[0]);
    setSelection({ anchor: start, focus: start + clip.cueIds.length - 1 });
    document.getElementById(`cue-${start}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  function navigateMatch(direction: -1 | 1) {
    if (!matches.length) return;
    const next = matchCursor < 0 ? (direction === 1 ? 0 : matches.length - 1) : (matchCursor + direction + matches.length) % matches.length;
    setMatchCursor(next);
    document.getElementById(`cue-${matches[next]}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  }
  function exportFile(format: "md" | "csv" | "json") {
    const name = fileSlug(project.title);
    if (format === "json") download(`${name}.clipplan.json`, exportProject(project), "application/json;charset=utf-8");
    else if (format === "csv") download(`${name}-handoff.csv`, exportCsv(project), "text/csv;charset=utf-8");
    else download(`${name}-handoff.md`, exportMarkdown(project), "text/markdown;charset=utf-8");
    setExportOpen(false); flash(format === "json" ? "Project downloaded. Import it later to keep editing." : "Editor handoff downloaded.");
  }

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#workspace" aria-label="Transcript Clip Planner home"><span className="brand-mark"><Scissors size={20} strokeWidth={1.8}/></span><span>CUTLIST<span className="brand-byline">by Travis Murphy</span></span></a>
      <nav className="topnav" aria-label="Main"><span className="workspace-tab"><span/>Workspace</span><button className="nav-button" onClick={() => setModal("help")}><HelpCircle size={16}/>How it works</button><a className="nav-github" href="https://github.com/travisjmurphy/automation-portfolio/tree/main/apps/transcript-clip-planner" target="_blank" rel="noreferrer" aria-label="View source code on GitHub"><CodeXml size={19}/><span>GitHub</span><ArrowUpRight size={13}/></a></nav>
    </header>
    <main className="main-shell" id="workspace">
      <section className="page-heading">
        <div><div className="eyebrow"><span/> THE EDIT STARTS HERE</div><h1>Transcript Clip Planner<span className="title-period">.</span></h1><p>Find the good parts. Give your editor a clear plan.</p></div>
        <div className="heading-actions"><div className="save-status" aria-live="polite"><span className={saveState.includes("Couldn’t") ? "status-dot status-error" : "status-dot"}/>{ready ? saveState : "Opening workspace…"}</div><div className="export-wrap" ref={exportRef}><button className="button button-dark" onClick={() => setExportOpen(!exportOpen)} aria-expanded={exportOpen} aria-controls="export-options"><Download size={16}/>Export handoff<ChevronDown size={15}/></button>{exportOpen && <div className="export-menu" id="export-options"><div className="menu-label">FOR YOUR EDITOR</div><button disabled={!project.clips.length} onClick={() => exportFile("md")}><FileText size={17}/><span>Markdown brief<small>Readable notes + selected dialogue</small></span></button><button disabled={!project.clips.length} onClick={() => exportFile("csv")}><ListOrdered size={17}/><span>CSV clip list<small>One row per clip, precise timestamps</small></span></button><div className="menu-rule"/><div className="menu-label">KEEP WORKING LATER</div><button onClick={() => exportFile("json")}><FileJson2 size={17}/><span>Project backup<small>Source, clips, and notes in JSON</small></span></button></div>}</div></div>
      </section>
      {recovery && <div className="recovery-banner" role="alert"><div><strong>A saved workspace needs recovery.</strong><p>Download its original data before replacing it. Autosave is paused to protect that copy.</p></div><button className="button button-light" onClick={() => download("recovered-workspace.json", recovery, "application/json")}>Download recovery copy</button></div>}
      <div className="project-bar"><div className="project-title-wrap"><span className="project-icon"><FolderOpen size={18}/></span><label className="sr-only" htmlFor="project-title">Project title</label><input id="project-title" value={project.title} maxLength={160} onChange={e => update(previous => ({ ...previous, title: e.target.value }))} placeholder="Name your clip plan"/><Pencil size={13} className="project-pencil"/>{project.sample && <span className="sample-badge">SAMPLE PROJECT</span>}</div><div className="project-controls"><button className="small-button" onClick={() => projectFileRef.current?.click()}><FileJson2 size={14}/><span>Open project</span></button><button className="small-button" onClick={() => setModal("sample")}><Layers3 size={14}/><span>Load sample</span></button><button className="small-button reset-button" onClick={() => setModal("reset")} title="Start a new, empty project"><RotateCcw size={14}/><span>New</span></button></div><input className="sr-only" tabIndex={-1} type="file" accept=".json" ref={projectFileRef} aria-label="Import saved project" onChange={e => { const file = e.target.files?.[0]; if (file) void readProject(file); e.target.value = ""; }}/></div>
      <div className="workspace-grid">
        <section className="work-panel source-panel" aria-labelledby="source-heading">
          <div className="panel-heading"><div className="panel-title"><span className="step-number">01</span><div><h2 id="source-heading">Source transcript</h2><p>Select a start cue, then an end cue.</p></div></div><button className="button button-light button-sm" onClick={openImport}><Upload size={14}/>Import transcript</button></div>
          {source ? <>
            <div className="source-meta"><span className="file-symbol"><FileText size={20}/></span><div><strong title={source.filename}>{source.filename}</strong><span>{source.format.toUpperCase()}<span className="meta-dot">·</span>{source.cues.length} cues<span className="meta-dot">·</span>{formatTime(sourceDuration, false)} end time</span></div>{project.sample && <span className="fictional-tag">Fictional interview</span>}</div>
            <div className="search-row"><Search size={16}/><label className="sr-only" htmlFor="transcript-search">Search transcript</label><input id="transcript-search" type="search" value={query} placeholder="Find a word or phrase…" onChange={e => { setQuery(e.target.value); setMatchCursor(-1); }}/>{query && <div className="search-results"><span>{matches.length} match{matches.length !== 1 ? "es" : ""}</span><button className="icon-button" disabled={!matches.length} aria-label="Previous search match" onClick={() => navigateMatch(-1)}><ChevronLeft size={15}/></button><button className="icon-button" disabled={!matches.length} aria-label="Next search match" onClick={() => navigateMatch(1)}><ChevronRight size={15}/></button></div>}</div>
            {source.warnings.length > 0 && <details className="source-warnings"><summary>{source.warnings.length} import note{source.warnings.length !== 1 ? "s" : ""}</summary>{source.warnings.map(warning => <p key={warning}>{warning}</p>)}</details>}
            <div className="transcript-scroll" aria-label="Transcript cues"><div className="cue-column-labels"><span>IN / OUT</span><span>SPOKEN TEXT</span></div>{source.cues.map((cue, index) => {
              const selected = selection !== null && index >= selectionFirst && index <= selectionLast;
              const isIn = selected && index === selectionFirst, isOut = selected && index === selectionLast;
              const colon = cue.text.indexOf(":"); const speaker = colon > 0 && colon < 45 ? cue.text.slice(0, colon) : null;
              const words = speaker ? cue.text.slice(colon + 1).trimStart() : cue.text;
              return <button key={cue.id} id={`cue-${index}`} type="button" className={`cue-row ${selected ? "selected" : ""} ${usedCueIds.has(cue.id) ? "used" : ""}`} aria-pressed={selected} aria-label={`Cue ${index + 1}, ${formatTime(cue.startMs)} to ${formatTime(cue.endMs)}. ${cue.text}`} onClick={() => selectCue(index)} onKeyDown={e => { if (e.key === "Escape") setSelection(null); if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); addClip(); } }}><span className="cue-time"><span>{formatTime(cue.startMs).slice(0, -4)}</span><small>{formatTime(cue.endMs).slice(0, -4)}</small><span className="cue-indicator">{isIn ? "IN" : isOut ? "OUT" : usedCueIds.has(cue.id) ? <span title="Used in a clip">●</span> : String(index + 1).padStart(2, "0")}</span></span><span className="cue-content">{speaker && <span className={`speaker ${speaker === "Interviewer" ? "speaker-secondary" : ""}`}><Highlight text={speaker} query={query}/></span>}<span className="spoken-text"><Highlight text={words} query={query}/></span></span><span className="cue-check">{selected ? <Check size={14}/> : <Plus size={13}/>}</span></button>;
            })}<div className="transcript-end"><span/>END OF TRANSCRIPT<span/></div></div>
            <div className={`selection-bar ${selection ? "has-selection" : ""}`}><div><span className="selection-kicker">{selection ? `${selectedCues.length} CUE${selectedCues.length === 1 ? "" : "S"} SELECTED` : "YOUR NEXT CLIP"}</span><strong>{selection ? <>{formatDuration(selectedDuration)}<span> · {formatTime(selectedCues[0].startMs, false)} – {formatTime(Math.max(...selectedCues.map(c => c.endMs)), false)}</span></> : "A good moment is a click away."}</strong></div><div className="selection-actions">{selection && <button className="clear-selection" onClick={() => setSelection(null)} aria-label="Clear cue selection"><X size={17}/></button>}<button className="button button-rust" disabled={!selection} onClick={addClip}><Plus size={16}/>Add clip</button></div></div>
          </> : <div className="source-empty"><div className="empty-paper"><FileText size={34}/><span/><span/><span/></div><h3>Start with the words.</h3><p>Bring an SRT or VTT transcript.<br/>Your files stay in your browser.</p><button className="button button-rust" onClick={openImport}><Upload size={16}/>Import transcript</button><button className="text-button" onClick={() => replaceProject(createSampleProject(), "Sample project loaded.")}>Or explore a sample <ArrowRight size={14}/></button></div>}
        </section>
        <section className="work-panel plan-panel" aria-labelledby="plan-heading">
          <div className="panel-heading"><div className="panel-title"><span className="step-number step-dark">02</span><div><h2 id="plan-heading">Your clip plan</h2><p>Shape the story. Leave good directions.</p></div></div><span className="clip-count">{String(project.clips.length).padStart(2, "0")} <span>clips</span></span></div>
          <div className="plan-summary"><div><Clock3 size={15}/><span>Planned runtime</span><strong>{formatDuration(totalDuration)}</strong></div><span className="cue-accuracy"><span/>Cue-accurate timing</span></div>
          <div className="clips-scroll">
            {!project.clips.length && <div className="plan-empty"><div className="empty-clip-stack"><div/><div/><div><Scissors size={25}/></div></div><span className="eyebrow">MAKE YOUR FIRST SELECT</span><h3>Every good cut<br/>starts with a moment.</h3><p>Choose cues in the transcript, then add them here. Arrange your clips in the order you want your editor to see them.</p><span className="empty-hint"><span>1</span>Choose a start<span>2</span>Choose an end<span>3</span>Add clip</span></div>}
            {resolvedClips.map((clip, index) => <article key={clip.id} id={`clip-${clip.id}`} className={`clip-card ${expanded === clip.id ? "is-expanded" : ""}`}>
              <div className="clip-card-top"><span className="clip-number">CLIP {String(index + 1).padStart(2, "0")}</span><span className="duration-pill">{formatDuration(clip.durationMs)}</span><div className="clip-card-actions"><button className="icon-button" aria-label={`Move ${clip.title || "clip"} earlier`} disabled={index === 0} onClick={() => moveClip(index, -1)}><ArrowUp size={15}/></button><button className="icon-button" aria-label={`Move ${clip.title || "clip"} later`} disabled={index === project.clips.length - 1} onClick={() => moveClip(index, 1)}><ArrowDown size={15}/></button><span className="action-divider"/><button className="icon-button delete-clip" aria-label={`Remove ${clip.title || "clip"}`} onClick={() => removeClip(clip.id)}><Trash2 size={14}/></button></div></div>
              {expanded === clip.id ? <label className="clip-title-field"><span className="sr-only">Clip title</span><input value={clip.title} maxLength={160} placeholder="Give this clip a title" autoFocus onChange={e => editClip(clip.id, "title", e.target.value)}/></label> : <button className="clip-title-button" onClick={() => setExpanded(clip.id)}><h3>{clip.title || "Untitled clip"}</h3><Pencil size={13}/></button>}
              <div className="clip-time-range"><span>{formatTime(clip.startMs)}</span><ArrowRight size={12}/><span>{formatTime(clip.endMs)}</span><span className="clip-cue-number">{clip.cueIds.length} cues</span></div>
              <blockquote className={expanded === clip.id ? "clip-quote expanded-quote" : "clip-quote"}>{clip.text}</blockquote>
              {expanded === clip.id ? <div className="clip-editor"><label>HOOK / ANGLE<textarea value={clip.hook} maxLength={10000} rows={2} placeholder="What makes this moment worth watching?" onChange={e => editClip(clip.id, "hook", e.target.value)}/></label><label>B-ROLL IDEAS<textarea value={clip.broll} maxLength={10000} rows={2} placeholder="What could we show while this plays?" onChange={e => editClip(clip.id, "broll", e.target.value)}/></label><label>EDITOR NOTES<textarea value={clip.notes} maxLength={10000} rows={3} placeholder="Pacing, context, graphics, or anything the editor should know…" onChange={e => editClip(clip.id, "notes", e.target.value)}/></label><div className="clip-editor-footer"><button className="text-button" onClick={() => showSource(clip)}>View in transcript <ArrowUpRight size={13}/></button><button className="button button-light button-sm" onClick={() => setExpanded(null)}><Check size={14}/>Done</button></div></div> : <div className="clip-footer"><div>{clip.hook && <span>Hook</span>}{clip.broll && <span>B-roll</span>}{clip.notes && <span>Notes</span>}{!clip.hook && !clip.broll && !clip.notes && <span className="no-notes">Add a little direction</span>}</div><button className="text-button" onClick={() => setExpanded(clip.id)}>Edit clip<Pencil size={12}/></button></div>}
            </article>)}
            {project.clips.length > 0 && <div className="plan-add-hint"><Plus size={16}/><span>Find another moment in the transcript.</span></div>}
          </div>
          <div className="plan-bottom"><div><FileText size={18}/><span>A handoff your editor can actually use.<small>Source, precise in/out points, dialogue, and direction.</small></span></div><button className="icon-button" aria-label="Download Markdown editor brief" disabled={!project.clips.length} onClick={() => exportFile("md")}><Download size={18}/></button></div>
        </section>
      </div>
      <footer className="workspace-footer"><div><LockKeyhole size={13}/><span>Local by design. Your transcript stays on this device.</span></div><p>Cut points follow subtitle cues, including pauses. Check them against your footage.</p><button className="text-button" onClick={() => setModal("help")}>A little guidance<ArrowUpRight size={12}/></button></footer>
    </main>
    {notice && <div className="toast" role="status"><Check size={16}/><span>{notice}</span>{deleted && notice.includes("removed") && <button onClick={undoDelete}>Undo</button>}<button className="toast-close" aria-label="Dismiss message" onClick={() => setNotice("")}><X size={14}/></button></div>}

    {modal === "import" && <Modal title="Bring in a transcript" onClose={() => setModal(null)} wide><div className="modal-content"><p className="modal-intro">Use an existing subtitle export. Everything is processed here in your browser.</p><div className="import-tabs"><button className={importTab === "file" ? "active" : ""} onClick={() => { setImportTab("file"); setImportError(""); }}><Upload size={15}/>Upload a file</button><button className={importTab === "paste" ? "active" : ""} onClick={() => { setImportTab("paste"); setImportError(""); }}><FileText size={15}/>Paste transcript</button></div>{importTab === "file" ? <div className={`dropzone ${dragging ? "is-dragging" : ""}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); const file = event.dataTransfer.files[0]; if (file) void readTranscript(file); }}><span className="dropzone-icon"><Upload size={26}/></span><h3>Drop your transcript here</h3><p>SRT or VTT · Up to 5 MB · 5,000 cues</p><button className="button button-light" onClick={() => fileRef.current?.click()}>Choose a file<ArrowUpRight size={14}/></button><input ref={fileRef} type="file" accept=".srt,.vtt" className="sr-only" tabIndex={-1} aria-label="Choose SRT or VTT transcript" onChange={event => { const file = event.target.files?.[0]; if (file) void readTranscript(file); event.target.value = ""; }}/></div> : <div className="paste-fields"><label>Source filename<input value={pasteName} maxLength={255} onChange={event => { setPasteName(event.target.value); setCandidate(null); }} placeholder="interview.srt"/></label><label>Timestamped transcript<textarea rows={8} value={pasteText} onChange={event => { setPasteText(event.target.value); setCandidate(null); }} placeholder={"1\n00:00:00,000 --> 00:00:05,500\nYour first line of dialogue.\n\n2\n00:00:06,000 --> 00:00:12,000\nThe next line goes here."}/></label><button className="button button-light" disabled={!pasteText.trim()} onClick={() => { try { setCandidate(parseTranscript(pasteText, pasteName || "pasted-transcript.srt")); setImportError(""); } catch (error) { setCandidate(null); setImportError((error as Error).message); } }}>Check transcript<Check size={14}/></button></div>}{importError && <div className="inline-error" role="alert">{importError}</div>}{candidate && <div className="import-preview"><span className="import-ready"><Check size={17}/></span><div><strong>{candidate.filename}</strong><p>{candidate.cues.length} cues · Ends at {formatTime(Math.max(...candidate.cues.map(cue => cue.endMs)), false)} · Ready to plan</p>{candidate.warnings.map(warning => <p className="import-warning" key={warning}>{warning}</p>)}</div></div>}<div className="modal-note"><LockKeyhole size={14}/><p>{source ? "Importing replaces the current transcript and clip plan. Export a project backup first if you want to keep it." : "No account, upload server, or AI service is needed. Original source timing is preserved."}</p></div></div><div className="modal-footer"><button className="button button-light" onClick={() => setModal(null)}>Cancel</button><button className="button button-rust" disabled={!candidate} onClick={applyTranscript}>Import & start planning<ArrowRight size={15}/></button></div></Modal>}

    {modal === "help" && <Modal title="From transcript to a better handoff" onClose={() => setModal(null)} wide><div className="modal-content help-content"><p className="modal-intro">A small workspace for making editorial decisions before you open a timeline.</p><ol className="help-steps"><li><span>01</span><div><h3>Start with a transcript</h3><p>Import an SRT or VTT file, paste timestamped text, or explore the fictional sample. One project holds one source transcript.</p></div></li><li><span>02</span><div><h3>Choose the moment</h3><p>Click a start cue, then an end cue. Every cue between them is included. Click Add clip. A single cue works too. Search highlights matches without hiding surrounding context.</p></div></li><li><span>03</span><div><h3>Give it some direction</h3><p>Add a title, hook, B-roll ideas, and editor notes. Use the arrows to reorder clips. Each clip keeps its original source filename, dialogue, and millisecond timestamps.</p></div></li><li><span>04</span><div><h3>Make the handoff</h3><p>Export a Markdown brief or CSV clip list. Download a project JSON to reopen the entire workspace here, or move it to another device.</p></div></li></ol><div className="help-callout"><Clock3 size={19}/><div><strong>Subtitle cues set the cut points.</strong><p>Durations span the first cue’s start to the latest cue’s end, including pauses. Overlapping clips are counted separately. This is a planning brief, not rendered video or an NLE timeline. Review cut points against the original footage.</p></div></div><div className="help-details"><div><strong>Keyboard friendly</strong><p>Tab to a cue and press Enter or Space to select it. Press Escape on a cue to clear the selection. Ctrl/⌘ + Enter on a cue adds the selected range.</p></div><div><strong>Saved on your device</strong><p>The workspace autosaves in this browser. Clearing browser data removes it. Keep a JSON backup for anything you want to preserve. Transcript data is never sent to an external service.</p></div></div><a className="text-button" href="/samples/a-smaller-studio.srt" download>Download the sample SRT<Download size={14}/></a></div><div className="modal-footer"><button className="button button-rust" onClick={() => setModal(null)}>Back to the edit<ArrowRight size={15}/></button></div></Modal>}

    {(modal === "reset" || modal === "sample" || modal === "restore") && <Modal title={modal === "reset" ? "Start a new clip plan?" : modal === "sample" ? "Explore the sample project?" : "Open this saved project?"} onClose={() => setModal(null)}><div className="modal-content"><p className="modal-intro">{modal === "reset" ? "This clears the current transcript and clips from your workspace." : modal === "sample" ? "Load a fictional studio interview with two example clips, hooks, and editor notes." : `“${pendingProject?.title || "Untitled clip plan"}” contains ${pendingProject?.clips.length ?? 0} clips${pendingProject?.source ? ` from ${pendingProject.source.filename}` : ""}.`}</p><div className="confirm-backup"><FileJson2 size={24}/><div><strong>Keep your current work</strong><p>Download a project backup before replacing the workspace.</p></div><button className="button button-light button-sm" onClick={() => exportFile("json")}>Save JSON<Download size={14}/></button></div></div><div className="modal-footer"><button className="button button-light" onClick={() => setModal(null)}>Cancel</button><button className="button button-rust" onClick={() => { if (modal === "reset") replaceProject(createEmptyProject(), "New workspace ready."); else if (modal === "sample") replaceProject(createSampleProject(), "Sample project loaded."); else if (pendingProject) replaceProject(pendingProject, "Saved project restored."); }}>{modal === "reset" ? "Start fresh" : modal === "sample" ? "Load sample" : "Open project"}<ArrowRight size={15}/></button></div></Modal>}
  </div>;
}
