"""
Equipos en bodega (comprados sin instalar) en un navegador real: inventario de equipos, registro de 5 molinos
con 2 en bodega, instalar, conteo por área y guardar en bodega una máquina con su preventivo pendiente.
Requiere los datos de demostración recién cargados y el frontend compilado (npm run build && npm run preview).
Uso: python e2e/equipos_en_bodega.py <contraseña-admin>
"""
import sys, re, os, tempfile
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('CMMS_URL', 'http://localhost:4173')
ADMIN_PASS = sys.argv[1]
SP = os.environ.get('SHOTS', tempfile.mkdtemp(prefix='cmms-bodega-'))
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

def elegir(sel, contiene):
    expect(sel.locator('option', has_text=contiene).first).to_be_attached()
    sel.select_option(sel.evaluate('(s, t) => [...s.options].find(o => o.textContent.includes(t)).value', contiene))

with sync_playwright() as p:
    b = p.chromium.launch()
    a = b.new_context(viewport={'width': 1366, 'height': 900}, locale='es-CO', timezone_id='America/Bogota').new_page(); track(a)
    login(a, 'admin', ADMIN_PASS)

    # 1) Inventario de equipos
    a.locator('.sidebar').get_by_role('link', name='Inventario').click()
    a.get_by_role('link', name='Equipos en bodega').click()
    grupo = a.locator('section', has=a.get_by_role('heading', name=re.compile('Molino Javar M-32')))
    expect(grupo).to_contain_text('2 en bodega')
    expect(grupo.locator('.list-row')).to_have_count(2)
    ok('inventario → equipos en bodega: 2 molinos sin instalar, agrupados por tipo')

    # 2) Compra de 5 molinos: 3 se instalan y 2 quedan en bodega
    a.goto(BASE + '/maquinas/nueva')
    a.get_by_label('Código interno *').fill('MOL-004')
    a.get_by_label('Nombre *').fill('Molino de carne')
    elegir(a.get_by_label('Tipo de equipo'), 'Molino Javar M-32')
    a.get_by_label('Área *').fill('Proceso')
    a.get_by_label('Cantidad de equipos iguales').fill('5')
    a.get_by_label('De estos, cuántos quedan en bodega').fill('2')
    expect(a.get_by_text('Los últimos 2 quedan "En bodega (sin instalar)"')).to_be_visible()
    a.screenshot(path=f'{SP}/bod-01-registro.png', full_page=True)
    a.get_by_role('button', name='Registrar 5 equipos').click()
    expect(a.get_by_text('Se registraron 5 equipos')).to_be_visible()
    expect(a.locator('.list-row', has_text='MOL-008')).to_contain_text('En bodega (sin instalar)')
    expect(a.locator('.list-row', has_text='MOL-006')).to_contain_text('Operativo')
    a.goto(BASE + '/inventario/equipos')
    expect(grupo).to_contain_text('4 en bodega')
    a.screenshot(path=f'{SP}/bod-02-inventario.png', full_page=True)
    ok('5 molinos: MOL-004 a 006 operativos y MOL-007, 008 en bodega (4 en el inventario de equipos)')

    # 3) Instalar uno desde el inventario
    grupo.locator('.list-row', has_text='MOL-002').get_by_role('button', name='Instalar').click()
    d = a.locator('dialog[open]')
    expect(d).to_contain_text('Instalar MOL-002')
    d.get_by_label('Área donde se instala *').fill('proceso')
    d.get_by_label('Ubicación').fill('Sala de molienda 2')
    a.locator('dialog[open]').get_by_role('button', name='Instalar').click()
    expect(a.locator('.alert-ok')).to_contain_text('MOL-002 quedó instalado')
    expect(grupo).to_contain_text('3 en bodega')
    a.goto(BASE + '/maquinas')
    expect(a.locator('.list-row', has_text='MOL-002')).to_contain_text('Proceso · Sala de molienda 2')
    expect(a.locator('.list-row', has_text='MOL-002')).to_contain_text('Operativo')
    ok('instalar MOL-002: queda operativo en "Proceso · Sala de molienda 2" y sale del inventario de equipos')

    # 4) Ficha de un equipo en bodega y reporte de fallas
    a.locator('.list-row', has_text='MOL-003').click()
    expect(a.locator('.page-subtitle')).to_contain_text('En bodega (sin instalar)')
    expect(a.get_by_role('button', name='Instalar')).to_be_visible()
    expect(a.get_by_role('link', name='Reportar falla')).to_have_count(0)
    a.goto(BASE + '/ordenes/reportar')
    expect(a.get_by_label('Máquina *').locator('option', has_text='MOL-003')).to_have_count(0)
    expect(a.get_by_label('Máquina *').locator('option', has_text='MOL-002')).to_have_count(1)
    ok('un equipo en bodega se puede instalar pero no recibe reportes de falla')

    # 5) Conteo por área
    a.goto(BASE + '/maquinas/por-area')
    elegir(a.get_by_label('Categoría'), 'Molino')
    expect(a.locator('.respuesta-n')).to_have_text('5')  # MOL-001, 002, 004, 005, 006
    expect(a.locator('.respuesta')).to_contain_text('además 3 en bodega sin instalar')
    expect(a.locator('.table tbody tr').first.locator('td[data-label="En bodega"]')).to_have_text('3')
    a.screenshot(path=f'{SP}/bod-03-por-area.png', full_page=True)
    ok('equipos por área: 5 molinos instalados y 3 en bodega')

    # 6) Guardar en bodega una máquina con su preventivo pendiente
    a.goto(BASE + '/maquinas')
    a.locator('.list-row', has_text='MOL-001').click()
    a.get_by_role('link', name='Editar').click()
    a.get_by_label('Estado').select_option('EN_BODEGA')
    a.get_by_role('button', name='Guardar cambios').click()
    expect(a.locator('.page-subtitle')).to_contain_text('En bodega (sin instalar)')
    a.goto(BASE + '/ordenes?vista=todas&tipo=PREVENTIVO')
    expect(a.locator('.list-row', has_text='MOL-001').first).to_contain_text('Cancelada')
    ok('guardar MOL-001 en bodega cancela su preventivo pendiente')
    b.close()

print('\n', len(results), 'verificaciones OK. Capturas en', SP)
print('Errores de consola:', errors or 'ninguno')
