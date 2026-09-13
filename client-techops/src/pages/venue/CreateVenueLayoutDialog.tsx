// 会場図面の新規作成（`CreateManualDialog.tsx` と同じ作法）。
// 設計: docs/design/v4/venue-layout.md §6①「作成ダイアログは3手: 名前 → 階とエリア
// （listVenueFloors() から選択。既定は26F WORLD STUDIOがあれば既定にする）→
// ひな形／前の図面を複製」。ひな形専用の API は無い（§5-4）ため、「ひな形」と
// 「前の図面を複製」は同じ `copy_from` の経路（§6①「複製は copied_from に元を残す」）に
// 一本化し、「始め方」は 空の図面／前の図面を複製 の2択にしてある。
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { FormDialog, FormDialogFooter } from "@gmo-onair/shared/src/client-v4/formDialog";
import { ToggleButtonGroup } from "@gmo-onair/shared/src/client/ui/toggle-button-group";
import type { VenueArea, VenueFloor, VenueLayoutSummary } from "@gmo-onair/shared/src/venue/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ManualOwnerFields, { type ManualOwnerValue } from "@/components/opsmanual/ManualOwnerFields";
import { notifyError } from "@/lib/notify";
import * as venueApi from "@/lib/venueApi";

type StartSource = "blank" | "copy";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `?project=`/`?program=` で絞り込まれているとき。案件/番組の選び直しはさせない */
  lockedOwner?: { projectId?: string | null; programId?: string | null; label: string };
  onCreated: (layout: VenueLayoutSummary) => void;
}

function initialOwner(lockedOwner?: Props["lockedOwner"]): ManualOwnerValue {
  if (lockedOwner?.programId) return { ownerType: "program", projectId: null, programId: lockedOwner.programId };
  return { ownerType: "project", projectId: lockedOwner?.projectId ?? null, programId: null };
}

/** 26F WORLD STUDIO を既定にする（設計 §6①）。無ければ最初の階・階全体 */
function defaultFloorAndArea(floors: (VenueFloor & { areas: VenueArea[] })[]): { floorId: string | null; areaId: string | null } {
  if (floors.length === 0) return { floorId: null, areaId: null };
  const floor26 = floors.find((f) => f.floorLabel === "26F") ?? floors[0];
  const world = floor26.areas.find((a) => a.label === "WORLD STUDIO");
  return { floorId: floor26.id, areaId: world?.id ?? null };
}

