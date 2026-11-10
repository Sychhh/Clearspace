import { recordingToWav } from "./audio";
("use client");
import { useState, useEffect, useRef, ReactNode } from "react";
import {
  Sun,
  CalendarDays,
  Inbox,
  Lightbulb,
  Search,
  Settings,
  Plus,
  Mic,
  ArrowUpRight,
  Check,
  ChevronRight,
  ChevronDown,
  MoreHorizontal,
  X,
  ArrowRight,
  Sparkles,
  Trash2,
  Flag,
  Clock,
  Repeat2,
  Download,
  ShieldCheck,
  Cloud,
  CloudOff,
  Loader2,
  Square,
  Send,
  LayoutList,
  CalendarClock,
  Star,
  BookOpen,
  LogOut,
} from "lucide-react";

type Message = { role: "user" | "assistant"; text: string; steps?: string[] };
type Entry = {
  id: string;
  kind: "task" | "idea";
  title: string;
  body: string;
  original?: string;
  date?: string;
  time?: string;
  priority?: boolean;
  repeat?: string;
  done?: boolean;
  completedAt?: string;
  created: string;
  messages?: Message[];
  favourite?: boolean;
  sourceId?: string;
};
type Op = { action: string; record?: Entry; profile?: string };
const day = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const uid = () => crypto.randomUUID();
async function request(url: string, data?: unknown): Promise<any> {
  const r = await fetch(
    url,
    data instanceof FormData
      ? { method: "POST", body: data }
      : data
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(data),
          }
        : undefined,
  );
  let j: any;
  try {
    j = await r.json();
  } catch {
    throw new Error("Could not reach your space. Please reconnect and retry.");
  }
  if (!r.ok) throw new Error(j.error || "Something went wrong.");
  return j;
}
function Sheet({
  children,
  title,
  close,
  wide = false,
}: {
  children: ReactNode;
  title: string;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`sheet ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="sheet-top">
        <span>{title}</span>
        <button className="icon-button" aria-label="Close" onClick={close}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export default function Workspace({ userId }: { userId: string }) {
  const storage = "clearspace:" + userId;
  const [entries, setEntries] = useState<Entry[]>([]);
  const entriesRef = useRef<Entry[]>([]);
  const [profile, setProfile] = useState("");
  const [connected, setConnected] = useState(false);
  const [providerName, setProviderName] = useState("your AI provider");
  const [voiceAvailable, setVoiceAvailable] = useState(false);
  const [view, setView] = useState("today");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [sync, setSync] = useState("Loading");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [undo, setUndo] = useState<null | (() => void)>(null);
  const [modal, setModal] = useState<null | "capture" | "settings" | "profile">(
    null,
  );
  const [active, setActive] = useState<string | null>(null);
  const [kind, setKind] = useState<"task" | "idea">("task");
  const [draft, setDraft] = useState("");
  const [taskDate, setTaskDate] = useState(day());
  const [taskTime, setTaskTime] = useState("");
  const [priority, setPriority] = useState(false);
  const [repeat, setRepeat] = useState("");
  const [editing, setEditing] = useState<Entry | null>(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [key, setKey] = useState("");
  const [profileDraft, setProfileDraft] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [finishing, setFinishing] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [timeline, setTimeline] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(new Date());
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const pending = useRef<Op[]>([]);
  const flushing = useRef(false);
  const mounted = useRef(true);
  const recordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopReason = useRef("");
  const today = day(now);
  const idea = entries.find((x) => x.id === active);
  const tasks = entries.filter((x) => x.kind === "task");
  const ideas = entries.filter((x) => x.kind === "idea");
  const completed = tasks.filter(
    (x) => x.done && x.completedAt?.slice(0, 10) === today,
  ).length;
  function update(next: Entry[]) {
    entriesRef.current = next;
    setEntries(next);
    try {
      localStorage.setItem(storage + ":entries", JSON.stringify(next));
    } catch {
      setError(
        "Device storage is full. Keep this page open until server sync completes.",
      );
    }
  }
  function saveQueue() {
    try {
      localStorage.setItem(
        storage + ":pending",
        JSON.stringify(pending.current),
      );
    } catch {
      setError("Could not keep an offline copy. Please stay connected.");
    }
  }
  async function flush() {
    if (flushing.current) return;
    flushing.current = true;
    try {
      while (pending.current.length) {
        setSync("Saving");
        await request("/api/data", pending.current[0]);
        pending.current.shift();
        saveQueue();
      }
      setSync("Saved");
    } catch (e) {
      setSync("Not synced");
      setError((e as Error).message);
    } finally {
      flushing.current = false;
    }
  }
  function enqueue(op: Op) {
    pending.current.push(op);
    saveQueue();
    setSync(navigator.onLine ? "Saving" : "Offline");
    void flush();
  }
  function save(e: Entry) {
    update([e, ...entriesRef.current.filter((x) => x.id !== e.id)]);
    enqueue({ action: "save", record: e });
  }
  function remove(e: Entry) {
    update(entriesRef.current.filter((x) => x.id !== e.id));
    enqueue({ action: "delete", record: e });
    setActive(null);
    notify("Entry deleted", () => save(e));
  }
  function notify(text: string, fn?: () => void) {
    setToast(text);
    setUndo(fn ? () => fn : null);
  }
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => {
      setToast("");
      setUndo(null);
    }, 7000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    mounted.current = true;
    setNow(new Date());
    setOffline(!navigator.onLine);
    try {
      const cached = JSON.parse(
        localStorage.getItem(storage + ":entries") || "[]",
      );
      pending.current = JSON.parse(
        localStorage.getItem(storage + ":pending") || "[]",
      );
      update(cached);
      setProfile(localStorage.getItem(storage + ":profile") || "");
    } catch {
      setError(
        "Could not read the device cache. Server records will still load.",
      );
    }
    async function load() {
      try {
        await flush();
        const data = await request("/api/data");
        const map = new Map<string, Entry>(
          data.records.map((x: Entry) => [x.id, x]),
        );
        for (const op of pending.current) {
          if (op.record) {
            if (op.action === "delete") map.delete(op.record.id);
            else map.set(op.record.id, op.record);
          }
        }
        if (mounted.current) {
          update([...map.values()]);
          const pendingProfile = [...pending.current]
            .reverse()
            .find((x) => x.action === "profile");
          setProfile(pendingProfile?.profile ?? data.profile);
          setConnected(data.connected);
          setProviderName(data.providerName || "OpenAI");
          setVoiceAvailable(!!data.voiceAvailable);
          setSync(pending.current.length ? "Not synced" : "Saved");
        }
      } catch (e) {
        setError((e as Error).message);
        setSync("Offline");
      } finally {
        setLoading(false);
      }
    }
    void load();
    const online = () => {
      setOffline(false);
      void flush();
    };
    const off = () => {
      setOffline(true);
      setSync("Offline");
    };
    window.addEventListener("online", online);
    window.addEventListener("offline", off);
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    const retry = setInterval(() => {
      if (pending.current.length) void flush();
    }, 30000);
    return () => {
      mounted.current = false;
      window.removeEventListener("online", online);
      window.removeEventListener("offline", off);
      clearInterval(retry);
      if (recordTimer.current) clearTimeout(recordTimer.current);
      if (recorder.current?.state === "recording") {
        recorder.current.onstop = null;
        recorder.current.stop();
      }
      stream.current?.getTracks().forEach((t) => t.stop());
      chunks.current = [];
    };
  }, []);
  useEffect(() => {
    if (!recording) return;
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [recording]);
  function openCapture(type: "task" | "idea" = "task", entry?: Entry) {
    setEditing(entry || null);
    setKind(type);
    setDraft(entry ? (type === "task" ? entry.title : entry.body) : "");
    setTaskDate(entry?.date ?? (view === "someday" ? "" : today));
    setTaskTime(entry?.time || "");
    setPriority(entry?.priority || false);
    setRepeat(entry?.repeat || "");
    setNotes(entry?.body || "");
    setModal("capture");
    setError("");
  }
  function createText(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return null;
    const e: Entry = {
      id: editing?.id || uid(),
      kind,
      title:
        kind === "task"
          ? trimmed.slice(0, 500)
          : editing?.title || trimmed.split("\n")[0].slice(0, 90),
      body: kind === "idea" ? trimmed : notes || trimmed,
      original: editing?.original || (kind === "idea" ? trimmed : undefined),
      created: editing?.created || new Date().toISOString(),
      date: kind === "task" ? taskDate : undefined,
      time: kind === "task" && taskDate ? taskTime : "",
      priority,
      repeat: kind === "task" ? repeat : "",
      done: editing?.done || false,
      messages: editing?.messages || [],
      favourite: editing?.favourite || false,
      sourceId: editing?.sourceId,
    };
    save(e);
    return e;
  }
  function submitCapture() {
    if (busy || recording) return;
    if (!draft.trim()) {
      setError("Add a thought first.");
      return;
    }
    if (kind === "task" && draft.trim().length > 500) {
      setError(
        "Keep task titles under 500 characters; use an idea for longer notes.",
      );
      return;
    }
    const e = createText(draft);
    if (e) {
      setModal(null);
      setDraft("");
      notify(
        editing
          ? "Changes saved"
          : kind === "task"
            ? "Task added. Make a little progress."
            : "Idea captured. Come back when you’re ready.",
      );
      if (kind === "idea") setActive(e.id);
    }
  }
  async function toggle(e: Entry) {
    const next = {
      ...e,
      done: !e.done,
      completedAt: !e.done
        ? today + "T" + new Date().toTimeString().slice(0, 8)
        : undefined,
    };
    if (next.done) {
      setFinishing((v) => [...v, e.id]);
      setTimeout(
        () => setFinishing((v) => v.filter((id) => id !== e.id)),
        1100,
      );
    }
    save(next);
    let generated: Entry | undefined;
    if (next.done && e.repeat) {
      const date = new Date((e.date || today) + "T12:00:00");
      date.setDate(date.getDate() + (e.repeat === "daily" ? 1 : 7));
      generated = {
        ...e,
        id: uid(),
        date: day(date),
        done: false,
        completedAt: undefined,
        created: new Date().toISOString(),
      };
      save(generated);
    }
    notify(next.done ? "A little win. Nicely done." : "Task reopened", () => {
      save(e);
      if (generated) {
        update(entriesRef.current.filter((x) => x.id !== generated!.id));
        enqueue({ action: "delete", record: generated });
      }
    });
  }
  async function aiAction(action: "organize" | "discuss", question?: string) {
    if (!idea || busy) return;
    if (!connected) {
      setModal("settings");
      return;
    }
    if (pending.current.length) {
      await flush();
      if (pending.current.length) {
        setError("Sync your idea before asking AI.");
        return;
      }
    }
    setBusy(action);
    setError("");
    try {
      const result = await request("/api/ai", {
        action,
        id: idea.id,
        message: question || message,
      });
      const current = entriesRef.current.find((x) => x.id === idea.id);
      if (!current) return;
      if (action === "organize") {
        save({ ...current, title: result.title, body: result.body });
        notify("Idea clarified. Your original is kept below.");
      } else {
        save({
          ...current,
          messages: [
            ...(current.messages || []),
            { role: "user", text: question || message },
            { role: "assistant", text: result.reply, steps: result.steps },
          ],
        });
        setMessage("");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function polishTask() {
    if (!editing || busy) return;
    if (!connected) {
      setError("Connect your API key in Settings first.");
      return;
    }
    setBusy("polish");
    try {
      const e = createText(draft);
      if (!e) return;
      await flush();
      if (pending.current.length)
        throw new Error("Sync the task before using AI.");
      const r = await request("/api/ai", { action: "organize", id: e.id });
      setDraft(r.title);
      setNotes(r.body);
      save({
        ...e,
        title: r.title,
        body: r.body,
        original: e.original || draft,
      });
      notify("Task clarified. Review and save any edits.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  async function startVoice() {
    if (!voiceAvailable) {
      setError(
        "The server speech engine is not ready. Check WHISPER_EXECUTABLE and WHISPER_MODEL.",
      );
      return;
    }
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "Voice recording is unavailable in this browser. Try Chrome or type your thought.",
        );
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      chunks.current = [];
      stopReason.current = "";
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(
        (t) => MediaRecorder.isTypeSupported(t),
      );
      const rec = new MediaRecorder(
        stream.current,
        mime ? { mimeType: mime } : undefined,
      );
      recorder.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.current.push(e.data);
      };
      rec.onstop = async () => {
        setRecording(false);
        if (recordTimer.current) clearTimeout(recordTimer.current);
        stream.current?.getTracks().forEach((t) => t.stop());
        stream.current = null;
        recorder.current = null;
        if (stopReason.current === "cancel") {
          chunks.current = [];
          return;
        }
        let blob: Blob | null = new Blob(chunks.current, {
          type: rec.mimeType,
        });
        chunks.current = [];
        if (blob.size > 19000000) {
          blob = null;
          setError("Recording was too large. Please try a shorter clip.");
          return;
        }
        setBusy("transcribe");
        try {
          blob = await recordingToWav(blob);
          const form = new FormData();
          form.set("file", blob, "thought.wav");
          const result = await request("/api/transcribe", form);
          const text = (draft ? draft + "\n" : "") + result.text;
          setDraft(text);
          try {
            localStorage.setItem(storage + ":voice-draft", text);
          } catch {}
          let e = createText(text);
          if (e && kind === "task") {
            e = { ...e, body: text, original: text };
            save(e);
          }
          if (!e) throw new Error("Transcript was empty.");
          blob = null;
          localStorage.removeItem(storage + ":voice-draft");
          setModal(null);
          if (kind === "idea") setActive(e.id);
          notify("Transcript saved. Recording discarded.");
        } catch (e) {
          setError(
            (e as Error).message +
              " Audio was discarded; please retry or type your thought.",
          );
        } finally {
          blob = null;
          setBusy("");
        }
      };
      rec.start(1000);
      setRecording(true);
      setSeconds(0);
      recordTimer.current = setTimeout(() => {
        if (rec.state === "recording") rec.stop();
      }, 180000);
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      setError((e as Error).message);
    }
  }
  function closeCapture() {
    if (busy === "transcribe") return;
    if (recording) {
      stopReason.current = "cancel";
      recorder.current?.stop();
    }
    setModal(null);
  }
  async function connection(action: string) {
    if (busy) return;
    setBusy("connection");
    setError("");
    try {
      await request("/api/connection", { action, key });
      setKey("");
      setConnected(action !== "disconnect");
      const state = await request("/api/data");
      setVoiceAvailable(!!state.voiceAvailable);
      notify(
        action === "disconnect"
          ? "AI disconnected"
          : action === "test"
            ? "Connection verified"
            : "Your key is connected securely",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  function addStep(text: string) {
    const exists = tasks.some(
      (x) => x.sourceId === idea?.id && x.title === text,
    );
    if (exists) {
      notify("That step is already in your tasks");
      return;
    }
    save({
      id: uid(),
      kind: "task",
      title: text,
      body: "",
      date: today,
      created: new Date().toISOString(),
      sourceId: idea?.id,
    });
    notify("Added to Today");
  }
  const labels: Record<string, string> = {
    today: "Today",
    upcoming: "Upcoming",
    someday: "Someday",
    ideas: "Ideas",
    search: "Search",
  };
  const filtered = tasks
    .filter((e) =>
      view === "search"
        ? `${e.title} ${e.body}`.toLowerCase().includes(query.toLowerCase())
        : view === "today"
          ? !!e.date && e.date <= today
          : view === "upcoming"
            ? !!e.date && e.date > today
            : !e.date,
    )
    .sort(
      (a, b) =>
        (a.date || "").localeCompare(b.date || "") ||
        Number(!!b.priority) - Number(!!a.priority) ||
        (a.time || "99:99").localeCompare(b.time || "99:99"),
    );
  const visible = filtered.filter((e) => !e.done || finishing.includes(e.id));
  const done = filtered.filter((e) => e.done && !finishing.includes(e.id));
  const ideaList = ideas
    .filter(
      (e) =>
        view !== "search" ||
        `${e.title} ${e.body} ${e.original || ""}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        Number(!!b.favourite) - Number(!!a.favourite) ||
        b.created.localeCompare(a.created),
    );
  const nav = [
    {
      id: "today",
      icon: Sun,
      label: "Today",
      count: tasks.filter((x) => !x.done && x.date && x.date <= today).length,
    },
    { id: "upcoming", icon: CalendarDays, label: "Upcoming" },
    { id: "someday", icon: Inbox, label: "Someday" },
    { id: "ideas", icon: Lightbulb, label: "Ideas", count: ideas.length },
  ];
  function taskRow(e: Entry) {
    return (
      <div className={`task-row ${e.done ? "done" : ""}`} key={e.id}>
        <button
          className="check-button"
          aria-label={e.done ? "Reopen " + e.title : "Complete " + e.title}
          onClick={() => void toggle(e)}
        >
          {e.done && <Check size={15} />}
        </button>
        <button className="task-main" onClick={() => openCapture("task", e)}>
          <span className="task-title">{e.title}</span>
          <span className="task-meta">
            {e.date && e.date < today && !e.done && (
              <span className="overdue">
                Overdue ·{" "}
                {new Date(e.date + "T12:00:00").toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
            {(view === "upcoming" || view === "search") && e.date && (
              <span>{e.date}</span>
            )}
            {e.time && (
              <span>
                <Clock size={12} />
                {e.time}
              </span>
            )}
            {e.repeat && (
              <span>
                <Repeat2 size={12} />
                {e.repeat}
              </span>
            )}
            {e.sourceId && (
              <span>
                <Lightbulb size={12} /> From an idea
              </span>
            )}
          </span>
        </button>
        {e.priority && <Flag size={15} className="priority-icon" />}
        <button
          className="icon-button row-delete"
          aria-label={"Delete " + e.title}
          onClick={() => remove(e)}
        >
          <Trash2 size={15} />
        </button>
      </div>
    );
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/">
          <img src="/icon.svg" alt="" />
          <span>
            clearspace<span className="brand-dot">.</span>
          </span>
        </a>
        <div className="space-label">YOUR PERSONAL SPACE</div>
        <button className="search-nav" onClick={() => setView("search")}>
          <Search size={17} />
          <span>Find anything</span>
          <span className="keycap">⌕</span>
        </button>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={`nav-item ${view === n.id ? "selected" : ""}`}
              onClick={() => {
                setView(n.id);
                setQuery("");
              }}
            >
              <n.icon size={19} />
              <span>{n.label}</span>
              {n.count !== undefined && (
                <span className="count">{n.count}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <button
          className="nav-item"
          onClick={() => {
            setProfileDraft(profile);
            setModal("profile");
          }}
        >
          <BookOpen size={18} />
          <span>About me</span>
          <Sparkles size={13} />
        </button>
        <div className="sidebar-note">
          <div className="tiny-spark">✧</div>
          <p>
            A place for your thoughts.
            <br />A little space to move forward.
          </p>
        </div>
        <div className="sidebar-bottom">
          <button
            className="profile-button"
            onClick={() => setModal("settings")}
          >
            <span className="avatar">A</span>
            <span>
              <strong>Aashish’s space</strong>
              <small>Just for you</small>
            </span>
            <Settings size={17} />
          </button>
          <span className="private-label">
            <ShieldCheck size={12} /> Private & personal
          </span>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="breadcrumb">
            My space <ChevronRight size={13} /> <strong>{labels[view]}</strong>
          </span>
          <div className="top-actions">
            <button
              className="sync-status"
              onClick={() => void flush()}
              title="Retry syncing"
            >
              {offline ? (
                <CloudOff size={14} />
              ) : sync === "Saving" ? (
                <Loader2 size={14} className="spin" />
              ) : (
                <Cloud size={14} />
              )}
              <span>{sync === "Saved" ? "All changes saved" : sync}</span>
            </button>
            <button
              className="icon-button"
              aria-label="Settings"
              onClick={() => setModal("settings")}
            >
              <Settings size={18} />
            </button>
          </div>
        </header>
        <main className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === "today"
                  ? now.toLocaleDateString("en-IN", {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })
                  : view === "ideas"
                    ? "GIVE YOUR THOUGHTS SOME ROOM"
                    : "YOUR SPACE, AT YOUR PACE"}
              </div>
              <h1>
                {view === "today"
                  ? "A little room for your day."
                  : view === "ideas"
                    ? "Small sparks. Big possibilities."
                    : view === "upcoming"
                      ? "Good things take a little planning."
                      : view === "someday"
                        ? "For when the time is right."
                        : "Find a little clarity."}
              </h1>
              <p>
                {view === "today"
                  ? "Clear your mind. Choose what matters. Take it one task at a time."
                  : view === "ideas"
                    ? "Catch a thought now. Make something of it later."
                    : view === "upcoming"
                      ? "A calm look at what’s ahead."
                      : view === "someday"
                        ? "No deadline needed. Keep these here until you’re ready."
                        : "Your tasks and ideas, all within reach."}
              </p>
            </div>
            <button
              className="primary add-main"
              onClick={() => openCapture(view === "ideas" ? "idea" : "task")}
            >
              <Plus size={18} />
              {view === "ideas" ? "Capture an idea" : "Add a task"}
            </button>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!connected && !loading && (
            <div className="connection-banner">
              <span className="connect-icon">
                <Sparkles size={17} />
              </span>
              <span>
                <strong>Your thinking partner is almost ready.</strong> Connect
                your key to unlock AI.
              </span>
              <button onClick={() => setModal("settings")}>
                Connect AI <ArrowRight size={15} />
              </button>
            </div>
          )}
          {view === "search" && (
            <div className="search-field">
              <Search size={20} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search tasks, ideas, or a passing thought…"
                aria-label="Search tasks and ideas"
              />
            </div>
          )}
          <div
            className={`content-grid ${view === "ideas" ? "ideas-layout" : ""}`}
          >
            <section className="primary-column">
              {view !== "ideas" && (
                <>
                  <div className="section-heading">
                    <div>
                      <h2>{view === "search" ? "Tasks" : labels[view]}</h2>
                      <span className="soft-pill">
                        {visible.length}{" "}
                        {visible.length === 1 ? "task" : "tasks"}
                      </span>
                    </div>
                    {view === "today" && (
                      <div className="view-toggle">
                        <button
                          className={!timeline ? "active" : ""}
                          aria-label="List view"
                          onClick={() => setTimeline(false)}
                        >
                          <LayoutList size={16} />
                        </button>
                        <button
                          className={timeline ? "active" : ""}
                          aria-label="Timeline view"
                          onClick={() => setTimeline(true)}
                        >
                          <CalendarClock size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="task-card">
                    {loading ? (
                      <div className="empty-state">
                        <Loader2 className="spin" />
                        <p>Opening your space…</p>
                      </div>
                    ) : visible.length ? (
                      timeline && view === "today" ? (
                        <>
                          {["Overdue", "Scheduled", "Anytime today"].map(
                            (group) => {
                              const rows = visible.filter((e) =>
                                group === "Overdue"
                                  ? e.date! < today
                                  : group === "Scheduled"
                                    ? e.date === today && !!e.time
                                    : e.date === today && !e.time,
                              );
                              return rows.length ? (
                                <div key={group}>
                                  <div className="group-label">{group}</div>
                                  {rows
                                    .sort((a, b) =>
                                      (a.time || "").localeCompare(
                                        b.time || "",
                                      ),
                                    )
                                    .map(taskRow)}
                                </div>
                              ) : null;
                            },
                          )}
                        </>
                      ) : (
                        visible.map(taskRow)
                      )
                    ) : (
                      <div className="empty-state">
                        <div className="empty-icon">
                          <Check size={25} />
                        </div>
                        <h3>
                          {view === "search"
                            ? "No matching tasks"
                            : view === "today"
                              ? "A fresh start, just for you."
                              : view === "upcoming"
                                ? "A little breathing room ahead."
                                : "Some things can wait."}
                        </h3>
                        <p>
                          {view === "today"
                            ? "What’s one thing you’d like to get done today?"
                            : view === "search"
                              ? "Try another word or look through your ideas below."
                              : "Add something here whenever you’re ready."}
                        </p>
                        {view !== "search" && (
                          <button
                            className="text-button"
                            onClick={() => openCapture()}
                          >
                            <Plus size={15} /> Add your first task
                          </button>
                        )}
                      </div>
                    )}
                    <button
                      className="inline-add"
                      onClick={() => openCapture()}
                    >
                      <Plus size={18} />
                      <span>Add a task</span>
                      <span className="optional-label">
                        Make room for what matters
                      </span>
                    </button>
                  </div>
                  {done.length > 0 && (
                    <div className="completed-area">
                      <button
                        className="completed-toggle"
                        onClick={() => setShowDone(!showDone)}
                      >
                        {showDone ? (
                          <ChevronDown size={15} />
                        ) : (
                          <ChevronRight size={15} />
                        )}
                        Completed <span>{done.length}</span>
                      </button>
                      {showDone && (
                        <div className="task-card">{done.map(taskRow)}</div>
                      )}
                    </div>
                  )}
                  {view === "today" && (
                    <div className="capture-strip">
                      <span className="capture-orb">
                        <Mic size={20} />
                      </span>
                      <div>
                        <strong>A thought just showed up?</strong>
                        <p>Say it or type it. We’ll keep it safe.</p>
                      </div>
                      <button onClick={() => openCapture("idea")}>
                        Capture it <ArrowUpRight size={17} />
                      </button>
                    </div>
                  )}
                </>
              )}
              {(view === "ideas" || view === "search") && (
                <>
                  <div className="section-heading">
                    <div>
                      <h2>Your ideas</h2>
                      <span className="soft-pill">{ideaList.length}</span>
                    </div>
                    <span className="muted">A home for every “what if”</span>
                  </div>
                  <div className="idea-grid">
                    {ideaList.map((e, i) => (
                      <button
                        key={e.id}
                        className={`idea-card tone-${i % 3}`}
                        onClick={() => {
                          setActive(e.id);
                          setMessage("");
                        }}
                      >
                        <div className="idea-card-top">
                          <span>
                            <Lightbulb size={17} />
                          </span>
                          <span>
                            {e.favourite ? (
                              <Star size={16} fill="currentColor" />
                            ) : (
                              <ArrowUpRight size={17} />
                            )}
                          </span>
                        </div>
                        <h3>{e.title}</h3>
                        <p>{e.body}</p>
                        <div className="idea-card-footer">
                          <span>
                            {new Date(e.created).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                            })}
                          </span>
                          <span>
                            {e.messages?.length
                              ? "Keep exploring"
                              : "Think it through"}{" "}
                            <ChevronRight size={12} />
                          </span>
                        </div>
                      </button>
                    ))}
                    {view === "ideas" && (
                      <button
                        className="idea-card new-idea"
                        onClick={() => openCapture("idea")}
                      >
                        <span className="new-idea-plus">
                          <Plus size={23} />
                        </span>
                        <h3>
                          {ideas.length
                            ? "Room for another thought."
                            : "Your next idea starts here."}
                        </h3>
                        <p>
                          It doesn’t have to make sense yet.
                          <br />
                          Just get it out of your head.
                        </p>
                      </button>
                    )}
                  </div>
                </>
              )}
            </section>
            <aside className="right-column">
              <div className="focus-card">
                <div className="card-kicker">
                  <span className="live-dot" /> A GENTLE REMINDER
                </div>
                <div className="orbit-art" aria-hidden="true">
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="orbit orbit-three" />
                  <span className="orbit-center">✧</span>
                  <i className="orbit-dot" />
                </div>
                <h2>
                  One thing
                  <br />
                  at a time.
                </h2>
                <p>
                  You don’t have to do everything.
                  <br />
                  Just the next meaningful thing.
                </p>
                <div className="focus-footer">
                  <span>Less noise. More intention.</span>
                  <ArrowUpRight size={17} />
                </div>
              </div>
              <div className="progress-card">
                <div className="section-heading">
                  <h3>Your little wins</h3>
                  <span>Today</span>
                </div>
                <div className="win-number">
                  {completed}
                  <span>tasks completed</span>
                </div>
                <div className="progress-track">
                  <span
                    style={{
                      width: `${Math.min(100, (completed / Math.max(1, completed + tasks.filter((x) => !x.done && x.date && x.date <= today).length)) * 100)}%`,
                    }}
                  />
                </div>
                <p>
                  {completed
                    ? "Progress looks good on you."
                    : "Every small step counts."}
                </p>
              </div>
              <button
                className="memory-card"
                onClick={() => {
                  setProfileDraft(profile);
                  setModal("profile");
                }}
              >
                <span>
                  <BookOpen size={18} />
                </span>
                <div>
                  <strong>A thinking partner that knows you</strong>
                  <p>
                    {profile
                      ? "Review what your AI knows about you."
                      : "Add your goals, interests & a little about you."}
                  </p>
                </div>
                <ChevronRight size={16} />
              </button>
            </aside>
          </div>
          <footer className="page-footer">
            <span>Made for your mind to feel a little lighter.</span>
            <span>✧</span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav">
        {nav.map((n) => (
          <button
            key={n.id}
            className={view === n.id ? "selected" : ""}
            onClick={() => setView(n.id)}
          >
            <n.icon size={20} />
            <span>{n.label}</span>
          </button>
        ))}
        <button onClick={() => setModal("settings")}>
          <Settings size={20} />
          <span>Settings</span>
        </button>
      </nav>
      {modal === "capture" && (
        <Sheet
          title={editing ? "Edit your " + kind : "A little space for a thought"}
          close={closeCapture}
        >
          <div className="sheet-body">
            <div className="capture-tabs">
              <button
                disabled={!!editing || recording || !!busy}
                className={kind === "task" ? "active" : ""}
                onClick={() => setKind("task")}
              >
                <Check size={16} /> Task
              </button>
              <button
                disabled={!!editing || recording || !!busy}
                className={kind === "idea" ? "active" : ""}
                onClick={() => setKind("idea")}
              >
                <Lightbulb size={16} /> Idea
              </button>
            </div>
            <h2>
              {kind === "task"
                ? "What’s on your mind?"
                : "Let the thought out."}
            </h2>
            <p className="muted">
              {kind === "task"
                ? "One small action is a good place to start."
                : "Messy is welcome. You can make sense of it later."}
            </p>
            <textarea
              className="capture-input"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={kind === "task" ? 500 : 16000}
              placeholder={
                kind === "task"
                  ? "e.g. Practice Python for 30 minutes"
                  : "An idea, a possibility, a wonderfully unfinished thought…"
              }
              disabled={recording || !!busy}
            />
            {kind === "task" && (
              <>
                <label className="field-label">
                  Notes <span>(optional)</span>
                  <textarea
                    rows={3}
                    maxLength={16000}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="A little more context…"
                  />
                </label>
                <div className="field-grid" style={{ marginTop: 18 }}>
                  <label>
                    Day
                    <input
                      type="date"
                      value={taskDate}
                      onChange={(e) => setTaskDate(e.target.value)}
                    />
                  </label>
                  <label>
                    Time <span>(optional)</span>
                    <input
                      type="time"
                      disabled={!taskDate}
                      value={taskTime}
                      onChange={(e) => setTaskTime(e.target.value)}
                    />
                  </label>
                </div>
                <div className="form-options">
                  <button
                    className={`chip ${priority ? "active" : ""}`}
                    onClick={() => setPriority(!priority)}
                  >
                    <Flag size={14} /> Priority
                  </button>
                  <button
                    className={`chip ${!taskDate ? "active" : ""}`}
                    onClick={() => {
                      setTaskDate("");
                      setTaskTime("");
                    }}
                  >
                    Someday
                  </button>
                  <label className="repeat-select">
                    <Repeat2 size={14} />
                    <select
                      aria-label="Repeat task"
                      value={repeat}
                      onChange={(e) => setRepeat(e.target.value)}
                    >
                      <option value="">Doesn’t repeat</option>
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </label>
                </div>
                {editing && (
                  <button
                    className="text-button"
                    disabled={!!busy}
                    onClick={() => void polishTask()}
                  >
                    <Sparkles size={14} />
                    {busy === "polish" ? "Clarifying…" : "Clarify task with AI"}
                  </button>
                )}
                <p className="field-hint">
                  Times organize your list; notification reminders aren’t
                  enabled in this version.
                </p>
              </>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="capture-footer">
              <button
                className={`voice-button ${recording ? "recording" : ""}`}
                disabled={!!busy}
                onClick={() =>
                  recording ? recorder.current?.stop() : void startVoice()
                }
              >
                {busy === "transcribe" ? (
                  <Loader2 size={18} className="spin" />
                ) : recording ? (
                  <Square size={16} fill="currentColor" />
                ) : (
                  <Mic size={18} />
                )}
                <span>
                  {busy === "transcribe"
                    ? "Transcribing…"
                    : recording
                      ? `Stop · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
                      : "Speak it"}
                </span>
              </button>
              <button
                className="primary"
                disabled={!draft.trim() || recording || !!busy}
                onClick={submitCapture}
              >
                Save {kind}
                <ArrowRight size={16} />
              </button>
            </div>
            <p className="privacy-note">
              <ShieldCheck size={12} /> Audio is temporary. Only the transcript
              is saved.
            </p>
            {!connected && (
              <button
                className="text-button"
                onClick={() => setModal("settings")}
              >
                Configure AI and voice <ArrowRight size={14} />
              </button>
            )}
          </div>
        </Sheet>
      )}
      {active && idea && !modal && (
        <Sheet
          title="A thought worth exploring"
          close={() => setActive(null)}
          wide
        >
          <div className="sheet-body idea-detail">
            <div className="idea-detail-actions">
              <span className="eyebrow">
                YOUR IDEA · {new Date(idea.created).toLocaleDateString()}
              </span>
              <button
                className="icon-button"
                aria-label={
                  idea.favourite ? "Unfavourite idea" : "Favourite idea"
                }
                onClick={() => save({ ...idea, favourite: !idea.favourite })}
              >
                <Star
                  size={18}
                  fill={idea.favourite ? "currentColor" : "none"}
                />
              </button>
              <button
                className="icon-button"
                aria-label="Delete idea"
                onClick={() => remove(idea)}
              >
                <Trash2 size={17} />
              </button>
            </div>
            <h2>{idea.title}</h2>
            <div className="idea-body">{idea.body}</div>
            <div className="detail-controls">
              <button
                className="chip"
                onClick={() => openCapture("idea", idea)}
              >
                Edit idea
              </button>
              <button
                className="chip"
                disabled={!!busy}
                onClick={() => void aiAction("organize")}
              >
                <Sparkles size={14} />
                {busy === "organize" ? "Clarifying…" : "Clarify with AI"}
              </button>
              <button className="chip" onClick={() => addStep(idea.title)}>
                <Plus size={14} /> Make a task
              </button>
            </div>
            {idea.original && (
              <details className="original">
                <summary>Original thought</summary>
                <p>{idea.original}</p>
              </details>
            )}
            <div className="thinking-header">
              <span className="thinking-icon">
                <Sparkles size={19} />
              </span>
              <div>
                <h3>Think it through</h3>
                <p>Your perspective, with a little room to explore.</p>
              </div>
            </div>
            {!idea.messages?.length && (
              <div className="thinking-empty">
                <p>
                  Let’s look at the possibilities, the gaps, and a practical
                  first step.
                </p>
                <button
                  className="suggestion"
                  disabled={!!busy}
                  onClick={() =>
                    void aiAction(
                      "discuss",
                      "Does this fit my goals? What am I missing, and what is a small first step?",
                    )
                  }
                >
                  Does this make sense for me? <ArrowUpRight size={15} />
                </button>
              </div>
            )}
            <div className="conversation">
              {idea.messages?.map((m, i) => (
                <div className={`message ${m.role}`} key={i}>
                  <span className="message-label">
                    {m.role === "user" ? "YOU" : "CLEARSPACE AI"}
                  </span>
                  <div>{m.text}</div>
                  {m.steps?.map((s, j) => (
                    <button
                      className="step-button"
                      key={j}
                      onClick={() => addStep(s)}
                    >
                      <Plus size={14} />
                      <span>{s}</span>
                      <small>Add task</small>
                    </button>
                  ))}
                </div>
              ))}
              {busy === "discuss" && (
                <div className="ai-thinking">
                  <Loader2 size={16} className="spin" /> Thinking with you…
                </div>
              )}
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <form
              className="chat-form"
              onSubmit={(e) => {
                e.preventDefault();
                if (message.trim()) void aiAction("discuss");
              }}
            >
              <textarea
                rows={2}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={5000}
                placeholder="Ask a question, challenge it, think out loud…"
                aria-label="Message your thinking partner"
              />
              <button
                className="primary"
                aria-label="Send message"
                disabled={!message.trim() || !!busy}
              >
                <Send size={17} />
              </button>
            </form>
            <p className="privacy-note">
              Uses your About me profile and this idea’s conversation. AI can be
              mistaken.
            </p>
          </div>
        </Sheet>
      )}
      {modal === "profile" && (
        <Sheet title="A little about you" close={() => setModal(null)}>
          <div className="sheet-body">
            <span className="large-icon">
              <BookOpen size={25} />
            </span>
            <h2>Your space should know you.</h2>
            <p className="muted">
              Tell your thinking partner about your goals, current projects,
              interests, and constraints. You control what stays here.
            </p>
            <label className="field-label">
              What would you like your AI to know?
              <textarea
                rows={12}
                maxLength={16000}
                value={profileDraft}
                onChange={(e) => setProfileDraft(e.target.value)}
                placeholder="My current goals…\nWhat I’m working on…\nSkills and interests…\nTime or budget constraints…\nHow I like feedback…"
              />
            </label>
            <p className="field-hint">
              Only this profile and the open idea’s conversation are sent as
              context. The app doesn’t inherit ChatGPT memory or silently add
              personal facts.
            </p>
            <button
              className="primary full"
              onClick={() => {
                setProfile(profileDraft);
                localStorage.setItem(storage + ":profile", profileDraft);
                enqueue({ action: "profile", profile: profileDraft });
                setModal(null);
                notify("Your profile has been updated");
              }}
            >
              Save my profile <Check size={16} />
            </button>
          </div>
        </Sheet>
      )}
      {modal === "settings" && (
        <Sheet
          title="Make yourself at home"
          close={() => {
            setModal(null);
            setKey("");
            setError("");
          }}
        >
          <div className="sheet-body">
            <h2>Your space, your settings.</h2>
            <p className="muted">A private home for the things on your mind.</p>
            <section className="settings-block">
              <div className="settings-title">
                <Sparkles size={18} />
                <h3>Your AI connection</h3>
                <span className={`status-pill ${connected ? "on" : ""}`}>
                  {connected ? "Connected" : "Not connected"}
                </span>
              </div>
              <p>
                Text AI provider: {providerName}. Your key enables idea cleanup
                and your thinking partner.
                {!voiceAvailable &&
                  " The server speech engine is not ready."}
              </p>
              <label className="field-label">
                {connected ? "Replace API key" : `${providerName} API key`}
                <input
                  type="password"
                  autoComplete="off"
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="Your provider API key"
                  spellCheck={false}
                />
              </label>
              <p className="field-hint">
                Your key is encrypted on the server and never returned to your
                browser. API usage is billed to your selected provider account.
                Aion connection tests make a short billed AI request. Voice runs
                locally with whisper.cpp and needs no API key.
              </p>
              <div className="detail-controls">
                <button
                  className="primary"
                  disabled={!key || !!busy}
                  onClick={() => void connection("connect")}
                >
                  {busy === "connection" ? (
                    <Loader2 size={15} className="spin" />
                  ) : (
                    <ShieldCheck size={15} />
                  )}
                  Connect securely
                </button>
                {connected && (
                  <>
                    <button
                      className="chip"
                      disabled={!!busy}
                      onClick={() => void connection("test")}
                    >
                      Test connection
                    </button>
                    <button
                      className="text-button danger"
                      disabled={!!busy}
                      onClick={() => void connection("disconnect")}
                    >
                      Disconnect
                    </button>
                  </>
                )}
              </div>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
            </section>
            <section className="settings-block">
              <h3>Your data stays yours.</h3>
              <p>
                Tasks and ideas are saved to your private server database. This
                device keeps a local copy and queues text edits if the
                connection drops. Keep this page open until those edits sync.
              </p>
              <p>
                Voice recordings are transcribed on the computer running this
                app with whisper.cpp. Temporary WAV files are deleted after
                processing, including failed requests. Transcripts are saved;
                audio is not archived. Text sent for AI cleanup or discussion
                goes to Aion Labs.
              </p>
              <a className="settings-link" href="/api/export">
                <Download size={17} /> Export tasks, ideas & profile{" "}
                <ArrowUpRight size={16} />
              </a>
              <button
                className="settings-link"
                onClick={() => {
                  setProfileDraft(profile);
                  setModal("profile");
                }}
              >
                <BookOpen size={17} /> Manage what AI knows about me{" "}
                <ChevronRight size={16} />
              </button>
            </section>
            <section className="settings-block">
              <h3>Keep your space close.</h3>
              <p>
                Use your browser’s “Add to Home screen” or “Install app” option
                for quick access. Keep the local server running. Text AI needs internet; voice transcription runs on your Clearspace server.
              </p>
            </section>
            <a className="text-button muted" href="/logout" target="_top">
              <LogOut size={15} /> Sign out
            </a>
          </div>
        </Sheet>
      )}
      {toast && (
        <div className="toast" role="status">
          <span className="toast-check">
            <Check size={15} />
          </span>
          <span>{toast}</span>
          {undo && (
            <button
              onClick={() => {
                undo();
                setToast("");
                setUndo(null);
              }}
            >
              Undo
            </button>
          )}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
