"""
Prueba de los flujos principales en el navegador (escritorio y celular).
Requiere: pip install playwright && playwright install chromium
Uso: con la API y el frontend corriendo y los datos de demostración recién cargados
     (npm run seed -- --demo con SEED_ADMIN_PASSWORD definido):
     python e2e/flujos.py <contraseña-admin>
Las capturas quedan en una carpeta temporal que se imprime al final.
"""
import sys, re
from playwright.sync_api import sync_playwright, expect

BASE = 'http://localhost:4173'
import tempfile, os
BASE = os.environ.get('CMMS_URL', BASE)
SP = tempfile.mkdtemp(prefix='cmms-e2e-')
ADMIN_PASS = sys.argv[1]
PDF = SP + '/manual.pdf'
open(PDF, 'wb').write(b'%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')
errors = []
results = []

def ok(name):
    results.append(name); print('OK  ', name)

def track(page):
    page.on('console', lambda m: m.type == 'error' and errors.append(f'{page.url}: {m.text}'))
    page.on('pageerror', lambda e: errors.append(f'{page.url}: {e}'))

with sync_playwright() as p:
    b = p.chromium.launch()

    # ---------------- Escritorio, administrador ----------------
    ctx = b.new_context(viewport={'width': 1366, 'height': 860}, locale='es-CO', timezone_id='America/Bogota')
    page = ctx.new_page(); track(page)
    page.goto(BASE + '/maquinas')
    expect(page).to_have_url(re.compile('/ingresar'))
    page.get_by_label('Usuario').fill('admin')
    page.get_by_label('Contraseña o PIN').fill('incorrecta')
    page.get_by_role('button', name='Ingresar').click()
    expect(page.get_by_role('alert')).to_contain_text('incorrectos')
    ok('login: credencial errada muestra mensaje genérico')
    page.screenshot(path=SP + '/01-login.png')

    page.get_by_label('Contraseña o PIN').fill(ADMIN_PASS)
    page.get_by_role('button', name='Ingresar').click()
    expect(page.get_by_role('heading', name='Máquinas')).to_be_visible()
    expect(page.locator('.list-row')).to_have_count(4)
    ok('login admin y lista de 4 máquinas')
    page.screenshot(path=SP + '/02-maquinas.png')

    page.get_by_label('Buscar máquinas').fill('molino')
    expect(page.locator('.list-row')).to_have_count(1)
    page.get_by_label('Buscar máquinas').fill('')
    page.get_by_label('Filtrar por estado').select_option('EN_MANTENIMIENTO')
    expect(page.locator('.list-row')).to_have_count(1)
    expect(page.locator('.list-row')).to_contain_text('HRN-001')
    page.get_by_label('Filtrar por estado').select_option('')
    ok('búsqueda y filtro por estado')

    page.get_by_text('Molino de carne').click()
    expect(page.get_by_role('heading', name='Molino de carne')).to_be_visible()
    expect(page.get_by_text('Vencida')).to_be_visible()
    with page.expect_file_chooser() as fc:
        page.get_by_role('button', name='Adjuntar').click()
    fc.value.set_files(PDF)
    expect(page.locator('.doc')).to_have_count(1)
    expect(page.locator('.doc')).to_contain_text('manual.pdf')
    expect(page.locator('.doc')).to_contain_text('Administrador')
    ok('ficha: garantía vencida y PDF adjuntado con autor')
    with ctx.expect_page() as newp:
        page.locator('.doc').click()
    try:
        newp.value.wait_for_url(re.compile('^blob:'), wait_until='commit')
    except Exception as e:
        # Chromium headless no tiene visor de PDF: la navegación al blob se convierte en descarga (ERR_ABORTED)
        assert 'ERR_ABORTED' in str(e), e
    newp.value.close()
    ok('documento se abre desde la ficha')
    page.screenshot(path=SP + '/03-ficha.png', full_page=True)

    page.get_by_role('link', name='Editar').click()
    page.get_by_label('Ubicación').fill('Sala de molienda 2')
    page.get_by_role('button', name='Guardar cambios').click()
    expect(page.get_by_text('Sala de molienda 2')).to_be_visible()
    ok('editar ficha')

    page.goto(BASE + '/maquinas/nueva')
    page.get_by_label('Código interno *').fill('mol-001')
    page.get_by_label('Nombre *').fill('Duplicada')
    page.get_by_label('Área *').fill('Proceso')
    page.get_by_role('button', name='Registrar máquina').click()
    expect(page.get_by_role('alert')).to_contain_text('Ya existe')
    ok('código duplicado mostrado en el formulario')
    page.get_by_label('Código interno *').fill('emp-010')
    page.get_by_label('Nombre *').fill('Empacadora al vacío')
    page.get_by_label('Fecha de compra').fill('2025-05-01')
    page.get_by_label('Fin de garantía').fill('2027-05-01')
    page.get_by_role('button', name='Registrar máquina').click()
    expect(page.get_by_role('heading', name='Empacadora al vacío')).to_be_visible()
    expect(page.get_by_text('EMP-010')).to_be_visible()
    ok('crear máquina nueva')

    # Inventario
    page.get_by_role('link', name='Inventario').first.click()
    expect(page.get_by_role('heading', name='Inventario de repuestos')).to_be_visible()
    expect(page.get_by_text('1 bajo el mínimo')).to_be_visible()
    page.get_by_label('Solo bajo el mínimo').check()
    expect(page.locator('.list-row')).to_have_count(1)
    expect(page.locator('.list-row')).to_contain_text('RP-ROD-6205')
    ok('inventario: alerta y filtro de bajo mínimo')
    page.screenshot(path=SP + '/04-inventario.png')

    page.locator('.list-row').click()
    page.get_by_role('button', name='Movimiento').click()
    dlg = page.locator('dialog[open]')
    dlg.get_by_label('Tipo de movimiento').select_option('ENTRADA_COMPRA')
    dlg.get_by_label(re.compile('Cantidad')).fill('5')
    dlg.get_by_label(re.compile('Costo unitario')).fill('20000')
    dlg.get_by_label('Referencia').fill('FAC-1234')
    page.screenshot(path=SP + '/05-movimiento.png')
    page.get_by_role('button', name='Registrar', exact=True).click()
    expect(page.locator('dialog[open]')).to_have_count(0)
    expect(page.locator('.stat').first).to_contain_text('8')
    expect(page.locator('.table')).to_contain_text('FAC-1234')
    ok('entrada por compra: stock 3 → 8 y aparece en kardex')

    page.get_by_role('button', name='Movimiento').click()
    dlg = page.locator('dialog[open]')
    dlg.get_by_label('Tipo de movimiento').select_option('SALIDA_CONSUMO')
    dlg.get_by_label(re.compile('Cantidad')).fill('100')
    expect(dlg.get_by_text('No hay suficiente stock')).to_be_visible()
    expect(page.get_by_role('button', name='Registrar', exact=True)).to_be_disabled()
    ok('salida mayor al stock bloqueada en el formulario')
    dlg.get_by_label('Cerrar').click()

    page.get_by_role('button', name='Conteo').click()
    dlg = page.locator('dialog[open]')
    dlg.get_by_label(re.compile('Cantidad contada')).fill('7')
    expect(dlg.get_by_text('Diferencia: -1')).to_be_visible()
    dlg.get_by_label('Motivo *').fill('Conteo mensual')
    page.get_by_role('button', name='Registrar conteo').click()
    expect(dlg.get_by_text('ajuste de -1')).to_be_visible()
    page.get_by_role('button', name='Listo').click()
    expect(page.locator('.stat').first).to_contain_text('7')
    ok('conteo físico genera ajuste de -1')
    page.screenshot(path=SP + '/06-kardex.png', full_page=True)

    with page.expect_download() as dl:
        page.goto(BASE + '/inventario')
        page.get_by_role('button', name='Exportar').click()
    path = dl.value.path()
    csv = open(path, encoding='utf-8-sig').read()
    assert 'RP-ROD-6205' in csv and ';7;' in csv, csv[:300]
    ok('exporta CSV con el stock actualizado')

    # Usuarios y configuración
    page.get_by_role('link', name='Usuarios').first.click()
    page.get_by_role('button', name='Nuevo usuario').click()
    dlg = page.locator('dialog[open]')
    dlg.get_by_label('Nombre completo *').fill('Pedro Técnico')
    dlg.get_by_label(re.compile('^Usuario')).fill('ptecnico')
    dlg.get_by_label('Rol *').select_option('TECNICO')
    dlg.get_by_label(re.compile('^PIN')).fill('1111')
    page.get_by_role('button', name='Crear usuario').click()
    expect(dlg.get_by_role('alert')).to_contain_text('fácil')
    dlg.get_by_label(re.compile('^PIN')).fill('5821')
    page.get_by_role('button', name='Crear usuario').click()
    expect(page.locator('dialog[open]')).to_have_count(0)
    expect(page.get_by_text('Pedro Técnico')).to_be_visible()
    ok('crear usuario técnico (rechaza PIN débil)')
    page.screenshot(path=SP + '/07-usuarios.png')

    page.get_by_role('link', name='Configuración').first.click()
    expect(page.get_by_text('Actual: Autorizador Demo')).to_be_visible()
    expect(page.locator('.audit li').first).to_be_visible()
    expect(page.locator('.audit')).to_contain_text('Conteo físico')
    ok('configuración: autorizador y bitácora')
    page.screenshot(path=SP + '/08-configuracion.png', full_page=True)
    ctx.close()

    # ---------------- Celular, operario ----------------
    m = b.new_context(**p.devices['Pixel 7'], locale='es-CO')
    page = m.new_page(); track(page)
    page.goto(BASE + '/ingresar')
    page.get_by_label('Usuario').fill('operario')
    page.get_by_label('Contraseña o PIN').fill('7391')
    page.get_by_role('button', name='Ingresar').click()
    expect(page.get_by_role('heading', name='Máquinas')).to_be_visible()
    expect(page.locator('.tabbar .tab-link')).to_have_count(2)
    expect(page.get_by_role('link', name='Nueva máquina')).to_have_count(0)
    ok('operario en celular: solo Máquinas e Inventario, sin crear')
    page.screenshot(path=SP + '/09-movil-maquinas.png')
    sw = page.evaluate('document.documentElement.scrollWidth > window.innerWidth')
    assert not sw, 'scroll horizontal en móvil'
    ok('sin scroll horizontal a ancho de celular')

    page.goto(BASE + '/inventario')
    page.locator('.list-row').first.click()
    expect(page.get_by_role('button', name='Movimiento')).to_have_count(0)
    expect(page.get_by_role('heading', name='Kardex')).to_have_count(0)
    page.screenshot(path=SP + '/10-movil-repuesto.png', full_page=True)
    page.goto(BASE + '/usuarios')
    expect(page.get_by_text('No tiene permiso')).to_be_visible()
    ok('operario: sin movimientos ni kardex; /usuarios bloqueado')

    # Celular, administrador: kardex como tarjetas y modal tipo hoja
    m2 = b.new_context(**p.devices['iPhone 13'], locale='es-CO')
    page = m2.new_page(); track(page)
    page.goto(BASE + '/ingresar')
    page.get_by_label('Usuario').fill('admin')
    page.get_by_label('Contraseña o PIN').fill(ADMIN_PASS)
    page.get_by_role('button', name='Ingresar').click()
    expect(page.get_by_role('heading', name='Máquinas')).to_be_visible()
    page.goto(BASE + '/inventario')
    page.get_by_text('Rodamiento 6205-2RS').click()
    expect(page.get_by_role('heading', name='Kardex')).to_be_visible()
    page.screenshot(path=SP + '/11-movil-kardex.png', full_page=True)
    page.get_by_role('button', name='Movimiento').click()
    page.screenshot(path=SP + '/12-movil-modal.png')
    assert not page.evaluate('document.documentElement.scrollWidth > window.innerWidth')
    ok('admin en celular: kardex y modal sin desbordes')

    b.close()

print('\n', len(results), 'verificaciones OK. Capturas en', SP)
print('Errores de consola:', errors or 'ninguno')
