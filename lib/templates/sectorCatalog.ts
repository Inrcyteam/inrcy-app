import type { TemplateAction, TemplateDef } from '@/lib/messageTemplates';
import { ACTIVITY_SECTOR_OPTIONS, type ActivitySectorCategory } from '@/lib/activitySectors';

type SectorPack = {
  label: string;
  signature: string;
  promoLead: string;
  infoLead: string;
  followLead: string;
  surveyLead: string;
  seasonal: string;
  loyalty: string;
  maintenance: string;
  localHook: string;
  audience: string;
};

const PACKS: Record<ActivitySectorCategory, SectorPack> = {
  artisan_btp: {
    label: 'Artisan / BTP',
    signature: 'des interventions terrain fiables, claires et rassurantes',
    promoLead: 'mettre en avant un chantier, une intervention ou une offre locale',
    infoLead: 'informer sur les travaux, les délais, les conseils et les nouveautés métier',
    followLead: 'suivre un devis, un chantier ou un entretien recommandé',
    surveyLead: 'mieux comprendre les besoins maison, rénovation et entretien',
    seasonal: 'offre saisonnière entretien / rénovation / préparation habitat',
    loyalty: 'avantage client fidèle chantier / entretien',
    maintenance: 'rappel entretien, contrôle ou vérification habitat',
    localHook: 'maison, confort et sérénité',
    audience: 'particuliers, propriétaires et gestionnaires de biens',
  },
  automobile: {
    label: 'Automobile',
    signature: 'un atelier réactif, rassurant et transparent',
    promoLead: 'mettre en avant une offre atelier, entretien ou diagnostic',
    infoLead: 'informer sur les services atelier, les conseils auto et les nouveautés',
    followLead: 'suivre un entretien, une réparation ou une demande de devis',
    surveyLead: 'mieux comprendre les besoins véhicule, sécurité et entretien',
    seasonal: 'offre saisonnière pneus / clim / batterie / révision',
    loyalty: 'avantage client fidèle atelier',
    maintenance: 'rappel révision, contrôle ou entretien utile',
    localHook: 'mobilité, sécurité et tranquillité',
    audience: 'automobilistes, flottes locales et familles',
  },
  commerce_boutique: {
    label: 'Commerce / Boutique',
    signature: 'un accueil de proximité et des conseils utiles',
    promoLead: 'mettre en avant une nouveauté, une sélection ou une promotion',
    infoLead: 'informer sur les arrivages, les horaires, les événements et la vie boutique',
    followLead: 'suivre un achat, une commande ou une fidélisation client',
    surveyLead: 'mieux comprendre les envies d’achat et les habitudes clients',
    seasonal: 'offre saisonnière boutique / collection / événement',
    loyalty: 'avantage client fidèle boutique',
    maintenance: 'rappel stock, disponibilité ou nouvelle collection',
    localHook: 'proximité, conseil et découverte',
    audience: 'habitants du quartier, clients réguliers et visiteurs',
  },
  hotel_restaurant: {
    label: 'Hôtel / Restaurant',
    signature: 'une expérience client chaleureuse et mémorable',
    promoLead: 'mettre en avant une formule, un menu, un séjour ou un événement',
    infoLead: 'informer sur la carte, les horaires, les événements et les nouveautés',
    followLead: 'suivre une réservation, un séjour ou une expérience client',
    surveyLead: 'mieux comprendre les attentes de table, séjour et accueil',
    seasonal: 'offre saisonnière menu / séjour / événement',
    loyalty: 'avantage client fidèle table / séjour',
    maintenance: 'rappel réservation, événement ou nouveauté carte',
    localHook: 'convivialité, saveurs et moments partagés',
    audience: 'habitants, touristes, entreprises et groupes',
  },
  beaute_bien_etre: {
    label: 'Beauté / Bien-être',
    signature: 'des soins personnalisés et une expérience apaisante',
    promoLead: 'mettre en avant un soin, une cure, une offre découverte ou une routine',
    infoLead: 'informer sur les soins, les conseils beauté et les nouveautés bien-être',
    followLead: 'suivre un rendez-vous, une cure ou un ressenti client',
    surveyLead: 'mieux comprendre les attentes beauté, détente et fidélité',
    seasonal: 'offre saisonnière soin / routine / mise en beauté',
    loyalty: 'avantage client fidèle soin / institut',
    maintenance: 'rappel routine, cure ou prochain rendez-vous',
    localHook: 'bien-être, détente et confiance en soi',
    audience: 'clientes régulières, nouveaux clients et cartes cadeaux',
  },
  sante: {
    label: 'Santé',
    signature: 'un accompagnement clair, organisé et rassurant',
    promoLead: 'mettre en avant un service, une information utile ou une organisation cabinet',
    infoLead: 'informer sur les horaires, la prévention, les démarches et les services',
    followLead: 'suivre un rendez-vous, un parcours ou un rappel utile',
    surveyLead: 'mieux comprendre l’accueil, le parcours et les besoins d’accompagnement',
    seasonal: 'information saisonnière prévention / organisation cabinet',
    loyalty: 'message d’attention patient / usager',
    maintenance: 'rappel suivi, contrôle ou rendez-vous',
    localHook: 'prévention, organisation et qualité d’accueil',
    audience: 'patients, accompagnants et familles',
  },
  medecine_douce: {
    label: 'Médecine douce',
    signature: 'un accompagnement humain, progressif et personnalisé',
    promoLead: 'mettre en avant une séance découverte, un atelier ou un accompagnement',
    infoLead: 'informer sur les approches, séances, ateliers et nouveautés',
    followLead: 'suivre une séance, un accompagnement ou une évolution',
    surveyLead: 'mieux comprendre les besoins de bien-être, d’équilibre et d’écoute',
    seasonal: 'offre saisonnière accompagnement / atelier / séance découverte',
    loyalty: 'avantage client fidèle accompagnement',
    maintenance: 'rappel séance, atelier ou suivi',
    localHook: 'équilibre, écoute et mieux-être',
    audience: 'personnes en recherche de mieux-être durable',
  },
  immobilier: {
    label: 'Immobilier',
    signature: 'un accompagnement de projet clair et rassurant',
    promoLead: 'mettre en avant une estimation, un bien ou un accompagnement projet',
    infoLead: 'informer sur le marché, les conseils, les biens et les opportunités',
    followLead: 'suivre une estimation, une visite ou un projet de vente / achat',
    surveyLead: 'mieux comprendre les projets de vente, achat, location et investissement',
    seasonal: 'offre saisonnière estimation / projet immobilier',
    loyalty: 'avantage client fidèle / recommandation',
    maintenance: 'rappel projet, estimation ou visite',
    localHook: 'projet de vie, vente et investissement',
    audience: 'vendeurs, acquéreurs, bailleurs et investisseurs',
  },
  services_particuliers: {
    label: 'Services aux particuliers',
    signature: 'un service de proximité réactif et rassurant',
    promoLead: 'mettre en avant une disponibilité, une offre ou un service pratique',
    infoLead: 'informer sur les services, zones d’intervention et modalités',
    followLead: 'suivre une intervention, un besoin récurrent ou une relation client',
    surveyLead: 'mieux comprendre les besoins du quotidien et la satisfaction de service',
    seasonal: 'offre saisonnière service à domicile / accompagnement',
    loyalty: 'avantage client fidèle service à domicile',
    maintenance: 'rappel passage, suivi ou besoin récurrent',
    localHook: 'quotidien facilité et tranquillité',
    audience: 'foyers, seniors, familles et particuliers',
  },
  services_entreprises: {
    label: 'Services aux entreprises',
    signature: 'une expertise claire, utile et orientée résultats',
    promoLead: 'mettre en avant une offre, un audit, une mission ou une expertise',
    infoLead: 'informer sur les services, méthodes, résultats et nouveautés',
    followLead: 'suivre une proposition, une mission ou une relation client',
    surveyLead: 'mieux comprendre les enjeux, besoins et priorités business',
    seasonal: 'offre saisonnière audit / accompagnement / mission',
    loyalty: 'avantage client fidèle / partenaire',
    maintenance: 'rappel suivi mission, audit ou rendez-vous',
    localHook: 'performance, organisation et gain de temps',
    audience: 'TPE, PME, dirigeants et équipes',
  },
  evenementiel: {
    label: 'Événementiel',
    signature: 'des événements fluides, marquants et bien orchestrés',
    promoLead: 'mettre en avant une prestation, une date, une formule ou une expérience',
    infoLead: 'informer sur les disponibilités, formats d’événements et nouveautés',
    followLead: 'suivre un projet, une date ou un retour événement client',
    surveyLead: 'mieux comprendre les envies, formats et besoins événementiels',
    seasonal: 'offre saisonnière événement / réservation / pack',
    loyalty: 'avantage client fidèle / recommandation',
    maintenance: 'rappel date, projet ou prochain événement',
    localHook: 'moments marquants et souvenirs réussis',
    audience: 'particuliers, entreprises, mariages et événements privés',
  },
  transport: {
    label: 'Transport',
    signature: 'un service fiable, ponctuel et rassurant à chaque trajet ou livraison',
    promoLead: 'mettre en avant un trajet, une prestation, une disponibilité ou une tournée',
    infoLead: 'informer sur les zones desservies, les horaires, les modalités et les nouveautés',
    followLead: 'suivre une réservation, une course, une livraison ou une demande de transport',
    surveyLead: 'mieux comprendre les besoins de mobilité, de livraison et de ponctualité',
    seasonal: 'offre saisonnière trajets / transferts / tournées / livraisons',
    loyalty: 'avantage client fidèle transport / trajet / livraison',
    maintenance: 'rappel réservation, trajet, tournée ou créneau de prise en charge',
    localHook: 'ponctualité, mobilité et sérénité',
    audience: 'particuliers, voyageurs, entreprises et clients réguliers',
  },
  animalier: {
    label: 'Animalier',
    signature: 'des soins et services pensés pour le bien-être animal',
    promoLead: 'mettre en avant un service, un accompagnement ou une offre dédiée aux animaux',
    infoLead: 'informer sur les soins, conseils, disponibilités et nouveautés animalier',
    followLead: 'suivre un rendez-vous, une visite ou un accompagnement animal',
    surveyLead: 'mieux comprendre les besoins des animaux et des propriétaires',
    seasonal: 'offre saisonnière bien-être / soins / accompagnement animal',
    loyalty: 'avantage client fidèle animalier',
    maintenance: 'rappel suivi, contrôle, toilettage ou rendez-vous',
    localHook: 'bien-être animal, confiance et accompagnement',
    audience: 'propriétaires, cavaliers, familles et passionnés du monde animal',
  },
  autre: {
    label: 'Autre',
    signature: 'un service clair, professionnel et proche des clients',
    promoLead: 'mettre en avant une offre, un service ou une nouveauté',
    infoLead: 'informer sur l’activité, les services et l’actualité',
    followLead: 'suivre une demande, un projet ou une relation client',
    surveyLead: 'mieux comprendre les attentes clients',
    seasonal: 'offre saisonnière',
    loyalty: 'avantage client fidèle',
    maintenance: 'rappel suivi, rendez-vous ou besoin régulier',
    localHook: 'proximité, confiance et service',
    audience: 'clients locaux et prospects',
  },
};

