/**
 * 上辺バーのベル（v4 設定 ⑦・社内通知）
 *
 * ── なぜ `client-v4/` に置くか ──────────────────────────────
 *
 * `src/client/` に置くと、**凍結4アプリの CSS にもここのクラス名が入ります**
 * （各アプリの Tailwind が `../shared/src/client/**` を走査するため。
 *  描かない部品のクラスまで CSS になる）。`client-v4/` は v4 対象3アプリの
 * content にしか入っていないので、凍結アプリは1バイトも増えません。
 *
 * ── 通知は全員が受け取る ────────────────────────────────────
 *
 * 権限で出し分けません。**そもそも自分あての行しか返ってこない**作りです
 * （サーバーが `user_id = 自分` で絞る）。
 *
 * ── 未読の数は控えめに取りに行く ────────────────────────────
 *
 * 1分ごとに数だけ問い合わせます。中身は**開いたときだけ**読みます。
 * 常に全文を取ると、開かない人のぶんまで毎分転送することになります。
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check } from 'lucide-react';
import type { AxiosInstance } from 'axios';
import { cn } from '../client/utils';

export interface NotificationItem {
  id: string;
  template_id: string | null;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read_at: string | null;
}

interface Props {
  /** 各アプリの axios。**shared から直接 import しない**（アプリごとに保存先が違う） */
  api: AxiosInstance;
}

/**
 * 行き先へ移動する。**ルーターを使わず素の遷移にしてある。**
 *
 * 通知の行き先は**アプリをまたぎます**（案件管理のベルに機材の未返却が出る）。
 * 別のアプリは別のバンドルなので、ルーターでは移動できません。
 * 3アプリそれぞれで「自分の中か外か」を判定させると、判定を間違えたアプリだけ
 * 押しても動かない、という気づきにくい壊れ方をします。
 * 通知を押す回数は1日に数回なので、**常に素の遷移で確実に動く**ほうを採ります。
 */
function go(link: string): void {
  window.location.href = link;
}

function whenText(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return 'たった今';
  if (m < 60) return `${m}分前`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}時間前`;
  return `${Math.floor(m / 1440)}日前`;
}

export function NotificationBell({ api }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const q = useQuery<{ items: NotificationItem[]; unread: number }>({
    queryKey: ['notifications'],
    queryFn: async () => (await api.get('/notifications')).data.data,
    refetchInterval: 60_000,
    // **失敗しても黙る。** ベルが赤くなるより、出ないほうがまし
    retry: false,
  });

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const read = useMutation({
    mutationFn: async (ids: string[] | 'all') => api.post('/notifications/read', { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const unread = q.data?.unread ?? 0;
  const items = q.data?.items ?? [];

  return (
    <div ref={ref} className="relative shrink-0">
      {/*
        **PC は枠つきの「通知」ボタン、スマホはベルだけ**（モック）。
        PC の上辺バーには余白があり、アイコンだけだと**何のアイコンか**を
        覚えている人しか押しません。スマホは幅が無いのでベルだけにします。
        件数は同じ1つの要素で、PC では文字の右に並び（`lg:static`）、
        スマホではベルの右上に重なります。
      */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={unread > 0 ? `お知らせ ${unread} 件` : 'お知らせ'}
        className="min-h-tap min-w-tap relative flex items-center justify-center gap-2 text-muted-foreground lg:h-10 lg:min-h-0 lg:min-w-0 lg:rounded-control-lg lg:border lg:border-border lg:bg-card lg:px-3 lg:text-foreground lg:hover:bg-muted"
      >
        <Bell className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="text-sub hidden whitespace-nowrap lg:block">通知</span>
        {unread > 0 && (
          <span
            className="text-badge absolute right-1.5 top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-chip bg-destructive px-1 text-destructive-foreground lg:static"
            data-testid="bell-count"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="rounded-card absolute right-0 top-full z-50 mt-1 w-[320px] overflow-hidden border border-border bg-card shadow-lg"
        >
          <div className="flex items-center gap-2 border-b border-border-faint px-3.5 py-2.5">
            <span className="text-cardtitle min-w-0 flex-1">お知らせ</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => read.mutate('all')}
                className="text-note inline-flex items-center gap-1 text-primary"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />すべて読んだことにする
              </button>
            )}
          </div>

          {items.length === 0 ? (
            <p className="text-note px-3.5 py-6 text-center text-muted-foreground">
              お知らせはありません
            </p>
          ) : (
            <ul className="max-h-[380px] overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (!n.read_at) read.mutate([n.id]);
                      setOpen(false);
                      if (n.link) go(n.link);
                    }}
                    className={cn(
                      'min-h-tap flex w-full items-start gap-2 border-b border-border-faint px-3.5 py-2.5 text-left last:border-b-0',
                      n.read_at ? 'bg-card' : 'bg-primary-surface-weak',
                    )}
                  >
                    <span
                      className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-chip', n.read_at ? 'bg-transparent' : 'bg-primary')}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="text-sub block [overflow-wrap:anywhere]">{n.title}</span>
                      {n.body && (
                        <span className="text-note mt-0.5 block whitespace-pre-line text-muted-foreground">{n.body}</span>
                      )}
                      <span className="text-note mt-0.5 block text-muted-foreground">{whenText(n.created_at)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
