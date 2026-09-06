/**
 * 日常業務版のグローバル検索ボタン（上辺バーの差し込み口）
 *
 * ── なぜ作るのか（UXレポート 2026-08-18 指摘） ────────────────
 *
 * 日常業務は `shared/src/client/shell/AppTopbar.tsx` の `searchSlot` に何も
 * 渡していなかったため、全画面でヘッダーの検索欄が消えていた。加えて Ctrl+K の
 * リスナーが無いため、押しても何も起きず、入力欄にフォーカスがあると
 * "k" がそのまま入力される（機材管理と同じ穴。`EquipmentSearchButton.tsx` 参照）。
 *
 * 日常業務にはすでに専用の検索画面 (`pages/SearchPage.tsx` = 下タブ「探す」＋
 * `pages/search/matchers.ts`) があり、内覧会の来場予約・セキュリティカード・
 * 入ってきた情報をまとめて探す動線が完成しているので、ここではその画面を
 * 開くボタンにする（案件管理の窓形式 `GlobalSearch.tsx` は持ち込まない）。
 */
import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { cn } from '@gmo-onair/shared/src/client/utils';

/** キーキャップの文字。Mac だけ `⌘K` */
function shortcutLabel(): string {
  if (typeof navigator === 'undefined') return 'Ctrl K';
  const ua = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`;
  return /Mac|iPhone|iPad|iPod/.test(ua) ? '⌘K' : 'Ctrl K';
}

export default function DailySearchButton() {
  const navigate = useNavigate();
  const keys = useMemo(shortcutLabel, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        navigate('/search');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navigate]);

  return (
    <button
      type="button"
      onClick={() => navigate('/search')}
      aria-label="内覧会・セキュリティカード・入ってきた情報を検索"
      className={cn(
        'text-sub hidden h-10 w-56 shrink-0 items-center gap-2.5 rounded-control-lg border border-border bg-background px-3.5 text-left text-muted-foreground sm:flex lg:w-64',
        'hover:border-primary-border-strong hover:bg-card',
      )}
    >
      <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">内覧会・カード・受付情報を検索</span>
      <span className="text-badge rounded-control shrink-0 border border-border bg-card px-2 py-0.5 text-muted-foreground">
        {keys}
      </span>
    </button>
  );
}
