"""
Lista de materiales editable desde la ficha de la máquina: quitar y agregar materiales, y que el cambio
aplique a todas las máquinas del tipo. Requiere los datos de demostración recién cargados y el frontend compilado.
Uso: python e2e/lista_materiales.py <contraseña-admin>
"""
import sys, re, os, tempfile
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('CMMS_URL', 'http://localhost:4173')
ADMIN_PASS = sys.argv[1]
SP = os.environ.get('SHOTS', tempfile.mkdtemp(prefix='cmms-materiales-'))
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

def ficha(page, codigo):
    page.goto(BASE + '/maquinas')
    page.locator('.list-row', has_text=codigo).first.click()
    expect(page.locator('.page-subtitle')).to_contain_text(codigo)

with sync_playwright() as p:
    b = p.chromium.launch()
    a = b.new_context(viewport={'width': 1366, 'height': 900}, locale='es-CO', timezone_id='America/Bogota').new_page(); track(a)
    login(a, 'admin', ADMIN_PASS)

    # 1) La ficha muestra la lista y el botón para editarla
    ficha(a, 'MOL-001')
    lista = a.locator('.materiales')
    expect(lista).to_contain_text('Lista de materiales · Molino Javar M-32')
    expect(lista.locator('li')).to_have_count(3)
    expect(lista).to_contain_text('RP-PLACA-8')
    ok('ficha de MOL-001: lista de materiales con 3 materiales y botón Editar lista')

    # 2) Quitar un material y agregar otro
    lista.get_by_role('button', name='Editar lista').click()
    d = a.locator('dialog[open]')
    expect(d).to_contain_text('Editar tipo de equipo')
    filas = d.locator('.part-row')
    expect(filas).to_have_count(3)
    fila_placa = filas.filter(has=a.locator('option:checked', has_text='RP-PLACA-8'))
    fila_placa.get_by_role('button', name='Quitar repuesto').click()
    expect(filas).to_have_count(2)
    d.get_by_role('button', name='Agregar repuesto').click()
    nueva = filas.last
    sel = nueva.get_by_label('Repuesto', exact=True)
    expect(sel.locator('option', has_text='RP-ACE-GA')).to_be_attached()
    sel.select_option(sel.evaluate("s => [...s.options].find(o => o.textContent.includes('RP-ACE-GA')).value"))
    nueva.get_by_label('Cantidad').fill('0.5')
    a.screenshot(path=f'{SP}/mat-01-editar.png', full_page=True)
    d.get_by_role('button', name='Guardar').click()
    expect(a.locator('dialog[open]')).to_have_count(0)
    expect(lista.locator('li')).to_have_count(3)
    expect(lista).not_to_contain_text('RP-PLACA-8')
    expect(lista).to_contain_text('RP-ACE-GA')
    a.screenshot(path=f'{SP}/mat-02-ficha.png', full_page=True)
    ok('quitar RP-PLACA-8 y agregar RP-ACE-GA × 0,5 desde la ficha')

    # 3) Aplica a las demás máquinas del mismo tipo
    ficha(a, 'MOL-002')
    expect(a.locator('.materiales')).to_contain_text('RP-ACE-GA')
    expect(a.locator('.materiales')).not_to_contain_text('RP-PLACA-8')
    a.goto(BASE + '/maquinas/tipos')
    expect(a.locator('.tipo-row', has_text='Molino Javar M-32')).to_contain_text('RP-ACE-GA')
    ok('el cambio aplica a MOL-002 y al tipo Molino Javar M-32')

    # 4) Vaciar la lista
    ficha(a, 'MOL-001')
    a.locator('.materiales').get_by_role('button', name='Editar lista').click()
    d = a.locator('dialog[open]')
    while d.locator('.part-row').count():
        d.locator('.part-row').first.get_by_role('button', name='Quitar repuesto').click()
    d.get_by_role('button', name='Guardar').click()
    expect(a.locator('.materiales')).to_contain_text('El tipo aún no tiene lista de materiales')
    ok('se puede eliminar la lista completa')

    # 5) Máquina sin tipo: indica cómo tener lista
    ficha(a, 'HRN-001')
    expect(a.locator('.materiales')).to_contain_text('no tiene tipo de equipo')
    expect(a.locator('.materiales').get_by_role('link', name='Editar')).to_be_visible()
    ok('máquina sin tipo: indica asignarle un tipo para tener lista de materiales')
    b.close()

print('\n', len(results), 'verificaciones OK. Capturas en', SP)
print('Errores de consola:', errors or 'ninguno')
