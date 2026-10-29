"""
Tipos de equipo en un navegador real: lista de materiales, equipos iguales registrados de una vez,
conteo por área (¿cuántos aires acondicionados hay en Bodega?), preventivo por tipo y materiales en correctivos.
Requiere los datos de demostración recién cargados y el frontend compilado (npm run build && npm run preview).
Uso: python e2e/tipos_equipo.py <contraseña-admin>
"""
import sys, re, os, tempfile
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('CMMS_URL', 'http://localhost:4173')
ADMIN_PASS = sys.argv[1]
SP = os.environ.get('SHOTS', tempfile.mkdtemp(prefix='cmms-tipos-'))
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
    valor = sel.evaluate('(s, t) => [...s.options].find(o => o.textContent.includes(t)).value', contiene)
    sel.select_option(valor)

with sync_playwright() as p:
    b = p.chromium.launch()
    pc = b.new_context(viewport={'width': 1366, 'height': 900}, locale='es-CO', timezone_id='America/Bogota', accept_downloads=True)
    a = pc.new_page(); track(a)
    login(a, 'admin', ADMIN_PASS)

    # 1) Tipos de equipo con su lista de materiales
    a.locator('.sidebar').get_by_role('link', name='Máquinas').click()
    a.get_by_role('link', name='Tipos de equipo').click()
    grupo = a.locator('section', has=a.get_by_role('heading', name=re.compile('Aire acondicionado')))
    expect(grupo.locator('.tipo-row', has_text='Mini split 12.000 BTU')).to_contain_text('RP-FIL-MS12 × 2 UND')
    expect(grupo.locator('.tipo-row', has_text='Mini split 12.000 BTU')).to_contain_text('4 equipos')
    a.get_by_role('button', name='Nuevo tipo').click()
    d = a.locator('dialog[open]')
    d.get_by_label('Categoría *').fill('Aire acondicionado')
    d.get_by_label('Modelo *').fill('Mini split 24.000 BTU')
    d.get_by_label('Fabricante', exact=True).fill('LG')
    d.get_by_role('button', name='Agregar repuesto').click()
    elegir(d.get_by_label('Repuesto', exact=True).last, 'RP-FIL-MS12')
    d.get_by_label('Cantidad', exact=True).last.fill('3')
    a.screenshot(path=f'{SP}/tipo-01-nuevo.png')
    a.locator('dialog[open]').get_by_role('button', name='Crear tipo').click()
    expect(a.locator('dialog[open]')).to_have_count(0)
    expect(grupo.locator('.tipo-row')).to_have_count(2)
    expect(grupo.locator('.tipo-row', has_text='Mini split 24.000 BTU')).to_contain_text('RP-FIL-MS12 × 3 UND')
    a.screenshot(path=f'{SP}/tipo-02-lista.png', full_page=True)
    ok('tipos de equipo agrupados por categoría con su lista de materiales; se crea un modelo nuevo')

    # 2) Tres aires iguales de una vez
    a.goto(BASE + '/maquinas/nueva')
    a.get_by_label('Código interno *').fill('AA-010')
    a.get_by_label('Nombre *').fill('Aire acondicionado mini split')
    elegir(a.get_by_label('Tipo de equipo'), 'Mini split 12.000 BTU')
    expect(a.get_by_label('Fabricante', exact=True)).to_have_value('Samsung')
    a.get_by_label('Área *').fill('bodega')
    a.get_by_label('Cantidad de equipos iguales').fill('3')
    expect(a.get_by_text('Se crearán 3: AA-010 a AA-012')).to_be_visible()
    expect(a.get_by_label('N.° de serie')).to_have_count(0)
    a.screenshot(path=f'{SP}/tipo-03-varios.png', full_page=True)
    a.get_by_role('button', name='Registrar 3 equipos').click()
    expect(a.get_by_text('Se registraron 3 equipos')).to_be_visible()
    for c in ['AA-010', 'AA-011', 'AA-012']:
        expect(a.locator('.list-row', has_text=c)).to_contain_text('Aire acondicionado · Mini split 12.000 BTU')
    expect(a.locator('.list-row', has_text='AA-011')).to_contain_text('Bodega')  # "bodega" se guarda como el área existente
    ok('registra 3 aires iguales (AA-010 a AA-012) con el tipo y el área existente "Bodega"')

    # 3) ¿Cuántos aires acondicionados hay en Bodega?
    a.get_by_role('link', name='Equipos por área').click()
    expect(a).to_have_url(re.compile('/maquinas/por-area'))
    expect(a.locator('.respuesta-n')).to_be_visible()
    a.get_by_label('Área').select_option('Bodega')
    elegir(a.get_by_label('Categoría'), 'Aire acondicionado')
    expect(a.locator('.respuesta-n')).to_have_text('6')
    expect(a.locator('.respuesta')).to_contain_text('Aire acondicionado en Bodega')
    a.screenshot(path=f'{SP}/tipo-04-por-area.png', full_page=True)
    with a.expect_download() as dl:
        a.get_by_role('button', name='Exportar').click()
    assert dl.value.suggested_filename == 'equipos-por-area.csv'
    a.get_by_label('Área').select_option('')
    expect(a.locator('.table')).to_contain_text('Oficinas')
    a.locator('.respuesta').get_by_role('link', name='Ver la lista').click()
    expect(a.locator('.list-row')).to_have_count(7)
    ok('equipos por área: 6 aires en Bodega; exporta a Excel; "Ver la lista" filtra los 7 aires')

    # 4) Preventivo por tipo: se aplica a los 7 aires con su lista de materiales
    a.goto(BASE + '/ordenes/planes')
    a.get_by_role('button', name='Nuevo plan').click()
    d = a.locator('dialog[open]')
    d.get_by_role('radio', name='Todos los de un tipo').click()
    elegir(d.get_by_label('Tipo de equipo *'), 'Mini split 12.000 BTU')
    expect(d.get_by_text('Se crea el plan de los 7 equipos')).to_be_visible()
    expect(d.get_by_label('Repuesto', exact=True)).to_have_count(2)  # la lista de materiales se carga sola
    d.get_by_label('Nombre *').fill('Limpieza de filtros y revisión de gas')
    d.get_by_label('Cada *').fill('2')
    elegir(d.get_by_label('Técnico responsable'), 'Técnico Demo')
    a.screenshot(path=f'{SP}/tipo-05-plan-tipo.png', full_page=True)
    a.locator('dialog[open]').get_by_role('button', name='Crear plan').click()
    expect(a.locator('dialog[open]')).to_have_count(0)
    fila = a.locator('.list-row', has_text='Limpieza de filtros')
    expect(fila).to_contain_text('Mini split 12.000 BTU · 7 equipos')
    expect(fila).to_contain_text('Por tipo')
    fila.get_by_role('button', name='Ver los 7 equipos').click()
    expect(fila.locator('.plan-equipos li')).to_have_count(7)
    a.screenshot(path=f'{SP}/tipo-06-planes.png', full_page=True)
    a.goto(BASE + '/ordenes?tipo=PREVENTIVO')
    a.locator('.list-row', has_text='AA-012').first.click()
    expect(a.locator('.card', has_text='Repuestos').first).to_contain_text('RP-FIL-MS12')
    expect(a.locator('.card', has_text='Repuestos').first).to_contain_text('RP-GAS-410')
    ok('preventivo por tipo: 7 planes y 7 órdenes, cada una con la lista de materiales')

    a.goto(BASE + '/maquinas')
    a.locator('.list-row', has_text='AA-001').click()
    expect(a.locator('main')).to_contain_text('Aire acondicionado · Mini split 12.000 BTU')
    expect(a.locator('.materiales')).to_contain_text('RP-GAS-410')
    ok('la ficha de la máquina muestra su tipo y su lista de materiales')

    # 5) Correctivo: el técnico ve la lista del equipo al reportar y al cerrar
    cel = b.new_context(**p.devices['Pixel 7'], locale='es-CO', timezone_id='America/Bogota')
    t = cel.new_page(); track(t)
    login(t, 'tecnico', '4826')
    t.goto(BASE + '/ordenes/reportar')
    elegir(t.get_by_label('Máquina *'), 'AA-002')
    t.get_by_label('¿Qué pasó? *').fill('No enfría la bodega de insumos')
    sug = t.locator('.sugeridos')
    expect(sug).to_contain_text('Lista de materiales · Mini split 12.000 BTU')
    sug.get_by_role('button', name=re.compile('Agregar RP-GAS-410')).click()
    expect(t.get_by_label('Repuesto', exact=True)).to_have_count(1)
    expect(sug.get_by_role('button', name=re.compile('Ya agregado RP-GAS-410'))).to_be_disabled()
    t.screenshot(path=f'{SP}/tipo-07-reporte-tecnico.png', full_page=True)
    t.get_by_role('button', name='Enviar reporte').click()
    expect(t.get_by_text(re.compile(r'Falla reportada como OT-\d{6}'))).to_be_visible()
    expect(t.locator('.card', has_text='Repuestos').first).to_contain_text('RP-GAS-410')
    t.get_by_role('button', name='Tomar esta orden').click()
    expect(t.locator('.page-subtitle')).to_contain_text('Asignada')
    t.get_by_role('button', name='Iniciar trabajo').click()
    t.get_by_role('button', name='Cerrar orden').first.click()
    d = t.locator('dialog[open]')
    expect(d.locator('.sugeridos')).to_contain_text('Mini split 12.000 BTU')
    d.locator('.sugeridos').get_by_role('button', name=re.compile('Agregar RP-FIL-MS12')).click()
    expect(d.get_by_label('Repuesto', exact=True)).to_have_count(2)
    d.get_by_label('Trabajo realizado *').fill('Se cambiaron filtros y se recargó gas')
    d.get_by_label('Horas').first.fill('1')
    t.screenshot(path=f'{SP}/tipo-08-cierre-tecnico.png', full_page=True)
    t.locator('dialog[open]').get_by_role('button', name='Cerrar orden').click()
    expect(t.locator('.page-subtitle')).to_contain_text('Cerrada')
    ok('técnico: al reportar y al cerrar el correctivo se despliega la lista de materiales del equipo')

    # 6) El operario reporta sin la sección de materiales
    o = b.new_context(**p.devices['iPhone 13'], locale='es-CO', timezone_id='America/Bogota').new_page(); track(o)
    login(o, 'operario', '7391')
    o.goto(BASE + '/ordenes/reportar')
    elegir(o.get_by_label('Máquina *'), 'AA-003')
    expect(o.locator('.sugeridos')).to_have_count(0)
    expect(o.get_by_text('Materiales que se van a necesitar')).to_have_count(0)
    o.goto(BASE + '/maquinas/tipos')
    expect(o.get_by_role('button', name='Nuevo tipo')).to_have_count(0)
    expect(o.get_by_role('link', name='Equipos por área')).to_have_count(0)
    assert o.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
    ok('operario: reporte corto sin materiales; ve los tipos pero no los edita')
    b.close()

print('\n', len(results), 'verificaciones OK. Capturas en', SP)
print('Errores de consola:', errors or 'ninguno')
