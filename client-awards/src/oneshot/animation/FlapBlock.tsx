import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  delay?: number;
  className?: string;
}

// 単語ブロック単位でフェード入場
export default function FlapBlock({ children, delay = 0, className = '' }: Props) {
  return (
    <div className={`flap-block ${className}`} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
