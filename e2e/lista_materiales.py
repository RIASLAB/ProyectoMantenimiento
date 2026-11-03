"""
Lista de materiales de cada máquina (D-30), creada desde su ficha eligiendo solo repuestos y cantidades:
una máquina sin tipo la crea; una con tipo usa la del tipo hasta que se le hace la propia, sin cambiar las demás;
y la propia es la que se sugiere en sus órdenes. Requiere los datos de demostración recién cargados y el frontend compilado.
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

def elegir(fila, codigo):
    sel = fila.get_by_label('Repuesto', exact=True)
    expect(sel.locator('option', has_text=codigo)).to_be_attached()
    sel.select_option(sel.evaluate(f"s => [...s.options].find(o => o.textContent.includes('{codigo}')).value"))

with sync_playwright() as p:
    b = p.chromium.launch()
    a = b.new_context(viewport={'width': 1366, 'height': 900}, locale='es-CO', timezone_id='America/Bogota').new_page(); track(a)
    login(a, 'admin', ADMIN_PASS)

    # 1) Máquina sin tipo: se crea su lista sin llenar tipo ni modelo
    ficha(a, 'HRN-001')
    lista = a.locator('.materiales')
    expect(lista).to_contain_text('Esta máquina aún no tiene lista de materiales')
    lista.get_by_role('button', name='Crear lista de materiales').click()
    d = a.locator('dialog[open]')
    expect(d).to_contain_text('No hace falta llenar tipo ni modelo')
    expect(d.get_by_label('Modelo')).to_have_count(0)
    filas = d.locator('.part-row')
    expect(filas).to_have_count(1)
    elegir(filas.first, 'RP-ROD-6205')
    filas.first.get_by_label('Cantidad').fill('2')
    d.get_by_role('button', name='Agregar repuesto').click()
    elegir(filas.last, 'RP-ACE-GA')
    filas.last.get_by_label('Cantidad').fill('0.5')
    a.screenshot(path=f'{SP}/mat-01-crear.png', full_page=True)
    d.get_by_role('button', name='Guardar lista').click()
    expect(a.locator('dialog[open]')).to_have_count(0)
    expect(lista).to_contain_text('Lista de materiales de esta máquina')
    expect(lista.locator('li')).to_have_count(2)
    expect(lista).to_contain_text('RP-ROD-6205')
    a.screenshot(path=f'{SP}/mat-02-ficha.png', full_page=True)
    ok('HRN-001 (sin tipo): lista creada desde la ficha con solo repuestos y cantidades')

    # 2) Máquina con tipo: usa la del tipo; al editarla queda con la suya sin tocar las demás
    ficha(a, 'MOL-001')
    expect(lista).to_contain_text('Lista de materiales · Molino Javar M-32')
    expect(lista.locator('li')).to_have_count(3)
    lista.get_by_role('button', name='Editar lista').click()
    d = a.locator('dialog[open]')
    filas = d.locator('.part-row')
    expect(filas).to_have_count(3)
    filas.filter(has=a.locator('option:checked', has_text='RP-PLACA-8')).get_by_role('button', name='Quitar repuesto').click()
    expect(filas).to_have_count(2)
    d.get_by_role('button', name='Guardar lista').click()
    expect(a.locator('dialog[open]')).to_have_count(0)
    expect(lista).to_contain_text('Lista de materiales de esta máquina')
    expect(lista.locator('li')).to_have_count(2)
    expect(lista).not_to_contain_text('RP-PLACA-8')
    ficha(a, 'MOL-002')
    expect(a.locator('.materiales')).to_contain_text('RP-PLACA-8')
    ok('MOL-001 queda con su propia lista; MOL-002 y el tipo conservan la del tipo')

    # 3) La lista de la máquina es la que se sugiere en su orden
    a.goto(BASE + '/ordenes/reportar')
    maq = a.get_by_label('Máquina *')
    expect(maq.locator('option', has_text='HRN-001')).to_be_attached()
    maq.select_option(maq.evaluate("s => [...s.options].find(o => o.textContent.includes('HRN-001')).value"))
    expect(a.locator('.sugeridos')).to_contain_text('Lista de materiales de la máquina · HRN-001')
    expect(a.locator('.sugeridos')).to_contain_text('RP-ROD-6205')
    ok('al reportar una falla de HRN-001 se sugieren los materiales de su lista')

    # 4) Volver a la lista del tipo
    ficha(a, 'MOL-001')
    lista.get_by_role('button', name='Usar la lista del tipo Molino Javar M-32').click()
    expect(lista).to_contain_text('Lista de materiales · Molino Javar M-32')
    expect(lista.locator('li')).to_have_count(3)
    ok('MOL-001 vuelve a usar la lista de su tipo')
    b.close()

print('\n', len(results), 'verificaciones OK. Capturas en', SP)
print('Errores de consola:', errors or 'ninguno')
