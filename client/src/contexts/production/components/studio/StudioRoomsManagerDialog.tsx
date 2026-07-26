import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Pencil, Check, X, Info } from "lucide-react";
import { confirmAction } from '@gmo-onair/shared/src/client/ui';

interface StudioRoom {
  id: string;
  location_id: string;
  name: string;
  abbreviation?: string | null;
  color: string;
  room_type: string;
  sort_order: number;
}

interface StudioLocation {
  id: string;
  name: string;
  sort_order: number;
  rooms: StudioRoom[];
}

// 種別ラベル — 'greenroom' の表示は v2.7.5 で「ゲストルーム」に変更（DB 値は互換維持）
const ROOM_TYPE_LABEL: Record<string, string> = {
  studio: 'スタジオ',
  control: '調整室',
  greenroom: 'ゲストルーム',
  other: 'その他',
};

const ROOM_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'studio',    label: 'スタジオ' },
  { value: 'control',   label: '調整室' },
  { value: 'greenroom', label: 'ゲストルーム' },
  { value: 'other',     label: 'その他' },
];

interface NewRoomDraft {
  name: string;
  abbreviation: string;
  room_type: string;
  color: string;
}
const emptyDraft = (): NewRoomDraft => ({ name: '', abbreviation: '', room_type: 'studio', color: '#3b82f6' });

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: StudioLocation[];
}

