import { AlertTriangle } from "lucide-react";

/**
 * 音声サポート公開URLの旧URL(トークン無し)予告帯。
 * 実装設計 02-audio-share-token-impl.md §4-3 段階②。
 *
 * 色は生パレット直書きではなく v4 トークン (--warning) を使う。
 * `AudioSupportPage` は「色は変えない」凍結期の名残の配色方針があるため、
 * 既存の暗い配色を崩さないよう bg/border は低い不透明度に留める(控えめ)。
 */
export function LegacyUrlBanner() {
  return (
    <div
      role="status"
      className="flex-none flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-1.5 text-center text-xs sm:text-sm font-bold text-warning"
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>この URL は近く使えなくなります。新しい QR を配布元に頼んでください</span>
    </div>
  );
}
