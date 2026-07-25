/**
 * 通知の取得。**通知は保存しない**ので、サーバーが既存データから導出したものをそのまま受ける。
 * 全アプリが同じ 1 本 (`GET /dashboard/notifications`) を叩く。
 */
import type { NotificationData } from './NotificationBell';

interface ApiLike {
  get: (url: string) => Promise<{ data: { data: NotificationData } }>;
}

export function createNotificationFetcher(api: ApiLike) {
  return async (): Promise<NotificationData> => {
    const res = await api.get('/dashboard/notifications');
    return res.data.data ?? { groups: [], total: 0 };
  };
}
