# -*- coding: utf-8 -*-
"""
GMO ONAiR 社長プレゼン資料ジェネレーター
イラスト（ベクター図形）多めの 16:9 PowerPoint を python-pptx で生成する。

内容:
  - このアプリ（GMO ONAiR）でできること
  - これまでの対話による作り上げ方
  - バイブコーディングの活用法

出力: GMO_ONAiR_プレゼン.pptx
"""

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.text import MSO_AUTO_SIZE
from pptx.oxml.ns import qn
import copy

# ------------------------------------------------------------------
# パレット (GMO Blue 基調 + Warm Neutrals)
# ------------------------------------------------------------------
GMO_BLUE   = RGBColor(0x00, 0x5B, 0xAC)   # ブランドブルー
BLUE_DARK  = RGBColor(0x00, 0x3A, 0x70)
BLUE_LIGHT = RGBColor(0xE3, 0xEF, 0xFA)
SKY        = RGBColor(0x4A, 0x9D, 0xE0)
ACCENT     = RGBColor(0xF5, 0x9E, 0x0B)   # オレンジ（アクセント）
ACCENT_LT  = RGBColor(0xFD, 0xEC, 0xC8)
GREEN      = RGBColor(0x2E, 0xA0, 0x6B)
GREEN_LT   = RGBColor(0xDD, 0xF1, 0xE7)
RED        = RGBColor(0xD9, 0x4B, 0x4B)
RED_LT     = RGBColor(0xFA, 0xE3, 0xE3)
PURPLE     = RGBColor(0x7C, 0x5C, 0xD6)
PURPLE_LT  = RGBColor(0xEA, 0xE4, 0xFA)
TEAL       = RGBColor(0x16, 0x9B, 0xA0)
TEAL_LT    = RGBColor(0xDB, 0xF1, 0xF1)
INK        = RGBColor(0x1F, 0x2A, 0x37)   # 本文の濃色
GRAY       = RGBColor(0x5B, 0x66, 0x72)
GRAY_LT    = RGBColor(0x8A, 0x93, 0x9E)
LINE       = RGBColor(0xD7, 0xDE, 0xE6)
PAPER      = RGBColor(0xF6, 0xF8, 0xFB)
WHITE      = RGBColor(0xFF, 0xFF, 0xFF)
CARD       = RGBColor(0xFF, 0xFF, 0xFF)

FONT = "Noto Sans JP"    # 日本語フォント（プロジェクト標準に統一）
FONT_NUM = "Arial"

EMU_IN = 914400
SW = 13.333
SH = 7.5

prs = Presentation()
prs.slide_width  = Inches(SW)
prs.slide_height = Inches(SH)
BLANK = prs.slide_layouts[6]


# ------------------------------------------------------------------
# 低レベルヘルパー
# ------------------------------------------------------------------
def slide():
    return prs.slides.add_slide(BLANK)


def _set_fill(shape, color):
    if color is None:
        shape.fill.background()
    else:
        shape.fill.solid()
        shape.fill.fore_color.rgb = color


def _set_line(shape, color, width=None):
    if color is None:
        shape.line.fill.background()
    else:
        shape.line.color.rgb = color
        if width is not None:
            shape.line.width = Pt(width)


def rect(s, x, y, w, h, fill=WHITE, line=None, lw=1.0, shadow=False, round_=False):
    shp_type = MSO_SHAPE.ROUNDED_RECTANGLE if round_ else MSO_SHAPE.RECTANGLE
    sp = s.shapes.add_shape(shp_type, Inches(x), Inches(y), Inches(w), Inches(h))
    _set_fill(sp, fill)
    _set_line(sp, line, lw)
    sp.shadow.inherit = False
    if shadow:
        _add_shadow(sp)
    if round_:
        try:
            sp.adjustments[0] = 0.08
        except Exception:
            pass
    return sp


def oval(s, x, y, w, h, fill=WHITE, line=None, lw=1.0, shadow=False):
    sp = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(x), Inches(y), Inches(w), Inches(h))
    _set_fill(sp, fill)
    _set_line(sp, line, lw)
    sp.shadow.inherit = False
    if shadow:
        _add_shadow(sp)
    return sp


def shape(s, kind, x, y, w, h, fill=WHITE, line=None, lw=1.0, shadow=False, adj=None):
    sp = s.shapes.add_shape(kind, Inches(x), Inches(y), Inches(w), Inches(h))
    _set_fill(sp, fill)
    _set_line(sp, line, lw)
    sp.shadow.inherit = False
    if shadow:
        _add_shadow(sp)
    if adj is not None:
        try:
            for i, v in enumerate(adj):
                sp.adjustments[i] = v
        except Exception:
            pass
    return sp


def _add_shadow(sp):
    spPr = sp.fill._xPr  # element with spPr
    el = sp._element.spPr
    # remove existing
    for tag in ('a:effectLst',):
        for e in el.findall(qn(tag)):
            el.remove(e)
    effLst = el.makeelement(qn('a:effectLst'), {})
    outer = el.makeelement(qn('a:outerShdw'), {
        'blurRad': '90000', 'dist': '38100', 'dir': '5400000', 'rotWithShape': '0'
    })
    clr = el.makeelement(qn('a:srgbClr'), {'val': '1F2A37'})
    alpha = el.makeelement(qn('a:alpha'), {'val': '24000'})
    clr.append(alpha)
    outer.append(clr)
    effLst.append(outer)
    el.append(effLst)


def line(s, x1, y1, x2, y2, color=LINE, width=1.5, dash=None):
    cn = s.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    cn.line.color.rgb = color
    cn.line.width = Pt(width)
    cn.shadow.inherit = False
    if dash:
        ln = cn.line._get_or_add_ln()
        d = ln.makeelement(qn('a:prstDash'), {'val': dash})
        ln.append(d)
    return cn


def arrow(s, x, y, w, h, fill=GMO_BLUE, line_c=None, direction="right"):
    kind = {
        "right": MSO_SHAPE.RIGHT_ARROW,
        "down": MSO_SHAPE.DOWN_ARROW,
        "left": MSO_SHAPE.LEFT_ARROW,
        "lr": MSO_SHAPE.LEFT_RIGHT_ARROW,
    }[direction]
    sp = s.shapes.add_shape(kind, Inches(x), Inches(y), Inches(w), Inches(h))
    _set_fill(sp, fill)
    _set_line(sp, line_c, 1)
    sp.shadow.inherit = False
    return sp


def text(s, x, y, w, h, runs, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP,
         wrap=True, line_spacing=1.0, space_after=2):
    """runs: list of (string, size, color, bold, [font]) OR a single string tuple list per paragraph.
       Supports multi-paragraph via list of lists."""
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = wrap
    tf.vertical_anchor = anchor
    tf.auto_size = MSO_AUTO_SIZE.NONE
    for m in ('left', 'right', 'top', 'bottom'):
        setattr(tf, 'margin_' + m, 0)

    # normalize: runs may be list of paragraphs (each paragraph = list of run-tuples)
    if runs and isinstance(runs[0], tuple):
        paragraphs = [runs]
    else:
        paragraphs = runs

    first = True
    for para in paragraphs:
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.alignment = align
        p.line_spacing = line_spacing
        p.space_after = Pt(space_after)
        p.space_before = Pt(0)
        for rt in para:
            txt, size, color = rt[0], rt[1], rt[2]
            bold = rt[3] if len(rt) > 3 else False
            fname = rt[4] if len(rt) > 4 else FONT
            r = p.add_run()
            r.text = txt
            r.font.size = Pt(size)
            r.font.bold = bold
            r.font.color.rgb = color
            r.font.name = fname
            # east asian font
            rPr = r._r.get_or_add_rPr()
            ea = rPr.makeelement(qn('a:ea'), {'typeface': fname})
            rPr.append(ea)
    return tb


def centered_label(sp, txt, size, color, bold=True, font=FONT):
    tf = sp.text_frame
    tf.word_wrap = True
    for m in ('left', 'right', 'top', 'bottom'):
        setattr(tf, 'margin_' + m, 0)
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    r = p.add_run()
    r.text = txt
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.color.rgb = color
    r.font.name = font
    rPr = r._r.get_or_add_rPr()
    ea = rPr.makeelement(qn('a:ea'), {'typeface': font})
    rPr.append(ea)
    return sp


def bg(s, color=PAPER):
    rect(s, -0.1, -0.1, SW + 0.2, SH + 0.2, fill=color, line=None)


def page_header(s, kicker, title, color=GMO_BLUE, num=None):
    """共通の見出し（左にアクセントバー）"""
    rect(s, 0.0, 0.62, 0.16, 0.62, fill=color)
    text(s, 0.62, 0.5, 11.5, 0.35, [(kicker, 12, color, True)])
    text(s, 0.6, 0.78, 12.0, 0.7, [(title, 27, INK, True)])
    line(s, 0.62, 1.5, SW - 0.62, 1.5, color=LINE, width=1.2)
    if num is not None:
        text(s, SW - 1.2, 0.52, 0.8, 0.3, [(f"{num:02d}", 12, GRAY_LT, True, FONT_NUM)],
             align=PP_ALIGN.RIGHT)


def footer(s, n):
    text(s, 0.62, SH - 0.42, 6, 0.3, [("GMO ONAiR", 9, GRAY_LT, True)])
    text(s, SW - 2.0, SH - 0.42, 1.4, 0.3,
         [(f"{n:02d}", 9, GRAY_LT, True, FONT_NUM)], align=PP_ALIGN.RIGHT)


# ------------------------------------------------------------------
# アイコン群（フラットなベクターイラスト）
#   各 icon_* は (slide, cx, cy, size, color) を受け取り中心(cx,cy)に描く
# ------------------------------------------------------------------
def icon_chart(s, cx, cy, sz, c):
    """案件管理: 棒グラフ + 上昇矢印"""
    base = cy + sz * 0.34
    bw = sz * 0.16
    heights = [0.30, 0.46, 0.62, 0.40]
    xs = [-0.36, -0.13, 0.10, 0.33]
    for x, hh in zip(xs, heights):
        rect(s, cx + x * sz - bw / 2, base - hh * sz, bw, hh * sz, fill=c, round_=False)
    # 上昇トレンド矢印
    shape(s, MSO_SHAPE.UP_ARROW, cx + 0.18 * sz, cy - 0.42 * sz, sz * 0.24, sz * 0.42,
          fill=ACCENT, line=None)


def icon_script(s, cx, cy, sz, c):
    """Qシート: 台本"""
    rect(s, cx - 0.30 * sz, cy - 0.40 * sz, 0.60 * sz, 0.80 * sz, fill=WHITE, line=c, lw=2.2, round_=True)
    for i, yy in enumerate([-0.22, -0.06, 0.10, 0.26]):
        w = 0.42 if i % 2 == 0 else 0.30
        rect(s, cx - 0.20 * sz, cy + yy * sz, w * sz, 0.05 * sz, fill=c)
    oval(s, cx - 0.235 * sz, cy - 0.235 * sz, 0.07 * sz, 0.07 * sz, fill=ACCENT)


