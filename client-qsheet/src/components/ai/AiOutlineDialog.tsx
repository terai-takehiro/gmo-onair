// ②台本の骨格を AI で作る（段8・04-ai.md §2-6・§3-1）。
//
// 生成 → プレビュー（チェックで取捨）→ 取り込み、の一往復だけを持つ。
// 「取り込み」は ①`applyProposalOps` で Yjs の `data` へ書く ②`POST /apply` へ記録、
// の順（§3-1・§4-2）。**取り込み前に人が外した行は `rejected_keys` で送る**（§3-4）。
import { useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { generateScriptOutline, discardProposal, applyProposalRemote, type AiProposal } from "@/lib/aiApi";
import { applyProposalOps, type ScriptOutlineProposal } from "@/lib/applyProposal";
import { notifySuccess, notifyError } from "@/lib/notify";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  documentId: string;
  scheduleItemId?: string;
  updateData: (updater: (data: any) => any) => void;
}

type RowKey = string; // `${sectionKey}::${rowKey}`

export default function AiOutlineDialog({ open, onOpenChange, documentId, scheduleItemId, updateData }: Props) {
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState<AiProposal<ScriptOutlineProposal> | null>(null);
  const [instruction, setInstruction] = useState("");
  const [excludedRows, setExcludedRows] = useState<Set<RowKey>>(new Set());
  const [excludedSections, setExcludedSections] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    try {
      const p = await generateScriptOutline(documentId, { scheduleItemId, instruction: instruction || undefined });
      setProposal(p);
      setExcludedRows(new Set());
      setExcludedSections(new Set());
    } catch (e) {
      notifyError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  function toggleSection(key: string) {
    setExcludedSections((s) => toggleSet(s, key));
  }
  function toggleRow(sectionKey: string, rowKey: string) {
    setExcludedRows((s) => toggleSet(s, `${sectionKey}::${rowKey}`));
  }

  async function handleApply() {
    if (!proposal) return;
    setApplying(true);
    try {
      const filtered: ScriptOutlineProposal = {
        budget_sec: proposal.proposal.budget_sec,
        sections: proposal.proposal.sections
          .filter((s) => !excludedSections.has(s.key))
          .map((s) => ({ ...s, rows: s.rows.filter((r) => !excludedRows.has(`${s.key}::${r.key}`)) })),
      };
      // ⚠️ `sideResult` は `updateData` の `updater`（`prev` の関数）の中でしか作れない
      // （§3-1・§4-2）。box に入れるのは、TS が閉包内の再代入を外側で正しく絞り込めない
      // ため（`let` を直接絞り込むと `never` に潰れる）。
      const box: { result: ReturnType<typeof applyProposalOps> | null } = { result: null };
      updateData((prev) => {
        box.result = applyProposalOps(prev, "script_outline_draft", filtered);
        return box.result.data;
      });
      const result = box.result;
      if (!result) throw new Error("取り込みに失敗しました");
      const rejectedKeys = [...excludedSections, ...[...excludedRows].map((k) => k.split("::")[1])];
      await applyProposalRemote(proposal.id, {
        applied_payload: result.appliedPayload, applied_ids: result.appliedIds, rejected_keys: rejectedKeys,
      });
      notifySuccess(`骨格を取り込みました（ロール${result.appliedIds.sections.length}件・行${result.appliedIds.rows.length}件）`);
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
          <DialogTitle>AIで骨格を作る</DialogTitle>
        </DialogHeader>
        {!proposal && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              案件・会場・過去の似た回から、ロールと尺の並びの叩き台を作ります。本文（セリフ）は書きません。
            </p>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="追加の指示（任意）例: 懇親会の時間を入れたい"
              className="w-full min-h-[80px] rounded-md border border-input bg-background p-2 text-sm"
            />
            <DialogFooter>
              <Button onClick={handleGenerate} disabled={loading} className="min-h-[44px]">
                {loading ? "考えています…" : "骨格を作る"}
              </Button>
            </DialogFooter>
          </div>
        )}
        {proposal && (
          <div className="space-y-3">
            <div className="max-h-[50vh] overflow-y-auto space-y-2">
              {proposal.proposal.sections.map((s) => (
                <div key={s.key} className="border border-border rounded-md p-2">
                  <label className="flex items-center gap-2 font-semibold text-sm">
                    <input type="checkbox" className="w-5 h-5" checked={!excludedSections.has(s.key)}
                      onChange={() => toggleSection(s.key)} />
                    {s.label}（{Math.round(s.duration_sec / 60)}分）
                  </label>
                  <div className="ml-6 mt-1 space-y-1">
                    {s.rows.map((r) => (
                      <label key={r.key} className="flex items-center gap-2 text-sub">
                        <input type="checkbox" className="w-5 h-5" checked={!excludedRows.has(`${s.key}::${r.key}`)}
                          onChange={() => toggleRow(s.key, r.key)} />
                        <span>{r.label}{r.speaker ? `（${r.speaker}）` : ""} — {r.hint || "（メモ無し）"}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {proposal.proposal.sections.length === 0 && (
                <p className="text-sm text-muted-foreground">提案が空でした。指示を変えて作り直してください。</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleDiscard} className="min-h-[44px]">やめる</Button>
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

function toggleSet<T>(s: Set<T>, v: T): Set<T> {
  const next = new Set(s);
  if (next.has(v)) next.delete(v); else next.add(v);
  return next;
}

function errorMessage(e: unknown): string {
  const err = e as { response?: { status?: number; data?: { error?: { message?: string } } } };
  if (err?.response?.status === 409) return "本番進行中のため AI 生成は使えません";
  if (err?.response?.status === 503) return "この環境は AI につないでいません";
  return err?.response?.data?.error?.message ?? "AI の呼び出しに失敗しました。手で作れます";
}
