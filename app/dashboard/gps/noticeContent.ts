export type GpsFaq = { q: string; a: string };

export type GpsArticle = {
  id: string;
  title: string;
  keywords: string[];
  intro: string;
  steps: string[];
  checks?: string[];
  pitfalls?: string[];
  faq?: GpsFaq[];
  links?: Array<{ label: string; href: string }>;
  duration?: string;
  goal?: string;
};

export type GpsSection = {
  id: string;
  title: string;
  emoji: string;
  description: string;
  articles: GpsArticle[];
};

export const GPS_SECTIONS: GpsSection[] = [
  {
    id: "demarrer",
    title: "Démarrer",
    emoji: "🚀",
    description: "La base : renseigner l’entreprise pour que l’IA travaille vraiment bien.",
    articles: [
      {
        id: "demarrer-express",
        title: "Préparer iNrCy correctement",
        keywords: ["démarrer", "première fois", "mon activité", "mon profil", "configuration ia", "panier moyen", "taux de transformation"],
        duration: "5 min",
        goal: "IA utile",
        intro:
          "Avant de publier ou d’envoyer des campagnes, iNrCy doit connaître l’entreprise. Sans Mon activité, Mon profil et Configuration IA, l’IA reste trop générale.",
        steps: [
          "Remplir **Mon activité** : métier, prestations, spécialités, zones d’intervention, clients ciblés et points forts.",
          "Compléter **Mon profil** : coordonnées, téléphone, adresse, site, horaires et informations visibles par les clients.",
          "Personnaliser **Configuration IA** : ton, style, façon de parler, offres à mettre en avant et éléments à éviter.",
          "Renseigner le **panier moyen** et le **taux de transformation** pour calculer un potentiel plus réaliste.",
        ],
        checks: [
          "Mon activité est précise et à jour.",
          "Mon profil contient les bonnes coordonnées.",
          "Configuration IA reflète bien le style de l’entreprise.",
          "Panier moyen et taux de transformation sont cohérents.",
        ],
        pitfalls: [
          "Donner les bonnes informations à l’IA avant de lui demander de vendre, publier ou fidéliser.",
          "Une IA bien configurée produit des contenus beaucoup plus naturels, locaux et efficaces.",
        ],
        links: [
          { label: "Ouvrir Mon activité", href: "/dashboard/settings/activite" },
          { label: "Ouvrir Mon profil", href: "/dashboard/settings/profil" },
          { label: "Configuration IA", href: "/dashboard/settings/ia" },
        ],
      },
    ],
  },
  {
    id: "canaux",
    title: "Les canaux",
    emoji: "🧩",
    description: "Relier les endroits où l’entreprise est visible : sites, Google et réseaux.",
    articles: [
      {
        id: "canaux-express",
        title: "Connecter les bonnes bulles",
        keywords: ["canaux", "bulles", "connexion", "configurer", "connecter", "site inrcy", "site web", "google", "facebook", "instagram", "linkedin", "statistiques", "publications"],
        duration: "5 min",
        goal: "Visibilité reliée",
        intro:
          "Les canaux relient iNrCy aux plateformes du pro. La connexion permet de récupérer des données, d’alimenter iNrStats et de publier sur le canal concerné.",
        steps: [
          "Ouvrir **Les canaux**, choisir la bulle concernée, puis cliquer sur **Configurer**.",
          "Cliquer sur **Connecter** et suivre la procédure demandée par Google, Meta, LinkedIn ou le site.",
          "Vérifier que le bon compte professionnel est relié et que les autorisations nécessaires sont acceptées.",
          "Une fois connecté, le canal peut remonter des statistiques et recevoir des publications depuis **Booster**.",
        ],
        checks: [
          "Le canal affiche bien Connecté ou Configuré.",
          "Le bon compte professionnel est relié.",
          "Les autorisations de stats et de publication sont acceptées quand elles sont demandées.",
          "Site iNrCy se configure maintenant comme un vrai site : URL, informations, GA4/GSC si disponibles.",
        ],
        pitfalls: [
          "Commencer par les canaux les plus utiles : souvent Google Business, Site iNrCy ou Site web.",
          "Un canal connecté sert à analyser, comprendre et publier plus facilement.",
        ],
        links: [{ label: "Ouvrir les canaux", href: "/dashboard" }],
      },
    ],
  },
  {
    id: "generateur",
    title: "Générateur",
    emoji: "⚡",
    description: "La lecture rapide et globale de l’efficacité de la communication.",
    articles: [
      {
        id: "generateur-express",
        title: "Lire l’efficacité globale",
        keywords: ["générateur", "demandes captées", "opportunités", "potentiel", "ca potentiel", "panier moyen", "taux de transformation", "unités d'inertie", "ui"],
        duration: "2 min",
        goal: "Vision rapide",
        intro:
          "Le Générateur montre en un coup d’œil ce que les canaux ont généré sur 7 et 30 jours, puis estime le potentiel des 30 prochains jours.",
        steps: [
          "Lire les **demandes captées** sur 7 et 30 jours : appels, clics, formulaires ou autres signaux utiles.",
          "Regarder les **opportunités activables** : le potentiel estimé pour les 30 prochains jours.",
          "Vérifier le **CA potentiel**, calculé avec le panier moyen et le taux de transformation renseignés.",
          "Suivre les **Unités d’Inertie** : elles représentent la puissance des actions de communication du pro et peuvent servir dans la Boutique.",
        ],
        checks: [
          "Mon activité, panier moyen et taux de transformation sont renseignés.",
          "Au moins un canal important est connecté ou configuré.",
          "Les données 7j / 30j ont eu le temps de remonter.",
          "Les Unités d’Inertie progressent avec les actions et peuvent servir dans la Boutique.",
        ],
        pitfalls: [
          "Le Générateur n’est pas un tableau technique : c’est le compteur global de la communication.",
          "Plus le pro publie, relance et utilise iNrCy, plus ses Unités d’Inertie progressent.",
          "Les Unités d’Inertie sont aussi utiles pour accéder à des avantages dans la Boutique.",
        ],
        links: [
          { label: "Ouvrir Générateur", href: "/dashboard" },
          { label: "Ouvrir iNrStats", href: "/dashboard/stats" },
          { label: "Ouvrir la Boutique", href: "/dashboard?panel=boutique" },
        ],
      },
    ],
  },
  {
    id: "inrstats",
    title: "iNrStats",
    emoji: "📊",
    description: "La traduction business des données canal par canal, sans jargon technique.",
    articles: [
      {
        id: "inrstats-express",
        title: "Comprendre ce que disent les données",
        keywords: ["inrstats", "stats", "statistiques", "données", "appels", "clics", "visites", "formulaires", "demandes", "lecture business"],
        duration: "2 min",
        goal: "Comprendre",
        intro:
          "iNrStats traduit les données des canaux en lecture business simple : appels, clics, visites, formulaires, demandes et signaux utiles.",
        steps: [
          "Connecter les canaux utiles pour laisser iNrCy récupérer les données disponibles.",
          "Lire les résultats par canal : Google, sites, Facebook, Instagram ou LinkedIn selon les connexions.",
          "Repérer ce qui fonctionne : appels, clics, itinéraires, visites, formulaires ou interactions.",
          "Utiliser ensuite **Booster** ou **Fidéliser** pour agir sur les bons leviers.",
        ],
        checks: [
          "Les canaux sont bien connectés.",
          "Les périodes affichées sont cohérentes.",
          "Une absence de données peut être normale au démarrage.",
          "Les dernières données fiables sont conservées si une plateforme répond mal.",
        ],
        pitfalls: [
          "iNrStats sert à comprendre ce qui se passe canal par canal.",
          "Le Générateur sert à voir rapidement l’efficacité globale et le potentiel à venir.",
        ],
        links: [
          { label: "Ouvrir iNrStats", href: "/dashboard/stats" },
          { label: "Ouvrir les canaux", href: "/dashboard" },
          { label: "Ouvrir Booster", href: "/dashboard/booster" },
        ],
      },
    ],
  },
  {
    id: "booster",
    title: "Booster",
    emoji: "📣",
    description: "Publier vite, bien et sur plusieurs canaux pour développer l’activité.",
    articles: [
      {
        id: "booster-express",
        title: "Publier en moins d’une minute",
        keywords: ["booster", "publier", "publication", "multicanal", "offrir", "récolter", "commercial", "avis", "nouveaux clients"],
        duration: "3 min",
        goal: "Capter",
        intro:
          "Booster sert à développer la visibilité et capter de nouveaux clients. L’outil le plus important est Publier : une communication qualitative, multicanale et rapide.",
        steps: [
          "Utiliser **Publier** pour communiquer sur un chantier, une offre, une nouveauté, un conseil ou une photo.",
          "Choisir les canaux utiles : site, Google Business, Facebook, Instagram ou LinkedIn.",
          "Vérifier le texte, l’image, le ton et l’appel à l’action : appeler, demander un devis ou visiter le site.",
          "Utiliser ensuite **Offrir** et **Récolter** pour créer des actions commerciales personnalisées.",
        ],
        checks: [
          "Configuration IA est bien remplie.",
          "Les canaux de publication sont connectés.",
          "Le contenu correspond au métier et à la zone du pro.",
          "L’appel à l’action est clair.",
        ],
        pitfalls: [
          "Booster sert surtout à se développer et créer de nouvelles demandes.",
          "Publier régulièrement vaut mieux que chercher la publication parfaite une fois tous les trois mois.",
        ],
        links: [
          { label: "Ouvrir Booster", href: "/dashboard/booster" },
          { label: "Publier", href: "/dashboard/booster" },
          { label: "Configuration IA", href: "/dashboard/settings/ia" },
          { label: "Ouvrir les canaux", href: "/dashboard" },
        ],
      },
    ],
  },
  {
    id: "fideliser",
    title: "Fidéliser",
    emoji: "💌",
    description: "Garder le lien, faire revenir les clients et renforcer l’activité dans le temps.",
    articles: [
      {
        id: "fideliser-express",
        title: "Entretenir la relation client",
        keywords: ["fidéliser", "campagne", "mail", "email", "clients", "relance", "pérenniser", "revenir", "relation client"],
        duration: "4 min",
        goal: "Garder",
        intro:
          "Booster aide à développer et capter de nouveaux clients. Fidéliser aide à garder le lien, faire revenir les anciens contacts et renforcer l’entreprise dans la durée.",
        steps: [
          "Choisir un objectif : informer, relancer, suivre, enquêter, offrir ou récolter un retour client.",
          "Utiliser les contacts du **CRM** ou sélectionner les destinataires utiles.",
          "Laisser iNrCy générer un message personnalisé, puis l’ajuster si besoin.",
          "Envoyer depuis **iNr’Send** pour profiter de la boîte mail configurée et de la signature.",
        ],
        checks: [
          "Les contacts sont présents dans le CRM.",
          "La boîte mail est configurée dans iNr’Send.",
          "La signature iNr’Send est prête.",
          "Le message correspond bien à la relation client.",
        ],
        pitfalls: [
          "Un ancien client coûte souvent moins cher à faire revenir qu’un nouveau client à trouver.",
          "Une relance ciblée vaut mieux qu’un grand envoi générique sans objectif.",
        ],
        links: [
          { label: "Ouvrir Fidéliser", href: "/dashboard/fideliser" },
          { label: "Ouvrir CRM", href: "/dashboard/crm" },
          { label: "Ouvrir iNr’Send", href: "/dashboard/mails" },
        ],
      },
    ],
  },
  {
    id: "inrsend",
    title: "iNr’Send",
    emoji: "📬",
    description: "La banque de communication du pro : tout retrouver, gérer et réutiliser.",
    articles: [
      {
        id: "inrsend-express",
        title: "Centraliser toutes les communications",
        keywords: ["inrsend", "mails", "boîte mail", "signature", "publications", "historique", "banque de communication", "réutiliser", "modifier", "supprimer", "campagnes"],
        duration: "3 min",
        goal: "Centraliser",
        intro:
          "iNr’Send regroupe toutes les communications réalisées depuis iNrCy : mails, publications, campagnes, relances, devis et factures envoyés.",
        steps: [
          "Commencer par connecter les **boîtes mail** utilisées pour envoyer les communications.",
          "Créer une **signature iNr’Send** propre : elle sera ajoutée aux mails et évite les doubles signatures.",
          "Consulter l’historique pour retrouver publications, mails, campagnes, devis, factures et résultats.",
          "Réutiliser, modifier, supprimer ou revoir une communication sans retourner dans chaque outil séparément.",
        ],
        checks: [
          "Au moins une boîte mail est connectée.",
          "La signature est créée et correcte.",
          "Les envois apparaissent bien dans l’historique.",
          "Les détails indiquent les réussites, erreurs ou envois partiels.",
        ],
        pitfalls: [
          "iNr’Send est la base avant les campagnes, devis, factures et relances propres.",
          "La banque de communication permet de repartir de ce qui a déjà fonctionné.",
        ],
        links: [
          { label: "Ouvrir iNr’Send", href: "/dashboard/mails" },
          { label: "Configurer boîte mail", href: "/dashboard?panel=mails" },
          { label: "Créer ma signature", href: "/dashboard?panel=mails" },
        ],
      },
    ],
  },
  {
    id: "crm",
    title: "CRM",
    emoji: "👥",
    description: "La base contacts propre pour retrouver clients, prospects et partenaires.",
    articles: [
      {
        id: "crm-express",
        title: "Garder les bons contacts sous la main",
        keywords: ["crm", "contacts", "import", "export", "prospect", "client", "campagne", "inrsend", "réutilisable"],
        duration: "3 min",
        goal: "Contacts propres",
        intro:
          "Le CRM sert à stocker et organiser les contacts. Les campagnes se pilotent depuis Booster, Fidéliser ou iNr’Send, mais elles s’appuient sur une base propre.",
        steps: [
          "Ajouter un contact à la main ou importer une liste existante.",
          "Renseigner au minimum nom/raison sociale, mail ou téléphone, catégorie et type.",
          "Utiliser la recherche et les filtres pour retrouver rapidement les bons contacts.",
          "Retrouver ensuite les campagnes dans **iNr’Send** : elles sont réutilisables, renvoyables, contrôlables et modifiables.",
        ],
        checks: [
          "Mail ou téléphone est présent pour pouvoir relancer vraiment.",
          "Adresse, CP et ville sont propres quand ils sont disponibles.",
          "Le type de contact correspond bien : prospect, client ou autre.",
          "Le SIREN ne doit pas bloquer les particuliers ou contacts sans numéro.",
        ],
        pitfalls: [
          "Un CRM utile reste simple : quelques infos fiables valent mieux que beaucoup de fiches incomplètes.",
          "Le CRM prépare les actions ; iNr’Send garde l’historique des campagnes envoyées.",
        ],
        links: [
          { label: "Ouvrir CRM", href: "/dashboard/crm" },
          { label: "Ajouter un contact", href: "/dashboard/crm" },
          { label: "Importer des contacts", href: "/dashboard/crm" },
          { label: "Ouvrir iNr’Send", href: "/dashboard/mails" },
        ],
      },
    ],
  },
  {
    id: "agenda",
    title: "Agenda",
    emoji: "📅",
    description: "Créer des rendez-vous et envoyer automatiquement les rappels utiles.",
    articles: [
      {
        id: "agenda-express",
        title: "Poser un rendez-vous proprement",
        keywords: ["agenda", "rendez-vous", "rdv", "rappel", "invité", "mail", "boîte d'envoi", "réglages"],
        duration: "2 min",
        goal: "Éviter les oublis",
        intro:
          "L’Agenda sert à créer des rendez-vous et à déclencher les rappels par mail au client, aux invités éventuels et au pro.",
        steps: [
          "Avant les rappels, ouvrir les **réglages Agenda** et choisir la boîte d’envoi utilisée.",
          "Créer l’événement avec date, heure, statut et coordonnées du client.",
          "Ajouter un invité si une autre personne doit recevoir les rappels.",
          "Choisir les rappels utiles : confirmation, 48h, 24h ou 2h selon les besoins.",
        ],
        checks: [
          "La boîte d’envoi des rappels est bien réglée.",
          "Le client et les invités ont une adresse mail correcte.",
          "La date, l’heure de début et l’heure de fin sont cohérentes.",
          "Les rappels sélectionnés correspondent au vrai besoin du rendez-vous.",
        ],
        pitfalls: [
          "Les rappels valent seulement si l’e-mail du client et des invités est correct.",
          "Modifier un rendez-vous seulement quand une vraie information change.",
        ],
        links: [
          { label: "Ouvrir Agenda", href: "/dashboard/agenda" },
          { label: "Nouvel événement", href: "/dashboard/agenda" },
          { label: "Réglages Agenda", href: "/dashboard?panel=agenda" },
        ],
      },
    ],
  },
  {
    id: "documents",
    title: "Devis & Factures",
    emoji: "🧾",
    description: "Créer, sauvegarder, figer et envoyer des documents sans mélanger les étapes.",
    articles: [
      {
        id: "documents-express",
        title: "Comprendre le bon workflow",
        keywords: ["devis", "facture", "documents", "figer", "envoyer", "modèle", "réglages", "sauvegarde", "inrsend"],
        duration: "4 min",
        goal: "Documents propres",
        intro:
          "Sauvegarder permet de continuer plus tard. Figer verrouille le document quand il devient officiel ou prêt à être envoyé.",
        steps: [
          "Créer le document et renseigner client, lignes, TVA, conditions et coordonnées.",
          "Sauvegarder tant que le document doit rester modifiable et repris plus tard.",
          "Figer seulement quand il est prêt : numéro, version officielle et envoi possible.",
          "Retrouver aussi les documents envoyés par mail dans **iNr’Send** avec les autres communications.",
        ],
        checks: [
          "Sauvegarder ne veut pas dire officialiser.",
          "Figer verrouille le document avant émission ou envoi.",
          "Les sauvegardes conservent le travail pour le reprendre plus tard.",
          "Le contact peut être lié ou ajouté au CRM pour réutilisation.",
        ],
        pitfalls: [
          "Ne pas figer trop tôt : une fois officiel, le document doit rester cohérent.",
          "Les documents envoyés deviennent aussi une communication retrouvable dans iNr’Send.",
        ],
        links: [
          { label: "Créer un devis", href: "/dashboard/devis/new" },
          { label: "Créer une facture", href: "/dashboard/factures/new" },
          { label: "Voir mes documents", href: "/dashboard?panel=documents" },
          { label: "Réglages", href: "/dashboard?panel=documents" },
        ],
      },
    ],
  },
  {
    id: "abonnement",
    title: "Essai & abonnement",
    emoji: "💳",
    description: "Comprendre l’essai, l’accès et l’offre active du compte.",
    articles: [
      {
        id: "abonnement-express",
        title: "Comprendre l’accès iNrCy",
        keywords: ["abonnement", "essai", "tarif", "partenaire", "paiement", "stripe", "résiliation", "offre"],
        duration: "1 min",
        goal: "Accès clair",
        intro:
          "iNrCy peut être testé avant engagement. L’accès dépend ensuite de l’offre active du compte et des conditions prévues avec l’équipe iNrCy.",
        steps: [
          "Utiliser la période d’essai pour découvrir les outils et connecter les premiers éléments.",
          "Consulter l’espace abonnement pour voir l’état de l’accès et l’offre active.",
          "Choisir ou valider une offre quand l’essai arrive à son terme.",
          "Contacter l’équipe iNrCy en cas de question commerciale ou de besoin particulier.",
        ],
        checks: [
          "La période d’essai est bien en cours ou terminée.",
          "L’offre active correspond au compte du professionnel.",
          "Le moyen de paiement ou l’accès abonnement est à jour si nécessaire.",
          "L’équipe iNrCy reste le bon contact pour une question d’offre.",
        ],
        pitfalls: [
          "Le GPS explique le fonctionnement, pas une grille tarifaire figée.",
          "L’offre réelle du compte reste la référence côté abonnement.",
        ],
        links: [
          { label: "Voir mon abonnement", href: "/dashboard/settings/abonnement" },
          { label: "Nous contacter", href: "/dashboard?panel=contact" },
        ],
      },
    ],
  },
  {
    id: "problemes",
    title: "Problèmes fréquents",
    emoji: "🛠️",
    description: "Les vérifications rapides avant de penser qu’il y a un bug.",
    articles: [
      {
        id: "problemes-express",
        title: "Les réflexes simples",
        keywords: ["problème", "bug", "stats", "publication", "mail", "spam", "déconnecté", "erreur"],
        duration: "2 min",
        goal: "Débloquer vite",
        intro:
          "La plupart des blocages viennent d’un canal déconnecté, d’un droit expiré, d’une donnée pas encore disponible ou d’un champ incomplet.",
        steps: [
          "Pas de stats : vérifier qu’au moins un canal utile est connecté et attendre la prochaine mise à jour.",
          "Publication refusée : reconnecter le canal puis relancer avec un message ou une image plus simple.",
          "Mail en spam : vérifier domaine, signature, expéditeur et éviter les contenus trop promotionnels.",
          "Image non visible : réduire le poids, adapter le format, puis réessayer.",
        ],
        checks: [
          "Reconnecter un canal règle beaucoup de problèmes d’autorisation.",
          "Lire le détail dans iNr’Send avant de conclure que tout a échoué.",
          "Vérifier Mon activité, Mon profil et Configuration IA si le contenu semble trop générique.",
          "Attendre la remontée des plateformes externes quand la donnée vient de Google, Meta ou LinkedIn.",
        ],
        pitfalls: [
          "Ne pas forcer dix fois la même action : corriger la cause puis relancer proprement.",
          "Un message d’erreur clair dans iNr’Send vaut mieux qu’une supposition.",
        ],
      },
    ],
  },
  {
    id: "conseils",
    title: "Conseils iNrCy",
    emoji: "💡",
    description: "Les habitudes simples qui rendent l’application vraiment rentable.",
    articles: [
      {
        id: "conseils-express",
        title: "Les bons réflexes",
        keywords: ["conseils", "routine", "communication", "avis", "visibilité", "seo", "clients"],
        duration: "2 min",
        goal: "Progresser régulièrement",
        intro:
          "iNrCy fonctionne mieux avec une petite régularité qu’avec de grosses actions rares. Le pro doit rester visible, actif et rassurant.",
        steps: [
          "Publier une fois par semaine une preuve d’activité : chantier, conseil, photo, offre ou actu.",
          "Demander des avis après les clients satisfaits avec une action Récolter.",
          "Mettre à jour les infos visibles dès qu’un horaire, numéro ou service change.",
          "Relancer les anciens clients et prospects plutôt que chercher uniquement de nouveaux contacts.",
        ],
        checks: [
          "Régularité > perfection.",
          "Les contenus locaux précis aident la visibilité web et IA.",
          "Les avis et les preuves terrain rassurent plus qu’un discours trop parfait.",
          "Les coordonnées doivent rester cohérentes partout.",
        ],
        pitfalls: [
          "Une petite action chaque semaine est meilleure qu’un gros effort une fois par mois.",
          "Montrer des preuves réelles rassure plus qu’un texte trop commercial.",
        ],
        links: [{ label: "Ouvrir Booster", href: "/dashboard/booster" }],
      },
    ],
  },
];
