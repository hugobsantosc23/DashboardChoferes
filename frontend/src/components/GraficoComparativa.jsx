import { useCallback, useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Box,
  Chip,
  CircularProgress,
  IconButton,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";

import { ENDPOINTS, api, mensajeDeError } from "../api";
import { VIZ } from "../tema";

const ALTO = 300;

/**
 * Produccion diaria de cada chofer en una semana de lunes a domingo.
 *
 * Tiene su propio endpoint y su propia semana, aparte del periodo que use el
 * resto del tablero: moverse de semana aqui no tiene por que recalcular los
 * KPIs ni las pausas, y la semana natural es como se organiza el turno (el
 * conteo se reinicia cada lunes, no arrastra una ventana movil).
 *
 * Es el unico grafico con varias series, asi que es el unico que usa la
 * paleta categorica: aqui el color SI es la identidad de cada persona. El
 * indice lo manda el backend y es fijo por chofer, de modo que apagar a
 * alguien o cambiar de semana no repinta a los demas.
 *
 * Los valores vienen por persona: PROTELANDTEMP son cuatro choferes y su
 * linea en bruto estaria siempre arriba del todo sin significar nada.
 */
function GraficoComparativa() {
  const theme = useTheme();
  const esMovil = useMediaQuery(theme.breakpoints.down("sm"));
  const v = VIZ[theme.palette.mode];

  const [semanas, setSemanas] = useState(0);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [ocultos, setOcultos] = useState(() => new Set());

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data } = await api.get(ENDPOINTS.comparativa, { params: { semanas } });
      setDatos(data);
    } catch (e) {
      setError(mensajeDeError(e));
    } finally {
      setCargando(false);
    }
  }, [semanas]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const series = datos?.series ?? [];
  const dias = datos?.dias ?? [];
  const color = (s) => v.categoricas[s.color % v.categoricas.length];
  const visibles = series.filter((s) => !ocultos.has(s.usuario));

  // Aislar a uno: tocar su nombre deja solo su linea, y volver a tocarlo
  // devuelve a todos. Es la forma rapida de mirar a una persona sin ir
  // apagando a las demas una por una.
  const aislar = (usuario) =>
    setOcultos((previos) => {
      const soloEste = visibles.length === 1 && visibles[0].usuario === usuario;
      if (soloEste) return new Set();
      return new Set(series.map((s) => s.usuario).filter((u) => u !== usuario));
    });

  const solo = visibles.length === 1 ? visibles[0] : null;

  const filas = dias.map((dia, i) => {
    const fila = { dia };
    for (const s of series) fila[s.usuario] = s.valores[i];
    return fila;
  });

  return (
    <Box>
      {/* Navegacion de semana */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, mb: 1.5 }}>
        <IconButton size="small" onClick={() => setSemanas((n) => n - 1)}>
          <ChevronLeftIcon />
        </IconButton>
        <Typography
          sx={{
            fontSize: "0.85rem",
            color: v.tintaPrincipal,
            fontWeight: 500,
            minWidth: esMovil ? 0 : 210,
            textAlign: "center",
          }}
        >
          {datos?.es_semana_actual ? "Esta semana" : datos?.etiqueta ?? "…"}
        </Typography>
        <IconButton
          size="small"
          onClick={() => setSemanas((n) => n + 1)}
          disabled={!datos?.hay_siguiente}
        >
          <ChevronRightIcon />
        </IconButton>
        {datos && !datos.es_semana_actual && (
          <Chip
            size="small"
            variant="outlined"
            label="Hoy"
            onClick={() => setSemanas(0)}
            sx={{ ml: 0.5, cursor: "pointer" }}
          />
        )}
      </Box>

      {datos?.es_semana_actual && (
        <Typography sx={{ fontSize: "0.75rem", color: v.tintaSuave, mb: 1.5, mt: -1 }}>
          {datos.etiqueta}
        </Typography>
      )}

      {/* La leyenda es tambien el selector. Lleva el nombre en tinta al lado
          del punto de color: la identidad no puede depender solo del color,
          y tres de los tonos claros quedan por debajo del contraste minimo
          sobre fondo claro. */}
      {series.length > 0 && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 2 }}>
          {series.map((s) => {
            const apagado = ocultos.has(s.usuario);
            return (
              <Chip
                key={s.usuario}
                size="small"
                variant="outlined"
                onClick={() => aislar(s.usuario)}
                label={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        bgcolor: apagado ? "transparent" : color(s),
                        border: `2px solid ${apagado ? v.tintaSuave : color(s)}`,
                      }}
                    />
                    <span>{s.nombre}</span>
                    {s.personas > 1 && (
                      <Typography
                        component="span"
                        sx={{ fontSize: "0.65rem", opacity: 0.7 }}
                      >
                        ÷{s.personas}
                      </Typography>
                    )}
                  </Box>
                }
                sx={{
                  cursor: "pointer",
                  opacity: apagado ? 0.5 : 1,
                  color: v.tintaPrincipal,
                }}
              />
            );
          })}
        </Box>
      )}

      {/* Con un solo chofer en pantalla, su semana en cifras. */}
      {solo && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2.5, mb: 2 }}>
          <Dato etiqueta="Total de la semana" valor={solo.total} v={v} />
          <Dato
            etiqueta="Promedio por día"
            valor={solo.promedio}
            nota={`en ${solo.dias_trabajados} ${
              solo.dias_trabajados === 1 ? "día" : "días"
            }`}
            v={v}
          />
          <Dato etiqueta="Mejor día" valor={solo.mejor} nota={solo.mejor_dia} v={v} />
        </Box>
      )}

      {cargando ? (
        <Box sx={{ height: ALTO, display: "grid", placeItems: "center" }}>
          <CircularProgress size={28} />
        </Box>
      ) : error ? (
        <Box sx={{ height: ALTO, display: "grid", placeItems: "center" }}>
          <Typography sx={{ color: v.malo, fontSize: "0.875rem" }}>{error}</Typography>
        </Box>
      ) : !series.length ? (
        <Box sx={{ height: ALTO, display: "grid", placeItems: "center" }}>
          <Typography sx={{ color: v.tintaSuave, fontSize: "0.875rem" }}>
            No hay movimientos en esta semana
          </Typography>
        </Box>
      ) : (
        <ResponsiveContainer width="100%" height={ALTO}>
          <LineChart
            data={filas}
            margin={{ top: 8, right: 12, left: esMovil ? -18 : -8, bottom: 0 }}
          >
            <CartesianGrid stroke={v.cuadricula} vertical={false} />
            <XAxis
              dataKey="dia"
              tick={{ fill: v.tintaSecundaria, fontSize: esMovil ? 10 : 11 }}
              axisLine={{ stroke: v.eje }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: v.tintaSecundaria, fontSize: esMovil ? 10 : 11 }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ stroke: v.eje, strokeWidth: 1 }}
              content={<Cajita series={series} color={color} v={v} />}
            />
            {visibles.map((s) => (
              <Line
                key={s.usuario}
                type="monotone"
                dataKey={s.usuario}
                name={s.nombre}
                stroke={color(s)}
                strokeWidth={2}
                // Una semana son como mucho siete puntos: aqui los dots
                // ayudan a leer y no ensucian.
                dot={{ r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: v.superficie }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}

      <Typography sx={{ mt: 1, fontSize: "0.7rem", color: v.tintaSuave }}>
        Movimientos por persona y día, de lunes a domingo. Las cuentas
        compartidas van divididas entre sus titulares (marcadas con ÷) para que
        se puedan comparar con las individuales. Toca un nombre para ver solo a
        esa persona, y otra vez para volver a todos.
      </Typography>
    </Box>
  );
}

function Dato({ etiqueta, valor, nota, v }) {
  return (
    <Box>
      <Typography sx={{ fontSize: "0.7rem", color: v.tintaSuave }}>{etiqueta}</Typography>
      <Typography
        sx={{
          fontSize: "1.1rem",
          fontWeight: 600,
          color: v.tintaPrincipal,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {valor}
        {nota && (
          <Typography
            component="span"
            sx={{ ml: 0.75, fontSize: "0.7rem", fontWeight: 400, color: v.tintaSuave }}
          >
            {nota}
          </Typography>
        )}
      </Typography>
    </Box>
  );
}

function Cajita({ active, payload, label, series, color, v }) {
  if (!active || !payload?.length) return null;

  const porUsuario = new Map(payload.map((p) => [p.dataKey, p.value]));
  const lineas = series
    .filter((s) => porUsuario.has(s.usuario))
    .sort((a, b) => porUsuario.get(b.usuario) - porUsuario.get(a.usuario));

  return (
    <Box
      sx={{
        bgcolor: v.superficie,
        border: `1px solid ${v.borde}`,
        borderRadius: 1,
        px: 1.25,
        py: 1,
        boxShadow: 3,
      }}
    >
      <Typography sx={{ fontSize: "0.75rem", color: v.tintaSecundaria, mb: 0.5 }}>
        {label}
      </Typography>
      {lineas.map((s) => (
        <Box
          key={s.usuario}
          sx={{ display: "flex", alignItems: "center", gap: 0.75, fontSize: "0.8rem" }}
        >
          <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color(s) }} />
          <Typography component="span" sx={{ color: v.tintaSecundaria, flex: 1 }}>
            {s.nombre}
          </Typography>
          <Typography
            component="span"
            sx={{
              color: v.tintaPrincipal,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {porUsuario.get(s.usuario)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

export default GraficoComparativa;