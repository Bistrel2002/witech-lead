# Market analysis — website & automation services in France
### Where cold email actually converts, and who to aim at

Date: 2026-09-15 · For: Wi'Tech Lead / Wi'Tech Agency

---

## 1. The finding that changes the target

Your current target (artisans found on Google Maps) is the worst-performing
cold email segment available to you. Three independent sources say so:

| Source | What it says |
|---|---|
| Your own production data (2026-09-07) | 84 recipients, **0 replies**, 0 meetings |
| French freelance-prospecting analysis | local TPE are "the worst commercial target for a freelancer, classic prospecting almost never works" |
| 2026 cold email benchmarks by industry | local trades don't even appear among responsive segments |

Cold email reply rates by industry, 2026 benchmarks:

| Industry | Reply rate |
|---|---|
| Non-profit / education | 12-15% |
| Legal services | up to 10% |
| Professional services | 8-11% |
| Manufacturing | 7-10% |
| Healthcare tech | 6-9% |
| Logistics / manufacturing (avg) | ~6% |
| **B2B overall benchmark** | **3.43%** |
| SaaS / software | under 1-2% (saturated) |

Artisans, restaurants and local retail are absent from the top of that table.
Manufacturing and professional services sit near the top.

**You were not measuring a bad product. You were measuring a bad list.**

---

## 2. Where the money actually is (France, 2025-2026 data)

**Website penetration**
- 61% of TPE-PME have a website (Afnic 2025), **down from 70% in 2024**
- 26% say the web generates more than 30% of their revenue
- So ~39% have no site — but those are disproportionately the smallest, least
  willing to pay. Absence of a website is not the same as budget for one.

**AI & automation — the real gap**
- 26% of French SMEs use at least one AI solution (**doubled** from 13% in 2024)
- 22% use generative AI (text/voice/image)
- **Only 14% use chatbots or conversational assistants** ← largest unmet gap
- 70% claim digital skills, 55% in-house

**Why they don't buy (the 5 barriers — these are your sales angles)**
| Barrier | % of SMEs |
|---|---|
| Lack of internal skills | 72% |
| Limited budget | 68% |
| Perceived complexity | 54% |
| Resistance to change | 49% |
| Lack of time | 43% |

Skills (72%) and time (43%) are exactly what an outside provider sells.
Budget (68%) is why the artisan segment fails and the PME segment works.

**Investment appetite**
- €15.8bn of digital investment planned by French SMEs in 2026
- **Industry: 30%** plan IT investment vs **restaurants: 18%**
- Hospitality lags on AI (20% vs 26% all sectors)

---

## 3. Who to target, ranked

### Tier 1 — PME industrielles / industrial subcontractors (10-50 employees)
**Why:** 7-10% cold email reply rate. 30% IT investment rate, the highest of
any sector. Real budgets, real staff, a real office where someone reads email.
Their customers are other businesses, so B2B outreach is a language they speak.

Their actual pain: a website from 2014 that doesn't list the machine park,
certifications (ISO 9001, EN 9100), or tolerances — the exact things a
purchasing department checks before sending an RFQ. Plus quote handling done
by hand in Outlook.

Deal size: €5-15k for a site, vs €800-2,000 for an artisan. **Same email effort,
5-10x the contract.**

### Tier 2 — Professional services (avocats, experts-comptables, bureaux d'études, cabinets de conseil)
**Why:** 8-11% reply rate, legal specifically up to 10% — the single most
responsive commercial category. Billable-hour businesses, so "you lose 3 hours
a week on X" converts directly into money they understand.

Their actual pain: intake and qualification of inbound requests, document
handling, appointment scheduling. This is where **chatbot/automation** genuinely
fits, not manufacturing.

### Tier 3 — avoid for cold email
Artisans, restaurants, local retail, and independent trades. Lowest investment
appetite, lowest reply rate, smallest deals, and no office routine around email.
Reach them by phone, referral or physical presence if you want them at all — not
by cold email.

---

## 4. Geography — target clusters, not cities

The strategic move is not picking a big city. It is picking an **industrial
cluster**: dozens-to-hundreds of companies in the same trade, inside a 30km
radius.

Why clusters beat cities for cold email:
- **One template works for all of them** — same trade, same problems, so you can
  write like an insider instead of a stranger
- **Density** — enough companies for a full campaign without changing your pitch
- **They talk to each other** — a single reference compounds through the cluster
- **Underserved** — agencies chase restaurants in city centres, not machine shops

### Concrete targets (verified)

| Cluster | Where | Size | Trade |
|---|---|---|---|
| **Plastics Valley** | Oyonnax (Ain / Jura) | **660 companies**, 14 industrial parks | Plastics — highest concentration in Europe |
| **Vallée de l'Arve** | Cluses, Scionzier, Marnaz, Sallanches (Haute-Savoie) | **~400 small establishments** + ~15 over 200 employees | Décolletage / precision machining |
| Saint-Étienne basin | Loire | Intermediate city, industrial heritage | Mechanics, design, textile |
| Roanne / Bourg-en-Bresse / Valence | AURA | Mid-size industrial towns | Mixed industry |

**Auvergne-Rhône-Alpes is the #1 industrial region in France** — 450,000+
industrial jobs, dominant in chemistry, mechanics, pharma and electrical
equipment.

**Avoid Île-de-France** for a first campaign: 29.7% of all French business
creation happens there, which also means maximum agency saturation and the most
solicited inboxes in the country.

**Recommended first campaign: Plastics Valley (Oyonnax).** 660 companies is a
full campaign on its own, one trade, one vocabulary, one template — and a
plastics processor has both a purchasing-driven website need and a documented
investment appetite.

---

