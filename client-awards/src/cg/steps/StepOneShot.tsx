import { useState, useEffect } from 'react';
import type { CgMappedEntry, OneshotStyle } from '../types';
import { fitText, fitStyle, measureWidth } from '../fitText';
import CountUp from '../components/CountUp';
import PortraitPlaceholder from '../components/PortraitPlaceholder';
import OneShotImpactBurst from '../oneShotEffects/Classic';
import OneShotShards from '../oneShotEffects/Shards';
import OneShotSpotlight from '../oneShotEffects/Spotlight';
import OneShotSlitBeam from '../oneShotEffects/Slit';

interface Props {
  entry: CgMappedEntry | null;
  style: OneshotStyle;
  categoryParent?: string;
  categoryChild?: string;
  lang?: 'ja' | 'en';
  hidePoints?: boolean;
}

export default function StepOneShot({ entry, style, categoryParent = '', categoryChild = '', lang = 'ja', hidePoints = false }: Props) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setOn(true), 40);
    return () => clearTimeout(t);
  }, []);

  if (!entry) return null;

  return (
    <OneShotCardOverlay
      entry={entry}
      on={on}
      style={style}
      categoryParent={categoryParent}
      categoryChild={categoryChild}
      lang={lang}
      hidePoints={hidePoints}
    />
  );
}

interface OverlayProps {
  entry: CgMappedEntry;
  on: boolean;
  style: OneshotStyle;
  categoryParent: string;
  categoryChild: string;
  lang: 'ja' | 'en';
  hidePoints?: boolean;
}

const MIN_CARD_W = 900;
const MAX_CARD_W = 1600;
const CARD_PAD_X = 50;
const CARD_PAD_Y = 50;
const PHOTO_H = 520;
const PHOTO_W = Math.round(PHOTO_H * (3 / 4)); // 390
const CARD_GAP = 40;
const CARD_H = PHOTO_H + CARD_PAD_Y * 2;
const NO1_COL_W = 160;
const NO1_GAP = 28;

// Canvas measureText underestimates weight-900 CJK by ~12–14%; buffer compensates.
const MEAS_BUF = 1.14;

function calcCardW(name: string, company: string, catChild: string): number {
  const nameW  = measureWidth(name, `900 58px 'Noto Sans JP'`) * MEAS_BUF + name.length * 58 * 0.04;
  const compW  = measureWidth(company, `500 26px 'Noto Sans JP'`) * MEAS_BUF + company.length * 26 * 0.08;
  const catW   = measureWidth(catChild, `700 38px 'Noto Sans JP'`) * MEAS_BUF + catChild.length * 38 * 0.04;
  const maxTextW = Math.max(nameW, compW, catW);
  const overhead = CARD_PAD_X * 2 + PHOTO_W + CARD_GAP + NO1_COL_W + NO1_GAP;
  return Math.min(MAX_CARD_W, Math.max(MIN_CARD_W, Math.ceil(overhead + maxTextW)));
}

