/**
 * 売上ダイアログの「案件・話数」（③ 売上）
 *
 * **`RevenueDialog` から切り出したものです。**
 * 分けた理由は1ファイル400行の上限で、中身の作り直しではありません。
 *
 * ⚠️ **税区分はここには無い。** 金額（明細の合計）より上にあると、まだ決めていない
 * 金額の税の扱いを先に訊くことになるので、`RevenueDialog` 側の明細・合計の直後へ移した
 * （GPM の売上明細ダイアログと同じ並び。`docs/design/v4/_form-order.md` 段5
 * 「単価 → 数量 → 税 → 合計」）。ここに残るのは**案件 → 話数**だけで、
 * 話数は案件を選ぶまで出ない子の欄なので親のすぐ下に置いている（同 2-1）。
 */
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { EpisodeOption, ProjectOption } from './types';

export function RevenueProjectFields({
  projectSearch, setProjectSearch, projects, selectedProjectId, setSelectedProjectId,
  setSelectedProjectObj, selectedProject, isProjectCategoryB,
  episodes, selectedEpisodeId, setSelectedEpisodeId,
}: {
  projectSearch: string;
  setProjectSearch: (v: string) => void;
  projects: ProjectOption[];
  selectedProjectId: string;
  setSelectedProjectId: (v: string) => void;
  setSelectedProjectObj: (v: ProjectOption | null) => void;
  selectedProject: ProjectOption | undefined;
  isProjectCategoryB: boolean;
  episodes: EpisodeOption[];
  selectedEpisodeId: string;
  setSelectedEpisodeId: (v: string) => void;
}) {
  return (
    <>
      {/* Project search */}
      <div className="space-y-1">
        <Label>案件</Label>
        <Input
          placeholder="案件名・管理番号で検索â¦"
          value={projectSearch}
          onChange={(e) => setProjectSearch(e.target.value)}
        />
        <p className="text-note text-muted-foreground">失注した案件以外から選べます</p>
        {projects.length > 0 && projectSearch && (
          <div className="max-h-40 overflow-y-auto rounded-note border">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`flex min-h-tap w-full items-center gap-2 px-3 text-left text-sub hover:bg-surface-subtle ${
                  selectedProjectId === p.id ? 'bg-primary-surface' : ''
                }`}
                onClick={() => {
                  setSelectedProjectId(p.id);
                  setSelectedProjectObj(p);
                  setProjectSearch(p.name);
                }}
              >
                <span className="font-number text-note text-primary">
                  {p.gls_number || p.id.slice(0, 8)}
                </span>
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
        )}
        {selectedProject && (
          <p className="text-note text-muted-foreground">
            {selectedProject.gls_number || 'GLS未発番'} / 顧客: {selectedProject.customer_name ?? '-'}
            {isProjectCategoryB && <span className="ml-2 font-bold text-primary">B系（回なし）</span>}
          </p>
        )}
      </div>

      {/* 話数（A系のみ・任意） */}
      {selectedProjectId && !isProjectCategoryB && episodes.length > 0 && (
        <div className="space-y-1">
          <Label>話数（任意）</Label>
          <Select
            value={selectedEpisodeId}
            onValueChange={(v) => setSelectedEpisodeId(v === '__none__' ? '' : v)}
          >
            <SelectTrigger><SelectValue placeholder="話数を選択（任意）" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">なし</SelectItem>
              {episodes.map((ep) => (
                <SelectItem key={ep.id} value={ep.id}>
                  {ep.episode_code} (第{ep.episode_number}話)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </>
  );
}
