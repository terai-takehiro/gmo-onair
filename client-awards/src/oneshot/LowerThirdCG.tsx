import { useEffect, useMemo, useRef } from 'react';
import type { EventModuleConfig, Lang, ModuleKey, Nominee } from './types';
import { getModules } from './modules/getModules';
import DynamicModule from './modules/dynamic/DynamicModule';
import { createDefaultEventModuleConfig } from './data/presetModules';
import { findModuleByCueKey } from './lib/moduleKeyMap';
import SlotSwitcher from './animation/SlotSwitcher';
import AwardHeader from './headline/AwardHeader';
import Headline from './headline/Headline';
import Portrait from './headline/Portrait';
// v2.8.86+ → v2.8.87+: FLIP テクニック (transform: scale) で GPU 加速の「なめらか拡大縮小」。
// v2.8.86 では useLayoutEffect (deps: moduleKey) で測定していたが、SlotSwitcher の
// content swap が **非同期** (useEffect 内で setState) で起きるため、useLayoutEffect が
// 走る瞬間はまだ旧コンテンツ → 新サイズが取れず、高さだけ変わるケース (例: 尊敬→得意技)
// で FLIP がスキップされていた。
// v2.8.87+: **ResizeObserver** に切替えて、実際のレイアウト変化を直接検知。
// content swap でも width 変化でも何でも検知 → 1 つの仕組みで全パターンカバー。

interface Props {
  nominee: Nominee;
  lang: Lang;
  moduleKey: ModuleKey;
  transparent?: boolean;
  tickerOn?: boolean;
  exiting?: boolean;
  /** 画像 (Portrait) を表示するか。OFF の場合は左カラムを畳んだコンパクト表示 */
  showPortrait?: boolean;
  /** v2.8.72+: 動的レンダラ (ModuleDef 駆動) を使うか。
   *  default true。false の場合は v2.8.71 以前のハードコード版で描画。 */
  useDynamicRenderer?: boolean;
  /** v2.8.74+: 日英両方表示モード。DynamicModule のスロットが JA + EN の縦スタックを描画する。 */
  bilingual?: boolean;
  /** v2.8.76+: イベント別 EventModuleConfig。未指定なら createDefaultEventModuleConfig() で補完。 */
  moduleConfig?: EventModuleConfig;
}

// 表彰式テロップCG (1920x1080, 背景透過対応)
// テロップ本体: 1200×~290, 画面下中央
export default function LowerThirdCG({
  nominee,
  lang,
  moduleKey,
  transparent = false,
  tickerOn = false,
  exiting = false,
  showPortrait = true,
  useDynamicRenderer = true,
  bilingual = false,
  moduleConfig,
}: Props) {
  const n = nominee;
  const isTeam = n.type === 'team';
  const modules = useMemo(() => getModules(n, lang), [n, lang]);
  // legacy renderer は preset 短キーで参照
  const legacyMod = modules[moduleKey] ?? modules.none!;
  // 動的レンダラ用: イベント別 config (or デフォルト) から moduleKey に対応する ModuleDef を解決
  const effectiveConfig = useMemo(
    () => moduleConfig ?? createDefaultEventModuleConfig(),
    [moduleConfig]
  );
  const dynamicMod = useMemo(
    () => findModuleByCueKey(effectiveConfig, moduleKey),
    [effectiveConfig, moduleKey]
  );
  const nomineeKey = `${n.id}-${lang}`;
  const hasModule = moduleKey !== 'none' && (
    useDynamicRenderer
      ? !!(dynamicMod && dynamicMod.slots.length > 0)
      : true
  );
  // v2.8.82: delayedModuleKey の遅延同期は廃止 (シンプルなクロスディゾルブで十分)。
  // 長文系: dynamic は ModuleDef.width、legacy は preset 短キー判定。
  const isWide = isTeam || (useDynamicRenderer
    ? dynamicMod?.width === 'wide'
    : (moduleKey === 'comment' || moduleKey === 'recComment'));

  // v2.8.87+: FLIP smooth resize via ResizeObserver
  const panelRef = useRef<HTMLDivElement>(null);
  const prevSizeRef = useRef<{ w: number; h: number } | null>(null);
  const animatingRef = useRef(false);
  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    if (typeof ResizeObserver === 'undefined') return;

    let scheduled: number | null = null;

    const triggerFlip = () => {
      scheduled = null;
      // offsetWidth/Height は layout サイズ (transform の影響を受けない) → 安全に measure 可能
      const newW = el.offsetWidth;
      const newH = el.offsetHeight;
      const prev = prevSizeRef.current;
      prevSizeRef.current = { w: newW, h: newH };

      if (!prev) return; // 初回は記録のみ
      if (Math.abs(prev.w - newW) < 1 && Math.abs(prev.h - newH) < 1) return;
      // 進行中アニメは尊重 (rapid 連続クリック時のジャンプ回避)
      if (animatingRef.current) return;

      const sx = prev.w / newW;
      const sy = prev.h / newH;
      el.style.transformOrigin = '50% 100%';
      el.style.willChange = 'transform';
      el.style.transition = 'none';
      el.style.transform = `scale(${sx}, ${sy})`;
      animatingRef.current = true;

      requestAnimationFrame(() => {
        if (!el.isConnected) return;
        el.style.transition = 'transform 400ms cubic-bezier(.45,.05,.55,.95)';
        el.style.transform = 'scale(1, 1)';
      });
      // アニメ完了後 (約 420ms) にフラグ解除
      window.setTimeout(() => {
        animatingRef.current = false;
        // クリーンアップ — 次の measure に支障がないように
        if (el.isConnected) {
          el.style.transition = '';
          el.style.transform = '';
          el.style.willChange = '';
        }
      }, 420);
    };

    const observer = new ResizeObserver(() => {
      // rAF coalesce で連続発火を 1 回に集約
      if (scheduled != null) return;
      scheduled = requestAnimationFrame(triggerFlip);
    });
    observer.observe(el);
    // 初期サイズ記録
    prevSizeRef.current = { w: el.offsetWidth, h: el.offsetHeight };

    return () => {
      observer.disconnect();
      if (scheduled != null) cancelAnimationFrame(scheduled);
    };
  }, []);

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
            <AwardHeader n={n} lang={lang} bilingual={bilingual} />
            <Headline n={n} lang={lang} isWide={isWide} bilingual={bilingual} />

            <div className={'lt-module-slot ' + (hasModule ? 'open ' : 'closed ')}>
              {hasModule && (
                <SlotSwitcher
                  keyId={`${n.id}-${lang}-${useDynamicRenderer ? dynamicMod?.id ?? legacyMod.key : legacyMod.key}`}
                >
                  {useDynamicRenderer && dynamicMod
                    ? <DynamicModule def={dynamicMod} nominee={n} lang={lang} bilingual={bilingual} />
                    : legacyMod.render()}
                </SlotSwitcher>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
