"""
Eliminar fotos de una orden y documentos de una máquina, en un navegador real.
Requiere los datos de demostración recién cargados y el frontend compilado (npm run build && npm run preview).
Uso: python e2e/eliminar_adjuntos.py <contraseña-admin>
"""
import sys, re, os, json, tempfile, urllib.request
from PIL import Image
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('CMMS_URL', 'http://localhost:4173')
ADMIN_PASS = sys.argv[1]
SP = os.environ.get('SHOTS', tempfile.mkdtemp(prefix='cmms-eliminar-'))
JPG = os.path.join(SP, 'maquina.jpg')
Image.new('RGB', (800, 600), (40, 120, 90)).save(JPG, quality=80)
PDF = os.path.join(SP, 'manual-equivocado.pdf')
open(PDF, 'wb').write(b'%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')
errors, results = [], []

def ok(n):
    results.append(n); print('OK  ', n)

def track(page):
    page.on('pageerror', lambda e: errors.append(f'{page.url}: {e}'))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(f'{page.url}: {m.text}'))

def api(method, path, token=None, body=None):
    req = urllib.request.Request(f'{BASE}/api{path}', method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', **({'Authorization': f'Bearer {token}'} if token else {})})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

def login(page, u, c):
    page.goto(BASE + '/ingresar')
    page.get_by_label('Usuario').fill(u)
    page.get_by_label('Contraseña o PIN').fill(c)
    page.get_by_role('button', name='Ingresar').click()
    expect(page).to_have_url(re.compile('/ordenes'))

admin = api('POST', '/auth/login', body={'usuario': 'admin', 'credencial': ADMIN_PASS})['token']
prev = next(o for o in api('GET', '/ordenes?vista=abiertas', admin) if o['tipo'] == 'PREVENTIVO')

with sync_playwright() as p:
    b = p.chromium.launch()
    # 1) Técnico en el celular: sube la foto "Antes" equivocada y la elimina
    cel = b.new_context(**p.devices['Pixel 7'], locale='es-CO', timezone_id='America/Bogota')
    t = cel.new_page(); track(t)
    login(t, 'tecnico', '4826')
    t.goto(BASE + f"/ordenes/{prev['id']}")
    t.get_by_role('button', name='Iniciar trabajo').click()
    expect(t.locator('.page-subtitle')).to_contain_text('En ejecución')
    t.get_by_label('Momento de la foto').select_option('ANTES')
    t.locator('input[type=file]').set_input_files(JPG)
    expect(t.locator('.photo')).to_have_count(1)
    expect(t.locator('.photo img').first).to_be_visible(); t.locator('.photo').first.click()
    dlg = t.locator('dialog[open]')
    expect(dlg).to_contain_text('Foto · Antes')
    expect(dlg).to_contain_text('Técnico Demo')
    dlg.get_by_role('button', name='Eliminar foto').click()
    expect(dlg).to_contain_text('¿Eliminar esta foto?')
    dlg.get_by_role('button', name='No, conservarla').click()
    expect(dlg.get_by_role('button', name='Eliminar foto')).to_be_visible()
    dlg.get_by_role('button', name='Eliminar foto').click()
    t.screenshot(path=f'{SP}/del-01-confirmar.png', full_page=True)
    dlg.get_by_role('button', name='Sí, eliminar').click()
    expect(t.locator('dialog[open]')).to_have_count(0)
    expect(t.locator('.photo')).to_have_count(0)
    expect(t.locator('.timeline')).to_contain_text('Foto "Antes" eliminada')
    ok('técnico (celular): sube la foto "Antes", la elimina con confirmación y queda en el historial')

    # 2) Una foto del administrador: el técnico la ve pero no puede eliminarla
    import http.client, uuid as _u
    bnd = _u.uuid4().hex
    cuerpo = (f'--{bnd}\r\nContent-Disposition: form-data; name="archivo"; filename="a.jpg"\r\nContent-Type: image/jpeg\r\n\r\n').encode() + open(JPG, 'rb').read() + f'\r\n--{bnd}--\r\n'.encode()
    req = urllib.request.Request(f"{BASE}/api/ordenes/{prev['id']}/fotos?momento=DESPUES", data=cuerpo, method='POST',
                                 headers={'Authorization': f'Bearer {admin}', 'Content-Type': f'multipart/form-data; boundary={bnd}'})
    urllib.request.urlopen(req).read()
    t.reload()
    expect(t.locator('.photo')).to_have_count(1)
    expect(t.locator('.photo img').first).to_be_visible(); t.locator('.photo').first.click()
    expect(t.locator('dialog[open]')).to_contain_text('Administrador')
    expect(t.locator('dialog[open]').get_by_role('button', name='Eliminar foto')).to_have_count(0)
    t.locator('dialog[open]').get_by_role('button', name='Cerrar').click()
    ok('el técnico no puede eliminar la foto que subió otra persona')

    # 3) Admin en el PC: elimina la foto ajena; al cerrar la orden ya no se puede
    pc = b.new_context(viewport={'width': 1366, 'height': 900}, locale='es-CO', timezone_id='America/Bogota')
    a = pc.new_page(); track(a)
    login(a, 'admin', ADMIN_PASS)
    a.goto(BASE + f"/ordenes/{prev['id']}")
    expect(a.locator('.photo img').first).to_be_visible(); a.locator('.photo').first.click()
    a.locator('dialog[open]').get_by_role('button', name='Eliminar foto').click()
    a.locator('dialog[open]').get_by_role('button', name='Sí, eliminar').click()
    expect(a.locator('.photo')).to_have_count(0)
    ok('el administrador elimina la foto de otro usuario')

    t.reload()
    t.locator('input[type=file]').set_input_files(JPG)  # momento por defecto
    expect(t.locator('.photo')).to_have_count(1)
    t.get_by_role('button', name='Cerrar orden').first.click()
    d = t.locator('dialog[open]')
    d.get_by_label('Trabajo realizado *').fill('Lubricación general')
    d.get_by_label('Horas').first.fill('1')
    t.get_by_role('button', name='Cerrar orden').last.click()
    expect(t.locator('.page-subtitle')).to_contain_text('Cerrada')
    a.reload()
    expect(a.locator('.photo img').first).to_be_visible(); a.locator('.photo').first.click()
    expect(a.locator('dialog[open] img')).to_be_visible()
    expect(a.locator('dialog[open]').get_by_role('button', name='Eliminar foto')).to_have_count(0)
    a.locator('dialog[open]').get_by_role('button', name='Cerrar').click()
    ok('orden cerrada: sus fotos son evidencia y nadie las puede eliminar (ni el administrador)')

    # 4) Documento de una máquina
    a.goto(BASE + '/maquinas')
    a.locator('.list-row', has_text='MOL-001').click()
    a.locator('input[type=file]').set_input_files(PDF)
    expect(a.locator('.doc-row', has_text='manual-equivocado.pdf')).to_be_visible()
    a.get_by_role('button', name='Eliminar manual-equivocado.pdf').click()
    expect(a.locator('dialog[open]')).to_contain_text('¿Eliminar manual-equivocado.pdf de esta máquina?')
    a.screenshot(path=f'{SP}/del-02-documento.png')
    a.locator('dialog[open]').get_by_role('button', name='Eliminar', exact=True).click()
    expect(a.locator('.doc-row', has_text='manual-equivocado.pdf')).to_have_count(0)
    ok('el administrador elimina un documento de una máquina con confirmación')

    a.goto(BASE + '/configuracion')
    expect(a.locator('.audit')).to_contain_text('Eliminó documento')
    a.locator('select[aria-label="Filtrar bitácora"]').select_option('orden')
    expect(a.locator('.audit')).to_contain_text('Eliminó foto de una orden')
    ok('bitácora: "Eliminó documento" y "Eliminó foto de una orden"')

    t.goto(BASE + '/maquinas')
    t.locator('.list-row', has_text='MOL-001').click()
    expect(t.get_by_role('heading', name='Manuales y documentos')).to_be_visible()
    expect(t.locator('.doc-del')).to_have_count(0)
    ok('el técnico ve los documentos pero no puede eliminarlos')
    b.close()

print('\n', len(results), 'verificaciones OK. Capturas en', SP)
print('Errores de consola:', errors or 'ninguno')
