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
 * ── 「他のアプリ」を外しました (M4) ─────────────────────────
 *
 * 下に並べていた「他のアプリ」6行は、**上辺バーのアプリ切替と完全に重複**して
 * いました (どちらも `visibleApps()` の同じ一覧)。案件管理では
 * v4 の 6 項目に対して**作り直し前 11 ＋ 他のアプリ 6 = 23 行**あり、
 * 整理した部分より整理していない部分のほうが多い状態でした。
 *
 * **凍結4アプリはもともとここに出ていません** (`visibleApps()` の既定が外す)。
 * 押して開ける唯一の場所は**トップページのタイル**なので、外すときは
 * そちらを消さないこと — 消すと放送で使う4アプリが URL 直打ちでしか開けなくなります。
 *
 * ── 権限で消えることの重さ ──────────────────────────────────
 *
 * ここのフィルタが壊れると**利用者から黙ってメニュー項目が消えます**。
 * 消えた人は「そんな画面は無い」と思うだけなので報告されず、作った側は
 * 自分の権限では見えているので気づきません。`shared/tests/apps.test.ts` で固定してあります。
 */
import { useState } from 'react';
import { Link, useLocation, matchPath } from 'react-router-dom';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../utils';
import { useIsMobile } from '../../client-v4/mobile';
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
/**
 * `to` の**道の部分だけ**（`?` から先を落とす）。
 *
 * ⚠️ **項目は絞り込みつきの行き先を持ちます**（`/equipment/items?view=lend`）。
 * クエリごと `pathname` と比べていたので、**その項目は一度も光らず**、
 * パンくずには**同じ道の別の項目の名前**（「機材台帳」）が出ていました
 * （レビューでの指摘 #82）。押した本人には、押した先と違う名前が上辺バーに出ます。
 */
export function pathOf(to: string): string {
  return to.split('?')[0].split('#')[0];
}

export function isCurrent(pathname: string, to: string, end?: boolean): boolean {
  const norm = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p);
  const a = norm(pathname);
  const b = norm(pathOf(to));
  return end ? a === b : a === b || a.startsWith(`${b}/`);
}

/**
 * 項目が持っているクエリが、いま開いている URL と**すべて一致するか**。
 *
 * 同じ道に項目が2つ以上あるとき（機材台帳 と 貸出対象の機材）に、
 * **どちらにいるのか**を決めるために見ます。項目がクエリを持たなければ 0
 * （＝一致した項目が他に無ければそれが現在地）。
 */
