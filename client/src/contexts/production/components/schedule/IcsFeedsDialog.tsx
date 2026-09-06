import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { FormDialog } from "@gmo-onair/shared/src/client-v4/formDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Trash2, RefreshCw, Plus, AlertTriangle, ShieldAlert, ChevronDown, Link2 } from "lucide-react";
import type { IcsFeed } from "./scheduleShared";
import { IcsFeedList } from "./IcsFeedList";

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
/**
 * 貼られた ICS の URL から**ラベルの既定値**を作る。
 * 「名前を先に考えさせない」ための補助なので、外したときは空を返して手入力に任せる。
 */
function labelFromUrl(raw: string): string {
  let host = '';
  try { host = new URL(raw.trim()).hostname.toLowerCase(); } catch { return ''; }
  if (!host) return '';
  if (host.includes('office365') || host.includes('outlook') || host.includes('live.com')) return 'Outlook';
  if (host.includes('google')) return 'Google カレンダー';
  if (host.includes('icloud')) return 'iCloud';
  return host.replace(/^www\./, '');
}

export default function IcsFeedsDialog({ open, onOpenChange }: Props) {
  const qc = useQueryClient();
  const [label, setLabel] = useState("");
  // ラベルを**人が手で書いたか**。書かれるまでは URL を打つたび既定値を入れ直す
  // （`https://g` のような途中の文字列も `new URL` は通るので、「空のときだけ」だと
  //  最初の一打で `g` に固まってしまう。Codex のレビュー指摘 P2）
  const [labelTouched, setLabelTouched] = useState(false);
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
    qc.invalidateQueries({ queryKey: ["personal-ics-feeds"] });
    qc.invalidateQueries({ queryKey: ["personal-events"] });
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
    onError: (err: any) => { setNotice(null); setError(err?.response?.data?.error?.message || "予定を同期できませんでした。少し時間をおいてもう一度お試しください。"); },
  });

  const googleDisconnectMutation = useMutation({
    mutationFn: async () => api.delete("/schedule/google"),
    onSuccess: () => { invalidate(); setNotice("Google カレンダーの連携を解除しました（同期済みの予定も削除されます）"); },
    onError: (err: any) => { setNotice(null); setError(err?.response?.data?.error?.message || "連携を解除できませんでした。少し時間をおいてもう一度お試しください。"); },
  });

  const msSyncMutation = useMutation({
    mutationFn: async () => (await api.post("/schedule/ms/sync")).data.data,
    onSuccess: (data: any) => {
      invalidate();
      setError(null);
      setNotice(`Outlook カレンダーを同期しました（${data.total} 件 / 追加 ${data.created} / 更新 ${data.updated} / 削除 ${data.removed}）`);
    },
    onError: (err: any) => { setNotice(null); setError(err?.response?.data?.error?.message || "予定を同期できませんでした。少し時間をおいてもう一度お試しください。"); },
  });

  const msDisconnectMutation = useMutation({
    mutationFn: async () => api.delete("/schedule/ms"),
    onSuccess: () => { invalidate(); setNotice("Outlook カレンダーの連携を解除しました（同期済みの予定も削除されます）"); },
    onError: (err: any) => { setNotice(null); setError(err?.response?.data?.error?.message || "連携を解除できませんでした。少し時間をおいてもう一度お試しください。"); },
  });

  const addMutation = useMutation({
    mutationFn: async () => (await api.post("/schedule/feeds", { label, url })).data.data,
    onSuccess: (data: any) => {
      invalidate();
      setLabel(""); setLabelTouched(false); setUrl(""); setError(null);
      setNotice(data?.sync
        ? `連携しました（${data.sync.total} 件の予定を同期）`
        : "連携しました。初回同期に失敗した場合は一覧のエラーを確認してください");
    },
    onError: (err: any) => { setNotice(null); setError(err?.response?.data?.error?.message || "カレンダーを追加できませんでした。URL が正しいか確かめてください。"); },
  });

  const syncMutation = useMutation({
    mutationFn: async (feedId: string) => (await api.post(`/schedule/feeds/${feedId}/sync`)).data.data,
    onSuccess: (data: any) => {
      invalidate();
      setError(null);
      setNotice(`同期しました（${data.total} 件 / 追加 ${data.created} / 更新 ${data.updated} / 削除 ${data.removed}）`);
    },
    onError: (err: any) => { setNotice(null); setError(err?.response?.data?.error?.message || "予定を同期できませんでした。少し時間をおいてもう一度お試しください。"); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (feedId: string) => api.delete(`/schedule/feeds/${feedId}`),
    onSuccess: () => { invalidate(); setNotice("連携を解除しました（同期済みの予定も削除されます）"); },
    onError: (err: any) => { setNotice(null); setError(err?.response?.data?.error?.message || "連携を削除できませんでした。少し時間をおいてもう一度お試しください。"); },
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="外部カレンダー連携（Outlook / Google）"
      sub="Google・Outlook はつなぐと両方向で同期します。URL を貼るだけの場合は ONAiR に取り込むだけです。"
    >
        {/* 連携中の一覧を先頭に置く（切り出した理由は `IcsFeedList.tsx` の冒頭） */}
        <IcsFeedList
          feeds={feeds}
          isLoading={isLoading}
          onSync={(id) => syncMutation.mutate(id)}
          syncing={syncMutation.isPending}
          onDelete={(id) => deleteMutation.mutate(id)}
          deleting={deleteMutation.isPending}
        />

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
                    onClick={() => { if (confirm("Google カレンダーの連携を解除しますか？（同期済みの予定も削除されます）")) googleDisconnectMutation.mutate(); }}
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
                    onClick={() => { if (confirm("Outlook カレンダーの連携を解除しますか？（同期済みの予定も削除されます）")) msDisconnectMutation.mutate(); }}
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
          {/* **URL を先に訊く。** 上の手順ガイドが言うとおり、この欄に来た人が手に持っているのは
              コピーした URL のほうで、ラベルは後から付ける名前。以前は「ラベル → URL」の順で、
              先に名前を考えさせていた（`docs/design/v4/_form-order.md` 3.）。
              ラベルは URL のホスト名から既定値を入れる（**手で書き換えるまでは入れ直す**）。
              「空のときだけ」にすると、`https://g` のような打ちかけでも `new URL` が通って
              しまうので、最初の一打で `g` に固まる */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-3">
            <div className="space-y-1.5">
              <Label>公開 ICS URL</Label>
              <Input
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  if (!labelTouched) setLabel(labelFromUrl(e.target.value));
                }}
                placeholder="https://outlook.office365.com/owa/calendar/…/calendar.ics"
              />
            </div>
            <div className="space-y-1.5">
              <Label>ラベル</Label>
              <Input
                value={label}
                onChange={(e) => { setLabel(e.target.value); setLabelTouched(true); }}
                placeholder="例：会社Outlook"
              />
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

    </FormDialog>
  );
}
