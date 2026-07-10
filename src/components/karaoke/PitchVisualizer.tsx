import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff, Sparkles, AlertCircle, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";

// Local mic pitch line — autocorrelation. No upload, no server.
function autoCorrelate(buf: Float32Array, sampleRate: number): number {
  let SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  // Lowered from 0.01 so quieter singers / lower-gain mics still register as voiced.
  if (rms < 0.003) return -1;

  let r1 = 0, r2 = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < thres) { r1 = i; break; }
  for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < thres) { r2 = SIZE - i; break; }
  buf = buf.slice(r1, r2);
  SIZE = buf.length;

  const c = new Array(SIZE).fill(0);
  for (let i = 0; i < SIZE; i++) for (let j = 0; j < SIZE - i; j++) c[i] += buf[j] * buf[j + i];

  let d = 0; while (c[d] > c[d + 1]) d++;
  let maxval = -1, maxpos = -1;
  for (let i = d; i < SIZE; i++) if (c[i] > maxval) { maxval = c[i]; maxpos = i; }
  const T0 = maxpos;
  if (T0 <= 0) return -1;
  return sampleRate / T0;
}

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function freqToNote(f: number) {
  const n = 12 * (Math.log2(f / 440)) + 69;
  const r = Math.round(n);
  return { name: NOTES[r % 12], octave: Math.floor(r / 12) - 1 };
}

export type PitchVisualizerHandle = {
  resetScore: () => void;
  getScore: () => number;
  isActive: () => boolean;
  flashFinal: (score: number) => void;
};

type MicStatus =
  | "idle"
  | "checking"
  | "active-voice"
  | "active-quiet"
  | "blocked"
  | "not-found"
  | "in-use"
  | "error";

type ScoreStats = {
  frames: number;
  voiced: number;
  stableCents: number; // sum of |cents-to-nearest-note| for voiced frames
  rmsSum: number;
  rmsFrames: number;
};

type Breakdown = {
  score: number;
  voicedRatio: number;   // 0..1
  stability: number;     // 0..1
  dynamics: number;      // 0..1
};

function emptyStats(): ScoreStats {
  return { frames: 0, voiced: 0, stableCents: 0, rmsSum: 0, rmsFrames: 0 };
}

function scoreBreakdown(s: ScoreStats): Breakdown {
  if (s.frames < 20) return { score: 0, voicedRatio: 0, stability: 0, dynamics: 0 };
  const voicedRatio = s.voiced / s.frames;
  const avgCents = s.voiced > 0 ? s.stableCents / s.voiced : 50;
  const stability = Math.max(0, 1 - avgCents / 50);
  const avgRms = s.rmsFrames > 0 ? s.rmsSum / s.rmsFrames : 0;
  const dynamics = Math.max(0, Math.min(1, avgRms / 0.08));
  const raw = 40 * voicedRatio + 45 * stability + 15 * dynamics;
  const base = voicedRatio > 0.15 ? Math.max(50, raw) : raw;
  const score = Math.round(Math.max(0, Math.min(100, base)));
  return { score, voicedRatio, stability, dynamics };
}

function computeScore(s: ScoreStats): number {
  return scoreBreakdown(s).score;
}

function tierLabel(score: number): { label: string; color: string } {
  if (score >= 90) return { label: "Superstar", color: "oklch(0.82 0.18 200)" };
  if (score >= 80) return { label: "On fire", color: "oklch(0.78 0.2 60)" };
  if (score >= 65) return { label: "Solid", color: "oklch(0.72 0.28 340)" };
  if (score >= 50) return { label: "Warming up", color: "oklch(0.7 0.15 40)" };
  return { label: "Keep going", color: "oklch(0.65 0.08 260)" };
}

