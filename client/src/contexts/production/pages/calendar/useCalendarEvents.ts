/**
 * ① 予定 — 3 つの取得元を 1 つの形に畳む
 *
 * スタジオ予約 / パートナーの予定 / 自分の予定は**別のテーブル・別の API** で、
 * 持っている項目も違います。画面ごとに変換を書くと、
 * 「月表には出るのに一覧には出ない」が起きます。**畳むのはここだけ。**
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useAuth } from '@/contexts/platform/AuthContext';
import {
  SCHEDULE_TYPE_COLORS, SCHEDULE_TYPE_LABELS,
  BOOKING_TYPE_COLORS, BOOKING_TYPE_LABELS,
  type PartnerSchedule, type PersonalEvent,
} from '../../components/schedule/scheduleShared';
import type { CalEvent, CalLayer } from './calendarLayout';

/**
 * 自分の予定の色。種別を持たないので取込元で分ける。
 *
 * ⚠️ **旧マイカレンダー（`/studio/my-calendar`・退役済み）の色分けをここへ吸収した。**
 * ① 予定の3層モデルは「自分」を1層としてしか扱わないが、本人にとっては
 * 「自分で入れたか外部同期か・共有かどうか」がいちばん大事な区別だったため、
 * ここだけは畳まずに5色のまま持ってくる（`MY_SOURCE_LEGEND` を凡例が読む）。
 */
const MANUAL_COLOR = '#2563eb';
const GOOGLE_COLOR = '#16a34a';
const OUTLOOK_COLOR = '#0078d4';
const ICS_COLOR = '#64748b';
const SHARED_COLOR = '#9333ea';

/** `CalSidebarExtras`（PC）・`FilterDialogs`（スマホ）の「自分」凡例が読む。1か所で直す */
export const MY_SOURCE_LEGEND: Array<{ key: string; label: string; dot: string }> = [
  { key: 'manual', label: '個人予定', dot: MANUAL_COLOR },
  { key: 'google', label: 'Google', dot: GOOGLE_COLOR },
  { key: 'outlook', label: 'Outlook', dot: OUTLOOK_COLOR },
  { key: 'ics', label: 'ICS 購読', dot: ICS_COLOR },
  { key: 'shared', label: '共有', dot: SHARED_COLOR },
];

export interface CalBooking {
  id: string;
  title: string;
  booking_type: string;
  all_day: number;
  start_time: string;
  end_time: string;
  status?: string;
  project_name?: string | null;
  gls_number?: string | null;
  rooms: Array<{ room_id: string; room_name: string; room_color?: string | null }>;
}

export interface Holiday { date: string; name: string; estimated: boolean }

export interface CalFilters {
  layers: Record<CalLayer, boolean>;
  /** 押さえている部屋で絞る。空 = 絞らない */
  roomIds: string[];
  /** パートナーを人で絞る。空 = 絞らない */
  userIds: string[];
}

/** `2026-08-02T10:00:00.000Z` のような形も `2026-08-02T10:00` に揃える */
const at = (s: string | null | undefined): string => (s ?? '').slice(0, 16);

