/**
 * useProjectPresence — 案件ワークスペースの在席表示
 *
 * サーバー側の `/project-collab` ネームスペース (v2.9.249 で作った共通ファクトリ) は
 * presence を既に配っているので、ここは **リッスンだけ**する。
 * Yjs の内容同期はまだ画面に載せていないため、`yjs:*` は一切購読しない。
 *
 * これがあると「金額を直したのに消えていた」の**心当たりが付く**
 * (409 の競合バナーは保存を止めるための最後の砦で、こちらは事前の気付き)。
 */
import { useEffect, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type { PresenceUser } from "@gmo-onair/shared/src/client/collab/PresenceAvatars";

function readSocketAuth(): { token?: string; userId?: string } {
  try {
    const token = localStorage.getItem("gmo_onair_token");
    const rawUser = localStorage.getItem("gmo_onair_user");
    const userId = rawUser ? (JSON.parse(rawUser)?.id as string | undefined) : undefined;
    const auth: { token?: string; userId?: string } = {};
    if (token && token !== "undefined" && token !== "null") auth.token = token;
    if (userId) auth.userId = userId;
    return auth;
  } catch {
    return {};
  }
}

export function useProjectPresence(projectId: string | undefined): PresenceUser[] {
  const [users, setUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!projectId) return;
    let socket: Socket | null = null;
    try {
      socket = io("/project-collab", {
        path: "/socket.io/",
        query: { projectId },
        auth: readSocketAuth(),
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 10,
      });
    } catch {
      return; // socket が張れない環境でも案件画面は使えなければならない
    }
    const onPresence = (payload: { users?: PresenceUser[] }) => {
      setUsers(Array.isArray(payload?.users) ? payload.users : []);
    };
    const onConnect = () => socket?.emit("presence:query");
    socket.on("presence:sync", onPresence);
    socket.on("connect", onConnect);
    if (socket.connected) socket.emit("presence:query");
    return () => {
      socket?.off("presence:sync", onPresence);
      socket?.off("connect", onConnect);
      socket?.disconnect();
      setUsers([]);
    };
  }, [projectId]);

  return users;
}
