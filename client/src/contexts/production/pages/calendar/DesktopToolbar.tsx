/**
 * ① 予定（PC）/ macOS のカレンダーアプリ風のツールバー（承認済みモック）
 *
 * 旧ツールバー（`CalToolbar.tsx`）は「見え方チップ・前後・出すもの・絞り込み」を
 * 1本の帯にまとめていたが、承認済みモックは **今日／前後／期間の見出し／
 * 月・週・一覧の切替／予定を入れる** だけの1段（56px）。
 *
 * **「出すもの」（レイヤー）と「見出しの『予定』」はここに無い。** 前者は
 * 左メニューへ常設のチェックボックスとして移した（`layerPrefs.ts` 参照）ので、
 * 帯の中で毎回選び直す必要が無くなった。後者はいまいる画面の名前を
 * 上辺バーのパンくず（「カレンダー ／ 予定」）が既に言っているので、
 * 本文でもう一度「予定」と書くと二重になる。
 *
 * **`CalToolbar.tsx` はそのまま残す** — 旧スタジオ・パートナー・マイの3画面は
 * 「そのほか（作り直し前）」の情報設計のまま据え置いており、見た目まで
 * 同じ回で動かすと据え置きの意味が無くなる。ここは① 予定専用の新しい部品。
 *
 * **「部屋で絞る」「人で絞る」はモックの1段目には無いが、消していない。**
 * 部屋の埋まり方だけを見たい・パートナーの人ごとの空きを見たいという
 * 既存の使い方（旧 `CalToolbar` にあった機能）を静かに削らないよう、
 * 2段目の細い帯として残す（絞っていないときは段ごと出ない）。
 */
import { ChevronLeft, ChevronRight, DoorOpen, Plus, UserSearch, X } from 'lucide-react';
import { cn } from '@gmo-onair/shared/src/client/utils';

export type DesktopView = 'month' | 'week' | 'list';

const VIEW_LABEL: Record<DesktopView, string> = { month: '月', week: '週', list: '一覧' };
const VIEWS: DesktopView[] = ['month', 'week', 'list'];

/** 「部屋で絞る」などの細い帯のボタン */
const ctl = 'min-h-tap lg:min-h-[28px] inline-flex items-center gap-1.5 rounded-note border px-2.5 text-note font-bold whitespace-nowrap';

export function DesktopToolbar({
  view, onView, title, onPrev, onNext, onToday, onAdd, canAdd,
  roomCount, userCount, onPickRooms, onPickUsers, onClearFilters,
}: {
  view: DesktopView;
  onView: (v: DesktopView) => void;
  title: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onAdd: () => void;
  /** 権限が無い人には出さない（押せば 403 になるボタンを並べない） */
  canAdd: boolean;
  roomCount?: number;
  userCount?: number;
  onPickRooms?: () => void;
  onPickUsers?: () => void;
  onClearFilters?: () => void;
}) {
  const filtered = (roomCount ?? 0) > 0 || (userCount ?? 0) > 0;

  return (
    <div className="flex shrink-0 flex-col border-b border-border">
      <div className="flex h-14 shrink-0 items-center gap-3.5 px-5">
        <button
          type="button"
          onClick={onToday}
          className="h-[30px] rounded-control-md border border-border px-3.5 text-note font-bold text-secondary-foreground"
        >
          今日
        </button>

        <span className="flex overflow-hidden rounded-control-md border border-border">
          <button
            type="button"
            onClick={onPrev}
            aria-label="前へ"
            className="flex h-[30px] w-[30px] items-center justify-center border-r border-border text-secondary-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onNext}
            aria-label="次へ"
            className="flex h-[30px] w-[30px] items-center justify-center text-secondary-foreground"
          >
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </span>

        <h1 className="text-h2 m-0">{title}</h1>

        <span className="flex-1" />

        <span className="flex items-center gap-0.5 rounded-control-md border border-border bg-surface-subtle p-0.5">
          {VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onView(v)}
              aria-pressed={view === v}
              className={cn(
                'h-[26px] rounded-control px-3.5 text-note font-bold',
                view === v ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground',
              )}
            >
              {VIEW_LABEL[v]}
            </button>
          ))}
        </span>

        {canAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="flex h-8 items-center gap-1.5 rounded-control-md bg-primary px-3.5 text-note font-bold text-primary-foreground"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />予定を入れる
          </button>
        )}
      </div>

      {(onPickRooms || onPickUsers) && (
        <div className="flex items-center gap-1.5 px-5 py-1.5">
          {onPickUsers && (
            <button
              type="button" onClick={onPickUsers}
              className={cn(ctl, (userCount ?? 0) > 0 ? 'border-primary bg-primary-surface text-primary' : 'border-border bg-card text-secondary-foreground')}
            >
              <UserSearch className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {(userCount ?? 0) > 0 ? `人で絞る（${userCount}）` : '人で絞る'}
            </button>
          )}
          {onPickRooms && (
            <button
              type="button" onClick={onPickRooms}
              className={cn(ctl, (roomCount ?? 0) > 0 ? 'border-primary bg-primary-surface text-primary' : 'border-border bg-card text-secondary-foreground')}
            >
              <DoorOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {(roomCount ?? 0) > 0 ? `部屋で絞る（${roomCount}）` : '部屋で絞る'}
            </button>
          )}
          {onClearFilters && filtered && (
            <button type="button" onClick={onClearFilters} className={cn(ctl, 'border-border bg-card text-muted-foreground')}>
              <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />絞りを外す
            </button>
          )}
        </div>
      )}
    </div>
  );
}
