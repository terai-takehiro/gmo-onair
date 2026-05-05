import type { Lang, Nominee } from '../types';

export default function AwardHeader({
  n, lang, bilingual = false,
}: { n: Nominee; lang: Lang; bilingual?: boolean }) {
  const isJa = lang === 'ja';
  const subJa = n.subcategory;
  const subEn = n.subcategoryEn;

  // v2.8.79: bilingual=true のとき、JA + EN の 2 行で賞ヘッダーを表示
  if (bilingual) {
    return (
      <div className="lt-award-bilingual">
        <div className="lt-award-row">
          <span className="lt-award-name">{n.category}</span>
          {subJa && (
            <>
              <span className="lt-award-divider" />
              <span className="lt-award-sub">{subJa}</span>
            </>
          )}
          <span className="lt-award-spacer" />
          <span className="lt-entry-mini">GMO AWARDS 2026</span>
        </div>
        <div className="lt-award-row lt-award-row-en">
          <span className="lt-award-name">{n.categoryEn}</span>
          {subEn && (
            <>
              <span className="lt-award-divider" />
              <span className="lt-award-sub">{subEn}</span>
            </>
          )}
        </div>
      </div>
    );
  }

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
