/**
 * 標準工程テンプレートの型選択（スマホ用・⑦）
 *
 * PC は 240px の縦レール（型を全部ボタンで並べる）だが、スマホでそのまま
 * 縦に積むと画面の大半を型の一覧が占めてしまう（工程そのものに着くまでが遠い）。
 * **`<select>` 1つに畳む**（`docs/design/v4/mobile.md` の「絞り込みは1行に畳む」
 * と同じ考え方）。読むだけの画面なので、一覧性より省スペースを優先した。
 */
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import type { FlowTemplate } from './flowTypes';

export function MobileTemplateRail({
  templates, selectedId, onSelect,
}: {
  templates: FlowTemplate[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <Select value={selectedId ?? undefined} onValueChange={onSelect}>
      <SelectTrigger aria-label="工程の型を選ぶ" className="w-full">
        <SelectValue placeholder="工程の型を選ぶ" />
      </SelectTrigger>
      <SelectContent>
        {templates.map((t) => {
          const n = t.phases.reduce((s, p) => s + p.tasks.length, 0);
          return (
            <SelectItem key={t.id} value={t.id}>
              {t.name}（{n} 工程{t.project_types.length > 0 ? ` ・ ${t.project_types.length} 分類` : ' ・ すべての分類'}）
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
