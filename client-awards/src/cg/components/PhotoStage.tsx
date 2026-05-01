import { useState, useEffect, useMemo } from 'react';
import type { CgStep } from '../types';
import type { CgMappedEntry } from '../types';
import PortraitPlaceholder from './PortraitPlaceholder';
import { fitText, fitStyle } from '../fitText';
import {
  nomineesGrid,
  STRIP_PHOTO_H,
  STRIP_PHOTO_W,
  STRIP_BOTTOM_Y,
  STRIP_GAP,
  STRIP_MAX_W,
  CG_W,
  rankPhotoX,
  rankPhotoY,
  RANK_PHOTO_H,
  RANK_PHOTO_W,
} from '../layout';

interface PhotoLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  opacity: number;
  zIndex: number;
}

interface StripPos {
  x: number;
  y: number;
  w: number;
  h: number;
}

const STRIP_SETTLE = 800;
const BAR_INTERVAL = 1100;
const PHOTO_OFFSET = 280;

interface Props {
  nominees: CgMappedEntry[];
  rankings: CgMappedEntry[];
  stepKey: CgStep;
  lang?: 'ja' | 'en';
}

export default function PhotoStage({ nominees, rankings, stepKey, lang = 'ja' }: Props) {
  // Shuffle once on mount (component remounts per category session via key prop)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const shuffled = useMemo(() => {
    const arr = [...nominees];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }, []);

  const idToRank = useMemo(() => {
    const m = new Map<string, number>();
    rankings.forEach((r) => m.set(r.id, r.rank));
    return m;
  }, [rankings]);

  const gridLayout = useMemo(() => nomineesGrid(shuffled.length), [shuffled.length]);

  // Staggered insert: which ranks have moved from strip to bar
  const [insertProgress, setInsertProgress] = useState<Record<number, boolean>>({});
  useEffect(() => {
    setInsertProgress({});
    if (stepKey !== 'ranks52') return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    ([5, 4, 3, 2] as const).forEach((rank, i) => {
      const t = setTimeout(() => {
        setInsertProgress((p) => ({ ...p, [rank]: true }));
      }, STRIP_SETTLE + i * BAR_INTERVAL + PHOTO_OFFSET);
      timers.push(t);
    });
    return () => timers.forEach(clearTimeout);
  }, [stepKey]);

  // Staggered nominees reveal
  const [nomineesShown, setNomineesShown] = useState(0);
  useEffect(() => {
    if (stepKey !== 'nominees') return;
    setNomineesShown(0);
    const N = shuffled.length;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < N; i++) {
      timers.push(
        setTimeout(() => setNomineesShown((v) => Math.max(v, i + 1)), 150 + i * 90),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [stepKey, shuffled.length]);

  // Fixed strip positions based on ALL nominees (never reflow)
  const initialStripPositions = useMemo<Map<string, StripPos>>(() => {
    const count = shuffled.length;
    const gap = STRIP_GAP;
    let w = STRIP_PHOTO_W;
    let h = STRIP_PHOTO_H;
    const rawTotalW = count * STRIP_PHOTO_W + (count - 1) * gap;
    if (rawTotalW > STRIP_MAX_W) {
      const scale = (STRIP_MAX_W - (count - 1) * gap) / (count * STRIP_PHOTO_W);
      w = STRIP_PHOTO_W * scale;
      h = STRIP_PHOTO_H * scale;
    }
    const totalW = count * w + (count - 1) * gap;
    const startX = (CG_W - totalW) / 2;
    const y = STRIP_BOTTOM_Y - h / 2;
    const posById = new Map<string, StripPos>();
    shuffled.forEach((n, idx) => {
      posById.set(n.id, { x: startX + idx * (w + gap), y, w, h });
    });
    return posById;
  }, [shuffled]);

  const isInStrip = (n: CgMappedEntry): boolean => {
    if (stepKey === 'nominees') return false;
    const r = idToRank.get(n.id);
    if (stepKey === 'ranks52') {
      if (r == null) return true;
      if (r === 1) return true;
      return insertProgress[r] !== true;
    }
    if (stepKey === 'winner-bar') {
      if (r == null) return true;
      if (r === 1) return true;
      if (r >= 6) return true;     // ranks 6+ も strip に残す (rank position は 2-5 だけ)
      return false;                  // 2-5 は rank position
    }
    if (stepKey === 'oneshot') {
      if (r == null) return true;
      if (r === 1) return true;
      if (r >= 6) return true;     // ranks 6+ も strip に残す（blur 越しに見える）
      return false;                  // 2-5 は rank position
    }
    return false;
  };

  const layoutFor = (n: CgMappedEntry, idxInOrig: number): PhotoLayout => {
    const rank = idToRank.get(n.id);
    const inStrip = isInStrip(n);

    if (stepKey === 'nominees') {
      const { cols, photoW, photoH, cardW, gap, startY, cardH } = gridLayout;
      const col = idxInOrig % cols;
      const row = Math.floor(idxInOrig / cols);
      const N = nominees.length;
      const rowCount = Math.min(cols, N - row * cols);
      const rowTotalW = rowCount * cardW + (rowCount - 1) * gap;
      const rowStartX = (CG_W - rowTotalW) / 2 + 12;
      return {
        x: rowStartX + col * (cardW + gap),
        y: startY + row * (cardH + gap),
        w: photoW,
        h: photoH,
        opacity: 1,
        zIndex: 2,
      };
    }

    if (inStrip) {
      const p = initialStripPositions.get(n.id);
      if (!p) return { x: 0, y: 0, w: 0, h: 0, opacity: 0, zIndex: 0 };
      const isWinnerFading = stepKey === 'oneshot' && rank === 1;
      return {
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
        opacity: isWinnerFading ? 0 : 1,
        zIndex: 2,
      };
    }

    if (rank != null && rank >= 2 && rank <= 5) {
      return {
        x: rankPhotoX(),
        y: rankPhotoY(rank),
        w: RANK_PHOTO_W,
        h: RANK_PHOTO_H,
        opacity: 1,
        zIndex: 4,
      };
    }

    return { x: 0, y: 0, w: 0, h: 0, opacity: 0, zIndex: 0 };
  };

  const isNomineeStep = stepKey === 'nominees';
  const baseW = gridLayout.photoW;
  const baseH = gridLayout.photoH;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 5,
      }}
    >
      {shuffled.map((n, i) => {
        const rank = idToRank.get(n.id);
        const L = layoutFor(n, i);
        const displayName    = lang === 'en' ? (n.nameEn || n.name)    : n.name;
        const displayCompany = lang === 'en' ? (n.orgEn  || n.company) : n.company;
        const nameFit = fitText(displayName,    baseW, `800 19px 'Noto Sans JP', sans-serif`, true);
        const compFit = fitText(displayCompany, baseW, `600 12px 'Noto Sans JP', sans-serif`, true);
        const isOneShotWinner = rank === 1 && stepKey === 'oneshot';
        const showLabel = isNomineeStep;
        const nomineeRevealed = !isNomineeStep || i < nomineesShown;
        const finalOpacity = isNomineeStep ? (nomineeRevealed ? L.opacity : 0) : L.opacity;

        const scale = L.w > 0 ? L.w / baseW : 0;
        const settledTransform = `translate(${L.x}px, ${L.y}px) scale(${scale})`;
        const entryTransform =
          isNomineeStep && !nomineeRevealed
            ? `translate(${L.x}px, ${L.y + 30}px) scale(${scale * 0.86})`
            : settledTransform;

        const transition = isNomineeStep
          ? 'transform 520ms cubic-bezier(.2,1,.3,1), opacity 420ms ease'
          : 'transform 880ms cubic-bezier(.22,1,.36,1), opacity 500ms ease';

        return (
          <div key={n.id}>
            {/* Photo card */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                transformOrigin: 'top left',
                transform: entryTransform,
                width: baseW,
                height: baseH,
                opacity: finalOpacity,
                zIndex: L.zIndex,
                transition,
                willChange: 'transform, opacity',
                border: isOneShotWinner
                  ? '3px solid #F5D76E'
                  : '1px solid rgba(201,162,75,0.5)',
                boxShadow: isOneShotWinner
                  ? '0 0 120px rgba(245,215,110,0.45)'
                  : '0 4px 12px rgba(0,0,0,0.5)',
                overflow: 'hidden',
                background: '#111',
              }}
            >
              {n.photo ? (
                <img
                  src={n.photo}
                  alt={displayName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <PortraitPlaceholder entry={n} seed={i} />
              )}
              {isNomineeStep && (
                <>
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: 20,
                      height: 20,
                      borderTop: '2px solid #F5D76E',
                      borderLeft: '2px solid #F5D76E',
                    }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      right: 0,
                      width: 20,
                      height: 20,
                      borderBottom: '2px solid #F5D76E',
                      borderRight: '2px solid #F5D76E',
                    }}
                  />
                </>
              )}
            </div>

            {/* Name label (nominees grid only) */}
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                transformOrigin: 'top left',
                transform:
                  isNomineeStep && !nomineeRevealed
                    ? `translate(${L.x}px, ${L.y + baseH + 8 + 30}px) scale(${scale * 0.86})`
                    : `translate(${L.x}px, ${L.y + baseH * scale + 8}px) scale(${scale})`,
                width: baseW,
                opacity: showLabel ? finalOpacity : 0,
                transition,
                pointerEvents: 'none',
                zIndex: L.zIndex,
              }}
            >
              <div
                style={{
                  fontFamily: "'Noto Sans JP', sans-serif",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '0.2em',
                  paddingLeft: '0.2em',
                  color: '#bfa15a',
                  marginBottom: 2,
                  ...fitStyle(compFit),
                }}
              >
                {displayCompany}
              </div>
              <div
                style={{
                  fontFamily: "'Noto Sans JP', sans-serif",
                  fontWeight: 800,
                  fontSize: 19,
                  color: '#fff',
                  letterSpacing: '0.06em',
                  paddingLeft: '0.06em',
                  lineHeight: 1.15,
                  ...fitStyle(nameFit),
                }}
              >
                {displayName}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
