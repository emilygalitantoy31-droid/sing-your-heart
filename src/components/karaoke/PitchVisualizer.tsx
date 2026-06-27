import { useEffect, useRef, useState } from "react";
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
  let T0 = maxpos;
  if (T0 <= 0) return -1;
  return sampleRate / T0;
}

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function freqToNote(f: number) {
  const n = 12 * (Math.log2(f / 440)) + 69;
  const r = Math.round(n);
  return { name: NOTES[r % 12], octave: Math.floor(r / 12) - 1 };
}

export function PitchVisualizer() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [active, setActive] = useState(false);
  const [note, setNote] = useState<string>("—");
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const historyRef = useRef<number[]>([]);

  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false }, video: false });
      streamRef.current = stream;
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      const ac: AudioContext = new Ctx();
      ctxRef.current = ac;
      const src = ac.createMediaStreamSource(stream);
      const analyser = ac.createAnalyser();
      analyser.fftSize = 2048;
      src.connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      setActive(true);

      const tick = () => {
        analyser.getFloatTimeDomainData(buf);
        const f = autoCorrelate(buf, ac.sampleRate);
        if (f > 50 && f < 1500) {
          const { name, octave } = freqToNote(f);
          setNote(`${name}${octave}`);
          historyRef.current.push(f);
        } else {
          historyRef.current.push(0);
        }
        if (historyRef.current.length > 200) historyRef.current.shift();
        draw();
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setActive(false);
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
          <p className="text-xs text-muted-foreground">Local mic · never uploaded</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-xl text-[var(--neon)]">{note}</span>
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
}
