/**
 * ② 受付 (v4)
 *
 * ── 3つのステップを1画面で ──────────────────────────────────
 *
 *   ① 入れる      メールは MCP が自動で、電話・その他は手で
 *   ② 確かめる    読み取りを直し、聞くことを決める   ← この画面の本体
 *   ③ 案件にする  日程か見積が動いたら
 *
 * PC は3列（届いたもの ／ 確かめる ／ きめる）。スマホは**1列で行き来**します
 * （3列を縦に積むと、決めるボタンに着くまで2画面ぶんスクロールする）。
 *
 * ── モックどおり引き合いだけを出します ──────────────────────
 *
 * 出すのは **ネタ案件と問い合わせの2つ**（`INTAKE_KINDS`）。
 * 受信箱の口 (`GET /dashboard/inbox`) は4種類を返したままですが、
 * **ホームの「お待たせ中」とタイルの件数が同じ口を読んでいる**ので、
 * 口ではなく画面側で絞っています。
 *
 * 外した2つは**先に行き先を作ってから**外しました:
 *  ・期限超過 → 案件管理ダッシュボードの「期限が過ぎたやること」（`OverduePanel`）
 *  ・見積・請求の書類 → 財務の「受け取った書類」(`/budget/documents`)
 *
 * ── そのほかの決めごと ──────────────────────────────────────
 *
 * ・**「聞き方の下書き」は AI ではありません。** 決まった型から組み立てています
 *   （`inbox/ask.ts` の冒頭に理由）
 * ・**確信（高/中/低）は引き合い1件ぶん**を見出しに出します（migration 165）。
 *   項目ごとの値は AI が返さないので、項目には「必須なのに空」を赤で名指しします
 *
 * ── AI に返る仕組み（会社方針「AI を使い捨てにしない」）────────
 *
 * この画面は**人が AI の起票を直す場所**なので、フィードバックの入口です。
 * ここから「ここを直す」で案件を保存すると、サーバーが
 * 「どの項目を・何から何に」変えたかを `ai_corrections` に自動で残します
 * （`server/.../project-ai-feedback.service.ts`）。人は何も入力しません。
 * 見送りにしたときは「拾いすぎ」の手がかりとして不採用が残ります。
 */
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, RefreshCw, FileWarning } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { EmptyState, Delayed, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { queryKeys } from '@gmo-onair/shared/src/client/hooks/queryKeys';
import { useAuth } from '@/contexts/platform/AuthContext';
import { KINDS, INTAKE_KINDS, type InboxData, type InboxKind } from './inbox/kinds';
import { InboxList } from './inbox/InboxList';
import { VerifyPanel } from './inbox/VerifyPanel';
import { DecidePanel } from './inbox/DecidePanel';
import { OtherPanel } from './inbox/OtherPanel';
import type { IntakeProject } from './inbox/ask';

const STEPS = [
  { n: 1, label: '入れる', sub: 'メールは自動、電話は手で' },
  { n: 2, label: '確かめる', sub: '読み取りを直し、聞くことを決める' },
  { n: 3, label: '案件にする', sub: '日程か見積が動いたら' },
];

export default function InboxPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { currentUser } = useAuth();
  const [kind, setKind] = useState<InboxKind | 'all'>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery<InboxData>({
    queryKey: queryKeys.dashboard.inbox(),
    queryFn: async () => (await api.get('/dashboard/inbox')).data.data,
    staleTime: 30_000,
    refetchOnMount: 'always',
    refetchInterval: 60_000,   // 経過時間を1分の粒度で描き直す
  });

  // **受付に出すのは引き合いだけ**（モックどおり）。口は4種類返してくるので
  // ここで絞る。件数のチップもこの絞ったあとの並びから数える
  const items = useMemo(
    () => (data?.items ?? []).filter((i) => INTAKE_KINDS.includes(i.kind)),
    [data],
  );
  const shown = useMemo(
    () => (kind === 'all' ? items : items.filter((i) => i.kind === kind)),
    [items, kind],
  );
  const selected = items.find((i) => i.key === selectedKey) ?? null;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: queryKeys.dashboard.inbox() });
    qc.invalidateQueries({ queryKey: ['projects'] });
    qc.invalidateQueries({ queryKey: ['dashboard', 'sales-overview'] });
  };

  // 選んだネタ案件の中身。**一覧の meta では足りない** — 分類・担当・種別など
  // 「案件にできるか」を決める項目が入っていないため、詳細を引き直す
  const projectId = selected?.kind === 'ai_project' ? String(selected.meta.id) : null;
  const { data: project } = useQuery<IntakeProject>({
    queryKey: ['project', projectId],
    queryFn: async () => (await api.get(`/projects/${projectId}`)).data.data,
    enabled: !!projectId,
  });

  const done = (msg: string) => { notifySuccess(msg); setSelectedKey(null); invalidate(); };

  const promote = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/issue-gls`, {}),
    onSuccess: () => done('案件にしました。GLS 番号を発番しています'),
    onError: (e) => notifyApiError('案件にできませんでした', e),
  });
  const keep = useMutation({
    mutationFn: () => api.post(`/projects/${projectId}/ai-review`),
    onSuccess: () => done('確認済みにしました。ネタのまま残ります'),
    onError: (e) => notifyApiError('確認済みにできませんでした', e),
  });
  const drop = useMutation({
    mutationFn: () => api.patch(`/projects/${projectId}/stage`, { stage: 'e_lost', lost_reason: 'other', lost_reason_note: '受付で見送り' }),
    onSuccess: () => done('見送りにしました'),
    onError: (e) => notifyApiError('見送りにできませんでした', e),
  });

  const handle = useMutation({
    mutationFn: (id: string) => api.post(`/dailyops/inquiries/${id}/handle`),
    onSuccess: () => done('対応済みにしました'),
    onError: (e) => notifyApiError('更新できませんでした', e),
  });

  const chips = [
    { key: 'all', label: 'すべて', count: data ? items.length : null },
    ...INTAKE_KINDS.map((k) => ({
      key: k, label: KINDS[k].label,
      count: data ? items.filter((i) => i.kind === k).length : null,
    })),
  ];

  const busy = promote.isPending || keep.isPending || drop.isPending || handle.isPending;

  return (
    <div className="flex flex-col gap-3.5 p-4 lg:p-6">
      <PageHeader
        title="受付"
        sub={data ? `未処理 ${items.length}件 ・ 片づけたらダッシュボードに戻ります` : 'ご依頼を案件にするところ'}
      >
        {/*
          **`primaryAction` を使っていません。** あれはスマホで画面下端に固定されるので、
          その画面で「いちばんやること」を置く場所です。ここでの主役は
          選んだものを片づけること (右の「案件にする」など) で、
          **戻るボタンを下端に貼り付けると、主役でないものが主役の位置に出ます**。
        */}
        <Button variant="outline" onClick={() => navigate('/sales/dashboard')}>
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />ダッシュボードに戻る
        </Button>
        <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />更新
        </Button>
      </PageHeader>

      {/* 3つのステップ。**見出しの行に入れない** — 見出しと並べると
          タイトルが 190px まで潰れて2行になる (1440px で実測) */}
        <div className="flex flex-wrap items-center gap-2">
          {STEPS.map((s) => (
            <span
              key={s.n}
              className={`rounded-chip flex items-center gap-2 border px-3 py-1.5 ${
                s.n === 2 ? 'border-primary-border bg-primary-surface-weak' : 'border-border bg-card'
              }`}
            >
              <span className={`font-number flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-sub-sm font-bold ${
                s.n === 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}>{s.n}</span>
              <span className="min-w-0">
                <span className={`text-sub block font-bold ${s.n === 2 ? 'text-primary' : ''}`}>{s.label}</span>
                <span className="text-sub-sm block text-muted-foreground">{s.sub}</span>
              </span>
            </span>
          ))}
        </div>

      <FilterChips
        label="届いたものの種類で絞り込む"
        items={chips}
        value={kind}
        onChange={(k) => { setKind(k as InboxKind | 'all'); setSelectedKey(null); }}
      />

      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)_minmax(0,390px)]">
        {/* ── 届いたもの。スマホでは選んでいる間は隠す ── */}
        <section className={`rounded-card overflow-hidden border border-border bg-card ${selected ? 'hidden lg:block' : ''}`}>
          <h2 className="text-cardtitle p-4 pb-2.5 lg:px-5">届いたもの</h2>
          {isLoading ? (
            <div className="p-3"><Delayed><SkeletonRows rows={4} /></Delayed></div>
          ) : (
            <InboxList items={shown} selectedKey={selectedKey} onSelect={(i) => setSelectedKey(i.key)} />
          )}
        </section>

        {/* ── 確かめる ＋ きめる ── */}
        {!selected ? (
          <div className="hidden lg:col-span-1 lg:block xl:col-span-2">
            <EmptyState
              title="左から1つ選んでください"
              description="選んだものの中身と、案件にするために聞かないといけないことが出ます。"
            />
          </div>
        ) : (
          <>
            {/* スマホで一覧に戻る道。**閉じる手段が無い画面を作らない** */}
            <div className="lg:hidden">
              <Button variant="outline" onClick={() => setSelectedKey(null)}>
                <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />届いたものに戻る
              </Button>
            </div>

            {selected.kind === 'ai_project' ? (
              project ? (
                <>
                  <VerifyPanel project={project} senderName={currentUser?.name ?? ''} />
                  <DecidePanel
                    project={project}
                    busy={busy}
                    onPromote={() => promote.mutate()}
                    onKeep={() => keep.mutate()}
                    onDrop={async () => {
                      const ok = await confirmAction({
                        title: 'この引き合いを見送りにしますか',
                        description: '案件は「E 失注」になり、受付の一覧から消えます。案件一覧からは見られます。',
                        confirmLabel: '見送りにする',
                        tone: 'danger',
                      });
                      if (ok) drop.mutate();
                    }}
                  />
                </>
              ) : (
                <div className="rounded-card border border-border bg-card p-4">
                  <Delayed><SkeletonRows rows={5} /></Delayed>
                </div>
              )
            ) : (
              <div className="xl:col-span-2">
                <OtherPanel
                  item={selected}
                  busy={busy}
                  canHandle={!!data?.dailyops.editable}
                  onHandle={() => handle.mutate(String(selected.meta.id))}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* 申込書の未提出。**経過時間の概念が薄い**ので、待たせているものとは分けて置く */}
      {!isLoading && (data?.checklist.length ?? 0) > 0 && (
        <section className="rounded-card border border-warning-border bg-card p-4 lg:px-5">
          <h2 className="text-cardtitle flex items-center gap-2">
            <FileWarning className="h-4 w-4 text-warning" aria-hidden="true" />
            申込書がまだ届いていない案件 {data!.checklist.length}件
          </h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {data!.checklist.map((c) => (
              <li key={c.key}>
                <button
                  type="button"
                  onClick={() => navigate(`/sales/projects/${c.meta.id}`)}
                  className="min-h-tap rounded-control text-sub flex max-w-[280px] items-center gap-2 border border-border px-3 hover:bg-accent"
                >
                  <span className="font-number shrink-0 font-bold">{String(c.meta.gls_number ?? '')}</span>
                  <span className="truncate">{String(c.meta.name)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* **外した2つの行き先を書く。** 受付にあったものが消えたと思われないように */}
      <p className="text-note text-muted-foreground">
        期限が過ぎたやることは{' '}
        <Link to="/sales/dashboard" className="inline-block py-[13px] -my-[13px] font-bold text-primary hover:underline">
          案件管理ダッシュボード
        </Link>
        、受け取った見積・請求の書類は{' '}
        <Link to="/budget/documents" className="inline-block py-[13px] -my-[13px] font-bold text-primary hover:underline">
          財務の「受け取った書類」
        </Link>
        にあります。この画面は<strong className="font-bold">引き合いだけ</strong>を扱います。
      </p>
    </div>
  );
}
