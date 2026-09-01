// テロップCG — ランキング発表（`ranking`）4テーマの色トークン。
//
// 段6-5・旧リアルタイムCG client-awards のランキング演出の完全再現移植 第1弾
// （rankingParts.tsx / rankingPartsExtra.tsx / rankingPartsExtra2.tsx から使う）。
//
// **ceremony-gold は旧実装（`client-awards/src/cg/steps/StepRanking.tsx` /
// `StepTop3.tsx` / `StepFinalPitch.tsx`）のインライン値をそのまま持つ**（完全再現の対象）。
// 他の3テーマはゼロから意匠を考えず、既存の確立済み語彙をそのまま流用する
// （scoreParts.tsx の News/Corporate/Variety・nameParts.tsx の同名テーマと同じ色）:
//   news-navy      … 紺ベタ面＋白文字
//   corporate-light… 面なしの袋文字＋アクセント色1本
//   variety-pop    … 黄座布団＋黒座布団の色替え
// レイアウト寸法・アニメーションのタイミング値・イージングは4テーマ共通
// （このファイルは色だけを持つ。数値は rankingPartsExtra*.tsx 側）。
import type { CSSProperties } from 'react';
import { CORPORATE_ACCENT, EDGE_DARK, GOTHIC, NEWS_NAVY, WHITE, type TelopThemeKey } from './telopTheme';

// 旧 StepRanking.tsx / StepTop3.tsx のインライン値そのまま
const CEREMONY_NUMBER_GRADIENT = 'linear-gradient(180deg, #e8dcb6 0%, #bfa15a 55%, #6e5321 100%)';
const CEREMONY_NUMBER_GRADIENT_FIRST =
  'linear-gradient(180deg, #FFFBE6 0%, #FFEFB0 18%, #F5D76E 45%, #C9A24B 75%, #8C6314 100%)';
const CEREMONY_BAR_FILL = 'linear-gradient(180deg, rgba(140,99,20,0.85) 0%, rgba(110,83,33,0.85) 100%)';
const CEREMONY_BAR_FILL_FIRST = 'linear-gradient(180deg, #C9A24B 0%, #8C6314 100%)';
const CEREMONY_OWN_VOTE_FILL = 'linear-gradient(180deg, #F5D76E 0%, #C9A24B 100%)';
const CEREMONY_OWN_VOTE_FILL_FIRST = 'linear-gradient(180deg, #FFEFB0 0%, #F5D76E 100%)';
const VARIETY_YELLOW = '#ffd400';

export interface RankRowTheme {
  /** 順位数字の塗り。`numberIsGradient` が true なら background-image として使う（旧実装のみ） */
  numberBg: string;
  numberIsGradient: boolean;
  numFontFamily: string;
  nameColor: string;
  nameFontFamily: string;
  companyColor: string;
  ptColor: string;
  ptLabelColor: string;
  barBorder: string;
  barFill: string;
  ownVoteFill: string;
  photoBorder: string;
  photoBg: string;
  /** 面が無いテーマ（コーポレート・バラエティ）だけ、袋文字で映像から浮かせる */
  edgeStroke?: CSSProperties;
}

