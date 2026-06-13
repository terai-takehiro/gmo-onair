import { useMemo } from 'react';
import type { CgMappedEntry } from '../types';
import { CondenseText } from '../components/CondenseText';

interface Props {
  entries: CgMappedEntry[];      // sorted by rank
  pickedIndex: 0 | 1 | 2 | 3;     // 0 = 3 cards / 1-3 = picked
  categoryChild: string;          // poll_title
  lang: 'ja' | 'en';
}

/**
 * ファイナルピッチ画面。
 * Phase 0: TOP3 の 3 名カード横並び (デフォルト)。
 * Phase 1-3: TAKE で 1 名ピックアップ。大写し中央表示 + ノミネートタイトル。
 */
export default function StepFinalPitch({ entries, pickedIndex, categoryChild, lang }: Props) {
  const top3 = useMemo(() => entries.filter((e) => e.rank >= 1 && e.rank <= 3), [entries]);

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* 上ヘッダー: 賞タイトル (poll_title) */}
      <div style={{
        position: 'absolute', top: 90, left: 0, right: 0,
        textAlign: 'center',
      }}>
        <div style={{
          fontFamily: "'Noto Sans JP', sans-serif",
          fontSize: 16,
          letterSpacing: '0.7em',
          color: 'rgba(245,215,110,0.95)',
          marginBottom: 12,
        }}>
          &mdash; &nbsp; FINAL PITCH &nbsp; &mdash;
        </div>
        <CondenseText
          style={{
            fontFamily: "'Noto Sans JP', sans-serif",
            fontWeight: 900,
            fontSize: 52,
            letterSpacing: '0.12em',
            textAlign: 'center',
            padding: '0 80px',
          }}
          min={0.4}
        >
          <span style={{
            background: 'linear-gradient(180deg, #FFE8A8 0%, #E8C56C 50%, #9E7B2E 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
            filter: 'drop-shadow(0 4px 18px rgba(0,0,0,0.85))',
          }}>{categoryChild}</span>
        </CondenseText>
      </div>

      {/* カード表示 */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0,
        top: 250,
        bottom: 80,
      }}>
        {top3.map((entry, i) => {
          const slotIndex = i + 1; // 1, 2, 3
          const isPicked = pickedIndex === slotIndex;
          const isPickedMode = pickedIndex !== 0;
          const isOther = isPickedMode && !isPicked;
          return (
            <PitchCard
              key={entry.id}
              entry={entry}
              slot={slotIndex}
              isPicked={isPicked}
              isOther={isOther}
              isPickedMode={isPickedMode}
              lang={lang}
            />
          );
        })}
      </div>
    </div>
  );
}

const CARD_W = 380;
const CARD_H = 510;
const PHOTO_H = 380;
const SLOT_X: Record<number, number> = {
  1: 280,           // 左
  2: 770,           // 中央 (1920/2 - CARD_W/2 = 770)
  3: 1260,          // 右
};
const CENTER_X = 770;  // picked 時の中央位置

