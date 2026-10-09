# Renders the Markdown docs to print-ready PDFs (A4) via headless Chrome: python docs/md2pdf.py
import markdown, pathlib, subprocess, os
DOCS = pathlib.Path(__file__).resolve().parent
CHROME = os.environ.get('CHROME_PATH', r'C:\Program Files\Google\Chrome\Application\chrome.exe')
FONTS = (DOCS.parent / 'public' / 'fonts').as_uri()
LOGO = (DOCS.parent / 'public' / 'img' / 'ringo.svg').as_uri()
CSS = """
@font-face{font-family:'Cormorant Garamond';font-weight:600;src:url('{F}/CormorantGaramond-600-normal.woff2') format('woff2')}
@font-face{font-family:'Inter';font-weight:400;src:url('{F}/Inter-400-normal.woff2') format('woff2')}
@font-face{font-family:'Inter';font-weight:600;src:url('{F}/Inter-600-normal.woff2') format('woff2')}
@page{size:A4;margin:18mm 17mm 18mm}
body{font:10.5pt/1.55 Inter,system-ui,sans-serif;color:#2e2427;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.head{display:flex;justify-content:space-between;align-items:center;border-bottom:1.5px solid #b8915a;padding-bottom:6px;margin-bottom:18px;font-size:9pt;color:#76666b}
.head b{font:600 15pt 'Cormorant Garamond',Georgia,serif;color:#8e3b5a}
h1,h2,h3{font-family:'Cormorant Garamond',Georgia,serif;font-weight:600;line-height:1.15;break-after:avoid}
h1{font-size:26pt;color:#8e3b5a;margin:0 0 10px}
h2{font-size:17pt;margin:22px 0 6px;border-bottom:1px solid #eadfe0;padding-bottom:3px}
h3{font-size:13.5pt;margin:16px 0 4px}
p,li{orphans:3;widows:3}
a{color:#8e3b5a}
code{font:9pt ui-monospace,Consolas,monospace;background:#f3ecec;padding:1px 4px;border-radius:4px}
pre{background:#f7f1f1;border:1px solid #eadfe0;border-radius:6px;padding:9px 11px;white-space:pre-wrap;break-inside:avoid}
pre code{background:none;padding:0}
table{border-collapse:collapse;width:100%;margin:8px 0;font-size:9.5pt;break-inside:auto}
th,td{border-bottom:1px solid #eadfe0;padding:5px 7px;text-align:left;vertical-align:top}
th{background:#f6eef0;font-weight:600}
tr{break-inside:avoid}
blockquote{margin:10px 0;padding:8px 12px;background:#f3e6d2;border-radius:6px;color:#5a4220}
blockquote p{margin:0}
img{max-width:100%;max-height:120mm;display:block;margin:10px auto;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.15);break-inside:avoid}
hr{border:0;border-top:1px solid #eadfe0;margin:18px 0}
.head img{box-shadow:none;margin:0;border-radius:0;max-height:none}
ul li input{margin-right:6px}
""".replace('{F}', FONTS)

docs = {
    'Handbuch-Brautpaar.md': 'Handbuch für das Brautpaar',
    'Anleitung-Gaeste.md': 'Anleitung für Gäste',
    'Betriebshandbuch.md': 'Betriebshandbuch',
    'Architektur.md': 'Architektur',
    '../README.md': 'Projektübersicht',
}
for name, title in docs.items():
    src = (DOCS / name).resolve()
    text = src.read_text(encoding='utf8').replace('- [ ]', '- ☐')
    # Python-Markdown nests lists only with 4-space indents; the docs use 2 (GitHub style).
    import re
    text = re.sub(r'^( +)', lambda m: m.group(1) * 2, text, flags=re.M)
    html = markdown.markdown(text, extensions=['tables', 'pymdownx.superfences', 'sane_lists'])
    page = f"""<!doctype html><html lang="de"><head><meta charset="utf-8"><base href="{src.parent.as_uri()}/"><title>{title}</title><style>{CSS}</style></head>
<body><div class="head"><img src="{LOGO}" alt="Ringo" style="height:30px"><span>{title}</span></div>{html}</body></html>"""
    tmp = DOCS / f'_{src.stem}.html'
    tmp.write_text(page, encoding='utf8')
    out = DOCS / ('Projektuebersicht.pdf' if name.startswith('..') else f'{src.stem}.pdf')
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=5000',
                    f'--print-to-pdf={out}', tmp.as_uri()], check=True, capture_output=True)
    tmp.unlink()
    print(out.name)
