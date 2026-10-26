"""NFR-02: tiempo de carga de las pantallas principales con 4G lenta (1,6 Mbps, 150 ms), sin caché."""
import sys, os, re, time
from playwright.sync_api import sync_playwright, expect
BASE = os.environ.get('CMMS_URL', 'http://localhost:3000'); PASS = sys.argv[1]
PANTALLAS = [('Órdenes', '/ordenes', '.list-row'), ('Máquinas', '/maquinas', '.list-row'), ('Inventario', '/inventario', '.list-row'),
             ('Calidad', '/calidad', '.point'), ('Indicadores', '/indicadores', '.kpi'), ('Notificaciones', '/notificaciones', 'h1')]
with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(**p.devices['Pixel 7'], locale='es-CO', service_workers='block')
    page = ctx.new_page()
    cdp = ctx.new_cdp_session(page)
    cdp.send('Network.enable')
    cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 150, 'downloadThroughput': 1.6 * 1024 * 1024 / 8, 'uploadThroughput': 750 * 1024 / 8})
    cdp.send('Network.setCacheDisabled', {'cacheDisabled': True})
    t = time.time(); page.goto(BASE + '/ingresar'); expect(page.get_by_role('button', name='Ingresar')).to_be_visible(timeout=20000)
    print(f'{"Ingresar (primera visita)":28s} {time.time() - t:4.1f} s')
    page.get_by_label('Usuario').fill('admin'); page.get_by_label('Contraseña o PIN').fill(PASS)
    page.get_by_role('button', name='Ingresar').click(); expect(page).to_have_url(re.compile('/ordenes'), timeout=20000)
    peor = 0
    for nombre, ruta, sel in PANTALLAS:
        t = time.time(); page.goto(BASE + ruta); page.locator(sel).first.wait_for(timeout=20000); d = time.time() - t
        peor = max(peor, d); print(f'{nombre + " (recarga completa)":28s} {d:4.1f} s')
    cdp.send('Network.setCacheDisabled', {'cacheDisabled': False})
    page.goto(BASE + '/ordenes'); page.locator('.list-row').first.wait_for()
    t = time.time(); page.locator('.tabbar').get_by_role('link', name='Máquinas').click(); page.locator('.list-row').first.wait_for(); print(f'{"Cambio de pestaña (en la app)":28s} {time.time() - t:4.1f} s')
    print('PEOR', round(peor, 1))
    b.close()
