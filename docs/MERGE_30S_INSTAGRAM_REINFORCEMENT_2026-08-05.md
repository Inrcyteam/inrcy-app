# Fusion bilan publication 30 s + renfort Instagram

Base: `inrcy-app-48-hotfix-publication-performance-renfort-instagram-sans-deconnexion(1).zip`.

Ajouts fusionnes depuis `inrcy-app-48-hotfix-publication-bilan-30s(1).zip`:

- fenetre de bilan publication portee a 30 secondes maximum;
- sortie immediate lorsque tous les canaux sont deja termines;
- conservation du meilleur bilan acquis (ex. 8 succes, 2 traitements);
- progression visuelle alignee sur la fenetre de 30 secondes;
- tests dedies de la grace de 30 secondes.

Le renfort Instagram est conserve integralement:

- decouverte multi-token et fallbacks Meta;
- preservation de la selection et des tokens existants;
- reconnexion sans deconnexion forcee des comptes deja actifs;
- diagnostics et messages de decouverte renforces.
