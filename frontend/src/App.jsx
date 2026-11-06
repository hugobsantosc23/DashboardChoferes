import { useCallback, useEffect, useMemo, useState } from "react";
import dayjs from "dayjs";

import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";
import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  CssBaseline,
  IconButton,
  Skeleton,
  ThemeProvider,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";

import DarkModeIcon from "@mui/icons-material/DarkModeOutlined";
import DownloadIcon from "@mui/icons-material/FileDownloadOutlined";
import LightModeIcon from "@mui/icons-material/LightModeOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";

import { ENDPOINTS, api, mensajeDeError } from "./api";
import { VIZ, crearTema } from "./tema";

import GraficoChoferes from "./components/GraficoChoferes";
import GraficoComparativa from "./components/GraficoComparativa";
import GraficoHoras from "./components/GraficoHoras";
import TablaChoferes from "./components/TablaChoferes";
import TablaPausas from "./components/TablaPausas";
import TarjetaKpi from "./components/TarjetaKpi";
import Temporizador from "./components/Temporizador";
import Busqueda from "./pages/Busqueda";

const INTERVALO_MS = 120000; // 2 minutos
const CLAVE_TEMA = "dashboard-tema";

function Dashboard({ modo, alternarModo }) {
  const esMovil = useMediaQuery("(max-width:600px)");
  const v = VIZ[modo];

  const [fecha, setFecha] = useState(dayjs());
  const [resumen, setResumen] = useState(null);
  
  const [vista, setVista] = useState("movimientos");
  const [periodo, setPeriodo] = useState("dia");

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [ultimaCarga, setUltimaCarga] = useState(Date.now());

    // `forzar` solo lo manda el boton de recargar: le dice al backend que
  // salte sus caches y vuelva a bajar la hoja. El refresco automatico no lo
  // usa, para no hacer una descarga completa cada dos minutos.
  const cargar = useCallback(async (forzar = false) => {
    const dia = fecha.format("YYYY-MM-DD");
    setCargando(true);
    setError(null);

    try {
            // Una sola llamada para los KPIs, el detalle por chofer y las horas.
      const { data } = await api.get(ENDPOINTS.resumen, {
        params: { fecha: dia, periodo, ...(forzar ? { refrescar: true } : {}) },
      });

      setResumen(data);
      setUltimaCarga(Date.now());
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setCargando(false);
    }
  }, [fecha, periodo]);

  // Un unico temporizador. El componente Temporizador solo muestra la cuenta
  // atras; ya no dispara recargas por su cuenta.
  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, INTERVALO_MS);
    return () => clearInterval(intervalo);
  }, [cargar]);

  const kpis = resumen?.kpis;
  const porChofer = resumen?.por_chofer ?? [];

  // Personas, no barras: PROTELANDTEMP es una sola barra pero son 4 choferes.
  const personasActivas = porChofer.reduce((n, c) => n + (c.personas || 1), 0);
  const hoy = dayjs().startOf("day");
  const esHoy = fecha.isSame(hoy, "day");

  const urlExportar = useMemo(
    () => `${ENDPOINTS.exportar}?fecha=${fecha.format("YYYY-MM-DD")}`,
    [fecha]
  );

  const primeraCarga = !resumen && cargando;

  return (
    <Box sx={{ minHeight: "100vh", bgcolor: v.plano, pb: 6 }}>
      <Box sx={{ maxWidth: 1180, mx: "auto", px: { xs: 2, sm: 3 }, pt: { xs: 2, sm: 4 } }}>
        {/* ---------- Cabecera ---------- */}
        <Box
          sx={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 2,
            mb: 3,
          }}
        >
          <Box>
            <Typography variant="h4" sx={{ color: v.tintaPrincipal, lineHeight: 1.2 }}>
              Movimientos de unidades
            </Typography>
                        <Typography sx={{ color: v.tintaSecundaria, fontSize: "0.85rem", mt: 0.5 }}>
              {periodo === "dia"
                ? `${esHoy ? "Hoy" : fecha.locale("es").format("dddd")} · ${fecha.format(
                    "DD/MM/YYYY"
                  )}`
                : resumen?.etiqueta ?? "…"}
            </Typography>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
            <Temporizador ultimaCarga={ultimaCarga} intervaloMs={INTERVALO_MS} />
            <Tooltip title="Actualizar ahora">
              <IconButton onClick={() => cargar(true)} disabled={cargando} size="small">
                {cargando ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <Tooltip title={modo === "dark" ? "Modo claro" : "Modo oscuro"}>
              <IconButton onClick={alternarModo} size="small">
                {modo === "dark" ? (
                  <LightModeIcon fontSize="small" />
                ) : (
                  <DarkModeIcon fontSize="small" />
                )}
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* ---------- Filtros: una sola fila, arriba de todo lo que afectan ---------- */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1.5,
            mb: 3,
            flexWrap: "wrap",
          }}
        >
          <LocalizationProvider dateAdapter={AdapterDayjs} adapterLocale="es">
            <DatePicker
              label="Fecha"
              value={fecha}
              format="DD/MM/YYYY"
              maxDate={hoy}
              onChange={(nueva) => nueva && setFecha(nueva)}
              slotProps={{ textField: { size: "small", sx: { width: 168 } } }}
            />
                    </LocalizationProvider>

          {/* El periodo se calcula a partir de la fecha elegida: la semana o
              el mes que la contienen. Asi un solo calendario sirve para los
              tres, en vez de pedir un rango de inicio y fin. */}
          <ToggleButtonGroup
            size="small"
            exclusive
            value={periodo}
            onChange={(e, nuevo) => nuevo && setPeriodo(nuevo)}
          >
            <ToggleButton value="dia">Día</ToggleButton>
            <ToggleButton value="semana">Semana</ToggleButton>
            <ToggleButton value="mes">Mes</ToggleButton>
          </ToggleButtonGroup>

          {!esHoy && (
            <Button size="small" onClick={() => setFecha(dayjs())}>
              Ir a hoy
            </Button>
          )}

          <ToggleButtonGroup
            size="small"
            exclusive
            value={vista}
            onChange={(e, nueva) => nueva && setVista(nueva)}
          >
            <ToggleButton value="movimientos">Movimientos</ToggleButton>
            <ToggleButton value="busqueda">Buscar unidad</ToggleButton>
          </ToggleButtonGroup>

          {vista === "movimientos" && (
            <Button
              size="small"
              component="a"
              href={urlExportar}
              startIcon={<DownloadIcon fontSize="small" />}
              sx={{ ml: "auto" }}
            >
              CSV
            </Button>
          )}
        </Box>

        {error && (
          <Alert
            severity="error"
            sx={{ mb: 3 }}
            action={
              <Button size="small" color="inherit" onClick={() => cargar(true)}>
                Reintentar
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {vista === "busqueda" ? (
          <Busqueda />
        ) : primeraCarga ? (
          <EsqueletoCarga esMovil={esMovil} />
        ) : (
          // Durante una recarga se mantiene el render anterior atenuado en vez
          // de volver a los esqueletos: no hay salto de maquetado ni parpadeo.
          <Box
            sx={{
              opacity: cargando ? 0.55 : 1,
              pointerEvents: cargando ? "none" : "auto",
              transition: "opacity 160ms ease",
            }}
          >
            {/* ---------- Indicadores ---------- */}
            <Box
              sx={{
                display: "grid",
                gap: 1.5,
                mb: 3,
                gridTemplateColumns: {
                  xs: "1fr 1fr",
                  sm: "1.4fr 1fr 1fr",
                  md: "1.5fr 1fr 1fr 1fr 1fr",
                },
              }}
            >
              <Box sx={{ gridColumn: { xs: "1 / -1", sm: "auto" } }}>
                                <TarjetaKpi
                  destacado
                  etiqueta={
                    periodo === "dia"
                      ? "Movimientos del día"
                      : periodo === "semana"
                      ? "Movimientos de la semana"
                      : "Movimientos del mes"
                  }
                  valor={kpis?.total ?? 0}
                  variacion={kpis?.variacion_pct}
                  nota={
                    kpis?.referencia
                      ? `vs ${kpis.referencia} ${kpis.referencia_etiqueta}`
                      : "sin referencia previa"
                  }
                />
              </Box>
              <TarjetaKpi etiqueta="Choferes activos" valor={kpis?.choferes_activos ?? 0} />
              <TarjetaKpi etiqueta="Unidades movidas" valor={kpis?.unidades_movidas ?? 0} />
              <TarjetaKpi
                etiqueta="Promedio por chofer"
                valor={kpis?.promedio_por_chofer ?? 0}
                sufijo="mov."
              />
                            {periodo === "dia" ? (
                <TarjetaKpi etiqueta="Hora pico" valor={kpis?.hora_pico ?? "–"} />
              ) : (
                <TarjetaKpi
                  etiqueta="Promedio por día"
                  valor={kpis?.promedio_por_dia ?? 0}
                  sufijo={`en ${kpis?.dias_con_actividad ?? 0} ${
                    kpis?.dias_con_actividad === 1 ? "día" : "días"
                  }`}
                />
              )}
            </Box>
            

            {/* ---------- Movimientos por chofer ---------- */}
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Encabezado
                  titulo="Movimientos por chofer"
                                    detalle={
                    personasActivas === porChofer.length
                      ? `${porChofer.length} ${
                          porChofer.length === 1 ? "chofer" : "choferes"
                        } con actividad`
                      : `${personasActivas} choferes con actividad, en ${porChofer.length} cuentas`
                  }
                  modo={modo}
                />
                <GraficoChoferes datos={porChofer} />
              </CardContent>
            </Card>

                        {/* ---------- Comparativa diaria ---------- */}
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Encabezado
                  titulo="Producción por día"
                  detalle={
                    periodo === "dia"
                      ? "Últimos 14 días, una línea por chofer"
                      : `${resumen?.etiqueta ?? ""}, una línea por chofer`
                  }
                  modo={modo}
                />
                <GraficoComparativa datos={resumen?.por_dia_chofer} />
              </CardContent>
            </Card>

                        {/* ---------- Ritmo por hora ---------- */}
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Encabezado
                  titulo="Ritmo por hora"
                  detalle={
                    periodo === "dia"
                      ? kpis?.hora_pico
                        ? `Mayor actividad a las ${kpis.hora_pico}`
                        : "Movimientos registrados en cada hora"
                      : `En qué horas se concentra el trabajo, sumando ${
                          kpis?.dias_con_actividad ?? 0
                        } ${kpis?.dias_con_actividad === 1 ? "día" : "días"}`
                  }
                  modo={modo}
                />
                <GraficoHoras datos={resumen?.por_hora} horaPico={kpis?.hora_pico} />
              </CardContent>
            </Card>

                         {/* ---------- Pausas ---------- */}
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Encabezado
                  titulo={`Pausas de más de ${
                    resumen?.pausas?.umbral_minutos ?? 30
                  } minutos`}
                  detalle={
                    resumen?.pausas?.total
                      ? `${resumen.pausas.total} ${
                          resumen.pausas.total === 1 ? "pausa" : "pausas"
                        } sin mover ninguna unidad`
                      : "Sin pausas largas en el periodo"
                  }
                  modo={modo}
                />
                <TablaPausas pausas={resumen?.pausas} periodo={periodo} />
              </CardContent>
            </Card>

            {/* ---------- Tabla ---------- */}
            {porChofer.length > 0 && (
              <Card>
                <CardContent>
                  <Encabezado titulo="Detalle por chofer" modo={modo} />
                  <TablaChoferes datos={porChofer} periodo={periodo} />
                </CardContent>
              </Card>
            )}

            <Typography
              sx={{ mt: 3, textAlign: "center", fontSize: "0.72rem", color: v.tintaSuave }}
            >
              Actualizado a las {new Date(ultimaCarga).toLocaleTimeString("es-PE")}
              {cargando && " · actualizando…"}
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
}

function Encabezado({ titulo, detalle, modo }) {
  const v = VIZ[modo];
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="h5" sx={{ color: v.tintaPrincipal }}>
        {titulo}
      </Typography>
      {detalle && (
        <Typography sx={{ color: v.tintaSecundaria, fontSize: "0.78rem", mt: 0.25 }}>
          {detalle}
        </Typography>
      )}
    </Box>
  );
}

function EsqueletoCarga({ esMovil }) {
  return (
    <Box>
      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          mb: 3,
          gridTemplateColumns: { xs: "1fr 1fr", md: "1.5fr 1fr 1fr 1fr 1fr" },
        }}
      >
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} variant="rounded" height={i === 0 ? 118 : 92} />
        ))}
      </Box>
      <Skeleton variant="rounded" height={esMovil ? 240 : 320} sx={{ mb: 2 }} />
      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
        }}
      >
        <Skeleton variant="rounded" height={260} />
        <Skeleton variant="rounded" height={260} />
      </Box>
    </Box>
  );
}

export default function App() {
  const prefiereOscuro = useMediaQuery("(prefers-color-scheme: dark)");

  const [modo, setModo] = useState(() => {
    try {
      const guardado = localStorage.getItem(CLAVE_TEMA);
      if (guardado === "light" || guardado === "dark") return guardado;
    } catch {
      // localStorage puede fallar en modo privado; se usa la preferencia del sistema.
    }
    return null;
  });

  const modoActivo = modo ?? (prefiereOscuro ? "dark" : "light");

  const alternarModo = () => {
    const nuevo = modoActivo === "dark" ? "light" : "dark";
    setModo(nuevo);
    try {
      localStorage.setItem(CLAVE_TEMA, nuevo);
    } catch {
      // Si no se puede guardar, el cambio vale solo para esta sesión.
    }
  };

  const tema = useMemo(() => crearTema(modoActivo), [modoActivo]);

  return (
    <ThemeProvider theme={tema}>
      <CssBaseline />
      <Dashboard modo={modoActivo} alternarModo={alternarModo} />
    </ThemeProvider>
  );
}
