import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { FormDialog } from "@gmo-onair/shared/src/client-v4/formDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Trash2, Pencil, Check, X, Info } from "lucide-react";
import {
  RoomRow, AddRoomForm, emptyDraft,
  type StudioRoom, type NewRoomDraft,
} from "./studioRooms/RoomParts";

interface StudioLocation {
  id: string;
  name: string;
  /** 拠点の略称 (migration 189)。**決めていなければ null** */
  abbreviation?: string | null;
  sort_order: number;
  rooms: StudioRoom[];
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: StudioLocation[];
}

export default function StudioRoomsManagerDialog({ open, onOpenChange, locations }: Props) {
  const qc = useQueryClient();
  const [newLocationName, setNewLocationName] = useState("");
  const [newLocationAbbr, setNewLocationAbbr] = useState("");
  const [newRoomByLoc, setNewRoomByLoc] = useState<Record<string, NewRoomDraft>>({});
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editRoom, setEditRoom] = useState<Partial<StudioRoom>>({});
  const [editingLocId, setEditingLocId] = useState<string | null>(null);
  const [editLocName, setEditLocName] = useState("");
  const [editLocAbbr, setEditLocAbbr] = useState("");

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["studio-locations"] });
    /*
     * **予約の会場表示も落とす**。案件詳細の会場は予約にぶら下がる拠点の略称を
     * 使っているので (`projectDetail/venue.ts`)、ここを落とさないと
     * **略称を直したのに案件の画面は古い表示のまま**になる
     */
    qc.invalidateQueries({ queryKey: ["project-studio-bookings"] });
  };

  const addLocation = useMutation({
    mutationFn: ({ name, abbreviation }: { name: string; abbreviation?: string }) =>
      api.post("/studios/locations", { name, abbreviation, sort_order: locations.length + 1 }),
    onSuccess: () => { setNewLocationName(""); setNewLocationAbbr(""); invalidate(); },
  });
  const updateLocation = useMutation({
    // **略称は必ず送る**（空文字なら「決めていない」に戻る）。送らないとサーバーは今の値を保つ
    mutationFn: ({ id, name, abbreviation, sort_order }:
      { id: string; name: string; abbreviation: string; sort_order: number }) =>
      api.put(`/studios/locations/${id}`, { name, abbreviation, sort_order }),
    onSuccess: () => { setEditingLocId(null); invalidate(); },
  });
  const deleteLocation = useMutation({
    mutationFn: (id: string) => api.delete(`/studios/locations/${id}`),
    onSuccess: invalidate,
  });

  const addRoom = useMutation({
    mutationFn: (params: { location_id: string; name: string; abbreviation?: string; room_type: string; color: string; sort_order: number }) =>
      api.post("/studios/rooms", params),
    onSuccess: (_r, vars) => {
      setNewRoomByLoc(prev => ({ ...prev, [vars.location_id]: emptyDraft() }));
      invalidate();
    },
  });
  const updateRoom = useMutation({
    mutationFn: ({ id, ...body }: { id: string; name: string; abbreviation?: string; room_type: string; color: string; sort_order: number }) =>
      api.put(`/studios/rooms/${id}`, body),
    onSuccess: () => { setEditingRoomId(null); invalidate(); },
  });
  const deleteRoom = useMutation({
    mutationFn: (id: string) => api.delete(`/studios/rooms/${id}`),
    onSuccess: invalidate,
  });

  const startEditRoom = (r: StudioRoom) => {
    setEditingRoomId(r.id);
    setEditRoom({
      name: r.name,
      abbreviation: r.abbreviation ?? '',
      room_type: r.room_type,
      color: r.color,
      sort_order: r.sort_order,
    });
  };

  const saveEditRoom = (id: string) => {
    updateRoom.mutate({
      id,
      name: editRoom.name || "",
      abbreviation: (editRoom.abbreviation ?? '').trim() || undefined,
      room_type: editRoom.room_type || "studio",
      color: editRoom.color || "#3b82f6",
      sort_order: editRoom.sort_order ?? 0,
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="ロケーション・部屋管理（管理者のみ）"
      // 元の max-w-3xl (768px) は既定の640pxより広い。各ロケーションの
      // 行（拠点名+略称+ボタン、部屋の一覧行）が横に長く、640pxに絞ると
      // 折り返しが増えて縦に間延びするため wide (=lg・840px) を渡す。
      wide
    >
        {/* ガイド */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs space-y-1.5">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
            <div className="space-y-1">
              <p>
                <span className="font-semibold">拠点の略称</span> は、幅の狭い枠で正式名の代わりに出ます
                （例: GMOサムライスタジオ用賀 → 用賀。案件詳細の「会場・スタジオ」は
                「用賀 WORLD STUDIO」と出ます）。<span className="font-semibold">決めていない拠点は
                部屋名だけ</span>になります（正式名では代用しません — 枠から溢れるため）。
              </p>
              <p>
                <span className="font-semibold">部屋の略称</span> は、カレンダー上で複数の部屋が並ぶ時に使われます（例: WORLD STUDIO → <span className="">WS</span>）。
              </p>
              <p>
                <span className="font-semibold">種別</span> は色分けや一覧フィルタに利用します（スタジオ / 調整室 / ゲストルーム / その他）。
              </p>
              <p className="text-muted-foreground">
                左側の <span className="">#番号</span> はカレンダー内での並び順です。
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6 mt-2">
          {/* 新規ロケーション追加。
              **部屋は拠点の下にしか作れない（親子）ので、親を作る欄を子の一覧より前に置く**
              （`docs/design/v4/_form-order.md` 段1「どれに付けるか」）。以前は全拠点＋
              全部屋を描き切った後の最下部にあり、拠点が増えるほど「拠点を1つ足す」に
              着くまでのスクロールが伸びていた */}
          <div className="rounded-lg border bg-muted/20 p-3">
            <Label className="text-sm font-semibold">新しい拠点 (ロケーション) を追加</Label>
            <p className="text-xs text-muted-foreground mb-2">例: 福岡スタジオ、外現場 等</p>
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Label className="text-[10px] text-muted-foreground">拠点名（正式名） <span className="text-destructive">*</span></Label>
                <Input
                  value={newLocationName}
                  onChange={(e) => setNewLocationName(e.target.value)}
                  placeholder="例: GMOサムライスタジオ福岡"
                  className="h-9"
                />
              </div>
              <div className="w-28 shrink-0">
                <Label className="text-[10px] text-muted-foreground">略称</Label>
                <Input
                  value={newLocationAbbr}
                  onChange={(e) => setNewLocationAbbr(e.target.value)}
                  placeholder="例: 福岡"
                  maxLength={20}
                  className="h-9"
                />
              </div>
              <Button
                onClick={() => {
                  if (!newLocationName.trim()) return;
                  addLocation.mutate({
                    name: newLocationName.trim(),
                    abbreviation: newLocationAbbr.trim() || undefined,
                  });
                }}
                disabled={!newLocationName.trim()}
              >
                <Plus className="h-4 w-4 mr-1" />追加
              </Button>
            </div>
          </div>

          {/* 各ロケーション */}
          {locations.map((loc) => (
            <div key={loc.id} className="border rounded-xl p-4 space-y-3 bg-muted/20">
              {/* ロケーション名 */}
              <div className="flex items-center justify-between gap-2">
                {editingLocId === loc.id ? (
                  <>
                    <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
                      <div className="min-w-0 flex-1">
                        <Label className="text-[10px] text-muted-foreground">拠点名（正式名）</Label>
                        <Input
                          value={editLocName}
                          onChange={(e) => setEditLocName(e.target.value)}
                          className="h-9 font-semibold"
                        />
                      </div>
                      {/* 略称は狭い枠（案件の会場・一覧）で正式名の代わりに出る */}
                      <div className="w-28 shrink-0">
                        <Label className="text-[10px] text-muted-foreground">略称</Label>
                        <Input
                          value={editLocAbbr}
                          onChange={(e) => setEditLocAbbr(e.target.value)}
                          placeholder="例: 用賀"
                          maxLength={20}
                          className="h-9"
                        />
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => updateLocation.mutate({
                        id: loc.id, name: editLocName, abbreviation: editLocAbbr, sort_order: loc.sort_order,
                      })}><Check className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingLocId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="font-semibold text-base min-w-0 flex-1">
                      {loc.name}
                      {/* **決めていないことも見せる** — 空欄だと「短く出せる」ことに気づけない */}
                      <span className={`ml-2 text-[11px] px-1.5 py-0.5 rounded ${loc.abbreviation
                        ? 'bg-muted text-muted-foreground' : 'bg-muted/50 text-muted-foreground/70'}`}>
                        略称 {loc.abbreviation || '未設定'}
                      </span>
                    </h3>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => {
                        setEditingLocId(loc.id);
                        setEditLocName(loc.name);
                        setEditLocAbbr(loc.abbreviation ?? '');
                      }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => {
                        if (confirm(`${loc.name} と関連する全ての部屋を削除しますか?`)) deleteLocation.mutate(loc.id);
                      }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                )}
              </div>

              {/* 部屋一覧。1行の表示/編集は `studioRooms/RoomParts` が描く */}
              {loc.rooms.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 text-center">部屋が登録されていません</p>
              ) : (
                <div className="space-y-2">
                  {loc.rooms.map((r) => (
                    <RoomRow
                      key={r.id}
                      room={r}
                      editing={editingRoomId === r.id}
                      draft={editRoom}
                      onDraft={(fn) => setEditRoom(fn)}
                      onStartEdit={() => startEditRoom(r)}
                      onSave={() => saveEditRoom(r.id)}
                      onCancel={() => setEditingRoomId(null)}
                      onDelete={() => { if (confirm(`${r.name} を削除しますか?`)) deleteRoom.mutate(r.id); }}
                    />
                  ))}
                </div>
              )}

              <AddRoomForm
                draft={newRoomByLoc[loc.id]}
                onDraft={(fn) => setNewRoomByLoc((p) => ({
                  ...p, [loc.id]: fn(p[loc.id] || emptyDraft()),
                }))}
                onAdd={() => {
                  const v = newRoomByLoc[loc.id];
                  if (!v?.name?.trim()) return;
                  addRoom.mutate({
                    location_id: loc.id,
                    name: v.name.trim(),
                    abbreviation: v.abbreviation?.trim() || undefined,
                    room_type: v.room_type || "studio",
                    color: v.color || "#3b82f6",
                    sort_order: (loc.rooms[loc.rooms.length - 1]?.sort_order ?? 0) + 1,
                  });
                }}
              />
            </div>
          ))}

        </div>
    </FormDialog>
  );
}
