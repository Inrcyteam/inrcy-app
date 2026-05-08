import { securiteTemplates } from './common';
import { createJobTemplates } from '../shared';
import { agent_securiteJobTemplates } from './agent_securite';
import { controle_accesJobTemplates } from './controle_acces';
import { securite_incendieJobTemplates } from './securite_incendie';
import { telesurveillanceJobTemplates } from './telesurveillance';
import { videosurveillanceJobTemplates } from './videosurveillance';

export { securiteTemplates };

export function buildSecuriteJobTemplates() {
  return [agent_securiteJobTemplates, controle_accesJobTemplates, securite_incendieJobTemplates, telesurveillanceJobTemplates, videosurveillanceJobTemplates].flatMap((definition) => createJobTemplates(definition));
}
