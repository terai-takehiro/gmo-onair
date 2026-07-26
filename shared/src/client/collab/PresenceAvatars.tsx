import { useMemo } from "react";

export interface PresenceUser {
  userId: string;
  name: string;
}

interface Props {
  users: PresenceUser[];
  currentUserId?: string;
}

// userId から決定的に色を選ぶ (同じ人はいつも同じ色)
const AVATAR_COLORS = [
  "bg-teal-600",
  "bg-indigo-600",
  "bg-pink-600",
  "bg-amber-600",
  "bg-emerald-600",
  "bg-sky-600",
  "bg-rose-600",
  "bg-violet-600",
];

function colorFor(userId: string): string {
  let h = 0;
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(name: string): string {
  const n = (name || "").trim();
  if (!n) return "?";
  // 日本語は先頭1文字、英字はスペース区切りの頭文字2つまで
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && /^[A-Za-z]/.test(n)) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return n.slice(0, /^[A-Za-z]/.test(n) ? 2 : 1).toUpperCase();
}

/**
 * このシートを今開いている人のアバターを表示する (在席表示)。
 * 自分だけ / 誰もいない場合は何も表示しない (ノイズ回避)。
 */
export default function PresenceAvatars({ users, currentUserId }: Props) {
  const { ordered, others } = useMemo(() => {
    const others = users.filter((u) => u.userId !== currentUserId);
    // 自分を先頭に、その後に他の人 (安定した並び)
    const self = users.find((u) => u.userId === currentUserId);
    const ordered = [
      ...(self ? [self] : []),
      ...others.slice().sort((a, b) => a.userId.localeCompare(b.userId)),
    ];
    return { ordered, others };
  }, [users, currentUserId]);

  // 他に誰もいなければ (自分だけ or 空) 何も出さない
  if (others.length === 0) return null;

  const shown = ordered.slice(0, 4);
  const overflow = ordered.length - shown.length;
  const title = `同時に編集中: ${ordered
    .map((u) => (u.userId === currentUserId ? `${u.name}（あなた）` : u.name))
    .join(" / ")}`;

  return (
    <div
      className="hidden sm:flex items-center mr-1"
      role="group"
      aria-label={title}
      title={title}
    >
      <span className="mr-1.5 inline-flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
      <div className="flex -space-x-1.5">
        {shown.map((u) => (
          <span
            key={u.userId}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ring-2 ring-card ${colorFor(
              u.userId,
            )} ${u.userId === currentUserId ? "ring-emerald-400" : ""}`}
          >
            {initials(u.name)}
          </span>
        ))}
        {overflow > 0 && (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground ring-2 ring-card">
            +{overflow}
          </span>
        )}
      </div>
    </div>
  );
}
