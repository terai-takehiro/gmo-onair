import { useEffect, useMemo, useState, useRef } from 'react';
import type { QuizWithChoices, QuizCueState, QuizChoice } from './types';
import { QUIZ_COLORS } from './types';
import { CondenseText } from '@/cg/components/CondenseText';

interface Props {
  quiz: QuizWithChoices;
  cue: QuizCueState;
  transparent?: boolean;
  lang?: 'ja' | 'en';
}

const GOLD_BRIGHT = '#FFE8A8';
const GOLD = '#E8C56C';
const GOLD_DEEP = '#9E7B2E';

// レイアウト定数 (1920×1080)
const CAM_X = 80;
const CAM_Y = 100;
const CAM_W = 1380;
const CAM_H = 780;
const RIGHT_X = CAM_X + CAM_W + 40;
const RIGHT_W = 1920 - RIGHT_X - 60;
const RIGHT_H = CAM_H;

// 選択肢グリッド (choice_count に応じてレイアウト)
function gridForCount(n: number): { cols: number; rows: number } {
  if (n <= 3) return { cols: n, rows: 1 };
  if (n === 4) return { cols: 4, rows: 1 };
  if (n === 5) return { cols: 3, rows: 2 };
  if (n === 6) return { cols: 3, rows: 2 };
  return { cols: 3, rows: 1 };
}

export default function QuizCG({ quiz, cue, transparent = false, lang = 'ja' }: Props) {
  const isJa = lang === 'ja';
  const title = isJa ? (quiz.title || '') : (quiz.title_en || quiz.title || '');
  const rawQuestion = isJa
    ? (quiz.question || 'ふさわしいのは？')
    : (quiz.question_en || quiz.question || 'Who deserves?');
  const question = isJa ? rawQuestion.replace(/\?/g, '？').replace(/!/g, '！') : rawQuestion;

  const choices = useMemo(
    () => [...quiz.choices].sort((a, b) => a.position - b.position).slice(0, quiz.choice_count),
    [quiz.choices, quiz.choice_count]
  );

  // step 別レンダリング
  if (cue.step === 'idle') return null;

  if (cue.step === 'winner') {
    // 最大票の choice
    const winnerPos = choices.reduce(
      (max, c) => ((cue.votes?.[c.position] ?? c.vote_count) > (cue.votes?.[max.position] ?? max.vote_count) ? c : max),
      choices[0],
    );
    return (
      <div style={{ position: 'absolute', inset: 0, fontFamily: "'Noto Sans JP', sans-serif" }}>
        {!transparent && <BaseBackdrop />}
        <WinnerView choice={winnerPos} title={title} lang={lang} />
      </div>
    );
  }

  const showVotes = cue.step === 'reveal' || cue.step === 'answer-check' || cue.step === 'correct-reveal';
  const correctReveal = cue.step === 'correct-reveal';

  return (
    <div style={{ position: 'absolute', inset: 0, fontFamily: "'Noto Sans JP', sans-serif" }}>
      {!transparent && <BaseBackdrop />}
      {cue.step === 'poll' && quiz.cover_image_data_url && (
        <img
          src={quiz.cover_image_data_url}
          alt=""
          style={{
            position: 'absolute',
            left: CAM_X + 6, top: CAM_Y + 6,
            width: CAM_W - 12, height: CAM_H - 12,
            objectFit: 'cover',
            pointerEvents: 'none',
          }}
        />
      )}
      <CameraFrame />
      <RightColumn title={title} question={question} isVertical={isJa} />
      <ChoicesGrid
        choices={choices}
        choiceCount={quiz.choice_count}
        cue={cue}
        display={quiz.display}
        showVotes={showVotes}
        correctReveal={correctReveal}
      />
      {cue.step === 'poll' && (
        <Countdown
          startedAt={cue.pollStartedAt}
          totalSec={quiz.countdown_seconds}
        />
      )}
    </div>
  );
}

// ─── 背景 ─────────────────────────────────────
function BaseBackdrop() {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: `
        radial-gradient(ellipse 70% 50% at 50% 5%, rgba(220,170,90,0.18), transparent 60%),
        radial-gradient(ellipse 75% 80% at 50% 60%, rgba(60,40,20,0.55), rgba(8,6,12,1) 70%),
        linear-gradient(180deg, #0c0a14 0%, #060409 100%)
      `,
    }}/>
  );
}

