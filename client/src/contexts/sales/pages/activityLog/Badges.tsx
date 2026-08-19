/**
 * 営業活動記録の小さな印（AI作成／由来） (v4)
 *
 * 旧実装からそのまま移した（動きは変えていない）。
 */
import { Sparkles } from 'lucide-react';
import type { ActivityLogRow } from './types';

export function AiCreatedBadge({ requestedBy }: { requestedBy?: string | null }) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] text-violet-700"
      title={requestedBy ? `AI が記録しました（指示: ${requestedBy}）` : 'AI が記録しました'}
    >
      <Sparkles className="h-3 w-3" aria-hidden="true" />
      AI作成
    </span>
  );
}

/** 由来チップ — 流入チャネル + メール取込 + AI 指示者。「どこから来た情報か」を一目で分かるようにする */
export function ProvenanceChips({ log }: { log: ActivityLogRow }) {
  const { source_channel: channel, message_id: hasMail, ai_requested_by: requestedBy } = log;
  if (!channel && !hasMail && !requestedBy) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {channel && (
        <span className="inline-flex shrink-0 items-center rounded-full border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[10px] text-sky-700" title="どこから届いたか">
          {channel}
        </span>
      )}
      {hasMail && (
        // Message-ID は突合用の内部キーなので title に退避する
        <span
          className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600"
          title={`メールから作られました（Message-ID: ${hasMail}）`}
        >
          ✉ メール
        </span>
      )}
      {requestedBy && (
        <span className="text-[10px] text-violet-600" title="AI に指示した人">指示: {requestedBy}</span>
      )}
    </span>
  );
}
