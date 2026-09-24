# Table de ciblage — Wi'Tech Agency
### Catégorie · entreprise précise · source de données · service · ville · prix

Date: 2026-09-16
Comptages **vérifiés en direct** le 2026-09-16 via l'API publique
`recherche-entreprises.api.gouv.fr` (données INSEE/SIRENE).
Prix issus des fourchettes marché France 2026 (sources en fin de document).

---

## 0. Le point le plus important de ce document

**Google Maps et le fichier SIRENE ne sont pas deux alternatives. Ils sont
complémentaires, et aucun des deux ne suffit seul.**

| | Google Maps | API SIRENE (gouv) |
|---|---|---|
| Liste précise par métier | ✗ (recherche par mots-clés, approximative) | ✓ **code NAF exact** |
| Filtre par taille d'entreprise | ✗ | ✓ **tranche d'effectif** |
| Nom du dirigeant | ✗ | ✓ |
| Adresse + GPS | ✓ | ✓ |
| Téléphone | ✓ souvent | ✗ **jamais** |
| Site web | ✓ souvent | ✗ **jamais** |
| E-mail | ✓ rarement (~41% chez toi) | ✗ **jamais** |
| Couverture PME industrielle en zone d'activité | faible | **exhaustive** |
| Gratuit / légal | zone grise | ✓ open data officiel |

**Vérifié :** l'API ne renvoie ni e-mail, ni téléphone, ni site web. Testé sur
un enregistrement complet — les champs n'existent pas.

**Donc le flux de travail est en trois temps, pas en un :**

1. **SIRENE** → la liste qualifiée (métier exact + taille + commune + dirigeant)
2. **Recherche du site** → nom d'entreprise + commune dans un moteur → leur site
3. **Le site** → `contact@`, formulaire, ou mentions légales (obligatoires en
   France, elles contiennent souvent un e-mail direct)

C'est plus lent que scraper Maps. C'est aussi pour ça que personne ne le fait,
et pourquoi la liste qui en sort n'est pas la même que celle de tes concurrents.

