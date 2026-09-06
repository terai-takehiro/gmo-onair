// 列が 0 本のスケジュール表に出す 3 択。14-schedule-v2-plan.md §3 A2・§4-2 (c)
//
// 新規作成直後は列が 0 本で、列が無いと項目を置けない。以前はここで手詰まりだった
//（列を作る UI が無く、「項目を追加」も押せない）。最初の一手を 3 つ並べる。
// カレンダーの `NewEventChooser` と同じ「3 択カード」の形。
import { LayoutTemplate, DoorOpen, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  onTemplate: () => void;
  onVenue: () => void;
  onAi: () => void;
  /** 拠点が未設定なら、ひな形の案内に 1 行足す */
  locationSet: boolean;
}

function Choice({ icon, title, description, onClick }: { icon: ReactNode; title: string; description: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[44px] flex-col items-start gap-2 rounded-lg border border-border bg-card p-4 text-left hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="text-primary [&>svg]:h-6 [&>svg]:w-6" aria-hidden="true">{icon}</span>
      <span className="text-base font-bold text-foreground">{title}</span>
      <span className="text-sm text-muted-foreground">{description}</span>
    </button>
  );
}

export default function ScheduleEmptyState({ onTemplate, onVenue, onAi, locationSet }: Props) {
  return (
    <section className="rounded-lg border border-dashed border-border bg-muted/30 p-4 sm:p-6" role="status" aria-label="まだ列がありません">
      <p className="text-sm font-bold text-foreground">まだ列がありません。最初の列を決めると項目を置けます。</p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Choice
          icon={<LayoutTemplate />}
          title="ひな形から"
          description={
            <>
              拠点の標準の列と項目を流し込みます。
              {!locationSet && <><br />拠点を決めると拠点別のひな形だけが出ます。</>}
            </>
          }
          onClick={onTemplate}
        />
        <Choice
          icon={<DoorOpen />}
          title="会場を選んで列を作る"
          description="スタジオの部屋から選びます。1 部屋が 1 列になります。"
          onClick={onVenue}
        />
        <Choice
          icon={<Sparkles />}
          title="AI で下書き"
          description="イベントの内容を文章で伝えて、列と枠の下書きを受け取ります。"
          onClick={onAi}
        />
      </div>
    </section>
  );
}
