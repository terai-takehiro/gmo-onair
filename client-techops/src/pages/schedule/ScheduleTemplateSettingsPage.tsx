// ひな形の編集（設定）。PC 専用。実装設計: 04-schedule-impl.md §5-1・§11-1
//
// ⚠️ このアプリはまだ shared/src/client-v4/pcOnly.tsx の実際のゲートに載せ替えていない
// （client-techops/CLAUDE.md）。ここでは自前の簡易な PC 専用案内を出す。
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { notifyError, notifySuccess } from "@/lib/notify";
import api from "@/lib/api";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { COL_GROUP_LABEL, ITEM_KIND_DEFS, type ColGroup } from "@gmo-onair/shared/src/schedule/kinds";
import type { ScheduleTemplate } from "@gmo-onair/shared/src/schedule/types";

function PcOnlyNotice() {
  return (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-lg font-semibold text-foreground">ひな形の編集は PC で行ってください</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        列・項目の組み合わせを一度に見ながら組む画面のため、幅の狭い端末には対応していません。
      </p>
      <p className="mt-4 text-sm text-muted-foreground">スマホでは「スケジュール表」の一覧・適用は利用できます。</p>
    </div>
  );
}

export default function ScheduleTemplateSettingsPage() {
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const templatesQuery = useQuery({
    queryKey: ["schedule-templates", null],
    queryFn: async () => (await api.get<{ success: boolean; data: ScheduleTemplate[] }>("/techops/schedule-templates")).data.data,
  });

  const createMutation = useMutation({
    mutationFn: async () => (await api.post<{ success: boolean; data: { id: string } }>("/techops/schedule-templates", { name: newName })).data.data,
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["schedule-templates", null] });
      setNewName("");
      setSelectedId(row.id);
    },
    onError: () => notifyError("作成に失敗しました（管理者のみ作成できます）"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/techops/schedule-templates/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["schedule-templates", null] }); setSelectedId(null); notifySuccess("削除しました"); },
    onError: () => notifyError("削除に失敗しました"),
  });

  if (isMobile) return <PcOnlyNotice />;

  const templates = templatesQuery.data ?? [];
  const selected = templates.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="text-xl font-semibold text-foreground">スケジュール表のひな形</h1>
      <p className="mt-1 text-sm text-muted-foreground">拠点ごとの標準の列・項目を作っておくと、当日の表に一括で流し込めます。</p>

      <div className="mt-6 grid grid-cols-3 gap-6">
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="新しいひな形の名前" className="min-h-[44px]" />
            <Button className="min-h-[44px]" disabled={!newName.trim() || createMutation.isPending} onClick={() => createMutation.mutate()}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <ul className="divide-y divide-border rounded-md border border-border">
            {templates.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className={`flex w-full min-h-[44px] items-center justify-between px-3 text-left text-sm ${selectedId === t.id ? "bg-accent" : ""}`}
                >
                  <span>{t.name}{t.is_system && <span className="ml-2 text-xs text-muted-foreground">（標準）</span>}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="col-span-2">
          {selected ? (
            <TemplateDetail template={selected} onDelete={() => deleteMutation.mutate(selected.id)} />
          ) : (
            <p className="text-sm text-muted-foreground">左からひな形を選んでください。</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TemplateDetail({ template, onDelete }: { template: ScheduleTemplate; onDelete: () => void }) {
  const queryClient = useQueryClient();
  const [colGroup, setColGroup] = useState<ColGroup>("venue");
  const [colLabel, setColLabel] = useState("");
  const [itemColumnId, setItemColumnId] = useState(template.columns[0]?.id ?? "");
  const [itemTitle, setItemTitle] = useState("");

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["schedule-templates", null] });

  const addColumn = useMutation({
    mutationFn: () => api.post(`/techops/schedule-templates/${template.id}/columns`, { col_group: colGroup, label: colLabel }),
    onSuccess: () => { setColLabel(""); invalidate(); },
    onError: () => notifyError("列を追加できませんでした"),
  });
  const removeColumn = useMutation({
    mutationFn: (columnId: string) => api.delete(`/techops/schedule-templates/columns/${columnId}`),
    onSuccess: invalidate,
  });
  const addItem = useMutation({
    mutationFn: () => api.post(`/techops/schedule-templates/${template.id}/items`, { column_id: itemColumnId, title: itemTitle }),
    onSuccess: () => { setItemTitle(""); invalidate(); },
    onError: () => notifyError("項目を追加できませんでした"),
  });
  const removeItem = useMutation({
    mutationFn: (itemId: string) => api.delete(`/techops/schedule-templates/items/${itemId}`),
    onSuccess: invalidate,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-foreground">{template.name}</h2>
        {!template.is_system && (
          <Button variant="destructive" size="sm" className="min-h-[44px]" onClick={onDelete}>
            <Trash2 className="mr-1 h-4 w-4" />このひな形を消す
          </Button>
        )}
      </div>

      <section>
        <h3 className="text-sm font-medium text-foreground">列</h3>
        <ul className="mt-2 divide-y divide-border rounded-md border border-border">
          {template.columns.map((c) => (
            <li key={c.id} className="flex min-h-[44px] items-center justify-between px-3 text-sm">
              <span>{COL_GROUP_LABEL[c.col_group]} ・ {c.label}</span>
              <button type="button" onClick={() => removeColumn.mutate(c.id)} className="text-muted-foreground hover:text-destructive">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <Select value={colGroup} onValueChange={(v) => setColGroup(v as ColGroup)}>
            <SelectTrigger className="min-h-[44px] w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["venue", "prep", "ops"] as ColGroup[]).map((g) => <SelectItem key={g} value={g}>{COL_GROUP_LABEL[g]}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input value={colLabel} onChange={(e) => setColLabel(e.target.value)} placeholder="列名" className="min-h-[44px]" />
          <Button className="min-h-[44px]" disabled={!colLabel.trim()} onClick={() => addColumn.mutate()}>追加</Button>
        </div>
      </section>

      <section>
        <h3 className="text-sm font-medium text-foreground">項目</h3>
        <ul className="mt-2 divide-y divide-border rounded-md border border-border">
          {template.items.map((i) => {
            const col = template.columns.find((c) => c.id === i.column_id);
            return (
              <li key={i.id} className="flex min-h-[44px] items-center justify-between px-3 text-sm">
                <span>{col?.label ?? "?"} ・ {i.title}（{ITEM_KIND_DEFS.find((k) => k.kind === i.kind)?.label ?? i.kind}）</span>
                <button type="button" onClick={() => removeItem.mutate(i.id)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-2 flex gap-2">
          <Select value={itemColumnId} onValueChange={setItemColumnId}>
            <SelectTrigger className="min-h-[44px] w-40"><SelectValue placeholder="列" /></SelectTrigger>
            <SelectContent>
              {template.columns.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} placeholder="項目名" className="min-h-[44px]" />
          <Button className="min-h-[44px]" disabled={!itemColumnId || !itemTitle.trim()} onClick={() => addItem.mutate()}>追加</Button>
        </div>
      </section>
    </div>
  );
}
