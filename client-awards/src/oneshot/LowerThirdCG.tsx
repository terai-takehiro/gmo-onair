import { useMemo } from 'react';
import type { Lang, ModuleKey, Nominee } from './types';
import { getModules } from './modules/getModules';
import { useAnimatedHeight } from './hooks/useAnimatedHeight';
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
}: Props) {
  const n = nominee;
  const isTeam = n.type === 'team';
  const modules = useMemo(() => getModules(n, lang), [n, lang]);
  const mod = modules[moduleKey] ?? modules.none!;
  const nomineeKey = `${n.id}-${lang}`;
  const hasModule = moduleKey !== 'none';
  // 長文系モジュールは幅を1500pxに拡張して高さを抑制 (チームはデフォルト wide)
  const isWide = isTeam || moduleKey === 'comment' || moduleKey === 'recComment';

  // 高さアニメーション (モジュール切替時に実測してpx補間)
  const panelRef = useAnimatedHeight<HTMLDivElement>([moduleKey, n.id, lang, showPortrait]);

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
                <SlotSwitcher keyId={`${n.id}-${lang}-${mod.key}`}>
                  {mod.render()}
                </SlotSwitcher>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
