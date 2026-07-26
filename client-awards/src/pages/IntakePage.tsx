/**
 * データを入れる（アワード）— デザイン 20章 20f
 *
 * ── なにが問題だったか ──────────────────────────────────
 *
 * ノミネート一覧は主催者から表で届く。届き方が毎回ちがう:
 *  - Excel のファイル → 受け口があった
 *  - **メールの本文に貼られた表** → 受け口が無く、手で打ち直していた
 *  - **列がそろっていない / 見出しが無い** → 人が並べ替えてから貼っていた
 *
 * 入口を1つにする。**貼る / 落とす / AIに整えさせる** の3つを1画面に置く。
 *
 * ── 列の当て方の画面を作り直していない（重要）──────────────
 *
 * どの入り方をしても、そのあとは**同じ列の当て方の画面**に入る。
 * ここを別に作ると「ファイルなら入るのに貼ると入らない」形の食い違いが出て、
 * 現場では原因が分からない。
 *
 * ── AI がやることは「整える」だけ ────────────────────────
 *
 * AI は表の形に直すところまで。**取り込むかどうかは人が見て決める**。
 * 推測で名前を付けた列には印を出す（全部に印を出すと印の意味が消えるので、
 * 下書き全体がAI製であることは紫のカードで示し、印は推測の列だけに絞る）。
 */
import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ChevronLeft, ClipboardPaste, FileSpreadsheet, Sparkles, AlertTriangle, Wand2,
} from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import ExcelImportDialog from '../oneshot/operator/ExcelImportDialog';
import { NoPermissionPanel } from '@gmo-onair/shared/src/client/states';

interface Tidy {
  headers: string[];
  rows: string[][];
  guessed_columns: string[];
  notes: string[];
  ai: { output_id: string | null; model: string; row_count: number; used_digest: boolean };
}

const WAYS = [
  { key: 'paste', label: '貼る', icon: ClipboardPaste,
    what: 'Excel やメールの本文から表をコピーして貼ります（いちばん多い形）' },
  { key: 'file', label: '落とす', icon: FileSpreadsheet,
    what: 'Excel のファイル (.xlsx) をそのまま渡します' },
  { key: 'ai', label: 'AIに整えさせる', icon: Sparkles,
    what: '表の形になっていない文字を、列のある表に直してもらいます' },
] as const;

