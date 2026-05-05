import type { Lang, Nominee } from '../types';

export default function AwardHeader({ n, lang }: { n: Nominee; lang: Lang }) {
  const isJa = lang === 'ja';
  // v2.8.73: 「部門部門」二重表示バグ修正
  // Excel import 時に rawDiv に「部門」が付いていなければ自動で append されているため、
  // ここでさらに ' 部門' を加えると重複する (例: 「エントリー部門 部門」)。
  // データの値をそのまま表示し、サフィックスは付けない。
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
