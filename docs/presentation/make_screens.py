# -*- coding: utf-8 -*-
"""
実アプリ画面の高精細再現ジェネレータ。
ユーザー提供のスクリーンショット（実データ）をもとに HTML を組み、
ローカル Chromium (Playwright) でレンダリングして PNG 化する。
出力: docs/presentation/screens/{projects,qsheet,equipment,techsheet,live,cg}.png
"""
import os
os.environ["PLAYWRIGHT_BROWSERS_PATH"] = "/opt/pw-browsers"
from playwright.sync_api import sync_playwright

CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screens")
os.makedirs(OUT, exist_ok=True)

W, H = 1320, 825   # ≈16:10（ブラウザ枠の中身比に近い）

BASE_CSS = """
*{margin:0;padding:0;box-sizing:border-box;font-family:'Noto Sans JP',sans-serif;}
body{background:#f6f8fb;color:#1f2a37;width:__W__px;height:__H__px;overflow:hidden;}
.topbar{height:52px;background:#fff;border-bottom:1px solid #e6ebf1;display:flex;align-items:center;
  padding:0 18px;gap:14px;}
.grid3{display:grid;grid-template-columns:repeat(3,4px);grid-template-rows:repeat(3,4px);gap:3px;}
.grid3 i{width:4px;height:4px;background:#9aa6b2;border-radius:1px;display:block;}
.logo{font-weight:800;color:#005bac;font-size:18px;letter-spacing:.5px;font-style:italic;}
.mod{color:#5b6672;font-weight:700;font-size:14px;}
.sep{color:#c2ccd6;}
.search{flex:1;max-width:300px;height:30px;border:1px solid #e0e6ee;border-radius:8px;background:#fff;
  display:flex;align-items:center;padding:0 12px;color:#9aa6b2;font-size:12px;}
.user{display:flex;align-items:center;gap:7px;color:#5b6672;font-size:13px;font-weight:600;}
.ava{width:24px;height:24px;border-radius:50%;background:#dbe7f5;color:#005bac;display:flex;
  align-items:center;justify-content:center;font-size:11px;font-weight:800;}
.wrap{padding:22px 26px;height:calc(100% - 52px);}
.h1{font-size:24px;font-weight:800;}
.sub{color:#8a939e;font-size:12px;margin-top:3px;}
.btn{height:32px;border-radius:8px;padding:0 14px;font-size:12px;font-weight:700;display:inline-flex;
  align-items:center;gap:6px;border:1px solid #e0e6ee;background:#fff;color:#3a4654;}
.btn.primary{background:#005bac;color:#fff;border:none;}
.btn.amber{background:#f59e0b;color:#fff;border:none;}
.row{display:flex;align-items:center;}
.gap{gap:10px;}
.card{background:#fff;border:1px solid #eceff3;border-radius:12px;box-shadow:0 1px 3px rgba(31,42,55,.06);}
.tab{font-size:13px;font-weight:700;color:#8a939e;padding:7px 4px;border-bottom:2px solid transparent;}
.tab.on{color:#005bac;border-color:#005bac;}
.pill{font-size:11px;font-weight:800;border-radius:6px;padding:3px 9px;color:#fff;display:inline-block;}
""".replace("__W__", str(W)).replace("__H__", str(H))


def topbar(mod):
    return f"""
    <div class="topbar">
      <div class="grid3"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <span style="color:#9aa6b2;font-size:18px">≡</span>
      <span class="logo">GMO ONAiR</span><span class="sep">/</span><span class="mod">{mod}</span>
      <div class="search">🔍 案件・顧客・仕入先...</div>
      <div class="user"><span class="ava">シ</span>システム管…&nbsp;⌄</div>
    </div>"""


def page(mod, body, extra_css="", show_top=True):
    top = topbar(mod) if show_top else ""
    return f"""<!doctype html><html><head><meta charset="utf-8">
    <style>{BASE_CSS}{extra_css}</style></head><body>{top}
    <div class="wrap">{body}</div></body></html>"""


