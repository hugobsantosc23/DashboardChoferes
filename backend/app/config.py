"""Configuracion del backend.

Todo se puede sobrescribir con variables de entorno (ver .env.example), asi que
no hace falta tocar este archivo para cambiar de hoja o de lista de choferes.
"""

import os

from dotenv import load_dotenv

load_dotenv()


def _env(clave: str, defecto: str) -> str:
    valor = os.getenv(clave)
    return valor.strip() if valor and valor.strip() else defecto


def _env_int(clave: str, defecto: int) -> int:
    try:
        return int(_env(clave, str(defecto)))
    except ValueError:
        return defecto


def _env_lista(clave: str, defecto: str) -> list[str]:
    crudo = os.getenv(clave)
    crudo = crudo if crudo is not None else defecto
    return [p.strip().upper() for p in crudo.split(",") if p.strip()]


# --- Hoja de Google -------------------------------------------------------
SHEET_ID = _env("SHEET_ID", "1ES8FRNk3RvazGiYtM2buX4F-HNMFwERHZrbr6buHrxk")
SHEET_GID = _env("SHEET_GID", "0")
HOJA_NOMBRE = _env("HOJA_NOMBRE", "Movimientos")

# Descarga toda la pestana como CSV.
EXPORT_URL = (
    f"https://docs.google.com/spreadsheets/d/{SHEET_ID}"
    f"/export?format=csv&gid={SHEET_GID}"
)

# Consulta filtrada (solo las filas de un rango de fechas). Mucho mas liviano
# que bajar la hoja completa; se usa cuando USAR_CONSULTA_FILTRADA esta activo.
# La columna J es "Fecha" en la pestana Movimientos.
GVIZ_URL = (
    f"https://docs.google.com/spreadsheets/d/{SHEET_ID}"
    f"/gviz/tq?tqx=out:csv&sheet={HOJA_NOMBRE}"
)
COLUMNA_FECHA_GVIZ = _env("COLUMNA_FECHA_GVIZ", "J")

# Con la hoja por debajo de ~50.000 filas bajarla entera es mas simple y rapido
# (una sola descarga sirve para todos los endpoints). Pasado ese tamano conviene
# poner esto en "true" para pedirle a Google solo los dias que se necesitan.
USAR_CONSULTA_FILTRADA = _env("USAR_CONSULTA_FILTRADA", "false").lower() == "true"

# --- Duplicados del propio sistema VARI -----------------------------------
# El sistema a veces sube la misma unidad muchas veces (se han visto 20) con la
# misma hora exacta. Eso no son movimientos: uno real exige bajarse del
# vehiculo, abrir la aplicacion, escanear el QR y marcar el sitio.
#
# Dos registros del MISMO vehiculo en la MISMA isla y ubicacion separados por
# ESTOS SEGUNDOS O MENOS se cuentan como uno solo.
#
# El valor por defecto es 3 y no mas, porque el propio sistema deja volver a
# dar ubicacion a los ~5 segundos: con 3 queda margen de sobra para no tocar
# una marca legitima, y basta para atrapar el bug, que repite la misma hora
# exacta (0 segundos de diferencia).
#
#   3 o mas -> colapsa dentro de esa ventana
#   0       -> colapsa solo las horas identicas
#   negativo-> desactivado, conteo en bruto
VENTANA_DUPLICADOS_SEG = _env_int("VENTANA_DUPLICADOS_SEG", 3)

# --- Ubicaciones que no son un movimiento ---------------------------------
# Dejar un vehiculo en una isla de aprobados es marcar un estado de calidad,
# no moverlo de sitio. Las filas que casen con este patron no cuentan como
# produccion (pero siguen en la hoja y se pueden ver en el diagnostico).
#
# El patron cubre "ISLA 18 - APROBADOS", "ISLA 20 - APROBADOS", etc.
UBICACIONES_NO_CUENTAN = _env(
    "UBICACIONES_NO_CUENTAN", r"ISLA\s*\d+\s*-\s*APROBADO"
)

# A que usuarios se les aplica. Lista vacia = a todos.
#
# Solo PROTELANDTEMP: esa cuenta la comparten revisores y movilizadores, y
# la marca en isla de aprobados es trabajo de revision, no un movimiento.
#
# Los movilizadores con cuenta propia tienen 53 marcas asi en el ultimo mes
# (47 de ellas en la ISLA 21). Deberian haber puesto fila y numero, pero se
# dejan contando a proposito: son errores de marcado que conviene que sigan
# viendose en la cifra, no que desaparezcan en silencio.
NO_CUENTAN_SOLO_USUARIOS = _env_lista("NO_CUENTAN_SOLO_USUARIOS", "PROTELANDTEMP")

# --- Nombres para mostrar -------------------------------------------------
# El dashboard muestra estos nombres en vez del usuario del sistema.
NOMBRES_CHOFERES = {
    "BRIVASL": "ANGELO",
    "HSANTOSV": "HUGO RAUL",
    "PROTELANDTEMP": "PROTELANDTEMP",
    "VGUZMAN": "GUZMAN",
}

# Cuentas que comparten varias personas. El dashboard lo indica para que
# nadie compare esa cifra con la de una persona sola.
CUENTAS_COMPARTIDAS = {
    "PROTELANDTEMP": 4,
}

# --- Filtros de negocio ---------------------------------------------------
# Lista vacia = mostrar todos los usuarios que aparezcan en la hoja.
CHOFERES_FILTRO = _env_lista(
    "CHOFERES_FILTRO",
    "JFERNANDEZM,CVEGAL,PROTELANDTEMP,HSANTOSV,BRIVASL,VGUZMAN",
)

ALMACEN = _env("ALMACEN", "VARI BIRRAK")

# --- Rendimiento ----------------------------------------------------------
# Segundos que la hoja se guarda en memoria del proceso.
CACHE_TTL = _env_int("CACHE_TTL", 300)

# Segundos que el CDN de Vercel puede servir una respuesta sin ejecutar la
# funcion. Es lo que de verdad evita descargar la hoja en cada peticion, porque
# en serverless el cache en memoria casi nunca sobrevive entre invocaciones.
CDN_CACHE_SEGUNDOS = _env_int("CDN_CACHE_SEGUNDOS", 120)
CDN_STALE_SEGUNDOS = _env_int("CDN_STALE_SEGUNDOS", 600)

TIMEOUT_DESCARGA = _env_int("TIMEOUT_DESCARGA", 20)

# --- Horario y zona -------------------------------------------------------
ZONA_HORARIA = _env("ZONA_HORARIA", "America/Lima")
HORA_INICIO = _env_int("HORA_INICIO", 6)
HORA_FIN = _env_int("HORA_FIN", 22)

# --- CORS -----------------------------------------------------------------
# Solo necesario si el frontend vive en otro dominio.
CORS_ORIGINS = [
    o for o in _env("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o
]