export const PitchVisualizer = forwardRef<PitchVisualizerHandle>(function PitchVisualizer(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [active, setActive] = useState(false);
  const [note, setNote] = useState<string>("—");
  const [breakdown, setBreakdown] = useState<Breakdown>({ score: 0, voicedRatio: 0, stability: 0, dynamics: 0 });
  const [finalFlash, setFinalFlash] = useState<number | null>(null);
  const [level, setLevel] = useState(0);
  const [micStatus, setMicStatus] = useState<MicStatus>("idle");
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("default");
  const voiceTimerRef = useRef<number | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const historyRef = useRef<number[]>([]);
  const statsRef = useRef<ScoreStats>(emptyStats());
  const activeRef = useRef(false);
  const flashTimerRef = useRef<number | null>(null);

  useImperativeHandle(ref, () => ({
    resetScore: () => {
      statsRef.current = emptyStats();
      setBreakdown({ score: 0, voicedRatio: 0, stability: 0, dynamics: 0 });
      setFinalFlash(null);
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    },
    getScore: () => computeScore(statsRef.current),
    isActive: () => activeRef.current,
    flashFinal: (score: number) => {
      setFinalFlash(score);
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
      flashTimerRef.current = window.setTimeout(() => setFinalFlash(null), 6000);
    },
  }), []);

  async function refreshDevices() {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) return;
      const list = await navigator.mediaDevices.enumerateDevices();
      setDevices(list.filter((d) => d.kind === "audioinput"));
    } catch { /* ignore */ }
  }

  useEffect(() => {
    refreshDevices();
    const handler = () => refreshDevices();
    navigator.mediaDevices?.addEventListener?.("devicechange", handler);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", handler);
  }, []);

  async function start() {
    try {
      setMicStatus("checking");
      if (!navigator.mediaDevices?.getUserMedia) {
        setMicStatus("error");
        toast.error("Your browser doesn't support mic access.");
        return;
      }
      // Enable AGC + noise handling defaults — most laptop mics are quiet without them.
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      if (selectedDeviceId && selectedDeviceId !== "default") {
        audioConstraints.deviceId = { exact: selectedDeviceId };
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });
      // Device labels only populate after permission is granted — refresh now.
      refreshDevices();
      streamRef.current = stream;
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac: AudioContext = new Ctx();
      // Some browsers start the AudioContext suspended until a gesture — resume explicitly.
      if (ac.state === "suspended") { try { await ac.resume(); } catch { /* ignore */ } }
      ctxRef.current = ac;
      const src = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      setActive(true);
      activeRef.current = true;
      setMicStatus("active-quiet");
      toast.success("Mic on — sing away!");

      let scoreTick = 0;
      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        setLevel(rms);
        statsRef.current.rmsSum += rms;
        statsRef.current.rmsFrames += 1;

        const f = autoCorrelate(buf, ac.sampleRate);
        statsRef.current.frames += 1;
        let hadVoice = false;
        if (f > 50 && f < 1500) {
          const { name, octave } = freqToNote(f);
          setNote(`${name}${octave}`);
          historyRef.current.push(f);
          const midi = 12 * Math.log2(f / 440) + 69;
          const cents = Math.abs(midi - Math.round(midi)) * 100;
          statsRef.current.voiced += 1;
          statsRef.current.stableCents += cents;
          hadVoice = true;
        } else {
          historyRef.current.push(0);
        }

        // Update mic status based on whether voice was detected this frame
        if (hadVoice) {
          if (voiceTimerRef.current) window.clearTimeout(voiceTimerRef.current);
          setMicStatus("active-voice");
          voiceTimerRef.current = window.setTimeout(() => {
            setMicStatus("active-quiet");
          }, 800);
        }

        if (historyRef.current.length > 200) historyRef.current.shift();
        draw();
        scoreTick += 1;
        // ~6 Hz preview updates feel responsive without thrashing React.
        if (scoreTick % 10 === 0) setBreakdown(scoreBreakdown(statsRef.current));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      setActive(false);
      activeRef.current = false;
      if (e.name === "NotAllowedError" || e.name === "SecurityError") {
        setMicStatus("blocked");
        toast.error("Mic blocked — allow microphone access in your browser settings.");
      } else if (e.name === "NotFoundError" || e.name === "OverconstrainedError") {
        setMicStatus("not-found");
        toast.error("No microphone found on this device.");
      } else if (e.name === "NotReadableError") {
        setMicStatus("in-use");
        toast.error("Mic is in use by another app. Close it and try again.");
      } else {
        setMicStatus("error");
        toast.error(`Couldn't start mic${e.message ? `: ${e.message}` : ""}.`);
      }
    }
  }

  function stop() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    ctxRef.current?.close();
    streamRef.current = null;
    ctxRef.current = null;
    historyRef.current = [];
    setActive(false);
    activeRef.current = false;
    setMicStatus("idle");
    if (voiceTimerRef.current) window.clearTimeout(voiceTimerRef.current);
    voiceTimerRef.current = null;
    setNote("—");
    draw();
  }

  function draw() {
    const c = canvasRef.current; if (!c) return;
    const w = c.width, h = c.height;
    const ctx = c.getContext("2d"); if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();

    const hist = historyRef.current;
    if (!hist.length) return;
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "oklch(0.72 0.28 340)");
    g.addColorStop(1, "oklch(0.82 0.18 200)");
    ctx.strokeStyle = g;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    hist.forEach((f, i) => {
      const x = (i / 200) * w;
      const norm = f > 0 ? Math.max(0, Math.min(1, (Math.log2(f / 80)) / 4)) : 0.5;
      const y = h - norm * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }

  useEffect(() => () => {
    stop();
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    if (voiceTimerRef.current) window.clearTimeout(voiceTimerRef.current);
  }, []);

  const tier = tierLabel(finalFlash ?? breakdown.score);
  const displayScore = finalFlash ?? breakdown.score;
  const isFinal = finalFlash !== null;

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-display text-sm font-semibold">Pitch line</h3>
          <p className="text-xs text-muted-foreground">Local mic · scored automatically</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="font-mono text-xl text-[var(--neon)]">{note}</div>
          </div>
          {active ? (
            <Button size="sm" variant="outline" onClick={stop}><MicOff className="mr-1 size-4" /> Stop</Button>
          ) : (
            <Button size="sm" onClick={start}><Mic className="mr-1 size-4" /> Start</Button>
          )}
        </div>
      </div>

      {/* Mic status indicator */}
      <div className="mb-3">
        <MicStatusBadge status={micStatus} />
      </div>

      {active && (
        <div className="mb-3 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Input</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--neon)] to-[var(--neon-2)] transition-[width] duration-75"
              style={{ width: `${Math.min(100, Math.round(level * 600))}%` }}
            />
          </div>
          <span className="w-8 text-right font-mono text-[10px] text-muted-foreground">
            {level < 0.003 ? "quiet" : "ok"}
          </span>
        </div>
      )}

      {/* Live scoring preview */}
      {(active || isFinal) && (
        <div
          className={`mb-3 rounded-xl border p-3 transition-all ${
            isFinal
              ? "border-[var(--neon)] bg-[var(--neon)]/10 shadow-[0_0_40px_-10px_var(--neon)]"
              : "border-border/60 bg-stage/40"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${
                  isFinal ? "bg-[var(--neon)] text-black" : "bg-white/5 text-muted-foreground"
                }`}
              >
                {isFinal ? <><Sparkles className="size-3" /> Final</> : "Live"}
              </span>
              <span className="text-xs" style={{ color: tier.color }}>{tier.label}</span>
            </div>
            <div className="flex items-baseline gap-1">
              <span
                className={`font-display font-black tabular-nums transition-all ${
                  isFinal ? "text-5xl text-gradient" : "text-3xl text-[var(--neon-2)]"
                }`}
              >
                {displayScore}
              </span>
              <span className="text-xs text-muted-foreground">/100</span>
            </div>
          </div>

          {/* Subscore bars */}
          <div className="mt-3 space-y-1.5">
            <Meter label="Voice coverage" value={breakdown.voicedRatio} weight="40%" />
            <Meter label="Pitch accuracy" value={breakdown.stability} weight="45%" />
            <Meter label="Dynamics" value={breakdown.dynamics} weight="15%" />
          </div>
          {isFinal && (
            <p className="mt-2 text-center text-[11px] uppercase tracking-widest text-muted-foreground">
              Submitted to the leaderboard
            </p>
          )}
        </div>
      )}

      <canvas ref={canvasRef} width={600} height={120} className="h-24 w-full rounded-lg bg-stage/60" />
    </div>
  );
});

