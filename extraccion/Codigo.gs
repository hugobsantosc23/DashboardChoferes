/**
 * EXTRACCION DE MOVIMIENTOS DE VEHICULOS -> GOOGLE SHEETS
 *
 * Pega este archivo completo en el editor de Apps Script de tu hoja
 * (Extensiones > Apps Script) y sigue INSTALACION.md.
 *
 * Cambios frente a la version anterior:
 *   1. Las credenciales salen del codigo y van a Script Properties.
 *   2. El ID unico (VIN + Fecha) se normaliza con fechaClave(), asi coincide
 *      venga de la API o de la hoja. Antes nunca coincidia y se acumulaban
 *      duplicados en cada ejecucion.
 *   3. La hoja ya no se reescribe entera: solo se agregan las filas nuevas.
 *   4. Parada temprana: deja de paginar cuando ya esta al dia, en vez de
 *      revisar 2500 registros a ciegas cada media hora.
 *   5. LockService para que dos ejecuciones no se pisen.
 */

// ============================================
// CONFIGURACION
// ============================================

const SPREADSHEET_ID = '1ES8FRNk3RvazGiYtM2buX4F-HNMFwERHZrbr6buHrxk';

const LOGIN_URL = 'https://varisystem2.grupovari.com/api/account/login';
const API_URL   = 'https://varisystem2.grupovari.com/api/movimientovehiculo';

const HOJA_MOVIMIENTOS = 'Movimientos';
const TIMEZONE = 'America/Lima';

const ALMACEN_FILTRO = 'VARI BIRRAK';
const PAGE_SIZE = 100;

const EXTRACCION_INICIAL = 40000;  // primera corrida: carga historica
const REGISTROS_DESEADOS = 500;    // tope de filas nuevas por corrida normal
const EXTRACCION_CONTINUA = 3000;  // tope de registros a revisar por corrida
const MAX_PAGINAS = 600;
const PAGINAS_SIN_NUEVOS_MAX = 3;  // parada temprana

const HORA_INICIO = 6;   // 06:00
const HORA_FIN = 23;     // 23:00 (no inclusive)

const COLUMNAS = [
  'VIN', 'Marca', 'Tipo Vehiculo', 'Cliente', 'Almacen',
  'Isla', 'Ubicación', 'Estado', 'Usuario', 'Fecha'
];
const COL_VIN = 1;
const COL_FECHA = 10;

// ============================================
// INSTALACION (ejecutar una vez cada una)
// ============================================

/**
 * PASO 1. Guarda el usuario y la contrasena fuera del codigo.
 * Pon aqui tus datos, ejecuta la funcion UNA VEZ, y despues vuelve a dejar
 * los valores en blanco y guarda. Las credenciales quedan en las propiedades
 * del script, no en el archivo.
 */
function guardarCredenciales() {
  var usuario = 'HSANTOSV';
  var contrasena = 'PON_AQUI_TU_CONTRASENA';

  if (!usuario || contrasena.indexOf('PON_AQUI') === 0) {
    throw new Error('Edita la funcion y pon tus credenciales antes de ejecutarla.');
  }

  PropertiesService.getScriptProperties().setProperties({
    'VARI_USUARIO': usuario,
    'VARI_PASSWORD': contrasena
  });
  console.log('Credenciales guardadas. Ahora borra los valores de esta funcion.');
}

/**
 * PASO 2. Prepara la hoja.
 *
 * Fuerza la columna Fecha a TEXTO. Esto es lo que arregla el bug de los
 * duplicados: si Sheets guarda la fecha como objeto Date, al leerla devuelve
 * "Mon Oct 27 2026 10:30:00 GMT-0500" mientras la API devuelve
 * "2026-10-27T10:30:00". Nunca coinciden y cada corrida vuelve a insertar
 * los mismos movimientos.
 */
function prepararHoja() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(HOJA_MOVIMIENTOS);

  if (!sheet) {
    sheet = ss.insertSheet(HOJA_MOVIMIENTOS);
    console.log('Pestana "' + HOJA_MOVIMIENTOS + '" creada.');
  }

  sheet.getRange(1, COL_FECHA, sheet.getMaxRows(), 1).setNumberFormat('@');

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNAS);
    sheet.setFrozenRows(1);
  }

  console.log('Hoja lista. Columna Fecha forzada a texto plano.');
}

/**
 * PASO 3. Programa la ejecucion automatica cada 30 minutos.
 */
function configurarTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'extraerYActualizar') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  ScriptApp.newTrigger('extraerYActualizar')
    .timeBased()
    .everyMinutes(30)
    .create();

  console.log('Trigger configurado: cada 30 minutos, de ' +
              HORA_INICIO + ':00 a ' + HORA_FIN + ':00.');
}

