/**
 * 財務の台帳で共通の小さな部品（③ 売上 ／ ④ 仕入 ／ ⑤ 販管費） (v4)
 *
 * 3画面に同じものを書くと、必ずどれか1つだけ直されて食い違います
 * （旧実装は「計上月で絞り込み」の解除ボタンが売上だけ `h-8`、
 * 仕入と販管費が既定の高さで、並べると段がずれていました）。
 */
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { DateRange } from '@gmo-onair/shared/src/client/ui/dateRange';
import type { LedgerUrlPeriodState } from './ledgerUrlPeriod';

/** 探す欄。**入力したそばから絞る**（押して初めて効く形にすると押し忘れる） */
export function LedgerSearch({
  value, onChange, placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-[360px]">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-9 pr-9"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="検索を消す"
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-badge text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** 計上月。**空 = 全月**（「解除」を押すとそうなる） */
export function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sub text-muted-foreground" htmlFor="ledger-month">計上月</label>
      <Input
        id="ledger-month"
        type="month"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-[9.5rem]"
      />
      {value ? (
        <Button variant="ghost" onClick={() => onChange('')}>解除</Button>
      ) : (
        <span className="text-sub text-muted-foreground">全月</span>
      )}
    </div>
  );
}

/**
 * 財務ダッシュボードから引き継いだ絞り込みの案内（③④⑤ 共通）。
 *
 * **単月で来たときは計上月の欄に入っている**ので、ここでは「入れました」とだけ
 * 言う（欄と帯で二重に絞っているように見せない）。1つの月に収まらない期間は
 * 月の欄に入れられないので、この帯が唯一の表示になる — だから**外す手段（解除）は
 * ここに置く**。利用者が月を触ると引き継ぎは終わり（`handoff` が null）帯も消える。
 */
export function LedgerPeriodNotice({ period }: { period: LedgerUrlPeriodState }) {
  const { handoff, range } = period;
  if (!handoff) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-card p-3 text-sub text-secondary-foreground lg:px-4">
      <span className="flex flex-wrap items-center gap-1">
        {/* 期間の文字列連結はしない（開始・区切り・終了を分ける `DateRange` を使う） */}
        {handoff.label ? <span>{handoff.label}</span> : range ? <DateRange start={range.from} end={range.to} /> : null}
        <span>
          {handoff.kind === 'all' ? 'で表示中' : 'で絞り込み中'}
          {handoff.kind === 'month' ? '（財務ダッシュボードから・計上月の欄に入れました）' : '（財務ダッシュボードから）'}
        </span>
      </span>
      {range && <Button variant="ghost" onClick={period.clearPeriod}>期間を解除</Button>}
    </div>
  );
}

/**
 * 一覧の下の「全 N 件 ・ 合計」と注意書き。
 *
 * **合計は絞り込み全体**の金額です（表示中のページではありません）。
 * ページの合計を出すと、めくるたびに数字が変わって読み間違えます。
 */
export function LedgerFooter({
  count, total, note,
}: {
  count: number;
  total: number;
  note: string;
}) {
  return (
    <div className="rounded-card border border-border bg-card p-3 lg:px-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sub text-secondary-foreground">
          全 <span className="font-number font-bold">{count.toLocaleString()}</span> 件
        </span>
        <span className="flex items-baseline gap-2">
          <span className="text-sub text-muted-foreground">合計（税抜）</span>
          <Money value={total} className="text-cardtitle font-bold" />
        </span>
      </div>
      <p className="text-note mt-2 text-muted-foreground">{note}</p>
    </div>
  );
}
