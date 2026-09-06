/**
 * ⑤ 打合せを録音してAIに渡す — スマホ・モックの端末枠 5枚目
 *
 * ── 何のための画面か ────────────────────────────────────────
 *
 * 打合せの直後、**その場で録ったものを投げる**ための画面です。
 * 案件を選ぶ → 録る → 送る。それだけです。
 *
 * ── 録音そのものは作り直していません ────────────────────────
 *
 * 録音は案件詳細の「やり取り」タブに**動くものが既にあります**
 * （`projectDetail/thread/RecordDialog`）。32kbps・25MB の上限・
 * 「相手に伝えてください」の表示など、間違えると害が出る決めごとが
 * 入っているので、**同じ部品をそのまま開きます**。
 * 実装を2つ持つと、片方だけ直した日から挙動が食い違います。
 *
 * 送り先も同じ `POST /projects/:id/minutes` です（新しい口は作っていません）。
 *
 * ── モックと違うところ（作り話をしない）──────────────────────
 *
 * | モック | どうしたか |
 * | --- | --- |
 * | **「案件なし」でも録れる／あとから紐づけられる** | **案件を先に選んでもらいます。** `project_minutes.project_id` が NOT NULL で、案件なしの録音を置く場所と、あとで紐づける画面が要ります（表の変更が要る話なので別の回） |
 * | **その場で決定事項とタスクの候補が出る** | **出していません。** 文字起こしは裏で走ります（1時間の録音で数分）。スマホの画面を開いたまま待たせるのは無理があるので、**「できたら案件のやり取りに出ます」**と書きます — これはモック自身の但し書きどおりです |
 *
 * > モックの原文: **「文字起こし全文は案件の『やり取り』に入ります。読むのはPCが向いています。」**
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Mic, Search, Info, ArrowRight, Check } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { EmptyState, Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { notifyApiError, notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { RecordDialog } from './projectDetail/thread/RecordDialog';

interface Row { id: string; name: string; gls_number: string | null; code: string | null; customer_name?: string | null }

export default function MeetingRecordPage() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<Row | null>(null);
  const [recOpen, setRecOpen] = useState(false);
  const [sent, setSent] = useState(false);

  /*
   * ⚠️ **絞り込みはサーバーに投げる**（レビューでの指摘 #60）。
   *
   * 前の版は「最後に動いた 50 件」を1回引いて、**打った言葉は手元の 50 件の中だけ**を
   * 見ていました。つまり **51 件目以降の案件は、名前を正しく打っても出てきません**。
   * 探した人には「この案件は無い」としか見えないので、**別の案件に録音を付ける**か、
   * 録るのをやめます（どちらも画面には何も出ません）。
   */
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  // **動いている案件から出す。** 終わった案件の打合せを録ることは無い
  const list = useQuery({
    queryKey: ['projects', 'for-record', debounced],
    queryFn: async () => (await api.get('/projects', {
      params: {
        limit: 50, sort_by: 'last_move', stage: 'neta,d_hold,c_proposal,b_verbal,a_won',
        ...(debounced ? { search: debounced } : {}),
      },
    })).data.data as Row[],
    staleTime: 60_000,
  });

  // 文字起こしにつないでいない環境がある。**押せるのに必ず失敗する形を作らない**
  const stt = useQuery({
    queryKey: ['minutes-stt', picked?.id],
    queryFn: async () => (await api.get(`/projects/${picked!.id}/minutes`)).data.stt_available !== false,
    enabled: !!picked,
  });

  /**
   * サーバーが絞ったものをそのまま出す。**手元でもう一度絞らない** —
   * サーバーの検索は案件名・GLS番号・お客様名を見るので、
   * ここで素の文字列一致を重ねると**サーバーが当てたものを画面が落とします**
   * （全角半角・大文字小文字の扱いが両者で違う）。
   */
  const rows = list.data ?? [];

  /**
   * ⚠️ **打った言葉と、並んでいる案件が食い違う瞬間を出さない**
   * （この PR のレビューで指摘された）。
   *
   * ①打ってから 300ms は `debounced` が前の言葉のまま＝**前の言葉の一覧**が並び、
   * ②通信のあいだも同じです。手元での絞り込みをやめたので、**画面には
   * 打った言葉と関係ない案件が押せる状態で並びます**。ここで選ぶと、
   * **録音がその案件に付きます**（送ったあとは案件名しか出ないので、
   * 間違いに気づくのは相手の議事録を読んだときです）。
   *
   * ⌘K の窓と同じ決めごと — **どの言葉の結果かが一致しているときだけ出す**。
   */
  const searching = q.trim() !== debounced || list.isFetching;

  const send = useMutation({
    mutationFn: async (p: { file: File; metOn: string }) => {
      const fd = new FormData();
      fd.append('audio', p.file);
      fd.append('met_on', p.metOn);
      return api.post(`/projects/${picked!.id}/minutes`, fd);
    },
    onSuccess: () => {
      setRecOpen(false);
      setSent(true);
      notifySuccess('文字起こしをはじめました', { description: 'できたら案件の「やり取り」に出ます。' });
    },
    onError: (e) => notifyApiError('送れませんでした', e),
  });

  // ── 送ったあと ────────────────────────────────────────────
  if (sent && picked) {
    return (
      <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
        <PageHeader title="送りました" sub="文字起こしが終わると、案件の「やり取り」に出ます" />
        <div className="rounded-card border border-success-border bg-success-surface p-4">
          <p className="text-list flex items-center gap-2 text-success">
            <Check className="h-5 w-5 shrink-0" aria-hidden="true" />
            {picked.name} に送りました
          </p>
          <p className="text-note mt-2 text-secondary-foreground">
            文字起こしは裏で進みます（1時間の録音で数分かかります）。
            <strong className="font-bold">決定事項と未解決事項の確かめは PC が向いています</strong> —
            引用と突き合わせながら直す作業なので、小さい画面では読み切れません。
          </p>
        </div>
        {/* ⚠️ **タブの鍵は `thread`**（レビューでの指摘 #60）。`log` というタブは
            無いので、押すと**概要タブに落ちて**いました。落ちても画面は出るので、
            押した人は「やり取りに何も入っていない」と読みます */}
        <Button className="w-full" onClick={() => navigate(`/sales/projects/${picked.id}/thread`)}>
          この案件のやり取りを開く<ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
        </Button>
        <Button variant="outline" className="w-full" onClick={() => { setSent(false); setPicked(null); setQ(''); }}>
          続けてもう1件録る
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="打合せを録音"
        sub="録ったものを AI が文字起こしします。決定事項の確かめは PC で行います"
        primaryAction={
          <Button
            className="w-full sm:w-auto"
            disabled={!picked || stt.data === false}
            onClick={() => setRecOpen(true)}
          >
            <Mic className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {picked ? '録音をはじめる' : '先に案件を選んでください'}
          </Button>
        }
      />

      {stt.data === false && (
        <p className="rounded-note border border-warning-border bg-warning-surface px-3.5 py-3 text-note text-secondary-foreground">
          <strong className="font-bold">この環境は文字起こしにつないでいません。</strong>
          録っても文字にできないので、管理者にご連絡ください。
        </p>
      )}

      <div>
        <h2 className="text-cardtitle mb-2">どの案件の打合せですか</h2>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="案件名・GLS番号で絞る"
            aria-label="案件を絞る"
            className="min-h-tap h-11 pl-10 lg:h-10"
          />
        </div>
      </div>

      {list.isError ? (
        <ErrorPanel title="案件を読み込めませんでした" error={list.error} onRetry={() => list.refetch()} />
      ) : list.isLoading || searching ? (
        /* **打った言葉と食い違う一覧を押させない**（上の `searching` の説明） */
        <Delayed><SkeletonRows rows={5} /></Delayed>
      ) : rows.length === 0 ? (
        <EmptyState
          title={q ? `「${q}」に当たる案件はありません` : '進行中の案件がありません'}
          description={q ? '言葉を短くして試してください。' : '受付から案件にすると、ここに出ます。'}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {/* **何が並んでいるかを書く**（レビューでの指摘 #60）。書かないと
              「進行中の案件はこれで全部」と読まれ、51 件目の案件は
              打てば出ることに気づけない */}
          <li className="text-note text-muted-foreground">
            {debounced
              ? <>「{debounced}」に当たる案件（最大 50 件）</>
              : <>最終更新 <span className="font-number">50</span> 件です。無ければ案件名・GLS番号で絞ってください</>}
          </li>
          {rows.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setPicked(r)}
                aria-pressed={picked?.id === r.id}
                className={cn(
                  'rounded-card min-h-tap flex w-full items-center gap-3 border p-3.5 text-left',
                  picked?.id === r.id
                    ? 'border-primary bg-primary-surface-weak'
                    : 'border-border bg-card',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="text-list block [overflow-wrap:anywhere]">{r.name}</span>
                  <span className="text-note mt-0.5 block truncate text-muted-foreground">
                    {[r.gls_number || r.code, r.customer_name].filter(Boolean).join(' ・ ') || '—'}
                  </span>
                </span>
                {picked?.id === r.id && <Check className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="rounded-note flex items-start gap-2 border border-info-border bg-info-surface px-3.5 py-3 text-note text-secondary-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden="true" />
        <span>
          <strong className="font-bold">先に案件を選んでください。</strong>
          「案件なし」で録って後から紐づける形は、置き場所（列）がまだ無いので作れていません。
          録った音声は<strong className="font-bold">文字起こし後に破棄します</strong>（取引先の声が入るため）。
          残るのは文字起こしと議事録だけです。
        </span>
      </p>

      {recOpen && picked && (
        <RecordDialog
          open
          onOpenChange={setRecOpen}
          busy={send.isPending}
          onSubmit={(file, metOn) => send.mutate({ file, metOn })}
        />
      )}
    </div>
  );
}
