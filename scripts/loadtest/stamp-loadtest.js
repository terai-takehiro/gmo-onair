// インタラクティブスタンプ 負荷試験 (k6)
// 使い方は scripts/loadtest/README.md を参照
//
// 環境変数:
//   TEST_BASE_URL  : 試験対象URL (例: https://dev.gmo-onair.jp)
//   TEST_EVENT_ID  : 対象イベントUUID
//   VUS            : 仮想ユーザー数 (同時接続数)
//   DURATION       : 各VUの試験継続時間 (例: "5m")
//   TAP_INTERVAL   : 1タップあたりの平均インターバル (ms, 既定200 = 5タップ/秒)

import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.TEST_BASE_URL || 'https://dev.gmo-onair.jp';
const EVENT_ID = __ENV.TEST_EVENT_ID;
const VUS = Number(__ENV.VUS) || 100;
const DURATION = __ENV.DURATION || '3m';
const TAP_INTERVAL_MS = Number(__ENV.TAP_INTERVAL) || 200;

if (!EVENT_ID) {
  throw new Error('TEST_EVENT_ID環境変数を設定してください');
}

// カスタム指標
const stampEmitCounter = new Counter('stamp_emits');
const stampRecvCounter = new Counter('stamp_recvs');
const connectFailed = new Counter('connect_failed');
const stampSendFailed = new Counter('stamp_send_failed');
const wsConnectDuration = new Trend('ws_connect_duration_ms');
const stampLatency = new Trend('stamp_recv_latency_ms');
const wsConnectSuccessRate = new Rate('ws_connect_success');

export const options = {
  scenarios: {
    audience_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        // 60秒で目標VUSまでランプアップ → 残り時間その負荷を維持 → 30秒でクールダウン
        { duration: '60s', target: VUS },
        { duration: DURATION, target: VUS },
        { duration: '30s', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    ws_connect_success: ['rate>0.99'],
    'http_req_duration{name:get_event}': ['p(95)<2000'],
    'http_req_duration{name:join}': ['p(95)<2000'],
    connect_failed: ['count<100'],
  },
  // 大量VUSでのメモリ使用を抑える
  noConnectionReuse: false,
  insecureSkipTLSVerify: true,
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
};

export default function () {
  // Step 1: イベント情報取得
  const eventRes = http.get(`${BASE_URL}/api/v1/internal/interactive/audience/events/${EVENT_ID}`, {
    tags: { name: 'get_event' },
    timeout: '10s',
  });
  if (!check(eventRes, { 'event 200': r => r.status === 200 })) {
    connectFailed.add(1);
    return;
  }

  let stamps = [];
  try {
    stamps = eventRes.json('data.stamps') || [];
  } catch (e) {
    connectFailed.add(1);
    return;
  }
  if (stamps.length === 0) {
    connectFailed.add(1);
    return;
  }

  // Step 2: セッション作成
  const joinRes = http.post(
    `${BASE_URL}/api/v1/internal/interactive/audience/events/${EVENT_ID}/join`,
    JSON.stringify({}),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'join' },
      timeout: '10s',
    }
  );
  if (!check(joinRes, { 'join 201': r => r.status === 201 })) {
    connectFailed.add(1);
    return;
  }

  let sessionToken;
  try {
    sessionToken = joinRes.json('data.session_token');
  } catch (e) {
    connectFailed.add(1);
    return;
  }
  if (!sessionToken) {
    connectFailed.add(1);
    return;
  }

  // Step 3: WebSocket 接続
  const wsUrl = BASE_URL.replace(/^http/, 'ws')
    + `/socket.io/?EIO=4&transport=websocket`;

  const connectStart = Date.now();
  const wsRes = ws.connect(wsUrl, {
    headers: { 'User-Agent': 'k6-loadtest' },
  }, (socket) => {
    wsConnectDuration.add(Date.now() - connectStart);
    wsConnectSuccessRate.add(1);

    let connected = false;
    let tapTimer = null;

    socket.on('open', () => {
      // Engine.IO v4 ハンドシェイク完了後に Socket.IO の接続パケットを送信
      // /interactive 名前空間 + eventId + sessionToken
    });

    socket.on('message', (msg) => {
      // Engine.IO/Socket.IO プロトコル
      // 0{...} = open, 40 = connect ack (default ns), 42[...] = event
      if (typeof msg !== 'string') return;

      if (msg.startsWith('0{')) {
        // Engine.IO open → Socket.IO connect to /interactive namespace
        const ns = `/interactive,{"eventId":"${EVENT_ID}","sessionToken":"${sessionToken}"}`;
        socket.send(`40${ns}`);
      } else if (msg.startsWith('40/interactive')) {
        // /interactive 接続成功 → タップ送信ループ開始
        connected = true;
        tapTimer = setInterval(() => {
          if (!connected) return;
          const stamp = stamps[Math.floor(Math.random() * stamps.length)];
          // 300msクライアント側集約に揃え、1emit = 1〜2回分のカウントを送る
          // (実機の連打ペースを再現)
          const tapsPerEmit = Math.max(1, Math.round(300 / TAP_INTERVAL_MS));
          const payload = `42/interactive,["stamp",${JSON.stringify({ stampId: stamp.id, count: tapsPerEmit })}]`;
          socket.send(payload);
          stampEmitCounter.add(1);
        }, 300); // 300msごとにemit (実装と同じ)
      } else if (msg.startsWith('42/interactive,')) {
        // 受信イベント
        try {
          const json = msg.substring('42/interactive,'.length);
          const arr = JSON.parse(json);
          if (arr[0] === 'stamp:update') {
            stampRecvCounter.add(1);
            if (arr[1] && arr[1].timestamp) {
              stampLatency.add(Date.now() - arr[1].timestamp);
            }
          }
        } catch (e) { /* parse error ignored */ }
      } else if (msg === '2') {
        // ping
        socket.send('3'); // pong
      }
    });

    socket.on('error', () => {
      stampSendFailed.add(1);
    });

    socket.on('close', () => {
      connected = false;
      if (tapTimer) clearInterval(tapTimer);
    });

    // VU試験時間が来たら切断 (k6が自動でcloseするが、安全のため明示)
    socket.setTimeout(() => {
      socket.close();
    }, 1000 * 60 * 10); // 最大10分
  });

  if (!check(wsRes, { 'ws status 101': r => r && r.status === 101 })) {
    wsConnectSuccessRate.add(0);
    connectFailed.add(1);
  }

  // VUは1試験で1接続
  sleep(1);
}
