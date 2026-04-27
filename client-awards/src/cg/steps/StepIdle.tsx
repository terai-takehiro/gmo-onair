import { CG_W, CG_H } from '../types';

interface Props {
  awardName: string;
  divisionName: string;
  lang: 'ja' | 'en';
}

export default function StepIdle({ awardName, divisionName, lang }: Props) {
  const langLabel = lang === 'en' ? 'ENGLISH' : '日本語';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        width: CG_W,
        height: CG_H,
        background: '#07090f',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: "'Noto Sans JP', 'Noto Sans', sans-serif",
        userSelect: 'none',
      }}
    >
      {/* Subtle grid lines for broadcast reference */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(255,255,255,.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.025) 1px, transparent 1px)',
        backgroundSize: '120px 120px',
        pointerEvents: 'none',
      }} />

      {/* Center card */}
      <div style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0,
        textAlign: 'center',
      }}>

        {/* Category info */}
        <div style={{
          border: '1px solid rgba(255,255,255,.12)',
          borderRadius: 16,
          padding: '48px 80px',
          background: 'rgba(255,255,255,.04)',
          backdropFilter: 'blur(4px)',
          minWidth: 640,
        }}>
          {awardName && (
            <div style={{
              fontSize: 48,
              fontWeight: 700,
              color: '#F5D76E',
              letterSpacing: '0.05em',
              marginBottom: divisionName ? 12 : 0,
            }}>
              {awardName}
            </div>
          )}
          {divisionName && (
            <div style={{
              fontSize: 36,
              fontWeight: 400,
              color: 'rgba(255,255,255,.7)',
              letterSpacing: '0.04em',
            }}>
              {divisionName}
            </div>
          )}
          {!awardName && !divisionName && (
            <div style={{ fontSize: 32, color: 'rgba(255,255,255,.3)', fontWeight: 300 }}>
              — カテゴリ未選択 —
            </div>
          )}

          {/* Divider */}
          <div style={{ margin: '32px auto', width: 120, height: 1, background: 'rgba(255,255,255,.1)' }} />

          {/* Lang badge */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            background: 'rgba(255,255,255,.06)',
            border: '1px solid rgba(255,255,255,.15)',
            borderRadius: 999,
            padding: '8px 24px',
            fontSize: 22,
            fontWeight: 500,
            color: 'rgba(255,255,255,.5)',
            letterSpacing: '0.08em',
          }}>
            <span style={{ fontSize: 18 }}>{lang === 'en' ? '🇺🇸' : '🇯🇵'}</span>
            {langLabel}
          </div>
        </div>

        {/* STANBY OK */}
        <div style={{
          marginTop: 56,
          display: 'flex',
          alignItems: 'center',
          gap: 20,
        }}>
          {/* Pulse dot */}
          <div style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: '#4ade80',
            boxShadow: '0 0 0 6px rgba(74,222,128,.2), 0 0 20px rgba(74,222,128,.4)',
            animation: 'idlePulse 2s ease-in-out infinite',
          }} />
          <div style={{
            fontSize: 64,
            fontWeight: 900,
            color: '#ffffff',
            letterSpacing: '0.06em',
          }}>
            送出 STANBY OK!!
          </div>
        </div>

      </div>

      {/* Corner rulers */}
      {[
        { top: 40, left: 40 },
        { top: 40, right: 40 },
        { bottom: 40, left: 40 },
        { bottom: 40, right: 40 },
      ].map((pos, i) => (
        <div key={i} style={{
          position: 'absolute',
          width: 40, height: 40,
          borderTop: i < 2 ? '2px solid rgba(255,255,255,.15)' : undefined,
          borderBottom: i >= 2 ? '2px solid rgba(255,255,255,.15)' : undefined,
          borderLeft: i % 2 === 0 ? '2px solid rgba(255,255,255,.15)' : undefined,
          borderRight: i % 2 === 1 ? '2px solid rgba(255,255,255,.15)' : undefined,
          ...pos,
        }} />
      ))}

      <style>{`
        @keyframes idlePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: .5; transform: scale(.85); }
        }
      `}</style>
    </div>
  );
}
