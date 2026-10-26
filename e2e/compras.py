"""
Flujo de compras en un navegador real: técnico (celular) → autorizador (PC) → administrador (PC).
Requiere los datos de demostración recién cargados (npm run seed -- --demo con SEED_ADMIN_PASSWORD).
Uso: python e2e/compras.py <contraseña-admin>
"""
import sys, re, os, tempfile
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('CMMS_URL', 'http://localhost:4173')
ADMIN_PASS = sys.argv[1]
SP = os.environ.get('SHOTS', tempfile.mkdtemp(prefix='cmms-compras-'))
errors, results = [], []

def ok(n):
    results.append(n); print('OK  ', n)

def track(page):
    page.on('pageerror', lambda e: errors.append(f'{page.url}: {e}'))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(f'{page.url}: {m.text}'))

def login(page, u, c, url):
    page.goto(BASE + '/ingresar')
    page.get_by_label('Usuario').fill(u)
    page.get_by_label('Contraseña o PIN').fill(c)
    page.get_by_role('button', name='Ingresar').click()
    expect(page).to_have_url(re.compile(url))

with sync_playwright() as p:
    b = p.chromium.launch()

    # 1) Técnico en celular: sube lo planificado del preventivo y se genera la compra automática
    t = b.new_context(**p.devices['Pixel 7'], locale='es-CO', timezone_id='America/Bogota')
    tp = t.new_page(); track(tp)
    login(tp, 'tecnico', '4826', '/ordenes')
    tp.locator('.list-row', has_text='Lubricación y revisión').click()
    tp.locator('.card', has_text='Repuestos').first.get_by_role('button', name='Editar').click()
    dlg = tp.locator('dialog[open]')
    dlg.get_by_label('Cantidad', exact=True).nth(1).fill('5')  # rodamientos: 2 → 5 (hay 3)
    tp.get_by_role('button', name='Guardar').click()
    expect(tp.locator('dialog[open]')).to_have_count(0)
    compras = tp.locator('.card', has_text='Compras de repuestos')
    expect(compras).to_contain_text('2 UND · Rodamiento 6205-2RS')
    expect(compras).to_contain_text('Pendiente de aprobación')
    expect(tp.locator('.timeline')).to_contain_text('Solicitud de compra automática')
    tp.screenshot(path=f'{SP}/sc-01-ot-faltante-movil.png', full_page=True)
    ok('técnico sube lo planificado y se crea la compra automática por el faltante (2)')
    t.close()

    # 2) Autorizador en PC: llega a Compras, aprueba con un clic y rechaza la otra
    a = b.new_context(viewport={'width': 1366, 'height': 900}, locale='es-CO', timezone_id='America/Bogota')
    ap = a.new_page(); track(ap)
    login(ap, 'autorizador', 'Autoriza2026', '/compras')
    expect(ap.locator('.sidebar .nav-badge')).to_have_text('2')
    expect(ap.locator('.list-row')).to_have_count(2)
    ap.screenshot(path=f'{SP}/sc-02-autorizador.png')
    ok('autorizador entra directo a Compras con 2 por aprobar')
    auto = ap.locator('.list-row', has_text='Automática por faltante')
    auto.get_by_role('button', name='Aprobar').click()
    expect(ap.locator('.list-row')).to_have_count(1)
    ap.locator('.list-row').get_by_role('button', name='Rechazar').click()
    dlg = ap.locator('dialog[open]')
    dlg.get_by_label('Motivo *').fill('Se repone en el pedido trimestral')
    dlg.get_by_role('button', name='Rechazar').click()
    expect(ap.get_by_text('No hay solicitudes por aprobar')).to_be_visible()
    expect(ap.locator('.sidebar .nav-badge')).to_have_count(0)
    ok('aprueba con un clic y rechaza con motivo')
    ap.get_by_role('tab', name='Historial').click()
    expect(ap.locator('.list-row', has_text='Rechazada')).to_have_count(1)
    a.close()

    # 3) Administrador: registra la compra y la recibe en bodega
    c = b.new_context(viewport={'width': 1366, 'height': 900}, locale='es-CO', timezone_id='America/Bogota')
    page = c.new_page(); track(page)
    login(page, 'admin', ADMIN_PASS, '/ordenes')
    page.locator('.sidebar').get_by_role('link', name='Compras').click()
    page.get_by_role('tab', name='Aprobadas y compradas').click()
    page.locator('.list-row').first.click()
    page.get_by_role('button', name='Registrar compra').click()
    dlg = page.locator('dialog[open]')
    dlg.get_by_label('Proveedor *').fill('Rodamientos del Valle')
    dlg.get_by_label('N.° de orden de compra').fill('OC-4512')
    dlg.get_by_label('Costo unitario estimado (COP)').fill('19000')
    page.get_by_role('button', name='Guardar').click()
    expect(page.locator('.page-subtitle')).to_contain_text('Comprada')
    page.get_by_role('button', name='Recibir en bodega').click()
    dlg = page.locator('dialog[open]')
    expect(dlg.get_by_label(re.compile('Costo unitario real'))).to_have_value('19000')
    dlg.get_by_label('Factura').fill('FV-998')
    page.get_by_role('button', name='Registrar entrada').click()
    expect(page.locator('.page-subtitle')).to_contain_text('Recibida')
    expect(page.locator('.timeline')).to_contain_text('Repuesto recibido en bodega')
    page.screenshot(path=f'{SP}/sc-03-recibida.png', full_page=True)
    ok('admin registra la compra (OC-4512) y la recibe con factura')
    page.get_by_role('link', name=re.compile('RP-ROD-6205')).click()
    expect(page.locator('.stat').first).to_contain_text('5')
    expect(page.locator('.table')).to_contain_text('SC-')
    ok('el repuesto entra al inventario (3 → 5) con referencia a la solicitud')
    page.goto(BASE + '/ordenes')
    page.locator('.list-row', has_text='Lubricación y revisión').click()
    expect(page.locator('.timeline')).to_contain_text('Llegó el repuesto')
    expect(page.locator('.card', has_text='Compras de repuestos')).to_contain_text('Recibida')
    ok('la orden de trabajo registra la llegada del repuesto')
    b.close()

print('\n', len(results), 'verificaciones OK. Capturas en', SP)
print('Errores de consola:', errors or 'ninguno')
