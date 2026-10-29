import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime
from app.scraper import obtener_movimientos

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def inicio():
    return {"mensaje": "Dashboard de Movimientos funcionando"}

# 📊 DASHBOARD - KPIs (solo día seleccionado)
@app.get("/api/movimientos/dashboard")
def dashboard(fecha: str | None = None):
    df = obtener_movimientos()
    
    if fecha:
        fecha_busqueda = datetime.strptime(fecha, "%Y-%m-%d").date()
        df = df[df["fecha"].dt.date == fecha_busqueda]
    
    # Normalizar chasis para contar únicos
    df["chasis_limpio"] = df["chasis"].astype(str).str.strip().str.upper()
    
    total_movimientos = len(df)
    choferes_activos = df["chofer"].nunique()
    unidades_unicas = df["chasis_limpio"].nunique()
    
    return {
        "total": int(total_movimientos),
        "choferes_activos": int(choferes_activos),
        "unidades_movidas": int(unidades_unicas)
    }

# 🚚 MOVIMIENTOS POR CHOFER (gráfico)
@app.get("/api/movimientos/choferes")
def movimientos_por_chofer(fecha: str | None = None):
    df = obtener_movimientos()
    
    if fecha:
        fecha_busqueda = datetime.strptime(fecha, "%Y-%m-%d").date()
        df = df[df["fecha"].dt.date == fecha_busqueda]
    
    resultado = []
    for chofer in df["chofer"].unique():
        datos = df[df["chofer"] == chofer]
        resultado.append({
            "nombre": str(chofer),
            "movimientos": int(len(datos))
        })
    
    resultado.sort(key=lambda x: x["movimientos"], reverse=True)
    return resultado

# 🔍 BÚSQUEDA DE UNIDADES
@app.get("/api/unidades/buscar")
def buscar_unidades(texto: str):
    df = obtener_movimientos()
    texto = texto.strip().upper()
    
    df = df[df["chasis"].astype(str).str.contains(texto, na=False)]
    df = df.sort_values("fecha", ascending=False)
    ultimas = df.groupby("chasis").first().reset_index()
    
    resultados = []
    for _, row in ultimas.iterrows():
        resultados.append({
            "chasis": str(row.get("chasis", "")),
            "chofer": str(row.get("chofer", "")),
            "origen": str(row.get("origen", "-")),
            "destino": str(row.get("destino", "-")),
            "fecha": row["fecha"].strftime("%d/%m/%Y %H:%M") if pd.notna(row.get("fecha")) else "-"
        })
    
    return {"resultados": resultados}

# 🔍 DIAGNÓSTICO: CHASIS ÚNICOS POR DÍA
@app.get("/api/diagnostico/chasis")
def diagnosticar_chasis(fecha: str):
    df = obtener_movimientos()
    fecha_busqueda = datetime.strptime(fecha, "%Y-%m-%d").date()
    df = df[df["fecha"].dt.date == fecha_busqueda]
    
    chasis_unicos = df["chasis"].unique().tolist()
    
    return {
        "fecha": fecha,
        "total_movimientos": int(len(df)),
        "chasis_unicos": chasis_unicos,
        "cantidad_chasis": int(len(chasis_unicos))
    }