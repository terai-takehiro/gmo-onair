/**
 * 機材管理版のグローバル検索ボタン（上辺バーの差し込み口）
 *
 * ── なぜ作るのか（UXレポート 2026-08-18 指摘） ────────────────
 *
 * 機材管理は `shared/src/client/shell/AppTopbar.tsx` の `searchSlot` に何も
 * 渡していなかったため、全画面でヘッダーの検索欄が消えていた。さらに Ctrl+K の
 * リスナー自体が無いので、絞り込み欄などにフォーカスがある状態で押すと
 * "k" がそのまま入力欄に入っていた。
 *
 * 案件管理の `GlobalSearch.tsx`（`SearchPalette` を開く窓形式）をそのまま
 * 移植すると、案件・お客様・仕入先といった機材管理には無い種類を検索する
 * 前提の作りごと持ち込むことになる。**機材管理にはすでに専用の検索画面
 * (`pages/SearchPage.tsx` = 下タブ「探す」) があり、機材・ケーブル・
 * コネクタをまとめて探す動線が完成している**ので、ここでは
 * その画面を開くボタンにする（窓を新たに作り直さない）。
 *
 * - クリック / Ctrl+K・⌘K で `/equipment/search` へ遷移する
 *   （`SearchPage.tsx` の入力欄は `autoFocus` 済みなので、遷移するだけで打てる）
 * - 遷移先で発火するので、`e.preventDefault()` を必ず呼び、フォーカス中の
 *   入力欄に "k" が漏れないようにする（`client` の `GlobalSearch.tsx` と同じ作り）
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

export default function EquipmentSearchButton() {
  const navigate = useNavigate();
  const keys = useMemo(shortcutLabel, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        navigate('/equipment/search');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navigate]);

  return (
    <button
      type="button"
      onClick={() => navigate('/equipment/search')}
      aria-label="機材・ケーブル・コネクタを検索"
      className={cn(
        'text-sub hidden h-10 w-56 shrink-0 items-center gap-2.5 rounded-control-lg border border-border bg-background px-3.5 text-left text-muted-foreground sm:flex lg:w-64',
        'hover:border-primary-border-strong hover:bg-card',
      )}
    >
      <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate">機材・ケーブル・コネクタを検索</span>
      <span className="text-badge rounded-control shrink-0 border border-border bg-card px-2 py-0.5 text-muted-foreground">
        {keys}
      </span>
    </button>
  );
}
