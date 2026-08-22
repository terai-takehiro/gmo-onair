**制作資料（Qシート）の凍結解除（PR A）で残っていた2点を仕上げた**（`docs/design/v4/qsheet-v4-coding/impl/03-app-structure-impl.md` §8 PR A・§10-1）。

①`client-qsheet/tailwind.config.ts` が `v4Preset` を継承しておらず、content にも `shared/src/client-v4/**` が無かった — 他のv4対象アプリ（例: `client-daily`）と揃っていなかったため、**v4専用の共通部品を制作資料で使ってもクラスが生成されない**状態だった。他のv4対象アプリと同じ形に揃えた。

②`scripts/verify-ui.mjs` の `FROZEN_PREFIX`（凍結アプリ扱いの正規表現）に `qsheet` が残ったままだった — 凍結を解いたのに検査だけ「見た目を今日のまま保つ」判定を続けていた。`qsheet` を外し（`live` のみに）、`PAGES` にプロンプター（`/qsheet/prompter/…`・暗いまま）と公開音声（`/qsheet/audio/…`）を足した（§7-6。本番3画面＋公開音声のうちプロンプターと公開音声が検査対象に無かった）。あわせて周辺コメントの「凍結2アプリ」「凍結4アプリ」等の古い件数表記も直した。

検証: `npm run typecheck:all` / `npm run lint` / `npm run test` OK。`npm run build:all` → `npm run check:frozen` は `live` の1本だけで通過（`qsheet` は混ざらない）。`npm run verify:ui qsheet` は暗い3画面（onair/rundown/prompter）が暗いまま・プロンプターと公開音声が検査対象に入ったことを確認。ビルド後CSS比較で `client-qsheet/dist` に v4Preset 由来のユーティリティクラスが増え、既存クラスは消えていないことを確認。
