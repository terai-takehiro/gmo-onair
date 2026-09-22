/**
 * 表・カードの1つの値（その場で直せる）
 *
 * **9つの型それぞれに入力の形がある**（設計 §4-4）。型が増えたときにここを
 * 直し忘れると、値は保存できるのに画面に出ない列ができます。
 *
 * ⚠️ **日本語入力は `useBufferedValue` を通す**（`client-wiki/src/lib/useBufferedValue.ts`）。
 *    打つたびに親へ返すと、変換の途中で描き直しが挟まって文字が巻き戻ります。
 *
 * ⚠️ 複数選択と ONAiR リンクだけは**シート**で直します。表の中に重ねて出すと、
 *    横スクロールする包みに切られて選択肢が見えなくなります。
 */
import { ExternalLink } from 'lucide-react';
import type { WikiItem, WikiPropValue } from '@gmo-onair/shared/src/wiki/types';
import { useBufferedValue } from '@/lib/useBufferedValue';
import { cn } from '@/lib/utils';
import { MultiSelectCell, OnairLinkCell } from './DatabaseCellSheets';
import { asStringValue } from './dbValues';

const CONTROL =
  'min-h-tap w-full rounded-control border border-border bg-card px-2 text-sub text-foreground'
  + ' focus:border-primary focus:outline-none lg:h-8 lg:min-h-0';

const READONLY = 'block truncate text-sub text-foreground';

export interface CellPerson {
  id: string;
  name: string;
}

export interface DatabaseCellProps {
  item: WikiItem;
  value: WikiPropValue | undefined;
  canEdit: boolean;
  /** 担当の選択肢（`person` の型で使う） */
  people?: CellPerson[];
  /** 値が決まったら呼ぶ。空にするときは `null` */
  onCommit: (value: WikiPropValue) => void;
  busy?: boolean;
}

/* ── 文字・URL ────────────────────────────────────────────── */

function TextCell({ item, value, canEdit, onCommit, busy }: DatabaseCellProps) {
  const text = asStringValue(value);
  const buf = useBufferedValue(text, (v) => onCommit(v === '' ? null : v));

  if (!canEdit) {
    return item.type === 'url' && text ? (
      <a className={cn(READONLY, 'text-primary underline')} href={text} target="_blank" rel="noreferrer">
        {text}
      </a>
    ) : (
      <span className={READONLY}>{text}</span>
    );
  }

  return (
    <span className="flex w-full items-center gap-1">
      <input
        className={CONTROL}
        value={buf.val}
        disabled={busy}
        aria-label={item.name}
        inputMode={item.type === 'url' ? 'url' : 'text'}
        onChange={(e) => buf.onChange(e.target.value)}
        onFocus={buf.onFocus}
        onBlur={buf.onBlur}
        onCompositionStart={buf.onCompositionStart}
        onCompositionEnd={(e) => buf.onCompositionEnd(e.currentTarget.value)}
      />
      {item.type === 'url' && text && (
        <a
          href={text}
          target="_blank"
          rel="noreferrer"
          aria-label={`${item.name}を開く`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      )}
    </span>
  );
}

/* ── 数値 ─────────────────────────────────────────────────── */

function NumberCell({ item, value, canEdit, onCommit, busy }: DatabaseCellProps) {
  const text = typeof value === 'number' ? String(value) : '';
  if (!canEdit) return <span className={cn(READONLY, 'text-right tabular-nums')}>{text}</span>;

  return (
    <input
      type="number"
      className={cn(CONTROL, 'text-right tabular-nums')}
      defaultValue={text}
      disabled={busy}
      aria-label={item.name}
      // 打つたびではなく**決めたとき**に送る（保存のたびに版が1つ増えるため）
      onBlur={(e) => {
        const raw = e.target.value.trim();
        if (raw === '') {
          if (text !== '') onCommit(null);
          return;
        }
        const n = Number(raw);
        if (Number.isFinite(n) && String(n) !== text) onCommit(n);
      }}
    />
  );
}

/* ── 日付 ─────────────────────────────────────────────────── */

function DateCell({ item, value, canEdit, onCommit, busy }: DatabaseCellProps) {
  const text = asStringValue(value);
  if (!canEdit) return <span className={READONLY}>{text.replace(/-/g, '/')}</span>;

  return (
    <input
      type="date"
      className={CONTROL}
      value={text}
      disabled={busy}
      aria-label={item.name}
      onChange={(e) => onCommit(e.target.value || null)}
    />
  );
}

/* ── チェック ─────────────────────────────────────────────── */

function CheckboxCell({ item, value, canEdit, onCommit, busy }: DatabaseCellProps) {
  return (
    <label className="flex min-h-tap items-center justify-center lg:min-h-0">
      <input
        type="checkbox"
        className="h-4 w-4 rounded-control border-border accent-primary"
        checked={value === true}
        disabled={busy || !canEdit}
        aria-label={item.name}
        onChange={(e) => onCommit(e.target.checked)}
      />
    </label>
  );
}

/* ── 選択・担当 ───────────────────────────────────────────── */

function ChoiceCell({ item, value, canEdit, people, onCommit, busy }: DatabaseCellProps) {
  const current = asStringValue(value);
  const choices = item.type === 'person'
    ? (people ?? []).map((p) => ({ value: p.id, label: p.name }))
    : (item.options ?? []).map((o) => ({ value: o.value, label: o.value }));
  const label = choices.find((c) => c.value === current)?.label ?? current;

  if (!canEdit) return <span className={READONLY}>{label}</span>;

  return (
    <select
      className={CONTROL}
      value={current}
      disabled={busy}
      aria-label={item.name}
      onChange={(e) => onCommit(e.target.value || null)}
    >
      <option value="">未設定</option>
      {/* いまの値が選択肢に無い（消された・退職した）ときも、値を落とさず出す */}
      {current && !choices.some((c) => c.value === current) && (
        <option value={current}>{current}</option>
      )}
      {choices.map((c) => (
        <option key={c.value} value={c.value}>{c.label}</option>
      ))}
    </select>
  );
}

/* ── 振り分け ─────────────────────────────────────────────── */

export default function DatabaseCell(props: DatabaseCellProps) {
  switch (props.item.type) {
    case 'number':
      return <NumberCell {...props} />;
    case 'date':
      return <DateCell {...props} />;
    case 'checkbox':
      return <CheckboxCell {...props} />;
    case 'select':
    case 'person':
      return <ChoiceCell {...props} />;
    case 'multi_select':
      return <MultiSelectCell {...props} />;
    case 'onair_link':
      return <OnairLinkCell {...props} />;
    default:
      return <TextCell {...props} />;
  }
}