export default function IntakePage() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id!);
  const navigate = useNavigate();

  const [way, setWay] = useState<'paste' | 'file' | 'ai'>('paste');
  const [text, setText] = useState('');
  const [tidy, setTidy] = useState<Tidy | null>(null);
  const [error, setError] = useState<string | null>(null);
  // 列の当て方の画面に渡す表。ファイルのときは null (ダイアログがファイルを受ける)
  const [dialog, setDialog] = useState<{ text: string | null; label: string } | null>(null);

  // 権限が無い人に空のフォームを見せない (押しても入らないものを触らせる)
  const { error: permError } = useQuery({
    queryKey: ['awards-templates-perm'],
    queryFn: async () => (await api.get('/awards/templates')).data,
    retry: (count, e) =>
      (e as { response?: { status?: number } })?.response?.status === 403 ? false : count < 2,
  });

  const tidyMutation = useMutation({
    mutationFn: async () => (await api.post(`/awards/events/${eventId}/tidy`, { text })).data.data as Tidy,
    onSuccess: (t) => { setTidy(t); setError(null); },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { error?: { message?: string } } } })
        ?.response?.data?.error?.message ?? '整えられませんでした';
      setError(msg);
      setTidy(null);
    },
  });

  /** 整えた表を使わなかったことも残す (使われなかったことも成果) */
  const dropTidy = async () => {
    setTidy(null);
    try { await api.post(`/awards/events/${eventId}/tidy/dropped`, {}); } catch { /* 記録の失敗で操作を止めない */ }
  };

  const tidyAsTsv = tidy
    ? [tidy.headers.join('\t'), ...tidy.rows.map((r) => r.join('\t'))].join('\n')
    : '';

  if ((permError as { response?: { status?: number } } | null)?.response?.status === 403) {
    return (
      <div className="p-6">
        <NoPermissionPanel modules={['awards']} level="editor" target="データを入れる" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <button onClick={() => navigate(`/event/${eventId}`)}
        className="mb-3 flex min-h-[44px] items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        イベントへ戻る
      </button>

      <h1 className="text-lg font-bold">データを入れる</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        ノミネートの一覧を入れます。<strong className="text-foreground">3つの入れ方があります。</strong>
        どれを選んでも、このあとは同じ「列を当てる」画面に進みます。
      </p>

      {/* 3つの入れ方 */}
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {WAYS.map((w) => {
          const Icon = w.icon;
          return (
            <button key={w.key} onClick={() => { setWay(w.key); setError(null); }}
              className={cn(
                'rounded-xl border p-3 text-left',
                way === w.key ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'hover:bg-muted',
              )}>
              <span className="flex items-center gap-1.5 text-sm font-bold">
                <Icon className="h-4 w-4" aria-hidden="true" />
                {w.label}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">{w.what}</span>
            </button>
          );
        })}
      </div>

      {/* 貼る */}
      {way === 'paste' && (
        <section className="mt-4 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-bold">表を貼る</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            1行目に見出し（部門・ノミネート名 など）、2行目から中身を貼ってください。
            Excel から選んでコピーすると列が分かれます。
          </p>
          <textarea value={text} onChange={(e) => setText(e.target.value)}
            aria-label="貼りつける表"
            placeholder={'種別\tノミネート名\t会社\nベストプレイヤー賞\t山田 太郎\tGMOインターネット'}
            className="mt-2 h-40 w-full rounded-lg border bg-background p-2 font-mono text-xs" />
          <button
            onClick={() => setDialog({ text, label: '貼った表' })}
            disabled={!text.trim()}
            className="mt-2 min-h-[44px] rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-40 hover:opacity-90">
            列を当てる
          </button>
        </section>
      )}

      {/* 落とす */}
      {way === 'file' && (
        <section className="mt-4 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-bold">Excel のファイルを渡す</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            .xlsx / .xls を渡します。列は自動で当てて、違っていれば直せます。
          </p>
          <button onClick={() => setDialog({ text: null, label: 'Excel インポート' })}
            className="mt-2 min-h-[44px] rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground hover:opacity-90">
            ファイルを選ぶ
          </button>
        </section>
      )}

      {/* AIに整えさせる */}
      {way === 'ai' && (
        <section className="mt-4 rounded-xl border bg-card p-4">
          <h2 className="flex items-center gap-1.5 text-sm font-bold">
            <Sparkles className="h-4 w-4 text-purple-600" aria-hidden="true" />
            AIに整えさせる
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            表の形になっていない文字（メールの箇条書き・列がそろっていない表）を貼ると、
            列のある表に直します。<strong className="text-foreground">中身は足しません。</strong>
            直した表はこのあと人が見て、そのまま取り込むか決めます。
          </p>
          <textarea value={text} onChange={(e) => setText(e.target.value)}
            aria-label="整えたい文字"
            placeholder={'ベストプレイヤー賞\n・山田太郎（GMOインターネット / 開発本部）\n・佐藤花子（GMOペパボ）\n\nMVP\n・鈴木一郎（GMOメディア）'}
            className="mt-2 h-40 w-full rounded-lg border bg-background p-2 font-mono text-xs" />
          <button onClick={() => tidyMutation.mutate()}
            disabled={!text.trim() || tidyMutation.isPending}
            className="mt-2 flex min-h-[44px] items-center gap-1.5 rounded-lg bg-purple-600 px-4 text-sm font-bold text-white disabled:opacity-40 hover:bg-purple-500">
            <Wand2 className="h-4 w-4" aria-hidden="true" />
            {tidyMutation.isPending ? '整えています…' : '整えてもらう'}
          </button>

          {error && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          {/* 整えた結果 */}
          {tidy && (
            <div className="mt-3 rounded-xl border-2 border-purple-300 bg-purple-50/60 p-3">
              <p className="text-xs font-bold text-purple-900">
                AIが整えました（{tidy.rows.length}行）。中身は確かめてから取り込んでください。
              </p>
              {tidy.guessed_columns.length > 0 && (
                <p className="mt-1 text-xs text-purple-900">
                  見出しが無かったので名前を付けた列:{' '}
                  {tidy.guessed_columns.map((g) => (
                    <span key={g} className="mr-1 rounded bg-orange-100 px-1.5 py-0.5 text-orange-800">
                      {g}
                    </span>
                  ))}
                </p>
              )}
              {tidy.notes.length > 0 && (
                <ul className="mt-1 list-inside list-disc text-xs text-purple-900/80">
                  {tidy.notes.map((n, i) => <li key={i}>{n}</li>)}
                </ul>
              )}

              {/* 整えた表 (先頭5行だけ出す。全部は列を当てる画面で見る) */}
              <div className="mt-2 overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-purple-200">
                      {tidy.headers.map((h) => (
                        <th key={h} className="whitespace-nowrap px-2 py-1 text-left font-bold">
                          {h}
                          {tidy.guessed_columns.includes(h) && (
                            <span className="ml-1 text-orange-700">（推測）</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tidy.rows.slice(0, 5).map((r, i) => (
                      <tr key={i} className="border-b border-purple-100">
                        {r.map((c, j) => <td key={j} className="whitespace-nowrap px-2 py-1">{c}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {tidy.rows.length > 5 && (
                <p className="mt-1 text-xs text-purple-900/70">ほか {tidy.rows.length - 5} 行</p>
              )}

              <div className="mt-2 flex flex-wrap gap-2">
                <button onClick={() => setDialog({ text: tidyAsTsv, label: 'AIが整えた表' })}
                  className="min-h-[44px] rounded-lg bg-purple-600 px-4 text-sm font-bold text-white hover:bg-purple-500">
                  列を当てる
                </button>
                <button onClick={dropTidy}
                  className="min-h-[44px] rounded-lg border border-purple-300 px-4 text-sm text-purple-900 hover:bg-purple-100">
                  これは使わない
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* 列を当てる画面 — 貼る・落とす・AI のどれからでも同じものに入る */}
      <ExcelImportDialog
        open={dialog !== null}
        onClose={() => setDialog(null)}
        eventId={eventId}
        pastedText={dialog?.text ?? null}
        sourceLabel={dialog?.label}
        onImported={() => { /* ダイアログが結果を出す。閉じるのは人が決める */ }}
      />
    </div>
  );
}
