import { type ElementType } from 'react';

interface Props {
  text: string | null | undefined;
  stagger?: number;
  className?: string;
  as?: ElementType;
}

// 文字単位でフリップ風に出すコンポーネント
export default function FlapText({ text, stagger = 25, className = '', as: Tag = 'span' }: Props) {
  if (!text) return null;
  const chars = String(text).split('');
  return (
    <Tag className={className}>
      {chars.map((c, i) => (
        <span key={i} className="flap-char" style={{ animationDelay: `${i * stagger}ms` }}>
          {c === ' ' ? ' ' : c}
        </span>
      ))}
    </Tag>
  );
}
