**カレンダーの内部識別子を `studio` → `calendar` に改名した。** 表示名は前から「カレンダー」
だったが、AppKey・ルート（`/studio/*`）・権限モデル統合前の区画名だけが「スタジオ予約」
時代のまま残っていた（`shared/src/client/apps.ts` に「4か所の食い違いのうち表示名は
『カレンダー』に決めたが、識別子は変えていない」と明記されていた既知の債務）。
今回、AppKey/パスを `calendar`/`/calendar` に揃え、旧 `/studio/*`（`/studio`・`/studio/calendar`・
`/studio/rooms`・`/studio/holds`・`/studio/settings`・`/studio/studio-calendar`・
`/studio/partners`・`/studio/my-calendar`・`/studio/all`）はすべて `RedirectKeepQuery` で
新パスへ転送し、ブックマーク・クエリ付き共有リンクを壊さないようにした。
あわせて左メニュー（`nav.ts`）・ホームのタイル数（`HomePage.tsx`・`appBadges.service.ts`）・
検索（`searchFeatures.ts`）・PC専用画面リスト（`pcOnlyScreens.ts`）を追随させた。
**「スタジオ予約」という業務概念自体（`studio_bookings`/`studio_locations` テーブル・
`studio.routes.ts`・カレンダーのレイヤー種別 `CalLayer.studio` 等）は一切変えていない** —
今回変えたのはカレンダーという**アプリの入口**の識別子だけで、実在するスタジオ予約の
ドメイン概念とは別物（両者が同じ文字列 `studio` を使っていたための紛らわしさが今回の動機）。
検証: `npx tsc -b client` / `npx tsc -b server` / `npm run lint` / `npm run test`（1329件）OK。
