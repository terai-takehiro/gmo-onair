import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2, RefreshCw, Plus, CloudDownload, AlertTriangle, ShieldAlert, ChevronDown } from "lucide-react";
import type { IcsFeed } from "./scheduleShared";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Outlook/Google → GMO ONAiR の ICS 購読設定ダイアログ。
// ユーザーが各サービスで発行した「公開 ICS URL」を登録すると、サーバーが 15 分ごとに
// 同期してマイカレンダーに表示する (一方向・読み取りのみ)。
export default function IcsFeedsDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);

  const { data: feeds = [], isLoading } = useQuery<IcsFeed[]>({
    queryKey: ["personal-ics-feeds"],
    queryFn: async () => (await api.get("/schedule/feeds")).data.data,
    enabled: open,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["personal-ics-feeds"] });
    qc.invalidateQueries({ queryKey: ["personal-events"] });
  };

  const addMutation = useMutation({
    mutationFn: async () => (await api.post("/schedule/feeds", { label, url })).data.data,
    onSuccess: (data: any) => {
      invalidate();
      setLabel(""); setUrl(""); setError(null);
      setNotice(data?.sync
        ? `連携しました（${data.sync.total} 件の予定を同期）`
        : "連携しました。初回同期に失敗した場合は一覧のエラーを確認してください");
    },
    onError: (err: any) => { setNotice(null); setError(err?.response?.data?.error?.message || "追加に失敗しました"); },
  });

  const syncMutation = useMutation({
    mutationFn: async (feedId: string) => (await api.post(`/schedule/feeds/${feedId}/sync`)).data.data,
    onSuccess: (data: any) => {
      invalidate();
      setError(null);
      setNotice(`同期しました（${data.total} 件 / 追加 ${data.created} / 更新 ${data.updated} / 削除 ${data.removed}）`);
    },
    onError: (err: any) => { setNotice(null); setError(err?.response?.data?.error?.message || "同期に失敗しました"); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (feedId: string) => api.delete(`/schedule/feeds/${feedId}`),
    onSuccess: () => { invalidate(); setNotice("連携を解除しました（同期済みの予定も削除されます）"); },
    onError: (err: any) => { setNotice(null); setError(err?.response?.data?.error?.message || "削除に失敗しました"); },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CloudDownload className="h-5 w-5 text-primary" />
            外部カレンダー連携（Outlook / Google）
          </DialogTitle>
          <DialogDescription>
            Outlook や Google カレンダーの「公開 ICS URL」を登録すると、15 分ごとに自動で予定を取り込みます
            （取込のみの一方向。ONAiR 側からの書き込みはありません）。
          </DialogDescription>
        </DialogHeader>

        {/* URL の発行手順ガイド */}
        <button
          type="button"
          onClick={() => setGuideOpen(!guideOpen)}
          className="flex w-full items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm font-medium hover:bg-muted/50"
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${guideOpen ? "rotate-180" : ""}`} />
          公開 ICS URL の発行方法（Outlook / Google）
        </button>
        {guideOpen && (
          <div className="space-y-3 rounded-lg border p-3 text-xs leading-relaxed text-muted-foreground">
            <div>
              <p className="font-semibold text-foreground mb-1">Outlook (Microsoft 365)</p>
              <ol className="list-decimal pl-4 space-y-0.5">
                <li>Outlook on the web → 設定（歯車）→「カレンダー」→「共有カレンダー」</li>
                <li>「カレンダーの公開」で自分のカレンダーを選び、公開範囲（例：すべての詳細を閲覧可能）を選択して「公開」</li>
                <li>表示された <b>ICS 形式の URL</b> をコピーしてここに貼り付け</li>
              </ol>
            </div>
            <div>
              <p className="font-semibold text-foreground mb-1">Google カレンダー</p>
              <ol className="list-decimal pl-4 space-y-0.5">
                <li>PC 版 Google カレンダー → 対象カレンダーの「設定と共有」</li>
                <li>「カレンダーの統合」セクションの <b>「iCal 形式の非公開 URL」</b> をコピー</li>
                <li>ここに貼り付け（「限定公開 URL」のため知っている人だけがアクセスできます）</li>
              </ol>
            </div>
            <div className="flex items-start gap-1.5 text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>組織のポリシーによってはカレンダーの公開が無効化されている場合があります。その場合は管理者にご確認ください。</span>
            </div>
          </div>
        )}

        {/* 追加フォーム */}
        <div className="space-y-3 rounded-lg border p-3">
          <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-3">
            <div className="space-y-1.5">
              <Label>ラベル</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例：会社Outlook" />
            </div>
            <div className="space-y-1.5">
              <Label>公開 ICS URL</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://outlook.office365.com/owa/calendar/.../calendar.ics" />
            </div>
          </div>
          <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
            <span>この URL はあなたの予定にアクセスできる秘密情報です。暗号化して保存され、他のユーザーには表示されません。</span>
          </div>
          <Button
            size="sm"
            onClick={() => addMutation.mutate()}
            disabled={!label.trim() || !url.trim() || addMutation.isPending}
          >
            {addMutation.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />}
            連携を追加して同期
          </Button>
        </div>

        {notice && <p className="text-sm text-green-700">{notice}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* フィード一覧 */}
        <div className="space-y-2">
          <p className="text-sm font-semibold">連携中のカレンダー</p>
          {isLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : feeds.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">まだ連携がありません。</p>
          ) : (
            feeds.map((f) => (
              <div key={f.id} className="rounded-lg border p-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{f.label}</span>
                  <code className="text-[11px] text-muted-foreground">{f.url_masked}</code>
                  <div className="ml-auto flex items-center gap-1">
                    <Button
                      size="sm" variant="outline" className="h-8"
                      onClick={() => syncMutation.mutate(f.id)}
                      disabled={syncMutation.isPending}
                      title="今すぐ同期"
                    >
                      {syncMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    </Button>
                    <Button
                      size="sm" variant="outline" className="h-8 text-destructive border-destructive/40 hover:bg-destructive/10"
                      onClick={() => { if (confirm(`「${f.label}」の連携を解除しますか？（同期済みの予定も削除されます）`)) deleteMutation.mutate(f.id); }}
                      disabled={deleteMutation.isPending}
                      title="連携を解除"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {f.last_synced_at
                    ? `最終同期: ${new Date(f.last_synced_at).toLocaleString("ja-JP")}${f.event_count != null ? ` ・ ${f.event_count} 件` : ""}`
                    : "未同期"}
                </p>
                {f.last_error && (
                  <p className="flex items-start gap-1 text-[11px] text-destructive">
                    <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                    {f.last_error}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
