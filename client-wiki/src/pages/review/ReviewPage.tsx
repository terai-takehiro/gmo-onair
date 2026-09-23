/**
 * ⑦ 見直し `/wiki/review`（`docs/design/v4/wiki.md` §6-⑦・§7-2・§7-3・モック `Review.dc.html`）
 *
 * **月1回の場**。3つのタブで「何を直すか」を1画面にまとめます。
 *
 *   見直し予定     予定日を過ぎた・14日以内・担当が空のページ
 *   足りないページ AI が答えられなかった質問（回数順）
 *   AI の直され方   無修正率・よく直される点・回答の評価の内訳
 *
 * ── 言葉について（いちばん大事） ────────────────────────────
 *
 * ⚠️ **「期限切れ」「期限」「締切」「延滞」と書きません。** 利用者からのご指摘
 * （2026-09-22）「Wiki なので期限切れという概念はないと思います」。ページは
 * 予定日を過ぎても中身が無効になるわけではありません。**「見直し予定」「予定日」**と
 * 言い、印は**「要見直し」**にします。
 *
 * ── 列とタブの持ち方 ────────────────────────────────────────
 *
 * ⚠️ **ナビの列は1本だけ**（2026-09-22 のご指摘「サイドタブが増えすぎて窮屈」）。
 * タブは本文の上に横1本で置き、画面の中に2本目のナビの列を作りません。
 *
 * ⚠️ **3つのタブは別々の問い合わせ**です（区画ごとに諦められるように）。
 * 足りないページと直され方は manager だけが読めるので（§8）、権限が無い人には
 * **投げずに**その区画の中で案内を出します — 1つの 403 で画面全体が白紙になりません。
 */
import { useSearchParams } from 'react-router-dom';
import { ListChecks } from 'lucide-react';
import { PageShell } from '@gmo-onair/shared/src/client/ui/pageShell';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { FilterChips } from '@gmo-onair/shared/src/client/ui/filterChips';
import { usePermissions } from '@/hooks/usePermissions';
import { useWikiSpaces } from '@/lib/wikiApi';
import ReviewDueTab from '@/components/review/ReviewDueTab';
import ReviewGapsTab from '@/components/review/ReviewGapsTab';
import ReviewDigestTab from '@/components/review/ReviewDigestTab';
import { bucketSummary, bucketTotal } from '@/components/review/reviewLabels';
import {
  REVIEW_DIGEST_WINDOW_DAYS,
  useReviewDigest,
  useReviewDue,
  useReviewGaps,
} from '@/components/review/reviewApi';

const TABS = ['due', 'gaps', 'ai'] as const;
type TabKey = (typeof TABS)[number];

const TAB_LABEL: Record<TabKey, string> = {
  due: '見直し予定',
  gaps: '足りないページ',
  ai: 'AI の直され方',
};

const SELECT_CLASS =
  'min-h-tap w-full rounded-control-lg border border-border bg-card px-3 text-list text-foreground sm:w-[240px] lg:h-10 lg:min-h-0';

