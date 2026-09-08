/**
 * 実施日を選ぶ帯 ＋ 保存の状態。収録設定・配信設定が**同じものを使う**。
 *
 * ⚠️ **なぜ作ったか**（監査 2026-08-22）
 * 設計は「案件＋実施日で1セット」（08 §1-2）と決めているのに、
 * **実施日を画面から選ぶ手段が1つも無かった**。URL の `?date=` でしか変えられず、
 * 入口（ミニアプリのタイル）は date を付けないため、サーバーは常に
 * 「最新の service_date」を返す。つまり**案件につき事実上1日ぶんしか持てず、
 * 過去日の設定は二度と開けない**状態だった。
 *
 * あわせて「保存していない変更があります」をここに出す。
 * 明示保存なのに未保存の印が無く、画面を移ると黙って全部消えていたため。
 */
import { useEffect, useState } from 'react';
import { CalendarDays, Check, CircleAlert } from 'lucide-react';
import { getServiceDates, type ServiceDateOption } from '@/lib/deviceSettingsApi';

const NEW_DATE = '__new__';

export default function ServiceDateBar({
  ownerKey,
  serviceDate,
  onChange,
  dirty,
  savedAt,
  kind,
}: {
  ownerKey: string;
  serviceDate: string;
  onChange: (date: string) => void;
  dirty: boolean;
  savedAt: Date | null;
  /** どちらの画面か。候補に「収録あり／配信あり」の印を出すため */
  kind: 'recording' | 'streaming';
}) {
  const [options, setOptions] = useState<ServiceDateOption[]>([]);
  const [freeInput, setFreeInput] = useState(false);

  useEffect(() => {
    let alive = true;
    getServiceDates(ownerKey).then((d) => { if (alive) setOptions(d); });
    return () => { alive = false; };
  }, [ownerKey, savedAt]);

  // いま開いている日が候補に無ければ足す（新しく作った日・URL 直打ちの日）
  const dates = options.some((o) => o.date === serviceDate)
    ? options
    : [...options, { date: serviceDate, hasRecording: false, hasStreaming: false }].sort((a, b) => a.date.localeCompare(b.date));

  const mark = (o: ServiceDateOption) => {
    const has = kind === 'recording' ? o.hasRecording : o.hasStreaming;
    return has ? '設定あり' : 'これから';
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border bg-card px-3 py-2">
      <label className="flex items-center gap-2 text-sub">
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="shrink-0 text-list">実施日</span>
        {freeInput ? (
          <input
            type="date"
            className="h-11 rounded-control-lg border border-input bg-background px-2 text-sub"
            value={serviceDate}
            autoFocus
            onChange={(e) => e.target.value && onChange(e.target.value)}
            onBlur={() => setFreeInput(false)}
          />
        ) : (
          <select
            className="h-11 min-w-[13rem] rounded-control-lg border border-input bg-background px-2 text-sub"
            value={serviceDate}
            onChange={(e) => {
              if (e.target.value === NEW_DATE) setFreeInput(true);
              else onChange(e.target.value);
            }}
          >
            {dates.map((o) => (
              <option key={o.date} value={o.date}>
                {o.date}（{mark(o)}）
              </option>
            ))}
            <option value={NEW_DATE}>＋ 別の日を指定する…</option>
          </select>
        )}
      </label>

      <span className="flex-1" />

      {dirty ? (
        <span className="flex items-center gap-1.5 text-list text-warning">
          <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
          保存していない変更があります
        </span>
      ) : savedAt ? (
        <span className="flex items-center gap-1.5 text-sub text-muted-foreground">
          <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
          保存済み ・ {savedAt.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
        </span>
      ) : null}
    </div>
  );
}
