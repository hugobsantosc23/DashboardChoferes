import { useState } from "react";
import {
  Box,
  Button,
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

const REGISTRO_INICIAL = 10;

/**
 * Pausas: huecos entre dos movimientos del mismo chofer por encima del
 * umbral. Arriba el resumen por persona, abajo el registro con el detalle
 * de cada hueco.
 *
 * El registro se corta a diez lineas y se despliega: en un mes son cientos,
 * y pintarlas todas de entrada entierra el resumen, que es lo que se mira
 * primero.
 */
function TablaPausas({ pausas, periodo = "dia" }) {
  const theme = useTheme();
  const esMovil = useMediaQuery(theme.breakpoints.down("sm"));
  const v = VIZ[theme.palette.mode];
  const [todas, setTodas] = useState(false);

  const porChofer = pausas?.por_chofer ?? [];
  const registro = pausas?.registro ?? [];

  if (!porChofer.length) {
    return (
      <Typography sx={{ py: 3, textAlign: "center", color: v.tintaSuave }}>
        Nadie estuvo más de {pausas?.umbral_minutos ?? 30} minutos seguidos sin
        mover una unidad.
      </Typography>
    );
  }

  const numero = { textAlign: "right", fontVariantNumeric: "tabular-nums" };
  const visibles = todas ? registro : registro.slice(0, REGISTRO_INICIAL);

  return (
    <Box>
      <Box sx={{ overflowX: "auto", mb: 2 }}>
        <Table size="small" sx={{ minWidth: esMovil ? 0 : 480 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ px: esMovil ? 1 : 2 }}>Chofer</TableCell>
              <TableCell sx={{ ...numero, px: esMovil ? 1 : 2 }}>Pausas</TableCell>
              <TableCell sx={{ ...numero, px: esMovil ? 1 : 2 }}>
                {esMovil ? "Parado" : "Tiempo parado"}
              </TableCell>
              {!esMovil && <TableCell sx={numero}>La más larga</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {porChofer.map((fila) => (
              <TableRow key={fila.usuario} hover>
                <TableCell
                  sx={{ fontWeight: 500, color: v.tintaPrincipal, px: esMovil ? 1 : 2 }}
                >
                  {fila.nombre}
                  {fila.personas > 1 && (
                    <Typography
                      component="span"
                      sx={{ ml: 0.75, fontSize: "0.7rem", color: v.tintaSuave }}
                    >
                      · cuenta de {fila.personas}
                    </Typography>
                  )}
                </TableCell>
                <TableCell sx={{ ...numero, fontWeight: 600, px: esMovil ? 1 : 2 }}>
                  {fila.pausas}
                </TableCell>
                <TableCell sx={{ ...numero, px: esMovil ? 1 : 2 }}>
                  {fila.tiempo}
                </TableCell>
                {!esMovil && (
                  <TableCell sx={{ ...numero, color: v.tintaSecundaria }}>
                    {fila.mas_larga}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

      <Typography
        sx={{ fontWeight: 600, fontSize: "0.8rem", color: v.tintaSecundaria, mb: 0.5 }}
      >
        Registro de pausas
      </Typography>

      <Box sx={{ overflowX: "auto" }}>
        <Table size="small" sx={{ minWidth: esMovil ? 0 : 560 }}>
          <TableHead>
            <TableRow>
              {periodo !== "dia" && <TableCell>Día</TableCell>}
              <TableCell sx={{ px: esMovil ? 1 : 2 }}>Chofer</TableCell>
              <TableCell sx={{ px: esMovil ? 1 : 2 }}>De</TableCell>
              <TableCell sx={{ ...numero, px: esMovil ? 1 : 2 }}>Duración</TableCell>
              {!esMovil && <TableCell>Entre</TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {visibles.map((p, i) => (
              <TableRow key={`${p.usuario}-${p.dia}-${p.desde}-${i}`} hover>
                {periodo !== "dia" && (
                  <TableCell sx={{ whiteSpace: "nowrap", color: v.tintaSecundaria }}>
                    {p.dia}
                  </TableCell>
                )}
                <TableCell sx={{ px: esMovil ? 1 : 2, color: v.tintaPrincipal }}>
                  {p.nombre}
                </TableCell>
                <TableCell
                  sx={{
                    px: esMovil ? 1 : 2,
                    whiteSpace: "nowrap",
                    fontVariantNumeric: "tabular-nums",
                    color: v.tintaSecundaria,
                  }}
                >
                  {p.desde} – {p.hasta}
                </TableCell>
                                <TableCell sx={{ ...numero, fontWeight: 600, px: esMovil ? 1 : 2 }}>
                  {p.duracion}
                  {p.almuerzo_min > 0 && (
                    <Typography
                      sx={{ fontSize: "0.65rem", fontWeight: 400, color: v.tintaSuave }}
                    >
                      −{p.almuerzo_min} min de almuerzo
                    </Typography>
                  )}
                </TableCell>
                {!esMovil && (
                  <TableCell sx={{ color: v.tintaSuave, fontSize: "0.8rem" }}>
                    {p.ultima_ubicacion} → {p.siguiente_ubicacion}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>

      {registro.length > REGISTRO_INICIAL && (
        <Button size="small" onClick={() => setTodas((x) => !x)} sx={{ mt: 1 }}>
          {todas
            ? "Ver solo las 10 más largas"
            : `Ver las ${registro.length} pausas`}
        </Button>
      )}

      <Typography sx={{ mt: 1, fontSize: "0.7rem", color: v.tintaSuave }}>
        Solo se miden huecos dentro de un mismo día, entre un movimiento y el
        siguiente. No se cuenta el tiempo antes del primer movimiento ni
        después del último.
        {pausas?.truncado && " Se muestran las más largas del periodo."}
      </Typography>
    </Box>
  );
}

export default TablaPausas;