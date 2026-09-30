/* Comment la porte d'entrée SONNE — français (vous). Tags in English; see en.ts. */
import type { Key } from '../../i18n/en';

export default {
	'signin.title': '[calm] [confident] Vos données. [short pause] Votre appareil. [short pause] [warmly] Vos règles.',
	'signin.line': '[reassuring] Tout reste dans votre propre dossier. [matter-of-fact] Pas de compte. Pas de cloud. Pas de pistage.',
	'signin.where': '[inviting] Alors — où est votre clé d’accès ?',

	'place.device': '[brightly] Cet appareil.',
	'place.key': '[curious] Une clé.',
	'place.phone': '[brightly] Ou votre téléphone.',
	'place.thisPhone': '[brightly] Ce téléphone.',

	'place.device.hint': '[explaining] Touch ID, Face ID, ou Windows Hello.',
	'place.key.hint': '[explaining] Une YubiKey — branchez-la, ou approchez-la.',
	'place.phone.hint': '[explaining] Scannez un QR code avec votre téléphone.',
	'place.thisPhone.hint': '[explaining] Face ID, ou Touch ID.',

	'home.nothingStored':
		'[sincere] [quietly] Nous ne conservons rien. [pause] Ni vos clés. Ni votre D I D. [explaining] Ils sont recréés à partir de votre clé d’accès, à chaque fois. [matter-of-fact] Les moyens de vous joindre viennent ensuite, dans les Paramètres.',
	'home.whatQIs': '[curious] [inviting] Alors… qu’est-ce que Q ?',

	/* The home page below the fold (29 September): intro, story, uses, beta. */
	'home.intro.lead': '[confident] [warmly] Q garde la preuve de ce qui s’est passé.',
	'home.intro.body': '[explaining] Chaque fois que quelque chose se passe entre des personnes — un cours, un travail, un paiement, une adhésion à un club — Q rédige un reçu. Les deux parties le signent. Les deux parties le gardent. Personne au milieu ne détient vos données, et personne ne peut modifier le registre en douce.',
	'story.1.t': '[inviting] Deux personnes. Deux ordinateurs.',
	'story.1.d': '[explaining] Ana et Ben ont chacun Q, et leur propre dossier. Il n’y a rien au milieu.',
	'story.2.t': '[brightly] Il se passe quelque chose.',
	'story.2.d': '[explaining] Ana donne un cours à Ben — ou fait un travail, ou le rembourse.',
	'story.3.t': '[confident] Q rédige un reçu.',
	'story.3.d': '[explaining] Ce qui s’est passé, et quand — signé avec la clé d’accès d’Ana.',
	'story.4.t': '[warmly] Ben est d’accord.',
	'story.4.d': '[explaining] Il le vérifie et le signe aussi. Maintenant, il est à tous les deux.',
	'story.5.t': '[reassuring] Chacun garde une copie.',
	'story.5.d': '[reassuring] Le même reçu, dans le dossier d’Ana et dans celui de Ben. Aucun serveur ne le détient.',
	'story.6.t': '[confident] Une preuve qui tient.',
	'story.6.d': '[sincere] Des années plus tard, chacun peut le montrer. Changez un mot et les signatures ne correspondent plus.',
	'uses.title': '[inviting] À quoi on l’utilise',
	'uses.learning.t': '[brightly] Preuve d’apprentissage',
	'uses.learning.d': '[matter-of-fact] Cours et études, enregistrés au fil de l’eau — à vous de les montrer, pas enfermés dans le système d’un autre.',
	'uses.clubs.t': '[brightly] Clubs et fédérations',
	'uses.clubs.d': '[matter-of-fact] Adhésion, consentement et appartenance, gérés équitablement — d’un club de camping à une coopérative.',
	'uses.site.t': '[brightly] Votre propre site web',
	'uses.site.d': '[matter-of-fact] Rédigez et publiez des pages depuis Q. Chaque version est un reçu signé.',
	'uses.work.t': '[brightly] Travail et paiements',
	'uses.work.d': '[matter-of-fact] Travaux faits, accords conclus, argent versé — des preuves que les deux parties détiennent.',
	'uses.festival.t': '[brightly] Festivals de quartier',
	'uses.festival.d': '[matter-of-fact] Bénévoles, exposants et billets, avec un registre clair pour chacun.',
	'uses.calls.t': '[brightly] Appels et messages',
	'uses.calls.d': '[matter-of-fact] Parlez de personne à personne. Un reçu garde les faits — qui, quand, combien de temps — jamais ce qui a été dit.',
	'beta.touch': '[inviting] Restons en contact',
	'beta.why': '[reassuring] [quietly] Utilisé uniquement pour vous parler de Q. Il va à la boîte de réception administrative de Dark Olive, nulle part ailleurs.',
	'support.title': '[warmly] Le garder gratuit',
	'support.body': '[sincere] [warmly] Q est gratuit et le restera — sans publicité, sans investisseurs, sans rien vendre à votre sujet. Il est construit par Darren Knipe, un parent qui travaille, au sein de Dark Olive C-I-C, une petite société d’intérêt communautaire. Si Q vous est utile, ou à quelqu’un dont vous prenez soin, une contribution l’aide à grandir et le garde gratuit pour tous.',

	/* The home page below the fold (29 September). */
	'sec.title': '[curious] [sincere] Est-ce vraiment sûr ?',
	'sec.lead': '[confident] Q repose sur des standards ouverts et publiés — ceux-là mêmes auxquels le monde de la sécurité compare son propre travail. En clair :',
	'sec.honest': '[sincere] [quietly] Ce sont les standards sur lesquels Q repose, pas un certificat. Q est en bêta et n’a pas encore fait l’objet d’un audit de sécurité indépendant.',
	'sec.phish.t': '[confident] Aucun mot de passe à voler.',
	'sec.phish.d': '[explaining] Votre clé d’accès ne quitte jamais votre appareil, et ne fonctionne que sur ce site — un site imitateur n’obtient rien.',
	'sec.nothing.t': '[confident] Rien n’est conservé chez nous.',
	'sec.nothing.d': '[explaining] Vos clés sont reconstruites sur votre appareil à partir de votre clé d’accès, à chaque fois. Il n’en existe aucune copie ailleurs.',
	'sec.did.t': '[confident] Votre identité vous appartient.',
	'sec.did.d': '[explaining] Un identifiant décentralisé créé à partir de votre propre clé — pas un compte sur notre serveur.',
	'sec.lock.t': '[confident] Verrouillé avant de partir.',
	'sec.lock.d': '[explaining] Chaque fichier est chiffré sur votre appareil avant d’être synchronisé ou sauvegardé.',
	'sec.tamper.t': '[confident] Toute modification se voit.',
	'sec.tamper.d': '[explaining] Chaque reçu porte le nom de sa propre empreinte. Changez un seul octet et le nom ne correspond plus.',
	'sec.ucan.t': '[confident] Des permissions vérifiables par tous.',
	'sec.ucan.d': '[explaining] Qui peut faire quoi est un jeton signé, vérifié à l’aide des vecteurs de test de la spécification elle-même.',
	'sec.cedar.t': '[confident] Des règles tranchées par un moteur éprouvé.',
	'sec.cedar.d': '[explaining] Les règles de Q s’exécutent dans Cedar, le langage de politiques créé et publié en open source par Amazon Web Services, dont le cœur est formellement vérifié.',
	'sec.leave.t': '[confident] Ne laisser aucune trace.',
	'sec.leave.d': '[explaining] Un bouton efface tout ce que Q a gardé dans le navigateur. Les copies dans le cloud n’accèdent qu’au dossier créé par Q.',

	/* The home page below the fold (29 September). */
	'love.title': '[warmly] Fait avec amour',
	'love.line': '[sincere] [warmly] Libre de donner — jamais libre de prendre.',
	'love.by': '[matter-of-fact] Conçu par Darren Knipe, Dark Olive C-I-C.',
	'thanks.title': '[warmly] Avec nos remerciements à',
	'thanks.ai': '[warmly] Et aux équipes d’ingénierie derrière',
	'thanks.community': '[warmly] [sincere] Et à toute la communauté — les langages, les standards, et tous ceux qui offrent leur travail.',

	/* The home page below the fold (29 September). */
	'love.source': '[confident] [warmly] Q est open source, sous licence GNU Affero. Dark Olive C-I-C en détient le droit d’auteur ; vous êtes libre de l’examiner, de l’exécuter et de le modifier ici.',

	/* The home page below the fold (29 September). */
	'thanks.referral': '[matter-of-fact] Certains de ces liens sont des liens de parrainage — si vous vous inscrivez par leur biais, cela aide à financer Q.'
} satisfies Partial<Record<Key, string>>;
