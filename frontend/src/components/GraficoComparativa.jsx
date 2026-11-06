import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Box, Chip, Typography, useMediaQuery, useTheme } from "@mui/material";

import { VIZ } from "../tema";

const ALTO = 300;

/**
 * Produccion diaria de cada chofer, una linea por persona.
 *
 * Es el unico grafico con varias series, asi que es el unico que usa la
 * paleta categorica: aqui el color SI distingue a quien pertenece cada
 * linea. El indice lo manda el backend y es fijo por chofer, de modo que
 * apagar a alguien en la leyenda no repinta a los demas.
 *
 * Los valores vienen por persona: PROTELANDTEMP son cuatro choferes y su
 * linea en bruto estaria siempre arriba del todo sin significar nada.
 */
function GraficoComparativa({ datos }) {
  const theme = useTheme();
  const esMovil = useMediaQuery(theme.breakpoints.down("sm"));
  const v = VIZ[theme.palette.mode];
  const [ocultos, setOcultos] = useState(() => new Set());

  const series = datos?.series ?? [];
  const dias = datos?.dias ?? [];

  if (!series.length || !dias.length) {
    return (
      <Box sx={{ py: 5, textAlign: "center" }}>
        <Typography sx={{ color: v.tintaSuave, fontSize: "0.875rem" }}>
          No hay movimientos en este periodo
        </Typography>
      </Box>
    );
  }

  const color = (s) => v.categoricas[s.color % v.categoricas.length];
  const visibles = series.filter((s) => !ocultos.has(s.usuario));

  // Recharts quiere una fila por punto del eje X, con una columna por serie.
  const filas = dias.map((dia, i) => {
    const fila = { dia };
    for (const s of series) fila[s.usuario] = s.valores[i];
    return fila;
  });

  const alternar = (usuario) =>
    setOcultos((previos) => {
      const copia = new Set(previos);
      // Dejar el grafico sin ninguna linea no sirve de nada, asi que la
      // ultima visible no se puede apagar.
      if (copia.has(usuario)) copia.delete(usuario);
      else if (visibles.length > 1) copia.add(usuario);
      return copia;
    });

  return (
    <Box>
      {/* La leyenda es tambien el filtro. Lleva el nombre en tinta al lado
          del punto de color: la identidad no puede depender solo del color,
          y tres de los tonos claros quedan por debajo del contraste minimo
          sobre fondo claro. */}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 2 }}>
        {series.map((s) => {
          const apagado = ocultos.has(s.usuario);
          return (
            <Chip
              key={s.usuario}
              size="small"
              variant="outlined"
              onClick={() => alternar(s.usuario)}
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
                    <Typography component="span" sx={{ fontSize: "0.65rem", opacity: 0.7 }}>
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
            // Con un mes entero no caben 30 etiquetas: se pintan salteadas.
            interval={filas.length > 16 ? Math.ceil(filas.length / 8) - 1 : 0}
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
              // Con muchos dias los puntos ensucian; con pocos ayudan a leer.
              dot={filas.length <= 10 ? { r: 3, strokeWidth: 0 } : false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: v.superficie }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <Typography sx={{ mt: 1, fontSize: "0.7rem", color: v.tintaSuave }}>
        Movimientos por persona y día. Las cuentas compartidas van divididas
        entre sus titulares (marcadas con ÷) para que se puedan comparar con
        las individuales. Toca un nombre para quitarlo del gráfico.
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
          <Box
            sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: color(s) }}
          />
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