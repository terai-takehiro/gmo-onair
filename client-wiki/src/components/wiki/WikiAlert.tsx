/**
 * 注意書き（`> [!NOTE]` `[!TIP]` `[!WARNING]` `[!CAUTION]`）
 *
 * GitHub の alerts と同じ書き方なので、本文はただの引用のまま。
 * 色を付けて描くのは画面の仕事で、`body_md` は書き換えない
 * （docs/design/v4/wiki.md §4-2 の約束1）。
 *
 * 作るのは設計書の表にある4種だけ。表に無い種類（`[!IMPORTANT]` など）は
 * 引用のまま描く — 描ける種類を勝手に増やすと、書き出した `.md` を
 * GitHub で開いたときの見え方とずれる。
 */
import { Info, Lightbulb, TriangleAlert, OctagonAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export const WIKI_ALERT_KINDS = ['NOTE', 'TIP', 'WARNING', 'CAUTION'] as const;
export type WikiAlertKind = (typeof WIKI_ALERT_KINDS)[number];

/** 本文の先頭が `[!NOTE]` などで始まっていれば、その種類を返す */
export function parseAlertKind(firstLine: string): WikiAlertKind | null {
  const m = firstLine.trim().match(/^\[!([A-Z]+)\]\s*/);
  if (!m) return null;
  const hit = WIKI_ALERT_KINDS.find((k) => k === m[1]);
  return hit ?? null;
}

const STYLE: Record<WikiAlertKind, { label: string; icon: typeof Info; box: string; mark: string }> = {
  // 文字は本文と同じ色にする。淡い面に `-foreground` を載せると白地に白になる
  // （`check-contrast-tokens` が止める組み合わせ）ので、色はアイコンと枠だけに使う。
  NOTE:    { label: '補足',   icon: Info,          box: 'border-info-border bg-info-surface',               mark: 'text-info' },
  TIP:     { label: 'ヒント', icon: Lightbulb,     box: 'border-success-border bg-success-surface',         mark: 'text-success' },
  WARNING: { label: '注意',   icon: TriangleAlert, box: 'border-warning-border bg-warning-surface',         mark: 'text-warning' },
  CAUTION: { label: '警告',   icon: OctagonAlert,  box: 'border-destructive-border bg-destructive-surface', mark: 'text-destructive' },
};

export default function WikiAlert({
  kind,
  children,
  className,
}: {
  kind: WikiAlertKind;
  children: ReactNode;
  className?: string;
}) {
  const s = STYLE[kind];
  const Icon = s.icon;
  return (
    <div className={cn('my-4 flex gap-3 rounded-note border px-3.5 py-3', s.box, className)}>
      <Icon className={cn('mt-0.5 h-[18px] w-[18px] shrink-0', s.mark)} aria-hidden />
      <div className="min-w-0 flex-1">
        <div className={cn('mb-1 text-badge', s.mark)}>{s.label}</div>
        <div className="wiki-alert-body">{children}</div>
      </div>
    </div>
  );
}
