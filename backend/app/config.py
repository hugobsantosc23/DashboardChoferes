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

# --- Filtros de negocio ---------------------------------------------------
# Lista vacia = mostrar todos los usuarios que aparezcan en la hoja.
CHOFERES_FILTRO = _env_lista(
    "CHOFERES_FILTRO",
    "JFERNANDEZM,CVEGAL,PROTELANDTEMP,HSANTOSV,BRIVASL",
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
