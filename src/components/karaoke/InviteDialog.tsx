import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Share2, Copy, Check } from "lucide-react";
import { toast } from "sonner";

export function InviteDialog({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<string>("");
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const link = typeof window !== "undefined" ? `${window.location.origin}/rooms/${code}` : `/rooms/${code}`;

  useEffect(() => {
    if (!open) return;
    QRCode.toDataURL(link, { width: 320, margin: 1, color: { dark: "#0b0b14", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(""));
  }, [open, link]);

  async function copy(value: string, kind: "link" | "code") {
    await navigator.clipboard.writeText(value);
    setCopied(kind);
    toast.success(kind === "link" ? "Link copied" : "Code copied");
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="font-semibold">
          <Share2 className="mr-1 size-4" /> Invite
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite singers</DialogTitle>
          <DialogDescription>Share the QR, link, or code. Guests need to sign in to join.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <div className="rounded-2xl border border-border bg-white p-3">
            {qr ? (
              <img src={qr} alt="Room QR code" className="size-56" />
            ) : (
              <div className="size-56 animate-pulse rounded bg-muted" />
            )}
          </div>

          <div className="w-full space-y-2">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Link</label>
            <div className="flex gap-2">
              <Input readOnly value={link} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button type="button" variant="outline" size="icon" onClick={() => copy(link, "link")} aria-label="Copy link">
                {copied === "link" ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
          </div>

          <div className="w-full space-y-2">
            <label className="text-xs uppercase tracking-widest text-muted-foreground">Room code</label>
            <div className="flex gap-2">
              <Input readOnly value={code} className="font-mono text-lg tracking-[0.4em] uppercase" />
              <Button type="button" variant="outline" size="icon" onClick={() => copy(code, "code")} aria-label="Copy code">
                {copied === "code" ? <Check className="size-4" /> : <Copy className="size-4" />}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
