# Dashboard de Movimientos de Unidades

Muestra cuántos movimientos hace cada chofer en el día, en el almacén
VARI BIRRAK.

```
API de VARI  →  Apps Script  →  Google Sheets  →  FastAPI  →  React
                (cada 30 min)    (base de datos)   (backend)   (frontend)
```

## Estructura

```
DashboardChoferes/
├── vercel.json              Configuración de los dos servicios en Vercel
├── extraccion/              Script de Apps Script (va en la hoja de Google)
│   ├── Codigo.gs
│   └── INSTALACION.md
├── backend/                 API en FastAPI
│   ├── app/
│   │   ├── config.py        Todo configurable por variables de entorno
│   │   ├── scraper.py       Lee y normaliza la hoja
│   │   └── main.py          Endpoints
│   └── requirements.txt
└── frontend/                Dashboard en React + Vite
    └── src/
        ├── App.jsx          Estado, carga de datos, maquetación
        ├── api.js           Cliente HTTP y mensajes de error
        ├── tema.js          Tema claro/oscuro y paleta de los gráficos
        ├── components/
        └── pages/
```

## Poner en marcha

### Backend

```bash
cd backend
python -m venv .venv
# Windows:  .venv\Scripts\activate
# Linux/Mac: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

Comprueba que lee la hoja: <http://127.0.0.1:8000/api/health>
Documentación automática: <http://127.0.0.1:8000/docs>

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Abre <http://localhost:5173>. No hace falta configurar ninguna URL: el
frontend pide rutas relativas (`/api/...`) y el proxy de `vite.config.js` las
reenvía al backend del puerto 8000.

### Script de extracción

Está en `extraccion/`. Ver `extraccion/INSTALACION.md`.

## Despliegue en Vercel

Los dos servicios viven en un solo proyecto, con `vercel.json` en la raíz:

```json
{
  "services": {
    "backend":  { "root": "backend",  "framework": "fastapi", "entrypoint": "app.main:app" },
    "frontend": { "root": "frontend", "framework": "vite" }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": { "service": "backend" } },
    { "source": "/(.*)",     "destination": { "service": "frontend" } }
  ]
}
```

El servicio recibe la ruta completa, así que `/api/resumen` llega a FastAPI
tal cual. No hace falta definir `VITE_API_URL` en Vercel: con los dos
servicios en el mismo dominio, las rutas relativas se resuelven solas.

Después de desplegar, abre `https://tu-app.vercel.app/api/health`. Si responde
`{"ok": true, ...}` el backend está vivo y leyendo la hoja.

## Endpoints

| Ruta | Para qué |
|---|---|
| `GET /api/health` | Estado del backend y del caché |
| `GET /api/resumen?fecha=YYYY-MM-DD` | KPIs, detalle por chofer y movimientos por hora |
| `GET /api/tendencia?dias=14&hasta=YYYY-MM-DD` | Movimientos por día |
| `GET /api/unidades/buscar?texto=...` | Último movimiento de cada unidad que coincida |
| `GET /api/unidades/{chasis}/historial` | Historial completo de una unidad |
| `GET /api/choferes` | Choferes con actividad y su último movimiento |
| `GET /api/exportar?fecha=YYYY-MM-DD` | CSV del día, para abrir en Excel |

`fecha` por defecto es hoy en hora de Lima, no la del servidor.

## Configuración

Todo se ajusta con variables de entorno, sin tocar el código. Copia
`backend/.env.example` a `backend/.env` en local, o define las variables en
Vercel. Las más útiles:

| Variable | Por defecto | Para qué |
|---|---|---|
| `CHOFERES_FILTRO` | los 5 actuales | Qué choferes mostrar. Vacío = todos |
| `SHEET_ID` | la hoja actual | Cambiar de hoja sin tocar código |
| `CACHE_TTL` | `300` | Segundos que la hoja se guarda en memoria |
| `CDN_CACHE_SEGUNDOS` | `120` | Segundos que el CDN sirve la respuesta sin ejecutar la función |
| `HORA_INICIO` / `HORA_FIN` | `6` / `22` | Rango del gráfico por hora |
| `USAR_CONSULTA_FILTRADA` | `false` | Pedirle a Google solo los días necesarios en vez de la hoja entera |

### Cuando la hoja crezca

Por debajo de unas 50.000 filas, bajar la hoja completa es lo más simple y una
sola descarga sirve para todos los endpoints. Pasado ese tamaño, pon
`USAR_CONSULTA_FILTRADA=true`: el backend usa la API de consultas de Google
para traer solo los días que necesita, en vez de las 40.000 filas enteras.

## Notas sobre el rendimiento en Vercel

El caché en memoria (`CACHE_TTL`) casi nunca sobrevive entre peticiones en
serverless, porque cada una puede caer en una instancia distinta. Lo que de
verdad evita descargar la hoja una y otra vez es la cabecera `Cache-Control`
que el backend pone en cada respuesta: el CDN de Vercel la sirve durante
`CDN_CACHE_SEGUNDOS` sin llegar a ejecutar la función.
