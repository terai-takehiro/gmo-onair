import { useEffect, useState, useMemo } from 'react';
import type { CgCategory, CgMappedEntry } from '../types';
import { POLL_DURATION_MS } from '../types';

interface Props {
  category: CgCategory | null;
  entries: CgMappedEntry[];   // sorted by rank
  startedAt: number | null;   // epoch ms, null=未開始 (TAKE 前)
  lang: 'ja' | 'en';
}

/**
 * アンケート投票画面 (投票No.1決定パターン専用)
 * - タイトル / 質問文 / TOP3 の3択カード / 30秒カウントダウン
 * - 中央にカメラ合成枠 (アルファ透過のホール)
 */
export default function StepPoll({ category, entries, startedAt, lang }: Props) {
  const top3 = useMemo(() => entries.filter((e) => e.rank >= 1 && e.rank <= 3), [entries]);

  const title = lang === 'en'
    ? (category?.poll_title_en || category?.poll_title || category?.name_en || category?.name || '')
    : (category?.poll_title || category?.name || '');
  const question = lang === 'en'
    ? (category?.poll_question_en || category?.poll_question || 'Who deserves the award?')
    : (category?.poll_question || 'Q. もっともふさわしいのは？');

  // カウントダウン (startedAt が null の間は 30 で表示)
  const [remaining, setRemaining] = useState(POLL_DURATION_MS);
  useEffect(() => {
    if (startedAt == null) {
      setRemaining(POLL_DURATION_MS);
      return;
    }
    const tick = () => {
      const left = Math.max(0, POLL_DURATION_MS - (Date.now() - startedAt));
      setRemaining(left);
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const secs = Math.ceil(remaining / 1000);
  const ratio = remaining / POLL_DURATION_MS;
  const isLast10 = secs <= 10;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'transparent',
      }}
    >
      {/* 上部: タイトル + 質問文 */}
      <div
        style={{
          position: 'absolute',
          top: 70,
          left: 80,
          right: 80,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 22,
            letterSpacing: '0.55em',
            color: '#F5D76E',
            marginBottom: 14,
          }}
        >
          REAL-TIME VOTE
        </div>
        <div
          style={{
            fontFamily: "'Noto Sans JP', sans-serif",
            fontWeight: 900,
            fontSize: 60,
            color: '#fff',
            textShadow: '0 2px 12px rgba(0,0,0,0.7)',
            letterSpacing: '0.04em',
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 18,
            fontFamily: "'Noto Sans JP', sans-serif",
            fontSize: 32,
            fontWeight: 700,
            color: '#F5D76E',
            letterSpacing: '0.06em',
          }}
        >
          {question}
        </div>
      </div>

      {/* 中央: カメラ合成枠 (アルファ透過のホール) */}
      <CameraHole />

      {/* カウントダウン (右上) */}
      <div
        style={{
          position: 'absolute',
          top: 80,
          right: 80,
          width: 200,
          height: 200,
          borderRadius: '50%',
          background: isLast10
            ? 'radial-gradient(circle, rgba(180,40,40,0.95), rgba(80,10,10,0.95))'
            : 'radial-gradient(circle, rgba(20,28,40,0.95), rgba(8,12,20,0.95))',
          border: `3px solid ${isLast10 ? '#ff6b4a' : '#F5D76E'}`,
          boxShadow: `0 0 40px ${isLast10 ? 'rgba(255,80,40,0.6)' : 'rgba(245,215,110,0.4)'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 12,
            letterSpacing: '0.4em',
            color: isLast10 ? '#ffd0c0' : '#F5D76E',
            marginBottom: 4,
          }}
        >
          TIME LEFT
        </div>
        <div
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 110,
            fontWeight: 900,
            color: '#fff',
            lineHeight: 1,
            textShadow: '0 2px 12px rgba(0,0,0,0.8)',
          }}
        >
          {secs}
        </div>
        {/* progress ring */}
        <svg
          width={200}
          height={200}
          style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}
        >
          <circle
            cx={100}
            cy={100}
            r={92}
            fill="none"
            stroke={isLast10 ? '#ff6b4a' : '#F5D76E'}
            strokeWidth={4}
            strokeDasharray={`${2 * Math.PI * 92}`}
            strokeDashoffset={`${2 * Math.PI * 92 * (1 - ratio)}`}
            opacity={0.85}
          />
        </svg>
      </div>

      {/* 下部: 3択カード */}
      <div
        style={{
          position: 'absolute',
          bottom: 80,
          left: 80,
          right: 80,
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 24,
        }}
      >
        {top3.map((e, i) => (
          <ChoiceCard key={e.id} index={i + 1} entry={e} lang={lang} />
        ))}
        {top3.length === 0 && (
          <div style={{ gridColumn: '1 / -1', color: '#aaa', textAlign: 'center', fontSize: 28 }}>
            TOP3 が設定されていません
          </div>
        )}
      </div>
    </div>
  );
}

/** 中央のカメラ合成用アルファホール (透過矩形) */
function CameraHole() {
  // 1920x1080 中央に 920x520 の透過枠
  const w = 920;
  const h = 520;
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -42%)',
        width: w,
        height: h,
        pointerEvents: 'none',
      }}
    >
      {/* 内側: 完全透過 (アルファチャンネル ON で抜ける) */}
      <div
        style={{
          position: 'absolute',
          inset: 6,
          background: 'transparent',
          // OBS の Color Key で抜くのではなくアルファチャンネルそのまま
        }}
      />
      {/* 外枠: ゴールド ダブルライン */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          border: '3px solid #F5D76E',
          boxShadow: '0 0 40px rgba(245,215,110,0.45), inset 0 0 24px rgba(245,215,110,0.25)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: -8,
          border: '1px solid rgba(245,215,110,0.45)',
          pointerEvents: 'none',
        }}
      />
      {/* コーナー装飾 */}
      {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
        <div
          key={c}
          style={{
            position: 'absolute',
            width: 28,
            height: 28,
            ...(c === 'tl' && { top: -2, left: -2, borderTop: '4px solid #F5D76E', borderLeft: '4px solid #F5D76E' }),
            ...(c === 'tr' && { top: -2, right: -2, borderTop: '4px solid #F5D76E', borderRight: '4px solid #F5D76E' }),
            ...(c === 'bl' && { bottom: -2, left: -2, borderBottom: '4px solid #F5D76E', borderLeft: '4px solid #F5D76E' }),
            ...(c === 'br' && { bottom: -2, right: -2, borderBottom: '4px solid #F5D76E', borderRight: '4px solid #F5D76E' }),
          }}
        />
      ))}
      <div
        style={{
          position: 'absolute',
          top: -28,
          left: 0,
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 14,
          letterSpacing: '0.4em',
          color: 'rgba(245,215,110,0.85)',
        }}
      >
        LIVE CAM
      </div>
    </div>
  );
}

function ChoiceCard({ index, entry, lang }: { index: number; entry: CgMappedEntry; lang: 'ja' | 'en' }) {
  const colors = [
    { from: '#1a4a8a', to: '#0c2a55', accent: '#5d9cff' }, // 1: blue
    { from: '#8b1f1f', to: '#4a0a0a', accent: '#ff7d6b' }, // 2: red
    { from: '#1a6638', to: '#0a3520', accent: '#7eea9c' }, // 3: green
  ][index - 1];
  const name = lang === 'en' ? (entry.nameEn || entry.name) : entry.name;
  const company = lang === 'en' ? (entry.orgEn || entry.company) : entry.company;
  return (
    <div
      style={{
        position: 'relative',
        background: `linear-gradient(150deg, ${colors.from}, ${colors.to})`,
        border: '2px solid rgba(245,215,110,0.5)',
        borderRadius: 10,
        padding: '26px 20px 22px 84px',
        minHeight: 130,
        boxShadow: '0 8px 30px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.12)',
      }}
    >
      {/* 番号バッジ */}
      <div
        style={{
          position: 'absolute',
          left: -8,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 76,
          height: 76,
          background: `radial-gradient(circle at 35% 30%, #fff, ${colors.accent} 70%, #1a1a1a)`,
          clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: 50,
          fontWeight: 900,
          color: '#fff',
          textShadow: '0 2px 4px rgba(0,0,0,0.7)',
        }}
      >
        {index}
      </div>
      <div
        style={{
          fontFamily: "'Noto Sans JP', sans-serif",
          fontWeight: 900,
          fontSize: 30,
          color: '#fff',
          textShadow: '0 2px 6px rgba(0,0,0,0.6)',
          lineHeight: 1.15,
          letterSpacing: '0.02em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}
      >
        {name}
      </div>
      {company && (
        <div
          style={{
            marginTop: 6,
            fontFamily: "'Noto Sans JP', sans-serif",
            fontSize: 18,
            color: 'rgba(255,255,255,0.85)',
            letterSpacing: '0.04em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {company}
        </div>
      )}
    </div>
  );
}
