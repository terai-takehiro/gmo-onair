import { useEffect, useMemo, useState, useRef } from 'react';
import type { QuizWithChoices, QuizCueState, QuizChoice } from './types';
import { QUIZ_COLORS } from './types';
import { CondenseText } from '@/cg/components/CondenseText';
import StepOneShot from '@/cg/steps/StepOneShot';
import { getServerNow } from '@/lib/serverClock';
import type { CgMappedEntry } from '@/cg/types';

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
// v2.9.40: 4 択以上は 2 行配置に。各カードの幅を稼いで選択肢テキストを大きく見せる。
//   2 択: 2x1
//   3 択: 3x1
//   4 択: 2x2 (旧 4x1 から変更 — カード幅が狭くなって名前が読めなかった)
//   5 択: 3x2
//   6 択: 3x2
function gridForCount(n: number): { cols: number; rows: number } {
  if (n <= 2) return { cols: Math.max(2, n), rows: 1 };
  if (n === 3) return { cols: 3, rows: 1 };
  if (n === 4) return { cols: 2, rows: 2 };
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
    // v2.9.18+: StepOneShot (classic/shards/spotlight/slit) で大賞演出に統一
    const mapped: CgMappedEntry = {
      id: String(winnerPos.id),
      rank: 1,
      name: winnerPos.name || '',
      nameEn: winnerPos.name_en ?? undefined,
      company: winnerPos.company ?? '',
      orgEn: winnerPos.company_en ?? undefined,
      points: 0,
      photo: winnerPos.photo_data_url ?? undefined,
      nominationTitle: winnerPos.nomination_title ?? undefined,
      nominationTitleEn: winnerPos.nomination_title_en ?? undefined,
    };
    const style = cue.oneshotStyle ?? 'classic';
    return (
      <div style={{ position: 'absolute', inset: 0, fontFamily: "'Noto Sans JP', sans-serif" }}>
        {!transparent && <BaseBackdrop />}
        <StepOneShot
          entry={mapped}
          style={style}
          categoryChild={title}
          lang={lang}
          hidePoints
        />
      </div>
    );
  }

  const showVotes = cue.step === 'reveal' || cue.step === 'answer-check' || cue.step === 'correct-reveal';
  const correctReveal = cue.step === 'correct-reveal';
  // v2.9.18+: reveal step の revealPhase で 0=ランダム揺れ / 1=ドン!確定演出 を分岐
  const isShakePhase = cue.step === 'reveal' && cue.revealPhase === 0;
  const isLockPhase = (cue.step === 'reveal' && cue.revealPhase >= 1) || cue.step === 'answer-check' || cue.step === 'correct-reveal';

  // v2.9.19+: reveal ステップは「3-shot フルスクリーン」レイアウト
  // v2.9.20+: v2.8.147 の StepVoteReveal を完全コピーで踏襲
  if (cue.step === 'reveal') {
    return (
      <div style={{ position: 'absolute', inset: 0, fontFamily: "'Noto Sans JP', sans-serif" }}>
        <RevealStage
          choices={choices}
          cue={cue}
          title={title}
          isShakePhase={isShakePhase}
          isLockPhase={isLockPhase}
          display={quiz.display}
          transparent={transparent}
        />
      </div>
    );
  }

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
        isShakePhase={isShakePhase}
        isLockPhase={isLockPhase}
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
        writingMode: 'vertical-rl', textOrientation: 'mixed', whiteSpace: 'nowrap',
        fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 900, fontSize,
        color: '#fff', letterSpacing: isLong ? '-0.06em' : '0.04em',
        lineHeight: 1,
        textShadow: '0 4px 22px rgba(0,0,0,0.95)',
        transform: scale < 1 ? `scaleY(${scale})` : 'none',
        transformOrigin: 'top center',
        // v2.9.50: 縦書きの「？」「！」が左にずれる問題を修正。
        //   palt (横組み用プロポーショナル詰め) は縦組みで約物を左寄せにするため外し、
        //   vert (縦組みグリフ置換) のみ有効化して全角約物を中央に配置する。
        fontFeatureSettings: '"vert" 1',
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
function ChoicesGrid({ choices, choiceCount, cue, display, showVotes, correctReveal, isShakePhase, isLockPhase }: {
  choices: QuizChoice[]; choiceCount: number; cue: QuizCueState;
  display: 'count' | 'percent'; showVotes: boolean; correctReveal: boolean;
  isShakePhase: boolean; isLockPhase: boolean;
}) {
  const { cols, rows } = gridForCount(choiceCount);
  // v2.9.40: 票数枠縮小 (v2.9.39) と選択肢ブロック縮減に合わせて高さ圧縮
  //   1 行: 110 → 96 (各カード ~96px)
  //   2 行: 230 → 200 (各カード ~93px + gap 14)
  const totalH = rows === 1 ? 96 : 200;
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
            isShakePhase={isShakePhase} isLockPhase={isLockPhase}
          />
        );
      })}
    </div>
  );
}

