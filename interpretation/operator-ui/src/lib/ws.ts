/** Operator WebSocket client. */

const WS_BASE =
  process.env.NEXT_PUBLIC_WS_BASE_URL ?? "ws://localhost:8080";

export type OperatorWS = {
  socket: WebSocket;
  send: (chunk: ArrayBuffer) => void;
  sendControl: (msg: object) => void;
  close: () => void;
};

export function openOperatorWs(
  sessionId: string,
  handlers: {
    onOpen?: () => void;
    onClose?: (ev: CloseEvent) => void;
    onMessage?: (data: unknown) => void;
    onError?: (ev: Event) => void;
  } = {},
): OperatorWS {
  const url = `${WS_BASE}/ws/operator/${sessionId}`;
  const socket = new WebSocket(url);
  socket.binaryType = "arraybuffer";

  socket.addEventListener("open", () => handlers.onOpen?.());
  socket.addEventListener("close", (ev) => handlers.onClose?.(ev));
  socket.addEventListener("error", (ev) => handlers.onError?.(ev));
  socket.addEventListener("message", (ev) => {
    try {
      const data = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
      handlers.onMessage?.(data);
    } catch {
      handlers.onMessage?.(ev.data);
    }
  });

  return {
    socket,
    send: (chunk) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(chunk);
      }
    },
    sendControl: (msg) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(msg));
      }
    },
    close: () => {
      try {
        socket.close(1000, "operator stop");
      } catch {
        /* ignore */
      }
    },
  };
}
