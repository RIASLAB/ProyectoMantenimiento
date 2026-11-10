"""
Módulos de inventario y compras (D-40) en un navegador real: apagados, desaparecen del menú, de las órdenes, de los
planes, de la ficha de la máquina y de los indicadores; la bodega de máquinas sigue disponible; las páginas del módulo
avisan que está apagado. El administrador los vuelve a encender desde Ajustes → Módulos.
Requiere los datos de demostración recién cargados y el frontend compilado (npm run build && npm run preview).
Uso: python e2e/modulos.py <contraseña-admin>
"""
import sys, re, os, tempfile
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('CMMS_URL', 'http://localhost:4173')
ADMIN_PASS = sys.argv[1]
SP = os.environ.get('SHOTS', tempfile.mkdtemp(prefix='cmms-modulos-'))
errors, results = [], []
VERIF = {'verificaciones': [{'id': i, 'cumple': True} for i in ('especificaciones', 'piezas', 'herramientas', 'limpieza')]}

def ok(n):
    results.append(n); print('OK  ', n)

def track(page):
    page.on('pageerror', lambda e: errors.append(f'{page.url}: {e}'))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(f'{page.url}: {m.text}'))

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1366, 'height': 900}, locale='es-CO', timezone_id='America/Bogota')
    api = ctx.request
    tok = api.post(BASE + '/api/auth/login', data={'usuario': 'admin', 'credencial': ADMIN_PASS}).json()['token']
    H = {'Authorization': f'Bearer {tok}'}
    post = lambda path, body: api.post(BASE + '/api' + path, data=body, headers=H)
    assert api.put(BASE + '/api/parametros/modulos', data={'inventario': False, 'compras': False}, headers=H).ok
    maq = post('/activos', {'codigo': 'TER-MOD-01', 'nombre': 'Termoformadora módulos', 'area': 'Empaque'}).json()
    falla = post('/ordenes', {'activoId': maq['id'], 'descripcion': 'Se descalibra el corte', 'maquinaParada': False}).json()

    a = ctx.new_page(); track(a)
    a.goto(BASE + '/ingresar')
    a.get_by_label('Usuario').fill('admin'); a.get_by_label('Contraseña o PIN').fill(ADMIN_PASS)
    a.get_by_role('button', name='Ingresar').click()
    expect(a).to_have_url(re.compile('/ordenes'))
    menu = a.locator('.sidebar')

    # 1) Menú: sin Compras ni Inventario; la bodega de máquinas sigue
    expect(menu.get_by_role('link', name='Compras')).to_have_count(0)
    expect(menu.get_by_role('link', name='Inventario')).to_have_count(0)
    menu.get_by_role('link', name='Bodega').click()
    expect(a).to_have_url(re.compile('/inventario/equipos'))
    expect(a.get_by_role('heading', name='Bodega', exact=True)).to_be_visible()
    expect(a.locator('.tabs[aria-label="Secciones de inventario"]')).to_have_count(0)
    ok('apagados: el menú no muestra Compras ni Inventario; la bodega de máquinas sigue')

    # 2) Las páginas de los módulos avisan
    a.goto(BASE + '/compras')
    expect(a.get_by_text('El módulo de Compras está apagado')).to_be_visible()
    a.goto(BASE + '/inventario')
    expect(a.get_by_text('El módulo de Inventario de repuestos está apagado')).to_be_visible()
    expect(a.get_by_role('link', name='Ajustes → Módulos')).to_be_visible()
    ok('las páginas de inventario y compras avisan que el módulo está apagado')

    # 3) La orden: sin repuestos ni compras; se cierra sin la sección de repuestos
    a.goto(BASE + f"/ordenes/{falla['id']}")
    expect(a.get_by_role('heading', name='Fotos')).to_be_visible()
    expect(a.get_by_role('heading', name='Repuestos', exact=True)).to_have_count(0)
    expect(a.get_by_role('heading', name='Compras de repuestos')).to_have_count(0)
    tecs = api.get(BASE + '/api/usuarios/tecnicos', headers=H).json()
    tecnico = next(t for t in tecs if t['rol'] == 'TECNICO')['id']
    assert post(f"/ordenes/{falla['id']}/asignar", {'tecnicoId': tecnico}).ok
    assert post(f"/ordenes/{falla['id']}/iniciar", {}).ok
    a.reload()
    a.get_by_role('button', name='Cerrar orden').first.click()
    dlg = a.locator('dialog[open]')
    expect(dlg.get_by_text('Mano de obra (horas)')).to_be_visible()
    expect(dlg.get_by_text('Repuestos usados')).to_have_count(0)
    dlg.get_by_label('Trabajo realizado *').fill('Calibración de cuchillas de corte')
    for r_ in dlg.get_by_role('radio', name='Cumple', exact=True).all(): r_.click()
    a.get_by_role('button', name='Cerrar orden').last.click()
    expect(a.locator('dialog[open]')).to_have_count(0)
    expect(a.get_by_role('heading', name='Cierre')).to_be_visible()
    expect(a.locator('.stats')).not_to_contain_text('Repuestos')
    a.screenshot(path=f'{SP}/orden-sin-repuestos.png', full_page=True)
    ok('la orden no muestra repuestos ni compras y se cierra sin la sección de repuestos usados')

    # 4) Plan, ficha de la máquina e indicadores
    a.goto(BASE + '/ordenes/planes')
    a.get_by_role('button', name='Nuevo plan').click()
    dlg = a.locator('dialog[open]')
    expect(dlg.get_by_label('Nombre *')).to_be_visible()
    expect(dlg.get_by_text('Materiales por ejecución')).to_have_count(0)
    dlg.get_by_role('button', name='Cancelar').click()
    a.goto(BASE + f"/maquinas/{maq['id']}")
    expect(a.get_by_text('Termoformadora módulos').first).to_be_visible()
    expect(a.locator('.materiales')).to_have_count(0)
    a.goto(BASE + '/indicadores')
    expect(a.get_by_text('Cumplimiento de preventivos')).to_be_visible()
    expect(a.get_by_text('Rotación del inventario')).to_have_count(0)
    expect(a.get_by_role('heading', name='Repuestos bajo el mínimo')).to_have_count(0)
    ok('sin materiales en el plan ni en la ficha; los indicadores no muestran inventario')

    # 5) Ajustes → Módulos: compras depende de inventario; al encender vuelve todo
    a.goto(BASE + '/configuracion')
    card = a.locator('#modulos')
    inv = card.get_by_role('checkbox', name=re.compile('Inventario de repuestos'))
    com = card.get_by_role('checkbox', name=re.compile('Compras'))
    expect(inv).not_to_be_checked(); expect(com).to_be_disabled()
    expect(a.get_by_role('heading', name='Autorizador de compras')).to_have_count(0)
    a.screenshot(path=f'{SP}/ajustes-modulos.png', full_page=False)
    inv.click(); expect(inv).to_be_checked()
    expect(com).to_be_enabled()
    com.click()
    expect(com).to_be_checked()
    expect(menu.get_by_role('link', name='Compras')).to_be_visible()
    expect(menu.get_by_role('link', name='Inventario')).to_be_visible()
    expect(a.get_by_role('heading', name='Autorizador de compras')).to_be_visible()
    inv.click(); expect(inv).not_to_be_checked()
    expect(com).not_to_be_checked()
    expect(menu.get_by_role('link', name='Compras')).to_have_count(0)
    ok('Ajustes → Módulos enciende y apaga; compras se apaga con el inventario')

    bit = api.get(BASE + '/api/bitacora?entidad=parametro', headers=H).json()['items']
    assert any(x['accion'] == 'MODULOS_CAMBIADOS' for x in bit)
    ok('cada cambio de módulos queda en la bitácora')

    # 6) D-41: otra administradora ve los módulos bloqueados y no puede tocar la cuenta del principal
    aux = post('/usuarios', {'nombre': 'Auxiliar Administrativa', 'usuario': 'auxiliar', 'rol': 'ADMIN', 'credencial': 'Auxiliar2026'}).json()
    c2 = b.new_context(viewport={'width': 1366, 'height': 900}, locale='es-CO', timezone_id='America/Bogota')
    x = c2.new_page(); track(x)
    x.goto(BASE + '/ingresar')
    x.get_by_label('Usuario').fill('auxiliar'); x.get_by_label('Contraseña o PIN').fill('Auxiliar2026')
    x.get_by_role('button', name='Ingresar').click()
    # Primer ingreso: cambia la contraseña que le asignó el administrador.
    if True:
        x.get_by_label('Contraseña actual *').fill('Auxiliar2026')
        x.get_by_label('Nueva contraseña *', exact=True).fill('Auxiliar2027x')
        x.get_by_label('Repita la nueva contraseña *').fill('Auxiliar2027x')
        x.get_by_role('button', name='Cambiar contraseña').click()
        expect(x.get_by_label('Contraseña actual *')).to_have_count(0)
    x.goto(BASE + '/configuracion')
    card = x.locator('#modulos')
    expect(card.get_by_text('Solo el administrador principal puede encender o apagar módulos.')).to_be_visible()
    expect(card.get_by_role('checkbox', name=re.compile('Inventario de repuestos'))).to_be_disabled()
    x.goto(BASE + '/usuarios')
    fila_admin = x.locator('li.list-row', has=x.get_by_text('admin', exact=True))
    expect(fila_admin.get_by_text('Principal')).to_be_visible()
    expect(fila_admin.get_by_role('button', name='Editar')).to_have_count(0)
    fila_yo = x.locator('li.list-row', has=x.get_by_text('auxiliar', exact=True))
    expect(fila_yo.get_by_role('button', name='Editar')).to_be_visible()
    x.screenshot(path=f'{SP}/usuarios-auxiliar.png', full_page=False)
    c2.close()
    ok('otra administradora ve los módulos bloqueados y no puede editar la cuenta del principal')

    api.put(BASE + '/api/parametros/modulos', data={'inventario': True, 'compras': True}, headers=H)
    b.close()

print(f'\n{len(results)} verificaciones OK · capturas en {SP}')
if errors:
    print('ERRORES DE CONSOLA:'); [print(' ', e) for e in errors]; sys.exit(1)
