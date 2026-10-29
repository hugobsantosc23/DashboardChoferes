import { createTheme } from "@mui/material/styles";

/**
 * Paleta de los graficos.
 *
 * Un solo tono azul para las barras y las lineas, porque todos los graficos
 * muestran una sola serie (magnitud), no categorias que haya que distinguir
 * por color. Los pasos de modo oscuro no son el mismo hex aclarado: son el
 * paso de la misma rampa elegido para el fondo oscuro.
 *
 * Verde y rojo estan reservados para estado (subio / bajo) y nunca se usan
 * como color de serie.
 */
export const VIZ = {
  light: {
    superficie: "#fcfcfb",
    plano: "#f9f9f7",
    tintaPrincipal: "#0b0b0b",
    tintaSecundaria: "#52514e",
    tintaSuave: "#898781",
    cuadricula: "#e1e0d9",
    eje: "#c3c2b7",
    borde: "rgba(11, 11, 11, 0.10)",
    serie: "#2a78d6",
    // Paso de la misma rampa para las barras sin enfasis. No mas claro que
    // este: por debajo deja de distinguirse del fondo.
    serieSuave: "#86b6ef",
    bueno: "#006300",
    malo: "#d03b3b",
  },
  dark: {
    superficie: "#1a1a19",
    plano: "#0d0d0d",
    tintaPrincipal: "#f0efec",
    tintaSecundaria: "#c3c2b7",
    tintaSuave: "#898781",
    cuadricula: "#2c2c2a",
    eje: "#383835",
    borde: "rgba(255, 255, 255, 0.10)",
    serie: "#3987e5",
    serieSuave: "#184f95",
    bueno: "#0ca30c",
    malo: "#e66767",
  },
};

const FUENTE = ['system-ui', '-apple-system', '"Segoe UI"', "Roboto", "sans-serif"].join(",");

export function crearTema(modo) {
  const v = VIZ[modo];

  return createTheme({
    palette: {
      mode: modo,
      primary: { main: v.serie },
      success: { main: v.bueno },
      error: { main: v.malo },
      background: { default: v.plano, paper: v.superficie },
      text: { primary: v.tintaPrincipal, secondary: v.tintaSecundaria },
      divider: v.borde,
    },
    typography: {
      fontFamily: FUENTE,
      h1: { fontWeight: 600 },
      h2: { fontWeight: 600 },
      h3: { fontWeight: 600 },
      h4: { fontWeight: 600, fontSize: "1.5rem" },
      h5: { fontWeight: 600, fontSize: "1.125rem" },
      h6: { fontWeight: 600, fontSize: "1rem" },
      button: { textTransform: "none", fontWeight: 500 },
    },
    shape: { borderRadius: 10 },
    components: {
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            border: `1px solid ${v.borde}`,
            backgroundImage: "none",
          },
        },
      },
      MuiTableCell: {
        styleOverrides: {
          root: { borderColor: v.borde },
          head: { fontWeight: 600, color: v.tintaSecundaria },
        },
      },
      MuiChip: {
        styleOverrides: { root: { fontWeight: 500 } },
      },
    },
  });
}
