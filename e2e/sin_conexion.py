"""
Modo sin conexión en un navegador real (celular): se corta la red, se recarga la app y se trabaja;
al volver la señal todo se sincroniza solo. También prueba un conflicto (D-01).
Requiere los datos de demostración recién cargados y el frontend compilado (npm run build && npm run preview).
Uso: python e2e/sin_conexion.py <contraseña-admin>
"""
import sys, re, os, json, tempfile, urllib.request
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('CMMS_URL', 'http://localhost:4173')
ADMIN_PASS = sys.argv[1]
SP = os.environ.get('SHOTS', tempfile.mkdtemp(prefix='cmms-offline-'))
JPG = os.path.join(SP, 'offline.jpg')
open(JPG, 'wb').write(bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]) + b'\x00' * 64)
errors, results = [], []

def ok(n):
    results.append(n); print('OK  ', n)

def track(page):
    page.on('pageerror', lambda e: errors.append(f'{page.url}: {e}'))

def api(method, path, token=None, body=None):
    req = urllib.request.Request(f'{BASE}/api{path}', method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'Content-Type': 'application/json', **({'Authorization': f'Bearer {token}'} if token else {})})
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())

admin = api('POST', '/auth/login', body={'usuario': 'admin', 'credencial': ADMIN_PASS})['token']
tec_id = next(u['id'] for u in api('GET', '/usuarios', admin) if u['usuario'] == 'tecnico')
# La falla de demostración (sin asignar) se asigna al técnico para el caso de conflicto
falla = next(o for o in api('GET', '/ordenes?vista=abiertas', admin) if o['tipo'] == 'CORRECTIVO')
api('POST', f"/ordenes/{falla['id']}/asignar", admin, {'tecnicoId': tec_id})
prev = next(o for o in api('GET', '/ordenes?vista=abiertas', admin) if o['tipo'] == 'PREVENTIVO')
rod = next(r for r in api('GET', '/repuestos', admin) if r['codigo'] == 'RP-ROD-6205')

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(**p.devices['Pixel 7'], locale='es-CO', timezone_id='America/Bogota')
    page = ctx.new_page(); track(page)

    # 1) Con señal: ingresa y la app se prepara (service worker + datos en el dispositivo)
    page.goto(BASE + '/ingresar')
    page.get_by_label('Usuario').fill('tecnico')
    page.get_by_label('Contraseña o PIN').fill('4826')
    page.get_by_role('button', name='Ingresar').click()
    expect(page).to_have_url(re.compile('/ordenes'))
    page.wait_for_timeout(2500)
    page.reload()  # que el service worker controle la página
    page.wait_for_function("navigator.serviceWorker.controller !== null", timeout=15000)
    page.wait_for_timeout(2500)  # descarga de datos para trabajar sin señal
    ok('con señal: la app quedó instalada y con datos guardados')

    # 2) Se corta la red y se recarga la app: abre igual, con sesión y datos
    ctx.set_offline(True)
    page.reload()
    expect(page.locator('.topbar .conn')).to_contain_text('Sin conexión')
    expect(page.locator('.list-row', has_text='Lubricación y revisión')).to_be_visible()
    page.screenshot(path=f'{SP}/off-01-sin-senal.png')
    ok('sin red: la app abre desde el celular, con la sesión y la lista de órdenes')

    # 3) Inicia y cierra el preventivo sin señal
    page.locator('.list-row', has_text='Lubricación y revisión').click()
    page.get_by_role('button', name='Iniciar trabajo').click()
    expect(page.locator('.page-subtitle')).to_contain_text('En ejecución')
    expect(page.get_by_text('Guardado en este dispositivo, sin enviar')).to_be_visible()
    page.get_by_role('button', name='Cerrar orden').first.click()
    dlg = page.locator('dialog[open]')
    dlg.get_by_label('Trabajo realizado *').fill('Lubricación hecha en la sala sin señal')
    dlg.get_by_label('Horas').first.fill('1')
    page.get_by_role('button', name='Cerrar orden').last.click()
    expect(page.locator('dialog[open]')).to_have_count(0)
    expect(page.locator('.page-subtitle')).to_contain_text('Cerrada')
    expect(page.locator('.alert-warn')).to_contain_text('Iniciar trabajo · Cerrar orden')
    page.screenshot(path=f'{SP}/off-02-cerrada-sin-senal.png', full_page=True)
    ok('sin red: inicia y cierra la orden; queda guardado en el dispositivo')

    # 4) Temperatura y reporte de falla con foto, sin señal
    page.goto(BASE + '/calidad/temperatura')
    page.get_by_label('Equipo y punto de control *').select_option(label='CF-001 · Cuarto frío de producto terminado — Temperatura de cámara')
    page.get_by_label('Temperatura (°C) *').fill('2.8')
    page.get_by_role('button', name='Guardar registro').click()
    expect(page.locator('.alert-ok')).to_contain_text('Guardado en el dispositivo (sin señal)')
    page.goto(BASE + '/ordenes/reportar')
    page.get_by_label('Máquina *').select_option(label='EMB-002 · Embutidora al vacío')
    page.get_by_label('¿Qué pasó? *').fill('Ruido en la bomba de vacío (reportado sin señal)')
    page.get_by_label('Foto (opcional)').set_input_files(JPG)
    page.get_by_role('button', name='Enviar reporte').click()
    expect(page.get_by_text('quedó guardado en este dispositivo')).to_be_visible()
    ok('sin red: temperatura y reporte de falla con foto quedan guardados')

    # 5) La orden en conflicto: el técnico la trabaja sin señal mientras el admin la cancela
    page.goto(BASE + f"/ordenes/{falla['id']}")
    page.get_by_role('button', name='Iniciar trabajo').click()
    expect(page.locator('.page-subtitle')).to_contain_text('En ejecución')
    api('POST', f"/ordenes/{falla['id']}/cancelar", admin, {'motivo': 'Duplicada con otra orden'})

    # 6) Recargar sin señal no pierde nada
    page.reload()
    expect(page.locator('.topbar .conn')).to_contain_text('5 por enviar')
    page.goto(BASE + '/pendientes')
    expect(page.locator('.list-row')).to_have_count(5)
    page.screenshot(path=f'{SP}/off-03-pendientes.png', full_page=True)
    ok('al recargar sin señal los 5 registros siguen guardados (OFF-08)')

    # 7) Vuelve la señal: se envía todo solo, en orden
    ctx.set_offline(False)
    expect(page.get_by_text('No se aplicó')).to_have_count(1, timeout=30000)
    expect(page.locator('.list-row')).to_have_count(1)
    expect(page.locator('.list-row')).to_contain_text('cancelada')
    expect(page.locator('.topbar .conn')).to_contain_text('1 con error')
    page.screenshot(path=f'{SP}/off-04-conflicto.png', full_page=True)
    ok('con señal: 4 registros se enviaron solos; el de la orden cancelada queda con el motivo (D-01)')
    page.get_by_role('button', name='Descartar').click()
    page.locator('dialog[open]').get_by_role('button', name='Descartar').click()
    expect(page.get_by_text('Todo está sincronizado')).to_be_visible()
    expect(page.locator('.topbar .conn')).to_have_count(0)
    ok('el usuario descarta el registro en conflicto y queda todo sincronizado')
    b.close()