function queryScore(to: string, search: string): number {
  const q = to.split('?')[1];
  if (!q) return 0;
  const now = new URLSearchParams(search);
  const want = new URLSearchParams(q);
  for (const [k, v] of want) if (now.get(k) !== v) return -1;
  return [...want].length;
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
export function currentTo(
  pathname: string, sections: ShellNavSection[], search = '',
): string | null {
  let best: string | null = null;
  let bestScore = -1;
  let bestLen = -1;
  for (const s of sections) {
    for (const i of s.items) {
      if (i.external) continue;
      if (!isCurrent(pathname, i.to, i.end)) continue;
      // **クエリが食い違う項目は現在地にしない**（`?view=lend` を見ているのに台帳を光らせない）
      const score = queryScore(i.to, search);
      if (score < 0) continue;
      const len = pathOf(i.to).length;
      // 深い道が勝つ。同じ深さなら**クエリまで一致している**ほうが勝つ
      if (len > bestLen || (len === bestLen && score > bestScore)) {
        best = i.to; bestLen = len; bestScore = score;
      }
    }
  }
  return best;
}

interface AppSideMenuProps extends ShellAccess {
  sections: ShellNavSection[];
  note?: ReactNode;
  /** スマホで開いているか。PC では常に出る */
  open: boolean;
  onClose: () => void;
  /**
   * PC で隠されているか（ヘッダーの「サイドバーを隠す」ボタン）。
   * **スマホの `open`/`onClose`（引き出し開閉）とは別の状態** — CSS 側が
   * `min-width: 1024px` でだけこれを見るので、スマホの動きには影響しない。
   */
  collapsed?: boolean;
  /**
   * **スマホのときだけメニューから落とすルート**（ご判断）。
   *
   * データを入れる道具（決算の取込・DB バックアップ・データビューア）は
   * 案件の仕事に出てこないので、**スマホでは選べること自体が邪魔**です。
   * 出どころは各アプリの `pcOnlyScreens.ts` の `hidden: true`。
   *
   * **ルートは消しません。** 共有された URL を開けば今までどおり案内が出ます。
   */
  mobileHiddenPaths?: string[];
  /**
   * 左メニューの**上**の差し込み口の DOM をここへ渡す（`sideMenuSlot.ts`）。
   * 省略すると差し込み口自体を作らない（この左メニューを使うだけの画面では要らない）。
   */
  topSlotRef?: (el: HTMLDivElement | null) => void;
}

/**
 * その人に見える項目だけにした並び。
 *
 * ⚠️ **左メニューと上辺バーのパンくずが、同じ答えを使うために切り出しました**
 * （レビューでの指摘 #82）。前の版はメニューだけが権限で絞っており、
 * パンくずは**絞る前の並び**から名前を引いていたので、
 * **メニューに出ていない画面の名前が上辺バーに出ます**。
 * 現在地の判定も2か所で別々になり、**メニューは何も光っていないのに
 * パンくずだけ名前を出す**ことが起きます。
 */
export function visibleSections(
  sections: ShellNavSection[],
  opts: ShellAccess & { mobile?: boolean; mobileHiddenPaths?: string[] },
): ShellNavSection[] {
  const allow = opts.can ?? ((module: string) => opts.role === 'system_admin' || !!opts.permissions?.[module]);
  const isAdmin = opts.role === 'system_admin';
  const hiddenHere = (to: string) => !!opts.mobile
    && !!opts.mobileHiddenPaths?.some((pat) => matchPath({ path: pat, end: true }, pathOf(to)));

  return sections
    .map((s) => ({
      ...s,
      items: s.items.filter((item) => {
        if (hiddenHere(item.to)) return false;
        if (item.adminOnly) return isAdmin;
        if (item.modules?.length) return item.modules.some(allow);
        if (item.module) return allow(item.module);
        return true;
      }),
    }))
    .filter((s) => s.items.length > 0);
}

export function AppSideMenu({
  sections,
  note,
  open,
  onClose,
  collapsed,
  mobileHiddenPaths,
  topSlotRef,
  role,
  permissions,
  can,
}: AppSideMenuProps) {
  const { pathname, search } = useLocation();
  const mobile = useIsMobile();
  /*
   * 見える項目だけにする。**判定は `visibleSections` の1か所**（上の説明）—
   * ここに書き写すと、パンくずと食い違います。
   * スマホで出さない項目は**前方一致ではなくルートの型で照合**する
   * （`/settings` を前方一致にすると `/settings/sites` まで巻き込む）。
   */
  const visible = visibleSections(sections, { role, permissions, can, mobile, mobileHiddenPaths });

  // **光らせるのは1つだけ。** 権限で消えた項目は数に入れない（見えないものを現在地にしない）
  const activeTo = currentTo(pathname, visible, search);

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
        /*
         * **PC で隠すのも同じやり方**（`data-drawer` の3行上のコメント参照）。
         * ここに幅0のクラスを直書きすると凍結アプリ時代と同じ理由でCSSが
         * 増えるだけでなく、`w-[248px]` と詳細度で衝突する。属性だけ足して
         * 規則は `tokens-v4.css` 側（`:root [data-side-collapsed]`）に置く。
         */
        data-side-collapsed={collapsed ? 'true' : 'false'}
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

        {/* カレンダー等、画面固有の内容を差し込む口。空のときは何も描かない */}
        {topSlotRef && <div ref={topSlotRef} className="empty:hidden" />}

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
                      <span className={cn('min-w-0 flex-1', item.wrap ? 'break-words' : 'truncate')}>
                        {item.label}
                      </span>
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
