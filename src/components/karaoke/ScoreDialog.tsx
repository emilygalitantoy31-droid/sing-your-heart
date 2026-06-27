import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function ScoreDialog({
  open, onOpenChange, roomId, queueItemId, singerId, singerName, judgedBy, onScored,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roomId: string;
  queueItemId: string;
  singerId: string | null;
  singerName: string;
  judgedBy: string;
  onScored: () => void;
}) {
  const [score, setScore] = useState(80);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!singerId) {
      onOpenChange(false);
      onScored();
      return;
    }
    setBusy(true);
    const { error } = await supabase.from("scores").insert({
      room_id: roomId, queue_item_id: queueItemId, singer_id: singerId, judged_by: judgedBy, score,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Scored ${score} for ${singerName}`);
    onOpenChange(false);
    onScored();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Score this take</DialogTitle>
          <DialogDescription>
            {singerId ? `How did ${singerName} do?` : "No singer assigned — you can skip scoring."}
          </DialogDescription>
        </DialogHeader>
        {singerId && (
          <div className="space-y-4 py-2">
            <div className="text-center">
              <div className="text-6xl font-display font-black text-gradient">{score}</div>
              <div className="mt-1 text-xs uppercase tracking-widest text-muted-foreground">/ 100</div>
            </div>
            <Slider value={[score]} onValueChange={(v) => setScore(v[0])} min={0} max={100} step={1} />
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => { onOpenChange(false); onScored(); }}>
            Skip
          </Button>
          {singerId && (
            <Button className="flex-1 font-semibold" onClick={submit} disabled={busy}>
              {busy ? "Saving…" : "Submit"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
