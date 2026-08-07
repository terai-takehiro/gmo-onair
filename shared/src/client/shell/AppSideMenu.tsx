/**
 * 左メニュー — 幅 **248px** (docs/design/v4/mockups/AppSideMenu.dc.html)
 *
 * 見出し (11.5px/800) ＋ 項目 (角丸 10px・左に 6px の点)。
 *
 * **項目の高さは PC 38px / スマホ 44px。** モックは 38px ですが、スマホでは
 * 引き出しとして同じ項目を指で押すので、v4 の決めごと「タップ対象は最低 44px」
 * が優先します (38px のままだと押し損ねる)。
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
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../utils';
import { visibleApps } from '../apps';
import type { ShellAccess, ShellNavSection } from './types';

/**
 * 現在地の判定。**`NavLink` の既定に任せない。**
 *
 * 機材管理は Vite の `base: '/equipment/'` で配信されるので、入口を開いたときの
 * URL は `/equipment/` (末尾にスラッシュ) になります。`NavLink to="/equipment" end`
 * は**これに一致せず、ダッシュボードにいるのにどの項目も光りませんでした**
 * (実ブラウザで測って気づいた。`/equipment/items` では光るので見落としやすい)。
 *
 * 末尾のスラッシュを畳んでから比べます。`end` が無い項目は配下も現在地とみなします
 * (`/sales/projects` にいるとき `/sales/projects` の項目が光る)。
 */
export function isCurrent(pathname: string, to: string, end?: boolean): boolean {
  const norm = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);
  const a = norm(pathname);
  const b = norm(to);
  return end ? a === b : a === b || a.startsWith(`${b}/`);
}

/**
 * 光らせるのは**いちばん深く一致した1つだけ**。
 *
 * 入れ子の項目（`/sales/projects` と `/sales/projects/confirmed/studio`）は
 * `isCurrent` が**両方 true になります**。2つ光ると「いまどこにいるか」が読めません。
 * 一致した中で `to` がいちばん長いものを現在地とします。
 *
 * これで `/sales/projects/<案件id>`（案件詳細）では `案件一覧` が光り、
 * `/sales/projects/confirmed/studio` では `確定案件（スタジオ）` だけが光ります。
 */
export function currentTo(pathname: string, sections: ShellNavSection[]): string | null {
  let best: string | null = null;
  for (const s of sections) {
    for (const i of s.items) {
      if (i.external) continue;
      if (!isCurrent(pathname, i.to, i.end)) continue;
      if (best === null || i.to.length > best.length) best = i.to;
    }
  }
  return best;
}

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
  const { pathname } = useLocation();
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

  // **光らせるのは1つだけ。** 権限で消えた項目は数に入れない（見えないものを現在地にしない）
  const activeTo = currentTo(pathname, visible);

  return (
    <>
      {/* スマホで開いているときの下敷き */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <nav
        aria-label="メニュー"
        /*
         * **閉じた引き出しをタブ順と読み上げから外す印。**
         * `-translate-x-full` だけだと画面の外にあるだけで、スマホで Tab を押すと
         * 見えないメニューの 20 項目を順に通ってから本文に着きます。
         *
         * 隠すのは `tokens-v4.css` の側 (`visibility: hidden`)。**Tailwind の
         * 該当クラスをここに書いてはいけません** — 凍結4アプリの CSS に
         * その2規則が入ります (実測 +61 バイト)。各アプリの Tailwind が
         * `shared/src/client/**` を走査するためで、**コメントの中に書いた
         * クラス名まで拾われます** (これで一度踏みました)。
         * 描かない規則でも「見た目を今日のまま」に反するので、
         * **属性だけ足して規則は v4 側に置きます**（`data-ui="button"` と同じやり方）。
         */
        data-drawer={open ? 'open' : 'closed'}
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
          <Section key={section.title ?? si} section={section} activeTo={activeTo}>
            {section.items.map((item) =>
              item.external ? (
                <a
                  key={item.to}
                  href={item.external}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onClose}
                  className="text-list min-h-tap flex items-center gap-2.5 rounded-control-lg px-2.5 py-1.5 text-muted-foreground hover:bg-muted lg:min-h-[38px]"
                >
                  <Dot active={false} />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </a>
              ) : (
                (() => {
                  const active = item.to === activeTo;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={onClose}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'text-list min-h-tap flex items-center gap-2.5 rounded-control-lg px-2.5 py-1.5 lg:min-h-[38px]',
                        active
                          ? 'bg-primary-surface-weak font-extrabold text-primary'
                          : 'text-secondary-foreground hover:bg-muted',
                      )}
                    >
                      <Dot active={active} />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.tag && (
                        <span className="text-sub-sm inline-flex h-[19px] shrink-0 items-center rounded-badge-xs bg-muted px-1.5 font-bold text-muted-foreground">
                          {item.tag}
                        </span>
                      )}
                    </Link>
                  );
                })()
              ),
            )}
          </Section>
        ))}

        {others.length > 0 && (
          <div className="mt-3.5 border-t border-border-faint pt-2">
            <p className="text-th mb-1 px-2.5 text-muted-foreground">他のアプリ</p>
            {others.map((a) => (
              <a
                key={a.key}
                href={a.external ?? a.path}
                {...(a.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="text-list min-h-tap flex items-center gap-2.5 rounded-control-lg px-2.5 py-1.5 text-muted-foreground hover:bg-muted lg:min-h-[38px]"
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

/**
 * メニューの1つの塊。`collapsible` なら折りたたむ。
 *
 * **いまいる画面がこの中にあるときは開いた状態で始めます。** 閉じたままだと、
 * その画面を開いているのにメニューのどこも光らず「どこにいるか」が分かりません。
 */
function Section({
  section, activeTo, children,
}: {
  section: ShellNavSection;
  activeTo: string | null;
  children: ReactNode;
}) {
  const hasCurrent = section.items.some((i) => i.to === activeTo);
  const [open, setOpen] = useState(hasCurrent);

  if (!section.collapsible) {
    return (
      <div>
        {section.title && <p className="text-th mb-1 mt-3.5 px-2.5 text-muted-foreground">{section.title}</p>}
        {children}
      </div>
    );
  }

  return (
    <div className="mt-3.5 border-t border-border-faint pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-th min-h-tap flex w-full items-center gap-1 px-2.5 text-muted-foreground hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
        <span className="min-w-0 flex-1 truncate text-left">{section.title}</span>
        <span className="font-number">{section.items.length}</span>
      </button>
      {open && (
        <>
          {section.note && <p className="text-note mb-1 px-2.5 text-muted-foreground">{section.note}</p>}
          {children}
        </>
      )}
    </div>
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
