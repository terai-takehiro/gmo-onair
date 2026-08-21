**収録設定・配信設定を制作資料のミニアプリとして作った。** HyperDeck 12台・Magewell 10台ぶんの
機器設定を案件（GLS番号）＋実施日の単位で打ち込み、GMO ONAiR Assistant がそのまま取り込める
Excel（1枚目・見出し1行・空行なし）を書き出せるようにした。ストリームキーは既存の AES-256-GCM
暗号化ユーティリティを `server/src/shared/utils/secret-box.ts` へ引き上げて共用し、画面には
伏せ字（`****abcd`）でしか出さず、書き出しは編集権限に限って誰がいつ何を出したかを記録する。
配信設定には WEB会議（ツール・URL・ID・パスコード・入力映像／音声）も持てるが、現地に反映する
経路が無いため Excel には1列も出さず、共有は画面のコピーで行う。機器設定の Excel は台本の Excel
とは前提が正反対（片道・1行ヘッダ・空行禁止）なので別モジュール（`device-excel.service.ts`）にし、
`shared/tests/deviceExcelIsolation.test.ts` で台本側・exceljs・`_schema` を参照していないことを固定した。
ミニアプリ・レジストリ（`shared/src/production/miniapps.ts`）を新設し、`MiniAppDef` に
`kind: 'document' | 'panel'` の判別子を足して「案件に1セットだけ持つ道具」を表せるようにした
（進行台本・スケジュール表は01段の未着手のため今回は未登録）。
⚠️ `qsheet_documents.doc_no` が未着手のため、`:ownerKey` は案件（`project_id` / GLS番号）側のみ
先行実装し、資料単体（`doc_no`）側は01段の完了後に追加する。
検証: `npm run typecheck` / `npm run lint` / `npm run test` OK。
