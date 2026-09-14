**会場図面の下敷き画像差し替えが、エリア別（WORLD STUDIO）には効いていなかったのを直した**（利用者からのご指摘。本番デプロイ確認で発覚）。
①migration 300で階全体の下敷き（`floor-26f-v2.png`等）は差し替えたが、WORLD STUDIOなどエリア別の下敷き（`world-26f.png`）は対象外だったため、個別エリアを開くと旧画像（文字が判読できない・切れている）のままだった。②同じ新原図・同じ校正からWORLD STUDIOのmm窓（`originMm`）はそのまま高解像度で再切り出しし（800×966→897×1083）、`world-26f-v2.png`としてキャッシュバスト、migration 301で`qsheet_venue_areas.underlay`を更新した。LEDウォール・トラス脚10本のbboxMmを新画像に重ねて位置一致を確認（Playwright・検証用Postgresで実際に画面を開いて確認）。LOUNGE STUDIO・パントリー（`lounge-27f.png`）はこの時点で既に判読できる画像だったため対象外。
検証: `node scripts/check-migration-numbers.mjs`・`node scripts/check-md-links.mjs`・`RELEASE=1 npm run lint`（0 errors）・実ブラウザでWORLD STUDIOエリアの表示確認。

**v4.6.16のCLAUDE.md本文が長すぎた（Codexレビュー指摘）のを直した**（`docs/branching.md`）。
リリースPR #704がマージ後に届いたCodexレビュー指摘（P2）で、`npm run release:notes`が集めた9件の下書きを連結した約11KBの本文がCLAUDE.md「現在のバージョン」に残っており、同文書自身が定める「1件＝見出し＋2〜3文まで」の規律に反していた（12,000バイトの自動分割しきい値には届かなかったため機械では止まらなかった）。見出し＋3文の要約に置き換え、全文は`docs/version-history.md`のアーカイブへ移した。あわせて`scripts/collect-changelog.mjs`のアーカイブ挿入位置（既存エントリの版番号と比較して新しい順を保つ）の修正と、それに伴う`docs/version-history.md`の並び直しも本PR（#704）に含めていたが、マージが本修正のpushより先に成立したため、この1件だけを取り込む追加PRとした。
