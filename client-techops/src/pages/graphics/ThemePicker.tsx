// テロップCG — テーマ切替（ハブ画面のヘッダーに置く小さな Select）。
// テーマはプロジェクト単位（graphics_projects.theme）。切り替えると出力画面・
// プレビューの見た目が一括で変わる（キーとレンダラの対応は出力側の担当）。
import { useState } from 'react';
import { Palette } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { notifyError, notifySuccess } from '@/lib/notify';
import { GRAPHICS_THEMES, updateGraphicsProject, type GraphicsThemeKey } from '@/lib/graphicsApi';

export default function ThemePicker({ projectId, theme, onSaved }: {
  projectId: string | number;
  /** いまのテーマキー。未知の値でも表示は壊さない（そのまま value に渡すだけ） */
  theme: string;
  onSaved: () => void | Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  const change = async (next: string) => {
    if (next === theme) return;
    setSaving(true);
    try {
      await updateGraphicsProject(projectId, { theme: next as GraphicsThemeKey });
      const label = GRAPHICS_THEMES.find((t) => t.key === next)?.label ?? next;
      notifySuccess(`見た目を「${label}」にしました`, { description: '出力画面の見た目が切り替わります。' });
      await onSaved();
    } catch {
      notifyError('見た目を変更できませんでした');
    } finally {
      setSaving(false);
    }
  };

  return (
    <label className="flex items-center gap-2">
      <span className="flex items-center gap-1 text-sub font-bold text-muted-foreground">
        <Palette className="h-4 w-4" aria-hidden="true" />
        見た目
      </span>
      <Select value={theme} onValueChange={(v) => { void change(v); }} disabled={saving}>
        {/* 表の列幅ではなくドロップダウンの幅なので col-width-by-hand の対象外 */}
        <SelectTrigger className="min-h-tap w-[168px]" aria-label="見た目"> {/* ui-tokens-ok */}
          <SelectValue placeholder="見た目を選ぶ" />
        </SelectTrigger>
        <SelectContent>
          {GRAPHICS_THEMES.map((t) => (
            <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}
