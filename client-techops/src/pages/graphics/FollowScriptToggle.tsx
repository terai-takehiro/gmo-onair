// テロップCG — 「台本に追従」の切替（段E・①テロップ一覧のヘッダー付近）。
// docs/design/v4/graphics-redesign.md §9 3番（本番で追従）・§12-2（既定 OFF・番組ごとに
// ON にできる。切替は①テロップ一覧のヘッダー付近）。
//
// ON にすると、進行（OnAir）画面で現在の行が進むごとに②本番モードの NEXT がその行に
// 対応するテロップへ自動で移る（`useScriptFollow.ts`・並行作業）。**TAKE は人が押す**——
// このトグル自体はどのテロップも送出しない。台本から取り込んだページが1件も無い番組には
// 出す意味が無い（追従する対象の台本が無いため）ので、呼び出し側が `visible` で隠す
// （`GraphicsHubPage.tsx` が `pages.some((p) => p.qsheetDocId)` を渡す）。
import { useState } from 'react';
import { Switch } from '@gmo-onair/shared/src/client/ui/switch';
import { notifyError } from '@/lib/notify';
import { updateGraphicsProject } from '@/lib/graphicsApi';

export default function FollowScriptToggle({ projectId, enabled, visible, onSaved }: {
  projectId: string;
  enabled: boolean;
  visible: boolean;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);

  if (!visible) return null;

  const toggle = async () => {
    setSaving(true);
    try {
      await updateGraphicsProject(projectId, { followScript: !enabled });
      onSaved();
    } catch {
      notifyError('「台本に追従」を切り替えられませんでした');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-tap items-center gap-2 rounded-control-md border border-border bg-card px-2.5">
      <Switch checked={enabled} onCheckedChange={() => void toggle()} disabled={saving} aria-label="台本に追従" />
      <span className="whitespace-nowrap text-sub font-bold">台本に追従</span>
    </div>
  );
}
