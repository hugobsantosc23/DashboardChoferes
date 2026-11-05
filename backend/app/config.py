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

# --- Hoja de revisiones de VARI -------------------------------------------
# Otra hoja distinta: la del formulario con el que SUM entrega unidades y VARI
# las revisa. Se usa solo para intercalar la revision en el recorrido.
SHEET_REVISIONES_ID = _env(
    "SHEET_REVISIONES_ID", "1DVgDOSHEI1w69BvPWy1YdOHnShik8UtzR6Wf8_f62-k"
)
SHEET_REVISIONES_GID = _env("SHEET_REVISIONES_GID", "414852562")

# La hoja pesa unos 21 MB porque cada revision arrastra hasta 16 URLs de
# fotos. Se piden solo estas columnas con una consulta gviz; bajarla entera
# se comeria el timeout en cada arranque en frio.
#
#   A  Submission Date        P  Nro de Entrega     S  Aceptacion / Rechazo
#   B  Chasis                 Q  Nro Revision       T  Observaciones
#   C  Concesionario          R  Fecha Revision     AE Revisado por
#   D  Modelo                 F  Ubicacion
#
# Las dos listas van en paralelo: la columna N de REVISIONES_COLUMNAS se
# llamara como el nombre N de REVISIONES_NOMBRES. Si cambias una, cambia la
# otra.
REVISIONES_COLUMNAS = _env("REVISIONES_COLUMNAS", "A,B,C,D,F,P,Q,R,S,T,AE")
REVISIONES_NOMBRES = _env(
    "REVISIONES_NOMBRES",
    "entrega_sum,chasis,concesionario,modelo,ubicacion,"
    "nro_entrega,nro_revision,fecha,resultado,observaciones,revisor",
)

# La hoja tiene dos filas de encabezado: la primera agrupa "...por parte de
# SUM" y "Revision por parte de VARI", la segunda son los nombres de verdad.
REVISIONES_FILAS_ENCABEZADO = _env_int("REVISIONES_FILAS_ENCABEZADO", 2)

# Apagalo si la hoja deja de estar compartida: el recorrido sigue saliendo,
# solo que sin el tramo de revision.
REVISIONES_ACTIVO = _env("REVISIONES_ACTIVO", "true").lower() == "true"

# --- Flujo de una unidad --------------------------------------------------
# Cada marca de la hoja se clasifica en una etapa del recorrido. Se prueba en
# ESTE orden y gana la primera que case, asi que lo especifico va antes que lo
# general ("ISLA 20 - APROBADOS" antes que "ISLA 20").
ETAPAS_FLUJO = (
    (r"ZONA\s*DESPACHO", "DESPACHO"),
    (r"LAVADO\s*VARI", "LAVADO_VARI"),
    (r"PICKING\s*LAVADO|ZONA\s*ACOPIO|COLA\s*DE\s*LAVADO\s*SUM", "LAVADO_SUM"),
    (r"ISLA\s*\d+\s*-\s*APROBADO", "APROBADO"),
    (r"REVISI[OÓ]N", "REVISION"),
    (r"^\s*(ISLA|P|C)\s*\d+", "ISLA"),
)
ETAPA_POR_DEFECTO = "OTRO"

TITULOS_ETAPA = {
    "LAVADO_SUM": "Cola de lavado SUM",
    "REVISION": "Zona de revision",
    "APROBADO": "Aprobado por inspeccion",
    "ISLA": "Estacionado en isla",
    "LAVADO_VARI": "Lavado VARI",
    "DESPACHO": "Zona de despacho",
    "OTRO": "Otro punto del almacen",
}

# Etapas que son un solo tramo aunque pasen por varias ubicaciones: el lavado
# SUM son tres marcas seguidas (picking -> acopio -> cola) y el de VARI otras
# tres (cola -> en proceso -> finalizado). Mostrarlas sueltas llena la linea
# de tiempo de pasos que no son paradas distintas.
ETAPAS_DE_UN_TRAMO = {"LAVADO_SUM", "LAVADO_VARI"}

# Recorrido esperado, para avisar de lo que no paso.
ORDEN_ETAPAS = (
    "LAVADO_SUM", "REVISION", "APROBADO", "ISLA", "LAVADO_VARI", "DESPACHO"
)
ETAPA_FINAL = "DESPACHO"

ALMACEN = _env("ALMACEN", "VARI BIRRAK")

# --- Rendimiento ----------------------------------------------------------
# Segundos que la hoja se guarda en memoria del proceso.
CACHE_TTL = _env_int("CACHE_TTL", 120)

# Segundos que el CDN de Vercel puede servir una respuesta sin ejecutar la
# funcion. Es lo que de verdad evita descargar la hoja en cada peticion, porque
# en serverless el cache en memoria casi nunca sobrevive entre invocaciones.
CDN_CACHE_SEGUNDOS = _env_int("CDN_CACHE_SEGUNDOS", 60)
CDN_STALE_SEGUNDOS = _env_int("CDN_STALE_SEGUNDOS", 120)

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