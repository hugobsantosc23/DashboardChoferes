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
import GraficoHoras from "./components/GraficoHoras";
import GraficoTendencia from "./components/GraficoTendencia";
import TablaChoferes from "./components/TablaChoferes";
import TarjetaKpi from "./components/TarjetaKpi";
import Temporizador from "./components/Temporizador";
import Busqueda from "./pages/Busqueda";

const INTERVALO_MS = 600000; // 10 minutos
const DIAS_TENDENCIA = 14;
const CLAVE_TEMA = "dashboard-tema";

function Dashboard({ modo, alternarModo }) {
  const esMovil = useMediaQuery("(max-width:600px)");
  const v = VIZ[modo];

  const [fecha, setFecha] = useState(dayjs());
  const [resumen, setResumen] = useState(null);
  const [tendencia, setTendencia] = useState([]);
  const [vista, setVista] = useState("movimientos");

  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);
  const [ultimaCarga, setUltimaCarga] = useState(Date.now());

  const cargar = useCallback(async () => {
    const dia = fecha.format("YYYY-MM-DD");
    setCargando(true);
    setError(null);

    try {
      // Una sola llamada para los KPIs, el detalle por chofer y las horas.
      // Antes eran dos peticiones por recarga a dos endpoints distintos.
      const [resResumen, resTendencia] = await Promise.all([
        api.get(ENDPOINTS.resumen, { params: { fecha: dia } }),
        api.get(ENDPOINTS.tendencia, { params: { dias: DIAS_TENDENCIA, hasta: dia } }),
      ]);

      setResumen(resResumen.data);
      setTendencia(resTendencia.data);
      setUltimaCarga(Date.now());
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setCargando(false);
    }
  }, [fecha]);

  // Un unico temporizador. El componente Temporizador solo muestra la cuenta
  // atras; ya no dispara recargas por su cuenta.
  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, INTERVALO_MS);
    return () => clearInterval(intervalo);
  }, [cargar]);

  const kpis = resumen?.kpis;
  const porChofer = resumen?.por_chofer ?? [];
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
              {esHoy ? "Hoy" : fecha.format("dddd")} · {fecha.format("DD/MM/YYYY")}
            </Typography>
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexShrink: 0 }}>
            <Temporizador ultimaCarga={ultimaCarga} intervaloMs={INTERVALO_MS} />
            <Tooltip title="Actualizar ahora">
              <IconButton onClick={cargar} disabled={cargando} size="small">
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
          <LocalizationProvider dateAdapter={AdapterDayjs}>
            <DatePicker
              label="Fecha"
              value={fecha}
              format="DD/MM/YYYY"
              maxDate={hoy}
              onChange={(nueva) => nueva && setFecha(nueva)}
              slotProps={{ textField: { size: "small", sx: { width: 168 } } }}
            />
          </LocalizationProvider>

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
              <Button size="small" color="inherit" onClick={cargar}>
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
                  etiqueta="Movimientos del día"
                  valor={kpis?.total ?? 0}
                  variacion={kpis?.variacion_pct}
                  nota={
                    kpis?.promedio_7_dias
                      ? `vs ${kpis.promedio_7_dias} de promedio`
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
              <TarjetaKpi etiqueta="Hora pico" valor={kpis?.hora_pico ?? "–"} />
            </Box>

            {/* ---------- Movimientos por chofer ---------- */}
            <Card sx={{ mb: 2 }}>
              <CardContent>
                <Encabezado
                  titulo="Movimientos por chofer"
                  detalle={`${porChofer.length} ${
                    porChofer.length === 1 ? "chofer" : "choferes"
                  } con actividad`}
                  modo={modo}
                />
                <GraficoChoferes datos={porChofer} />
              </CardContent>
            </Card>

            {/* ---------- Por hora y tendencia ---------- */}
            <Box
              sx={{
                display: "grid",
                gap: 2,
                mb: 2,
                gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
              }}
            >
              <Card>
                <CardContent>
                  <Encabezado
                    titulo="Ritmo por hora"
                    detalle={
                      kpis?.hora_pico
                        ? `Mayor actividad a las ${kpis.hora_pico}`
                        : "Movimientos registrados en cada hora"
                    }
                    modo={modo}
                  />
                  <GraficoHoras datos={resumen?.por_hora} horaPico={kpis?.hora_pico} />
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <Encabezado
                    titulo={`Últimos ${DIAS_TENDENCIA} días`}
                    detalle="Movimientos por día, con el día seleccionado marcado"
                    modo={modo}
                  />
                  <GraficoTendencia
                    datos={tendencia}
                    diaSeleccionado={fecha.format("YYYY-MM-DD")}
                    promedio={kpis?.promedio_7_dias ?? 0}
                  />
                </CardContent>
              </Card>
            </Box>

            {/* ---------- Tabla ---------- */}
            {porChofer.length > 0 && (
              <Card>
                <CardContent>
                  <Encabezado titulo="Detalle por chofer" modo={modo} />
                  <TablaChoferes datos={porChofer} />
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
