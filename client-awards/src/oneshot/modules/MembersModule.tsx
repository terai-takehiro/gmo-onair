import type { Lang, Nominee } from '../types';

export default function MembersModule({ n, lang }: { n: Nominee; lang: Lang }) {
  const isJa = lang === 'ja';
  const list = (isJa ? n.members : n.membersEn) ?? [];
  return (
    <>
      <span className="lt-module-label">
        {isJa ? 'チームメンバー' : 'Team Members'} · {n.teamSize ?? list.length}
      </span>
      <div className="lt-members">
        {list.map((m, i) => (
          <div
            key={i}
            className="lt-member flap-block"
            style={{ animationDelay: `${i * 70 + 120}ms` }}
          >
            <div className="lt-member-role">{m.role}</div>
            <div className="lt-member-name">{m.name}</div>
            <div className="lt-member-co">{m.company}</div>
          </div>
        ))}
      </div>
    </>
  );
}