/** RankingBars（RANKS発表・winner-bar）の1行ぶんの色。`isFirst`＝1位の強調色（ceremonyのみ旧実装どおり差分あり） */
export function getRankRowTheme(theme: TelopThemeKey, isFirst: boolean): RankRowTheme {
  if (theme === 'news-navy') {
    return {
      numberBg: WHITE, numberIsGradient: false, numFontFamily: GOTHIC,
      nameColor: WHITE, nameFontFamily: GOTHIC, companyColor: '#cfd8e6',
      ptColor: WHITE, ptLabelColor: '#9fb3d1',
      barBorder: isFirst ? '1px solid rgba(255,255,255,0.85)' : '1px solid rgba(255,255,255,0.35)',
      barFill: isFirst ? 'linear-gradient(180deg, #1c3f73 0%, #0c1f3d 100%)' : NEWS_NAVY,
      ownVoteFill: '#e8332a',
      photoBorder: 'rgba(255,255,255,0.5)', photoBg: 'rgba(255,255,255,0.08)',
    };
  }
  if (theme === 'corporate-light') {
    return {
      numberBg: WHITE, numberIsGradient: false, numFontFamily: GOTHIC,
      nameColor: WHITE, nameFontFamily: GOTHIC, companyColor: '#dbe6ff',
      ptColor: WHITE, ptLabelColor: CORPORATE_ACCENT,
      barBorder: `1px solid ${CORPORATE_ACCENT}`,
      barFill: isFirst ? '#2f6fed' : 'rgba(47,111,237,0.55)',
      ownVoteFill: '#8fb4ff',
      photoBorder: CORPORATE_ACCENT, photoBg: 'rgba(47,111,237,0.12)',
      edgeStroke: EDGE_DARK,
    };
  }
  if (theme === 'variety-pop') {
    return {
      numberBg: VARIETY_YELLOW, numberIsGradient: false, numFontFamily: GOTHIC,
      nameColor: WHITE, nameFontFamily: GOTHIC, companyColor: '#ffe98a',
      ptColor: WHITE, ptLabelColor: VARIETY_YELLOW,
      barBorder: '1px solid rgba(255,212,0,0.85)',
      barFill: isFirst ? '#151515' : 'rgba(21,21,21,0.85)',
      ownVoteFill: VARIETY_YELLOW,
      photoBorder: VARIETY_YELLOW, photoBg: 'rgba(255,212,0,0.12)',
      edgeStroke: { WebkitTextStroke: '4px rgba(28, 8, 44, 0.85)', paintOrder: 'stroke fill' },
    };
  }
  // ceremony-gold（既定）— 旧実装の完全再現
  return {
    numberBg: isFirst ? CEREMONY_NUMBER_GRADIENT_FIRST : CEREMONY_NUMBER_GRADIENT, numberIsGradient: true,
    numFontFamily: "'Roboto Condensed', sans-serif",
    nameColor: '#fff', nameFontFamily: GOTHIC, companyColor: isFirst ? '#fff8d8' : '#fffdf2',
    ptColor: '#fff', ptLabelColor: '#F5D76E',
    barBorder: isFirst ? '1px solid rgba(245,215,110,0.9)' : '1px solid rgba(201,162,75,0.55)',
    barFill: isFirst ? CEREMONY_BAR_FILL_FIRST : CEREMONY_BAR_FILL,
    ownVoteFill: isFirst ? CEREMONY_OWN_VOTE_FILL_FIRST : CEREMONY_OWN_VOTE_FILL,
    photoBorder: 'rgba(201,162,75,0.35)', photoBg: 'rgba(0,0,0,0.35)',
  };
}

export interface Top3Theme {
  badgeBg: string;
  badgeIsGradient: boolean;
  badgeGlow?: string;
  cardBorder: string;
  cardGlow: string;
  bracketColor: string;
  nameColor: string;
  companyColor: string;
  ptColor: string;
  ptLabelColor: string;
  photoBg: string;
}

/** RankingTop3 の1枚ぶんの色。`isFirst`＝1位（旧実装は金枠＋グローで区別。サイズでは区別しない） */
export function getTop3Theme(theme: TelopThemeKey, isFirst: boolean): Top3Theme {
  if (theme === 'news-navy') {
    return {
      badgeBg: WHITE, badgeIsGradient: false,
      cardBorder: isFirst ? '3px solid rgba(255,255,255,0.95)' : '1px solid rgba(255,255,255,0.6)',
      cardGlow: isFirst
        ? '0 0 60px rgba(255,255,255,0.25), 0 0 0 1px rgba(255,255,255,0.85) inset'
        : '0 4px 12px rgba(0,0,0,0.5)',
      bracketColor: WHITE, nameColor: WHITE, companyColor: '#cfd8e6',
      ptColor: WHITE, ptLabelColor: '#9fb3d1', photoBg: NEWS_NAVY,
    };
  }
  if (theme === 'corporate-light') {
    return {
      badgeBg: WHITE, badgeIsGradient: false,
      cardBorder: isFirst ? `3px solid ${CORPORATE_ACCENT}` : '1px solid rgba(47,111,237,0.5)',
      cardGlow: isFirst
        ? `0 0 60px rgba(47,111,237,0.35), 0 0 0 1px ${CORPORATE_ACCENT} inset`
        : '0 4px 12px rgba(0,0,0,0.5)',
      bracketColor: CORPORATE_ACCENT, nameColor: WHITE, companyColor: '#dbe6ff',
      ptColor: WHITE, ptLabelColor: CORPORATE_ACCENT, photoBg: '#111',
    };
  }
  if (theme === 'variety-pop') {
    return {
      badgeBg: VARIETY_YELLOW, badgeIsGradient: false,
      cardBorder: isFirst ? `3px solid ${VARIETY_YELLOW}` : '1px solid rgba(255,212,0,0.6)',
      cardGlow: isFirst
        ? '0 0 60px rgba(255,212,0,0.35), 0 0 0 1px rgba(255,212,0,0.85) inset'
        : '0 4px 12px rgba(0,0,0,0.5)',
      bracketColor: VARIETY_YELLOW, nameColor: WHITE, companyColor: '#ffe98a',
      ptColor: WHITE, ptLabelColor: VARIETY_YELLOW, photoBg: '#151515',
    };
  }
  // ceremony-gold — 旧実装の完全再現
  return {
    badgeBg: isFirst ? CEREMONY_NUMBER_GRADIENT_FIRST : CEREMONY_NUMBER_GRADIENT, badgeIsGradient: true,
    badgeGlow: isFirst ? '0 0 40px rgba(245,215,110,0.55)' : undefined,
    cardBorder: '1px solid rgba(201,162,75,0.5)',
    cardGlow: isFirst
      ? '0 0 60px rgba(245,215,110,0.45), 0 0 0 1px rgba(245,215,110,0.85) inset'
      : '0 4px 12px rgba(0,0,0,0.5)',
    bracketColor: '#F5D76E', nameColor: '#fff', companyColor: '#bfa15a',
    ptColor: '#fff', ptLabelColor: '#F5D76E', photoBg: '#111',
  };
}

