import { useEffect, useState } from "react";
import { Chip } from "@mui/material";

/**
 * Cuenta atras hasta la siguiente recarga.
 *
 * Es solo visual. Antes este componente tambien disparaba la recarga por su
 * cuenta mientras App.jsx tenia su propio setInterval, asi que cada 10 minutos
 * se pedian los datos dos veces. Ahora el unico temporizador que recarga vive
 * en App.jsx y este se limita a mostrar lo que falta.
 */
function Temporizador({ ultimaCarga, intervaloMs = 600000 }) {
  const [restante, setRestante] = useState(() =>
    Math.max(0, Math.ceil((ultimaCarga + intervaloMs - Date.now()) / 1000))
  );

  useEffect(() => {
    const tic = () =>
      setRestante(
        Math.max(0, Math.ceil((ultimaCarga + intervaloMs - Date.now()) / 1000))
      );

    tic();
    const temporizador = setInterval(tic, 1000);
    return () => clearInterval(temporizador);
  }, [ultimaCarga, intervaloMs]);

  const minutos = Math.floor(restante / 60);
  const segundos = String(restante % 60).padStart(2, "0");

  return (
    <Chip
      size="small"
      variant="outlined"
      label={`${minutos}:${segundos}`}
      title="Tiempo hasta la siguiente actualización automática"
      sx={{ minWidth: 64, fontVariantNumeric: "tabular-nums" }}
    />
  );
}

export default Temporizador;