type VariantSeed = {
  slug: string;
  title: string;
  subject: string;
  body: (pack: SectorPack) => string;
  ctaLabel?: string;
};

const boosterOffresSeeds: VariantSeed[] = [
  {
    slug: 'decouverte',
    title: 'Offre découverte',
    subject: 'Offre découverte {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Nous lançons une offre découverte pensée pour {{metier}}. L’objectif : ${pack.promoLead}.\n\n` +
      '✅ Ce que comprend l’offre\n' +
      '• [Votre offre découverte]\n' +
      '• Prestations concernées : {{services}}\n' +
      '• Zone : {{zones}}\n\n' +
      '👉 Demander les détails / réserver : {{cta_url}}\n\n' +
      'À bientôt,\n{{prenom}} — {{nom_entreprise}}',
    ctaLabel: '{{cta_label}}',
  },
  {
    slug: 'saison',
    title: 'Offre saisonnière',
    subject: 'Notre offre du moment — {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Chez {{nom_entreprise}}, nous proposons actuellement une ${pack.seasonal}.\n\n` +
      '🔎 Idéal pour\n' +
      '• [type de besoin]\n' +
      '• [période / saison]\n' +
      '• [bénéfice principal]\n\n' +
      '📍 Nous intervenons sur {{zones}}.\n' +
      '📞 Contact direct : {{telephone}}\n\n' +
      'Bien à vous,\n{{nom_entreprise}}',
    ctaLabel: '{{cta_label}}',
  },
  {
    slug: 'flash',
    title: 'Offre flash',
    subject: 'Offre flash cette semaine — {{nom_entreprise}}',
    body: () =>
      'Bonjour,\n\n' +
      'Nous avons ouvert quelques créneaux / disponibilités et nous en profitons pour proposer une offre flash.\n\n' +
      '⚡ Offre limitée\n' +
      '• [avantage]\n' +
      '• Jusqu’au [date]\n' +
      '• Sur : {{services}}\n\n' +
      '👉 Réserver / demander un devis : {{cta_url}}\n\n' +
      'À bientôt,\n{{prenom}} — {{nom_entreprise}}',
    ctaLabel: '{{cta_label}}',
  },
  {
    slug: 'fidelite',
    title: 'Offre fidélité',
    subject: 'Merci pour votre fidélité — {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Pour remercier nos clients réguliers, nous mettons en place un ${pack.loyalty}.\n\n` +
      '🎁 Avantage fidélité\n' +
      '• [détail de l’avantage]\n' +
      '• Valable sur : {{services}}\n' +
      '• Contact : {{telephone}}\n\n' +
      'Merci pour votre confiance,\n{{prenom}} — {{nom_entreprise}}',
    ctaLabel: 'En profiter',
  },
  {
    slug: 'nouveau_client',
    title: 'Offre nouveau client',
    subject: 'Bienvenue chez {{nom_entreprise}}',
    body: () =>
      'Bonjour,\n\n' +
      'Si c’est votre première prise de contact avec {{nom_entreprise}}, nous avons prévu une offre de bienvenue.\n\n' +
      '🎁 Offre nouveau client\n' +
      '• Avantage : [remise / bonus / priorité]\n' +
      '• Applicable sur : {{services}}\n' +
      '• Zone : {{zones}}\n\n' +
      '👉 Démarrer : {{cta_url}}\n\n' +
      'À bientôt,\n{{prenom}} — {{nom_entreprise}}',
    ctaLabel: 'Découvrir',
  },
  {
    slug: 'pack',
    title: 'Offre pack / formule',
    subject: 'Pack utile du moment — {{nom_entreprise}}',
    body: () =>
      'Bonjour,\n\n' +
      'Nous avons réuni plusieurs prestations complémentaires dans une formule simple et avantageuse.\n\n' +
      '📦 Le pack comprend\n' +
      '• [prestation 1]\n' +
      '• [prestation 2]\n' +
      '• [bonus / garantie]\n\n' +
      'Parfait pour : [situation client]\n' +
      '👉 Plus d’infos : {{cta_url}}\n\n' +
      'Bien à vous,\n{{nom_entreprise}}',
    ctaLabel: '{{cta_label}}',
  },
  {
    slug: 'disponibilite',
    title: 'Créneaux disponibles',
    subject: 'Des créneaux sont disponibles — {{nom_entreprise}}',
    body: () =>
      'Bonjour,\n\n' +
      'Bonne nouvelle : nous avons ouvert des créneaux disponibles prochainement sur {{zones}}.\n\n' +
      '🗓️ Cela peut être utile si vous cherchez :\n' +
      '• une intervention rapide\n' +
      '• un rendez-vous prioritaire\n' +
      '• un devis / échange dans les prochains jours\n\n' +
      '👉 Réserver : {{cta_url}}\n\n' +
      'À bientôt,\n{{prenom}} — {{nom_entreprise}}',
    ctaLabel: 'Réserver',
  },
];

