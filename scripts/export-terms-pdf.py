"""Exportiert denselben Text wie /agb als PDF für Nutzer und Plattformprüfungen."""
import json
import re
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

ROOT = Path(__file__).resolve().parent.parent
content = json.loads((ROOT / 'src/content/terms.json').read_text())
font_root = Path('/System/Library/Fonts/Supplemental')
if (font_root / 'Arial.ttf').exists():
    normal, bold = font_root / 'Arial.ttf', font_root / 'Arial Bold.ttf'
else:
    font_root = Path('/usr/share/fonts/truetype/dejavu')
    normal, bold = font_root / 'DejaVuSans.ttf', font_root / 'DejaVuSans-Bold.ttf'
pdfmetrics.registerFont(TTFont('Terms', str(normal)))
pdfmetrics.registerFont(TTFont('Terms-Bold', str(bold)))

output = ROOT / 'output/pdf/Ocuris-Nutzungsbedingungen.pdf'
output.parent.mkdir(parents=True, exist_ok=True)
style = ParagraphStyle('body', fontName='Terms', fontSize=10.5, leading=15.5,
                       textColor=colors.HexColor('#243241'), spaceAfter=9,
                       alignment=TA_LEFT, allowWidows=0, allowOrphans=0)
heading = ParagraphStyle('heading', parent=style, fontName='Terms-Bold', fontSize=12.5,
                         leading=17, spaceBefore=16, spaceAfter=8, keepWithNext=True)
title = ParagraphStyle('title', parent=heading, fontSize=24, leading=29, spaceBefore=0, spaceAfter=14)

def linked(text):
    parts = re.split(r'(https://[^\s]+|info@ocuris\.app)', text)
    result = []
    for part in parts:
        if part == 'info@ocuris.app':
            result.append(f'<link href="mailto:{part}" color="#006892">{part}</link>')
        elif part.startswith('https://'):
            url = part.rstrip('.,;')
            result.append(f'<link href="{escape(url)}" color="#006892">{escape(url)}</link>{escape(part[len(url):])}')
        else:
            result.append(escape(part))
    return ''.join(result)

def page_frame(canvas, doc):
    canvas.saveState()
    width, height = A4
    canvas.setFont('Terms-Bold', 9)
    canvas.setFillColor(colors.HexColor('#006892'))
    canvas.drawString(48, height - 30, 'OCURIS')
    canvas.setFont('Terms', 8)
    canvas.setFillColor(colors.HexColor('#546372'))
    canvas.drawRightString(width - 48, height - 30, 'Nutzungsbedingungen | Stand: ' + content['version'])
    canvas.setStrokeColor(colors.HexColor('#D8E2E9'))
    canvas.line(48, 38, width - 48, 38)
    canvas.drawString(48, 25, 'Jaden Tomic / Ocuris | info@ocuris.app')
    canvas.drawRightString(width - 48, 25, f'Seite {doc.page}')
    canvas.restoreState()

story = [Paragraph(escape(content['title']), title),
         Paragraph(escape(content['intro']), style),
         Paragraph('Stand: ' + escape(content['version']), style), Spacer(1, 8)]
for section in content['sections']:
    story.append(Paragraph(escape(section['title']), heading))
    story.extend(Paragraph(linked(text), style) for text in section['paragraphs'])
doc = SimpleDocTemplate(str(output), pagesize=A4, leftMargin=48, rightMargin=48,
                        topMargin=54, bottomMargin=54, title=content['title'],
                        author='Jaden Tomic / Ocuris')
doc.build(story, onFirstPage=page_frame, onLaterPages=page_frame)
print(output)
