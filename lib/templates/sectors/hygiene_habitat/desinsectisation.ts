import type { JobTemplateDefinition } from '../shared';

export const desinsectisationJobTemplates: JobTemplateDefinition = {
  sector: 'hygiene_habitat',
  professionKey: 'desinsectisation',
  professionLabel: 'Désinsectisation',
  pack: {
    label: 'Désinsectisation',
    signature: 'traiter les infestations avec méthode, discrétion et prévention durable',
    promoLead: 'proposer un diagnostic ou une intervention contre insectes, punaises, cafards, guêpes ou frelons',
    infoLead: 'partager des conseils de prévention, les signes d’infestation et les bons réflexes avant intervention',
    followLead: 'suivre les diagnostics, traitements, passages de contrôle et contrats de prévention',
    surveyLead: 'identifier le nuisible, le niveau d’infestation, les zones touchées et l’urgence',
    seasonal: 'offre de saison pour prévenir ou traiter les infestations d’insectes',
    loyalty: 'avantage réservé aux clients suivis en prévention ou traitement récurrent',
    maintenance: 'un rappel utile pour contrôler les zones sensibles après traitement',
    localHook: 'désinsectisation locale et prévention nuisibles',
    audience: 'particuliers, commerces et professionnels confrontés à une infestation',
  },
};
