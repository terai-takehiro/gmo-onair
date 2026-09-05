/**
 * 案件一覧の絞り込み帯（v4・指示書 4-2 / 4-3 / 4-4）
 *
 * ── 段数と幅を固定する ──────────────────────────────────────
 *
 * 旧実装は `flex-wrap` に任せていたので、**期間の単位を変えるたびに帯が
 * 1行 ↔ 2行で動いていました**（月なら `<input type=month>`、四半期なら
 * 年＋Q の2つ…と、単位ごとに置くものが違ったため）。押した直後に下の一覧が
 * 上下にずれるので、目で追っている行を見失います。
 *
 * → **最初から2段で組み、各枠の幅を決めます。**
 *
 *   1段目（40px）… 検索欄（唯一伸びる）／ 期間の単位（各66pxの等幅）／ 対象を選ぶ枠（236px）
 *   2段目（36px）… 並び順（236px）／ AI作成のみ（118px）／ 用語（86px）／ 右端に現在の期間
 *
 * ── 「全件」でも対象の枠を消さない ──────────────────────────
 *
 * `display:none` にすると、その瞬間に右側のものが左へ詰まって**位置が動きます**。
 * 薄くして押せなくするだけにします（`opacity` ＋ `pointer-events:none`）。
 */
import { Search, Sparkles, Info, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  PERIOD_MODES, options, toValue, fromValue, label, step, switchMode,
  type EventPeriodMode, type PeriodValue,
} from './period';

export type { EventPeriodMode, PeriodValue };

/**
 * 帯の中の固定幅（指示書 4-4）。**段（`SlotWidth`）に無い値**なので1か所にまとめ、
 * それぞれ理由を書いてあります。字数なりに伸ばすと、単位を変えるたびに
 * 帯の段数と各枠の位置が動きます。
 */
const SEGMENT_W = 'w-[66px]';          // ui-tokens-ok: 期間の単位は各66pxの等幅（「四半期」だけ広がらないように）
const TARGET_W = 'w-[236px]';          // ui-tokens-ok: 対象を選ぶ枠。「2026年 下期（7〜12月）」が入る幅
const SORT_W = 'h-9 w-[236px]';        // ui-tokens-ok: 並び順。上の枠と同じ幅にそろえる

/**
 * 並び順（指示書 4-2）。**5つだけ**にしました。
 *
 * 旧実装は9つあり、逆順（実施日が遠い順・作成が古い順・金額が安い順）が
 * 半分を占めていました。**逆順を選ぶ理由がある場面が無く**、
 * 224px の枠に9行のプルダウンが開くだけで、目当ての1つを探すのが遅くなります。
 *
 * ラベルは **236px の枠に1行で収まる長さ**にすること。`<SelectValue>` は
 * 選んだ項目の文字をそのまま出すので、はみ出すと2行目が切れて読めません。
 */
export const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'recommended:asc', label: 'おすすめ順' },
  { value: 'estimate_amount:desc', label: '見積金額が大きい順' },
  { value: 'event_start:asc', label: '実施日が近い順' },
  { value: 'next_task_due:asc', label: '期限が近い順' },
  { value: 'last_move:asc', label: '最後の動きが古い順' },
];

/**
 * 列ヘッダーのクリック並べ替え（`ProjectRows.tsx` の `ProjectRowsHeader`）。
 * `sort` state（`${sort_by}:${sort_dir}`）は上のプルダウンと共有する ——
 * 別に持つと、ヘッダーで並べ替えたのにプルダウンが「おすすめ順」のままになる
 * （逆も同じ）。案件台帳（`projectLedger/display.ts` の `nextSort`）と同じ
 * 3段（昇順→降順→既定）でトグルする。
 */
const DEFAULT_HEADER_SORT = SORT_OPTIONS[0].value;

/** 表頭の並べ替え印。押せない列（`key` が空）は常に印なし */
export function sortMark(sort: string, key: string): 'asc' | 'desc' | null {
  if (!key) return null;
  const [by, dir] = sort.split(':');
  if (by !== key) return null;
  return dir === 'desc' ? 'desc' : 'asc';
}

