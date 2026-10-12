// A real response from POST https://polycase-mcp.vercel.app/api/tools/recommend_enclosure,
// captured 2026-10-12 and trimmed to the first two recommendations and the
// fields the mapper could read. Request body:
//   {"requirements": "Outdoor waterproof enclosure for a small sensor board and battery.
//    Minimum internal size 100 x 80 x 50 mm. NEMA 4X, wall mount."}
// `imageUrl` is kept on purpose: the tests assert it is never carried over.
export const POLYCASE_RECOMMEND_RESPONSE: unknown = {
  "ok": true,
  "result": {
    "totalConsidered": 1741,
    "recommendations": [
      {
        "rank": 1,
        "partNumber": "SK-14-02",
        "parentPartNumber": "SK-14",
        "variantOptions": {
          "color": "Gray",
          "clear_cover": "No"
        },
        "variantCount": 2,
        "productName": "SK-14 Enclosure with Knockouts (Gray, no clear cover)",
        "productUrl": "https://www.polycase.com/sk-14",
        "imageUrl": "https://www.polycase.com/media/catalog/product/cache/753ce678a20bfd275a0dc3aa4c458b50/s/k/sk-14-02_28.jpg",
        "whySelected": [
          "Internal space 101 × 101 × 54 mm meets the requested minimum.",
          "Rated for outdoor use (environment is \"outdoor\").",
          "Sealed against water (published waterproof, IP65+, or an outdoor NEMA type).",
          "Published NEMA 4X meets the requested NEMA 4X."
        ],
        "fit": null,
        "tradeoffs": [
          "Published mounting is \"Optional surface mounting kit (sold separately)\", which does not obviously match the requested wall mounting; an accessory bracket may be needed.",
          "$9.29 more per unit than the cheapest surviving option."
        ],
        "caveats": [],
        "price": {
          "basePriceUsd": 25.36,
          "priceBreaks": [
            {
              "minQty": 1,
              "maxQty": 9,
              "unitPriceUsd": 25.36
            },
            {
              "minQty": 10,
              "maxQty": 49,
              "unitPriceUsd": 24.23
            },
            {
              "minQty": 50,
              "maxQty": 99,
              "unitPriceUsd": 22.54
            },
            {
              "minQty": 100,
              "maxQty": 249,
              "unitPriceUsd": 21.53
            },
            {
              "minQty": 250,
              "maxQty": 499,
              "unitPriceUsd": 20.56
            },
            {
              "minQty": 500,
              "maxQty": 999,
              "unitPriceUsd": 19.63
            },
            {
              "minQty": 1000,
              "maxQty": null,
              "unitPriceUsd": 19.05
            }
          ]
        },
        "external": {
          "mm": {
            "length": 110,
            "width": 110,
            "height": 66
          },
          "in": {
            "length": 4.331,
            "width": 4.331,
            "height": 2.598
          },
          "formatted": "110 × 110 × 66 mm (4.33 × 4.33 × 2.60 in)",
          "approximate": true
        },
        "internal": {
          "mm": {
            "length": 101,
            "width": 101,
            "height": 54
          },
          "in": {
            "length": 3.976,
            "width": 3.976,
            "height": 2.126
          },
          "formatted": "101 × 101 × 54 mm (3.98 × 3.98 × 2.13 in)",
          "approximate": true
        },
        "internalVolumeCm3": 550.9
      },
      {
        "rank": 2,
        "partNumber": "ML-44F*15",
        "parentPartNumber": "ML-44F",
        "variantOptions": {
          "color": "Gray",
          "clear_cover": "No"
        },
        "variantCount": 2,
        "productName": "ML-44F Outdoor NEMA Enclosure (Gray, no clear cover)",
        "productUrl": "https://www.polycase.com/ml-44f",
        "imageUrl": "https://www.polycase.com/media/catalog/product/cache/753ce678a20bfd275a0dc3aa4c458b50/m/l/ml-44f-15_iso.jpg",
        "whySelected": [
          "Internal space 103 × 103 × 54 mm meets the requested minimum.",
          "Rated for outdoor use (environment is \"outdoor\").",
          "Sealed against water (published waterproof, IP65+, or an outdoor NEMA type).",
          "Published NEMA 4X meets the requested NEMA 4X."
        ],
        "fit": null,
        "tradeoffs": [
          "Published mounting is \"Molded-on flange\", which does not obviously match the requested wall mounting; an accessory bracket may be needed.",
          "22 cm³ larger than the smallest surviving option.",
          "$5.49 more per unit than the cheapest surviving option."
        ],
        "caveats": [],
        "price": {
          "basePriceUsd": 21.56,
          "priceBreaks": [
            {
              "minQty": 1,
              "maxQty": 9,
              "unitPriceUsd": 21.56
            },
            {
              "minQty": 10,
              "maxQty": 49,
              "unitPriceUsd": 18.61
            },
            {
              "minQty": 50,
              "maxQty": 99,
              "unitPriceUsd": 16.16
            },
            {
              "minQty": 100,
              "maxQty": 249,
              "unitPriceUsd": 14.25
            },
            {
              "minQty": 250,
              "maxQty": 499,
              "unitPriceUsd": 13.58
            },
            {
              "minQty": 500,
              "maxQty": 999,
              "unitPriceUsd": 13
            },
            {
              "minQty": 1000,
              "maxQty": 2499,
              "unitPriceUsd": 12.35
            },
            {
              "minQty": 2500,
              "maxQty": 4999,
              "unitPriceUsd": 11.72
            },
            {
              "minQty": 5000,
              "maxQty": null,
              "unitPriceUsd": 11.1
            }
          ]
        },
        "external": {
          "mm": {
            "length": 114,
            "width": 114,
            "height": 62
          },
          "in": {
            "length": 4.488,
            "width": 4.488,
            "height": 2.441
          },
          "formatted": "114 × 114 × 62 mm (4.49 × 4.49 × 2.44 in)",
          "approximate": true
        },
        "internal": {
          "mm": {
            "length": 103,
            "width": 103,
            "height": 54
          },
          "in": {
            "length": 4.055,
            "width": 4.055,
            "height": 2.126
          },
          "formatted": "103 × 103 × 54 mm (4.05 × 4.05 × 2.13 in)",
          "approximate": true
        },
        "internalVolumeCm3": 572.9
      }
    ],
    "unknowns": [
      "Battery dimensions were not stated, so no arrangement including it can be confirmed."
    ],
    "disclaimer": "Fit checks use Polycase's published approximate internal dimensions. Always verify against the 2D drawing / STEP model before committing a design.",
    "purchaseNote": "Double-check before purchasing: confirm dimensions against the Polycase 2D drawing or STEP model, and confirm compatibility, mounting hardware, price and stock on polycase.com. Customization is confirmed only by Polycase at drawing review.",
    "sources": [
      {
        "url": "https://www.polycase.com/sk-14",
        "sourceType": "polycase-website",
        "lastVerified": "2026-08-22",
        "label": "SK-14-02 product page"
      },
      {
        "url": "https://www.polycase.com/ml-44f",
        "sourceType": "polycase-website",
        "lastVerified": "2026-08-22",
        "label": "ML-44F*15 product page"
      },
      {
        "url": "https://www.polycase.com/wa-28f",
        "sourceType": "polycase-website",
        "lastVerified": "2026-08-22",
        "label": "WA-28F product page"
      },
      {
        "url": "https://www.polycase.com/wc-28f",
        "sourceType": "polycase-website",
        "lastVerified": "2026-08-22",
        "label": "WC-28F product page"
      },
      {
        "url": null,
        "sourceType": "derived",
        "lastVerified": "2026-08-22",
        "label": "Polycase catalog 0.2.0-20260822, Imported from 548 enclosure and 620 accessory product-page captures from polycase.com (newest capture 2026-08-22) by scripts/import/import-polycase-raw.ts."
      }
    ],
    "catalogVersion": "0.2.0-20260822"
  }
};
