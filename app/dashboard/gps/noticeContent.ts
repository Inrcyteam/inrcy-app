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
};

export type GpsSection = {
  id: string;
  title: string;
  description?: string;
  articles: GpsArticle[];
};

export const GPS_SECTIONS: GpsSection[] = [
  {
    id: "generateur",
    title: "Le générateur",
    description: "Le cœur d’iNrCy : vos canaux alimentent une seule machine à leads.",
    articles: [
      {
        id: "generateur-demarrer",
        title: "Démarrer en 5 minutes",
        keywords: ["démarrer", "première fois", "setup", "mise en route"],
        intro:
          "Objectif : avoir au moins 1 canal connecté + le suivi actif, pour que la machine puisse mesurer et améliorer.",
        steps: [
          "Ouvrez **Les canaux** et connectez votre 1er canal (Google / Site / Facebook…).",
          "Activez le **Suivi** si ce n’est pas déjà fait (pour mesurer).",
          "Passez dans **Stats** pour vérifier que les données remontent.",
          "Utilisez **Booster → Publier** pour lancer une première action simple.",
          "Revenez demain : l’objectif est d’avoir une lecture claire (appels, formulaires, clics).",
        ],
        checks: [
          "Au moins 1 canal en **Connecté**.",
          "Le bouton **Activer** (suivi) est OK.",
          "Une première donnée visible dans **Stats** (même minimale).",
        ],
        faq: [
          {
            q: "Je n’ai aucune donnée dans Stats, c’est normal ?",
            a: "Oui au début. Le plus important : canal connecté + suivi actif. Les chiffres arrivent avec l’activité (visites / appels / clics).",
          },
          {
            q: "Je dois connecter tous les canaux ?",
            a: "Non. Commencez par 1–2 canaux qui vous rapportent vraiment (souvent Google + Site).",
          },
        ],
        links: [
          { label: "Ouvrir Stats", href: "/dashboard/stats" },
          { label: "Ouvrir Booster", href: "/dashboard/booster" },
        ],
      },
      {
        id: "generateur-sante",
        title: "Vérifier que tout tourne",
        keywords: ["santé", "check", "ok", "problème"],
        intro:
          "En cas d’urgence : 3 vérifications rapides avant de chercher plus loin.",
        steps: [
          "Vérifiez dans **Les canaux** : au moins 1 canal doit être **Connecté**.",
          "Vérifiez le **Suivi** : il doit être **Actif** (sinon, activez).",
          "Ouvrez **Stats** : regardez si l’activité bouge (sur 7 jours).",
        ],
        pitfalls: [
          "Canal connecté mais aucune donnée : parfois il faut un peu de temps ou un minimum de trafic.",
          "Suivi désactivé : Stats sera limité.",
        ],
        links: [{ label: "Ouvrir Les canaux", href: "/dashboard" }],
      },
    ],
  },
  {
    id: "canaux",
    title: "Les canaux",
    description:
      "Les sources de trafic (et de clients). Plus vos canaux sont connectés, plus le cockpit est fiable.",
    articles: [
      {
        id: "canaux-site-inrcy",
        title: "Site iNrCy",
        keywords: ["site", "inrcy", "machine à leads"],
        intro: "Votre site iNrCy est la base : il capte, rassure, convertit.",
        steps: [
          "Dans **Les canaux**, ouvrez **Site iNrCy**.",
          "Connectez **Analytics** et **Search Console** si disponibles.",
          "Vérifiez dans **Stats** que les visites et sources remontent.",
        ],
        checks: ["Le site est accessible", "Analytics connecté", "Search Console connecté"],
        faq: [
          {
            q: "Pourquoi connecter Analytics ?",
            a: "Pour mesurer ce qui marche (sources, pages, conversions) et piloter vos actions Booster.",
          },
        ],
      },
      {
        id: "canaux-site-web",
        title: "Site web",
        keywords: ["site", "web", "tracking"],
        intro: "Votre site existant peut être piloté et mesuré depuis iNrCy.",
        steps: [
          "Dans **Les canaux**, ouvrez **Site web**.",
          "Connectez **Analytics** / **Search Console**.",
          "Surveillez dans **Stats** les pages qui convertissent le mieux.",
        ],
      },
      {
        id: "canaux-google-business",
        title: "Google Business",
        keywords: ["gmb", "google", "fiche", "appels"],
        intro: "La fiche Google est souvent votre meilleur canal d’appels.",
        steps: [
          "Dans **Les canaux**, ouvrez **Google Business**.",
          "Connectez votre compte Google si demandé.",
          "Dans **Stats**, suivez les appels / clics / itinéraires (si disponibles).",
        ],
        pitfalls: [
          "Si la connexion échoue : vérifiez que vous êtes bien propriétaire/gestionnaire de la fiche.",
        ],
      },
      {
        id: "canaux-facebook",
        title: "Facebook",
        keywords: ["facebook", "page", "posts"],
        intro: "Idéal pour publier et créer de la demande locale.",
        steps: [
          "Connectez votre page Facebook.",
          "Publiez via **Booster → Publier** (régulier > parfait).",
          "Regardez dans **Stats** si le trafic social progresse.",
        ],
      },
      {
        id: "canaux-instagram",
        title: "Instagram",
        keywords: ["instagram", "photos", "stories"],
        intro: "Parfait pour la preuve visuelle et la marque.",
        steps: [
          "Connectez votre compte Instagram.",
          "Publiez des avant/après, chantiers, coulisses (simple).",
          "Mesurez l’impact via **Stats**.",
        ],
      },
      {
        id: "canaux-linkedin",
        title: "LinkedIn",
        keywords: ["linkedin", "réseau", "professionnel"],
        intro: "Pour crédibiliser l’expertise et développer des partenariats.",
        steps: [
          "Connectez le compte / la page LinkedIn.",
          "Publiez des retours d’expérience, conseils, réalisations.",
          "Suivez les clics et visites dans **Stats**.",
        ],
      },
    ],
  },
  {
    id: "tableau",
    title: "Tableau de bord",
    description: "Tout ce qui sert à piloter : chiffres, communication, planning, clients.",
    articles: [
      {
        id: "tdb-stats",
        title: "Stats",
        keywords: ["stats", "kpi", "roi", "performances"],
        intro:
          "La vue business : ce qui bouge, d’où ça vient, et quoi améliorer (sans se noyer dans les détails).",
        steps: [
          "Regardez la période **7 jours** pour une lecture simple.",
          "Identifiez la meilleure source (Google / Direct / Social).",
          "Si une source baisse : relancez une action dans **Booster**.",
        ],
        links: [{ label: "Ouvrir Stats", href: "/dashboard/stats" }],
      },
      {
        id: "tdb-coms",
        title: "Coms",
        keywords: ["communication", "mails", "messages"],
        intro:
          "Centralisez les messages et actions de communication (relances, notifications, nurturing).",
        steps: [
          "Utilisez les modèles quand disponibles.",
          "Gardez une cadence simple : régulier > parfait.",
        ],
        links: [{ label: "Ouvrir Mails", href: "/dashboard/mails" }],
      },
      {
        id: "tdb-agenda",
        title: "Agenda",
        keywords: ["agenda", "planning", "interventions"],
        intro: "Planifiez les interventions et gardez une vision claire de la semaine.",
        steps: [
          "Ajoutez / modifiez une intervention depuis la page Agenda.",
          "Gardez des créneaux simples : matin / après-midi (lisible).",
        ],
        links: [{ label: "Ouvrir Agenda", href: "/dashboard/agenda" }],
      },
      {
        id: "tdb-crm",
        title: "CRM",
        keywords: ["crm", "clients", "prospects"],
        intro: "Votre fichier client vivant : suivi, relances, historique.",
        steps: [
          "Ajoutez un prospect dès qu’il vous contacte.",
          "Notez le besoin + date de relance.",
          "Transformez en devis quand c’est chaud.",
        ],
        links: [{ label: "Ouvrir CRM", href: "/dashboard/crm" }],
      },
    ],
  },
  {
    id: "boite",
    title: "Boîte de vitesse",
    description:
      "Les actions qui font avancer : visibilité, devis, factures, fidélisation.",
    articles: [
      {
        id: "bv-booster-publier",
        title: "Booster • Publier",
        keywords: ["booster", "publier", "post", "réseaux"],
        intro: "Le plus rentable : publier simple et régulier.",
        steps: [
          "Choisissez un canal (Facebook / Instagram / LinkedIn…).",
          "Prenez un avant/après ou une photo chantier.",
          "Ajoutez 2 lignes : problème → solution → appel à l’action.",
          "Publiez. Ensuite, regardez l’impact dans **Stats**.",
        ],
        links: [{ label: "Ouvrir Booster", href: "/dashboard/booster" }],
      },
      {
        id: "bv-booster-recolter",
        title: "Booster • Récolter",
        keywords: ["récolter", "avis", "témoignages"],
        intro: "Récolter = transformer vos clients satisfaits en preuve sociale.",
        steps: [
          "Après une prestation réussie, envoyez la demande d’avis.",
          "Relancez une fois (simple).",
          "Utilisez les meilleurs retours dans vos publications.",
        ],
      },
      {
        id: "bv-booster-offrir",
        title: "Booster • Offrir",
        keywords: ["offrir", "offre", "promotion"],
        intro: "Créer une petite offre claire pour déclencher la demande.",
        steps: [
          "Choisissez 1 offre simple (ex : diagnostic gratuit / pack).",
          "Limitez dans le temps (7–14 jours).",
          "Publiez sur vos canaux et mesurez dans **Stats**.",
        ],
      },
      {
        id: "bv-devis",
        title: "Devis",
        keywords: ["devis", "estimation", "signature"],
        intro: "Faire un devis vite = répondre avant les concurrents.",
        steps: [
          "Créez le devis dès que le besoin est clair.",
          "Envoyez rapidement, même si c’est une première version.",
          "Relancez à J+2 si pas de réponse.",
        ],
        links: [{ label: "Ouvrir Devis", href: "/dashboard/devis" }],
      },
      {
        id: "bv-factures",
        title: "Factures",
        keywords: ["facture", "paiement", "acompte"],
        intro: "Gardez un flux propre : acomptes, paiements, relances.",
        steps: [
          "Facturez dès que la prestation est terminée.",
          "Si possible : acompte avant intervention.",
          "Relance douce si retard (courte et polie).",
        ],
        links: [{ label: "Ouvrir Factures", href: "/dashboard/factures" }],
      },
      {
        id: "bv-fideliser-informer",
        title: "Fidéliser • Informer",
        keywords: ["fidéliser", "informer", "news"],
        intro: "Rester présent sans être intrusif.",
        steps: [
          "Envoyez 1 info utile / mois (astuce, saison, rappel).",
          "Mettez un lien simple : appeler / devis / message.",
        ],
        links: [{ label: "Ouvrir Fidéliser", href: "/dashboard/fideliser" }],
      },
      {
        id: "bv-fideliser-suivre",
        title: "Fidéliser • Suivre",
        keywords: ["suivre", "rappel", "entretien"],
        intro: "Suivre = relancer au bon moment (entretien, contrôle, saison).",
        steps: [
          "Notez une date de rappel dans le CRM.",
          "Relancez avant la saison (ex : printemps).",
        ],
      },
      {
        id: "bv-fideliser-enqueter",
        title: "Fidéliser • Enquêter",
        keywords: ["enquête", "satisfaction", "avis"],
        intro: "Une mini-enquête = améliorer + générer des avis.",
        steps: [
          "Demandez une note simple (1–5) + 1 question.",
          "Si note haute : proposez un avis Google.",
          "Si note basse : appelez (désamorce).",
        ],
      },
    ],
  },
];
