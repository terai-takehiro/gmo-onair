/**
 * 利用マニュアル・トップページ編 (v4)
 *
 * これまで本人メニューから開く「モーダルのポップアップ」だった使い方案内を、
 * リンクで共有できる**独立ページ**に変えた最初の1本。「〇〇したい」から逆引きし、
 * 実際の画面コンポーネントをそのまま埋め込んで確認できるようにしてある
 * （自作 CSS で近似しない・`FigureFrame` が操作不能にする）。
 *
 * 上部の実際のトップバー（ロゴ・検索・通知ベル・本人メニュー）は `<AppShell>` が
 * 描くので、ここではパンくずの下＝ページ本体だけを組み立てる。
 */
import { useMemo, useState, type ComponentType } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { SECTIONS, type ManualSection } from './sections';
import { FigureFrame, Legend, StepsList, TipCallout } from './parts';
import {
  GreetingFigure, AppTilesFigure, NotificationFigure, SearchFigure, IntakeFigure,
  TodayFigure, TaskHubFigure, UserMenuFigure, EventTilesFigure,
} from './figures';

/** タブ状の chip 列。「トップページ」だけが実在し、他は行き先が無い（`近日公開`） */
const OTHER_GUIDES = ['案件管理', '財務管理', 'カレンダー', '日常業務', '機材管理', '制作技術支援', '計時・視聴者', '設定'];

interface CardContent {
  id: string;
  Figure: ComponentType;
  /** figure に打ったピンの説明。ピンを打っていない figure では空配列でよい */
  legend: string[];
  steps: string[];
  tip?: { tone: 'info' | 'warning'; text: string };
}

const CARDS: CardContent[] = [
  {
    id: 't1',
    Figure: GreetingFigure,
    legend: [],
    steps: [
      'ページを開いて最初に見えるこの1行が、今日の優先度の合図',
      '赤い数字はリンクで、押すとタスク一覧へ飛べる',
      '再読み込みすると、右上の最終更新時刻も更新される',
    ],
    tip: { tone: 'info', text: '両方とも0件なら、今日は急ぎの対応なし' },
  },
  {
    id: 't2',
    Figure: AppTilesFigure,
    legend: [],
    steps: [
      'カードをクリックすると、そのアプリへ移動する',
      '右上の赤バッジは、今日中に見るべき件数',
      '開いたあとも、上部の「アプリ切替」からいつでも切り替えられる',
    ],
  },
  {
    id: 't3',
    Figure: NotificationFigure,
    legend: ['件名をクリックすると、関連する画面が開く', 'まとめて既読にするのはここ'],
    steps: [
      '右上のベルをクリック',
      '件名をクリックすると関連画面へ',
      'まとめて既読にするのは「すべて読んだことにする」',
    ],
  },
  {
    id: 't4',
    Figure: SearchFigure,
    legend: ['ここに入力すると絞り込まれる', '見る権限が無いものはそもそも出ない'],
    steps: [
      '検索バーか ⌘K（Windowsは Ctrl+K）を押す',
      '入力すると絞り込まれる。権限が無いものは出ない',
      '「よく行く先」から、検索せずに定番の操作へ進める',
    ],
  },
  {
    id: 't5',
    Figure: IntakeFigure,
    legend: [],
    steps: [
      '思いついたことをそのまま書く・貼る。写真や録音も添付できる',
      '「内容を確認する」を押すと、AI が誰に・何を・いつまでにを読み取り確認画面を出す',
      '確認画面で直してから登録する。ボタンを押しただけでは登録されない',
    ],
    tip: { tone: 'info', text: '紙のメモや請求書の写真も、そのまま貼れば文字起こしされる' },
  },
  {
    id: 't6',
    Figure: TodayFigure,
    legend: [],
    steps: [
      '今日の予約が、時刻順に並ぶ',
      '予定が無い日は「今日の予定はありません」と出る（異常ではない）',
      '今週・来月の予定はカレンダーで見る',
    ],
  },
  {
    id: 't7',
    Figure: TaskHubFigure,
    legend: ['タブで「自分のタスク」と「お待たせ中」を切り替える', '赤い「超過」タグは最優先で対応する'],
    steps: [
      'タブで自分のタスクとお待たせ中を切り替える',
      '上段の3チップは、クリックするとその条件で絞り込まれる',
      '完了したら、チェックボックスにチェックを入れる',
    ],
    tip: { tone: 'warning', text: '赤い「超過」タグが付いた行は最優先で対応する' },
  },
  {
    id: 't8',
    Figure: UserMenuFigure,
    legend: ['「利用マニュアル」がこのページの入口＝いまここ', '「ユーザー切替」は管理者だけに出る'],
    steps: [
      '右上の自分の名前（アバター）をクリック',
      '「利用マニュアル」がこのページの入口。「バージョン履歴」は更新内容の確認用',
      '「ユーザー切替」で別アカウントの画面を確認できる（管理者のみ）',
    ],
  },
  {
    id: 't9',
    Figure: EventTilesFigure,
    legend: [],
    steps: [
      'トップページ下部「イベントで使うもの」から開く',
      '「別サイト ↗」のタイルは新しいタブで開き、ログインもデータも別のツール',
    ],
  },
];