# 8) Verificación en el servidor
o = api('GET', f"/ordenes/{prev['id']}", admin)
assert o['estado'] == 'CERRADA' and o['cerradaSinConexion'] is True, o['estado']
assert any('sin conexión' in (e['nota'] or '') for e in o['eventos'])
r = api('GET', f"/repuestos/{rod['id']}", admin)
assert r['stock'] == rod['stock'] - 2, (rod['stock'], r['stock'])
ok(f"servidor: preventivo cerrado sin conexión y rodamientos descontados ({rod['stock']} → {r['stock']})")
t = api('GET', '/calidad/temperaturas', admin)
assert any(x['valor'] == 2.8 and x['usuario']['nombre'] == 'Técnico Demo' for x in t)
nuevas = [x for x in api('GET', '/ordenes?vista=abiertas', admin) if 'reportado sin señal' in x['descripcion']]
assert len(nuevas) == 1, nuevas
d = api('GET', f"/ordenes/{nuevas[0]['id']}", admin)
assert len(d['fotos']) == 1
ok('servidor: temperatura de 2,8 °C y reporte con su foto, sin duplicados')
assert api('GET', f"/ordenes/{falla['id']}", admin)['estado'] == 'CANCELADA'
ok('servidor: la orden cancelada por el admin sigue cancelada')

print('\n', len(results), 'verificaciones OK. Capturas en', SP)
print('Errores de consola:', errors or 'ninguno')
