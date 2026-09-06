// テロップCG — 段E①「台本に追従」（docs/design/v4/graphics-redesign.md §12-2・担当2）。
//
// 本番モード（GraphicsConsolePage.tsx）で、進行台本（OnAir画面）の現在行が進むのを
// リッスンし、対応するテロップが見つかったら NEXT だけを動かす。既定OFF・番組ごとにON
// （`bundle.project.followScript`。トグルは①テロップ一覧のヘッダー付近＝FollowScriptToggle.tsx
// の担当）。
//
// お手本は `client-techops/src/pages/RundownPage.tsx`（「台本の進行に追従するだけの
// 純粋なフォロワー」の既存実装）——接続・リッスンの手順はそれをそのまま模写している。
//
// ⚠️ 安全装置（絶対厳守）:
//   ・**TAKE は一切呼ばない・cue:* を一切 emit しない。** このフックは読み取り専用の
//     フォロワーであり、qsheet/rundown 側の進行に何かを注入する権限は無い設計
//     （`cue:sync` を `.on()` でリッスンするだけ——`.emit()` は一度も呼ばない）
//   ・文言が空のページへは進めない（`isPageContentEmpty`。①一覧・番号呼出と同じ
//     安全装置③の考え方をここにも適用する）
//   ・対応するテロップが見つからないときは黙って無視する（現在行に対応するテロップが
//     まだ作られていない、はよくある正常な状態——エラー扱いにしない）
import { useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { getQsheetSocket, disconnectQsheetSocket } from '@/lib/socket';
import { flattenCues, type DocumentData } from '../rundown/rundownData';
import { isPageContentEmpty } from './pageFields';
import type { GraphicsPageRow } from '@/lib/graphicsApi';

export function useScriptFollow(params: {
  /** `bundle.project.followScript` をそのまま渡す想定。false なら何も接続しない */
  enabled: boolean;
  /** NEXT候補（sortOrder順で構わない・呼び出し側の pages をそのまま渡す） */
  pages: GraphicsPageRow[];
  /** 対応するページが見つかったら呼ぶ（= setPvwPageId）。TAKE は呼び出し側でも一切しない */
  onAdvanceNext: (pageId: string) => void;
}): void {
  const { enabled, pages, onAdvanceNext } = params;

  // 追従対象の台本 = pages の中で最も出現数の多い qsheetDocId（同数なら先に現れた方）。
  // 台本から取り込んだページが1つも無ければ null＝追従しようがない
  const scriptDocId = useMemo(() => {
    const counts = new Map<string, number>();
    const order: string[] = [];
    for (const p of pages) {
      if (!p.qsheetDocId) continue;
      if (!counts.has(p.qsheetDocId)) order.push(p.qsheetDocId);
      counts.set(p.qsheetDocId, (counts.get(p.qsheetDocId) ?? 0) + 1);
    }
    if (order.length === 0) return null;
    let best = order[0];
    let bestCount = counts.get(best) ?? 0;
    for (const docId of order) {
      const count = counts.get(docId) ?? 0;
      if (count > bestCount) { best = docId; bestCount = count; }
    }
    return best;
  }, [pages]);

  const active = enabled && !!scriptDocId;

  // 台本本体の取得。ScriptPositionPickerDialog.tsx / OnAirPage.tsx と同じ防御
  // （`data` 列が稀に文字列 JSON のまま返る）
  const { data: documentData } = useQuery({
    queryKey: ['graphics-script-follow-document', scriptDocId],
    queryFn: async () => {
      const res = await api.get(`/techops/documents/${scriptDocId}`);
      const row = res.data.data;
      const parsed = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
      return (parsed ?? { sections: [], blocks: [] }) as DocumentData;
    },
    enabled: active,
  });

  const flatCues = useMemo(() => flattenCues(documentData?.sections), [documentData]);

  // クロージャ問題を避けるため、socket effect からは ref 経由で最新値を読む。
  // こうしておくと下の socket effect の依存配列を [enabled, scriptDocId] だけに保てる
  // ——pages/flatCues/onAdvanceNext が変わるたびに接続を張り直さずに済む
  const flatCuesRef = useRef(flatCues);
  useEffect(() => { flatCuesRef.current = flatCues; }, [flatCues]);

  const pagesRef = useRef(pages);
  useEffect(() => { pagesRef.current = pages; }, [pages]);

  const onAdvanceNextRef = useRef(onAdvanceNext);
  useEffect(() => { onAdvanceNextRef.current = onAdvanceNext; }, [onAdvanceNext]);

  // RundownPage.tsx と同じ手順で接続する。**cue:sync をリッスンするだけ**
  // ——cue:next/cue:update/cue:jump 等を emit することは無い（読み取り専用のフォロワー）
  useEffect(() => {
    if (!enabled || !scriptDocId) return;
    const socket = getQsheetSocket(scriptDocId);

    const handleSync = (data: { currentCue: number }) => {
      const currentRowId = flatCuesRef.current[data.currentCue]?.row?.id;
      if (!currentRowId) return;
      const page = pagesRef.current.find(
        (p) => p.qsheetRowId === currentRowId && !isPageContentEmpty(p.partKey, p.fields),
      );
      // 対応するテロップが見つからなければ何もしない（現在行にまだテロップが
      // 作られていない、はよくある正常な状態——エラーにしない）
      if (page) onAdvanceNextRef.current(page.id);
    };
    socket.on('cue:sync', handleSync);

    return () => {
      socket.off('cue:sync', handleSync);
      disconnectQsheetSocket();
    };
  }, [enabled, scriptDocId]);
}
