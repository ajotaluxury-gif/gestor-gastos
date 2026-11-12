// Catálogo de emojis para categorías y metas, agrupado por temas y con palabras para buscar.
//
// Criterios:
// - Pensado para todo tipo de público: distintos medios de transporte (bici, monopatín, moto,
//   colectivo, remis…), accesibilidad (silla de ruedas, bastón, audífono), familias y cuidados,
//   mascotas, oficios y trabajo rural, distintas religiones, ingresos como jubilación o asignaciones.
// - Solo emojis hasta Emoji 13 (2020), para que se vean bien en celulares Android de varios años.
//   (Nada de 🛞, 🩼, 🪪 y otros de Emoji 14+, que en teléfonos viejos salen como un cuadrado.)
// - Las palabras van en minúscula y sin tildes; se buscan por comienzo de palabra.

/** Arma un grupo desde un texto con una línea por emoji: "🏍️ moto seguro service". */
export const crearGrupo = (nombre, texto) => ({
  nombre,
  items: texto.trim().split('\n').map((linea) => {
    const [emoji, ...palabras] = linea.trim().split(/\s+/);
    return { emoji, palabras: palabras.join(' ') };
  }),
});

const g = crearGrupo;

export const GRUPOS = [
  g('Transporte y vehículos', `
    🚗 auto coche vehiculo seguro patente
    🏍️ moto motocicleta seguro service patente
    🛵 moto scooter ciclomotor delivery
    🚲 bici bicicleta
    🛴 monopatin
    🛹 skate patineta
    🚌 colectivo bondi micro omnibus sube
    🚇 subte metro
    🚆 tren
    🚎 trolebus
    🚕 taxi
    🚖 remis uber cabify didi viaje
    🚐 combi charter traffic
    🛻 camioneta pickup
    🚚 flete mudanza camion
    🚜 tractor campo maquinaria
    ✈️ avion vuelo pasaje viaje
    🚢 barco ferry buquebus
    ⛽ nafta combustible gasoil gnc
    🔧 service taller mecanico arreglo repuestos
    🛡️ seguro poliza cobertura
    🅿️ estacionamiento cochera garage
    🛣️ peaje autopista ruta
    🚦 multa transito vtv
    🧽 lavado lavadero
    ⛑️ casco proteccion
    ♿ silla de ruedas movilidad accesibilidad discapacidad
  `),
  g('Casa y servicios', `
    🏠 casa alquiler vivienda hogar
    🏢 departamento expensas consorcio edificio
    🔑 llave alquiler inmobiliaria
    💡 luz electricidad
    💧 agua aysa
    🔥 gas garrafa
    📶 internet wifi fibra
    🌐 internet web dominio hosting
    📱 celular telefono plan recarga
    ☎️ telefono fijo linea
    📺 cable tv streaming netflix
    🗑️ abl municipal tasa basura
    🧹 limpieza productos
    🧺 lavanderia ropa lavado
    🛋️ muebles living
    🛏️ cama colchon dormitorio
    🍳 cocina electrodomesticos
    🪴 plantas jardin vivero
    🔨 arreglos mantenimiento
    🔌 electricista
    🚿 plomero sanitarios
    🎨 pintura pintor
    🧱 construccion obra materiales
    🪚 carpinteria madera
    🧯 seguridad matafuego alarma
  `),
  g('Comida y bebida', `
    🛒 supermercado compras almacen
    🥖 panaderia pan facturas
    🥩 carniceria carne asado
    🍗 polleria pollo
    🐟 pescaderia pescado
    🍎 verduleria fruta verdura
    🧀 fiambreria almacen queso
    🍔 comida rapida hamburguesa
    🍕 pizza pizzeria
    🍝 restaurante comida afuera
    🥡 delivery pedidos ya rappi
    🥟 empanadas rotiseria
    ☕ cafe cafeteria
    🧉 mate yerba
    🍺 cerveza
    🍷 vino
    🥤 bebidas gaseosa
    🍦 helado heladeria
    🍰 dulces torta pasteleria
    🥗 dieta saludable vianda
    🍼 bebe leche mamadera
  `),
  g('Salud y cuidado personal', `
    💊 farmacia remedios medicamentos
    🩺 medico consulta
    🏥 obra social prepaga hospital clinica
    🦷 dentista odontologo
    👓 optica lentes anteojos
    🦻 audifono audicion
    🦯 baston ceguera visual
    🧠 psicologo terapia salud mental
    💉 vacuna analisis
    🩹 curitas botiquin
    🧪 laboratorio estudios
    🧘 yoga meditacion
    💪 gimnasio gym entrenamiento
    🏋️ gimnasio pesas gym
    🧴 higiene cosmetica perfumeria
    💇 peluqueria corte pelo
    💈 barberia
    💅 manicura unas estetica
    💄 maquillaje belleza
    🪒 afeitar barba
  `),
  g('Familia, cuidados y mascotas', `
    👶 bebe
    🧸 juguetes chicos
    🎒 mochila utiles colegio
    👨‍👩‍👧 familia hijos
    👨‍👧 cuota alimentaria hijos
    🧓 abuelos adultos mayores geriatrico cuidado
    🤱 lactancia maternidad
    🧑‍🍼 crianza paternidad
    🏡 cuidadora niñera empleada domestica
    🐶 perro mascota
    🐱 gato mascota
    🐦 pajaro mascota
    🐠 pez acuario
    🐴 caballo
    🦴 veterinaria alimento balanceado mascota
  `),
  g('Educación y trabajo', `
    🎓 universidad facultad carrera titulo
    🏫 colegio escuela cuota
    📚 libros
    ✏️ utiles libreria
    🧑‍💻 cursos online programacion
    🗣️ idiomas ingles
    💼 trabajo oficina sueldo
    👥 sueldos honorarios empleados personal equipo
    🖥️ computadora software
    🖨️ impresora fotocopias
    📦 envios paquetes mercaderia
    🧾 factura impuestos monotributo afip
    📊 contador contabilidad
    ⚖️ abogado legal tramite
    🏭 fabrica produccion
    🌾 campo cosecha agro
    🐄 ganado hacienda
    🧰 herramientas
    👷 obra albanil construccion
    ✂️ costura modista
    🚛 transporte logistica
    📣 publicidad marketing
  `),
  g('Ocio, deporte y cultura', `
    🎉 salidas fiesta boliche
    🎬 cine pelicula
    🎭 teatro
    🎵 musica spotify
    🎸 instrumento guitarra clases
    🎮 videojuegos consola
    📖 lectura revistas
    🖌️ arte taller manualidades
    📷 fotos fotografia
    ⚽ futbol cancha
    🏀 basquet
    🎾 tenis padel
    🏊 natacion pileta club
    🥋 artes marciales
    🚴 ciclismo
    🏃 running correr
    🎣 pesca
    🏕️ camping
    🏖️ vacaciones playa
    🏔️ montana viaje
    🎟️ entradas recital show
    🎰 apuestas juego quiniela
  `),
  g('Compras y regalos', `
    👕 ropa remera
    👗 vestido ropa
    👟 zapatillas calzado
    👜 cartera bolso
    🧦 medias
    ⌚ reloj
    💍 joyas anillo
    🕶️ anteojos de sol
    🎁 regalos cumpleanos
    🛍️ shopping compras
    🧥 abrigo campera
  `),
  g('Plata y finanzas', `
    💳 tarjeta credito debito
    🏦 banco prestamo cuenta
    💸 deudas gastos pagos
    🧾 impuestos ganancias bienes personales
    💰 ahorro plata
    🪙 monedas cripto
    💵 efectivo dolar billete
    📈 inversiones plazo fijo acciones
    🏧 cajero extraccion
    🤝 prestamo amigo deuda
    🐷 alcancia ahorro chanchito
  `),
  g('Ingresos', `
    💼 sueldo salario trabajo
    💸 extras changas
    🛠️ servicios prestados trabajos
    💲 ventas cobros
    👴 jubilacion pension
    🏛️ anses asignacion plan auh
    🏠 alquiler cobrado renta
    🎁 regalo recibido
    🏆 premio bono aguinaldo
  `),
  g('Comunidad y fe', `
    ⛪ iglesia
    🕌 mezquita
    🕍 sinagoga
    🛕 templo
    🙏 diezmo ofrenda
    ❤️ donacion
    🎗️ causa solidaria
    🤲 caridad ayuda
    🌱 ambiente naturaleza
  `),
  g('Otros', `
    📦 otros varios
    📎 otros varios
    ⭐ especial favorito
    📌 pendiente
    🔖 suscripcion
    🗓️ cuota mensual
    🚗 vehiculo
    ❓ otro
  `),
];

/** Emojis de los grupos, sin repetir. Junta las palabras de un mismo emoji. */
export function unicos(grupos = GRUPOS) {
  const mapa = new Map();
  for (const grupo of grupos) {
    for (const it of grupo.items) {
      const prev = mapa.get(it.emoji);
      mapa.set(it.emoji, { emoji: it.emoji, palabras: prev ? `${prev.palabras} ${it.palabras}` : it.palabras });
    }
  }
  return [...mapa.values()];
}

export const TODOS = unicos();

const normalizar = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/**
 * Busca emojis por palabras ("moto", "seguro moto", "bici").
 * Todas las palabras de la búsqueda tienen que coincidir con el comienzo de alguna palabra clave.
 */
export function buscarEmojis(texto, grupos = GRUPOS) {
  const terminos = normalizar(texto).split(/\s+/).filter(Boolean);
  if (!terminos.length) return [];
  return (grupos === GRUPOS ? TODOS : unicos(grupos)).filter((it) => {
    const palabras = it.palabras.split(' ');
    return terminos.every((t) => palabras.some((p) => p.startsWith(t)));
  });
}