function ChoiceCard({ index, choice, voteCount, totalVotes, display, showVotes, correctReveal, isShakePhase, isLockPhase }: {
  index: number; choice: QuizChoice;
  voteCount: number; totalVotes: number;
  display: 'count' | 'percent'; showVotes: boolean;
  correctReveal: boolean;
  isShakePhase: boolean; isLockPhase: boolean;
}) {
  const palette = QUIZ_COLORS[(index - 1) % QUIZ_COLORS.length];
  const name = choice.name || `選択肢${index}`;
  const isCorrect = !!choice.is_correct;
  const isDimmed = correctReveal && !isCorrect;
  const isHilite = correctReveal && isCorrect;

  // v2.9.18+: shake phase 中はランダム値を 90ms 周期で更新、lock phase で実値に。
  const [shake, setShake] = useState<number>(voteCount);
  useEffect(() => {
    if (!isShakePhase) { setShake(voteCount); return; }
    const range = Math.max(20, voteCount * 2 + 30);
    const id = window.setInterval(() => setShake(Math.floor(Math.random() * range)), 90);
    return () => window.clearInterval(id);
  }, [isShakePhase, voteCount]);
  return (
    <div style={{
      position: 'relative',
      // 不正解 (correct-reveal 時) は半透明ではなくグレーのベース色にする
      background: isDimmed
        ? 'linear-gradient(160deg, #565c66, #2e333c)'
        : `linear-gradient(160deg, ${palette.core}, ${palette.deep})`,
      border: isDimmed ? '2px solid rgba(255,255,255,0.18)' : '2px solid rgba(245,215,110,0.55)',
      borderRadius: 8,
      // v2.9.17: padding を常に固定 (showVotes 切替で base を伸ばさない)。
      // 右側に常に vote パネル分のスペースを確保し、reveal/answer-check 切替時に
      // カードの形が変わらないようにする。
      // v2.9.39: 票数枠を半分に縮小 → 右 padding 180 → 110px に。
      padding: '0 110px 0 78px',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      boxShadow: isDimmed
        ? '0 8px 22px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)'
        : `0 10px 30px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.14), 0 0 24px ${palette.glow}`,
      // 透明にはしない (常に opacity 1)。
      opacity: 1,
      filter: 'none',
      transition: 'background 400ms ease, border-color 400ms ease, box-shadow 400ms ease',
      animation: isHilite ? 'qzCorrectPulse 1s ease-in-out infinite' : 'none',
      overflow: 'hidden',
      boxSizing: 'border-box',
    }}>
      {/* 番号バッジ */}
      <div style={{
        position: 'absolute', left: -10, top: '50%', transform: 'translateY(-50%)',
        width: 72, height: 72,
        background: isDimmed
          ? 'radial-gradient(circle at 35% 30%, #cfd3d9, #6b7079 70%, #1a1a1a)'
          : `radial-gradient(circle at 35% 30%, #fff, ${palette.core} 70%, #1a1a1a)`,
        clipPath: 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 900, fontSize: 44,
        color: '#fff', textShadow: '0 2px 6px rgba(0,0,0,0.8)',
        filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.45))',
      }}>{index}</div>

      {/* v2.9.28: 選択肢は名前のみ表示 (会社名/ノミネートタイトルは省略し、名前を大きく) */}
      <CondenseText style={{
        fontFamily: "'Noto Sans JP', sans-serif", fontWeight: 900, fontSize: 42,
        color: '#fff', textShadow: '0 2px 6px rgba(0,0,0,0.7)', lineHeight: 1.1,
      }} min={0.4}>{name}</CondenseText>

      {/* 票数: v2.9.18 ドンと拡大演出 / v2.9.39 サイズ半減 (選択肢の手狭感を解消)
          - shake (revealPhase=0): base サイズ (90x48 / font 32) でランダム数字が動く
          - lock  (revealPhase>=1 or answer-check / correct-reveal): 拡大 (120x60 / font 48) + パンチ keyframe + glow burst */}
      {showVotes && (
        <>
          <style>{`
            @keyframes qzVotePunch {
              0%   { transform: translateY(-50%) scale(0.86); }
              40%  { transform: translateY(-50%) scale(1.18); }
              70%  { transform: translateY(-50%) scale(0.98); }
              100% { transform: translateY(-50%) scale(1); }
            }
          `}</style>
          <div
            key={isLockPhase ? 'lock' : 'shake'}
            style={{
              position: 'absolute', right: isLockPhase ? -2 : 10, top: '50%',
              transform: 'translateY(-50%)',
              width: isLockPhase ? 120 : 90,
              height: isLockPhase ? 60 : 48,
              padding: isLockPhase ? '0 12px' : '0 10px',
              boxSizing: 'border-box',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: isLockPhase
                ? 'linear-gradient(180deg, rgba(60,44,18,1), rgba(28,18,6,1))'
                : 'linear-gradient(180deg, rgba(38,30,16,0.96), rgba(15,10,4,0.98))',
              border: isLockPhase ? '2px solid #FFE8A8' : '1.5px solid rgba(245,215,110,0.85)',
              borderRadius: 10,
              boxShadow: isLockPhase
                ? '0 6px 22px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,240,180,0.45), 0 0 32px rgba(255,220,120,0.85), 0 0 12px rgba(255,200,80,0.6)'
                : '0 4px 14px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,235,140,0.25), 0 0 16px rgba(245,215,110,0.35)',
              overflow: 'hidden',
              transition: 'all 420ms cubic-bezier(.2,.85,.3,1.1)',
              animation: isLockPhase ? 'qzVotePunch 520ms cubic-bezier(.18,1.4,.4,1) both' : 'none',
              filter: isLockPhase ? 'drop-shadow(0 0 22px rgba(255,210,100,0.55))' : 'none',
            }}
          >
            <CondenseText style={{
              fontFamily: "'Roboto Condensed', sans-serif", fontWeight: 700,
              fontSize: isLockPhase ? 48 : 32,
              color: '#FFF4D6',
              textShadow: isLockPhase
                ? '0 2px 10px rgba(0,0,0,0.9), 0 0 32px rgba(255,220,140,0.95)'
                : '0 2px 8px rgba(0,0,0,0.85), 0 0 18px rgba(245,215,110,0.55)',
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.02em',
              lineHeight: 1,
              textAlign: 'center',
              transition: 'font-size 420ms cubic-bezier(.2,.85,.3,1.1)',
            }} min={0.4}>
              <VoteValueText
                value={isShakePhase ? shake : voteCount}
                totalVotes={totalVotes}
                display={display}
              />
            </CondenseText>
          </div>
        </>
      )}
    </div>
  );
}

