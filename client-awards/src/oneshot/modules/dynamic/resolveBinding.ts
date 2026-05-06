import type { Lang, Nominee, SlotBinding } from '../../types';

// ── 段階2 (v2.8.72): SlotBinding → 値の解決 ────────────────
// SlotBinding を渡すと現在のノミネート + lang から実値を返す。
// lang='en' のときは `${field}En` の対応フィールドを探し、無ければ JA にフォールバック。

export function resolveBinding(binding: SlotBinding, n: Nominee, lang: Lang): unknown {
  const isJa = lang === 'ja';

  switch (binding.source) {
    case 'literal':
      return isJa ? binding.ja : binding.en;

    case 'nominee': {
      const obj = n as unknown as Record<string, unknown>;
      const ja = obj[binding.field];
      const en = obj[binding.field + 'En'];
      return isJa ? ja : (en ?? ja);
    }

    case 'recommender': {
      const r = n.recommender as unknown as Record<string, unknown>;
      const ja = r[binding.field];
      const en = r[binding.field + 'En'];
      return isJa ? ja : (en ?? ja);
    }

    case 'oneshot_raw': {
      // 段階2 では Nominee に raw oneshot_data が入っていない前提のため undefined。
      // 段階4 で Nominee に _raw: Record<string, unknown> を追加して有効化する。
      // (Excel "そのまま保存" 列にバインドしたカスタムモジュールはこの段階では空表示)
      const obj = n as unknown as Record<string, unknown>;
      const raw = obj._raw as Record<string, unknown> | undefined;
      return raw?.[binding.key];
    }
  }
}

/** 値を表示文字列に変換 (null/undefined は空、配列は素通し、それ以外は String) */
export function asText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return String(v);
}

/** 値を文字列配列に変換 (タグリスト等で使用) */
export function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => asText(x)).filter(Boolean);
  if (typeof v === 'string' && v.trim()) {
    return v.split(/\s*[、,／/]\s*/).filter(Boolean);
  }
  return [];
}
