/**
 * `kind: 'external'` の `MiniAppDef` 専用のリンク部品。**`<a href>` だけを返す**
 * （`<Link>` を書く余地を無くす）。
 *
 * 計時・視聴者（`liveops`）は別の Vite バンドル（`client-live`・`base: '/live/'`）への
 * 遷移で、`kind: 'document' | 'panel'` が前提とする「同一バンドル内の URL」を満たさない。
 * `<Link to>` で飛んでも qsheet 側のルーターには一致する route が無く何も起きないため、
 * `MiniAppExternalDef.crossBundle: true` を型で保証した上で、この部品だけがそれを
 * 遷移に使うことにする（`docs/design/v4/qsheet-v4-coding/12-live-timer-decision.md` §2-4）。
 *
 * **権限の二重防御（クライアント側）**: `def.permissionModule` を `useAuth().hasPermission`
 * （`client`アプリ・`shared/src/client/createAuthHook.ts` と同じ既存の仕組み）で確認し、
 * 権限が無ければ `null` を返す（タイル自体を描かない・§2-2・§3-3）。
 * サーバー側の owner 解決エンドポイント（`resolve-by-project`・PR-A で実装済み）は
 * `requirePermission('liveops', 'manager')` で守っている（`programs.routes.ts` の
 * `canWrite` — 未作成の案件では新規行を INSERT するため、他の書き込み系エンドポイントと
 * 同じ manager 相当を要求する）。ここのチェックも同じ `'manager'` を渡して揃える —
 * 既定の `'reader'` のままだと liveops を reader/editor だけで割り当てられた人にタイルが
 * 見えてしまい、押すと resolve-by-project が 403 を返す（§2-2 が「フェーズ1から塞ぐ」と
 * 明示した穴と同型。コードレビューで指摘され修正）。ここは最終防御ではなく
 * 「見えるのに押すと403になる」を防ぐための前段の防御。
 */
import type { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { externalPathOf, type MiniAppDef } from "@gmo-onair/shared/src/production/miniapps";

interface ExternalMiniAppLinkProps {
  /**
   * `MINI_APP_BY_KEY[key]` は `MiniAppDef`（判別可能 union）を返すため、`kind` はここで
   * 実行時に検査する（`externalPathOf` と同じ作法）。`document`/`panel` を渡すと例外。
   */
  def: MiniAppDef;
  ownerId: string;
  className?: string;
  children: ReactNode;
}

export default function ExternalMiniAppLink({ def, ownerId, className, children }: ExternalMiniAppLinkProps) {
  const { hasPermission } = useAuth();

  if (def.kind !== "external") {
    throw new Error(`ExternalMiniAppLink: '${def.key}' は external ではありません（kind=${def.kind}）`);
  }

  // 'manager': サーバー側 resolve-by-project の canWrite（'liveops'・'manager'）と揃える
  // （新規案件では INSERT が起きるため）。既定の 'reader' のままにしない — 上のコメント参照。
  if (def.permissionModule && !hasPermission(def.permissionModule, "manager")) {
    return null;
  }

  return (
    <a href={externalPathOf(def.key, ownerId)} className={className}>
      {children}
    </a>
  );
}
