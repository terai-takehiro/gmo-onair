/**
 * NotificationBell — 溜まる場所 (§4.15 / デザイン 18a)
 *
 * **既読の概念を持たない。** 終わらせた分は次に開いたときに消えている。
 * 「読んだだけでは何も終わっていない」ので、既読フラグを置くと嘘の「片づいた」が生まれる。
 *
 * トーストは作らない。流れて消えるものは気づけないので、通知はここと朝の1通だけ。
 */
import { forwardRef, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, X, ChevronRight, Settings2 } from 'lucide-react';
import { cn } from '../utils';

export interface NotificationItem {
  id: string;
  title: string;
  meta?: string;
  /** 経過の起点 (YYYY-MM-DD または ISO) */
  at?: string | null;
  cta?: string;
  path?: string;
}

export interface NotificationGroup {
  key: string;
  label: string;
  rule?: string;
  items: NotificationItem[];
}

export interface NotificationData {
  groups: NotificationGroup[];
  total: number;
}

/** 「3日前」のように経過で書く。時刻そのものより待たせている長さが読みたい */
function elapsed(at?: string | null): string {
  if (!at) return '';
  const t = Date.parse(at.length <= 10 ? `${at}T00:00:00` : at);
  if (Number.isNaN(t)) return '';
  const min = Math.floor((Date.now() - t) / 60_000);
  if (min < 0) return 'これから';
  if (min < 60) return `${min}分`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}時間`;
  return `${Math.floor(h / 24)}日`;
}

export const NotificationPanel = forwardRef<HTMLDivElement, {
  data: NotificationData | null;
  pos: { top: number; right: number };
  onRun: (path: string) => void;
  onClose: () => void;
  onOpenPrefs?: () => void;
}>(function NotificationPanel({ data, pos, onRun, onClose, onOpenPrefs }, ref) {
  const groups = data?.groups ?? [];
  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="通知"
      className="fixed z-[99998] max-h-[70vh] w-[min(92vw,420px)] overflow-y-auto rounded-lg border border-border bg-card shadow-xl"
      style={{ top: pos.top, right: pos.right }}
    >
      <header className="sticky top-0 flex items-center gap-2 border-b border-divider bg-card px-4 py-3">
        <h2 className="text-[15px] font-bold text-foreground">通知</h2>
        <span className="font-bold tabular-nums text-destructive">{data?.total ?? 0}</span>
        <div className="ml-auto flex items-center gap-1">
          {onOpenPrefs && (
            <button
              type="button"
              onClick={onOpenPrefs}
              className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[12px] text-secondary-foreground hover:bg-secondary"
            >
              <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
              受け取り方
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted-foreground hover:bg-secondary"
            aria-label="閉じる"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </header>

      {groups.length === 0 ? (
        <p className="px-4 py-6 text-center text-[13px] text-secondary-foreground">
          いま気にすることはありません。
        </p>
      ) : (
        <div className="divide-y divide-divider">
          {groups.map((g) => (
            <section key={g.key} className="px-4 py-3">
              <div className="flex items-baseline gap-2">
                <h3 className="text-[13px] font-bold text-foreground">{g.label}</h3>
                <span className="text-[12px] font-bold tabular-nums text-secondary-foreground">{g.items.length}</span>
              </div>
              {g.rule && <p className="mt-0.5 text-[11px] text-muted-foreground">{g.rule}</p>}
              <ul className="mt-2 space-y-1">
                {g.items.slice(0, 8).map((it) => (
                  <li key={it.id}>
                    <button
                      type="button"
                      onClick={() => it.path && onRun(it.path)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-secondary"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-foreground">{it.title}</span>
                        {it.meta && <span className="block truncate text-[11px] text-muted-foreground">{it.meta}</span>}
                      </span>
                      {it.at && (
                        <span className="shrink-0 text-[11px] tabular-nums text-secondary-foreground">{elapsed(it.at)}</span>
                      )}
                      {it.cta && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 text-[12px] font-bold text-primary">
                          {it.cta}
                          <ChevronRight className="h-3 w-3" aria-hidden="true" />
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
              {g.items.length > 8 && (
                <p className="mt-1 text-[11px] text-muted-foreground">ほか {g.items.length - 8}件</p>
              )}
            </section>
          ))}
        </div>
      )}

      <footer className="border-t border-divider px-4 py-2.5 text-[11px] text-muted-foreground">
        終わらせた分は自動で消えます。「既読にする」はありません（読んだだけでは何も終わっていないため）。
      </footer>
    </div>
  );
});

/** ベル本体 (ボタン + パネル)。データ取得は呼び出し側から関数で渡す */
export function NotificationBell({
  fetchData, onRun, onOpenPrefs, onData,
}: {
  fetchData: () => Promise<NotificationData>;
  onRun: (path: string) => void;
  onOpenPrefs?: () => void;
  /**
   * 取れた件数を親に渡す (v3.0.9)。
   *
   * レールには**件数を出す仕掛け (`railBadges`) が最初から入っていたのに、
   * 渡している呼び出し側が1つも無かった** — つまり丸ごと死んでいた。
   * ベルはもう2分ごとに取っているので、**もう1本取りに行かず**その結果を配る。
   */
  onData?: (d: NotificationData) => void;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationData | null>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // 件数はバッジのために常に持っておく (2分ごと。ポーリングは軽い導出クエリ1本)
  useEffect(() => {
    let alive = true;
    const load = () => {
      fetchData().then((d) => { if (alive) { setData(d); onData?.(d); } }).catch(() => { /* 失敗しても上辺は壊さない */ });
    };
    load();
    const t = setInterval(load, 120_000);
    return () => { alive = false; clearInterval(t); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 開いたときは最新を取り直す (終わらせた分がすぐ消えるように)
  useEffect(() => {
    if (!open) return;
    fetchData().then((d) => { setData(d); onData?.(d); }).catch(() => { /* noop */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!btnRef.current?.contains(e.target as Node) && !panelRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const count = data?.total ?? 0;

  // ベルはヘッダーの最右端ではない (右にユーザーメニューが続く) ので、パネルを
  // ベルの親要素に相対配置すると、パネル自体はほぼ画面幅 (92vw) あるぶん左端が
  // 画面外にはみ出し、AppShell 直下の overflow-hidden に切り取られていた
  // (スマホで文字が左から欠けて見えていたのはこれが原因)。
  // ⋯ / ユーザーメニュー (TopBar.tsx の DropdownPanel) と同じく body に portal し、
  // 実測した位置に fixed 配置することで祖先の overflow-hidden の影響を受けなくする。
  const show = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.min(window.innerWidth * 0.92, 420);
    const rawRight = window.innerWidth - r.right;
    const maxRight = Math.max(window.innerWidth - width - 8, 8);
    setPos({ top: r.bottom + 8, right: Math.min(rawRight, maxRight) });
    setOpen(true);
  };

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={() => (open ? setOpen(false) : show())}
        className={cn(
          'relative flex h-11 w-11 items-center justify-center rounded-control transition-colors hover:bg-secondary',
          open && 'bg-secondary'
        )}
        aria-label={count > 0 ? `通知 ${count}件` : '通知'}
        aria-expanded={open}
        style={{ touchAction: 'manipulation' }}
      >
        <Bell className="h-5 w-5 text-secondary-foreground" aria-hidden="true" />
        {count > 0 && (
          <span className="absolute right-1.5 top-1.5 min-w-[18px] rounded-full bg-destructive px-1 text-center text-[11px] font-bold leading-[18px] text-destructive-foreground">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <NotificationPanel
          ref={panelRef}
          data={data}
          pos={pos}
          onRun={(p) => { setOpen(false); onRun(p); }}
          onClose={() => setOpen(false)}
          onOpenPrefs={onOpenPrefs ? () => { setOpen(false); onOpenPrefs(); } : undefined}
        />,
        document.body,
      )}
    </div>
  );
}
