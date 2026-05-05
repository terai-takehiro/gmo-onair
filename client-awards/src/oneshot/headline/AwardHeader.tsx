import type { Lang, Nominee } from '../types';

export default function AwardHeader({ n, lang }: { n: Nominee; lang: Lang }) {
  const isJa = lang === 'ja';
  return (
    <div className="lt-award-row">
      <span className="lt-award-name">{isJa ? n.category : n.categoryEn}</span>
      <span className="lt-award-divider" />
      <span className="lt-award-sub">
        {isJa ? n.subcategory : n.subcategoryEn}
        {isJa ? ' 部門' : ''}
      </span>
      <span className="lt-award-spacer" />
      <span className="lt-entry-mini">GMO AWARDS 2026</span>
    </div>
  );
}