const fideliserInformationsSeeds: VariantSeed[] = [
  {
    slug: 'nouveaute',
    title: 'Nouvelle prestation',
    subject: 'Nouveau chez {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Nous faisons évoluer notre activité {{metier}} pour ${pack.infoLead}.\n\n` +
      '🆕 Nouveauté\n' +
      '• [nom de la nouveauté]\n' +
      '• Pour qui : [public concerné]\n' +
      '• Bénéfice : [bénéfice]\n\n' +
      '👉 Plus d’infos : {{cta_url}}\n\n' +
      'Cordialement,\n{{nom_entreprise}}',
    ctaLabel: '{{cta_label}}',
  },
  {
    slug: 'infos_pratiques',
    title: 'Infos pratiques',
    subject: 'Infos pratiques {{nom_entreprise}}',
    body: () =>
      'Bonjour,\n\n' +
      'Voici un point utile concernant notre activité.\n\n' +
      '📍 Zone : {{zones}}\n' +
      '🕒 Horaires : {{jours_ouverture}} — {{horaires_ouverture}}\n' +
      '🧩 Prestations : {{services}}\n\n' +
      'Si vous avez une question : {{telephone}}\n\n' +
      'Bien à vous,\n{{prenom}} — {{nom_entreprise}}',
  },
  {
    slug: 'conseil',
    title: 'Conseil métier',
    subject: 'Conseil utile de {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Petit conseil autour de notre métier {{metier}}, lié à ${pack.localHook}.\n\n` +
      '💡 Conseil du moment\n' +
      '• [conseil 1]\n' +
      '• [conseil 2]\n' +
      '• [conseil 3]\n\n' +
      'Si besoin, nous restons disponibles sur {{zones}}.\n\n' +
      'Cordialement,\n{{nom_entreprise}}',
  },
  {
    slug: 'actualite',
    title: 'Actualité entreprise',
    subject: 'Les dernières nouvelles de {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Petit point d’actualité sur notre activité {{metier}}. Notre priorité reste ${pack.signature}.\n\n` +
      '🗞️ Actualité\n' +
      '• [actualité 1]\n' +
      '• [actualité 2]\n' +
      '• [actualité 3]\n\n' +
      'À bientôt,\n{{prenom}} — {{nom_entreprise}}',
  },
  {
    slug: 'partenariat',
    title: 'Partenariat / nouveauté',
    subject: 'Une nouveauté utile pour nos clients',
    body: () =>
      'Bonjour,\n\n' +
      'Nous mettons en place un nouveau partenariat / service complémentaire pour mieux accompagner nos clients.\n\n' +
      '🤝 Ce que cela apporte\n' +
      '• [bénéfice 1]\n' +
      '• [bénéfice 2]\n' +
      '• [bénéfice 3]\n\n' +
      'Toujours avec notre approche : {{forces}}\n\n' +
      'Bien à vous,\n{{nom_entreprise}}',
  },
  {
    slug: 'local',
    title: 'Actualité locale',
    subject: 'Notre actualité locale — {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Parce que notre activité s’adresse à ${pack.audience}, nous partageons aujourd’hui une actualité locale utile.\n\n` +
      '📍 Dans votre secteur\n' +
      '• [actualité locale]\n' +
      '• [période concernée]\n' +
      '• [conseil associé]\n\n' +
      'Bien à vous,\n{{nom_entreprise}}',
  },
  {
    slug: 'coulisses',
    title: 'Les coulisses de notre métier',
    subject: 'Dans les coulisses de {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Aujourd’hui, nous vous partageons un aperçu de notre métier {{metier}} et de notre manière de travailler pour ${pack.signature}.\n\n` +
      '🔍 En pratique\n' +
      '• [étape 1]\n' +
      '• [étape 2]\n' +
      '• [étape 3]\n\n' +
      'Merci pour votre confiance,\n{{prenom}} — {{nom_entreprise}}',
  },
];

