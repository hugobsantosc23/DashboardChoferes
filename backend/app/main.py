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
from app.config import (
    CUENTAS_COMPARTIDAS,
    ETAPA_FINAL,
    ETAPAS_DE_UN_TRAMO,
    NOMBRES_CHOFERES,
    NO_CUENTAN_SOLO_USUARIOS,
    ORDEN_ETAPAS,
    TITULOS_ETAPA,
    UBICACIONES_NO_CUENTAN,
    VENTANA_DUPLICADOS_SEG,
)
from app.revisiones import estado_revisiones, obtener_revisiones, revisiones_de
from app.scraper import (
    clasificar_etapa,
    estado_cache,
    obtener_movimientos,
    solo_movimientos_reales,
)

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


def _cargar(desde: date | None = None, con_repeticiones: bool = False) -> pd.DataFrame:
    """Carga la hoja.

    Por defecto devuelve solo los movimientos reales: el sistema VARI duplica
    registros al subir una unidad, y contarlos infla la produccion de cada
    chofer. `con_repeticiones=True` devuelve todo, para el diagnostico.
    """
    try:
        df = obtener_movimientos(desde=desde if USAR_CONSULTA_FILTRADA else None)
    except Exception as error:  # noqa: BLE001
        raise HTTPException(
            status_code=503,
            detail=f"No se pudo leer la hoja de Google: {error}",
        ) from error

    return df if con_repeticiones else solo_movimientos_reales(df)


def _del_dia(df: pd.DataFrame, dia: date) -> pd.DataFrame:
    return df[df["fecha"].dt.date == dia]


def _nombre(usuario: object) -> str:
    """Nombre para mostrar. Si no hay alias, se usa el usuario del sistema."""
    clave = str(usuario or "").strip().upper()
    return NOMBRES_CHOFERES.get(clave, clave)


def _personas(usuario: object) -> int:
    """Cuantas personas comparten esa cuenta. 1 si no es compartida."""
    return CUENTAS_COMPARTIDAS.get(str(usuario or "").strip().upper(), 1)

