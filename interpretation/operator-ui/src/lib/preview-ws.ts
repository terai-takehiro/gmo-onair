"use client";

import { bearer } from "@/lib/auth";

const WS_BASE =
  process.env.NEXT_PUBLIC_WS_BASE_URL ?? "ws://localhost:8080";

export type PreviewFrame =
  | {
      type: "transcript";
      text: string;
      is_final: boolean;
      t_ms: number;
    }
  | {
      type: "translation";
      lang: string;
      text: string;
      is_final: boolean;
      seq: number;
      t_ms: number;
    }
  | { type: "heartbeat" }
  | { type: "session_end" };

export type PreviewWS = {
  socket: WebSocket;
  close: () => void;
};

export function openPreviewWs(
  sessionId: string,
  onFrame: (f: PreviewFrame) => void,
  onClose?: () => void,
): PreviewWS {
  const token = bearer();
  const qs = token ? `?token=${encodeURIComponent(token)}` : "";
  const url = `${WS_BASE}/ws/operator-preview/${sessionId}${qs}`;
  const socket = new WebSocket(url);

  socket.addEventListener("message", (ev) => {
    if (typeof ev.data !== "string") return;
    try {
      const f = JSON.parse(ev.data) as PreviewFrame;
      onFrame(f);
    } catch {
      /* ignore malformed */
    }
  });
  socket.addEventListener("close", () => onClose?.());
  socket.addEventListener("error", () => {
    /* close handler will fire */
  });

  return {
    socket,
    close: () => {
      try {
        socket.close(1000, "operator stop");
      } catch {
        /* ignore */
      }
    },
  };
}
