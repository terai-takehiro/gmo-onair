/**
 * 立ち位置図セル — テンプレ選択 + SVGプレビュー + メモ
 * Ported from GMO-Qsheet-Editor/client/src/components/StageDiagramCell.jsx
 */

const STAGE_W = 800;
const STAGE_H = 600;

interface StageElement {
  type: string;
  label: string;
  x: number;
  y: number;
  r?: number;
  w?: number;
  h?: number;
}

interface StageTemplate {
  name: string;
  elements: StageElement[];
}

function StageDiagramPreview({
  elements,
  width,
  height,
}: {
  elements: StageElement[];
  width?: number | string;
  height?: number | string;
}) {
  if (!elements?.length) return null;
  return (
    <svg
      viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
      preserveAspectRatio="xMidYMid meet"
      width={width ?? "100%"}
      height={height ?? "auto"}
      className="rounded border border-zinc-200 dark:border-zinc-700 max-w-full"
      style={{ background: "#fafafa", display: "block", maxHeight: 200 }}
    >
      {elements.map((el, i) => {
        if (el.type === "person") {
          const r = el.r || 40;
          return (
            <g key={i}>
              <circle cx={el.x} cy={el.y} r={r} fill="#eff6ff" stroke="#3b82f6" strokeWidth={2} />
              <text x={el.x} y={el.y + r * 0.25} textAnchor="middle" fontSize={r * 0.5} fill="#1e3a5f" fontWeight="bold" fontFamily="sans-serif">
                {el.label}
              </text>
            </g>
          );
        }
        if (el.type === "rect") {
          const w = el.w || 160;
          const h = el.h || 50;
          return (
            <g key={i}>
              <rect x={el.x - w / 2} y={el.y - h / 2} width={w} height={h} fill="#fefce8" stroke="#a3a3a3" strokeWidth={1.5} rx={4} />
              <text x={el.x} y={el.y + 5} textAnchor="middle" fontSize={14} fill="#52525b" fontWeight="500" fontFamily="sans-serif">
                {el.label}
              </text>
            </g>
          );
        }
        return null;
      })}
    </svg>
  );
}

interface StageDiagramCellProps {
  cell: any;
  stageTemplates?: StageTemplate[];
  onChange: (val: any) => void;
}

export default function StageDiagramCell({ cell, stageTemplates, onChange }: StageDiagramCellProps) {
  const templates = stageTemplates || [];
  const selectedIdx = cell?.templateIndex ?? -1;
  const elements = selectedIdx >= 0 && templates[selectedIdx] ? templates[selectedIdx].elements : null;

  return (
    <div className="py-1 px-1 space-y-1">
      <select
        value={selectedIdx}
        onChange={(e) => onChange({ ...cell, templateIndex: parseInt(e.target.value) })}
        className="w-full text-[11px] bg-transparent border border-zinc-200 dark:border-zinc-700 rounded px-1 py-0.5 outline-none focus:border-blue-400 transition-colors"
      >
        <option value={-1}>-- 選択 --</option>
        {templates.map((t, i) => (
          <option key={i} value={i}>{t.name}</option>
        ))}
      </select>
      {elements && <StageDiagramPreview elements={elements} />}
      <textarea
        value={cell?.note || ""}
        onChange={(e) => onChange({ ...cell, note: e.target.value })}
        className="w-full min-h-[20px] text-[11px] bg-transparent border-none outline-none resize-none leading-relaxed"
        placeholder="メモ..."
        rows={1}
      />
    </div>
  );
}

export { StageDiagramPreview };
