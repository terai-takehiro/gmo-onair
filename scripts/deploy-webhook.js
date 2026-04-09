#!/usr/bin/env node
/**
 * VPS自動デプロイ用ウェブフックサーバー
 * Giteaからのpushイベントを受けてdocker compose up --buildを実行する
 *
 * 起動: node scripts/deploy-webhook.js
 * ポート: 9000 (Nginx経由で /deploy/ にルーティング)
 */

const http = require('http');
const crypto = require('crypto');
const { exec } = require('child_process');

const PORT = 9000;
const SECRET = process.env.WEBHOOK_SECRET || '';
const DEPLOY_DIR = process.env.DEPLOY_DIR || '/opt/gmo-onair';

function verifySignature(payload, signature) {
  if (!SECRET) return true; // シークレット未設定の場合はスキップ
  if (!signature) return false;
  const hmac = crypto.createHmac('sha256', SECRET);
  hmac.update(payload);
  const expected = 'sha256=' + hmac.digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || req.url !== '/') {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    const signature = req.headers['x-gitea-signature'] || req.headers['x-hub-signature-256'];

    if (!verifySignature(body, signature)) {
      console.error('[webhook] signature mismatch');
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }

    let payload;
    try { payload = JSON.parse(body); } catch {
      res.writeHead(400);
      res.end('Bad Request');
      return;
    }

    // mainブランチへのpushのみ対象
    const ref = payload.ref || '';
    if (ref !== 'refs/heads/main') {
      res.writeHead(200);
      res.end(`Skipped (ref: ${ref})`);
      return;
    }

    console.log(`[webhook] Deploy triggered by push to main (${new Date().toISOString()})`);
    res.writeHead(200);
    res.end('Deploy started');

    const cmd = `cd ${DEPLOY_DIR} && git pull origin main && docker compose up -d --build 2>&1`;
    exec(cmd, { timeout: 300000 }, (err, stdout, stderr) => {
      if (err) {
        console.error('[deploy] ERROR:', err.message);
        console.error(stderr);
      } else {
        console.log('[deploy] SUCCESS');
        console.log(stdout);
      }
    });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[webhook] Listening on 127.0.0.1:${PORT}`);
  console.log(`[webhook] Deploy dir: ${DEPLOY_DIR}`);
  console.log(`[webhook] Secret: ${SECRET ? 'set' : 'NOT SET (open)'}`);
});
