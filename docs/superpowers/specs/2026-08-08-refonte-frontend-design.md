# Refonte frontend + page vitrine — Conception

**Statut :** Approuvée
**Date :** 2026-08-08
**Périmètre :** frontend uniquement. Aucune modification du backend.

## Problème

Deux besoins distincts, exprimés ensemble :

1. **Il n'existe aucune page de présentation publique.** Le produit ne peut pas
   être vendu : un prospect n'a rien à regarder, et l'offre commerciale n'est
   écrite nulle part.
2. **L'interface de l'application est jugée trop basique** par son propriétaire.
   Elle fonctionne, mais elle ne soutient pas un positionnement payant à
   49-249 €/mois.

## Contrainte structurante : rien de fictif

Exigence explicite du propriétaire : *« si une information est affichée, elle
doit correspondre au backend »*.

La frontière retenue :

- **La page vitrine peut annoncer les limites des plans.** C'est une promesse
  commerciale, au même titre que n'importe quelle page de tarifs d'un SaaS
  avant lancement.
- **L'application n'affichera aucun élément lié au plan** : pas de badge
  « Vous êtes sur Pro », pas de compteur « 2/3 campagnes actives », pas de
  jauge d'e-mails consommés. Rien dans le backend ne calcule ces valeurs
  aujourd'hui ; les afficher serait les inventer.

Ces éléments apparaîtront quand l'application des quotas sera construite —
projet distinct, planifié par le propriétaire dans les semaines à venir.

## L'offre commerciale

Grille validée après plusieurs itérations :

| | **Starter 49 €** | **Pro 99 €** | **Agence 249 €** |
|---|---|---|---|
| E-mails / mois | 1 500 | 5 000 | 15 000 |
| Prospects | illimités | illimités | illimités |
| Campagnes créées | illimitées | illimitées | illimitées |
| Campagnes actives simultanément | 1 | 3 | illimité |
| Base entreprises France | recherche | ciblage avancé | ciblage avancé |
| Interlocuteur dédié | — | — | ✓ |
| Essai 14 jours, 100 e-mails, sans carte | ✓ | ✓ | ✓ |

**Décisions et leur raison :**

- **Volumes mensuels, pas journaliers.** Un acheteur SaaS raisonne au mois, et
  « 5 000 e-mails/mois » se compare à la concurrence, contrairement à
  « 170/jour ». Un sous-plafond journalier sera appliqué en interne pour
  protéger la réputation d'envoi, sans être exposé au client.
- **Prospects illimités partout**, à la demande du propriétaire. À noter : cela
  signifie scraping illimité, qui est le seul coût variable réel (temps machine
  Playwright), l'e-mail coûtant environ 0,10 € les mille. Point de vigilance,
  pas un blocage.
- **Campagnes actives simultanément plutôt que campagnes créées.** Limiter le
  nombre total de campagnes punit la segmentation — or segmenter par métier et
  par ville est précisément ce qui fait monter les taux de réponse. Limiter les
  campagnes *simultanées* laisse le client s'organiser librement, se justifie
  techniquement (les envois sont espacés pour protéger la réputation, les
  paralléliser n'a de sens qu'à volume élevé), et crée un déclencheur de montée
  en gamme concret et ressenti.
- **Pas de sièges.** Recommandés initialement puis retirés : le multi-utilisateur
  n'existe pas dans le produit. Chaque compte est isolé, la table `users` n'a ni
  organisation ni invitation, et le « TeamSpace » est un portail interne protégé
  par mot de passe, pas un espace de travail partagé.
- **Fonctionnalités retirées** parce qu'elles n'existent pas : rapports de
  délivrabilité, support prioritaire, accompagnement au démarrage.
  « Interlocuteur dédié » est conservé sur le plan Agence : c'est une promesse
  de service que le propriétaire tient lui-même, assumée explicitement.
- **Bouton « Nous contacter »** sur chaque plan, pas « S'abonner ». Aucun
  paiement n'est implémenté ; le prospect prend contact, le compte est créé
  manuellement. Le bouton deviendra un parcours d'achat quand Stripe sera là.