const fideliserSuivisSeeds: VariantSeed[] = [
  {
    slug: 'merci',
    title: 'Merci après intervention',
    subject: 'Merci pour votre confiance — {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Merci encore pour votre confiance. Chez {{nom_entreprise}}, nous mettons tout en œuvre pour ${pack.signature}.\n\n` +
      'Si vous avez la moindre question après notre passage / échange, répondez simplement à ce message ou appelez-nous au {{telephone}}.\n\n' +
      'Bien à vous,\n{{prenom}} — {{nom_entreprise}}',
  },
  {
    slug: 'prise_nouvelles',
    title: 'Prise de nouvelles',
    subject: 'Tout se passe bien ? — {{nom_entreprise}}',
    body: () =>
      'Bonjour,\n\n' +
      'Nous revenons vers vous pour vérifier que tout se passe bien suite à notre dernière intervention / rendez-vous.\n\n' +
      '🔎 Dites-nous simplement :\n' +
      '• si tout est conforme à vos attentes\n' +
      '• si un ajustement est nécessaire\n' +
      '• si vous avez une question\n\n' +
      'Réponse rapide ici ou au {{telephone}}.\n\n' +
      'Merci,\n{{nom_entreprise}}',
  },
  {
    slug: 'rappel',
    title: 'Rappel utile',
    subject: 'Petit rappel utile — {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Petit rappel : ${pack.maintenance}.\n\n` +
      '✅ Pourquoi c’est utile\n' +
      '• anticiper\n' +
      '• éviter les imprévus\n' +
      '• garder un bon niveau de service / confort\n\n' +
      'Si vous souhaitez programmer cela, contactez-nous : {{telephone}} ou {{cta_url}}\n\n' +
      'Cordialement,\n{{prenom}} — {{nom_entreprise}}',
    ctaLabel: '{{cta_label}}',
  },
  {
    slug: 'relance_devis',
    title: 'Relance devis / projet',
    subject: 'Suite à votre demande — {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Je reviens vers vous au sujet de votre projet / demande. Notre rôle est de ${pack.followLead}.\n\n` +
      'Si vous le souhaitez, nous pouvons affiner ensemble :\n' +
      '• le besoin exact\n' +
      '• le calendrier\n' +
      '• la solution la plus adaptée\n\n' +
      '📞 Un échange rapide : {{telephone}}\n\n' +
      'Bien à vous,\n{{prenom}} — {{nom_entreprise}}',
  },
  {
    slug: 'fidelite',
    title: 'Fidélité / retour client',
    subject: 'Merci de votre fidélité — {{nom_entreprise}}',
    body: () =>
      'Bonjour,\n\n' +
      'Votre confiance compte beaucoup pour nous. Pour vous remercier, nous avons préparé un message dédié à nos clients réguliers.\n\n' +
      '💬 Si vous avez un besoin à venir autour de {{services}}, nous sommes disponibles sur {{zones}}.\n\n' +
      'Merci encore,\n{{prenom}} — {{nom_entreprise}}',
  },
  {
    slug: 'apres_vente',
    title: 'Suivi après-vente / après-service',
    subject: 'Nous restons disponibles — {{nom_entreprise}}',
    body: () =>
      'Bonjour,\n\n' +
      'Suite à notre intervention / rendez-vous, nous restons à votre disposition pour toute question complémentaire.\n\n' +
      '📌 Besoin d’aide sur :\n' +
      '• l’utilisation\n' +
      '• l’entretien\n' +
      '• une précision pratique\n\n' +
      'Répondez simplement à ce message.\n\n' +
      'Bien à vous,\n{{nom_entreprise}}',
  },
  {
    slug: 'reprise_contact',
    title: 'Reprise de contact',
    subject: 'Nous reprenons contact — {{nom_entreprise}}',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Cela faisait quelque temps que nous n’avions pas échangé. Comme nous accompagnons souvent nos clients autour de ${pack.localHook}, nous revenons vers vous.\n\n` +
      'Si vous avez un projet, une question ou un besoin à venir, nous serons ravis d’en parler.\n\n' +
      'À bientôt,\n{{prenom}} — {{nom_entreprise}}',
  },
];

const fideliserEnquetesSeeds: VariantSeed[] = [
  {
    slug: 'satisfaction',
    title: 'Satisfaction client',
    subject: 'Votre avis nous aide à progresser',
    body: () =>
      'Bonjour,\n\n' +
      'Pour continuer à améliorer notre activité, pourriez-vous répondre à 3 questions rapides ?\n\n' +
      '1) Quelle note donneriez-vous à notre service ?\n' +
      '2) Qu’avez-vous le plus apprécié ?\n' +
      '3) Que devrions-nous améliorer ?\n\n' +
      'Vous pouvez répondre directement à ce message.\n\n' +
      'Merci beaucoup,\n{{prenom}} — {{nom_entreprise}}',
  },
  {
    slug: 'besoins',
    title: 'Besoins à venir',
    subject: 'Avez-vous un besoin à venir ?',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Nous cherchons à mieux comprendre les prochains besoins de nos clients. Dans notre domaine {{metier}}, ${pack.surveyLead}.\n\n` +
      'Avez-vous un besoin prévu dans les prochains mois ? Si oui :\n' +
      '• sur quel sujet ?\n' +
      '• dans quel délai ?\n' +
      '• sur quelle zone ?\n\n' +
      'Merci pour votre retour,\n{{nom_entreprise}}',
  },
  {
    slug: 'recommandation',
    title: 'Recommandation / bouche-à-oreille',
    subject: 'À qui recommanderiez-vous {{nom_entreprise}} ?',
    body: () =>
      'Bonjour,\n\n' +
      'Une question rapide : à qui recommanderiez-vous notre activité ?\n\n' +
      '• un proche ?\n' +
      '• un voisin ?\n' +
      '• un collègue / partenaire ?\n\n' +
      'Si vous pensez à quelqu’un, répondez simplement à ce message.\n\n' +
      'Merci d’avance,\n{{prenom}} — {{nom_entreprise}}',
  },
  {
    slug: 'attentes',
    title: 'Attentes clients',
    subject: 'Qu’attendez-vous le plus de nous ?',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Pour mieux vous servir, nous cherchons à comprendre ce qui compte le plus pour vous dans notre univers ${pack.label.toLowerCase()}.\n\n` +
      'Qu’est-ce qui vous paraît prioritaire ?\n' +
      '• la rapidité\n' +
      '• le prix\n' +
      '• le conseil\n' +
      '• le suivi\n\n' +
      'Merci pour votre réponse,\n{{nom_entreprise}}',
  },
  {
    slug: 'nouveau_service',
    title: 'Avis sur un futur service',
    subject: 'Votre avis sur une future nouveauté',
    body: () =>
      'Bonjour,\n\n' +
      'Nous réfléchissons à lancer une nouvelle offre / un nouveau service. Avant cela, nous aimerions connaître votre avis.\n\n' +
      'Seriez-vous intéressé par :\n' +
      '• [service / formule 1]\n' +
      '• [service / formule 2]\n' +
      '• [service / formule 3]\n\n' +
      'Un simple retour nous aide beaucoup.\n\n' +
      'Merci,\n{{prenom}} — {{nom_entreprise}}',
  },
  {
    slug: 'experience',
    title: 'Retour sur l’expérience client',
    subject: 'Comment avez-vous vécu votre expérience avec nous ?',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Comme nous voulons continuer à ${pack.signature}, nous aimerions avoir votre retour sur votre expérience globale.\n\n` +
      'En quelques mots :\n' +
      '• Qu’est-ce qui vous a rassuré ?\n' +
      '• Qu’est-ce qui pourrait être encore plus simple ?\n' +
      '• Recommanderiez-vous notre service ?\n\n' +
      'Merci beaucoup,\n{{nom_entreprise}}',
  },
  {
    slug: 'localite',
    title: 'Habitudes locales / fréquence',
    subject: 'Question rapide sur vos habitudes',
    body: (pack) =>
      'Bonjour,\n\n' +
      `Pour mieux répondre aux besoins liés à ${pack.localHook}, nous faisons un petit point rapide auprès de nos clients.\n\n` +
      'À quelle fréquence avez-vous besoin de ce type de service / prestation ?\n' +
      '• ponctuellement\n' +
      '• régulièrement\n' +
      '• selon la saison\n' +
      '• selon un projet précis\n\n' +
      'Merci pour votre aide,\n{{prenom}} — {{nom_entreprise}}',
  },
];