function VoteValueText({ value, totalVotes, display }: { value: number; totalVotes: number; display: 'count' | 'percent' }) {
  if (display === 'percent') {
    const pct = totalVotes > 0 ? Math.round((value / totalVotes) * 100) : 0;
    return <>{`${pct}%`}</>;
  }
  return <>{value.toLocaleString()}</>;
}

// ─── RevealStage (v2.9.20+ : v2.8.147 の StepVoteReveal 完全コピー) ─────────
// 「最優秀を決めるとき」の以前の演出を踏襲。3 枚カード + 写真 + 名前 + 数字ピル。
// Phase 0: ランダム数字 (rAF + lerp で滑らかにロール、280ms 周期に target 再サンプル)
// Phase 1: TAKE で実値スナップ + 数字ピル拡大 + vrNumberPunch でドン!確定
// (Phase 2 = winner は QuizCG 側で StepOneShot に切替済)
function RevealStage({ choices, cue, title, isShakePhase, isLockPhase, display, transparent }: {
  choices: QuizChoice[];
  cue: QuizCueState;
  title: string;
  isShakePhase: boolean;
  isLockPhase: boolean;
  display: 'count' | 'percent';
  transparent: boolean;
}) {
  const totalVotes = useMemo(
    () => choices.reduce((s, c) => s + (cue.votes?.[c.position] ?? c.vote_count), 0),
    [choices, cue.votes]
  );
  const actualValues = choices.map((c) => cue.votes?.[c.position] ?? c.vote_count);
  const phase: 0 | 1 = isLockPhase ? 1 : 0;
  // Suppress unused-var warning when only one phase flag is used downstream
  void isShakePhase;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <Backdrop transparent={transparent} />
      <Header categoryChild={title} />
      <NumberCards
        cards={choices}
        actualValues={actualValues}
        totalVotes={totalVotes}
        display={display}
        phase={phase}
      />
    </div>
  );
}

