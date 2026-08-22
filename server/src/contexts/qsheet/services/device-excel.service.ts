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

/**
 * 出すシートの中身を組み立てる。
 * ⚠️ **書き出しと「見出しの見本」は必ずこの関数を通すこと。**
 * 別々に組むと、見本と実物が違うという**いちばん気づけない壊れ方**をする
 * （impl doc §10-7 も同じことを言っている）。
 */
function buildSheetSpecs(input: BuildDeviceWorkbookInput) {
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

  return sheetSpecs;
}

/** 書き出すファイルの名前。**画面の見本もここを呼ぶ**（別々に組むと食い違う） */
export function deviceSettingsFilename(ownerLabel: string, serviceDate: string): string {
  return `収録配信設定_${ownerLabel}_${serviceDate}.xlsx`;
}

export function buildDeviceSettingsWorkbook(input: BuildDeviceWorkbookInput): BuildDeviceWorkbookResult {
  const buffer = buildExcelWorkbook(buildSheetSpecs(input));
  return { buffer, filename: deviceSettingsFilename(input.ownerLabel, input.serviceDate) };
}

export interface PreviewSheet {
  name: string;
  headers: string[];
  /** 先頭数行。空欄は空文字のまま返す（画面が橙で「（空欄）」と描く） */
  rows: string[][];
  /** 実際に出る行数（rows は先頭だけなので、残りが何行あるかを画面に出す） */
  totalRows: number;
}

/**
 * 「見出しの見本」に出す先頭数行。**実物と同じ `buildSheetSpecs` を通す**。
 *
 * ⚠️ ストリームキーは `keyMode` に関わらず**平文で返さない**。
 * 画面には伏せ字でしか出さない決めごと（08 §2）があるため、
 * 値があるときだけ `****`、無ければ空欄にする。
 */
export function buildDeviceSettingsPreview(
  input: BuildDeviceWorkbookInput,
  limit = 5
): PreviewSheet[] {
  return buildSheetSpecs(input).map((spec) => {
    const cols = spec.columns as { key: string; header: string }[];
    const rows = (spec.rows as Record<string, unknown>[]).slice(0, limit).map((r) =>
      cols.map((c) => {
        const v = r[c.key];
        if (c.key === 'streamKey') return v ? '****' : '';
        return v === undefined || v === null ? '' : String(v);
      })
    );
    return {
      name: spec.name,
      headers: cols.map((c) => c.header),
      rows,
      totalRows: (spec.rows as unknown[]).length,
    };
  });
}

export { excelResponse };