export function useCalendarEvents(from: string, to: string, f: CalFilters) {
  const { currentUser, hasPermission } = useAuth();
  const isAdmin = currentUser?.role === 'system_admin';
  const canStudio = isAdmin || hasPermission('sales');
  const canPartner = isAdmin || hasPermission('sales');
  const canPersonal = isAdmin || hasPermission('sales', 'editor');

  const bookings = useQuery<CalBooking[]>({
    queryKey: ['studio-bookings', from, to, ''],
    queryFn: async () => (await api.get(`/studios/bookings?from=${from}&to=${to}`)).data.data,
    enabled: canStudio,
    placeholderData: (prev) => prev,
  });

  const partners = useQuery<PartnerSchedule[]>({
    queryKey: ['partner-schedules', from, to],
    queryFn: async () => (await api.get(`/schedule/partner?from=${from}&to=${to}`)).data.data,
    enabled: canPartner,
    placeholderData: (prev) => prev,
  });

  const mine = useQuery<PersonalEvent[]>({
    queryKey: ['personal-events', from, to],
    queryFn: async () => (await api.get(`/schedule/personal?from=${from}&to=${to}`)).data.data,
    enabled: canPersonal,
    placeholderData: (prev) => prev,
  });

  /**
   * 祝日は**設定 ⑥ が持っている表**から読む（`closed_days` の `kind='holiday'`）。
   * 着手前は画面に 2025〜2027 が直書きされていて、**2028 年になると
   * 祝日が1つも出なくなる**状態でした。
   */
  const holidays = useQuery<Holiday[]>({
    queryKey: ['calendar-holidays', from, to],
    queryFn: async () => (await api.get('/business-hours/holidays', { params: { from, to } })).data.data,
    // 祝日は動かないので長めに持つ（月を送るたびに引き直さない）
    staleTime: 60 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  const events = useMemo<CalEvent[]>(() => {
    const out: CalEvent[] = [];

    if (canStudio && f.layers.studio) {
      for (const b of bookings.data ?? []) {
        // **部屋で絞ったときは、部屋を持たない予定を残さない。**
        // 「部屋で絞る」を押した人は部屋の埋まり方を見たいので、
        // 部屋を持たない自分・パートナーの予定が残ると読み違える（モックの注記どおり）
        if (f.roomIds.length > 0 && !b.rooms?.some((r) => f.roomIds.includes(r.room_id))) continue;
        const color = BOOKING_TYPE_COLORS[b.booking_type] || BOOKING_TYPE_COLORS.other;
        out.push({
          key: `bk-${b.id}`,
          id: b.id,
          layer: 'studio',
          // **題名から GLS 番号を落とす。** 帯が狭いので、番号で始まると題名が読めない
          title: b.title.replace(/^GLS[-A-Z0-9]*\s+/i, '').trim() || b.title,
          color,
          typeLabel: BOOKING_TYPE_LABELS[b.booking_type] ?? 'その他',
          sub: b.rooms?.map((r) => r.room_name).join(' ・ ') || '部屋なし',
          source: '',
          allDay: !!b.all_day,
          start: at(b.start_time),
          end: at(b.end_time),
          tentative: b.status === 'tentative' || b.booking_type === 'hold',
        });
      }
    }

    if (canPartner && f.layers.partner) {
      for (const s of partners.data ?? []) {
        if (f.roomIds.length > 0) continue;              // 部屋を持たない
        if (f.userIds.length > 0 && !f.userIds.includes(s.user_id)) continue;
        const color = SCHEDULE_TYPE_COLORS[s.schedule_type] || SCHEDULE_TYPE_COLORS.other;
        out.push({
          key: `ps-${s.id}`,
          id: s.id,
          layer: 'partner',
          title: s.title,
          color,
          typeLabel: SCHEDULE_TYPE_LABELS[s.schedule_type] ?? 'その他',
          sub: s.user_name,
          source: '',
          allDay: !!s.all_day,
          start: at(s.start_time),
          end: at(s.end_time),
          tentative: false,
        });
      }
    }

    if (canPersonal && f.layers.my) {
      for (const e of mine.data ?? []) {
        if (f.roomIds.length > 0) continue;              // 部屋を持たない
        // **人で絞ったときも自分の予定は落とす。** 絞りは「パートナーの空きを見る」
        // ための道具なので、自分の予定が混ざると人ごとの空きが読めない
        if (f.userIds.length > 0) continue;
        // **旧マイカレンダーの色分け・題名の作り方をそのまま吸収した**
        // （取込元ごとに色を分け、共有は紫・共有された側は相手の名前を添える）
        const isSharedIn = e.is_owner === false;
        const isShared = !!e.shared;
        const color = isShared ? SHARED_COLOR
          : e.source === 'google' ? GOOGLE_COLOR
            : e.source === 'outlook' ? OUTLOOK_COLOR
              : e.source === 'ics' ? ICS_COLOR : MANUAL_COLOR;
        const base = e.source === 'ics' && e.feed_label ? `${e.title}｜${e.feed_label}` : e.title;
        const title = isSharedIn ? `👥 ${base}（${e.owner_name || '共有'}）` : isShared ? `👥 ${base}` : base;
        out.push({
          key: `pe-${e.id}`,
          id: e.id,
          layer: 'my',
          title,
          color,
          typeLabel: isShared ? '共有' : '自分',
          sub: e.location || e.feed_label || (e.owner_name ?? ''),
          source: SOURCE_LABEL[e.source] ?? '',
          allDay: !!e.all_day,
          start: at(e.start_time),
          end: at(e.end_time),
          tentative: false,
        });
      }
    }
    return out;
  }, [bookings.data, partners.data, mine.data, f, canStudio, canPartner, canPersonal]);

  return {
    events,
    holidays: useMemo(
      () => new Map((holidays.data ?? []).map((h) => [h.date, h])),
      [holidays.data],
    ),
    bookings: bookings.data ?? [],
    partners: partners.data ?? [],
    mine: mine.data ?? [],
    isLoading: bookings.isLoading || partners.isLoading || mine.isLoading,
    isError: bookings.isError || partners.isError || mine.isError,
    error: bookings.error ?? partners.error ?? mine.error,
    refetch: () => { bookings.refetch(); partners.refetch(); mine.refetch(); },
    can: { studio: canStudio, partner: canPartner, personal: canPersonal },
  };
}

/** 取込元の札。**「manual」は出さない**（ONAiR で入れたものが大半なので邪魔になる） */
const SOURCE_LABEL: Record<string, string> = {
  google: 'Google',
  outlook: 'Outlook',
  ics: 'ICS',
};
