/**
 * 左メニュー — 幅 **248px** (docs/design/v4/mockups/AppSideMenu.dc.html)
 *
 * 見出し (11.5px/800) ＋ 項目 (最低高 38px・角丸 10px・左に 6px の点)。
 * 現在地は **背景・文字色・点の色・ウェイト** の4つで示します
 * (色だけだと、色が見分けにくい人に伝わらない)。
 *
 * ── 中身は各アプリが渡す ────────────────────────────────────
 *
 * **項目・並び・ラベルはいまのまま**です。v4 で入れ替えるのは枠だけで、
 * 情報設計の変更は Phase 2 以降にアプリごとに相談します。
 *
 * ── 権限で消えることの重さ ──────────────────────────────────
 *
 * ここのフィルタが壊れると**利用者から黙ってメニュー項目が消えます**。
 * 消えた人は「そんな画面は無い」と思うだけなので報告されず、作った側は
 * 自分の権限では見えているので気づきません。`shared/tests/apps.test.ts` で固定してあります。
 */
import { NavLink } from 'react-router-dom';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../utils';
import { visibleApps } from '../apps';
import type { ShellAccess, ShellNavSection } from './types';

export interface AppSideMenuProps extends ShellAccess {
  appKey: string;
  sections: ShellNavSection[];
  note?: ReactNode;
  /** スマホで開いているか。PC では常に出る */
  open: boolean;
  onClose: () => void;
  /**
   * 「他のアプリ」を下に並べる。**凍結4アプリは出さない** (v4 のシェルなので)。
   * 旧シェルは今までどおり全部出す。
   */
  showOtherApps?: boolean;
}

function useCan({ role, permissions, can }: ShellAccess) {
  if (can) return can;
  return (module: string) => role === 'system_admin' || !!permissions?.[module];
}

export function AppSideMenu({
  appKey,
  sections,
  note,
  open,
  onClose,
  showOtherApps = true,
  role,
  permissions,
  can,
}: AppSideMenuProps) {
  const allow = useCan({ role, permissions, can });
  const isAdmin = role === 'system_admin';
  const others = showOtherApps ? visibleApps({ current: appKey, role, permissions }) : [];

  const visible = sections
    .map((s) => ({
      ...s,
      items: s.items.filter((item) => {
        if (item.adminOnly) return isAdmin;
        if (item.modules?.length) return item.modules.some(allow);
        if (item.module) return allow(item.module);
        return true;
      }),
    }))
    .filter((s) => s.items.length > 0);

  return (
    <>
      {/* スマホで開いているときの下敷き */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <nav
        aria-label="メニュー"
        className={cn(
          'z-50 flex w-[248px] shrink-0 flex-col overflow-y-auto border-r border-border bg-card px-3 pb-5 pt-3.5',
          // PC は常に居座る。スマホは引き出し
          'fixed inset-y-0 left-0 transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="メニューを閉じる"
          className="min-h-tap min-w-tap mb-1 self-end rounded-control text-muted-foreground hover:bg-muted lg:hidden"
        >
          <X className="mx-auto h-5 w-5" />
        </button>

        {visible.map((section, si) => (
          <div key={section.title ?? si}>
            {section.title && <p className="text-th mb-1 mt-3.5 px-2.5 text-muted-foreground">{section.title}</p>}
            {section.items.map((item) =>
              item.external ? (
                <a
                  key={item.to}
                  href={item.external}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onClose}
                  className="text-list flex min-h-[38px] items-center gap-2.5 rounded-control-lg px-2.5 py-1.5 text-muted-foreground hover:bg-muted"
                >
                  <Dot active={false} />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </a>
              ) : (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onClose}
                  className={({ isActive }) =>
                    cn(
                      'text-list flex min-h-[38px] items-center gap-2.5 rounded-control-lg px-2.5 py-1.5',
                      isActive
                        ? 'bg-primary-surface-weak font-extrabold text-primary'
                        : 'text-secondary-foreground hover:bg-muted',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Dot active={isActive} />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.tag && (
                        <span className="text-sub-sm inline-flex h-[19px] shrink-0 items-center rounded-badge-xs bg-muted px-1.5 font-bold text-muted-foreground">
                          {item.tag}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              ),
            )}
          </div>
        ))}

        {others.length > 0 && (
          <div className="mt-3.5 border-t border-border-faint pt-2">
            <p className="text-th mb-1 px-2.5 text-muted-foreground">他のアプリ</p>
            {others.map((a) => (
              <a
                key={a.key}
                href={a.external ?? a.path}
                {...(a.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="text-list flex min-h-[38px] items-center gap-2.5 rounded-control-lg px-2.5 py-1.5 text-muted-foreground hover:bg-muted"
              >
                <a.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{a.label}</span>
              </a>
            ))}
          </div>
        )}

        {note && (
          <div className="mt-4 rounded-control-lg border border-dashed border-border px-3 py-2.5">
            <p className="text-note text-muted-foreground">{note}</p>
          </div>
        )}
      </nav>
    </>
  );
}

/** 現在地の点。色だけに頼らないよう、太さ・背景と合わせて3つで示す */
function Dot({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn('h-1.5 w-1.5 shrink-0 rounded-chip', active ? 'bg-primary' : 'bg-border-disabled')}
    />
  );
}
