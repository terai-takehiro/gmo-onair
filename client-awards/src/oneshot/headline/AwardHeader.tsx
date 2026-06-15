import { useCondense } from '../hooks/useCondense';
import type { Lang, Nominee } from '../types';

export default function AwardHeader({ n, lang }: { n: Nominee; lang: Lang }) {
  const isJa = lang === 'ja';
  const sub = isJa ? n.subcategory : n.subcategoryEn;
  const name = isJa ? n.category : n.categoryEn;

  // 長い賞名/部門名は flex でラッパー幅を縮め、useCondense が scaleX (長体) で収める。
  // (旧: nowrap のまま保護なしで GMO AWARDS 2026 を押し出してはみ出していた)
  const nameRef = useCondense<HTMLSpanElement>([n.id, lang, name], 0.5);
  const subRef = useCondense<HTMLSpanElement>([n.id, lang, sub], 0.5);
  const shrinkWrap: React.CSSProperties = { flex: '0 1 auto', minWidth: 0, overflow: 'hidden' };

  return (
    <div className="lt-award-row">
      <span style={shrinkWrap}>
        <span ref={nameRef} className="lt-award-name">{name}</span>
      </span>
      {sub && (
        <>
          <span className="lt-award-divider" />
          <span style={shrinkWrap}>
            <span ref={subRef} className="lt-award-sub">{sub}</span>
          </span>
        </>
      )}
      <span className="lt-award-spacer" />
      <span className="lt-entry-mini">GMO AWARDS 2026</span>
    </div>
  );
}
