// project.heading（見出し）・project.team（体制・連絡先）の中身描画（段C）。
// `data` の形は resolver 側でまだ確定していないため、キーの候補違い（camelCase/snake_case）
// も含めて防御的に読む（`pick`）。「回」「会場」に相当する列がスキーマに無い前提のとおり、
// 無い項目は出さない（空欄のラベルを出さない）。
import { asRecord, asRecordArray, pick, LinkedEmpty } from "./sharedLinkedContent";

interface Props {
  blockKey: "project.heading" | "project.team";
  data: unknown;
  options: Record<string, unknown>;
}

export default function ProjectLinkedContent({ blockKey, data, options }: Props) {
  if (blockKey === "project.heading") return <Heading data={data} />;
  return <Team data={data} options={options} />;
}

function Heading({ data }: { data: unknown }) {
  const obj = asRecord(data);
  const name = pick(obj, "name", "projectName", "project_name");
  const glsNumber = pick(obj, "glsNumber", "gls_number", "管理番号");
  const date = pick(obj, "serviceDate", "service_date", "eventStart", "event_start", "serviceDateHint");
  const venue = pick(obj, "venue", "location", "会場");
  const lines = [name, glsNumber, date, venue].filter(Boolean);

  if (lines.length === 0) return <LinkedEmpty text="見出しの情報がありません" />;

  return (
    <div className="flex h-full w-full flex-col justify-center gap-0.5 overflow-hidden p-1">
      {name && <span className="truncate text-h2 font-medium text-foreground">{name}</span>}
      <span className="font-number flex flex-wrap gap-x-3 text-sub text-muted-foreground">
        {glsNumber && <span>{glsNumber}</span>}
        {date && <span>{date}</span>}
        {venue && <span>{venue}</span>}
      </span>
    </div>
  );
}

function Team({ data, options }: { data: unknown; options: Record<string, unknown> }) {
  const obj = asRecord(data);
  const members = asRecordArray(obj.members ?? obj.rows ?? (Array.isArray(data) ? data : []));
  if (members.length === 0) return <LinkedEmpty text="体制・連絡先の情報がありません" />;

  // 「電話番号も出す」（既定 true）。データ側に電話が無い行は元々出ない
  const showPhone = options.showPhone !== false;

  return (
    <div className="font-number h-full w-full overflow-auto p-1">
      <table className="w-full border-collapse text-[10px] leading-tight">
        <tbody>
          {members.map((m, i) => {
            const role = pick(m, "role", "役割");
            const name = pick(m, "memberName", "member_name", "name", "氏名");
            const phone = showPhone ? pick(m, "phone", "電話") : "";
            return (
              <tr key={i} className="border-b border-border/60">
                <td className="whitespace-nowrap px-1 py-0.5 text-muted-foreground">{role}</td>
                <td className="px-1 py-0.5 text-foreground">{name}</td>
                {phone && <td className="whitespace-nowrap px-1 py-0.5 text-foreground">{phone}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