# ---------------------------------------------------------------- 案件管理
def html_projects():
    css = """
    .ptabs{display:flex;gap:18px;margin:14px 0 14px;}
    .toolrow{display:flex;gap:10px;margin-bottom:14px;}
    .srch{flex:1;max-width:420px;height:34px;border:1px solid #e0e6ee;border-radius:9px;background:#fff;
      display:flex;align-items:center;padding:0 12px;color:#9aa6b2;font-size:12px;}
    .sort{height:34px;border:1px solid #e0e6ee;border-radius:9px;background:#fff;display:flex;align-items:center;
      padding:0 12px;color:#5b6672;font-size:12px;}
    .pcard{padding:16px 18px;margin-bottom:12px;}
    .code{color:#8a939e;font-size:12px;font-weight:700;}
    .pname{font-size:16px;font-weight:800;margin:4px 0 6px;}
    .meta{color:#5b6672;font-size:12px;}
    .fin{color:#5b6672;font-size:12px;margin-top:9px;border-top:1px solid #f0f3f7;padding-top:8px;}
    .fin b{color:#2ea06b;}
    .amt{font-size:18px;font-weight:800;color:#1f2a37;}
    """
    def card(code, badge, bc, name, date, comp, person, tag, sales, cost, gp, gprate, amt, est=False):
        fin = "" if sales is None else f'<div class="fin">売上 ¥{sales}　仕入 ¥{cost}　粗利 <b>¥{gp}（{gprate}%）</b></div>'
        amtline = f'{"（想定）" if est else ""}¥{amt}'
        return f"""<div class="card pcard">
          <div class="row" style="justify-content:space-between">
            <div><span class="code">{code}</span> <span class="pill" style="background:{bc}">{badge}</span></div>
            <div class="amt">{amtline}</div></div>
          <div class="pname">{name} <span style="color:#8a939e;font-weight:500;font-size:12px">({date})</span></div>
          <div class="meta">🏢 {comp}　👤 {person}　📅 {date}　🏷 {tag}</div>{fin}
        </div>"""
    body = f"""
    <div class="row" style="justify-content:space-between">
      <div class="h1">案件管理</div>
      <div class="row gap"><span class="btn">⬆ Excelインポート</span><span class="btn">⬇ Excel出力</span>
        <span class="btn primary">＋ 新規作成</span></div>
    </div>
    <div class="ptabs"><span style="color:#005bac;font-weight:800;border-bottom:2px solid #005bac;padding-bottom:6px">全て</span>
      <span style="color:#8a939e;font-weight:700">ヨミ</span><span style="color:#8a939e;font-weight:700">進行中</span>
      <span style="color:#8a939e;font-weight:700">完了</span><span style="color:#8a939e;font-weight:700">失注</span></div>
    <div class="toolrow"><div class="srch">🔍 案件名・コード・顧客名で検索...</div>
      <div class="sort">おすすめ (イベント日順 +…) ⌄</div></div>
    {card("GLS-A004","B 口頭決定","#f59e0b","PW 新サービス発表会","26/03/30","株式会社ペイメントワークス","佐藤 花子","ハイブリッドイベント","2,800,000","700,000","2,100,000","75","2,800,000")}
    {card("OPP-202603-0009","C 見積提案済","#2f80ed","PW IR動画制作","26/04/08","株式会社ペイメントワークス","高橋 美咲","GMO案件",None,None,None,None,"2,000,000",est=True)}
    {card("GLS-A006","B 口頭決定","#f59e0b","DA 社内イベント中継","26/04/10","株式会社デジタルアドバンス","高橋 美咲","生放送","1,500,000","400,000","1,100,000","73","1,500,000")}
    """
    return page("案件管理", body, css)


