/**
 * 利用マニュアル・プロジェクト管理編 (GPM) (v4)
 *
 * `../ManualTopPage.tsx`（トップページ編）と同じ設計・同じ部品をそのまま使う
 * （`parts.tsx` の `FigureFrame`/`Legend`/`StepsList`/`TipCallout` は編集しない）。
 * プロジェクト管理には専用のマニュアルページがまだ無かったため、実際の画面
 * （`contexts/gpm/`）をもとに「〜したい」形式で新しく書き起こした。
 *
 * 上部の実際のトップバー・パンくずは `<AppShell>` が描くので、
 * ここではページ本体（見出し〜フッター）だけを組み立てる。
 */
import { useMemo, useState, type ComponentType } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { SECTIONS, type ManualSection } from './sections';
import { FigureFrame, Legend, StepsList, TipCallout } from '../parts';
import {
  DashboardFigure, ProjectListFigure, NewProjectFigure, PhaseTaskFigure, OpenItemsFigure,
} from './figures';
import {
  OrgChartFigure, MinutesFigure, EstimatesFigure, BillingFigure, FilesFigure,
} from './figures2';

/** タブ状の chip 列。トップページ・案件管理だけ実在し、残りは行き先が無い（`近日公開`） */
const OTHER_GUIDES = ['制作技術支援', '財務管理', 'カレンダー', '日常業務', '機材管理', '設定'];

interface CardContent {
  id: string;
  /** 画面イメージつきの項目にだけ持たせる。lite 項目（手順のみ）は無い */
  Figure?: ComponentType;
  legend: string[];
  steps: string[];
  tip?: { tone: 'info' | 'warning'; text: string };
}

const CARDS: CardContent[] = [
  // ── 状況を把握する ──────────────────────────────────────────
  {
    id: 'p1',
    Figure: DashboardFigure,
    legend: [],
    steps: [
      '上段5つの数字で「進行中件数」「今週期限の作業」「未確認事項」「個別見積の未提出」「検収待ち」を確認します。',
      '「止まっているプロジェクト」カードには、工程が進められない理由（＝未確認事項）が付いたプロジェクトだけが表示されます。「未確認事項」カードは先方・社内の判断待ちの一覧です。',
      '下段「動いているプロジェクト」（進行中＋準備中）から、各プロジェクトへ1クリックで移動できます。',
    ],
  },
  {
    id: 'p2',
    Figure: ProjectListFigure,
    legend: [],
    steps: [
      'タブ「動いているもの／進行中／準備中／完了／見送り／すべて」で絞り込みます。',
      '検索ボックス（プロジェクト名・依頼元）、区分（すべて／自社構築／グループ受託）、並び替え（おすすめ順など）が使えます。',
      '「リスト」「ボード」表示を右上で切り替えられます。列「次にやること」「未確認」でボトルネックがすぐ分かります。',
    ],
  },
  {
    id: 'p3',
    legend: [],
    steps: [
      'サイドバー「やること（未確認事項）」で、全プロジェクト横断のタスクを確認します。右上で「タスク」「未確認事項」の表示を切り替えます。',
      'タブ「未完了／期限超過／完了／すべて」で絞り込めます。タスク行のプロジェクト名からそのプロジェクトへ移動できます。',
    ],
    tip: { tone: 'info', text: '補足：タスクを足す・直すのは、各プロジェクト詳細の「概要」タブから行います。ここは横断で見るための一覧です。' },
  },
  // ── 作る・進める ────────────────────────────────────────────
  {
    id: 'p4',
    Figure: NewProjectFigure,
    legend: [],
    steps: [
      '①基本情報：プロジェクト名・区分（自社構築／グループ受託）・依頼元・PM会社・自社担当・いまの段（案件と同じステージ表記）を入力します。',
      '②標準工程を選ぶ：近いひな形を選ぶと工程とタスクがそのまま入ります（後から自由に直せます）。決まっていなければ「ひな形を使わない」でも進められます。',
      '③〜⑤：着手日と工程の確認、体制（組織図）、メンバー・書類の下ごしらえと続きます。どの段でも「作る」を押せば作成完了です（体制は空でもOK、あとから足せます）。',
    ],
    tip: { tone: 'info', text: '補足：BOXフォルダはこのウィザードでは作られません。「作る」を押すと本番のBOXに実際にフォルダができ、内容はプロジェクト詳細の「書類」タブから確認します。' },
  },
  {
    id: 'p5',
    Figure: PhaseTaskFigure,
    legend: [],
    steps: [
      '工程がまだない場合は「工程を足す」から、標準工程ひな形を選ぶか、1つずつ手で追加します。工程の名前を押すと、その工程のタスクが展開されます。',
      '「工程に付いていないタスク」欄から、工程に属さない単発タスクも「＋タスクを足す」で追加できます。担当・期限を設定します。',
      'ヘッダーのステータスボタン（見積提案／口頭決定／受注済／完了）で、プロジェクト全体の進行段階を切り替えます。',
    ],
    tip: { tone: 'warning', text: '注意：工程の日付を直しても、あとに続く工程は連動して動きません（1つずつ直す必要があります）。' },
  },
  {
    id: 'p6',
    Figure: OpenItemsFigure,
    legend: [],
    steps: [
      '「未確認事項を足す」から、何を確認中か（例：レイアウト案の承認待ち）を記録します。',
      '記録するとダッシュボードの「止まっているプロジェクト」「未確認事項」カードと、「やること」の横断一覧に表示されます。',
      '解決しても記録は消しません（「訊いた記録」として残します）。解決済みにチェックを入れて管理します。',
    ],
  },
  {
    id: 'p7',
    Figure: OrgChartFigure,
    legend: [],
    steps: [
      '「人を足す」から、名前・立場（自社／発注者／PM会社／業者）・組織図の段（決める人／進める人／手を動かす人）・役割・所属を入力します。',
      '複数人を同じ段に並べられます。「まとまりの名前」で部署やユニット単位にラベルを付けられます。',
    ],
  },
  {
    id: 'p8',
    Figure: MinutesFigure,
    legend: [],
    steps: [
      '「打合せを録音する」で録音を開始します。終了すると文字起こしから下書きが自動作成されます。',
      '決定事項には文字起こしからの引用が付きます（根拠が出せないものは持ち帰りに分類されます）。',
    ],
    tip: {
      tone: 'info',
      text: '補足：音声は文字にしたら破棄され保存されません。残るのは文字起こしと議事録だけです。持ち帰り事項は「未確認事項」にできます（工事・構築の持ち帰りはほとんどが先方判断待ちのため、止まっている件数として数えられる方に入れます）。',
    },
  },
  // ── 見積・請求・書類 ────────────────────────────────────────
  {
    id: 'p9',
    Figure: EstimatesFigure,
    legend: [],
    steps: [
      '「見積をつくる」から提出先を選び作成します。中身は案件の見積と同じ部品で、合計と粗利の計算は1か所です。',
      '行の書類アイコンから見積書PDFを発行できます（社外共有可フォルダの「01_見積・提案」にも自動で入ります）。',
    ],
    tip: { tone: 'warning', text: '注意：出したあと（送付済・受注・旧版）は直せません。直したいときは次の版を作ってください。写しを作ると、片方だけ直した日から金額が食い違う点にも注意。' },
  },
  {
    id: 'p10',
    Figure: BillingFigure,
    legend: [],
    steps: [
      '月ピッカーで対象月を選び「＋月を追加」を押すと、その月の請求単位が作られ売上明細の入力ダイアログが開きます。',
      '月カードから「明細編集」「見積書」「請求書」「検収書」「請求書Excel」を発行します。同じ月をもう一度追加しても二重にはならず既存の月ユニットが開きます。',
      '月に紐づかないスポットの売上・仕入は「その他の売上明細（月次外）」「その他の仕入（月次外）」で管理します。',
    ],
  },
  {
    id: 'p11',
    Figure: FilesFigure,
    legend: [],
    steps: [
      '「書類」タブの2つのゾーンに、ファイルをドラッグ＆ドロップするか「ファイルを選ぶ」でアップロードします（各5つまで）。',
      '「BOXで開く」から本体のBOXを直接開けます。深いフォルダの中はここには出ません（1階層だけ）。',
    ],
    tip: { tone: 'info', text: '補足：同じ名前のファイルは新しい版として上がります（BOXの版履歴に残ります）。' },
  },
  // ── 設定 ──────────────────────────────────────────────────
  {
    id: 'p12',
    legend: [],
    steps: [
      'サイドバー「標準工程テンプレート」の「ひな形を作る」から、工程とタスクのセットを登録します。',
      '各ひな形の「直す」で工程・タスク・目安日数を編集できます。一覧には工程数・タスク数・目安日数・適用中の件数が表示されます。',
      'プロジェクト作成ウィザードの②で、このひな形を選ぶと工程とタスクがそのまま複製されます。',
    ],
  },
];