function OneShotCardOverlay({ entry, on, style, categoryParent, categoryChild, lang, hidePoints = false }: OverlayProps) {
  const displayName    = lang === 'en' ? (entry.nameEn || entry.name) : entry.name;
  const displayCompany = lang === 'en' ? (entry.orgEn  || entry.company) : entry.company;

  const cardW    = calcCardW(displayName, displayCompany, categoryChild);
  const textColW = cardW - CARD_PAD_X * 2 - PHOTO_W - CARD_GAP - NO1_COL_W - NO1_GAP;

  let cardTransform: string;
  let cardTransition: string;
  let showClassicBurst = false;
  let cardClipPath = 'inset(0)';
  let cardClipTransition = '';

  if (style === 'shards') {
    cardTransform = on ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(0.92)';
    cardTransition = 'transform 700ms cubic-bezier(.2,.9,.25,1) 450ms, opacity 400ms ease-out 450ms';
  } else if (style === 'spotlight') {
    cardTransform = on ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, calc(-50% + 120px)) scale(0.96)';
    cardTransition = 'transform 900ms cubic-bezier(.18,.9,.25,1) 200ms, opacity 500ms ease-out 200ms';
  } else if (style === 'slit') {
    cardTransform = 'translate(-50%, -50%) scale(1)';
    cardTransition = 'opacity 200ms ease-out';
    cardClipPath = on ? 'inset(0 0 0 0)' : 'inset(0 50% 0 50%)';
    cardClipTransition = 'clip-path 800ms cubic-bezier(.7,0,.2,1) 80ms';
  } else {
    cardTransform = on ? 'translate(-50%, -50%) scale(1)' : 'translate(-50%, -50%) scale(1.18)';
    cardTransition = 'transform 650ms cubic-bezier(.2,1.45,.3,1), opacity 220ms ease-out';
    showClassicBurst = true;
  }

  return (
    <>
      {showClassicBurst && <OneShotImpactBurst on={on} />}
      {style === 'shards' && <OneShotShards on={on} />}
      {style === 'spotlight' && <OneShotSpotlight on={on} />}
      {style === 'slit' && <OneShotSlitBeam on={on} />}

      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: cardW,
          height: CARD_H,
          transform: cardTransform,
          opacity: on ? 1 : 0,
          transition: `${cardTransition}${cardClipTransition ? ', ' + cardClipTransition : ''}`,
          clipPath: cardClipPath,
          WebkitClipPath: cardClipPath,
          zIndex: 50,
          display: 'flex',
          gap: CARD_GAP,
          padding: `${CARD_PAD_Y}px ${CARD_PAD_X}px`,
          background: 'linear-gradient(140deg, rgba(22,16,8,0.94) 0%, rgba(12,8,4,0.98) 100%)',
          border: '2px solid rgba(245,215,110,0.75)',
          borderRadius: 6,
          boxShadow: on
            ? '0 40px 120px rgba(0,0,0,0.85), 0 0 80px rgba(245,215,110,0.35), 0 0 160px rgba(245,215,110,0.18)'
            : '0 0 0 rgba(0,0,0,0)',
          overflow: 'hidden',
        }}
      >
        <CardCorners />
        <Portrait
          entry={entry}
          width={PHOTO_W}
          height={PHOTO_H}
          delay={style === 'shards' ? 700 : style === 'slit' ? 600 : 200}
          on={on}
        />
        <TextColumn
          entry={entry}
          on={on}
          categoryParent={categoryParent}
          categoryChild={categoryChild}
          displayName={displayName}
          displayCompany={displayCompany}
          textColW={textColW}
          hidePoints={hidePoints}
        />
        <No1Column on={on} />
      </div>
    </>
  );
}

function CardCorners() {
  const base: React.CSSProperties = {
    position: 'absolute', width: 36, height: 36,
    borderColor: '#C9A24B', borderStyle: 'solid', borderWidth: 0,
  };
  return (
    <>
      <div style={{ ...base, top: 14, left: 14, borderTopWidth: 2, borderLeftWidth: 2 }} />
      <div style={{ ...base, top: 14, right: 14, borderTopWidth: 2, borderRightWidth: 2 }} />
      <div style={{ ...base, bottom: 14, left: 14, borderBottomWidth: 2, borderLeftWidth: 2 }} />
      <div style={{ ...base, bottom: 14, right: 14, borderBottomWidth: 2, borderRightWidth: 2 }} />
    </>
  );
}

function No1Column({ on }: { on: boolean }) {
  const goldGrad: React.CSSProperties = {
    background: 'linear-gradient(180deg, #FFFBE6 0%, #F5D76E 48%, #8C6314 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  };
  return (
    <div
      style={{
        width: NO1_COL_W,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: on ? 1 : 0,
        transition: 'opacity 600ms ease 280ms',
      }}
    >
      <div
        style={{
          fontFamily: "'Roboto Condensed', sans-serif", fontWeight: 700,
          fontSize: 52,
          letterSpacing: '0.04em',
          lineHeight: 1,
          filter: 'drop-shadow(0 2px 16px rgba(245,215,110,0.4))',
          ...goldGrad,
        }}
      >
        NO.
      </div>
      <div
        style={{
          fontFamily: "'Roboto Condensed', sans-serif", fontWeight: 700,
          fontSize: 190,
          letterSpacing: '0.01em',
          lineHeight: 0.82,
          filter: 'drop-shadow(0 4px 32px rgba(245,215,110,0.55))',
          ...goldGrad,
        }}
      >
        1
      </div>
    </div>
  );
}

interface PortraitProps {
  entry: CgMappedEntry;
  width: number;
  height: number;
  delay: number;
  on: boolean;
}

function Portrait({ entry, width, height, delay, on }: PortraitProps) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [on, delay]);

  return (
    <div
      style={{
        width, height, flexShrink: 0, borderRadius: 4, overflow: 'hidden',
        position: 'relative', background: '#0a0705',
        border: '1px solid rgba(201,162,75,0.4)',
        transform: visible ? 'scale(1)' : 'scale(1.08)',
        opacity: visible ? 1 : 0,
        transition: 'transform 900ms cubic-bezier(.2,.9,.25,1), opacity 600ms ease-out',
      }}
    >
      {entry.photo ? (
        <img src={entry.photo} alt={entry.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <PortraitPlaceholder entry={entry} seed={0} />
      )}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: 120,
        background: 'linear-gradient(to top, rgba(0,0,0,0.55), transparent)',
      }} />
    </div>
  );
}

