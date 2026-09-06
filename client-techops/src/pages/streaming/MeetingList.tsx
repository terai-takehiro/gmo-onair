/**
 * WEB会議の「一覧＋詳細」（配信設定の下段・impl doc 08 §5 / モック MeetingMobile.dc.html）。
 *
 * ⚠️ **なぜ作ったか**（監査 2026-08-22）
 * これまで会議は縦に積んだカードで、1枚に全部の入力欄が開いていた。会議は本番用・リハ用・
 * 登壇者用・関係者用と**3〜4本になるのが実態**（08 §5-1）なので、目的の1件に辿り着くのに
 * 画面を延々とスクロールすることになっていた。配信先（`EncoderList` ＋
 * `DestinationInspector`）が既に「一覧＋詳細」なので、**同じ作りに揃える**。
 *
 * ⚠️ スマホ（639px 以下）は一覧→詳細の**1画面ずつ**。ただし `<Dialog>` は使わない —
 *    `StreamingPage.tsx` の `useIsNarrow()` のコメントにあるとおり、`DialogOverlay` は
 *    `DialogContent` とは別要素で `sm:hidden` が効かず、**PC 幅で画面全体が暗転して
 *    何も操作できなくなった**実害がある。ここは素の CSS（`hidden sm:block`）で出し分け、
 *    そもそも Dialog を持ち込まない。
 *
 * ⚠️ WEB会議はスマホでも編集できること（08 §6）。現場で会議URLを受け取って貼るのは
 *    だいたいスマホなので、ここだけは「まとめて直すのは PC で」に逃がさない。
 */
import { AlertTriangle, Plus, Video } from 'lucide-react';
import { cn } from '@/lib/utils';
import { genId } from '@/lib/stableIds';
import type { Meeting } from '@/lib/deviceSettingsApi';
import { meetingIssues, toolBadgeClass, toolLabel } from './meetingFields';
import MeetingInspector from './MeetingCard';

/** 会議を1本足す。既定は Zoom（いちばん使う）・OA1・UltraStudio（08 §5-3） */
export function newMeeting(): Meeting {
  return { meetingId_: genId('mtg'), tool: 'Zoom', url: '', videoInput: 'OA1', audioInput: 'UltraStudio' };
}

function MeetingRow({
  meeting, selected, issueCount, onSelect,
}: {
  meeting: Meeting;
  selected: boolean;
  issueCount: number;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'flex min-h-tap w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-muted/60 sm:flex-row sm:items-center sm:gap-3',
          selected && 'bg-primary-surface ring-1 ring-inset ring-primary',
        )}
      >
        <div className="flex min-w-0 items-center gap-2 sm:w-[15rem] sm:shrink-0">
          <span
            className={cn(
              'inline-flex h-6 max-w-[7.5rem] shrink-0 items-center truncate whitespace-nowrap rounded-badge px-2 text-xs font-extrabold',
              toolBadgeClass(meeting.tool),
            )}
          >
            {toolLabel(meeting)}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-bold">
            {meeting.label || '（表示名なし）'}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* URL が空なのは「これから貼る」状態。赤ではなく橙で促す（モック urlFg と同じ） */}
          <span
            className={cn(
              'min-w-0 flex-1 truncate whitespace-nowrap text-xs tabular-nums',
              meeting.url ? 'text-muted-foreground' : 'font-bold text-warning',
            )}
          >
            {meeting.url || 'URL がまだ入っていません'}
          </span>
          {/* 「不足あり」は色だけで伝えない。件数を文字で出す */}
          {issueCount > 0 ? (
            <span className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-bold text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              不足 {issueCount}件
            </span>
          ) : (
            <span className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
        </div>
      </button>
    </li>
  );
}

export default function MeetingList({
  meetings, selectedId, canEdit, onSelect, onChange,
}: {
  meetings: Meeting[];
  selectedId: string | null;
  canEdit: boolean;
  onSelect: (meetingId: string | null) => void;
  onChange: (next: Meeting[]) => void;
}) {
  const issuesById = new Map<string, ReturnType<typeof meetingIssues>>();
  for (const m of meetings) issuesById.set(m.meetingId_, meetingIssues(m));

  const selected = meetings.find((m) => m.meetingId_ === selectedId) ?? null;

  const add = () => {
    const m = newMeeting();
    onChange([...meetings, m]);
    onSelect(m.meetingId_); // 足したらすぐ直せるように選ぶ（スマホでは詳細に切り替わる）
  };
  const update = (next: Meeting) =>
    onChange(meetings.map((m) => (m.meetingId_ === next.meetingId_ ? next : m)));
  const remove = (meetingId: string) => {
    onChange(meetings.filter((m) => m.meetingId_ !== meetingId));
    onSelect(null);
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
      {/* ⚠️ スマホで詳細を開いているあいだは一覧を隠す（1画面ずつ）。PC では常に両方出す */}
      <div className={cn('min-w-0 flex-1', selected && 'hidden sm:block')}>
        <div className="overflow-hidden rounded-card border bg-card">
          <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
            <Video className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            {/* 数え方はモックと同じ「N本」（MeetingMobile.dc.html の count） */}
            <span className="whitespace-nowrap text-sm font-extrabold tabular-nums">{meetings.length}本</span>
            <span className="flex-1" />
            {canEdit && (
              <button
                type="button"
                onClick={add}
                className="flex min-h-tap items-center gap-1 rounded-control-md px-2 text-xs font-bold text-primary hover:bg-primary-surface"
              >
                <Plus className="h-3.5 w-3.5" /> 会議を追加
              </button>
            )}
          </div>

          {meetings.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              {canEdit
                ? 'WEB会議はまだ1本もありません。「会議を追加」から追加してください。'
                : 'WEB会議はまだ1本もありません。'}
            </p>
          ) : (
            <ul className="divide-y">
              {meetings.map((m) => (
                <MeetingRow
                  key={m.meetingId_}
                  meeting={m}
                  selected={m.meetingId_ === selectedId}
                  issueCount={(issuesById.get(m.meetingId_) ?? []).length}
                  onSelect={() => onSelect(m.meetingId_)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* PC: 右にインラインの詳細（配信先と同じ 372px・sticky）。
          ⚠️ sticky でないと、下の会議を選んだとき編集欄が画面外に消える */}
      {selected && (
        <div className="w-full sm:w-[372px] sm:shrink-0">
          <div className="rounded-card border bg-card p-4 sm:sticky sm:top-4 sm:max-h-[calc(100vh-2rem)] sm:overflow-y-auto">
            <MeetingInspector
              meeting={selected}
              issues={issuesById.get(selected.meetingId_) ?? []}
              canEdit={canEdit}
              onChange={update}
              onDelete={() => remove(selected.meetingId_)}
              onBack={() => onSelect(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
