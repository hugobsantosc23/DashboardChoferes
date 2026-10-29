import { useEffect, useState } from "react";
import { Chip } from "@mui/material";

function Temporizador({ onActualizar }) {
  const [tiempoRestante, setTiempoRestante] = useState(600);

  const formatearTiempo = (segundos) => {
    const mins = Math.floor(segundos / 60);
    const segs = segundos % 60;
    return `${mins}:${segs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const calcularTiempoRestante = () => {
      let ultimaActualizacion = localStorage.getItem("ultimaActualizacion");
      
      if (!ultimaActualizacion) {
        ultimaActualizacion = Date.now().toString();
        localStorage.setItem("ultimaActualizacion", ultimaActualizacion);
      }

      const ahora = Date.now();
      const ultima = parseInt(ultimaActualizacion, 10);
      const tiempoTranscurrido = (ahora - ultima) / 1000;
      const restante = Math.max(0, 600 - tiempoTranscurrido);
      
      setTiempoRestante(Math.floor(restante));

      if (restante <= 0 && onActualizar) {
        onActualizar();
        const nuevoTimestamp = Date.now();
        localStorage.setItem("ultimaActualizacion", nuevoTimestamp.toString());
        setTiempoRestante(600);
      }
    };

    calcularTiempoRestante();
    const timer = setInterval(calcularTiempoRestante, 1000);

    return () => clearInterval(timer);
  }, [onActualizar]);

  return (
    <Chip 
      label={`⏱️ ${formatearTiempo(tiempoRestante)}`}
      color="info"
      size="small"
      variant="outlined"
      sx={{ minWidth: 70 }}
    />
  );
}

export default Temporizador;