def icon_gear(s, cx, cy, sz, c):
    """機材管理: 歯車"""
    shape(s, MSO_SHAPE.GEAR_9, cx - 0.42 * sz, cy - 0.42 * sz, 0.84 * sz, 0.84 * sz, fill=c, line=None)
    oval(s, cx - 0.14 * sz, cy - 0.14 * sz, 0.28 * sz, 0.28 * sz, fill=WHITE)


def icon_camera(s, cx, cy, sz, c):
    """技術資料: カメラ"""
    rect(s, cx - 0.36 * sz, cy - 0.20 * sz, 0.72 * sz, 0.46 * sz, fill=c, round_=True)
    rect(s, cx - 0.10 * sz, cy - 0.30 * sz, 0.22 * sz, 0.12 * sz, fill=c, round_=True)
    oval(s, cx - 0.15 * sz, cy - 0.10 * sz, 0.30 * sz, 0.30 * sz, fill=WHITE)
    oval(s, cx - 0.08 * sz, cy - 0.03 * sz, 0.16 * sz, 0.16 * sz, fill=c)


def icon_timer(s, cx, cy, sz, c):
    """ライブ運用: ストップウォッチ"""
    oval(s, cx - 0.34 * sz, cy - 0.30 * sz, 0.68 * sz, 0.68 * sz, fill=WHITE, line=c, lw=3)
    rect(s, cx - 0.08 * sz, cy - 0.46 * sz, 0.16 * sz, 0.10 * sz, fill=c, round_=True)
    # 針
    line(s, cx, cy + 0.04 * sz, cx, cy - 0.14 * sz, color=c, width=2.6)
    line(s, cx, cy + 0.04 * sz, cx + 0.13 * sz, cy + 0.04 * sz, color=ACCENT, width=2.6)
    oval(s, cx - 0.04 * sz, cy, 0.08 * sz, 0.08 * sz, fill=c)


def icon_tv(s, cx, cy, sz, c):
    """リアルタイムCG: 放送モニタ + スパーク"""
    rect(s, cx - 0.40 * sz, cy - 0.30 * sz, 0.80 * sz, 0.52 * sz, fill=c, round_=True)
    rect(s, cx - 0.32 * sz, cy - 0.22 * sz, 0.64 * sz, 0.36 * sz, fill=WHITE, round_=True)
    rect(s, cx - 0.12 * sz, cy + 0.22 * sz, 0.24 * sz, 0.07 * sz, fill=c)
    # 電波
    shape(s, MSO_SHAPE.LIGHTNING_BOLT, cx - 0.10 * sz, cy - 0.18 * sz, 0.20 * sz, 0.28 * sz, fill=ACCENT, line=None)


def icon_link(s, cx, cy, sz, c):
    shape(s, MSO_SHAPE.OVAL, cx - 0.30 * sz, cy - 0.12 * sz, 0.30 * sz, 0.24 * sz, fill=None, line=c, lw=4)
    shape(s, MSO_SHAPE.OVAL, cx, cy - 0.12 * sz, 0.30 * sz, 0.24 * sz, fill=None, line=c, lw=4)


def icon_chat(s, cx, cy, sz, c):
    shape(s, MSO_SHAPE.ROUNDED_RECTANGULAR_CALLOUT, cx - 0.40 * sz, cy - 0.34 * sz,
          0.80 * sz, 0.60 * sz, fill=c, line=None)
    for x in (-0.16, 0, 0.16):
        oval(s, cx + x * sz - 0.04 * sz, cy - 0.08 * sz, 0.08 * sz, 0.08 * sz, fill=WHITE)


def icon_rocket(s, cx, cy, sz, c):
    # ボディ（涙形を上向きに）
    body = shape(s, MSO_SHAPE.TEAR, cx - 0.20 * sz, cy - 0.40 * sz, 0.40 * sz, 0.62 * sz, fill=c, line=None)
    body.rotation = 135
    oval(s, cx - 0.09 * sz, cy - 0.18 * sz, 0.18 * sz, 0.18 * sz, fill=WHITE)
    # フィン
    shape(s, MSO_SHAPE.RIGHT_TRIANGLE, cx - 0.30 * sz, cy + 0.06 * sz, 0.16 * sz, 0.18 * sz, fill=ACCENT, line=None)
    fin = shape(s, MSO_SHAPE.RIGHT_TRIANGLE, cx + 0.14 * sz, cy + 0.06 * sz, 0.16 * sz, 0.18 * sz, fill=ACCENT, line=None)
    fin.rotation = 90
    # 噴射
    shape(s, MSO_SHAPE.TEAR, cx - 0.07 * sz, cy + 0.22 * sz, 0.14 * sz, 0.22 * sz, fill=ACCENT, line=None).rotation = 180


def icon_layers(s, cx, cy, sz, c):
    for i, off in enumerate([0.18, 0.02, -0.14]):
        shade = [c, SKY, BLUE_LIGHT][i]
        shape(s, MSO_SHAPE.PARALLELOGRAM, cx - 0.40 * sz, cy + off * sz, 0.80 * sz, 0.22 * sz,
              fill=shade, line=WHITE, lw=1.5, adj=[0.3])


def icon_shield(s, cx, cy, sz, c):
    shape(s, MSO_SHAPE.PENTAGON, cx - 0.34 * sz, cy - 0.40 * sz, 0.68 * sz, 0.80 * sz, fill=c, line=None)
    shape(s, MSO_SHAPE.PENTAGON, cx - 0.34 * sz, cy - 0.40 * sz, 0.68 * sz, 0.80 * sz, fill=c, line=None)
    text_check = shape(s, MSO_SHAPE.OVAL, cx - 0.14 * sz, cy - 0.16 * sz, 0.28 * sz, 0.28 * sz, fill=WHITE)


# central hub icon used in connectivity slide
def chip(s, x, y, w, h, label, fill, txt_color=WHITE, size=12, line_c=None, shadow=True):
    sp = rect(s, x, y, w, h, fill=fill, line=line_c, lw=1.2, round_=True, shadow=shadow)
    centered_label(sp, label, size, txt_color)
    return sp


# ==================================================================
# 実アプリ画面の高精細モックアップ（実レイアウトの忠実再現）
#   browser_frame() でブラウザ窓を描き、各 screen_* が中身を描画する
# ==================================================================
def browser_frame(s, x, y, w, h, url, accent=GMO_BLUE):
    """ブラウザ風ウィンドウ。中身領域 (cx,cy,cw,ch) を返す"""
    rect(s, x, y, w, h, fill=WHITE, line=LINE, lw=1, round_=True, shadow=True)
    bar_h = 0.34
    bar = rect(s, x, y, w, bar_h, fill=RGBColor(0xEC, 0xF0, 0xF5), line=None, round_=True)
    # 角丸の下側を四角で埋める
    rect(s, x, y + bar_h - 0.1, w, 0.12, fill=RGBColor(0xEC, 0xF0, 0xF5), line=None)
    for i, cc in enumerate([RGBColor(0xF2,0x6D,0x6D), RGBColor(0xF6,0xC1,0x4B), RGBColor(0x66,0xC6,0x6E)]):
        oval(s, x + 0.14 + i*0.18, y + bar_h/2 - 0.055, 0.11, 0.11, fill=cc)
    ub = rect(s, x + 0.78, y + 0.07, w - 1.0, bar_h - 0.14, fill=WHITE, line=LINE, lw=0.75, round_=True)
    text(s, x + 0.92, y + 0.075, w - 1.2, bar_h - 0.14, [("🔒  " + url, 8.5, GRAY, False, FONT_NUM)],
         anchor=MSO_ANCHOR.MIDDLE)
    return (x, y + bar_h, w, h - bar_h)


def _sidebar(s, cx, cy, cw, ch, accent, items, active=0):
    sb_w = cw * 0.205
    rect(s, cx, cy, sb_w, ch, fill=RGBColor(0xF7,0xF9,0xFC), line=None)
    line(s, cx + sb_w, cy, cx + sb_w, cy + ch, color=LINE, width=0.75)
    # ロゴ
    oval(s, cx + 0.14, cy + 0.14, 0.2, 0.2, fill=accent)
    text(s, cx + 0.4, cy + 0.13, sb_w - 0.3, 0.22, [("ONAiR", 8, INK, True, FONT_NUM)])
    yy = cy + 0.55
    for i, it in enumerate(items):
        if i == active:
            rect(s, cx + 0.08, yy - 0.03, sb_w - 0.16, 0.26, fill=accent, line=None, round_=True)
            col = WHITE
        else:
            col = GRAY
        oval(s, cx + 0.16, yy + 0.05, 0.1, 0.1, fill=col)
        text(s, cx + 0.34, yy, sb_w - 0.34, 0.24, [(it, 7.5, col, i == active)], anchor=MSO_ANCHOR.MIDDLE)
        yy += 0.32
    return sb_w


