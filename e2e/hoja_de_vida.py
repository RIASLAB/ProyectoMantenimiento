"""
Carga de la hoja de vida de maquinaria (AC-PMT-FR05, D-34) en un navegador real: se arma un Excel como el de la
planta (dos pestañas = dos termoformadoras, con fotos), se revisa, se eligen las fechas del primer preventivo y se
carga; quedan las máquinas con sus datos y fotos, los planes con sus tareas, la lista de materiales y los repuestos.
Requiere los datos de demostración recién cargados y el frontend compilado (npm run build && npm run preview).
Uso: python e2e/hoja_de_vida.py <contraseña-admin>
"""
import sys, re, os, tempfile, io
from datetime import date, timedelta
from playwright.sync_api import sync_playwright, expect
from openpyxl import Workbook
from openpyxl.drawing.image import Image as XLImage
from PIL import Image

BASE = os.environ.get('CMMS_URL', 'http://localhost:4173')
ADMIN_PASS = sys.argv[1]
SP = os.environ.get('SHOTS', tempfile.mkdtemp(prefix='cmms-hv-'))
errors, results = [], []

def ok(n):
    results.append(n); print('OK  ', n)

def track(page):
    page.on('pageerror', lambda e: errors.append(f'{page.url}: {e}'))
    page.on('console', lambda m: m.type == 'error' and 'Failed to load resource' not in m.text and errors.append(f'{page.url}: {m.text}'))

def foto(color, nombre):
    ruta = os.path.join(SP, nombre)
    Image.new('RGB', (640, 360), color).save(ruta)
    return ruta

def pestaña(wb, titulo, codigo, serie, amperaje, refs):
    ws = wb.create_sheet(titulo)
    ws.merge_cells('C1:L4'); ws['C1'] = 'HOJA DE VIDA DE MAQUINARIA Y EQUIPOS'
    ws['M1'] = 'CODIGO: AC-PMT-FR05'
    ws.merge_cells('A5:N5'); ws['A5'] = 'NOMBRE DEL EQUIPO O MAQUINARIA: TERMOFORMADORA'
    ws.merge_cells('A6:N6'); ws['A6'] = 'DESCRIPCION: EMPACAR EN VACIO LOS PRODUCTOS CARNICOS'
    ws['A7'] = 'AREA DEL EQUIPO: PROCESOS'; ws['I7'] = 'UBICACIÓN: EMPAQUE AL VACIO'
    ws['A8'] = f'CÓDIGO INVENTARIO: {codigo}'; ws['D8'] = 'MARCA: VARIOVAC '; ws['K8'] = 'MODELO: OPTIMUS'
    ws['A9'] = 'REFERENCIA: ---------------'; ws['D9'] = f'N° DE SERIE: {serie}'; ws['K9'] = 'VOLTAJE: 220 V'
    ws['A10'] = f'AMPERAJE: {amperaje}'; ws['D10'] = 'CAPACIDAD: 100 m3/h'; ws['I10'] = 'PESO: 1081 kgs'; ws['K10'] = 'FECHA DE ADQUISICION: 2024'
    ws['A12'] = 'CUENTA CON MANUAL:'; ws['B12'] = 'SI'; ws['C12'] = 'NO'; ws['E12'] = 'UBICACIÓN DEL MANUAL'; ws['H12'] = 'MANTENIMIENTO'
    ws['L12'] = 'ESTADO DEL EQUIPO:'; ws['N12'] = 'OPERATIVO'
    ws['A15'] = 'DESCRIPCIÓN DEL MANTENIMIENTO PREVENTIVO NECESARIO'
    ws.merge_cells('A16:H16'); ws['A16'] = 'ACTIVIDAD'; ws['I16'] = 'PERIODICIDAD'; ws['K16'] = 'MATERIALES A UTILIZAR'
    filas = [
        ('Retirar los rollos de plastico. Limpiar y desinfectar la maquina. Realizar preoperacional.', 'Diario', 'Agua-topaxx66'),
        ('Aceitar la cadena de transporte y verificar tension. Lubricar rodillos deflectores.Limpiar placa de sellado.', 'Trimestral', 'Aceite.Grasa'),
        ('Revisar estado de los moldes y de ser necesario pulir.', 'Trimestral', 'Herramienta menor'),
        ('Cambiar oring de la estacion de sellado y moldeo.', '2 Años', 'Herramienta menor-Multimetro.'),
    ]
    for i, (a, p, m) in enumerate(filas):
        r = 17 + i * 2
        ws.merge_cells(f'A{r}:H{r + 1}'); ws[f'A{r}'] = a; ws[f'I{r}'] = p; ws[f'K{r}'] = m
    ws['A25'] = 'REFERENCIAS DE MATERIALES'
    for i, (izq, der) in enumerate(refs):
        ws[f'A{26 + i}'] = izq
        if der: ws[f'I{26 + i}'] = der
    ws['A31'] = 'REGISTRO FOTOGRAFICO DEL EQUIPO'
    logo = XLImage(foto('white', f'logo-{codigo}.png')); logo.width, logo.height = 60, 60; ws.add_image(logo, 'A1')
    ws.add_image(XLImage(foto('#5b7083', f'maquina-{codigo}.png')), 'A33')
    ws.add_image(XLImage(foto('#a9b4bd', f'placa-{codigo}.png')), 'J32')

