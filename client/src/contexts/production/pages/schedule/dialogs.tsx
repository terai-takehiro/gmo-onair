// カレンダー連携ダイアログと、種別ピッカーの1行 — v2.9.294 で SchedulePage.tsx から切り出し。
// **中身は 1 行も変えていない**（移動 + export のみ）。
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Copy, CheckCircle2, RotateCcw, CalendarSync, Loader2 } from 'lucide-react';
import { confirmAction } from '@gmo-onair/shared/src/client/ui';

interface StudioFeedsData {
  calendar_feed_url: string;
  rooms: { room_id: string; room_name: string; location_name: string; room_type: string; signage_url: string }[];
}

export function CalendarFeedsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["studio-feeds"],
    queryFn: async () => (await api.get("/studios/rooms/feeds")).data.data as StudioFeedsData,
    enabled: open,
  });

  const [copied, setCopied] = useState<string | null>(null);
  const copyUrl = (url: string, id: string) => {
    navigator.clipboard.writeText(url);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const regenerateMutation = useMutation({
    mutationFn: async () => (await api.post("/studios/rooms/feeds/regenerate-token")).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["studio-feeds"] }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarSync className="h-5 w-5" />
            カレンダー連携
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground mb-4">
          下記のURLをGoogle Calendar / Outlook に1つ追加するだけで、全部屋の予約がまとめて自動同期されます。
        </p>

        {data && (
          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 p-3 border rounded-lg bg-primary/5">
            <div className="w-full sm:flex-1 min-w-0">
              <p className="text-sm font-medium">カレンダー フィードURL（全部屋・共通）</p>
              <p className="text-xs text-muted-foreground truncate mt-0.5">{data.calendar_feed_url}</p>
            </div>
            <Button
              size="sm"
              variant={copied === "cal" ? "default" : "outline"}
              onClick={() => copyUrl(data.calendar_feed_url, "cal")}
              className="shrink-0 w-full sm:w-auto"
            >
              {copied === "cal" ? <CheckCircle2 className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
              {copied === "cal" ? "コピー済" : "URLコピー"}
            </Button>
          </div>
        )}

        {/* サイネージURL一覧 (物理ディスプレイ設置用なので部屋ごと) */}
        <div className="border-t pt-4 mt-4">
          <p className="text-sm font-semibold mb-3">サイネージURL（楽屋/会議室入口用）</p>
          <p className="text-xs text-muted-foreground mb-2">タブレットやモニターのブラウザで全画面表示（部屋ごとに個別のURLです）</p>
          <div className="space-y-2">
            {(data?.rooms ?? []).map((room) => (
              <div key={`signage-${room.room_id}`} className="flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 p-3 border rounded-lg bg-muted/30">
                <div className="w-full sm:flex-1 min-w-0">
                  <p className="text-sm font-medium">{room.location_name} — {room.room_name}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">{room.signage_url}</p>
                </div>
                <Button
                  size="sm"
                  variant={copied === `s-${room.room_id}` ? "default" : "outline"}
                  onClick={() => copyUrl(room.signage_url, `s-${room.room_id}`)}
                  className="shrink-0 w-full sm:w-auto"
                >
                  {copied === `s-${room.room_id}` ? <CheckCircle2 className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                  {copied === `s-${room.room_id}` ? "コピー済" : "URLコピー"}
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="border-t pt-4 mt-4 space-y-3">
          <p className="text-sm font-semibold">カレンダー追加方法</p>
          <div className="text-xs text-muted-foreground space-y-2">
            <div>
              <p className="font-medium text-foreground">Google Calendar</p>
              <p>設定 → 「他のカレンダー」の＋ → 「URLで追加」→ コピーしたURLを貼り付け</p>
            </div>
            <div>
              <p className="font-medium text-foreground">Outlook</p>
              <p>予定表 → 「予定表を追加」→ 「Webから」→ コピーしたURLを貼り付け</p>
            </div>
            <p className="text-amber-600">※ 同期間隔はカレンダーアプリ側の設定に依存します（通常数時間〜24時間）</p>
          </div>
        </div>

        <div className="border-t pt-4 mt-4">
          <Button
            size="sm"
            variant="outline"
            className="text-destructive hover:text-destructive"
            disabled={regenerateMutation.isPending}
            onClick={async () => {
              if ((await confirmAction({ title: "フィードトークンを再生成しますか？", description: "既存のカレンダー登録・サイネージ表示はすべて無効になり、上記URLを登録し直す必要があります。" }))) {
                regenerateMutation.mutate();
              }
            }}
          >
            {regenerateMutation.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RotateCcw className="h-4 w-4 mr-1" />}
            フィードトークンを再生成
          </Button>
          <p className="text-xs text-muted-foreground mt-1.5">
            URLが外部に漏れた場合など、緊急時のみ実行してください。
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 種別ピッカーの1行 */
export function PickRow({
  label, hint, color, icon: Icon, onClick,
}: { label: string; hint: string; color: string; icon: React.ElementType; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-secondary"
    >
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white"
        style={{ backgroundColor: color }}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold text-foreground">{label}</span>
        <span className="mt-0.5 block text-[12px] leading-relaxed text-secondary-foreground">{hint}</span>
      </span>
    </button>
  );
}