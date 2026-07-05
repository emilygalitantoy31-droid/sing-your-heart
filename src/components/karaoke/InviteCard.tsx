import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

export function InviteCard({ code }: { code: string }) {
  const [qr, setQr] = useState<string>("");
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const link = typeof window !== "undefined" ? `${window.location.origin}/join/${code}` : `/join/${code}`;

  useEffect(() => {
    QRCode.toDataURL(link, { width: 320, margin: 1, color: { dark: "#0b0b14", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(""));
  }, [link]);

  async function copy(value: string, kind: "link" | "code") {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    toast.success(kind === "link" ? "Link copied" : "Code copied");
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Invite</h2>
        <span className="text-xs uppercase tracking-widest text-muted-foreground">Scan to join</span>
      </div>
      <div className="flex flex-col items-center gap-3">
        <div className="rounded-xl border border-border bg-white p-2">
          {qr ? (
            <img src={qr} alt="Room QR code" className="size-40" />
          ) : (
            <div className="size-40 animate-pulse rounded bg-muted" />
          )}
        </div>
        <div className="flex w-full items-center gap-2">
          <div className="min-w-0 flex-1 truncate rounded-lg border border-border bg-stage/40 px-3 py-2 font-mono text-xs">
            {link}
          </div>
          <Button type="button" variant="outline" size="icon" onClick={() => copy(link, "link")} aria-label="Copy link">
            {copied === "link" ? <Check className="size-4" /> : <Copy className="size-4" />}
          </Button>
        </div>
        <button
          type="button"
          onClick={() => copy(code, "code")}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-stage/40 px-3 py-2 hover:border-[var(--neon)]"
        >
          <span className="text-xs uppercase tracking-widest text-muted-foreground">Code</span>
          <span className="font-mono text-lg tracking-[0.4em] text-[var(--neon)]">{code}</span>
          {copied === "code" ? <Check className="size-4" /> : <Copy className="size-3.5 text-muted-foreground" />}
        </button>
      </div>
    </div>
  );
}