archivo = os.path.join(SP, 'termoformadoras.xlsx')
wb = Workbook(); wb.remove(wb.active)
pestaña(wb, 'Termoformadora (2)', 'AP-TF-12', 'OL-2590', '42 A', [
    ('Grasa: Tipo NLGI2', 'Empaque 3x2: A1074843 Cantida 3 hay 2 en almacen'), ('Aceite Mineral: OKS370', 'Empaque 2x2: A1022992 Cantida 1'),
    ('Cuchilla circular: 550A10025', None)])
pestaña(wb, 'Termoformadora (1)', 'AP-TF-11', 'OL-2283', '36 A', [
    ('Grasa: Tipo NLGI2', 'Empaque 3x2: A1022992 Cantida 1'), ('Aceite Mineral: OKS370', None)])
ins = wb.create_sheet('Instrucciones'); ins['A1'] = 'Notas del archivo'
wb.save(archivo)

hoy = date.today()
trimestral = hoy + timedelta(days=10)
with sync_playwright() as p:
    b = p.chromium.launch()
    a = b.new_context(viewport={'width': 1366, 'height': 900}, locale='es-CO', timezone_id='America/Bogota').new_page(); track(a)
    a.goto(BASE + '/ingresar')
    a.get_by_label('Usuario').fill('admin'); a.get_by_label('Contraseña o PIN').fill(ADMIN_PASS)
    a.get_by_role('button', name='Ingresar').click()
    expect(a).to_have_url(re.compile('/ordenes'))

    # 1) Revisión: lo que se va a crear, sin guardar nada
    a.goto(BASE + '/maquinas')
    a.get_by_role('link', name='Hoja de vida').click()
    expect(a.get_by_role('heading', name='Cargar hoja de vida')).to_be_visible()
    a.get_by_label('Archivo de Excel').set_input_files(archivo)
    expect(a.locator('.hv-card')).to_have_count(2)
    tf12 = a.locator('.hv-card', has_text='AP-TF-12')
    expect(tf12).to_contain_text('Nueva')
    for t in ['VARIOVAC', 'OPTIMUS', 'OL-2590', '42 A', '100 m3/h', '1081 kgs', 'Empaque al vacio', 'Procesos']:
        expect(tf12.locator('.hv-datos')).to_contain_text(t)
    expect(tf12.locator('.hv-datos div', has_text='Fotos')).to_contain_text('2')
    trim = tf12.locator('.hv-plan', has_text='Preventivo trimestral')
    expect(trim.locator('li')).to_have_count(4)
    expect(trim.locator('li').nth(2)).to_have_text('Limpiar placa de sellado')
    expect(tf12.locator('.hv-plan', has_text='Preventivo cada 2 años')).to_contain_text('Cambiar oring de la estacion de sellado y moldeo')
    expect(tf12).to_contain_text('Rutina diaria (no genera órdenes')
    expect(tf12.locator('.hv-refs li', has_text='A1074843')).to_contain_text('Repuesto nuevo · 3 en la lista')
    expect(tf12.locator('.hv-refs li', has_text='Tipo NLGI2')).to_contain_text('Sin código: queda en notas')
    expect(tf12).to_contain_text('Según la hoja hay 2 de A1074843 en almacén')
    tf11 = a.locator('.hv-card', has_text='AP-TF-11')
    expect(tf11).to_contain_text('El código A1022992 aparece aquí como "Empaque 3x2" y en la pestaña "Termoformadora (2)" como "Empaque 2x2"')
    expect(a.locator('main')).to_contain_text('Pestañas que no son hojas de vida (no se cargan): Instrucciones')
    a.screenshot(path=f'{SP}/hv-01-revision.png', full_page=True)
    expect(a.locator('.kpi', has_text='Máquinas')).to_contain_text('2')
    expect(a.locator('.kpi', has_text='Planes preventivos')).to_contain_text('4')
    ok('revisión: 2 máquinas nuevas con sus datos, fotos, 2 planes cada una, rutina diaria aparte y avisos de referencias')

    # 2) Fechas del primer preventivo y carga
    a.get_by_label('Primer preventivo trimestral *').fill(trimestral.isoformat())
    expect(a.get_by_label('Primer preventivo cada 2 años *')).to_have_value((hoy + timedelta(days=7)).isoformat())
    expect(a.get_by_label(re.compile('Crear en inventario los 4 repuestos'))).to_be_checked()
    a.get_by_role('button', name='Cargar 2 máquinas').click()
    expect(a.locator('.alert-ok')).to_contain_text('2 máquinas nuevas, 4 fotos, 4 planes preventivos')
    expect(a.locator('.alert-ok')).to_contain_text('4 repuestos nuevos en inventario')
    expect(a.locator('.list-row', has_text='AP-TF-12 · Preventivo trimestral')).to_contain_text(trimestral.strftime('%d/%m/%Y'))
    a.screenshot(path=f'{SP}/hv-02-cargado.png', full_page=True)
    ok('carga: 2 máquinas, 4 fotos, 4 planes con su primera orden, 4 repuestos nuevos')

    # 3) La ficha de la máquina
    a.goto(BASE + '/maquinas?q=AP-TF-12')
    a.locator('.list-row', has_text='AP-TF-12').click()
    main = a.locator('main')
    for t in ['VARIOVAC', 'OL-2590', '42 A', 'Mantenimiento', 'Rutina diaria del operario', 'Referencias de materiales: Grasa: Tipo NLGI2']:
        expect(main).to_contain_text(t)
    expect(main).to_contain_text('Foto 1 AP-TF-12.png')
    mats = a.locator('.materiales')
    expect(mats).to_contain_text('Lista de materiales de esta máquina')
    expect(mats).to_contain_text('A1074843')
    expect(mats.locator('li', has_text='A1074843')).to_contain_text('× 3')
    a.screenshot(path=f'{SP}/hv-03-ficha.png', full_page=True)
    ok('ficha de AP-TF-12: datos técnicos, notas (rutina diaria y referencias), fotos y lista de materiales')

    # 4) Las órdenes y tareas
    a.goto(BASE + '/ordenes?tipo=PREVENTIVO')
    a.locator('.list-row', has_text='AP-TF-12').filter(has_text='Preventivo trimestral').click()
    expect(a.locator('.desc').first).to_contain_text('1. Aceitar la cadena de transporte y verificar tension')
    expect(a.locator('.desc').first).to_contain_text('Indicaciones: Materiales: Aceite.Grasa / Herramienta menor')
    a.goto(BASE + '/ordenes/tareas')
    expect(a.locator('.tareas-grupo', has_text='Termoformadora').locator('.list-row', has_text='Aceitar la cadena')).to_contain_text('En 2 planes')
    ok('la orden trimestral sale con sus tareas y materiales; las tareas quedan en el catálogo (grupo Termoformadora)')

    # 5) Volver a cargar el mismo archivo: se actualiza, sin repetir planes ni fotos
    a.goto(BASE + '/maquinas/hoja-de-vida')
    a.get_by_label('Archivo de Excel').set_input_files(archivo)
    expect(a.locator('.hv-card', has_text='AP-TF-12')).to_contain_text('Ya existe: se actualiza')
    expect(a.locator('.hv-card', has_text='AP-TF-12')).to_contain_text('Ya tiene el plan "Preventivo trimestral": no se crea de nuevo')
    a.get_by_role('button', name='Cargar 2 máquinas').click()
    expect(a.locator('.alert-ok')).to_contain_text('0 máquinas nuevas, 2 actualizadas, 0 fotos, 0 planes preventivos')
    ok('cargar otra vez el mismo archivo actualiza las máquinas sin duplicar planes, fotos ni repuestos')
    b.close()

print('\n', len(results), 'verificaciones OK. Capturas en', SP)
print('Errores de consola:', errors or 'ninguno')
