import type { Lang, Nominee } from '../types';

export default function TitleModule({ n, lang }: { n: Nominee; lang: Lang }) {
  const isJa = lang === 'ja';
  return (
    <>
      <span className="lt-module-label">
        {isJa ? 'ノミネートタイトル' : 'Nomination'}
      </span>
      <div className="lt-module-title">{isJa ? n.title : n.titleEn}</div>
    </>
  );
}
