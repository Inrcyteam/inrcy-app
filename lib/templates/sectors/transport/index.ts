import { transportTemplates } from './common';
import { createJobTemplates } from '../shared';
import { taxiJobTemplates } from './taxi';
import { vtcJobTemplates } from './vtc';
import { marchandisesJobTemplates } from './marchandises';
import { demenagementJobTemplates } from './demenagement';
import { coursierJobTemplates } from './coursier';
import { ambulanceJobTemplates } from './ambulance';

export { transportTemplates };

export function buildTransportJobTemplates() {
  return [taxiJobTemplates, vtcJobTemplates, marchandisesJobTemplates, demenagementJobTemplates, coursierJobTemplates, ambulanceJobTemplates].flatMap((definition) => createJobTemplates(definition));
}
