// 収録設定の候補（#279 §2-1）。**唯一の正ではない**（機器の capabilities が本当の正）。
// 「よく使う候補」として出し、自由入力も許す（弾くのは現地の仕事）。
import type { Deck } from '@/lib/deviceSettingsApi';

export const DECK_IDS_MAIN = ['REC1', 'REC2', 'REC3', 'REC4', 'REC5', 'REC6', 'REC7', 'REC8'] as const; // Studio 4K Pro（本線）
export const DECK_IDS_BACKUP = ['REC1-P', 'REC2-P', 'REC3-P', 'REC4-P'] as const; // HD Plus（控え）

export function isHdPlus(deckId: string): boolean {
  return deckId.endsWith('-P');
}

/** グループの見出し（モック Main.dc.html:239-241 の `model` と同じ文言） */
export const MODEL_LABEL_MAIN = 'HyperDeck Studio 4K Pro ・ 8台';
export const MODEL_LABEL_BACKUP = 'HyperDeck Studio HD Plus ・ 4台（4K・DNxHR は選べません）';

const FORMATS_1080 = ['1920x1080p59.94', '1920x1080i59.94', '1920x1080p29.97'];
const FORMAT_4K = '3840x2160p59.94';

export function videoFormatOptions(deckId: string): string[] {
  return isHdPlus(deckId) ? FORMATS_1080 : [...FORMATS_1080, FORMAT_4K];
}

const CODECS_BASE = ['H.264:High', 'H.265:High', 'ProRes:HQ', 'ProRes:422'];
const CODEC_DNXHR = 'DNxHR:HQ';

export function codecOptions(deckId: string): string[] {
  return isHdPlus(deckId) ? CODECS_BASE : [...CODECS_BASE, CODEC_DNXHR];
}

export function audioChannelOptions(deckId: string): number[] {
  return isHdPlus(deckId) ? [2, 4] : [2, 4, 8, 16];
}

export function slotOptions(deckId: string): string[] {
  return isHdPlus(deckId)
    ? ['ネットワーク', 'SD 1', 'SD 2', 'USB-C']
    : ['ネットワーク', 'SSD 1', 'SSD 2', 'SD 1', 'USB-C'];
}

export function defaultDecks(): { deckId: string }[] {
  return [...DECK_IDS_MAIN, ...DECK_IDS_BACKUP].map((deckId) => ({ deckId }));
}

// ── 機種をまたぐときに値を落とす ──────────────────────────
/** 揃えて扱う4つの欄。ラベルはトーストと一括変更のダイアログで使い回す */
export const DECK_FIELDS = [
  { key: 'videoFormat', label: '解像度' },
  { key: 'codec', label: 'コーデック' },
  { key: 'audioChannels', label: '音声ch' },
  { key: 'slot', label: '収録先' },
] as const;
export type DeckFieldKey = (typeof DECK_FIELDS)[number]['key'];

/** その欄について「アプリが知っている値」の全体。機種判定はこれを基準にする */
function knownValues(key: DeckFieldKey): string[] {
  switch (key) {
    case 'videoFormat': return [...FORMATS_1080, FORMAT_4K];
    case 'codec': return [...CODECS_BASE, CODEC_DNXHR];
    case 'audioChannels': return ['2', '4', '8', '16'];
    case 'slot': return ['ネットワーク', 'SSD 1', 'SSD 2', 'SD 1', 'SD 2', 'USB-C'];
  }
}

/** その機種が持てる値（文字列に揃える。音声chだけ number なので比較用に string 化する） */
export function optionsOf(deckId: string, key: DeckFieldKey): string[] {
  switch (key) {
    case 'videoFormat': return videoFormatOptions(deckId);
    case 'codec': return codecOptions(deckId);
    case 'audioChannels': return audioChannelOptions(deckId).map(String);
    case 'slot': return slotOptions(deckId);
  }
}

/**
 * その値を「この機種は持てない」と言い切れるか。
 *
 * ⚠️ **候補に無い＝落とす、にはしない。** この画面は自由入力を許している
 * （弾くのは現地の仕事・冒頭のとおり）ので、手で打った見慣れない値まで消すと
 * 入力そのものが成立しない。**アプリが知っている値のうち、その機種の候補に
 * 無いものだけ**（4K・DNxHR・SSD・8ch/16ch など）を「持てない」と判定する。
 */
function unsupported(deckId: string, key: DeckFieldKey, value: string): boolean {
  if (!value) return false;
  if (optionsOf(deckId, key).includes(value)) return false;
  return knownValues(key).includes(value);
}

export interface CoerceResult {
  deck: Deck;
  /** 落とした欄の名前（「解像度」など）。トーストで件数と一緒に出す */
  dropped: string[];
}

/**
 * 別のデッキから写した値を、写し先の機種が持てる値だけに落とす。
 *
 * ⚠️ **以前ここが無かったせいで起きていたこと**（監査 2026-08-22）
 * 「本線から写す」は `{ ...main, deckId: backupId }` をそのまま入れていた。
 * REC1 が 4K・DNxHR・SSD 1・8ch だと、控え（HD Plus）の REC1-P にその値が入る。
 * 控えの `<select>` は候補に持っていないので**画面は空欄に見えるのに、
 * 保存値と Excel にはその値が残り**、現地で弾かれるまで誰も気づけなかった。
 */
export function coerceDeck(deckId: string, src: Deck): CoerceResult {
  const next: Deck = { ...src, deckId };
  const dropped: string[] = [];
  for (const f of DECK_FIELDS) {
    const raw = f.key === 'audioChannels' ? (src.audioChannels == null ? '' : String(src.audioChannels)) : (src[f.key] ?? '');
    if (unsupported(deckId, f.key, String(raw))) {
      dropped.push(f.label);
      if (f.key === 'audioChannels') next.audioChannels = undefined;
      else next[f.key] = undefined;
    }
  }
  return { deck: next, dropped };
}

/**
 * 選んだ台すべてが持てる値だけ（＝候補の共通部分）。一括変更のダイアログが使う。
 * 本線と控えを同時に選ぶと、4K や DNxHR はここで自動的に消える。
 */
export function commonOptions(deckIds: string[], key: DeckFieldKey): string[] {
  if (deckIds.length === 0) return [];
  return deckIds
    .map((id) => optionsOf(id, key))
    .reduce((acc, cur) => acc.filter((v) => cur.includes(v)));
}
