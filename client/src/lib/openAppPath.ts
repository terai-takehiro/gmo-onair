/**
 * 別バンドルのアプリへ行くときの1本の口 (v3.1.0)
 *
 * ── なぜ要るか ─────────────────────────────────────────────
 *
 * この製品は 7 つの別々の Vite ビルドで、`server/src/app.ts` が
 * `/equipment` `/qsheet` `/techsheet` `/live` `/awards` `/daily` を
 * それぞれ別の `dist` に振り分けている。つまり **`/equipment/...` は
 * 案件管理アプリのルート表に存在しない**。
 *
 * ここに `navigate()` を渡すと react-router は案件管理のルート表を探しに行き、
 * どこにも当たらないので `App.tsx` 末尾の `path="*"` に落ちて
 * **黙って「今日」に戻る**。押した人には「押しても何も起きない」に見える。
 *
 * v3.0.11 の時点で実際にこれで死んでいた導線:
 *   - 案件の「機材」ボタン (6 画面ぶん / §4.16「案件から貸出を始められる」)
 *   - 「今日」の あなたのタスクと依頼 → すべて見る / 確認する (3 か所)
 *
 * 判定を各画面に書くと必ずまた漏れるので、**行き先を渡すだけ**にする。
 */

/** 別バンドルとして配信されている basePath (server/src/app.ts の serveApp と一致させる) */
export const EXTERNAL_APP_PREFIXES = [
  "/equipment",
  "/qsheet",
  "/techsheet",
  "/live",
  "/awards",
  "/daily",
] as const;

export function isExternalAppPath(path: string): boolean {
  return EXTERNAL_APP_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}/`) || path.startsWith(`${p}?`)
  );
}

/**
 * 行き先を開く。別バンドルなら読み込み直し、同じアプリの中ならルーティング。
 *
 * `navigate` を受け取る形にしているのは、shared 側 (router 非依存) と
 * 呼び出し方を揃えるため。外部URL (http で始まるもの) は別タブで開く。
 */
export function openAppPath(path: string, navigate: (to: string) => void): void {
  if (/^https?:\/\//.test(path)) {
    window.open(path, "_blank", "noopener,noreferrer");
    return;
  }
  if (isExternalAppPath(path)) {
    window.location.href = path;
    return;
  }
  navigate(path);
}