## 5. Why cold email works on these and failed on artisans

| | Artisan (your old list) | PME industrielle (new list) |
|---|---|---|
| Who reads the inbox | the owner, on a phone, between job sites | an assistant or manager, at a desk, daily |
| Email address | often a personal Gmail scraped from Maps | `contact@` or a named person on the site |
| Budget process | personal money, no line item | budget line, quotes are routine |
| Deal size | €800-2,000 | €5,000-15,000 |
| Understands B2B outreach | rarely | yes, they prospect too |
| Website need | "I should probably have one" | "purchasing can't find our certifications" |

The mechanism you built (find → personalize → send → track) is unchanged. Only
the list changes.

---

## 6. Email templates that fit this market

Variables supported by your system: `{{company_name}}`, `{{website}}`, `{{phone}}`,
`{{city}}`, `{{sender_name}}`, `{{sender_phone}}`, `{{sender_signature}}`,
`{{unsubscribe_link}}` (auto-appended).

---

### Template 1 — Website, for PME industrielle / sous-traitant

**Objet :** `Votre parc machines en ligne`

```
Bonjour,

J'ai regardé {{website}} en cherchant des sous-traitants en {{city}}.

Une question de curiosité : quand un acheteur tombe sur votre site, est-ce
qu'il trouve votre parc machines, vos tolérances et vos certifications ? Sur
la plupart des sites du secteur, ces informations sont absentes — et c'est
exactement ce qu'un service achats vérifie avant d'envoyer une consultation.

Vous recevez des demandes de devis via le site aujourd'hui ? Oui ou non,
ça m'intéresse.

{{sender_signature}}
```

**Why it works:** the question is specific to their trade, verifiable in three
seconds, and names a business consequence (lost RFQs) rather than an aesthetic
one. It signals you know what a décolleteur's buyer actually looks for.

---

### Template 2 — Automation, for PME industrielle

**Objet :** `Vos devis passent par Excel ?`

```
Bonjour,

Je travaille avec des PME industrielles en {{city}} sur un sujet précis : le
traitement des demandes de devis.

Le schéma est presque toujours le même — la demande arrive par mail, quelqu'un
la ressaisit dans Excel, puis dans le logiciel de gestion. Deux à trois heures
par semaine, et une erreur de saisie de temps en temps.

Chez {{company_name}}, c'est manuel ou automatisé aujourd'hui ?

{{sender_signature}}
```

**Why it works:** it attacks the two barriers the data names as strongest —
lack of internal skills (72%) and lack of time (43%). It describes their
workflow before asking anything, which proves competence without claiming it.
The question is answerable in one word.

---

### Template 3 — Chatbot, for professional services (NOT industry)

**Honest note:** a chatbot is the weakest of the three pitches for a machine
shop — their inbound volume is low and technical. It works where inbound
question volume is high and repetitive: cabinets, santé, immobilier, formation.
Only 14% of French SMEs have one, so the gap is real, but aim it correctly.

**Objet :** `Les mêmes questions chaque semaine ?`

```
Bonjour,

Une question aux cabinets comme {{company_name}} : combien d'appels par semaine
portent sur les mêmes trois ou quatre questions — délais, tarifs, pièces à
fournir ?

C'est la partie du standard qui ne crée aucune valeur facturable, et c'est
aussi la plus simple à absorber automatiquement.

Vous diriez combien d'appels par semaine, à peu près ?

{{sender_signature}}
```

**Why it works:** it converts the pain into billable hours, which is the unit a
professional-services buyer thinks in. The CTA asks for a number, which is
easier to answer than a yes/no on a purchase.

---

### What all three avoid, deliberately

- No agency name in the subject
- No invented compliment ("votre superbe entreprise")
- No unverifiable number ("+30% de leads")
- No 30-minute meeting request — the CTA is answerable in one line
- No claim about their business you haven't verified from their own site

---

## 7. What this changes about the running plan

The 500-prospect campaign was designed for artisans in a city you hadn't worked.
The mechanism stays; the list and the template change.

**Revised first campaign:**
- **Where:** Plastics Valley (Oyonnax, Ain/Jura) — 660 companies
- **Who:** plastics processors and industrial subcontractors, 10-50 employees
- **Template:** #1 (website) as the primary, #2 (automation) as the A/B variant
- **Expected reply rate:** 7-10% band for manufacturing, vs the ~0% you measured
  on artisans. If you land under 3% here, the problem is the message. If you land
  in the band, you have a business.

**Scraping note:** Google Maps is a weaker source for industrial SMEs than for
artisans — many don't maintain a Maps listing. Better sources for this segment:
sector directories (Kompass, société.com, the Plastipolis / Thésame cluster
member lists), which list company, site and often a named contact.

---

## 8. The assignment

1. Pick **one** cluster — Oyonnax recommended.
2. Build a list of **100** companies, not 500. This segment is worth qualifying
   by hand; at 8% reply rate, 100 companies is ~8 conversations, which is enough
   to know.
3. Send template #1 to 50, template #2 to the other 50. Same week, same ramp.
4. Count replies per template. That single comparison tells you whether the
   website angle or the automation angle is the wedge — and that answer is worth
   more than the raw reply rate.

**Sources**
- Afnic « Réussir avec le web » 2025 via Les Créavores — website penetration
- Baromètre France Num 2025 (n=11,021) — AI/chatbot adoption
- INSEE Analyses AURA — Vallée de l'Arve industrial structure
- Ville d'Oyonnax / Plastics Vallée — cluster size
- Cold email benchmarks by industry 2026 — Snov.io, Cleverly, Cleanlist
- independant.io, indepro.fr — TPE/PME statistics and local-TPE prospecting
