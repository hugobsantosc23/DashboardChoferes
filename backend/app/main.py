"""API del dashboard de movimientos de unidades."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

import pandas as pd
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware

from app.config import (
    ALMACEN,
    CDN_CACHE_SEGUNDOS,
    CDN_STALE_SEGUNDOS,
    CHOFERES_FILTRO,
    CORS_ORIGINS,
    HORA_FIN,
    HORA_INICIO,
    USAR_CONSULTA_FILTRADA,
    ZONA_HORARIA,
)
from app.scraper import estado_cache, obtener_movimientos

app = FastAPI(
    title="Dashboard de Movimientos",
    description=f"Movimientos de vehiculos del almacen {ALMACEN}, por chofer.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

TZ = ZoneInfo(ZONA_HORARIA)
DIAS_TENDENCIA = 14


# --------------------------------------------------------------------------
# Utilidades
# --------------------------------------------------------------------------

def _hoy() -> date:
    """Fecha de hoy en la zona del almacen, no en la del servidor."""
    return datetime.now(TZ).date()


def _cachear(response: Response) -> None:
    """Permite que el CDN sirva la respuesta sin ejecutar la funcion.

    En serverless el cache en memoria del proceso casi nunca sobrevive entre
    peticiones, asi que esta cabecera es lo que de verdad evita volver a
    descargar la hoja completa en cada visita.
    """
    response.headers["Cache-Control"] = (
        f"public, s-maxage={CDN_CACHE_SEGUNDOS}, "
        f"stale-while-revalidate={CDN_STALE_SEGUNDOS}"
    )


def _cargar(desde: date | None = None) -> pd.DataFrame:
    try:
        return obtener_movimientos(desde=desde if USAR_CONSULTA_FILTRADA else None)
    except Exception as error:  # noqa: BLE001
        raise HTTPException(
            status_code=503,
            detail=f"No se pudo leer la hoja de Google: {error}",
        ) from error


def _del_dia(df: pd.DataFrame, dia: date) -> pd.DataFrame:
    return df[df["fecha"].dt.date == dia]


def _texto(valor: object, defecto: str = "-") -> str:
    if valor is None or (isinstance(valor, float) and pd.isna(valor)):
        return defecto
    texto = str(valor).strip()
    return texto if texto and texto.upper() not in {"NAN", "NONE"} else defecto


# --------------------------------------------------------------------------
# Salud
# --------------------------------------------------------------------------

@app.get("/")
def inicio():
    return {
        "servicio": "Dashboard de Movimientos",
        "version": "2.0.0",
        "almacen": ALMACEN,
        "documentacion": "/docs",
    }


@app.get("/api/health")
def health():
    """Comprueba que el backend corre y que puede leer la hoja."""
    try:
        df = _cargar()
        return {
            "ok": True,
            "movimientos_totales": len(df),
            "rango": {
                "desde": df["fecha"].min().isoformat() if not df.empty else None,
                "hasta": df["fecha"].max().isoformat() if not df.empty else None,
            },
            "choferes_configurados": CHOFERES_FILTRO or "todos",
            "cache": estado_cache(),
            "hora_servidor": datetime.now(TZ).isoformat(timespec="seconds"),
        }
    except HTTPException as error:
        return {"ok": False, "detalle": error.detail, "cache": estado_cache()}


# --------------------------------------------------------------------------
# Resumen del dia: KPIs + por chofer + por hora, en una sola peticion
# --------------------------------------------------------------------------

@app.get("/api/resumen")
def resumen(
    response: Response,
    fecha: date | None = Query(None, description="Dia a consultar (YYYY-MM-DD)"),
):
    _cachear(response)

    dia = fecha or _hoy()
    completo = _cargar(desde=dia - timedelta(days=DIAS_TENDENCIA))
    df = _del_dia(completo, dia)

    vacio = {
        "fecha": dia.isoformat(),
        "kpis": {
            "total": 0,
            "choferes_activos": 0,
            "unidades_movidas": 0,
            "promedio_por_chofer": 0,
            "hora_pico": None,
            "promedio_7_dias": 0,
            "variacion_pct": None,
        },
        "por_chofer": [],
        "por_hora": [],
        "actualizado": datetime.now(TZ).isoformat(timespec="seconds"),
    }

    if df.empty:
        return vacio

    # --- Por chofer ---
    agrupado = (
        df.groupby("chofer")
        .agg(
            movimientos=("chasis", "size"),
            unidades=("chasis", "nunique"),
            primero=("fecha", "min"),
            ultimo=("fecha", "max"),
        )
        .reset_index()
        .sort_values("movimientos", ascending=False)
    )

    por_chofer = []
    for fila in agrupado.itertuples():
        span_horas = (fila.ultimo - fila.primero).total_seconds() / 3600
        por_chofer.append(
            {
                "nombre": fila.chofer,
                "movimientos": int(fila.movimientos),
                "unidades": int(fila.unidades),
                "primero": fila.primero.strftime("%H:%M"),
                "ultimo": fila.ultimo.strftime("%H:%M"),
                # Ritmo real de trabajo: movimientos por hora entre el primero
                # y el ultimo registro del dia.
                "por_hora": round(fila.movimientos / span_horas, 1)
                if span_horas >= 0.5
                else None,
            }
        )

    # --- Por hora ---
    conteo_horas = df["fecha"].dt.hour.value_counts()
    por_hora = [
        {"hora": f"{h:02d}:00", "movimientos": int(conteo_horas.get(h, 0))}
        for h in range(HORA_INICIO, HORA_FIN + 1)
    ]
    hora_pico = (
        f"{int(conteo_horas.idxmax()):02d}:00" if not conteo_horas.empty else None
    )

    # --- Comparativa contra los dias anteriores con actividad ---
    previos = completo[completo["fecha"].dt.date < dia]
    promedio_previo = 0.0
    if not previos.empty:
        por_dia = previos.groupby(previos["fecha"].dt.date).size()
        ultimos = por_dia.sort_index().tail(7)
        if len(ultimos):
            promedio_previo = float(ultimos.mean())

    total = len(df)
    activos = int(df["chofer"].nunique())

    return {
        "fecha": dia.isoformat(),
        "kpis": {
            "total": total,
            "choferes_activos": activos,
            "unidades_movidas": int(df["chasis"].nunique()),
            "promedio_por_chofer": round(total / activos, 1) if activos else 0,
            "hora_pico": hora_pico,
            "promedio_7_dias": round(promedio_previo, 1),
            "variacion_pct": round((total - promedio_previo) / promedio_previo * 100)
            if promedio_previo
            else None,
        },
        "por_chofer": por_chofer,
        "por_hora": por_hora,
        "actualizado": datetime.now(TZ).isoformat(timespec="seconds"),
    }


# --------------------------------------------------------------------------
# Tendencia de los ultimos dias
# --------------------------------------------------------------------------

@app.get("/api/tendencia")
def tendencia(
    response: Response,
    dias: int = Query(DIAS_TENDENCIA, ge=2, le=120),
    hasta: date | None = Query(None, description="Ultimo dia del rango"),
):
    _cachear(response)

    fin = hasta or _hoy()
    inicio = fin - timedelta(days=dias - 1)
    df = _cargar(desde=inicio)
    df = df[(df["fecha"].dt.date >= inicio) & (df["fecha"].dt.date <= fin)]

    if df.empty:
        return []

    agrupado = (
        df.groupby(df["fecha"].dt.date)
        .agg(movimientos=("chasis", "size"), choferes=("chofer", "nunique"))
        .reindex(pd.date_range(inicio, fin, freq="D").date, fill_value=0)
    )

    return [
        {
            "dia": dia.isoformat(),
            "etiqueta": dia.strftime("%d/%m"),
            "movimientos": int(fila.movimientos),
            "choferes": int(fila.choferes),
        }
        for dia, fila in zip(agrupado.index, agrupado.itertuples(), strict=False)
    ]


# --------------------------------------------------------------------------
# Busqueda e historial de unidades
# --------------------------------------------------------------------------

@app.get("/api/unidades/buscar")
def buscar_unidades(
    response: Response,
    texto: str = Query(..., min_length=3, description="Chasis o parte del chasis"),
    limite: int = Query(50, ge=1, le=200),
):
    _cachear(response)

    aguja = texto.strip().upper()
    df = _cargar()

    # regex=False: sin esto un parentesis o un corchete en la busqueda rompe
    # la expresion regular y devuelve un error 500.
    coincidencias = df[df["chasis"].str.contains(aguja, na=False, regex=False)]

    if coincidencias.empty:
        return {"resultados": [], "total": 0, "truncado": False}

    ultimas = (
        coincidencias.sort_values("fecha", ascending=False)
        .groupby("chasis", as_index=False)
        .first()
        .sort_values("fecha", ascending=False)
    )
    total = len(ultimas)

    resultados = [
        {
            "chasis": fila["chasis"],
            "chofer": fila["chofer"],
            # Estas son las columnas que la hoja trae de verdad. Antes se pedian
            # "origen" y "destino", que no existen, y siempre salia "-".
            "ubicacion": _texto(fila.get("ubicacion")),
            "isla": _texto(fila.get("isla")),
            "marca": _texto(fila.get("marca")),
            "cliente": _texto(fila.get("cliente")),
            "estado": _texto(fila.get("estado")),
            "fecha": fila["fecha"].strftime("%d/%m/%Y %H:%M"),
        }
        for _, fila in ultimas.head(limite).iterrows()
    ]

    return {
        "resultados": resultados,
        "total": total,
        "truncado": total > limite,
    }


@app.get("/api/unidades/{chasis}/historial")
def historial_unidad(response: Response, chasis: str):
    _cachear(response)

    vin = chasis.strip().upper()
    df = _cargar()
    movimientos = df[df["chasis"] == vin].sort_values("fecha", ascending=False)

    if movimientos.empty:
        raise HTTPException(404, f"El chasis {vin} no tiene movimientos registrados")

    return {
        "chasis": vin,
        "total_movimientos": len(movimientos),
        "marca": _texto(movimientos.iloc[0].get("marca")),
        "cliente": _texto(movimientos.iloc[0].get("cliente")),
        "movimientos": [
            {
                "fecha": fila["fecha"].strftime("%d/%m/%Y %H:%M"),
                "chofer": fila["chofer"],
                "ubicacion": _texto(fila.get("ubicacion")),
                "isla": _texto(fila.get("isla")),
                "estado": _texto(fila.get("estado")),
            }
            for _, fila in movimientos.iterrows()
        ],
    }


# --------------------------------------------------------------------------
# Choferes y exportacion
# --------------------------------------------------------------------------

@app.get("/api/choferes")
def listar_choferes(response: Response):
    """Choferes que aparecen en la hoja, con su ultimo dia de actividad."""
    _cachear(response)

    df = _cargar()
    if df.empty:
        return []

    agrupado = (
        df.groupby("chofer")
        .agg(movimientos=("chasis", "size"), ultimo=("fecha", "max"))
        .reset_index()
        .sort_values("movimientos", ascending=False)
    )

    return [
        {
            "nombre": fila.chofer,
            "movimientos_historicos": int(fila.movimientos),
            "ultimo_movimiento": fila.ultimo.strftime("%d/%m/%Y %H:%M"),
        }
        for fila in agrupado.itertuples()
    ]


@app.get("/api/exportar")
def exportar_dia(fecha: date | None = Query(None)):
    """Descarga los movimientos de un dia en CSV, para abrir en Excel."""
    dia = fecha or _hoy()
    df = _del_dia(_cargar(desde=dia), dia)

    columnas = [
        c
        for c in ("fecha", "chofer", "chasis", "marca", "tipo", "cliente",
                  "ubicacion", "isla", "estado")
        if c in df.columns
    ]
    salida = df[columnas].copy()
    if not salida.empty:
        salida["fecha"] = salida["fecha"].dt.strftime("%d/%m/%Y %H:%M")

    return Response(
        content=salida.to_csv(index=False, encoding="utf-8-sig"),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="movimientos_{dia.isoformat()}.csv"'
        },
    )
