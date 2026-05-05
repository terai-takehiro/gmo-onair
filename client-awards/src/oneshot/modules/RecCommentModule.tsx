import type { Lang, Nominee } from '../types';

export default function RecCommentModule({ n, lang }: { n: Nominee; lang: Lang }) {
  const isJa = lang === 'ja';
  return (
    <>
      <div className="lt-module-head">
        <span className="lt-module-label">
          {isJa ? '推薦者コメント' : 'From the Recommender'}
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
      <div className="lt-rec-body">
        <span className="lt-rec-quote-l">“</span>
        {isJa ? n.recommender.respectComment : n.recommender.respectCommentEn}
        <span className="lt-rec-quote-r">”</span>
      </div>
    </>
  );
}
