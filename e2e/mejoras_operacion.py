"""
Mejoras de operación en un navegador real: cambio obligatorio del PIN al primer ingreso, firma en el celular sobre el
formato de la OT, calibración de instrumentos con certificado, paquete mensual para auditoría y recordatorio diario
de las plantillas.
Requiere los datos de demostración recién cargados y el frontend compilado (npm run build && npm run preview).
Uso: python e2e/mejoras_operacion.py <contraseña-admin>
"""
import sys, re, os, tempfile
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('CMMS_URL', 'http://localhost:4173')
ADMIN_PASS = sys.argv[1]
SP = os.environ.get('SHOTS', tempfile.mkdtemp(prefix='cmms-mejoras-'))
errors, results = [], []
CERT = os.path.join(SP, 'certificado.pdf')
with open(CERT, 'wb') as f:
    f.write(b'%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF')

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

def firmar(page, casilla, nombre=None):
    """Firma con el mouse (como el dedo en el celular) en la casilla indicada del formato."""
    page.locator('.pfirma', has_text=casilla).get_by_role('button', name='Firmar').click()
    d = page.locator('dialog[open]')
    if nombre:
        d.get_by_label('Nombre de quien firma *').fill(nombre)
    caja = d.locator('canvas').bounding_box()
    x, y, w, h = caja['x'], caja['y'], caja['width'], caja['height']
    page.mouse.move(x + w * 0.1, y + h * 0.7); page.mouse.down()
    for i in range(1, 13):
        page.mouse.move(x + w * (0.1 + i * 0.065), y + h * (0.3 if i % 2 else 0.75), steps=3)
    page.mouse.up()
    d.get_by_role('button', name='Guardar firma').click()
    expect(page.locator('dialog[open]')).to_have_count(0)

