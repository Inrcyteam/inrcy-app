import { services_particuliersTemplates } from './common';
import { createJobTemplates } from '../shared';
import { aide_domicileJobTemplates } from './aide_domicile';
import { menageJobTemplates } from './menage';
import { jardinageJobTemplates } from './jardinage';
import { garde_enfantsJobTemplates } from './garde_enfants';
import { depannage_domestiqueJobTemplates } from './depannage_domestique';
import { conciergerieJobTemplates } from './conciergerie';

export { services_particuliersTemplates };

export function buildServicesParticuliersJobTemplates() {
  return [aide_domicileJobTemplates, menageJobTemplates, jardinageJobTemplates, garde_enfantsJobTemplates, depannage_domestiqueJobTemplates, conciergerieJobTemplates].flatMap((definition) => createJobTemplates(definition));
}
