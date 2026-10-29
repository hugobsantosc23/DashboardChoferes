# Script de extracción (Google Apps Script)

Este script lee los movimientos de vehículos desde la API de VARI y los va
guardando en la pestaña `Movimientos` de tu hoja de Google, que es la base de
datos del dashboard.

## Qué cambió respecto a tu versión anterior

| Antes | Ahora |
|---|---|
| Usuario y contraseña escritos en el código | En Script Properties, fuera del código |
| ID único `VIN + Fecha` que **nunca coincidía** → duplicados acumulándose | `fechaClave()` normaliza la fecha venga de la API o de la hoja |
| Reescribía las 40.000 filas en cada corrida (riesgo de timeout a los 6 min) | Solo agrega las filas nuevas al final |
| Revisaba 2.500 registros a ciegas cada 30 min | Para en cuanto 3 páginas seguidas no traen novedades (2-3 peticiones) |
| Leía las 10 columnas de toda la hoja para armar los IDs | Lee solo las columnas A y J |
| Dos corridas podían solaparse | `LockService` lo impide |

### Por qué había duplicados

La API devuelve la fecha como texto: `2026-10-27T10:30:00`.
Google Sheets, si la columna no es de tipo texto, la guarda como objeto `Date`
y al leerla devuelve `Mon Oct 27 2026 10:30:00 GMT-0500 (hora estándar de Perú)`.

El script comparaba esas dos cadenas tal cual, nunca coincidían, y por eso cada
corrida volvía a insertar movimientos que ya estaban. Ahora los dos valores
pasan por `fechaClave()`, que siempre devuelve `yyyy-MM-ddTHH:mm:ss`, y el paso
2 de la instalación fuerza la columna Fecha a texto para que Sheets no la
convierta de nuevo.

---

## Instalación

### 1. Abre el editor

En tu hoja de Google: **Extensiones → Apps Script**. Borra todo lo que haya y
pega el contenido completo de `Codigo.gs`. Guarda con Ctrl+S.

### 2. Guarda las credenciales (una vez)

En el editor, busca la función `guardarCredenciales()` y pon tu usuario y tu
contraseña nueva en las dos variables de arriba. Selecciona
`guardarCredenciales` en el desplegable y pulsa **Ejecutar**.

La primera vez Google te va a pedir autorización: **Revisar permisos → elige tu
cuenta → Avanzado → Ir a (nombre del proyecto)**.

Cuando termine, **vuelve a dejar la contraseña en blanco en la función y
guarda**. Ya quedó almacenada en las propiedades del script.

Para comprobar que el login funciona, ejecuta `probarLogin()`.

### 3. Prepara la hoja (una vez)

Ejecuta `prepararHoja()`. Esto crea la pestaña `Movimientos` si no existe,
pone los encabezados y **fuerza la columna Fecha a texto plano**. Este paso es
el que evita que vuelvan los duplicados, no lo saltes.

### 4. Limpia los duplicados que ya tienes

Ejecuta `limpiarDuplicados()`. Te dice en el registro cuántos encontró y los
elimina, además de normalizar el formato de todas las fechas que ya estaban.

Si prefieres empezar de cero: ejecuta `limpiarDatos()` y luego
`ejecutarManual()`, que hará la carga histórica completa otra vez. Tarda varios
minutos; si se corta por el límite de 6 minutos de Apps Script, vuelve a
ejecutarla: sigue desde donde quedó.

### 5. Prueba una corrida

Ejecuta `ejecutarManual()` y revisa el registro de ejecución. Deberías ver algo así:

```
Login correcto.
Registros actuales en la hoja: 38412
IDs ya registrados en la hoja: 38412
Pagina 1: 100 revisados, 43 del almacen, 12 nuevos (acumulado 12).
Pagina 2: 100 revisados, 38 del almacen, 0 nuevos (acumulado 12).
Pagina 3: 100 revisados, 41 del almacen, 0 nuevos (acumulado 12).
Pagina 4: 100 revisados, 39 del almacen, 0 nuevos (acumulado 12).
3 paginas seguidas sin novedades: la hoja ya esta al dia.
Resumen: 400 registros revisados, 161 del almacen, 12 nuevos, 18 descartados por no tener usuario.
Listo: 12 filas nuevas en 7s.
```

Cuatro peticiones en vez de veinticinco. Eso es la parada temprana.

### 6. Programa la ejecución automática

Ejecuta `configurarTrigger()`. Queda corriendo cada 30 minutos, y el propio
script se salta las corridas fuera del horario de 6:00 a 23:00.

---

## Funciones disponibles

| Función | Para qué |
|---|---|
| `extraerYActualizar()` | La que corre sola cada 30 min |
| `ejecutarManual()` | Forzar una corrida ahora |
| `probarLogin()` | Verificar usuario y contraseña |
| `verTotalRegistros()` | Cuántos movimientos hay en la hoja |
| `verUsuariosActivos()` | Qué usuarios aparecen y cuántos movimientos tiene cada uno |
| `limpiarDuplicados()` | Quitar duplicados y normalizar fechas |
| `limpiarDatos()` | Borrar todos los movimientos (deja los encabezados) |
| `prepararHoja()` | Recrear encabezados y formato de la columna Fecha |
| `guardarCredenciales()` | Guardar usuario y contraseña |
| `configurarTrigger()` | Programar la ejecución cada 30 min |

---

## Ajustes que puedes querer cambiar

Están todos juntos al principio de `Codigo.gs`:

```js
const ALMACEN_FILTRO = 'VARI BIRRAK';   // almacén a extraer
const REGISTROS_DESEADOS = 500;         // tope de filas nuevas por corrida
const EXTRACCION_CONTINUA = 3000;       // tope de registros a revisar por corrida
const PAGINAS_SIN_NUEVOS_MAX = 3;       // páginas sin novedades antes de parar
const HORA_INICIO = 6;                  // empieza a las 06:00
const HORA_FIN = 23;                     // para a las 23:00
```

Si subes `PAGINAS_SIN_NUEVOS_MAX`, el script es más cuidadoso pero hace más
peticiones. Con 3 va bien si la API devuelve los movimientos del más reciente
al más antiguo, que es lo normal.

## Si algo falla

**«Faltan credenciales»** → ejecuta `guardarCredenciales()`.

**«Login fallido: HTTP 401»** → la contraseña cambió. Vuelve a ejecutar
`guardarCredenciales()` con la nueva.

**«Hay otra ejecución en curso»** → normal durante la carga histórica. La
siguiente corrida lo retoma.

**Se corta a los 6 minutos** → es el límite de Apps Script y solo pasa en la
carga histórica. Vuelve a ejecutar `ejecutarManual()`; continúa donde quedó
porque los IDs ya guardados no se vuelven a descargar.

**Vuelven a aparecer duplicados** → la columna Fecha dejó de ser texto (suele
pasar si alguien pega datos a mano o reordena la hoja). Ejecuta
`prepararHoja()` y después `limpiarDuplicados()`.
