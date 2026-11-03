"""
Formatos de mantenimiento de la planta en un navegador real: preoperacional B/R/M con su semana, hoja diaria C/NC,
ronda y planilla de temperaturas con su verificación, cierre de la OT con las verificaciones del formato,
hoja de vida, medición de iluminación y control documental de los formatos impresos.
Requiere los datos de demostración recién cargados (incluyen los formatos de la planta) y el frontend compilado.
Uso: python e2e/formatos_planta.py <contraseña-admin>
"""
import sys, re, os, tempfile
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('CMMS_URL', 'http://localhost:4173')
ADMIN_PASS = sys.argv[1]
SP = os.environ.get('SHOTS', tempfile.mkdtemp(prefix='cmms-formatos-'))
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

def item(page, texto):
    return page.locator('.check-item', has_text=texto).first

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='es-CO', timezone_id='America/Bogota')
    a = ctx.new_page(); track(a)
    login(a, 'admin', ADMIN_PASS)

    # 1) Preoperacional del molino: B/R/M, "Regular" pide observación, "Malo" pide acción correctiva
    a.goto(BASE + '/calidad')
    a.locator('.point', has_text='Preoperacional molino').click()
    expect(a.locator('.alert-warn')).to_contain_text('No hacer funcionar nunca la máquina en vacío')
    elegir(a.get_by_label('Equipo (opcional)'), 'MOL-001')
    a.get_by_role('button', name=re.compile('Marcar lo pendiente como bueno')).click()
    item(a, 'discos, cuchillas').get_by_role('radio', name='Regular').click()
    expect(a.get_by_role('button', name='Guardar checklist')).to_be_disabled()
    item(a, 'discos, cuchillas').get_by_placeholder('¿Qué está regular? *').fill('Cuchilla con poco filo')
    item(a, 'extintor').get_by_role('radio', name='No tiene').click()
    expect(item(a, 'extintor')).to_have_class(re.compile('nc'))
    a.get_by_label('Acción correctiva *').fill('Se trajo el extintor del pasillo y se avisó a SST')
    a.screenshot(path=f'{SP}/fmt-01-preoperacional.png', full_page=True)
    a.get_by_role('button', name='Guardar checklist').click()
    expect(a.locator('.alert-ok')).to_contain_text('Preoperacional molino')
    ok('preoperacional del molino: "marcar lo pendiente como bueno", Regular con observación y No tiene con acción correctiva')

    # 2) La semana del preoperacional (lunes a domingo) y el formato del registro
    a.get_by_role('tab', name='Checklists').click()
    reg = a.locator('.list-row', has_text='Preoperacional molino').first
    reg.locator('summary').click()
    reg.get_by_role('link', name='Semana').click()
    expect(a.locator('.fh-title')).to_have_text('Preoperacional molino')
    expect(a.locator('.fh')).to_contain_text('AC-PMT-FR078')
    fila = a.locator('.print-sheet tr', has_text='discos, cuchillas').first
    expect(fila).to_contain_text('R¹')
    expect(a.locator('.print-sheet tr', has_text='Realizada por')).to_contain_text('Administrador')
    expect(a.locator('.print-sheet')).to_contain_text('Cuchilla con poco filo')
    a.screenshot(path=f'{SP}/fmt-02-semana.png', full_page=True)
    ok('semana del preoperacional: código del formato, R con observación y "Realizada por" en la columna del día')

    # 3) Hoja diaria de preoperatorio de la planta de pollo: C / NC / NA por equipo, agrupados por área
    a.goto(BASE + '/calidad')
    a.locator('.point', has_text='Preoperatorio diario de equipos · Planta Pollo').click()
    expect(a.get_by_label('Equipo (opcional)')).to_have_count(0)
    expect(a.locator('.check-section h2').first).to_have_text('Area de recibo de canales')
    a.locator('.check-section', has_text='Area de procesos').get_by_role('button', name='Todo cumple').click()
    a.get_by_role('button', name=re.compile('Marcar lo pendiente como cumple')).click()
    item(a, 'Escurridor').get_by_role('radio', name='NC').click()
    item(a, 'Escurridor').get_by_role('button', name='+ Observación').click()
    item(a, 'Escurridor').get_by_placeholder('Observación').fill('Fuga en la manguera')
    item(a, 'Sierra sin fin #1').get_by_role('radio', name='NA').click()
    a.get_by_label('Acción correctiva *').fill('Se cambió la abrazadera de la manguera')
    a.get_by_role('button', name='Guardar checklist').click()
    expect(a.locator('.alert-ok')).to_be_visible()
    a.get_by_role('tab', name='Checklists').click()
    reg = a.locator('.list-row', has_text='Planta Pollo').first
    reg.locator('summary').click()
    expect(reg).to_contain_text('Escurridor: No cumple — Fuga en la manguera')
    reg.get_by_role('link', name='Ver formato').click()
    expect(a.locator('.print-sheet thead')).to_contain_text('EQUIPOS')
    expect(a.locator('.print-sheet tr.sec').first).to_contain_text('Area de recibo de canales')
    fila = a.locator('.print-sheet tbody tr').filter(has=a.get_by_role('cell', name='Escurridor', exact=True))
    expect(fila.locator('td').nth(3)).to_have_text('X')  # columna NC
    expect(fila).to_contain_text('Fuga en la manguera')
    a.screenshot(path=f'{SP}/fmt-03-hoja-diaria.png', full_page=True)
    ok('hoja diaria de pollo: "todo cumple" por área, NC con observación, NA, y el formato con columnas C / NC / NA')

    # 4) Ronda de temperaturas de la planta y planilla del día con su verificación
    a.goto(BASE + '/calidad/ronda?area=' + 'Planta Pollo')
    a.get_by_label('Temperatura Refrigeracion (°C)').fill('2.5')
    a.get_by_label('Temperatura Congelacion#1 (°C)').fill('-5')
    a.get_by_label('Temperatura Muelle (°C)').fill('9')
    expect(a.get_by_role('button', name='Guardar 3 lecturas')).to_be_disabled()
    a.get_by_label('Acción correctiva Congelacion#1').fill('Se cerró la puerta y se llamó al técnico de refrigeración')
    a.screenshot(path=f'{SP}/fmt-04-ronda.png', full_page=True)
    a.get_by_role('button', name='Guardar 3 lecturas').click()
    expect(a.locator('.alert-warn')).to_contain_text('Se guardaron 3 lecturas (1 fuera de rango')
    a.get_by_role('link', name='Planilla del día').click()
    expect(a.locator('.fh')).to_contain_text('AC-PMT-FR01')
    expect(a.locator('.print-sheet td.pfuera')).to_have_text('-5')
    expect(a.locator('.print-sheet')).to_contain_text('Congelacion#1: -5 °C (fuera de rango) — Se cerró la puerta')
    expect(a.locator('.pfirma', has_text='Realizó')).to_contain_text('Administrador')
    a.get_by_role('button', name='Verificar planilla').click()
    a.locator('dialog[open]').get_by_label('Observaciones').fill('Revisado con el técnico')
    a.locator('dialog[open]').get_by_role('button', name='Verificar').click()
    expect(a.locator('.pfirma', has_text='Verificó')).to_contain_text('Administrador')
    expect(a.get_by_role('button', name='Verificar planilla')).to_have_count(0)
    a.screenshot(path=f'{SP}/fmt-05-planilla.png', full_page=True)
    ok('ronda de 3 cuartos (uno fuera de rango con acción) y planilla del día con Realizó y Verificó')

    # 5) Cierre de la orden: verificaciones de entrega del formato y su impresión
    t2ctx = b.new_context(viewport={'width': 412, 'height': 900}, locale='es-CO', timezone_id='America/Bogota')
    tec = t2ctx.new_page(); track(tec)
    login(tec, 'tecnico', '4826')
    tec.locator('.list-row', has_text='Lubricación y revisión').first.click()
    tec.get_by_role('button', name='Iniciar trabajo').click()
    tec.get_by_role('button', name='Cerrar orden').first.click()
    d = tec.locator('dialog[open]')
    d.get_by_label('Trabajo realizado *').fill('Se lubricaron los rodamientos y se ajustaron holguras')
    d.get_by_label('Horas').first.fill('1')
    expect(tec.get_by_role('button', name='Cerrar orden').last).to_be_disabled()
    for r in d.get_by_role('radio', name='Cumple', exact=True).all(): r.click()
    d.locator('.verif-list li', has_text='limpieza y desinfección').get_by_role('radio', name='No cumple').click()
    expect(d.get_by_label('Observaciones * (explique lo que no se cumple)')).to_be_visible()
    d.get_by_label('Observaciones * (explique lo que no se cumple)').fill('Limpieza no disponible en el turno; se avisó al líder de área')
    tec.screenshot(path=f'{SP}/fmt-06-cierre-movil.png', full_page=True)
    tec.get_by_role('button', name='Cerrar orden').last.click()
    expect(tec.locator('.page-subtitle')).to_contain_text('Cerrada')
    expect(tec.locator('.answers')).to_contain_text('No cumple: Se reportó el equipo a limpieza')
    tec.get_by_role('link', name='Formato').click()
    expect(tec.locator('.fh')).to_contain_text('AC-PMT FR03')
    verif = tec.locator('.print-sheet tr', has_text='limpieza y desinfección')
    expect(verif.locator('td').nth(2)).to_have_text('X')
    expect(tec.locator('.print-sheet tr', has_text='piezas completas').locator('td').nth(1)).to_have_text('X')
    expect(tec.locator('.print-sheet')).to_contain_text('Limpieza no disponible en el turno')
    expect(tec.locator('.print-sheet')).to_contain_text('PREVENTIVO X')
    ok('cierre de la OT en el celular: verificaciones de entrega obligatorias, "no cumple" pide observaciones, y el formato impreso')
    t2ctx.close()

    # 6) Hoja de vida con los datos técnicos
    a.goto(BASE + '/maquinas')
    a.locator('.list-row', has_text='MOL-001').click()
    a.get_by_role('link', name='Editar').click()
    a.get_by_label('Voltaje').fill('220 V')
    a.get_by_label('Amperaje').fill('12 A')
    a.get_by_label('Capacidad').fill('300 kg/h')
    a.get_by_label('Peso').fill('180 kg')
    a.get_by_label('Ubicación del manual').fill('Oficina de mantenimiento, archivador 2')
    a.get_by_role('button', name='Guardar cambios').click()
    expect(a.get_by_text('220 V')).to_be_visible()
    a.get_by_role('link', name='Hoja de vida').click()
    hoja = a.locator('.print-sheet')
    expect(hoja).to_contain_text('VOLTAJE: 220 V')
    expect(hoja).to_contain_text('CAPACIDAD: 300 kg/h')
    expect(hoja).to_contain_text('Oficina de mantenimiento, archivador 2')
    expect(hoja).to_contain_text('Lubricación y revisión de rodamientos')
    a.screenshot(path=f'{SP}/fmt-07-hoja-de-vida.png', full_page=True)
    ok('hoja de vida: voltaje, amperaje, capacidad, peso, manual y el preventivo con sus materiales')

    # 7) Medición de iluminación: un punto bajo el mínimo pide plan de acción
    a.goto(BASE + '/calidad/iluminacion')
    a.get_by_role('link', name='Nueva medición').click()
    a.get_by_label('Cargo del evaluador *').fill('Jefe de mantenimiento')
    for k, v in enumerate(['320', '330', '340']):
        a.get_by_label(f'Inventarios: medición {k + 1}').fill(v)
    for k, v in enumerate(['150', '160', '170']):
        a.get_by_label(f'Lavanderia: medición {k + 1}').fill(v)
    expect(a.locator('.lux-item', has_text='Lavanderia')).to_contain_text('Media 160 lux · No cumple')
    expect(a.get_by_role('button', name='Guardar medición')).to_be_disabled()
    a.get_by_label('Plan de acción Lavanderia').fill('Cambiar dos lámparas fundidas')
    a.get_by_role('button', name='Guardar medición').click()
    expect(a.locator('.fh')).to_contain_text('AC-PMT-MI01')
    expect(a.locator('.print-sheet tr', has_text='Lavanderia')).to_contain_text('Cambiar dos lámparas fundidas')
    expect(a.locator('.print-sheet tr', has_text='TOTAL')).to_contain_text('2')
    expect(a.locator('.print-sheet tr', has_text='TOTAL')).to_contain_text('50 %')
    a.screenshot(path=f'{SP}/fmt-08-iluminacion.png', full_page=True)
    ok('iluminación: media por punto, plan de acción obligatorio si no cumple y resumen de límites permisibles')

    # 8) Control documental: cambiar la versión del formato de OT y verla en el encabezado
    a.goto(BASE + '/configuracion')
    s = a.locator('section', has=a.get_by_role('heading', name='Formatos impresos'))
    s.locator('.list-row', has_text='Orden de trabajo').get_by_role('button', name='Editar').click()
    a.locator('dialog[open]').get_by_label('Versión *').fill('7')
    a.locator('dialog[open]').get_by_role('button', name='Guardar').click()
    expect(s.locator('.list-row', has_text='Orden de trabajo')).to_contain_text('versión 7')
    a.goto(BASE + '/ordenes?vista=todas')
    a.locator('.list-row', has_text='Lubricación y revisión').filter(has_text='Cerrada').first.click()
    a.get_by_role('link', name='Formato').click()
    expect(a.locator('.fh')).to_contain_text('VERSIÓN: 7')
    expect(a.locator('.print-sheet')).to_contain_text('Se lubricaron los rodamientos')
    a.screenshot(path=f'{SP}/fmt-09-ot-impresa.png', full_page=True)
    a.pdf(path=f'{SP}/fmt-ot.pdf', format='Letter', print_background=True)
    ok('Ajustes → Formatos impresos: la nueva versión sale en el encabezado de la orden; se genera el PDF')
    b.close()

print('\n', len(results), 'verificaciones OK. Capturas en', SP)
print('Errores de consola:', errors or 'ninguno')