# ---------------------------------------------------------------- Qシート
def html_qsheet():
    css = """
    .qhead{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;}
    .qtitle{font-size:17px;font-weight:800;}
    .chip{font-size:11px;font-weight:700;border-radius:6px;padding:4px 9px;background:#eef2f7;color:#5b6672;}
    .chip.green{background:#16a34a;color:#fff;}.chip.red{background:#e2483d;color:#fff;}
    .qmeta{color:#5b6672;font-size:12px;margin-bottom:12px;display:flex;gap:16px;flex-wrap:wrap;}
    .layout{display:flex;gap:14px;height:calc(100% - 96px);}
    .cuewrap{flex:1;}
    .cueblock{background:#2563a8;color:#fff;border-radius:9px 9px 0 0;padding:9px 14px;font-weight:800;font-size:13px;
      display:flex;gap:10px;align-items:center;}
    .cuebody{background:#fff;border:1px solid #eceff3;border-top:none;border-radius:0 0 9px 9px;}
    .crow{display:grid;grid-template-columns:1.7fr 1fr;border-bottom:1px solid #f0f3f7;}
    .scn{padding:11px 12px;font-size:12px;color:#1f2a37;display:flex;gap:8px;}
    .qtag{font-size:10px;font-weight:800;border-radius:5px;padding:2px 7px;color:#fff;height:18px;}
    .mic{padding:9px 12px;border-left:1px solid #f0f3f7;}
    .inherit{color:#e2483d;font-size:10px;font-weight:700;margin-bottom:5px;}
    .mrow{display:flex;align-items:center;gap:8px;font-size:11px;margin:3px 0;color:#5b6672;}
    .onoff{font-size:9px;font-weight:800;color:#fff;border-radius:4px;padding:2px 6px;width:30px;text-align:center;}
    .rpanel{width:210px;}
    .rtabs{display:flex;gap:14px;font-size:12px;font-weight:700;margin-bottom:12px;}
    .litem{display:flex;align-items:center;gap:8px;font-size:12px;color:#3a4654;margin:8px 0;}
    """
    def scn(tag, tcolor, text):
        t = f'<span class="qtag" style="background:{tcolor}">{tag}</span>' if tag else '<span class="qtag" style="background:#eef2f7;color:#8a939e">名前</span>'
        return f'<div class="scn"><b style="color:#8a939e">Q</b>{t}<span>{text}</span></div>'
    def mic(state, ch, who):
        col = "#e2483d" if state=="ON" else "#c2ccd6"
        return f'<div class="mrow"><span class="onoff" style="background:{col}">{state}</span> {ch} <b style="color:#1f2a37">{who}</b> <span style="margin-left:auto;color:#9aa6b2">マイク</span></div>'
    body = f"""
    <div class="qhead">
      <span style="color:#8a939e">‹</span><span class="qtitle">GMOスタジオ情報バラエティ #001</span>
      <span class="chip">保存済み</span><span class="chip" style="background:#005bac;color:#fff">💾 保存</span>
      <span class="chip">🗑 ゴミ箱 2</span><span class="chip">⬇ CSV</span><span class="chip">👁 印刷 / PDF</span>
      <span class="chip">🎤 音声共有</span><span class="chip">☰ ランダウン</span><span class="chip red">（•）ON AIR</span>
      <span style="margin-left:auto;color:#8a939e;font-size:12px">⏱ 00:37:00</span>
    </div>
    <div class="qmeta"><span>準備稿 ⌄</span><span>放送日 2026/05/10</span><span>収録日 2026/05/08</span>
      <span>開始 19:00:00</span><span>📍 用賀 WORLD STUDIO</span></div>
    <div class="layout">
      <div class="cuewrap">
        <div class="cueblock">⋮⋮ <span style="background:#fff;color:#2563a8;border-radius:5px;padding:1px 7px">1</span>
          19:00:00 <span style="background:#1c4f86;border-radius:5px;padding:1px 7px">2:30</span> 【OP】オープニング</div>
        <div class="cuebody">
          <div class="crow"><div class="scn"><b style="color:#8a939e">Q</b><span class="qtag" style="background:#1f2a37">NA</span>
            <span>毎週土曜よる7時！知って得する情報満載！GMOスタジオ情報バラエティ！</span></div>
            <div class="mic"><div class="inherit">↧ 前cueから継承</div>{mic("ON","Ch1","MC 佐藤")}{mic("ON","Ch2","MC 佐藤")}</div></div>
          <div class="crow">{scn("","", "テキスト...")}
            <div class="mic"><div class="inherit">↧ 前cueから継承</div>{mic("OFF","Ch1","WL1")}{mic("OFF","Ch2","WL2")}</div></div>
          <div class="crow">{scn("MC佐藤","#16a34a","皆さんこんばんは！GMOスタジオ情報バラエティ、MCの佐藤です！")}
            <div class="mic"><div class="inherit">↧ 前cueから継承</div>{mic("OFF","Ch1","MC 佐藤")}{mic("OFF","Ch2","MC 佐藤")}</div></div>
          <div class="crow">{scn("アシ鈴木","#7c5cd6","アシスタントの鈴木です！今日も楽しい1時間にしましょう！")}
            <div class="mic"><div class="inherit">↧ 前cueから継承</div>{mic("OFF","Ch1","WL1")}{mic("OFF","Ch2","WL2")}</div></div>
        </div>
      </div>
      <div class="rpanel card" style="padding:14px">
        <div class="rtabs"><span style="color:#005bac;border-bottom:2px solid #005bac;padding-bottom:5px">列</span>
          <span style="color:#8a939e">マスター</span><span style="color:#8a939e">メタ</span></div>
        <div style="color:#8a939e;font-size:11px;font-weight:700;margin-bottom:6px">∨ 列　＋</div>
        <div class="litem">⋮⋮ 👤 シナリオ</div>
        <div class="litem">⋮⋮ 🎤 マイク香盤</div>
      </div>
    </div>
    """
    return page("Qシート", body, css)


