"""
Preventivos con tareas del catálogo y prioridad (D-31): el jefe escribe las tareas una vez, al crear el plan solo
las marca (o crea una nueva sin salir), elige la prioridad en lugar del técnico y luego asigna cada orden.
Requiere los datos de demostración recién cargados y el frontend compilado (npm run build && npm run preview).
Uso: python e2e/tareas_preventivo.py <contraseña-admin>
"""
import sys, re, os, tempfile
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('CMMS_URL', 'http://localhost:4173')
ADMIN_PASS = sys.argv[1]
SP = os.environ.get('SHOTS', tempfile.mkdtemp(prefix='cmms-tareas-'))
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

def elegir(sel, contiene):
    expect(sel.locator('option', has_text=contiene)).to_be_attached()
    sel.select_option(sel.evaluate(f"s => [...s.options].find(o => o.textContent.includes('{contiene}')).value"))

with sync_playwright() as p:
    b = p.chromium.launch()
    a = b.new_context(viewport={'width': 1366, 'height': 900}, locale='es-CO', timezone_id='America/Bogota').new_page(); track(a)
    ingresar(a, 'admin', ADMIN_PASS)

    # 1) Catálogo de tareas
    a.goto(BASE + '/ordenes/planes')
    a.locator('.tabs').get_by_role('link', name='Tareas').click()
    expect(a).to_have_url(re.compile('/ordenes/tareas'))
    expect(a.locator('.tareas-grupo', has_text='Lubricación')).to_contain_text('Lubricar rodamientos')
    expect(a.locator('.list-row', has_text='Lubricar rodamientos')).to_contain_text('En 1 plan')
    a.get_by_role('button', name='Nueva tarea').click()
    d = a.locator('dialog[open]')
    d.get_by_label('Tarea *').fill('Revisar sellos de la tolva')
    d.get_by_label('Grupo').fill('Mecánico')
    d.get_by_role('button', name='Crear tarea').click()
    expect(a.locator('dialog[open]')).to_have_count(0)
    expect(a.locator('.tareas-grupo', has_text='Mecánico')).to_contain_text('Revisar sellos de la tolva')
    a.get_by_role('button', name='Nueva tarea').click()
    a.locator('dialog[open]').get_by_label('Tarea *').fill('lubricar RODAMIENTOS')
    a.locator('dialog[open]').get_by_role('button', name='Crear tarea').click()
    expect(a.locator('dialog[open]')).to_contain_text('Ya existe la tarea "Lubricar rodamientos"')
    a.locator('dialog[open]').get_by_role('button', name='Cancelar').click()
    a.screenshot(path=f'{SP}/tar-01-catalogo.png', full_page=True)
    ok('catálogo agrupado; se crea "Revisar sellos de la tolva" y no deja repetir una tarea')

    # 2) Nuevo plan: se marcan las tareas, se crea una sin salir y se elige la prioridad (sin técnico)
    a.goto(BASE + '/ordenes/planes')
    a.get_by_role('button', name='Nuevo plan').click()
    d = a.locator('dialog[open]')
    expect(d.get_by_label('Técnico responsable')).to_have_count(0)
    elegir(d.get_by_label('Máquina *'), 'EMB-002')
    d.get_by_label('Nombre *').fill('Mantenimiento mensual embutidora')
    d.get_by_label('Revisar holguras y ajustar tornillería').check()
    d.get_by_label('Lubricar rodamientos').check()
    d.get_by_role('button', name='Crear una tarea nueva').click()
    n = a.locator('dialog[open]', has_text='Nueva tarea de mantenimiento')
    n.get_by_label('Tarea *').fill('Purgar la bomba de vacío')
    n.get_by_label('Grupo').fill('Mecánico')
    n.get_by_role('button', name='Crear tarea').click()
    expect(a.locator('dialog[open]', has_text='Nueva tarea de mantenimiento')).to_have_count(0)
    elegidas = d.locator('.tareas-elegidas li')
    expect(elegidas).to_have_count(3)
    expect(elegidas.nth(2)).to_contain_text('Purgar la bomba de vacío')
    d.get_by_role('button', name='Subir Lubricar rodamientos').click()
    expect(elegidas.nth(0)).to_contain_text('Lubricar rodamientos')
    d.get_by_label('Prioridad *').select_option('ALTA')
    a.screenshot(path=f'{SP}/tar-02-plan.png', full_page=True)
    d.get_by_role('button', name='Crear plan').click()
    expect(a.locator('dialog[open]')).to_have_count(0)
    fila = a.locator('.list-row', has_text='Mantenimiento mensual embutidora')
    expect(fila).to_contain_text('Prioridad alta')
    expect(fila.locator('.plan-tareas li')).to_have_count(3)
    expect(fila.locator('.plan-tareas li').first).to_have_text('Lubricar rodamientos')
    a.screenshot(path=f'{SP}/tar-03-planes.png', full_page=True)
    ok('plan de EMB-002: 3 tareas marcadas (una creada ahí mismo), reordenadas, prioridad alta y sin técnico')

    # 3) La orden sale abierta con prioridad alta y las tareas numeradas; el jefe la asigna
    a.goto(BASE + '/ordenes?tipo=PREVENTIVO')
    a.locator('.list-row', has_text='EMB-002').first.click()
    expect(a.locator('.desc')).to_contain_text('1. Lubricar rodamientos')
    expect(a.locator('.desc')).to_contain_text('3. Purgar la bomba de vacío')
    expect(a.locator('main')).to_contain_text('Alta')
    a.get_by_role('button', name='Asignar', exact=True).click()
    elegir(a.locator('dialog[open]').get_by_label('Técnico'), 'Técnico Demo')
    a.locator('dialog[open]').get_by_role('button', name='Asignar').click()
    expect(a.locator('dialog[open]')).to_have_count(0)
    expect(a.locator('main')).to_contain_text('Técnico Demo')
    a.screenshot(path=f'{SP}/tar-04-orden.png', full_page=True)
    ok('la orden preventiva sale con prioridad alta y las tareas numeradas; el jefe la asigna a Técnico Demo')

    # 4) Desactivar una tarea usada: no se ofrece en planes nuevos pero el plan que la tiene la conserva
    a.goto(BASE + '/ordenes/tareas')
    fila_t = a.locator('.list-row', has_text='Purgar la bomba de vacío')
    expect(fila_t).to_contain_text('En 1 plan')
    expect(fila_t.get_by_role('button', name='Eliminar')).to_have_count(0)
    fila_t.get_by_role('button', name='Desactivar').click()
    expect(fila_t).to_contain_text('Desactivada')
    a.locator('.list-row', has_text='Revisar sellos de la tolva').get_by_role('button', name='Eliminar').click()
    a.locator('dialog[open]').get_by_role('button', name='Eliminar').click()
    expect(a.locator('.list-row', has_text='Revisar sellos de la tolva')).to_have_count(0)
    a.goto(BASE + '/ordenes/planes')
    a.get_by_role('button', name='Nuevo plan').click()
    expect(a.locator('dialog[open]').get_by_label('Purgar la bomba de vacío')).to_have_count(0)
    a.locator('dialog[open]').get_by_role('button', name='Cancelar').click()
    a.locator('.list-row', has_text='Mantenimiento mensual embutidora').get_by_role('button', name='Editar').click()
    expect(a.locator('dialog[open] .tareas-elegidas')).to_contain_text('Purgar la bomba de vacío (desactivada)')
    a.locator('dialog[open]').get_by_role('button', name='Guardar').click()
    expect(a.locator('dialog[open]')).to_have_count(0)
    ok('tarea usada: se desactiva (no se borra) y el plan la conserva; una sin usar se elimina')

    # 5) El técnico consulta las tareas pero no las edita (celular)
    m = b.new_context(viewport={'width': 412, 'height': 900}, locale='es-CO', timezone_id='America/Bogota').new_page(); track(m)
    ingresar(m, 'tecnico', '4826')
    m.goto(BASE + '/ordenes/tareas')
    expect(m.locator('.list-row', has_text='Lubricar rodamientos')).to_be_visible()
    expect(m.get_by_role('button', name='Nueva tarea')).to_have_count(0)
    expect(m.get_by_role('button', name='Editar')).to_have_count(0)
    m.screenshot(path=f'{SP}/tar-05-tecnico.png', full_page=True)
    ok('el técnico ve el catálogo de tareas en el celular, sin poder editarlo')
    b.close()

print('\n', len(results), 'verificaciones OK. Capturas en', SP)
print('Errores de consola:', errors or 'ninguno')