// ============================================
// FUNCION PRINCIPAL
// ============================================

function extraerYActualizar() {
  var hora = parseInt(Utilities.formatDate(new Date(), TIMEZONE, 'H'), 10);
  if (hora < HORA_INICIO || hora >= HORA_FIN) {
    console.log('Fuera de horario laboral (son las ' + hora + ':00). Se omite.');
    return;
  }

  // Si una corrida se alarga, la siguiente no debe empezar encima.
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    console.log('Hay otra ejecucion en curso. Se omite.');
    return;
  }

  var inicio = new Date();

  try {
    var token = login();
    if (!token) return;

    var existentes = contarRegistrosEnSheet();
    console.log('Registros actuales en la hoja: ' + existentes);

    var datos;
    if (existentes === 0) {
      console.log('Primera corrida: carga historica de hasta ' +
                  EXTRACCION_INICIAL + ' registros.');
      datos = obtenerMovimientos(token, EXTRACCION_INICIAL, EXTRACCION_INICIAL);
    } else {
      datos = obtenerMovimientos(token, REGISTROS_DESEADOS, EXTRACCION_CONTINUA);
    }

    if (datos.length === 0) {
      console.log('Sin movimientos nuevos. Nada que guardar.');
      return;
    }

    var guardadas = guardarEnSheet(datos);
    var segundos = Math.round((new Date() - inicio) / 1000);
    console.log('Listo: ' + guardadas + ' filas nuevas en ' + segundos + 's.');

  } catch (error) {
    console.log('ERROR: ' + error + (error.stack ? '\n' + error.stack : ''));
  } finally {
    lock.releaseLock();
  }
}

// ============================================
// LOGIN
// ============================================

function login() {
  try {
    var props = PropertiesService.getScriptProperties();
    var usuario = props.getProperty('VARI_USUARIO');
    var contrasena = props.getProperty('VARI_PASSWORD');

    if (!usuario || !contrasena) {
      console.log('Faltan credenciales. Ejecuta guardarCredenciales() primero.');
      return null;
    }

    var respuesta = UrlFetchApp.fetch(LOGIN_URL, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ username: usuario, password: contrasena }),
      muteHttpExceptions: true
    });

    if (respuesta.getResponseCode() !== 200) {
      console.log('Login fallido: HTTP ' + respuesta.getResponseCode());
      return null;
    }

    var data = JSON.parse(respuesta.getContentText());
    if (data.success && data.token) {
      console.log('Login correcto.');
      return data.token;
    }

    console.log('Login rechazado por el sistema.');
    return null;

  } catch (error) {
    console.log('Error en login: ' + error);
    return null;
  }
}

// ============================================
// NORMALIZACION DE FECHA  (el arreglo clave)
// ============================================

/**
 * Devuelve siempre "yyyy-MM-ddTHH:mm:ss", sin importar si el valor viene de
 * la API (texto ISO) o de la hoja (que puede devolver un objeto Date).
 * Es lo que hace que el ID unico VIN|Fecha sea comparable entre corridas.
 */
