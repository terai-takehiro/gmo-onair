/**
 * みんなで書くメモとチェックリスト (案件の同時編集)
 *
 * **ここだけは2人で同時に打っても消えない**。メモは文字単位でマージされるので、
 * 同じ段落を同時に触っても両方残る (保存ボタンは無い = 打った時点で共有される)。
 *
 * 金額と案件の中身 (フォームの欄) はここに含めない。あちらは `projects` の列で
 * 書き手が他にもいるため、Yjs を重ねると同じ列への書き手が2系統になる。
 * 代わりに「誰がどの欄を触っているか」をフォーム側に出している。
 */
import { useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { NotebookPen, Plus, Trash2, Users, WifiOff } from "lucide-react";
import * as Y from "yjs";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ChecklistItem, ProjectCollabDoc } from "@gmo-onair/shared/src/collab/projectCollabDoc";
import {
  addChecklistItem,
  removeChecklistItem,
  setNotes,
  updateChecklistItem,
} from "../lib/projectCollabOps";

/** 'YYYY-MM-DD HH:mm' ⇄ datetime-local */
const toInput = (v: string | null | undefined) => (v ? v.replace(" ", "T").slice(0, 16) : "");
const fromInput = (v: string) => (v ? v.replace("T", " ").slice(0, 16) : null);

function isOverdue(due: string | null | undefined): boolean {
  if (!due) return false;
  const t = new Date(due.replace(" ", "T")).getTime();
  return Number.isFinite(t) && t < Date.now();
}

/**
 * メモ欄。
 *
 * 他の人の編集が届いたときにカーソルが末尾へ飛ばないよう、value は React に
 * 任せず DOM を直接更新し、変わった位置よりカーソルが後ろなら差分ぶんずらす。
 */
function NotesArea({
  value,
  disabled,
  onChange,
  onFocus,
  onBlur,
}: {
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || el.value === value) return;
    const prev = el.value;
    const focused = document.activeElement === el;
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? 0;

    let head = 0;
    const max = Math.min(prev.length, value.length);
    while (head < max && prev[head] === value[head]) head++;
    const delta = value.length - prev.length;

    el.value = value;
    if (focused) {
      const adj = (pos: number) => (pos <= head ? pos : Math.max(head, pos + delta));
      el.setSelectionRange(adj(start), adj(end));
    }
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={6}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder="打合せで決まったこと、引き継ぎ、気づいたこと。ここは保存ボタンがありません（打った時点で共有されます）。"
      className="w-full rounded-control border border-border bg-card px-3 py-2 text-[13px] leading-relaxed text-foreground disabled:bg-secondary/40 disabled:text-secondary-foreground"
      aria-label="作業メモ"
    />
  );
}