def screen_projects(s, x, y, w, h):
    """案件管理ダッシュボード: KPIカード + 棒グラフ + ドーナツ"""
    cx, cy, cw, ch = x, y, w, h
    sb = _sidebar(s, cx, cy, cw, ch, GMO_BLUE,
                  ["ダッシュボード", "案件一覧", "売上", "仕入", "損益", "請求書"], 0)
    px = cx + sb + 0.18
    pw = cw - sb - 0.34
    text(s, px, cy + 0.14, pw, 0.3, [("案件ダッシュボード", 12, INK, True)])
    text(s, px, cy + 0.44, pw, 0.2, [("2026年5月 ・ 最終更新 5分前", 7, GRAY_LT, False)])
    # KPIカード4枚
    kpis = [("進行中案件", "37", "件", GMO_BLUE, BLUE_LIGHT, "▲ 5"),
            ("今月売上", "¥4,820", "万", GREEN, GREEN_LT, "▲ 12%"),
            ("粗利率", "31.4", "%", ACCENT, ACCENT_LT, "▲ 2.1"),
            ("受注ヨミ", "¥1.2", "億", PURPLE, PURPLE_LT, "▲ 8件")]
    kw = (pw - 0.18*3) / 4
    ky = cy + 0.72
    for i, (t, v, u, c, lc, tr) in enumerate(kpis):
        kx = px + i*(kw + 0.18)
        rect(s, kx, ky, kw, 0.82, fill=WHITE, line=LINE, lw=0.75, round_=True)
        rect(s, kx, ky, kw, 0.06, fill=c)
        text(s, kx + 0.08, ky + 0.1, kw - 0.16, 0.18, [(t, 6.5, GRAY, True)])
        text(s, kx + 0.08, ky + 0.26, kw - 0.16, 0.4,
             [[(v, 17, c, True, FONT_NUM), (u, 7.5, INK, True)]])
        text(s, kx + 0.08, ky + 0.62, kw - 0.16, 0.16, [(tr, 6.5, GREEN, True)])
    # 棒グラフ
    gy = ky + 0.98
    gh = ch - (gy - cy) - 0.2
    gw = pw * 0.6
    rect(s, px, gy, gw, gh, fill=WHITE, line=LINE, lw=0.75, round_=True)
    text(s, px + 0.12, gy + 0.08, gw - 0.2, 0.2, [("月次売上推移", 7.5, INK, True)])
    n_bars = 6
    bw = (gw - 0.5) / n_bars
    base = gy + gh - 0.28
    import random
    heights = [0.42, 0.55, 0.48, 0.7, 0.62, 0.85]
    for i, hh in enumerate(heights):
        bx = px + 0.28 + i*bw
        bh = hh * (gh - 0.65)
        c = GMO_BLUE if i < n_bars-1 else ACCENT
        rect(s, bx, base - bh, bw*0.55, bh, fill=c)
    # ドーナツ（円弧近似: 重ね円）
    dx = px + gw + 0.18
    dw = pw - gw - 0.18
    rect(s, dx, gy, dw, gh, fill=WHITE, line=LINE, lw=0.75, round_=True)
    text(s, dx + 0.12, gy + 0.08, dw - 0.2, 0.2, [("案件ステージ構成", 7.5, INK, True)])
    dcx = dx + dw/2; dcy = gy + gh/2 + 0.08; dr = min(dw, gh) * 0.3
    shape(s, MSO_SHAPE.PIE, dcx - dr, dcy - dr, dr*2, dr*2, fill=GMO_BLUE, line=WHITE, lw=1, adj=[180, 30])
    shape(s, MSO_SHAPE.PIE, dcx - dr, dcy - dr, dr*2, dr*2, fill=SKY, line=WHITE, lw=1, adj=[30, 150])
    shape(s, MSO_SHAPE.PIE, dcx - dr, dcy - dr, dr*2, dr*2, fill=ACCENT, line=WHITE, lw=1, adj=[150, 180])
    oval(s, dcx - dr*0.5, dcy - dr*0.5, dr, dr, fill=WHITE)


def screen_qsheet(s, x, y, w, h):
    """Qシート ランダウン/キューテーブル"""
    cx, cy, cw, ch = x, y, w, h
    sb = _sidebar(s, cx, cy, cw, ch, TEAL, ["エディタ", "ランダウン", "OnAir", "プロンプター"], 1)
    px = cx + sb + 0.18; pw = cw - sb - 0.34
    text(s, px, cy + 0.14, pw, 0.3, [("ランダウン ｜ GLS-A012 収録台本", 11, INK, True)])
    # ON AIR バッジ
    oa = rect(s, px + pw - 1.0, cy + 0.12, 0.95, 0.3, fill=RED, round_=True)
    centered_label(oa, "● ON AIR", 8, WHITE)
    # ヘッダ行
    cols = [("No", 0.5), ("時間", 0.85), ("内容", 2.6), ("出演", 1.0), ("音声", 0.9)]
    hx = px; hy = cy + 0.56
    total = sum(c[1] for c in cols)
    scale = pw / total
    rect(s, px, hy, pw, 0.26, fill=TEAL_LT, line=None)
    cxx = px
    for nm, ww in cols:
        text(s, cxx + 0.05, hy + 0.02, ww*scale, 0.22, [(nm, 7.5, TEAL, True)], anchor=MSO_ANCHOR.MIDDLE)
        cxx += ww*scale
    rows = [("1", "00:30", "オープニング映像", "—", "BGM A", False),
            ("2", "02:00", "MC あいさつ・導入トーク", "田中 / 佐藤", "Mic 1,2", True),
            ("3", "05:30", "VTR① 事例紹介", "—", "VTR", False),
            ("4", "03:00", "ゲストトーク", "鈴木", "Mic 1,3", False),
            ("5", "01:30", "エンディング", "全員", "BGM B", False)]
    ry = hy + 0.26
    rh = (ch - (ry - cy) - 0.15) / len(rows)
    for r in rows:
        no, tm, content, cast, audio, live = r
        bgc = RGBColor(0xFF,0xF4,0xF4) if live else WHITE
        rect(s, px, ry, pw, rh, fill=bgc, line=LINE, lw=0.5)
        if live:
            rect(s, px, ry, 0.06, rh, fill=RED)
        cxx = px
        vals = [no, tm, content, cast, audio]
        for (nm, ww), val in zip(cols, vals):
            col = INK if nm != "時間" else TEAL
            fnt = FONT_NUM if nm in ("No", "時間") else FONT
            text(s, cxx + 0.07, ry, ww*scale - 0.1, rh, [(val, 7.5, col, nm in ("No",), fnt)],
                 anchor=MSO_ANCHOR.MIDDLE)
            cxx += ww*scale
        ry += rh


def screen_equipment(s, x, y, w, h):
    """機材管理 一覧テーブル"""
    cx, cy, cw, ch = x, y, w, h
    sb = _sidebar(s, cx, cy, cw, ch, ACCENT, ["ダッシュボード", "機材一覧", "ケーブル", "貸出", "ラック図"], 1)
    px = cx + sb + 0.18; pw = cw - sb - 0.34
    text(s, px, cy + 0.14, pw, 0.3, [("機材一覧", 12, INK, True)])
    # 検索 + ボタン
    rect(s, px, cy + 0.5, pw*0.45, 0.26, fill=WHITE, line=LINE, lw=0.75, round_=True)
    text(s, px + 0.12, cy + 0.5, pw*0.45, 0.26, [("🔍 機材名・型番で検索", 7, GRAY_LT, False)], anchor=MSO_ANCHOR.MIDDLE)
    b1 = rect(s, px + pw - 1.7, cy + 0.5, 0.8, 0.26, fill=ACCENT, round_=True); centered_label(b1, "＋ 登録", 7.5, WHITE)
    b2 = rect(s, px + pw - 0.85, cy + 0.5, 0.85, 0.26, fill=WHITE, line=ACCENT, lw=1, round_=True); centered_label(b2, "Excel", 7.5, ACCENT)
    cols = [("型番", 1.5), ("機材名", 2.2), ("数", 0.5), ("設置場所", 1.3), ("状態", 0.9)]
    total = sum(c[1] for c in cols); scale = pw/total
    hy = cy + 0.88
    rect(s, px, hy, pw, 0.26, fill=ACCENT_LT, line=None)
    cxx = px
    for nm, ww in cols:
        text(s, cxx+0.06, hy+0.02, ww*scale, 0.22, [(nm, 7, RGBColor(0xB0,0x6E,0x00), True)], anchor=MSO_ANCHOR.MIDDLE)
        cxx += ww*scale
    rows = [("PMW-Z750", "業務用4Kカメラ", "4", "Aスタジオ", "稼働", GREEN),
            ("OCC30N-ARIB", "光カメラケーブル 30m", "8", "倉庫B-2", "在庫", GMO_BLUE),
            ("UA-MX700", "デジタル卓 32ch", "1", "副調整室", "稼働", GREEN),
            ("PXW-FX9", "シネマカメラ", "2", "貸出中", "貸出", ACCENT),
            ("HDC-3500", "システムカメラ", "6", "Aスタジオ", "稼働", GREEN)]
    ry = hy + 0.26
    rh = (ch - (ry - cy) - 0.15) / len(rows)
    for typ, nm, qty, loc, st, stc in rows:
        rect(s, px, ry, pw, rh, fill=WHITE, line=LINE, lw=0.5)
        cxx = px
        for (cn, ww), val in zip(cols, [typ, nm, qty, loc, st]):
            if cn == "状態":
                badge = rect(s, cxx+0.06, ry+rh/2-0.1, 0.6, 0.2, fill=stc, round_=True); centered_label(badge, val, 6.5, WHITE)
            else:
                text(s, cxx+0.07, ry, ww*scale-0.1, rh, [(val, 7, INK, cn=="型番", FONT_NUM if cn in ("型番","数") else FONT)],
                     anchor=MSO_ANCHOR.MIDDLE)
            cxx += ww*scale
        ry += rh


def screen_techsheet(s, x, y, w, h):
    """技術資料 仕様シート（タブ + フォーム）"""
    cx, cy, cw, ch = x, y, w, h
    sb = _sidebar(s, cx, cy, cw, ch, PURPLE, ["資料一覧", "編集", "印刷プレビュー"], 1)
    px = cx + sb + 0.18; pw = cw - sb - 0.34
    text(s, px, cy + 0.14, pw, 0.3, [("技術仕様書 ｜ GLS-A012", 11, INK, True)])
    tabs = ["ヘッダー", "カメラ", "映像", "音声", "通信"]
    tx = px
    for i, t in enumerate(tabs):
        tw = 0.92
        active = (i == 1)
        tb = rect(s, tx, cy + 0.5, tw, 0.28, fill=PURPLE if active else WHITE, line=PURPLE if not active else None, lw=0.75, round_=True)
        centered_label(tb, t, 7.5, WHITE if active else PURPLE)
        tx += tw + 0.06
    # フォーム
    fy = cy + 0.95
    fields = [("カメラ台数", "8 台"), ("カメラ機種", "HDC-3500 / PXW-FX9"),
              ("レンズ構成", "ズーム ×4, 単焦点 ×2"), ("出力フォーマット", "1080/59.94p"),
              ("ケーブル長", "30m / 50m 光"), ("特記事項", "中継車との連携あり")]
    fw = (pw - 0.2)/2
    fh = (ch - (fy - cy) - 0.18)/3
    for i, (lab, val) in enumerate(fields):
        col = i % 2; row = i // 2
        fx = px + col*(fw + 0.2); fyy = fy + row*fh
        text(s, fx, fyy, fw, 0.18, [(lab, 7, PURPLE, True)])
        box = rect(s, fx, fyy + 0.18, fw, fh - 0.32, fill=RGBColor(0xFB,0xFA,0xFE), line=LINE, lw=0.75, round_=True)
        text(s, fx + 0.1, fyy + 0.18, fw - 0.2, fh - 0.32, [(val, 7.5, INK, False)], anchor=MSO_ANCHOR.MIDDLE)