function fechaClave(valor) {
  if (valor instanceof Date) {
    return Utilities.formatDate(valor, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
  }

  var texto = String(valor == null ? '' : valor).trim();
  if (!texto) return '';

  var iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (iso) {
    return iso[1] + '-' + iso[2] + '-' + iso[3] + 'T' +
           iso[4] + ':' + iso[5] + ':' + (iso[6] || '00');
  }

  var dmy = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (dmy) {
    return dmy[3] + '-' + pad2(dmy[2]) + '-' + pad2(dmy[1]) + 'T' +
           pad2(dmy[4]) + ':' + dmy[5] + ':' + (dmy[6] || '00');
  }

  var d = new Date(texto);
  if (!isNaN(d.getTime())) {
    return Utilities.formatDate(d, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss");
  }

  return texto;
}

function pad2(valor) {
  var s = String(valor);
  return s.length < 2 ? '0' + s : s;
}

function idUnico(vin, fecha) {
  return String(vin == null ? '' : vin).trim() + '|' + fechaClave(fecha);
}

// ============================================
// DESCARGA DESDE LA API
// ============================================

/**
 * Pagina la API y devuelve solo los movimientos nuevos del almacen.
 *
 * La mejora importante es la parada temprana: en cuanto encuentra
 * PAGINAS_SIN_NUEVOS_MAX paginas seguidas donde todo lo del almacen ya estaba
 * en la hoja, asume que esta al dia y corta. En una corrida normal eso son
 * 2 o 3 peticiones en vez de 25.
 */
function obtenerMovimientos(token, limiteDeseado, limiteRevisar) {
  var headers = {
    'Authorization': 'Bearer ' + token,
    'Accept': 'application/json'
  };
  var almacen = ALMACEN_FILTRO.toUpperCase().trim();

  var idsExistentes = obtenerIdsExistentes();
  console.log('IDs ya registrados en la hoja: ' + idsExistentes.size);

  var nuevos = [];
  var pagina = 1;
  var paginasSinNuevos = 0;
  var totalRevisados = 0;
  var totalSinUsuario = 0;
  var totalDelAlmacen = 0;

  while (nuevos.length < limiteDeseado &&
         pagina <= MAX_PAGINAS &&
         totalRevisados < limiteRevisar) {

    var url = API_URL + '?pageSize=' + PAGE_SIZE + '&pageNumber=' + pagina;
    var respuesta = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: headers,
      muteHttpExceptions: true
    });

    var codigo = respuesta.getResponseCode();
    if (codigo === 401) {
      console.log('El token expiro en la pagina ' + pagina + '.');
      break;
    }
    if (codigo !== 200) {
      console.log('HTTP ' + codigo + ' en la pagina ' + pagina + '. Se corta.');
      break;
    }

    var data = JSON.parse(respuesta.getContentText());
    var items = Array.isArray(data) ? data : (data.items || []);

    if (items.length === 0) {
      console.log('La pagina ' + pagina + ' vino vacia. Fin de los datos.');
      break;
    }

    totalRevisados += items.length;

    var delAlmacen = 0;
    var nuevosEnPagina = 0;

    for (var i = 0; i < items.length; i++) {
      var item = items[i];

      if (String(item.almacen || '').toUpperCase().trim() !== almacen) continue;

      if (!String(item.usuario || '').trim()) {
        totalSinUsuario++;
        continue;
      }

      delAlmacen++;

      var id = idUnico(item.vin, item.fecha);
      if (idsExistentes.has(id)) continue;

      idsExistentes.add(id);
      nuevos.push(item);
      nuevosEnPagina++;

      if (nuevos.length >= limiteDeseado) break;
    }

    totalDelAlmacen += delAlmacen;

    console.log('Pagina ' + pagina + ': ' + items.length + ' revisados, ' +
                delAlmacen + ' del almacen, ' + nuevosEnPagina +
                ' nuevos (acumulado ' + nuevos.length + ').');

    // --- PARADA TEMPRANA ---
    if (nuevosEnPagina > 0) {
      paginasSinNuevos = 0;
    } else if (delAlmacen > 0) {
      paginasSinNuevos++;
      if (paginasSinNuevos >= PAGINAS_SIN_NUEVOS_MAX) {
        console.log(PAGINAS_SIN_NUEVOS_MAX + ' paginas seguidas sin novedades: ' +
                    'la hoja ya esta al dia.');
        break;
      }
    }

    if (nuevos.length >= limiteDeseado) break;

    pagina++;
    Utilities.sleep(300 + Math.random() * 500);
  }

  console.log('Resumen: ' + totalRevisados + ' registros revisados, ' +
              totalDelAlmacen + ' del almacen, ' + nuevos.length + ' nuevos, ' +
              totalSinUsuario + ' descartados por no tener usuario.');

  return nuevos;
}

// ============================================
// LECTURA DE LA HOJA
// ============================================

/**
 * Lee solo las columnas VIN y Fecha (A y J) en vez de la hoja entera.
 * Con 40.000 filas la diferencia es de segundos a decimas.
 */
function obtenerIdsExistentes() {
  var ids = new Set();

  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID)
                              .getSheetByName(HOJA_MOVIMIENTOS);
    if (!sheet) return ids;

    var ultima = sheet.getLastRow();
    if (ultima < 2) return ids;

    var vins = sheet.getRange(2, COL_VIN, ultima - 1, 1).getValues();
    var fechas = sheet.getRange(2, COL_FECHA, ultima - 1, 1).getValues();

    for (var i = 0; i < vins.length; i++) {
      var vin = String(vins[i][0] == null ? '' : vins[i][0]).trim();
      if (!vin) continue;
      ids.add(idUnico(vin, fechas[i][0]));
    }

  } catch (error) {
    console.log('Error leyendo los IDs existentes: ' + error);
  }

  return ids;
}

function contarRegistrosEnSheet() {
  try {
    var sheet = SpreadsheetApp.openById(SPREADSHEET_ID)
                              .getSheetByName(HOJA_MOVIMIENTOS);
    if (!sheet) return 0;
    return Math.max(0, sheet.getLastRow() - 1);
  } catch (error) {
    console.log('Error contando registros: ' + error);
    return 0;
  }
}