## Sous-projet 1 — Socle visuel

Fondation dont tout le reste dépend.

**Thème double, clair et sombre, au choix de l'utilisateur.** Le propriétaire
l'a choisi en connaissance du coût annoncé. Ce coût est fortement réduit du fait
qu'on construit le socle de zéro : en définissant les couleurs comme variables
CSS dès le départ, le second thème n'est qu'un second jeu de valeurs, pas une
seconde conception. Le risque résiduel — un contraste cassé quelque part, sans
test frontend pour le signaler — est réel et se traite à la relecture.

**Identité.** Dérivée du logo fourni : dégradé magenta → violet
(`#c026d3` → `#9333ea`), formes arrondies, fond sombre profond. Les polices
Outfit et Inter sont déjà chargées dans `frontend/index.html` et sont conservées.

**Règle de couleur.** Le magenta est la couleur d'action : boutons, liens,
éléments actifs. Le vert signale le succès, le rouge l'erreur, l'ambre
l'avertissement. Une donnée n'est jamais colorée en magenta pour décorer —
sinon la couleur d'action perd son sens.

**Livrables :** jeu de variables CSS (couleurs, typographie, espacements,
rayons, ombres) en deux thèmes, bascule persistée, et les composants de base :
bouton, carte, tableau, champ de saisie, badge de statut, navigation latérale.

Tailwind v4 est déjà en place (`@import "tailwindcss"` dans
`frontend/src/index.css`) ; les variables s'y intègrent via son mécanisme de
thème natif.

## Sous-projet 2 — Page vitrine publique

Page accessible sans compte.

**Structure :** accroche (le CRM de prospection qui trouve, écrit, envoie et
suit) → le fonctionnement en quatre étapes → la base entreprises France comme
argument central → la grille tarifaire → formulaire de contact.

**Positionnement.** Corrigé par le propriétaire : ce n'est pas un outil
d'emailing, c'est **un CRM de prospection**. Le suivi — tableau de bord, statut
de chaque prospect, historique des campagnes — fait partie de la proposition de
valeur au même titre que la recherche et l'envoi. L'argument différenciant
principal reste l'accès à la base des entreprises françaises avec ciblage fin,
que les concurrents (Lemlist, Waalaxy, La Growth Machine) n'ont pas.

**Servie séparément de l'application.** Le frontend n'a pas de routeur, et un
visiteur n'a aucune raison de télécharger tout le CRM. Une page distincte évite
d'introduire un routeur dans une application qui n'en a pas besoin par ailleurs.

## Sous-projet 3 — Refonte de l'application

Sept pages, environ 5 300 lignes, reprises **une par une** — pas en une seule
passe. Sans test frontend, une refonte en bloc est le scénario où des
régressions passent inaperçues.

Ordre, par visibilité décroissante : Connexion → Tableau de bord → Prospects →
Campagnes → Configurations → Espace équipe → Administration.

`LeadsManager.jsx` (1 957 lignes) et `Campaigns.jsx` (1 226 lignes) sont
nettement au-dessus d'une taille confortable. Là où la refonte le permet
naturellement, les sous-composants seront extraits — sans restructuration
gratuite qui ne servirait pas la refonte.

**Seule la présentation change.** Aucune modification de la logique métier, des
appels API ou du backend.

## Vérification

Aucun framework de test frontend n'existe et le projet n'en introduit pas.
La vérification repose sur :

- `npm run lint --prefix frontend` — aucune nouvelle erreur par rapport à la
  base actuelle (74 problèmes préexistants)
- `npm run build --prefix frontend` — le build passe
- Contrôle visuel dans le navigateur, **dans les deux thèmes**, pour chaque page
- Vérification que chaque donnée affichée provient d'un point d'API existant

## Hors périmètre

- Toute modification du backend, y compris l'application des quotas.
- Le paiement en ligne (Stripe) et la notion de plan en base.
- Le multi-utilisateur / les organisations.
- L'introduction d'un routeur dans l'application.
- Un framework de test frontend.
