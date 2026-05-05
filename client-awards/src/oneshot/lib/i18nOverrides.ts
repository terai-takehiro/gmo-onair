// 賞・部門 の英訳をブラウザ localStorage に保存する辞書層。
// DB の awards_categories.name_en / description_en に対する override として
// 機能し、DB を削除しても (= 新しいイベントを作り直しても) ブラウザ側に
// 翻訳が残る。デバイス間移動は JSON export/import で行う。

const STORAGE_KEY = 'awards-cg-i18n-overrides';

export interface I18nOverrides {
  /** 賞名 (JA) → 賞名 (EN) */
  awards: Record<string, string>;
  /** 部門名 (JA) → 部門名 (EN) */
  divisions: Record<string, string>;
}

export const EMPTY_OVERRIDES: I18nOverrides = { awards: {}, divisions: {} };

export function loadOverrides(): I18nOverrides {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_OVERRIDES;
    const parsed = JSON.parse(raw) as Partial<I18nOverrides>;
    return {
      awards: parsed.awards ?? {},
      divisions: parsed.divisions ?? {},
    };
  } catch {
    return EMPTY_OVERRIDES;
  }
}

export function saveOverrides(o: I18nOverrides): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
  } catch {
    // localStorage が使えない環境 (private mode / quota) では no-op
  }
}

/** 賞 JA 名から EN 訳を解決。優先: localStorage override > dbEn > JA fallback */
export function resolveAwardEn(
  ja: string,
  dbEn: string | null | undefined,
  overrides: I18nOverrides,
): string {
  const o = overrides.awards[ja];
  if (o && o.trim()) return o;
  if (dbEn && dbEn.trim()) return dbEn;
  return ja;
}

/** 部門 JA 名から EN 訳を解決。優先: localStorage override > dbEn > JA fallback */
export function resolveDivisionEn(
  ja: string,
  dbEn: string | null | undefined,
  overrides: I18nOverrides,
): string {
  if (!ja) return dbEn ?? '';
  const o = overrides.divisions[ja];
  if (o && o.trim()) return o;
  if (dbEn && dbEn.trim()) return dbEn;
  return ja;
}

export function exportOverridesJson(o: I18nOverrides): string {
  return JSON.stringify(o, null, 2);
}

export function parseOverridesJson(json: string): I18nOverrides | null {
  try {
    const parsed = JSON.parse(json) as Partial<I18nOverrides>;
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      awards: parsed.awards && typeof parsed.awards === 'object' ? parsed.awards : {},
      divisions:
        parsed.divisions && typeof parsed.divisions === 'object' ? parsed.divisions : {},
    };
  } catch {
    return null;
  }
}
