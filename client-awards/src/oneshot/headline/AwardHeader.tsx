import type { Lang, Nominee } from '../types';

export default function AwardHeader({ n, lang }: { n: Nominee; lang: Lang }) {
  const isJa = lang === 'ja';
  const sub = isJa ? n.subcategory : n.subcategoryEn;
  return (
    <div className="lt-award-row">
      <span className="lt-award-name">{isJa ? n.category : n.categoryEn}</span>
      {sub && (
        <>
          <span className="lt-award-divider" />
          <span className="lt-award-sub">{sub}</span>
        </>
      )}
      <span className="lt-award-spacer" />
      <span className="lt-entry-mini">GMO AWARDS 2026</span>
    </div>
  );
}