**Requête type (aucune clé d'API, gratuit) :**
```
https://recherche-entreprises.api.gouv.fr/search?activite_principale=25.62A&departement=74&tranche_effectif_salarie=11,12,21,22&per_page=25
```

Tranches d'effectif INSEE utiles : `11`=10-19 · `12`=20-49 · `21`=50-99 ·
`22`=100-199. Ta cible = `11,12,21,22`. En dessous de 10 salariés, on retombe
sur le profil artisan qui n'a pas répondu.

---

## 1. LA TABLE

### Tier 1 — Industrie (meilleur taux de réponse : 7-10%)

| # | Catégorie | Entreprise précise | Code NAF | Scrapable Maps ? | Source recommandée | Service à vendre | Ville / zone | Prix |
|---|---|---|---|---|---|---|---|---|
| 1 | Décolletage | Ateliers d'usinage de précision, sous-traitants automobile/médical | **25.62A** | ✗ Faible — en zone industrielle, fiche Maps souvent absente ou sans e-mail | **SIRENE** dept 74 : **486** au total, **115 de 10-199 salariés** | Site vitrine technique : parc machines, tolérances, certifications ISO 9001 / EN 9100, formulaire de consultation | **Cluses / Scionzier / Marnaz / Marignier / Vougy** (CP 74300 = **214 entreprises**) | **3 500 - 7 000 €** |
| 2 | Mécanique industrielle | Usinage général, tournage-fraisage, sous-traitance | **25.62B** | ✗ Faible | SIRENE : **341** (dept 74), **495** (dept 42) | Idem #1 + catalogue de pièces / espace client devis | **Loire (42)** — 495 entreprises, moins d'agences qu'en Haute-Savoie | **3 500 - 7 000 €** |
| 3 | Plasturgie | Injection plastique, moulistes, transformateurs | **22.29A / 22.29B** | ✗ Faible | SIRENE : **76** à Oyonnax (01100), **188 + 235** dept 01, **47 de 10-199 sal.** | Site vitrine + automatisation du traitement des demandes de devis | **Oyonnax (01100)** — cœur de la Plastics Valley | **3 500 - 7 000 €** |
| 4 | Métallurgie / tôlerie | Chaudronnerie, découpe, structures métalliques | **25.11Z** | ✗ Faible | SIRENE : **199** (dept 42) | Site vitrine + fiches produits + demande de devis en ligne | **Saint-Étienne / Loire** | **3 000 - 6 000 €** |

### Tier 2 — Services professionnels (taux de réponse 8-11%, avocats jusqu'à 10%)

| # | Catégorie | Entreprise précise | Code NAF | Scrapable Maps ? | Source recommandée | Service à vendre | Ville / zone | Prix |
|---|---|---|---|---|---|---|---|---|
| 5 | Expertise comptable | Cabinets d'expertise comptable | **69.20Z** | ✓ **Oui, bonne couverture** — cabinet en centre-ville, fiche Maps tenue à jour | Maps **+** SIRENE : **648** (dept 74), **529** (dept 42) | **Chatbot / assistant de qualification** : délais, tarifs, pièces à fournir. Plus prise de RDV en ligne | **Annecy / Annemasse (74)** ou **Saint-Étienne (42)** | Site **2 500 - 5 000 €** · Chatbot **1 500 - 3 500 €** + **50-150 €/mois** |
| 6 | Avocats | Cabinets d'avocats, toutes spécialités | **69.10Z** | ✓ **Oui, très bonne couverture** | Maps **+** SIRENE : **976** (dept 42) | Site + **automatisation de la prise de contact** (qualification de la demande avant le premier appel) | **Saint-Étienne / Loire** — 976 cabinets | Site **2 500 - 5 000 €** · Automatisation **2 000 - 5 000 €** |
| 7 | Bureaux d'études techniques | BE mécanique, thermique, structure, ingénierie | **71.12B** | ~ Moyen | **SIRENE** : **2 267** (dept 74) ⚠️ beaucoup de micro-structures — filtre obligatoire sur l'effectif | Site vitrine de références projets + automatisation du suivi d'affaires | **Haute-Savoie (74)** — le plus gros gisement du tableau | **3 000 - 6 000 €** |
| 8 | Architectes | Agences d'architecture | **71.11Z** | ✓ Oui | Maps **+** SIRENE : **699** (dept 42) | Site portfolio (leur métier est visuel, leur site est souvent mauvais) | **Loire (42)** | **3 000 - 6 000 €** |

### Tier 3 — À NE PAS cibler en cold email

| Catégorie | Pourquoi |
|---|---|
| Artisans du bâtiment (plombier, électricien, maçon) | Ta propre mesure : 84 destinataires, 0 réponse. Pas de bureau, e-mail consulté au volant, budget personnel. |
| Restauration | 18% seulement prévoient d'investir en informatique (vs 30% pour l'industrie). Secteur le plus en retard sur l'IA (20%). |
| Commerce de détail local | Même profil budgétaire que l'artisan, marges faibles, décision émotionnelle. |

---

## 2. Grille tarifaire détaillée

Fourchettes marché France 2026 : site vitrine professionnel **1 500 - 5 000 €**,
freelance senior **1 500 - 4 500 €**, agence **3 500 - 8 000 €**, e-commerce
jusqu'à **15 000 €**. Hébergement **60 - 300 €/an**, domaine **.fr 7 - 15 €/an**.

**Ton positionnement :** tu es seul, donc la fourchette freelance t'est
naturelle — mais la PME industrielle justifie le haut de cette fourchette, voire
le bas de la fourchette agence. Un atelier de 40 salariés ne compare pas ton
devis à celui d'un freelance Wix ; il le compare au coût d'une consultation
perdue.

