// ひな形の編集（設定）。PC 専用。実装設計: 04-schedule-impl.md §5-1・§11-1
// 導線・複製・名称編集・項目の中身編集は 14-schedule-v2-plan.md §3 A7 で追加。
//
// ⚠️ このアプリはまだ shared/src/client-v4/pcOnly.tsx の実際のゲートに載せ替えていない
// （client-techops/CLAUDE.md）。ここでは自前の簡易な PC 専用案内を出す。
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formGrid2 } from "@gmo-onair/shared/src/client-v4/formDialog";
import { notifyError, notifySuccess } from "@/lib/notify";
import api from "@/lib/api";
import * as scheduleApi from "@/lib/scheduleApi";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { COL_GROUP_LABEL, type ColGroup } from "@gmo-onair/shared/src/schedule/kinds";
import type { ScheduleTemplate } from "@gmo-onair/shared/src/schedule/types";
import TemplateItemsSection from "./TemplateItemsSection";

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
  const [searchParams] = useSearchParams();
  // `?template=<id>`（`ApplyTemplateDialog.tsx` の「ひな形を直す」から）で開いたひな形を選ぶ
  const [selectedId, setSelectedId] = useState<string | null>(() => searchParams.get("template"));
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
    onError: () => notifyError("ひな形を作れませんでした。", { description: "ひな形を作れるのは 制作技術支援の「管理」を持つ人だけです。" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/techops/schedule-templates/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["schedule-templates", null] }); setSelectedId(null); notifySuccess("削除しました"); },
    onError: () => notifyError("削除できませんでした。", { description: "少し待ってから、もう一度お試しください。" }),
  });

  const duplicateMutation = useMutation({
    mutationFn: (t: ScheduleTemplate) => api.post<{ success: boolean; data: { id: string } }>(`/techops/schedule-templates/${t.id}/duplicate`, { name: `${t.name}のコピー` }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["schedule-templates", null] });
      setSelectedId(res.data.data.id);
      notifySuccess("複製しました。名前・列・項目は直せます");
    },
    onError: () => notifyError("複製できませんでした。", { description: "少し待ってから、もう一度お試しください。" }),
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
            // key={selected.id}: ひな形を切り替えても内部 state が前のひな形の値のまま残ると、
            // 別ひな形の列 id へ項目を追加してしまう
            <TemplateDetail
              key={selected.id}
              template={selected}
              onDelete={() => deleteMutation.mutate(selected.id)}
              onDuplicate={() => duplicateMutation.mutate(selected)}
              duplicating={duplicateMutation.isPending}
            />
          ) : (
            <p className="text-sm text-muted-foreground">左からひな形を選んでください。</p>
          )}
        </div>
      </div>
    </div>
  );
}

function TemplateMetaForm({ template }: { template: ScheduleTemplate }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [locationId, setLocationId] = useState<string | null>(template.location_id);

  // ひな形を切り替えたら、そのひな形の値で作り直す
  useEffect(() => { setName(template.name); setDescription(template.description ?? ""); setLocationId(template.location_id); }, [template.id, template.name, template.description, template.location_id]);

  const locationsQuery = useQuery({ queryKey: ["studio-rooms"], queryFn: scheduleApi.listStudioRooms, staleTime: 5 * 60 * 1000 });
  const locations = (locationsQuery.data ?? []).map((l) => ({ id: l.id, name: l.name }));

  const saveMutation = useMutation({
    mutationFn: () => api.put(`/techops/schedule-templates/${template.id}`, { name, description: description || null, location_id: locationId }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["schedule-templates", null] }); notifySuccess("保存しました"); },
    onError: () => notifyError("保存できませんでした。", { description: "少し待ってから、もう一度お試しください。" }),
  });

  const dirty = name !== template.name || description !== (template.description ?? "") || locationId !== template.location_id;

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className={formGrid2}>
        <div>
          <label className="text-xs text-muted-foreground">名前</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 min-h-[44px]" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">拠点（絞り込み用。空なら全拠点で出る）</label>
          <Select value={locationId ?? ""} onValueChange={(v) => setLocationId(v || null)}>
            <SelectTrigger className="mt-1 min-h-[44px]"><SelectValue placeholder="全拠点" /></SelectTrigger>
            <SelectContent>
              {locations.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div>
        <label className="text-xs text-muted-foreground">説明（任意）</label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 min-h-[44px]" placeholder="例: 授賞式の標準進行" />
      </div>
      <Button size="sm" className="min-h-[44px]" disabled={!dirty || saveMutation.isPending} onClick={() => saveMutation.mutate()}>保存</Button>
    </div>
  );
}

function TemplateDetail({ template, onDelete, onDuplicate, duplicating }: { template: ScheduleTemplate; onDelete: () => void; onDuplicate: () => void; duplicating: boolean }) {
  const queryClient = useQueryClient();
  const [colGroup, setColGroup] = useState<ColGroup>("venue");
  const [colLabel, setColLabel] = useState("");

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-foreground">{template.name}</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="min-h-[44px]" disabled={duplicating} onClick={onDuplicate}>
            <Copy className="mr-1 h-4 w-4" />複製する
          </Button>
          {!template.is_system && (
            <Button variant="destructive" size="sm" className="min-h-[44px]" onClick={onDelete}>
              <Trash2 className="mr-1 h-4 w-4" />このひな形を削除
            </Button>
          )}
        </div>
      </div>

      <TemplateMetaForm template={template} />

      <section>
        <h3 className="text-sm font-medium text-foreground">列</h3>
        <p className="mt-1 text-xs text-muted-foreground">名前・部屋・色の変更はできません（消して作り直してください）。</p>
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

      <TemplateItemsSection template={template} />
    </div>
  );
}
