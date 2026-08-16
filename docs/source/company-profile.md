<!-- Transcribed from `docs/التموين والاعاشة 2025.pdf` (19pp, REHAB company
     profile 2025). The PDF carries a usable text layer; pages were also
     rendered to images and spot-checked for anything the layer mangled —
     Arabic-Indic digits come out reversed by the extractor (١٢٠ → "٠٢١"),
     which is the one thing to distrust in a raw dump.

     Only the facts that constrain the model are kept. Marketing prose is not. -->

# REHAB — Catering & Provisioning, 2025

**شركة رحاب للخدمات والتسويق المحدودة** — Rehab Services & Marketing Co. Ltd.
Founded 2009, Makkah.

## Service lines

The profile names four distinct ways food is delivered. These are not styles of
the same thing — each has its own production and handling chain, which is why
the model carries them as a field rather than as a note.

| Line | Arabic | What it is |
|---|---|---|
| `buffet` | البوفيهات | Fully set-up buffets. Hotel Hajj catering, season 1446H. |
| `traditional` | الطبخ التقليدي | Cooked to order, Arab and international. |
| `frozen` | الوجبات مسبقة التحضير | Pre-prepared and frozen. Three stages: **packing & storage → thawing & preparation → reheating & serving.** |
| `dry` | الوجبات الجافة | Shelf-stable, no refrigeration or reheating. Field operations, seasons, emergencies. Delivered for Hajj 1444H in the Holy Sites with Mashariq. |

> "خيارات واسعة من الأصناف والأطباق تصل إلى ما يقارب **١٢٠ صنفًا**"
> — roughly **120 distinct dishes** in the catalogue.

## Operational capacity (p15)

| | |
|---|---|
| Catering | **40,000 meals/day** |
| Logistics | 10+ vehicles |
| Workforce | 500 seasonal staff |
| Sites | Makkah, Mina, Arafat |
| Quality systems | HACCP, ISO 22000 |

Services provided: preparation and supply of hot & cold meals; operation of
central kitchens in Makkah and the Holy Sites; supply-chain and storage
management; hotel catering.

## Certification (p19)

HACCP:2003 management system; ISO 22000. Consistent with the halal-certificate
and food-safety rules already in the engine — see `catering-engine.md` §6.

## What this changes in the model

1. **Service line is a real axis.** A dish served from a buffet, cooked to
   order, reheated from frozen, or handed over dry is the same food with four
   different handling chains. `Menu.service_line` carries it.
2. **40,000 meals/day** is the scale the seed should read as, not a few hundred.
3. **~120 dishes** means the recipe catalogue is a browse-and-search problem,
   not a list of ten.

## What it does NOT contain

No prices, no per-dish costs, no yields, no supplier names, no cover counts per
package. Everything commercial in the seed remains illustrative and is marked as
such — this document cannot source it.
