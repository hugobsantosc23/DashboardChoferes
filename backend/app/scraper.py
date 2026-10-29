"""Lectura y normalizacion de la hoja de Google que alimenta el dashboard.

La hoja la escribe el script de Apps Script de /extraccion. Aqui solo se lee,
se normaliza y se deja en un DataFrame listo para consultar.
"""

from __future__ import annotations

import io
import logging
import unicodedata
import urllib.parse
from datetime import date, datetime

import pandas as pd
import requests

from app.config import (
    CACHE_TTL,
    CHOFERES_FILTRO,
    COLUMNA_FECHA_GVIZ,
    EXPORT_URL,
    GVIZ_URL,
    TIMEOUT_DESCARGA,
    USAR_CONSULTA_FILTRADA,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Mapeo EXPLICITO de los encabezados de la hoja a nombres internos.
# Antes se adivinaba por substring con if/elif, y bastaba renombrar una columna
# en la hoja para que el dashboard empezara a leer datos equivocados en silencio.
MAPA_COLUMNAS: dict[str, str] = {
    "vin": "chasis",
    "chasis": "chasis",
    "usuario": "chofer",
    "chofer": "chofer",
    "conductor": "chofer",
    "fecha": "fecha",
    "marca": "marca",
    "tipo vehiculo": "tipo",
    "tipovehiculo": "tipo",
    "cliente": "cliente",
    "almacen": "almacen",
    "isla": "isla",
    "ubicacion": "ubicacion",
    "estado": "estado",
}

COLUMNAS_OBLIGATORIAS = {"chasis", "chofer", "fecha"}

COLUMNAS_TEXTO = (
    "chofer",
    "chasis",
    "ubicacion",
    "isla",
    "marca",
    "cliente",
    "estado",
    "tipo",
    "almacen",
)

VACIOS = {"", "NAN", "NONE", "NULL", "-"}

_cache: dict[str, tuple[pd.DataFrame, datetime]] = {}
_ultimo_error: str | None = None


def _normalizar_encabezado(texto: object) -> str:
    """Quita acentos, colapsa espacios y pasa a minusculas."""
    sin_acentos = (
        unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode()
    )
    return " ".join(sin_acentos.strip().lower().split())


def _construir_url(desde: date | None) -> str:
    """URL de descarga: hoja completa, o solo las filas desde una fecha."""
    if not USAR_CONSULTA_FILTRADA or desde is None:
        return EXPORT_URL

    consulta = (
        f"select * where {COLUMNA_FECHA_GVIZ} >= "
        f"datetime '{desde.isoformat()} 00:00:00'"
    )
    return f"{GVIZ_URL}&tq={urllib.parse.quote(consulta)}"


def _parsear_fechas(crudas: pd.Series) -> pd.Series:
    """Convierte a datetime aceptando ISO y, como respaldo, dd/mm/yyyy.

    Importa el orden: si Google exporta '27/10/2026', interpretarlo como
    mes/dia produce fechas invalidas o cruzadas, asi que el respaldo va con
    dayfirst=True en lugar del formato por defecto de pandas.
    """
    fechas = pd.to_datetime(crudas, errors="coerce", format="ISO8601")

    pendientes = fechas.isna() & crudas.notna()
    if pendientes.any():
        fechas.loc[pendientes] = pd.to_datetime(
            crudas[pendientes], errors="coerce", dayfirst=True
        )
    return fechas


def _procesar(texto_csv: str) -> pd.DataFrame:
    df = pd.read_csv(io.StringIO(texto_csv), dtype=str)
    filas_crudas = len(df)

    df = df.rename(
        columns={
            c: MAPA_COLUMNAS.get(_normalizar_encabezado(c), _normalizar_encabezado(c))
            for c in df.columns
        }
    )
    df = df.loc[:, ~df.columns.duplicated()]

    faltantes = COLUMNAS_OBLIGATORIAS - set(df.columns)
    if faltantes:
        raise ValueError(
            f"La hoja no tiene las columnas {sorted(faltantes)}. "
            f"Encabezados leidos: {list(df.columns)}"
        )

    for columna in COLUMNAS_TEXTO:
        if columna in df.columns:
            df[columna] = df[columna].fillna("").astype(str).str.strip().str.upper()

    # Una fila sin hora es un registro incompleto de la hoja, no un movimiento.
    fecha_cruda = df["fecha"].fillna("").astype(str)
    tiene_hora = fecha_cruda.str.contains(r"[:T]", regex=True, na=False)

    df["fecha"] = _parsear_fechas(fecha_cruda)
    df = df[tiene_hora & df["fecha"].notna()]

    df = df[~df["chofer"].isin(VACIOS)]
    df = df[~df["chasis"].isin(VACIOS)]

    if CHOFERES_FILTRO:
        df = df[df["chofer"].isin(CHOFERES_FILTRO)]

    df = df.drop_duplicates(subset=["fecha", "chasis", "chofer"])
    df = df.sort_values("fecha").reset_index(drop=True)

    logger.info(
        "Hoja procesada: %d filas crudas -> %d movimientos validos",
        filas_crudas,
        len(df),
    )
    return df


def obtener_movimientos(
    desde: date | None = None, force_refresh: bool = False
) -> pd.DataFrame:
    """Devuelve los movimientos normalizados, usando cache en memoria."""
    global _ultimo_error

    clave = f"desde={desde.isoformat() if desde else 'todo'}"
    ahora = datetime.now()

    if not force_refresh and clave in _cache:
        df, guardado_en = _cache[clave]
        edad = (ahora - guardado_en).total_seconds()
        if edad < CACHE_TTL:
            logger.info("Cache en memoria (%.0fs)", edad)
            return df.copy()

    url = _construir_url(desde)

    try:
        # Sin timeout una peticion lenta de Google deja el backend colgado.
        respuesta = requests.get(url, timeout=TIMEOUT_DESCARGA)
        respuesta.raise_for_status()

        df = _procesar(respuesta.text)

        _cache[clave] = (df.copy(), ahora)
        _ultimo_error = None
        return df

    except Exception as error:  # noqa: BLE001 - se reporta y se degrada
        _ultimo_error = f"{type(error).__name__}: {error}"
        logger.error("Error leyendo la hoja: %s", _ultimo_error)

        if clave in _cache:
            logger.warning("Sirviendo cache vencida para no cortar el servicio")
            return _cache[clave][0].copy()
        raise


def estado_cache() -> dict:
    """Resumen del cache, para el endpoint de salud."""
    return {
        "entradas": [
            {
                "clave": clave,
                "filas": len(df),
                "guardado_en": guardado_en.isoformat(timespec="seconds"),
                "edad_segundos": round((datetime.now() - guardado_en).total_seconds()),
            }
            for clave, (df, guardado_en) in _cache.items()
        ],
        "ttl_segundos": CACHE_TTL,
        "consulta_filtrada": USAR_CONSULTA_FILTRADA,
        "ultimo_error": _ultimo_error,
    }