def _duracion(segundos: float) -> str:
    """Segundos a algo legible: '45 min', '3 h 20 min', '2 dias 4 h'."""
    segundos = max(0, int(segundos))
    dias, resto = divmod(segundos, 86400)
    horas, resto = divmod(resto, 3600)
    minutos = resto // 60

    if dias:
        return f"{dias} dia{'s' if dias > 1 else ''}" + (f" {horas} h" if horas else "")
    if horas:
        return f"{horas} h" + (f" {minutos} min" if minutos else "")
    if minutos:
        return f"{minutos} min"
    return f"{segundos} s"

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
        crudo = _cargar(con_repeticiones=True)
        df = solo_movimientos_reales(crudo)
        return {
            "ok": True,
            "movimientos_totales": len(df),
            "duplicados_del_sistema": int(crudo["repeticion"].sum()) if "repeticion" in crudo else 0,
            "aprobaciones_no_contadas": int(crudo["aprobacion"].sum()) if "aprobacion" in crudo else 0,
            "ventana_duplicados_seg": VENTANA_DUPLICADOS_SEG,
            "patron_no_cuentan": UBICACIONES_NO_CUENTAN,
            "no_cuentan_solo_usuarios": NO_CUENTAN_SOLO_USUARIOS or "todos",
            "rango": {
                "desde": df["fecha"].min().isoformat() if not df.empty else None,
                "hasta": df["fecha"].max().isoformat() if not df.empty else None,
            },
            "choferes_configurados": CHOFERES_FILTRO or "todos",
            "revisiones": estado_revisiones(),
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
    crudo = _cargar(desde=dia - timedelta(days=DIAS_TENDENCIA), con_repeticiones=True)
    completo = solo_movimientos_reales(crudo)

    df = _del_dia(completo, dia)

    # Cuantas repeticiones del sistema se descartaron ese dia: es la diferencia
    # entre lo que dice el sistema en bruto y la produccion real.
    del_dia_crudo = _del_dia(crudo, dia)
    descartados = int(del_dia_crudo["repeticion"].sum()) if "repeticion" in del_dia_crudo else 0
    aprobaciones = int(del_dia_crudo["aprobacion"].sum()) if "aprobacion" in del_dia_crudo else 0

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
            "duplicados_descartados": descartados,
            "aprobaciones_descartadas": aprobaciones,
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
        personas = _personas(fila.chofer)
        por_chofer.append(
            {
                "nombre": _nombre(fila.chofer),
                "usuario": fila.chofer,
                "personas": personas,
                # En una cuenta compartida el total no es comparable con el de
                # una persona sola, asi que se da tambien el reparto.
                "por_persona": round(fila.movimientos / personas, 1)
                if personas > 1
                else None,
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

    # Personas, no cuentas: PROTELANDTEMP la comparten 4 choferes, asi que
    # contarla como una sola persona subestima el equipo que trabajo ese dia
    # y dispara el promedio por chofer.
    activos = sum(_personas(c) for c in df["chofer"].unique())

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
            "duplicados_descartados": descartados,
            "aprobaciones_descartadas": aprobaciones,
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

    # Sin el filtro de choferes: buscar una unidad no es medir produccion, y
    # con el filtro puesto una unidad que solo movieron usuarios de fuera de
    # la lista era invisible aunque estuviera en la hoja.
    try:
        df = solo_movimientos_reales(obtener_movimientos(filtrar_choferes=False))
    except Exception as error:  # noqa: BLE001
        raise HTTPException(
            status_code=503, detail=f"No se pudo leer la hoja de Google: {error}"
        ) from error

    # regex=False: sin esto un parentesis o un corchete en la busqueda rompe
    # la expresion regular y devuelve un error 500.
    coincidencias = df[df["chasis"].str.contains(aguja, na=False, regex=False)]

    ultimas = (
        coincidencias.sort_values("fecha", ascending=False)
        .groupby("chasis", as_index=False)
        .first()
        if not coincidencias.empty
        else coincidencias
    )

    resultados = [
        {
            "chasis": fila["chasis"],
            "chofer": _nombre(fila["chofer"]),
            # Estas son las columnas que la hoja trae de verdad. Antes se pedian
            # "origen" y "destino", que no existen, y siempre salia "-".
            "ubicacion": _texto(fila.get("ubicacion")),
            "isla": _texto(fila.get("isla")),
            "marca": _texto(fila.get("marca")),
            "cliente": _texto(fila.get("cliente")),
            "estado": _texto(fila.get("estado")),
            "fecha": fila["fecha"],
            "origen": "movimientos",
        }
        for _, fila in ultimas.iterrows()
    ]

    # Una unidad entregada por SUM y todavia sin mover solo existe en la hoja
    # de revisiones. Sin esto el buscador decia "no se encontro" sobre una
    # unidad que el usuario esta viendo en su hoja de calculo.
    vistas = {r["chasis"] for r in resultados}
    revs = obtener_revisiones()
    if not revs.empty:
        sueltas = revs[
            revs["chasis"].str.contains(aguja, na=False, regex=False)
            & ~revs["chasis"].isin(vistas)
        ]
        for _, fila in sueltas.sort_values("fecha").groupby("chasis").last().reset_index().iterrows():
            resultados.append(
                {
                    "chasis": fila["chasis"],
                    "chofer": _texto(fila.get("revisor")),
                    "ubicacion": _texto(fila.get("ubicacion")),
                    "isla": "-",
                    "marca": _texto(fila.get("modelo")),
                    "cliente": _texto(fila.get("concesionario")),
                    "estado": "Pendiente de revisar"
                    if fila.get("pendiente")
                    else _texto(fila.get("resultado")),
                    "fecha": fila["fecha"],
                    "origen": "revisiones",
                }
            )

    resultados.sort(key=lambda r: r["fecha"], reverse=True)
    total = len(resultados)

    for r in resultados:
        r["fecha"] = r["fecha"].strftime("%d/%m/%Y %H:%M")

    return {
        "resultados": resultados[:limite],
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
                "chofer": _nombre(fila["chofer"]),
                "ubicacion": _texto(fila.get("ubicacion")),
                "isla": _texto(fila.get("isla")),
                "estado": _texto(fila.get("estado")),
            }
            for _, fila in movimientos.iterrows()
        ],
    }

@app.get("/api/unidades/{chasis}/flujo")
def flujo_unidad(response: Response, chasis: str):
    """El recorrido de una unidad por el almacen, agrupado por etapas.

    A diferencia de /historial, esto lee la hoja SIN el filtro de choferes: el
    recorrido lo tocan tambien usuarios que no miden produccion (los que meten
    la unidad a la cola de lavado SUM, por ejemplo) y sin ellos el flujo sale
    con huecos que parecen tiempo muerto.
    """
    _cachear(response)

    vin = chasis.strip().upper()

    try:
        todo = obtener_movimientos(filtrar_choferes=False)
    except Exception as error:  # noqa: BLE001
        raise HTTPException(
            status_code=503, detail=f"No se pudo leer la hoja de Google: {error}"
        ) from error

    # Las repeticiones del sistema se quitan: son la misma marca subida dos
    # veces, no una parada mas del recorrido. Las aprobaciones SI se dejan,
    # porque aqui no se esta midiendo produccion sino por donde paso la unidad.
    marcas = todo[(todo["chasis"] == vin) & (~todo.get("repeticion", False))]
    marcas = marcas.sort_values("fecha", kind="stable")


    # --- Un solo hilo de eventos con las dos hojas ---
    # La revision vive en otra hoja (el formulario de SUM/VARI) y se intercala
    # por hora: en los datos reales la marca de "ISLA n - APROBADOS" cae al
    # minuto siguiente de la revision, asi que sin mezclarlas el recorrido
    # cuenta el final sin el principio.
    eventos = []
    for _, fila in marcas.iterrows():
        etapa = clasificar_etapa(fila.get("isla"), fila.get("ubicacion"))
        lugar = _texto(fila.get("ubicacion"), "")
        isla = _texto(fila.get("isla"), "")
        # En una isla la ubicacion es la fila y el numero, que sin la isla no
        # dice nada; en una zona con nombre las dos columnas repiten lo mismo.
        completo = lugar if lugar == isla or not isla else f"{isla} · {lugar}"
        eventos.append(
            {
                "fecha": fila["fecha"],
                "etapa": etapa,
                "sitio": "" if etapa in ETAPAS_DE_UN_TRAMO else f"{isla}|{lugar}",
                "lugar": completo,
                "quien": _nombre(fila.get("chofer")),
                "resultado": None,
                "nota": None,
            }
        )

    # Si la hoja de revisiones no se pudo leer, no se puede afirmar que la
    # unidad no paso por revision: solo que no se sabe.
    estado_rev = estado_revisiones()
    hay_revisiones = bool(
        estado_rev.get("activo")
        and not estado_rev.get("ultimo_error")
        and estado_rev.get("revisiones", 0)
    )

    revisiones = revisiones_de(vin)
    for _, rev in revisiones.iterrows():
        # La entrega de SUM NO se pone como evento aparte: su fecha es la de
        # envio del formulario y a veces cae DESPUES de la revision que
        # describe (se han visto 7 horas), asi que como paso propio
        # desordenaria la linea de tiempo. Va como dato de la revision.
        etiqueta = " · ".join(
            x for x in (str(rev.get("nro_entrega") or "").strip(),
                        str(rev.get("nro_revision") or "").strip()) if x
        )
        pendiente = bool(rev.get("pendiente"))
        eventos.append(
            {
                "fecha": rev["fecha"],
                "etapa": "REVISION",
                # Cada revision es una parada propia: una unidad rechazada se
                # vuelve a revisar y las dos pasadas tienen que verse.
                "sitio": f"REV|{rev.get('nro_revision')}|{rev['fecha']}",
                "lugar": str(rev.get("ubicacion") or "").strip(),
                "quien": str(rev.get("revisor") or "").strip(),
                "resultado": "Pendiente"
                if pendiente
                else (str(rev.get("resultado") or "").strip() or None),
                "nota": " · ".join(
                    x
                    for x in (
                        etiqueta,
                        "entregada por SUM, sin revisar todavia" if pendiente else "",
                        str(rev.get("observaciones") or "").strip(),
                    )
                    if x
                )
                or None,
            }
        )

    if not eventos:
        raise HTTPException(404, f"El chasis {vin} no aparece en ninguna de las hojas")

    eventos.sort(key=lambda e: e["fecha"])

    if not eventos:
        raise HTTPException(404, f"El chasis {vin} no aparece en ninguna de las hojas")

    eventos.sort(key=lambda e: e["fecha"])

    eventos.sort(key=lambda e: e["fecha"])

    # --- Agrupar eventos consecutivos en paradas ---
    # Una parada nueva empieza cuando cambia el sitio exacto, isla Y fila: un
    # reacomodo de la fila 4-D a la 7-B de la misma isla es un movimiento real
    # y tiene que verse. Lo que si se funde son las marcas repetidas sobre el
    # mismo sitio, y los tramos de lavado, que pasan por tres ubicaciones con
    # nombre distinto pero son una sola etapa.
    pasos: list[dict] = []
    for ev in eventos:
        if pasos and pasos[-1]["etapa"] == ev["etapa"] and pasos[-1]["_sitio"] == ev["sitio"]:
            paso = pasos[-1]
        else:
            paso = {
                "etapa": ev["etapa"],
                "titulo": TITULOS_ETAPA.get(ev["etapa"], ev["etapa"]),
                "_sitio": ev["sitio"],
                "_desde": ev["fecha"],
                "_hasta": ev["fecha"],
                "marcas": 0,
                "_lugares": [],
                "_choferes": [],
                "resultado": ev["resultado"],
                "nota": ev["nota"],
            }
            pasos.append(paso)

        paso["_hasta"] = ev["fecha"]
        paso["marcas"] += 1

        if ev["lugar"] and ev["lugar"] not in paso["_lugares"]:
            paso["_lugares"].append(ev["lugar"])
        if ev["quien"] and ev["quien"] not in paso["_choferes"]:
            paso["_choferes"].append(ev["quien"])

    ahora = datetime.now(TZ).replace(tzinfo=None)

    salida = []
    for i, paso in enumerate(pasos):
        # Cuanto estuvo la unidad en esa parada: desde que llego hasta que la
        # movieron. En la ultima parada, hasta ahora mismo.
        fin = pasos[i + 1]["_desde"] if i + 1 < len(pasos) else ahora
        salida.append(
            {
                "orden": i + 1,
                "etapa": paso["etapa"],
                "titulo": paso["titulo"],
                "lugar": " → ".join(paso["_lugares"]),
                "ubicaciones": paso["_lugares"],
                "desde": paso["_desde"].strftime("%d/%m/%Y %H:%M"),
                "hasta": paso["_hasta"].strftime("%d/%m/%Y %H:%M"),
                "marcas": paso["marcas"],
                "choferes": paso["_choferes"],
                "permanencia": _duracion((fin - paso["_desde"]).total_seconds()),
                "en_curso": i + 1 == len(pasos),
                "resultado": paso["resultado"],
                "nota": paso["nota"],
            }
        )

        primera, ultima = pasos[0]["_desde"], pasos[-1]["_hasta"]
    vistas = {p["etapa"] for p in pasos}

    # Una unidad puede estar solo en la hoja de revisiones (entregada por SUM
    # y aun sin mover), asi que la ficha se arma de la hoja que tenga datos.
    ultimo = marcas.iloc[-1] if not marcas.empty else None
    ultima_rev = revisiones.iloc[-1] if not revisiones.empty else None

    def _ficha(campo_mov: str, campo_rev: str | None = None) -> str:
        if ultimo is not None and _texto(ultimo.get(campo_mov)) != "-":
            return _texto(ultimo.get(campo_mov))
        if ultima_rev is not None and campo_rev:
            return _texto(ultima_rev.get(campo_rev))
        return "-"

    return {
        "chasis": vin,
        "marca": _ficha("marca", "modelo"),
        "tipo": _ficha("tipo"),
        "cliente": _ficha("cliente", "concesionario"),
        "estado": _ficha("estado"),
        "marcas_totales": int(len(marcas)),
        "paradas": len(pasos),
        "revisiones": int(len(revisiones)),
        "rechazos": int(
            (revisiones["resultado"].str.upper() == "RECHAZADO").sum()
        )
        if not revisiones.empty
        else 0,
        "primera_marca": primera.strftime("%d/%m/%Y %H:%M"),
        "ultima_marca": ultima.strftime("%d/%m/%Y %H:%M"),
        "tiempo_en_almacen": _duracion((ahora - primera).total_seconds()),
        "ubicacion_actual": salida[-1]["lugar"],
        # Lo normal es que una unidad termine en despacho. Cuando no, conviene
        # que salte a la vista en vez de tener que leer toda la linea.
        "cerrado_en_despacho": pasos[-1]["etapa"] == ETAPA_FINAL,
        "revision_disponible": hay_revisiones,
        "etapas_sin_pasar": [
            TITULOS_ETAPA.get(e, e)
            for e in ORDEN_ETAPAS
            if e not in vistas and (e != "REVISION" or hay_revisiones)
        ],
        "pasos": salida,
    }

# --------------------------------------------------------------------------
# Duplicados del sistema
# --------------------------------------------------------------------------

@app.get("/api/diagnostico/duplicados")
def diagnostico_duplicados(
    response: Response,
    fecha: date | None = Query(None, description="Un dia concreto; vacio = todo"),
    ejemplos: int = Query(20, ge=0, le=200),
):
    """Muestra que se esta descartando como repeticion del sistema y cuanto pesa.

    Sirve para dos cosas: ver cuanto inflaban el conteo de cada trabajador, y
    comprobar que la ventana no se esta comiendo movimientos legitimos. Si en
    los ejemplos aparecen movimientos reales, baja VENTANA_DUPLICADOS_SEG.
    """
    _cachear(response)

    crudo = _cargar(desde=fecha, con_repeticiones=True)
    if fecha:
        crudo = _del_dia(crudo, fecha)

    if crudo.empty or "repeticion" not in crudo.columns:
        return {
            "ventana_segundos": VENTANA_DUPLICADOS_SEG,
            "filas_totales": int(len(crudo)),
            "repeticiones": 0,
            "movimientos_reales": int(len(crudo)),
            "por_chofer": [],
            "ejemplos": [],
        }

    repes = crudo[crudo["repeticion"]]
    total = int(len(crudo))
    n_repes = int(len(repes))

    # Cuantos movimientos de mas se le estaban contando a cada trabajador
    por_chofer = [
        {"nombre": _nombre(nombre), "movimientos_de_mas": int(cuenta)}
        for nombre, cuenta in repes["chofer"].value_counts().items()
    ]

    # Un ejemplo por RACHA, no por fila. Cuando el sistema sube la misma unidad
    # veinte veces, lo util es ver "VIN0012, 20 copias en 0 s", no diecinueve
    # lineas identicas que tapan los demas casos.
    muestras = []
    if ejemplos and n_repes and "racha" in crudo.columns:
        afectadas = crudo[crudo["racha"].isin(repes["racha"].unique())]

        for _, grupo in afectadas.groupby("racha", sort=False):
            grupo = grupo.sort_values("fecha", kind="stable")
            primera, ultima = grupo.iloc[0], grupo.iloc[-1]
            muestras.append(
                {
                    "chasis": primera["chasis"],
                    "chofer": primera["chofer"],
                    "isla": _texto(primera.get("isla")),
                    "ubicacion": _texto(primera.get("ubicacion")),
                    "copias": int(len(grupo)),
                    "descartadas": int(len(grupo) - 1),
                    "primera_marca": primera["fecha"].strftime("%d/%m/%Y %H:%M:%S.%f")[:-3],
                    "ultima_marca": ultima["fecha"].strftime("%d/%m/%Y %H:%M:%S.%f")[:-3],
                    "segundos_de_diferencia": round(
                        (ultima["fecha"] - primera["fecha"]).total_seconds(), 2
                    ),
                }
            )

        # Primero las rachas mas escandalosas: confirman el bug de un vistazo.
        muestras.sort(key=lambda m: m["copias"], reverse=True)
        muestras = muestras[:ejemplos]

    return {
        "ventana_segundos": VENTANA_DUPLICADOS_SEG,
        "filas_totales": total,
        "repeticiones": n_repes,
        "movimientos_reales": total - n_repes,
        "porcentaje_inflado": round(n_repes / total * 100, 1) if total else 0,
        "rachas_detectadas": int(repes["racha"].nunique()) if "racha" in repes else 0,
        "por_chofer": por_chofer,
        "ejemplos": muestras,
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
            "nombre": _nombre(fila.chofer),
            "usuario": fila.chofer,
            "personas": _personas(fila.chofer),
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