function statusInfo(status: MicStatus) {
  switch (status) {
    case "idle":
      return { label: "Mic ready — press Start", color: "bg-muted-foreground", icon: Mic };
    case "checking":
      return { label: "Checking for mic…", color: "bg-amber-400", icon: Mic };
    case "active-voice":
      return { label: "Mic on · voice detected", color: "bg-emerald-400", icon: Volume2 };
    case "active-quiet":
      return { label: "Mic on · quiet", color: "bg-amber-400", icon: VolumeX };
    case "blocked":
      return { label: "Mic blocked — check permissions", color: "bg-red-500", icon: AlertCircle };
    case "not-found":
      return { label: "No mic detected", color: "bg-red-500", icon: MicOff };
    case "in-use":
      return { label: "Mic in use by another app", color: "bg-red-500", icon: AlertCircle };
    case "error":
      return { label: "Mic error", color: "bg-red-500", icon: AlertCircle };
  }
}

function MicStatusBadge({ status }: { status: MicStatus }) {
  const info = statusInfo(status);
  const Icon = info.icon;
  return (
    <div className="inline-flex items-center gap-2 rounded-lg border border-border/60 bg-stage/40 px-2.5 py-1.5">
      <span className={`relative flex size-2`}>
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${info.color}`} />
        <span className={`relative inline-flex size-2 rounded-full ${info.color}`} />
      </span>
      <Icon className="size-3.5 text-muted-foreground" />
      <span className="text-[11px] font-medium text-muted-foreground">{info.label}</span>
    </div>
  );
}

function Meter({ label, value, weight }: { label: string; value: number; weight: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>{label} <span className="text-muted-foreground/60">· {weight}</span></span>
        <span className="font-mono tabular-nums">{pct}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[var(--neon)] to-[var(--neon-2)] transition-all duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
