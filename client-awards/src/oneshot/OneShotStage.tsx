import LowerThirdCG from './LowerThirdCG';
import Ticker from './Ticker';
import CountdownCG from './CountdownCG';
import type { EventModuleConfig, Lang, ModuleKey, Nominee, TickerCategory } from './types';

export interface CountdownStageProps {
  on: boolean;
  target: string | null;
  prefixJa: string;
  prefixEn: string;
  x: number;
  y: number;
  scale: number;
}

interface Props {
  nominee: Nominee | null;
  lang: Lang;
  moduleKey: ModuleKey;
  transparent: boolean;
  /** Lower third visible? (operator: live state, output: cue.isLive) */
  lowerThirdMounted: boolean;
  lowerThirdExiting: boolean;
  /** Ticker visible? */
  tickerMounted: boolean;
  tickerExiting: boolean;
  tickerOn: boolean;
  tickerCategory: TickerCategory | null;
  /** 画像 (Portrait) を表示するか (default: true) */
  showPortrait?: boolean;
  /** イベント別 EventModuleConfig (動的モジュール構成) */
  moduleConfig?: EventModuleConfig;
  /** v2.8.121+: カウントダウンテロップ (lower-third / ticker と独立に重ねる) */
  countdown?: CountdownStageProps;
}

// 1920x1080 のCG出力ステージ。operator/output どちらでも使える。
// 親側で letterbox スケールさせる。
export default function OneShotStage({
  nominee,
  lang,
  moduleKey,
  transparent,
  lowerThirdMounted,
  lowerThirdExiting,
  tickerMounted,
  tickerExiting,
  tickerOn,
  tickerCategory,
  showPortrait = true,
  moduleConfig,
  countdown,
}: Props) {
  return (
    <div className="oneshot-cg-root" style={{ position: 'relative', width: 1920, height: 1080 }}>
      {lowerThirdMounted && nominee && (
        <LowerThirdCG
          nominee={nominee}
          lang={lang}
          moduleKey={moduleKey}
          transparent={transparent}
          tickerOn={tickerOn}
          exiting={lowerThirdExiting}
          showPortrait={showPortrait}
          moduleConfig={moduleConfig}
        />
      )}
      {/* Background-only stage when lower-third is unmounted (transparent stays transparent) */}
      {!lowerThirdMounted && (
        <div className={'stage' + (transparent ? ' transparent' : '')} />
      )}
      {countdown?.on && (
        <CountdownCG
          targetIso={countdown.target}
          prefix={lang === 'en' ? countdown.prefixEn : countdown.prefixJa}
          x={countdown.x}
          y={countdown.y}
          scale={countdown.scale}
          lang={lang}
        />
      )}
      {tickerMounted && tickerCategory && (
        <div className={'ticker-wrap ' + (tickerExiting ? 't-exit' : 't-enter')}>
          <Ticker
            award={tickerCategory.award}
            divisions={tickerCategory.divisions}
            lang={lang}
          />
        </div>
      )}
    </div>
  );
}
