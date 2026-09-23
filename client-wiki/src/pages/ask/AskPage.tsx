/**
 * ⑤ AI に聞く `/wiki/ask`（docs/design/v4/wiki.md §6-⑤・§7-1・§7-2・モック `Ask.dc.html`）
 *
 * ── 何を守っている画面か ────────────────────────────────────
 *
 * 1. **出典つきでしか答えない。** 出典が出せない回は、サーバーが
 *    「Wiki にはまだ書かれていません」に落として返します（§10 の判断8）。
 *    画面はそれを**そうと分かる見た目**にし、足りないページに登録されたことと
 *    「ページを作成」を添えます（§7-2。ここが「使うほど賢くなる」経路）
 * 2. **3値の評価を必ず押せる。** 対話は「直される」ものではないので、
 *    条件2（人の修正差分）の代わりがこの3つです（§7-3）
 * 3. **出典を押して開いたら `via='answer'` で記録する。** 条件3 の代理指標で、
 *    これが無いと「役に立ったか」は本人の申告しか残りません
 *
 * ── 列の持ち方 ──────────────────────────────────────────────
 *
 * モックは「スレッド 264px ＋ 会話 ＋ 読んだページ 300px」の3列ですが、実際の画面には
 * **共通の左メニューが常にあります**。そのまま置くとナビの列が2本になり、
 * 「サイドタブが増えすぎて窮屈」（2026-09-22 のご指摘）に戻るので、
 * 聞いたことの一覧はページ②のツリーと同じく共通メニューへ差し込みます。
 * 右の「AI が読んだページ」は xl 以上で列に出し、狭い画面では会話の下に続けます
 * （どちらの幅でも辿り着けるようにする・ページ②と同じ作り）。
 *
 * ⚠️ `PageShell` を使っていません。会話は画面の高さいっぱいを使い、
 *    入力欄を下端に固定する画面なので、外枠の余白を入れると入力欄が浮きます
 *    （ページ②・スペースと同じ判断）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Sparkles, X } from 'lucide-react';
import { Delayed, ErrorPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { useSideMenuTopSlot } from '@gmo-onair/shared/src/client/shell/sideMenuSlot';
import { usePermissions } from '@/hooks/usePermissions';
import { useWikiPage } from '@/lib/wikiApi';
import AskThreadsPanel from '@/components/ask/AskThreadsPanel';
import AskMessage from '@/components/ask/AskMessage';
import AskComposer from '@/components/ask/AskComposer';
import AskMaterialsPanel from '@/components/ask/AskMaterialsPanel';
import AskDraftSheet from '@/components/ask/AskDraftSheet';
import {
  askKeys,
  postAsk,
  useAskThread,
  useAskThreads,
  type AskMaterial,
  type AskMessage as AskMessageRow,
  type AskThreadDetail,
} from '@/components/search/askApi';

export default function AskPage() {
  const [sp, setSp] = useSearchParams();
  const threadId = sp.get('thread');
  const initialQuestion = sp.get('q') ?? '';
  const contextPageId = sp.get('page');

  const qc = useQueryClient();
  const sideMenuTopSlot = useSideMenuTopSlot();
  const { canEdit } = usePermissions();
  const tailRef = useRef<HTMLDivElement | null>(null);

  const threadsQ = useAskThreads();
  const threadQ = useAskThread(threadId);
  const contextPageQ = useWikiPage(contextPageId ?? undefined);

  /**
   * 「AI が読んだページ」は**聞いた回の返事にしか入っていません**（会話を開き直すと
   * 分かりません）。どのスレッドの分かを一緒に覚え、別の会話へ移ったら捨てます —
   * 前の質問で読んだページを、次の会話の材料のように見せないためです。
   */
  const [read, setRead] = useState<{ threadId: string; items: AskMaterial[] } | null>(null);
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [draftFor, setDraftFor] = useState<AskMessageRow | null>(null);

  // ⚠️ **その場で `?? []` を書かない。** 描くたびに別の配列になり、下の `useMemo` が
  //    毎回やり直しになります（eslint の `exhaustive-deps` が指す穴）
  const messages = useMemo(() => threadQ.data?.messages ?? [], [threadQ.data]);
  const thread = threadQ.data?.thread ?? null;

  const ask = useMutation({
    meta: { action: '質問' },
    mutationFn: (question: string) => postAsk({
      question,
      threadId,
      pageId: contextPageId,
      spaceId: thread?.space_id ?? null,
    }),
    onSuccess: (res) => {
      const id = res.thread?.id ?? threadId;
      if (id) {
        qc.setQueryData<AskThreadDetail>(askKeys.thread(id), {
          thread: res.thread,
          messages: res.messages,
        });
        setRead({ threadId: id, items: res.materials });
        if (id !== threadId) {
          // 新しい会話は URL に写す。**戻るボタンに積まない**（1往復ごとに戻り先が増える）
          const next = new URLSearchParams(sp);
          next.set('thread', id);
          next.delete('q');
          setSp(next, { replace: true });
        }
      }
      void qc.invalidateQueries({ queryKey: askKeys.threads() });
    },
    onSettled: () => setPendingQuestion(''),
  });

  // 新しい発言が増えたら、いちばん下まで送る（読み始める位置を自分で探させない）
  useEffect(() => {
    tailRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length, pendingQuestion]);

  const lastAnswer = useMemo(
    () => [...messages].reverse().find((m) => m.role === 'assistant') ?? null,
    [messages],
  );
  const citedIds = useMemo(
    () => new Set((lastAnswer?.citations ?? []).map((c) => c.page_id)),
    [lastAnswer],
  );
  /** 読んだページが分かるのは、この画面で聞いた回だけ（開き直した会話では出さない） */
  const readItems = read && read.threadId === threadId ? read.items : [];
  const readCountFor = (m: AskMessageRow): number | null =>
    (m.id === lastAnswer?.id && readItems.length > 0 ? readItems.length : null);

  /** 送る。**失敗したら投げ返す** — 入力欄が打った文をそのまま残せるように */
  const send = (question: string) => {
    setPendingQuestion(question);
    return ask.mutateAsync(question);
  };

  const onFeedbackSaved = (saved: AskMessageRow) => {
    if (!threadId) return;
    qc.setQueryData<AskThreadDetail>(askKeys.thread(threadId), (old) => (old
      ? { ...old, messages: old.messages.map((m) => (m.id === saved.id ? saved : m)) }
      : old));
  };

  const onThreadDeleted = (id: string) => {
    void qc.invalidateQueries({ queryKey: askKeys.threads() });
    qc.removeQueries({ queryKey: askKeys.thread(id) });
    if (id === threadId) setSp({}, { replace: true });
  };

  const materialsPanel = (
    <AskMaterialsPanel
      materials={readItems}
      citedIds={citedIds}
      answerOutputId={lastAnswer?.ai_output_id ?? null}
      emptyNote={messages.length === 0
        ? 'まだ質問していません。質問を送ると、AI が読んだページがここに並びます。'
        : 'この会話を開き直したので、読んだページは残っていません。出典は回答の下に出ています。'}
    />
  );

  return (
    <div className="flex h-full min-h-0">
      {/* 聞いたことの一覧は共通の左メニューの中（画面の中に2本目のナビの列を作らない） */}
      {sideMenuTopSlot && createPortal(
        <AskThreadsPanel
          threads={threadsQ.data}
          loading={threadsQ.isLoading}
          currentId={threadId}
          onDeleted={onThreadDeleted}
        />,
        sideMenuTopSlot,
      )}

      <main className="flex min-w-0 flex-1 flex-col bg-card">
        <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-border px-3 lg:px-6">
          <Sparkles className="h-4 w-4 shrink-0 text-ai" aria-hidden />
          <span className="shrink-0 text-list text-foreground">AI に聞く</span>
          <span className="min-w-0 flex-1 truncate text-sub text-muted-foreground">
            {thread?.title ? `／ ${thread.title}` : '／ Wiki に書いてあることだけを、出典つきで答えます'}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 lg:px-8">
          <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4">
            {threadQ.isError ? (
              <ErrorPanel
                title="会話を読み込めませんでした"
                error={threadQ.error}
                onRetry={() => void threadQ.refetch()}
              />
            ) : threadId && threadQ.isLoading ? (
              <Delayed>
                <SkeletonRows rows={4} rowHeight={64} />
              </Delayed>
            ) : messages.length === 0 && !pendingQuestion ? (
              <div className="rounded-card border border-dashed border-border px-4 py-4 text-sub leading-relaxed text-secondary-foreground">
                <p>Wiki に書いてあることだけを根拠に、出典つきで答えます。</p>
                <p>出典が出せないときは答えず、その質問は「足りないページ」に残ります。月1回の見直しで、スペースの担当が書き起こします。</p>
                <p>読むのは、あなたが読めるスペースの公開ページだけです（下書きと一覧から隠したページは読みません）。</p>
              </div>
            ) : (
              messages.map((m) => (
                <AskMessage
                  key={m.id}
                  message={m}
                  readCount={readCountFor(m)}
                  canEdit={canEdit}
                  onCreatePage={setDraftFor}
                  onFeedbackSaved={onFeedbackSaved}
                />
              ))
            )}

            {/* 送ってから返るまで（heavy 固定なので数十秒かかることがある） */}
            {pendingQuestion && (
              <>
                <div className="flex justify-end">
                  <p className="max-w-[min(560px,92%)] whitespace-pre-wrap break-words rounded-card border border-primary-border bg-primary-surface-weak px-3.5 py-2.5 text-list leading-relaxed text-foreground">
                    {pendingQuestion}
                  </p>
                </div>
                <div className="flex items-center gap-2.5 text-sub text-muted-foreground">
                  <span className="h-2 w-2 animate-pulse rounded-badge-xs bg-ai" aria-hidden />
                  Wiki を読んでいます。出典が見つからないときは、答えずにそう返します。
                </div>
              </>
            )}

            {/* 読んだページは、右の列を出せない幅では会話の下に続ける */}
            {readItems.length > 0 && (
              <div className="mt-2 border-t border-border pt-4 xl:hidden">{materialsPanel}</div>
            )}

            <div ref={tailRef} />
          </div>
        </div>

        <AskComposer
          initialText={initialQuestion || undefined}
          pending={ask.isPending}
          onSend={send}
          above={contextPageId && (
            <p className="mb-2 flex min-h-tap flex-wrap items-center gap-2 rounded-control border border-primary-border bg-primary-surface-weak px-3 text-sub text-secondary-foreground lg:min-h-0 lg:py-1.5">
              <span className="min-w-0 flex-1 truncate">
                「{contextPageQ.data?.title ?? '開いていたページ'}」とその子ページを先に読みます
              </span>
              <button
                type="button"
                onClick={() => {
                  const next = new URLSearchParams(sp);
                  next.delete('page');
                  setSp(next, { replace: true });
                }}
                className="flex min-h-tap min-w-tap items-center justify-center rounded-control text-secondary-foreground hover:bg-card lg:h-8 lg:min-h-0 lg:w-8 lg:min-w-0"
                aria-label="このページを文脈から外す"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </p>
          )}
        />
      </main>

      {/* 右＝AI が読んだページと回答のルール（列に出せる幅のときだけ） */}
      <aside className="hidden w-[300px] shrink-0 flex-col border-l border-border bg-surface-subtle xl:flex">
        {materialsPanel}
      </aside>

      <AskDraftSheet
        open={!!draftFor}
        onOpenChange={(v) => { if (!v) setDraftFor(null); }}
        question={draftFor ? questionFor(messages, draftFor) : ''}
        threadId={threadId}
        messageId={draftFor?.id ?? null}
        defaultSpaceId={thread?.space_id ?? null}
      />
    </div>
  );
}

/** その回答の元になった質問（題の下書きに使う）。直前の人の発言を取る */
function questionFor(messages: AskMessageRow[], answer: AskMessageRow): string {
  const i = messages.findIndex((m) => m.id === answer.id);
  for (let k = i - 1; k >= 0; k -= 1) {
    if (messages[k].role === 'user') return messages[k].content_md;
  }
  return '';
}
