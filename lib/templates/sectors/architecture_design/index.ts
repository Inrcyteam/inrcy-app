import { architecture_designTemplates } from './common';
import { createJobTemplates } from '../shared';
import { architecteJobTemplates } from './architecte';
import { architecte_interieurJobTemplates } from './architecte_interieur';
import { decorateur_interieurJobTemplates } from './decorateur_interieur';
import { maitre_oeuvreJobTemplates } from './maitre_oeuvre';
import { bureau_etudes_batimentJobTemplates } from './bureau_etudes_batiment';

export { architecture_designTemplates };

export function buildArchitectureDesignJobTemplates() {
  return [architecteJobTemplates, architecte_interieurJobTemplates, decorateur_interieurJobTemplates, maitre_oeuvreJobTemplates, bureau_etudes_batimentJobTemplates].flatMap((definition) => createJobTemplates(definition));
}