# ---------------------------------------------------------------- 機材管理
def html_equipment():
    css = """
    .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:16px 0;}
    .kpi{padding:15px 16px;}
    .kpi .lab{color:#5b6672;font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px;}
    .kpi .val{font-size:30px;font-weight:800;margin-top:6px;}
    .kpi .val span{font-size:13px;font-weight:700;color:#1f2a37;}
    .kpi .note{color:#8a939e;font-size:11px;margin-top:4px;}
    .sec{padding:16px 18px;margin-bottom:14px;}
    .sec h3{font-size:15px;font-weight:800;margin-bottom:3px;}
    .qa{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:12px;}
    .qab{height:46px;border:1px solid #e6ebf1;border-radius:10px;display:flex;align-items:center;
      justify-content:center;gap:8px;font-size:13px;font-weight:700;color:#3a4654;}
    .small2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
    """
    def kpi(lab, icon, val, unit, note, vc="#1f2a37"):
        return f"""<div class="card kpi"><div class="lab">{icon} {lab}</div>
          <div class="val" style="color:{vc}">{val}<span> {unit}</span></div><div class="note">{note}</div></div>"""
    body = f"""
    <div class="row" style="justify-content:space-between"><div class="h1">機材ダッシュボード</div>
      <span class="btn">⟳ 更新</span></div>
    <div class="sub">機材台帳・貸出・メンテナンスの状況を一望できます。</div>
    <div class="kpis">
      {kpi("総機材数","🟦","462","件","稼働中 462 件")}
      {kpi("貸出中","⇄","1","件","遅延 1 件",vc="#2ea06b")}
      {kpi("修理・メンテ中","🔧","0","件","未対応 0 件",vc="#f59e0b")}
      {kpi("棚卸し","☑","0","件","未完了の棚卸し")}
    </div>
    <div class="card sec"><h3>クイックアクション</h3><div class="sub">よく使う操作を1タップで。</div>
      <div class="qa"><div class="qab" style="color:#005bac">＋ 貸出登録</div><div class="qab" style="color:#f59e0b">＋ メンテ記録</div>
        <div class="qab">🟦 機材一覧</div><div class="qab">🧵 ケーブル管理</div>
        <div class="qab">🔌 コネクタ管理</div><div class="qab">▦ QRスキャン</div><div class="qab">🗄 ラック実装</div></div>
    </div>
    <div class="small2">
      <div class="card sec"><div class="lab" style="color:#5b6672;font-size:12px;font-weight:700">🧵 ケーブル</div>
        <div style="font-size:26px;font-weight:800">0 <span style="font-size:13px">本</span></div>
        <div class="note" style="color:#8a939e;font-size:11px">0 種類</div></div>
      <div class="card sec"><div class="lab" style="color:#5b6672;font-size:12px;font-weight:700">🔌 コネクタ</div>
        <div style="font-size:26px;font-weight:800">0 <span style="font-size:13px">個</span></div>
        <div class="note" style="color:#8a939e;font-size:11px">0 種類</div></div>
    </div>
    """
    return page("機材管理", body, css)


