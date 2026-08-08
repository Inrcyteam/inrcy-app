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
        keywords: ["démarrer", "première fois", "mon activité", "mon profil", "configuration ia", "réglages du générateur", "panier moyen", "taux de transformation"],
        duration: "5 min",
        goal: "IA utile",
        intro:
          "Avant de publier ou d’envoyer des campagnes, iNrCy doit connaître l’entreprise. Sans Mon activité, Mon profil et Configuration IA, l’IA reste trop générale.",
        steps: [
          "Remplir **Mon activité** : métier, prestations, spécialités, zones d’intervention, clients ciblés et points forts.",
          "Compléter **Mon profil** : identité, coordonnées, nom de l’entreprise, ville et logo si vous en avez un.",
          "Personnaliser **Configuration IA** : ton, style, façon de parler, offres à mettre en avant et éléments à éviter.",
          "Ajuster, si nécessaire, le **panier moyen** et le **taux de transformation** depuis les Réglages du générateur. iNrCy propose déjà des repères adaptés au secteur.",
        ],
        checks: [
          "Mon activité est précise et à jour.",
          "Mon profil contient les bonnes coordonnées et la bonne implantation.",
          "Configuration IA reflète bien le style de l’entreprise.",
          "Les Réglages du générateur correspondent à la réalité de l’entreprise.",
        ],
        pitfalls: [
          "Donner les bonnes informations à l’IA avant de lui demander de vendre, publier ou fidéliser.",
          "Une IA bien configurée produit des contenus beaucoup plus naturels, locaux et efficaces.",
        ],
        links: [
          { label: "Ouvrir Mon activité", href: "/dashboard?panel=activite&panelSource=gps" },
          { label: "Ouvrir Mon profil", href: "/dashboard?panel=profil&panelSource=gps" },
          { label: "Configuration IA", href: "/dashboard?panel=ia&panelSource=gps" },
        ],
      },
      {
        id: "demarrer-rangement",
        title: "Savoir où ranger chaque information",
        keywords: ["profil", "activité", "juridique", "siret", "tva", "capital", "panier moyen", "transformation", "horaires"],
        duration: "2 min",
        goal: "Réglages clairs",
        intro:
          "Chaque donnée a un seul emplacement : les coordonnées dans Mon profil, le métier dans Mon activité, les paramètres commerciaux dans le Générateur et les mentions administratives dans Encaisser.",
        steps: [
          "Utiliser **Mon profil** pour l’identité, les coordonnées, l’entreprise, la ville et le logo.",
          "Utiliser **Mon activité** pour le métier, les prestations, zones, forces, clientèle et horaires publics.",
          "Ouvrir **Réglages du générateur** pour le panier moyen et le taux de transformation.",
          "Ouvrir **Encaisser > Réglages** pour la raison sociale, le SIREN/SIRET, le RCS, la TVA, le capital et l’adresse légale.",
        ],
        checks: [
          "Les informations déjà enregistrées sont conservées lors de cette nouvelle organisation.",
          "Les horaires publics de Mon activité décrivent l’entreprise ; les créneaux iNrCalendar règlent uniquement la prise de rendez-vous.",
          "Les informations juridiques ne bloquent pas les outils de communication.",
        ],
        pitfalls: [
          "Ne saisir une donnée qu’à son emplacement de référence évite les incohérences dans l’application.",
          "Les valeurs proposées par secteur restent modifiables et ne remplacent jamais silencieusement vos réglages.",
        ],
        links: [
          { label: "Mon profil", href: "/dashboard?panel=profil&panelSource=gps" },
          { label: "Mon activité", href: "/dashboard?panel=activite&panelSource=gps" },
          { label: "Réglages Encaisser", href: "/dashboard?panel=documents&panelSource=gps" },
        ],
      },
    ],
  },
  {
    id: "canaux",
    title: "Les canaux",
    emoji: "🧩",
    description: "Comprendre les 12 canaux iNrCy qui alimentent votre visibilité, votre diffusion et votre e-réputation.",
    articles: [
      {
        id: "canaux-express",
        title: "Connecter les bonnes bulles",
        keywords: ["canaux", "bulles", "connexion", "configurer", "connecter", "site inrcy", "site web", "google", "facebook", "instagram", "linkedin", "tiktok", "youtube", "shorts", "pinterest", "mails", "inrbadge", "statistiques", "publications", "visibilité", "ereputation"],
        duration: "5 min",
        goal: "Visibilité reliée",
        intro:
          "Les canaux iNrCy sont vos leviers de visibilité. Certains diffusent vos contenus, certains renforcent votre e-réputation, d’autres partagent votre carte de visite digitale ou alimentent le générateur et les statistiques.",
        steps: [
          "Ouvrir **Les canaux**, choisir la bulle concernée, puis cliquer sur **Configurer**.",
          "Connecter les canaux utiles : iNr'Badge, Mails, Site iNrCy, Site web, Google Business, Facebook, Instagram, LinkedIn, TikTok, YouTube et Pinterest.",
          "Configurer chaque canal utile pour que le générateur, iNrStats, Booster et E-réputation exploitent les bons signaux.",
        ],
        checks: [
          "Le canal affiche bien Connecté ou Configuré.",
          "Le bon compte professionnel est relié.",
          "Les autorisations de stats et de publication sont acceptées quand elles sont demandées.",
          "Les canaux désactivés restent visibles mais leurs boutons sont bloqués.",
        ],
        pitfalls: [
          "Commencer par les canaux les plus utiles : Google Business, Site iNrCy, Site web et Mails.",
          "Tous les canaux n’ont pas le même rôle : certains publient, certains gèrent les avis, certains analysent, certains renvoient vers vos contacts ou vos rendez-vous.",
        ],
        links: [{ label: "Ouvrir les canaux", href: "/dashboard" }],
      },
    ],
  },
  {
    id: "inragent",
    title: "iNr'Agent",
    emoji: "🤖",
    description: "Votre assistant virtuel pour préparer, automatiser et programmer vos actions de communication.",
    articles: [
      {
        id: "inragent-express",
        title: "Utiliser votre assistant virtuel",
        keywords: ["inragent", "agent", "assistant", "assistant virtuel", "automatiser", "programmer", "communication", "publication", "campagne", "relance", "actions"],
        duration: "3 min",
        goal: "Gagner du temps",
        intro:
          "iNr'Agent est votre assistant virtuel iNrCy. Il vous aide à préparer, automatiser et programmer vos actions de communication depuis un seul endroit.",
        steps: [
          "Ouvrir **iNr'Agent** depuis le header du dashboard.",
          "Choisir une action claire : **Publier**, **Propulser**, **Fidéliser** ou **Analyser mes statistiques**.",
          "Pour **Publier**, connecter les canaux utiles de Booster / Publier, y compris Pinterest quand vous voulez diffuser aussi là-bas.",
          "Laisser iNr'Agent utiliser les outils iNrCy disponibles pour préparer une proposition adaptée, puis relire l’aperçu.",
          "Relire l’aperçu, puis **valider** ou **refuser** l’action avant qu’elle soit exécutée.",
        ],
        checks: [
          "Votre activité, votre profil et votre Configuration IA sont bien renseignés.",
          "Les canaux utiles sont connectés ou activés selon votre offre.",
          "Rien n’est publié, envoyé ou modifié sans votre validation.",
          "iNr'Agent peut être activé ou désactivé selon les accès de votre compte.",
        ],
        pitfalls: [
          "iNr'Agent ne remplace pas votre décision : il prépare, propose et accélère.",
          "Plus vos informations et vos canaux sont complets, plus ses propositions sont utiles.",
          "Google Business se gère dans **E-réputation** pour le suivi des avis.",
          "Objectif : gagner du temps, garder une communication régulière et transformer vos idées en actions concrètes.",
        ],
        links: [
          { label: "Ouvrir iNr'Agent", href: "/dashboard/agent" },
        ],
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
          "Le Générateur montre en un coup d’œil ce que les canaux ont généré sur 7 et 30 jours : diffusion, entrées captées et actions préparées.",
        steps: [
          "Lire les **demandes captées** sur 7 et 30 jours : appels, clics, formulaires ou autres signaux utiles.",
          "Regarder les **opportunités activables** : le potentiel estimé pour les 30 prochains jours.",
          "Vérifier le **CA potentiel**, calculé avec le panier moyen et le taux de transformation renseignés.",
          "Suivre les **Unités d’Inertie** : elles représentent la puissance des actions de communication du pro et peuvent servir dans la Boutique.",
        ],
        checks: [
          "Mon activité est renseignée et les Réglages du générateur sont cohérents.",
          "Au moins un canal important est connecté ou configuré.",
          "Les canaux de diffusion sont bien activés selon le forfait, et iNr'Agent est disponible dans le header quand l’accès est ouvert.",
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
          { label: "Ouvrir la Boutique", href: "/dashboard?panel=boutique&panelSource=gps" },
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
          "iNrStats traduit les données des canaux en lecture business simple : appels, clics, visites, formulaires, demandes, envois et signaux utiles.",
        steps: [
          "Connecter les canaux utiles pour laisser iNrCy récupérer les données disponibles.",
          "Lire les résultats par canal : Google Business, sites, Facebook, Instagram, LinkedIn, TikTok, YouTube ou Mails selon les connexions.",
          "Repérer ce qui fonctionne : appels, clics, itinéraires, visites, formulaires, interactions ou campagnes.",
          "Utiliser ensuite **Booster**, **Propulser**, **Fidéliser** ou **iNr'Agent** selon le levier recommandé.",
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
          { label: "Ouvrir Booster", href: "/dashboard?action=publish" },
          { label: "Ouvrir Propulser", href: "/dashboard/propulser" },
          { label: "Ouvrir Fidéliser", href: "/dashboard/fideliser" },
        ],
      },
    ],
  },
  {
    id: "booster",
    title: "Booster",
    emoji: "📣",
    description: "Activer les canaux avec une publication simple, rapide et multicanale.",
    articles: [
      {
        id: "booster-express",
        title: "Publier en moins d’une minute",
        keywords: ["booster", "publier", "publication", "multicanal", "canaux", "visibilité", "contenu"],
        duration: "3 min",
        intro:
          "Booster sert à publier sur tous les canaux connectés du professionnel. C’est l’outil phare pour rester visible avec un contenu clair, local et adapté à chaque canal.",
        steps: [
          "Cliquer sur **Publier maintenant** pour ouvrir directement l’outil de publication.",
          "Préparer un contenu : chantier, nouveauté, conseil, photo, actualité ou preuve terrain.",
          "Choisir les canaux utiles : sites, Google Business, Facebook, Instagram, LinkedIn, TikTok, YouTube ou Mails.",
          "Vérifier le texte, l’image, le ton et l’appel à l’action avant l’envoi.",
          "Pour une action commerciale guidée, passer ensuite par **Propulser**.",
        ],
        checks: [
          "Configuration IA est bien remplie.",
          "Les canaux de publication sont connectés.",
          "Le contenu correspond au métier et à la zone du pro.",
          "Une publication par semaine valide la mission Booster.",
        ],
        pitfalls: [
          "**Régularité.**",
          "Cet outil est un élément essentiel au développement de votre activité.",
          "Publier régulièrement vaut mieux que chercher la publication parfaite une fois tous les trois mois.",
        ],
        links: [
          { label: "Ouvrir Booster", href: "/dashboard?action=publish" },
          { label: "Configuration IA", href: "/dashboard?panel=ia&panelSource=gps" },
          { label: "Ouvrir les canaux", href: "/dashboard" },
        ],
      },
      {
        id: "booster-medias",
        title: "Optimiser une image ou une vidéo",
        keywords: ["média", "optimiser", "compression", "conversion", "mp4", "h264", "aac", "webm", "mkv", "avi", "300 mo", "75 mo", "50 mo"],
        duration: "2 min",
        goal: "Média compatible",
        intro:
          "Dès l’ajout, iNrCy détecte si le format ou le poids peut bloquer l’outil. L’optimisation prépare une copie compatible sans modifier l’original.",
        steps: [
          "Ajouter jusqu’à **5 images** ou **1 vidéo de 300 Mo maximum**.",
          "Si la pastille **À optimiser** apparaît, ouvrir l’outil : iNrCy choisit automatiquement la cible adaptée à l’usage.",
          "Lancer l’optimisation : conversion en MP4 H.264/AAC si nécessaire et compression uniquement si le poids le demande.",
          "Laisser iNrCy réinsérer la copie optimisée, puis poursuivre la génération ou la publication normalement.",
        ],
        checks: [
          "Booster vise 50 Mo maximum par image et 75 Mo pour la vidéo après optimisation.",
          "Les formats déjà compatibles et assez légers ne déclenchent pas d’étape inutile.",
          "La préparation des médias avant envoi reste une dernière sécurité par canal.",
          "Un fichier source supérieur à 300 Mo doit être réduit avant son ajout.",
        ],
        pitfalls: [
          "Optimiser avant de générer évite d’allonger les deux étapes principales.",
          "Un conteneur MP4 ne suffit pas toujours : iNrCy vérifie aussi les codecs vidéo et audio.",
        ],
        links: [{ label: "Ouvrir Booster", href: "/dashboard?action=publish" }],
      },
      {
        id: "booster-bilan",
        title: "Lire le bilan de publication",
        keywords: ["bilan", "publié", "traitement", "échec", "canal", "inrsend", "programmation", "durée vidéo", "pinterest", "youtube"],
        duration: "1 min",
        goal: "Résultat compris",
        intro:
          "Le bilan sépare les canaux publiés, encore en traitement et en échec. Un canal refusé n’annule pas ceux qui ont réussi.",
        steps: [
          "Lire le compteur vert des **réussites**, puis les éventuels compteurs orange et rouge.",
          "Utiliser **Voir** pour ouvrir le canal quand son lien public est disponible.",
          "Cliquer sur le bouton d’information d’un échec pour lire la règle ou l’erreur technique exacte.",
          "Ouvrir **iNrSend** pour suivre les traitements, actualiser le statut et retrouver le contenu envoyé.",
        ],
        checks: [
          "Les canaux non sélectionnés ne figurent pas dans le bilan.",
          "Les limites de durée sont signalées avant l’envoi lorsqu’elles sont connues.",
          "Un statut orange signifie que la plateforme traite encore le média, pas que la publication a échoué.",
          "En cas de coupure réseau après acceptation, iNrCy tente de récupérer le résultat côté serveur.",
        ],
        pitfalls: [
          "Toujours lire le détail du canal concerné avant de relancer toute la publication.",
          "Une erreur de format détectée seulement par la plateforme reste visible dans le bilan technique.",
        ],
        links: [
          { label: "Ouvrir Booster", href: "/dashboard?action=publish" },
          { label: "Ouvrir iNr’Send", href: "/dashboard/mails" },
        ],
      },
    ],
  },
  {
    id: "propulser",
    title: "Propulser",
    emoji: "🚀",
    description: "Développer l’activité avec des actions guidées : valoriser, récolter ou offrir.",
    articles: [
      {
        id: "propulser-express",
        title: "Lancer une action business",
        keywords: ["propulser", "valoriser", "récolter", "offrir", "avis", "offre", "action business", "développer"],
        duration: "3 min",
        goal: "Développer",
        intro:
          "Propulser regroupe les actions guidées pour développer l’activité. Le pro choisit entre Valoriser, Récolter ou Offrir selon son besoin du moment.",
        steps: [
          "Choisir **Valoriser** pour mettre en avant avis, réalisations, coulisses ou preuves de confiance.",
          "Choisir **Récolter** pour demander des avis, retours clients ou contacts exploitables.",
          "Choisir **Offrir** pour pousser une offre, une opportunité commerciale ou une action courte.",
          "Lancer une action par semaine pour valider la mission Propulser.",
        ],
        checks: [
          "Le message est clair et orienté résultat.",
          "Les contacts CRM sont prêts si l’action part par mail.",
          "Les canaux sont connectés si l’action utilise une publication.",
          "L’action choisie correspond au besoin réel : crédibilité, avis ou offre.",
        ],
        pitfalls: [
          "Propulser ne remplace pas Booster : Booster publie, Propulser donne une direction business.",
          "Une seule action Propulser par semaine suffit pour valider la mission UI.",
        ],
        links: [
          { label: "Ouvrir Propulser", href: "/dashboard/propulser" },
          { label: "Ouvrir CRM", href: "/dashboard/crm" },
          { label: "Ouvrir iNr’Send", href: "/dashboard/mails" },
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
          "Fidéliser sert à garder le lien avec les contacts existants, faire revenir les clients et renforcer la relation dans la durée.",
        steps: [
          "Choisir un objectif : **Informer**, **Suivre** ou **Enquêter**.",
          "Utiliser les contacts du **CRM** ou sélectionner les destinataires utiles.",
          "Laisser iNrCy générer un message personnalisé, puis l’ajuster si besoin.",
          "Envoyer depuis **iNr’Send** pour profiter de la boîte mail configurée et de la signature.",
          "Une action Fidéliser par semaine valide la mission UI.",
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
          "iNr’Send regroupe toutes les communications réalisées depuis iNrCy : mails, publications Booster, propulsions, fidélisations, devis et factures envoyés.",
        steps: [
          "Commencer par connecter les **boîtes mail** utilisées pour envoyer les communications.",
          "Créer une **signature iNr’Send** propre : elle sera ajoutée aux mails et évite les doubles signatures.",
          "Consulter l’historique simplifié : Mails, Factures, Devis, Publications, Propulsions et Fidélisations.",
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
          { label: "Configurer boîte mail", href: "/dashboard?panel=mails&panelSource=gps" },
          { label: "Créer ma signature", href: "/dashboard?panel=mails&panelSource=gps" },
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
          "Le CRM sert à stocker et organiser les contacts. Les actions Propulser, Fidéliser et les envois iNr’Send s’appuient sur une base propre.",
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
          { label: "Réglages Agenda", href: "/dashboard?panel=agenda&panelSource=gps" },
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
          { label: "Réglages", href: "/dashboard?panel=documents&panelSource=gps" },
        ],
      },
      {
        id: "documents-legal",
        title: "Renseigner les informations juridiques",
        keywords: ["raison sociale", "forme juridique", "adresse", "siret", "siren", "rcs", "capital", "tva", "iban", "encaisser"],
        duration: "3 min",
        goal: "Documents conformes",
        intro:
          "Les informations juridiques sont regroupées dans les réglages Encaisser car elles servent principalement aux devis et factures.",
        steps: [
          "Ouvrir **Encaisser**, puis la roue **Réglages**.",
          "Compléter la première rubrique : raison sociale, forme, adresse, pays, SIREN/SIRET, RCS, capital et TVA.",
          "Vérifier ensuite les réglages de paiement, TVA, acompte et échéance.",
          "Créer un document test et contrôler l’en-tête avant de l’envoyer à un client.",
        ],
        checks: [
          "Les anciennes valeurs du profil sont reprises automatiquement.",
          "Ces champs ne sont obligatoires que lorsque votre situation et le document l’exigent.",
          "L’IBAN et les conditions de règlement sont contrôlés séparément.",
          "Les données légales ne sont pas utilisées pour personnaliser les textes de l’IA.",
        ],
        pitfalls: [
          "Vérifier les mentions auprès de votre comptable ou conseil selon votre forme juridique.",
          "Une facture officielle doit rester cohérente avec vos informations d’immatriculation à jour.",
        ],
        links: [{ label: "Réglages Encaisser", href: "/dashboard?panel=documents&panelSource=gps" }],
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
          { label: "Voir mon abonnement", href: "/dashboard?panel=abonnement&panelSource=gps" },
          { label: "Nous contacter", href: "/dashboard?panel=contact&panelSource=gps" },
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
      {
        id: "problemes-mobile-reseau",
        title: "Réseau instable sur téléphone",
        keywords: ["téléphone", "pixel", "android", "iphone", "safari", "chrome", "wifi", "4g", "5g", "réseau", "économiseur", "connexion serveur"],
        duration: "2 min",
        goal: "Retrouver le résultat",
        intro:
          "Sur mobile, une bascule Wi-Fi/4G, l’économiseur d’énergie ou la mise en veille peut couper la réponse alors que le serveur a déjà terminé l’action.",
        steps: [
          "Garder iNrCy au premier plan pendant une génération, un envoi ou une publication.",
          "En cas d’erreur, attendre quelques secondes : iNrCy tente de retrouver le résultat déjà créé côté serveur.",
          "Actualiser une seule fois puis vérifier iNrSend avant de relancer l’action.",
          "Si le problème revient, tester sans économie d’énergie puis comparer Wi-Fi et réseau mobile.",
        ],
        checks: [
          "Utiliser un navigateur récent : Chrome, Safari, Edge ou Firefox à jour.",
          "Vérifier que le téléphone n’a pas bloqué les données en arrière-plan.",
          "Contrôler iNrSend pour éviter un doublon après une réponse réseau perdue.",
          "Contacter iNrCy avec l’heure exacte et une capture si l’erreur persiste.",
        ],
        pitfalls: [
          "Une erreur de connexion affichée sur le téléphone ne signifie pas toujours que le serveur a échoué.",
          "Ne relancez pas immédiatement plusieurs fois une publication déjà acceptée.",
        ],
        links: [{ label: "Ouvrir iNr’Send", href: "/dashboard/mails" }],
      },
      {
        id: "problemes-vocal",
        title: "Utiliser la dictée vocale",
        keywords: ["vocal", "micro", "enregistrement", "dictée", "audio", "stop", "autorisation", "mobile", "iphone", "android"],
        duration: "1 min",
        goal: "Idée transformée en texte",
        intro:
          "Le micro de Booster enregistre votre idée puis la transforme en consigne exploitable, quel que soit le format audio produit par le navigateur compatible.",
        steps: [
          "Autoriser l’accès au micro lorsque le navigateur le demande.",
          "Parler clairement, puis toucher **Stop** une seule fois.",
          "Attendre la transcription avant de modifier ou compléter le texte.",
          "Si rien ne remonte, vérifier l’autorisation micro du navigateur et refaire un enregistrement court.",
        ],
        checks: [
          "Le navigateur et le système autorisent bien le micro pour app.inrcy.com.",
          "Un enregistrement court permet de distinguer un souci d’autorisation d’un souci réseau.",
          "Le texte obtenu reste modifiable avant génération.",
        ],
        pitfalls: [
          "Éviter de verrouiller l’écran pendant l’enregistrement ou l’envoi du fichier audio.",
          "Sur un réseau faible, patienter après Stop au lieu de recommencer immédiatement.",
        ],
        links: [{ label: "Ouvrir Booster", href: "/dashboard?action=publish" }],
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
          "Demander des avis après les clients satisfaits avec **Propulser > Récolter**.",
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
        links: [
          { label: "Ouvrir Booster", href: "/dashboard?action=publish" },
          { label: "Ouvrir Propulser", href: "/dashboard/propulser" },
          { label: "Ouvrir Fidéliser", href: "/dashboard/fideliser" },
        ],
      },
    ],
  },
];