function buildTemplatesForAction(
  sector: ActivitySectorCategory,
  action: TemplateAction,
  seeds: VariantSeed[]
): TemplateDef[] {
  const pack = PACKS[sector] ?? PACKS.autre;
  const module = action === 'offres' || action === 'avis' ? 'booster' : 'fideliser';
  return seeds.map((seed) => ({
    key: `${module}_${action}_${sector}_${seed.slug}`,
    module,
    action,
    category: `${action}_${sector}_${seed.slug}`,
    title: seed.title,
    subject: seed.subject,
    body: seed.body(pack),
    ctaLabel: seed.ctaLabel,
    sectorCategory: sector,
  }));
}

export function buildSectorTemplates(): TemplateDef[] {
  const out: TemplateDef[] = [];
  for (const opt of ACTIVITY_SECTOR_OPTIONS) {
    const sector = opt.value;
    if (sector === 'autre') continue;
    out.push(
      ...buildTemplatesForAction(sector, 'offres', boosterOffresSeeds),
      ...buildTemplatesForAction(sector, 'informations', fideliserInformationsSeeds),
      ...buildTemplatesForAction(sector, 'suivis', fideliserSuivisSeeds),
      ...buildTemplatesForAction(sector, 'enquetes', fideliserEnquetesSeeds)
    );
  }
  return out;
}
