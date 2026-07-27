import { cn } from '@/lib/utils';
import { Play, Square, EyeOff, Image as ImageIcon, ImageOff } from 'lucide-react';

interface Props {
  isLive: boolean;
  transparent: boolean;
  showPortrait: boolean;
  onTake: () => void;
  onClear: () => void;
  onToggleTransparent: () => void;
  onTogglePortrait: () => void;
}

// v2.8.77+: 画像 ON/OFF チップを統合 (旧 OneShotControlPage の inline 画像ボタンを取り込み)
// モバイル時は flex-wrap で TAKE/CLEAR と画像/透過 が 2 行に分かれる、
// タブレット以上では 1 行で並ぶ。
export default function SendActionRow({
  isLive, transparent, showPortrait,
  onTake, onClear, onToggleTransparent, onTogglePortrait,
}: Props) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={onTake}
        className="flex items-center gap-2 rounded-md bg-destructive hover:bg-destructive/90 px-5 py-3.5 text-base font-black tracking-widest uppercase text-white transition-colors shadow-lg"
      >
        <Play className="h-5 w-5 fill-current" /> TAKE
      </button>
      <button
        onClick={onClear}
        disabled={!isLive}
        className={cn(
          'flex items-center gap-2 rounded-md px-5 py-3.5 text-base font-black tracking-widest uppercase transition-colors',
          isLive
            ? 'bg-muted hover:bg-accent text-foreground'
            : 'bg-card/40 text-muted-foreground cursor-not-allowed'
        )}
      >
        <Square className="h-5 w-5 fill-current" /> CLEAR
      </button>
      <div className="flex-1 hidden sm:block" />
      <button
        onClick={onTogglePortrait}
        className={cn(
          'flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs sm:text-sm font-semibold transition-all',
          showPortrait
            ? 'border-success bg-success/30 text-success'
            : 'border-border text-muted-foreground hover:bg-card hover:text-foreground'
        )}
        title="送出CGに画像 (Portrait) を含めるか切替"
      >
        {showPortrait ? <ImageIcon className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <ImageOff className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
        画像 {showPortrait ? 'ON' : 'OFF'}
      </button>
      <button
        onClick={onToggleTransparent}
        className={cn(
          'flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs sm:text-sm font-semibold transition-all',
          transparent
            ? 'border-warning bg-warning/30 text-warning-strong'
            : 'border-border text-muted-foreground hover:bg-card hover:text-foreground'
        )}
        title="本番出力相当 (背景透過)"
      >
        <EyeOff className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        透過 {transparent ? 'ON' : 'OFF'}
      </button>
    </div>
  );
}
