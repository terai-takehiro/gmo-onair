// 運営マニュアル — 表紙（段D）。production-manual.md §6⑤「表紙のサムネは本物の1ページ目を
// 縮めて描く」の話とは別に、書き出し（PDF）側の表紙は**人が編集するブロックではなく**
// 冊子のメタ情報（題・資料番号・案件名/GLS番号または番組名・対象日）から自動生成する
// （設計判断3「表紙・目次・柱」）。
//
// 取扱注意（§7-2）は柱（ManualPrintHeader）にも出るが、表紙は初めて手に取ったときに
// 必ず目に入る面なので、ここにも大きく独立して出す（§7-2「表紙と柱に…自動で出る」＝
// 2箇所それぞれで消せない表示にする、という指示のとおり）。
//
// ⚠️ 印刷専用ウィンドウに描かれるため Tailwind クラスは使わず素の style で組む
// （ManualPrintHeader.tsx と同じ理由）。
import type { CSSProperties } from "react";
import type { ManualDetail } from "@gmo-onair/shared/src/opsmanual/types";
import { formatDate } from "@gmo-onair/shared/src/client/format";

export interface ManualPrintCoverProps {
  manual: ManualDetail;
  hasSecrets: boolean;
}

const TABULAR: CSSProperties = { fontFeatureSettings: "'palt' 0, 'tnum' 1" };

export default function ManualPrintCover({ manual, hasSecrets }: ManualPrintCoverProps) {
  // 案件（GLS番号があれば併記）が優先。案件が無い（program_id で作った冊子の）ときは番組名
  const subLine = manual.project_name
    ? `${manual.gls_number ? `${manual.gls_number} ・ ` : ""}${manual.project_name}`
    : manual.program_name || null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "10mm",
        padding: "30mm",
        textAlign: "center",
      }}
    >
      {manual.doc_no && <div style={{ ...TABULAR, fontSize: "10pt", letterSpacing: "0.1em", color: "#4b5563" }}>{manual.doc_no}</div>}

      {/* 大見出し（表紙）は25〜34pt（§8-3）。冊子の題そのまま・人の手で打ち直さない。
          ここは印刷される紙の見出し（この冊子の題そのもの）であって、アプリの「画面の名前」
          ではないため `<PageHeader>` の対象外 — 印刷ウィンドウには PageHeader が乗る
          共通シェルそのものが存在しない（別ウィンドウ・別 document） */}
      <h1 style={{ margin: 0, fontSize: "30pt", fontWeight: 800, lineHeight: 1.3, wordBreak: "break-word" }}>{manual.title}</h1>{/* ui-tokens-ok: 印刷専用ドキュメントの表紙見出し。PageHeader の対象は共通シェル配下の画面だけ */}

      {subLine && <div style={{ fontSize: "13pt", color: "#1f2937" }}>{subLine}</div>}
      {manual.service_date && <div style={{ ...TABULAR, fontSize: "11pt", color: "#4b5563" }}>{formatDate(manual.service_date)}</div>}

      {hasSecrets && (
        <div
          style={{
            marginTop: "6mm",
            border: "0.3mm solid #b91c1c", // 塗りつぶさず枠線で組む（§6-6）
            color: "#b91c1c",
            fontWeight: 700,
            fontSize: "11pt",
            padding: "3mm 8mm",
            borderRadius: "1.5mm",
          }}
        >
          取扱注意 ── 配信の鍵あり
        </div>
      )}
    </div>
  );
}