| Prestation | Artisan (pour mémoire) | PME industrielle 10-199 sal. | Service professionnel |
|---|---|---|---|
| Site vitrine | 800 - 2 000 € | **3 500 - 7 000 €** | 2 500 - 5 000 € |
| Refonte + SEO technique | 1 500 - 3 000 € | **4 000 - 8 000 €** | 3 000 - 6 000 € |
| Automatisation (devis, relances, saisie) | — | **2 500 - 6 000 €** | 2 000 - 5 000 € |
| Chatbot / assistant | — | 1 500 - 4 000 € | **1 500 - 3 500 €** |
| Maintenance mensuelle | 30 - 80 €/mois | **80 - 250 €/mois** | 60 - 180 €/mois |

**Le récurrent est la vraie affaire.** 20 clients à 150 €/mois = 36 000 €/an
sans revendre quoi que ce soit. Mets-le dans chaque devis dès le premier, pas
en option plus tard.

**Règle de prix :** ne donne jamais le prix dans l'e-mail froid. Le prix se
donne après avoir entendu le problème, sinon tu te fais comparer à un template
à 29 €.

---

## 3. Où tu as le maximum de chances — le classement

**1er choix : Vallée de l'Arve, décolletage (CP 74300).**
214 entreprises dans un seul code postal, 115 de la bonne taille dans le
département. Un seul métier, un seul vocabulaire, un seul modèle d'e-mail. Zone
géographiquement isolée des pôles d'agences (Annecy, Genève, Lyon). Ils se
connaissent tous : une référence se propage.

**2e choix : Saint-Étienne / Loire (42).**
Le plus gros volume industriel du tableau (495 usinage + 199 tôlerie), et une
ville nettement moins saturée en agences que Lyon ou Annecy. C'est aussi le
meilleur terrain si tu veux mélanger industrie et services professionnels
(976 avocats, 529 experts-comptables, 699 architectes sur le même département).

**3e choix : Oyonnax, plasturgie (01100).**
76 entreprises dans la commune, 47 de la bonne taille dans le département. Plus
petit que l'Arve, mais la concentration de plasturgie la plus forte d'Europe et
un cluster très identitaire — tu peux écrire en initié.

**À éviter pour un premier cycle : Paris / Île-de-France.** 29,7% de toutes les
créations d'entreprises françaises, donc les boîtes mail les plus sollicitées du
pays.

---

## 4. Le plan d'attaque concret

1. **Tire la liste** : API SIRENE, `activite_principale=25.62A`,
   `departement=74`, `tranche_effectif_salarie=11,12,21,22` → 115 entreprises.
2. **Prends les 50 premières.** Pas 500. Ce segment se qualifie à la main.
3. **Trouve les sites** : nom + commune dans un moteur. Compte 2-3 minutes par
   entreprise, soit ~2h pour 50.
4. **Récupère l'e-mail** : `contact@`, ou les mentions légales (obligatoires,
   souvent avec un e-mail direct).
5. **Envoie** : modèle « site technique » à 25, modèle « automatisation devis »
   à 25. Même semaine, même montée en charge.
6. **Compare les deux taux de réponse.** C'est ça le vrai résultat du cycle —
   il te dit quel est ton angle, pas seulement si l'outil marche.

---

## 5. Ce qui est vérifié et ce qui ne l'est pas

**Vérifié en direct (API gouv, 2026-09-16) :** tous les comptages d'entreprises
par code NAF, département et commune. L'absence de champs e-mail / téléphone /
site dans l'API.

**Issu de la recherche marché :** les fourchettes de prix, les taux de réponse
par secteur, les statistiques de digitalisation.

**Jugement, non mesuré :** le classement « maximum de chances » par ville. Il
combine densité (mesurée) et saturation concurrentielle (estimée). Le premier
cycle de 50 le validera ou l'infirmera.

---

**Sources**
- API Recherche d'Entreprises — data.gouv.fr / INSEE SIRENE (comptages en direct)
- Prix site internet 2026 — moustachestudio.fr, studioatable.fr, seedweb.fr
- Cold email benchmarks by industry 2026 — Snov.io, Cleverly
- Baromètre France Num 2025 — adoption numérique et IA des TPE-PME
