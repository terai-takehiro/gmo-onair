// 収録設定の候補（#279 §2-1）。**唯一の正ではない**（機器の capabilities が本当の正）。
// 「よく使う候補」として出し、自由入力も許す（弾くのは現地の仕事）。

export const DECK_IDS_MAIN = ['REC1', 'REC2', 'REC3', 'REC4', 'REC5', 'REC6', 'REC7', 'REC8'] as const; // Studio 4K Pro（本線）
export const DECK_IDS_BACKUP = ['REC1-P', 'REC2-P', 'REC3-P', 'REC4-P'] as const; // HD Plus（控え）

export function isHdPlus(deckId: string): boolean {
  return deckId.endsWith('-P');
}

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