// 軽量パーティクル背景 (モバイル Safari 対応で box-shadow ベース、SVG filter 不使用)
function Backdrop({ transparent }: { transparent: boolean }) {
  const particles = useMemo(() => {
    const rnd = mulberry32(20260710);
    return Array.from({ length: 12 }).map(() => ({
      x: rnd() * 1920,
      y: 540 + rnd() * 540,
      size: 2 + rnd() * 2,
      delay: -rnd() * 8,
      dur: 12 + rnd() * 10,
      drift: -40 + rnd() * 80,
    }));
  }, []);
  return (
    <>
      <style>{`
        @keyframes vrParticleFloat {
          0%   { transform: translate(0, 0)              scale(1);   opacity: 0; }
          15%  { opacity: 0.85; }
          85%  { opacity: 0.55; }
          100% { transform: translate(var(--drift,0), -680px) scale(0.3); opacity: 0; }
        }
        @keyframes vrSpotPulse { 0%, 100% { opacity: 0.7; } 50% { opacity: 1; } }
      `}</style>
      {!transparent && (
        <div style={{
          position: 'absolute', inset: 0,
          background: `
            radial-gradient(ellipse 75% 70% at 50% 60%, rgba(75,22,22,0.85), rgba(8,4,6,1) 75%),
            linear-gradient(180deg, #1a0508 0%, #050203 100%)
          `,
        }}/>
      )}
      <div style={{
        position: 'absolute',
        left: '50%', top: 0, width: 1400, height: 1080, marginLeft: -700,
        background: 'radial-gradient(ellipse 60% 100% at 50% 0%, rgba(255,225,170,0.18), transparent 70%)',
        animation: 'vrSpotPulse 4s ease-in-out infinite',
        pointerEvents: 'none',
      }}/>
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: 220,
        background: 'linear-gradient(180deg, transparent, rgba(245,215,110,0.08) 50%, transparent)',
        pointerEvents: 'none',
      }}/>
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: p.x - p.size,
            top: p.y - p.size,
            width: p.size * 2, height: p.size * 2,
            borderRadius: '50%',
            background: '#ffe9b8',
            boxShadow: `0 0 ${p.size * 3}px rgba(255,225,170,0.85)`,
            animation: `vrParticleFloat ${p.dur}s linear infinite`,
            animationDelay: `${p.delay}s`,
            ['--drift' as never]: `${p.drift}px`,
            pointerEvents: 'none',
          }}
        />
      ))}
    </>
  );
}

