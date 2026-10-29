import pandas as pd
import requests
import io
from datetime import datetime
from app.config import EXPORT_URL, CHOFERES_FILTRO
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_cache = {
    "dataframe": None,
    "ultima_actualizacion": None
}

def obtener_movimientos(force_refresh=False):
    ahora = datetime.now()
    
    if not force_refresh and _cache["dataframe"] is not None:
        if _cache["ultima_actualizacion"] is not None:
            tiempo_transcurrido = (ahora - _cache["ultima_actualizacion"]).total_seconds()
            if tiempo_transcurrido < 60:
                logger.info(f"📦 Usando caché ({tiempo_transcurrido:.0f}s atrás)")
                return _cache["dataframe"].copy()
    
    logger.info("🔄 Leyendo CSV desde URL de exportación...")
    
    try:
        response = requests.get(EXPORT_URL)
        if response.status_code != 200:
            raise Exception(f"Error al descargar: {response.status_code}")
        
        df = pd.read_csv(io.StringIO(response.text))
        logger.info(f"✅ Archivo descargado: {len(df)} filas")
        
        # --- DETECCIÓN DE COLUMNAS (CON VIN) ---
        col_fecha = None
        col_chofer = None
        col_vin = None
        
        for col in df.columns:
            lower = col.strip().lower()
            if "fecha" in lower or "date" in lower:
                col_fecha = col
            elif "chofer" in lower or "conductor" in lower or "usuario" in lower:
                col_chofer = col
            elif "vin" in lower or "chasis" in lower or "chassi" in lower:
                col_vin = col
        
        # Si no encuentra VIN, usar la primera columna (como fallback)
        if col_fecha is None: col_fecha = df.columns[0]
        if col_chofer is None: col_chofer = df.columns[1]
        if col_vin is None: col_vin = df.columns[2]
        
        # Renombrar a nombres estandarizados
        df.rename(columns={
            col_fecha: "fecha",
            col_chofer: "chofer",
            col_vin: "chasis"  # ✅ Usamos VIN como chasis
        }, inplace=True)
        
        # --- NORMALIZACIÓN ---
        df["chofer"] = df["chofer"].astype(str).str.strip().str.upper()
        df["chasis"] = df["chasis"].astype(str).str.strip().str.upper()
        
        # --- FILTRO DE CHOFERES ---
        df = df[df["chofer"].isin(CHOFERES_FILTRO)]
        df = df[df["chofer"] != ""]
        df = df[df["chasis"] != ""]
        df = df[df["chofer"] != "NAN"]
        df = df[df["chasis"] != "NAN"]
        
        # --- FILTRAR FECHAS SIN HORA ---
        df["fecha_str"] = df["fecha"].astype(str)
        df["tiene_hora"] = df["fecha_str"].str.contains(r'[:T]', regex=True, na=False)
        df = df[df["tiene_hora"] == True]
        df["fecha"] = pd.to_datetime(df["fecha"], errors="coerce")
        df = df[df["fecha"].notna()]
        
        # --- ELIMINAR DUPLICADOS EXACTOS ---
        df = df.drop_duplicates(subset=["fecha", "chasis", "chofer"])
        
        # --- LIMPIAR COLUMNAS AUXILIARES ---
        df = df.drop(columns=["fecha_str", "tiene_hora"])
        
        logger.info(f"✅ Datos procesados: {len(df)} movimientos (VIN como chasis)")
        
        _cache["dataframe"] = df.copy()
        _cache["ultima_actualizacion"] = ahora
        return df
        
    except Exception as e:
        logger.error(f"❌ Error: {e}")
        if _cache["dataframe"] is not None:
            return _cache["dataframe"].copy()
        raise