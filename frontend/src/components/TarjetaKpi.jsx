import { Box, Card, CardContent, Typography, useTheme } from "@mui/material";

import { VIZ } from "../tema";

/**
 * Tarjeta de indicador.
 *
 * `destacado` marca la cifra principal del tablero (una sola por vista). Las
 * cifras usan los numeros proporcionales de la fuente, no tabulares: a tamano
 * grande los tabulares dejan huecos raros entre digitos.
 */
function TarjetaKpi({ etiqueta, valor, sufijo, variacion, nota, destacado = false }) {
  const theme = useTheme();
  const v = VIZ[theme.palette.mode];

  const tieneVariacion = typeof variacion === "number" && Number.isFinite(variacion);
  const subio = tieneVariacion && variacion >= 0;

  return (
    <Card sx={{ height: "100%" }}>
      <CardContent
        sx={{
          py: destacado ? 2.5 : 2,
          px: destacado ? 3 : 2,
          "&:last-child": { pb: destacado ? 2.5 : 2 },
        }}
      >
        <Typography
          sx={{
            color: v.tintaSecundaria,
            fontSize: destacado ? "0.875rem" : "0.75rem",
            lineHeight: 1.3,
          }}
        >
          {etiqueta}
        </Typography>

        <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75, mt: 0.5 }}>
          <Typography
            component="span"
            sx={{
              color: v.tintaPrincipal,
              fontWeight: 600,
              lineHeight: 1.05,
              fontSize: destacado
                ? { xs: "3rem", sm: "3.25rem" }
                : { xs: "1.5rem", sm: "1.75rem" },
            }}
          >
            {valor}
          </Typography>
          {sufijo && (
            <Typography component="span" sx={{ color: v.tintaSuave, fontSize: "0.8rem" }}>
              {sufijo}
            </Typography>
          )}
        </Box>

        {tieneVariacion && (
          <Typography
            sx={{
              mt: 0.5,
              fontSize: "0.75rem",
              fontWeight: 500,
              color: subio ? v.bueno : v.malo,
            }}
          >
            {subio ? "▲" : "▼"} {Math.abs(variacion)}% {nota}
          </Typography>
        )}

        {!tieneVariacion && nota && (
          <Typography sx={{ mt: 0.5, fontSize: "0.75rem", color: v.tintaSuave }}>
            {nota}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export default TarjetaKpi;