function Header({ categoryChild }: { categoryChild: string }) {
  return (
    <div style={{
      position: 'absolute', top: 80, left: 0, right: 0,
      textAlign: 'center', pointerEvents: 'none',
    }}>
      <div style={{
        fontFamily: "'Roboto Condensed', sans-serif",
        fontSize: 18,
        letterSpacing: '0.75em',
        color: 'rgba(245,215,110,0.95)',
        marginBottom: 12,
      }}>
        &mdash; &nbsp; VOTE REVEAL &nbsp; &mdash;
      </div>
      <div style={{
        fontFamily: "'Noto Sans JP', sans-serif",
        fontWeight: 700,
        fontSize: 54,
        letterSpacing: '0.14em',
        color: '#f8eccc',
        textShadow: '0 4px 18px rgba(0,0,0,0.85)',
        lineHeight: 1.1,
      }}>
        {categoryChild}
      </div>
    </div>
  );
}

function NumberCards({ cards, actualValues, totalVotes, display, phase }: {
  cards: QuizChoice[];
  actualValues: number[];
  totalVotes: number;
  display: 'count' | 'percent';
  phase: 0 | 1;
}) {
  if (cards.length === 0) {
    return (
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: 'rgba(245,215,110,0.6)', fontSize: 26, letterSpacing: '0.2em',
      }}>選択肢が設定されていません</div>
    );
  }
  // 3 枚想定の slot 位置。N=2 は中央寄せ、N>=4 は等間隔。
  const slotsByN: Record<number, number[]> = {
    1: [960],
    2: [1920 * 0.5 - 280, 1920 * 0.5 + 280],
    3: [1920 * 0.5 - 540, 1920 * 0.5, 1920 * 0.5 + 540],
    4: [1920 * 0.5 - 690, 1920 * 0.5 - 230, 1920 * 0.5 + 230, 1920 * 0.5 + 690],
  };
  const slots = slotsByN[cards.length] ?? cards.map((_, i) => 1920 * (i + 0.5) / cards.length);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 280, height: 700 }}>
      {cards.map((c, i) => (
        <CandidateCard
          key={c.id}
          cx={slots[i] ?? 960}
          choice={c}
          actual={actualValues[i]}
          totalVotes={totalVotes}
          display={display}
          phase={phase}
        />
      ))}
    </div>
  );
}

const CARD_W = 460;
const CARD_H = 580;