// ─── カメラ枠 ─────────────────────────────────
function CameraFrame() {
  return (
    <div style={{
      position: 'absolute', left: CAM_X, top: CAM_Y,
      width: CAM_W, height: CAM_H,
      pointerEvents: 'none',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        border: `5px solid ${GOLD}`,
        boxShadow: `0 0 50px rgba(245,215,110,0.5), 0 20px 60px rgba(0,0,0,0.7), inset 0 0 24px rgba(245,215,110,0.25)`,
      }}/>
      <div style={{ position: 'absolute', inset: -10, border: '1px solid rgba(245,215,110,0.45)' }}/>
      <div style={{ position: 'absolute', inset: 10, border: '1px solid rgba(245,215,110,0.4)' }}/>
      {(['tl','tr','bl','br'] as const).map((c) => {
        const sz = 44;
        const isT = c[0] === 't', isL = c[1] === 'l';
        return (
          <div key={c} style={{
            position: 'absolute', width: sz, height: sz,
            ...(isT ? { top: -4 } : { bottom: -4 }),
            ...(isL ? { left: -4 } : { right: -4 }),
            ...(isT && isL && { borderTop: `6px solid ${GOLD}`, borderLeft: `6px solid ${GOLD}` }),
            ...(isT && !isL && { borderTop: `6px solid ${GOLD}`, borderRight: `6px solid ${GOLD}` }),
            ...(!isT && isL && { borderBottom: `6px solid ${GOLD}`, borderLeft: `6px solid ${GOLD}` }),
            ...(!isT && !isL && { borderBottom: `6px solid ${GOLD}`, borderRight: `6px solid ${GOLD}` }),
            filter: 'drop-shadow(0 0 10px rgba(245,215,110,0.6))',
          }}/>
        );
      })}
    </div>
  );
}

// ─── 右パネル ──────────────────────────────────
function RightColumn({ title, question, isVertical }: { title: string; question: string; isVertical: boolean }) {
  if (!isVertical) {
    return (
      <div style={{
        position: 'absolute', left: RIGHT_X, top: 40,
        width: RIGHT_W, textAlign: 'right',
      }}>
        <div style={{
          fontFamily: "'Titillium Web', sans-serif",
          fontWeight: 700, fontStyle: 'italic', fontSize: 96,
          background: `linear-gradient(180deg, ${GOLD_BRIGHT}, ${GOLD} 60%, ${GOLD_DEEP})`,
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          marginBottom: 16, paddingBottom: '0.15em',
        }}>Q</div>
        <CondenseText style={{
          fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 900, fontSize: 40,
          color: '#fff', marginBottom: 18,
        }} min={0.5}>{title}</CondenseText>
        <CondenseText style={{
          fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 900, fontSize: 36,
          color: '#fff', textShadow: '0 2px 16px rgba(0,0,0,0.85)',
        }} min={0.5}>{question}</CondenseText>
      </div>
    );
  }
  return (
    <div style={{
      position: 'absolute',
      left: RIGHT_X, top: CAM_Y,
      width: RIGHT_W, height: RIGHT_H,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', paddingTop: 6,
    }}>
      <div style={{
        fontFamily: "'Titillium Web', sans-serif",
        fontWeight: 700, fontStyle: 'italic', fontSize: 130, lineHeight: 1,
        background: `linear-gradient(180deg, ${GOLD_BRIGHT}, ${GOLD} 50%, ${GOLD_DEEP})`,
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        filter: 'drop-shadow(0 4px 22px rgba(0,0,0,0.85))',
        padding: '8px 16px 18px',
      }}>Q</div>
      <div style={{
        width: 140, height: 1, marginBottom: 14,
        background: `linear-gradient(90deg, transparent, ${GOLD_BRIGHT}, transparent)`,
      }}/>
      <div style={{
        display: 'flex', flexDirection: 'row',
        alignItems: 'flex-start', justifyContent: 'center', gap: 22,
      }}>
        <VerticalText text={question} fontSize={56} maxHeight={490} />
        <TitleBand text={title} maxH={RIGHT_H - 230} />
      </div>
    </div>
  );
}

