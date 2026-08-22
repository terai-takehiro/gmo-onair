// Excel の**中身**の見本（1シート分）。
//
// ⚠️ **なぜ「見出しの見本」から作り直したか**（監査 2026-08-22）
// 以前ここは**見出し行しか出していなかった**。見出しはデータが1行も無くても同じように
// 出るので、**12台ぶん打ち込んだつもりで実は1行も保存されていない**とき、画面は
// まったく普段どおりに見えたまま「見出しだけの Excel」が落ちてきた（実機で確認）。
// いまは実物と同じ整形（サーバーの `buildSheetSpecs`）を通した**先頭数行**を出し、
// **0行のときは「このシートは空です」と言い切る**。
import type { PreviewSheet } from '@/lib/deviceSettingsApi';

export default function PreviewTable({
  sheet, position, note,
}: {
  sheet: PreviewSheet;
  /** 何枚目か（現地の Assistant は1枚目しか読まない）。分からないときは null */
  position: number | null;
  /** このシートは何のためのものか（入力ガイドだけ説明が要る） */
  note?: string;
}) {
  const empty = sheet.totalRows === 0;
  const rest = sheet.totalRows - sheet.rows.length;

  return (
    <div className="rounded-card border">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b px-3 py-2">
        <span className="text-list">{sheet.name}</span>
        {position === 1 && (
          <span className="rounded-badge bg-primary-surface px-1.5 text-badge text-primary">1枚目</span>
        )}
        <span className="tabular-nums text-sub-sm text-muted-foreground">
          {empty ? '0 行' : `${sheet.totalRows} 行`}
        </span>
      </div>

      {note && <p className="border-b px-3 py-2 text-sub-sm text-muted-foreground">{note}</p>}

      {empty ? (
        // 「0件」ではなく**何が起きるか**を書く（ルート CLAUDE.md の言葉づかい）
        <div className="bg-warning-surface px-3 py-3">
          <p className="text-sub font-bold text-warning">このシートは空です</p>
          <p className="mt-1 text-sub-sm text-muted-foreground">
            見出しだけの Excel になります。打ち込んだ内容は<strong>保存した分だけ</strong>出るので、
            先に保存してからもう一度ここを見てください。
          </p>
        </div>
      ) : (
        // ⚠️ 375px でも横スクロールを外に出さない。表は必ずこの入れ物の中でだけ流す
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-muted">
                {sheet.headers.map((h) => (
                  <th key={h} className="whitespace-nowrap border-b px-2 py-1.5 text-left text-th text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((v, ci) => (
                    // 空欄は**橙で「（空欄）」**と描く。空白のままだと「打ち忘れ」と
                    // 「現地の設定を変えない」の区別が付かない（空欄は不正ではない）
                    <td
                      key={ci}
                      className={`whitespace-nowrap border-b px-2 py-1.5 tabular-nums text-sub-sm ${
                        v === '' ? 'bg-warning-surface text-warning' : 'text-foreground'
                      }`}
                    >
                      {v === '' ? '（空欄）' : v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rest > 0 && (
        <p className="border-t px-3 py-1.5 tabular-nums text-sub-sm text-muted-foreground">
          ほか {rest} 行
        </p>
      )}
    </div>
  );
}