function PitchCard({ entry, slot, isPicked, isOther, lang }: {
  entry: CgMappedEntry;
  slot: number;
  isPicked: boolean;
  isOther: boolean;
  isPickedMode: boolean;
  lang: 'ja' | 'en';
}) {
  const name = lang === 'en' ? (entry.nameEn || entry.name) : entry.name;
  const company = lang === 'en' ? (entry.orgEn || entry.company) : entry.company;
  const nomTitle = lang === 'en'
    ? (entry.nominationTitleEn || entry.nominationTitle || '')
    : (entry.nominationTitle || '');

  // ピックアップ時のスタイル
  const x = isPicked ? CENTER_X : SLOT_X[slot] ?? 770;
  const scale = isPicked ? 1.25 : 1;
  const opacity = isOther ? 0 : 1;
  const translateY = isOther ? 60 : 0;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: 0,
        width: CARD_W,
        height: CARD_H,
        transform: `translate(0, ${translateY}px) scale(${scale})`,
        transformOrigin: 'center top',
        opacity,
        transition: 'left 900ms cubic-bezier(.2,.85,.3,1), transform 900ms cubic-bezier(.2,.85,.3,1), opacity 700ms ease',
        zIndex: isPicked ? 10 : 5,
      }}
    >
      {/* 写真 */}
      <div style={{
        position: 'absolute',
        left: (CARD_W - 280) / 2,
        top: 0,
        width: 280, height: PHOTO_H,
        background: 'linear-gradient(180deg, #181012, #0a0608)',
        border: isPicked ? '3px solid rgba(245,215,110,0.95)' : '1px solid rgba(245,215,110,0.85)',
        boxShadow: isPicked
          ? '0 18px 36px rgba(0,0,0,0.85), 0 0 60px rgba(245,215,110,0.4)'
          : '0 18px 36px rgba(0,0,0,0.75), 0 0 24px rgba(245,215,110,0.18)',
        overflow: 'hidden',
        transition: 'border 600ms ease, box-shadow 600ms ease',
      }}>
        {entry.photo ? (
          <img src={entry.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }}/>
        ) : (
          <div style={{
            width: '100%', height: '100%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Noto Sans JP', sans-serif",
            fontSize: 130, color: 'rgba(245,215,110,0.3)',
          }}>—</div>
        )}
        <div style={{
          position: 'absolute', inset: 4,
          border: '1px solid rgba(245,215,110,0.25)',
          pointerEvents: 'none',
        }}/>
      </div>

      {/* 名前 + 会社 */}
      <div style={{
        position: 'absolute',
        left: 0, right: 0,
        top: PHOTO_H + 14,
        textAlign: 'center',
        padding: '0 8px',
      }}>
        <CondenseText
          style={{
            fontFamily: "'Noto Sans JP', sans-serif",
            fontWeight: 900,
            fontSize: 28,
            color: '#f8eccc',
            letterSpacing: '0.05em',
            textShadow: '0 2px 10px rgba(0,0,0,0.85)',
            lineHeight: 1.1,
          }}
          min={0.45}
        >
          {name}
        </CondenseText>
        {company && (
          <CondenseText
            style={{
              marginTop: 4,
              fontFamily: "'Noto Sans JP', sans-serif",
              fontSize: 16,
              color: 'rgba(245,215,110,0.85)',
              letterSpacing: '0.18em',
            }}
            min={0.45}
          >
            {company}
          </CondenseText>
        )}
      </div>

      {/* ノミネートタイトル (ピックアップ時のみ大きく表示) */}
      {isPicked && nomTitle && (
        <div style={{
          position: 'absolute',
          left: -560, right: -560,   // CARD_W 380 + 左右 1120 = 1500px 幅
          top: PHOTO_H + 100,
          display: 'flex',
          justifyContent: 'center',
          opacity: 0,
          animation: 'pitchNomTitleIn 800ms cubic-bezier(.2,1,.3,1) 400ms forwards',
        }}>
          <style>{`
            @keyframes pitchNomTitleIn {
              from { opacity: 0; transform: translateY(20px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>
          <div style={{
            padding: '14px 36px',
            background: 'linear-gradient(180deg, rgba(30,22,10,0.92) 0%, rgba(12,8,4,0.96) 100%)',
            border: '2px solid rgba(245,215,110,0.85)',
            boxShadow: '0 14px 36px rgba(0,0,0,0.7), 0 0 40px rgba(245,215,110,0.25), inset 0 1px 0 rgba(255,235,180,0.18)',
            maxWidth: 1500,
            width: '100%',
            boxSizing: 'border-box',
          }}>
            <CondenseText
              style={{
                fontFamily: "'Noto Sans JP', sans-serif",
                fontWeight: 900,
                fontSize: 44,
                color: '#fff',
                letterSpacing: '0.04em',
                textShadow: '0 2px 12px rgba(0,0,0,0.85)',
                lineHeight: 1.1,
                textAlign: 'center',
              }}
              min={0.4}
            >
              {nomTitle}
            </CondenseText>
          </div>
        </div>
      )}
    </div>
  );
}
