/** ⑥ 休日・営業時間 で使う形（v4 設定） */

export const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'] as const;

/** モックの並びは 月〜日。**日曜始まりにしない** — 週の予定は月曜から見る */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export interface DayHours {
  weekday: number;
  open_time: string | null;
  close_time: string | null;
  over_policy: 'accept' | 'consult' | 'reject';
  note: string | null;
}

export interface ClosedDay {
  id: string;
  /** null = 全拠点に効く */
  location_id: string | null;
  from_date: string;
  to_date: string;
  name: string;
  kind: 'company' | 'holiday' | 'site';
  availability: 'open' | 'none' | 'consult' | 'partial';
  /** 春分・秋分は予測（政府の公示まで確定しない） */
  estimated: boolean;
}

export interface LocationRow {
  id: string;
  name: string;
  room_count: number;
  closed_count: number;
}

/** 営業時間外の受付。**「受け付けない」でも保存は止まりません**（注意が強くなるだけ） */
export const OVER_POLICY: { value: DayHours['over_policy']; label: string; tone: string }[] = [
  { value: 'accept', label: '受け付ける', tone: 'bg-success-surface text-success' },
  { value: 'consult', label: '相談のうえ', tone: 'bg-warning-surface text-warning' },
  { value: 'reject', label: '受け付けない', tone: 'bg-muted text-muted-foreground' },
];

export const AVAILABILITY: { value: ClosedDay['availability']; label: string; tone: string }[] = [
  { value: 'open', label: '営業する', tone: 'bg-success-surface text-success' },
  { value: 'consult', label: '相談のうえ', tone: 'bg-warning-surface text-warning' },
  { value: 'partial', label: '一部のみ', tone: 'bg-info-surface text-info' },
  { value: 'none', label: '受け付けない', tone: 'bg-muted text-muted-foreground' },
];

export const KIND_LABEL: Record<ClosedDay['kind'], string> = {
  company: '全社', holiday: '祝日', site: '拠点',
};
export const KIND_TONE: Record<ClosedDay['kind'], string> = {
  company: 'bg-primary-surface text-primary',
  holiday: 'bg-ai-surface text-ai',
  site: 'bg-warning-surface text-warning',
};

export const label = <T extends { value: string; label: string; tone: string }>(
  list: T[], v: string,
): T => list.find((x) => x.value === v) ?? list[list.length - 1];

/** `09:00`〜`26:00` を 30 分刻みで。**24 時超えも出す**（深夜まで営業する日がある） */
export const TIME_CHOICES: string[] = (() => {
  const out: string[] = [];
  for (let m = 6 * 60; m <= 27 * 60; m += 30) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
  }
  return out;
})();
