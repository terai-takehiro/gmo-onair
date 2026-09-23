**OpenAI の最新版を取り込んだ。SDK（`openai`）を 6.49 → 7.23 に上げ、既定のモデルを GPT-6 世代（重い＝`gpt-6-sol`・軽い＝`gpt-6-luna`。前は `gpt-5.6-terra` / `gpt-5.6-luna`）にした。** SDK 7 が **Node.js 22 以上**を求めるため、本番のイメージ（`Dockerfile`）・CI・開発用コンテナを Node 20 → 22 に上げた。使っている呼び方（`responses.parse` ＋ `zodTextFormat`・`audio.transcriptions`）は 7 でも変わらず、コードの書き換えは既定のモデル名だけ。Anthropic 側は変えていない。

⚠️ **この環境では実際の API を呼べないまま既定を書き換えた。** 検証環境に出たら `docs/ai-models.md` の「新しい世代に上げるとき」の手順（重い・軽いの両方を実際に通す／`ai_usage` に新しいモデル名が出て `format_error` が 0 件か）と、`AI_PRICING_JSON` への `gpt-6-sol` / `gpt-6-luna` の単価の追加を必ず行うこと（入れないと費用の合計に足されず、静かに安く見える）。落ちたら `AI_MODEL_HEAVY=gpt-5.6-terra` / `AI_MODEL_LIGHT=gpt-5.6-luna` の環境変数だけで前の世代に戻せる。

検証: `npm run typecheck:all`（0 errors）・`npm run lint`（0 errors）・`npm run test`・全アプリのビルド（Node 22）。SDK 7 の `responses.parse` ＋ `zodTextFormat` と文字起こしを、通信を差し替えた呼び出しで通し、送るモデル名が `gpt-6-sol`・構造化出力（`json_schema`・strict）のまま・返りの解析と使用量が取れることを確認した。
