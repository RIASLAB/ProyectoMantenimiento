"""
Flujo de órdenes de trabajo en un navegador real: operario (celular) → administrador (PC) → técnico (celular).
Requiere los datos de demostración recién cargados (npm run seed -- --demo con SEED_ADMIN_PASSWORD).
Uso: python e2e/ordenes.py <contraseña-admin>
"""
import sys, re, os, tempfile
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('CMMS_URL', 'http://localhost:4173')
ADMIN_PASS = sys.argv[1]
SP = os.environ.get('SHOTS', tempfile.mkdtemp(prefix='cmms-ot-'))
JPG = os.path.join(SP, 'falla.jpg')
open(JPG, 'wb').write(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]) + b'\x00' * 64)
errors, results = [], []

def ok(n):
    results.append(n); print('OK  ', n)

def track(page):
    page.on('pageerror', lambda e: errors.append(f'{page.url}: {e}'))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(f'{page.url}: {m.text}'))

def login(page, u, c, landing):
    page.goto(BASE + '/ingresar')
    page.get_by_label('Usuario').fill(u)
    page.get_by_label('Contraseña o PIN').fill(c)
    page.get_by_role('button', name='Ingresar').click()
    expect(page).to_have_url(re.compile('/ordenes'))
    expect(page.locator('main h1')).to_have_text(landing)