/** 大小無視の部分一致。title・sub・keywords をまとめて見る */
function matches(s: ManualSection, needle: string): boolean {
  const haystack = `${s.title} ${s.sub} ${s.keywords.join(' ')}`.toLowerCase();
  return haystack.includes(needle);
}

export default function ManualTopPage() {
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();

  const filtered = useMemo(
    () => (needle ? SECTIONS.filter((s) => matches(s, needle)) : SECTIONS),
    [needle],
  );
  const filteredIds = useMemo(() => new Set(filtered.map((s) => s.id)), [filtered]);
  const groups = useMemo(() => Array.from(new Set(SECTIONS.map((s) => s.group))), []);
  const cards = useMemo(() => CARDS.filter((c) => filteredIds.has(c.id)), [filteredIds]);

  return (
    <div className="mx-auto flex max-w-screen-2xl flex-col gap-6 p-3 lg:p-6">
      {/* ── ページヘッダー ─────────────────────────────────────── */}
      <header className="flex flex-col gap-3">
        <p className="v4-eyebrow">利用マニュアル</p>
        <h1 className="text-h1 [overflow-wrap:anywhere]">迷わないための、逆引きトップページガイド</h1>
        <p className="text-sub max-w-3xl text-secondary-foreground">
          これまで本人メニューから開く一時的なポップアップだった使い方案内を、リンクで共有できる独立ページに変えました。
          「〇〇したい」から探すと、実際の画面のままの形で確認できます。
        </p>

        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="ブロックアプリ別のガイド">
          <span
            role="tab"
            aria-selected="true"
            className="rounded-chip shrink-0 whitespace-nowrap bg-primary px-3.5 py-1.5 text-sub font-bold text-primary-foreground"
          >
            トップページ
          </span>
          {OTHER_GUIDES.map((label) => (
            <button
              key={label}
              type="button"
              disabled
              role="tab"
              aria-selected="false"
              className="rounded-chip flex shrink-0 items-center gap-1.5 whitespace-nowrap border border-border bg-card px-3.5 py-1.5 text-sub text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
            >
              {label}
              <span className="text-badge rounded-badge-xs bg-muted px-1.5 py-0.5 text-muted-foreground">近日公開</span>
            </button>
          ))}
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
          placeholder="やりたいことをキーワードで探す（例: 検索, 通知, タスク）"
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
            {groups.map((g) => {
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
            cards.map((card, i) => {
              const section = SECTIONS.find((s) => s.id === card.id);
              if (!section) return null;
              return (
                <ManualCard key={card.id} n={i + 1} section={section} card={card} />
              );
            })
          )}
        </div>
      </div>

      <footer className="border-t border-dashed border-border pt-4 text-center text-sub text-muted-foreground">
        次は各ブロックアプリへ展開予定です。「近日公開」のタブが開き次第、このページから続けて読めるようにします。
      </footer>
    </div>
  );
}

function ManualCard({ n, section, card }: { n: number; section: ManualSection; card: CardContent }) {
  const { Figure } = card;
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
          <h2 className="text-cardtitle [overflow-wrap:anywhere]">{section.title}</h2>
          <p className="text-sub mt-0.5 text-secondary-foreground">{section.sub}</p>
        </div>
      </div>

      <div className={cn('mt-3.5', section.sub && 'lg:pl-10')}>
        <FigureFrame>
          <Figure />
        </FigureFrame>
        <Legend items={card.legend} />
        <StepsList items={card.steps} />
        {card.tip && <TipCallout tone={card.tip.tone}>{card.tip.text}</TipCallout>}
      </div>
    </section>
  );
}
