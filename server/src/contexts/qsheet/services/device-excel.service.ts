// 収録設定・配信設定の Excel — **台本の Excel（03-excel.md 側のモジュール）とは完全に別モジュール**。
//
// 守ること（08 §4 / impl doc §6-1）:
//   1. 台本側の Excel モジュールを import しない・逆も
//   2. 列定義・ヘッダ生成・検証を共有しない
//   3. Excel 用の共通レイヤーを新設しない（`shared/utils/excel.ts` の既存 API を直接呼ぶだけ）
//   4. ExcelJS は使わない（`buildExcelWorkbook` = SheetJS で足りる）
//   5. 2行ヘッダ・隠しシート（台本側が使う定義シート）を混入させない
// → `shared/tests/deviceExcelIsolation.test.ts` が禁止語（台本側モジュール名・
//   ExcelJS のパッケージ名・台本側の隠しシート名）がこのファイルに出てこないことを機械的に見張る。
import { buildExcelWorkbook, excelResponse } from '../../../shared/utils/excel';
import { decrypt } from '../../../shared/utils/secret-box';
import { Deck, Destination } from '../device-settings-types';
import { RECORDING_COLUMNS, STREAMING_COLUMNS } from './device-excel-columns';

export type ExcelSheetChoice = 'recording' | 'streaming';

const GUIDE_ROWS: Record<string, string>[] = [
  { 項目: 'デッキ / ENC', 説明: '機器側の呼び名（REC1〜REC8・REC1-P〜REC4-P / ENC1〜ENC10）。綴りを変えないこと' },
  { 項目: '空欄', 説明: '現地の設定を変えません（値を入れた項目だけが反映されます）' },
  { 項目: 'セッション名', 説明: '半角英数・32文字以内・前後空白なし。ENC内で重複不可' },
  { 項目: 'ストリームキー', 説明: 'RTMP は新規のとき必須。空欄なら現地のキーを残します' },
  { 項目: '解像度・コーデック', 説明: '機器の綴りと完全一致している必要があります（大小区別・部分一致不可）' },
  { 項目: '取込', 説明: 'この Excel は GMO ONAiR Assistant で取り込みます。1枚目のシートしか読みません' },
];

/** ストリームキーを保存の姿（`streamKeyEnc`）から、Excel に出す文字列に直す */
function resolveStreamKeyForExport(
  d: Destination & { streamKeyEnc?: string | null },
  keyMode: 'blank' | 'plain'
): string {
  if (keyMode !== 'plain' || !d.streamKeyEnc) return '';
  return decrypt(d.streamKeyEnc) ?? '';
}

export interface BuildDeviceWorkbookInput {
  ownerLabel: string; // GLS番号 または 案件名
  serviceDate: string; // YYYY-MM-DD
  sheets: ExcelSheetChoice[]; // 出す順そのまま = シートの並び（08 §6-2）
  decks: Deck[];
  destinations: (Destination & { streamKeyEnc?: string | null })[];
  keyMode: 'blank' | 'plain';
}

export interface BuildDeviceWorkbookResult {
  buffer: Buffer;
  filename: string;
}

export function buildDeviceSettingsWorkbook(input: BuildDeviceWorkbookInput): BuildDeviceWorkbookResult {
  const sheetSpecs = [];

  if (input.sheets.includes('recording')) {
    // 「使わないと決めた台」（skip）は空行にせず、そもそも出さない（#279 §4-1 の空行禁止）
    const rows = input.decks
      .filter((d) => !d.skip)
      .map((d) => ({
        deckId: d.deckId,
        videoFormat: d.videoFormat ?? '',
        codec: d.codec ?? '',
        audioChannels: d.audioChannels ?? '',
        slot: d.slot ?? '',
        filePrefix: d.filePrefix ?? '',
      }));
    sheetSpecs.push({ name: '収録設定', columns: RECORDING_COLUMNS, rows });
  }

  if (input.sheets.includes('streaming')) {
    // 配信先が1件も無い ENC は行を出さない（= destinations に無いものはそもそも書かない）
    const rows = input.destinations.map((d) => ({
      encoderId: d.encoderId,
      name: d.name,
      protocol: d.protocol ?? '',
      url: d.url ?? '',
      port: d.port ?? '',
      streamKey: resolveStreamKeyForExport(d, input.keyMode),
      passphrase: d.passphrase ?? '',
      latencyMs: d.latencyMs ?? '',
      bandwidthPct: d.bandwidthPct ?? '',
      mtu: d.mtu ?? '',
      aes: d.aes ?? '',
    }));
    sheetSpecs.push({ name: '配信設定', columns: STREAMING_COLUMNS, rows });
  }

  // 入力ガイドは常に付ける（#279 §4-4）
  sheetSpecs.push({
    name: '入力ガイド',
    columns: [
      { key: '項目', header: '項目' },
      { key: '説明', header: '説明' },
    ],
    rows: GUIDE_ROWS,
  });

  const buffer = buildExcelWorkbook(sheetSpecs);
  const filename = `収録配信設定_${input.ownerLabel}_${input.serviceDate}.xlsx`;
  return { buffer, filename };
}

export { excelResponse };