with sync_playwright() as p:
    b = p.chromium.launch()
    a = b.new_context(viewport={'width': 1366, 'height': 900}, locale='es-CO', timezone_id='America/Bogota').new_page(); track(a)
    ingresar(a, 'admin', ADMIN_PASS)
    expect(a).to_have_url(re.compile('/ordenes'))

    # 1) Usuario nuevo: el PIN que pone el jefe es temporal y se cambia al primer ingreso
    a.goto(BASE + '/usuarios')
    a.get_by_role('button', name='Nuevo usuario').click()
    d = a.locator('dialog[open]')
    d.get_by_label('Nombre completo *').fill('Carlos Mecánico')
    d.get_by_label('Usuario *').fill('cmecanico')
    d.get_by_label('Rol *').select_option('TECNICO')
    expect(d).to_contain_text('Es temporal: la persona lo cambia al ingresar por primera vez')
    d.get_by_label('PIN *').fill('5931')
    d.get_by_role('button', name='Crear usuario').click()
    expect(a.locator('dialog[open]')).to_have_count(0)
    m = b.new_context(viewport={'width': 412, 'height': 900}, locale='es-CO', timezone_id='America/Bogota').new_page(); track(m)
    ingresar(m, 'cmecanico', '5931')
    expect(m.get_by_role('heading', name='Hola, Carlos')).to_be_visible()
    expect(m.locator('.alert-warn')).to_contain_text('elija uno nuevo que solo usted conozca')
    m.get_by_label('PIN actual *', exact=True).fill('5931')
    m.get_by_label('Nuevo PIN *', exact=True).fill('1111')
    m.get_by_label('Repita el nuevo PIN *').fill('1111')
    m.get_by_role('button', name='Cambiar PIN').click()
    expect(m.locator('.alert-bad, .error-box, [role=alert]').first).to_contain_text('fácil de adivinar')
    m.get_by_label('Nuevo PIN *', exact=True).fill('4682')
    m.get_by_label('Repita el nuevo PIN *').fill('4682')
    m.screenshot(path=f'{SP}/mej-01-cambio-pin.png', full_page=True)
    m.get_by_role('button', name='Cambiar PIN').click()
    expect(m).to_have_url(re.compile('/ordenes'))
    expect(m.get_by_role('heading', name='Mantenimiento', exact=True)).to_be_visible()
    m.context.close()
    ok('técnico nuevo: el PIN que puso el jefe se cambia al primer ingreso (rechaza 1111) y luego entra a sus órdenes')

    # 2) Firma en el formato de la OT
    a.goto(BASE + '/ordenes?vista=todas')
    a.locator('.list-row').first.click()
    a.get_by_role('link', name='Formato').click()
    expect(a.locator('.fh')).to_contain_text('AC-PMT FR03')
    firmar(a, 'Jefe de mantenimiento')
    jefe = a.locator('.pfirma', has_text='Jefe de mantenimiento')
    expect(jefe.locator('img.pfirma-img')).to_be_visible()
    expect(jefe).to_contain_text('Administrador')
    expect(jefe.get_by_role('button', name='Firmar')).to_have_count(0)
    firmar(a, 'Líder de área', 'Yineth Producción')
    expect(a.locator('.pfirma', has_text='Líder de área')).to_contain_text('Yineth Producción')
    a.screenshot(path=f'{SP}/mej-02-ot-firmada.png', full_page=True)
    a.pdf(path=f'{SP}/mej-ot-firmada.pdf', format='Letter', print_background=True)
    ok('formato de OT: firma del jefe y del líder de área en la pantalla; quedan en el PDF y ya no se pueden cambiar')

    # 3) Calibración de instrumentos
    a.goto(BASE + '/calidad')
    a.get_by_role('link', name='Calibración de instrumentos').click()
    expect(a.locator('.list-row', has_text='BAS-001')).to_contain_text('Vencida')
    expect(a.locator('.list-row', has_text='TER-001')).to_contain_text('Por vencer')
    expect(a.locator('.list-row', has_text='LUX-001')).to_contain_text('Calibración vigente')
    a.screenshot(path=f'{SP}/mej-03-instrumentos.png', full_page=True)
    a.locator('.list-row', has_text='BAS-001').click()
    a.get_by_role('button', name='Registrar calibración').click()
    d = a.locator('dialog[open]')
    d.get_by_label('N.º de certificado').fill('MV-2026-311')
    d.get_by_label('Certificado (PDF o foto)').set_input_files(CERT)
    d.get_by_role('button', name='Guardar').click()
    expect(a.locator('dialog[open]')).to_have_count(0)
    expect(a.locator('.page-subtitle')).to_contain_text('Calibración vigente')
    expect(a.locator('.list-row', has_text='MV-2026-311')).to_contain_text('Apto')
    with a.expect_popup() as pop:
        a.locator('.list-row', has_text='MV-2026-311').get_by_role('button', name='Certificado').click()
    pop.value.close()
    ok('instrumentos: vencido, por vencer y vigente; se registra la calibración con su certificado y queda vigente')

    # 4) Recordatorio diario de la hoja de preoperatorio
    a.goto(BASE + '/calidad/configuracion')
    a.locator('.list-row', has_text='Preoperatorio diario de equipos · Planta Pollo').get_by_role('button', name='Editar').click()
    expect(a.locator('dialog[open]').get_by_label('Se llena todos los días')).to_have_value('9')
    a.locator('dialog[open]').get_by_role('button', name='Cancelar').click()
    ok('la hoja diaria de cada planta avisa a las 9:00 si no se ha llenado (editable en la plantilla)')

    # 5) Paquete mensual para auditoría
    a.goto(BASE + '/calidad/ronda?area=Planta%20Pollo')
    a.get_by_label('Temperatura Refrigeracion (°C)').fill('2')
    a.get_by_role('button', name='Guardar 1 lectura').click()
    expect(a.locator('.alert-ok')).to_be_visible()
    a.goto(BASE + '/calidad')
    a.get_by_role('link', name='Paquete mensual para auditoría').click()
    a.locator('.print-controls select').select_option('Planta Pollo')
    expect(a.locator('.print-sheet')).to_contain_text('Registros de mantenimiento y calidad · Planta Pollo')
    contenido = a.locator('.print-sheet table').nth(1)
    expect(contenido).to_contain_text('1 día · 0 verificadas')
    expect(a.locator('.print-sheet')).to_contain_text('1 planilla sin verificar')
    expect(a.locator('.page-break').first).to_contain_text('Planta Pollo')
    expect(a.locator('.print-sheet')).to_contain_text('BAS-001')
    a.screenshot(path=f'{SP}/mej-04-paquete.png', full_page=True)
    a.pdf(path=f'{SP}/mej-paquete.pdf', format='Letter', landscape=True, print_background=True)
    ok('paquete mensual de Planta Pollo: índice, planillas del mes, instrumentos y aviso de planillas sin verificar; PDF')
    b.close()

print('\n', len(results), 'verificaciones OK. Capturas en', SP)
print('Errores de consola:', errors or 'ninguno')
