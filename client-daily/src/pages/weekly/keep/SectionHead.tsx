/**
 * 隔週キープの数字 — 節の見出し（アイコン ＋ 題 ＋ 但し書き ＋ 右の補助）
 *
 * `WeeklyDetailPage` の `Section` と同じ役目だが、資料の節（数値報告・ヨミ表・稼働
 * カレンダー…）は**右端に凡例や件数**を置くので、その差し込み口を持つ。
 */
import type { ReactNode } from 'react';

export function SectionHead({
  icon: Icon, title, note, right,
}: {
  icon: React.ElementType;
  title: string;
  /** 数字の出どころ・数え方。PC だけ出す（スマホは題だけ） */
  note?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 pt-1">
      <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <h3 className="text-cardtitle whitespace-nowrap">{title}</h3>
      {note && <span className="text-sub-sm hidden min-w-0 text-muted-foreground lg:inline">— {note}</span>}
      {right && <span className="ml-auto flex shrink-0 items-center gap-3">{right}</span>}
    </div>
  );
}

/** 凡例の1つ（色の四角 ＋ 名前）。グラフとカレンダーで同じ形にする */
export function LegendItem({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="text-sub-sm inline-flex items-center gap-1.5 whitespace-nowrap text-foreground">
      <span className={`inline-block h-2.5 w-2.5 rounded-badge-xs ${swatch}`} aria-hidden="true" />
      {label}
    </span>
  );
}