with sync_playwright() as p:
    b = p.chromium.launch()

    # 1) Operario en celular reporta una falla con máquina parada y foto
    m = b.new_context(**p.devices['Pixel 7'], locale='es-CO', timezone_id='America/Bogota')
    page = m.new_page(); track(page)
    login(page, 'operario', '7391', 'Mis reportes de falla')
    expect(page.locator('.list-row')).to_have_count(1)  # la falla de demostración que él reportó
    page.locator('.fab').click()
    expect(page.get_by_role('heading', name='Reportar falla')).to_be_visible()
    page.get_by_label('Máquina *').select_option(label='MOL-001 · Molino de carne')
    page.get_by_text('¿La máquina quedó parada?').click()
    page.get_by_label('¿Qué pasó? *').fill('Se trabó el tornillo sinfín y huele a quemado')
    page.get_by_label('Foto (opcional)').set_input_files(JPG)
    page.screenshot(path=f'{SP}/ot-01-reportar.png', full_page=True)
    page.get_by_role('button', name='Enviar reporte').click()
    expect(page.get_by_text(re.compile(r'Falla reportada como OT-\d{6}'))).to_be_visible()
    expect(page.locator('.page-subtitle')).to_contain_text('Máquina parada')
    expect(page.locator('.photo')).to_have_count(1)
    expect(page.locator('.photo img')).to_be_visible()
    codigo = re.search(r'OT-\d{6}', page.locator('h1').inner_text()).group(0)
    ok(f'operario reporta {codigo} desde el celular con foto y máquina parada')
    page.screenshot(path=f'{SP}/ot-02-reportada-movil.png', full_page=True)
    assert not page.evaluate('document.documentElement.scrollWidth > window.innerWidth')
    expect(page.locator('.action-bar')).to_have_count(0)
    ok('el operario no ve acciones de ejecución')
    m.close()

    # 2) Administrador en PC: ve la máquina parada y asigna al técnico
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='es-CO', timezone_id='America/Bogota')
    page = ctx.new_page(); track(page)
    login(page, 'admin', ADMIN_PASS, 'Mantenimiento')
    expect(page.locator('.chip-bad').first).to_contain_text('1 máquina parada')
    expect(page.locator('.list-row').first).to_contain_text(codigo)  # las paradas van primero
    page.screenshot(path=f'{SP}/ot-03-lista-admin.png')
    ok('admin ve la máquina parada primero en la lista')
    page.locator('.list-row').first.click()
    page.get_by_role('button', name='Asignar').click()
    dlg = page.locator('dialog[open]')
    dlg.get_by_label('Técnico').select_option(label='Técnico Demo')
    dlg.get_by_role('button', name='Asignar').click()
    expect(page.locator('dialog[open]')).to_have_count(0)
    expect(page.locator('.timeline')).to_contain_text('Asignada a Técnico Demo')
    ok('admin asigna la orden')
    page.goto(BASE + '/maquinas')
    expect(page.locator('.list-row', has_text='MOL-001')).to_contain_text('Fuera de servicio')
    ok('la máquina queda fuera de servicio automáticamente')

    # 3) Técnico en celular: inicia y cierra con repuestos y horas
    t = b.new_context(**p.devices['iPhone 13'], locale='es-CO', timezone_id='America/Bogota')
    tp = t.new_page(); track(tp)
    login(tp, 'tecnico', '4826', 'Mantenimiento')
    tp.get_by_label('Solo mías').check()
    tp.locator('.list-row', has_text=codigo).click()
    tp.get_by_role('button', name='Iniciar trabajo').click()
    expect(tp.get_by_role('button', name='Cerrar orden')).to_be_visible()
    tp.get_by_role('button', name='Cerrar orden').click()
    dlg = tp.locator('dialog[open]')
    dlg.get_by_label('Trabajo realizado *').fill('Se desarmó el sinfín, se cambió el rodamiento y se lubricó')
    dlg.get_by_role('button', name='Agregar repuesto').click()
    dlg.get_by_label('Repuesto', exact=True).last.select_option(label='RP-ROD-6205 · Rodamiento 6205-2RS (stock 3 UND)')
    dlg.get_by_label('Cantidad', exact=True).last.fill('1')
    dlg.get_by_label('Horas').first.fill('2')
    tp.screenshot(path=f'{SP}/ot-04-cerrar-movil.png')
    tp.get_by_role('button', name='Cerrar orden').last.click()
    expect(tp.locator('dialog[open]')).to_have_count(0)
    expect(tp.locator('.page-subtitle')).to_contain_text('Cerrada')
    expect(tp.get_by_text('$ 50.000')).to_be_visible()  # 2 h × 25.000
    ok('técnico cierra desde el celular: mano de obra 2 h × $25.000')
    tp.screenshot(path=f'{SP}/ot-05-cerrada-movil.png', full_page=True)
    t.close()

    # 4) Admin: máquina operativa, hoja de vida con costo, stock descontado
    page.goto(BASE + '/maquinas')
    page.locator('.list-row', has_text='MOL-001').click()
    expect(page.locator('.page-subtitle')).to_contain_text('Operativo')
    expect(page.locator('.stat').first).to_contain_text('$ 68.500')  # 18.500 repuesto + 50.000 mano de obra
    expect(page.locator('.list-row', has_text=codigo)).to_contain_text('Cerrada')
    page.screenshot(path=f'{SP}/ot-06-hoja-de-vida.png', full_page=True)
    ok('hoja de vida: máquina operativa y costo acumulado $68.500')
    page.goto(BASE + '/inventario')
    expect(page.locator('.list-row', has_text='RP-ROD-6205')).to_contain_text('2')
    ok('el rodamiento se descontó del inventario (3 → 2)')

    # 5) Planes preventivos
    page.goto(BASE + '/ordenes/planes')
    expect(page.locator('.list-row')).to_have_count(1)
    page.get_by_role('button', name='Nuevo plan').click()
    dlg = page.locator('dialog[open]')
    dlg.get_by_label('Máquina *').select_option(label='CF-001 · Cuarto frío de producto terminado')
    dlg.get_by_label('Nombre *').fill('Limpieza de condensador')
    dlg.get_by_label('Cada *').fill('2')
    dlg.get_by_label('Unidad *').select_option('SEMANAS')
    dlg.get_by_label('Técnico responsable').select_option(label='Técnico Demo')
    page.get_by_role('button', name='Crear plan').click()
    expect(page.locator('dialog[open]')).to_have_count(0)
    expect(page.locator('.list-row')).to_have_count(2)
    expect(page.get_by_text('Cada 2 semanas')).to_be_visible()
    page.screenshot(path=f'{SP}/ot-07-planes.png')
    page.goto(BASE + '/ordenes?tipo=PREVENTIVO')
    expect(page.locator('.list-row', has_text='CF-001')).to_contain_text('Vence hoy')
    ok('nuevo plan genera su primera orden preventiva (vence hoy)')
    page.get_by_role('link', name='Ajustes').first.click()
    expect(page.get_by_label('Tarifa por hora (COP)')).to_have_value('25000')
    page.get_by_label('Filtrar bitácora').select_option('orden')
    ok('ajustes: tarifa de mano de obra visible')
    b.close()

print('\n', len(results), 'verificaciones OK. Capturas en', SP)
print('Errores de consola:', errors or 'ninguno')
