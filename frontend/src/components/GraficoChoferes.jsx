import {
  Bar,
  BarChart,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Box, Typography, useMediaQuery, useTheme } from "@mui/material";

import { VIZ } from "../tema";
import TooltipViz from "./TooltipViz";

const ALTO_BANDA = 44;
const ALTO_EJE = 8;

/**
 * Movimientos por chofer: una sola serie, asi que no lleva leyenda (el titulo
 * de la tarjeta ya dice que se esta midiendo) y todas las barras son del mismo
 * color. Colorear cada barra de un tono distinto duplicaria en color lo que la
 * longitud ya dice.
 */
function GraficoChoferes({ datos }) {
  const theme = useTheme();
  const esMovil = useMediaQuery(theme.breakpoints.down("sm"));
  const v = VIZ[theme.palette.mode];

  if (!datos?.length) {
    return (
      <Box sx={{ py: 5, textAlign: "center" }}>
        <Typography sx={{ color: v.tintaSuave, fontSize: "0.875rem" }}>
          No hay movimientos registrados en esta fecha
        </Typography>
      </Box>
    );
  }

  // La altura incluye la banda del eje X: si no, la tarjeta genera un scroll
  // interno diminuto y las etiquetas del eje quedan cortadas.
  const alto = Math.max(160, datos.length * ALTO_BANDA) + ALTO_EJE;

  return (
    <ResponsiveContainer width="100%" height={alto}>
      <BarChart
        data={datos}
        layout="vertical"
        margin={{ top: 4, right: esMovil ? 40 : 56, left: 0, bottom: 4 }}
        barSize={esMovil ? 14 : 18}
      >
        {/* Cada barra lleva su valor en la punta, asi que el eje X y las lineas
            de cuadricula solo anadirian tinta que no aporta nada. */}
        <XAxis type="number" domain={[0, "dataMax + 1"]} hide />
        <YAxis
          type="category"
          dataKey="nombre"
          width={esMovil ? 104 : 132}
          tick={{ fill: v.tintaSecundaria, fontSize: esMovil ? 11 : 12 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: v.cuadricula, fillOpacity: 0.4 }}
          content={
            <TooltipViz
              filas={(d) => [
                { texto: `${d.movimientos} movimientos` },
                { texto: `${d.unidades} unidades distintas` },
                { texto: `De ${d.primero} a ${d.ultimo}` },
                ...(d.por_hora ? [{ texto: `${d.por_hora} por hora` }] : []),
              ]}
            />
          }
        />
        <Bar dataKey="movimientos" fill={v.serie} radius={[0, 4, 4, 0]}>
          {/* El valor va en la punta de la barra, en tinta y no en el color
              de la serie: un azul claro como texto no se lee sobre el fondo. */}
          <LabelList
            dataKey="movimientos"
            position="right"
            offset={8}
            style={{
              fill: v.tintaSecundaria,
              fontSize: esMovil ? 11 : 12,
              fontWeight: 600,
            }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default GraficoChoferes;