def screen_live(s, x, y, w, h):
    """ライブ運用 タイマー + 視聴者数（ダーク画面）"""
    cx, cy, cw, ch = x, y, w, h
    rect(s, cx, cy, cw, ch, fill=RGBColor(0x10,0x16,0x20), line=None)
    text(s, cx + 0.2, cy + 0.16, cw - 0.4, 0.24, [("本番進行 ｜ 年間表彰式 2026", 9.5, RGBColor(0xCE,0xD7,0xE2), True)])
    badge = rect(s, cx + cw - 1.1, cy + 0.14, 0.95, 0.28, fill=GREEN, round_=True); centered_label(badge, "● LIVE", 8, WHITE)
    # 大タイマー（枠幅に比例）
    tsize = min(50, cw * 7.8)
    text(s, cx + 0.2, cy + 0.55, cw*0.62, 1.2, [("01:24:36", tsize, WHITE, True, FONT_NUM)], anchor=MSO_ANCHOR.MIDDLE)
    text(s, cx + 0.25, cy + ch - 0.55, cw*0.6, 0.3, [("経過時間 ・ 次の転換まで 03:12", 8.5, RGBColor(0x9F,0xAD,0xBD), True)])
    # 視聴者数パネル
    panels = [("視聴者数", "12,480", GREEN), ("Zoom", "3,210", SKY), ("YouTube", "8,940", RED), ("Teams", "330", PURPLE)]
    pw_ = (cw*0.34) ; px2 = cx + cw - pw_ - 0.2
    ph = (ch - 0.6)/2;
    for i, (t, v, c) in enumerate(panels):
        col = i % 2; row = i // 2
        bx = px2 + col*(pw_/2); by = cy + 0.5 + row*(ph + 0.1)
        rect(s, bx + 0.05, by, pw_/2 - 0.1, ph - 0.1, fill=RGBColor(0x1B,0x24,0x32), line=RGBColor(0x2C,0x39,0x4C), lw=0.75, round_=True)
        text(s, bx + 0.14, by + 0.06, pw_/2 - 0.2, 0.18, [(t, 6.5, RGBColor(0x9F,0xAD,0xBD), True)])
        text(s, bx + 0.14, by + 0.22, pw_/2 - 0.2, 0.4, [(v, min(15, cw*2.3), c, True, FONT_NUM)], anchor=MSO_ANCHOR.MIDDLE)


def screen_cg(s, x, y, w, h):
    """リアルタイムCG 送出出力（黒背景 + 下位置テロップ + ランキング片鱗）"""
    cx, cy, cw, ch = x, y, w, h
    rect(s, cx, cy, cw, ch, fill=RGBColor(0x0A,0x0C,0x12), line=None)
    # うっすらスポット（枠内に収める）
    oval(s, cx + cw*0.27, cy + 0.06, cw*0.46, ch*0.62, fill=RGBColor(0x16,0x1A,0x26))
    # 上部: NO.1 発表風カード
    text(s, cx, cy + 0.35, cw, 0.3, [("— THE WINNER —", 9, RGBColor(0xE7,0xC9,0x6B), True, FONT_NUM)], align=PP_ALIGN.CENTER)
    card = rect(s, cx + cw/2 - 1.0, cy + 0.7, 2.0, 1.05, fill=RGBColor(0x14,0x18,0x24), line=RGBColor(0xC9,0xA9,0x61), lw=1.5, round_=True)
    oval(s, cx + cw/2 - 0.32, cy + 0.82, 0.6, 0.6, fill=RGBColor(0x2A,0x31,0x45))
    text(s, cx + cw/2 - 0.9, cy + 1.42, 1.8, 0.25, [("グローバルスタジオ賞", 8, WHITE, True)], align=PP_ALIGN.CENTER)
    # 下位置テロップ（lower-third）
    lt_y = cy + ch - 0.78
    rect(s, cx + 0.25, lt_y, cw - 0.5, 0.6, fill=RGBColor(0x10,0x14,0x1E), line=None)
    rect(s, cx + 0.25, lt_y, 0.07, 0.6, fill=RGBColor(0xC9,0xA9,0x61))
    oval(s, cx + 0.4, lt_y + 0.08, 0.44, 0.44, fill=RGBColor(0x2A,0x31,0x45))
    text(s, cx + 0.95, lt_y + 0.08, cw - 1.3, 0.26, [("田中 太郎", 11, WHITE, True)])
    text(s, cx + 0.95, lt_y + 0.34, cw - 1.3, 0.2, [[("GMOグローバルスタジオ", 7, RGBColor(0xC9,0xA9,0x61), True), ("  ｜  制作部 部長", 7, RGBColor(0xAD,0xB7,0xC4), False)]])
    # 投票バーちら見せ（右上）
    for i, (vw, c) in enumerate([(0.9, RGBColor(0xE7,0xC9,0x6B)), (0.6, SKY), (0.4, RGBColor(0xC4,0x5A,0x5A))]):
        by = cy + 0.55 + i*0.2
        rect(s, cx + cw - 1.7, by, 1.4*vw, 0.13, fill=c)


# 画面モックアップを APPS の順に対応させる
SCREENS = [screen_projects, screen_qsheet, screen_equipment, screen_techsheet, screen_live, screen_cg]
# 実スクリーンショットのファイル名（docs/presentation/screens/ に置けば自動で差し替わる）
SCREEN_KEYS = ["projects", "qsheet", "equipment", "techsheet", "live", "cg"]
import os as _os
_SCREENS_DIR = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "screens")


def _find_shot(key):
    for ext in (".png", ".jpg", ".jpeg", ".webp"):
        p = _os.path.join(_SCREENS_DIR, key + ext)
        if _os.path.exists(p):
            return p
    return None


def place_screen(s, idx, cx, cy, cw, ch):
    """実スクショがあれば cover-fit で配置、無ければベクターモックアップを描画"""
    shot = _find_shot(SCREEN_KEYS[idx])
    if not shot:
        SCREENS[idx](s, cx, cy, cw, ch)
        return False
    try:
        from PIL import Image
        iw, ih = Image.open(shot).size
    except Exception:
        iw, ih = (1600, 1000)
    target = cw / ch
    src = iw / ih
    # cover: フレームを埋めるよう、はみ出し分を crop
    if src > target:
        # 画像が横長 → 左右をトリミング
        pic = s.shapes.add_picture(shot, Inches(cx), Inches(cy), height=Inches(ch))
        over = pic.width - Inches(cw)
        crop = (over / pic.width) / 2 if pic.width else 0
        pic.crop_left = crop; pic.crop_right = crop
        pic.left = Inches(cx); pic.width = Inches(cw)
    else:
        # 画像が縦長 → 上下をトリミング
        pic = s.shapes.add_picture(shot, Inches(cx), Inches(cy), width=Inches(cw))
        over = pic.height - Inches(ch)
        crop = (over / pic.height) / 2 if pic.height else 0
        pic.crop_top = crop; pic.crop_bottom = crop
        pic.top = Inches(cy); pic.height = Inches(ch)
    return True


SCREEN_URLS = [
    "gmo-onair.jp",
    "gmo-onair.jp/qsheet/rundown",
    "gmo-onair.jp/equipment",
    "gmo-onair.jp/techsheet",
    "gmo-onair.jp/live",
    "gmo-onair.jp/awards/output",
]


# ==================================================================
# アプリ定義（6ブロックアプリ）
# ==================================================================
APPS = [
    ("案件管理", "Project & Finance", icon_chart, GMO_BLUE, BLUE_LIGHT,
     "提案→受注→制作→請求に加え、タスク進行・予算・スタジオ予約まで一括管理",
     ["売上・仕入・損益・予算をリアルタイム集計", "カンバン/タスクリスト/ガントで進行管理", "スタジオ予約・GLS自動発番・請求書PDF"]),
    ("Qシート", "Rundown / OnAir", icon_script, TEAL, TEAL_LT,
     "進行台本（Qシート）の作成と本番のリアルタイム進行同期",
     ["台本・ランダウンを共同編集", "OnAir↔ランダウンを即時同期", "プロンプター・音声香盤に対応"]),
    ("機材管理", "Equipment", icon_gear, ACCENT, ACCENT_LT,
     "カメラ・ケーブル・コネクタまで機材台帳と貸出を一元管理",
     ["機材台帳・在庫・メンテ履歴", "QRスキャンで貸出/返却", "Excel入出力・ラック図"]),
    ("技術資料", "Tech Sheet", icon_camera, PURPLE, PURPLE_LT,
     "カメラ・映像・音声・通信の技術仕様書をデジタル化",
     ["案件ごとの技術シート作成", "A4印刷レイアウト対応", "機材データと連携"]),
    ("ライブ運用", "Live Ops", icon_timer, GREEN, GREEN_LT,
     "本番当日のオペレーション・進行・計時をサポート",
     ["番組進行・タイマー表示", "視聴者数のリアルタイム計測", "Zoom/Teams 参加者連携"]),
    ("リアルタイムCG", "Realtime CG", icon_tv, RED, RED_LT,
     "放送用CG（テロップ・ランキング・投票）をライブ送出",
     ["下位置CG / 表彰CG 演出", "アンケート・クイズの即時集計", "OBS向け透過HTML5出力"]),
]


# ==================================================================
# スライド 01 : 表紙
# ==================================================================
def s_cover(n):
    s = slide()
    bg(s, GMO_BLUE)
    # 背景の装飾円
    oval(s, 9.4, -2.2, 6.5, 6.5, fill=BLUE_DARK)
    oval(s, 10.8, 3.4, 4.6, 4.6, fill=SKY)
    oval(s, -1.6, 4.6, 4.2, 4.2, fill=BLUE_DARK)
    # ロゴ的バッジ
    badge = rect(s, 0.9, 1.5, 2.55, 0.62, fill=WHITE, round_=True, shadow=True)
    centered_label(badge, "GMO GLOBAL STUDIO", 12.5, GMO_BLUE)
    text(s, 0.86, 2.55, 11.5, 1.4,
         [[("GMO ONAiR", 60, WHITE, True)]])
    text(s, 0.9, 3.85, 11.0, 0.9,
         [[("制作のすべてをつなぐ、", 23, ACCENT_LT, True)],
          [("私たちの“会社OS”", 23, WHITE, True)]], line_spacing=1.1)
    line(s, 0.95, 5.35, 6.3, 5.35, color=SKY, width=2)
    text(s, 0.92, 5.5, 11.5, 1.2,
         [[("社長プレゼン資料", 15, WHITE, True)],
          [("このアプリでできること ／ 対話（バイブコーディング）での作り方", 12.5, BLUE_LIGHT, False)]],
         line_spacing=1.25)
    text(s, 0.92, SH - 0.6, 11.5, 0.3,
         [("v2.9.26  |  6つのブロックアプリを単一プラットフォームに統合", 10.5, BLUE_LIGHT, False)])
    return s


