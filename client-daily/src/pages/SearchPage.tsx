/**
 * 日常業務の「探す」（v4・スマホの下タブ 3つ目・M9）
 *
 * ── なぜ作るのか ────────────────────────────────────────────
 *
 * v4 の決めごとは**下タブ3つ = ホーム / やること / 検索**
 * （`docs/design/v4/_rules.md`「3. スマホ」）。ところがこのアプリには
 * 検索の画面が無かったので、**3つ目を「メニューを開く」で代用**していました。
 * メニューは**上辺バーの ☰ からも開けます** — 3枠しかないうちの1枠を
 * 二重の入口に使っていて、決めごとにある検索がどこにも無い状態でした。
 *
 * ── 何を探すのか（このアプリの「探す」は受付の道具）────────────
 *
 * 案件管理の探す（案件・お客様・仕入先）とは中身が違います。ここは
 * **その場で人と向き合っているときに引くもの**です:
 *
 *   来場予約           「田中さん」「GMO」で名簿を引く（受付）
 *   セキュリティカード  「あの制作会社に何番を渡したか」
 *   問い合わせ      「その話、前に来ていませんでしたか」
 *
 * ── 揺れを吸う正規化は内覧会と同じ1本 ──────────────────────
 *
 * カタカナ／ひらがな・全角／半角・電話のハイフンを区別しません
 * （`inview/logic.ts` の `normalizeForSearch`）。**写していません** —
 * 写すと片方だけ揺れを足したときに「内覧会では当たるのに探すでは当たらない」が起きます。
 *
 * ── 打つ前に出すのは「メニューの写し」にしない ────────────────
 *
 * 空欄のときに左メニューと同じ並びを出すと、**また二重の入口**になります。
 * ここに出すのは**いま入っているデータから出したもの**だけです — 今日の回・貸出中のカード・
 * まだ仕分けていない情報。行き先ではなく「いまどうなっているか」です。
 */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  CalendarDays, ChevronRight, DoorOpen, Inbox, KeyRound, Search,
} from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Row, RowMain, RowTitle, RowSub } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { Delayed, EmptyState, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { Input } from '@/components/ui/input';
import { INQUIRY_STATE_LABELS } from '@/lib/types';
import { useInviewList } from '@/lib/inviewApi';
import { useSecurityCards } from '@/lib/securityCardApi';
import { useInquiries } from '@/lib/inboxApi';
import {
  dayKey, formatDayTitle, headOf, matchedFields, matchesTerms, searchTerms, todayKey,
} from './inview/logic';
import { cardSub, matchesCard, matchesInquiry } from './search/matchers';

export default function SearchPage() {
  const navigate = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [query, setQuery] = useState(sp.get('q') ?? '');
  const isMobile = useIsMobile();

  // **3本とも小さい表**（カード24枚・来場予約・情報）なので、開いた時点で引きます。
  // 打ってから引くと、最初の1文字で待たされます
  const inview = useInviewList();
  const cards = useSecurityCards();
  // ⚠️ **上限を明示して引く**（247 で一覧に既定 50 件の上限が入った）。
  // 探すのは「その話、前に来ていませんでしたか」なので、
  // 直近50件だけを探すと**古い話ほど当たらない**（探した意味が無い）。
  // 上限そのものは残す — 全件を運ぶと溜まるほど検索が遅くなる
  const inquiries = useInquiries({ limit: 200 });

  const terms = useMemo(() => searchTerms(query), [query]);
  const searching = terms.length > 0;
  const loading = inview.isLoading || cards.isLoading || inquiries.isLoading;

  const hits = useMemo(() => {
    if (!searching) return null;
    return {
      inview: (inview.data ?? []).filter((r) => matchesTerms(r, terms)),
      cards: (cards.data ?? []).filter((c) => matchesCard(c, terms)),
      inquiries: (inquiries.data ?? []).filter((q) => matchesInquiry(q, terms)),
    };
  }, [searching, terms, inview.data, cards.data, inquiries.data]);

  const total = hits ? hits.inview.length + hits.cards.length + hits.inquiries.length : 0;

  const onType = (v: string) => {
    setQuery(v);
    setSp((prev) => {
      const n = new URLSearchParams(prev);
      if (v.trim()) n.set('q', v.trim()); else n.delete('q');
      return n;
    }, { replace: true });
  };

  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader
        title="検索"
        sub="来場予約・セキュリティカード・問い合わせをまとめて探します"
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          type="search"
          // 探しに来た人がもう一度入力欄を押さずに済むようにする
          autoFocus
          value={query}
          onChange={(e) => onType(e.target.value)}
          placeholder="氏名・会社名・電話番号・カード番号"
          aria-label="検索語"
          className="min-h-tap h-11 pl-10 lg:h-10"
        />
      </div>

      {loading ? (
        <Delayed><SkeletonRows rows={5} /></Delayed>
      ) : !searching ? (
        <Standby inview={inview.data ?? []} cards={cards.data ?? []} inquiries={inquiries.data ?? []} onGo={navigate} />
      ) : total === 0 ? (
        <EmptyState
          icon={<Search className="h-6 w-6" aria-hidden="true" />}
          title={`「${query.trim()}」に一致する項目はありません`}
          description="言葉を短くするか、別の言い方で試してください。カタカナ・ひらがな・全角半角・電話のハイフンは区別していません。"
        />
      ) : (
        <div className="flex flex-col gap-3.5">
          <p className="text-sub text-muted-foreground">
            <span className="font-number font-bold">{total}</span> 件
          </p>

          {hits!.inview.length > 0 && (
            <Group icon={DoorOpen} label="来場予約" n={hits!.inview.length}>
              {hits!.inview.map((r) => {
                // **氏名以外で当たったときは、どこに当たったかを出す**
                // （なぜこの人が出たのか分からないと受付で確かめられない）
                const where = matchedFields(r, terms).filter((f) => f !== '氏名');
                return (
                  <ClickRow key={r.id} onOpen={() => navigate(`/inview/${dayKey(r)}`)}>
                    <RowMain>
                      <RowTitle>{r.name}</RowTitle>
                      <RowSub>
                        {[r.company, r.session_date ? formatDayTitle(r.session_date) : '日付未定',
                          r.session_label, `${headOf(r)}名`].filter(Boolean).join(' ・ ')}
                      </RowSub>
                      {where.length > 0 && (
                        <RowSub className="text-primary">{where.join(' / ')}に当たりました</RowSub>
                      )}
                    </RowMain>
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </ClickRow>
                );
              })}
            </Group>
          )}

          {hits!.cards.length > 0 && (
            <Group icon={KeyRound} label="セキュリティカード" n={hits!.cards.length}>
              {hits!.cards.map((c) => (
                <ClickRow key={c.id} onOpen={() => navigate(`/security-cards?card=${c.id}`)}>
                  <RowMain>
                    <RowTitle>No.{c.card_no}{c.label ? ` ${c.label}` : ''}</RowTitle>
                    <RowSub>{cardSub(c)}</RowSub>
                  </RowMain>
                  <TableBadge
                    label={c.overdue ? '返却遅延' : c.status === 'lent' ? '貸出中' : '貸せる'}
                    w={96}
                    className={c.overdue ? 'bg-destructive-surface text-destructive border-transparent'
                      : c.status === 'lent' ? 'bg-warning-surface text-warning border-transparent'
                        : 'bg-success-surface text-success border-transparent'}
                  />
                </ClickRow>
              ))}
            </Group>
          )}

          {hits!.inquiries.length > 0 && (
            /*
              **スマホでも押せる行にした**（247）。
              ここは長らく「押すと PC 専用の案内に着いて行き止まりになる」ため
              スマホだけ押せない行にしていましたが、**「問い合わせ」の
              PC 専用をやめた**ので、その理由が無くなりました
              （`pcOnlyScreens.ts` の `DAILY_MOBILE_OK` に移してあります）。
            */
            <Group icon={Inbox} label="問い合わせ" n={hits!.inquiries.length}>
              {hits!.inquiries.map((q) => (
                <ClickRow key={q.id} onOpen={() => navigate('/inquiries')}>
                  <RowMain>
                    <RowTitle>{q.subject || q.summary || '(件名なし)'}</RowTitle>
                    <RowSub>{[q.sender, q.category, INQUIRY_STATE_LABELS[q.state]].filter(Boolean).join(' ・ ')}</RowSub>
                    {isMobile && q.summary && q.summary !== q.subject && (
                      <RowSub className="line-clamp-2">{q.summary}</RowSub>
                    )}
                  </RowMain>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </ClickRow>
              ))}
            </Group>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 打ち込む前に出すもの。**メニューの写しにしない** — 出すのは
 * 「いまどうなっているか」だけで、どれも数が 0 なら出しません
 * （0 の行が並ぶと、押す理由の無いものを読ませることになる）。
 */
function Standby({ inview, cards, inquiries, onGo }: {
  inview: Parameters<typeof matchesTerms>[0][];
  cards: Parameters<typeof matchesCard>[0][];
  inquiries: Parameters<typeof matchesInquiry>[0][];
  onGo: (to: string) => void;
}) {
  const today = todayKey();
  const todays = inview.filter((r) => r.session_date === today);
  const lent = cards.filter((c) => c.status === 'lent');
  const overdue = cards.filter((c) => c.overdue);
  const unsorted = inquiries.filter((q) => q.state === 'unsorted');

  const rows: Array<{ key: string; icon: typeof Search; title: string; sub: string; to: string }> = [];
  if (todays.length > 0) {
    rows.push({
      key: 'today', icon: CalendarDays,
      title: '今日の内覧会',
      sub: `${todays.length}組 ・ ${todays.reduce((a, r) => a + headOf(r), 0)}名 の受付ページを開く`,
      to: `/inview/${today}`,
    });
  }
  if (lent.length > 0) {
    rows.push({
      key: 'lent', icon: KeyRound,
      title: `貸出中のカード ${lent.length}枚`,
      sub: overdue.length > 0 ? `うち ${overdue.length}枚 が返却遅延` : '返却遅延はありません',
      to: '/security-cards',
    });
  }
  if (unsorted.length > 0) {
    rows.push({
      key: 'unsorted', icon: Inbox,
      title: `まだ仕分けていない情報 ${unsorted.length}件`,
      sub: '保留・タスク・案件のどれにするか決める',
      to: '/inquiries',
    });
  }

  return (
    <div className="flex flex-col gap-3.5">
      {rows.length > 0 && (
        <Group icon={Search} label="現在の状況" n={rows.length}>
          {rows.map((r) => (
            <ClickRow key={r.key} onOpen={() => onGo(r.to)}>
              <r.icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <RowMain>
                <RowTitle>{r.title}</RowTitle>
                <RowSub>{r.sub}</RowSub>
              </RowMain>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </ClickRow>
          ))}
        </Group>
      )}

      <p className="text-note text-muted-foreground">
        来場予約は<strong className="font-bold">氏名・ふりがな・会社・役職・メール・電話・住所・同行者名・回</strong>、
        セキュリティカードは<strong className="font-bold">番号・貸出先</strong>、
        問い合わせは<strong className="font-bold">差出人・件名・要約・タグ</strong>から探します。
        カタカナ・ひらがな・全角半角・電話のハイフンは区別しません。
        <strong className="font-bold">来場予約は開催日に関係なく全部の回</strong>から探します
        （申し込んだ回を覚えていない人が普通にいるため）。
      </p>
    </div>
  );
}

/** 押せる行。**キーボードでも押せるようにする**（`onClick` だけの `<div>` は Tab で止まらない） */
function ClickRow({ onOpen, children }: { onOpen: () => void; children: React.ReactNode }) {
  return (
    <Row
      divider
      interactive
      align="start"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </Row>
  );
}

function Group({ icon: Icon, label, n, children }: {
  icon: typeof Search; label: string; n: number; children: React.ReactNode;
}) {
  return (
    <section className="rounded-card overflow-hidden border border-border bg-card">
      <h2 className="text-cardtitle flex items-center gap-2 border-b border-border-faint bg-surface-subtle px-4 py-2.5">
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        {label}
        <span className="text-sub font-number font-bold text-muted-foreground">{n}</span>
      </h2>
      {children}
    </section>
  );
}