# ---------------------------------------------------------------- 技術資料
def html_techsheet():
    css = """
    .thead{display:flex;align-items:center;gap:10px;margin-bottom:12px;}
    .ttabs{display:flex;gap:22px;border-bottom:1px solid #eceff3;margin-bottom:18px;padding-bottom:2px;}
    table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;
      border:1px solid #eceff3;}
    th{background:#fafbfd;color:#8a939e;font-size:12px;font-weight:700;text-align:left;padding:11px 12px;
      border-bottom:1px solid #eceff3;}
    td{padding:10px 12px;border-bottom:1px solid #f2f4f7;font-size:12px;}
    .inp{border:1px solid #e6ebf1;border-radius:7px;padding:7px 9px;font-size:12px;color:#1f2a37;background:#fff;}
    .camtag{font-size:11px;font-weight:800;color:#7c5cd6;}
    """
    def inp(v): return f'<div class="inp">{v}</div>'
    body = f"""
    <div class="thead"><span style="color:#8a939e">←</span>
      <span style="font-weight:800;font-size:16px">サイエンス・フロンティア #001</span>
      <span class="chip" style="background:#eef2f7;color:#5b6672;font-size:11px;padding:3px 8px;border-radius:6px">Ver.1.0</span>
      <span style="margin-left:auto"></span><span class="btn">🖨 印刷</span>&nbsp;<span class="btn primary">💾 保存</span></div>
    <div class="ttabs">
      <span class="tab">基本情報・スタッフ</span><span class="tab on">📷 カメラプラン</span>
      <span class="tab">🖥 映像系統</span><span class="tab">🎵 音声系統</span><span class="tab">((•)) 通信系統</span></div>
    <div class="row" style="justify-content:space-between;margin-bottom:10px">
      <div style="font-size:16px;font-weight:800">カメラプラン</div><span class="btn">＋ カメラ追加</span></div>
    <table>
      <tr><th>No.</th><th>カメラ機種</th><th>レンズ</th><th>担当者</th><th>設置場所</th><th>ケーブル/備考</th></tr>
      <tr><td><span class="camtag">CAM</span></td><td>{inp("Blackmagic URSA Mini")}</td><td>{inp("Canon CN-E 50mm T1.")}</td>
        <td>{inp("鈴木 一郎")}</td><td>{inp("MCバスト (センター)")}</td><td>{inp("SDI 12G → SW IN1")}</td></tr>
      <tr><td><span class="camtag">CAM</span></td><td>{inp("Sony PXW-FX6")}</td><td>{inp("Sony 24-70mm f/2.8 GⅡ")}</td>
        <td>{inp("高橋 美咲")}</td><td>{inp("ゲスト寄り (下手)")}</td><td>{inp("SDI 6G → SW IN2")}</td></tr>
      <tr><td><span class="camtag">CAM</span></td><td>{inp("Sony PXW-FX6")}</td><td>{inp("Sony 16-35mm f/2.8 GⅡ")}</td>
        <td>{inp("固定")}</td><td>{inp("セット全景 (上手奥)")}</td><td>{inp("SDI 6G → SW IN3")}</td></tr>
    </table>
    """
    return page("技術資料", body, css)


