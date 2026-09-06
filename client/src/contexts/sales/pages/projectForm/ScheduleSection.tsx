/**
 * スタジオの日程 — 本番日 / リハーサル / 追加の日程 / 部屋 (v4)
 *
 * ── 触るまで送らない ────────────────────────────────────────
 *
 * この欄に**人が触ったときだけ** `dates` を送ります。触っていないのに送ると
 * `project_dates` が全置換され、拾えなかった日程（撤去日など）が消えます。
 * 印を付けるのは `useProjectSchedule` の setter です。**素の setter を
 * 直接呼ばないこと。**
 *
 * ── 予約が1件でもあるとこの欄は出しません ──────────────────────
 *
 * 予約ができたあとは「登録済みの予約」が唯一のもとになります。
 * 両方から日程を動かせると、どちらが正なのか分からなくなります。
 */
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { FormSection, Field } from './FormSection';
import { getLocationHistory } from './useProjectSchedule';
import type { ProjectSchedule } from './useProjectSchedule';
import type { StudioLocation } from './types';

/** 「複数日程」「リハーサルあり」のような入り／切り */
function ToggleRow({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex min-h-tap items-center justify-between gap-2 lg:min-h-[36px]">
      <span className="text-sub text-secondary-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={(v) => onChange(!!v)} aria-label={label} />
    </div>
  );
}