export default function CreateVenueLayoutDialog({ open, onOpenChange, lockedOwner, onCreated }: Props) {
  const [owner, setOwner] = useState<ManualOwnerValue>(() => initialOwner(lockedOwner));
  const [name, setName] = useState("");
  const [floorId, setFloorId] = useState<string | null>(null);
  const [areaId, setAreaId] = useState<string | null>(null); // null = 階全体
  const [source, setSource] = useState<StartSource>("blank");
  const [copyFromId, setCopyFromId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setOwner(initialOwner(lockedOwner));
    setName("");
    setSource("blank");
    setCopyFromId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const ownerReady = owner.ownerType === "project" ? !!owner.projectId : !!owner.programId;

  const floorsQuery = useQuery({
    queryKey: ["venue-floors"],
    queryFn: venueApi.listVenueFloors,
    enabled: open,
  });
  const floors = floorsQuery.data ?? [];

  // 階の一覧が届いたら、まだ選んでいなければ既定（26F WORLD STUDIO）を入れる
  useEffect(() => {
    if (!open || floors.length === 0 || floorId) return;
    const def = defaultFloorAndArea(floors);
    setFloorId(def.floorId);
    setAreaId(def.areaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, floors.length]);

  const currentFloor = floors.find((f) => f.id === floorId) ?? null;

  const pastLayoutsQuery = useQuery({
    queryKey: ["venue-layouts", "list", owner.projectId, owner.programId],
    queryFn: () => venueApi.listVenueLayouts({
      project: owner.ownerType === "project" ? owner.projectId ?? undefined : undefined,
      program: owner.ownerType === "program" ? owner.programId ?? undefined : undefined,
    }),
    enabled: open && source === "copy" && ownerReady,
  });
  const pastLayouts = useMemo(
    () => [...(pastLayoutsQuery.data ?? [])].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    [pastLayoutsQuery.data],
  );

  useEffect(() => {
    if (source !== "copy") setCopyFromId(null);
  }, [source]);

  const sourceReady = source === "blank" ? true : !!copyFromId;

  const createMutation = useMutation({
    mutationFn: () => {
      const copySrc = source === "copy" ? pastLayouts.find((l) => l.id === copyFromId) : undefined;
      const effectiveFloorId = copySrc ? copySrc.floorId : floorId;
      const effectiveAreaId = copySrc ? copySrc.areaId : areaId;
      const areaLabel = copySrc
        ? copySrc.areaLabel ?? "階全体"
        : (currentFloor?.areas.find((a) => a.id === areaId)?.label ?? "階全体");
      const floorLabel = copySrc ? copySrc.floorLabel : currentFloor?.floorLabel;
      const defaultName = areaId || copySrc?.areaId ? areaLabel : `${floorLabel ?? ""} 階全体`;
      return venueApi.createVenueLayout({
        title: name.trim() || defaultName,
        project_id: owner.ownerType === "project" ? owner.projectId : null,
        program_id: owner.ownerType === "program" ? owner.programId : null,
        floor_id: effectiveFloorId as string,
        area_id: effectiveAreaId,
        copy_from: source === "copy" ? copyFromId ?? undefined : undefined,
      });
    },
    onSuccess: (row) => { onOpenChange(false); onCreated(row); },
    onError: () => notifyError("会場図面を作れませんでした。", { description: "少し待ってから、もう一度お試しください。" }),
  });

  const canSubmit = ownerReady && !!floorId && sourceReady;

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="会場図面を作る"
      sub="名前・階とエリア・始め方の3つで作れます。縮尺は階の下敷きが持っているので、決めることはありません。"
      size="md"
      onSubmit={(e) => { e.preventDefault(); if (canSubmit) createMutation.mutate(); }}
      footer={
        <FormDialogFooter>
          <Button type="button" variant="outline" className="min-h-tap" onClick={() => onOpenChange(false)} disabled={createMutation.isPending}>キャンセル</Button>
          <Button type="submit" className="min-h-tap" disabled={createMutation.isPending || !canSubmit}>作る</Button>
        </FormDialogFooter>
      }
    >
      <div className="space-y-4">
        <ManualOwnerFields value={owner} onChange={setOwner} locked={!!lockedOwner} lockedLabel={lockedOwner?.label} />

        <div>
          <Label>名前</Label>
          <Input
            className="mt-1 min-h-tap font-number"
            placeholder="例: WORLD STUDIO C案"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <p className="mt-1 text-sub-sm text-muted-foreground">空のままなら、選んだエリア名が名前になります。</p>
        </div>

        <div>
          <Label>階とエリア</Label>
          <p className="mt-1 text-sub-sm text-muted-foreground">1枚の図面は1エリア。動線は「階全体」で。</p>
          {floorsQuery.isLoading && <p className="mt-1 text-sub-sm text-muted-foreground">読み込み中…</p>}
          {floorsQuery.isSuccess && floors.length === 0 && (
            <p className="mt-1 text-sub-sm text-muted-foreground">まだ会場・階が登録されていません。</p>
          )}
          {floors.length > 0 && (
            <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Select
                value={floorId ?? ""}
                onValueChange={(v) => { setFloorId(v); setAreaId(null); }}
              >
                <SelectTrigger className="min-h-tap"><SelectValue placeholder="階を選ぶ" /></SelectTrigger>
                <SelectContent>
                  {floors.map((f) => <SelectItem key={f.id} value={f.id}>{f.venueName} {f.floorLabel}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={areaId ?? "__whole__"} onValueChange={(v) => setAreaId(v === "__whole__" ? null : v)}>
                <SelectTrigger className="min-h-tap"><SelectValue placeholder="エリアを選ぶ" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__whole__">階全体</SelectItem>
                  {(currentFloor?.areas ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}{a.drawnAreaM2 ? `（${Math.round(a.drawnAreaM2)}㎡）` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div>
          <Label>始め方</Label>
          <div className="mt-1">
            <ToggleButtonGroup
              options={[{ value: "blank", label: "空の図面" }, { value: "copy", label: "前の図面を複製" }]}
              value={[source]}
              onChange={(next) => {
                const v = next[next.length - 1] as StartSource | undefined;
                if (v) setSource(v);
              }}
              multi={false}
              cols={{ base: 2 }}
              size="sm"
              ariaLabel="始め方"
            />
          </div>
          {source === "copy" && (
            <div className="mt-2">
              {!ownerReady ? (
                <p className="text-sub-sm text-muted-foreground">先に案件／番組を選んでください。</p>
              ) : (
                <>
                  <Select value={copyFromId ?? ""} onValueChange={(v) => setCopyFromId(v || null)}>
                    <SelectTrigger className="min-h-tap"><SelectValue placeholder="複製する図面を選ぶ" /></SelectTrigger>
                    <SelectContent>
                      {pastLayouts.map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.docNo ? `${l.docNo} ` : ""}{l.title || "（無題）"}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {pastLayoutsQuery.isSuccess && pastLayouts.length === 0 && (
                    <p className="mt-1 text-sub-sm text-muted-foreground">この案件／番組にはまだ会場図面がありません。</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </FormDialog>
  );
}
