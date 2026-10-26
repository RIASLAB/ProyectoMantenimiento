"""
Notificaciones e indicadores en un navegador real.
Operario (celular) reporta una falla y registra una temperatura fuera de rango → el administrador (PC) las ve en la
campana y en la bandeja; el autorizador (celular) revisa los indicadores; el administrador cambia horario y metas.
Requiere los datos de demostración recién cargados y el frontend compilado (npm run build && npm run preview).
Uso: python e2e/avisos_indicadores.py <contraseña-admin>
"""
import sys, re, os, tempfile
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('CMMS_URL', 'http://localhost:4173')
ADMIN_PASS = sys.argv[1]
SP = os.environ.get('SHOTS', tempfile.mkdtemp(prefix='cmms-avisos-'))
errors, results = [], []

def ok(n):
    results.append(n); print('OK  ', n)

def track(page):
    page.on('pageerror', lambda e: errors.append(f'{page.url}: {e}'))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(f'{page.url}: {m.text}'))

def login(page, u, c, destino='/ordenes'):
    page.goto(BASE + '/ingresar')
    page.get_by_label('Usuario').fill(u)
    page.get_by_label('Contraseña o PIN').fill(c)
    page.get_by_role('button', name='Ingresar').click()
    expect(page).to_have_url(re.compile(destino))

def sin_scroll_horizontal(page):
    return page.evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1')