# ==================================================================
# スライド 02 : 一言でいうと
# ==================================================================
def s_oneliner(n):
    s = slide(); bg(s)
    page_header(s, "EXECUTIVE SUMMARY", "一言でいうと — 制作会社のための“会社OS”", num=n)
    # 中央メッセージ
    box = rect(s, 0.9, 1.95, 11.5, 1.5, fill=BLUE_LIGHT, line=None, round_=True)
    text(s, 1.3, 2.18, 10.8, 1.1,
         [[("バラバラだった ", 20, INK, True), ("見積・台本・機材・本番・CG ", 20, GMO_BLUE, True),
           ("を", 20, INK, True)],
          [("1つの画面・1つの番号でつなぐ", 24, GMO_BLUE, True),
           (" 統合プラットフォーム", 20, INK, True)]],
         line_spacing=1.2)
    # 3つの価値カード
    cards = [
        (icon_link, GMO_BLUE, BLUE_LIGHT, "ひとつにつながる", "GLS番号で全アプリのデータが自動連携"),
        (icon_layers, TEAL, TEAL_LT, "6つの専用アプリ", "案件・台本・機材・技術・本番・CGを網羅"),
        (icon_chat, ACCENT, ACCENT_LT, "対話で内製", "外注ゼロ・チャット指示でアプリを進化"),
    ]
    cw, gap, x0, y0, ch = 3.62, 0.32, 0.9, 3.85, 2.8
    for i, (ic, c, lc, t, d) in enumerate(cards):
        x = x0 + i * (cw + gap)
        card = rect(s, x, y0, cw, ch, fill=CARD, line=LINE, lw=1, round_=True, shadow=True)
        rect(s, x, y0, cw, 0.12, fill=c, round_=False)
        oval(s, x + cw/2 - 0.55, y0 + 0.35, 1.1, 1.1, fill=lc)
        ic(s, x + cw/2, y0 + 0.9, 1.0, c)
        text(s, x + 0.25, y0 + 1.65, cw - 0.5, 0.5, [(t, 16, INK, True)], align=PP_ALIGN.CENTER)
        text(s, x + 0.3, y0 + 2.12, cw - 0.6, 0.6, [(d, 11.5, GRAY, False)],
             align=PP_ALIGN.CENTER, line_spacing=1.1)
    footer(s, n)
    return s


# ==================================================================
# スライド 03 : Before / After（課題と解決）
# ==================================================================
def s_before_after(n):
    s = slide(); bg(s)
    page_header(s, "WHY", "課題：ツールが点在して情報が分断していた", num=n)
    # Before
    text(s, 0.9, 1.75, 5.4, 0.4, [("BEFORE", 14, RED, True)])
    bcard = rect(s, 0.9, 2.15, 5.4, 4.5, fill=RED_LT, line=None, round_=True)
    tools = ["Excel 見積", "紙の台本", "機材リスト", "別々の進行表", "手作業のCG", "メール連絡"]
    for i, t in enumerate(tools):
        col = i % 2; row = i // 2
        tx = 1.25 + col * 2.55; ty = 2.55 + row * 1.18
        tb = rect(s, tx, ty, 2.25, 0.92, fill=WHITE, line=LINE, round_=True, shadow=True)
        centered_label(tb, t, 12.5, INK)
    text(s, 1.1, 6.15, 5.0, 0.4, [("点在・二重入力・属人化・転記ミス", 12, RED, True)],
         align=PP_ALIGN.CENTER)
    # 矢印
    arrow(s, 6.45, 4.0, 0.85, 0.9, fill=GMO_BLUE, direction="right")
    # After
    text(s, 7.55, 1.75, 5.4, 0.4, [("AFTER", 14, GREEN, True)])
    acard = rect(s, 7.55, 2.15, 4.9, 4.5, fill=GREEN_LT, line=None, round_=True)
    hub = oval(s, 9.45, 3.55, 1.1, 1.1, fill=GMO_BLUE, shadow=True)
    centered_label(hub, "GMO\nONAiR", 12.5, WHITE)
    text(s, 7.85, 2.45, 4.3, 0.8,
         [[("ひとつの画面に統合", 17, GREEN, True)],
          [("入力は1回。データは自動でつながる", 11.5, INK, False)]], line_spacing=1.15, align=PP_ALIGN.CENTER)
    # surrounding mini chips
    around = [("案件", -1.9, -0.2), ("台本", -1.0, -1.5), ("機材", 1.0, -1.5),
              ("技術", 1.9, -0.2), ("本番", 1.0, 1.3), ("CG", -1.0, 1.3)]
    for lbl, dx, dy in around:
        chip(s, 10.0 + dx - 0.45, 4.1 + dy*0.55 - 0.22, 0.95, 0.45, lbl, WHITE, GMO_BLUE, 11, line_c=GMO_BLUE)
    text(s, 7.75, 6.15, 4.5, 0.4, [("入力1回 / 自動連携 / リアルタイム", 12, GREEN, True)],
         align=PP_ALIGN.CENTER)
    footer(s, n)
    return s


# ==================================================================
# スライド 04 : 全体像（6アプリ俯瞰）
# ==================================================================
def s_overview(n):
    s = slide(); bg(s)
    page_header(s, "WHAT", "全体像 — 6つの専用アプリ＋共通基盤", num=n)
    cols, rows = 3, 2
    cw, ch, gap_x, gap_y = 3.78, 2.18, 0.28, 0.3
    x0, y0 = 0.78, 1.78
    for i, (name, en, ic, c, lc, sub, feats) in enumerate(APPS):
        col = i % cols; row = i // cols
        x = x0 + col * (cw + gap_x); y = y0 + row * (ch + gap_y)
        card = rect(s, x, y, cw, ch, fill=CARD, line=LINE, lw=1, round_=True, shadow=True)
        rect(s, x, y, 0.14, ch, fill=c)
        oval(s, x + 0.32, y + 0.34, 0.95, 0.95, fill=lc)
        ic(s, x + 0.795, y + 0.815, 0.82, c)
        text(s, x + 1.42, y + 0.34, cw - 1.6, 0.5, [(name, 17, INK, True)])
        text(s, x + 1.44, y + 0.78, cw - 1.6, 0.35, [(en, 10.5, c, True, FONT_NUM)])
        text(s, x + 0.34, y + 1.38, cw - 0.6, 0.7, [(sub, 11, GRAY, False)], line_spacing=1.12)
    footer(s, n)
    return s


# ==================================================================
# スライド 05-10 : 各アプリ詳細
# ==================================================================
def s_app_detail(n, idx):
    name, en, ic, c, lc, sub, feats = APPS[idx]
    s = slide(); bg(s)
    page_header(s, f"APP {idx+1} / 6", f"{name}（{en}）", color=c, num=n)
    EFFECTS = [
        "見積から請求まで数字が一気通貫。損益が“今”わかる。",
        "本番中の進行変更も全員の画面に即反映。事故を防ぐ。",
        "“あの機材どこ？”が消える。貸出も返却もスマホで完結。",
        "技術仕様の作成・共有・印刷が紙からデジタルへ。",
        "進行・計時・視聴者数を1画面で。当日オペが軽くなる。",
        "専門ソフト級のCG演出を、社内オペレーターだけで送出。",
    ]
    # 左：アイコン + サブ + できること
    oval(s, 0.78, 1.78, 0.66, 0.66, fill=lc)
    ic(s, 1.11, 2.11, 0.6, c)
    text(s, 1.6, 1.8, 4.0, 0.6, [(sub, 12.5, INK, True)], anchor=MSO_ANCHOR.MIDDLE, line_spacing=1.15)
    text(s, 0.8, 2.62, 4.6, 0.4, [("できること", 14, c, True)])
    yy = 3.12
    for f in feats:
        chk = shape(s, MSO_SHAPE.OVAL, 0.85, yy + 0.04, 0.3, 0.3, fill=c, line=None)
        text(s, 0.88, yy + 0.0, 0.3, 0.3, [("✓", 11, WHITE, True)], align=PP_ALIGN.CENTER)
        text(s, 1.3, yy - 0.04, 4.1, 0.62, [(f, 12.5, INK, True)], line_spacing=1.08)
        yy += 0.72
    # 効果ボックス
    eff = rect(s, 0.8, yy + 0.08, 4.62, 1.2, fill=lc, line=None, round_=True)
    text(s, 1.05, yy + 0.24, 4.2, 1.0,
         [[("現場での効果", 10.5, c, True)],
          [(EFFECTS[idx], 12, INK, True)]], line_spacing=1.2, space_after=3)
    # 右：実画面モックアップ（ブラウザ枠）
    fx, fy, fw, fh = 5.7, 1.78, 6.85, 4.55
    text(s, fx, fy - 0.0, fw, 0.0, [])
    cx, cy, cw, ch = browser_frame(s, fx, fy + 0.18, fw, fh, SCREEN_URLS[idx], accent=c)
    is_real = place_screen(s, idx, cx, cy, cw, ch)
    cap = "▲ 実際の画面（" + name + "）" if is_real else "▲ 実際の画面イメージ（" + name + "）"
    text(s, fx, fy + fh + 0.24, fw, 0.3,
         [(cap, 10, GRAY_LT, True)], align=PP_ALIGN.CENTER)
    footer(s, n)
    return s


# ==================================================================
# スライド : 画面ギャラリー（6画面一覧）
# ==================================================================
def s_gallery(n):
    s = slide(); bg(s)
    page_header(s, "SCREEN GALLERY", "実際の画面 — ひとつのデザインで6アプリ", num=n)
    cols = 3
    gw, gh = 3.78, 2.18
    gx, gy = 0.78, 1.82
    gap_x, gap_y = 0.28, 0.42
    for i, (name, en, ic, c, lc, sub, feats) in enumerate(APPS):
        col = i % cols; row = i // cols
        x = gx + col*(gw + gap_x); y = gy + row*(gh + gap_y)
        cx, cy, cw, ch = browser_frame(s, x, y, gw, gh, SCREEN_URLS[i].split('/')[-1] or "onair", accent=c)
        place_screen(s, i, cx, cy, cw, ch)
        # キャプション
        cap = rect(s, x + 0.12, y + gh + 0.06, gw - 0.24, 0.28, fill=lc, line=None, round_=True)
        centered_label(cap, f"{name}", 10.5, c)
    footer(s, n)
    return s


# ==================================================================
# スライド 11 : GLS番号で全部つながる
# ==================================================================
def s_connect(n):
    s = slide(); bg(s)
    page_header(s, "HOW IT CONNECTS", "GLS番号 — すべてのデータを束ねる“背番号”", num=n)
    cx, cy = 6.66, 4.25
    # 中央ハブ
    oval(s, cx - 1.15, cy - 1.15, 2.3, 2.3, fill=BLUE_LIGHT)
    hub = oval(s, cx - 0.92, cy - 0.92, 1.84, 1.84, fill=GMO_BLUE, shadow=True)
    centered_label(hub, "GLS-A001\n案件の背番号", 14, WHITE)
    # 周囲のアプリ
    import math
    items = [(a[0], a[3]) for a in APPS]
    R = 2.65
    for i, (nm, c) in enumerate(items):
        ang = math.radians(-90 + i * 60)
        nx = cx + R * math.cos(ang); ny = cy + R * 0.86 * math.sin(ang)
        line(s, cx, cy, nx, ny, color=LINE, width=2.2)
    for i, (nm, c) in enumerate(items):
        ang = math.radians(-90 + i * 60)
        nx = cx + R * math.cos(ang); ny = cy + R * 0.86 * math.sin(ang)
        node = rect(s, nx - 0.95, ny - 0.42, 1.9, 0.84, fill=CARD, line=c, lw=2, round_=True, shadow=True)
        centered_label(node, nm, 13, c)
    # 補足
    text(s, 0.78, 6.55, 11.8, 0.7,
         [[("受注時に1つの ", 12.5, INK, False), ("GLS番号", 12.5, GMO_BLUE, True),
           (" を発番すると、見積・Qシート・機材・技術資料・本番・CGがすべて同じ案件として自動的に紐づきます。", 12.5, INK, False)]],
         line_spacing=1.2)
    footer(s, n)
    return s


