/** Spanish. Machine-translated; needs native review before release (D53). */

import type { Catalogue, EntityLabels } from '../catalogue.js';

export const ES: Catalogue = {
  appName: 'PrivacyShield',
  appDescription:
    'Detecta y oculta información sensible en el texto antes de que llegue a las interfaces de chat de IA. Funciona por completo en tu dispositivo.',

  'panel.review.aria': 'PrivacyShield: revisa lo que se enmascarará antes de enviar',
  'panel.review.title': { one: '$1 elemento por enmascarar', other: '$1 elementos por enmascarar' },
  'panel.exposure': 'exposición $1/100',
  'panel.action.cancel': 'Cancelar',
  'panel.action.maskAndSend': 'Enmascarar y enviar',
  'panel.action.protectAndSend': 'Proteger y enviar',
  'panel.item.keepOriginal': 'Mantener original',
  'panel.item.maskThis': 'Enmascarar esto',
  'panel.item.aria': '$1: $2, elemento $3 de $4',

  'panel.unwitnessed.title': 'Comprueba que este mensaje es tuyo',
  'panel.unwitnessed.body':
    'Este texto ya estaba en el cuadro: PrivacyShield no te vio escribirlo. Es normal si se trata de un borrador guardado, de un enlace que rellena el cuadro por ti o de una sugerencia.',

  'panel.findings.aria': {
    one: 'PrivacyShield: $1 elemento sensible detectado en este mensaje',
    other: 'PrivacyShield: $1 elementos sensibles detectados en este mensaje',
  },
  'panel.findings.title': { one: '$1 elemento detectado', other: '$1 elementos detectados' },
  'panel.findings.note':
    'Al enviar, se sustituirán y se te pedirá que lo confirmes antes.',

  'panel.paste.title': '$1 en lo que acabas de pegar',
  'panel.paste.body': 'Se enmascararán al enviar. También puedes enmascararlos ahora.',
  'panel.paste.none': 'No se encontró nada sensible.',
  'panel.paste.dismiss': 'Descartar',
  'panel.paste.maskNow': 'Enmascarar ahora',
  'panel.paste.countOfType': { one: '$1 $2', other: '$1 $2' },

  'panel.degraded.pageTitle': 'PrivacyShield no está protegiendo esta página',
  'panel.degraded.sendTitle': 'PrivacyShield no envió este mensaje',
  'panel.degraded.couldNotFind': 'No se encontró: $1.',
  'panel.degraded.noReason': 'La extensión informó de un problema sin decir cuál era.',

  'popup.title': 'PrivacyShield',
  'popup.tab.status': 'Estado',
  'popup.tab.quickRedact': 'Enmascarado rápido',
  'popup.tab.insights': 'Estadísticas',
  'popup.status.protected': 'Protegiendo esta página',
  'popup.status.unprotected': 'No se está protegiendo esta página',
  'popup.status.unsupported': 'PrivacyShield no funciona en este sitio',
  'popup.status.sessionCounts': 'Enmascarado en esta sesión',
  'popup.status.sessionExposure': 'Exposición de la sesión',
  'popup.status.profile': 'Sensibilidad',
  'popup.profile.minimal': 'Mínima',
  'popup.profile.balanced': 'Equilibrada',
  'popup.profile.strict': 'Estricta',
  'popup.status.enabledHere': 'Activado en este sitio',

  'quick.heading': 'Enmascarar texto para cualquier sitio',
  'quick.explain':
    'Pega texto de cualquier aplicación. La versión enmascarada se puede enviar sin riesgo. Pega la respuesta aquí para restaurar los valores reales.',
  'quick.input.aria': 'Texto por enmascarar',
  'quick.output.aria': 'Texto enmascarado',
  'quick.action.mask': 'Enmascarar',
  'quick.action.restore': 'Restaurar',
  'quick.action.copy': 'Copiar',
  'quick.copied': 'Copiado',
  'quick.empty': 'Todavía no hay nada que enmascarar.',
  'quick.found': { one: '$1 elemento enmascarado', other: '$1 elementos enmascarados' },
  'quick.memoryOnly':
    'La correspondencia entre tu texto y sus sustituciones se guarda solo en memoria y se borra al cerrar esta ventana.',

  'insights.heading': 'Lo que has protegido',
  'insights.explain': 'Solo recuentos. Nunca se guarda ningún texto ni ningún valor.',
  'insights.empty': 'Todavía no se ha enmascarado nada.',
  'insights.thisMonth': 'Este mes',
  'insights.allTime': 'Total',
  'insights.reset': 'Restablecer recuentos',
  'insights.resetConfirm': '¿Restablecer todos los recuentos? Esto no se puede deshacer.',

  'options.title': 'Ajustes de PrivacyShield',
  'options.section.detection': 'Qué detectar',
  'options.section.substitution': 'Estilo de sustitución',
  'options.section.lists': 'Siempre y nunca',
  'options.mode.surrogate': 'Sustituciones realistas',
  'options.mode.token': 'Etiquetas como [EMAIL_1]',
  'options.allowlist': 'No enmascarar nunca esto',
  'options.denylist': 'Enmascarar siempre esto',
  'options.save': 'Guardar',
  'options.saved': 'Guardado',
};

export const ES_ENTITIES: EntityLabels = {
  EMAIL: 'Correo electrónico',
  PHONE: 'Teléfono',
  IP_ADDRESS: 'Dirección IP',
  MAC_ADDRESS: 'Dirección MAC',
  URL_WITH_CREDENTIALS: 'URL con credenciales',
  CREDIT_CARD: 'Tarjeta de crédito',
  SWIFT_BIC: 'SWIFT/BIC',
  US_ROUTING_NUMBER: 'Número de ruta (EE. UU.)',
  UK_SORT_CODE: 'Código bancario (Reino Unido)',
  CA_TRANSIT_NUMBER: 'Número de tránsito (Canadá)',
  BR_AGENCIA: 'Agencia bancaria (Brasil)',
  CRYPTO_WALLET: 'Monedero de criptomonedas',
  NATIONAL_ID: 'Documento de identidad',
  TAX_ID: 'Número fiscal',
  VAT_NUMBER: 'Número de IVA',
  PASSPORT_MRZ: 'Pasaporte (zona MRZ)',
  DRIVERS_LICENSE: 'Permiso de conducir',
  HEALTH_DATA: 'Datos de salud',
  API_KEY: 'Clave de API',
  PRIVATE_KEY: 'Clave privada',
  GENERIC_SECRET: 'Secreto',
  CONNECTION_STRING: 'Cadena de conexión',
  POSTAL_CODE: 'Código postal',
  STREET_ADDRESS: 'Dirección postal',
  COORDINATES: 'Coordenadas',
  PERSON: 'Persona',
  ORG: 'Organización',
  LOCATION: 'Lugar',
  DATE_OF_BIRTH: 'Fecha de nacimiento',
};
