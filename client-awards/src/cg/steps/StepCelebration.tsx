import { useMemo } from 'react';
import type { CgCategory, CgMappedEntry } from '../types';
import { CondenseText } from '../components/CondenseText';

interface WinnerItem {
  entry: CgMappedEntry;
  categoryDesc: string;   // 部門名
  pollTitle?: string;     // vote パターン時の poll_title
}

interface Props {
  categories: CgCategory[];  // 同じ award name グループのカテゴリのみ渡す想定
  awardName: string;          // ○○賞
  // 手動選択 No.1 (投票No.1決定でアンケート未紐づけのとき)。該当カテゴリだけ rank=1 を上書き。
  winnerOverride?: { categoryId: number; entryId: number } | null;
  lang: 'ja' | 'en';
}

export default function StepCelebration({ categories, awardName, winnerOverride, lang }: Props) {
  const winners = useMemo<WinnerItem[]>(() => {
    return categories.map((c) => {
      const overrideId = winnerOverride && winnerOverride.categoryId === c.id ? winnerOverride.entryId : null;
      const w = (overrideId != null ? c.entries.find((e) => e.id === overrideId) : undefined)
        ?? c.entries.find((e) => e.rank === 1 || e.is_winner);
      if (!w) return null;
      const photo = w.photo_url ?? undefined;
      const od = (w as unknown as { oneshot_data?: Record<string, unknown> }).oneshot_data;
      return {
        entry: {
          id: String(w.id),
          rank: 1,
          name: lang === 'en' ? (w.name_en || w.name) : w.name,
          nameEn: w.name_en ?? undefined,
          company: lang === 'en' ? (w.org_en || w.org || '') : (w.org ?? ''),
          orgEn: w.org_en ?? undefined,
          points: w.points ?? 0,
          photo,
          is_winner: true,
        } as CgMappedEntry,
        categoryDesc: lang === 'en' ? (c.description_en || c.description || '') : (c.description || c.name),
        pollTitle: lang === 'en'
          ? (c.poll_title_en || c.poll_title || undefined)
          : (c.poll_title || undefined),
        _od: od,
      } as WinnerItem & { _od?: Record<string, unknown> };
    }).filter((x): x is WinnerItem => x !== null);
  }, [categories, lang, winnerOverride]);

  // 紙吹雪
  const confetti = useMemo(() => {
    const rnd = mulberry32(20260620);
    return Array.from({ length: 60 }).map((_, i) => ({
      x: rnd() * 1920,
      delay: rnd() * 0.6,
      dur: 3 + rnd() * 2.5,
      rot: rnd() * 360,
      color: ['#F5D76E', '#ffb347', '#fff7c2', '#ff7d6b', '#5db4ff', '#7eea9c', '#c46ee0'][i % 7],
      w: 8 + rnd() * 10,
      h: 14 + rnd() * 18,
      drift: -50 + rnd() * 100,
    }));
  }, []);

  // 横並び: N 枚を等間隔配置
  const n = winners.length;
  const padX = 80;
  const availW = 1920 - padX * 2;
  const cardW = Math.max(180, Math.min(360, Math.floor((availW - 24 * (n - 1)) / Math.max(1, n))));
  const cardH = Math.round(cardW * (4 / 3));

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <style>{`
        @keyframes celebConfettiFall {
          0%   { transform: translate(0,-60px) rotate(0deg); opacity: 0; }
          5%   { opacity: 1; }
          100% { transform: translate(var(--drift, 0px), 1240px) rotate(720deg); opacity: 0.85; }
        }
        @keyframes celebTitleIn {
          from { opacity: 0; transform: translateY(-30px) scale(0.92); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes celebCardIn {
          from { opacity: 0; transform: translateY(40px) scale(0.92); }
          to   { opacity: 1; transform: translateY(0)    scale(1); }
        }
        @keyframes celebGlow {
          0%, 100% {
            filter:
              drop-shadow(2px 2px 0 rgba(0,0,0,0.92)) drop-shadow(-2px 2px 0 rgba(0,0,0,0.92))
              drop-shadow(2px -2px 0 rgba(0,0,0,0.92)) drop-shadow(-2px -2px 0 rgba(0,0,0,0.92))
              drop-shadow(0 4px 14px rgba(0,0,0,0.9)) drop-shadow(0 0 18px rgba(245,215,110,0.55));
          }
          50% {
            filter:
              drop-shadow(2px 2px 0 rgba(0,0,0,0.92)) drop-shadow(-2px 2px 0 rgba(0,0,0,0.92))
              drop-shadow(2px -2px 0 rgba(0,0,0,0.92)) drop-shadow(-2px -2px 0 rgba(0,0,0,0.92))
              drop-shadow(0 4px 14px rgba(0,0,0,0.9)) drop-shadow(0 0 30px rgba(255,200,80,0.95));
          }
        }
      `}</style>

      {/* 紙吹雪 */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {confetti.map((c, i) => (
          <div key={i} style={{
            position: 'absolute',
            left: c.x, top: -20,
            width: c.w, height: c.h,
            background: c.color,
            opacity: 0.9,
            ['--drift' as never]: `${c.drift}px`,
            animation: `celebConfettiFall ${c.dur}s linear infinite`,
            animationDelay: `${c.delay}s`,
            transform: `rotate(${c.rot}deg)`,
            boxShadow: '0 0 6px rgba(255,255,255,0.3)',
          }}/>
        ))}
      </div>

      {/* タイトル: Congratulations! */}
      <div style={{
        position: 'absolute',
        top: 90, left: 0, right: 0,
        textAlign: 'center',
        animation: 'celebTitleIn 900ms cubic-bezier(.2,1,.3,1) 100ms backwards',
      }}>
        <div style={{
          fontFamily: "'Titillium Web', 'Noto Sans JP', sans-serif",
          fontWeight: 700,
          fontStyle: 'italic',
          fontSize: 140,
          lineHeight: 1,
          letterSpacing: '0.02em',
          paddingBottom: '0.15em',     // g 等のディセンダー切れ防止
          background: 'linear-gradient(180deg, #FFFBE6 0%, #FFEFB0 18%, #F5D76E 45%, #C9A24B 75%, #8C6314 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          // 縁取り (黒の outline) + 影 + 金グロウは celebGlow keyframes で付与 (透過背景でも視認性確保)
          filter:
            'drop-shadow(2px 2px 0 rgba(0,0,0,0.92)) drop-shadow(-2px 2px 0 rgba(0,0,0,0.92)) drop-shadow(2px -2px 0 rgba(0,0,0,0.92)) drop-shadow(-2px -2px 0 rgba(0,0,0,0.92)) drop-shadow(0 4px 14px rgba(0,0,0,0.9))',
          animation: 'celebGlow 2.4s ease-in-out infinite',
        }}>Congratulations!</div>
        <CondenseText style={{
          marginTop: 12,
          fontFamily: "'Noto Sans JP', sans-serif",
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: '0.18em',
          color: '#F5D76E',
          textShadow: '-2px -2px 0 rgba(0,0,0,0.9), 2px -2px 0 rgba(0,0,0,0.9), -2px 2px 0 rgba(0,0,0,0.9), 2px 2px 0 rgba(0,0,0,0.9), 0 2px 12px rgba(0,0,0,0.95)',
          textAlign: 'center',
          padding: '0 80px',
        }} min={0.45}>{awardName}</CondenseText>
      </div>

      {/* 受賞者横並び */}
      <div style={{
        position: 'absolute',
        left: padX, right: padX,
        top: 380,
        display: 'flex',
        gap: 24,
        justifyContent: 'center',
        alignItems: 'flex-start',
        flexWrap: 'nowrap',
      }}>
        {winners.length === 0 && (
          <div style={{ color: 'rgba(245,215,110,0.7)', fontSize: 28, padding: 40 }}>
            受賞者が未確定です
          </div>
        )}
        {winners.map((w, i) => (
          <CelebrationCard
            key={w.entry.id}
            winner={w}
            width={cardW}
            height={cardH}
            delay={300 + i * 180}
          />
        ))}
      </div>
    </div>
  );
}

