import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invalidateSchedule } from "@/lib/scheduleQueries";
import api from "@/lib/api";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2, RefreshCw, Plus, CloudDownload, AlertTriangle, ShieldAlert, ChevronDown, Link2 } from "lucide-react";
import type { IcsFeed } from "./scheduleShared";
import { confirmAction } from '@gmo-onair/shared/src/client/ui';

interface OAuthStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  last_synced_at: string | null;
  last_error: string | null;
  event_count: number | null;
  can_write?: boolean; // 書き込みスコープで連携済み (ONAiR→外部の書き戻し可)
}

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

  const { data: google } = useQuery<OAuthStatus>({
    queryKey: ["google-cal-status"],
    queryFn: async () => (await api.get("/schedule/google/status")).data.data,
    enabled: open,
  });

  const { data: outlook } = useQuery<OAuthStatus>({
    queryKey: ["ms-cal-status"],
    queryFn: async () => (await api.get("/schedule/ms/status")).data.data,
    enabled: open,
  });

  const invalidate = () => {
    // 予定そのものは層の定義から (鍵を足したときにここが取り残されないように)
    invalidateSchedule(qc, "personal");
    // 連携の設定・接続状態はこの画面だけのもの
    qc.invalidateQueries({ queryKey: ["personal-ics-feeds"] });
    qc.invalidateQueries({ queryKey: ["google-cal-status"] });
    qc.invalidateQueries({ queryKey: ["ms-cal-status"] });
  };

  const googleSyncMutation = useMutation({
    mutationFn: async () => (await api.post("/schedule/google/sync")).data.data,
    onSuccess: (data: any) => {
      invalidate();
      setError(null);
      setNotice(`Google カレンダーを同期しました（${data.total} 件 / 追加 ${data.created} / 更新 ${data.updated} / 削除 ${data.removed}）`);
    },
    onError: (err: any) => { setNotice(null); setError(err?.response?.data?.error?.message || "同期に失敗しました"); },
  });

  const googleDisconnectMutation = useMutation({
    mutationFn: async () => api.delete("/schedule/google"),
    onSuccess: () => { invalidate(); setNotice("Google カレンダーの連携を解除しました（同期済みの予定も削除されます）"); },
    onError: (err: any) => { setNotice(null); setError(err?.response?.data?.error?.message || "連携解除に失敗しました"); },
  });

  const msSyncMutation = useMutation({
    mutationFn: async () => (await api.post("/schedule/ms/sync")).data.data,
    onSuccess: (data: any) => {
      invalidate();
      setError(null);
      setNotice(`Outlook カレンダーを同期しました（${data.total} 件 / 追加 ${data.created} / 更新 ${data.updated} / 削除 ${data.removed}）`);
    },
    onError: (err: any) => { setNotice(null); setError(err?.response?.data?.error?.message || "同期に失敗しました"); },
  });

  const msDisconnectMutation = useMutation({
    mutationFn: async () => api.delete("/schedule/ms"),
    onSuccess: () => { invalidate(); setNotice("Outlook カレンダーの連携を解除しました（同期済みの予定も削除されます）"); },
    onError: (err: any) => { setNotice(null); setError(err?.response?.data?.error?.message || "連携解除に失敗しました"); },
  });

  /**
   * 貼られた URL が、既に OAuth で繋がっている提供元のものかを見る (v3.1.2)。
   *
   * 同じカレンダーを OAuth と ICS購読 の両方から取り込むと、**その人のすべての予定が
   * 2 行になる**。一意索引は取込元ごとに閉じているので構造では止まらない。
   * ただし「Google 連携済みだが、別の共有カレンダーを ICS で購読したい」は正当なので、
   * **禁止はせず確認する**（会社ポリシーで ICS しか使えない人もいる）。
   */
  const connectedProviderFor = (rawUrl: string): string | null => {
    let host = '';
    try { host = new URL(rawUrl.trim().replace(/^webcal:\/\//i, 'https://')).hostname.toLowerCase(); }
    catch { return null; }
    if (google?.connected && /(^|\.)google\.com$|(^|\.)googleusercontent\.com$/.test(host)) return 'Google';
    if (outlook?.connected && /(^|\.)(outlook|office365|office|live)\.com$|(^|\.)outlook\.office365\.com$/.test(host)) return 'Outlook';
    return null;
  };

  const handleAdd = async () => {
    const provider = connectedProviderFor(url);
    if (provider) {
      const go = await confirmAction({
        title: `${provider} は既に連携済みです。この URL も追加しますか？`,
        description:
          `同じカレンダーを ${provider} 連携と ICS購読の両方から取り込むと、以後すべての予定が2件ずつ並びます。`
          + `別の共有カレンダー（チームの予定など）を足す場合はそのまま進めてください。`,
        confirmLabel: 'それでも追加する',
      });
      if (!go) return;
    }
    addMutation.mutate();
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
            Google / Outlook と OAuth 連携すると、双方向で同期します（外部→取込 + マイカレンダーで作った予定を外部へ書き戻し）。
            公開 ICS URL での連携は取込のみの一方向です。
          </DialogDescription>
        </DialogHeader>

        {/* 両方つないでいるときの注意 (v3.1.2)。
            Google と Outlook の**両方**につなぐと、片方に同じ会議が転送されている場合に
            同じ予定が2件ずつ入る。一意索引は取込元ごとに閉じているので構造では止まらない。
            会社と個人で別々のカレンダーを持つのは正当なので、禁止はせず注意だけ出す。 */}
        {google?.connected && outlook?.connected && (
          <div className="flex items-start gap-2 rounded-lg border border-warning-strong/40 bg-warning-surface p-3 text-xs text-warning-strong">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              <b>Google と Outlook の両方につながっています。</b>
              片方にもう片方の予定が転送されている場合、同じ予定が2件ずつ並びます。
              カレンダーが実際に別（会社と個人など）なら問題ありません。
              重なって見えるときは、使っていない方の連携を解除してください。
            </span>
          </div>
        )}

        {/* Google カレンダー OAuth 連携 (会社 Workspace は ICS 公開が無効なことが多いため推奨) */}
        <div className="space-y-2 rounded-lg border border-green-600/30 bg-green-50/40 p-3">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "#16a34a" }} />
            <span className="text-sm font-semibold">Google カレンダー（推奨）</span>
          </div>
          {!google ? (
            <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : !google.configured ? (
            <p className="text-xs text-muted-foreground">
              管理者が Google 連携を設定すると、ログイン認証だけで自分の Google カレンダーを取り込めるようになります。
            </p>
          ) : !google.connected ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Google にログインして許可すると、双方向で同期します（自分のカレンダーを 15 分ごとに取り込み + マイカレンダーで作った予定を Google へ書き戻し）。
                会社ポリシーで ICS 公開ができない場合はこちらをご利用ください。
              </p>
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700"
                onClick={() => { window.location.href = "/api/v1/internal/schedule/google/start"; }}
              >
                <Link2 className="mr-1 h-4 w-4" />
                Google と連携
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{google.email || "連携中"}</span>
                <span className="rounded bg-green-600/15 px-1.5 py-0.5 text-[11px] font-medium text-green-700">
                  {google.can_write ? "双方向同期" : "取込のみ"}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    size="sm" variant="outline" className="h-8"
                    onClick={() => googleSyncMutation.mutate()}
                    disabled={googleSyncMutation.isPending}
                    title="今すぐ同期"
                  >
                    {googleSyncMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="sm" variant="outline" className="h-8 text-destructive border-destructive/40 hover:bg-destructive/10"
                    onClick={async () => { if ((await confirmAction({ title: "Google カレンダーの連携を解除しますか？", description: "（同期済みの予定も削除されます）", confirmLabel: '削除する', tone: 'danger' }))) googleDisconnectMutation.mutate(); }}
                    disabled={googleDisconnectMutation.isPending}
                    title="連携を解除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {!google.can_write && (
                <button
                  type="button"
                  onClick={() => { window.location.href = "/api/v1/internal/schedule/google/start"; }}
                  className="flex w-full items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-left text-[11px] text-amber-800 hover:bg-amber-100"
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>ONAiR で作った予定を Google へ書き戻すには <b>再連携</b>（書き込み許可）が必要です。タップして再連携。</span>
                </button>
              )}
              <p className="text-[11px] text-muted-foreground">
                {google.last_synced_at
                  ? `最終同期: ${new Date(google.last_synced_at).toLocaleString("ja-JP")}${google.event_count != null ? ` ・ ${google.event_count} 件` : ""}`
                  : "未同期"}
              </p>
              {google.last_error && (
                <p className="flex items-start gap-1 text-[11px] text-destructive">
                  <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                  {google.last_error}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Outlook (Microsoft 365) OAuth 連携 */}
        <div className="space-y-2 rounded-lg border border-[#0078d4]/30 bg-[#0078d4]/5 p-3">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: "#0078d4" }} />
            <span className="text-sm font-semibold">Outlook カレンダー（推奨）</span>
          </div>
          {!outlook ? (
            <div className="flex justify-center py-2"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
          ) : !outlook.configured ? (
            <p className="text-xs text-muted-foreground">
              管理者が Outlook 連携を設定すると、ログイン認証だけで自分の Outlook カレンダーを取り込めるようになります。
            </p>
          ) : !outlook.connected ? (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Microsoft にログインして許可すると、双方向で同期します（自分のカレンダーを 15 分ごとに取り込み + マイカレンダーで作った予定を Outlook へ書き戻し）。
                会社ポリシーで ICS 公開ができない場合はこちらをご利用ください。
              </p>
              <Button
                size="sm"
                className="bg-[#0078d4] hover:bg-[#106ebe]"
                onClick={() => { window.location.href = "/api/v1/internal/schedule/ms/start"; }}
              >
                <Link2 className="mr-1 h-4 w-4" />
                Outlook と連携
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{outlook.email || "連携中"}</span>
                <span className="rounded bg-[#0078d4]/15 px-1.5 py-0.5 text-[11px] font-medium text-[#0078d4]">
                  {outlook.can_write ? "双方向同期" : "取込のみ"}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  <Button
                    size="sm" variant="outline" className="h-8"
                    onClick={() => msSyncMutation.mutate()}
                    disabled={msSyncMutation.isPending}
                    title="今すぐ同期"
                  >
                    {msSyncMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="sm" variant="outline" className="h-8 text-destructive border-destructive/40 hover:bg-destructive/10"
                    onClick={async () => { if ((await confirmAction({ title: "Outlook カレンダーの連携を解除しますか？", description: "（同期済みの予定も削除されます）", confirmLabel: '削除する', tone: 'danger' }))) msDisconnectMutation.mutate(); }}
                    disabled={msDisconnectMutation.isPending}
                    title="連携を解除"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {!outlook.can_write && (
                <button
                  type="button"
                  onClick={() => { window.location.href = "/api/v1/internal/schedule/ms/start"; }}
                  className="flex w-full items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 p-2 text-left text-[11px] text-amber-800 hover:bg-amber-100"
                >
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>ONAiR で作った予定を Outlook へ書き戻すには <b>再連携</b>（書き込み許可）が必要です。タップして再連携。</span>
                </button>
              )}
              <p className="text-[11px] text-muted-foreground">
                {outlook.last_synced_at
                  ? `最終同期: ${new Date(outlook.last_synced_at).toLocaleString("ja-JP")}${outlook.event_count != null ? ` ・ ${outlook.event_count} 件` : ""}`
                  : "未同期"}
              </p>
              {outlook.last_error && (
                <p className="flex items-start gap-1 text-[11px] text-destructive">
                  <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                  {outlook.last_error}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          または 公開 ICS URL で連携
          <span className="h-px flex-1 bg-border" />
        </div>

        {/* URL の発行手順ガイド */}
        <button
          type="button"
          onClick={() => setGuideOpen(!guideOpen)}
          className="h-ctl-3 flex w-full items-center gap-2 rounded-lg border bg-muted/30 px-3 text-sm font-medium hover:bg-muted/50"
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
            <div className="flex items-start gap-1.5 text-warning-strong">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                <b>同じカレンダーを2通りの方法で登録しないでください。</b>
                上の OAuth 連携（Google / Outlook）で取り込んでいるカレンダーを、
                さらに ICS URL でも登録すると、同じ予定が2件ずつ並びます。
                ここに入れるのは「OAuth では取れないカレンダー」だけにしてください。
              </span>
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
            onClick={() => { void handleAdd(); }}
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
            <p className="text-sm text-muted-foreground py-2">
              連携しているカレンダーはまだありません。下の欄に ICS の URL を入れると、予定を取り込めます。
            </p>
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
                      onClick={async () => { if ((await confirmAction({ title: `「${f.label}」の連携を解除しますか？`, description: `（同期済みの予定も削除されます）`, confirmLabel: '削除する', tone: 'danger' }))) deleteMutation.mutate(f.id); }}
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