// ============================================
// ESCRITURA EN LA HOJA
// ============================================

/**
 * Agrega las filas nuevas al final. No reordena ni reescribe nada.
 *
 * La version anterior hacia clearContents() + ordenar las 40.000 filas +
 * volver a escribirlas en cada corrida: lento, al borde del limite de 6
 * minutos de Apps Script, y si fallaba a mitad dejaba la hoja incompleta.
 * El orden en la hoja no importa porque el backend ordena al consultar.
 */
function guardarEnSheet(datos) {
  if (!datos || datos.length === 0) return 0;

  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID)
                            .getSheetByName(HOJA_MOVIMIENTOS);
  if (!sheet) {
    console.log('No existe la pestana "' + HOJA_MOVIMIENTOS +
                '". Ejecuta prepararHoja().');
    return 0;
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(COLUMNAS);
    sheet.setFrozenRows(1);
  }

  var filas = datos.map(function (item) {
    return [
      item.vin || '',
      item.marca || '',
      item.tipovehiculo || '',
      item.cliente || '',
      item.almacen || '',
      item.isla || '',
      item.ubicacion || '',
      item.estado || '',
      item.usuario || '',
      fechaClave(item.fecha)   // guardado siempre en el mismo formato
    ];
  });

  sheet.getRange(sheet.getLastRow() + 1, 1, filas.length, COLUMNAS.length)
       .setValues(filas);

  return filas.length;
}

// ============================================
// UTILIDADES DE MANTENIMIENTO
// ============================================

function ejecutarManual() {
  extraerYActualizar();
}

function probarLogin() {
  var token = login();
  console.log(token ? 'Login correcto.' : 'Login fallido.');
}

function verTotalRegistros() {
  console.log('Total de movimientos en la hoja: ' + contarRegistrosEnSheet());
}

function verUsuariosActivos() {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID)
                            .getSheetByName(HOJA_MOVIMIENTOS);
  if (!sheet || sheet.getLastRow() < 2) {
    console.log('No hay datos.');
    return;
  }

  var usuarios = sheet.getRange(2, 9, sheet.getLastRow() - 1, 1).getValues();
  var conteo = {};

  for (var i = 0; i < usuarios.length; i++) {
    var u = String(usuarios[i][0] || '').trim();
    if (!u) continue;
    conteo[u] = (conteo[u] || 0) + 1;
  }

  Object.keys(conteo)
    .sort(function (a, b) { return conteo[b] - conteo[a]; })
    .forEach(function (u, i) {
      console.log((i + 1) + '. ' + u + ': ' + conteo[u] + ' movimientos');
    });
}

/**
 * Busca y elimina duplicados dejados por la version anterior del script.
 * Ejecutala una vez despues de prepararHoja(); muestra cuantos encontro.
 */
function limpiarDuplicados() {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID)
                            .getSheetByName(HOJA_MOVIMIENTOS);
  if (!sheet || sheet.getLastRow() < 3) {
    console.log('No hay suficientes datos.');
    return;
  }

  var ultima = sheet.getLastRow();
  var datos = sheet.getRange(2, 1, ultima - 1, COLUMNAS.length).getValues();

  var vistos = new Set();
  var limpias = [];

  for (var i = 0; i < datos.length; i++) {
    var fila = datos[i];
    var id = idUnico(fila[COL_VIN - 1], fila[COL_FECHA - 1]);
    if (id === '|' || vistos.has(id)) continue;
    vistos.add(id);
    fila[COL_FECHA - 1] = fechaClave(fila[COL_FECHA - 1]);
    limpias.push(fila);
  }

  var eliminados = datos.length - limpias.length;
  if (eliminados === 0) {
    console.log('No se encontraron duplicados.');
    return;
  }

  sheet.getRange(2, 1, datos.length, COLUMNAS.length).clearContent();
  if (limpias.length > 0) {
    sheet.getRange(2, 1, limpias.length, COLUMNAS.length).setValues(limpias);
  }

  console.log('Duplicados eliminados: ' + eliminados +
              '. Filas restantes: ' + limpias.length + '.');
}

function limpiarDatos() {
  var sheet = SpreadsheetApp.openById(SPREADSHEET_ID)
                            .getSheetByName(HOJA_MOVIMIENTOS);
  if (!sheet) return;

  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, COLUMNAS.length).clearContent();
  }
  console.log('Movimientos borrados. La siguiente corrida hara la carga historica.');
}
