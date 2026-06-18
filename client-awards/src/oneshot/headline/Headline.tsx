import { useCondense } from '../hooks/useCondense';
import type { Lang, Nominee } from '../types';

export default function Headline({
  n, lang, isWide,
}: { n: Nominee; lang: Lang; isWide: boolean }) {
  const isJa = lang === 'ja';
  const isTeam = n.type === 'team';

  const projectRef = useCondense<HTMLSpanElement>([n.id, lang, isWide]);
  const nameRef = useCondense<HTMLSpanElement>([n.id, lang, isWide]);
  const companyRef = useCondense<HTMLDivElement>([n.id, lang, isWide], 0.6);
  const leadRef = useCondense<HTMLDivElement>([n.id, lang, isWide], 0.6);

  if (isTeam) {
    // プロジェクト名が無いチーム (= ノミネート名自体がチーム名) は name をヘッドラインに使う。
    // その場合は「代表：name」が見出しと重複するため代表行は出さない。
    const hasProject = isJa ? !!n.projectName : !!n.projectNameEn;
    const projectText = isJa ? (n.projectName || n.name) : (n.projectNameEn || n.nameEn);
    return (
      <div className="lt-headline">
        <div className="lt-name-row">
          <div className={'lt-project lt-name-block ' + (isJa ? '' : 'en')}>
            <span ref={projectRef}>{projectText}</span>
          </div>
          <div className="lt-affil-block">
            <div ref={companyRef} className="lt-company">{isJa ? n.company : n.companyEn}</div>
            {hasProject && (
              <div ref={leadRef} className="lt-dept">
                {isJa ? '代表' : 'Lead'}：{isJa ? n.name : n.nameEn}
              </div>
            )}
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
          <div ref={companyRef} className="lt-company">{isJa ? n.company : n.companyEn}</div>
          <div className="lt-dept">{isJa ? n.department : n.departmentEn}</div>
        </div>
      </div>
    </div>
  );
}