/** 大小無視の部分一致。title・sub・keywords をまとめて見る */
function matches(s: ManualSection, needle: string): boolean {
  const haystack = `${s.title} ${s.sub} ${s.keywords.join(' ')}`.toLowerCase();
  return haystack.includes(needle);
}

export default function GpmManualPage() {
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
        <h1 className="text-h1 [overflow-wrap:anywhere]">迷わないための、逆引きプロジェクト管理ガイド</h1>
        <p className="text-sub max-w-3xl text-secondary-foreground">
          工事・構築など「発注が確定してから納品まで」を扱うアプリです。既存の利用マニュアルには
          専用ページがまだ無かったため、実際の画面をもとに「〜したい」形式で新しく書き起こしました。
        </p>

        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="ブロックアプリ別のガイド">
          <Link
            to="/manual"
            role="tab"
            aria-selected="false"
            className="rounded-chip shrink-0 whitespace-nowrap border border-border bg-card px-3.5 py-1.5 text-sub text-secondary-foreground"
          >
            トップページ
          </Link>
          <Link
            to="/manual/sales"
            role="tab"
            aria-selected="false"
            className="rounded-chip shrink-0 whitespace-nowrap border border-border bg-card px-3.5 py-1.5 text-sub text-secondary-foreground"
          >
            案件管理
          </Link>
          <span
            role="tab"
            aria-selected="true"
            className="rounded-chip shrink-0 whitespace-nowrap bg-primary px-3.5 py-1.5 text-sub font-bold text-primary-foreground"
          >
            プロジェクト管理
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
          placeholder="やりたいことをキーワードで探す（例: ダッシュボード, 未確認事項, 請求）"
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
        次は他のブロックアプリへ展開予定です。「近日公開」のタブが開き次第、このページから続けて読めるようにします。
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
        {Figure && (
          <FigureFrame>
            <Figure />
          </FigureFrame>
        )}
        <Legend items={card.legend} />
        <StepsList items={card.steps} />
        {card.tip && <TipCallout tone={card.tip.tone}>{card.tip.text}</TipCallout>}
      </div>
    </section>
  );
}