function CelebrationCard({ winner, width, height, delay }: {
  winner: WinnerItem;
  width: number;
  height: number;
  delay: number;
}) {
  const title = winner.pollTitle || winner.categoryDesc;
  return (
    <div style={{
      width,
      flexShrink: 0,
      opacity: 0,
      animation: `celebCardIn 900ms cubic-bezier(.2,1,.3,1) ${delay}ms forwards`,
    }}>
      {/* 部門ラベル */}
      <div style={{ marginBottom: 10, textAlign: 'center' }}>
        <CondenseText style={{
          fontFamily: "'Noto Sans JP', sans-serif",
          fontWeight: 700,
          fontSize: 18,
          color: '#F5D76E',
          letterSpacing: '0.14em',
          paddingLeft: 3, paddingRight: 3,
          textShadow: '-1.5px -1.5px 0 rgba(0,0,0,0.9), 1.5px -1.5px 0 rgba(0,0,0,0.9), -1.5px 1.5px 0 rgba(0,0,0,0.9), 1.5px 1.5px 0 rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.95)',
        }} min={0.5}>{title}</CondenseText>
      </div>

      {/* 写真 */}
      <div style={{
        width,
        height,
        background: 'linear-gradient(180deg, #181012, #0a0608)',
        border: '2px solid rgba(245,215,110,0.9)',
        boxShadow: '0 18px 36px rgba(0,0,0,0.7), 0 0 28px rgba(245,215,110,0.3)',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {winner.entry.photo ? (
          <img src={winner.entry.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(245,215,110,0.3)', fontSize: 80,
          }}>—</div>
        )}
        <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,215,110,0.25)', pointerEvents: 'none' }}/>
      </div>

      {/* 名前 + 会社 */}
      <div style={{ marginTop: 12, textAlign: 'center', padding: '0 6px' }}>
        <CondenseText style={{
          fontFamily: "'Noto Sans JP', sans-serif",
          fontWeight: 900,
          fontSize: 24,
          color: '#fff',
          letterSpacing: '0.04em',
          paddingLeft: 3, paddingRight: 3,
          textShadow: '-1.5px -1.5px 0 rgba(0,0,0,0.92), 1.5px -1.5px 0 rgba(0,0,0,0.92), -1.5px 1.5px 0 rgba(0,0,0,0.92), 1.5px 1.5px 0 rgba(0,0,0,0.92), 0 2px 10px rgba(0,0,0,0.95)',
          lineHeight: 1.15,
        }} min={0.5}>{winner.entry.name}</CondenseText>
        {winner.entry.company && (
          <CondenseText style={{
            marginTop: 2,
            fontFamily: "'Noto Sans JP', sans-serif",
            fontSize: 14,
            color: 'rgba(245,215,110,0.95)',
            letterSpacing: '0.14em',
            paddingLeft: 3, paddingRight: 3,
            textShadow: '-1px -1px 0 rgba(0,0,0,0.9), 1px -1px 0 rgba(0,0,0,0.9), -1px 1px 0 rgba(0,0,0,0.9), 1px 1px 0 rgba(0,0,0,0.9), 0 2px 6px rgba(0,0,0,0.95)',
          }} min={0.5}>{winner.entry.company}</CondenseText>
        )}
      </div>
    </div>
  );
}

function mulberry32(seed: number) {
  let a = seed;
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
