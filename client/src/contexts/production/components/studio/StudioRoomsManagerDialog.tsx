import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Pencil, Check, X } from "lucide-react";

interface StudioRoom {
  id: string;
  location_id: string;
  name: string;
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

const ROOM_TYPE_LABEL: Record<string, string> = {
  studio: 'スタジオ',
  control: '調整室',
  greenroom: 'グリーンルーム',
  other: 'その他',
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: StudioLocation[];
}

export default function StudioRoomsManagerDialog({ open, onOpenChange, locations }: Props) {
  const qc = useQueryClient();
  const [newLocationName, setNewLocationName] = useState("");
  const [newRoomByLoc, setNewRoomByLoc] = useState<Record<string, { name: string; room_type: string; color: string }>>({});
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [editRoom, setEditRoom] = useState<Partial<StudioRoom>>({});
  const [editingLocId, setEditingLocId] = useState<string | null>(null);
  const [editLocName, setEditLocName] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["studio-locations"] });

  // Location mutations
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

  // Room mutations
  const addRoom = useMutation({
    mutationFn: (params: { location_id: string; name: string; room_type: string; color: string; sort_order: number }) =>
      api.post("/studios/rooms", params),
    onSuccess: (_r, vars) => {
      setNewRoomByLoc(prev => ({ ...prev, [vars.location_id]: { name: "", room_type: "studio", color: "#3b82f6" } }));
      invalidate();
    },
  });
  const updateRoom = useMutation({
    mutationFn: ({ id, ...body }: { id: string; name: string; room_type: string; color: string; sort_order: number }) =>
      api.put(`/studios/rooms/${id}`, body),
    onSuccess: () => { setEditingRoomId(null); invalidate(); },
  });
  const deleteRoom = useMutation({
    mutationFn: (id: string) => api.delete(`/studios/rooms/${id}`),
    onSuccess: invalidate,
  });

  const startEditRoom = (r: StudioRoom) => {
    setEditingRoomId(r.id);
    setEditRoom({ name: r.name, room_type: r.room_type, color: r.color, sort_order: r.sort_order });
  };

  const saveEditRoom = (id: string) => {
    updateRoom.mutate({
      id,
      name: editRoom.name || "",
      room_type: editRoom.room_type || "studio",
      color: editRoom.color || "#3b82f6",
      sort_order: editRoom.sort_order ?? 0,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>ロケーション・部屋管理 <span className="text-xs font-normal text-muted-foreground">（管理者のみ）</span></DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* 各ロケーション */}
          {locations.map((loc) => (
            <div key={loc.id} className="border rounded-lg p-3 space-y-3">
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
                    <h3 className="font-semibold">{loc.name}</h3>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => { setEditingLocId(loc.id); setEditLocName(loc.name); }}>
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

              {/* 部屋一覧 */}
              <div className="space-y-1.5">
                {loc.rooms.map((r) => (
                  <div key={r.id} className="flex items-center gap-2 text-sm">
                    {editingRoomId === r.id ? (
                      <>
                        <Input
                          type="number"
                          value={editRoom.sort_order ?? 0}
                          onChange={(e) => setEditRoom(p => ({ ...p, sort_order: parseInt(e.target.value) || 0 }))}
                          className="h-8 w-14"
                        />
                        <Input
                          value={editRoom.name || ""}
                          onChange={(e) => setEditRoom(p => ({ ...p, name: e.target.value }))}
                          className="h-8 flex-1"
                        />
                        <Select value={editRoom.room_type || "studio"} onValueChange={(v) => setEditRoom(p => ({ ...p, room_type: v }))}>
                          <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="studio">スタジオ</SelectItem>
                            <SelectItem value="control">調整室</SelectItem>
                            <SelectItem value="greenroom">グリーンルーム</SelectItem>
                            <SelectItem value="other">その他</SelectItem>
                          </SelectContent>
                        </Select>
                        <Input
                          type="color"
                          value={editRoom.color || "#3b82f6"}
                          onChange={(e) => setEditRoom(p => ({ ...p, color: e.target.value }))}
                          className="h-8 w-12 p-1"
                        />
                        <Button size="sm" variant="ghost" onClick={() => saveEditRoom(r.id)}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingRoomId(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="w-10 text-xs text-muted-foreground tabular-nums">#{r.sort_order}</span>
                        <span className="inline-block w-3 h-3 rounded-full flex-shrink-0" style={{ background: r.color }} />
                        <span className="flex-1">{r.name}</span>
                        <span className="text-xs text-muted-foreground">{ROOM_TYPE_LABEL[r.room_type] || r.room_type}</span>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEditRoom(r)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => {
                          if (confirm(`${r.name} を削除しますか?`)) deleteRoom.mutate(r.id);
                        }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                  </div>
                ))}
              </div>

              {/* 部屋追加フォーム */}
              <div className="flex gap-2 items-end pt-2 border-t">
                <div className="flex-1">
                  <Label className="text-xs">部屋名</Label>
                  <Input
                    value={newRoomByLoc[loc.id]?.name || ""}
                    onChange={(e) => setNewRoomByLoc(p => ({
                      ...p, [loc.id]: { ...(p[loc.id] || { room_type: "studio", color: "#3b82f6" }), name: e.target.value }
                    }))}
                    placeholder="例: 第3調整室"
                    className="h-8"
                  />
                </div>
                <div>
                  <Label className="text-xs">種別</Label>
                  <Select
                    value={newRoomByLoc[loc.id]?.room_type || "studio"}
                    onValueChange={(v) => setNewRoomByLoc(p => ({
                      ...p, [loc.id]: { ...(p[loc.id] || { name: "", color: "#3b82f6" }), room_type: v }
                    }))}
                  >
                    <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="studio">スタジオ</SelectItem>
                      <SelectItem value="control">調整室</SelectItem>
                      <SelectItem value="greenroom">グリーンルーム</SelectItem>
                      <SelectItem value="other">その他</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">色</Label>
                  <Input
                    type="color"
                    value={newRoomByLoc[loc.id]?.color || "#3b82f6"}
                    onChange={(e) => setNewRoomByLoc(p => ({
                      ...p, [loc.id]: { ...(p[loc.id] || { name: "", room_type: "studio" }), color: e.target.value }
                    }))}
                    className="h-8 w-12 p-1"
                  />
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    const v = newRoomByLoc[loc.id];
                    if (!v?.name) return;
                    addRoom.mutate({
                      location_id: loc.id,
                      name: v.name,
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
          ))}

          {/* 新規ロケーション追加 */}
          <div className="border-t pt-4">
            <Label className="text-sm font-semibold">新しいロケーションを追加</Label>
            <div className="flex gap-2 mt-2">
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
