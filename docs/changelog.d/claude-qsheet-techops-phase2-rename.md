**qsheet→techops移行 Phase 2（ベースパス・AppKey・APIプレフィックスの二重化）を実装した。**
Phase 1（ディレクトリ名の改名）に続き、`docs/reviews/qsheet-techops-migration-plan.md` の計画どおり
URLベースパスを `/qsheet/` から `/techops/` へ移した。旧URLは全て生かしたまま（ブックマーク・
配布済みQR・OBSブラウザソースURL・埋め込み等が壊れない）。

- **フロント**: `client-techops` の Vite `base` を `/techops/` に変更し、`App.tsx` に
  旧 `/qsheet/*` → 新 `/techops/*` の後方互換リダイレクト（`RedirectQsheetToTechops`。
  クエリ文字列も維持）を追加した。アプリ内の API 呼び出し・リンク・`pcOnlyScreens.ts` 等、
  52ファイル219箇所の `/qsheet` パス文字列を `/techops` に置き換えた
- **`shared/src/client/apps.ts`**: `AppKey`/`path` を `qsheet`→`techops` に改名した。
  **`permissionModule` は既存利用者の権限JSONとの互換のため意図的に `'qsheet'` のまま据え置いた**
  （calendar 改名時の `studio`→`calendar` と同じ方針）
- **サーバー**: `serveApp('/techops', …)` を追加し同じビルドを `/qsheet`・`/techops` 両方で配信、
  `createQsheetRoutes(prefix)` 化により API も両プレフィックスで二重マウントした
  （Socket.IO ネームスペースは対象外・`/qsheet` のまま。Phase 3 で扱う）
- `client/` からの3ファイル・`client-live/` の後方互換リダイレクト10ファイル・
  `miniapps.ts`（client/server 両複製）・`journey.service.ts` の遷移先など、
  他アプリ／他バンドルからの `/qsheet` リンクも `/techops` に更新した
- 検証: `npx tsc -b`（全ワークスペース）/ `npm run test`（1452件）/ `npm run lint` OK

⚠️ Phase 3（Socket.IOネームスペース切替・本番URL5本の最終移行）・Phase 4（MCPツール名の
二重登録）はまだ未着手（計画どおり計画停止枠が要るため）。
