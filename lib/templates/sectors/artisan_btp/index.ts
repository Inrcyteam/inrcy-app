import { artisan_btpTemplates } from './common';
import { createJobTemplates } from '../shared';
import { carreleurJobTemplates } from './carreleur';
import { charpenteJobTemplates } from './charpente';
import { chauffagisteJobTemplates } from './chauffagiste';
import { constructionJobTemplates } from './construction';
import { couvreurJobTemplates } from './couvreur';
import { electricienJobTemplates } from './electricien';
import { facadeJobTemplates } from './facade';
import { maconJobTemplates } from './macon';
import { menuisierJobTemplates } from './menuisier';
import { peintreJobTemplates } from './peintre';
import { plombierJobTemplates } from './plombier';
import { renovationJobTemplates } from './renovation';
import { serrurerieJobTemplates } from './serrurerie';
import { terrassementJobTemplates } from './terrassement';

export { artisan_btpTemplates };

export function buildArtisanBtpJobTemplates() {
  return [carreleurJobTemplates, charpenteJobTemplates, chauffagisteJobTemplates, constructionJobTemplates, couvreurJobTemplates, electricienJobTemplates, facadeJobTemplates, maconJobTemplates, menuisierJobTemplates, peintreJobTemplates, plombierJobTemplates, renovationJobTemplates, serrurerieJobTemplates, terrassementJobTemplates].flatMap((definition) => createJobTemplates(definition));
}
