/**
 * スマホの絞り込み — **1行に畳んでシートで開く**（M8）
 *
 * ── なぜ共通部品にしたか ────────────────────────────────────
 *
 * M6 で案件一覧に作った畳み方（`client/…/projectList/MobileFilterBar.tsx`）が
 * 効いた（最初のカードに着くまで **470px → 258px**）ので、同じ形の一覧
 * ——受付・機材台帳・内覧会——にも広げます。
 *
 * ただし**3か所に写すと必ずずれます**。畳んだ絞り込みでいちばん危ないのは
 * 「効いている数」の出し方で、写した先で数え漏らすと
 * **絞り込んでいることを忘れたまま「件数が少ない」と読む**ことになります。
 * 数え方そのものは画面ごとに違う（何が既定かが違う）ので**呼ぶ側が渡し**、
 * **出し方だけをここで固定**します。
 *
 * ── 形の決めごと（M6 で決めて、実測で効いたもの）──────────────
 *
 * - **検索は畳まない。** 探すのは絞り込みではなく**目的そのもの**で、
 *   畳むと「探す」だけのために2タップかかります
 * - **効いている数をボタンに出す。** 0 のときは出しません
 *   （0 を出すと押す理由があるように見える）
 * - **シートの下端に「すべて解除」と「閉じる」。** 中身が長いときでも
 *   親指の届く位置に残ります（`Sheet` が下端に固定する）
 * - **消すボタン（×）を検索欄に出す。** スマホのキーボードで1文字ずつ
 *   消すのは苦痛です
 *
 * ── 置き場所が `client-v4/` な理由 ──────────────────────────
 *
 * `shared/src/client/` に置くと**凍結4アプリの CSS が増えます**
 * （各アプリの Tailwind が `shared/src/client/**` を走査するため）。
 * v4 対象3アプリだけが `client-v4/**` を走査します。
 */
import * as React from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '../client/ui/button';
import { Input } from '../client/ui/input';
import { cn } from '../client/utils';
import { Sheet } from './sheet';

interface MobileFilterSearch {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  /** 読み上げ用の名前。省略すると `placeholder` を使う */
  label?: string;
}

export interface MobileFilterBarProps {
  /**
   * 検索欄。**外に出したまま畳みません。**
   * 検索を持たない一覧では省略できます（そのときはボタンだけが並びます）。
   */
  search?: MobileFilterSearch;
  /**
   * **既定から動いている絞り込みの数。**
   * 「既定と同じもの」は数えないこと — 常に数が付くと意味が消えます。
   */
  activeCount: number;
  /** 「すべて解除」。省略するとボタンを出しません */
  onClearAll?: () => void;
  /** シートの見出し。省略すると「絞り込み」 */
  title?: string;
  /** 見出しの下の1行 */
  sub?: string;
  /** 検索欄の下に出す注記（絞り込みの副作用を、その場に書くため） */
  note?: React.ReactNode;
  /** シートの中身。`<MobileFilterField>` を並べる */
  children: React.ReactNode;
}

/**
 * シートの中の1行。**見出しを上、操作を下**に置きます
 * （横に並べると 375px で操作が潰れる）。
 */
export function MobileFilterField({
  label, hint, children,
}: {
  label: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 border-b border-border-faint py-3.5 last:border-b-0">
      <span className="text-th text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-note text-muted-foreground">{hint}</span>}
    </div>
  );
}

/**
 * シートの中の段の切り替え（期間・並び順など）。
 * **`min-h-tap` と均等割りをここで固定**します — 呼ぶ側で書くと、
 * 画面ごとに高さの違う切り替えができます。
 */
export function MobileFilterSegments<K extends string>({
  items, value, onChange, label,
}: {
  items: Array<[K, string]>;
  value: K;
  onChange: (v: K) => void;
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="grid overflow-hidden rounded-control border border-border"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map(([k, text], i) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          aria-pressed={value === k}
          className={cn(
            'min-h-tap text-sub',
            i > 0 && 'border-l border-border',
            value === k ? 'bg-primary-surface font-bold text-primary' : 'text-muted-foreground',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function MobileFilterBar({
  search, activeCount, onClearAll, title = '絞り込み', sub, note, children,
}: MobileFilterBarProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <div className="flex items-center gap-2">
        {search && (
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              placeholder={search.placeholder}
              aria-label={search.label ?? search.placeholder}
              className="pl-9 pr-9"
            />
            {search.value && (
              <button
                type="button"
                onClick={() => search.onChange('')}
                aria-label="検索語を消去"
                className="v4-tap absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            'rounded-control min-h-tap text-sub flex items-center gap-1.5 border px-3',
            search ? 'shrink-0' : 'flex-1 justify-center',
            activeCount > 0
              ? 'border-primary-border-strong bg-primary-surface font-bold text-primary'
              : 'border-border bg-card text-muted-foreground',
          )}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          絞り込み
          {activeCount > 0 && (
            <span className="rounded-chip font-number text-badge bg-primary px-1.5 text-primary-foreground">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {note && <p className="text-note text-muted-foreground">{note}</p>}

      <Sheet
        open={open}
        onOpenChange={setOpen}
        title={title}
        sub={sub ?? '選ぶとすぐ絞り込まれます'}
        footer={
          <div className="flex gap-2">
            {onClearAll && activeCount > 0 && (
              <Button variant="outline" className="flex-1" onClick={onClearAll}>すべて解除</Button>
            )}
            <Button className="flex-1" onClick={() => setOpen(false)}>閉じる</Button>
          </div>
        }
      >
        {children}
      </Sheet>
    </>
  );
}
