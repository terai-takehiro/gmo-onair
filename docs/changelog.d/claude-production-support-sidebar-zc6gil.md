**制作技術支援のサイドバー・スマホ下タブを、いま開いている案件/番組の文脈に連動する形に作り直した。** それまでは固定4項目（全案件横断の「ドキュメント一覧」「スケジュール表」を含む）をどのページでも同じまま出しており、ハブ画面（`JourneyPage.tsx`）のミニアプリタイルが担う導線と役割が重複していた。ユーザー判断で、この2つの固定リンクを撤去し、案件/番組を開いたとき（`/qsheet/projects/:id` 等・収録設定/配信設定/エディタなどその配下のページ）だけ、その案件/番組の進行台本・スケジュール表・収録設定・配信設定・レンタル機材検索へのリンクをサイドバー・スマホタブに動的に出す形にした。文脈が定まらないページ（`/qsheet/top`・ログイン画面など）は「トップ」だけを出す。

あわせて、収録設定・配信設定の簡易入口（GLS番号・案件ID・番組IDを手入力して開く旧来の画面、`/qsheet/device-settings`・`DeviceSettingsHome.tsx`）を廃止した。サイドバーが案件/番組の文脈から収録設定・配信設定へ直接リンクするようになったため、手入力で遠回りする入口が不要になったと判断した（これもユーザー判断）。`App.tsx` のルートと `nav.ts` からの導線を外しただけで、コード自体は削除せず残してある（CLAUDE.md 冒頭の「廃止」の定義どおり）。

検証: `npx tsc -b client-qsheet` エラー無し。`npm run lint`（`check-mobile-declared`/`check-links`/`check-shared-wiring` 含む）エラー無し。`npm run test`（shared Vitest）104ファイル・1359件すべて成功。`/qsheet/device-settings`・`DeviceSettingsHome` の残存参照をリポジトリ全体で確認し、実データAPI（`device-settings.routes.ts`。RecordingPage/StreamingPage が使う）以外に壊れたリンクが無いことを確認した。
