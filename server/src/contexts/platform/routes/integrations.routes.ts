/**
 * 外部サービスにつながっているか (`GET /admin/integrations`)
 *
 * ── なぜ要るのか ────────────────────────────────────────────
 *
 * 「録音が動かない」「AI が行き先を決めてくれない」の原因の大半は
 * **その環境に鍵が入っていない**ことです。ところが確かめる手段が
 * **VPS に入って `.env` を読む**しかありませんでした。
 * `docker-compose.yml` は検証側に `OPENAI_API_KEY_DEV` → `OPENAI_API_KEY` の
 * 順で渡しますが、**どちらの名前で入っているかは外から見えません**。
 *
 * この口は**いま開いている環境**の状態を返します。検証を開けば検証の、
 * 本番を開けば本番の答えが出るので、「本番だけに入っているのでは」を
 * その場で確かめられます。
 *
 * ── 値は絶対に返さない ──────────────────────────────────────
 *
 * 返すのは **「入っているか」の真偽と、秘密でない名前**（モデル名・
 * プロバイダ名）だけです。鍵の先頭数文字も返しません — 一度出すと
 * ログ・スクリーンショット・問い合わせのコピペに残ります。
 *
 * ── 権限を掛けていない理由 ──────────────────────────────────
 *
 * 置き場所の「システムの情報」は**権限を掛けていない画面**です
 * (`client/CLAUDE.md`「設定トップとシステムの情報には権限を掛けていない」)。
 * ここだけ `admin` を要求すると、**動かないと気づいた本人が確かめられません**。
 * ログインは要ります (`requireAuth`)。
 */
import { Router } from 'express';
import { requireAuth } from '../../../shared/middleware/auth';
import { resolveProvider, intakeAiModel } from '../../tasks/services/intake-ai.service';
import { isSttConfigured, sttModel, structureModel } from '../../sales/services/minutes-ai.service';

const router = Router();

/** 環境変数が「入っている」か。空文字は入っていない扱い（`FOO=` と書いた事故を拾う） */
function has(name: string): boolean {
  return !!process.env[name]?.trim();
}

export interface IntegrationItem {
  key: string;
  label: string;
  /** つながっているか */
  ok: boolean;
  /** 何ができなくなるか（つながっていないとき画面に出す） */
  impact: string;
  /** 入れる環境変数の名前。**値は返さない** */
  envs: string[];
  /** つながっているときだけ出す補足（モデル名など。秘密ではない） */
  detail?: string;
}

router.get('/integrations', requireAuth, (_req, res) => {
  const provider = resolveProvider();
  const items: IntegrationItem[] = [
    {
      key: 'intake_ai',
      label: '投入口の行き先判断（AI）',
      ok: provider !== null,
      impact: '投入した文の行き先を AI が決められません。規則ベースに縮退し、行き先は全部タスクになります（投入自体は動きます）',
      envs: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'],
      detail: provider ? `${provider} / ${intakeAiModel(provider)}` : undefined,
    },
    {
      key: 'stt',
      label: '録音の文字起こし（Whisper）',
      // **Whisper は OpenAI だけ。** Anthropic の鍵では動きません
      ok: isSttConfigured(),
      impact: '録音を文字にできません。録音のボタンは押せますが、投げた先で必ず失敗します',
      envs: ['OPENAI_API_KEY'],
      detail: isSttConfigured() ? sttModel() : undefined,
    },
    {
      key: 'minutes_structure',
      label: '議事録の整形（決定事項・持ち帰り）',
      ok: provider !== null,
      impact: '文字起こしはできますが、決定事項と持ち帰りの下書きが作られません',
      envs: ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY'],
      detail: provider ? structureModel(provider) : undefined,
    },
    {
      key: 'box',
      label: 'BOX（案件フォルダ・書類）',
      ok: has('BOX_CONFIG_JSON'),
      impact: '案件のフォルダが作られず、書類タブが空になります',
      envs: ['BOX_CONFIG_JSON', 'BOX_PROJECT_PARENT_FOLDER_ID'],
    },
    {
      key: 'mcp',
      label: 'MCP コネクタ',
      ok: has('MCP_API_KEY'),
      impact: '外の AI から ONAiR を操作できません（/api/v1/mcp が 503）',
      envs: ['MCP_API_KEY'],
    },
    {
      key: 'slack',
      label: 'Slack への通知',
      ok: has('SLACK_BOT_TOKEN'),
      impact: 'Slack に何も飛びません',
      envs: ['SLACK_BOT_TOKEN'],
    },
    {
      key: 'mail',
      label: 'メール送信（SMTP）',
      ok: has('SMTP_HOST'),
      impact: '招待メール・パスワード再設定が送れません',
      envs: ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS'],
    },
  ];

  res.json({
    success: true,
    data: {
      // **どの環境を見ているかを一緒に返す。** これが無いと、
      // 「本番を見ているのか検証を見ているのか」が画面から分からない
      env: process.env.NODE_ENV === 'production' ? 'production' : 'development',
      client_url: process.env.CLIENT_URL ?? null,
      items,
    },
  });
});

export default router;
