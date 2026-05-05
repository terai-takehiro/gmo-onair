import type { Lang, Nominee } from '../types';

export default function RespectModule({ n, lang }: { n: Nominee; lang: Lang }) {
  const isJa = lang === 'ja';
  return (
    <>
      <div className="lt-module-head">
        <span className="lt-module-label">
          {isJa ? '推薦者の尊敬ポイント' : 'Why we respect'}
        </span>
        <span className="lt-module-byline">
          <span className="lt-byline-divider" />
          <span className="lt-byline-by">{isJa ? '推薦' : 'by'}</span>
          <span className="lt-byline-name">
            {isJa ? n.recommender.name : n.recommender.nameEn}
          </span>
          <span className="lt-byline-pos">
            {isJa ? n.recommender.position : n.recommender.positionEn}
          </span>
        </span>
      </div>
      <div className="lt-respect">
        {isJa ? n.recommender.respect : n.recommender.respectEn}
      </div>
    </>
  );
}
