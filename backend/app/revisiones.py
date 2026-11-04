"""Lectura de la hoja de revisiones de VARI.

Es una hoja distinta de la de movimientos: la llena el formulario con el que
SUM entrega unidades y VARI las revisa. Aqui solo interesa el tramo de
revision, para poder intercalarlo en el recorrido de una unidad.

Dos cosas la hacen especial y explican casi todo este archivo:

1. Pesa unos 21 MB, porque cada revision arrastra hasta 16 URLs de fotos.
   Bajarla entera en cada arranque en frio se come el timeout, asi que se
   piden solo las columnas que se usan con una consulta gviz.
2. Tiene DOS filas de encabezado (la primera agrupa "...por parte de SUM" y
   "Revision por parte de VARI"), asi que las columnas se mapean por POSICION
   contra la lista que se pidio, no por nombre.
"""

from __future__ import annotations

import io
import logging
import re
import urllib.parse
from datetime import datetime

import pandas as pd
import requests

from app.config import (
    CACHE_TTL,
    REVISIONES_ACTIVO,
    REVISIONES_COLUMNAS,
    REVISIONES_FILAS_ENCABEZADO,
    REVISIONES_NOMBRES,
    SHEET_REVISIONES_GID,
    SHEET_REVISIONES_ID,
    TIMEOUT_DESCARGA,
)

logger = logging.getLogger(__name__)

_cache: tuple[pd.DataFrame, datetime] | None = None
_ultimo_error: str | None = None

# "Plataforma 3: Isla 20 |  Fila: A | Columna: 1" -> "ISLA 20 · A-1"
_ISLA = re.compile(r"isla\s*(\d+)", re.IGNORECASE)
_FILA = re.compile(r"fila:\s*([A-Za-z0-9]+)", re.IGNORECASE)
_COLUMNA = re.compile(r"columna:\s*([A-Za-z0-9]+)", re.IGNORECASE)


def _limpiar_ubicacion(crudo: object) -> str:
    """Deja la ubicacion de revision en el mismo formato que la de movimientos."""
    texto = str(crudo or "").strip()
    if not texto:
        return ""

    isla = _ISLA.search(texto)
    if not isla:
        return texto

    fila, columna = _FILA.search(texto), _COLUMNA.search(texto)
    sitio = f"ISLA {isla.group(1)}"
    if fila and columna:
        return f"{sitio} · {fila.group(1)}-{columna.group(1)}"
    return sitio


def _url() -> str:
    """Consulta gviz pidiendo solo las columnas utiles."""
    consulta = f"select {','.join(c.strip() for c in REVISIONES_COLUMNAS.split(','))}"
    return (
        f"https://docs.google.com/spreadsheets/d/{SHEET_REVISIONES_ID}/gviz/tq"
        f"?tqx=out:csv&gid={SHEET_REVISIONES_GID}"
        f"&headers={REVISIONES_FILAS_ENCABEZADO}"
        f"&tq={urllib.parse.quote(consulta)}"
    )


def _procesar(texto_csv: str) -> pd.DataFrame:
    nombres = [n.strip() for n in REVISIONES_NOMBRES.split(",") if n.strip()]

    # Se lee con el encabezado que mande gviz y DESPUES se renombra por
    # posicion, en el mismo orden en que se pidieron las columnas. Hacerlo en
    # dos pasos es lo que permite cazar un desajuste: pasarle names= a
    # read_csv fuerza el numero de columnas y el error pasaria inadvertido,
    # dejando el recorrido sin revisiones y sin decir por que.
    df = pd.read_csv(io.StringIO(texto_csv), dtype=str)

    if len(df.columns) != len(nombres):
        raise ValueError(
            f"La hoja de revisiones devolvio {len(df.columns)} columnas y se "
            f"esperaban {len(nombres)}: {list(df.columns)}. "
            f"Revisa REVISIONES_COLUMNAS y REVISIONES_NOMBRES."
        )

    df.columns = nombres

    # Sin el fillna, una celda vacia llega como NaN y acaba convertida en el
    # texto literal "nan" al formatear la ubicacion.
    for columna in ("chasis", "resultado", "revisor", "nro_revision", "nro_entrega",
                    "modelo", "concesionario", "observaciones", "ubicacion"):
        if columna in df.columns:
            df[columna] = df[columna].fillna("").astype(str).str.strip()

    df["chasis"] = df["chasis"].str.upper()

    # Las fechas vienen como d/m/yyyy H:MM:SS. dayfirst es obligatorio: sin el,
    # "6/3/2026" se leeria como 3 de junio en vez de 6 de marzo.
    df["fecha"] = pd.to_datetime(df["fecha"], errors="coerce", dayfirst=True)

    # Sin fecha o sin chasis no sirve para el recorrido. Esto tambien se lleva
    # por delante la fila de encabezado que gviz pueda colar como dato.
    df = df[df["fecha"].notna() & (df["chasis"].str.len() > 0)]

    df["ubicacion"] = df["ubicacion"].map(_limpiar_ubicacion)

    df = df.sort_values("fecha").reset_index(drop=True)
    logger.info("Hoja de revisiones: %d revisiones de %d unidades",
                len(df), df["chasis"].nunique())
    return df


def obtener_revisiones(force_refresh: bool = False) -> pd.DataFrame:
    """Las revisiones de VARI, con cache en memoria.

    Nunca lanza: si la hoja no se puede leer, devuelve un DataFrame vacio y
    deja el motivo en el estado. El recorrido de una unidad tiene que seguir
    mostrandose aunque esta hoja falle.
    """
    global _cache, _ultimo_error

    if not REVISIONES_ACTIVO:
        return pd.DataFrame()

    ahora = datetime.now()
    if not force_refresh and _cache is not None:
        df, guardado_en = _cache
        if (ahora - guardado_en).total_seconds() < CACHE_TTL:
            return df.copy()

    try:
        respuesta = requests.get(_url(), timeout=TIMEOUT_DESCARGA)
        respuesta.raise_for_status()
        df = _procesar(respuesta.text)
        _cache = (df.copy(), ahora)
        _ultimo_error = None
        return df
    except Exception as error:  # noqa: BLE001 - se reporta y se degrada
        _ultimo_error = f"{type(error).__name__}: {error}"
        logger.error("Error leyendo la hoja de revisiones: %s", _ultimo_error)
        if _cache is not None:
            return _cache[0].copy()
        return pd.DataFrame()


def revisiones_de(chasis: str) -> pd.DataFrame:
    """Las revisiones de una unidad, de la mas antigua a la mas reciente."""
    df = obtener_revisiones()
    if df.empty:
        return df
    return df[df["chasis"] == chasis.strip().upper()].sort_values("fecha")


def estado_revisiones() -> dict:
    """Resumen para el endpoint de salud."""
    if not REVISIONES_ACTIVO:
        return {"activo": False}

    df = obtener_revisiones()
    return {
        "activo": True,
        "revisiones": int(len(df)),
        "unidades": int(df["chasis"].nunique()) if not df.empty else 0,
        "ultima": df["fecha"].max().isoformat() if not df.empty else None,
        "ultimo_error": _ultimo_error,
    }