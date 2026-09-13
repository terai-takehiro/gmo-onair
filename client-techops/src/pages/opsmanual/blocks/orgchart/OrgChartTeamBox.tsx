// 体制図の「チーム」1枚（production-manual-orgchart.md §3-1・§4・§5-2）。
// 見出し（チーム名・所属）と人の並びを描き、選択中だけ入力欄と ＋/− を出す。
//
// ⚠️ **人が1人もいないチームも描ける。** 現場のマニュアルは「音声 ── 調整中」を
// 紙に出したい（プロジェクト管理は人単位の行しか持たないので表せない・§3-1）。
// 空のチームは出す前の検査の対象にもしない（意図して置けるもの・§7）。
//
// ⚠️ **枠線はどのチームも同じ細い実線で、塗らない**（§4・§10-2）。立場
// （自社／発注者／PM会社／業者）の区分は持たないので、線の色・太さで描き分けない。
// どこの会社かは見出しの所属の文字で読む。
//
// ⚠️ **チームの枠は `border-foreground`（#1a1d24）。`border-border`（#e6e9ed）にしない。**
// 体制図は塗らずに枠線と縦罫だけで構造を示す道具なので、白地に刷ってこの線が消えると
// 紙の上に何も残らない（production-manual.md §6-6「罫は 0.25mm 以上」「白黒で読めること」。
// 同じ理由で `ManualPrintHeader.tsx` の罫も `0.25mm solid #1f2937`）。モックも全チーム
// `1px solid #1a1d24`（`docs/design/v4/mockups/native/production-manual/OrgChart.dc.html`）。
// **見出しの下の区切りは別** — あちらはモックが `#e6e9ed` なので `border-border` のまま。
import { useRef, useState } from "react";
import { Minus, Plus, User } from "lucide-react";
import BufferedInput from "@/components/editor/BufferedInput";
import { cn } from "@/lib/utils";
import { genId } from "@/lib/stableIds";
import { manualImageUploadError, uploadManualImage } from "@/lib/manualImageUpload";
import { notifyError } from "@/lib/notify";
import type { ManualOrgBox, ManualOrgPerson } from "@gmo-onair/shared/src/opsmanual/types";
import { ORG_INPUT, ORG_MINUS, ORG_PLUS, type OrgChartShow } from "./orgChartUi";

/** 親の候補（自分より手前の階層の箱）1件。`OrgChartBlockContent.tsx` が組み立てる */
export interface ParentOption {
  id: string;
  label: string;
}

interface Props {
  box: ManualOrgBox;
  show: OrgChartShow;
  selected: boolean;
  /** 変えたチームを丸ごと返す（親が階層の中で差し替える。破壊的に書き換えない＝undo が壊れる） */
  onChange: (next: ManualOrgBox) => void;
  onRemove: () => void;
  /** 親として選べる箱（自分より手前の階層のものだけ。無ければ「親」欄自体を出さない） */
  parentOptions?: ParentOption[];
  parentId?: string | null;
  /** 「親」欄で選び直したとき（`null` = 親を外して独立させる） */
  onChangeParent?: (parentId: string | null) => void;
}

