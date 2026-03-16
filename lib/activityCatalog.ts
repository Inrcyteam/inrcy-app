import type { ActivitySectorCategory } from '@/lib/activitySectors';

type JobCatalog = {
  label: string;
  services: string[];
};

type SectorCatalog = {
  label: string;
  jobs: Record<string, JobCatalog>;
};

export const ACTIVITY_CATALOG: Record<ActivitySectorCategory, SectorCatalog> = {
  artisan_btp: {
    label: 'Artisan / BTP',
    jobs: {
      macon: { label: 'Maçon', services: ['Maçonnerie générale', 'Dalle béton', 'Mur porteur', 'Ouverture mur', 'Terrasse', 'Fondations', 'Clôture maçonnée', 'Petits travaux de maçonnerie'] },
      plombier: { label: 'Plombier', services: ['Dépannage fuite', 'Débouchage', 'Remplacement chauffe-eau', 'Installation sanitaire', 'Rénovation salle de bain', 'Recherche de fuite', 'Entretien plomberie', 'Urgence plomberie'] },
      electricien: { label: 'Électricien', services: ['Dépannage électrique', 'Mise aux normes', 'Installation tableau électrique', 'Éclairage intérieur', 'Éclairage extérieur', 'Prises et interrupteurs', 'Rénovation électrique', 'Bornes / solutions de recharge'] },
      couvreur: { label: 'Couvreur', services: ['Réparation toiture', 'Recherche infiltration', 'Nettoyage toiture', 'Pose couverture', 'Zinguerie', 'Isolation toiture', 'Entretien gouttières', 'Urgence après intempéries'] },
      chauffagiste: { label: 'Chauffagiste', services: ['Entretien chaudière', 'Dépannage chauffage', 'Installation chaudière', 'Pompe à chaleur', 'Radiateurs', 'Chauffe-eau', 'Contrat d’entretien', 'Urgence chauffage'] },
      menuisier: { label: 'Menuisier', services: ['Menuiserie intérieure', 'Pose de portes', 'Pose de fenêtres', 'Placards sur mesure', 'Escaliers', 'Aménagement intérieur', 'Volets', 'Rénovation menuiserie'] },
      peintre: { label: 'Peintre', services: ['Peinture intérieure', 'Peinture extérieure', 'Préparation supports', 'Rafraîchissement logement', 'Revêtements muraux', 'Protection façade', 'Décoration', 'Peinture après sinistre'] },
      carreleur: { label: 'Carreleur', services: ['Pose carrelage', 'Faïence salle de bain', 'Crédence cuisine', 'Terrasse carrelée', 'Ragréage', 'Réparation joints', 'Pose grand format', 'Rénovation sols'] },
      paysagiste: { label: 'Paysagiste', services: ['Entretien jardin', 'Création de massif', 'Tonte', 'Taille de haies', 'Terrassement léger', 'Arrosage', 'Clôtures extérieures', 'Aménagement paysager'] },
      pisciniste: { label: 'Pisciniste', services: ['Entretien piscine', 'Mise en service', 'Hivernage', 'Réparation équipement', 'Pose liner', 'Traitement eau', 'Sécurité piscine', 'Construction / rénovation'] },
    },
  },
  automobile: {
    label: 'Automobile',
    jobs: {
      garage_auto: { label: 'Garage auto', services: ['Révision', 'Vidange', 'Freinage', 'Diagnostic panne', 'Distribution', 'Embrayage', 'Pré-contrôle technique', 'Entretien courant'] },
      carrosserie: { label: 'Carrosserie', services: ['Débosselage', 'Peinture carrosserie', 'Réparation choc', 'Pare-chocs', 'Remplacement éléments', 'Lustrage', 'Rénovation optiques', 'Véhicule de courtoisie'] },
      centre_auto: { label: 'Centre auto', services: ['Pneus', 'Parallélisme', 'Batterie', 'Freins', 'Vidange', 'Balais essuie-glace', 'Climatisation', 'Diagnostic rapide'] },
      garage_moto: { label: 'Garage moto', services: ['Entretien moto', 'Pneus moto', 'Freinage', 'Révision scooter', 'Diagnostic', 'Préparation saison', 'Pièces / accessoires', 'Réparation mécanique'] },
      lavage_auto: { label: 'Lavage auto', services: ['Lavage extérieur', 'Nettoyage intérieur', 'Shampoing sièges', 'Lustrage', 'Préparation vente', 'Traitement carrosserie', 'Nettoyage utilitaire', 'Formule abonnement'] },
      depannage_auto: { label: 'Dépannage auto', services: ['Remorquage', 'Batterie', 'Panne démarrage', 'Crevaison', 'Ouverture véhicule', 'Assistance route', 'Diagnostic sur place', 'Intervention urgence'] },
    },
  },
  commerce_boutique: {
    label: 'Commerce / Boutique',
    jobs: {
      boutique_mode: { label: 'Boutique mode', services: ['Nouvelle collection', 'Conseil style', 'Essayage', 'Retouches', 'Accessoires', 'Sélection saisonnière', 'Carte cadeau', 'Privatisation boutique'] },
      fleuriste: { label: 'Fleuriste', services: ['Bouquets', 'Compositions florales', 'Mariage', 'Deuil', 'Livraison fleurs', 'Abonnement floral', 'Décoration événement', 'Conseil entretien fleurs'] },
      boulangerie: { label: 'Boulangerie / Pâtisserie', services: ['Pain du jour', 'Pâtisseries', 'Commande spéciale', 'Pièces montées', 'Snacking', 'Traiteur sucré / salé', 'Livraison', 'Formules entreprise'] },
      opticien: { label: 'Opticien', services: ['Lunettes de vue', 'Lunettes solaires', 'Ajustement monture', 'Lentilles', 'Contrôle visuel', 'Devis mutuelle', 'Entretien lunettes', 'Conseil équipement'] },
      epicerie: { label: 'Épicerie / Commerce alimentaire', services: ['Produits frais', 'Paniers du moment', 'Produits locaux', 'Commande spéciale', 'Livraison', 'Click & collect', 'Coffrets cadeau', 'Événements dégustation'] },
      librairie: { label: 'Librairie / Papeterie', services: ['Sélection livres', 'Commande ouvrage', 'Papeterie', 'Cadeaux', 'Animations / dédicaces', 'Listes scolaires', 'Conseil lecture', 'Réservation'] },
    },
  },
  hotel_restaurant: {
    label: 'Hôtel / Restaurant',
    jobs: {
      restaurant: { label: 'Restaurant', services: ['Menu du jour', 'Réservation', 'Repas de groupe', 'Événement privé', 'Carte saisonnière', 'Vente à emporter', 'Livraison', 'Carte cadeau'] },
      hotel: { label: 'Hôtel', services: ['Réservation chambre', 'Séjour week-end', 'Offre entreprise', 'Petit-déjeuner', 'Accueil groupe', 'Événement / séminaire', 'Carte cadeau', 'Offre saisonnière'] },
      bar: { label: 'Bar / Café', services: ['Happy hour', 'Soirée à thème', 'Réservation groupe', 'Afterwork', 'Diffusion événement', 'Petite restauration', 'Privatisation', 'Animations'] },
      snack: { label: 'Snack / Fast food', services: ['Menu rapide', 'Commande à emporter', 'Livraison', 'Formules midi', 'Offres étudiantes', 'Privatisation', 'Événements', 'Carte fidélité'] },
      traiteur: { label: 'Traiteur', services: ['Cocktail', 'Buffet', 'Mariage', 'Entreprise', 'Livraison', 'Plateaux repas', 'Événement privé', 'Devis sur mesure'] },
      chambre_hotes: { label: 'Chambre d’hôtes / Gîte', services: ['Réservation séjour', 'Week-end', 'Bon cadeau', 'Accueil famille', 'Séjour thématique', 'Petit-déjeuner', 'Long séjour', 'Conseils visite locale'] },
    },
  },
  beaute_bien_etre: {
    label: 'Beauté / Bien-être',
    jobs: {
      coiffeur: { label: 'Coiffeur / Barber', services: ['Coupe femme', 'Coupe homme', 'Brushing', 'Coloration', 'Balayage', 'Coiffure événement', 'Soin capillaire', 'Abonnement / fidélité'] },
      estheticienne: { label: 'Institut de beauté', services: ['Soin visage', 'Soin corps', 'Épilation', 'Beauté des mains', 'Beauté des pieds', 'Maquillage', 'Carte cadeau', 'Cure / abonnement'] },
      spa: { label: 'Spa / Bien-être', services: ['Massage', 'Accès spa', 'Rituel duo', 'Sauna / hammam', 'Cure bien-être', 'Bon cadeau', 'Offre détente', 'Privatisation'] },
      onglerie: { label: 'Onglerie', services: ['Pose gel', 'Semi-permanent', 'Remplissage', 'Nail art', 'Beauté des mains', 'Beauté des pieds', 'Réparation ongle', 'Carte fidélité'] },
      masseur: { label: 'Massage / Relaxation', services: ['Massage détente', 'Massage sportif', 'Massage duo', 'Drainage', 'Bon cadeau', 'Cure', 'Séance découverte', 'Conseils bien-être'] },
      tatoueur: { label: 'Tatouage / Piercing', services: ['Projet tatouage', 'Retouche', 'Flash du moment', 'Piercing', 'Conseils cicatrisation', 'Carte cadeau', 'Rendez-vous projet', 'Création personnalisée'] },
    },
  },
  sante: {
    label: 'Santé',
    jobs: {
      medecin_generaliste: { label: 'Médecin généraliste', services: ['Consultation', 'Suivi patient', 'Prévention', 'Téléconsultation', 'Renouvellement', 'Dossier médical', 'Vaccination', 'Informations cabinet'] },
      dentiste: { label: 'Dentiste', services: ['Bilan dentaire', 'Détartrage', 'Urgence dentaire', 'Soins', 'Prothèse', 'Implantologie', 'Orthodontie', 'Conseils hygiène'] },
      kine: { label: 'Kinésithérapeute', services: ['Rééducation', 'Massage', 'Drainage', 'Suivi post-opératoire', 'Sport', 'Douleurs chroniques', 'Respiratoire', 'Exercices à domicile'] },
      osteopathe: { label: 'Ostéopathe', services: ['Consultation adulte', 'Consultation nourrisson', 'Sportif', 'Douleurs dos', 'Suivi postural', 'Conseils prévention', 'Urgence rendez-vous', 'Entretiens réguliers'] },
      pharmacie: { label: 'Pharmacie', services: ['Conseil santé', 'Parapharmacie', 'Vaccination', 'Matériel médical', 'Ordonnances', 'Téléservice', 'Livraison / retrait', 'Prévention saisonnière'] },
      infirmier: { label: 'Infirmier / Infirmière', services: ['Soins à domicile', 'Prises de sang', 'Pansements', 'Suivi traitement', 'Accompagnement patient', 'Vaccination', 'Conseils', 'Disponibilités intervention'] },
    },
  },
  medecine_douce: {
    label: 'Médecine douce',
    jobs: {
      naturopathe: { label: 'Naturopathe', services: ['Bilan vitalité', 'Conseils nutrition', 'Gestion stress', 'Sommeil', 'Accompagnement saisonnier', 'Séance découverte', 'Programme bien-être', 'Atelier'] },
      sophrologue: { label: 'Sophrologue', services: ['Gestion stress', 'Sommeil', 'Préparation examen', 'Confiance en soi', 'Burn-out', 'Séance individuelle', 'Atelier', 'Respiration'] },
      reflexologue: { label: 'Réflexologue', services: ['Réflexologie plantaire', 'Réflexologie palmaire', 'Gestion stress', 'Détente', 'Accompagnement douleur', 'Séance découverte', 'Cure', 'Carte cadeau'] },
      hypnotherapeute: { label: 'Hypnothérapeute', services: ['Gestion stress', 'Confiance', 'Arrêt tabac', 'Sommeil', 'Phobies', 'Séance découverte', 'Accompagnement personnalisé', 'Suivi'] },
      energeticien: { label: 'Praticien énergétique', services: ['Séance énergétique', 'Rééquilibrage', 'Fatigue', 'Émotions', 'Ancrage', 'Découverte', 'Suivi régulier', 'Atelier'] },
      shiatsu: { label: 'Shiatsu / Pratique corporelle', services: ['Séance shiatsu', 'Détente', 'Équilibre', 'Stress', 'Fatigue', 'Programme bien-être', 'Séance découverte', 'Suivi'] },
    },
  },
  immobilier: {
    label: 'Immobilier',
    jobs: {
      agence_immobiliere: { label: 'Agence immobilière', services: ['Estimation', 'Vente', 'Location', 'Visite', 'Mise en valeur du bien', 'Accompagnement acheteur', 'Accompagnement vendeur', 'Conseils marché local'] },
      courtier: { label: 'Courtier', services: ['Étude financement', 'Simulation', 'Renégociation', 'Assurance emprunteur', 'Accompagnement dossier', 'Investissement', 'Premier achat', 'Conseils budget'] },
      gestion_locative: { label: 'Gestion locative', services: ['Mise en location', 'Gestion quotidienne', 'Sélection locataire', 'États des lieux', 'Suivi propriétaire', 'Conseils rentabilité', 'Garanties', 'Accompagnement juridique'] },
      syndic: { label: 'Syndic / Copropriété', services: ['Gestion copropriété', 'Suivi travaux', 'Assemblées', 'Communication résidents', 'Interventions techniques', 'Accompagnement conseil syndical', 'Suivi prestataires', 'Information réglementaire'] },
      home_staging: { label: 'Home staging', services: ['Valorisation bien', 'Conseil déco', 'Préparation visite', 'Mise en scène', 'Optimisation photos', 'Pack vente', 'Accompagnement vendeur', 'Visite conseil'] },
    },
  },
  services_particuliers: {
    label: 'Services aux particuliers',
    jobs: {
      aide_domicile: { label: 'Aide à domicile', services: ['Accompagnement quotidien', 'Courses', 'Présence', 'Aide administrative', 'Aide repas', 'Soutien autonomie', 'Visites régulières', 'Devis personnalisé'] },
      menage: { label: 'Ménage / Entretien', services: ['Ménage régulier', 'Grand nettoyage', 'Fin de chantier', 'Vitres', 'Repassage', 'Nettoyage locatif', 'Intervention ponctuelle', 'Formule abonnement'] },
      jardinage: { label: 'Jardinage', services: ['Tonte', 'Taille haies', 'Désherbage', 'Entretien saisonnier', 'Remise en état', 'Petits aménagements', 'Évacuation déchets verts', 'Contrat entretien'] },
      garde_enfants: { label: 'Garde d’enfants', services: ['Garde régulière', 'Sortie école', 'Aide devoirs', 'Garde ponctuelle', 'Mercredi / vacances', 'Accompagnement activités', 'Baby-sitting soirée', 'Rencontre préalable'] },
      depannage_domestique: { label: 'Dépannage à domicile', services: ['Petit bricolage', 'Montage meuble', 'Réparation', 'Installation équipement', 'Petites urgences', 'Intervention rapide', 'Devis simple', 'Entretien courant'] },
      conciergerie: { label: 'Conciergerie', services: ['Gestion location courte durée', 'Accueil voyageurs', 'Ménage', 'Linge', 'Check-in / check-out', 'Assistance', 'Optimisation annonce', 'Suivi propriétaire'] },
    },
  },
  services_entreprises: {
    label: 'Services aux entreprises',
    jobs: {
      consultant: { label: 'Consultant', services: ['Audit', 'Conseil stratégique', 'Accompagnement projet', 'Atelier', 'Formation', 'Diagnostic', 'Suivi mission', 'Intervention ponctuelle'] },
      agence_marketing: { label: 'Agence marketing / communication', services: ['Stratégie', 'Création contenu', 'Community management', 'Publicité', 'SEO', 'Emailing', 'Branding', 'Reporting'] },
      organisme_formation: { label: 'Formation', services: ['Formation inter', 'Formation intra', 'Atelier', 'Coaching', 'Programme sur mesure', 'E-learning', 'Audit besoins', 'Suivi apprenants'] },
      informatique: { label: 'Informatique / IT', services: ['Dépannage informatique', 'Maintenance', 'Cybersécurité', 'Installation matériel', 'Sauvegarde', 'Cloud', 'Support utilisateur', 'Audit système'] },
      expert_comptable: { label: 'Expert-comptable / Gestion', services: ['Comptabilité', 'Paie', 'Conseil gestion', 'Création entreprise', 'Tableau de bord', 'Déclarations', 'Accompagnement dirigeant', 'Rendez-vous bilan'] },
      juridique: { label: 'Juridique / Conseil', services: ['Conseil', 'Rédaction', 'Accompagnement dossier', 'Conformité', 'Audit', 'Rendez-vous', 'Formation', 'Suivi client'] },
    },
  },

  communication: {
    label: 'Communication',
    jobs: {
      agence_communication: { label: 'Agence de communication', services: ['Stratégie de communication', 'Identité visuelle', 'Campagne locale', 'Communication digitale', 'Accompagnement image de marque', 'Supports print', 'Conseil éditorial', 'Plan d’action'] },
      community_manager: { label: 'Community manager', services: ['Calendrier éditorial', 'Gestion réseaux sociaux', 'Création de contenus', 'Animation de communauté', 'Réponses messages', 'Reporting', 'Stratégie Instagram / Facebook', 'Shooting / reels'] },
      redacteur_web: { label: 'Rédacteur web / Copywriter', services: ['Pages site web', 'Articles SEO', 'Emails marketing', 'Fiches service', 'Storytelling', 'Optimisation conversion', 'Réécriture', 'Calendrier éditorial'] },
      graphiste: { label: 'Graphiste / Studio créatif', services: ['Logo', 'Charte graphique', 'Flyers', 'Brochures', 'Visuels réseaux sociaux', 'Cartes de visite', 'Supports publicitaires', 'Habillage de marque'] },
      agence_seo: { label: 'Agence SEO / SEA', services: ['Audit SEO', 'Optimisation pages', 'Rédaction SEO', 'Campagnes Google Ads', 'Suivi positionnement', 'Netlinking', 'Reporting', 'Accompagnement visibilité locale'] },
    },
  },
  juridique: {
    label: 'Juridique',
    jobs: {
      avocat: { label: 'Avocat', services: ['Premier rendez-vous', 'Conseil juridique', 'Analyse dossier', 'Rédaction d’actes', 'Négociation', 'Procédure', 'Suivi client', 'Accompagnement contentieux'] },
      notaire: { label: 'Notaire', services: ['Rendez-vous étude', 'Achat immobilier', 'Succession', 'Donation', 'Contrat de mariage', 'Création société', 'Conseil patrimonial', 'Signature acte'] },
      juriste_entreprise: { label: 'Juriste / Conseil aux entreprises', services: ['Contrats', 'Conformité', 'CGV / mentions légales', 'Protection des données', 'Secrétariat juridique', 'Audit juridique', 'Accompagnement création', 'Support dirigeants'] },
      huissier: { label: 'Commissaire de justice / Huissier', services: ['Constat', 'Recouvrement', 'Signification', 'Exécution décision', 'Jeux concours', 'Conseil pré-contentieux', 'Rendez-vous étude', 'Suivi dossier'] },
    },
  },
  finance: {
    label: 'Finance',
    jobs: {
      expert_comptable_finance: { label: 'Cabinet comptable / financier', services: ['Comptabilité', 'Bilan', 'Tableau de bord', 'Prévisionnel', 'Déclarations', 'Accompagnement dirigeant', 'Optimisation gestion', 'Rendez-vous conseil'] },
      courtier_credit: { label: 'Courtier en crédit', services: ['Simulation', 'Étude financement', 'Crédit immobilier', 'Renégociation', 'Assurance emprunteur', 'Montage dossier', 'Accompagnement banque', 'Conseil budget'] },
      gestion_patrimoine: { label: 'Conseiller en gestion de patrimoine', services: ['Bilan patrimonial', 'Stratégie d’investissement', 'Préparation retraite', 'Transmission', 'Optimisation fiscale', 'Assurance-vie', 'Rendez-vous conseil', 'Suivi patrimonial'] },
      daf_externalise: { label: 'DAF externalisé / Conseil financier', services: ['Pilotage trésorerie', 'Budget', 'Reporting', 'Prévisionnel', 'Analyse rentabilité', 'Structuration financière', 'Recherche financement', 'Accompagnement dirigeant'] },
    },
  },
  evenementiel: {
    label: 'Événementiel',
    jobs: {
      dj: { label: 'DJ / Animation', services: ['Mariage', 'Anniversaire', 'Soirée entreprise', 'Sonorisation', 'Éclairage', 'Playlist sur mesure', 'Pack animation', 'Devis événement'] },
      photographe: { label: 'Photographe', services: ['Mariage', 'Portrait', 'Famille', 'Entreprise', 'Événement', 'Shooting extérieur', 'Album / tirages', 'Séance découverte'] },
      wedding_planner: { label: 'Wedding planner', services: ['Organisation mariage', 'Coordination jour J', 'Sélection prestataires', 'Décoration', 'Planning', 'Accompagnement budget', 'Cérémonie laïque', 'Rendez-vous découverte'] },
      location_materiel: { label: 'Location de matériel', services: ['Location mobilier', 'Sonorisation', 'Éclairage', 'Vaisselle', 'Structures', 'Livraison', 'Installation', 'Devis sur mesure'] },
      traiteur_evenementiel: { label: 'Traiteur événementiel', services: ['Cocktail', 'Buffet', 'Repas assis', 'Brunch', 'Entreprise', 'Mariage', 'Livraison', 'Devis sur mesure'] },
      decorateur_evenementiel: { label: 'Décoration événementielle', services: ['Scénographie', 'Décoration salle', 'Arche / cérémonie', 'Table / centre de table', 'Location déco', 'Installation', 'Coordination', 'Projet sur mesure'] },
    },
  },
  animalier: {
    label: 'Animalier',
    jobs: {
      veterinaire: { label: 'Vétérinaire', services: ['Consultation', 'Vaccination', 'Bilan santé', 'Urgence', 'Conseils prévention', 'Chirurgie', 'Suivi animal', 'Informations cabinet'] },
      toilettage: { label: 'Salon de toilettage', services: ['Toilettage chien', 'Toilettage chat', 'Bain', 'Tonte', 'Démêlage', 'Coupe griffes', 'Entretien pelage', 'Forfait entretien'] },
      pension_animaliere: { label: 'Pension animale', services: ['Garde chien', 'Garde chat', 'Promenade', 'Jeux / socialisation', 'Séjour court', 'Séjour long', 'Visite des installations', 'Réservation'] },
      ecurie: { label: 'Écurie / Centre équestre', services: ['Pension cheval', 'Cours', 'Balades', 'Stage', 'Demi-pension', 'Sorties concours', 'Travail du cheval', 'Visite découverte'] },
      educateur_canin: { label: 'Éducateur canin', services: ['Bilan comportemental', 'Éducation chiot', 'Rééducation', 'Cours individuels', 'Cours collectifs', 'Balades éducatives', 'Conseils maîtres', 'Suivi'] },
      pet_sitter: { label: 'Pet-sitter', services: ['Visite à domicile', 'Promenade', 'Garde courte durée', 'Garde vacances', 'Soins de base', 'Nouvelles régulières', 'Rencontre préalable', 'Devis personnalisé'] },
    },
  },
  transport: {
    label: 'Transport',
    jobs: {
      taxi: { label: 'Taxi', services: ['Trajet local', 'Gare', 'Aéroport', 'Transport médical', 'Mise à disposition', 'Réservation', 'Entreprise', 'Course longue distance'] },
      vtc: { label: 'VTC', services: ['Transfert gare', 'Transfert aéroport', 'Trajet professionnel', 'Mise à disposition', 'Événement', 'Longue distance', 'Réservation', 'Accueil personnalisé'] },
      marchandises: { label: 'Transport de marchandises', services: ['Livraison locale', 'Messagerie', 'Transport express', 'Tournées régulières', 'Transport palettes', 'Livraison entreprise', 'Course dédiée', 'Devis logistique'] },
      demenagement: { label: 'Déménagement', services: ['Visite technique', 'Déménagement particulier', 'Déménagement entreprise', 'Emballage', 'Garde-meuble', 'Monte-meubles', 'Transport longue distance', 'Devis sur mesure'] },
      coursier: { label: 'Coursier / Livraison', services: ['Course urgente', 'Livraison documents', 'Livraison colis', 'Tournées', 'Entreprise', 'Suivi livraison', 'Course dédiée', 'Devis pro'] },
      ambulance: { label: 'Transport médical', services: ['Transport assis', 'Transport médicalisé', 'Aller-retour consultation', 'Hospitalisation', 'Réservation', 'Prise en charge administrative', 'Accompagnement patient', 'Disponibilités'] },
    },
  },
  autre: {
    label: 'Autre',
    jobs: {
      autre_activite: { label: 'Autre activité', services: ['Prestation principale', 'Service complémentaire', 'Conseil', 'Accompagnement', 'Intervention', 'Offre découverte', 'Suivi client', 'Demande de devis'] },
    },
  },
};

