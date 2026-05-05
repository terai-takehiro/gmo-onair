import { useCondense } from '../hooks/useCondense';
import type { Lang, Nominee } from '../types';

export default function Headline({
  n, lang, isWide, bilingual = false,
}: { n: Nominee; lang: Lang; isWide: boolean; bilingual?: boolean }) {
  const isJa = lang === 'ja';
  const isTeam = n.type === 'team';

  const projectRef = useCondense<HTMLSpanElement>([n.id, lang, isWide, bilingual]);
  const nameRef = useCondense<HTMLSpanElement>([n.id, lang, isWide, bilingual]);

  if (isTeam) {
    if (bilingual) {
      // v2.8.79: bilingual=true のとき、JA + EN の 2 行で表示
      return (
        <div className="lt-headline">
          <div className="lt-name-row">
            <div className="lt-project lt-name-block">
              <span ref={projectRef}>{n.projectName}</span>
            </div>
            <div className="lt-affil-block">
              <div className="lt-company">{n.company}</div>
              <div className="lt-dept">代表：{n.name}</div>
            </div>
          </div>
          <div className="lt-name-row lt-name-row-en">
            <div className="lt-project lt-name-block en">
              <span>{n.projectNameEn}</span>
            </div>
            <div className="lt-affil-block">
              <div className="lt-company">{n.companyEn}</div>
              <div className="lt-dept">Lead：{n.nameEn}</div>
            </div>
          </div>
        </div>
      );
    }
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

  if (bilingual) {
    // 個人 + bilingual: JA name + JA company を 1 行目、EN name + EN company を 2 行目
    return (
      <div className="lt-headline">
        <div className="lt-name-row">
          <div className="lt-name-block">
            <span ref={nameRef} className="lt-name">{n.name}</span>
            <span className="lt-name-romaji">{n.nameEn}</span>
          </div>
          <div className="lt-affil-block">
            <div className="lt-company">{n.company}</div>
            <div className="lt-dept">{n.department}</div>
          </div>
        </div>
        <div className="lt-name-row lt-name-row-en">
          <div className="lt-name-block">
            <span className="lt-name en">{n.nameEn}</span>
          </div>
          <div className="lt-affil-block">
            <div className="lt-company">{n.companyEn}</div>
            <div className="lt-dept">{n.departmentEn}</div>
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
