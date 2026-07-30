# Correctif final des incidents médias en production — 30 juillet 2026

## Incidents confirmés

### Vidéo de 160 Mo refusée en 413

L'application et les buckets autorisent déjà une vidéo source jusqu'à 300 Mio.
Le refus `Maximum size exceeded` intervient avant l'envoi des blocs TUS : la
limite globale du projet Supabase Storage est encore inférieure au fichier.

Action obligatoire, sans SQL :

1. ouvrir **Supabase Dashboard > Storage > Settings** ;
2. fixer **Global file size limit** à **320 MB** ;
3. enregistrer puis refaire l'essai.

La marge de 20 MB évite toute ambiguïté MB/Mio. Les règles applicatives et les
buckets continuent de refuser les sources dépassant 300 Mio.

### Cinq images qui disparaissent puis génération en 502

Les journaux de production ont confirmé que les cinq images arrivaient bien à
la route de génération, mais que les moteurs Mistral, Vercel AI Gateway et
OpenAI refusaient ensuite au moins une donnée image comme invalide.

Le correctif :

- produit les nouveaux aperçus IA en JPEG baseline sRGB ;
- enregistre une empreinte SHA-256 de chaque sortie normalisée ;
- vérifie l'intégrité avant envoi ;
- répare automatiquement les anciennes variantes avec Sharp ;
- essaie `ai_preview`, puis `canonical`, puis `thumbnail` ;
- charge jusqu'à cinq images avec une concurrence bornée à trois ;
- conserve les aperçus locaux tant qu'une URL serveur n'est pas décodable ;
- attend la préparation principale avant le préchauffage afin d'éviter le 409.

## Déploiement

- aucune nouvelle migration SQL ;
- aucune nouvelle variable Vercel ;
- conserver les dix flags du pipeline final à `true` ;
- exécuter `npm ci`, puis `npm run build` ;
- appliquer impérativement la limite globale Supabase Storage de 320 MB.

## Contrôles réalisés

- 129 tests du pipeline média ;
- 160 tests de génération et de passerelle IA ;
- 41 tests Booster, décisions d'images et limites média ;
- ESLint ciblé ;
- TypeScript ;
- build Next.js 16.2.11 complet avec Turbopack et collecte des 212 pages.