export default function OrgChartTeamBox({ box, show, selected, onChange, onRemove, parentOptions, parentId, onChangeParent }: Props) {
  const people = box.people ?? [];
  const patchPerson = (id: string, patch: Partial<ManualOrgPerson>) =>
    onChange({ ...box, people: people.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

  return (
    <div className="min-w-0 w-full rounded-badge-xs border border-foreground bg-card">
      <div className="flex items-center gap-1 border-b border-border px-1.5 py-0.5">
        {selected ? (
          <BufferedInput
            value={box.label}
            onCommit={(v) => onChange({ ...box, label: v })}
            placeholder="チーム名"
            className={cn(ORG_INPUT, "flex-1 text-[10px] font-extrabold")}
          />
        ) : (
          <span className="min-w-0 flex-1 truncate text-[10px] font-extrabold">{box.label}</span>
        )}
        {/* 所属はチームの見出しだけに小さく出す（自由入力・任意） */}
        {selected ? (
          <BufferedInput
            value={box.org ?? ""}
            onCommit={(v) => onChange({ ...box, org: v })}
            placeholder="所属"
            className={cn(ORG_INPUT, "w-16 text-[8.5px] text-muted-foreground")}
          />
        ) : (
          box.org && <span className="min-w-0 max-w-[45%] shrink-0 truncate text-[8.5px] text-muted-foreground">{box.org}</span>
        )}
        {selected && (
          <button type="button" onClick={onRemove} title="このチームを削除" className={ORG_MINUS}>
            <Minus className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* 分岐（木構造）。手前の階層の箱を選ぶとその下へ線でぶら下がる（2026-09-13 の利用者判断）。
          選べる相手が無い（先頭の階層・まだ他の階層に箱が無い）ときは欄ごと出さない */}
      {selected && onChangeParent && parentOptions && parentOptions.length > 0 && (
        <div className="flex items-center gap-1 border-b border-border px-1.5 py-0.5">
          <span className="shrink-0 text-[8.5px] text-muted-foreground">親</span>
          <select
            value={parentId ?? ""}
            onChange={(e) => onChangeParent(e.target.value || null)}
            className="min-w-0 flex-1 rounded border border-input bg-background px-1 py-0.5 text-[9px] text-foreground"
          >
            <option value="">なし（独立）</option>
            {parentOptions.map((p) => (
              <option key={p.id} value={p.id}>{p.label || "（無題）"}</option>
            ))}
          </select>
        </div>
      )}

      <div className="px-1.5 pb-1 pt-0.5">
        {people.map((p) => (
          <PersonRow
            key={p.id}
            person={p}
            show={show}
            selected={selected}
            onPatch={(patch) => patchPerson(p.id, patch)}
            onRemove={() => onChange({ ...box, people: people.filter((x) => x.id !== p.id) })}
          />
        ))}
        {people.length === 0 && (
          <div className="rounded-badge-xs border border-dashed border-border px-1.5 py-0.5 text-[9px] text-muted-foreground">
            まだ決まっていません
          </div>
        )}
        {selected && (
          <button
            type="button"
            onClick={() => onChange({ ...box, people: [...people, { id: genId("psn"), name: "" }] })}
            className={cn(ORG_PLUS, "mt-0.5")}
          >
            <Plus className="h-3 w-3" aria-hidden="true" />人
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 人1行。出す項目（役割・所属・電話・メール）は `show` で決まり、**出さない項目は
 * 入力欄も出さない** — 紙に出ていないものを打てると、打ったのに出ないことになる。
 *
 * バッジ（決裁・進行）は読むだけにする。§5-2 がその場で打つと決めたのは
 * 階層の名前・チーム名・所属・氏名・役割の5つで、バッジは取り込みで入ってくる印。
 */
function PersonRow({
  person, show, selected, onPatch, onRemove,
}: {
  person: ManualOrgPerson;
  show: OrgChartShow;
  selected: boolean;
  onPatch: (patch: Partial<ManualOrgPerson>) => void;
  onRemove: () => void;
}) {
  const badge = person.badge && (
    <span className="shrink-0 rounded-badge-xs border border-warning px-1 text-[8px] font-extrabold text-warning">
      {person.badge}
    </span>
  );

  if (!selected) {
    const sub = [show.role ? person.role : "", show.org ? person.org : ""].filter(Boolean).join(" ・ ");
    return (
      <div className="flex flex-wrap items-baseline gap-x-1 py-px">
        {show.photo && <PersonPhoto url={person.photoUrl} />}
        <span className="min-w-0 max-w-full truncate text-[10px] font-bold">{person.name}</span>
        {badge}
        {sub && <span className="min-w-0 flex-1 truncate text-[9px] text-muted-foreground">{sub}</span>}
        {show.phone && person.phone && <span className="shrink-0 text-[9px]">{person.phone}</span>}
        {show.email && person.email && <span className="min-w-0 truncate text-[9px] text-muted-foreground">{person.email}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-baseline gap-x-1 py-px">
      {show.photo && <PersonPhotoButton url={person.photoUrl} onChange={(url) => onPatch({ photoUrl: url })} />}
      <BufferedInput
        value={person.name}
        onCommit={(v) => onPatch({ name: v })}
        placeholder="氏名"
        className={cn(ORG_INPUT, "flex-1 text-[10px] font-bold")}
      />
      {badge}
      {show.role && <PersonField value={person.role} placeholder="役割" onCommit={(v) => onPatch({ role: v })} />}
      {show.org && <PersonField value={person.org} placeholder="所属" onCommit={(v) => onPatch({ org: v })} />}
      {show.phone && <PersonField value={person.phone} placeholder="電話" onCommit={(v) => onPatch({ phone: v })} />}
      {show.email && <PersonField value={person.email} placeholder="メール" onCommit={(v) => onPatch({ email: v })} />}
      <button type="button" onClick={onRemove} title="この人を削除" className={ORG_MINUS}>
        <Minus className="h-3 w-3" aria-hidden="true" />
      </button>
    </div>
  );
}

/** 顔写真の丸い小さな表示（紙・閲覧側）。写真が無ければ何も描かない */
function PersonPhoto({ url }: { url?: string }) {
  if (!url) return null;
  return <img src={url} alt="" className="h-4 w-4 shrink-0 rounded-full border border-foreground object-cover" />;
}

/**
 * 顔写真の表示＋差し替え（編集側）。`ImageBlockContent.tsx` の「差し替え」と同じ
 * アップロード処理（`manualImageUpload.ts`）を使う。写真が無いときはアイコンだけの
 * 丸いボタンにする（押せる場所だと分かるように）。
 */
function PersonPhotoButton({ url, onChange }: { url?: string; onChange: (url: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const upload = async (file: File) => {
    const error = manualImageUploadError(file);
    if (error) { notifyError(error); return; }
    setUploading(true);
    try {
      onChange(await uploadManualImage(file));
    } catch {
      notifyError("写真を取り込めませんでした。", { description: "少し待ってから、もう一度選び直してください。" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        title="顔写真を選ぶ"
        className="flex h-4 w-4 shrink-0 items-center justify-center overflow-hidden rounded-full border border-foreground bg-card text-muted-foreground hover:bg-accent"
      >
        {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <User className="h-2.5 w-2.5" aria-hidden="true" />}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = "";
        }}
      />
    </>
  );
}

function PersonField({
  value, placeholder, onCommit,
}: {
  value?: string;
  placeholder: string;
  onCommit: (v: string) => void;
}) {
  return (
    <BufferedInput
      value={value ?? ""}
      onCommit={onCommit}
      placeholder={placeholder}
      className={cn(ORG_INPUT, "flex-1 text-[9px] text-muted-foreground")}
    />
  );
}
