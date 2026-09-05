// ③セリフを AI で作る（段8・04-ai.md §2-4・§2-6・§3-1）。
//
// **既にある行にしか書かない。行は増えも減りもしない。** 空欄なら「全行」ではなく
// 「本番ロールだけ」（サーバー側の既定・§2-6）。
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { generateScriptLines, discardProposal, applyProposalRemote, type AiProposal } from "@/lib/aiApi";
import { applyProposalOps, type ScriptLinesProposal } from "@/lib/applyProposal";
import { notifySuccess, notifyError } from "@/lib/notify";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  documentId: string;
  /** 選択中の行があれば渡す（無ければサーバーが「本番ロールだけ」を対象にする） */
  selectedRowIds?: string[];
  updateData: (updater: (data: any) => any) => void;
}

export default function AiLinesDialog({ open, onOpenChange, documentId, selectedRowIds, updateData }: Props) {
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState<AiProposal<ScriptLinesProposal> | null>(null);
  const [instruction, setInstruction] = useState("");
  const [excludedRowIds, setExcludedRowIds] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    try {
      const p = await generateScriptLines(documentId, {
        rowIds: selectedRowIds?.length ? selectedRowIds : undefined,
        instruction: instruction || undefined,
      });
      setProposal(p);
      setExcludedRowIds(new Set());
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  function toggleRow(rowId: string) {
    setExcludedRowIds((s) => {
      const n = new Set(s);
      if (n.has(rowId)) n.delete(rowId); else n.add(rowId);
      return n;
    });
  }

  async function handleApply() {
    if (!proposal) return;
    setApplying(true);
    try {
      const filtered: ScriptLinesProposal = {
        lines: proposal.proposal.lines.filter((l) => !excludedRowIds.has(l.row_id)),
        advice: (proposal.proposal.advice ?? []),
      };
      // ⚠️ box に入れる理由は AiOutlineDialog.tsx と同じ（`let` の閉包内再代入は
      // 外側で `never` に絞り込まれてしまう TS の制約を避けるため）。
      const box: { result: ReturnType<typeof applyProposalOps> | null } = { result: null };
      updateData((prev) => {
        box.result = applyProposalOps(prev, "script_line_draft", filtered);
        return box.result.data;
      });
      const result = box.result;
      if (!result) throw new Error("下書きを取り込めませんでした。もう一度お試しください。");
      await applyProposalRemote(proposal.id, {
        applied_payload: result.appliedPayload, applied_ids: result.appliedIds,
        rejected_keys: [...excludedRowIds],
      });
      notifySuccess(`下書き（セリフ）を取り込みました（${result.appliedIds.rows.length}行）`);
      onOpenChange(false);
      setProposal(null);
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
          <DialogTitle>AIで下書きを作る（セリフ）</DialogTitle>
        </DialogHeader>
        {!proposal && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {selectedRowIds?.length
                ? `選択中の${selectedRowIds.length}行に本文を作ります。`
                : "本番ロールの行に本文を作ります（映像・テロップ等は埋めません）。"}
            </p>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="追加の指示（任意）例: もう少し丁寧な言い回しにしたい"
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
              {proposal.proposal.lines.map((l) => (
                <label key={l.row_id} className="flex items-start gap-2 border border-border rounded-md p-2 text-sm">
                  <input type="checkbox" className="w-5 h-5 mt-0.5" checked={!excludedRowIds.has(l.row_id)}
                    onChange={() => toggleRow(l.row_id)} />
                  <span>
                    <span className="font-semibold">{l.name || "（話者未定）"}</span>
                    {l.is_q_word && <span className="ml-1 text-destructive">Q→</span>}
                    <br />
                    {l.text}
                  </span>
                </label>
              ))}
              {proposal.proposal.lines.length === 0 && (
                <p className="text-sm text-muted-foreground">提案が空でした。対象行や指示を変えて作り直してください。</p>
              )}
              {(proposal.proposal.advice ?? []).length > 0 && (
                <div className="text-sub text-muted-foreground border-t border-border pt-2">
                  <p className="font-semibold">AI からの助言（行は増やしていません）</p>
                  <ul className="list-disc ml-5">
                    {(proposal.proposal.advice ?? []).map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
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

function errorMessage(e: unknown): string {
  const err = e as { response?: { status?: number; data?: { error?: { message?: string } } } };
  if (err?.response?.status === 409) return "本番進行中のため AI 生成は使えません";
  if (err?.response?.status === 503) return "いまは AI を使えません。手で作れます。";
  if (err?.response?.status === 422) return "AI が下書きを作れませんでした。条件を変えて、もう一度お試しください。";
  return err?.response?.data?.error?.message ?? "AI を呼べませんでした。手で作れます。";
}
