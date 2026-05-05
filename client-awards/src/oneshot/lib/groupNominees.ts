import type { Lang, Nominee, TickerCategory } from '../types';

// 部門ごとにノミネートをグルーピング → ティッカー用カテゴリ一覧
export function groupNomineesForTicker(nominees: Nominee[], lang: Lang): TickerCategory[] {
  const map = new Map<string, { name: string; company: string }[]>();
  const order: string[] = [];

  for (const n of nominees) {
    const key = lang === 'ja' ? n.category : n.categoryEn;
    if (!map.has(key)) {
      map.set(key, []);
      order.push(key);
    }
    const name =
      n.type === 'team'
        ? lang === 'ja'
          ? n.projectName ?? n.name
          : n.projectNameEn ?? n.nameEn
        : lang === 'ja'
        ? n.name
        : n.nameEn;
    const company = lang === 'ja' ? n.company : n.companyEn;
    map.get(key)!.push({ name, company });
  }

  return order.map((category) => ({ category, items: map.get(category)! }));
}