interface TextProps {
  entry: CgMappedEntry;
  on: boolean;
  categoryParent: string;
  categoryChild: string;
  displayName: string;
  displayCompany: string;
  textColW: number;
  hidePoints?: boolean;
}

function TextColumn({ entry, on, categoryParent, categoryChild, displayName, displayCompany, textColW, hidePoints = false }: TextProps) {
  const nameFit     = fitText(displayName, textColW, `900 58px 'Noto Sans JP', sans-serif`);
  const compFit     = fitText(displayCompany, textColW, `500 26px 'Noto Sans JP', sans-serif`);
  const catChildFit = fitText(categoryChild, textColW, `700 38px 'Noto Sans JP', sans-serif`);
  const D = 280;
  const T = 700;
  const yT = on ? 'translateY(0)' : 'translateY(16px)';
  const tr = `transform ${T}ms cubic-bezier(.2,.9,.25,1) ${D}ms, opacity ${T}ms ease ${D}ms`;

  // Combines y-translate with optional scaleX from fitStyle without overriding either
  const fade = (fitSty?: React.CSSProperties): React.CSSProperties => ({
    ...(fitSty ?? {}),
    transform: [yT, fitSty?.transform].filter(Boolean).join(' '),
    opacity: on ? 1 : 0,
    transition: tr,
  });

  const goldGrad: React.CSSProperties = {
    background: 'linear-gradient(180deg, #FFFBE6 0%, #F5D76E 48%, #8C6314 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  };

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 14,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      {/* Award name (big, gold) */}
      {categoryChild && (
        <div
          style={{
            fontFamily: "'Noto Sans JP', sans-serif",
            fontSize: 38,
            fontWeight: 700,
            letterSpacing: '0.06em',
            lineHeight: 1.2,
            ...goldGrad,
            ...fade(fitStyle(catChildFit)),
          }}
        >
          {categoryChild}
        </div>
      )}

      {/* Division (secondary) */}
      {categoryParent && (
        <div
          style={{
            fontFamily: "'Noto Sans JP', sans-serif",
            fontSize: 18,
            fontWeight: 600,
            color: 'rgba(201,162,75,0.75)',
            letterSpacing: '0.22em',
            paddingLeft: '0.22em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            marginTop: -8,
            ...fade(),
          }}
        >
          {categoryParent}
        </div>
      )}

      {/* Divider */}
      <div
        style={{
          height: 1,
          background: 'linear-gradient(to right, rgba(201,162,75,0.8), transparent)',
          transform: on ? 'scaleX(1)' : 'scaleX(0)',
          transformOrigin: 'left',
          transition: `transform ${T + 100}ms cubic-bezier(.2,.9,.25,1) ${D}ms`,
        }}
      />

      {/* Company */}
      {displayCompany && (
        <div
          style={{
            fontFamily: "'Noto Sans JP', sans-serif",
            fontSize: 26,
            fontWeight: 500,
            color: 'rgba(255,255,255,0.72)',
            letterSpacing: '0.08em',
            lineHeight: 1.3,
            ...fade(fitStyle(compFit)),
          }}
        >
          {displayCompany}
        </div>
      )}

      {/* Name */}
      <div
        style={{
          fontFamily: "'Noto Sans JP', sans-serif",
          fontWeight: 900,
          fontSize: 58,
          lineHeight: 1.1,
          color: '#fff',
          letterSpacing: '0.04em',
          ...fade(fitStyle(nameFit)),
        }}
      >
        {displayName}
      </div>

      {/* ノミネートタイトル (entry.nominationTitle が設定されている時のみ) */}
      {(entry.nominationTitle || entry.nominationTitleEn) && (
        <div
          style={{
            fontFamily: "'Noto Sans JP', sans-serif",
            fontWeight: 700,
            fontSize: 26,
            color: '#F5D76E',
            letterSpacing: '0.02em',
            lineHeight: 1.2,
            marginTop: 6,
            textShadow: '0 2px 8px rgba(0,0,0,0.7)',
            ...fade(),
          }}
        >
          {entry.nominationTitle || entry.nominationTitleEn}
        </div>
      )}

      {/* Points (vote-reveal 経由などで hidePoints=true なら非表示) */}
      {!hidePoints && (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, ...fade() }}>
        <span style={{
          fontFamily: "'Roboto Condensed', sans-serif", fontWeight: 700,
          fontSize: 52, lineHeight: 0.9, color: '#F5D76E', letterSpacing: '0.02em',
        }}>
          <CountUp value={entry.points} duration={1500} />
        </span>
        <span style={{
          fontFamily: "'Roboto Condensed', sans-serif", fontWeight: 700,
          fontSize: 18, color: '#C9A24B', letterSpacing: '0.24em',
        }}>
          PT
        </span>
      </div>
      )}
    </div>
  );
}
