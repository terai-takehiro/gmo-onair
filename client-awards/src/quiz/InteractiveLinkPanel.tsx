import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Link2, Download, Upload, Loader2, CheckCircle2, AlertCircle, Unlink, Activity } from 'lucide-react';
import { confirmAction } from '@gmo-onair/shared/src/client/ui';

/**
 * 表彰CG ⇄ インタラクティブ演出 (別 VPS) 連携パネル — v2.9.24
 *
 * - 設定 (1回): Interactive の URL + API キー + 対象イベントを保存
 * - ⬇ 取込: Interactive で入力した問題本文・選択肢 (ja/en) を CG に取り込む
 * - ⬆ 送信: CG で入力した問題本文・選択肢 (ja/en) を Interactive に書き込む
 * - 投票数は連携済みなら自動でリアルタイム反映 (poller、操作不要)
 */
interface LinkConfig {
  configured: boolean;
  baseUrl?: string;
  apiKeyPrefix?: string | null;
  interactiveEventId?: string;
  closeBufferSeconds?: number;
  autoControl?: boolean;
}
interface IaEvent { id: string; title: string; status: string }

export default function InteractiveLinkPanel({ eventId }: { eventId: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState('https://interactive.gmo-onair.jp');
  const [apiKey, setApiKey] = useState('');
  const [iaEventId, setIaEventId] = useState('');
  const [iaEvents, setIaEvents] = useState<IaEvent[] | null>(null);
  const [closeBuffer, setCloseBuffer] = useState(0);
  const [autoControl, setAutoControl] = useState(true);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const { data: cfg } = useQuery({
    queryKey: ['interactive-link', eventId],
    queryFn: async () => {
      const r = await api.get(`/quiz/events/${eventId}/interactive-link`);
      const c = r.data.data as LinkConfig;
      if (c.configured) {
        setBaseUrl(c.baseUrl || baseUrl);
        setIaEventId(c.interactiveEventId || '');
        setCloseBuffer(c.closeBufferSeconds ?? 0);
        setAutoControl(c.autoControl !== false);
      }
      return c;
    },
  });

  const flash = (kind: 'ok' | 'err', text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 5000);
  };

  // 接続テスト + イベント一覧取得
  const testMut = useMutation({
    mutationFn: async () => {
      const r = await api.post(`/quiz/events/${eventId}/interactive-link/list-events`, { baseUrl, apiKeySecret: apiKey || undefined });
      return r.data.data as IaEvent[];
    },
    onSuccess: (events) => { setIaEvents(events); flash('ok', `接続成功: ${events.length} 件のイベントが見つかりました`); },
    onError: (e: any) => flash('err', e?.response?.data?.error?.message || '接続に失敗しました'),
  });

  const saveMut = useMutation({
    mutationFn: () => api.put(`/quiz/events/${eventId}/interactive-link`, { baseUrl, apiKeySecret: apiKey || undefined, interactiveEventId: iaEventId, closeBufferSeconds: closeBuffer, autoControl }),
    onSuccess: () => { setApiKey(''); qc.invalidateQueries({ queryKey: ['interactive-link', eventId] }); flash('ok', '連携設定を保存しました'); },
    onError: (e: any) => flash('err', e?.response?.data?.error?.message || '保存に失敗しました'),
  });

  const unlinkMut = useMutation({
    mutationFn: () => api.delete(`/quiz/events/${eventId}/interactive-link`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['interactive-link', eventId] }); setIaEventId(''); flash('ok', '連携を解除しました'); },
  });

  const pullMut = useMutation({
    mutationFn: async () => (await api.post(`/quiz/events/${eventId}/interactive-link/pull`)).data.data as { created: number; updated: number },
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ['quizzes', eventId] }); flash('ok', `取込完了: 新規 ${d.created} 件 / 更新 ${d.updated} 件`); },
    onError: (e: any) => flash('err', e?.response?.data?.error?.message || '取込に失敗しました'),
  });

  const pushMut = useMutation({
    mutationFn: async () => (await api.post(`/quiz/events/${eventId}/interactive-link/push`)).data.data as { pushed: number },
    onSuccess: (d) => { qc.invalidateQueries({ queryKey: ['quizzes', eventId] }); flash('ok', `送信完了: ${d.pushed} 件を Interactive に書き込みました`); },
    onError: (e: any) => flash('err', e?.response?.data?.error?.message || '送信に失敗しました'),
  });

  // 連携の総合診断 (票が CG に反映されない原因の特定用)
  const [diag, setDiag] = useState<Record<string, unknown> | null>(null);
  const diagMut = useMutation({
    mutationFn: async () => (await api.get(`/quiz/events/${eventId}/interactive-link/diagnose`)).data.data as Record<string, unknown>,
    onSuccess: (d) => { setDiag(d); flash('ok', '診断を取得しました（下に結果）'); },
    onError: (e: any) => flash('err', e?.response?.data?.error?.message || '診断に失敗しました'),
  });

  // 診断結果から人間向けの判定文を作る
  const diagVerdict = (d: Record<string, unknown> | null): { kind: 'ok' | 'err' | 'warn'; text: string }[] => {
    if (!d) return [];
    const out: { kind: 'ok' | 'err' | 'warn'; text: string }[] = [];
    if (!d.linkConfigured) { out.push({ kind: 'err', text: '連携が未設定です（このイベントに interactive_link がありません）' }); return out; }
    if (d.interactiveError) { out.push({ kind: 'err', text: `Interactive への接続でエラー: ${String(d.interactiveError)}（URL / API キーを確認）` }); return out; }
    const stack = d.stack as { step?: string } | null;
    if (!stack || stack.step === 'idle' || !stack.step) out.push({ kind: 'warn', text: 'いま出題中（poll）ではありません。クイズを TAKE して出題中にしてから診断すると票が見えます' });
    const rl = d.resultsForLinked as { total?: number } | null;
    const ra = d.resultsForActive as { total?: number } | null;
    const linkedTotal = rl?.total ?? 0;
    const activeTotal = ra?.total ?? 0;
    const fetched = Math.max(linkedTotal, activeTotal);

    // poller の稼働確認
    const hb = d.pollerHeartbeat as { lastRunAt?: number | null; lastByEvent?: Record<string, { total?: number; wrote?: boolean }> } | null;
    const lastRun = hb?.lastRunAt ?? null;
    const pollerStale = !lastRun || (Date.now() - lastRun > 6000);
    if (pollerStale) {
      out.push({ kind: 'err', text: 'poller が動いていない可能性があります（直近の実行が確認できません）。サーバー再起動 / 設定を確認します' });
    }

    // Awards 側 DB の票数 (poller が書き込む先) と getResults を比較
    const choices = (d.currentQuizChoices as { position: number; vote_count: number }[] | undefined) ?? [];
    const dbTotal = choices.reduce((s, c) => s + (Number(c.vote_count) || 0), 0);

    if (fetched > 0 && dbTotal > 0) {
      out.push({ kind: 'ok', text: `Interactive から取得(${fetched}票) → Awards DB にも反映済(${dbTotal}票)。ここまで正常なので、CG に出ないのは出力URL側の更新だけ。出力(OBS)をリロードしてください` });
    } else if (fetched > 0 && dbTotal === 0) {
      out.push({ kind: 'err', text: `Interactive からは ${fetched}票 取れているのに Awards DB が 0票 = poller が DB に書けていません（poller の対象一致 or 書き込みの問題）。これは要修正です` });
    } else {
      out.push({ kind: 'err', text: 'Interactive 側からこの問題の票が 0 です。下の一覧で票(answer_count)が入っている問題が active か確認してください' });
    }
    return out;
  };

  const configured = cfg?.configured;

  return (
    <div className="mb-6 rounded-xl border border-info bg-info/10/40 p-4">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-sm font-bold text-info">
        <Link2 className="h-4 w-4" />
        インタラクティブ演出 連携
        {configured
          ? <span className="ml-1 rounded-full bg-success-surface px-2 py-0.5 text-[10px] font-semibold text-success">連携中</span>
          : <span className="ml-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">未設定</span>}
        <span className="ml-auto text-xs text-info">{open ? '閉じる ▲' : '開く ▼'}</span>
      </button>

      {/* 連携済みなら取込/送信ボタンを常時表示 */}
      {configured && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={() => pullMut.mutate()} disabled={pullMut.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-info hover:bg-info/90 disabled:opacity-50 px-3 py-2 text-xs font-bold text-white">
            {pullMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Interactive から取込
          </button>
          <button onClick={async () => { if ((await confirmAction({ title: 'CG の全 quiz の本文・選択肢を Interactive に書き込みます。よろしいですか？' }))) pushMut.mutate(); }} disabled={pushMut.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-primary hover:bg-primary/90/90 disabled:opacity-50 px-3 py-2 text-xs font-bold text-white">
            {pushMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Interactive へ送信
          </button>
          <button onClick={() => diagMut.mutate()} disabled={diagMut.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-warning hover:bg-warning/90 disabled:opacity-50 px-3 py-2 text-xs font-bold text-warning-foreground">
            {diagMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Activity className="h-3.5 w-3.5" />}
            連携を診断
          </button>
          <span className="text-[11px] text-info">投票数は連携中なら自動でリアルタイム反映されます</span>
        </div>
      )}

      {/* 診断結果 */}
      {diag && (
        <div className="mt-3 space-y-2 rounded-lg border border-warning bg-warning-surface/60 p-3">
          <div className="text-xs font-bold text-warning-strong">連携診断結果</div>
          {diagVerdict(diag).map((v, i) => (
            <div key={i} className={`flex items-start gap-2 rounded px-2 py-1.5 text-xs ${v.kind === 'ok' ? 'bg-success-surface text-success' : v.kind === 'warn' ? 'bg-warning-surface text-warning-strong' : 'bg-destructive-surface text-destructive'}`}>
              {v.kind === 'ok' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
              <span>{v.text}</span>
            </div>
          ))}
          <details className="text-[11px]">
            <summary className="cursor-pointer font-semibold text-warning-strong">詳細 JSON（コピーして共有可）</summary>
            <pre className="mt-1 max-h-64 overflow-auto rounded bg-background p-2 text-[10px] leading-tight text-foreground">{JSON.stringify(diag, null, 2)}</pre>
          </details>
        </div>
      )}

      {msg && (
        <div className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${msg.kind === 'ok' ? 'bg-success-surface text-success' : 'bg-destructive-surface text-destructive'}`}>
          {msg.kind === 'ok' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {msg.text}
        </div>
      )}

      {open && (
        <div className="mt-4 space-y-3 border-t border-info pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs">
              <span className="block mb-1 font-semibold text-muted-foreground">Interactive URL</span>
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://interactive.gmo-onair.jp"
                className="w-full rounded border px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs">
              <span className="block mb-1 font-semibold text-muted-foreground">
                API キー {configured && <span className="text-success">(設定済 {cfg?.apiKeyPrefix}… / 変更時のみ入力)</span>}
              </span>
              <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                placeholder={configured ? '変更しない場合は空欄' : 'ak_...'}
                className="w-full rounded border px-2 py-1.5 text-sm" />
            </label>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs flex-1 min-w-[200px]">
              <span className="block mb-1 font-semibold text-muted-foreground">連携先イベント</span>
              {iaEvents
                ? (
                  <select value={iaEventId} onChange={(e) => setIaEventId(e.target.value)}
                    className="w-full rounded border px-2 py-1.5 text-sm">
                    <option value="">選択してください</option>
                    {iaEvents.map((ev) => <option key={ev.id} value={ev.id}>{ev.title} ({ev.status})</option>)}
                  </select>
                )
                : (
                  <input value={iaEventId} onChange={(e) => setIaEventId(e.target.value)}
                    placeholder="「接続テスト」でイベントを取得"
                    className="w-full rounded border px-2 py-1.5 text-sm" />
                )}
            </label>
            <button onClick={() => testMut.mutate()} disabled={testMut.isPending || !baseUrl}
              className="rounded-lg bg-accent hover:bg-accent disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
              {testMut.isPending ? '確認中…' : '接続テスト'}
            </button>
          </div>

          {/* カウントダウン連動 出題/締切 */}
          <div className="rounded-lg border border-info bg-white/60 p-3 space-y-2">
            <label className="flex items-center gap-2 text-sm font-semibold text-info">
              <input type="checkbox" checked={autoControl} onChange={(e) => setAutoControl(e.target.checked)} className="h-4 w-4 accent-primary" />
              カウントダウンに連動して自動で出題・締切する
            </label>
            <p className="text-[11px] leading-relaxed text-info">
              ON にすると、CG のカウントダウン開始でインタラクティブ側を自動「出題」、カウントダウン終了
              （+下のバッファ秒）で自動「締切」します。集計結果は締切後も自動反映されます。
            </p>
            <label className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-muted-foreground">配信ディレイ バッファ</span>
              <input type="number" min={0} max={120} value={closeBuffer}
                onChange={(e) => setCloseBuffer(Math.max(0, Math.min(120, Math.floor(Number(e.target.value) || 0))))}
                disabled={!autoControl}
                className="w-20 rounded border px-2 py-1 text-sm disabled:opacity-50" />
              <span className="text-muted-foreground">秒（カウントダウン終了からこの秒数後に締切）</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !baseUrl || !iaEventId}
              className="rounded-lg bg-info hover:bg-info/90 disabled:opacity-50 px-4 py-2 text-sm font-bold text-white">
              {saveMut.isPending ? '保存中…' : '連携設定を保存'}
            </button>
            {configured && (
              <button onClick={async () => { if ((await confirmAction({ title: '連携を解除します（quiz の紐づけも外れます）。よろしいですか？', confirmLabel: '解除する', tone: 'danger' }))) unlinkMut.mutate(); }}
                className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-destructive hover:bg-destructive/90-surface">
                <Unlink className="h-3.5 w-3.5" />連携解除
              </button>
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-info">
            複数言語 (日本語/英語) の投票はインタラクティブ側で自動的に合算され、合算値が CG に反映されます。
            問題文・選択肢は日本語=無印・英語=_en として双方向に同期します。
          </p>
        </div>
      )}
    </div>
  );
}