# ==================================================================
# スライド 12 : 業務ライフサイクル
# ==================================================================
def s_lifecycle(n):
    s = slide(); bg(s)
    page_header(s, "FLOW", "案件のライフサイクルを1本の線でカバー", num=n)
    steps = [
        ("①提案", "ヨミ・見積", GMO_BLUE, "案件管理"),
        ("②受注", "GLS発番", SKY, "案件管理"),
        ("③制作", "台本・機材・技術", TEAL, "Qシート / 機材 / 技術"),
        ("④本番", "進行・CG送出", GREEN, "ライブ / CG"),
        ("⑤請求", "売上・損益", ACCENT, "案件管理"),
    ]
    n_steps = len(steps)
    x0, y0 = 0.85, 2.5
    sw = 2.18; gap = 0.22; h = 2.1
    for i, (t, d, c, app) in enumerate(steps):
        x = x0 + i * (sw + gap)
        card = shape(s, MSO_SHAPE.PENTAGON, x, y0, sw + 0.25, h, fill=c, line=None, shadow=True, adj=[0.45])
        text(s, x + 0.12, y0 + 0.3, sw - 0.1, 0.5, [(t, 18, WHITE, True)], align=PP_ALIGN.CENTER)
        text(s, x + 0.12, y0 + 0.92, sw - 0.05, 0.6, [(d, 12.5, WHITE, True)],
             align=PP_ALIGN.CENTER, line_spacing=1.05)
        text(s, x + 0.05, y0 + h + 0.18, sw + 0.1, 0.7, [(app, 10.5, c, True)],
             align=PP_ALIGN.CENTER, line_spacing=1.05)
    # 下部の一気通貫バー
    bar = rect(s, 0.85, 5.55, x0 + n_steps*(sw+gap) - 0.85 - gap, 0.5, fill=BLUE_LIGHT, round_=True)
    text(s, 0.85, 5.6, x0 + n_steps*(sw+gap) - 0.85 - gap, 0.4,
         [("ひとつのGLS番号でデータが流れ続ける — 転記ゼロ・抜け漏れゼロ", 13, GMO_BLUE, True)],
         align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
    footer(s, n)
    return s


# ==================================================================
# スライド 13 : 技術構成
# ==================================================================
def s_tech(n):
    s = slide(); bg(s)
    page_header(s, "ARCHITECTURE", "技術構成 — モダンで堅牢、運用は軽量", num=n)
    layers = [
        ("画面（フロント）", "React 19 + Vite + TailwindCSS", GMO_BLUE, BLUE_LIGHT, icon_layers,
         "スマホ対応・高速・統一デザイン"),
        ("サーバー（API）", "Express + Socket.IO", TEAL, TEAL_LT, icon_link,
         "リアルタイム同期・共通API"),
        ("データベース", "PostgreSQL（単一DB）", ACCENT, ACCENT_LT, icon_gear,
         "本番/検証をDB名で安全に分離"),
        ("インフラ", "Docker + Nginx（CoNoHa VPS）", PURPLE, PURPLE_LT, icon_shield,
         "自動デプロイ・3時間ごと自動バックアップ"),
    ]
    y = 1.85; rh = 1.16; gap = 0.12
    for i, (t, sub, c, lc, ic, note) in enumerate(layers):
        yy = y + i * (rh + gap)
        card = rect(s, 0.85, yy, 11.6, rh, fill=CARD, line=LINE, lw=1, round_=True, shadow=True)
        rect(s, 0.85, yy, 0.16, rh, fill=c)
        oval(s, 1.15, yy + rh/2 - 0.4, 0.8, 0.8, fill=lc)
        ic(s, 1.55, yy + rh/2, 0.7, c)
        text(s, 2.25, yy + 0.18, 4.6, 0.5, [(t, 16, INK, True)])
        text(s, 2.27, yy + 0.62, 4.6, 0.4, [(sub, 11.5, c, True, FONT_NUM)])
        line(s, 7.1, yy + 0.22, 7.1, yy + rh - 0.22, color=LINE, width=1)
        text(s, 7.4, yy + 0.18, 5.0, 0.85, [(note, 12.5, GRAY, True)],
             anchor=MSO_ANCHOR.MIDDLE, line_spacing=1.1)
    footer(s, n)
    return s


# ==================================================================
# スライド 14 : バイブコーディングとは
# ==================================================================
def s_vibe_intro(n):
    s = slide(); bg(s, GMO_BLUE)
    oval(s, -1.8, -1.8, 5, 5, fill=BLUE_DARK)
    oval(s, 10.5, 4.0, 5, 5, fill=SKY)
    text(s, 0.9, 0.95, 11.5, 0.4, [("HOW WE BUILT IT", 13, ACCENT_LT, True)])
    text(s, 0.86, 1.4, 11.6, 1.0, [("バイブコーディングとは？", 34, WHITE, True)])
    text(s, 0.9, 2.55, 11.5, 0.9,
         [[("「こうしたい」を", 19, WHITE, False), ("自然な言葉でAIに伝える", 19, ACCENT_LT, True),
           ("だけで、", 19, WHITE, False)],
          [("AIがコードを書き、動くアプリに仕上げていく新しい開発スタイル", 19, WHITE, True)]],
         line_spacing=1.25)
    # 3ステップ
    steps = [("話す", "やりたいことを\nチャットで伝える", icon_chat),
             ("作る", "AIがコードを書き\n実装する", icon_gear),
             ("確かめる", "検証環境で確認し\nすぐ直す", icon_shield)]
    cw, gap, x0, y0, ch = 3.7, 0.3, 0.9, 4.0, 2.7
    for i, (t, d, ic) in enumerate(steps):
        x = x0 + i*(cw+gap)
        card = rect(s, x, y0, cw, ch, fill=WHITE, round_=True, shadow=True)
        oval(s, x + cw/2 - 0.55, y0 + 0.32, 1.1, 1.1, fill=BLUE_LIGHT)
        ic(s, x + cw/2, y0 + 0.87, 1.0, GMO_BLUE)
        text(s, x, y0 + 1.55, cw, 0.5, [(f"STEP {i+1}  {t}", 16, GMO_BLUE, True)], align=PP_ALIGN.CENTER)
        text(s, x + 0.2, y0 + 2.02, cw - 0.4, 0.6, [(d, 12, GRAY, False)],
             align=PP_ALIGN.CENTER, line_spacing=1.1)
        if i < 2:
            arrow(s, x + cw + 0.02, y0 + ch/2 - 0.18, 0.28, 0.36, fill=ACCENT, direction="right")
    text(s, 0.9, SH - 0.55, 11.5, 0.3,
         [("専門のエンジニアを増やさず、現場の言葉そのままでアプリが育つ", 12.5, BLUE_LIGHT, True)])
    return s


# ==================================================================
# スライド 15 : 対話で作る（チャットの実例）
# ==================================================================
def s_dialogue(n):
    s = slide(); bg(s)
    page_header(s, "DIALOGUE-DRIVEN", "対話で作る — チャットがそのまま設計図に", num=n)
    # 左：チャット風バブル
    text(s, 0.85, 1.7, 6, 0.4, [("実際のやり取り（イメージ）", 13, GMO_BLUE, True)])
    bubbles = [
        ("user", "表彰式のランキングCGを作りたい。1位を最後にドンと出したい", ACCENT),
        ("ai", "演出ステップと送出UIを実装しました。検証環境でご確認ください", GMO_BLUE),
        ("user", "数字が動いてTAKEで確定する“あの演出”にして", ACCENT),
        ("ai", "カウントアップ→確定アニメに変更。複数正解の同期も対応しました", GMO_BLUE),
    ]
    yy = 2.25
    for who, msg, c in bubbles:
        if who == "user":
            b = shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 0.95, yy, 5.4, 0.92, fill=ACCENT_LT, line=None)
            oval(s, 0.6, yy, 0.3, 0.3, fill=ACCENT)
            text(s, 1.15, yy + 0.1, 5.0, 0.75, [[("社長 / 現場", 9.5, ACCENT, True)], [(msg, 11.5, INK, True)]],
                 line_spacing=1.05)
        else:
            b = shape(s, MSO_SHAPE.ROUNDED_RECTANGLE, 1.35, yy, 5.4, 0.92, fill=BLUE_LIGHT, line=None)
            text(s, 1.55, yy + 0.1, 5.0, 0.75, [[("AI（Claude）", 9.5, GMO_BLUE, True)], [(msg, 11.5, INK, True)]],
                 line_spacing=1.05)
        yy += 1.08
    # 右：それがこうなる
    text(s, 7.3, 1.7, 5.2, 0.4, [("生まれるもの", 13, TEAL, True)])
    res = [
        ("動くアプリ機能", "言葉で頼んだ演出が実際に放送で使える形に"),
        ("バージョン履歴", "v2.8 → v2.9 と小刻みに改善が積み上がる"),
        ("ドキュメント", "やり取りが仕様書・記録として自動で残る"),
    ]
    ry = 2.25
    for t, d in res:
        card = rect(s, 7.3, ry, 5.2, 1.18, fill=CARD, line=LINE, lw=1, round_=True, shadow=True)
        rect(s, 7.3, ry, 0.14, 1.18, fill=TEAL)
        text(s, 7.6, ry + 0.16, 4.7, 0.5, [(t, 14.5, INK, True)])
        text(s, 7.62, ry + 0.6, 4.7, 0.5, [(d, 11, GRAY, False)], line_spacing=1.1)
        ry += 1.32
    footer(s, n)
    return s


