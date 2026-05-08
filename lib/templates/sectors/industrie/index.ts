import { industrieTemplates } from './common';
import { createJobTemplates } from '../shared';
import { chaudronnerieJobTemplates } from './chaudronnerie';
import { fabrication_industrielleJobTemplates } from './fabrication_industrielle';
import { maintenance_industrielleJobTemplates } from './maintenance_industrielle';
import { mecanique_industrielleJobTemplates } from './mecanique_industrielle';
import { metallurgieJobTemplates } from './metallurgie';
import { plasturgieJobTemplates } from './plasturgie';
import { scierieJobTemplates } from './scierie';
import { soudure_industrielleJobTemplates } from './soudure_industrielle';
import { traitement_surfaceJobTemplates } from './traitement_surface';
import { usinageJobTemplates } from './usinage';

export { industrieTemplates };

export function buildIndustrieJobTemplates() {
  return [chaudronnerieJobTemplates, fabrication_industrielleJobTemplates, maintenance_industrielleJobTemplates, mecanique_industrielleJobTemplates, metallurgieJobTemplates, plasturgieJobTemplates, scierieJobTemplates, soudure_industrielleJobTemplates, traitement_surfaceJobTemplates, usinageJobTemplates].flatMap((definition) => createJobTemplates(definition));
}
