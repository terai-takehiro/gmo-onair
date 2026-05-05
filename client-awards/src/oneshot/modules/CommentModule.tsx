import type { Lang, Nominee } from '../types';

export default function CommentModule({ n, lang }: { n: Nominee; lang: Lang }) {
  const isJa = lang === 'ja';
  return (
    <>
      <span className="lt-module-label">
        {isJa ? 'ノミネート者コメント' : 'Nominee Comment'}
      </span>
      <div className="lt-module-body">{isJa ? n.comment : n.commentEn}</div>
    </>
  );
}