/** 表頭を押したときの次の `sort` 値。同じ列なら 昇順→降順→既定 の3段で回す */
export function nextHeaderSort(sort: string, key: string): string {
  const [by, dir] = sort.split(':');
  if (by !== key) return `${key}:asc`;
  if (dir === 'asc') return `${key}:desc`;
  return DEFAULT_HEADER_SORT;
}

/**
 * ヘッダーが作る `sort` 値のうち、`SORT_OPTIONS`（プルダウンの5択）に無い列名。
 * これらの列見出し文言は `ProjectRowsHeader` の表示と揃える——ここだけ別の
 * 言い方にすると、プルダウン側とヘッダー側で同じ列が違う名前で出る。
 */
const SORT_COLUMN_LABELS: Record<string, string> = {
  name: '案件名',
  stage: 'ステージ',
  event_start: '実施日',
  estimate_amount: '見積金額',
  next_task_due: '次のタスク',
  last_move: '最後の動き',
};

/**
 * いまの `sort` 値をプルダウン・スマホの札に出す文言にする。
 *
 * ⚠️ **`SORT_OPTIONS` に無い値（ヘッダークリックが作った `name:asc` 等）を
 * 「おすすめ順」に読み替えないこと。** ヘッダーとプルダウンは同じ `sort` state を
 * 共有しているので、ここで読み替えると「ヘッダーで並べ替えたのに、プルダウンの
 * 表示だけがおすすめ順のまま」という食い違いになる（レビュー指摘）。
 * `SORT_OPTIONS` に無い値は「列名＋昇順/降順」で組み立てて出す。
 */
export function sortLabel(sort: string): string {
  const preset = SORT_OPTIONS.find((s) => s.value === sort);
  if (preset) return preset.label;
  const [by, dir] = sort.split(':');
  const col = SORT_COLUMN_LABELS[by];
  if (!col) return SORT_OPTIONS[0].label;
  return `${col}が${dir === 'desc' ? '降順' : '昇順'}`;
}

/**
 * デスクトップの `<Select>`（プルダウン）に出す選択肢。`SORT_OPTIONS`（5つの
 * プリセット）に加え、いまの `sort` がそこに無ければ（＝ヘッダークリックで
 * 作った値なら）その場で1件足す。**足さないと `<Select value={sort}>` に一致する
 * `<SelectItem>` が無く、選択中の表示が空欄になる**（レビュー指摘）。
 */
export function sortChoices(sort: string): { value: string; label: string }[] {
  if (SORT_OPTIONS.some((s) => s.value === sort)) return SORT_OPTIONS;
  return [...SORT_OPTIONS, { value: sort, label: sortLabel(sort) }];
}

export interface FilterBarProps {
  search: string;
  onSearch: (v: string) => void;
  sort: string;
  onSort: (v: string) => void;
  period: PeriodValue;
  onPeriod: (v: PeriodValue) => void;
  /** いまの日付。プルダウンに出す年の幅を決める（テストで固定できるように渡す） */
  now: Date;
  aiOnly: boolean;
  onAiOnly: (v: boolean) => void;
  aiUnreviewedOnly: boolean;
  onAiUnreviewedOnly: (v: boolean) => void;
  /**
   * 「要整理」ビュー（docs/core-redesign-plan.md §3-2）。押すと
   * `?health=stalled`（停滞 = 次の一手が無いままステージ別しきい値超過）だけを
   * 取り、行に4つの手（次の一手/スヌーズ/見送り/失注）が出る。
   * PC とスマホで**同じ props**（写すと片方だけ絞り込みが増える）。
   */
  tidyOnly: boolean;
  onTidyOnly: (v: boolean) => void;
  /** 「用語」の説明を開いているか */
  termOpen: boolean;
  onTermOpen: (v: boolean) => void;
}

