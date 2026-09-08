// ひな形設定 — 項目の一覧・追加・編集。14-schedule-v2-plan.md §3 A7
//
// 以前は列と題しか入れられず、区分・基準・オフセット・尺・必須は
// 常定値（other / day / 0 / 30 / 必須）のままだった。編集（PUT）も無く、
// 直すには消して作り直すしかなかった（監査 2026-09-06 の穴 #9）。
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formGrid2 } from "@gmo-onair/shared/src/client-v4/formDialog";
import { ITEM_KIND_DEFS } from "@gmo-onair/shared/src/schedule/kinds";
import type { ScheduleTemplate, ScheduleTemplateItem, TemplateAnchor } from "@gmo-onair/shared/src/schedule/types";
import { notifyError } from "@/lib/notify";
import api from "@/lib/api";

const ANCHOR_OPTIONS: { value: TemplateAnchor; label: string }[] = [
  { value: "day", label: "当日 00:00 から" },
  { value: "onair", label: "本番開始から" },
];

interface Draft {
  columnId: string;
  title: string;
  kind: string;
  anchor: TemplateAnchor;
  offsetMin: number;
  durationMin: number;
  isRequired: boolean;
}

const emptyDraft = (columnId: string): Draft => ({ columnId, title: "", kind: "other", anchor: "day", offsetMin: 0, durationMin: 30, isRequired: true });
const draftOf = (item: ScheduleTemplateItem): Draft => ({
  columnId: item.column_id, title: item.title, kind: item.kind, anchor: item.anchor,
  offsetMin: item.offset_min, durationMin: item.duration_min, isRequired: item.is_required,
});

