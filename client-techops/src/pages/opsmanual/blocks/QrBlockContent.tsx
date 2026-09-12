// 自由ブロック「QR」の中身（段B）。`qrcode` で `content.value` を画像化して表示する
// （`AudioShareDialog.tsx` の `QRCode.toDataURL` と同じ使い方）。選択中は下に
// 宛先の文字列・ラベルの簡易フォームを出す。
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import BufferedInput from "@/components/editor/BufferedInput";
import type { ManualQrContent } from "@gmo-onair/shared/src/opsmanual/types";

interface Props {
  content: ManualQrContent;
  selected: boolean;
  onCommit: (content: ManualQrContent) => void;
}

const FIELD_CLASS = "w-full rounded border border-input bg-background px-1 py-0.5 text-[10px] outline-none focus-visible:ring-1 focus-visible:ring-ring";

export default function QrBlockContent({ content, selected, onCommit }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(content.value || " ", { width: 256, margin: 1 })
      .then((url) => { if (!cancelled) setDataUrl(url); })
      .catch(() => { if (!cancelled) setDataUrl(null); });
    return () => { cancelled = true; };
  }, [content.value]);

  return (
    <div className="flex h-full w-full flex-col items-center gap-1 overflow-hidden p-1">
      {dataUrl ? (
        <img src={dataUrl} alt={content.label || "QRコード"} className="h-full min-h-0 flex-1 object-contain" />
      ) : (
        <div className="flex flex-1 items-center justify-center text-[10px] text-muted-foreground">QR</div>
      )}
      {content.label && !selected && <span className="w-full shrink-0 truncate text-center text-[9px] text-muted-foreground">{content.label}</span>}
      {selected && (
        <div className="w-full shrink-0 space-y-1" onPointerDown={(e) => e.stopPropagation()}>
          <BufferedInput value={content.value} onCommit={(v) => onCommit({ ...content, value: v })} placeholder="宛先（URLなど）" className={FIELD_CLASS} />
          <BufferedInput value={content.label ?? ""} onCommit={(v) => onCommit({ ...content, label: v })} placeholder="ラベル（任意）" className={FIELD_CLASS} />
        </div>
      )}
    </div>
  );
}
