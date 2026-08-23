/**
 * 利用マニュアル・案件管理編 (v4)
 *
 * `../ManualTopPage.tsx`（トップページ編）と同じ設計の逆引きガイド。案件管理の
 * 34項目（実データは g9/g10 の内訳で38カード）を「〇〇したい」から探せるようにする。
 *
 * 本文データは `sections.ts`（検索・目次用の最小限）と `content.ts`（手順・箇条書き・
 * ヒント・図解キー）に分けてある。項目数が多く1ファイルには収まらないため
 * （`content.ts` 冒頭のコメント参照）。図解は `figures.tsx` の11個の static な再現
 * （`FigureFrame` で無害化・`../parts.tsx` は編集していない）。
 */
import { useMemo, useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { SECTIONS, GROUPS, type ManualSection } from './sections';
import { CARD_CONTENT, type CardContent } from './content';
import { FigureFrame, TipCallout } from '../parts';
import {
  LoginFigure, StageFigure, ProjectSearchFigure, ProjectNewFigure, StudioScheduleFigure,
  GlsIssueFigure, BillingLineFigure, TaskKanbanFigure, FinanceDashboardFigure,
  CalendarWeekFigure, ReservationFormFigure,
} from './figures';

/** `content.ts` の `figureKey` からコンポーネントを引く */
const FIGURES: Record<string, ComponentType> = {
  LoginFigure, StageFigure, ProjectSearchFigure, ProjectNewFigure, StudioScheduleFigure,
  GlsIssueFigure, BillingLineFigure, TaskKanbanFigure, FinanceDashboardFigure,
  CalendarWeekFigure, ReservationFormFigure,
};

/** タブ状の chip 列。「トップページ」「プロジェクト管理」は実在するガイドへの実リンク。
 *  残りは行き先が無いため「近日公開」 */
const TABS: { label: string; kind: 'link' | 'current' | 'disabled'; to?: string }[] = [
  { label: 'トップページ', kind: 'link', to: '/manual' },
  { label: '案件管理', kind: 'current' },
  { label: 'プロジェクト管理', kind: 'link', to: '/manual/gpm' },
  { label: '制作技術支援', kind: 'disabled' },
  { label: '財務管理', kind: 'disabled' },
  { label: 'カレンダー', kind: 'disabled' },
  { label: '日常業務', kind: 'disabled' },
  { label: '機材管理', kind: 'disabled' },
  { label: '設定', kind: 'disabled' },
];

/** 大小無視の部分一致。title・sub・keywords をまとめて見る（`../ManualTopPage.tsx` と同じ） */
function matches(s: ManualSection, needle: string): boolean {
  const haystack = `${s.title} ${s.sub} ${s.keywords.join(' ')}`.toLowerCase();
  return haystack.includes(needle);
}

/** 番号つき手順。`content.ts` の文字列は `<b>` を含むことがあるため `dangerouslySetInnerHTML`
 *  で描く（`../parts.tsx` の `StepsList` はプレーンテキスト専用で編集対象外）。見た目のクラスは
 *  `StepsList` と同一にしてある */
function Steps({ items }: { items: string[] }) {
  return (
    <ol className="mt-3 flex flex-col gap-2">
      {items.map((text, i) => (
        <li key={text} className="text-sub flex items-start gap-2.5">
          <span className="rounded-chip font-number border-primary-border bg-primary-surface mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border text-[11px] font-bold text-primary">
            {i + 1}
          </span>
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]" dangerouslySetInnerHTML={{ __html: text }} />
        </li>
      ))}
    </ol>
  );
}

/** 箇条書き（手順ではない項目）。仕様指定どおりの素の `<ul>` */
function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 flex flex-col gap-2">
      {items.map((t) => (
        <li key={t} className="text-sub flex items-start gap-2.5">
          <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]" dangerouslySetInnerHTML={{ __html: t }} />
        </li>
      ))}
    </ul>
  );
}