export function ScheduleSection({
  s, studioLocations, isEdit, hasBookings, onOpenCalendar,
}: {
  s: ProjectSchedule;
  studioLocations: StudioLocation[];
  isEdit: boolean;
  /** 予約が登録済みか。登録済みならこの欄は出さない */
  hasBookings: boolean;
  /** カレンダーで空きを見る（スタジオ案件のときだけ渡す） */
  onOpenCalendar?: () => void;
}) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const history = getLocationHistory()
    .filter((h) => (s.locationNote ? h.toLowerCase().includes(s.locationNote.toLowerCase()) : true))
    .slice(0, 6);

  if (hasBookings) {
    return null;
  }

  return (
    <FormSection
      title="スタジオの日程"
      description={isEdit
        ? 'この案件にはまだ予約がありません。ここに入れると「登録済みの予約」から管理できるようになります。'
        : 'ここに入れると、案件を登録したときにスタジオ予約もいっしょに作ります（あとから直せます）。'}
      action={onOpenCalendar && (
        <Button type="button" variant="outline" size="sm" onClick={onOpenCalendar}>
          <CalendarDays className="mr-1 h-4 w-4" aria-hidden="true" />
          カレンダーで空きを見る
        </Button>
      )}
    >
      {/*
        本番日。**「複数日程」は本番日の直後・終了日の上**
        （`docs/design/v4/_form-order.md`「期間は開始→終了」「依存する欄は
        依存される欄より下」）。終了日はこのトグルを入りにしたときだけ出るのに、
        トグルが終了日より下にあると**出しかたを終了日の下で探す**ことになります。
        リハーサル側と同じ並び（日付 → 複数日程 → 終了日）にそろえてあります
      */}
      <div className="space-y-2">
        <div className="max-w-[16rem]">
          <Field label="本番日" htmlFor="pf-prod-start">
            <Input
              id="pf-prod-start" type="date" value={s.productionStart}
              onChange={(e) => s.setProductionStart(e.target.value)}
            />
          </Field>
        </div>
        <ToggleRow label="複数日程" checked={s.productionMultiDay} onChange={s.setProductionMultiDay} />
        {s.productionMultiDay && (
          <div className="max-w-[16rem]">
            <Field label="本番 終了日" htmlFor="pf-prod-end">
              <Input
                id="pf-prod-end" type="date" value={s.productionEnd}
                onChange={(e) => s.setProductionEnd(e.target.value)}
              />
            </Field>
          </div>
        )}
      </div>

      {/* リハーサル（本番日と同じ並び: 日付 → 複数日程 → 終了日） */}
      <div className="space-y-2">
        <ToggleRow label="リハーサルあり" checked={s.hasRehearsal} onChange={s.setHasRehearsal} />
        {s.hasRehearsal && (
          <div className="space-y-2 pl-6">
            <div className="max-w-[16rem]">
              <Field label="リハーサル日" htmlFor="pf-reh-start">
                <Input
                  id="pf-reh-start" type="date" value={s.rehearsalStart}
                  onChange={(e) => s.setRehearsalStart(e.target.value)}
                />
              </Field>
            </div>
            <ToggleRow label="複数日程" checked={s.rehearsalMultiDay} onChange={s.setRehearsalMultiDay} />
            {s.rehearsalMultiDay && (
              <div className="max-w-[16rem]">
                <Field label="リハーサル 終了日" htmlFor="pf-reh-end">
                  <Input
                    id="pf-reh-end" type="date" value={s.rehearsalEnd}
                    onChange={(e) => s.setRehearsalEnd(e.target.value)}
                  />
                </Field>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 追加の日程（飛び日） */}
      <div className="space-y-2 border-t border-border-subtle pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sub text-secondary-foreground">追加の日程（飛び日）</p>
            <p className="text-note text-muted-foreground">本番・リハと別の日（撤去日や中日など）を足せます。</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={s.addExtraDate}>
            ＋ 日程を追加
          </Button>
        </div>
        {s.extraDates.length > 0 && (
          <div className="space-y-2">
            {s.extraDates.map((d, idx) => (
              <div key={idx} className="flex items-end gap-2">
                <div className="flex-1">
                  <Field label="日付">
                    <Input
                      type="date" value={d.date}
                      onChange={(e) => s.updateExtraDate(idx, { date: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="flex-1">
                  <Field label="呼び名">
                    <Input
                      value={d.label}
                      placeholder="例: 撤去 / 中日 / 予備日"
                      onChange={(e) => s.updateExtraDate(idx, { label: e.target.value })}
                    />
                  </Field>
                </div>
                <Button
                  type="button" variant="ghost" size="icon"
                  className="shrink-0 text-destructive"
                  aria-label="この日程を削除"
                  onClick={() => s.removeExtraDate(idx)}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/*
        **使う部屋・空間は日程の下**（`docs/design/v4/_form-order.md` の段の順）。
        実務は「いつやるか」が先に決まり、空きを見てから部屋を決めます。
        拠点の数だけ縦に伸びる（この節でいちばん長い）ブロックなので、
        上に置くと日付の欄に着くまでにそれを越えることになっていました。
        ⚠️ 新規登録では**部屋と日付の両方**から予約を作ります（`createInitialBookings`）。
        片方だけでは予約になりません
      */}
      <Field label="使う部屋・空間">
        <div className="space-y-4">
          {studioLocations.map((loc) => {
            const rooms = loc.rooms ?? [];
            const allSelected = rooms.length > 0 && rooms.every((r) => s.roomIds.includes(r.id));
            return (
              <div key={loc.id}>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-th text-muted-foreground">{loc.name}</p>
                  {rooms.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const ids = rooms.map((r) => r.id);
                        s.setRoomIds((prev) => (allSelected
                          ? prev.filter((rid) => !ids.includes(rid))
                          : [...new Set([...prev, ...ids])]));
                      }}
                      className={cn(
                        'text-badge h-8 rounded-chip border px-2.5',
                        allSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input hover:bg-accent',
                      )}
                    >
                      {allSelected ? '全部はずす' : '全部えらぶ'}
                    </button>
                  )}
                </div>

                {rooms.length === 0 ? (
                  /* 外現場: 自由記述 + これまで入れた場所 */
                  <div className="relative" ref={suggestionsRef}>
                    <Input
                      placeholder="場所を入力（例: 東京国際フォーラム）"
                      aria-label="場所"
                      value={s.locationNote}
                      onChange={(e) => s.setLocationNote(e.target.value)}
                      onFocus={() => setShowSuggestions(true)}
                    />
                    {showSuggestions && history.length > 0 && (
                      <div className="absolute z-50 mt-1 w-full rounded-control-lg border bg-popover shadow-md">
                        {history.map((h) => (
                          <button
                            key={h}
                            type="button"
                            className="text-sub min-h-tap w-full px-3 py-2 text-left hover:bg-accent lg:min-h-[36px]"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              s.setLocationNote(h);
                              setShowSuggestions(false);
                            }}
                          >
                            {h}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                    {rooms.map((room) => {
                      const selected = s.roomIds.includes(room.id);
                      return (
                        <button
                          key={room.id}
                          type="button"
                          role="switch"
                          aria-checked={selected}
                          onClick={() => s.setRoomIds((prev) => (selected
                            ? prev.filter((rid) => rid !== room.id)
                            : [...prev, room.id]))}
                          className={cn(
                            'text-sub min-h-tap flex items-center gap-2 rounded-control-lg border-2 px-3 py-2 text-left',
                            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            selected
                              ? 'border-transparent text-white shadow-sm'
                              : 'border-input bg-background hover:border-primary-border hover:bg-muted/30',
                          )}
                          style={selected ? { background: room.color } : undefined}
                        >
                          <span
                            className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-chip', selected && 'ring-2 ring-white/60')}
                            style={{ background: selected ? '#ffffff' : room.color }}
                          />
                          <span className="min-w-0 flex-1 truncate">{room.name}</span>
                          {selected && <Check className="h-4 w-4 shrink-0" aria-hidden="true" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Field>

    </FormSection>
  );
}
