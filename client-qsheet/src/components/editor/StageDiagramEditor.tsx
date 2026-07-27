import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, User } from "lucide-react";

interface StageElement {
  id: string;
  type: "person" | "object";
  label: string;
  x: number;
  y: number;
  color: string;
}

interface Props {
  elements: StageElement[];
  onChange: (elements: StageElement[]) => void;
  width?: number;
  height?: number;
}

const PERSON_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#6366f1", "#84cc16",
];

export default function StageDiagramEditor({
  elements,
  onChange,
  width = 300,
  height = 200,
}: Props) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  const addElement = (type: "person" | "object") => {
    const id = crypto.randomUUID();
    const color = PERSON_COLORS[elements.length % PERSON_COLORS.length];
    onChange([
      ...elements,
      {
        id,
        type,
        label: type === "person" ? `P${elements.length + 1}` : `OBJ`,
        x: width / 2,
        y: height / 2,
        color,
      },
    ]);
  };

  const removeElement = (id: string) => {
    onChange(elements.filter((e) => e.id !== id));
  };

  const updateLabel = (id: string, label: string) => {
    onChange(elements.map((e) => (e.id === id ? { ...e, label } : e)));
  };

  const getSvgPoint = useCallback(
    (clientX: number, clientY: number) => {
      if (!svgRef.current) return { x: 0, y: 0 };
      const rect = svgRef.current.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / rect.width) * width,
        y: ((clientY - rect.top) / rect.height) * height,
      };
    },
    [width, height]
  );

  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const el = elements.find((e) => e.id === id);
    if (!el) return;
    const pt = getSvgPoint(e.clientX, e.clientY);
    setDragging(id);
    setOffset({ x: pt.x - el.x, y: pt.y - el.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const pt = getSvgPoint(e.clientX, e.clientY);
    const x = Math.max(10, Math.min(width - 10, pt.x - offset.x));
    const y = Math.max(10, Math.min(height - 10, pt.y - offset.y));
    onChange(elements.map((el) => (el.id === dragging ? { ...el, x, y } : el)));
  };

  const handleMouseUp = () => {
    setDragging(null);
  };

  return (
    <div className="space-y-2">
      {/* Stage SVG */}
      <div className="border rounded bg-muted relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full"
          style={{ aspectRatio: `${width}/${height}` }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Stage outline */}
          <rect
            x={5}
            y={5}
            width={width - 10}
            height={height - 10}
            fill="none"
            stroke="#cbd5e1"
            strokeWidth={1}
            strokeDasharray="4 2"
            rx={4}
          />
          <text x={width / 2} y={18} textAnchor="middle" fontSize={10} fill="#94a3b8">
            STAGE
          </text>

          {/* Elements */}
          {elements.map((el) => (
            <g
              key={el.id}
              onMouseDown={(e) => handleMouseDown(e, el.id)}
              className="cursor-grab active:cursor-grabbing"
            >
              {el.type === "person" ? (
                <>
                  <circle cx={el.x} cy={el.y} r={14} fill={el.color} opacity={0.2} />
                  <circle cx={el.x} cy={el.y} r={12} fill={el.color} />
                  <text
                    x={el.x}
                    y={el.y + 4}
                    textAnchor="middle"
                    fontSize={8}
                    fill="white"
                    fontWeight="bold"
                  >
                    {el.label.slice(0, 3)}
                  </text>
                </>
              ) : (
                <>
                  <rect
                    x={el.x - 15}
                    y={el.y - 10}
                    width={30}
                    height={20}
                    fill={el.color}
                    rx={3}
                    opacity={0.8}
                  />
                  <text
                    x={el.x}
                    y={el.y + 4}
                    textAnchor="middle"
                    fontSize={7}
                    fill="white"
                    fontWeight="bold"
                  >
                    {el.label.slice(0, 4)}
                  </text>
                </>
              )}
            </g>
          ))}
        </svg>
      </div>

      {/* Controls */}
      <div className="flex gap-1">
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => addElement("person")}>
          <User className="h-3 w-3" />
          出演者
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => addElement("object")}>
          <Plus className="h-3 w-3" />
          オブジェクト
        </Button>
      </div>

      {/* Element list */}
      {elements.length > 0 && (
        <div className="space-y-1">
          {elements.map((el) => (
            <div key={el.id} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: el.color }} />
              <Input
                className="h-6 text-xs flex-1"
                value={el.label}
                onChange={(e) => updateLabel(el.id, e.target.value)}
              />
              <button
                className="text-muted-foreground hover:text-destructive p-0.5"
                onClick={() => removeElement(el.id)}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
