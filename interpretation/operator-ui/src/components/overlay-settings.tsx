"use client";

import { useMemo, useState } from "react";

type Position = "top" | "middle" | "bottom";

type Settings = {
  pos: Position;
  size: number;
  color: string;
  outline: string;
  fade: number;
  mode: "text" | "audio" | "both";
};

const DEFAULT: Settings = {
  pos: "bottom",
  size: 100,
  color: "ffffff",
  outline: "000000",
  fade: 4500,
  mode: "both",
};

function buildQuery(s: Settings): string {
  const params = new URLSearchParams();
  if (s.pos !== DEFAULT.pos) params.set("pos", s.pos);
  if (s.size !== DEFAULT.size) params.set("size", String(s.size));
  if (s.color !== DEFAULT.color) params.set("color", s.color);
  if (s.outline !== DEFAULT.outline) params.set("outline", s.outline);
  if (s.fade !== DEFAULT.fade) params.set("fade", String(s.fade));
  if (s.mode !== DEFAULT.mode) params.set("mode", s.mode);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export function OverlaySettings({
  outputUrls,
}: {
  outputUrls: Record<string, string>;
}) {
  const [s, setS] = useState<Settings>(DEFAULT);
  const langs = Object.keys(outputUrls);
  const customized = useMemo(() => {
    const qs = buildQuery(s);
    return Object.fromEntries(langs.map((l) => [l, outputUrls[l] + qs]));
  }, [s, outputUrls, langs]);

  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <h3 className="font-serif text-lg font-semibold">vMix オーバーレイ設定</h3>
      <p className="mt-1 text-xs text-stone-500">
        位置 / サイズ / 文字色 / 縁取り色 / 表示時間 / モードを変更すると URL に
        反映されます。
      </p>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-stone-500">位置</span>
          <select
            value={s.pos}
            onChange={(e) => setS({ ...s, pos: e.target.value as Position })}
            className="rounded border px-2 py-1"
          >
            <option value="bottom">下部</option>
            <option value="middle">中央</option>
            <option value="top">上部</option>
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-stone-500">サイズ {s.size}%</span>
          <input
            type="range"
            min={50}
            max={200}
            step={5}
            value={s.size}
            onChange={(e) => setS({ ...s, size: parseInt(e.target.value, 10) })}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-stone-500">表示時間 {s.fade}ms</span>
          <input
            type="range"
            min={1500}
            max={10000}
            step={500}
            value={s.fade}
            onChange={(e) => setS({ ...s, fade: parseInt(e.target.value, 10) })}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-stone-500">文字色</span>
          <input
            type="color"
            value={`#${s.color}`}
            onChange={(e) =>
              setS({ ...s, color: e.target.value.replace("#", "") })
            }
            className="h-8"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-stone-500">縁取り</span>
          <input
            type="color"
            value={`#${s.outline}`}
            onChange={(e) =>
              setS({ ...s, outline: e.target.value.replace("#", "") })
            }
            className="h-8"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-stone-500">モード</span>
          <select
            value={s.mode}
            onChange={(e) =>
              setS({ ...s, mode: e.target.value as Settings["mode"] })
            }
            className="rounded border px-2 py-1"
          >
            <option value="both">字幕＋音声</option>
            <option value="text">字幕のみ</option>
            <option value="audio">音声のみ</option>
          </select>
        </label>
      </div>

      <ul className="mt-5 space-y-2 text-sm">
        {langs.map((lang) => (
          <li key={lang} className="flex items-center gap-2">
            <span className="rounded bg-stone-100 px-2 py-0.5 text-xs">
              {lang}
            </span>
            <code className="flex-1 truncate font-mono text-xs text-stone-700">
              {customized[lang]}
            </code>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(customized[lang])}
              className="rounded border px-2 py-1 text-xs"
            >
              コピー
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
