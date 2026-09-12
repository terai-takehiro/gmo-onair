// kind:'linked' ブロックの中身描画（段C）。`ManualBlockContent.tsx`（自由ブロック用・
// Integrate 担当が触る）の隣に置く別物。差し込み元のミニアプリごとに `linked/*.tsx` へ
// 振り分けるだけで、紙面の操作（つかむ・伸縮・回転・すいつき…）は一切知らない
// （段Bのスコープ分担と同じ考え方）。
//
// `resolved` は `GET /techops/manuals/:id/resolve` の1ブロックぶんの結果
// （`manualResolveApi.ts`）。まだ届いていなければ「読み込み中…」、`error` が付いていれば
// 「元の資料が見つかりません」を出す（§5-4「resolve が差し込みの心臓部」）。
import type { ManualLinkedBlock } from "@gmo-onair/shared/src/opsmanual/types";
import { manualLinkedBlockDef } from "@gmo-onair/shared/src/production/manualBlocks";
import type { ManualResolveEntry } from "@/lib/manualResolveApi";
import ProjectLinkedContent from "./linked/ProjectLinkedContent";
import ScheduleLinkedContent from "./linked/ScheduleLinkedContent";
import SheetLinkedContent from "./linked/SheetLinkedContent";
import DeviceLinkedContent from "./linked/DeviceLinkedContent";
import { LinkedEmpty } from "./linked/sharedLinkedContent";

interface Props {
  block: ManualLinkedBlock;
  resolved: ManualResolveEntry | undefined;
}

export default function LinkedBlockContent({ block, resolved }: Props) {
  const def = manualLinkedBlockDef(block.link.block);
  if (!def) return <LinkedEmpty text="このブロックには対応していません" />;
  if (!resolved) return <LinkedEmpty text="読み込み中…" />;
  if (resolved.error) return <LinkedEmpty text="元の資料が見つかりません" />;

  const key = block.link.block;
  const options = block.link.options;

  switch (key) {
    case "project.heading":
    case "project.team":
      return <ProjectLinkedContent blockKey={key} data={resolved.data} options={options} />;
    case "schedule.day":
    case "schedule.loadInOut":
      return <ScheduleLinkedContent blockKey={key} data={resolved.data} options={options} />;
    case "sheet.rundown":
    case "sheet.excerpt":
    case "sheet.micAssignment":
      return <SheetLinkedContent blockKey={key} data={resolved.data} options={options} />;
    case "recording.list":
    case "streaming.list":
    case "streaming.webMeeting":
    case "rental.list":
    case "equipment.lending":
      return <DeviceLinkedContent blockKey={key} data={resolved.data} />;
    default:
      return <LinkedEmpty text="このブロックには対応していません" />;
  }
}
