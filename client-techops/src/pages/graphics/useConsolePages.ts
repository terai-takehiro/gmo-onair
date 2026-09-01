// テロップCG — 送出コンソールのページ一覧（`bundle.pages` ＋ cg:sync の差分上書き）。
//
// `GraphicsConsolePage.tsx` から切り出した（ファイルサイズ規律・400行 —
// `node scripts/check-file-size.mjs`）。送出コンソールは初回ロードの `bundle` から
// 一覧を作るだけで再取得しないため、PUT /pages/:id（±ボタンなど）の `cg:sync` 同報に
// 乗る page 更新をここで当て直さないと、自分の操作で変えた得点が PGM/PVW プレビューに
// 反映されない（出力画面側の同種の当て直しは GraphicsOutputPage.tsx 側にある）。
import { useEffect, useMemo, useState } from 'react';
import type { GraphicsBundle, GraphicsPageRow } from '@/lib/graphicsApi';

export interface ConsolePages {
  /** 一覧の表示順（送出リスト順 = sortOrder） */
  pages: GraphicsPageRow[];
  /** 呼出番号順（番号呼出・次へ・↑↓ のスタンバイ移動はこちらの並び） */
  callOrder: GraphicsPageRow[];
  pageById: Map<string, GraphicsPageRow>;
  /** cg:sync で届いた page 更新を当てる */
  applyPageSync: (page: GraphicsPageRow) => void;
}

export function useConsolePages(bundle: GraphicsBundle): ConsolePages {
  const [overrides, setOverrides] = useState<Record<string, GraphicsPageRow>>({});
  // bundle 自体が差し替わった（別プロジェクトを開き直した等）ときは上書きも作り直す
  useEffect(() => { setOverrides({}); }, [bundle.pages]);

  const merged = useMemo(() => bundle.pages.map((p) => overrides[p.id] ?? p), [bundle.pages, overrides]);
  const pages = useMemo(
    () => [...merged].sort((a, b) => (a.sortOrder - b.sortOrder) || (a.callNo - b.callNo)),
    [merged],
  );
  const callOrder = useMemo(
    () => [...merged].sort((a, b) => (a.callNo - b.callNo) || (a.sortOrder - b.sortOrder)),
    [merged],
  );
  const pageById = useMemo(() => new Map(merged.map((p) => [p.id, p])), [merged]);

  const applyPageSync = (page: GraphicsPageRow) => {
    setOverrides((prev) => ({ ...prev, [page.id]: page }));
  };

  return { pages, callOrder, pageById, applyPageSync };
}