function VerticalText({ text, fontSize, maxHeight }: { text: string; fontSize: number; maxHeight: number }) {
  const charsApprox = text.length;
  const naturalH = charsApprox * fontSize * 1.0;
  const scale = naturalH > maxHeight ? Math.max(0.4, maxHeight / naturalH) : 1;
  const isLong = scale < 1;
  return (
    <div style={{ maxHeight, display: 'flex', alignItems: 'flex-start' }}>
      <div style={{
        writingMode: 'vertical-rl', whiteSpace: 'nowrap',
        fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 900, fontSize,
        color: '#fff', letterSpacing: isLong ? '-0.06em' : '0.04em',
        lineHeight: 1,
        textShadow: '0 4px 22px rgba(0,0,0,0.95)',
        transform: scale < 1 ? `scaleY(${scale})` : 'none',
        transformOrigin: 'top center',
        fontFeatureSettings: '"vert" 1, "palt" 1',
      }}>{text}</div>
    </div>
  );
}

function TitleBand({ text, maxH }: { text: string; maxH: number }) {
  const charsApprox = text.length;
  const fontSize = 56;
  const naturalH = charsApprox * fontSize * 1.1;
  const scale = naturalH > (maxH - 80) ? Math.max(0.65, (maxH - 80) / naturalH) : 1;
  return (
    <div style={{
      position: 'relative', writingMode: 'vertical-rl',
      padding: '28px 20px',
      background: 'linear-gradient(180deg, rgba(38,30,16,0.97), rgba(18,12,5,0.98))',
      border: `2px solid ${GOLD}`,
      boxShadow: `0 16px 44px rgba(0,0,0,0.7), 0 0 36px rgba(245,215,110,0.22)`,
      fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 900, fontSize,
      letterSpacing: scale < 1 ? '0' : '0.14em', lineHeight: 1,
      maxHeight: maxH,
      fontFeatureSettings: '"palt" 1',
    }}>
      <div style={{ position: 'absolute', inset: -8, border: `1px solid ${GOLD_BRIGHT}`, opacity: 0.5 }}/>
      <span style={{
        background: `linear-gradient(180deg, ${GOLD_BRIGHT}, ${GOLD} 50%, ${GOLD_DEEP})`,
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        transform: scale < 1 ? `scaleY(${scale})` : 'none', transformOrigin: 'center',
        display: 'inline-block',
      }}>{text}</span>
    </div>
  );
}