with sync_playwright() as p:
    b = p.chromium.launch()

    # 1) El administrador en el PC entra antes: su campana arranca sin estos avisos
    pc = b.new_context(viewport={'width': 1366, 'height': 900}, locale='es-CO', timezone_id='America/Bogota', permissions=['notifications'])
    adm = pc.new_page(); track(adm)
    login(adm, 'admin', ADMIN_PASS)
    adm.goto(BASE + '/notificaciones')
    if adm.get_by_role('button', name='Marcar todas como leídas').count():
        adm.get_by_role('button', name='Marcar todas como leídas').click()
    expect(adm.locator('.topbar .bell .nav-badge')).to_have_count(0)
    # El estado depende de las claves VAPID del servidor (Chromium sin interfaz siempre reporta el permiso como bloqueado)
    expect(adm.locator('.push-card')).to_be_visible()
    ok('admin: bandeja al día y estado de los avisos de este dispositivo')

    # 2) Operario en el celular: falla con máquina parada y temperatura fuera de rango
    cel = b.new_context(**p.devices['Pixel 7'], locale='es-CO', timezone_id='America/Bogota')
    op = cel.new_page(); track(op)
    login(op, 'operario', '7391')
    op.goto(BASE + '/ordenes/reportar')
    op.get_by_label('Máquina *').select_option(label='EMB-002 · Embutidora al vacío')
    op.get_by_label('¿Qué pasó? *').fill('La embutidora no arranca')
    op.get_by_label('¿La máquina quedó parada?').check()
    op.get_by_role('button', name='Enviar reporte').click()
    expect(op).to_have_url(re.compile(r'/ordenes'))
    op.goto(BASE + '/calidad/temperatura')
    op.get_by_label('Equipo y punto de control *').select_option(label='CF-001 · Cuarto frío de producto terminado — Temperatura de cámara')
    op.get_by_label('Temperatura (°C) *').fill('7.2')
    op.get_by_label('Acción correctiva *').fill('Se cerró la puerta y se avisó a mantenimiento')
    op.get_by_role('button', name='Guardar registro').click()
    expect(op.locator('.alert-warn')).to_contain_text('7,2 °C')
    expect(op.locator('.topbar .bell .nav-badge')).to_have_count(0)
    ok('operario reporta máquina parada y temperatura de 7,2 °C; él no recibe sus propios avisos')

    # 3) Al admin le llegan sin recargar (el contador se consulta cada 30 s; NOT-01 < 1 min)
    expect(adm.locator('.topbar .bell .nav-badge')).to_have_text('2', timeout=40000)
    adm.screenshot(path=f'{SP}/not-01-campana.png')
    expect(adm.locator('.notif.unread')).to_have_count(2, timeout=35000)
    expect(adm.locator('.notif.unread.urgent', has_text='Máquina parada: EMB-002')).to_be_visible()
    expect(adm.locator('.notif.unread.urgent', has_text='Temperatura fuera de rango: CF-001 · 7,2 °C')).to_be_visible()
    adm.screenshot(path=f'{SP}/not-02-bandeja-pc.png', full_page=True)
    ok('admin: la campana muestra 2 sin abrir la página y la bandeja los marca como urgentes (NOT-01/02)')

    # 4) Abrir el aviso lleva a la orden y lo marca como leído
    adm.locator('.notif', has_text='Máquina parada: EMB-002').click()
    expect(adm).to_have_url(re.compile(r'/ordenes/[0-9a-f-]{36}'))
    expect(adm.get_by_text('La embutidora no arranca')).to_be_visible()
    expect(adm.locator('.topbar .bell .nav-badge')).to_have_text('1')
    adm.goto(BASE + '/notificaciones')
    adm.get_by_role('button', name='Marcar todas como leídas').click()
    expect(adm.locator('.notif.unread')).to_have_count(0)
    expect(adm.locator('.topbar .bell .nav-badge')).to_have_count(0)
    ok('admin: abrir el aviso lleva a la orden y lo marca leído; "Marcar todas" deja el contador en cero')

    # 5) El admin asigna la orden al técnico → al técnico le llega en su celular
    adm.locator('.notif', has_text='Máquina parada: EMB-002').click()
    adm.get_by_role('button', name=re.compile('Asignar')).first.click()
    dlg = adm.locator('dialog[open]')
    dlg.get_by_label('Técnico').select_option(label='Técnico Demo')
    dlg.get_by_role('button', name=re.compile('Asignar')).click()
    expect(adm.locator('dialog[open]')).to_have_count(0)
    tcel = b.new_context(**p.devices['iPhone 13'], locale='es-CO', timezone_id='America/Bogota')
    tec = tcel.new_page(); track(tec)
    login(tec, 'tecnico', '4826')
    expect(tec.locator('.topbar .bell .nav-badge')).to_be_visible()
    tec.locator('.topbar .bell').click()
    expect(tec.locator('.notif.unread', has_text=re.compile(r'Le asignaron OT-\d+: EMB-002'))).to_be_visible()
    assert sin_scroll_horizontal(tec)
    tec.screenshot(path=f'{SP}/not-03-tecnico-iphone.png', full_page=True)
    ok('técnico (iPhone): le llega la orden asignada, sin desplazamiento horizontal')

    # 6) Autorizador en el celular: indicadores (KPI-01..06)
    acel = b.new_context(**p.devices['Pixel 7'], locale='es-CO', timezone_id='America/Bogota')
    au = acel.new_page(); track(au)
    login(au, 'autorizador', 'Autoriza2026', '/compras')
    au.locator('.tabbar').get_by_role('button', name='Más').click()
    au.get_by_role('link', name='Indicadores').click()
    expect(au).to_have_url(re.compile('/indicadores'))
    for t in ['Disponibilidad', 'MTBF', 'MTTR', 'Cumplimiento de preventivos', 'Rotación del inventario', 'Valor del inventario hoy']:
        expect(au.locator('.kpi', has_text=t)).to_be_visible()
    expect(au.locator('.hbars li', has_text='EMB-002')).to_be_visible()
    expect(au.locator('.kpi', has_text='Disponibilidad')).to_contain_text('de parada en')
    assert sin_scroll_horizontal(au), 'desplazamiento horizontal en indicadores'
    au.screenshot(path=f'{SP}/kpi-01-celular.png', full_page=True)
    ok('autorizador (celular): 6 indicadores, máquinas que más fallan y sin desplazamiento horizontal')
    au.get_by_role('button', name='Últimos 90 días').click()
    expect(au.get_by_role('button', name='Últimos 90 días')).to_have_attribute('aria-pressed', 'true')
    expect(au).to_have_url(re.compile('desde='))
    au.get_by_text('Cómo se calcula').click()
    expect(au.locator('.how')).to_contain_text('todos los días, las 24 horas')
    expect(au.locator('.how')).not_to_contain_text('Ajustes')
    ok('período seleccionable (queda en la dirección) y explicación de las fórmulas, sin enlace a Ajustes para el autorizador')

    # 7) El admin define el horario de producción y una meta
    adm.goto(BASE + '/configuracion')
    sec = adm.locator('section.card', has=adm.get_by_role('heading', name='Indicadores'))
    for d in ['Sáb', 'Dom']:
        sec.get_by_label(d).uncheck()
    sec.get_by_label('Desde (hora)').fill('06:00')
    sec.get_by_label('Hasta (hora)').fill('22:00')
    sec.get_by_label('Disponibilidad mínima (%)').fill('99.5')
    sec.get_by_role('button', name='Guardar').click()
    expect(sec.locator('.alert-ok')).to_contain_text('guardados')
    adm.goto(BASE + '/indicadores')
    expect(adm.locator('.kpi', has_text='Disponibilidad')).to_contain_text('99,5 %')
    adm.get_by_text('Cómo se calcula').click()
    expect(adm.locator('.how')).to_contain_text('de lunes a viernes, de 06:00 a 22:00')
    adm.screenshot(path=f'{SP}/kpi-02-pc.png', full_page=True)
    adm.goto(BASE + '/configuracion')
    expect(adm.locator('.audit').first).to_contain_text('Cambió el horario de producción o las metas')
    ok('admin: horario lunes a viernes 06:00–22:00 y meta 99,5 %; se refleja en los indicadores y en la bitácora')

    # 8) Operario y técnico no ven indicadores
    op.goto(BASE + '/indicadores')
    expect(op.locator('.kpi')).to_have_count(0)
    expect(op.get_by_role('link', name='Indicadores')).to_have_count(0)
    ok('operario: sin acceso a indicadores')
    b.close()

print('\n', len(results), 'verificaciones OK. Capturas en', SP)
print('Errores de consola:', errors or 'ninguno')
