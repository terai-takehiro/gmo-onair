// 収録設定・配信設定（`RecordingPage.tsx`/`StreamingPage.tsx`）が共用する、
// 「今日ではなく案件/番組の本番実施日を実施日の既定にする」ロジック。
//
// ⚠️ 直した不具合（実機確認・2026-08-23）: `?date=` の指定が無いとき、画面は常に
// `jstToday()`（今日）へ倒していた。本番が数日先の新規案件でも、開いた瞬間は
// 今日の日付が選ばれており、実施日の選択肢もまだ無かった（初回はその owner に
// 設定が1件も無いため）。**owner に設定が1件も無いと分かったときだけ**、
// 案件/番組の実施日（`OwnerContext.eventDate`）へ差し替える。
//
// 2画面は実施日を持つ state の形が違う（`RecordingPage` は `requestedDate` を
// 別に持つ・`StreamingPage` は URL の `date` をそのまま使う）ため、
// 「差し替え方」だけを `apply` として呼び出し側に委ねる（写すと片方だけ直る）。
import { useEffect, useRef } from 'react';
import type { OwnerContext } from './deviceSettingsApi';

export function useDeviceSettingsEventDateDefault(
  owner: OwnerContext | null,
  /** その owner に設定が1件でもあるか。判定前は `null` */
  hasSettings: boolean | null,
  /** URL の `?date=`。指定済みなら何もしない */
  explicitDate: string | null,
  apply: (eventDate: string) => void,
) {
  const applied = useRef(false);
  useEffect(() => {
    if (applied.current) return;
    if (explicitDate) { applied.current = true; return; }
    if (hasSettings !== false) return;
    if (!owner?.eventDate) { applied.current = true; return; }
    applied.current = true;
    apply(owner.eventDate);
  }, [owner, hasSettings, explicitDate, apply]);
}
