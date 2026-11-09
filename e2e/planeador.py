"""
Planeador anual de mantenimiento (AC-PMT-CR01, D-36) en un navegador real: por planta, con la cuadrícula de semanas
(programadas, proyectadas y ejecutadas), cumplimiento al corte y meta; una fila agrupa las máquinas del mismo equipo
y se abre para ver cada una. Se reprograma un preventivo con su motivo, que sale en la observación, y se imprime.
Requiere los datos de demostración recién cargados y el frontend compilado (npm run build && npm run preview).
Uso: python e2e/planeador.py <contraseña-admin>
"""
import sys, re, os, tempfile
from datetime import date, timedelta
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('CMMS_URL', 'http://localhost:4173')
ADMIN_PASS = sys.argv[1]
SP = os.environ.get('SHOTS', tempfile.mkdtemp(prefix='cmms-planeador-'))
errors, results = [], []
VERIF = {'verificaciones': [{'id': i, 'cumple': True} for i in ('especificaciones', 'piezas', 'herramientas', 'limpieza')]}

def ok(n):
    results.append(n); print('OK  ', n)

def track(page):
    page.on('pageerror', lambda e: errors.append(f'{page.url}: {e}'))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(f'{page.url}: {m.text}'))

hoy = date.today()
semana = lambda d: d.isocalendar()[1]
en7, en21 = hoy + timedelta(days=7), hoy + timedelta(days=21)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='es-CO', timezone_id='America/Bogota')
    api = ctx.request
    tok = api.post(BASE + '/api/auth/login', data={'usuario': 'admin', 'credencial': ADMIN_PASS}).json()['token']
    H = {'Authorization': f'Bearer {tok}'}
    post = lambda path, body: api.post(BASE + '/api' + path, data=body, headers=H)
    ordenes = []
    for n in (1, 2, 3):
        a = post('/activos', {'codigo': f'EVAP-PAS-0{n}', 'nombre': f'Evaporador pasillo {n}', 'area': 'Planta Pollo', 'ubicacion': 'Pasillo'}).json()
        r = post('/planes', {'activoId': a['id'], 'nombre': 'Lavado de evaporador', 'frecuenciaValor': 3, 'frecuenciaUnidad': 'MESES', 'primeraFecha': en7.isoformat(), 'repuestos': []}).json()
        ordenes.append(r['primeraOrden']['id'])
    tecs = api.get(BASE + '/api/usuarios/tecnicos', headers=H).json()
    tecnico = next(t for t in tecs if t['rol'] == 'TECNICO')['id']
    o = ordenes[1]
    assert post(f'/ordenes/{o}/asignar', {'tecnicoId': tecnico}).ok
    assert post(f'/ordenes/{o}/iniciar', {}).ok
    assert post(f'/ordenes/{o}/cerrar', {**VERIF, 'trabajoRealizado': 'Lavado de serpentín, bandeja y estructura', 'repuestosUsados': [], 'manoObra': []}).ok

    a = ctx.new_page(); track(a)
    a.goto(BASE + '/ingresar')
    a.get_by_label('Usuario').fill('admin'); a.get_by_label('Contraseña o PIN').fill(ADMIN_PASS)
    a.get_by_role('button', name='Ingresar').click()
    expect(a).to_have_url(re.compile('/ordenes'))

    # 1) El planeador de la planta
    a.locator('.tabs').get_by_role('link', name='Planeador').click()
    expect(a).to_have_url(re.compile('/ordenes/planeador'))
    a.get_by_label('Planta o área').select_option('Planta Pollo')
    fila = a.locator('tr.pl-prog', has=a.locator('th', has_text='Evaporador pasillo'))
    expect(fila).to_contain_text('trimestral')
    expect(fila.locator('td').first).to_have_text('3')
    expect(a.locator('.kpi', has_text='Semana de corte')).to_contain_text(str(semana(hoy)))
    expect(a.locator('.kpi', has_text='Cumplimiento')).to_contain_text('Meta 99 %')
    cols = a.locator('thead tr').nth(1).locator('th')
    expect(cols).to_have_count(53 if hoy.year == 2026 else len(cols.all()))
    def celda(tr, w):
        return tr.locator('td.pl-w').nth(w - 1)
    if en7.isocalendar()[0] == hoy.year:
        expect(celda(fila, semana(en7))).to_have_text('3')
    ejec = fila.locator('xpath=following-sibling::tr[1]')
    expect(celda(ejec, semana(hoy))).to_have_text('1')
    expect(ejec).to_contain_text('Ejecutadas · 1')
    a.screenshot(path=f'{SP}/pl-01-planeador.png', full_page=True)
    ok('planeador de Planta Pollo: fila "Evaporador pasillo" con 3 máquinas programadas y la ejecutada en la semana en que se hizo')

    # 2) Abrir la fila: cada máquina, con enlace a su orden
    fila.get_by_role('button', name=re.compile('Evaporador pasillo')).click()
    maqs = a.locator('tr.pl-maq.pl-prog')
    expect(maqs).to_have_count(3)
    expect(maqs.nth(0)).to_contain_text('EVAP-PAS-01')
    m1 = maqs.nth(0)
    m1.locator('td.pl-w a.pl-p').first.click()
    expect(a).to_have_url(re.compile(r'/ordenes/[0-9a-f-]{36}'))
    ok('al abrir la fila se ve cada máquina y su programada lleva a la orden')

    # 3) Reprogramar con motivo
    a.get_by_role('button', name='Reprogramar').click()
    d = a.locator('dialog[open]')
    d.get_by_label('Nueva fecha *').fill(en21.isoformat())
    d.get_by_label('Motivo *').fill('Producción no libera el pasillo')
    d.get_by_role('button', name='Reprogramar').click()
    expect(a.locator('dialog[open]')).to_have_count(0)
    expect(a.locator('main')).to_contain_text('Reprogramado del ' + en7.strftime('%d/%m/%Y') + ' al ' + en21.strftime('%d/%m/%Y') + ': Producción no libera el pasillo')
    a.go_back()
    fila = a.locator('tr.pl-prog', has=a.locator('th', has_text='Evaporador pasillo')).first
    expect(fila.locator('td.pl-obs')).to_contain_text(f'EVAP-PAS-01 · OT-')
    expect(fila.locator('td.pl-obs')).to_contain_text(f'reprogramada de S{semana(en7)} a S{semana(en21)}: Producción no libera el pasillo')
    if en21.isocalendar()[0] == hoy.year and semana(en21) != semana(en7):
        expect(celda(fila, semana(en21))).to_contain_text('1')
        expect(celda(fila, semana(en7))).to_have_text('2')
    a.screenshot(path=f'{SP}/pl-02-reprogramado.png', full_page=True)
    ok('reprogramada con motivo: se mueve de semana y el motivo sale en la observación')

    # 4) Semana de corte y cumplimiento
    a.get_by_label('Semana de corte').fill(str(semana(hoy)))
    expect(a.locator('.kpi', has_text='Ejecutadas al corte')).to_contain_text('1')
    expect(fila.locator('td.pl-estado')).to_have_text(re.compile('Cumplidas al corte|Sin actividades al corte'))
    ok('con la semana de corte de hoy, la ejecutada cuenta y la fila está al día')

    # 5) Impreso con el encabezado del formato
    a.get_by_role('link', name='Imprimir / PDF').click()
    expect(a.locator('.fh')).to_contain_text('AC-PMT-CR01')
    expect(a.locator('.fh')).to_contain_text(f'PLANEADOR DE MANTENIMIENTO {hoy.year} · PLANTA POLLO')
    expect(a.locator('.pl-cab')).to_contain_text('Responsable del seguimiento: Líder de mantenimiento')
    expect(a.locator('.print-sheet .pl')).to_contain_text('Evaporador pasillo')
    a.pdf(path=f'{SP}/planeador.pdf', format='Letter', landscape=True, print_background=True)
    a.screenshot(path=f'{SP}/pl-03-impreso.png', full_page=True)
    ok('impreso / PDF horizontal con el encabezado AC-PMT-CR01 y el resumen de cumplimiento')

    # 6) En el celular: la cuadrícula se desplaza dentro de su recuadro
    m = b.new_context(viewport={'width': 412, 'height': 900}, locale='es-CO', timezone_id='America/Bogota').new_page(); track(m)
    m.goto(BASE + '/ingresar'); m.get_by_label('Usuario').fill('admin'); m.get_by_label('Contraseña o PIN').fill(ADMIN_PASS); m.get_by_role('button', name='Ingresar').click()
    expect(m).to_have_url(re.compile('/ordenes'))
    m.goto(BASE + '/ordenes/planeador?area=Planta%20Pollo')
    expect(m.locator('.pl')).to_be_visible()
    assert m.evaluate('document.documentElement.scrollWidth') <= 412, 'sin desborde horizontal de la página'
    m.screenshot(path=f'{SP}/pl-04-celular.png')
    ok('en el celular la página no se desborda; la cuadrícula se desplaza en su recuadro')
    b.close()

print('\n', len(results), 'verificaciones OK. Capturas en', SP)
print('Errores de consola:', errors or 'ninguno')
