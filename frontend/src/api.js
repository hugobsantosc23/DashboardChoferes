import axios from "axios";

/**
 * El frontend siempre llama a rutas relativas (/api/...).
 *   - En produccion las resuelve el rewrite de vercel.json hacia el servicio
 *     "backend", que recibe la ruta completa incluyendo /api.
 *   - En desarrollo las resuelve el proxy de vite.config.js hacia el puerto 8000.
 *
 * VITE_API_URL solo hace falta si el backend vive en otro dominio.
 */
const baseURL = import.meta.env.VITE_API_URL ?? "";

export const api = axios.create({
  baseURL,
  timeout: 25000,
});

/** Convierte un error de axios en un mensaje que se le pueda mostrar al usuario. */
export function mensajeDeError(error) {
  if (error?.code === "ECONNABORTED") {
    return "El servidor tardo demasiado en responder. Reintenta en un momento.";
  }
  const estado = error?.response?.status;
  if (estado === 503) {
    return "No se pudo leer la hoja de Google. Revisa que siga compartida.";
  }
  if (estado === 404) {
    return "No se encontro lo que buscabas.";
  }
  if (estado >= 500) {
    return "El servidor devolvio un error. Intenta de nuevo.";
  }
  if (error?.response?.data?.detail) {
    return String(error.response.data.detail);
  }
  return "No se pudo conectar con el servidor.";
}

export const ENDPOINTS = {
  resumen: "/api/resumen",
  tendencia: "/api/tendencia",
  buscar: "/api/unidades/buscar",
  historial: (chasis) => `/api/unidades/${encodeURIComponent(chasis)}/historial`,
  exportar: "/api/exportar",
  health: "/api/health",
};
