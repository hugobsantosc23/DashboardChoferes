import { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";

import { ENDPOINTS, api, mensajeDeError } from "../api";
import { VIZ } from "../tema";

function Busqueda() {
  const theme = useTheme();
  const esMovil = useMediaQuery(theme.breakpoints.down("sm"));
  const v = VIZ[theme.palette.mode];

  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const [historial, setHistorial] = useState(null);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);

  const buscar = async () => {
    const aguja = texto.trim();
    if (aguja.length < 3) {
      setError("Escribe al menos 3 caracteres del chasis.");
      return;
    }

    setCargando(true);
    setError(null);
    try {
      // params en lugar de interpolar la cadena: axios se encarga de escapar
      // los caracteres especiales del chasis.
      const { data } = await api.get(ENDPOINTS.buscar, { params: { texto: aguja } });
      setResultados(data);
    } catch (e) {
      setError(mensajeDeError(e));
      setResultados(null);
    } finally {
      setCargando(false);
    }
  };

  const verHistorial = async (chasis) => {
    setCargandoHistorial(true);
    setHistorial({ chasis, movimientos: [] });
    try {
      const { data } = await api.get(ENDPOINTS.historial(chasis));
      setHistorial(data);
    } catch (e) {
      setError(mensajeDeError(e));
      setHistorial(null);
    } finally {
      setCargandoHistorial(false);
    }
  };

  const columnas = esMovil
    ? ["Chasis", "Chofer", "Ubicación", "Fecha"]
    : ["Chasis", "Chofer", "Ubicación", "Isla", "Marca", "Estado", "Fecha"];

  return (
    <>
      <Card>
        <CardContent>
          <Typography variant="h5" sx={{ mb: 0.5 }}>
            Buscar unidad
          </Typography>
          <Typography sx={{ color: v.tintaSecundaria, fontSize: "0.8rem", mb: 2 }}>
            Escribe el chasis completo o una parte. Se muestra el último
            movimiento de cada unidad; toca una fila para ver su historial.
          </Typography>

          <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
            <TextField
              fullWidth
              size="small"
              label="Chasis o parte del chasis"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && buscar()}
            />
            <Button
              variant="contained"
              onClick={buscar}
              disabled={cargando || texto.trim().length < 3}
              startIcon={cargando ? null : <SearchIcon />}
              sx={{ minWidth: 112, flexShrink: 0 }}
            >
              {cargando ? <CircularProgress size={20} color="inherit" /> : "Buscar"}
            </Button>
          </Box>

          {error && (
            <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {resultados && resultados.total === 0 && (
            <Typography sx={{ py: 3, textAlign: "center", color: v.tintaSuave }}>
              No se encontró ninguna unidad con «{texto.trim()}»
            </Typography>
          )}

          {resultados && resultados.total > 0 && (
            <>
              <Typography sx={{ mb: 1, fontSize: "0.8rem", color: v.tintaSecundaria }}>
                {resultados.total} {resultados.total === 1 ? "unidad" : "unidades"}
                {resultados.truncado &&
                  ` · mostrando las ${resultados.resultados.length} más recientes`}
              </Typography>

              <Box sx={{ overflowX: "auto" }}>
                <Table size="small" sx={{ minWidth: esMovil ? 480 : 720 }}>
                  <TableHead>
                    <TableRow>
                      {columnas.map((c) => (
                        <TableCell key={c}>{c}</TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {resultados.resultados.map((u) => (
                      <TableRow
                        key={u.chasis}
                        hover
                        onClick={() => verHistorial(u.chasis)}
                        sx={{ cursor: "pointer" }}
                      >
                        <TableCell sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                          {u.chasis}
                        </TableCell>
                        <TableCell>{u.chofer}</TableCell>
                        <TableCell>
                          <Chip label={u.ubicacion} size="small" variant="outlined" />
                        </TableCell>
                        {!esMovil && <TableCell>{u.isla}</TableCell>}
                        {!esMovil && <TableCell>{u.marca}</TableCell>}
                        {!esMovil && (
                          <TableCell sx={{ color: v.tintaSecundaria }}>
                            {u.estado}
                          </TableCell>
                        )}
                        <TableCell sx={{ whiteSpace: "nowrap", color: v.tintaSecundaria }}>
                          {u.fecha}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(historial)}
        onClose={() => setHistorial(null)}
        fullWidth
        maxWidth="sm"
        fullScreen={esMovil}
      >
        <DialogTitle sx={{ pr: 6 }}>
          <Typography component="span" sx={{ fontWeight: 600 }}>
            {historial?.chasis}
          </Typography>
          {historial?.total_movimientos != null && (
            <Typography sx={{ fontSize: "0.8rem", color: v.tintaSecundaria }}>
              {historial.total_movimientos} movimientos
              {historial.marca && historial.marca !== "-" && ` · ${historial.marca}`}
              {historial.cliente && historial.cliente !== "-" && ` · ${historial.cliente}`}
            </Typography>
          )}
          <IconButton
            onClick={() => setHistorial(null)}
            sx={{ position: "absolute", right: 8, top: 8 }}
            aria-label="Cerrar"
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {cargandoHistorial ? (
            <Box sx={{ py: 4, textAlign: "center" }}>
              <CircularProgress size={28} />
            </Box>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Fecha</TableCell>
                  <TableCell>Chofer</TableCell>
                  <TableCell>Ubicación</TableCell>
                  <TableCell>Isla</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(historial?.movimientos || []).map((m, i) => (
                  <TableRow key={`${m.fecha}-${i}`}>
                    <TableCell sx={{ whiteSpace: "nowrap" }}>{m.fecha}</TableCell>
                    <TableCell>{m.chofer}</TableCell>
                    <TableCell>{m.ubicacion}</TableCell>
                    <TableCell sx={{ color: v.tintaSecundaria }}>{m.isla}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export default Busqueda;