function CandidateCard({ cx, choice, actual, totalVotes, display, phase }: {
  cx: number;
  choice: QuizChoice;
  actual: number;
  totalVotes: number;
  display: 'count' | 'percent';
  phase: 0 | 1;
}) {
  const name = choice.name || '';
  const company = choice.company || '';
  const targetValue = display === 'percent'
    ? (totalVotes > 0 ? Math.round((actual / totalVotes) * 100) : 0)
    : actual;
  const unit = display === 'percent' ? '%' : '票';

  const [shown, setShown] = useState<number>(0);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    if (animRef.current != null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
    if (phase === 0) {
      const seed = display === 'percent' ? 100 : Math.max(targetValue * 2, 999);
      let current = Math.random() * seed;
      let target = Math.random() * seed;
      let lastSwap = performance.now();
      const tick = (now: number) => {
        if (now - lastSwap > 280) {
          target = Math.random() * seed;
          lastSwap = now;
        }
        current += (target - current) * 0.18;
        setShown(Math.max(0, Math.floor(current)));
        animRef.current = requestAnimationFrame(tick);
      };
      animRef.current = requestAnimationFrame(tick);
      return () => { if (animRef.current != null) cancelAnimationFrame(animRef.current); };
    }
    setShown(targetValue);
    return;
  }, [phase, targetValue, display]);

  return (
    <div style={{
      position: 'absolute',
      left: cx - CARD_W / 2, top: 0,
      width: CARD_W, height: CARD_H,
    }}>
      {/* 写真 */}
      <div style={{
        position: 'absolute',
        left: (CARD_W - 280) / 2, top: 0,
        width: 280, height: 360,
        background: 'linear-gradient(180deg, #181012, #0a0608)',
        border: '1px solid rgba(245,215,110,0.85)',
        boxShadow: '0 18px 36px rgba(0,0,0,0.75), 0 0 28px rgba(245,215,110,0.18)',
        overflow: 'hidden',
      }}>
        {choice.photo_data_url ? (
          <img src={choice.photo_data_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Roboto Condensed', sans-serif",
            fontSize: 140, color: 'rgba(245,215,110,0.3)',
          }}>—</div>
        )}
        <div style={{ position: 'absolute', inset: 4, border: '1px solid rgba(245,215,110,0.28)', pointerEvents: 'none' }}/>
      </div>

      {/* 名前 + 会社 */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0, top: 374,
        textAlign: 'center', padding: '0 12px',
      }}>
        <CondenseText style={{
          fontFamily: "'Noto Sans JP', sans-serif",
          fontWeight: 700, fontSize: 30,
          color: '#f8eccc', letterSpacing: '0.05em',
          textShadow: '0 2px 10px rgba(0,0,0,0.85)',
          lineHeight: 1.15,
        }} min={0.45}>{name}</CondenseText>
        {company && (
          <CondenseText style={{
            marginTop: 4,
            fontFamily: "'Noto Sans JP', sans-serif",
            fontSize: 17,
            color: 'rgba(245,215,110,0.85)',
            letterSpacing: '0.18em',
          }} min={0.45}>{company}</CondenseText>
        )}
      </div>

      {/* 数字 (Phase 0=小、Phase 1=ドンと拡大 + パンチアニメ) */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0,
        top: phase === 1 ? 470 : 458,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
        transition: 'top 420ms cubic-bezier(.2,1.2,.4,1)',
      }}>
        <style>{`
          @keyframes vrNumberPunch {
            0%   { transform: scale(0.86); filter: drop-shadow(0 0 0 rgba(245,215,110,0)); }
            45%  { transform: scale(1.18); filter: drop-shadow(0 0 36px rgba(245,215,110,0.95)); }
            70%  { transform: scale(0.98); }
            100% { transform: scale(1);    filter: drop-shadow(0 0 18px rgba(245,215,110,0.5)); }
          }
        `}</style>
        <div
          key={`pill-${phase}`}
          style={{
            display: 'flex', alignItems: 'baseline',
            gap: phase === 1 ? 14 : 10,
            padding: phase === 1 ? '14px 38px' : '8px 26px',
            width: phase === 1 ? 480 : 360,
            justifyContent: 'center',
            background: phase === 1
              ? 'linear-gradient(180deg, rgba(40,28,12,0.95), rgba(15,10,4,0.97))'
              : 'rgba(8,4,8,0.7)',
            border: phase === 1
              ? '2px solid rgba(245,215,110,0.95)'
              : '1px solid rgba(245,215,110,0.6)',
            boxShadow: phase === 1
              ? '0 14px 44px rgba(0,0,0,0.7), 0 0 44px rgba(245,215,110,0.5), inset 0 2px 0 rgba(255,235,180,0.18)'
              : '0 6px 24px rgba(0,0,0,0.55), 0 0 24px rgba(245,215,110,0.18)',
            transition: 'all 420ms cubic-bezier(.2,1.2,.4,1)',
            animation: phase === 1 ? 'vrNumberPunch 600ms cubic-bezier(.2,1.4,.4,1) forwards' : 'none',
          }}
        >
          <span style={{
            fontFamily: "'Roboto Condensed', sans-serif",
            fontWeight: 700,
            fontSize: phase === 1 ? 132 : 92,
            color: '#fff',
            letterSpacing: '-0.01em',
            lineHeight: 1,
            textShadow: phase === 1
              ? '0 4px 22px rgba(0,0,0,0.9), 0 0 32px rgba(255,225,170,0.6)'
              : '0 2px 14px rgba(0,0,0,0.85), 0 0 18px rgba(245,215,110,0.3)',
            fontVariantNumeric: 'tabular-nums',
            display: 'inline-block',
            textAlign: 'right',
            minWidth: '3.6ch',
            transition: 'font-size 420ms cubic-bezier(.2,1.2,.4,1)',
          }}>
            {shown.toLocaleString()}
          </span>
          <span style={{
            fontFamily: "'Roboto Condensed', sans-serif",
            fontWeight: 700,
            fontSize: phase === 1 ? 36 : 26,
            color: 'rgba(245,215,110,0.95)',
            letterSpacing: '0.18em',
            lineHeight: 1,
            transition: 'font-size 420ms cubic-bezier(.2,1.2,.4,1)',
          }}>{unit}</span>
        </div>
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

