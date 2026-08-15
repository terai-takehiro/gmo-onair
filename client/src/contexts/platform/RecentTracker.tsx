/**
 * 「最近見たもの」を積む係（⑪ 探す の3つ目の塊）
 *
 * ── なぜ画面ごとに書かないのか ──────────────────────────────
 *
 * 案件詳細とお客様詳細に `pushRecent(...)` を1つずつ足すこともできますが、
 * **足す先が増えるたびに書き忘れが起きます**（しかも書き忘れは
 * 「最近見たものに出ない」という**気づけない壊れ方**をします）。
 * さらに `CustomerDetailPage` は 492 行で**すでに上限を超えている**ので、
 * そこに行を足すのは方向が逆です。
 *
 * だから**シェルの中に1つだけ置きます**。URL を見て、
 * **その画面がもう読み込んである React Query のキャッシュ**から名前を取ります。
 * 新しい通信は1本も増えません。
 *
 * ── 読めてから積む ──────────────────────────────────────────
 *
 * 開いた瞬間ではなく、**中身が取れてから**積みます。
 * URL だけで積むと、消された案件・打ち間違えた URL が
 * 「最近見たもの」に残り、押しても 404 になります。
 *
 * キャッシュは後から埋まるので、**キャッシュの変化を聞いて**います
 * （`getQueryCache().subscribe`）。画面側には何も足しません。
 */
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { pushRecent, type RecentItem } from '@gmo-onair/shared/src/client-v4/recent';
import { useAuth } from '@/contexts/platform/AuthContext';

/** URL → 見に行くキャッシュの鍵と、そこから名前を取り出す方法 */
function target(pathname: string): { key: unknown[]; read: (d: unknown) => Omit<RecentItem, 'at'> | null } | null {
  const proj = /^\/sales\/projects\/([^/]+)(\/|$)/.exec(pathname);
  // `new` は「案件をつくる」の画面。`:id` に見えるが案件ではない
  if (proj && proj[1] !== 'new' && proj[1] !== 'confirmed') {
    const id = proj[1];
    return {
      key: ['project', id],
      read: (d) => {
        const p = d as { name?: string; gls_number?: string | null } | undefined;
        return p?.name ? { to: `/sales/projects/${id}`, label: p.name, sub: p.gls_number ?? undefined, kind: 'project' } : null;
      },
    };
  }
  const cust = /^\/sales\/customers\/([^/]+)(\/|$)/.exec(pathname);
  if (cust && cust[1] !== 'new') {
    const id = cust[1];
    return {
      key: ['customer-overview', id],
      read: (d) => {
        const c = (d as { customer?: { name?: unknown } } | undefined)?.customer;
        return typeof c?.name === 'string' && c.name
          ? { to: `/sales/customers/${id}`, label: c.name, kind: 'customer' }
          : null;
      },
    };
  }
  const gpm = /^\/gpm\/projects\/([^/]+)(\/|$)/.exec(pathname);
  if (gpm && gpm[1] !== 'new') {
    const id = gpm[1];
    return {
      key: ['gpm-project', id],
      read: (d) => {
        const p = d as { name?: string } | undefined;
        return p?.name ? { to: `/gpm/projects/${id}`, label: p.name, kind: 'gpm' } : null;
      },
    };
  }
  return null;
}

export function RecentTracker() {
  const { pathname } = useLocation();
  const qc = useQueryClient();
  // **誰が見たのかを一緒に残す。** 端末を共有したとき、
  // 前の人が見た案件名が次の人に出ないようにするため（`recent.ts`）
  const { currentUser } = useAuth();
  const uid = currentUser?.id ?? '';

  useEffect(() => {
    const t = target(pathname);
    if (!t) return;
    let done = false;
    const tryPush = () => {
      if (done) return;
      const item = t.read(qc.getQueryData(t.key));
      // **同じ画面で1度だけ。** 名前を直したら積み直したいが、
      // キャッシュが更新されるたびに積むと並びが動き続ける
      if (item && uid) { done = true; pushRecent(item, uid); }
    };
    tryPush();
    // まだ読み込み中なら、取れた時点で積む
    return qc.getQueryCache().subscribe(tryPush);
  }, [pathname, qc, uid]);

  return null;
}
