// tech.patch（映像パッチ）・tech.staff（技術スタッフ）の中身描画（技術資料 段D）。
// 設計: docs/design/v4/tech-docs.md §8-1（紙は矢印表記・スタッフは役職の見出し＋名前）・
// §8-3 の10番。resolver
// （`server/src/contexts/qsheet/services/manual-resolvers/tech.resolver.ts`）が返す
// `data` は自己完結で、矢印表記まで組み立て済みの文字列が入っている。
//
// `tech.patch` の実際の形（resolver 冒頭コメントより）:
//   { techDocId, docNo, rev, title, status, groups: [{ label, lines: [{ no, text, note }] }],
//     rowCount, extraCount, updatedAt }
// `tech.staff` の実際の形:
//   { techDocId, docNo, rev, title, status,
//     days: [{ date, label, count, roles: [{ role, people: [{ name, company, note }] }] }],
//     count, updatedAt }
//
// options（`link.options`。`LinkedBlockInspector.tsx` が書く）:
// - `tech.patch`: `group`（系統で絞る・空なら全部）・`showNote`（備考も出す）
// - `tech.staff`: `workDate`（作業日で絞る・空なら全部）・`showCompany`（会社も出す）
//   どちらもクライアント側だけで効かせられる範囲に留める（`VenueLinkedContent.tsx` と同じ考え方）。
import { asRecord, asRecordArray, LinkedEmpty } from "./sharedLinkedContent";

interface Props {
  blockKey: "tech.patch" | "tech.staff";
  data: unknown;
  options: Record<string, unknown>;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** 紙の札（資料番号 ＋ 版）。§8-2「札 TD-202610-0001 rev.1」 */
function TagLine({ obj, tail }: { obj: Record<string, unknown>; tail: string }) {
  const docNo = str(obj.docNo);
  const rev = num(obj.rev);
  const head = [docNo || str(obj.title), rev > 0 ? `第${rev}版` : ""].filter(Boolean).join(" ");
  return <div className="font-number shrink-0 truncate text-[8px] font-medium text-foreground">{[head, tail].filter(Boolean).join(" ・ ")}</div>;
}

function TechPatchContent({ data, options }: { data: unknown; options: Record<string, unknown> }) {
  const obj = asRecord(data);
  const filter = str(options.group).trim();
  const showNote = options.showNote === true; // 既定 false
  const groups = asRecordArray(obj.groups)
    .map((g) => ({ label: str(g.label), lines: asRecordArray(g.lines) }))
    .filter((g) => filter === "" || g.label.includes(filter));

  if (groups.length === 0) return <LinkedEmpty text="映像パッチの行がありません" />;

  const lineCount = groups.reduce((n, g) => n + g.lines.length, 0);
  return (
    <div className="flex h-full w-full flex-col gap-0.5 overflow-hidden p-1">
      <TagLine obj={obj} tail={`${lineCount}行`} />
      <div className="min-h-0 flex-1 overflow-auto">
        {groups.map((g, gi) => (
          <div key={`${g.label}-${gi}`} className="mb-1">
            {g.label && <div className="border-b border-foreground text-[9px] font-bold text-foreground">〈{g.label}〉</div>}
            {g.lines.map((ln, i) => (
              <div key={i} className="font-number flex items-baseline gap-1 border-b border-border/60 py-px">
                <span className="w-3 shrink-0 text-right text-[7px] text-muted-foreground">{num(ln.no, i + 1)}</span>
                <span className="min-w-0 flex-1 text-[9px] leading-snug text-foreground">
                  {str(ln.text)}
                  {showNote && str(ln.note) && <span className="ml-1 text-muted-foreground">（{str(ln.note)}）</span>}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function TechStaffContent({ data, options }: { data: unknown; options: Record<string, unknown> }) {
  const obj = asRecord(data);
  const dayFilter = str(options.workDate).trim();
  const showCompany = options.showCompany !== false; // 既定 true
  const days = asRecordArray(obj.days)
    .map((d) => ({
      date: str(d.date),
      label: str(d.label) || str(d.date),
      count: num(d.count),
      roles: asRecordArray(d.roles).map((r) => ({ role: str(r.role), people: asRecordArray(r.people) })),
    }))
    .filter((d) => dayFilter === "" || d.date === dayFilter);

  if (days.length === 0) return <LinkedEmpty text="技術スタッフの行がありません" />;

  const total = days.reduce((n, d) => n + d.count, 0);
  return (
    <div className="flex h-full w-full flex-col gap-0.5 overflow-hidden p-1">
      <TagLine obj={obj} tail={`${total}人`} />
      <div className="min-h-0 flex-1 overflow-auto">
        {days.map((d) => (
          <div key={d.date} className="mb-1">
            <div className="font-number flex items-center justify-between border-b border-foreground text-[9px] font-bold text-foreground">
              <span>{d.label}</span>
              <span className="text-muted-foreground">{d.count}人</span>
            </div>
            {d.roles.map((r, ri) => (
              <div key={`${r.role}-${ri}`}>
                <div className="font-number text-[8px] font-bold text-primary">{r.role}</div>
                {r.people.map((p, pi) => (
                  <div key={pi} className="flex items-baseline gap-1 border-b border-border/60 pl-1.5">
                    <span className="min-w-0 flex-1 truncate text-[9px] font-bold text-foreground">{str(p.name)}</span>
                    {showCompany && str(p.company) && (
                      <span className="shrink-0 truncate text-[7px] text-muted-foreground">{str(p.company)}</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TechLinkedContent({ blockKey, data, options }: Props) {
  if (blockKey === "tech.staff") return <TechStaffContent data={data} options={options} />;
  return <TechPatchContent data={data} options={options} />;
}
