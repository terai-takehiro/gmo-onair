/**
 * SiteMapPage — 全体マップ `/map` (v3.0.9)
 *
 * ── なぜ作ったか ───────────────────────────────────────────
 *
 * 行き先は 70 以上あるのに、**その全体を1度も見られない**状態だった。
 * レールに出ているのは 7 つで、残りは ⌘K の中にしか無い。⌘K は
 * 「何を打てばいいか分かっている人」の道具なので、**知らないものは探せない**。
 * 「サイトツリーが極めてわかりにくい」という指摘の実体はこれだった。
 *
 * だからこの画面は **読んで辿る**ためのものにする:
 *   - 区分は**仕事の順番** (今日 → 仕事をとる → 段取りする → 本番をまわす →
 *     お金にする → ふりかえる → 日々の事務 → 決めごと)。
 *     「どのアプリだったか」ではなく「いま仕事のどこにいるか」で探せる
 *   - **1行ずつ「ここで何ができるか」を書く**。名前だけ 70 個は読めない
 *   - **権限で見えないものは出さない** (押して 403 にしない = §2.4)。
 *     ただし件数は出さないので「隠されている」ことは分からない — これは意図どおり
 *
 * ── 表は増やしていない ─────────────────────────────────────
 *
 * 中身は ⌘K と**同じ1つの表** (`shared/src/client/commandPalette/commands.ts`)。
 * 別に持つと必ず片方が古くなり、「マップには有るのに ⌘K で出ない」が起きる。
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, Map as MapIcon, PanelLeft, Search } from "lucide-react";
import { PageTitle } from "@gmo-onair/shared/src/client/ui";
import { NoSearchResults } from "@gmo-onair/shared/src/client/states";
import { SITE_SECTIONS } from "@gmo-onair/shared/src/client/commandPalette/types";
import type { CommandDef } from "@gmo-onair/shared/src/client/commandPalette/types";
import {
  matchCommand,
  resolveCommands,
} from "@gmo-onair/shared/src/client/commandPalette/commands";
import { useAuth } from "@/contexts/platform/AuthContext";
import { isExternalAppPath, openAppPath } from "@/lib/openAppPath";

export default function SiteMapPage() {
  const navigate = useNavigate();
  const { currentUser, permissions } = useAuth();
  const [q, setQ] = useState("");

  const commands = useMemo(
    () => resolveCommands({ role: currentUser?.role, permissions }),
    [currentUser?.role, permissions]
  );

  const sections = useMemo(() => {
    const hit = commands.filter((c) => matchCommand(c, q.trim()));
    return SITE_SECTIONS.map((s) => ({
      ...s,
      // 「やる」を各区分の先頭に置く (場所より操作が先)
      items: hit
        .filter((c) => c.section === s.id)
        .sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "do" ? -1 : 1)),
    })).filter((s) => s.items.length > 0);
  }, [commands, q]);

  const total = sections.reduce((n, s) => n + s.items.length, 0);

  return (
    <div className="mx-auto max-w-screen-xl space-y-5 px-4 py-5 sm:px-6 sm:py-7">
      <header className="space-y-2">
        <PageTitle>全体マップ</PageTitle>
        <p className="max-w-3xl text-[13px] leading-relaxed text-muted-foreground">
          この製品にある行き先を、<strong className="font-bold text-foreground">仕事の順番</strong>に並べています。
          あなたの権限で開けるものだけが出ています。
          左のレールにある 7 つはよく使うもの、ここに出ている残りは
          <kbd className="mx-1 rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-bold">⌘K</kbd>
          でも名前を打って開けます。
        </p>
      </header>

      {/* さがす — 打った語で全区分を横断して絞る */}
      <div className="flex items-center gap-2 rounded-control border border-border bg-card px-3 py-2 sm:max-w-md">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="やりたいこと・画面の名前でしぼる"
          aria-label="行き先をしぼる"
          className="min-h-tap min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
        />
        {q && (
          <button
            type="button"
            onClick={() => setQ("")}
            className="shrink-0 rounded border border-border px-2 py-1 text-[11px] font-bold text-secondary-foreground hover:bg-secondary"
          >
            解除
          </button>
        )}
      </div>

      {total === 0 ? (
        <NoSearchResults keyword={q} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {sections.map((s, i) => (
            <section
              key={s.id}
              className="rounded-card border border-border bg-card p-4"
              aria-labelledby={`map-sec-${s.id}`}
            >
              <div className="flex items-baseline gap-2">
                <span
                  className="font-number text-[13px] font-bold text-primary"
                  aria-hidden="true"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h2 id={`map-sec-${s.id}`} className="text-[15px] font-bold text-foreground">
                  {s.title}
                </h2>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{s.purpose}</p>

              <ul className="mt-3 space-y-1">
                {s.items.map((c) => (
                  <li key={c.id}>
                    <MapRow cmd={c} onOpen={() => openAppPath(c.path, navigate)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <p className="pt-1 text-[12px] text-muted-foreground">
        ここに出ていない行き先はありません。増えたときはこのページにも自動で出ます
        （⌘K と同じ1つの表から作っています）。
      </p>
    </div>
  );
}

function MapRow({ cmd, onOpen }: { cmd: CommandDef; onOpen: () => void }) {
  const Icon = cmd.icon;
  const external = isExternalAppPath(cmd.path);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="min-h-tap flex w-full items-start gap-2.5 rounded-control px-2 py-2 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {Icon && (
        <Icon
          className={
            cmd.kind === "do"
              ? "mt-0.5 h-4 w-4 shrink-0 text-primary"
              : "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
          }
          aria-hidden="true"
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] font-bold text-foreground">{cmd.label}</span>
          {cmd.kind === "do" && (
            <span className="rounded-full bg-accent px-1.5 py-0.5 text-[10px] font-bold text-primary">
              やる
            </span>
          )}
          {cmd.onRail && (
            <span
              className="inline-flex items-center gap-0.5 text-[10px] font-bold text-muted-foreground"
              title="左のレール（スマホは下のタブ）からも開けます"
            >
              <PanelLeft className="h-3 w-3" aria-hidden="true" />
              レール
            </span>
          )}
          {external && (
            <span
              className="inline-flex items-center gap-0.5 text-[10px] font-bold text-muted-foreground"
              title="読み込み直して開きます"
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </span>
          )}
        </span>
        {cmd.hint && (
          <span className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground">
            {cmd.hint}
          </span>
        )}
      </span>
    </button>
  );
}

/** ⌘K と同じアイコンを使うので、この画面用のアイコンはこれだけ */
export const SITE_MAP_ICON = MapIcon;
