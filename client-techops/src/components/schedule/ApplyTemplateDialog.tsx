// ひな形適用ダイアログ。実装設計: 04-schedule-impl.md §5-5
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import BufferedInput from "@/components/editor/BufferedInput";
import { fmtHmPad, parseHm } from "@gmo-onair/shared/src/schedule/time";
import { notifyError, notifySuccess } from "@/lib/notify";
import * as scheduleApi from "@/lib/scheduleApi";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scheduleId: string;
  locationId: string | null;
  onApplied: () => void;
}

export default function ApplyTemplateDialog({ open, onOpenChange, scheduleId, locationId, onApplied }: Props) {
  const [templateId, setTemplateId] = useState<string>("");
  const [onairStartMin, setOnairStartMin] = useState<number | null>(null);
  const [checkedCols, setCheckedCols] = useState<Set<string>>(new Set());
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  const templatesQuery = useQuery({
    queryKey: ["schedule-templates", locationId],
    queryFn: () => scheduleApi.listTemplates(locationId),
    enabled: open,
  });

  useEffect(() => {
    if (!templateId && templatesQuery.data && templatesQuery.data.length > 0) setTemplateId(templatesQuery.data[0].id);
  }, [templatesQuery.data, templateId]);

  const previewQuery = useQuery({
    queryKey: ["schedule-template-preview", templateId, scheduleId, onairStartMin],
    queryFn: () => scheduleApi.previewTemplate(templateId, scheduleId, onairStartMin),
    enabled: open && !!templateId,
  });

  useEffect(() => {
    if (!previewQuery.data) return;
    setCheckedCols(new Set(previewQuery.data.columns.filter((c) => !c.already_present).map((c) => c.col.id)));
    setCheckedItems(new Set(previewQuery.data.items.filter((i) => i.checked_by_default && i.start_min != null).map((i) => i.item.id)));
  }, [previewQuery.data]);

  const applyMutation = useMutation({
    mutationFn: () => scheduleApi.applyTemplate(scheduleId, templateId, [...checkedCols], [...checkedItems], onairStartMin),
    onSuccess: (result) => {
      notifySuccess(`列 ${result.created_columns} 件・項目 ${result.created_items} 件を追加しました`);
      if (result.skipped.length > 0) notifyError(`${result.skipped.length} 件は追加しませんでした: ${result.skipped.slice(0, 3).join(" / ")}`);
      onApplied();
      onOpenChange(false);
    },
    onError: () => notifyError("工程テンプレートを適用できませんでした。", { description: "少し待ってから、もう一度お試しください。" }),
  });

  const needsOnairStart = previewQuery.data?.requires_onair_start ?? false;
  const canApply = useMemo(
    () => !!templateId && (!needsOnairStart || onairStartMin != null) && (checkedCols.size > 0 || checkedItems.size > 0),
    [templateId, needsOnairStart, onairStartMin, checkedCols, checkedItems],
  );

  const toggle = (set: Set<string>, id: string, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>工程テンプレートを適用</DialogTitle></DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>工程テンプレート</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger className="mt-1 min-h-[44px]"><SelectValue placeholder="選んでください" /></SelectTrigger>
              <SelectContent>
                {(templatesQuery.data ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {needsOnairStart && (
            <div>
              <Label htmlFor="onair-start">本番開始時刻（この工程テンプレートに必要です）</Label>
              <BufferedInput
                id="onair-start"
                value={onairStartMin != null ? fmtHmPad(onairStartMin) : ""}
                onCommit={(v) => setOnairStartMin(parseHm(v))}
                className="mt-1 flex h-10 w-full max-w-[160px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder="19:00"
              />
            </div>
          )}

          {previewQuery.data && (
            <div className="max-h-[40vh] space-y-3 overflow-y-auto rounded-md border border-border p-3">
              <div>
                <div className="mb-1 text-xs font-semibold text-muted-foreground">列</div>
                {previewQuery.data.columns.map(({ col, already_present }) => (
                  <label key={col.id} className="flex min-h-[44px] items-center gap-2 text-sm">
                    <input type="checkbox" className="h-5 w-5" checked={checkedCols.has(col.id)}
                      onChange={() => toggle(checkedCols, col.id, setCheckedCols)} />
                    <span>{col.label}</span>
                    {already_present && <span className="text-xs text-muted-foreground">（すでに入っています）</span>}
                  </label>
                ))}
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-muted-foreground">項目</div>
                {previewQuery.data.items.map(({ item, start_min, end_min, already_applied }) => (
                  <label key={item.id} className="flex min-h-[44px] items-center gap-2 text-sm">
                    <input type="checkbox" className="h-5 w-5" checked={checkedItems.has(item.id)}
                      onChange={() => toggle(checkedItems, item.id, setCheckedItems)} />
                    {/* 日付の期間ではなく時刻の範囲なので <DateRange> の対象外 */}
                    <span className={start_min == null ? "text-destructive" : ""}>
                      {start_min != null ? `${fmtHmPad(start_min)}〜${fmtHmPad(end_min!)}` : "時刻が決まりません"} ・ {item.title} {/* ui-tokens-ok */}
                    </span>
                    {already_applied && <span className="text-xs text-muted-foreground">（すでに入っています）</span>}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button className="min-h-[44px]" disabled={!canApply || applyMutation.isPending} onClick={() => applyMutation.mutate()}>
            適用する
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
