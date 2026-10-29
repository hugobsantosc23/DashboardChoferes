import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";

import { VIZ } from "../tema";

/**
 * Tabla equivalente al grafico de barras: el mismo dato en texto, para quien
 * no pueda o no quiera leer el grafico, y con las columnas que el grafico no
 * muestra (primer y ultimo movimiento, ritmo por hora).
 *
 * `unidades` es la columna que antes salia vacia: el backend no la devolvia.
 */
function TablaChoferes({ datos }) {
  const theme = useTheme();
  const esMovil = useMediaQuery(theme.breakpoints.down("sm"));
  const v = VIZ[theme.palette.mode];

  if (!datos?.length) return null;

  const numero = { textAlign: "right", fontVariantNumeric: "tabular-nums" };

  return (
    <Box sx={{ overflowX: "auto" }}>
      {/* En movil se muestran solo tres columnas para que la tabla entre en la
          pantalla sin scroll lateral; jornada y ritmo quedan en el tooltip del
          grafico y en la vista de escritorio. */}
      <Table size="small" sx={{ minWidth: esMovil ? 0 : 560 }}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ px: esMovil ? 1 : 2 }}>Chofer</TableCell>
            <TableCell sx={{ ...numero, px: esMovil ? 1 : 2 }}>
              {esMovil ? "Mov." : "Movimientos"}
            </TableCell>
            <TableCell sx={{ ...numero, px: esMovil ? 1 : 2 }}>
              {esMovil ? "Unid." : "Unidades"}
            </TableCell>
            {!esMovil && <TableCell sx={{ textAlign: "center" }}>Jornada</TableCell>}
            {!esMovil && <TableCell sx={numero}>Por hora</TableCell>}
          </TableRow>
        </TableHead>
        <TableBody>
          {datos.map((fila) => (
            <TableRow key={fila.nombre} hover>
              <TableCell
                sx={{ fontWeight: 500, color: v.tintaPrincipal, px: esMovil ? 1 : 2 }}
              >
                {fila.nombre}
              </TableCell>
              <TableCell sx={{ ...numero, fontWeight: 600, px: esMovil ? 1 : 2 }}>
                {fila.movimientos}
              </TableCell>
              <TableCell sx={{ ...numero, px: esMovil ? 1 : 2 }}>
                {fila.unidades}
              </TableCell>
              {!esMovil && (
                <TableCell sx={{ textAlign: "center", color: v.tintaSecundaria }}>
                  {fila.primero} – {fila.ultimo}
                </TableCell>
              )}
              {!esMovil && (
                <TableCell sx={{ ...numero, color: v.tintaSecundaria }}>
                  {fila.por_hora ?? "–"}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Typography sx={{ mt: 1, fontSize: "0.7rem", color: v.tintaSuave }}>
        «Unidades» cuenta chasis distintos: un mismo vehículo movido dos veces
        suma dos movimientos y una unidad.
        {!esMovil &&
          " «Por hora» es el ritmo entre el primer y el último registro del día."}
      </Typography>
    </Box>
  );
}

export default TablaChoferes;
