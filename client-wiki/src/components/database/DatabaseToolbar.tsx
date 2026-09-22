/**
 * ビューのタブと操作（設計 §6-⑩）
 *
 * 本文（説明）の下に置く1段目＝ビューのタブ、2段目＝絞り込み・並べ替え・書き出しと
 * 「行を追加」。**ナビの列は増やしません**（ツリーは共通の左メニューの中）。
 *
 * ⚠️ **スマホで隠すのは「並べ替え・項目の定義・ビューの追加」だけ**（設計 §6-⑩）。
 *    行の追加と値の編集はスマホでもできます。隠した操作の案内は
 *    `PcOnlyNote` で画面の中に出します（`WIKI_PC_ONLY` には入れない）。
 */
import { useState } from 'react';
import { Columns3, Download, Filter, ListFilter, Plus, Settings2, Table2, CalendarDays } from 'lucide-react';
import { Button } from '@gmo-onair/shared/src/client/ui/button';
import type { WikiView, WikiViewType } from '@gmo-onair/shared/src/wiki/types';
import { cn } from '@/lib/utils';

const VIEW_ICON: Record<WikiViewType, typeof Table2> = {
  table: Table2,
  board: Columns3,
  calendar: CalendarDays,
};

export interface DatabaseToolbarProps {
  views: WikiView[];
  view: WikiView;
  canEdit: boolean;
  /** 絞り込み・並べ替えの数（押す前に効いているか分かるように） */
  onSelectView: (id: string) => void;
  onOpenRules: () => void;
  onOpenViewSheet: (view: WikiView | null) => void;
  onExportCsv: () => void;
  onAddRow: (title: string) => void;
  adding: boolean;
  exporting: boolean;
}

export default function DatabaseToolbar({
  views, view, canEdit, onSelectView, onOpenRules, onOpenViewSheet, onExportCsv, onAddRow, adding, exporting,
}: DatabaseToolbarProps) {
  const [title, setTitle] = useState('');
  const ruleCount = (view.filters?.length ?? 0) + (view.sorts?.length ?? 0);

  const submit = () => {
    const t = title.trim();
    if (!t || adding) return;
    onAddRow(t);
    setTitle('');
  };

  return (
    <div className="flex flex-col gap-2.5">
      {/* 1段目: ビューのタブ */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border">
        {views.map((v) => {
          const Icon = VIEW_ICON[v.type];
          const on = v.id === view.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onSelectView(v.id)}
              aria-pressed={on}
              className={cn(
                'flex min-h-tap shrink-0 items-center gap-1.5 border-b-2 px-2.5 text-sub lg:min-h-0 lg:h-9',
                on
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {v.name}
            </button>
          );
        })}

        {canEdit && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-1 hidden shrink-0 lg:inline-flex"
            onClick={() => onOpenViewSheet(null)}
          >
            <Plus className="mr-1 h-4 w-4" aria-hidden />
            ビューを追加
          </Button>
        )}
      </div>

      {/* 2段目: 絞り込み・並べ替え・書き出し・行の追加 */}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="hidden lg:inline-flex" onClick={onOpenRules}>
          <Filter className="mr-1.5 h-4 w-4" aria-hidden />
          絞り込みと並べ替え
          {ruleCount > 0 && <span className="ml-1 tabular-nums text-primary">{ruleCount}</span>}
        </Button>

        {canEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="hidden lg:inline-flex"
            onClick={() => onOpenViewSheet(view)}
          >
            <Settings2 className="mr-1.5 h-4 w-4" aria-hidden />
            ビューの設定
          </Button>
        )}

        <Button type="button" variant="outline" size="sm" disabled={exporting} onClick={onExportCsv}>
          <Download className="mr-1.5 h-4 w-4" aria-hidden />
          CSV で書き出す
        </Button>

        {canEdit && (
          <form
            className="flex w-full min-w-0 items-center gap-1.5 sm:ml-auto sm:w-auto"
            onSubmit={(e) => { e.preventDefault(); submit(); }}
          >
            <input
              className="min-h-tap w-full min-w-0 rounded-control border border-border bg-card px-2 text-sub text-foreground focus:border-primary focus:outline-none sm:w-[200px] lg:h-9 lg:min-h-0"
              placeholder="行のタイトルを入力"
              aria-label="行のタイトル"
              value={title}
              disabled={adding}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Button type="submit" size="sm" disabled={adding || !title.trim()}>
              <Plus className="mr-1 h-4 w-4" aria-hidden />
              行を追加
            </Button>
          </form>
        )}
      </div>

      {/* 何で絞り込んでいるかを、開いた人全員に見えるようにする（ビューの設定は共有） */}
      {ruleCount > 0 && (
        <p className="flex items-center gap-1.5 text-sub-sm text-muted-foreground">
          <ListFilter className="h-3.5 w-3.5 shrink-0" aria-hidden />
          絞り込み {view.filters?.length ?? 0} 件・並べ替え {view.sorts?.length ?? 0} 件が効いています（全員に同じ表示）
        </p>
      )}
    </div>
  );
}
