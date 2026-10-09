# Builds the customer brochure from broschuere/vorlage.html:  python docs/build-brochure.py
#   -> docs/Broschuere.html (standalone), docs/broschuere/artifact.html (for publishing), docs/Broschuere.pdf
# Placeholders: {{name}} = broschuere/name.jpg, {{svg:name}} = public/img/name.svg (both embedded as data URIs).
import base64, os, pathlib, re, subprocess

DOCS = pathlib.Path(__file__).resolve().parent
IMG = DOCS.parent / 'public' / 'img'
CHROME = os.environ.get('CHROME_PATH', r'C:\Program Files\Google\Chrome\Application\chrome.exe')

def data_uri(key):
    if key.startswith('svg:'):
        return 'data:image/svg+xml;base64,' + base64.b64encode((IMG / f'{key[4:]}.svg').read_bytes()).decode()
    return 'data:image/jpeg;base64,' + base64.b64encode((DOCS / 'broschuere' / f'{key}.jpg').read_bytes()).decode()

body = (DOCS / 'broschuere' / 'vorlage.html').read_text(encoding='utf8')
body = re.sub(r'\{\{([\w:-]+)\}\}', lambda m: data_uri(m.group(1)), body)
(DOCS / 'broschuere' / 'artifact.html').write_text(body, encoding='utf8')
full = ('<!doctype html>\n<html lang="de">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        + body.replace('</style>', '</style>\n</head>\n<body>', 1) + '\n</body>\n</html>\n')
(DOCS / 'Broschuere.html').write_text(full, encoding='utf8')
subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--virtual-time-budget=8000',
                f'--print-to-pdf={DOCS / "Broschuere.pdf"}', (DOCS / 'Broschuere.html').as_uri()], check=True, capture_output=True)
print('Broschuere.html, broschuere/artifact.html, Broschuere.pdf')