# ==================================================================
# スライド 16 : 安全な作り方（dev→本番）
# ==================================================================
def s_safety(n):
    s = slide(); bg(s)
    page_header(s, "SAFE BY DESIGN", "安全な進め方 — 検証してから本番へ", num=n)
    # フロー: 対話 → 検証(dev) → 確認 → 本番(main)
    nodes = [
        ("対話で実装", "AIがコードを生成", GMO_BLUE, icon_chat),
        ("検証環境", "dev.gmo-onair.jp で自動デプロイ", TEAL, icon_layers),
        ("動作確認", "現場でテスト・修正", ACCENT, icon_shield),
        ("本番公開", "承認後に gmo-onair.jp へ", GREEN, icon_rocket),
    ]
    x0 = 0.9; y = 2.2; w = 2.7; h = 2.5; gap = 0.42
    for i, (t, d, c, ic) in enumerate(nodes):
        x = x0 + i*(w+gap)
        card = rect(s, x, y, w, h, fill=CARD, line=LINE, lw=1, round_=True, shadow=True)
        rect(s, x, y, w, 0.13, fill=c)
        oval(s, x + w/2 - 0.5, y + 0.35, 1.0, 1.0, fill=BLUE_LIGHT if i==0 else (TEAL_LT if i==1 else (ACCENT_LT if i==2 else GREEN_LT)))
        ic(s, x + w/2, y + 0.85, 0.9, c)
        text(s, x, y + 1.5, w, 0.45, [(t, 15.5, INK, True)], align=PP_ALIGN.CENTER)
        text(s, x + 0.18, y + 1.95, w - 0.36, 0.5, [(d, 10.8, GRAY, False)],
             align=PP_ALIGN.CENTER, line_spacing=1.05)
        if i < 3:
            arrow(s, x + w + 0.04, y + h/2 - 0.2, 0.34, 0.4, fill=GMO_BLUE, direction="right")
    # 安全策の帯
    safe = rect(s, 0.9, 5.25, 11.55, 1.25, fill=GREEN_LT, line=None, round_=True)
    text(s, 1.25, 5.42, 11.0, 0.4, [("ルールで守る本番環境・ガバナンス", 13, GREEN, True)])
    text(s, 1.25, 5.82, 11.0, 0.6,
         [[("● 本番と検証のDBは完全分離   ● 「本番に入れて」の指示があるまで本番反映しない   ● 3時間ごと自動バックアップ", 12, INK, True)],
          [("● ユーザー権限管理・DBビューア・全データExcelバックアップを標準装備   ● いつでも以前のバージョンに戻せる", 12, INK, True)]],
         line_spacing=1.2)
    footer(s, n)
    return s


# ==================================================================
# スライド 17 : 反復改善（バージョンの積み上げ）
# ==================================================================
def s_iteration(n):
    s = slide(); bg(s)
    page_header(s, "DEVELOPMENT CADENCE", "改善の密度 — 止まらないアップデート", num=n)
    text(s, 0.85, 1.66, 11.6, 0.6,
         [[("v0.2 → v2.9.26 まで ", 14, INK, True), ("337 回のバージョンアップ", 14, GMO_BLUE, True),
           ("。直近の1か月だけで ", 14, INK, True), ("150 回以上（1日あたり約4〜5回）", 14, ACCENT, True),
           (" を改善デプロイ。", 14, INK, True)]],
         line_spacing=1.2)
    # タイムライン
    base_y = 4.6
    line(s, 1.1, base_y, 12.3, base_y, color=LINE, width=3)
    milestones = [
        ("v2.0", "デザイン刷新", GMO_BLUE, -1),
        ("v2.5", "ブランチ運用整備", TEAL, 1),
        ("v2.8", "リアルタイムCG\n演出強化", ACCENT, -1),
        ("v2.9", "CG⇄インタラクティブ\n連携", GREEN, 1),
        ("v2.9.26", "出題システム\n共通化（最新）", RED, -1),
    ]
    n_m = len(milestones)
    for i, (ver, d, c, up) in enumerate(milestones):
        x = 1.6 + i * (10.4 / (n_m - 1))
        oval(s, x - 0.16, base_y - 0.16, 0.32, 0.32, fill=c, line=WHITE, lw=2.5)
        if up < 0:
            cy = base_y - 1.75
            line(s, x, base_y - 0.16, x, cy + 0.65, color=c, width=1.6)
            card = rect(s, x - 1.05, cy - 0.1, 2.1, 0.85, fill=CARD, line=c, lw=1.4, round_=True, shadow=True)
            text(s, x - 1.0, cy - 0.05, 2.0, 0.4, [(ver, 14, c, True, FONT_NUM)], align=PP_ALIGN.CENTER)
            text(s, x - 1.0, cy + 0.32, 2.0, 0.5, [(d, 10, GRAY, True)], align=PP_ALIGN.CENTER, line_spacing=1.0)
        else:
            cy = base_y + 0.6
            line(s, x, base_y + 0.16, x, cy + 0.05, color=c, width=1.6)
            card = rect(s, x - 1.05, cy + 0.05, 2.1, 0.85, fill=CARD, line=c, lw=1.4, round_=True, shadow=True)
            text(s, x - 1.0, cy + 0.1, 2.0, 0.4, [(ver, 14, c, True, FONT_NUM)], align=PP_ALIGN.CENTER)
            text(s, x - 1.0, cy + 0.47, 2.0, 0.5, [(d, 10, GRAY, True)], align=PP_ALIGN.CENTER, line_spacing=1.0)
    # 注記
    text(s, 0.85, 6.55, 11.6, 0.5,
         [("※ バージョンは v1 → v2.9.26 まで小刻みに前進。大きな作り直しではなく、現場の声で日々アップデート。", 11, GRAY_LT, True)])
    footer(s, n)
    return s


# ==================================================================
# スライド 18 : バイブコーディングの活用法（学び）
# ==================================================================
def s_vibe_howto(n):
    s = slide(); bg(s)
    page_header(s, "PLAYBOOK", "バイブコーディング 活用のコツ", num=n)
    tips = [
        (icon_chat, GMO_BLUE, BLUE_LIGHT, "現場の言葉で伝える", "専門用語は不要。“こう見せたい”をそのまま話す"),
        (icon_layers, TEAL, TEAL_LT, "小さく頼む", "一度に1つの改善。すぐ確認して次へ"),
        (icon_shield, GREEN, GREEN_LT, "必ず検証してから本番", "壊せる環境で確認 → 承認 → 公開"),
        (icon_link, ACCENT, ACCENT_LT, "記録を残す", "やり取り＝仕様書。判断の経緯が資産に"),
        (icon_gear, PURPLE, PURPLE_LT, "AIに健全性も任せる", "セキュリティ・整合性チェックも対話で"),
        (icon_chart, RED, RED_LT, "数字と効果で会話", "“現場が楽になったか”で良し悪しを判断"),
    ]
    cols = 3; cw = 3.78; ch = 2.18; gx = 0.28; gy = 0.3; x0 = 0.78; y0 = 1.8
    for i, (ic, c, lc, t, d) in enumerate(tips):
        col = i % cols; row = i // cols
        x = x0 + col*(cw+gx); y = y0 + row*(ch+gy)
        card = rect(s, x, y, cw, ch, fill=CARD, line=LINE, lw=1, round_=True, shadow=True)
        oval(s, x + 0.3, y + 0.34, 0.92, 0.92, fill=lc)
        ic(s, x + 0.76, y + 0.8, 0.78, c)
        text(s, x + 1.38, y + 0.42, cw - 1.55, 0.6, [(t, 15, INK, True)], line_spacing=1.0)
        text(s, x + 0.34, y + 1.32, cw - 0.6, 0.7, [(d, 11, GRAY, False)], line_spacing=1.12)
        rect(s, x, y, 0.14, ch, fill=c)
    footer(s, n)
    return s


# ==================================================================
# スライド 19 : 数字で見る成果
# ==================================================================
def s_numbers(n):
    s = slide(); bg(s)
    page_header(s, "BY THE NUMBERS", "数字で見る成果", num=n)
    kpis = [
        ("6", "ブロックアプリ", "1プラットフォームに統合", GMO_BLUE),
        ("1", "つの背番号", "GLS番号で全データ連携", TEAL),
        ("0", "外注", "社内＋AI対話で内製", ACCENT),
        ("3h", "ごと自動", "DBバックアップで安心", GREEN),
    ]
    cw = 2.85; gap = 0.25; x0 = 0.85; y0 = 2.0; ch = 2.5
    for i, (num, unit, d, c) in enumerate(kpis):
        x = x0 + i*(cw+gap)
        card = rect(s, x, y0, cw, ch, fill=CARD, line=LINE, lw=1, round_=True, shadow=True)
        rect(s, x, y0, cw, 0.14, fill=c)
        text(s, x, y0 + 0.42, cw, 1.0, [[(num, 52, c, True, FONT_NUM), ("  " + unit, 14, INK, True)]],
             align=PP_ALIGN.CENTER)
        line(s, x + 0.5, y0 + 1.62, x + cw - 0.5, y0 + 1.62, color=LINE, width=1)
        text(s, x + 0.2, y0 + 1.75, cw - 0.4, 0.6, [(d, 12, GRAY, True)],
             align=PP_ALIGN.CENTER, line_spacing=1.1)
    # 下部メッセージ
    box = rect(s, 0.85, 4.95, 11.6, 1.5, fill=BLUE_LIGHT, line=None, round_=True)
    text(s, 1.2, 5.12, 11.0, 1.25,
         [[("見積から本番・請求まで、", 16, INK, True),
           ("バラバラだった制作業務を“1つのOS”に。", 16, GMO_BLUE, True)],
          [("既に実データで稼働中 — 案件28・売上明細124・機材462・タスク81 を一元管理。", 12.5, INK, True)],
          [("しかもその進化は、社長や現場との対話そのものから生まれ続けています。", 12.5, GRAY, False)]],
         line_spacing=1.25, align=PP_ALIGN.CENTER, space_after=3)
    footer(s, n)
    return s


# ==================================================================
# スライド 20 : ロードマップ
# ==================================================================
def s_roadmap(n):
    s = slide(); bg(s)
    page_header(s, "ROADMAP", "これから — さらに“つながる”へ", num=n)
    phases = [
        ("DONE", "6アプリ統合・DADSデザイン・自動デプロイ", GREEN, "✓ 完了"),
        ("NOW", "リアルタイムCG ⇄ インタラクティブ連携の高度化", GMO_BLUE, "● 進行中"),
        ("NEXT", "BOX連携（フォルダ自動生成・PDF自動保存・電子署名）", ACCENT, "→ 次の一手"),
        ("LATER", "認証統一・制作支援アプリ・マルチテナント化", PURPLE, "… 構想"),
    ]
    y = 1.95; rh = 1.12; gap = 0.14
    for i, (tag, d, c, st) in enumerate(phases):
        yy = y + i*(rh+gap)
        card = rect(s, 0.85, yy, 11.6, rh, fill=CARD, line=LINE, lw=1, round_=True, shadow=True)
        tagbox = rect(s, 0.85, yy, 1.85, rh, fill=c, round_=True)
        centered_label(tagbox, tag, 16, WHITE)
        text(s, 3.0, yy + 0.18, 7.2, 0.8, [(d, 14, INK, True)], anchor=MSO_ANCHOR.MIDDLE, line_spacing=1.1)
        text(s, 10.4, yy + 0.18, 2.0, rh - 0.36, [(st, 12.5, c, True)],
             align=PP_ALIGN.RIGHT, anchor=MSO_ANCHOR.MIDDLE)
    footer(s, n)
    return s


