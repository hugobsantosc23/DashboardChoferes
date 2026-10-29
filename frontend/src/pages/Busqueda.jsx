import { useState } from "react";
import axios from "axios";
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Chip
} from "@mui/material";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

function Busqueda() {
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState([]);
  const [cargando, setCargando] = useState(false);

  const buscarUnidades = async () => {
    if (!busqueda.trim()) return;
    
    setCargando(true);
    try {
      const response = await axios.get(`${API_URL}/api/unidades/buscar?texto=${busqueda}`);
      setResultados(response.data.resultados || []);
    } catch (error) {
      console.error("Error buscando unidades:", error);
    } finally {
      setCargando(false);
    }
  };

  return (
    <Box sx={{ mt: 3 }}>
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            🔍 Buscar Unidades
          </Typography>
          
          <Box sx={{ display: "flex", gap: 2, mb: 3, flexWrap: "wrap" }}>
            <TextField
              label="Ingrese chasis o parte del chasis"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              fullWidth
              size="small"
              onKeyDown={(e) => e.key === "Enter" && buscarUnidades()}
            />
            <Button 
              variant="contained" 
              onClick={buscarUnidades}
              disabled={cargando || !busqueda.trim()}
              sx={{ minWidth: 120 }}
            >
              {cargando ? <CircularProgress size={24} /> : "🔍 Buscar"}
            </Button>
          </Box>

          {resultados.length > 0 ? (
            <TableContainer component={Paper} sx={{ maxHeight: 400 }}>
              <Table stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Chasis</strong></TableCell>
                    <TableCell><strong>Chofer</strong></TableCell>
                    <TableCell><strong>Origen</strong></TableCell>
                    <TableCell><strong>Destino</strong></TableCell>
                    <TableCell><strong>Fecha</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {resultados.map((unidad, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Chip 
                          label={unidad.chasis}
                          color="primary"
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>{unidad.chofer}</TableCell>
                      <TableCell>
                        <Chip 
                          label={unidad.origen}
                          color="info"
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip 
                          label={unidad.destino}
                          color="success"
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>{unidad.fecha}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : busqueda && !cargando ? (
            <Typography align="center" color="textSecondary">
              No se encontraron unidades con "{busqueda}"
            </Typography>
          ) : null}
        </CardContent>
      </Card>
    </Box>
  );
}

export default Busqueda;