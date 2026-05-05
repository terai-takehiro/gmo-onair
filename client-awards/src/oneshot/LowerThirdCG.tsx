import { useEffect, useMemo, useState } from 'react';
import type { EventModuleConfig, Lang, ModuleKey, Nominee } from './types';
import { getModules } from './modules/getModules';
import DynamicModule from './modules/dynamic/DynamicModule';
import { createDefaultEventModuleConfig } from './data/presetModules';
import { findModuleByCueKey } from './lib/moduleKeyMap';
import { useAnimatedHeight } from './hooks/useAnimatedHeight';
import { SLOT_PHASE_EXIT_MS } from './animation/timings';
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

  // v2.8.78+: wide モード切替を SlotSwitcher の resize phase と同期。
  // moduleKey 変更後、SLOT_PHASE_EXIT_MS (200ms) 経ってから isWide を反映 →
  // 旧コンテンツのフェードアウト中は古い width を維持、フェードアウト完了後に
  // width / height を同時に変化させ、新コンテンツのフェードインに繋げる。
  const [delayedModuleKey, setDelayedModuleKey] = useState(moduleKey);
  useEffect(() => {
    if (moduleKey === delayedModuleKey) return;
    const t = setTimeout(() => setDelayedModuleKey(moduleKey), SLOT_PHASE_EXIT_MS);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleKey]);
  const delayedDynamicMod = useMemo(
    () => findModuleByCueKey(effectiveConfig, delayedModuleKey),
    [effectiveConfig, delayedModuleKey]
  );
  // 長文系: dynamic は ModuleDef.width を読む、legacy は preset 短キー判定
  const isWide = isTeam || (useDynamicRenderer
    ? delayedDynamicMod?.width === 'wide'
    : (delayedModuleKey === 'comment' || delayedModuleKey === 'recComment'));

  // 高さアニメーション (v2.8.73+: ResizeObserver で content size の変化を検知)
  const panelRef = useAnimatedHeight<HTMLDivElement>();

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
