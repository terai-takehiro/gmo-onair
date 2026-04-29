# Operator UI

リアルタイム多言語同時通訳配信システムの操作画面 (Next.js 15 + React 19 + Tailwind CSS)。Phase 1 では最小構成: 新規セッション作成 → マイク入力 → WebSocket でバックエンドへPCM送信 → vMix用URLコピー、までを実装。

> 用語辞書UI、コストダッシュボード、リアルタイムプレビューはPhase 2で追加。

---

## ローカル開発

```bash
cd interpretation/operator-ui
cp .env.local.example .env.local
# 必要に応じて NEXT_PUBLIC_API_BASE_URL などを編集

# 初回のみ: package-lock.json を生成して必ずコミットする
#   (CI / Dockerfile で `npm ci` を使うため)
npm install
git add package-lock.json && git commit -m "chore(operator-ui): lockfile"

npm run dev          # 開発サーバ
npm run lint         # ESLint 9 flat config
npm run typecheck    # tsc --noEmit
npm run build        # Next.js standalone production build
```

http://localhost:3000 を開く。バックエンドが http://localhost:8080 で起動している前提。

> **注意**: マイクキャプチャは `https://` か `http://localhost` からでないと `getUserMedia` が動かない（ブラウザの secure context 制約）。

---

## 構成

```
operator-ui/
├── package.json
├── next.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
└── src/
    ├── app/
    │   ├── layout.tsx              # ヘッダ + Tailwind ルート
    │   ├── globals.css
    │   ├── page.tsx                # 新規セッション (言語選択 → 開始)
    │   └── sessions/[id]/page.tsx  # ライブ操作 (マイク + WS + URLコピー)
    └── lib/
        ├── api.ts                  # REST: createSession / endSession
        ├── audio.ts                # マイク → AudioWorklet → 16kHz PCM
        └── ws.ts                   # WebSocket クライアント
```

### 音声フォーマット

`lib/audio.ts` の AudioWorklet で 48kHz → 16kHz 線形補間ダウンサンプル + 16-bit signed PCM 化。100ms ごとに ArrayBuffer を WebSocket バイナリフレームとして送信。

---

## 動作確認 (Phase 1)

1. バックエンドを起動: `cd ../backend && uvicorn app.main:app --reload`
2. 操作画面を起動: `npm run dev`
3. http://localhost:3000 で言語を選んで「開始」
4. 遷移先で「配信開始」 → ブラウザがマイク許可を要求
5. 送信チャンク数がカウントアップすれば WebSocket 経由でバックエンドに到達
6. バックエンドのログに `operator_ws.connect` / `operator_ws.disconnect` が出る

> Phase 1 ではバックエンドはまだ STT/翻訳/TTS パイプラインを呼ばないので、字幕プレビューは出ない。

---

## ビルド

```bash
npm run build && npm run start
```

`output: "standalone"` で Cloud Run 向けに最適化。Dockerfile は Phase 2 で追加予定。