export function ProjectCollabCard({
  projectId,
  canEdit,
  synced,
  failed,
  doc,
  mutate,
  presenceCount,
  setField,
}: {
  projectId: string;
  canEdit: boolean;
  synced: boolean;
  failed: boolean;
  doc: ProjectCollabDoc;
  mutate: (fn: (ydoc: Y.Doc) => void) => void;
  presenceCount: number;
  setField: (field: string | null) => void;
}) {
  const [newText, setNewText] = useState("");

  // 編集できない人 (閲覧のみ) と、同時編集に繋がらなかったときは
  // 保存済みのスナップショットを HTTP で読んで**読み取り専用**で見せる。
  const readOnly = !canEdit || failed;
  const { data: snapshot } = useQuery<ProjectCollabDoc>({
    queryKey: ["project-collab", projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}/collab`)).data.data,
    enabled: readOnly,
    refetchOnMount: "always",
  });

  const view: ProjectCollabDoc = readOnly
    ? snapshot ?? { notes: "", checklist: [] }
    : doc;
  const checklist: ChecklistItem[] = Array.isArray(view.checklist) ? view.checklist : [];
  const open = checklist.filter((c) => !c.done).length;

  const add = () => {
    const t = newText.trim();
    if (!t) return;
    mutate((ydoc) => addChecklistItem(ydoc, t));
    setNewText("");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <NotebookPen className="h-4 w-4 text-primary" aria-hidden="true" />
          みんなで書くメモ
          {open > 0 && (
            <span className="rounded-full bg-warning-surface px-2 py-0.5 text-[12px] font-bold text-warning-strong">
              未完了 {open}件
            </span>
          )}
          {!readOnly && presenceCount > 1 && (
            <span className="flex items-center gap-1 text-[12px] font-normal text-secondary-foreground">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {presenceCount}人が開いています
            </span>
          )}
          <span className="ml-auto text-[12px] font-normal text-muted-foreground">
            {readOnly ? "読み取り専用" : "保存ボタンはありません"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {failed && canEdit && (
          <p className="flex items-start gap-1.5 rounded-control border border-warning bg-warning-surface px-3 py-2 text-[12px] font-bold text-warning-strong">
            <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            同時編集に繋がりませんでした。いまは読むだけにしています（この画面を開き直すと繋ぎ直します）。
          </p>
        )}

        <NotesArea
          value={view.notes ?? ""}
          disabled={readOnly || !synced}
          onChange={(next) => mutate((ydoc) => setNotes(ydoc, next))}
          onFocus={() => setField("作業メモ")}
          onBlur={() => setField(null)}
        />

        <div className="space-y-1.5">
          {checklist.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              チェックリストはまだありません。
              {readOnly ? "" : "下の欄に書くと、この案件を開いている全員に見えます。"}
            </p>
          ) : (
            <ul className="space-y-1">
              {checklist.map((it) => (
                <li key={it.id} className="flex flex-wrap items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!!it.done}
                    disabled={readOnly || !synced}
                    onChange={(e) =>
                      mutate((ydoc) => updateChecklistItem(ydoc, it.id, { done: e.target.checked }))
                    }
                    className="h-4 w-4 shrink-0"
                    aria-label={`${it.text} を完了にする`}
                  />
                  {/* 1行=1項目なので、同じ行を同時に打った場合だけ後勝ちになる (粒度が小さいので許容) */}
                  <input
                    value={it.text}
                    disabled={readOnly || !synced}
                    onChange={(e) =>
                      mutate((ydoc) => updateChecklistItem(ydoc, it.id, { text: e.target.value }))
                    }
                    onFocus={() => setField("チェックリスト")}
                    onBlur={() => setField(null)}
                    className={cn(
                      "min-w-0 flex-1 rounded-control border border-border bg-card px-2 py-1.5 text-[13px] text-foreground disabled:bg-secondary/40",
                      it.done && "text-muted-foreground line-through",
                    )}
                    aria-label="チェックリストの項目"
                  />
                  <input
                    type="datetime-local"
                    value={toInput(it.due_at)}
                    disabled={readOnly || !synced}
                    onChange={(e) =>
                      mutate((ydoc) =>
                        updateChecklistItem(ydoc, it.id, { due_at: fromInput(e.target.value) }),
                      )
                    }
                    className={cn(
                      "shrink-0 rounded-control border border-border bg-card px-2 py-1.5 text-[12px] disabled:bg-secondary/40",
                      !it.done && isOverdue(it.due_at) ? "border-destructive text-destructive" : "text-foreground",
                    )}
                    aria-label="期限（何月何日何時何分まで）"
                  />
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => mutate((ydoc) => removeChecklistItem(ydoc, it.id))}
                      disabled={!synced}
                      className="shrink-0 rounded-control p-1.5 text-muted-foreground hover:bg-secondary hover:text-destructive"
                      aria-label="この項目を消す"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {!readOnly && (
            <div className="flex items-center gap-2 pt-1">
              <input
                value={newText}
                disabled={!synced}
                onChange={(e) => setNewText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  }
                }}
                placeholder="やることを1行で（期限は入れたあとに直せます）"
                className="min-w-0 flex-1 rounded-control border border-border bg-card px-2 py-1.5 text-[13px] text-foreground"
                aria-label="チェックリストに追加する"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 shrink-0 gap-1.5"
                disabled={!synced || !newText.trim()}
                onClick={add}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                追加
              </Button>
            </div>
          )}
        </div>

        <p className="text-[12px] text-muted-foreground">
          ここは2人で同時に書いても消えません（文字単位で合わせます）。
          <span className="font-bold">金額と案件の中身は対象外です</span> —
          あちらは全項目まとめて保存するので、右上の「保存」を押してください。
        </p>
      </CardContent>
    </Card>
  );
}

export default ProjectCollabCard;