export interface FinalPitchTheme {
  labelColor: string;
  cardBorder: string;
  cardBorderPicked: string;
  cardGlow: string;
  cardGlowPicked: string;
  photoBg: string;
  nameColor: string;
  companyColor: string;
  nomPanelBg: string;
  nomPanelBorder: string;
  nomPanelShadow: string;
  nomTextColor: string;
}

/** RankingFinalPitch の色。ピック前後の枠・グロー・ノミネートタイトル面を含む */
export function getFinalPitchTheme(theme: TelopThemeKey): FinalPitchTheme {
  if (theme === 'news-navy') {
    return {
      labelColor: 'rgba(255,255,255,0.85)',
      cardBorder: '1px solid rgba(255,255,255,0.6)', cardBorderPicked: '3px solid rgba(255,255,255,0.95)',
      cardGlow: '0 18px 36px rgba(0,0,0,0.75)', cardGlowPicked: '0 18px 36px rgba(0,0,0,0.85), 0 0 40px rgba(255,255,255,0.25)',
      photoBg: NEWS_NAVY, nameColor: WHITE, companyColor: '#cfd8e6',
      nomPanelBg: NEWS_NAVY, nomPanelBorder: 'rgba(255,255,255,0.85)',
      nomPanelShadow: '0 14px 36px rgba(0,0,0,0.6)', nomTextColor: WHITE,
    };
  }
  if (theme === 'corporate-light') {
    return {
      labelColor: 'rgba(47,111,237,0.85)',
      cardBorder: `1px solid ${CORPORATE_ACCENT}`, cardBorderPicked: `3px solid ${CORPORATE_ACCENT}`,
      cardGlow: '0 18px 36px rgba(0,0,0,0.5)', cardGlowPicked: '0 18px 36px rgba(0,0,0,0.6), 0 0 40px rgba(47,111,237,0.35)',
      photoBg: '#111', nameColor: WHITE, companyColor: '#dbe6ff',
      nomPanelBg: 'rgba(10,10,10,0.92)', nomPanelBorder: CORPORATE_ACCENT,
      nomPanelShadow: '0 14px 36px rgba(0,0,0,0.6)', nomTextColor: WHITE,
    };
  }
  if (theme === 'variety-pop') {
    return {
      labelColor: VARIETY_YELLOW,
      cardBorder: '1px solid rgba(255,212,0,0.6)', cardBorderPicked: `3px solid ${VARIETY_YELLOW}`,
      cardGlow: '0 18px 36px rgba(0,0,0,0.6)', cardGlowPicked: '0 18px 36px rgba(0,0,0,0.7), 0 0 40px rgba(255,212,0,0.35)',
      photoBg: '#151515', nameColor: WHITE, companyColor: '#ffe98a',
      nomPanelBg: '#151515', nomPanelBorder: VARIETY_YELLOW,
      nomPanelShadow: '0 14px 36px rgba(0,0,0,0.6)', nomTextColor: WHITE,
    };
  }
  // ceremony-gold — 旧実装の完全再現
  return {
    labelColor: 'rgba(245,215,110,0.95)',
    cardBorder: '1px solid rgba(245,215,110,0.85)', cardBorderPicked: '3px solid rgba(245,215,110,0.95)',
    cardGlow: '0 18px 36px rgba(0,0,0,0.75), 0 0 24px rgba(245,215,110,0.18)',
    cardGlowPicked: '0 18px 36px rgba(0,0,0,0.85), 0 0 60px rgba(245,215,110,0.4)',
    photoBg: 'linear-gradient(180deg, #181012, #0a0608)', nameColor: '#f8eccc', companyColor: 'rgba(245,215,110,0.85)',
    nomPanelBg: 'linear-gradient(180deg, rgba(30,22,10,0.92) 0%, rgba(12,8,4,0.96) 100%)',
    nomPanelBorder: 'rgba(245,215,110,0.85)',
    nomPanelShadow: '0 14px 36px rgba(0,0,0,0.7), 0 0 40px rgba(245,215,110,0.25), inset 0 1px 0 rgba(255,235,180,0.18)',
    nomTextColor: '#fff',
  };
}
