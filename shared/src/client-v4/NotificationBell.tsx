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
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, ChevronDown, ChevronRight } from 'lucide-react';
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

/**
 * ⚠️ **同じ種類（`template_id`）の通知をまとめる**（UXレポート 2026-08-18 指摘）。
 *
 * 「GMOインターネットグループ株式会社宛の請求書をまだ出していません」のような
 * 同一文面が金額違いで何件も並ぶと、重要な通知が埋もれてアラート疲れを起こす。
 * `template_id` が同じ通知を1つの帯に畳み、既定は折りたたんだ状態で
 * 「タイトル＋N件」だけを出す。開くと元の1件ずつの行が並ぶ（挙動は変えない）。
 *
 * **`template_id` が無い通知は畳まない**（1件ずつのグループとして扱う）。
 * 種類の判定を持たない古い通知や、そもそも束ねる意味の無い個別通知まで
 * 無理に1つにまとめると、`title` が違う通知同士が同じ帯に入りかねない。
 */
function groupItems(items: NotificationItem[]): { key: string; items: NotificationItem[] }[] {
  const order: string[] = [];
  const map = new Map<string, NotificationItem[]>();
  items.forEach((n) => {
    const key = n.template_id ?? `id:${n.id}`;
    if (!map.has(key)) { map.set(key, []); order.push(key); }
    map.get(key)!.push(n);
  });
  return order.map((key) => ({ key, items: map.get(key) ?? [] }));
}

export function NotificationBell({ api }: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  // 展開中のグループ（`template_id` か `id:<id>`）。既定はすべて折りたたみ
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
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
  const groups = useMemo(() => groupItems(q.data?.items ?? []), [q.data?.items]);

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

          {groups.length === 0 ? (
            <p className="text-note px-3.5 py-6 text-center text-muted-foreground">
              お知らせはありません
            </p>
          ) : (
            <ul className="max-h-[380px] overflow-y-auto">
              {groups.map((g) => {
                if (g.items.length === 1) {
                  const n = g.items[0];
                  return (
                    <li key={g.key}>
                      <NotificationRow n={n} onOpen={() => {
                        if (!n.read_at) read.mutate([n.id]);
                        setOpen(false);
                        if (n.link) go(n.link);
                      }}
                      />
                    </li>
                  );
                }
                // **同じ種類が2件以上 → 畳んだ帯にする。** 最新の1件のタイトルを代表に出し、
                // 未読が1件でもあれば帯全体を未読色にする（畳んだままでも見落とさないように）
                const isOpen = expanded.has(g.key);
                const anyUnread = g.items.some((n) => !n.read_at);
                const latest = g.items[0];
                return (
                  <li key={g.key} className="border-b border-border-faint last:border-b-0">
                    <button
                      type="button"
                      onClick={() => setExpanded((prev) => {
                        const next = new Set(prev);
                        if (next.has(g.key)) next.delete(g.key); else next.add(g.key);
                        return next;
                      })}
                      aria-expanded={isOpen}
                      className={cn(
                        'min-h-tap flex w-full items-start gap-2 px-3.5 py-2.5 text-left',
                        anyUnread ? 'bg-primary-surface-weak' : 'bg-card',
                      )}
                    >
                      <span
                        className={cn('mt-1.5 h-1.5 w-1.5 shrink-0 rounded-chip', anyUnread ? 'bg-primary' : 'bg-transparent')}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="text-sub flex items-baseline gap-1.5 [overflow-wrap:anywhere]">
                          <span className="min-w-0 flex-1 truncate">{latest.title}</span>
                          <span className="text-note shrink-0 font-bold text-primary">{g.items.length}件</span>
                        </span>
                        <span className="text-note mt-0.5 block text-muted-foreground">{whenText(latest.created_at)}</span>
                      </span>
                      {isOpen
                        ? <ChevronDown className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        : <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                    </button>
                    {isOpen && (
                      <ul className="border-t border-border-faint bg-surface-subtle">
                        {g.items.map((n) => (
                          <li key={n.id}>
                            <NotificationRow
                              n={n}
                              indent
                              onOpen={() => {
                                if (!n.read_at) read.mutate([n.id]);
                                setOpen(false);
                                if (n.link) go(n.link);
                              }}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** 通知1件の行。単独表示でも、畳んだ帯を開いた中でも同じ見た目にする（`indent` は開いた中だけ） */
function NotificationRow({ n, onOpen, indent }: { n: NotificationItem; onOpen: () => void; indent?: boolean }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'min-h-tap flex w-full items-start gap-2 border-b border-border-faint px-3.5 py-2.5 text-left last:border-b-0',
        n.read_at ? 'bg-card' : 'bg-primary-surface-weak',
        indent && 'pl-7',
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
  );
}