export default function SalesManualPage() {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();

  const filtered = useMemo(
    () => (needle ? SECTIONS.filter((s) => matches(s, needle)) : SECTIONS),
    [needle],
  );
  const cards = useMemo(
    () => filtered
      .map((s) => ({ section: s, card: CARD_CONTENT.find((c) => c.id === s.id) }))
      .filter((x): x is { section: ManualSection; card: CardContent } => !!x.card),
    [filtered],
  );

  return (
    <div className="mx-auto flex max-w-screen-2xl flex-col gap-6 p-3 lg:p-6">
      {/* ── ページヘッダー ─────────────────────────────────────── */}
      <header className="flex flex-col gap-3">
        <p className="v4-eyebrow">利用マニュアル</p>
        <h1 className="text-h1 [overflow-wrap:anywhere]">迷わないための、逆引き案件管理ガイド</h1>
        <p className="text-sub max-w-3xl text-secondary-foreground">
          案件の起票からGLS発番、見積・請求、財務、タスク・営業活動、スタジオの予定まで。
          「〇〇したい」から探すと、実際の画面に近い形で確認できます。
        </p>

        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="ブロックアプリ別のガイド">
          {TABS.map((t) => {
            if (t.kind === 'current') {
              return (
                <span
                  key={t.label}
                  role="tab"
                  aria-selected="true"
                  className="rounded-chip shrink-0 whitespace-nowrap bg-primary px-3.5 py-1.5 text-sub font-bold text-primary-foreground"
                >
                  {t.label}
                </span>
              );
            }
            if (t.kind === 'link') {
              return (
                <Link
                  key={t.label}
                  to={t.to as string}
                  role="tab"
                  aria-selected="false"
                  className="rounded-chip shrink-0 whitespace-nowrap border border-border bg-card px-3.5 py-1.5 text-sub text-secondary-foreground hover:border-primary hover:text-primary"
                >
                  {t.label}
                </Link>
              );
            }
            return (
              <button
                key={t.label}
                type="button"
                disabled
                role="tab"
                aria-selected="false"
                className="rounded-chip flex shrink-0 items-center gap-1.5 whitespace-nowrap border border-border bg-card px-3.5 py-1.5 text-sub text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t.label}
                <span className="text-badge rounded-badge-xs bg-muted px-1.5 py-0.5 text-muted-foreground">近日公開</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* ── キーワード検索 ─────────────────────────────────────── */}
      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="やりたいことをキーワードで探す（例: GLS発番, 見積, カンバン）"
          aria-label="マニュアルをキーワードで探す"
          className="h-10 pl-9"
        />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* ── 目次 ─────────────────────────────────────────────── */}
        <nav aria-label="目次" className="min-w-0 lg:sticky lg:top-3 lg:w-64 lg:shrink-0">
          {/* 375px 幅は横スクロールの chip 列。lg 以上は縦のグループ一覧に切り替える */}
          <div className="flex gap-2 overflow-x-auto pb-1 lg:hidden">
            {filtered.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="rounded-chip shrink-0 whitespace-nowrap border border-border bg-card px-3 py-1.5 text-sub text-secondary-foreground"
              >
                {s.title}
              </a>
            ))}
          </div>
          <div className="hidden flex-col gap-4 lg:flex">
            {GROUPS.map((g) => {
              const items = filtered.filter((s) => s.group === g);
              if (items.length === 0) return null;
              return (
                <div key={g}>
                  <p className="v4-eyebrow px-1.5 pb-1.5">{g}</p>
                  <ul className="flex flex-col gap-0.5">
                    {items.map((s) => (
                      <li key={s.id}>
                        <a
                          href={`#${s.id}`}
                          className="text-list block rounded-control px-2 py-1.5 text-secondary-foreground hover:bg-surface-subtle hover:text-foreground"
                        >
                          {s.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </nav>

        {/* ── 本文カード ───────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {cards.length === 0 ? (
            <p className="rounded-card border border-dashed border-border px-4 py-10 text-center text-sub text-secondary-foreground">
              該当する項目がありません
            </p>
          ) : (
            cards.map(({ section, card }, i) => (
              <ManualCard key={section.id} n={i + 1} section={section} card={card} />
            ))
          )}
        </div>
      </div>

      <footer className="border-t border-dashed border-border pt-4 text-center text-sub text-muted-foreground">
        次は財務管理・カレンダー・日常業務・機材管理・制作技術支援・設定へ展開予定です。
        「近日公開」のタブが開き次第、このページから続けて読めるようにします。
      </footer>
    </div>
  );
}

function ManualCard({ n, section, card }: { n: number; section: ManualSection; card: CardContent }) {
  const Figure = card.figureKey ? FIGURES[card.figureKey] : undefined;
  return (
    <section id={section.id} className="rounded-card scroll-mt-4 border border-border bg-card p-4 lg:p-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="font-number flex h-7 w-7 shrink-0 items-center justify-center rounded-chip bg-primary-surface text-sub font-bold text-primary"
        >
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-cardtitle [overflow-wrap:anywhere]">
            {section.title}
            {card.adminBadge && (
              <span className="ml-1 rounded-badge bg-warning-surface px-2 py-0.5 text-badge font-bold text-warning align-middle">
                {card.adminBadge}
              </span>
            )}
          </h2>
          <p className="text-sub mt-0.5 text-secondary-foreground">{section.sub}</p>
        </div>
      </div>

      <div className={cn('mt-3.5', section.sub && 'lg:pl-10')}>
        {Figure && (
          <FigureFrame>
            <Figure />
          </FigureFrame>
        )}
        {card.kind === 'steps' ? <Steps items={card.items} /> : <Bullets items={card.items} />}
        {card.tip && <TipCallout tone={card.tip.tone}>{card.tip.text}</TipCallout>}
      </div>
    </section>
  );
}
