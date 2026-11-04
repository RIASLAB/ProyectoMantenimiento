"""
Asignar órdenes con la carga de cada técnico (D-32): el jefe asigna desde la lista las órdenes sin técnico,
viendo cuántas tiene pendientes cada uno (los libres primero), en escritorio y en el celular.
Requiere los datos de demostración recién cargados y el frontend compilado (npm run build && npm run preview).
Uso: python e2e/asignar_ordenes.py <contraseña-admin>
"""
import sys, re, os, tempfile
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('CMMS_URL', 'http://localhost:4173')
ADMIN_PASS = sys.argv[1]
SP = os.environ.get('SHOTS', tempfile.mkdtemp(prefix='cmms-asignar-'))
errors, results = [], []

def ok(n):
    results.append(n); print('OK  ', n)

def track(page):
    page.on('pageerror', lambda e: errors.append(f'{page.url}: {e}'))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(f'{page.url}: {m.text}'))

def ingresar(page, u, c):
    page.goto(BASE + '/ingresar')
    page.get_by_label('Usuario').fill(u)
    page.get_by_label('Contraseña o PIN').fill(c)
    page.get_by_role('button', name='Ingresar').click()
    expect(page).to_have_url(re.compile('/ordenes'))

with sync_playwright() as p:
    b = p.chromium.launch()
    a = b.new_context(viewport={'width': 1366, 'height': 900}, locale='es-CO', timezone_id='America/Bogota').new_page(); track(a)
    ingresar(a, 'admin', ADMIN_PASS)

    # 1) La falla sin técnico tiene su botón Asignar en la lista; la ya asignada no
    falla = a.locator('li', has=a.locator('.list-row', has_text='EMB-002'))
    prev = a.locator('li', has=a.locator('.list-row', has_text='MOL-001'))
    expect(falla.get_by_role('button', name=re.compile('^Asignar'))).to_be_visible()
    expect(prev.get_by_role('button', name=re.compile('^Asignar'))).to_have_count(0)
    ok('en la lista, la orden sin técnico tiene "Asignar"; la que ya tiene técnico no')

    # 2) La ventana muestra lo que cada uno tiene pendiente; los técnicos primero
    falla.get_by_role('button', name=re.compile('^Asignar')).click()
    d = a.locator('dialog[open]')
    expect(d.get_by_role('heading')).to_contain_text('Asignar OT-')
    expect(d).to_contain_text('EMB-002')
    tec = d.locator('.asignar-op', has_text='Técnico Demo')
    expect(tec).to_contain_text('1 orden')
    expect(d.locator('.asignar-op').first).to_contain_text('Técnico Demo')
    expect(d.locator('.asignar-op', has_text='Administrador')).to_contain_text('Sin órdenes pendientes')
    a.screenshot(path=f'{SP}/asig-01-carga.png', full_page=True)
    tec.click()
    d.get_by_role('button', name='Asignar', exact=True).click()
    expect(a.locator('dialog[open]')).to_have_count(0)
    expect(falla.locator('.list-row')).to_contain_text('Técnico Demo')
    expect(falla.get_by_role('button', name=re.compile('^Asignar'))).to_have_count(0)
    ok('asignada a Técnico Demo desde la lista, viendo que tenía 1 orden pendiente')

    # 3) Al reasignar desde la orden, la carga ya cuenta la nueva
    falla.locator('.list-row').click()
    a.get_by_role('button', name='Reasignar').click()
    d = a.locator('dialog[open]')
    expect(d.get_by_role('heading')).to_contain_text('Reasignar OT-')
    expect(d.locator('.asignar-op', has_text='Técnico Demo')).to_contain_text('2 órdenes')
    expect(d.locator('.asignar-op', has_text='Técnico Demo')).to_contain_text('tiene esta orden')
    expect(d.get_by_role('button', name='Asignar', exact=True)).to_be_disabled()
    d.get_by_role('button', name='Cancelar').click()
    ok('desde la orden, Reasignar muestra que Técnico Demo ya tiene 2 órdenes (incluida esta)')

    # 4) En el celular
    m = b.new_context(viewport={'width': 412, 'height': 900}, locale='es-CO', timezone_id='America/Bogota').new_page(); track(m)
    ingresar(m, 'admin', ADMIN_PASS)
    m.goto(BASE + '/ordenes/reportar')
    maq = m.get_by_label('Máquina *')
    maq.select_option(maq.evaluate("s => [...s.options].find(o => o.textContent.includes('HRN-001')).value"))
    m.get_by_label('¿Qué pasó? *').fill('No calienta la cámara del horno')
    m.get_by_role('button', name='Enviar reporte').click()
    expect(m).to_have_url(re.compile(r'/ordenes/[0-9a-f-]{36}'))
    m.goto(BASE + '/ordenes')
    fila = m.locator('li', has=m.locator('.list-row', has_text='HRN-001'))
    boton = fila.get_by_role('button', name=re.compile('^Asignar'))
    expect(boton).to_be_visible()
    caja_fila, caja_boton = fila.bounding_box(), boton.bounding_box()
    assert caja_boton['width'] > caja_fila['width'] * 0.9, 'en el celular el botón ocupa el ancho de la fila'
    assert m.evaluate('document.documentElement.scrollWidth') <= 412, 'sin desborde horizontal'
    boton.click()
    m.screenshot(path=f'{SP}/asig-02-celular.png', full_page=True)
    m.locator('dialog[open] .asignar-op', has_text='Técnico Demo').click()
    m.locator('dialog[open]').get_by_role('button', name='Asignar', exact=True).click()
    expect(fila.locator('.list-row')).to_contain_text('Técnico Demo')
    ok('en el celular: botón Asignar a todo el ancho, sin desbordes; asigna la falla de HRN-001')
    b.close()

print('\n', len(results), 'verificaciones OK. Capturas en', SP)
print('Errores de consola:', errors or 'ninguno')
