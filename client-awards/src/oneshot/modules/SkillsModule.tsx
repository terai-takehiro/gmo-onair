import type { Lang, Nominee } from '../types';

export default function SkillsModule({ n, lang }: { n: Nominee; lang: Lang }) {
  const isJa = lang === 'ja';
  const list = isJa ? n.skills : n.skillsEn;
  return (
    <>
      <span className="lt-module-label">
        {isJa ? '私の得意技 / イズム' : 'My Strengths'}
      </span>
      <div className="lt-tags-ism">{isJa ? n.ism : n.ismEn}</div>
      <div className="lt-tags">
        {list.slice(0, 8).map((s, i) => (
          <span
            key={i}
            className="lt-tag flap-block"
            style={{ animationDelay: `${i * 40 + 150}ms` }}
          >
            {s}
          </span>
        ))}
      </div>
    </>
  );
}
