"""Lectura y normalizacion de la hoja de Google que alimenta el dashboard.

La hoja la escribe el script de Apps Script de /extraccion. Aqui solo se lee,
se normaliza y se deja en un DataFrame listo para consultar.
"""

from __future__ import annotations

import io
import logging
import re
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
    NO_CUENTAN_SOLO_USUARIOS,
    TIMEOUT_DESCARGA,
    UBICACIONES_NO_CUENTAN,
    USAR_CONSULTA_FILTRADA,
    VENTANA_DUPLICADOS_SEG,
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


def _clave_sitio(df: pd.DataFrame) -> list[str]:
    """Columnas que identifican "el mismo vehiculo en el mismo sitio"."""
    return ["chasis"] + [c for c in ("isla", "ubicacion") if c in df.columns]


def marcar_duplicados_del_sistema(df: pd.DataFrame) -> pd.DataFrame:
    """Marca como repeticion los registros que el sistema VARI duplico.

    Un movimiento real exige bajarse del vehiculo, abrir la aplicacion,
    escanear el QR y marcar el sitio: no ocurre dos veces sobre el mismo
    vehiculo y el mismo sitio en cuestion de segundos. Cuando eso aparece en
    los datos es el sistema subiendo la misma unidad varias veces, y contarlo
    infla la produccion del chofer.

    Anade la columna booleana `repeticion`. No borra nada: asi el endpoint de
    diagnostico puede mostrar exactamente que se esta descartando.

    Con la ventana en 0 solo se colapsan las horas identicas, que es el caso
    tipico del bug. Con un valor negativo no se marca nada y el conteo queda
    en bruto, tal como lo entrega el sistema.
    """
    df = df.copy()

    if df.empty or VENTANA_DUPLICADOS_SEG < 0:
        df["repeticion"] = False
        df["fecha_previa_mismo_sitio"] = pd.NaT
        df["racha"] = range(len(df))
        return df

    clave = _clave_sitio(df)

    # Orden estable: con varias filas de fecha identica (justo lo que produce
    # el bug del sistema) un orden no determinista haria que cada recalculo
    # eligiera una fila distinta como "la primera". Se calcula UNA vez y la
    # fecha anterior se guarda como columna, para que ningun otro sitio tenga
    # que volver a ordenar y llegue a un reparto distinto.
    df = df.sort_values(clave + ["fecha"], kind="stable")

    previa = df.groupby(clave, sort=False)["fecha"].shift()
    desde_anterior = df["fecha"] - previa
    dentro_ventana = desde_anterior.notna() & (
        desde_anterior <= pd.Timedelta(seconds=VENTANA_DUPLICADOS_SEG)
    )

    df["fecha_previa_mismo_sitio"] = previa
    df["repeticion"] = dentro_ventana

    # Identificador de racha: todas las copias de una misma subida comparten
    # numero. Sin esto, una unidad repetida 20 veces aparece como 19 lineas
    # identicas en el diagnostico y tapa los demas casos.
    df["racha"] = (~dentro_ventana).cumsum()

    # La fecha previa solo tiene sentido en las filas marcadas.
    df.loc[~df["repeticion"], "fecha_previa_mismo_sitio"] = pd.NaT

    return df.sort_values("fecha", kind="stable").reset_index(drop=True)


def marcar_no_movimientos(df: pd.DataFrame) -> pd.DataFrame:
    """Marca las filas que son un cambio de estado, no un movimiento.

    Dejar un vehiculo en una isla de aprobados es marcar calidad, no llevarlo
    a otro sitio. Anade la columna `aprobacion`; no borra nada, para que el
    diagnostico pueda ensenar exactamente que se esta descontando.
    """
    df = df.copy()

    if df.empty or not UBICACIONES_NO_CUENTAN:
        df["aprobacion"] = False
        return df

    patron = re.compile(UBICACIONES_NO_CUENTAN, re.IGNORECASE)

    def _casa(texto: object) -> bool:
        return bool(patron.search(str(texto or "")))

    marca = df["ubicacion"].map(_casa) if "ubicacion" in df.columns else False
    if "isla" in df.columns:
        marca = marca | df["isla"].map(_casa)

    # Si hay lista de usuarios, la regla solo les afecta a ellos.
    if NO_CUENTAN_SOLO_USUARIOS:
        marca = marca & df["chofer"].isin(NO_CUENTAN_SOLO_USUARIOS)

    df["aprobacion"] = marca
    return df


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

    df = df.sort_values("fecha").reset_index(drop=True)

    # Ojo: aqui NO se hace drop_duplicates. Las filas identicas tambien son
    # repeticiones del sistema, y si se quitaran por separado el diagnostico
    # las contaria de menos: diria 3 duplicados donde en realidad hubo 5, y el
    # inflado de cada trabajador se veria mas pequeno de lo que es.
    # marcar_duplicados_del_sistema() las incluye, porque su diferencia de
    # tiempo es 0 y entra en cualquier ventana.
    df = marcar_duplicados_del_sistema(df)
    df = marcar_no_movimientos(df)

    repeticiones = int(df["repeticion"].sum())
    aprobaciones = int(df["aprobacion"].sum())

    logger.info(
        "Hoja procesada: %d filas crudas -> %d filas validas "
        "(%d repeticiones del sistema, %d aprobaciones, %d movimientos reales)",
        filas_crudas,
        len(df),
        repeticiones,
        aprobaciones,
        len(df) - repeticiones - aprobaciones,
    )
    return df


def solo_movimientos_reales(df: pd.DataFrame) -> pd.DataFrame:
    """Solo lo que cuenta como produccion.

    Deja fuera las repeticiones del sistema y los cambios de estado que no
    son un movimiento (las islas de aprobados).
    """
    if df.empty:
        return df

    fuera = pd.Series(False, index=df.index)
    for columna in ("repeticion", "aprobacion"):
        if columna in df.columns:
            fuera = fuera | df[columna].fillna(False)

    return df[~fuera]


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