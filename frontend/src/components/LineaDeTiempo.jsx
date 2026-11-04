import { Alert, Box, Chip, Typography, useMediaQuery, useTheme } from "@mui/material";

import { VIZ } from "../tema";

const PUNTO = 12;
const CARRIL = 28;

/**
 * Recorrido de una unidad por el almacen, de la primera marca a la ultima.
 *
 * Es una sola serie temporal, asi que los puntos van todos del mismo color:
 * lo que distingue a cada parada es el texto, no el tono. Las dos excepciones
 * son el despacho, que es el final esperado del recorrido y por eso va
 * relleno y mas grande, y las paradas fuera del circuito ("Otro punto"), que
 * van atenuadas para que no compitan con las etapas de verdad.
 */
function LineaDeTiempo({ flujo }) {
  const theme = useTheme();
  const esMovil = useMediaQuery(theme.breakpoints.down("sm"));
  const v = VIZ[theme.palette.mode];

  const pasos = [...(flujo?.pasos ?? [])].reverse();
  if (!pasos.length) return null;

  return (
    <Box>
      {/* Resumen: lo que uno quiere saber antes de leer la linea entera. */}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 2 }}>
        <Dato etiqueta="Paradas" valor={flujo.paradas} v={v} />
        <Dato etiqueta="Marcas" valor={flujo.marcas_totales} v={v} />
                {flujo.revisiones > 0 && (
          <Dato
            etiqueta="Revisiones"
            valor={
              flujo.rechazos > 0
                ? `${flujo.revisiones} · ${flujo.rechazos} rechazo${
                    flujo.rechazos > 1 ? "s" : ""
                  }`
                : flujo.revisiones
            }
            v={v}
          />
        )}
        <Dato etiqueta="En el almacén" valor={flujo.tiempo_en_almacen} v={v} />
        <Dato etiqueta="Ahora en" valor={flujo.ubicacion_actual} v={v} />
      </Box>

      {!flujo.cerrado_en_despacho && (
        <Alert severity="warning" sx={{ mb: 2 }}>
                    Última ubicación en{" "}
          <strong>{flujo.ubicacion_actual}</strong>.
        </Alert>
      )}

      <Box sx={{ position: "relative" }}>
        {/* El carril vertical que une los puntos. Termina en el ultimo punto
            y no en el borde de la caja, para que no quede un rabo suelto. */}
        <Box
          aria-hidden
          sx={{
            position: "absolute",
            left: CARRIL / 2 - 1,
            top: PUNTO,
            bottom: PUNTO,
            width: 2,
            bgcolor: v.cuadricula,
          }}
        />

                {pasos.map((p, i) => {
          const esDespacho = p.etapa === "DESPACHO";
          const esOtro = p.etapa === "OTRO";
          const rechazado = p.resultado?.toUpperCase() === "RECHAZADO";
          return (
            <Box
              key={p.orden}
              // El relleno va por posicion en pantalla, no por el numero de
              // paso: la lista esta invertida y el ultimo de la pantalla es
              // el paso 1.
              sx={{ display: "flex", gap: 1.5, pb: i === pasos.length - 1 ? 0 : 2.5 }}
            >
              <Box sx={{ width: CARRIL, flexShrink: 0, pt: "3px" }}>
                <Box
                  sx={{
                    width: esDespacho ? PUNTO + 4 : PUNTO,
                    height: esDespacho ? PUNTO + 4 : PUNTO,
                    ml: esDespacho ? "-2px" : 0,
                    borderRadius: "50%",
                    bgcolor: esOtro ? v.cuadricula : v.serie,
                    border: esOtro ? `2px solid ${v.tintaSuave}` : "none",
                    boxShadow: p.en_curso ? `0 0 0 4px ${v.serieSuave}55` : "none",
                  }}
                />
              </Box>

              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography
                  sx={{
                    fontWeight: 600,
                    fontSize: "0.9rem",
                    color: esOtro ? v.tintaSecundaria : v.tintaPrincipal,
                  }}
                >
                  {p.titulo}
                                    {p.resultado && (
                    <Typography
                      component="span"
                      sx={{
                        ml: 1,
                        px: 0.75,
                        py: "1px",
                        borderRadius: 0.75,
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        // El rechazo es la unica excepcion al color unico de
                        // la linea: es lo que hace volver atras a la unidad.
                        color: rechazado ? theme.palette.error.main : v.tintaSecundaria,
                        border: `1px solid ${
                          rechazado ? theme.palette.error.main : v.cuadricula
                        }`,
                      }}
                    >
                      {p.resultado}
                    </Typography>
                  )}
                </Typography>

                {p.lugar && (
                  <Typography sx={{ fontSize: "0.8rem", color: v.tintaSecundaria }}>
                    {p.lugar}
                  </Typography>
                )}

                <Box
                  sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 0.75,
                    mt: 0.5,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: "0.75rem",
                      color: v.tintaSuave,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {esMovil ? p.desde.slice(0, 5) + " " + p.desde.slice(-5) : p.desde}
                  </Typography>

                  <Chip
                    size="small"
                    variant="outlined"
                    label={
                      p.en_curso ? `lleva ${p.permanencia}` : `${p.permanencia} aquí`
                    }
                    sx={{ height: 20, fontSize: "0.7rem" }}
                  />

                  {p.marcas > 1 && (
                    <Typography sx={{ fontSize: "0.7rem", color: v.tintaSuave }}>
                      {p.marcas} marcas
                    </Typography>
                  )}
                </Box>

                {p.choferes?.length > 0 && (
                  <Typography sx={{ fontSize: "0.7rem", color: v.tintaSuave, mt: 0.25 }}>
                    {p.choferes.join(", ")}
                  </Typography> 
                )}

                {p.nota && (
                  <Typography sx={{ fontSize: "0.7rem", color: v.tintaSuave, mt: 0.25 }}>
                    {p.nota}
                  </Typography>
                )}

              </Box>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function Dato({ etiqueta, valor, v }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography sx={{ fontSize: "0.7rem", color: v.tintaSuave }}>{etiqueta}</Typography>
      <Typography sx={{ fontSize: "0.85rem", fontWeight: 600, color: v.tintaPrincipal }}>
        {valor}
      </Typography>
    </Box>
  );
}

export default LineaDeTiempo;