// ─── 選択肢グリッド ────────────────────────────
function ChoicesGrid({ choices, choiceCount, cue, display, showVotes, correctReveal }: {
  choices: QuizChoice[]; choiceCount: number; cue: QuizCueState;
  display: 'count' | 'percent'; showVotes: boolean; correctReveal: boolean;
}) {
  const { cols, rows } = gridForCount(choiceCount);
  const totalH = rows === 1 ? 110 : 230;
  const top = 1080 - 36 - totalH;
  const totalVotes = Object.values(cue.votes ?? {}).reduce((s, v) => s + (v || 0), 0);
  return (
    <div style={{
      position: 'absolute',
      left: CAM_X, top, width: CAM_W, height: totalH,
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, 1fr)`,
      gridTemplateRows: `repeat(${rows}, 1fr)`,
      gap: 14,
    }}>
      <style>{`
        @keyframes qzCorrectPulse {
          0%, 100% { box-shadow: 0 10px 30px rgba(0,0,0,0.55), 0 0 32px rgba(245,215,110,0.55), 0 0 0 3px rgba(245,215,110,0.95); }
          50%      { box-shadow: 0 10px 40px rgba(0,0,0,0.65), 0 0 70px rgba(255,235,140,0.95), 0 0 0 5px rgba(255,235,140,0.95); }
        }
      `}</style>
      {choices.map((c) => {
        const voteCount = cue.votes?.[c.position] ?? c.vote_count;
        return (
          <ChoiceCard
            key={c.id} index={c.position} choice={c}
            voteCount={voteCount} totalVotes={totalVotes}
            display={display} showVotes={showVotes}
            correctReveal={correctReveal}
          />
        );
      })}
    </div>
  );
}

function ChoiceCard({ index, choice, voteCount, totalVotes, display, showVotes, correctReveal }: {
  index: number; choice: QuizChoice;
  voteCount: number; totalVotes: number;
  display: 'count' | 'percent'; showVotes: boolean;
  correctReveal: boolean;
}) {
  const palette = QUIZ_COLORS[(index - 1) % QUIZ_COLORS.length];
  const name = choice.name || `選択肢${index}`;
  const company = choice.company || '';
  const nomTitle = choice.nomination_title || '';
  const pct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
  const isCorrect = !!choice.is_correct;
  const isDimmed = correctReveal && !isCorrect;
  const isHilite = correctReveal && isCorrect;
  return (
    <div style={{
      position: 'relative',
      background: `linear-gradient(160deg, ${palette.core}, ${palette.deep})`,
      border: '2px solid rgba(245,215,110,0.55)',
      borderRadius: 8,
      padding: '0 18px 0 78px',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      boxShadow: `0 10px 30px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.14), 0 0 24px ${palette.glow}`,
      opacity: isDimmed ? 0.32 : 1,
      filter: isDimmed ? 'saturate(0.45)' : 'none',
      transition: 'opacity 500ms ease, filter 500ms ease',
      animation: isHilite ? 'qzCorrectPulse 1s ease-in-out infinite' : 'none',
    }}>
      {/* 番号バッジ */}
      <div style={{
        position: 'absolute', left: -10, top: '50%', transform: 'translateY(-50%)',
        width: 72, height: 72,
        background: `radial-gradient(circle at 35% 30%, #fff, ${palette.core} 70%, #1a1a1a)`,
        clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 900, fontSize: 44,
        color: '#fff', textShadow: '0 2px 6px rgba(0,0,0,0.8)',
        filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.45))',
      }}>{index}</div>

      <CondenseText style={{
        fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 900, fontSize: 26,
        color: '#fff', textShadow: '0 2px 6px rgba(0,0,0,0.7)', lineHeight: 1.1,
      }} min={0.45}>{name}</CondenseText>
      {company && (
        <CondenseText style={{
          marginTop: 2, fontFamily: "'Noto Sans JP', sans-serif", fontSize: 14,
          color: 'rgba(255,255,255,0.85)', letterSpacing: '0.06em',
        }} min={0.45}>{company}</CondenseText>
      )}
      {nomTitle && (
        <CondenseText style={{
          marginTop: 2, fontFamily: "'Noto Sans JP', sans-serif", fontSize: 14,
          fontWeight: 700, color: '#F5D76E',
        }} min={0.4}>{nomTitle}</CondenseText>
      )}

      {/* 票数 (reveal 中のみ右端に大きく表示) */}
      {showVotes && (
        <div style={{
          position: 'absolute', right: 18, top: '50%', transform: 'translateY(-50%)',
          fontFamily: "'Roboto Condensed', sans-serif", fontWeight: 700, fontSize: 42,
          color: '#fff', textShadow: '0 2px 10px rgba(0,0,0,0.85)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {display === 'percent' ? `${pct}%` : voteCount.toLocaleString()}
        </div>
      )}
    </div>
  );
}