// ─── カウントダウン ─────────────────────────────
function Countdown({ startedAt, totalSec }: { startedAt: number | null; totalSec: number }) {
  const [remaining, setRemaining] = useState(totalSec * 1000);
  useEffect(() => {
    if (startedAt == null) { setRemaining(totalSec * 1000); return; }
    // getServerNow() でサーバー時計基準に揃える (operator PC と vMix の時計ずれを吸収)
    const tick = () => setRemaining(Math.max(0, totalSec * 1000 - (getServerNow() - startedAt)));
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
        <SlideDigits value={secs} fontSize={fontPx} color="#fff" />
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
// Suppress unused import warning
void useRef;

// ── Slide-in/out 数字 (旧 StepPoll から移植) ─────────────────
interface Slide { key: number; ch: string; entering: boolean; }
let __slideKey = 0;

function SlideDigits({ value, fontSize, color }: { value: number; fontSize: number; color: string }) {
  const str = String(Math.max(0, value));
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0 }}>
      {str.split('').map((ch, i) => (
        <SlideDigit key={`${i}-${str.length}`} char={ch} fontSize={fontSize} color={color} />
      ))}
    </div>
  );
}

function SlideDigit({ char, fontSize, color }: { char: string; fontSize: number; color: string }) {
  const [slides, setSlides] = useState<Slide[]>(() => [{ key: __slideKey++, ch: char, entering: false }]);
  useEffect(() => {
    setSlides((prev) => {
      const top = prev[prev.length - 1];
      if (top && top.ch === char) return prev;
      return [...prev, { key: __slideKey++, ch: char, entering: true }];
    });
  }, [char]);
  useEffect(() => {
    if (slides.length <= 1) return;
    const id = window.setTimeout(() => setSlides((c) => (c.length > 1 ? c.slice(1) : c)), 560);
    return () => window.clearTimeout(id);
  }, [slides]);
  const w = fontSize * 0.56;
  const h = fontSize * 1.0;
  return (
    <div style={{ position: 'relative', width: w, height: h, overflow: 'hidden', display: 'inline-block', fontVariantNumeric: 'tabular-nums' }}>
      <style>{`
        @keyframes qzDigitIn  { from { transform: translateY(-100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes qzDigitOut { from { transform: translateY(0); opacity: 1; } to { transform: translateY(100%); opacity: 0; } }
      `}</style>
      {slides.map((s, idx) => {
        const isCurrent = idx === slides.length - 1;
        const anim = isCurrent
          ? (s.entering ? 'qzDigitIn 520ms cubic-bezier(.22,.85,.32,1) forwards' : 'none')
          : 'qzDigitOut 520ms cubic-bezier(.4,0,.66,.4) forwards';
        return (
          <div key={s.key} style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Roboto Condensed', sans-serif", fontSize, fontWeight: 700,
            color, lineHeight: 1, letterSpacing: '-0.03em',
            animation: anim, willChange: 'transform, opacity',
            textShadow: '0 2px 10px rgba(0,0,0,0.75)',
          }}>{s.ch}</div>
        );
      })}
    </div>
  );
}
