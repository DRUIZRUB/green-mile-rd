/* Green Mile Construction RD — Catálogo compartido y utilidades de enlaces */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.GM_CATALOG = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const SEED_VERSION = 'gm_rd_seed_v2';
  const PUBLIC_BASE_URL = 'https://green-mile-rd.web.app/';

  const DEFAULT_EQUIPMENT = [
  {
    "id": 1001,
    "category": "Movimiento de Tierra",
    "title": "Retroexcavadora CAT 416F2 4x4",
    "power": "95 HP • Pala 1.0 m³",
    "year": "2022",
    "desc": "Tracción 4x4 con brazo extensible, kit hidráulico listo para martillo rompedor y seguro vigente. Ideal para zanjas, carga de material y movimiento urbano.",
    "priceDay": 16500,
    "priceHour": 2400,
    "priceWeek": 89000,
    "transportCost": 6500,
    "city": "Santo Domingo",
    "operator": true,
    "owner": "Equipos Ozama SRL",
    "rnc": "1-31-48291-5",
    "phone": "809-555-0141",
    "busy": false,
    "img": "img/eq_retroexcavadora.webp",
    "slug": "1001-retroexcavadora-cat-416f2-4x4"
  },
  {
    "id": 1002,
    "category": "Movimiento de Tierra",
    "title": "Excavadora Hidráulica JCB JS210LC",
    "power": "165 HP • 21 Ton",
    "year": "2022",
    "desc": "Excavadora de orugas con cucharón de 1.2 m³ para excavación profunda, cortes de terreno, cisternas y movimiento masivo en proyectos turísticos.",
    "priceDay": 28500,
    "priceHour": 4100,
    "priceWeek": 154000,
    "transportCost": 12000,
    "city": "Punta Cana",
    "operator": true,
    "owner": "Constructora del Este RD",
    "rnc": "1-32-19402-8",
    "phone": "829-555-0182",
    "busy": false,
    "img": "img/eq_excavadora.webp",
    "slug": "1002-excavadora-hidraulica-jcb-js210lc"
  },
  {
    "id": 1003,
    "category": "Movimiento de Tierra",
    "title": "Minicargador de Orugas Bobcat T750",
    "power": "85 HP • Orugas Goma",
    "year": "2023",
    "desc": "Compacto de alta tracción en terrenos blandos. Incluye cucharón estándar, horquillas porta-pallets y acoplamiento rápido para aditamentos.",
    "priceDay": 12500,
    "priceHour": 1850,
    "priceWeek": 67500,
    "transportCost": 4500,
    "city": "Santiago",
    "operator": false,
    "owner": "Maquinarias Cibao SRL",
    "rnc": "1-02-66318-4",
    "phone": "809-555-0133",
    "busy": false,
    "img": "img/eq_minicargador.webp",
    "slug": "1003-minicargador-de-orugas-bobcat-t750"
  },
  {
    "id": 1004,
    "category": "Movimiento de Tierra",
    "title": "Bulldozer CAT D8T XL con Ripper",
    "power": "310 HP • Hoja Semi-U",
    "year": "2021",
    "desc": "Tractor de orugas pesado con ripper trasero de 3 vástagos para desmonte, apertura de caminos, canteras y nivelación de grandes explanadas.",
    "priceDay": 38000,
    "priceHour": 5400,
    "priceWeek": 205000,
    "transportCost": 16500,
    "city": "La Romana",
    "operator": true,
    "owner": "Terracería Romana SRL",
    "rnc": "1-31-77210-9",
    "phone": "849-555-0194",
    "busy": true,
    "img": "img/eq_bulldozer.webp",
    "slug": "1004-bulldozer-cat-d8t-xl-con-ripper"
  },
  {
    "id": 1005,
    "category": "Izaje y Grúas",
    "title": "Grúa Telescópica Todoterreno 40 Ton",
    "power": "40 Ton • Pluma 31 m",
    "year": "2021",
    "desc": "Grúa hidráulica certificada con estabilizadores, indicador de momento de carga y rigger auxiliar. Montaje de vigas metálicas, chillers y prefabricados.",
    "priceDay": 48000,
    "priceHour": 7200,
    "priceWeek": 259000,
    "transportCost": 14000,
    "city": "Santo Domingo",
    "operator": true,
    "owner": "Izajes Metropolitanos RD",
    "rnc": "1-30-91844-2",
    "phone": "809-555-0155",
    "busy": false,
    "img": "img/eq_grua_telescopica.webp",
    "slug": "1005-grua-telescopica-todoterreno-40-ton"
  },
  {
    "id": 1006,
    "category": "Izaje y Grúas",
    "title": "Camión Grúa Palfinger PK 34002",
    "power": "12 Ton • Cama 6.5 m",
    "year": "2022",
    "desc": "Camión plataforma con brazo articulado hidráulico y control remoto. Solución integral para transporte, descarga e izaje directo en obra.",
    "priceDay": 24000,
    "priceHour": 3600,
    "priceWeek": 129000,
    "transportCost": 0,
    "city": "Santiago",
    "operator": true,
    "owner": "Grúas Norteñas SRL",
    "rnc": "1-31-55109-6",
    "phone": "829-555-0166",
    "busy": false,
    "img": "img/eq_camion_grua.webp",
    "slug": "1006-camion-grua-palfinger-pk-34002"
  },
  {
    "id": 1007,
    "category": "Izaje y Grúas",
    "title": "Plataforma Tijera Haulotte Compact 12 DX",
    "power": "Altura 12 m • Eléctrica",
    "year": "2023",
    "desc": "Elevador de tijera eléctrico silencioso con llantas anti-huella. Perfecto para instalaciones eléctricas, climatización y pintura en hoteles y naves.",
    "priceDay": 7200,
    "priceHour": 1100,
    "priceWeek": 38500,
    "transportCost": 3500,
    "city": "Punta Cana",
    "operator": false,
    "owner": "Elevación Bávaro SRL",
    "rnc": "1-32-44018-3",
    "phone": "809-555-0177",
    "busy": false,
    "img": "img/eq_plataforma_tijera.webp",
    "slug": "1007-plataforma-tijera-haulotte-compact-12-dx"
  },
  {
    "id": 1008,
    "category": "Izaje y Grúas",
    "title": "Brazo Articulado Haulotte HA16 RTJ 4x4",
    "power": "Altura 16 m • 4x4 Diésel",
    "year": "2022",
    "desc": "Plataforma elevadora articulada todoterreno con alcance horizontal de 8.3 m y giro continuo 360°. Ideal para fachadas, cristalería y estructuras altas.",
    "priceDay": 14500,
    "priceHour": 2200,
    "priceWeek": 78000,
    "transportCost": 5500,
    "city": "San Cristóbal",
    "operator": false,
    "owner": "Alturas del Sur RD",
    "rnc": "1-31-80923-1",
    "phone": "849-555-0188",
    "busy": false,
    "img": "img/eq_brazo_articulado.webp",
    "slug": "1008-brazo-articulado-haulotte-ha16-rtj-4x4"
  },
  {
    "id": 1009,
    "category": "Compactación",
    "title": "Rodillo Vibratorio Bomag BW 211 (11 Ton)",
    "power": "131 HP • 11 Ton Liso",
    "year": "2022",
    "desc": "Compactador de suelos de tambor liso con doble amplitud vibratoria y cabina climatizada. Kit pata de cabra opcional para arcillas y terracería.",
    "priceDay": 19500,
    "priceHour": 2900,
    "priceWeek": 105000,
    "transportCost": 8500,
    "city": "La Vega",
    "operator": true,
    "owner": "Vialidad Vegana SRL",
    "rnc": "1-05-41209-7",
    "phone": "809-555-0199",
    "busy": false,
    "img": "img/eq_rodillo_vibratorio.webp",
    "slug": "1009-rodillo-vibratorio-bomag-bw-211-11-ton"
  },
  {
    "id": 1010,
    "category": "Compactación",
    "title": "Rodillo Doble Tambor Bomag BW 120 AD-5",
    "power": "33 HP • 2.8 Ton Asfalto",
    "year": "2023",
    "desc": "Compactador tándem articulado con sistema de rociado de agua a presión. Especial para carpetas asfálticas, parqueos, aceras y bacheo urbano.",
    "priceDay": 12800,
    "priceHour": 1900,
    "priceWeek": 69000,
    "transportCost": 4500,
    "city": "Santo Domingo",
    "operator": true,
    "owner": "Asfaltos y Equipos DN",
    "rnc": "1-30-62815-4",
    "phone": "829-555-0210",
    "busy": false,
    "img": "img/eq_rodillo_asfalto.webp",
    "slug": "1010-rodillo-doble-tambor-bomag-bw-120-ad-5"
  },
  {
    "id": 1011,
    "category": "Compactación",
    "title": "Compactador Bailarina Ammann AVS 68-2",
    "power": "4 Tiempos • 18 kN",
    "year": "2024",
    "desc": "Apisonador percutor de bajo consumo y mantenimiento al día. Excelente para compactación en zanjas de tuberías, zapatas y espacios reducidos.",
    "priceDay": 2600,
    "priceHour": 450,
    "priceWeek": 14000,
    "transportCost": 1200,
    "city": "Puerto Plata",
    "operator": false,
    "owner": "Renta Equipos Costa Norte",
    "rnc": "1-32-11904-5",
    "phone": "809-555-0211",
    "busy": false,
    "img": "img/eq_bailarina.webp",
    "slug": "1011-compactador-bailarina-ammann-avs-68-2"
  },
  {
    "id": 1012,
    "category": "Compactación",
    "title": "Plancha Reversible Bomag BPR 55/65 D",
    "power": "455 kg • Motor Hatz Diésel",
    "year": "2023",
    "desc": "Plancha vibratoria reversible de alta fuerza centrífuga para bases granulares, caliche, adoquines y preparación de losas de concreto.",
    "priceDay": 4500,
    "priceHour": 700,
    "priceWeek": 24000,
    "transportCost": 1800,
    "city": "Baní",
    "operator": false,
    "owner": "Equipos Peravia SRL",
    "rnc": "1-31-90432-6",
    "phone": "849-555-0212",
    "busy": false,
    "img": "img/eq_plancha_compactadora.webp",
    "slug": "1012-plancha-reversible-bomag-bpr-55-65-d"
  },
  {
    "id": 1013,
    "category": "Energía e Iluminación",
    "title": "Planta Eléctrica Insonorizada 150 kW",
    "power": "150 kW • Remolque + ATS",
    "year": "2023",
    "desc": "Generador industrial diésel en cabina silenciosa sobre remolque doble eje. Incluye cableado principal, transferencia automática y tanque 24h.",
    "priceDay": 18500,
    "priceHour": 2700,
    "priceWeek": 99500,
    "transportCost": 6000,
    "city": "Punta Cana",
    "operator": true,
    "owner": "Energía Pro Caribe SRL",
    "rnc": "1-32-55821-1",
    "phone": "809-555-0213",
    "busy": false,
    "img": "img/eq_planta_electrica.webp",
    "slug": "1013-planta-electrica-insonorizada-150-kw"
  },
  {
    "id": 1014,
    "category": "Energía e Iluminación",
    "title": "Generador Portátil CAT RP7500E (7.5 kW)",
    "power": "7.5 kW • 120/240V",
    "year": "2024",
    "desc": "Generador compacto de arranque eléctrico con ruedas todo terreno y salidas industriales para soldadoras ligeras, sierras y herramientas en obra.",
    "priceDay": 3200,
    "priceHour": 500,
    "priceWeek": 17200,
    "transportCost": 1000,
    "city": "Santo Domingo",
    "operator": false,
    "owner": "Herramientas y Fuerza RD",
    "rnc": "1-31-33781-9",
    "phone": "829-555-0214",
    "busy": false,
    "img": "img/eq_generador_portatil.webp",
    "slug": "1014-generador-portatil-cat-rp7500e-7-5-kw"
  },
  {
    "id": 1015,
    "category": "Energía e Iluminación",
    "title": "Torre de Iluminación LED 4000D Diésel",
    "power": "4×320W LED • Mástil 7 m",
    "year": "2023",
    "desc": "Torre móvil remolcable con 4 reflectores LED de alto rendimiento y hasta 90 horas de autonomía. Ideal para trabajos nocturnos en carreteras y vaciados.",
    "priceDay": 4800,
    "priceHour": 750,
    "priceWeek": 25900,
    "transportCost": 2500,
    "city": "Santiago",
    "operator": false,
    "owner": "Maquinarias Cibao SRL",
    "rnc": "1-02-66318-4",
    "phone": "809-555-0215",
    "busy": false,
    "img": "img/eq_torre_iluminacion.webp",
    "slug": "1015-torre-de-iluminacion-led-4000d-diesel"
  },
  {
    "id": 1016,
    "category": "Energía e Iluminación",
    "title": "Compresor Portátil Sullair 185 CFM",
    "power": "185 CFM • 100 PSI Diésel",
    "year": "2021",
    "desc": "Compresor remolcable de tornillo rotativo. Incluye 2 mangueras de 50 pies y 2 martillos neumáticos rompepavimentos listos para demolición.",
    "priceDay": 8500,
    "priceHour": 1300,
    "priceWeek": 45900,
    "transportCost": 3500,
    "city": "La Romana",
    "operator": false,
    "owner": "Terracería Romana SRL",
    "rnc": "1-31-77210-9",
    "phone": "849-555-0216",
    "busy": false,
    "img": "img/eq_compresor_aire.webp",
    "slug": "1016-compresor-portatil-sullair-185-cfm"
  },
  {
    "id": 1017,
    "category": "Concreto y Ligero",
    "title": "Bomba de Concreto Schwing SP 500",
    "power": "35 m³/h • Tubería 80 m",
    "year": "2022",
    "desc": "Bomba estacionaria remolcable para vaciado rápido de losas, columnas y muros de edificios. Incluye 80 metros de tubería, codos y operador experto.",
    "priceDay": 32000,
    "priceHour": 4800,
    "priceWeek": 172000,
    "transportCost": 7500,
    "city": "Santo Domingo",
    "operator": true,
    "owner": "Bombeos Hormigón RD",
    "rnc": "1-30-74912-3",
    "phone": "809-555-0217",
    "busy": false,
    "img": "img/eq_bomba_concreto.webp",
    "slug": "1017-bomba-de-concreto-schwing-sp-500"
  },
  {
    "id": 1018,
    "category": "Concreto y Ligero",
    "title": "Mezcladora de Concreto 2 Fundas Gasolina",
    "power": "350 L • Motor 9 HP",
    "year": "2024",
    "desc": "Hormigonera remolcable con tambor reforzado y ruedas neumáticas. Lista para mezcla continua en obras residenciales, aceras y remodelaciones.",
    "priceDay": 2400,
    "priceHour": 400,
    "priceWeek": 12900,
    "transportCost": 1200,
    "city": "San Cristóbal",
    "operator": false,
    "owner": "Alturas del Sur RD",
    "rnc": "1-31-80923-1",
    "phone": "829-555-0218",
    "busy": false,
    "img": "img/eq_mezcladora_concreto.webp",
    "slug": "1018-mezcladora-de-concreto-2-fundas-gasolina"
  },
  {
    "id": 1019,
    "category": "Concreto y Ligero",
    "title": "Allanadora Helicóptero MQ Whiteman 36\"",
    "power": "36\" • Motor Honda 8 HP",
    "year": "2023",
    "desc": "Fratasadora profesional con aspas combinadas para pulido industrial de pisos en almacenes, parqueos, naves logísticas y losas de alto tráfico.",
    "priceDay": 3800,
    "priceHour": 600,
    "priceWeek": 20500,
    "transportCost": 1500,
    "city": "Punta Cana",
    "operator": false,
    "owner": "Constructora del Este RD",
    "rnc": "1-32-19402-8",
    "phone": "849-555-0219",
    "busy": false,
    "img": "img/eq_allanadora.webp",
    "slug": "1019-allanadora-helicoptero-mq-whiteman-36"
  },
  {
    "id": 1020,
    "category": "Concreto y Ligero",
    "title": "Cortadora de Pavimento Husqvarna FS 500",
    "power": "Disco 18\" • Prof. 16 cm",
    "year": "2023",
    "desc": "Cortadora de piso con tanque de agua integrado y control de profundidad para juntas de dilatación, cortes en concreto armado y asfalto.",
    "priceDay": 3400,
    "priceHour": 550,
    "priceWeek": 18300,
    "transportCost": 1500,
    "city": "La Vega",
    "operator": false,
    "owner": "Vialidad Vegana SRL",
    "rnc": "1-05-41209-7",
    "phone": "809-555-0220",
    "busy": false,
    "img": "img/eq_cortadora_pavimento.webp",
    "slug": "1020-cortadora-de-pavimento-husqvarna-fs-500"
  },
  {
    "id": 1021,
    "category": "Transporte Pesado",
    "title": "Camión Volteo Freightliner 18 m³",
    "power": "410 HP • 18 m³ Doble Eje",
    "year": "2021",
    "desc": "Volteo con lona eléctrica y caja reforzada para acarreo de arena, grava, caliche, material de relleno y bote de escombros con permiso vigente.",
    "priceDay": 18000,
    "priceHour": 2600,
    "priceWeek": 97000,
    "transportCost": 0,
    "city": "Santo Domingo",
    "operator": true,
    "owner": "Transporte y Agregados Ozama",
    "rnc": "1-30-88241-6",
    "phone": "809-555-0221",
    "busy": false,
    "img": "img/eq_camion_volteo.webp",
    "slug": "1021-camion-volteo-freightliner-18-m"
  },
  {
    "id": 1022,
    "category": "Transporte Pesado",
    "title": "Cabezote Kenworth + Lowboy 50 Ton",
    "power": "50 Ton • Cama Baja 3 Ejes",
    "year": "2022",
    "desc": "Servicio de traslado pesado con rampas hidráulicas, cadenas certificadas y escolta opcional para movilizar excavadoras y bulldozers en toda RD.",
    "priceDay": 26000,
    "priceHour": 3900,
    "priceWeek": 140000,
    "transportCost": 0,
    "city": "Santiago",
    "operator": true,
    "owner": "Logística Pesada Cibao SRL",
    "rnc": "1-31-60218-8",
    "phone": "829-555-0222",
    "busy": false,
    "img": "img/eq_lowboy.webp",
    "slug": "1022-cabezote-kenworth-lowboy-50-ton"
  },
  {
    "id": 1023,
    "category": "Transporte Pesado",
    "title": "Camión Cisterna de Agua 3,000 Galones",
    "power": "3,000 Gal • Barra Riego",
    "year": "2022",
    "desc": "Camión tanquero equipado con barra regadora trasera a presión y motobomba de 3 pulgadas para control de polvo y compactación de caminos.",
    "priceDay": 14000,
    "priceHour": 2100,
    "priceWeek": 75500,
    "transportCost": 0,
    "city": "Baní",
    "operator": true,
    "owner": "Equipos Peravia SRL",
    "rnc": "1-31-90432-6",
    "phone": "849-555-0223",
    "busy": false,
    "img": "img/eq_camion_cisterna.webp",
    "slug": "1023-camion-cisterna-de-agua-3-000-galones"
  },
  {
    "id": 1024,
    "category": "Transporte Pesado",
    "title": "Camión Mezclador (Trompo) 8 m³",
    "power": "8 m³ • 350 HP",
    "year": "2022",
    "desc": "Camión mixer con canaletas extensibles para transporte y vaciado continuo de hormigón premezclado en proyectos residenciales y hoteleros.",
    "priceDay": 22500,
    "priceHour": 3400,
    "priceWeek": 121000,
    "transportCost": 0,
    "city": "Puerto Plata",
    "operator": true,
    "owner": "Concretos del Atlántico SRL",
    "rnc": "1-31-99415-2",
    "phone": "809-555-0224",
    "busy": true,
    "img": "img/eq_camion_trompo.webp",
    "slug": "1024-camion-mezclador-trompo-8-m"
  },
  {
    "id": 1025,
    "category": "Movimiento de Tierra",
    "title": "Motoniveladora CAT 14M3",
    "power": "240 HP • Cuchilla 14 pies",
    "year": "2021",
    "desc": "Niveladora pesada con escarificador trasero y control hidráulico de precisión para perfilado de carreteras, cunetas y caminos vecinales.",
    "priceDay": 32000,
    "priceHour": 4600,
    "priceWeek": 172000,
    "transportCost": 12500,
    "city": "Azua",
    "operator": true,
    "owner": "Vialidad del Sur SRL",
    "rnc": "1-31-44512-3",
    "phone": "809-555-0225",
    "busy": false,
    "img": "img/eq_motoniveladora.webp",
    "slug": "1025-motoniveladora-cat-14m3"
  },
  {
    "id": 1026,
    "category": "Movimiento de Tierra",
    "title": "Cargador Frontal Pala CAT 966K",
    "power": "275 HP • Cucharón 3.8 m³",
    "year": "2022",
    "desc": "Pala mecánica de alto rendimiento para carga rápida de camiones volteo, acopio de agregados, grava, arena y trabajos en minas o canteras.",
    "priceDay": 29500,
    "priceHour": 4300,
    "priceWeek": 159000,
    "transportCost": 11000,
    "city": "Bonao",
    "operator": true,
    "owner": "Agregados y Equipos Cibao Sur",
    "rnc": "1-31-70814-2",
    "phone": "829-555-0226",
    "busy": false,
    "img": "img/eq_cargador_frontal.webp",
    "slug": "1026-cargador-frontal-pala-cat-966k"
  },
  {
    "id": 1027,
    "category": "Movimiento de Tierra",
    "title": "Mini Excavadora Hitachi ZX40U-5 (4 Ton)",
    "power": "40 HP • Orugas de Goma",
    "year": "2023",
    "desc": "Excavadora compacta giro cero con cuchilla niveladora frontal. Ideal para villas, piscinas, zanjas estrechas y terrenos con acceso limitado.",
    "priceDay": 13500,
    "priceHour": 1950,
    "priceWeek": 72500,
    "transportCost": 5000,
    "city": "Samaná",
    "operator": true,
    "owner": "Obras Península Samaná SRL",
    "rnc": "1-32-61209-4",
    "phone": "849-555-0227",
    "busy": false,
    "img": "img/eq_mini_excavadora.webp",
    "slug": "1027-mini-excavadora-hitachi-zx40u-5-4-ton"
  },
  {
    "id": 1028,
    "category": "Movimiento de Tierra",
    "title": "Retroexcavadora CAT 420E 4x4",
    "power": "98 HP • Brazo Extensible",
    "year": "2022",
    "desc": "Tracción 4x4, cabina cerrada con aire acondicionado y cucharón de servicio pesado. Perfecta para acueductos, drenajes y urbanizaciones.",
    "priceDay": 17000,
    "priceHour": 2450,
    "priceWeek": 91500,
    "transportCost": 6000,
    "city": "San Francisco de Macorís",
    "operator": true,
    "owner": "Maquinarias Duarte SRL",
    "rnc": "1-04-51822-9",
    "phone": "809-555-0228",
    "busy": false,
    "img": "img/eq_retro_deere.webp",
    "slug": "1028-retroexcavadora-cat-420e-4x4"
  },
  {
    "id": 1029,
    "category": "Izaje y Grúas",
    "title": "Manipulador Telescópico JCB 540-170",
    "power": "4 Ton • Alcance 17 m",
    "year": "2022",
    "desc": "Telehandler 4x4 con estabilizadores delanteros para subir pallets de blocks, cemento y varillas hasta 5to nivel en complejos turísticos.",
    "priceDay": 18500,
    "priceHour": 2700,
    "priceWeek": 99500,
    "transportCost": 7000,
    "city": "Higüey",
    "operator": true,
    "owner": "Equipos Altagracia SRL",
    "rnc": "1-32-38901-7",
    "phone": "829-555-0229",
    "busy": false,
    "img": "img/eq_telehandler.webp",
    "slug": "1029-manipulador-telescopico-jcb-540-170"
  },
  {
    "id": 1030,
    "category": "Izaje y Grúas",
    "title": "Montacargas Industrial CAT DP35N (3.5 Ton)",
    "power": "3.5 Ton • Mástil 4.8 m",
    "year": "2023",
    "desc": "Montacargas de servicio pesado con desplazador lateral de horquillas para descarga de contenedores, zonas francas y naves logísticas.",
    "priceDay": 9500,
    "priceHour": 1450,
    "priceWeek": 51000,
    "transportCost": 4000,
    "city": "San Pedro de Macorís",
    "operator": false,
    "owner": "Logística Macorís SRL",
    "rnc": "1-31-52410-8",
    "phone": "809-555-0230",
    "busy": false,
    "img": "img/eq_montacargas.webp",
    "slug": "1030-montacargas-industrial-cat-dp35n-3-5-ton"
  },
  {
    "id": 1031,
    "category": "Izaje y Grúas",
    "title": "Grúa Torre Liebherr 5 Ton (Pluma 52 m)",
    "power": "5 Ton • Pluma 52 m",
    "year": "2021",
    "desc": "Grúa torre certificada para torres residenciales y hoteles. Incluye ingeniería de montaje, control cabina/remoto y mantenimiento mensual.",
    "priceDay": 42000,
    "priceHour": 6000,
    "priceWeek": 225000,
    "transportCost": 25000,
    "city": "Santo Domingo",
    "operator": true,
    "owner": "Izajes Metropolitanos RD",
    "rnc": "1-30-91844-2",
    "phone": "809-555-0231",
    "busy": false,
    "img": "img/eq_grua_torre.webp",
    "slug": "1031-grua-torre-liebherr-5-ton-pluma-52-m"
  },
  {
    "id": 1032,
    "category": "Izaje y Grúas",
    "title": "Grúa Camión Todoterreno 70 Ton",
    "power": "70 Ton • Pluma 44 m",
    "year": "2021",
    "desc": "Grúa móvil multi-eje de gran capacidad para montaje de vigas de puentes, muelles portuarios, parques eólicos y equipos industriales.",
    "priceDay": 68000,
    "priceHour": 9800,
    "priceWeek": 365000,
    "transportCost": 18000,
    "city": "Barahona",
    "operator": true,
    "owner": "Grúas y Proyectos Enriquillo",
    "rnc": "1-31-93112-6",
    "phone": "849-555-0232",
    "busy": false,
    "img": "img/eq_grua_70ton.webp",
    "slug": "1032-grua-camion-todoterreno-70-ton"
  },
  {
    "id": 1033,
    "category": "Compactación",
    "title": "Rodillo Pata de Cabra CAT CP56B (12 Ton)",
    "power": "157 HP • 12 Ton Pata Cabra",
    "year": "2022",
    "desc": "Compactador de tambor con pisones diseñado para suelos arcillosos, rellenos profundos, carreteras, presas y plataformas industriales.",
    "priceDay": 21500,
    "priceHour": 3200,
    "priceWeek": 116000,
    "transportCost": 9000,
    "city": "Moca",
    "operator": true,
    "owner": "Terracería Espaillat SRL",
    "rnc": "1-31-67103-5",
    "phone": "809-555-0233",
    "busy": false,
    "img": "img/eq_rodillo_pata_cabra.webp",
    "slug": "1033-rodillo-pata-de-cabra-cat-cp56b-12-ton"
  },
  {
    "id": 1034,
    "category": "Compactación",
    "title": "Rodillo Neumático Hamm HP 240i",
    "power": "115 HP • 9 Llantas Asfalto",
    "year": "2022",
    "desc": "Compactador de neumáticos para sellado uniforme de mezclas asfálticas en autopistas, avenidas y pistas con sistema de humectación.",
    "priceDay": 22000,
    "priceHour": 3300,
    "priceWeek": 118500,
    "transportCost": 8500,
    "city": "San Pedro de Macorís",
    "operator": true,
    "owner": "Asfaltos del Este SRL",
    "rnc": "1-30-77401-9",
    "phone": "829-555-0234",
    "busy": false,
    "img": "img/eq_rodillo_neumatico.webp",
    "slug": "1034-rodillo-neumatico-hamm-hp-240i"
  },
  {
    "id": 1035,
    "category": "Compactación",
    "title": "Rodillo Peatonal Doble Tambor Husqvarna LP 6505",
    "power": "650 kg • Arranque Eléctrico",
    "year": "2024",
    "desc": "Rodillo dúplex manual de alta fuerza centrífuga para bacheo de asfalto, aceras, senderos, zanjas medianas y bases de parqueos.",
    "priceDay": 5200,
    "priceHour": 800,
    "priceWeek": 28000,
    "transportCost": 2200,
    "city": "Bonao",
    "operator": false,
    "owner": "Agregados y Equipos Cibao Sur",
    "rnc": "1-31-70814-2",
    "phone": "809-555-0235",
    "busy": false,
    "img": "img/eq_rodillo_peatonal.webp",
    "slug": "1035-rodillo-peatonal-doble-tambor-husqvarna-lp-6505"
  },
  {
    "id": 1036,
    "category": "Energía e Iluminación",
    "title": "Planta Eléctrica CAT 60 kW Insonorizada",
    "power": "60 kW • Cabina Silenciosa",
    "year": "2023",
    "desc": "Generador diésel silencioso con panel digital y regulador automático de voltaje. Respaldo ideal para obras de villas, bombas y campamentos.",
    "priceDay": 11500,
    "priceHour": 1700,
    "priceWeek": 62000,
    "transportCost": 4500,
    "city": "Samaná",
    "operator": false,
    "owner": "Obras Península Samaná SRL",
    "rnc": "1-32-61209-4",
    "phone": "849-555-0236",
    "busy": false,
    "img": "img/eq_planta_60kw.webp",
    "slug": "1036-planta-electrica-cat-60-kw-insonorizada"
  },
  {
    "id": 1037,
    "category": "Energía e Iluminación",
    "title": "Planta Soldadora Diésel Miller Big Blue 500",
    "power": "500 Amp • Generador Auxiliar",
    "year": "2023",
    "desc": "Soldadora autónoma sobre remolque con cables de trabajo pesado y tomas de 120/240V para montaje de acero estructural y tuberías en campo.",
    "priceDay": 7200,
    "priceHour": 1100,
    "priceWeek": 38800,
    "transportCost": 2800,
    "city": "San Francisco de Macorís",
    "operator": false,
    "owner": "Maquinarias Duarte SRL",
    "rnc": "1-04-51822-9",
    "phone": "809-555-0237",
    "busy": false,
    "img": "img/eq_soldadora_diesel.webp",
    "slug": "1037-planta-soldadora-diesel-miller-big-blue-500"
  },
  {
    "id": 1038,
    "category": "Energía e Iluminación",
    "title": "Motobomba Trash Pump 4\" Diésel",
    "power": "4\" • 1,500 L/min Sólidos",
    "year": "2024",
    "desc": "Bomba de achique de alto caudal sobre carro con mangueras de succión y descarga. Desalojo rápido de agua lodosa en excavaciones y zanjas.",
    "priceDay": 3600,
    "priceHour": 550,
    "priceWeek": 19400,
    "transportCost": 1500,
    "city": "Barahona",
    "operator": false,
    "owner": "Grúas y Proyectos Enriquillo",
    "rnc": "1-31-93112-6",
    "phone": "829-555-0238",
    "busy": false,
    "img": "img/eq_motobomba_agua.webp",
    "slug": "1038-motobomba-trash-pump-4-diesel"
  },
  {
    "id": 1039,
    "category": "Concreto y Ligero",
    "title": "Camión Bomba Pluma Putzmeister 36M",
    "power": "Pluma 36 m • 130 m³/h",
    "year": "2022",
    "desc": "Autobomba telescópica con brazo articulado de 36 metros para vaciados masivos en edificios, hoteles y puentes con máxima rapidez y limpieza.",
    "priceDay": 58000,
    "priceHour": 8500,
    "priceWeek": 312000,
    "transportCost": 0,
    "city": "Higüey",
    "operator": true,
    "owner": "Bombeos del Este RD",
    "rnc": "1-32-49021-5",
    "phone": "809-555-0239",
    "busy": false,
    "img": "img/eq_bomba_pluma.webp",
    "slug": "1039-camion-bomba-pluma-putzmeister-36m"
  },
  {
    "id": 1040,
    "category": "Concreto y Ligero",
    "title": "Vibrador de Concreto + Regla Vibratoria 6 HP",
    "power": "6 HP • Manguera 6 m + Regla",
    "year": "2024",
    "desc": "Combo de vibrador a gasolina con chicote de 6 metros y regla de aluminio de 3 metros para acabado compacto y sin burbujas en losas.",
    "priceDay": 2200,
    "priceHour": 350,
    "priceWeek": 11800,
    "transportCost": 1000,
    "city": "Moca",
    "operator": false,
    "owner": "Terracería Espaillat SRL",
    "rnc": "1-31-67103-5",
    "phone": "849-555-0240",
    "busy": false,
    "img": "img/eq_vibrador_concreto.webp",
    "slug": "1040-vibrador-de-concreto-regla-vibratoria-6-hp"
  },
  {
    "id": 1041,
    "category": "Concreto y Ligero",
    "title": "Andamios Tubulares Galvanizados (20 Cuerpos)",
    "power": "20 Cuerpos • Plataformas + Escaleras",
    "year": "2024",
    "desc": "Sistema de andamiaje certificado con tablones metálicos antideslizantes, barandas de seguridad, crucetas y bases niveladoras para fachadas.",
    "priceDay": 3500,
    "priceHour": 600,
    "priceWeek": 18500,
    "transportCost": 2500,
    "city": "Azua",
    "operator": false,
    "owner": "Vialidad del Sur SRL",
    "rnc": "1-31-44512-3",
    "phone": "809-555-0241",
    "busy": false,
    "img": "img/eq_andamios.webp",
    "slug": "1041-andamios-tubulares-galvanizados-20-cuerpos"
  },
  {
    "id": 1042,
    "category": "Transporte Pesado",
    "title": "Camión Volteo Compacto Fuso 7 m³",
    "power": "210 HP • 7 m³ Urbano",
    "year": "2023",
    "desc": "Volteo ágil ideal para calles estrechas, residenciales cerrados y entregas rápidas de arena, grava, cascajo y bote de escombros.",
    "priceDay": 11800,
    "priceHour": 1800,
    "priceWeek": 63500,
    "transportCost": 0,
    "city": "Samaná",
    "operator": true,
    "owner": "Obras Península Samaná SRL",
    "rnc": "1-32-61209-4",
    "phone": "829-555-0242",
    "busy": false,
    "img": "img/eq_volteo_compacto.webp",
    "slug": "1042-camion-volteo-compacto-fuso-7-m"
  },
  {
    "id": 1043,
    "category": "Transporte Pesado",
    "title": "Camión Plataforma Cama Plana 24 Pies",
    "power": "12 Ton • Cama 24 Pies",
    "year": "2022",
    "desc": "Camión flatbed con cinchas y amarres certificados para transporte seguro de varillas, bloques, cemento, madera y maquinaria ligera.",
    "priceDay": 13500,
    "priceHour": 2000,
    "priceWeek": 72500,
    "transportCost": 0,
    "city": "San Pedro de Macorís",
    "operator": true,
    "owner": "Logística Macorís SRL",
    "rnc": "1-31-52410-8",
    "phone": "809-555-0243",
    "busy": false,
    "img": "img/eq_camion_plataforma.webp",
    "slug": "1043-camion-plataforma-cama-plana-24-pies"
  },
  {
    "id": 1044,
    "category": "Movimiento de Tierra",
    "title": "Zanjadora Hidráulica Case 4x4",
    "power": "65 HP • Profundidad 1.5 m",
    "year": "2022",
    "desc": "Máquina zanjadora de cadena de corte limpio y rápido para tendido de fibra óptica, redes eléctricas soterradas y tuberías de agua o riego.",
    "priceDay": 19000,
    "priceHour": 2800,
    "priceWeek": 102000,
    "transportCost": 6500,
    "city": "Azua",
    "operator": true,
    "owner": "Vialidad del Sur SRL",
    "rnc": "1-31-44512-3",
    "phone": "849-555-0244",
    "busy": true,
    "img": "img/eq_zanjadora.webp",
    "slug": "1044-zanjadora-hidraulica-case-4x4"
  }
];

  const DEFAULT_REQUESTS = [
  {
    "id": 2001,
    "title": "Excavadora 20 Ton + 2 Volteos para movimiento de tierra",
    "city": "Punta Cana",
    "budget": 27000,
    "author": "Ing. Carlos Mejía — Grupo Bávaro",
    "phone": "829-555-0301",
    "notes": "Proyecto residencial en Verón, duración estimada 10 días con operador incluido y factura con NCF B01."
  },
  {
    "id": 2002,
    "title": "Grúa telescópica 35-40 Ton para montaje de estructura metálica",
    "city": "Santo Domingo",
    "budget": 46000,
    "author": "Arq. Laura Peña — Nave Industrial Haina",
    "phone": "809-555-0302",
    "notes": "Se requiere para 3 días corridos, certificación de izaje al día y acceso amplio en patio pavimentado."
  },
  {
    "id": 2003,
    "title": "Rodillo vibratorio 10-12 Ton para compactación de calle",
    "city": "Santiago",
    "budget": 19000,
    "author": "Ing. Rafael Taveras — Constructora Norte",
    "phone": "809-555-0303",
    "notes": "Compactación de sub-base de caliche en urbanización, inicio inmediato por 1 semana."
  },
  {
    "id": 2004,
    "title": "Planta eléctrica insonorizada 125-150 kW con ATS",
    "city": "La Romana",
    "budget": 18000,
    "author": "Ing. Miguel Santana — Obras Turísticas Este",
    "phone": "849-555-0304",
    "notes": "Respaldo continuo por 14 días para campamento de obra y grúa torre."
  },
  {
    "id": 2005,
    "title": "Bomba de concreto estacionaria para vaciado de losa 3er nivel",
    "city": "San Cristóbal",
    "budget": 31000,
    "author": "Ing. José Almonte — Edificaciones Sur",
    "phone": "829-555-0305",
    "notes": "Vaciado de 65 m³ de hormigón programado para el viernes a las 7:00 AM, necesitamos 60 m de tubería."
  },
  {
    "id": 2006,
    "title": "Brazo articulado 16-20 m para instalación de luminarias",
    "city": "Puerto Plata",
    "budget": 14000,
    "author": "Ing. Ana Domínguez — Electromecánica Costa",
    "phone": "809-555-0306",
    "notes": "Trabajo exterior en plaza comercial por 5 días, pago inmediato contra NCF."
  },
  {
    "id": 2007,
    "title": "Manipulador telescópico 17 m para obra hotelera",
    "city": "Higüey",
    "budget": 18500,
    "author": "Ing. Víctor Castillo — Desarrollos Este",
    "phone": "809-555-0307",
    "notes": "Requerido por 2 semanas con operador certificado para subida de blocks y mortero."
  },
  {
    "id": 2008,
    "title": "Mini excavadora 4 Ton + volteo pequeño para villa en Las Terrenas",
    "city": "Samaná",
    "budget": 14500,
    "author": "Arq. Sofía Morales — Villas Atlántico",
    "phone": "829-555-0308",
    "notes": "Excavación de piscina y zanjas sanitarias, acceso estrecho de 2.4 m."
  },
  {
    "id": 2009,
    "title": "Montacargas 3.5 Ton y camión cama plana para descarga en zona franca",
    "city": "San Pedro de Macorís",
    "budget": 13000,
    "author": "Ing. Roberto Núñez — Parque Industrial Este",
    "phone": "849-555-0309",
    "notes": "Descarga de 4 contenedores de perfiles metálicos durante 3 días laborales."
  },
  {
    "id": 2010,
    "title": "Motoniveladora 14 pies para rehabilitación de camino agrícola",
    "city": "Azua",
    "budget": 31000,
    "author": "Ing. Héctor Ramírez — Consorcio Sur",
    "phone": "809-555-0310",
    "notes": "6 kilómetros de perfilado y cuneteo, combustible suministrado en obra."
  }
];

  const DEFAULT_IDS = new Set(DEFAULT_EQUIPMENT.map(e => e.id));

  function slugify(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70);
  }

  function fmtRD(n) {
    return 'RD$ ' + Math.round(Number(n || 0)).toLocaleString('es-DO');
  }

  function cleanWA(p) {
    const d = String(p || '').replace(/\D/g, '');
    if (d.length === 10) return '1' + d;
    if (d.length === 11 && d.startsWith('1')) return d;
    return '1809' + d;
  }

  function defaultCover(cat) {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">' +
      '<rect width="600" height="400" fill="#0D223A"/>' +
      '<circle cx="490" cy="70" r="140" fill="#B85A27" opacity="0.24"/>' +
      '<text x="38" y="200" fill="#FFFFFF" font-family="sans-serif" font-size="24" font-weight="bold">' + (cat || 'Maquinaria Pesada') + '</text>' +
      '<text x="38" y="232" fill="#94A3B8" font-family="sans-serif" font-size="14">GREEN MILE APP • RD</text>' +
      '</svg>';
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  function resolveAsset(src, basePrefix) {
    const prefix = basePrefix || '';
    if (!src) return '';
    if (/^(data:|https?:\/\/|\/)/i.test(src)) return src;
    return prefix + src.replace(/^\.\//, '');
  }

  function isStaticListing(item) {
    return Boolean(item && DEFAULT_IDS.has(Number(item.id)));
  }

  function getStaticSlug(item) {
    if (!item) return '';
    return item.slug || (item.id + '-' + slugify(item.title));
  }

  function getEquipmentPath(item, basePrefix) {
    const prefix = basePrefix || '';
    if (!item) return prefix + 'index.html';
    if (isStaticListing(item)) {
      return prefix + 'equipo/' + getStaticSlug(item) + '.html';
    }
    return prefix + 'equipo.html?id=' + encodeURIComponent(item.id);
  }

  function encodeSharedEquipment(item) {
    const slim = {
      id: item.id,
      category: item.category,
      title: item.title,
      power: item.power,
      year: item.year,
      desc: item.desc,
      priceDay: item.priceDay,
      priceHour: item.priceHour,
      priceWeek: item.priceWeek,
      transportCost: item.transportCost,
      city: item.city,
      operator: item.operator,
      owner: item.owner,
      rnc: item.rnc,
      phone: item.phone,
      busy: item.busy
    };
    if (item.img && !item.img.startsWith('data:')) {
      slim.img = item.img;
    }
    try {
      const json = JSON.stringify(slim);
      const bytes = new TextEncoder().encode(json);
      let bin = '';
      bytes.forEach(b => { bin += String.fromCharCode(b); });
      return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (_) {
      return '';
    }
  }

  function decodeSharedEquipment(hashStr) {
    const raw = String(hashStr || '');
    const m = raw.match(/eq=([A-Za-z0-9_-]+)/);
    if (!m) return null;
    try {
      let b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const json = new TextDecoder().decode(bytes);
      const obj = JSON.parse(json);
      if (obj && obj.title) return obj;
    } catch (_) {}
    return null;
  }

  function getShareUrl(item, basePrefix) {
    const prefix = basePrefix || './';
    const rel = getEquipmentPath(item, '');
    let absUrl;
    if (typeof window !== 'undefined' && window.location && /^https?:/i.test(window.location.protocol)) {
      const appRoot = new URL(prefix, window.location.href).href;
      absUrl = new URL(rel, appRoot).href;
    } else {
      absUrl = PUBLIC_BASE_URL + rel;
    }
    if (!isStaticListing(item)) {
      const encoded = encodeSharedEquipment(item);
      if (encoded) absUrl += '#eq=' + encoded;
    }
    return absUrl;
  }

  function loadState() {
    let equipment = JSON.parse(localStorage.getItem('gm_rd_v3_eq')) || [];
    let requests = JSON.parse(localStorage.getItem('gm_rd_v3_req')) || [];
    let bookings = JSON.parse(localStorage.getItem('gm_rd_v3_bk')) || [];
    let savedIds = JSON.parse(localStorage.getItem('gm_rd_v4_saved')) || [];
    let isPro = localStorage.getItem('gm_rd_v3_pro') === 'true';

    // Keep static slugs updated on existing seeded items
    const slugMap = new Map(DEFAULT_EQUIPMENT.map(e => [e.id, e.slug]));
    equipment = equipment.map(e => slugMap.has(e.id) ? { ...e, slug: slugMap.get(e.id) } : e);

    if (localStorage.getItem(SEED_VERSION) !== '1') {
      const existingEqIds = new Set(equipment.map(e => e.id));
      equipment = [...equipment, ...DEFAULT_EQUIPMENT.filter(e => !existingEqIds.has(e.id))];
      const existingReqIds = new Set(requests.map(r => r.id));
      requests = [...requests, ...DEFAULT_REQUESTS.filter(r => !existingReqIds.has(r.id))];
      localStorage.setItem(SEED_VERSION, '1');
      saveState({ equipment, requests, bookings, savedIds, isPro });
    }

    return { equipment, requests, bookings, savedIds, isPro };
  }

  function saveState(state) {
    if (state.equipment) localStorage.setItem('gm_rd_v3_eq', JSON.stringify(state.equipment));
    if (state.requests) localStorage.setItem('gm_rd_v3_req', JSON.stringify(state.requests));
    if (state.bookings) localStorage.setItem('gm_rd_v3_bk', JSON.stringify(state.bookings));
    if (state.savedIds) localStorage.setItem('gm_rd_v4_saved', JSON.stringify(state.savedIds));
    if (typeof state.isPro === 'boolean') localStorage.setItem('gm_rd_v3_pro', String(state.isPro));
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      return true;
    } finally {
      document.body.removeChild(ta);
    }
  }

  const PARTS_CATEGORIES = [
    { id: 'Hidráulica y Bombas', label: 'Hidráulica y Bombas', img: 'img/parts/part_hydraulics.jpg' },
    { id: 'Motor y Filtros', label: 'Motor y Filtros', img: 'img/parts/part_engine_filters.jpg' },
    { id: 'Rodaje y Orugas', label: 'Rodaje y Orugas', img: 'img/parts/part_undercarriage.jpg' },
    { id: 'Implementos y Cucharones', label: 'Implementos y Cucharones', img: 'img/parts/part_attachments.jpg' },
    { id: 'Neumáticos y Aros', label: 'Neumáticos y Aros', img: 'img/parts/part_tires_otr.jpg' },
    { id: 'Eléctrico y Sensores', label: 'Eléctrico y Sensores', img: 'img/parts/part_electrical.jpg' },
    { id: 'Transmisión y Frenos', label: 'Transmisión y Frenos', img: 'img/parts/part_transmission.jpg' },
    { id: 'Cabina y Cristales', label: 'Cabina y Cristales', img: 'img/parts/part_cabin_controls.jpg' }
  ];

  const DEFAULT_PARTS = [
    {
      id: 4001,
      title: 'Bomba Hidráulica de Pistones Rexroth A10VO 71',
      category: 'Hidráulica y Bombas',
      condition: 'nueva',
      partNumber: 'CAT 235-4110 / A10VO71',
      brand: 'Rexroth / CAT',
      compatibleWith: 'Retroexcavadoras CAT 416E, 416F2, 420E y 420F',
      price: 94500,
      stock: 4,
      warranty: 'Garantía 6 meses por defecto de fábrica',
      city: 'Santo Domingo',
      owner: 'Repuestos Pesados Ozama, S.R.L.',
      rnc: '1-31-48291-5',
      desc: 'Bomba hidráulica nueva en caja sellada, calibrada en banco de pruebas. Entrega inmediata en Santo Domingo y envíos diarios al Cibao y Este.',
      img: 'img/parts/part_hydraulics.jpg'
    },
    {
      id: 4002,
      title: 'Cilindro Hidráulico de Brazo (Boom) Excavadora 20 Ton',
      category: 'Hidráulica y Bombas',
      condition: 'usada',
      partNumber: 'KOM 707-01-0G310',
      brand: 'Komatsu OEM',
      compatibleWith: 'Komatsu PC200-8 / PC210-8',
      price: 58000,
      stock: 2,
      warranty: 'Reacondicionado con kit de sellos nuevos • 60 días',
      city: 'Santiago',
      owner: 'Equipos y Talleres Cibao, S.R.L.',
      rnc: '1-30-99142-3',
      desc: 'Cilindro original usado en excelente estado, vástago cromado sin rayaduras y empaquetadura nueva recién instalada. Listo para montar.',
      img: 'img/parts/part_hydraulics.jpg'
    },
    {
      id: 4003,
      title: 'Kit Completo de Filtros Mantenimiento 500 Hrs CAT C4.4',
      category: 'Motor y Filtros',
      condition: 'nueva',
      partNumber: 'KIT-CAT-1R1807-C44',
      brand: 'Caterpillar / Donaldson',
      compatibleWith: 'CAT 416F2, 420F2, CS54B, 312D2 y plantas C4.4',
      price: 12800,
      stock: 18,
      warranty: 'Sellado OEM • Factura con e-NCF',
      city: 'Santo Domingo',
      owner: 'Diesel & Filtros del Caribe, S.R.L.',
      rnc: '1-32-11904-2',
      desc: 'Incluye filtro de aceite, filtro de combustible primario/separador, secundario y filtros de aire primario y secundario originales.',
      img: 'img/parts/part_engine_filters.jpg'
    },
    {
      id: 4004,
      title: 'Turbocompresor Holset HX35W Motor Cummins 6BT 5.9L',
      category: 'Motor y Filtros',
      condition: 'usada',
      partNumber: 'CUM 3592766 / HX35W',
      brand: 'Holset / Cummins',
      compatibleWith: 'Cargadores, Rodillos Bomag y Camiones Cummins 6BT',
      price: 28500,
      stock: 3,
      warranty: 'Probado sin juego axial • 30 días',
      city: 'La Vega',
      owner: 'Maquinarias y Motores Valle Real',
      rnc: '1-31-70543-9',
      desc: 'Turbo original retirado de equipo de bajas horas en RD. Inspeccionado en taller especializado, caracol intacto y compresor balanceado.',
      img: 'img/parts/part_engine_filters.jpg'
    },
    {
      id: 4005,
      title: 'Cadena de Oruga Sellada y Lubricada 45 Eslabones (Par)',
      category: 'Rodaje y Orugas',
      condition: 'nueva',
      partNumber: 'ITR-EX200-45L',
      brand: 'ITR / Berco',
      compatibleWith: 'Excavadoras 20 Ton: CAT 320D, JCB JS210LC, Komatsu PC200',
      price: 165000,
      stock: 3,
      warranty: 'Garantía 1,500 horas / 6 meses',
      city: 'Santo Domingo',
      owner: 'Tren de Rodaje Industrial RD',
      rnc: '1-31-88320-1',
      desc: 'Par de cadenas de acero forjado tratado térmicamente con pasadores lubricados de por vida. Incluye juego de pernos y tuercas grado 12.9.',
      img: 'img/parts/part_undercarriage.jpg'
    },
    {
      id: 4006,
      title: 'Juego de 6 Rodillos Inferiores + 2 Sprockets Excavadora 20T',
      category: 'Rodaje y Orugas',
      condition: 'usada',
      partNumber: 'JCB-332-H1120-USED',
      brand: 'JCB Original',
      compatibleWith: 'JCB JS200 / JS210LC / JS220',
      price: 44000,
      stock: 1,
      warranty: '85% vida útil restante verificada',
      city: 'San Cristóbal',
      owner: 'Constructora y Flota Sur, S.R.L.',
      rnc: '1-30-62118-7',
      desc: 'Lote de rodillos inferiores y ruedas motrices (sprockets) originales con muy poco desgaste. Sellos dúo-cono secos sin fugas de aceite.',
      img: 'img/parts/part_undercarriage.jpg'
    },
    {
      id: 4007,
      title: 'Martillo Hidráulico Rompedor 1,650 kg con 2 Puntas',
      category: 'Implementos y Cucharones',
      condition: 'usada',
      partNumber: 'EPI-SB-202-HD',
      brand: 'Epiroc / Soosan',
      compatibleWith: 'Excavadoras de 18 a 24 Toneladas',
      price: 385000,
      stock: 1,
      warranty: 'Recién recargado con nitrógeno • Prueba en patio',
      city: 'Punta Cana',
      owner: 'Movimientos del Este, S.R.L.',
      rnc: '1-32-24109-6',
      desc: 'Martillo hidráulico de alto impacto ideal para roca caliza dominicana. Incluye 2 punteros nuevos, mangueras de conexión y pines de 80 mm.',
      img: 'img/parts/part_attachments.jpg'
    },
    {
      id: 4008,
      title: 'Set de 10 Dientes (Puntas) + Pines y Seguros Serie J350',
      category: 'Implementos y Cucharones',
      condition: 'nueva',
      partNumber: 'CAT 1U3352-KIT10',
      brand: 'CAT Style Heavy Duty',
      compatibleWith: 'Cucharones de Excavadoras 20T y Cargadores CAT 950/966',
      price: 18900,
      stock: 12,
      warranty: 'Acero aleado anti-abrasión • Nuevo',
      city: 'Santiago',
      owner: 'Repuestos Pesados Ozama, S.R.L.',
      rnc: '1-31-48291-5',
      desc: 'Caja de 10 puntas tipo roca (Rock Chisel) J350 con pasadores y retenedores incluidos. Alta resistencia al desgaste en canteras y excavación.',
      img: 'img/parts/part_attachments.jpg'
    },
    {
      id: 4009,
      title: 'Goma OTR Trasera 19.5L-24 (12 Lonas) con Aro Reforzado',
      category: 'Neumáticos y Aros',
      condition: 'nueva',
      partNumber: 'OTR-195L24-R4',
      brand: 'BKT / Armour Industrial',
      compatibleWith: 'Retroexcavadoras CAT 416/420, JCB 3CX, Case 580',
      price: 39500,
      stock: 8,
      warranty: 'Nueva 2026 • Garantía estructural 1 año',
      city: 'Santo Domingo',
      owner: 'Neumáticos OTR Dominicana, S.R.L.',
      rnc: '1-31-55210-4',
      desc: 'Neumático industrial R-4 banda profunda de 12 capas resistente a cortes en obra. Disponible sola o montada en aro amarillo de 8 hoyos.',
      img: 'img/parts/part_tires_otr.jpg'
    },
    {
      id: 4010,
      title: 'Par de Gomas OTR 23.5-25 Cargador Frontal (75% de Vida)',
      category: 'Neumáticos y Aros',
      condition: 'usada',
      partNumber: 'OTR-235-25-L3-PAR',
      brand: 'Bridgestone / Triangle',
      compatibleWith: 'Cargadores Frontales CAT 950H, 966K y Komatsu WA380',
      price: 112000,
      stock: 2,
      warranty: 'Sin parches laterales • Inspección en patio',
      city: 'La Romana',
      owner: 'Equipos Pesados Este & Romana',
      rnc: '1-31-40912-8',
      desc: 'Par de gomas radiales E3/L3 con 75% de cocada uniforme, sin cortes ni vulcanizaciones estructurales. Precio por el par.',
      img: 'img/parts/part_tires_otr.jpg'
    },
    {
      id: 4011,
      title: 'Alternador 24V 70A Sin Escobillas + Motor de Arranque Pesado',
      category: 'Eléctrico y Sensores',
      condition: 'nueva',
      partNumber: 'DELCO-24V-28SI-KIT',
      brand: 'Delco Remy / Denso',
      compatibleWith: 'Excavadoras, Motoniveladoras y Plantas Eléctricas 24V',
      price: 26400,
      stock: 6,
      warranty: 'Nuevo en caja • 6 meses de garantía',
      city: 'Santo Domingo',
      owner: 'ElectroDiesel Industrial RD',
      rnc: '1-32-08431-1',
      desc: 'Alternador brushless 24V de trabajo continuo en ambientes con polvo y vibración, acompañado de motor de arranque de 11 dientes.',
      img: 'img/parts/part_electrical.jpg'
    },
    {
      id: 4012,
      title: 'Arnés Eléctrico de Motor + Sensores de Presión Hidráulica',
      category: 'Eléctrico y Sensores',
      condition: 'usada',
      partNumber: 'CAT 295-7422-HARNESS',
      brand: 'CAT Original',
      compatibleWith: 'Excavadoras CAT 320D / 320D2',
      price: 31500,
      stock: 2,
      warranty: 'Continuidad probada pin a pin • 30 días',
      city: 'Santiago',
      owner: 'Equipos y Talleres Cibao, S.R.L.',
      rnc: '1-30-99142-3',
      desc: 'Ramal eléctrico completo con conectores Deutsch sellados intactos y 2 sensores de presión principal de bomba probados.',
      img: 'img/parts/part_electrical.jpg'
    },
    {
      id: 4013,
      title: 'Kit de Discos de Freno Húmedo y Separadores Transmisión',
      category: 'Transmisión y Frenos',
      condition: 'nueva',
      partNumber: 'CARRARO-145020-KIT',
      brand: 'Carraro / Dana Spicer',
      compatibleWith: 'Ejes de Retroexcavadoras CAT 416F, Case 580N y New Holland',
      price: 22900,
      stock: 7,
      warranty: 'Nuevo OEM • Factura con e-NCF',
      city: 'Santo Domingo',
      owner: 'Repuestos Pesados Ozama, S.R.L.',
      rnc: '1-31-48291-5',
      desc: 'Juego completo de discos de fricción sinterizados y platos separadores de acero para ejes Carraro. Incluye sellos de pistón.',
      img: 'img/parts/part_transmission.jpg'
    },
    {
      id: 4014,
      title: 'Eje Cardán (Flecha) con Crucetas Pesadas + Reductor Planetario',
      category: 'Transmisión y Frenos',
      condition: 'usada',
      partNumber: 'CAT-966K-DRIVESHAFT',
      brand: 'Caterpillar Original',
      compatibleWith: 'Cargador Frontal CAT 966H / 966K',
      price: 68000,
      stock: 1,
      warranty: 'Sin holguras • Balanceado',
      city: 'San Pedro de Macorís',
      owner: 'Logística & Flota Oriental',
      rnc: '1-31-77312-9',
      desc: 'Conjunto planetario de mando final y cardán original usado con engrasadores nuevos y estriado impecable.',
      img: 'img/parts/part_transmission.jpg'
    },
    {
      id: 4015,
      title: 'Asiento Ergonómico con Suspensión Mecánica y Joysticks',
      category: 'Cabina y Cristales',
      condition: 'nueva',
      partNumber: 'GRAMMER-MSG85-RD',
      brand: 'Grammer / OEM Universal',
      compatibleWith: 'Excavadoras, Retroexcavadoras, Minicargadores y Rodillos',
      price: 42000,
      stock: 5,
      warranty: 'Nuevo • Tapizado heavy-duty impermeable',
      city: 'Santo Domingo',
      owner: 'Cabinas & Controles RD',
      rnc: '1-32-19455-0',
      desc: 'Asiento con suspensión regulable por peso, cinturón retráctil, apoyabrazos abatibles y consolas preparadas para mandos piloto.',
      img: 'img/parts/part_cabin_controls.jpg'
    },
    {
      id: 4016,
      title: 'Parabrisas Frontal Templado Verde + Marco Puerta Excavadora',
      category: 'Cabina y Cristales',
      condition: 'usada',
      partNumber: 'GLASS-CAT-320D-FRONT',
      brand: 'OEM Templado Certificado',
      compatibleWith: 'Excavadoras CAT Serie D / D2 (312D, 320D, 325D)',
      price: 19500,
      stock: 2,
      warranty: 'Sin grietas ni rayones • Listo para instalar',
      city: 'Puerto Plata',
      owner: 'Maquinaria Costa Norte, S.R.L.',
      rnc: '1-30-88415-2',
      desc: 'Vidrio frontal templado original desmontado de cabina operativa, incluye goma perimetral y seguros superiores.',
      img: 'img/parts/part_cabin_controls.jpg'
    }
  ];

  const DEFAULT_SALE_MACHINES = [
    {
      id: 3001,
      title: 'Retroexcavadora CAT 416F2 4x4 (2021 • 2,850 hrs)',
      category: 'Movimiento de Tierra',
      listingType: 'sale',
      condition: 'usada',
      salePrice: 4350000,
      priceDay: 16500,
      hoursUsed: '2,850 hrs',
      year: 2021,
      power: '93 HP • Brazo Extensible',
      warranty: 'Inspección mecánica y matrícula al día',
      city: 'Santo Domingo',
      owner: 'Equipos Pesados Cibao-Sur, S.R.L.',
      rnc: '1-31-60219-4',
      desc: 'Unidad de un solo dueño en República Dominicana, mantenimientos documentados cada 250 horas, gomas al 85%, lista para trabajar o traspaso inmediato con e-NCF.',
      img: 'img/eq_retroexcavadora.webp'
    },
    {
      id: 3002,
      title: 'Rodillo Vibratorio Bomag BW 211 D-5 (2026 • 0 Horas)',
      category: 'Compactación',
      listingType: 'sale',
      condition: 'nueva',
      salePrice: 6890000,
      priceDay: 19000,
      hoursUsed: '0 hrs (Nuevo)',
      year: 2026,
      power: '11 Ton • 130 HP Deutz',
      warranty: 'Garantía de fábrica 12 meses / 2,000 hrs',
      city: 'Santo Domingo',
      owner: 'Importadora Vial Dominicana, S.R.L.',
      rnc: '1-32-05073-8',
      desc: 'Compactador liso completamente nuevo año 2026 en inventario local en Santo Domingo. Apto para financiamiento bancario y facturación e-CF con crédito fiscal.',
      img: 'img/eq_rodillo_vibratorio.webp'
    },
    {
      id: 3003,
      title: 'Excavadora Hidráulica JCB JS210LC 21 Ton (2020)',
      category: 'Movimiento de Tierra',
      listingType: 'sale',
      condition: 'usada',
      salePrice: 5750000,
      priceDay: 28000,
      hoursUsed: '3,920 hrs',
      year: 2020,
      power: '21 Ton • Línea de Martillo',
      warranty: 'Prueba hidráulica en patio disponible',
      city: 'Santiago',
      owner: 'Constructora & Maquinarias Norte',
      rnc: '1-30-99142-3',
      desc: 'Excavadora sobre orugas con instalación auxiliar para martillo hidráulico, aire acondicionado enfriando y tren de rodaje al 80%.',
      img: 'img/eq_excavadora.webp'
    },
    {
      id: 3004,
      title: 'Minicargador de Orugas Bobcat T750 (2022 • 1,920 hrs)',
      category: 'Movimiento de Tierra',
      listingType: 'sale',
      condition: 'usada',
      salePrice: 3180000,
      priceDay: 14500,
      hoursUsed: '1,920 hrs',
      year: 2022,
      power: '85 HP • Alto Caudal',
      warranty: 'Cabina cerrada A/C • Inspeccionado',
      city: 'Punta Cana',
      owner: 'Movimientos del Este, S.R.L.',
      rnc: '1-32-24109-6',
      desc: 'Minicargador Bobcat de orugas de goma con cabina presurizada, acoplamiento rápido hidráulico y cucharón de uso rudo incluido.',
      img: 'img/eq_minicargador.webp'
    },
    {
      id: 3005,
      title: 'Planta Eléctrica CAT 60 kW Insonorizada (2026 • Nueva)',
      category: 'Energía e Iluminación',
      listingType: 'sale',
      condition: 'nueva',
      salePrice: 1850000,
      priceDay: 11500,
      hoursUsed: '0 hrs (Nueva)',
      year: 2026,
      power: '60 kW • Trifásica 60 Hz',
      warranty: 'Garantía 1 año + transferencia automática opcional',
      city: 'Santo Domingo',
      owner: 'Energía & Potencia Industrial RD',
      rnc: '1-31-92014-7',
      desc: 'Generador diesel insonorizado nuevo con cabina acústica tropicalizada para RD, panel digital DeepSea y tanque base de 16 horas.',
      img: 'img/eq_planta_60kw.webp'
    },
    {
      id: 3006,
      title: 'Camión Volteo Compacto Fuso 7 m³ (2021 • 58,000 km)',
      category: 'Transporte Pesado',
      listingType: 'sale',
      condition: 'usada',
      salePrice: 2950000,
      priceDay: 15000,
      hoursUsed: '58,000 km',
      year: 2021,
      power: '210 HP • Volteo Hidráulico',
      warranty: 'Matrícula original lista para traspaso DGII',
      city: 'La Romana',
      owner: 'Logística & Flota Oriental',
      rnc: '1-31-77312-9',
      desc: 'Camión volteo ágil para obras urbanas y residenciales, cama de acero reforzado de 7 metros cúbicos, bomba de volteo recién revisada.',
      img: 'img/eq_volteo_compacto.webp'
    }
  ];

  return {
    SEED_VERSION,
    PUBLIC_BASE_URL,
    DEFAULT_EQUIPMENT,
    DEFAULT_REQUESTS,
    PARTS_CATEGORIES,
    DEFAULT_PARTS,
    DEFAULT_SALE_MACHINES,
    slugify,
    fmtRD,
    cleanWA,
    defaultCover,
    resolveAsset,
    isStaticListing,
    getStaticSlug,
    getEquipmentPath,
    encodeSharedEquipment,
    decodeSharedEquipment,
    getShareUrl,
    loadState,
    saveState,
    copyToClipboard
  };
});
