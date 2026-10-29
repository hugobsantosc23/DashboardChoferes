import { useEffect, useState } from "react";
import axios from "axios";
import dayjs from "dayjs";

import { LocalizationProvider } from "@mui/x-date-pickers/LocalizationProvider";
import { AdapterDayjs } from "@mui/x-date-pickers/AdapterDayjs";
import { DatePicker } from "@mui/x-date-pickers/DatePicker";

import { BrowserRouter, Routes, Route } from "react-router-dom";
import Busqueda from "./pages/Busqueda";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";

import {
  Box,
  Card,
  CardContent,
  Typography,
  CircularProgress,
  Skeleton,
  IconButton,
  Chip,
  ToggleButton,
  ToggleButtonGroup,
  useMediaQuery,
  useTheme,
} from "@mui/material";

import RefreshIcon from "@mui/icons-material/Refresh";
import Temporizador from "./components/Temporizador";

const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://127.0.0.1:8000" : "");

function App() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const isTablet = useMediaQuery(theme.breakpoints.down("md"));

  const [dashboard, setDashboard] = useState(null);
  const [choferes, setChoferes] = useState([]);
  const [fechaSeleccionada, setFechaSeleccionada] = useState(dayjs());
  const [cargando, setCargando] = useState(false);
  const [primeraCarga, setPrimeraCarga] = useState(true);
  const [modoVista, setModoVista] = useState("movimientos");

  const cargarMovimientos = async () => {
    const fecha = fechaSeleccionada.format("YYYY-MM-DD");
    try {
      const [dashboardRes, choferesRes] = await Promise.all([
        axios.get(`${API_URL}/api/movimientos/dashboard?fecha=${fecha}`),
        axios.get(`${API_URL}/api/movimientos/choferes?fecha=${fecha}`)
      ]);
      setDashboard(dashboardRes.data);
      setChoferes(choferesRes.data);
    } catch (error) {
      console.error("Error cargando movimientos:", error);
    }
  };

  const cargarDashboard = async () => {
    setCargando(true);
    localStorage.setItem("ultimaActualizacion", Date.now().toString());
    
    if (!primeraCarga) {
      setDashboard(null);
      setChoferes([]);
    }

    await cargarMovimientos();

    setPrimeraCarga(false);
    setCargando(false);
  };

  useEffect(() => {
    cargarDashboard();
    const intervalo = setInterval(() => {
      console.log("🔄 Actualizando datos automáticamente (cada 10 min)...");
      cargarDashboard();
    }, 600000);
    return () => clearInterval(intervalo);
  }, [fechaSeleccionada]);

  const choferesOrdenados = [...choferes].sort((a, b) => b.movimientos - a.movimientos);

  const getChartHeight = () => {
    if (isMobile) return Math.max(250, choferesOrdenados.length * 45);
    if (isTablet) return Math.max(300, choferesOrdenados.length * 50);
    return Math.max(350, choferesOrdenados.length * 60);
  };

  const getYAxisWidth = () => {
    if (isMobile) return 120;
    if (isTablet) return 150;
    return 180;
  };

  const getFontSize = () => {
    if (isMobile) return 11;
    if (isTablet) return 14;
    return 16;
  };

  const getLabelFontSize = () => {
    if (isMobile) return 11;
    if (isTablet) return 14;
    return 18;
  };

  const getChipSize = () => {
    if (isMobile) return "small";
    return "medium";
  };

  const getBarSize = () => {
    if (isMobile) return 14;
    if (isTablet) return 18;
    return 22;
  };

  const getBarGap = () => {
    if (isMobile) return 15;
    if (isTablet) return 20;
    return 30;
  };

  if (primeraCarga && cargando) {
    return (
      <Box sx={{ background: "#f4f6f8", minHeight: "100vh", padding: isMobile ? 2 : 4 }}>
        <Typography variant={isMobile ? "h5" : "h4"} fontWeight="bold" sx={{ mb: 3, color: "primary.main", textAlign: "center" }}>
          📦 Movimientos de Unidades
        </Typography>
        <Box sx={{ display: "flex", justifyContent: "center", gap: isMobile ? 1 : 3, flexWrap: "wrap", mb: 3 }}>
          {[1, 2, 3].map((i) => (
            <Card key={i} sx={{ textAlign: "center", minWidth: isMobile ? 80 : 180 }}>
              <CardContent sx={{ padding: isMobile ? 1 : 2 }}>
                <Skeleton variant="text" width={isMobile ? 50 : 120} sx={{ mx: "auto" }} />
                <Skeleton variant="text" width={isMobile ? 30 : 80} height={isMobile ? 30 : 60} sx={{ mx: "auto" }} />
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>
    );
  }

  if (!dashboard) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <CircularProgress />
        <Typography variant="h6" sx={{ ml: 2 }}>Cargando movimientos...</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ background: "#f4f6f8", minHeight: "100vh", padding: isMobile ? 1.5 : 4 }}>
      
      {/* HEADER */}
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", mb: isMobile ? 2 : 3 }}>
        <Typography variant={isMobile ? "h5" : "h4"} fontWeight="bold" sx={{ mb: 1, color: "primary.main", textAlign: "center" }}>
          📦 Movimientos de Unidades
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: isMobile ? 0.5 : 1, flexWrap: "wrap", justifyContent: "center" }}>
          <Temporizador onActualizar={cargarDashboard} />
          <Chip 
            label={`📅 ${fechaSeleccionada.format("DD/MM/YYYY")}`}
            color="primary"
            size={isMobile ? "small" : "medium"}
          />
          <IconButton 
            onClick={cargarDashboard} 
            disabled={cargando}
            color="primary"
            size={isMobile ? "small" : "medium"}
          >
            <RefreshIcon fontSize={isMobile ? "small" : "medium"} />
          </IconButton>
          {cargando && <CircularProgress size={isMobile ? 20 : 24} />}
        </Box>
      </Box>

      {/* FILTROS */}
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", gap: isMobile ? 1 : 2, mb: isMobile ? 2 : 3, flexWrap: "wrap" }}>
        <LocalizationProvider dateAdapter={AdapterDayjs}>
          <DatePicker
            label="Seleccionar fecha"
            value={fechaSeleccionada}
            format="DD/MM/YYYY"
            onChange={(nuevaFecha) => {
              if (nuevaFecha) {
                setFechaSeleccionada(nuevaFecha);
                localStorage.setItem("ultimaActualizacion", Date.now().toString());
              }
            }}
            disabled={cargando}
            slotProps={{ textField: { size: isMobile ? "small" : "medium" } }}
          />
        </LocalizationProvider>

        <ToggleButtonGroup
          value={modoVista}
          exclusive
          onChange={(e, nuevoModo) => {
            if (nuevoModo !== null) setModoVista(nuevoModo);
          }}
          size={isMobile ? "small" : "medium"}
        >
          <ToggleButton value="movimientos" sx={{ fontSize: isMobile ? "0.75rem" : "0.875rem" }}>
            🚚 MOVIMIENTOS
          </ToggleButton>
          <ToggleButton value="busqueda" sx={{ fontSize: isMobile ? "0.75rem" : "0.875rem" }}>
            🔍 BUSCAR UNIDAD
          </ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* BÚSQUEDA */}
      {modoVista === "busqueda" ? (
        <Busqueda />
      ) : (
        <>
          {/* KPI CARDS */}
          <Box sx={{ display: "flex", justifyContent: "center", gap: isMobile ? 1 : 3, flexWrap: "wrap", mb: isMobile ? 2 : 3 }}>
            <Card sx={{ textAlign: "center", minWidth: isMobile ? 80 : 180, flex: "0 0 auto", width: isMobile ? "28%" : "auto", boxShadow: 2 }}>
              <CardContent sx={{ padding: isMobile ? 1 : 2 }}>
                <Typography variant={isMobile ? "caption" : "h6"} color="textSecondary" gutterBottom sx={{ fontSize: isMobile ? "0.65rem" : "1rem" }}>
                  Total Movimientos
                </Typography>
                <Typography variant={isMobile ? "h5" : "h3"} fontWeight="bold" sx={{ fontSize: isMobile ? "1.2rem" : "3rem" }}>
                  {dashboard.total || 0}
                </Typography>
              </CardContent>
            </Card>
            <Card sx={{ textAlign: "center", minWidth: isMobile ? 80 : 180, flex: "0 0 auto", width: isMobile ? "28%" : "auto", boxShadow: 2 }}>
              <CardContent sx={{ padding: isMobile ? 1 : 2 }}>
                <Typography variant={isMobile ? "caption" : "h6"} color="textSecondary" gutterBottom sx={{ fontSize: isMobile ? "0.65rem" : "1rem" }}>
                  Choferes Activos
                </Typography>
                <Typography variant={isMobile ? "h5" : "h3"} fontWeight="bold" sx={{ color: "#22c55e", fontSize: isMobile ? "1.2rem" : "3rem" }}>
                  {dashboard.choferes_activos || 0}
                </Typography>
              </CardContent>
            </Card>
            <Card sx={{ textAlign: "center", minWidth: isMobile ? 80 : 180, flex: "0 0 auto", width: isMobile ? "28%" : "auto", boxShadow: 2 }}>
              <CardContent sx={{ padding: isMobile ? 1 : 2 }}>
                <Typography variant={isMobile ? "caption" : "h6"} color="textSecondary" gutterBottom sx={{ fontSize: isMobile ? "0.65rem" : "1rem" }}>
                  Unidades Movidas
                </Typography>
                <Typography variant={isMobile ? "h5" : "h3"} fontWeight="bold" sx={{ color: "#3b82f6", fontSize: isMobile ? "1.2rem" : "3rem" }}>
                  {dashboard.unidades_movidas || 0}
                </Typography>
              </CardContent>
            </Card>
          </Box>

          {/* GRÁFICO PRINCIPAL */}
          <Box sx={{ mt: isMobile ? 2 : 3 }}>
            <Card>
              <CardContent sx={{ padding: isMobile ? 1.5 : 2 }}>
                <Typography variant={isMobile ? "subtitle1" : "h5"} gutterBottom sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                  🚚 Movimientos por Chofer
                  <Chip 
                    label={`📊 ${choferesOrdenados.reduce((sum, item) => sum + item.movimientos, 0)}`}
                    size={getChipSize()} 
                    color="primary"
                    variant="outlined"
                  />
                </Typography>

                {cargando ? (
                  <Skeleton variant="rounded" height={isMobile ? 200 : 350} />
                ) : choferesOrdenados.length === 0 ? (
                  <Box sx={{ textAlign: "center", py: isMobile ? 2 : 4 }}>
                    <Typography variant={isMobile ? "body2" : "h6"} color="textSecondary">
                      No hay movimientos registrados para esta fecha
                    </Typography>
                  </Box>
                ) : (
                  <ResponsiveContainer key={fechaSeleccionada.format("YYYY-MM-DD")} width="100%" height={getChartHeight()}>
                    <BarChart data={choferesOrdenados} layout="vertical" margin={{ top: 10, right: isMobile ? 30 : 80, left: isMobile ? 5 : 20, bottom: 10 }} barSize={getBarSize()} barCategoryGap={getBarGap()}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis type="number" domain={[0, 'dataMax + 2']} tick={{ fontSize: isMobile ? 10 : 12 }} />
                      <YAxis dataKey="nombre" type="category" width={getYAxisWidth()} tick={{ fontSize: getFontSize(), fontWeight: 600 }} />
                      <Tooltip 
                        formatter={(value, name) => {
                          if (name === "movimientos") return [`${value} 🚚`, "Movimientos"];
                          if (name === "unidades") return [`${value} 📦`, "Unidades"];
                          return [value, name];
                        }}
                      />
                      <Legend verticalAlign="top" height={isMobile ? 25 : 36} wrapperStyle={{ fontSize: isMobile ? 10 : 14 }} />
                      <Bar 
                        dataKey="movimientos" 
                        fill="#3b82f6" 
                        radius={[0, 4, 4, 0]}
                        label={{ 
                          position: "right", 
                          formatter: (value) => value > 0 ? `🚚 ${value}` : "",
                          fontSize: getLabelFontSize(),
                          fill: "#2563eb",
                          fontWeight: "bold"
                        }} 
                      />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </Box>

          {/* TABLA RESUMEN */}
          {!cargando && choferesOrdenados.length > 0 && (
            <Box sx={{ mt: isMobile ? 2 : 3 }}>
              <Card>
                <CardContent sx={{ padding: isMobile ? 1 : 2 }}>
                  <Typography variant={isMobile ? "subtitle1" : "h5"} gutterBottom>
                    📊 Resumen por Chofer
                  </Typography>
                  <Box sx={{ overflowX: 'auto' }}>
                    <table style={{ 
                      width: '100%', 
                      borderCollapse: 'collapse',
                      backgroundColor: '#fafafa',
                      borderRadius: '8px',
                      overflow: 'hidden',
                      fontSize: isMobile ? '10px' : '14px'
                    }}>
                      <thead>
                        <tr style={{ backgroundColor: '#e0e0e0' }}>
                          <th style={{ padding: isMobile ? '6px 6px' : '10px 12px', textAlign: 'left' }}>Chofer</th>
                          <th style={{ padding: isMobile ? '6px 6px' : '10px 12px', textAlign: 'center' }}>🚚 Movimientos</th>
                          <th style={{ padding: isMobile ? '6px 6px' : '10px 12px', textAlign: 'center' }}>📦 Unidades</th>
                        </tr>
                      </thead>
                      <tbody>
                        {choferesOrdenados.map((item, index) => (
                          <tr key={item.nombre} style={{ 
                            borderBottom: index < choferesOrdenados.length - 1 ? '1px solid #e0e0e0' : 'none',
                            backgroundColor: index % 2 === 0 ? '#ffffff' : '#f5f5f5'
                          }}>
                            <td style={{ padding: isMobile ? '6px 6px' : '10px 12px', fontWeight: '500', fontSize: isMobile ? '9px' : '14px' }}>
                              {item.nombre}
                            </td>
                            <td style={{ padding: isMobile ? '6px 6px' : '10px 12px', textAlign: 'center', fontWeight: 'bold', color: '#2563eb', fontSize: isMobile ? '9px' : '14px' }}>
                              {item.movimientos}
                            </td>
                            <td style={{ padding: isMobile ? '6px 6px' : '10px 12px', textAlign: 'center', fontSize: isMobile ? '9px' : '14px' }}>
                              {item.unidades}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Box>
                </CardContent>
              </Card>
            </Box>
          )}

          {/* FOOTER */}
          <Box sx={{ mt: isMobile ? 2 : 3, textAlign: "center" }}>
            <Typography variant="caption" color="textSecondary" sx={{ fontSize: isMobile ? '9px' : '12px' }}>
              Última actualización: {new Date().toLocaleTimeString()}
              {cargando && " (actualizando...)"}
            </Typography>
          </Box>
        </>
      )}
    </Box>
  );
}

function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/busqueda" element={<Busqueda />} />
      </Routes>
    </BrowserRouter>
  );
}

export default AppRouter;