# ---------------------------------------------------------------- 計時LIVE（タイマー送出）
def html_live():
    css = """
    body{background:#10161e;}
    .wrap{padding:0;height:100%;}
    .liveinner{padding:26px 32px;display:flex;gap:24px;height:100%;}
    .leftcol{flex:1;display:flex;flex-direction:column;}
    .lvhead{color:#ced7e2;font-weight:800;font-size:18px;display:flex;align-items:center;gap:12px;}
    .lvbadge{background:#16a34a;color:#fff;font-size:12px;font-weight:800;border-radius:20px;padding:5px 12px;}
    .timer{font-size:120px;font-weight:800;color:#fff;letter-spacing:2px;margin-top:auto;font-variant-numeric:tabular-nums;}
    .tsub{color:#9fb0c2;font-size:14px;margin-bottom:8px;}
    .vpanels{width:430px;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:14px;}
    .vp{background:#1b2432;border:1px solid #2c394c;border-radius:14px;padding:16px;}
    .vp .l{color:#9fb0c2;font-size:12px;font-weight:700;}
    .vp .v{font-size:34px;font-weight:800;margin-top:8px;font-variant-numeric:tabular-nums;}
    """
    body = """
    <div class="liveinner">
      <div class="leftcol">
        <div class="lvhead">本番進行 ｜ PW 新サービス発表会 <span class="lvbadge">● LIVE</span></div>
        <div class="timer">01:24:36</div>
        <div class="tsub">経過時間 ・ 次の転換まで 03:12</div>
      </div>
      <div class="vpanels">
        <div class="vp"><div class="l">視聴者数（合算）</div><div class="v" style="color:#2ea06b">12,480</div></div>
        <div class="vp"><div class="l">Zoom</div><div class="v" style="color:#4a9de0">3,210</div></div>
        <div class="vp"><div class="l">YouTube</div><div class="v" style="color:#e2483d">8,940</div></div>
        <div class="vp"><div class="l">Teams</div><div class="v" style="color:#7c5cd6">330</div></div>
      </div>
    </div>
    """
    return page("計時LIVE", body, css, show_top=False)


# ---------------------------------------------------------------- リアルタイムCG（送出出力）
def html_cg():
    css = """
    body{background:#0a0c12;}
    .wrap{padding:0;height:100%;position:relative;}
    .spot{position:absolute;left:30%;top:4%;width:40%;height:52%;border-radius:50%;
      background:radial-gradient(closest-side,#171b27,transparent);}
    .winhdr{position:absolute;top:9%;left:0;right:0;text-align:center;color:#e7c96b;letter-spacing:.5em;
      font-weight:700;font-size:18px;font-family:'Roboto Condensed',sans-serif;}
    .wincard{position:absolute;top:18%;left:50%;transform:translateX(-50%);width:300px;height:180px;
      background:#14182433;border:2px solid #c9a961;border-radius:14px;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:12px;}
    .wincard .ph{width:84px;height:84px;border-radius:50%;background:#2a3145;}
    .wincard .nm{color:#fff;font-weight:800;font-size:17px;}
    .lt{position:absolute;left:4%;right:4%;bottom:10%;height:96px;background:#10141e;border-left:6px solid #c9a961;
      display:flex;align-items:center;padding:0 18px;gap:16px;}
    .lt .ph{width:64px;height:64px;border-radius:50%;background:#2a3145;}
    .lt .nm{color:#fff;font-weight:800;font-size:22px;}
    .lt .af{color:#c9a961;font-size:13px;font-weight:700;margin-top:4px;}
    .lt .af span{color:#adb7c4;font-weight:500;}
    .bars{position:absolute;right:5%;top:16%;display:flex;flex-direction:column;gap:9px;}
    .bar{height:14px;border-radius:3px;}
    """
    body = """
    <div class="spot"></div>
    <div class="winhdr">— THE WINNER —</div>
    <div class="wincard"><div class="ph"></div><div class="nm">グローバルスタジオ賞</div></div>
    <div class="bars">
      <div class="bar" style="width:200px;background:#e7c96b"></div>
      <div class="bar" style="width:140px;background:#4a9de0"></div>
      <div class="bar" style="width:96px;background:#c45a5a"></div>
    </div>
    <div class="lt"><div class="ph"></div>
      <div><div class="nm">田中 太郎</div>
        <div class="af">GMOグローバルスタジオ　<span>｜　制作部 部長</span></div></div></div>
    """
    return page("リアルタイムCG", body, css, show_top=False)


SCREENS = {
    "projects": html_projects, "qsheet": html_qsheet, "equipment": html_equipment,
    "techsheet": html_techsheet, "live": html_live, "cg": html_cg,
}


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
        for key, fn in SCREENS.items():
            pg = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=2)
            pg.set_content(fn(), wait_until="networkidle")
            pg.wait_for_timeout(250)
            out = os.path.join(OUT, key + ".png")
            pg.screenshot(path=out)
            pg.close()
            print("rendered", out)
        b.close()


if __name__ == "__main__":
    main()
