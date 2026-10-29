import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Box, Typography, useMediaQuery, useTheme } from "@mui/material";

import { VIZ } from "../tema";
import TooltipViz from "./TooltipViz";

/**
 * Movimientos por hora del dia.
 *
 * Una sola serie. La hora pico se destaca con el tono pleno y el resto queda
 * en el paso claro de la misma rampa: es enfasis sobre una barra, no una
 * escala de color aplicada a categorias.
 */
function GraficoHoras({ datos, horaPico }) {
  const theme = useTheme();
  const esMovil = useMediaQuery(theme.breakpoints.down("sm"));
  const v = VIZ[theme.palette.mode];

  const total = (datos || []).reduce((suma, d) => suma + d.movimientos, 0);

  if (!datos?.length || total === 0) {
    return (
      <Box sx={{ py: 4, textAlign: "center" }}>
        <Typography sx={{ color: v.tintaSuave, fontSize: "0.875rem" }}>
          Sin actividad por hora en esta fecha
        </Typography>
      </Box>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={esMovil ? 180 : 220}>
      <BarChart data={datos} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={v.cuadricula} strokeWidth={1} />
        <XAxis
          dataKey="hora"
          interval={esMovil ? 3 : 1}
          tick={{ fill: v.tintaSuave, fontSize: 10 }}
          axisLine={{ stroke: v.eje }}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fill: v.tintaSuave, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={44}
        />
        <Tooltip
          cursor={{ fill: v.cuadricula, fillOpacity: 0.4 }}
          content={
            <TooltipViz filas={(d) => [{ texto: `${d.movimientos} movimientos` }]} />
          }
        />
        <Bar dataKey="movimientos" radius={[4, 4, 0, 0]} maxBarSize={24}>
          {datos.map((d) => (
            <Cell
              key={d.hora}
              fill={d.hora === horaPico ? v.serie : v.serieSuave}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default GraficoHoras;