export function getJobsForSector(sector: string) {
  const pack = ACTIVITY_CATALOG[sector as ActivitySectorCategory] ?? ACTIVITY_CATALOG.autre;
  return Object.entries(pack.jobs).map(([value, job]) => ({ value, label: job.label }));
}

export function getServicesForSectorAndJob(sector: string, job: string) {
  const pack = ACTIVITY_CATALOG[sector as ActivitySectorCategory] ?? ACTIVITY_CATALOG.autre;
  const current = pack.jobs[job];
  if (!current) return [] as string[];
  return current.services;
}

export function getJobLabel(sector: string, job: string) {
  const pack = ACTIVITY_CATALOG[sector as ActivitySectorCategory] ?? ACTIVITY_CATALOG.autre;
  return pack.jobs[job]?.label ?? '';
}

export function isValidJobForSector(sector: string, job: string) {
  const pack = ACTIVITY_CATALOG[sector as ActivitySectorCategory] ?? ACTIVITY_CATALOG.autre;
  return Boolean(pack.jobs[job]);
}

export function findJobValueByLabel(sector: string, label: string) {
  const pack = ACTIVITY_CATALOG[sector as ActivitySectorCategory] ?? ACTIVITY_CATALOG.autre;
  const normalized = String(label || '').trim().toLowerCase();
  for (const [value, job] of Object.entries(pack.jobs)) {
    if (job.label.trim().toLowerCase() === normalized) return value;
  }
  return '';
}
