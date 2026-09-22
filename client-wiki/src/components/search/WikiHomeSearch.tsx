/**
 * ホームの大きな検索欄（モック `Main.dc.html`・高さ 54px）
 *
 * ── 入力欄ではなくボタンにしてある ──────────────────────────
 *
 * 見た目はモックの入力欄と同じですが、押すと `⌘K` と**同じ窓**が開きます
 * （案件管理の `GlobalSearch` と同じ判断）。理由は2つ:
 *   ① 打つ場所が画面ごとに変わらない。ホームでも、ページを読んでいる途中でも、
 *      同じ窓に打って同じ並びから選べる
 *   ② 窓の中は広いので、最近見たもの・一致した見出しまで出せる
 * 全部の結果を絞り込みながら見るときは、窓から「すべての結果を見る」で
 * 検索の画面（`/search`）へ行きます。
 */
import { useMemo } from 'react';
import { Search } from 'lucide-react';
import { openWikiSearch, searchShortcutLabel } from './searchOpen';

export default function WikiHomeSearch() {
  const keys = useMemo(searchShortcutLabel, []);

  return (
    <button
      type="button"
      onClick={openWikiSearch}
      aria-label="Wiki を検索"
      className="flex h-[54px] w-full items-center gap-3 rounded-note border border-primary-border bg-card px-4 text-left transition-colors hover:border-primary-border-strong"
    >
      <Search className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-list text-muted-foreground">
        Wiki を検索（例: 配信 音が出ない ／ セキュリティカード）
      </span>
      <span className="hidden shrink-0 rounded-control border border-border px-2 py-0.5 font-number text-note text-muted-foreground sm:inline">
        {keys}
      </span>
    </button>
  );
}
