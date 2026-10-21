// Perfil del vehículo: Fiat Ducato serie 230 (1994-2002), 1.9 TD, autocaravana capuchina de 1999.
// Todo lo específico del modelo vive aquí: si algún día cambias de autocaravana, se cambia este archivo.
//
// SOBRE LOS INTERVALOS: no hay un libro de mantenimiento oficial accesible en línea para este motor.
// Cada tarea lleva en «fuente» de dónde sale su valor:
//   'usuarios'    → dato repetido en foros de propietarios (verifícalo en tu libro o con un taller Fiat)
//   'conservador' → elegido por la edad del vehículo: más corto que el de fábrica, para avisar antes
//   'normativa'   → requisito legal o de seguridad conocido
//   'célula'      → práctica habitual en autocaravanas, independiente de la base

export const PERFIL = {
  id: 'ducato230-19td',
  nombre: 'Fiat Ducato 1999 · 1.9 TD · capuchina',
  vehiculo: { marca: 'Fiat Ducato (serie 230)', base: '1.9 TD diésel', carroceria: 'Capuchina', anio: 1999 },
  // Sin datos fiables de fábrica no se rellenan medidas: dependen del carrocero (la célula) y no de Fiat
  ayudaMedidas: 'Mídelas tú: en una capuchina la altura suele rondar los 3 m, pero depende del carrocero y de lo que lleves en el techo.',
  ritmo: 1.3, // 82-92 CV con unos 3.000 kg: bastante más lenta que un turismo en puertos y autovía
  plan: [
    // nombre, zona, meses, km, fuente, nota
    ['Aceite y filtro de aceite', 'Motor', 12, 10000, 'conservador', 'Motor de más de 25 años: mejor corto que largo. Usa el aceite que indique tu libro o tu taller para un diésel de inyección indirecta.'],
    ['Filtro de aire', 'Motor', 24, 20000, 'conservador', ''],
    ['Filtro de gasóleo (y purgar agua)', 'Motor', 12, 20000, 'conservador', 'Purga el agua del filtro también antes del invierno. Con gasóleo de mala calidad, la bomba inyectora sufre.'],
    ['Correa de distribución + tensor + bomba de agua', 'Motor', 36, 60000, 'usuarios', 'Propietarios citan 60.000 km o 3 años para el 1.9 D/TD. Si se rompe, el motor se daña: si no sabes cuándo se cambió, cámbiala ya. Confírmalo con un taller Fiat.'],
    ['Correa de accesorios (alternador)', 'Motor', 36, 60000, 'conservador', 'Se suele cambiar junto con la distribución.'],
    ['Líquido refrigerante', 'Motor', 24, 0, 'conservador', ''],
    ['Manguitos y abrazaderas (revisión)', 'Motor', 12, 0, 'conservador', 'Las gomas envejecen por tiempo, no por km.'],
    ['Calentadores (revisión antes del invierno)', 'Motor', 12, 0, 'conservador', 'Si cuesta arrancar en frío, empieza por aquí.'],
    ['Batería de arranque (revisión)', 'Motor', 12, 0, 'conservador', ''],
    ['Aceite de la caja de cambios (nivel)', 'Motor', 24, 40000, 'conservador', 'Revisar nivel y fugas; cambiar si el taller lo recomienda.'],
    ['Líquido de frenos', 'Chasis y frenos', 24, 0, 'normativa', 'Absorbe humedad con el tiempo aunque no se use.'],
    ['Frenos delanteros y traseros (revisión)', 'Chasis y frenos', 12, 15000, 'conservador', 'Pastillas, discos y, si lleva, zapatas y tambores traseros.'],
    ['Latiguillos de freno (revisión)', 'Chasis y frenos', 12, 0, 'conservador', 'Grietas por edad: punto típico de rechazo en ITV.'],
    ['Dirección, rótulas y silentblocks', 'Chasis y frenos', 12, 20000, 'conservador', ''],
    ['Fuelles de transmisión', 'Chasis y frenos', 12, 0, 'conservador', ''],
    ['Amortiguadores (revisión)', 'Chasis y frenos', 24, 40000, 'conservador', 'Con el peso de la célula trabajan al límite.'],
    ['Chasis, ballestas y bajos (óxido)', 'Chasis y frenos', 12, 0, 'conservador', 'Revisa también los anclajes de la célula al chasis.'],
    ['Presión de neumáticos', 'Neumáticos', 1, 0, 'normativa', 'Usa la presión de autocaravana (suele ser más alta que la de la furgoneta).'],
    ['Sustitución de neumáticos (antigüedad)', 'Neumáticos', 72, 0, 'célula', 'Aunque tengan dibujo: a partir de 6 años la goma se cuartea. Mira la fecha DOT del flanco.'],
    ['Sellado de la capuchina (revisión)', 'Célula', 6, 0, 'célula', 'La capuchina y la unión cabina-célula son el punto de filtración más típico de este tipo de autocaravana.'],
    ['Prueba de estanqueidad con medidor de humedad', 'Célula', 12, 0, 'célula', 'Apunta las lecturas en las notas para comparar de un año a otro.'],
    ['Claraboyas, ventanas y juntas', 'Célula', 12, 0, 'célula', ''],
    ['Latiguillos de gas (fecha impresa)', 'Gas', 60, 0, 'normativa', 'La fecha de caducidad está impresa en el latiguillo.'],
    ['Regulador de gas', 'Gas', 120, 0, 'célula', ''],
    ['Nevera y calentador (revisión de quemadores)', 'Gas', 24, 0, 'célula', ''],
    ['Desinfección de depósitos y circuito', 'Agua', 12, 0, 'célula', ''],
    ['Vaciar el circuito antes de las heladas', 'Agua', 12, 0, 'célula', 'Si el agua se congela en el calentador o en los grifos, los revienta.'],
    ['Junta del WC químico (lubricar)', 'Agua', 6, 0, 'célula', ''],
    ['Batería de célula (revisión)', 'Electricidad', 6, 0, 'célula', ''],
    ['Conexiones y fusibles de la célula', 'Electricidad', 12, 0, 'célula', ''],
    ['Extintor', 'Seguridad', 12, 0, 'normativa', ''],
    ['Detector de gas / CO (pila)', 'Seguridad', 12, 0, 'célula', ''],
  ],
};

export const FUENTE_TXT = {
  usuarios: 'Dato de propietarios, no oficial: verifícalo',
  conservador: 'Intervalo prudente por la edad del vehículo',
  normativa: 'Requisito legal o de seguridad',
  célula: 'Práctica habitual en autocaravanas',
};

/**
 * ITV en España (RD 920/2017): una autocaravana M1 de más de 10 años pasa ITV cada año.
 * Si en la ficha técnica figura como categoría N (vivienda sobre furgón), puede ser cada 6 meses.
 * La categoría está en la ficha técnica; la app pregunta en vez de suponer.
 */
export const ITV_CAT = [
  ['', 'No lo sé (míralo en la ficha técnica)'],
  ['M1', 'Autocaravana M1 · ITV anual'],
  ['N', 'Categoría N (furgón vivienda) · ITV semestral'],
];
export const itvMeses = cat => (cat === 'N' ? 6 : 12);
