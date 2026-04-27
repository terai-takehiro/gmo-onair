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
}

export default function StepOneShot({ entry, style, categoryParent = '', categoryChild = '', lang = 'ja' }: Props) {
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
}

const MIN_CARD_W = 880;
const MAX_CARD_W = 1600; // leaves 160px margin each side on 1920px canvas
const CARD_PAD_X = 50;
const CARD_PAD_Y = 50;
const PHOTO_H = 520;
const PHOTO_W = PHOTO_H * (3 / 4); // 390
const CARD_GAP = 40;
const CARD_H = PHOTO_H + CARD_PAD_Y * 2; // 620

function calcCardW(name: string, company: string): number {
  const NAME_FONT = `900 68px 'Noto Sans JP', sans-serif`;
  const COMP_FONT = `500 30px 'Noto Sans JP', sans-serif`;
  // letterSpacing compensation: 0.04em for name, 0.10em for company
  const nameW = measureWidth(name, NAME_FONT) + name.length * 68 * 0.04;
  const compW = measureWidth(company, COMP_FONT) + company.length * 30 * 0.10;
  const needed = CARD_PAD_X * 2 + PHOTO_W + CARD_GAP + Math.max(nameW, compW);
  return Math.min(MAX_CARD_W, Math.max(MIN_CARD_W, Math.ceil(needed)));
}

function OneShotCardOverlay({ entry, on, style, categoryParent, categoryChild, lang }: OverlayProps) {
  const displayName    = lang === 'en' ? (entry.nameEn || entry.name) : entry.name;
  const displayCompany = lang === 'en' ? (entry.orgEn  || entry.company) : entry.company;

  const cardW = calcCardW(displayName, displayCompany);
  const textColW = cardW - CARD_PAD_X * 2 - PHOTO_W - CARD_GAP;

  let cardTransform: string;
  let cardTransition: string;
  let showClassicBurst = false;
  let cardClipPath = 'inset(0)';
  let cardClipTransition = '';

  if (style === 'shards') {
    cardTransform = on
      ? 'translate(-50%, -50%) scale(1)'
      : 'translate(-50%, -50%) scale(0.92)';
    cardTransition = 'transform 700ms cubic-bezier(.2,.9,.25,1) 450ms, opacity 400ms ease-out 450ms';
  } else if (style === 'spotlight') {
    cardTransform = on
      ? 'translate(-50%, -50%) scale(1)'
      : 'translate(-50%, calc(-50% + 120px)) scale(0.96)';
    cardTransition = 'transform 900ms cubic-bezier(.18,.9,.25,1) 200ms, opacity 500ms ease-out 200ms';
  } else if (style === 'slit') {
    cardTransform = 'translate(-50%, -50%) scale(1)';
    cardTransition = 'opacity 200ms ease-out';
    cardClipPath = on ? 'inset(0 0 0 0)' : 'inset(0 50% 0 50%)';
    cardClipTransition = 'clip-path 800ms cubic-bezier(.7,0,.2,1) 80ms';
  } else {
    // classic
    cardTransform = on
      ? 'translate(-50%, -50%) scale(1)'
      : 'translate(-50%, -50%) scale(1.18)';
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
          background:
            'linear-gradient(140deg, rgba(22,16,8,0.94) 0%, rgba(12,8,4,0.98) 100%)',
          border: '2px solid rgba(245,215,110,0.75)',
          borderRadius: 6,
          boxShadow: on
            ? '0 40px 120px rgba(0,0,0,0.85), 0 0 80px rgba(245,215,110,0.35), 0 0 160px rgba(245,215,110,0.18)'
            : '0 0 0 rgba(0,0,0,0)',
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
        />
      </div>
    </>
  );
}

function CardCorners() {
  const base: React.CSSProperties = {
    position: 'absolute',
    width: 36,
    height: 36,
    borderColor: '#C9A24B',
    borderStyle: 'solid',
    borderWidth: 0,
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
        width,
        height,
        flexShrink: 0,
        borderRadius: 4,
        overflow: 'hidden',
        position: 'relative',
        background: '#0a0705',
        border: '1px solid rgba(201,162,75,0.4)',
        transform: visible ? 'scale(1)' : 'scale(1.08)',
        opacity: visible ? 1 : 0,
        transition: 'transform 900ms cubic-bezier(.2,.9,.25,1), opacity 600ms ease-out',
      }}
    >
      {entry.photo ? (
        <img
          src={entry.photo}
          alt={entry.name}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      ) : (
        <PortraitPlaceholder entry={entry} seed={0} />
      )}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 120,
          background: 'linear-gradient(to top, rgba(0,0,0,0.55), transparent)',
        }}
      />
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
}

function TextColumn({ entry, on, categoryParent, categoryChild, displayName, displayCompany, textColW }: TextProps) {
  const nameFit = fitText(displayName, textColW, `900 68px 'Noto Sans JP', sans-serif`);
  const compFit = fitText(displayCompany, textColW, `500 30px 'Noto Sans JP', sans-serif`);
  const D = 350;
  const T = 700;
  const fade: React.CSSProperties = {
    transform: on ? 'translateY(0)' : 'translateY(16px)',
    opacity: on ? 1 : 0,
    transition: `transform ${T}ms cubic-bezier(.2,.9,.25,1) ${D}ms, opacity ${T}ms ease ${D}ms`,
  };
  const goldGrad: React.CSSProperties = {
    background: 'linear-gradient(180deg, #FFFBE6 0%, #F5D76E 48%, #8C6314 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  };
  const catLabel = categoryParent
    ? `${categoryParent}${categoryChild ? '　／　' + categoryChild : ''}`
    : categoryChild;

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 16,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      {catLabel && (
        <div
          style={{
            fontFamily: "'Noto Sans JP', sans-serif",
            fontSize: 16,
            fontWeight: 700,
            color: '#C9A24B',
            letterSpacing: '0.28em',
            paddingLeft: '0.28em',
            ...fade,
          }}
        >
          {catLabel}
        </div>
      )}

      {/* No.1 */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 2,
          lineHeight: 0.85,
          ...fade,
        }}
      >
        <span
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 108,
            letterSpacing: '0.01em',
            filter: 'drop-shadow(0 4px 24px rgba(245,215,110,0.35))',
            ...goldGrad,
          }}
        >
          No.
        </span>
        <span
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 200,
            letterSpacing: '0.01em',
            filter: 'drop-shadow(0 4px 24px rgba(245,215,110,0.35))',
            ...goldGrad,
          }}
        >
          1
        </span>
      </div>

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

      <div
        style={{
          fontFamily: "'Noto Sans JP', sans-serif",
          fontSize: 30,
          fontWeight: 500,
          color: 'rgba(255,255,255,0.75)',
          letterSpacing: '0.10em',
          lineHeight: 1.3,
          ...fitStyle(compFit),
          ...fade,
        }}
      >
        {displayCompany}
      </div>

      <div
        style={{
          fontFamily: "'Noto Sans JP', sans-serif",
          fontWeight: 900,
          fontSize: 68,
          lineHeight: 1.15,
          color: '#fff',
          letterSpacing: '0.04em',
          ...fitStyle(nameFit),
          ...fade,
        }}
      >
        {displayName}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          marginTop: 4,
          ...fade,
        }}
      >
        <span
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 60,
            lineHeight: 0.9,
            color: '#F5D76E',
            letterSpacing: '0.02em',
          }}
        >
          <CountUp value={entry.points} duration={1500} />
        </span>
        <span
          style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 20,
            color: '#C9A24B',
            letterSpacing: '0.24em',
          }}
        >
          PT
        </span>
      </div>
    </div>
  );
}