export default function ReviewPage() {
  const [sp, setSp] = useSearchParams();
  const rawTab = sp.get('tab') ?? '';
  const tab: TabKey = (TABS as readonly string[]).includes(rawTab) ? (rawTab as TabKey) : 'due';
  const spaceId = sp.get('space') ?? '';

  const { canEdit, canManage } = usePermissions();
  const spacesQ = useWikiSpaces();

  /**
   * スペースの絞り込みは**サーバーに渡します**（Codex レビュー指摘・#735）。
   * 以前は返ってきた行を画面の中で絞っていましたが、一覧には上限があるので
   * （見直し予定 300件・足りないページ 50件）、**他のスペースの行でその枠が
   * 埋まると、選んだスペースに行があっても「0件」に見えて**いました。
   * いまは `?space=` を渡し、SQL の `LIMIT` より先に当てています。
   *
   * ⚠️ これで `counts` は**絞ったあとの・上限で切る前**の数になったので、
   * 絞っているかどうかに関係なくサーバーの数をそのまま使えます。
   */
  const dueQ = useReviewDue(true, spaceId);
  // 権限が無い人には投げない（403 が並ぶだけで何も出せない）
  const gapsQ = useReviewGaps(canManage, 'open', spaceId);
  const digestQ = useReviewDigest(canManage);

  const rows = dueQ.data?.rows;
  const counts = dueQ.data?.counts;
  const clipped = (dueQ.data?.rows.length ?? 0) < (bucketTotal(dueQ.data?.counts) ?? 0);
  const gaps = gapsQ.data;

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(sp);
    if (value) next.set(key, value);
    else next.delete(key);
    // **戻るボタンに積まない** — タブを3回押した人が3回戻ることになる
    setSp(next, { replace: true });
  };

  const hint = tab === 'due'
    ? [bucketSummary(counts) || '見直し予定日を入れたページだけが出ます',
      clipped ? `多い順に ${rows?.length ?? 0}件まで出しています` : '']
      .filter(Boolean).join(' ・ ')
    : tab === 'gaps'
      ? '聞かれた回数の多い順'
      // スペースの軸を持たない集計なので、全社の数字であることを言い切る
      : `直近 ${REVIEW_DIGEST_WINDOW_DAYS}日・Wiki 全体`;

  return (
    <PageShell>
      <PageHeader
        title="見直し"
        sub="月1回、スペースの担当が確認します。予定日の来たページを直し、AI が答えられなかった質問からページを作ります。"
        icon={<ListChecks />}
      >
        {/*
          * ⚠️ **「AI の直され方」では出しません**（Codex レビュー指摘・#735）。
          * あのタブが出すのは AI の機能ごとの集計（`ai_outputs` / `ai_corrections`）で、
          * **どのスペースの話かという軸をそもそも持ちません**。絞り込みだけ置くと、
          * 全社の数字を選んだスペースの数字として読ませてしまいます。
          * `?space=` は消さないので、他のタブに戻れば絞り込みは残ります。
          */}
        {tab !== 'ai' && (
          <div className="w-full shrink-0 sm:w-auto">
            <select
              aria-label="スペースで絞り込む"
              value={spaceId}
              onChange={(e) => setParam('space', e.target.value)}
              className={SELECT_CLASS}
            >
              <option value="">すべてのスペース</option>
              {(spacesQ.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}
      </PageHeader>

      {/* タブ。**画面の中に2本目のナビの列を作らない**ので、横1本で置く */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <FilterChips
          label="見直しの表示を切り替える"
          value={tab}
          onChange={(key) => setParam('tab', key === 'due' ? '' : key)}
          items={[
            { key: 'due', label: TAB_LABEL.due, count: bucketTotal(counts) },
            { key: 'gaps', label: TAB_LABEL.gaps, count: canManage ? (gaps?.length ?? null) : null },
            { key: 'ai', label: TAB_LABEL.ai, count: null },
          ]}
        />
        <p className="text-sub-sm text-muted-foreground lg:ml-1">{hint}</p>
      </div>

      {tab === 'due' && (
        <ReviewDueTab
          rows={rows}
          loading={dueQ.isLoading}
          error={dueQ.error}
          onRetry={() => void dueQ.refetch()}
          canEdit={canEdit}
          filtered={spaceId !== ''}
        />
      )}

      {tab === 'gaps' && (
        <ReviewGapsTab
          gaps={gaps}
          loading={gapsQ.isLoading}
          error={gapsQ.error}
          onRetry={() => void gapsQ.refetch()}
          canManage={canManage}
          filtered={spaceId !== ''}
        />
      )}

      {tab === 'ai' && (
        <ReviewDigestTab
          digests={digestQ.data}
          loading={digestQ.isLoading}
          error={digestQ.error}
          onRetry={() => void digestQ.refetch()}
          canManage={canManage}
          windowDays={REVIEW_DIGEST_WINDOW_DAYS}
          recentReviews={dueQ.data?.recent_reviews}
        />
      )}
    </PageShell>
  );
}