// ─── カウントダウン ─────────────────────────────
function Countdown({ startedAt, totalSec }: { startedAt: number | null; totalSec: number }) {
  const [remaining, setRemaining] = useState(totalSec * 1000);
  useEffect(() => {
    if (startedAt == null) { setRemaining(totalSec * 1000); return; }
    const tick = () => setRemaining(Math.max(0, totalSec * 1000 - (Date.now() - startedAt)));
    tick();
    const id = window.setInterval(tick, 80);
    return () => window.clearInterval(id);
  }, [startedAt, totalSec]);

  const secs = Math.ceil(remaining / 1000);
  const ratio = remaining / (totalSec * 1000);
  const isLast5 = secs <= 5;
  const isLast10 = secs <= 10;
  const size = 210;
  const r = size / 2 - 10;
  const fontPx = isLast5 ? 175 : 140;
  const accent = isLast10 ? '#ff7a5a' : GOLD_BRIGHT;
  const halo = isLast5
    ? '0 0 80px rgba(255,90,40,0.85)'
    : isLast10 ? '0 0 36px rgba(255,90,40,0.55)' : '0 0 36px rgba(245,215,110,0.4)';
  const bg = isLast10
    ? 'radial-gradient(circle at 30% 25%, rgba(200,50,30,0.95), rgba(50,8,8,0.97))'
    : 'radial-gradient(circle at 30% 25%, rgba(32,36,58,0.95), rgba(10,12,22,0.97))';

  return (
    <div style={{
      position: 'absolute', right: 135, bottom: 76,
      width: size, height: size,
      animation: isLast5 ? 'qzLast5Pulse 1s ease-in-out infinite' : 'none',
    }}>
      <style>{`
        @keyframes qzLast5Pulse {
          0%, 100% { filter: drop-shadow(0 0 14px rgba(255,90,40,0.6)); }
          50%      { filter: drop-shadow(0 0 32px rgba(255,160,60,0.95)); }
        }
      `}</style>
      <div style={{
        position: 'absolute', inset: 0, borderRadius: '50%',
        background: bg, border: `4px solid ${accent}`,
        boxShadow: `${halo}, inset 0 3px 0 rgba(255,255,255,0.22)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{
          fontFamily: "'Roboto Condensed', sans-serif", fontWeight: 700,
          fontSize: fontPx, color: '#fff', letterSpacing: '-0.01em',
          fontVariantNumeric: 'tabular-nums', lineHeight: 1,
          textShadow: '0 2px 10px rgba(0,0,0,0.75)',
        }}>{secs}</div>
      </div>
      <svg width={size} height={size} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={3}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={accent} strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={`${2 * Math.PI * r}`}
          strokeDashoffset={`${2 * Math.PI * r * (1 - ratio)}`}
          opacity={0.95}
          style={{ transition: 'stroke-dashoffset 0.1s linear', filter: `drop-shadow(0 0 8px ${accent})` }}
        />
      </svg>
    </div>
  );
}

// ─── 大賞 (1S) ─────────────────────────────────
function WinnerView({ choice, title, lang }: { choice: QuizChoice | undefined; title: string; lang: 'ja' | 'en' }) {
  if (!choice) return null;
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 60);
    return () => clearTimeout(t);
  }, []);
  const name = lang === 'en' ? (choice.name_en || choice.name) : choice.name;
  const company = lang === 'en' ? (choice.company_en || choice.company || '') : (choice.company || '');
  const nomTitle = lang === 'en'
    ? (choice.nomination_title_en || choice.nomination_title || '')
    : (choice.nomination_title || '');
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(ellipse at center, rgba(80,40,10,0.55), rgba(0,0,0,0.85))',
    }}>
      <style>{`
        @keyframes qzWinIn { from { opacity: 0; transform: translateY(40px) scale(0.92); } to { opacity: 1; transform: translateY(0) scale(1); } }
      `}</style>
      <div style={{
        fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 700, fontSize: 36,
        color: GOLD, letterSpacing: '0.1em', marginBottom: 20,
        opacity: show ? 1 : 0, transition: 'opacity 600ms ease',
      }}>{title}</div>
      {choice.photo_data_url && (
        <img src={choice.photo_data_url} alt=""
          style={{
            width: 480, height: 480, objectFit: 'cover',
            border: `4px solid ${GOLD_BRIGHT}`,
            boxShadow: `0 0 60px ${GOLD}99`,
            opacity: show ? 1 : 0,
            animation: show ? 'qzWinIn 900ms cubic-bezier(.2,.85,.3,1) forwards' : 'none',
          }}/>
      )}
      <div style={{
        marginTop: 30,
        fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 900, fontSize: 100,
        background: `linear-gradient(180deg, ${GOLD_BRIGHT}, ${GOLD} 50%, ${GOLD_DEEP})`,
        WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
        letterSpacing: '0.06em',
        opacity: show ? 1 : 0,
        transform: show ? 'translateY(0)' : 'translateY(40px)',
        transition: 'all 1000ms cubic-bezier(.2,.85,.3,1) 400ms',
      }}>{name}</div>
      {company && (
        <div style={{
          marginTop: 12, fontFamily: "'Noto Sans JP', sans-serif",
          fontSize: 30, fontWeight: 700, color: GOLD, letterSpacing: '0.08em',
          opacity: show ? 1 : 0, transition: 'opacity 800ms ease 600ms',
        }}>{company}</div>
      )}
      {nomTitle && (
        <div style={{
          marginTop: 14, padding: '14px 36px',
          background: 'linear-gradient(180deg, rgba(30,22,10,0.92), rgba(12,8,4,0.96))',
          border: `2px solid ${GOLD_BRIGHT}`,
          boxShadow: `0 14px 36px rgba(0,0,0,0.7), 0 0 40px ${GOLD}40`,
          maxWidth: 1500, opacity: show ? 1 : 0,
          transition: 'opacity 900ms ease 800ms',
        }}>
          <CondenseText style={{
            fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 900, fontSize: 36,
            color: '#fff', textShadow: '0 2px 12px rgba(0,0,0,0.85)',
            lineHeight: 1.1, textAlign: 'center',
          }} min={0.4}>{nomTitle}</CondenseText>
        </div>
      )}
    </div>
  );
}

// Suppress unused import warning
void useRef;
