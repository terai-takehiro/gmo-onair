import type { Lang, Nominee, TickerCategory, TickerItem } from '../types';

// 賞 → 部門 → items の階層構造でグルーピング。
// ティッカーは賞単位で 1 本になり、内部で部門を順番にローテーションする。
export function groupNomineesForTicker(nominees: Nominee[], lang: Lang): TickerCategory[] {
  const awardMap = new Map<string, Map<string, TickerItem[]>>();
  const awardOrder: string[] = [];
  const divisionOrder = new Map<string, string[]>();

  for (const n of nominees) {
    const award = lang === 'ja' ? n.category : n.categoryEn;
    const division = lang === 'ja' ? n.subcategory : n.subcategoryEn;

    if (!awardMap.has(award)) {
      awardMap.set(award, new Map());
      divisionOrder.set(award, []);
      awardOrder.push(award);
    }
    const divMap = awardMap.get(award)!;
    if (!divMap.has(division)) {
      divMap.set(division, []);
      divisionOrder.get(award)!.push(division);
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
    divMap.get(division)!.push({ name, company });
  }

  return awardOrder.map((award) => ({
    award,
    divisions: divisionOrder.get(award)!.map((division) => ({
      division,
      items: awardMap.get(award)!.get(division)!,
    })),
  }));
}
