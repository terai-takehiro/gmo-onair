import { useCondense } from '../hooks/useCondense';
import type { Lang, Nominee } from '../types';

export default function Headline({
  n, lang, isWide,
}: { n: Nominee; lang: Lang; isWide: boolean }) {
  const isJa = lang === 'ja';
  const isTeam = n.type === 'team';

  const projectRef = useCondense<HTMLSpanElement>([n.id, lang, isWide]);
  const nameRef = useCondense<HTMLSpanElement>([n.id, lang, isWide]);

  if (isTeam) {
    return (
      <div className="lt-headline">
        <div className="lt-name-row">
          <div className={'lt-project lt-name-block ' + (isJa ? '' : 'en')}>
            <span ref={projectRef}>{isJa ? n.projectName : n.projectNameEn}</span>
          </div>
          <div className="lt-affil-block">
            <div className="lt-company">{isJa ? n.company : n.companyEn}</div>
            <div className="lt-dept">
              {isJa ? '代表' : 'Lead'}：{isJa ? n.name : n.nameEn}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lt-headline">
      <div className="lt-name-row">
        <div className="lt-name-block">
          <span ref={nameRef} className={'lt-name ' + (isJa ? '' : 'en')}>
            {isJa ? n.name : n.nameEn}
          </span>
          {isJa && <span className="lt-name-romaji">{n.nameEn}</span>}
        </div>
        <div className="lt-affil-block">
          <div className="lt-company">{isJa ? n.company : n.companyEn}</div>
          <div className="lt-dept">{isJa ? n.department : n.departmentEn}</div>
        </div>
      </div>
    </div>
  );
}
