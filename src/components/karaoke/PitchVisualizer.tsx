import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, MicOff } from "lucide-react";

// Local mic pitch line — autocorrelation. No upload, no server.
function autoCorrelate(buf: Float32Array, sampleRate: number): number {
  let SIZE = buf.length;
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1;

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
};

type ScoreStats = {
  frames: number;
  voiced: number;
  stableCents: number; // sum of |cents-to-nearest-note| for voiced frames
  rmsSum: number;
  rmsFrames: number;
};

function emptyStats(): ScoreStats {
  return { frames: 0, voiced: 0, stableCents: 0, rmsSum: 0, rmsFrames: 0 };
}

function computeScore(s: ScoreStats): number {
  if (s.frames < 20) return 0;
  const voicedRatio = s.voiced / s.frames; // 0..1
  // Average cents-off across voiced frames (0 perfect, 50 worst since we take nearest note).
  const avgCents = s.voiced > 0 ? s.stableCents / s.voiced : 50;
  const stability = Math.max(0, 1 - avgCents / 50); // 1 perfect
  const avgRms = s.rmsFrames > 0 ? s.rmsSum / s.rmsFrames : 0;
  // Dynamics: reward audible signal, cap at rms 0.08.
  const dynamics = Math.max(0, Math.min(1, avgRms / 0.08));
  // Weighted blend: voiced coverage 40, pitch stability 45, dynamics 15.
  const raw = 40 * voicedRatio + 45 * stability + 15 * dynamics;
  // Floor at 50 if they actually sang for a decent chunk, so the room stays fun.
  const base = voicedRatio > 0.15 ? Math.max(50, raw) : raw;
  return Math.round(Math.max(0, Math.min(100, base)));
}

export const PitchVisualizer = forwardRef<PitchVisualizerHandle>(function PitchVisualizer(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [active, setActive] = useState(false);
  const [note, setNote] = useState<string>("—");
  const [liveScore, setLiveScore] = useState<number>(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const historyRef = useRef<number[]>([]);
  const statsRef = useRef<ScoreStats>(emptyStats());
  const activeRef = useRef(false);

  useImperativeHandle(ref, () => ({
    resetScore: () => { statsRef.current = emptyStats(); setLiveScore(0); },
    getScore: () => computeScore(statsRef.current),
    isActive: () => activeRef.current,
  }), []);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false }, video: false });
      streamRef.current = stream;
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ac: AudioContext = new Ctx();
      ctxRef.current = ac;
      const src = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      setActive(true);
      activeRef.current = true;

      let scoreTick = 0;
      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        // RMS for dynamics.
        let sum = 0;
        for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
        const rms = Math.sqrt(sum / buf.length);
        statsRef.current.rmsSum += rms;
        statsRef.current.rmsFrames += 1;

        const f = autoCorrelate(buf, ac.sampleRate);
        statsRef.current.frames += 1;
        if (f > 50 && f < 1500) {
          const { name, octave } = freqToNote(f);
          setNote(`${name}${octave}`);
          historyRef.current.push(f);
          // Cents to nearest semitone (0 = perfect).
          const midi = 12 * Math.log2(f / 440) + 69;
          const cents = Math.abs(midi - Math.round(midi)) * 100;
          statsRef.current.voiced += 1;
          statsRef.current.stableCents += cents;
        } else {
          historyRef.current.push(0);
        }
        if (historyRef.current.length > 200) historyRef.current.shift();
        draw();
        scoreTick += 1;
        if (scoreTick % 30 === 0) setLiveScore(computeScore(statsRef.current));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setActive(false);
      activeRef.current = false;
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

  useEffect(() => () => stop(), []);

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
            {active && (
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                live <span className="font-mono text-[var(--neon-2)]">{liveScore}</span>
              </div>
            )}
          </div>
          {active ? (
            <Button size="sm" variant="outline" onClick={stop}><MicOff className="mr-1 size-4" /> Stop</Button>
          ) : (
            <Button size="sm" onClick={start}><Mic className="mr-1 size-4" /> Start</Button>
          )}
        </div>
      </div>
      <canvas ref={canvasRef} width={600} height={120} className="h-24 w-full rounded-lg bg-stage/60" />
    </div>
  );
});