export default function TemplateItemsSection({ template }: { template: ScheduleTemplate }) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(template.columns[0]?.id ?? ""));

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["schedule-templates", null] });
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const startEdit = (item: ScheduleTemplateItem) => { setEditingId(item.id); setDraft(draftOf(item)); };
  const cancelEdit = () => { setEditingId(null); setDraft(emptyDraft(template.columns[0]?.id ?? "")); };

  // 列が増えた／選んでいた列が消えた（同じひな形のまま列を足す・削除する）ときに追随する。
  // 追随させないと「列を1本追加しただけの初回」に選択欄が空のままで「項目を追加」を押せない
  // （旧実装から split したときに一度落として気づいた不具合。編集中は差し替えない）
  useEffect(() => {
    if (editingId) return;
    setDraft((d) => (
      d.columnId && template.columns.some((c) => c.id === d.columnId)
        ? d
        : { ...d, columnId: template.columns[0]?.id ?? "" }
    ));
  }, [template.columns, editingId]);

  const body = () => ({
    column_id: draft.columnId, title: draft.title, kind: draft.kind,
    anchor: draft.anchor, offset_min: draft.offsetMin, duration_min: draft.durationMin, is_required: draft.isRequired,
  });

  const addItem = useMutation({
    mutationFn: () => api.post(`/techops/schedule-templates/${template.id}/items`, body()),
    onSuccess: () => { cancelEdit(); invalidate(); },
    onError: () => notifyError("項目を追加できませんでした"),
  });
  const updateItem = useMutation({
    mutationFn: () => api.put(`/techops/schedule-templates/items/${editingId}`, body()),
    onSuccess: () => { cancelEdit(); invalidate(); },
    onError: () => notifyError("項目を直せませんでした"),
  });
  const removeItem = useMutation({
    mutationFn: (itemId: string) => api.delete(`/techops/schedule-templates/items/${itemId}`),
    onSuccess: (_data, itemId) => { if (editingId === itemId) cancelEdit(); invalidate(); },
    onError: () => notifyError("項目を削除できませんでした"),
  });

  const canSubmit = !!draft.columnId && !!draft.title.trim();

  return (
    <section>
      <h3 className="text-list text-foreground">項目</h3>
      <ul className="mt-2 divide-y divide-border overflow-hidden rounded-card border border-border">
        {template.items.map((i) => {
          const col = template.columns.find((c) => c.id === i.column_id);
          const anchorLabel = ANCHOR_OPTIONS.find((a) => a.value === i.anchor)?.label ?? i.anchor;
          return (
            <li key={i.id} className={`flex min-h-tap items-center justify-between gap-2 px-3 text-sub ${editingId === i.id ? "bg-accent" : ""}`}>
              <span className="min-w-0 truncate">
                {col?.label ?? "?"} ・ {i.title}（{ITEM_KIND_DEFS.find((k) => k.kind === i.kind)?.label ?? i.kind}）
                <span className="text-sub-sm text-muted-foreground"> ・ {anchorLabel} {i.offset_min >= 0 ? "+" : ""}{i.offset_min}分 ・ {i.duration_min}分{i.is_required ? "" : " ・ 任意"}</span>
              </span>
              <span className="flex shrink-0 gap-1">
                <button type="button" onClick={() => startEdit(i)} aria-label={`項目「${i.title}」を編集`} className="text-muted-foreground hover:text-foreground">
                  <Pencil className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => removeItem.mutate(i.id)} aria-label={`項目「${i.title}」を削除`} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 space-y-2 rounded-card border border-border p-3">
        {editingId && (
          <div className="flex items-center justify-between text-sub-sm text-muted-foreground">
            <span>項目を直しています</span>
            <button type="button" onClick={cancelEdit} className="inline-flex items-center gap-0.5 hover:text-foreground">
              <X className="h-3.5 w-3.5" />やめる
            </button>
          </div>
        )}
        <div className={formGrid2}>
          <div>
            <Label className="text-sub-sm text-muted-foreground">列</Label>
            <Select value={draft.columnId} onValueChange={(v) => set("columnId", v)}>
              <SelectTrigger className="mt-1 min-h-tap"><SelectValue placeholder="列" /></SelectTrigger>
              <SelectContent>
                {template.columns.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sub-sm text-muted-foreground">項目名</Label>
            <Input value={draft.title} onChange={(e) => set("title", e.target.value)} className="mt-1 min-h-tap" placeholder="例: リハーサル" />
          </div>
        </div>
        <div className={formGrid2}>
          <div>
            <Label className="text-sub-sm text-muted-foreground">区分</Label>
            <Select value={draft.kind} onValueChange={(v) => set("kind", v)}>
              <SelectTrigger className="mt-1 min-h-tap"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ITEM_KIND_DEFS.map((k) => <SelectItem key={k.kind} value={k.kind}>{k.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sub-sm text-muted-foreground">基準</Label>
            <Select value={draft.anchor} onValueChange={(v) => set("anchor", v as TemplateAnchor)}>
              <SelectTrigger className="mt-1 min-h-tap"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ANCHOR_OPTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className={formGrid2}>
          <div>
            <Label className="text-sub-sm text-muted-foreground">オフセット（分。基準からの位置。マイナス可）</Label>
            <Input type="number" value={draft.offsetMin} onChange={(e) => set("offsetMin", Number(e.target.value) || 0)} className="mt-1 min-h-tap" />
          </div>
          <div>
            <Label className="text-sub-sm text-muted-foreground">尺（分）</Label>
            <Input type="number" min={1} value={draft.durationMin} onChange={(e) => set("durationMin", Math.max(1, Number(e.target.value) || 1))} className="mt-1 min-h-tap" />
          </div>
        </div>
        <label className="flex min-h-tap items-center gap-2 text-sub text-foreground">
          <input type="checkbox" className="h-5 w-5" checked={draft.isRequired} onChange={(e) => set("isRequired", e.target.checked)} />
          必須（適用時に既定でチェックが入る）
        </label>
        <Button
          className="min-h-tap w-full"
          disabled={!canSubmit || addItem.isPending || updateItem.isPending}
          onClick={() => (editingId ? updateItem.mutate() : addItem.mutate())}
        >
          {editingId ? "更新する" : "項目を追加"}
        </Button>
      </div>
    </section>
  );
}
