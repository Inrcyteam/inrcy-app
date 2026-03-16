import { artisan_btpTemplates } from './common';
import { createJobTemplates } from '../shared';
import { maconJobTemplates } from './macon';
import { plombierJobTemplates } from './plombier';
import { electricienJobTemplates } from './electricien';
import { couvreurJobTemplates } from './couvreur';
import { chauffagisteJobTemplates } from './chauffagiste';
import { menuisierJobTemplates } from './menuisier';
import { peintreJobTemplates } from './peintre';
import { carreleurJobTemplates } from './carreleur';
import { paysagisteJobTemplates } from './paysagiste';
import { piscinisteJobTemplates } from './pisciniste';

export { artisan_btpTemplates };

export function buildArtisanBtpJobTemplates() {
  return [maconJobTemplates, plombierJobTemplates, electricienJobTemplates, couvreurJobTemplates, chauffagisteJobTemplates, menuisierJobTemplates, peintreJobTemplates, carreleurJobTemplates, paysagisteJobTemplates, piscinisteJobTemplates].flatMap((definition) => createJobTemplates(definition));
}
