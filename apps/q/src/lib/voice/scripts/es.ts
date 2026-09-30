/* Cómo SUENA la puerta de entrada — español (tú). Tags in English; see en.ts. */
import type { Key } from '../../i18n/en';

export default {
	'signin.title': '[calm] [confident] Tus datos. [short pause] Tu dispositivo. [short pause] [warmly] Tus reglas.',
	'signin.line': '[reassuring] Todo se queda en tu propia carpeta. [matter-of-fact] Sin cuentas. Sin nube. Sin rastreo.',
	'signin.where': '[inviting] Entonces — ¿dónde está tu llave de acceso?',

	'place.device': '[brightly] Este dispositivo.',
	'place.key': '[curious] Una llave.',
	'place.phone': '[brightly] O tu teléfono.',
	'place.thisPhone': '[brightly] Este teléfono.',

	'place.device.hint': '[explaining] Touch ID, Face ID o Windows Hello.',
	'place.key.hint': '[explaining] Una YubiKey: conéctala o acércala.',
	'place.phone.hint': '[explaining] Escanea un código QR con tu teléfono.',
	'place.thisPhone.hint': '[explaining] Face ID o Touch ID.',

	'home.nothingStored':
		'[sincere] [quietly] No guardamos nada. [pause] Ni tus llaves. Ni tu D I D. [explaining] Se reconstruyen a partir de tu llave de acceso, cada vez. [matter-of-fact] Las formas de contactarte vienen después, en Ajustes.',
	'home.whatQIs': '[curious] [inviting] Entonces… ¿qué es Q?',

	/* The home page below the fold (29 September): intro, story, uses, beta. */
	'home.intro.lead': '[confident] [warmly] Q guarda la prueba de lo que pasó.',
	'home.intro.body': '[explaining] Cada vez que pasa algo entre personas — una clase, un trabajo, un pago, unirse a un club — Q escribe un recibo. Las dos partes lo firman. Las dos partes lo guardan. Nadie en medio tiene tus datos, y nadie puede cambiar el registro a escondidas.',
	'story.1.t': '[inviting] Dos personas. Dos ordenadores.',
	'story.1.d': '[explaining] Ana y Ben tienen Q, cada uno con su propia carpeta. No hay nada en medio.',
	'story.2.t': '[brightly] Pasa algo.',
	'story.2.d': '[explaining] Ana le da una clase a Ben — o hace un trabajo, o le devuelve dinero.',
	'story.3.t': '[confident] Q escribe un recibo.',
	'story.3.d': '[explaining] Qué pasó, y cuándo — firmado con la llave de acceso de Ana.',
	'story.4.t': '[warmly] Ben está de acuerdo.',
	'story.4.d': '[explaining] Lo comprueba y también lo firma. Ahora es de los dos.',
	'story.5.t': '[reassuring] Cada uno guarda una copia.',
	'story.5.d': '[reassuring] El mismo recibo, en la carpeta de Ana y en la de Ben. Ningún servidor lo guarda.',
	'story.6.t': '[confident] Una prueba que se sostiene.',
	'story.6.d': '[sincere] Años después, cualquiera de los dos puede mostrarlo. Cambia una palabra y las firmas ya no coinciden.',
	'uses.title': '[inviting] Para qué lo usa la gente',
	'uses.learning.t': '[brightly] Prueba de aprendizaje',
	'uses.learning.d': '[matter-of-fact] Cursos y estudios, registrados sobre la marcha — tuyos para mostrar, no encerrados en el sistema de otro.',
	'uses.clubs.t': '[brightly] Clubes y federaciones',
	'uses.clubs.d': '[matter-of-fact] Afiliación, consentimiento y pertenencia, de forma justa — desde un club de acampada hasta una cooperativa.',
	'uses.site.t': '[brightly] Tu propio sitio web',
	'uses.site.d': '[matter-of-fact] Escribe y publica páginas desde Q. Cada versión es un recibo firmado.',
	'uses.work.t': '[brightly] Trabajo y pagos',
	'uses.work.d': '[matter-of-fact] Trabajos hechos, acuerdos alcanzados, dinero movido — pruebas que tienen las dos partes.',
	'uses.festival.t': '[brightly] Fiestas del barrio',
	'uses.festival.d': '[matter-of-fact] Voluntarios, puestos y entradas, con un registro claro para todos.',
	'uses.calls.t': '[brightly] Llamadas y mensajes',
	'uses.calls.d': '[matter-of-fact] Habla de persona a persona. Un recibo guarda los hechos — quién, cuándo, cuánto tiempo — nunca lo que se dijo.',
	'beta.touch': '[inviting] Mantente en contacto',
	'beta.why': '[reassuring] [quietly] Solo se usa para contarte cosas de Q. Va al buzón de administración de Dark Olive, a ningún otro sitio.',

	/* The home page below the fold (29 September). */
	'sec.title': '[curious] [sincere] ¿Qué tan seguro es?',
	'sec.lead': '[confident] Q se basa en estándares abiertos y publicados — los mismos con los que el mundo de la seguridad comprueba su propio trabajo. En pocas palabras:',
	'sec.honest': '[sincere] [quietly] Estos son los estándares en los que se basa Q, no un certificado. Q está en beta y todavía no ha pasado una auditoría de seguridad independiente.',
	'sec.phish.t': '[confident] No hay contraseña que robar.',
	'sec.phish.d': '[explaining] Tu llave de acceso nunca sale de tu dispositivo, y solo funciona en este sitio: un sitio imitador no consigue nada.',
	'sec.nothing.t': '[confident] No guardamos nada.',
	'sec.nothing.d': '[explaining] Tus claves se reconstruyen en tu dispositivo a partir de tu llave de acceso, cada vez. No existe ninguna copia en otro lugar.',
	'sec.did.t': '[confident] Tu identidad es tuya.',
	'sec.did.d': '[explaining] Un identificador descentralizado creado con tu propia clave — no una cuenta en nuestro servidor.',
	'sec.lock.t': '[confident] Cerrado antes de salir.',
	'sec.lock.d': '[explaining] Cada archivo se cifra en tu dispositivo antes de sincronizarse o copiarse.',
	'sec.tamper.t': '[confident] Cualquier cambio se nota.',
	'sec.tamper.d': '[explaining] Cada recibo lleva el nombre de su propia huella. Cambia un solo byte y el nombre ya no coincide.',
	'sec.ucan.t': '[confident] Permisos que cualquiera puede comprobar.',
	'sec.ucan.d': '[explaining] Quién puede hacer qué es un token firmado, comprobado con los propios vectores de prueba de la especificación.',
	'sec.cedar.t': '[confident] Reglas decididas por un motor probado.',
	'sec.cedar.d': '[explaining] Las reglas de Q se ejecutan en Cedar, el lenguaje de políticas creado y publicado como código abierto por Amazon Web Services, con un núcleo verificado formalmente.',
	'sec.leave.t': '[confident] Sin dejar rastro.',
	'sec.leave.d': '[explaining] Un botón borra todo lo que Q guardó en el navegador. Las copias en la nube solo pueden tocar la carpeta que creó Q.',

	/* The home page below the fold (29 September). */
	'love.title': '[warmly] Hecho con cariño',
	'love.line': '[sincere] [warmly] Libre para dar — nunca libre para tomar.',
	'love.by': '[matter-of-fact] Diseñado por Darren Knipe, Dark Olive C-I-C.',
	'thanks.title': '[warmly] Con agradecimiento a',
	'thanks.ai': '[warmly] Y a los equipos de ingeniería detrás de',
	'thanks.community': '[warmly] [sincere] Y a toda la comunidad — los lenguajes, los estándares y todos los que regalan su trabajo.',

	/* The home page below the fold (29 September). */
	'love.source': '[confident] [warmly] Q es de código abierto, bajo la licencia GNU Affero. Dark Olive C-I-C tiene los derechos de autor; eres libre de examinarlo, ejecutarlo y modificarlo aquí.',

	/* The home page below the fold (29 September). */
	'thanks.referral': '[matter-of-fact] Algunos de estos enlaces son enlaces de referido: si te registras a través de ellos, ayudas a financiar Q.'
} satisfies Partial<Record<Key, string>>;
