/**
 * グローバル検索 — 上辺バーの差し込み口（モックの「案件・お客様・機材を探す」）
 *
 * ── 入力欄ではなく**ボタン**にした（モックに合わせた）──────────
 *
 * モックの上辺バーは **枠つきのボタン**（虫めがね ＋「案件・お客様・機材を探す」
 * ＋ `⌘K` のキーキャップ）で、押すと探す窓が開きます。実装は幅 160〜224px の
 * 入力欄が右端にあり、**キーの近道もありませんでした**。
 *
 * ボタンにすると良いことが3つあります:
 *   ① **何を探せるのかが書ける**（入力欄の placeholder は幅が足りず
 *      「案件・顧客・仕入先...」と切れていました）
 *   ② `⌘K` / `Ctrl+K` を出せる。毎日使う人はここしか押さなくなる
 *   ③ **窓の中は広い**ので、種類ごとに分けて並べられる
 *
 * ── 「機能」も探せる（モックの言葉どおり）────────────────────
 *
 * 案件・お客様・仕入先はサーバー（`GET /search`）、**機能（画面）は手元**で
 * 突き合わせます。元は左メニューの定義（`nav.ts`）とアプリ登録（`apps.ts`）と
 * ⑪ 探すの近道（`search/shortcuts.ts`）で、**新しい表を作っていません** —
 * 作ると画面が増えたときに片方だけ足されます。
 *
 * **権限が無い画面は出しません**（押してから 403 で気づかせない）。
 *
 * ── トップページでは左・広い ────────────────────────────────
 *
 * モックのトップページは検索が**左**（ロゴのすぐ隣）で幅 400px、
 * ほかの画面は右で 260px です。左右の入れ替えは上辺バー
 * （`shell/AppTopbar.tsx`）が、幅はここが決めます。
 *
 * 窓の中身は `SearchPalette.tsx`、探せる機能の一覧は `searchFeatures.ts` です。
 */
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SearchPalette } from './SearchPalette';

/** キーキャップの文字。Mac だけ `⌘K`（Windows で ⌘ を出すと押せないキーを案内することになる） */
function shortcutLabel(): string {
  if (typeof navigator === 'undefined') return 'Ctrl K';
  const ua = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`;
  return /Mac|iPhone|iPad|iPod/.test(ua) ? '⌘K' : 'Ctrl K';
}

export default function GlobalSearch() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  // トップページは左に置いて広く（モック 400px）。ほかの画面は右で 260px
  const isHome = pathname === '/';
  const keys = useMemo(shortcutLabel, []);

  // **⌘K / Ctrl+K で開く。** 入力中の欄で押されたときも開いてよい
  // （探しに行く操作なので、打ち込みを止めても困らない）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="案件・お客様・機材を検索"
        className={cn(
          'text-sub hidden h-10 shrink-0 items-center gap-2.5 rounded-control-lg border border-border bg-background px-3.5 text-left text-muted-foreground sm:flex',
          'hover:border-primary-border-strong hover:bg-card',
          'w-56 lg:w-64',
          isHome && 'lg:w-96',
        )}
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">案件・お客様・機材を検索</span>
        <span className="text-badge rounded-control shrink-0 border border-border bg-card px-2 py-0.5 text-muted-foreground">
          {keys}
        </span>
      </button>

      <SearchPalette open={open} onOpenChange={setOpen} />
    </>
  );
}
