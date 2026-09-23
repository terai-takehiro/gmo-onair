/**
 * ⑦-③ AI の直され方（`docs/design/v4/wiki.md` §6-⑦・§7-3 の条件2〜4）
 *
 * 「AI を使い捨てにしない」の**条件4（改善への還流）を人にも見せる場所**です。
 * 下書きの無修正率・よく直される点・回答の評価の内訳を並べ、
 * 次の呼び出しに渡している助言（`advice`）もそのまま出します
 * （数字だけ出して助言を隠すと、何を直したのかが人から見えません）。
 *
 * ⚠️ **人の名前は出しません**（`docs/wording.md` ルール1）。誰の下書きが直されたかは
 * ここで要る情報ではなく、出すと「直された人」の一覧になります。
 *
 * ⚠️ **件数が少ないうちは率を断定しません。** 3件のうち2件が直されただけで
 * 「AI が悪い」と読めると、まぐれに合わせて直すことになります（サーバーの
 * `wiki-ai-digest.service.ts` が助言を出す条件と同じ考え方）。
 */
import { Link } from 'react-router-dom';
import { CalendarCheck, Lightbulb, Sparkles } from 'lucide-react';
import { Delayed, ErrorPanel, EmptyState, NoPermissionPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import type { WikiReviewLogEntry } from '@gmo-onair/shared/src/wiki/types';
import { toPlainText } from '@gmo-onair/shared/src/wiki/search';
import { reviewByLabel } from '@/lib/wikiFormat';
import { AI_KIND_LABEL, rateLabel, shortDayLabel } from './reviewLabels';
import type { ReviewDigest } from './reviewApi';

/** 1行の割合。バーは目で比べるためだけで、数字が正（バーだけにしない） */
function StatRow({
  label, value, rate, tone = 'neutral', note,
}: {
  label: string;
  value: string;
  /** 0〜1。null のときバーを出さない（0% と「まだ数えられない」は別のこと） */
  rate: number | null;
  tone?: 'neutral' | 'good' | 'bad';
  note?: string;
}) {
  const bar = tone === 'good' ? 'bg-success' : tone === 'bad' ? 'bg-destructive' : 'bg-primary';
  return (
    <div className="flex items-center gap-2">
      <span className="w-[108px] shrink-0 text-sub text-muted-foreground">{label}</span>
      <span className="w-[52px] shrink-0 text-right text-sub tabular-nums text-foreground">{value}</span>
      {rate === null ? (
        <span className="min-w-0 flex-1 truncate text-sub-sm text-muted-foreground">{note ?? ''}</span>
      ) : (
        <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-chip bg-muted">
          <span className={`block h-full ${bar}`} style={{ width: `${Math.round(Math.min(Math.max(rate, 0), 1) * 100)}%` }} />
        </span>
      )}
    </div>
  );
}

function Card({ title, head, children, footnote }: {
  title: string;
  head: React.ReactNode;
  children: React.ReactNode;
  footnote?: string;
}) {
  return (
    <section className="flex flex-col rounded-card border border-border bg-card p-4">
      <p className="text-th text-muted-foreground">{title}</p>
      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2">{head}</p>
      <div className="mt-2.5 flex flex-col gap-1.5">{children}</div>
      {footnote && <p className="mt-2.5 text-sub-sm leading-relaxed text-muted-foreground">{footnote}</p>}
    </section>
  );
}

const Big = ({ n }: { n: number }) => (
  <span className="text-h1 tabular-nums text-foreground">{n}</span>
);

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/** AI に聞く（`wiki_answer`） */
function AnswerCard({ d }: { d: ReviewDigest }) {
  const a = d.answer;
  if (!a) return null;
  const fb = a.feedback.good + a.feedback.rephrase + a.feedback.reject;
  const cited = ratio(a.cited, a.answers_total);
  const good = ratio(a.feedback.good, fb);
  const reject = ratio(a.feedback.reject, fb);
  return (
    <Card
      title={AI_KIND_LABEL.wiki_answer}
      head={<><Big n={a.answers_total} /><span className="text-sub text-muted-foreground">回答</span></>}
      footnote="評価は聞いた人の申告です。「出典が開かれた」は閲覧の記録から数えています。"
    >
      <StatRow label="出典あり" value={rateLabel(cited)} rate={cited} tone="good" note="回答なし" />
      <StatRow label="出典が開かれた" value={rateLabel(a.citation_open_rate)} rate={a.citation_open_rate} note="記録なし" />
      <StatRow label="役に立った" value={rateLabel(good)} rate={good} tone="good" note="評価なし" />
      <StatRow label="的外れ" value={rateLabel(reject)} rate={reject} tone="bad" note="評価なし" />
      {a.unverified_quote_answers > 0 && (
        <p className="mt-1 rounded-note border border-warning-border bg-warning-surface px-2.5 py-2 text-sub-sm leading-relaxed text-foreground">
          引用の文が材料に見つからなかった回答が {a.unverified_quote_answers}件 あります。
          回答そのものを読み直してください。
        </p>
      )}
    </Card>
  );
}

/** AI で下書きを作成（`wiki_draft`）。**無修正率はここ**（設計 §6-⑦） */
function DraftCard({ d }: { d: ReviewDigest }) {
  const dr = d.draft;
  if (!dr) return null;
  return (
    <Card
      title={AI_KIND_LABEL.wiki_draft}
      head={(
        <>
          <Big n={dr.drafts_total} />
          <span className="text-sub text-muted-foreground">
            下書き ・ 公開 {dr.published}
          </span>
        </>
      )}
      footnote="無修正率の分母は、人が公開まで進めた下書きだけです（放置した分を混ぜると、触らない運用ほど良く見えます）。"
    >
      <StatRow
        label="無修正で公開"
        value={rateLabel(d.as_is_rate)}
        rate={d.as_is_rate}
        tone="good"
        note={`確認 ${d.reviewed_outputs}件`}
      />
      <StatRow label="公開まで進んだ" value={rateLabel(dr.published_rate)} rate={dr.published_rate} note="下書きなし" />
      <StatRow
        label="公開後30日の閲覧"
        value={dr.views_30d_avg === null ? '—' : `${dr.views_30d_avg}`}
        rate={null}
        note="1ページ平均"
      />
      <StatRow
        label="公開後に直された"
        value={dr.reedits_30d_avg === null ? '—' : `${dr.reedits_30d_avg}`}
        rate={null}
        note="他の人・30日平均"
      />
    </Card>
  );
}

/** AI で整える（`wiki_rewrite`） */
function RewriteCard({ d }: { d: ReviewDigest }) {
  const rw = d.rewrite;
  if (!rw) return null;
  const asIs = ratio(rw.as_is, rw.decided);
  return (
    <Card
      title={AI_KIND_LABEL.wiki_rewrite}
      head={(
        <>
          <Big n={rw.decided} />
          <span className="text-sub text-muted-foreground">整えて、置き換えるか決めた回</span>
        </>
      )}
      footnote="手入力のメモを手順書の形に整える機能です。崩れは並べて見れば分かるので、評価の欄は置いていません。"
    >
      <StatRow label="置き換えた" value={rateLabel(rw.replaced_rate)} rate={rw.replaced_rate} tone="good" note="記録なし" />
      <StatRow label="そのまま採用" value={rateLabel(asIs)} rate={asIs} tone="good" note="記録なし" />
      <StatRow label="やめた" value={`${Math.max(rw.decided - rw.replaced, 0)}`} rate={null} note="使わなかった回" />
    </Card>
  );
}

/** よく直される点（全種まとめて多い順）と、次の AI に渡している助言 */
function AdviceCard({ digests }: { digests: ReviewDigest[] }) {
  const fields = digests
    .flatMap((d) => d.top_corrected_field_types.map((f) => ({ ...f, kind: d.kind })))
    .filter((f) => f.corrections > 0)
    .sort((a, b) => b.corrections - a.corrections)
    .slice(0, 6);
  /*
   * ⚠️ **同じ文が2度出ます。** 足りないページの助言は `wiki_answer` と `wiki_draft`
   * の両方に載るので、そのまま並べると画面にも2行出て、React の key も重なります
   * （実ブラウザで「key が重複」の警告が出た）。**先に重複を落とします。**
   */
  /*
   * ⚠️ **助言の文には Markdown の印（`**…**`）が入っています**（次の呼び出しに
   * そのまま載せる文なので）。素で出すと画面に `**` が見えるため、検索の抜粋と
   * 同じ `toPlainText` で印だけ落とします（文字は消しません）。
   */
  const advice = [...new Set(digests.flatMap((d) => d.advice))].map(toPlainText);
  const openGaps = digests.find((d) => d.gaps && d.gaps.open > 0)?.gaps ?? null;

  return (
    <section className="flex flex-col gap-3 rounded-card border border-border bg-card p-4">
      <p className="text-cardtitle flex items-center gap-2 text-foreground">
        <Lightbulb className="h-4 w-4 text-warning" aria-hidden />
        よく直される点と、次の AI に渡している助言
      </p>

      {fields.length === 0 ? (
        <p className="text-sub text-muted-foreground">
          この期間に、人が直した記録はまだありません。
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {fields.map((f, i) => (
            <li key={`${f.kind}-${f.field_path}-${i}`} className="flex items-baseline justify-between gap-2 text-sub">
              <span className="min-w-0 [overflow-wrap:anywhere] text-foreground">
                {f.field_path}
                <span className="ml-1.5 text-sub-sm text-muted-foreground">
                  {AI_KIND_LABEL[f.kind] ?? f.kind}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{f.corrections}件</span>
            </li>
          ))}
        </ul>
      )}

      {advice.length > 0 && (
        <div className="rounded-note border border-ai-border bg-ai-surface px-3 py-2.5">
          <p className="text-th flex items-center gap-1.5 text-ai">
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            次の呼び出しに載せている文
          </p>
          <ul className="mt-1 list-disc pl-4 text-sub leading-relaxed text-foreground">
            {advice.map((line) => <li key={line}>{line}</li>)}
          </ul>
        </div>
      )}

      {openGaps && (
        <div className="flex flex-col gap-2">
          <p className="text-sub leading-relaxed text-secondary-foreground">
            答えられなかった質問が {openGaps.open}件 たまっています。
            プロンプトを直すより<strong className="font-bold">ページを書くほうが効きます</strong>。
          </p>
          {/* 文の中の小さなリンクにしない（スマホで狙えない）。1行の操作として出す */}
          <Link
            to="/review?tab=gaps"
            className="inline-flex min-h-tap items-center justify-center self-start rounded-control-lg border border-border bg-card px-3 text-list text-foreground no-underline hover:bg-background lg:h-9 lg:min-h-0"
          >
            足りないページを見る
          </Link>
        </div>
      )}
    </section>
  );
}

/**
 * 「見直した」の記録（設計 §6-⑦ の「担当の名前と『見直した』の記録」・§7-3 条件5）。
 *
 * ここは**人がやったこと**の記録なので、名前を出します（AI がやったことに
 * 人名を添えないのとは別の話）。読むのに manager は要りません —
 * 元は `GET /wiki/review` が一緒に返しているものです。
 */
function ReviewLogCard({ rows }: { rows: WikiReviewLogEntry[] | undefined }) {
  return (
    <section className="flex flex-col gap-2 rounded-card border border-border bg-card p-4">
      <p className="text-cardtitle flex items-center gap-2 text-foreground">
        <CalendarCheck className="h-4 w-4 text-success" aria-hidden />
        「見直した」の記録
      </p>
      {!rows || rows.length === 0 ? (
        <p className="text-sub text-muted-foreground">
          まだ記録がありません。「見直し予定」で「見直した」を押すと、ここに残ります。
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border-faint">
          {rows.map((r) => (
            <li key={r.id}>
              {/* 押せる場所は行全体（題だけだとスマホで 20px の帯を狙うことになる） */}
              <Link
                to={`/p/${r.page_id}`}
                className="group flex min-h-tap flex-wrap items-center gap-x-2.5 gap-y-0.5 py-1.5 no-underline lg:min-h-0"
              >
                <span className="min-w-0 truncate text-sub text-foreground group-hover:underline">
                  {r.page_title}
                </span>
                <span className="text-sub-sm text-muted-foreground">{r.space_name}</span>
                <span className="flex-1" />
                <span className="text-sub-sm text-muted-foreground">
                  {r.reviewer_name ?? '—'} ・ {shortDayLabel(r.reviewed_at)}
                  {r.next_review_by ? ` ・ 次は ${reviewByLabel(r.next_review_by)}` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export interface ReviewDigestTabProps {
  digests: ReviewDigest[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  /** 直され方は manager だけが読めます（§8） */
  canManage: boolean;
  /** 何日ぶんを数えているか（サーバーが返した値をそのまま出す） */
  windowDays: number;
  /** 「見直した」の記録（`GET /wiki/review` が一緒に返す。manager でなくても読める） */
  recentReviews?: WikiReviewLogEntry[];
}

/**
 * AI の区画だけを描く。**「見直した」の記録とは別に諦められるように**分けてある
 * （直され方は manager だけ・記録は全員。片方の失敗でもう片方を消さない）。
 */
function DigestSection({
  digests, loading, error, onRetry, canManage, windowDays,
}: Omit<ReviewDigestTabProps, 'recentReviews'>) {
  if (!canManage) {
    return <NoPermissionPanel modules={['wiki']} level="manager" target="AI の直され方" />;
  }
  if (error) {
    return <ErrorPanel title="AI の直され方を読み込めませんでした" error={error} onRetry={onRetry} />;
  }
  if (loading) {
    return <Delayed><SkeletonRows rows={3} rowHeight={140} /></Delayed>;
  }
  if (!digests || digests.length === 0) {
    return (
      <EmptyState
        icon={<Sparkles className="h-6 w-6" aria-hidden />}
        title="AI の記録がまだありません"
        description="「AI に聞く」「AI で下書きを作成」「AI で整える」を使うと、ここに直され方が出ます。"
      />
    );
  }

  const byKind = (kind: string) => digests.find((d) => d.kind === kind);
  const answer = byKind('wiki_answer');
  const draft = byKind('wiki_draft');
  const rewrite = byKind('wiki_rewrite');
  const days = digests[0]?.window_days || windowDays;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sub text-muted-foreground">
        直近 {days}日ぶん。AI の出力と、人が直した差分から数えています。
      </p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {answer && <AnswerCard d={answer} />}
        {draft && <DraftCard d={draft} />}
        {rewrite && <RewriteCard d={rewrite} />}
      </div>
      <AdviceCard digests={digests} />
    </div>
  );
}

export default function ReviewDigestTab({ recentReviews, ...digestProps }: ReviewDigestTabProps) {
  return (
    <div className="flex flex-col gap-3">
      <DigestSection {...digestProps} />
      <ReviewLogCard rows={recentReviews} />
    </div>
  );
}