# ==================================================================
# スライド 21 : クロージング
# ==================================================================
def s_closing(n):
    s = slide(); bg(s, GMO_BLUE)
    oval(s, 9.0, -2.5, 7, 7, fill=BLUE_DARK)
    oval(s, -2.2, 3.8, 5.5, 5.5, fill=SKY)
    text(s, 0.9, 2.1, 11.5, 1.4,
         [[("制作の“あたりまえ”を、", 30, WHITE, True)],
          [("私たちの手でアップデートする。", 30, ACCENT_LT, True)]], line_spacing=1.2)
    line(s, 0.95, 3.95, 6.5, 3.95, color=SKY, width=2)
    text(s, 0.92, 4.15, 11.5, 1.0,
         [[("GMO ONAiR は、現場との対話から生まれ、対話で育ち続ける“会社OS”です。", 15, WHITE, True)],
          [("外注に頼らず、私たちのペースで、必要な機能を必要なだけ。", 14, BLUE_LIGHT, False)]],
         line_spacing=1.3)
    badge = rect(s, 0.92, 5.7, 4.0, 0.7, fill=WHITE, round_=True, shadow=True)
    centered_label(badge, "ご清聴ありがとうございました", 14, GMO_BLUE)
    text(s, 0.95, SH - 0.5, 11.0, 0.3, [("GMO GLOBAL STUDIO  |  GMO ONAiR  v2.9.26", 10.5, BLUE_LIGHT, True)])
    return s


# ==================================================================
# 結論ファースト : Claude を使わなかったら？
# ==================================================================
def s_without_claude(n):
    s = slide(); bg(s)
    page_header(s, "CONCLUSION FIRST", "もし Claude を使わなかったら？", num=n)
    # 結論バンド（2段：従来 / 実際）
    band1 = rect(s, 0.85, 1.62, 11.6, 1.0, fill=RED_LT, line=None, round_=True)
    rect(s, 0.85, 1.62, 0.16, 1.0, fill=RED)
    text(s, 1.2, 1.72, 11.0, 0.85,
         [[("従来型開発なら　", 13, RED, True),
           ("エンジニア 5〜7名 × 約12か月 ／ 費用 およそ 6,000万〜1億円", 17, INK, True)]],
         anchor=MSO_ANCHOR.MIDDLE, line_spacing=1.1)
    band2 = rect(s, 0.85, 2.74, 11.6, 1.0, fill=GREEN_LT, line=None, round_=True)
    rect(s, 0.85, 2.74, 0.16, 1.0, fill=GREEN)
    text(s, 1.2, 2.84, 11.0, 0.85,
         [[("実際（Claude活用）　", 13, GREEN, True),
           ("ほぼ 1名 の指揮 × 対話 ／ 外注費 ほぼ0円・数週間で土台→以後も毎日進化", 17, INK, True)]],
         anchor=MSO_ANCHOR.MIDDLE, line_spacing=1.1)
    # 比較カード4枚
    items = [
        ("期間", "約 12 か月", "数週間で土台\n以後も毎日改善", GMO_BLUE),
        ("人数", "5〜7 名", "1 名（社内）\n＋ Claude", TEAL),
        ("費用", "6,000万〜1億円", "ほぼ 0 円\n(AI+VPS 月数万円)", ACCENT),
        ("速さ", "仕様確定に数週間", "言ったその日に\n動くものが出る", PURPLE),
    ]
    cw = 2.85; gap = 0.25; x0 = 0.85; y0 = 3.95; ch = 2.05
    for i, (lab, was, now, c) in enumerate(items):
        x = x0 + i*(cw+gap)
        rect(s, x, y0, cw, ch, fill=CARD, line=LINE, lw=1, round_=True, shadow=True)
        head = rect(s, x, y0, cw, 0.42, fill=c, round_=True)
        rect(s, x, y0+0.3, cw, 0.12, fill=c)
        centered_label(head, lab, 13, WHITE)
        text(s, x+0.15, y0+0.52, cw-0.3, 0.4, [[("従来 ", 9, RED, True), (was, 12.5, INK, True)]],
             align=PP_ALIGN.CENTER, line_spacing=1.0)
        line(s, x+0.4, y0+1.02, x+cw-0.4, y0+1.02, color=LINE, width=1)
        text(s, x+0.12, y0+1.1, cw-0.24, 0.85,
             [[("Claude", 9, GREEN, True)], [(now, 11.5, GREEN, True)]],
             align=PP_ALIGN.CENTER, line_spacing=1.05)
    # 前提の注記
    text(s, 0.85, 6.2, 11.6, 0.55,
         [("※ 推計の前提：本体規模 約97,000行・6アプリ＋サーバー・DB世代99・リアルタイム/放送CG/財務/PDF/Excel/BOX連携/2FA/自動デプロイを含む。人月単価100万円・受託相場で試算。",
           9.5, GRAY_LT, True)], line_spacing=1.15)
    footer(s, n)
    return s


# ==================================================================
# 開発プロセスの実際（フェーズ）
# ==================================================================
def s_process(n):
    s = slide(); bg(s)
    page_header(s, "THE PROCESS", "開発プロセスの実際 — 積み上げの記録", num=n)
    phases = [
        ("1", "基盤づくり", "PostgreSQL化・Docker/Nginx・VPSデプロイ", GMO_BLUE),
        ("2", "3アプリ並走", "案件管理＋Qシート＋演出を同居", SKY),
        ("3", "サブアプリ統合", "機材・技術資料・ライブ運用を統合", TEAL),
        ("4", "デザイン全面刷新", "デジタル庁準拠(DADS)で全アプリ統一", GREEN),
        ("5", "放送CGの作り込み", "下位置CG・表彰CG・投票演出を実装", ACCENT),
        ("6", "外部連携", "インタラクティブ⇄CGをリアルタイム連携", PURPLE),
    ]
    cols = 3; cw = 3.78; ch = 1.62; gx = 0.28; gy = 0.3; x0 = 0.78; y0 = 1.78
    for i, (num, t, d, c) in enumerate(phases):
        col = i % cols; row = i // cols
        x = x0 + col*(cw+gx); y = y0 + row*(ch+gy)
        rect(s, x, y, cw, ch, fill=CARD, line=LINE, lw=1, round_=True, shadow=True)
        rect(s, x, y, 0.14, ch, fill=c)
        circ = oval(s, x+0.32, y+0.3, 0.62, 0.62, fill=c)
        centered_label(circ, num, 22, WHITE)
        text(s, x+1.12, y+0.26, cw-1.3, 0.5, [(t, 15, INK, True)])
        text(s, x+1.14, y+0.78, cw-1.3, 0.7, [(d, 11, GRAY, False)], line_spacing=1.12)
    # 統計バンド
    band = rect(s, 0.78, 5.95, 11.78, 0.95, fill=BLUE_LIGHT, line=None, round_=True)
    stats = [("337", "回のバージョンアップ\n(v0.2 → v2.9.26)"),
             ("99", "世代のDB設計変更\n(機能追加の積み重ね)"),
             ("150+", "直近1か月の改善デプロイ\n(1日 約4〜5回)")]
    sw_ = 11.78/3
    for i, (v, d) in enumerate(stats):
        sx = 0.78 + i*sw_
        text(s, sx+0.3, 6.05, sw_-0.4, 0.8,
             [[(v, 26, GMO_BLUE, True, FONT_NUM), ("  " + d.split(chr(10))[0], 11, INK, True)],
              [(d.split(chr(10))[1], 9.5, GRAY, False)]], line_spacing=1.05, anchor=MSO_ANCHOR.MIDDLE)
        if i < 2:
            line(s, sx+sw_, 6.12, sx+sw_, 6.78, color=RGBColor(0xC2,0xD6,0xEC), width=1)
    footer(s, n)
    return s


# ==================================================================
# どこが大変だったか（リアル）
# ==================================================================
def s_hard(n):
    s = slide(); bg(s)
    page_header(s, "THE HARD PARTS", "正直、ここは大変だった", num=n)
    cards = [
        (RED, "放送CGの“なめらかさ”",
         "アニメのカクつきを何度も作り直し。「After Effectsのような滑らかさを」の一言から数十回の調整 → 最終的に GPU で動く方式(FLIP)に到達。"),
        (ACCENT, "画面クラッシュとの戦い",
         "React の落とし穴や iPhone Safari のメモリ落ちで真っ赤なエラー画面。原因特定→修正のループで一つずつ潰した。"),
        (TEAL, "入力のもたつき",
         "Qシートで1打鍵ごとに数百セルが再描画され“3テンポ遅れ”。描画の最適化で体感ゼロまで改善。"),
        (PURPLE, "“前に作ったやつで”問題",
         "言葉のニュアンスのズレ。過去バージョンの実装を特定し、当時の演出を完全に復元して解決。"),
        (GMO_BLUE, "放送事故を絶対に出さない",
         "本番と検証DBを完全分離。「本番に入れて」と明示するまで反映しないルール＋3時間ごと自動バックアップ。"),
        (GREEN, "“現場で本当に使えるか”",
         "機能が動くだけでは不十分。現場の指摘を即反映する往復で、実運用に耐える形に磨き込んだ。"),
    ]
    cols = 2; cw = 5.78; ch = 1.52; gx = 0.28; gy = 0.22; x0 = 0.78; y0 = 1.74
    for i, (c, t, d) in enumerate(cards):
        col = i % cols; row = i // cols
        x = x0 + col*(cw+gx); y = y0 + row*(ch+gy)
        rect(s, x, y, cw, ch, fill=CARD, line=LINE, lw=1, round_=True, shadow=True)
        rect(s, x, y, 0.14, ch, fill=c)
        # 警告アイコン
        tri = shape(s, MSO_SHAPE.ISOSCELES_TRIANGLE, x+0.34, y+0.3, 0.5, 0.45, fill=c, line=None)
        text(s, x+0.34, y+0.42, 0.5, 0.3, [("!", 14, WHITE, True)], align=PP_ALIGN.CENTER)
        text(s, x+1.0, y+0.2, cw-1.15, 0.4, [(t, 14, INK, True)])
        text(s, x+1.02, y+0.62, cw-1.2, 0.85, [(d, 10.5, GRAY, False)], line_spacing=1.12)
    footer(s, n)
    return s


# ==================================================================
# 組み立て
# ==================================================================
def build():
    n = 1
    s_cover(n); n += 1
    s_oneliner(n); n += 1
    s_before_after(n); n += 1
    s_overview(n); n += 1
    for idx in range(6):
        s_app_detail(n, idx); n += 1
    s_gallery(n); n += 1
    s_connect(n); n += 1
    s_lifecycle(n); n += 1
    s_tech(n); n += 1
    # --- Part 2: 作り方・プロセス（結論ファースト） ---
    s_without_claude(n); n += 1
    s_process(n); n += 1
    s_dialogue(n); n += 1
    s_hard(n); n += 1
    s_safety(n); n += 1
    s_iteration(n); n += 1
    s_numbers(n); n += 1
    s_roadmap(n); n += 1
    s_closing(n); n += 1
    out = "/home/user/gmo-onair/docs/presentation/GMO_ONAiR_プレゼン.pptx"
    prs.save(out)
    print("Saved:", out, "| slides:", len(prs.slides._sldIdLst))


if __name__ == "__main__":
    build()
