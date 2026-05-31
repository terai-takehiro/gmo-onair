import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Link2, Download, Upload, Loader2, CheckCircle2, AlertCircle, Unlink } from 'lucide-react';

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
}
interface IaEvent { id: string; title: string; status: string }

export default function InteractiveLinkPanel({ eventId }: { eventId: number }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [baseUrl, setBaseUrl] = useState('https://interactive.gmo-onair.jp');
  const [apiKey, setApiKey] = useState('');
  const [iaEventId, setIaEventId] = useState('');
  const [iaEvents, setIaEvents] = useState<IaEvent[] | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const { data: cfg } = useQuery({
    queryKey: ['interactive-link', eventId],
    queryFn: async () => {
      const r = await api.get(`/quiz/events/${eventId}/interactive-link`);
      const c = r.data.data as LinkConfig;
      if (c.configured) {
        setBaseUrl(c.baseUrl || baseUrl);
        setIaEventId(c.interactiveEventId || '');
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
    mutationFn: () => api.put(`/quiz/events/${eventId}/interactive-link`, { baseUrl, apiKeySecret: apiKey || undefined, interactiveEventId: iaEventId }),
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

  const configured = cfg?.configured;

  return (
    <div className="mb-6 rounded-xl border border-cyan-200 bg-cyan-50/40 p-4">
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-sm font-bold text-cyan-900">
        <Link2 className="h-4 w-4" />
        インタラクティブ演出 連携
        {configured
          ? <span className="ml-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">連携中</span>
          : <span className="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-600">未設定</span>}
        <span className="ml-auto text-xs text-cyan-700">{open ? '閉じる ▲' : '開く ▼'}</span>
      </button>

      {/* 連携済みなら取込/送信ボタンを常時表示 */}
      {configured && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={() => pullMut.mutate()} disabled={pullMut.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 px-3 py-2 text-xs font-bold text-white">
            {pullMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Interactive から取込
          </button>
          <button onClick={() => { if (window.confirm('CG の全 quiz の本文・選択肢を Interactive に書き込みます。よろしいですか？')) pushMut.mutate(); }} disabled={pushMut.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-3 py-2 text-xs font-bold text-white">
            {pushMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Interactive へ送信
          </button>
          <span className="text-[11px] text-cyan-700">投票数は連携中なら自動でリアルタイム反映されます</span>
        </div>
      )}

      {msg && (
        <div className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${msg.kind === 'ok' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
          {msg.kind === 'ok' ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {msg.text}
        </div>
      )}

      {open && (
        <div className="mt-4 space-y-3 border-t border-cyan-200 pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs">
              <span className="block mb-1 font-semibold text-muted-foreground">Interactive URL</span>
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://interactive.gmo-onair.jp"
                className="w-full rounded border px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs">
              <span className="block mb-1 font-semibold text-muted-foreground">
                API キー {configured && <span className="text-green-600">(設定済 {cfg?.apiKeyPrefix}… / 変更時のみ入力)</span>}
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
              className="rounded-lg bg-slate-200 hover:bg-slate-300 disabled:opacity-50 px-3 py-1.5 text-xs font-semibold text-slate-700">
              {testMut.isPending ? '確認中…' : '接続テスト'}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !baseUrl || !iaEventId}
              className="rounded-lg bg-cyan-700 hover:bg-cyan-600 disabled:opacity-50 px-4 py-2 text-sm font-bold text-white">
              {saveMut.isPending ? '保存中…' : '連携設定を保存'}
            </button>
            {configured && (
              <button onClick={() => { if (window.confirm('連携を解除します（quiz の紐づけも外れます）。よろしいですか？')) unlinkMut.mutate(); }}
                className="flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50">
                <Unlink className="h-3.5 w-3.5" />連携解除
              </button>
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-cyan-800/70">
            複数言語 (日本語/英語) の投票はインタラクティブ側で自動的に合算され、合算値が CG に反映されます。
            問題文・選択肢は日本語=無印・英語=_en として双方向に同期します。
          </p>
        </div>
      )}
    </div>
  );
}
