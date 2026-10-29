import { Box, Typography, useTheme } from "@mui/material";

import { VIZ } from "../tema";

/**
 * Tooltip comun a todos los graficos.
 *
 * El texto va en tinta, no en el color de la serie; la identidad la lleva el
 * punto de color que va al lado. Los valores siempre estan tambien en el eje
 * o en la tabla, asi que el tooltip aporta, nunca es el unico camino al dato.
 */
function TooltipViz({ active, payload, label, filas }) {
  const theme = useTheme();
  const v = VIZ[theme.palette.mode];

  if (!active || !payload?.length) return null;

  const datos = payload[0].payload;
  const lineas = filas ? filas(datos) : [{ texto: `${payload[0].value}` }];

  return (
    <Box
      sx={{
        bgcolor: v.superficie,
        border: `1px solid ${v.borde}`,
        borderRadius: 1.5,
        px: 1.5,
        py: 1,
        boxShadow: "0 4px 12px rgba(0,0,0,0.12)",
      }}
    >
      <Typography sx={{ fontSize: "0.75rem", fontWeight: 600, color: v.tintaPrincipal }}>
        {label}
      </Typography>
      {lineas.map((linea, i) => (
        <Box key={i} sx={{ display: "flex", alignItems: "center", gap: 0.75, mt: 0.25 }}>
          {i === 0 && (
            <Box
              sx={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                bgcolor: v.serie,
                flexShrink: 0,
              }}
            />
          )}
          <Typography
            sx={{
              fontSize: "0.75rem",
              color: i === 0 ? v.tintaPrincipal : v.tintaSecundaria,
              pl: i === 0 ? 0 : "15px",
            }}
          >
            {linea.texto}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

export default TooltipViz;
