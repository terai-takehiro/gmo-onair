import { useEffect, useMemo, useRef } from 'react';
import type { EventModuleConfig, Lang, ModuleKey, Nominee } from './types';
import DynamicModule from './modules/dynamic/DynamicModule';
import { createDefaultEventModuleConfig } from './data/presetModules';
import { findModuleByCueKey } from './lib/moduleKeyMap';
import SlotSwitcher from './animation/SlotSwitcher';
import AwardHeader from './headline/AwardHeader';
import Headline from './headline/Headline';
import Portrait from './headline/Portrait';

interface Props {
  nominee: Nominee;
  lang: Lang;
  moduleKey: ModuleKey;
  transparent?: boolean;
  tickerOn?: boolean;
  exiting?: boolean;
  /** 画像 (Portrait) を表示するか。OFF の場合は左カラムを畳んだコンパクト表示 */
  showPortrait?: boolean;
  /** イベント別 EventModuleConfig。未指定なら createDefaultEventModuleConfig() で補完。 */
  moduleConfig?: EventModuleConfig;
}

// 表彰式テロップCG (1920x1080, 背景透過対応)
// テロップ本体: 1200×~290, 画面下中央
//
// レンダリング:
//   ・Module slot は EventModuleConfig + ModuleDef の動的レンダラ (DynamicModule) で描画
//   ・JA / EN は別言語、bilingual stacking は廃止 (operator は side-by-side preview を使う)
//
// アニメーション (v2.8.88):
//   ・SlotSwitcher: 旧→新 cross-dissolve (~360ms)
//   ・FLIP via ResizeObserver: panel size 変化を検知 → transform: scale で GPU 加速の
//     「なめらか拡大縮小」(After Effects 的)。同期適用 + force reflow でピクツキ排除。
export default function LowerThirdCG({
  nominee,
  lang,
  moduleKey,
  transparent = false,
  tickerOn = false,
  exiting = false,
  showPortrait = true,
  moduleConfig,
}: Props) {
  const n = nominee;
  const isTeam = n.type === 'team';
  // EventModuleConfig (or デフォルト) から moduleKey に対応する ModuleDef を解決
  const effectiveConfig = useMemo(
    () => moduleConfig ?? createDefaultEventModuleConfig(),
    [moduleConfig]
  );
  const dynamicMod = useMemo(
    () => findModuleByCueKey(effectiveConfig, moduleKey),
    [effectiveConfig, moduleKey]
  );
  const nomineeKey = `${n.id}-${lang}`;
  const hasModule = moduleKey !== 'none' && !!(dynamicMod && dynamicMod.slots.length > 0);
  // 長文系モジュール (ModuleDef.width === 'wide') または team は wide
  const isWide = isTeam || dynamicMod?.width === 'wide';

  // FLIP smooth resize via ResizeObserver (transform: scale で GPU 加速)
  // 注意: nomineeKey が変化すると `.lower-third` (親) が remount され .lt-panel も
  // 新しい DOM 要素になるため、deps に nomineeKey を含めて Observer を再接続する。
  // (空 deps だと初回 mount 時の el を closure で掴み続けて stale Observer になる)
  const panelRef = useRef<HTMLDivElement>(null);
  const prevSizeRef = useRef<{ w: number; h: number } | null>(null);
  const animatingRef = useRef(false);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    if (typeof ResizeObserver === 'undefined') return;

    // remount 時は前回サイズをリセット (新しい DOM での初測定は記録のみ)
    prevSizeRef.current = null;
    animatingRef.current = false;

    const observer = new ResizeObserver(() => {
      // 進行中アニメ中は新規 trigger をスキップ (連続クリック時のジャンプ回避)
      if (animatingRef.current) return;

      // 残骸クリア
      el.style.transition = 'none';
      el.style.transform = '';

      // offsetWidth/Height は layout サイズ (transform の影響を受けない) → 安全に measure
      const newW = el.offsetWidth;
      const newH = el.offsetHeight;
      const prev = prevSizeRef.current;
      prevSizeRef.current = { w: newW, h: newH };

      if (!prev) return; // 初回は記録のみ
      if (Math.abs(prev.w - newW) < 1 && Math.abs(prev.h - newH) < 1) return;

      // 旧サイズ ÷ 新サイズ = 逆スケール → 視覚的に旧サイズに戻す (paint 直前の同期適用)
      const sx = prev.w / newW;
      const sy = prev.h / newH;
      el.style.transformOrigin = '50% 100%';
      el.style.willChange = 'transform';
      el.style.transform = `scale(${sx}, ${sy})`;

      // force reflow: 「scale(sx,sy) 状態」を browser にコミット
      void el.offsetHeight;

      // 同フレームで transition + 目標 scale(1,1) → ブラウザが GPU で補間
      el.style.transition = 'transform 400ms cubic-bezier(.45,.05,.55,.95)';
      el.style.transform = 'scale(1, 1)';
      animatingRef.current = true;

      window.setTimeout(() => {
        animatingRef.current = false;
        if (el.isConnected) {
          el.style.transition = '';
          el.style.transform = '';
          el.style.willChange = '';
        }
      }, 420);
    });
    observer.observe(el);
    prevSizeRef.current = { w: el.offsetWidth, h: el.offsetHeight };

    return () => {
      observer.disconnect();
    };
  }, [nomineeKey]);

  return (
    <div className={'stage' + (transparent ? ' transparent' : '')}>
      <div
        className={
          'lower-third ' +
          (exiting ? 'lt-exit ' : 'lt-enter ') +
          'auto-h ' +
          (isWide ? 'wide ' : '') +
          (tickerOn ? 'raised ' : '') +
          (!showPortrait ? 'no-portrait ' : '') +
          (!hasModule ? 'no-module ' : '')
        }
        key={nomineeKey}
      >
        <div className={'lt-panel' + (showPortrait ? '' : ' no-portrait')} ref={panelRef}>
          <div className="lt-corner tl" />
          <div className="lt-corner tr" />
          <div className="lt-corner bl" />
          <div className="lt-corner br" />

          {showPortrait && <Portrait n={n} />}

          <div className="lt-info">
            <AwardHeader n={n} lang={lang} />
            <Headline n={n} lang={lang} isWide={isWide} />

            <div className={'lt-module-slot ' + (hasModule ? 'open ' : 'closed ')}>
              {hasModule && dynamicMod && (
                <SlotSwitcher keyId={`${n.id}-${lang}-${dynamicMod.id}`}>
                  <DynamicModule def={dynamicMod} nominee={n} lang={lang} />
                </SlotSwitcher>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
