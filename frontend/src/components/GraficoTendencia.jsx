import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Box, Typography, useMediaQuery, useTheme } from "@mui/material";

import { VIZ } from "../tema";
import TooltipViz from "./TooltipViz";

/**
 * Tendencia de movimientos por dia.
 *
 * Solo se dibuja `movimientos`. El numero de choferes vive en el tooltip a
 * proposito: son dos magnitudes de escala distinta y ponerlas en dos ejes Y
 * inventaria una correlacion que los datos no tienen.
 */
function GraficoTendencia({ datos, diaSeleccionado, promedio }) {
  const theme = useTheme();
  const esMovil = useMediaQuery(theme.breakpoints.down("sm"));
  const v = VIZ[theme.palette.mode];

  if (!datos?.length) {
    return (
      <Box sx={{ py: 4, textAlign: "center" }}>
        <Typography sx={{ color: v.tintaSuave, fontSize: "0.875rem" }}>
          Sin datos suficientes para la tendencia
        </Typography>
      </Box>
    );
  }

  // Punto visible solo en el dia seleccionado y en el ultimo dato. Un punto en
  // cada dia convierte la linea en ruido.
  const ultimo = datos[datos.length - 1]?.dia;

  const Punto = (props) => {
    const { cx, cy, payload } = props;
    const esDestacado = payload.dia === diaSeleccionado || payload.dia === ultimo;
    if (!esDestacado || cx == null || cy == null) return null;
    return (
      <circle
        cx={cx}
        cy={cy}
        r={4.5}
        fill={v.serie}
        stroke={v.superficie}
        strokeWidth={2}
      />
    );
  };

  return (
    <ResponsiveContainer width="100%" height={esMovil ? 190 : 230}>
      <LineChart data={datos} margin={{ top: 12, right: 12, left: -24, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={v.cuadricula} strokeWidth={1} />
        <XAxis
          dataKey="etiqueta"
          interval="preserveStartEnd"
          minTickGap={esMovil ? 24 : 18}
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
        {promedio > 0 && (
          <ReferenceLine
            y={promedio}
            stroke={v.eje}
            strokeWidth={1}
            label={{
              value: `promedio ${promedio}`,
              position: "insideTopRight",
              fill: v.tintaSuave,
              fontSize: 10,
            }}
          />
        )}
        <Tooltip
          content={
            <TooltipViz
              filas={(d) => [
                { texto: `${d.movimientos} movimientos` },
                { texto: `${d.choferes} ${d.choferes === 1 ? "chofer" : "choferes"}` },
              ]}
            />
          }
        />
        <Line
          type="monotone"
          dataKey="movimientos"
          stroke={v.serie}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          dot={<Punto />}
          activeDot={{ r: 5, fill: v.serie, stroke: v.superficie, strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default GraficoTendencia;
