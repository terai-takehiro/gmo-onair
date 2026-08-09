#!/usr/bin/env node
/**
 * 同梱した書体が揃っているかを見る（`npm run lint` の一部）
 *
 * ── なぜ検査するか ──────────────────────────────────────────
 *
 * v4 の3アプリは **Google Fonts を読みません**（`index.html` から外しました）。
 * つまり同梱が欠けると、**代替書体になったことに誰も気づけません** —
 * 画面は出るし、型チェックもビルドも通るからです。
 * 気づくのは「なんとなく字が違う」と言われたときで、そこから原因に辿るのは大変です。
 *
 * 落ちたら `npm run fonts` で入れ直します。
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const r = spawnSync('node', [path.join(ROOT, 'scripts/vendor-fonts.mjs'), '--check'], { stdio: 'inherit' });
process.exit(r.status ?? 1);
