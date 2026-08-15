/**
 * イベント実施報告の編集ダイアログ（隔週キープ資料のタブ1から開く）
 *
 * ⚠️ **ここに「トピック」の入力欄を戻さないこと**（レビューでの指摘 #83）。
 * 旧 `event_reports.highlights`（自由行の配列）は migration 185 で K/P/T の表へ
 * 畳みました。欄だけが残っていたので、**打ち込んだ文字はサーバーに黙って
 * 捨てられ**、一覧は消えた列を読んで**画面ごと落ちて**いました。
 * K/P/T を書く場所は**案件のふりかえりタブ1か所**です。
 */
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Image as ImageIcon, Loader2, Plus, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { KPT_LABEL, type EventReport, type PhotoEntry } from "./types";

export function EventReportDialog({ projectId, projectName, report, onClose }: {
  projectId: string; projectName: string; report: EventReport | null; onClose: () => void;
}) {
  const qc = useQueryClient();
  const [headline, setHeadline] = useState(report?.headline ?? "");
  const [onsite, setOnsite] = useState(report?.attendees_onsite != null ? String(report.attendees_onsite) : "");
  const [online, setOnline] = useState(report?.attendees_online != null ? String(report.attendees_online) : "");
  const [note, setNote] = useState(report?.attendees_note ?? "");
  const [reportedAt, setReportedAt] = useState(report?.reported_at ?? "");
  const [photos, setPhotos] = useState<PhotoEntry[]>(report?.photos ?? []);
  const [newBoxId, setNewBoxId] = useState("");
  const [newCaption, setNewCaption] = useState("");

  const save = useMutation({
    mutationFn: async (status: "draft" | "confirmed") => (await api.put(`/keep/event-reports/${projectId}`, {
      headline: headline || null,
      attendees_onsite: onsite === "" ? null : Number(onsite),
      attendees_online: online === "" ? null : Number(online),
      attendees_note: note || null,
      reported_at: reportedAt || null,
      report_status: status,
    })).data,
    onSuccess: onClose,
  });

  const addPhoto = useMutation({
    mutationFn: async () => (await api.post(`/keep/event-reports/${projectId}/photos`, {
      box_file_id: newBoxId.trim(), caption: newCaption.trim() || null,
    })).data.data,
    onSuccess: (d: { photos: PhotoEntry[] }) => {
      setPhotos(d.photos);
      setNewBoxId(""); setNewCaption("");
      qc.invalidateQueries({ queryKey: ["keep-event-reports"] });
    },
  });
  const removePhoto = useMutation({
    mutationFn: async (photoId: string) => (await api.delete(`/keep/event-photos/${photoId}`)).data,
    onSuccess: (_d, photoId) => {
      setPhotos((p) => p.filter((x) => x.id !== photoId));
      qc.invalidateQueries({ queryKey: ["keep-event-reports"] });
    },
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6 leading-snug">イベント実施報告 — {projectName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>1行サマリ (headline)</Label>
            <Input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={120} placeholder="未入力なら資料側で案件名を使用" />
          </div>
          {/*
            * **ふりかえりは読むだけ。** 入力欄を戻さないこと（ファイル冒頭の理由）。
            * ここに出るのは**確かめ済みの行だけ**です — 未確認の AI の下書きは
            * 資料に載せません（`keep-report.service` が絞っています）。
            */}
          <div className="rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium">ふりかえり (K/P/T) — 確かめ済みの行だけ</p>
            {(report?.kpt ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">まだ書かれていません。</p>
            ) : (
              <ul className="space-y-1">
                {(report?.kpt ?? []).map((k) => (
                  <li key={k.id} className="flex items-start gap-2 text-sm">
                    <Badge variant="secondary" className="shrink-0">{KPT_LABEL[k.kind]}</Badge>
                    <span className="min-w-0 flex-1">{k.body}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              書き足す・直すのは
              <a className="underline" href={`/sales/projects/${projectId}/review`} target="_blank" rel="noreferrer">
                案件のふりかえり
              </a>
              です（書いた人と AI の下書きの確認をそこで扱います）。
              <strong className="font-medium">未確認のままの行は資料に載りません。</strong>
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>リアル来場者数</Label>
              <Input type="number" min={0} value={onsite} onChange={(e) => setOnsite(e.target.value)} />
            </div>
            <div>
              <Label>オンライン参加者数</Label>
              <Input type="number" min={0} value={online} onChange={(e) => setOnline(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>来場者数の注記</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="速報値 等" />
            </div>
            <div>
              <Label>報告対象会議日</Label>
              <Input type="date" value={reportedAt} onChange={(e) => setReportedAt(e.target.value)} />
            </div>
          </div>

          {/* 写真 (Box 参照) */}
          <div className="rounded-lg border p-3">
            <p className="mb-2 text-sm font-medium flex items-center gap-1.5">
              <ImageIcon className="h-4 w-4 text-muted-foreground" />写真 (Box ファイル参照 · {photos.length}枚)
            </p>
            {photos.length > 0 && (
              <ul className="mb-2 space-y-1">
                {photos.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 text-sm min-w-0">
                    <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs">{p.box_file_id}</span>
                    <span className="truncate text-muted-foreground">{p.caption ?? "(キャプションなし)"}</span>
                    <Button variant="ghost" size="icon" className="ml-auto h-6 w-6 shrink-0 text-destructive"
                      onClick={() => removePhoto.mutate(p.id)} aria-label="写真を削除">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <Input className="h-8 flex-1 min-w-[120px] text-sm" placeholder="Box ファイル ID" value={newBoxId} onChange={(e) => setNewBoxId(e.target.value)} />
              <Input className="h-8 flex-1 min-w-[120px] text-sm" placeholder="キャプション (任意)" value={newCaption} onChange={(e) => setNewCaption(e.target.value)} />
              <Button size="sm" variant="outline" className="h-8" disabled={!newBoxId.trim() || addPhoto.isPending} onClick={() => addPhoto.mutate()}>
                <Plus className="h-3.5 w-3.5 mr-1" />追加
              </Button>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">実体は Box に保管し ID のみ参照します (資料生成時にサムネイルを取得)。</p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>閉じる</Button>
          <Button variant="secondary" disabled={save.isPending} onClick={() => save.mutate("draft")}>下書き保存</Button>
          <Button disabled={save.isPending} onClick={() => save.mutate("confirmed")} className="bg-emerald-600 hover:bg-emerald-700">
            {save.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
            確定して保存
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