export function FilterBar(p: FilterBarProps) {
  const off = p.period.mode === 'all';
  // 年（と全件）は対象のプルダウンを出すが、◀▶ の意味が変わる
  const opts = options(p.period, p.now);

  return (
    <div className="rounded-card flex flex-col gap-2 border border-border bg-card px-3 py-2.5">
      {/* ── 1段目（40px 固定）─────────────────────────────── */}
      <div className="flex h-10 items-stretch gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="案件名・GLS番号・お客様名で探す"
            value={p.search}
            onChange={(e) => p.onSearch(e.target.value)}
            className="h-10 pl-9"
            aria-label="案件を探す"
          />
        </div>

        {/*
          期間の単位。**各66pxの等幅**。
          **罫線は枠ではなくボタン自身に置く。** 枠に置くと中のボタンが
          40 − 1 − 1 = 38px になり、寸法表のボタンの段（32/36/40/44/48）から外れます
          （`verify-ui` の「ボタンの高さが段のみ」で実測して直しました）。
        */}
        <div className="inline-flex shrink-0" role="group" aria-label="期間の単位">
          {PERIOD_MODES.map(({ mode, label: text }, i) => (
            <button
              key={mode}
              type="button"
              onClick={() => p.onPeriod(switchMode(p.period, mode))}
              aria-pressed={p.period.mode === mode}
              className={`text-sub h-10 ${SEGMENT_W} shrink-0 border border-border ${
                i > 0 ? '-ml-px' : 'rounded-l-control'
              } ${i === PERIOD_MODES.length - 1 ? 'rounded-r-control' : ''} ${
                p.period.mode === mode ? 'bg-primary-surface font-bold text-primary' : 'bg-card text-muted-foreground hover:bg-muted'
              }`}
            >
              {text}
            </button>
          ))}
        </div>

        {/*
          対象を選ぶ枠（236px 固定）。**「全件」でも消さない** —
          消すと右側が詰まって位置が動く（上の説明）
        */}
        <div
          className={`inline-flex ${TARGET_W} shrink-0 ${off ? 'pointer-events-none opacity-35' : ''}`}
          aria-hidden={off}
        >
          <button
            type="button"
            onClick={() => p.onPeriod(step(p.period, -1))}
            aria-label="1つ前の期間"
            className="h-10 w-8 shrink-0 rounded-l-control border border-border bg-card text-muted-foreground hover:bg-muted"
          >
            <ChevronLeft className="mx-auto h-4 w-4" aria-hidden="true" />
          </button>
          <Select
            value={toValue(p.period)}
            onValueChange={(x) => p.onPeriod(fromValue(p.period, x))}
            disabled={off}
          >
            <SelectTrigger
              className="-mx-px h-10 min-w-0 flex-1 justify-center rounded-none border-x-0 text-center"
              aria-label="期間の対象"
            >
              {/* 中身は中央寄せ＋省略。枠の幅は変えない */}
              <span className="truncate">{label(p.period)}</span>
            </SelectTrigger>
            <SelectContent>
              {opts.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <button
            type="button"
            onClick={() => p.onPeriod(step(p.period, 1))}
            aria-label="1つ後の期間"
            className="h-10 w-8 shrink-0 rounded-r-control border border-border bg-card text-muted-foreground hover:bg-muted"
          >
            <ChevronRight className="mx-auto h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* ── 2段目（36px 固定）─────────────────────────────── */}
      <div className="flex h-9 items-stretch gap-2">
        <Select value={p.sort} onValueChange={p.onSort}>
          <SelectTrigger className={`${SORT_W} shrink-0`} aria-label="並び順"><SelectValue /></SelectTrigger>
          <SelectContent>
            {sortChoices(p.sort).map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>

        {/* 「要整理」= 停滞している案件だけ。行に4つの手（次の一手/スヌーズ/見送り/失注）が出る */}
        <BarButton
          w={96}
          active={p.tidyOnly}
          onClick={() => p.onTidyOnly(!p.tidyOnly)}
          title="停滞している案件だけを出して、その場で片づける"
        >
          <Filter className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />要整理
        </BarButton>

        <BarButton
          w={118}
          active={p.aiOnly}
          onClick={() => p.onAiOnly(!p.aiOnly)}
          title="AI が作った案件だけを出す"
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />AI作成のみ
        </BarButton>

        {/*
          「AI・未確認」は AI 作成のみを押したときだけ意味を持つ。
          **枠は常に置いて、押せないときは薄くする**（消すと段が詰まって動く）
        */}
        <BarButton
          w={118}
          active={p.aiUnreviewedOnly && p.aiOnly}
          disabled={!p.aiOnly}
          onClick={() => p.onAiUnreviewedOnly(!p.aiUnreviewedOnly)}
        >
          {p.aiUnreviewedOnly ? 'AI・未確認' : '確認済みも'}
        </BarButton>

        <BarButton w={86} active={p.termOpen} onClick={() => p.onTermOpen(!p.termOpen)} title="ネタ・ヨミ・GLS などの用語">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />用語
        </BarButton>

        <span className="flex-1" />

        {/* 右端に現在の期間。**押せるものではない**ので枠を持たせない */}
        <span className="text-sub-sm flex items-center truncate text-muted-foreground">
          {p.search
            ? '探しているあいだは全期間から当てます'
            : off ? '期間で絞っていません' : label(p.period)}
        </span>
      </div>
    </div>
  );
}

/** 2段目の押しボタン。**幅を固定する**（中身の字数で段が揺れないように） */
function BarButton({
  w, active, disabled, onClick, title, children,
}: {
  w: number;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      aria-pressed={active}
      style={{ width: w }}
      className={`text-sub inline-flex shrink-0 items-center justify-center gap-1.5 rounded-control border px-2 ${
        disabled
          // **`fg-disabled` は使わない**（白地で 2.61:1 しかなく `verify-ui` の
          // 「薄すぎる文字」で落ちる）。押せないことは `opacity` が示す
          ? 'pointer-events-none border-border bg-card text-muted-foreground opacity-35'
          : active
            ? 'border-primary-border-strong bg-primary-surface font-bold text-primary'
            : 'border-border bg-card text-muted-foreground hover:bg-muted'
      }`}
    >
      {children}
    </button>
  );
}

/** 「用語」を押したときに出る説明 */
export function TermHint({ onClose }: { onClose: () => void }) {
  return (
    <div className="rounded-note border border-primary-border bg-primary-surface-weak px-3.5 py-3 text-note text-muted-foreground">
      <p><span className="font-bold text-foreground">ネタ</span> … 最初の見込み。まだ提案していない「案件のタネ」。3つ目の見え方「ネタ」で見ます（「すべて」「進行中」どちらにも出ません）。</p>
      <p><span className="font-bold text-foreground">ヨミ</span> … GLS 発番前の見込み案件ぜんぶ（ネタ → 提案 → 口頭決定）。受注の確度を読む段階。</p>
      <p><span className="font-bold text-foreground">GLS 番号</span> … 受注が固まった案件に振る正式な番号（GLS-A… / GLS-B…）。案件作成では発番しません。</p>
      <p><span className="font-bold text-foreground">おすすめ順</span> … 停滞している案件が先。その中は期限（次のタスク）が近い順。</p>
      <p><span className="font-bold text-foreground">期限超過</span> … 次の一手（次回アクション・タスク）の期日が過ぎている。最優先で浮上します。</p>
      <p><span className="font-bold text-foreground">停滞</span> … 次の一手が無いまま、ステージごとの日数（ネタ30日・仮押さえ/見積提案14日・口頭決定7日）を超えて動いていない。「要整理」で片づけます。</p>
      <p><span className="font-bold text-foreground">スヌーズ</span> … 再開日を決めて意図して寝かせること。期日が来たら自動で普通の判定に戻ります（無期限には寝かせられません）。</p>
      <p><span className="font-bold text-foreground">すべて</span> … ネタを除く全ステージ。完了・失注も含みます。</p>
      <p><span className="font-bold text-foreground">進行中</span> … 仮押さえ〜受注済の4ステージ（完了・失注・ネタを含みません）。既定はこちらです。</p>
      <p><span className="font-bold text-foreground">終了</span> … 完了 と 失注。「終了」または「すべて」を選んだときだけ出ます。</p>
      <Button variant="outline" size="sm" className="mt-2" onClick={onClose}>閉じる</Button>
    </div>
  );
}
