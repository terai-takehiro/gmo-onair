-- ============================================================
-- 162: 標準工程テンプレートの初期データ（施設AV設備 更新 / スタジオ内装リニューアル）
--
-- モック (`docs/design/v4/mockups/v4-mockup-project.dc.html` の GP_TPLS) から
-- そのまま起こしたもの。**シードではなくマイグレーションに置く** —
-- シードは本番で流れない (`SKIP_SEED=true`) が、この2つは本番でも要る。
--
-- **id は内容から決め打ちで作っている。** ランダムだと流すたびに別物になり、
-- `ON CONFLICT DO NOTHING` で弾けず、検証環境に二重に入る。
--
-- `is_system = true` にしてあるので画面からは消せない
-- （消すと、次に作る人が同じ工程を組み直すことになる）。
-- 中身は編集できる。
-- ============================================================

INSERT INTO gpm_templates (id, key, name, icon, description, is_system, sort_order)
VALUES ('gpmt-f9d00b43b40f508f3340', 'av', '施設AV設備 更新', 'monitor-speaker', '稼働中の施設（会議室・ホール・スタジオ）のオーディオビジュアル設備を入れ替えるとき', true, 0)
ON CONFLICT (key) DO NOTHING;
INSERT INTO gpm_template_phases (id, template_id, label, days, role, sort_order)
VALUES ('gpmt-4910e1b4482fa4b078f9', 'gpmt-f9d00b43b40f508f3340', '現地調査・要件整理', 10, 'PM', 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-d9cb08ffc19d84a049aa', 'gpmt-4910e1b4482fa4b078f9', '既存設備の棚卸し（型番・年式・数量）', 3, '技術', true, 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-c04845636dbf62bf48f9', 'gpmt-4910e1b4482fa4b078f9', '利用シーン・運用ヒアリング', 2, 'PM', true, 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-e5d8a72f7ba512651736', 'gpmt-4910e1b4482fa4b078f9', '電源・回線・ラック現況の確認', 2, '技術', true, 2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-270357e6aec57890aae2', 'gpmt-4910e1b4482fa4b078f9', '更新範囲の線引き（残す／替える）', 2, 'PM', true, 3)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_phases (id, template_id, label, days, role, sort_order)
VALUES ('gpmt-ea6c285a8ac30a0b74d6', 'gpmt-f9d00b43b40f508f3340', '基本計画・機器選定', 14, '技術', 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-0fc911c13f148aef7a39', 'gpmt-ea6c285a8ac30a0b74d6', '系統図（映像・音声・制御）の作成', 5, '技術', true, 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-515c182a34089a9c24b1', 'gpmt-ea6c285a8ac30a0b74d6', '主要機器の比較・選定', 4, '技術', true, 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-1e7169e5d4a24f3a2716', 'gpmt-ea6c285a8ac30a0b74d6', '概算費用の算出', 2, 'PM', true, 2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-6eda507f41953b1e38d6', 'gpmt-ea6c285a8ac30a0b74d6', '運用担当レビュー', 2, '依頼元', false, 3)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_phases (id, template_id, label, days, role, sort_order)
VALUES ('gpmt-b5de35908e8cab4ef0c4', 'gpmt-f9d00b43b40f508f3340', '個別見積・稟議', 10, 'PM', 2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-3ab64cd3151840ae4e72', 'gpmt-b5de35908e8cab4ef0c4', '個別見積の作成（料金表なし・個別積算）', 4, 'PM', true, 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-e3b66c249931e11c3ddb', 'gpmt-b5de35908e8cab4ef0c4', '工事区分の確認（電気・内装・IT）', 2, '設計会社', true, 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-dc969a892c4a564809a9', 'gpmt-b5de35908e8cab4ef0c4', '稟議・発注書の受領', 4, '依頼元', true, 2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_phases (id, template_id, label, days, role, sort_order)
VALUES ('gpmt-87c9a6162aeb4778f5ea', 'gpmt-f9d00b43b40f508f3340', '詳細設計・製作図', 15, '技術', 3)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-e1d5f40d8f3f5633d4a6', 'gpmt-87c9a6162aeb4778f5ea', 'ラック図・結線表の作成', 6, '技術', true, 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-1581c89e3687f433e15d', 'gpmt-87c9a6162aeb4778f5ea', '制御系（操作パネル）の設計', 5, '技術', false, 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-d6d8dafa65f07a255730', 'gpmt-87c9a6162aeb4778f5ea', '施工図の承認', 3, '依頼元', true, 2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_phases (id, template_id, label, days, role, sort_order)
VALUES ('gpmt-06abd2a06ef348b2733f', 'gpmt-f9d00b43b40f508f3340', '調達・工場製作', 30, '技術', 4)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-a0876cae8559731a7a58', 'gpmt-06abd2a06ef348b2733f', '長納期機器の先行発注', 3, 'PM', true, 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-44873b93222eb71bf5fe', 'gpmt-06abd2a06ef348b2733f', 'ラック製作・事前設定', 15, '施工会社', true, 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-3cb0b8393bba2b555198', 'gpmt-06abd2a06ef348b2733f', '工場試験（社内立会い）', 3, '技術', false, 2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_phases (id, template_id, label, days, role, sort_order)
VALUES ('gpmt-a1f1f32d24d49c6e6da8', 'gpmt-f9d00b43b40f508f3340', '停止調整・切替計画', 7, 'PM', 5)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-4f5088c8825559f42520', 'gpmt-a1f1f32d24d49c6e6da8', '設備を止められる日の調整', 3, '依頼元', true, 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-99a78ed0de7f565dd34f', 'gpmt-a1f1f32d24d49c6e6da8', '切替手順書・切戻し手順の作成', 3, '技術', true, 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-ba9f2a626743df27b0eb', 'gpmt-a1f1f32d24d49c6e6da8', '関係部署への通知', 1, 'PM', true, 2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_phases (id, template_id, label, days, role, sort_order)
VALUES ('gpmt-0917ec4171702993a165', 'gpmt-f9d00b43b40f508f3340', '撤去・据付・配線', 12, '施工会社', 6)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-26a2bce646890fae817f', 'gpmt-0917ec4171702993a165', '既存設備の撤去・搬出', 3, '施工会社', true, 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-30d88dfb36e99eac4d18', 'gpmt-0917ec4171702993a165', '新設機器の据付', 5, '施工会社', true, 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-a54abe181b949da9a7b3', 'gpmt-0917ec4171702993a165', '配線・成端', 4, '施工会社', true, 2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_phases (id, template_id, label, days, role, sort_order)
VALUES ('gpmt-7d2ced9e403a12ca5b19', 'gpmt-f9d00b43b40f508f3340', '調整・試験', 8, '技術', 7)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-6a347b065c6d5370dacb', 'gpmt-7d2ced9e403a12ca5b19', '単体試験', 3, '技術', true, 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-4edc0fb08730b90827f5', 'gpmt-7d2ced9e403a12ca5b19', '系統試験（通し）', 3, '技術', true, 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-e8cad9eee1d6c82d01ba', 'gpmt-7d2ced9e403a12ca5b19', '音響・映像の調整', 2, '技術', true, 2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_phases (id, template_id, label, days, role, sort_order)
VALUES ('gpmt-c26e0d0f7f1af6a9a2af', 'gpmt-f9d00b43b40f508f3340', '運用引継ぎ・検収', 6, 'PM', 8)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-48ecdc0d267eba4a00d9', 'gpmt-c26e0d0f7f1af6a9a2af', '操作説明会・簡易マニュアル', 2, 'PM', true, 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-47e4235129fe41160425', 'gpmt-c26e0d0f7f1af6a9a2af', '立会い検収', 2, '依頼元', true, 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-5313eec06f4e62e03316', 'gpmt-c26e0d0f7f1af6a9a2af', '是正対応', 2, '施工会社', false, 2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_phases (id, template_id, label, days, role, sort_order)
VALUES ('gpmt-7be6f1a8366b3572f8bc', 'gpmt-f9d00b43b40f508f3340', '引渡し・請求', 4, 'PM', 9)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-d5f4ff0d21e57e63ef06', 'gpmt-7be6f1a8366b3572f8bc', '竣工図書一式の提出', 2, '技術', true, 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-2f6a5fe39fa2be1e83a5', 'gpmt-7be6f1a8366b3572f8bc', '保守条件の確認', 1, 'PM', false, 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-bd31807c01fb98c61f36', 'gpmt-7be6f1a8366b3572f8bc', '請求', 1, 'PM', true, 2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_templates (id, key, name, icon, description, is_system, sort_order)
VALUES ('gpmt-bdb486fc7eae695849cf', 'studio', 'ビル取得後 スタジオ内装リニューアル', 'building-2', '取得・賃借した建物をスタジオ（収録・配信）に転用する内装＋設備＋AVの一体プロジェクト', true, 1)
ON CONFLICT (key) DO NOTHING;
INSERT INTO gpm_template_phases (id, template_id, label, days, role, sort_order)
VALUES ('gpmt-4b8c7006351d58eb4792', 'gpmt-bdb486fc7eae695849cf', '取得後 現況調査', 12, '設計会社', 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-eb3a90456a46ef3fac65', 'gpmt-4b8c7006351d58eb4792', '躯体・階高・床荷重の確認', 3, '設計会社', true, 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-56fe89a3822cb1b9b74d', 'gpmt-4b8c7006351d58eb4792', '受電容量・分電盤の現況', 2, '技術', true, 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-25a223e171932a23f74c', 'gpmt-4b8c7006351d58eb4792', '空調・排熱の現況', 2, '設計会社', true, 2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-be40fc0e411e853745d1', 'gpmt-4b8c7006351d58eb4792', '遮音・振動の実測（暗騒音）', 3, '技術', true, 3)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-e50f3ae12438937ab6b8', 'gpmt-4b8c7006351d58eb4792', '消防・建築法規の条件整理', 2, '設計会社', true, 4)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_phases (id, template_id, label, days, role, sort_order)
VALUES ('gpmt-cfeaab879bdc0e1eb17d', 'gpmt-bdb486fc7eae695849cf', '用途計画・スタジオ要件', 14, 'PM', 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-39ce3fae993365274325', 'gpmt-cfeaab879bdc0e1eb17d', '想定する番組・配信の整理', 3, '依頼元', true, 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-918c5d688c16c447eac6', 'gpmt-cfeaab879bdc0e1eb17d', 'スタジオ／副調／機材室の配置検討', 5, '設計会社', true, 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-86f2ceafe9d36e8d7a98', 'gpmt-cfeaab879bdc0e1eb17d', '遮音等級・残響の目標設定', 3, '技術', true, 2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-d3ea474c3019916e00ce', 'gpmt-cfeaab879bdc0e1eb17d', '搬入経路・什器動線の確認', 3, 'PM', true, 3)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_phases (id, template_id, label, days, role, sort_order)
VALUES ('gpmt-7f8b4d0cc54605c19c96', 'gpmt-bdb486fc7eae695849cf', '基本設計', 21, '設計会社', 2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-e1cc9e31bcad4f068ecb', 'gpmt-7f8b4d0cc54605c19c96', '平面・断面計画', 8, '設計会社', true, 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-f5a4bd728538331f649e', 'gpmt-7f8b4d0cc54605c19c96', '遮音・音響仕様の決定', 5, '技術', true, 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-a0c1e1278cab60b1bb4d', 'gpmt-7f8b4d0cc54605c19c96', '電気・空調の容量計画', 5, '設計会社', true, 2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-86dc50b4c2ca6ee16e3d', 'gpmt-7f8b4d0cc54605c19c96', '概算工事費の把握', 3, 'PM', true, 3)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_phases (id, template_id, label, days, role, sort_order)
VALUES ('gpmt-5c1c0ff8c48a48947fc7', 'gpmt-bdb486fc7eae695849cf', '個別見積・稟議', 12, 'PM', 3)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-180d11f458d836e71fe3', 'gpmt-5c1c0ff8c48a48947fc7', '内装・設備・AVの区分見積', 5, 'PM', true, 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-9835d2da2ba45562b0dd', 'gpmt-5c1c0ff8c48a48947fc7', '全体スケジュールの確定', 3, 'PM', true, 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-d84ddb05c1803d954880', 'gpmt-5c1c0ff8c48a48947fc7', '稟議・発注', 4, '依頼元', true, 2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_phases (id, template_id, label, days, role, sort_order)
VALUES ('gpmt-a6a0a60458fdca464f68', 'gpmt-bdb486fc7eae695849cf', '実施設計・確認申請', 25, '設計会社', 4)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-3fcf600904a3feb182c8', 'gpmt-a6a0a60458fdca464f68', '実施図面の作成', 12, '設計会社', true, 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-b8d4e7d15bdfad656369', 'gpmt-a6a0a60458fdca464f68', '消防・建築確認の申請', 8, '設計会社', true, 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-10ed569e5ba7124ae91a', 'gpmt-a6a0a60458fdca464f68', '施工会社の選定', 5, 'PM', true, 2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_phases (id, template_id, label, days, role, sort_order)
VALUES ('gpmt-6709921757d86ba9566e', 'gpmt-bdb486fc7eae695849cf', '内装工事', 45, '施工会社', 5)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-841713e0683091128aab', 'gpmt-6709921757d86ba9566e', '解体・下地', 10, '施工会社', true, 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-0cac7dcc306d1791aa09', 'gpmt-6709921757d86ba9566e', '遮音層・浮床の施工', 15, '施工会社', true, 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-8d12caa43286de671d9f', 'gpmt-6709921757d86ba9566e', '天井・照明グリッド', 10, '施工会社', true, 2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-b5da951e9c2b3fc65fec', 'gpmt-6709921757d86ba9566e', '仕上げ（壁・床・建具）', 10, '施工会社', true, 3)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_phases (id, template_id, label, days, role, sort_order)
VALUES ('gpmt-e309625335ff0859c384', 'gpmt-bdb486fc7eae695849cf', '設備工事', 30, '施工会社', 6)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-4f2e34066d30e905d9ea', 'gpmt-e309625335ff0859c384', '受電・分電盤の増設', 12, '施工会社', true, 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-bd5144d29f4af1d54c6d', 'gpmt-e309625335ff0859c384', '空調（静音仕様）の設置', 12, '施工会社', true, 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-6514bfce10bbaa2c0119', 'gpmt-e309625335ff0859c384', '配管・配線ラックの敷設', 8, '施工会社', true, 2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_phases (id, template_id, label, days, role, sort_order)
VALUES ('gpmt-cbaf834b98f5aab248ac', 'gpmt-bdb486fc7eae695849cf', 'AV設備 据付', 20, '技術', 7)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-bf167cddecc5cef72288', 'gpmt-cbaf834b98f5aab248ac', 'ラック搬入・据付', 5, '技術', true, 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-90d2cead7321bac468e6', 'gpmt-cbaf834b98f5aab248ac', 'カメラ・照明・音響の設置', 8, '技術', true, 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-f388b88c19a6e83785e2', 'gpmt-cbaf834b98f5aab248ac', '制御系・回線の接続', 7, '技術', true, 2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_phases (id, template_id, label, days, role, sort_order)
VALUES ('gpmt-e39e9492f60b21ec0b0e', 'gpmt-bdb486fc7eae695849cf', '音響測定・調整', 10, '技術', 8)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-14af82974633c8aad165', 'gpmt-e39e9492f60b21ec0b0e', '遮音性能の測定', 3, '技術', true, 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-0b840bbd3a81888c3242', 'gpmt-e39e9492f60b21ec0b0e', '残響・暗騒音の測定', 3, '技術', true, 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-d0180bf917fb1d077bcb', 'gpmt-e39e9492f60b21ec0b0e', '是正工事', 4, '施工会社', false, 2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_phases (id, template_id, label, days, role, sort_order)
VALUES ('gpmt-0f3b5b3a03f8403a01e6', 'gpmt-bdb486fc7eae695849cf', '竣工検査・引渡し', 8, 'PM', 9)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-41a0ba2620efcb6d8c54', 'gpmt-0f3b5b3a03f8403a01e6', '消防・完了検査', 3, '設計会社', true, 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-6f7e91e6360c136703fc', 'gpmt-0f3b5b3a03f8403a01e6', '是正・手直し', 3, '施工会社', false, 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-41125141578b14932b8f', 'gpmt-0f3b5b3a03f8403a01e6', '引渡し書類・請求', 2, 'PM', true, 2)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_phases (id, template_id, label, days, role, sort_order)
VALUES ('gpmt-f33747da61d7d92d88e1', 'gpmt-bdb486fc7eae695849cf', '運用開始・初期サポート', 14, 'PM', 10)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-61854d15ceeeeb539389', 'gpmt-f33747da61d7d92d88e1', '試験収録・運用リハーサル', 5, '技術', true, 0)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-a40564369a32ae1185b5', 'gpmt-f33747da61d7d92d88e1', '運用手順・当番表の整備', 5, '依頼元', false, 1)
ON CONFLICT (id) DO NOTHING;
INSERT INTO gpm_template_tasks (id, template_phase_id, label, days, role, is_required, sort_order)
VALUES ('gpmt-0052431eb795cfb43152', 'gpmt-f33747da61d7d92d88e1', '初期不具合の対応', 4, '技術', false, 2)
ON CONFLICT (id) DO NOTHING;
