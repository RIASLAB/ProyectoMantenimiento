"""
Flujo de calidad HACCP/BPM en un navegador real: operario (celular) → administrador (PC y celular).
Requiere los datos de demostración recién cargados (npm run seed -- --demo con SEED_ADMIN_PASSWORD).
Uso: python e2e/calidad.py <contraseña-admin>
"""
import sys, re, os, tempfile
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('CMMS_URL', 'http://localhost:4173')
ADMIN_PASS = sys.argv[1]
SP = os.environ.get('SHOTS', tempfile.mkdtemp(prefix='cmms-calidad-'))
errors, results = [], []

def ok(n):
    results.append(n); print('OK  ', n)

def track(page):
    page.on('pageerror', lambda e: errors.append(f'{page.url}: {e}'))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(f'{page.url}: {m.text}'))

def login(page, u, c):
    page.goto(BASE + '/ingresar')
    page.get_by_label('Usuario').fill(u)
    page.get_by_label('Contraseña o PIN').fill(c)
    page.get_by_role('button', name='Ingresar').click()
    expect(page).to_have_url(re.compile('/ordenes'))

with sync_playwright() as p:
    b = p.chromium.launch()

    # 1) Operario en celular: temperatura fuera de rango y checklist con no conformidad
    m = b.new_context(**p.devices['Pixel 7'], locale='es-CO', timezone_id='America/Bogota')
    page = m.new_page(); track(page)
    login(page, 'operario', '7391')
    expect(page.locator('.tabbar .tab-link')).to_have_count(4)
    page.locator('.tabbar').get_by_role('link', name='Calidad').click()
    expect(page.locator('.point', has_text='Temperatura de cámara')).to_contain_text('3,4 °C')
    page.get_by_role('link', name='Registrar temperatura').click()
    page.get_by_label('Equipo y punto de control *').select_option(label='CF-001 · Cuarto frío de producto terminado — Temperatura de cámara')
    expect(page.get_by_text('Rango permitido: 0 a 4 °C')).to_be_visible()
    page.get_by_label('Temperatura (°C) *').fill('6.5')
    expect(page.get_by_role('alert')).to_contain_text('Fuera de rango')
    page.screenshot(path=f'{SP}/cal-01-fuera-de-rango-movil.png', full_page=True)
    page.get_by_label('Acción correctiva *').fill('Se cerró la puerta de la cámara y se avisó a mantenimiento')
    page.get_by_role('button', name='Guardar registro').click()
    expect(page.locator('.alert-warn')).to_contain_text('6,5 °C (fuera de rango, con acción correctiva)')
    ok('operario registra 6,5 °C fuera de rango con acción correctiva')
    page.get_by_label('Equipo y punto de control *').select_option(label='CF-001 · Cuarto frío de producto terminado — Temperatura de cámara')
    page.get_by_label('Temperatura (°C) *').fill('3')
    expect(page.get_by_label('Acción correctiva *')).to_have_count(0)
    page.get_by_role('button', name='Guardar registro').click()
    expect(page.locator('.alert-ok')).to_contain_text('3 °C')
    ok('lectura en rango sin pedir acción correctiva; el formulario queda listo para la siguiente')

    page.goto(BASE + '/calidad')
    page.locator('.point', has_text='Pre-operacional y limpieza').click()
    def responder(pregunta, valor):
        page.locator('.check-item', has_text=pregunta).get_by_role('radio', name=valor, exact=True).click()
    responder('Superficies en contacto', 'Sí')
    responder('residuos de producto', 'Sí')
    responder('Guardas de seguridad', 'Sí')
    page.locator('.check-item', has_text='Concentración').get_by_role('spinbutton').fill('150')
    expect(page.locator('.check-item.nc')).to_have_count(1)
    expect(page.get_by_role('alert')).to_contain_text('1 punto no conforme')
    page.screenshot(path=f'{SP}/cal-02-checklist-movil.png', full_page=True)
    page.get_by_label('Acción correctiva *').fill('Se limpió de nuevo antes de arrancar')
    page.get_by_role('button', name='Guardar checklist').click()
    expect(page.get_by_text('Checklist “Pre-operacional y limpieza” guardado.')).to_be_visible()
    expect(page.locator('.list-row').first).to_contain_text('1 no conforme')
    ok('checklist con una no conformidad resaltada y acción correctiva')
    assert not page.evaluate('document.documentElement.scrollWidth > window.innerWidth')
    m.close()

    # 2) Administrador en PC: resumen, anulación y exportación
    c = b.new_context(viewport={'width': 1366, 'height': 900}, locale='es-CO', timezone_id='America/Bogota')
    page = c.new_page(); track(page)
    login(page, 'admin', ADMIN_PASS)
    page.locator('.sidebar').get_by_role('link', name='Calidad').click()
    expect(page.locator('.chip-bad', has_text='fuera de rango')).to_contain_text('1')
    expect(page.locator('.chip-bad', has_text='no conformidades')).to_contain_text('1')
    expect(page.locator('.table tbody tr')).to_have_count(4)
    page.screenshot(path=f'{SP}/cal-03-admin.png', full_page=True)
    ok('admin ve las desviaciones del día y los 4 registros')
    page.get_by_label('Solo desviaciones').check()
    expect(page.locator('.table tbody tr')).to_have_count(1)
    page.get_by_label('Solo desviaciones').uncheck()
    fila = page.locator('.table tbody tr', has_text='2,1 °C')
    fila.get_by_role('button', name='Anular').click()
    dlg = page.locator('dialog[open]')
    dlg.get_by_label('Motivo *').fill('Lectura de prueba del día de instalación')
    dlg.get_by_role('button', name='Anular').click()
    expect(page.locator('.table tbody tr', has_text='2,1 °C')).to_contain_text('Anulado: Lectura de prueba')
    ok('anulación con motivo: el registro se conserva y queda marcado')
    with page.expect_download() as dl:
        page.get_by_role('button', name='Exportar temperaturas').click()
    csv = open(dl.value.path(), encoding='utf-8-sig').read()
    assert '6,5;0;4;Sí;Se cerró la puerta' in csv and 'Lectura de prueba del día de instalación' in csv, csv[:400]
    ok('exportación CSV con desviaciones y anulaciones')

    page.get_by_role('link', name='Configuración').click()
    page.locator('.list-row', has_text='Temperatura de cámara').get_by_role('button', name='Editar').click()
    dlg = page.locator('dialog[open]')
    dlg.get_by_label('Máximo (°C)').fill('5')
    page.get_by_role('button', name='Guardar').click()
    expect(page.locator('.list-row', has_text='Temperatura de cámara')).to_contain_text('0 a 5 °C')
    page.get_by_role('button', name='Nueva plantilla').click()
    dlg = page.locator('dialog[open]')
    dlg.get_by_label('Nombre *').fill('Limpieza de cuarto frío')
    dlg.get_by_label('Pregunta 1').fill('¿Piso y paredes sin residuos?')
    dlg.get_by_role('button', name='Agregar pregunta').click()
    dlg.get_by_label('Pregunta 2').fill('Temperatura al terminar (°C)')
    dlg.get_by_label('Tipo de respuesta').nth(1).select_option('NUMERO')
    dlg.get_by_label('Máximo conforme').fill('4')
    page.screenshot(path=f'{SP}/cal-04-plantilla.png')
    page.get_by_role('button', name='Guardar').click()
    expect(page.locator('.list-row', has_text='Limpieza de cuarto frío')).to_contain_text('2 preguntas')
    ok('admin ajusta un límite y crea una plantilla nueva')
    page.goto(BASE + '/configuracion')
    page.get_by_label('Filtrar bitácora').select_option('')
    expect(page.locator('.audit')).to_contain_text('Temperatura fuera de rango')
    c.close()

    # 3) Admin en celular: la barra inferior agrupa lo que no cabe en "Más"
    a = b.new_context(**p.devices['iPhone 13'], locale='es-CO', timezone_id='America/Bogota')
    page = a.new_page(); track(page)
    login(page, 'admin', ADMIN_PASS)
    expect(page.locator('.tabbar .tab-link')).to_have_count(5)
    page.locator('.tabbar').get_by_role('button', name='Más').click()
    page.locator('.more-menu').get_by_role('link', name='Ajustes').click()
    expect(page.get_by_role('heading', name='Ajustes')).to_be_visible()
    expect(page.locator('.tabbar').get_by_role('button', name='Más')).to_have_class(re.compile('active'))
    page.screenshot(path=f'{SP}/cal-05-mas-movil.png')
    ok('admin en celular: 4 pestañas + Más (Inventario y Ajustes)')
    b.close()

print('\n', len(results), 'verificaciones OK. Capturas en', SP)
print('Errores de consola:', errors or 'ninguno')