export default function StudioRoomsManagerDialog({ open, onOpenChange, locations }: Props) {
  const qc = useQueryClient();
  const [newLocationName, setNewLocationName] = useState("");
  const [newRoomByLoc, setNewRoomByLoc] = useState<Record<string, NewRoomDraft>>({});
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editRoom, setEditRoom] = useState<Partial<StudioRoom>>({});
  const [editingLocId, setEditingLocId] = useState<string | null>(null);
  const [editLocName, setEditLocName] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["studio-locations"] });

  const addLocation = useMutation({
    mutationFn: (name: string) => api.post("/studios/locations", { name, sort_order: locations.length + 1 }),
    onSuccess: () => { setNewLocationName(""); invalidate(); },
  });
  const updateLocation = useMutation({
    mutationFn: ({ id, name, sort_order }: { id: string; name: string; sort_order: number }) =>
      api.put(`/studios/locations/${id}`, { name, sort_order }),
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>ロケーション・部屋管理 <span className="text-xs font-normal text-muted-foreground">（管理者のみ）</span></DialogTitle>
          <DialogDescription className="sr-only">
            ロケーション (拠点) とその配下の部屋・空間を追加 / 編集 / 削除します。
          </DialogDescription>
        </DialogHeader>

        {/* ガイド */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs space-y-1.5">
          <div className="flex items-start gap-2">
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
            <div className="space-y-1">
              <p>
                <span className="font-semibold">略称</span> は、カレンダー上で複数の部屋が並ぶ時に使われます（例: WORLD STUDIO → <span className="">WS</span>）。
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
          {/* 各ロケーション */}
          {locations.map((loc) => (
            <div key={loc.id} className="border rounded-xl p-4 space-y-3 bg-muted/20">
              {/* ロケーション名 */}
              <div className="flex items-center justify-between gap-2">
                {editingLocId === loc.id ? (
                  <>
                    <Input
                      value={editLocName}
                      onChange={(e) => setEditLocName(e.target.value)}
                      className="h-8 max-w-xs font-semibold"
                    />
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() =>
                        updateLocation.mutate({ id: loc.id, name: editLocName, sort_order: loc.sort_order })
                      }><Check className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingLocId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="font-semibold text-base">{loc.name}</h3>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditingLocId(loc.id); setEditLocName(loc.name); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => {
                        if ((await confirmAction({ title: `${loc.name} と関連する全ての部屋を削除しますか?`, confirmLabel: '削除する', tone: 'danger' }))) deleteLocation.mutate(loc.id);
                      }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </>
                )}
              </div>

              {/* 部屋一覧 */}
              {loc.rooms.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 text-center">部屋が登録されていません</p>
              ) : (
                <div className="space-y-2">
                  {loc.rooms.map((r) => (
                    <div key={r.id} className="rounded-lg border bg-background p-2.5">
                      {editingRoomId === r.id ? (
                        /* ── 編集モード ── */
                        <div className="space-y-2">
                          <div className="grid grid-cols-12 gap-2 items-end">
                            <div className="col-span-2">
                              <Label className="text-[10px] text-muted-foreground">並び順</Label>
                              <Input
                                type="number"
                                value={editRoom.sort_order ?? 0}
                                onChange={(e) => setEditRoom(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))}
                                className="h-9"
                              />
                            </div>
                            <div className="col-span-6 sm:col-span-5">
                              <Label className="text-[10px] text-muted-foreground">部屋名</Label>
                              <Input
                                value={editRoom.name || ""}
                                onChange={(e) => setEditRoom(p => ({ ...p, name: e.target.value }))}
                                className="h-9"
                              />
                            </div>
                            <div className="col-span-4 sm:col-span-3">
                              <Label className="text-[10px] text-muted-foreground">略称</Label>
                              <Input
                                value={editRoom.abbreviation ?? ''}
                                onChange={(e) => setEditRoom(p => ({ ...p, abbreviation: e.target.value }))}
                                placeholder="例: WS"
                                maxLength={20}
                                className="h-9 "
                              />
                            </div>
                            <div className="col-span-2 sm:col-span-2">
                              <Label className="text-[10px] text-muted-foreground">色</Label>
                              <Input
                                type="color"
                                value={editRoom.color || "#3b82f6"}
                                onChange={(e) => setEditRoom(p => ({ ...p, color: e.target.value }))}
                                className="h-9 p-1"
                              />
                            </div>
                          </div>
                          <div className="flex items-end gap-2">
                            <div className="flex-1">
                              <Label className="text-[10px] text-muted-foreground">種別</Label>
                              <Select value={editRoom.room_type || "studio"} onValueChange={(v) => setEditRoom(p => ({ ...p, room_type: v }))}>
                                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  {ROOM_TYPE_OPTIONS.map(o => (
                                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Button size="sm" onClick={() => saveEditRoom(r.id)}>
                              <Check className="h-4 w-4 mr-1" />保存
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingRoomId(null)}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        /* ── 表示モード ── */
                        <div className="flex items-center gap-2 text-sm flex-wrap">
                          <span className="w-9 text-xs text-muted-foreground tabular-nums shrink-0">#{r.sort_order}</span>
                          <span className="inline-block w-3.5 h-3.5 rounded-full shrink-0 ring-1 ring-border" style={{ background: r.color }} />
                          <span className="font-medium flex-1 min-w-0 truncate">{r.name}</span>
                          {r.abbreviation && (
                            <span className=" text-[11px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">
                              {r.abbreviation}
                            </span>
                          )}
                          <span className="text-[11px] text-muted-foreground shrink-0">
                            {ROOM_TYPE_LABEL[r.room_type] || r.room_type}
                          </span>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={() => startEditRoom(r)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive shrink-0" onClick={async () => {
                            if ((await confirmAction({ title: `${r.name} を削除しますか?`, confirmLabel: '削除する', tone: 'danger' }))) deleteRoom.mutate(r.id);
                          }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* 部屋追加フォーム */}
              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2">この拠点に部屋を追加</p>
                <div className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-12 sm:col-span-5">
                    <Label className="text-[10px] text-muted-foreground">部屋名 <span className="text-destructive">*</span></Label>
                    <Input
                      value={newRoomByLoc[loc.id]?.name || ""}
                      onChange={(e) => setNewRoomByLoc(p => ({
                        ...p, [loc.id]: { ...(p[loc.id] || emptyDraft()), name: e.target.value }
                      }))}
                      placeholder="例: 第3調整室"
                      className="h-9"
                    />
                  </div>
                  <div className="col-span-6 sm:col-span-3">
                    <Label className="text-[10px] text-muted-foreground">略称</Label>
                    <Input
                      value={newRoomByLoc[loc.id]?.abbreviation || ""}
                      onChange={(e) => setNewRoomByLoc(p => ({
                        ...p, [loc.id]: { ...(p[loc.id] || emptyDraft()), abbreviation: e.target.value }
                      }))}
                      placeholder="例: 3調"
                      maxLength={20}
                      className="h-9 "
                    />
                  </div>
                  <div className="col-span-6 sm:col-span-2">
                    <Label className="text-[10px] text-muted-foreground">色</Label>
                    <Input
                      type="color"
                      value={newRoomByLoc[loc.id]?.color || "#3b82f6"}
                      onChange={(e) => setNewRoomByLoc(p => ({
                        ...p, [loc.id]: { ...(p[loc.id] || emptyDraft()), color: e.target.value }
                      }))}
                      className="h-9 p-1"
                    />
                  </div>
                  <div className="col-span-12 sm:col-span-2">
                    <Label className="text-[10px] text-muted-foreground">種別</Label>
                    <Select
                      value={newRoomByLoc[loc.id]?.room_type || "studio"}
                      onValueChange={(v) => setNewRoomByLoc(p => ({
                        ...p, [loc.id]: { ...(p[loc.id] || emptyDraft()), room_type: v }
                      }))}
                    >
                      <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ROOM_TYPE_OPTIONS.map(o => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end mt-2">
                  <Button
                    size="sm"
                    onClick={() => {
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
                  >
                    <Plus className="h-4 w-4 mr-1" />追加
                  </Button>
                </div>
              </div>
            </div>
          ))}

          {/* 新規ロケーション追加 */}
          <div className="border-t pt-4">
            <Label className="text-sm font-semibold">新しい拠点 (ロケーション) を追加</Label>
            <p className="text-xs text-muted-foreground mb-2">例: 福岡スタジオ、外現場 等</p>
            <div className="flex gap-2">
              <Input
                value={newLocationName}
                onChange={(e) => setNewLocationName(e.target.value)}
                placeholder="例: 福岡スタジオ"
                className="h-9"
              />
              <Button
                onClick={() => { if (newLocationName.trim()) addLocation.mutate(newLocationName.trim()); }}
                disabled={!newLocationName.trim()}
              >
                <Plus className="h-4 w-4 mr-1" />追加
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
