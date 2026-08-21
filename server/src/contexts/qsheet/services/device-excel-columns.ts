// 収録設定・配信設定 Excel の列定義。#279 §4-2 / §4-3 のとおり。**綴りを変えない**
// （現場の GMO ONAiR Assistant がこの見出し文字列で列を対応づける）。
//
// ⚠️ label は出さない（ONAiR 側の見やすさのための欄・#279 §2-1）
// ⚠️ TCソース列は出さない（#279 §0-5。`TC` に前方一致する見出しは1つも置かない）
export const RECORDING_COLUMNS: { key: string; header: string }[] = [
  { key: 'deckId', header: 'デッキ' },
  { key: 'videoFormat', header: '解像度' },
  { key: 'codec', header: 'コーデック' },
  { key: 'audioChannels', header: '音声ch' },
  { key: 'slot', header: '収録先' },
  { key: 'filePrefix', header: 'ファイル名' },
];

// ⚠️ Stream ID の列は出さない（#279 §4-3）
// ⚠️ meetings は列を1つも作らない（08 §5-4-1）
export const STREAMING_COLUMNS: { key: string; header: string }[] = [
  { key: 'encoderId', header: 'ENC' },
  { key: 'name', header: 'セッション名' },
  { key: 'protocol', header: 'プロトコル' },
  { key: 'url', header: '宛先' },
  { key: 'port', header: 'ポート' },
  { key: 'streamKey', header: 'ストリームキー' },
  { key: 'passphrase', header: 'パスフレーズ' },
  { key: 'latencyMs', header: 'Latency' },
  { key: 'bandwidthPct', header: 'Bandwidth' },
  { key: 'mtu', header: 'MTU' },
  { key: 'aes', header: '暗号化' },
];

export const GUIDE_ROWS: { key: string; header: string }[] = [
  { key: '項目', header: '項目' },
  { key: '説明', header: '説明' },
];
