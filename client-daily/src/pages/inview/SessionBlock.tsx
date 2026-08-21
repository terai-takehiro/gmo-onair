/**
 * 内覧会 来場予約 — 回1つぶんの見出し + 名簿 (`InviewDayPage.tsx` から分離)。
 *
 * ファイルを分けたのは `InviewDayPage.tsx` が 400 行を超えたため
 * （`CLAUDE.md` の「1ファイル400行を上限にする」）。中身は移しただけで変えていない。
 */
import { CalendarDays, CheckCircle2 } from 'lucide-react';
import { Row, RowMain, RowTitle, RowSub, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import type { InviewRegistration } from '@/lib/types';
import { AttendeeCard } from './AttendeeCard';
import { CompanySummary } from './CompanySummary';
import { checkedInHeadOf, headOf, matchedFields } from './logic';

/** 回1つぶん (見出し + 名簿)。同じ日に複数の回が立つ */
export function SessionBlock({
  label, time, audience, items, visible, showSummary, canEdit, terms, onEdit, isMobile,
}: {
  label: string;
  time: string | null;
  audience: string | null;
  items: InviewRegistration[];
  visible: InviewRegistration[];
  showSummary: boolean;
  canEdit: boolean;
  /** 検索中なら検索語。検索していないときは null */
  terms: string[] | null;
  onEdit: (r: InviewRegistration) => void;
  isMobile: boolean;
}) {
  const sHead = items.reduce((a, r) => a + headOf(r), 0);
  const sChecked = items.reduce((a, r) => a + checkedInHeadOf(r), 0);
  return (
    <div className="flex flex-col gap-2">
      {isMobile ? (
        <SessionHeaderCard
          label={label}
          time={time}
          audience={audience}
          groupCount={items.length}
          head={sHead}
          checkedIn={sChecked}
        />
      ) : (
        <Row density="table" className="border-b border-border px-0">
          <RowMain>
            <RowTitle>{time ? <span className="font-number">{time}</span> : '時間未定'}</RowTitle>
            {/* 回のフル文字列 (読み取り前の生ラベル)。時間だけの回では出さない */}
            {label && label !== time && (
              <RowSub className="flex items-center gap-1">
                <CalendarDays className="h-3 w-3 shrink-0" aria-hidden="true" />{label}
              </RowSub>
            )}
          </RowMain>
          {/*
            対象は「イベント主催者向け」のように長いので**バッジにしない**。
            `TableBadge` は折り返さないので、列の幅 (96px) をはみ出して隣に重なる。
          */}
          <RowSlot w={160}>
            <span className="text-sub-sm truncate text-muted-foreground">{audience || '—'}</span>
          </RowSlot>
          <RowSlot w={72} align="right">
            <span className="font-number text-sub">{items.length}組</span>
          </RowSlot>
          <RowSlot w={72} align="right">
            <span className="font-number text-sub">{sHead}名</span>
          </RowSlot>
          <RowSlot w={96} align="right">
            <span className={`font-number text-sub ${sChecked > 0 ? 'text-success' : 'text-muted-foreground'}`}>
              <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
              {sChecked} / {sHead}名
            </span>
          </RowSlot>
        </Row>
      )}

      {showSummary && <CompanySummary items={items} />}

      <div className="flex flex-col gap-2">
        {visible.map((r) => (
          <AttendeeCard
            key={r.id}
            r={r}
            canEdit={canEdit}
            onEdit={() => onEdit(r)}
            matchedIn={terms ? matchedFields(r, terms) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 回の見出し (スマホ版)。**PC の行を縮めるのではなくカードとして組み直した**
 * （方針「カレンダー①予定」「案件一覧」等と同じ）。時間を大きく、対象・組数・
 * 受付の進み具合を1枚にまとめ、進捗バーで「あとどれくらいか」を目でも見せる。
 */
function SessionHeaderCard({
  label, time, audience, groupCount, head, checkedIn,
}: {
  label: string;
  time: string | null;
  audience: string | null;
  groupCount: number;
  head: number;
  checkedIn: number;
}) {
  const pct = head > 0 ? Math.round((checkedIn / head) * 100) : 0;
  return (
    <div className="rounded-card flex flex-col gap-2 border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-cardtitle font-number">{time ?? '時間未定'}</p>
          {/* 回のフル文字列 (読み取り前の生ラベル)。時間だけの回では出さない */}
          {label && label !== time && (
            <p className="text-sub-sm mt-0.5 flex items-center gap-1 text-muted-foreground">
              <CalendarDays className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{label}</span>
            </p>
          )}
        </div>
        {/* 対象は長いので**バッジにしない**（`TableBadge` は折り返さない） */}
        {audience && (
          <span className="text-sub-sm max-w-[45%] shrink-0 truncate text-right text-muted-foreground">
            {audience}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="font-number text-sub text-muted-foreground">{groupCount}組</span>
        <span className="font-number text-sub text-muted-foreground">{head}名</span>
        <span className={`font-number text-sub ml-auto inline-flex items-center gap-1 ${checkedIn > 0 ? 'text-success' : 'text-muted-foreground'}`}>
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          {checkedIn} / {head}名
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-success transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
