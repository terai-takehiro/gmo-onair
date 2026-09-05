// ①イベント設計（枠の叩き台）を AI で作る（段8・04-ai.md §10-1・§10-2）。
//
// ②③と違い `data`（Yjs）ではなく `qsheet_schedule_items` への REST 書き込みなので、
// 取り込みは `applyEventPlanOps`（`lib/applyEventPlan.ts`）を使う。
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DateRange } from "@gmo-onair/shared/src/client/ui/dateRange";
import { generateEventPlan, discardProposal, applyProposalRemote, type AiProposal, type EventPlanProposal } from "@/lib/aiApi";
import { applyEventPlanOps } from "@/lib/applyEventPlan";
import { notifySuccess, notifyError } from "@/lib/notify";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scheduleId: string;
  existingColumnIds: string[];
  onApplied: () => void; // 一覧の再読み込み
}

export default function EventPlanDialog({ open, onOpenChange, scheduleId, existingColumnIds, onApplied }: Props) {
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState<AiProposal<EventPlanProposal> | null>(null);
  const [instruction, setInstruction] = useState("");
  const [excludedKeys, setExcludedKeys] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    try {
      const p = await generateEventPlan(scheduleId, instruction || undefined);
      setProposal(p);
      setExcludedKeys(new Set());
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  function toggle(key: string) {
    setExcludedKeys((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  }

  async function handleApply() {
    if (!proposal) return;
    setApplying(true);
    try {
      const selected = new Set(proposal.proposal.items.map((i) => i.key).filter((k) => !excludedKeys.has(k)));
      const result = await applyEventPlanOps(
        scheduleId, proposal.proposal, selected, new Set(existingColumnIds),
      );
      await applyProposalRemote(proposal.id, {
        applied_payload: result.appliedPayload, applied_ids: result.appliedIds,
        rejected_keys: [...excludedKeys],
      });
      notifySuccess(`下書き（当日の枠）を取り込みました（${result.appliedIds.items.length}件）`);
      onOpenChange(false);
      setProposal(null);
      onApplied();
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setApplying(false);
    }
  }

  async function handleDiscard() {
    if (!proposal) return;
    await discardProposal(proposal.id).catch(() => {});
    setProposal(null);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>AIで下書きを作る（当日の枠）</DialogTitle>
        </DialogHeader>
        {!proposal && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              案件・会場・既に入っている項目から、当日の進行枠の下書きを作ります。
            </p>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="追加の指示（任意）例: 懇親会を入れたい"
              className="w-full min-h-[80px] rounded-md border border-input bg-background p-2 text-sm"
            />
            <DialogFooter>
              <Button onClick={handleGenerate} disabled={loading} className="min-h-[44px]">
                {loading ? "考えています…" : "下書きを作る"}
              </Button>
            </DialogFooter>
          </div>
        )}
        {proposal && (
          <div className="space-y-3">
            <div className="max-h-[50vh] overflow-y-auto space-y-2">
              {proposal.proposal.items.map((it) => (
                <label key={it.key} className="flex items-start gap-2 border border-border rounded-md p-2 text-sm">
                  <input type="checkbox" className="w-5 h-5 mt-0.5" checked={!excludedKeys.has(it.key)}
                    onChange={() => toggle(it.key)} />
                  <span>
                    <DateRange start={fmtMin(it.start_min)} end={fmtMin(it.end_min)} collapseSameDay={false} />{" "}
                    <span className="font-semibold">{it.title}</span>
                    {it.assignee && <span className="text-muted-foreground">（{it.assignee}）</span>}
                    {it.reason && <><br /><span className="text-sub text-muted-foreground">{it.reason}</span></>}
                  </span>
                </label>
              ))}
              {proposal.proposal.items.length === 0 && (
                <p className="text-sm text-muted-foreground">提案が空でした。指示を変えて作り直してください。</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleDiscard} className="min-h-[44px]">キャンセル</Button>
              <Button onClick={handleApply} disabled={applying} className="min-h-[44px]">
                {applying ? "取り込み中…" : "取り込む"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function fmtMin(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function errorMessage(e: unknown): string {
  const err = e as { response?: { status?: number; data?: { error?: { message?: string } } } };
  if (err?.response?.status === 503) return "いまは AI を使えません。手で作れます。";
  return err?.response?.data?.error?.message ?? "AI を呼べませんでした。手で作れます。";
}
