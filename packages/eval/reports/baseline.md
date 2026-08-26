# Stage 1 baseline — 2618 documents (2000 labeled + 600 hard-negative), seeds 12648430/48879

Corpus: 2618 documents, 5338 ground-truth entities, 9438 sensitive predictions. Mean document length 185 chars.

**This corpus is synthetic.** Values are generator-made, carriers are template sentences, and hard negatives are constructed categories. The numbers measure the detectors against this corpus, not against real-world text; real-world performance will differ, most likely downward on precision for the context-free detectors.

## Per entity type

| type | GT | pred | P | R (partial) | R (exact) | F1 | FP | FN |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| API_KEY | 470 | 509 | 92.3% | 100.0% | 99.6% | 96.0% | 39 | 0 |
| AU_BSB | 5 | 5 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| BR_AGENCIA | 11 | 11 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| CA_TRANSIT_NUMBER | 17 | 17 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| CONNECTION_STRING | 133 | 133 | 100.0% | 100.0% | 77.4% | 100.0% | 0 | 0 |
| COORDINATES | 71 | 71 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| CREDIT_CARD | 165 | 171 | 96.5% | 100.0% | 100.0% | 98.2% | 6 | 0 |
| CRYPTO_WALLET | 629 | 633 | 99.4% | 100.0% | 100.0% | 99.7% | 4 | 0 |
| DRIVERS_LICENSE | 5 | 19 | 26.3% | 100.0% | 100.0% | 41.7% | 14 | 0 |
| EMAIL | 644 | 792 | 81.3% | 100.0% | 100.0% | 89.7% | 148 | 0 |
| GENERIC_SECRET | 72 | 2308 | 3.1% | 100.0% | 98.6% | 6.1% | 2236 | 0 |
| HEALTH_DATA | 432 | 469 | 92.1% | 100.0% | 100.0% | 95.9% | 37 | 0 |
| IBAN | 185 | 185 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| IN_IFSC | 16 | 16 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| IP_ADDRESS | 209 | 233 | 89.7% | 100.0% | 100.0% | 94.6% | 24 | 0 |
| JWT | 155 | 155 | 100.0% | 100.0% | 97.4% | 100.0% | 0 | 0 |
| MAC_ADDRESS | 65 | 65 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| NATIONAL_ID | 509 | 896 | 67.2% | 100.0% | 99.8% | 80.4% | 294 | 0 |
| PASSPORT_MRZ | 37 | 37 | 100.0% | 100.0% | 0.0% | 100.0% | 0 | 0 |
| PHONE | 604 | 604 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| POSTAL_CODE | 80 | 980 | 5.9% | 72.5% | 72.5% | 10.9% | 922 | 22 |
| PRIVATE_KEY | 63 | 63 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| STREET_ADDRESS | 209 | 222 | 94.1% | 100.0% | 98.1% | 97.0% | 13 | 0 |
| SWIFT_BIC | 75 | 85 | 88.2% | 100.0% | 100.0% | 93.8% | 10 | 0 |
| TAX_ID | 143 | 284 | 54.6% | 100.0% | 100.0% | 70.6% | 129 | 0 |
| UK_SORT_CODE | 4 | 4 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| URL_WITH_CREDENTIALS | 80 | 213 | 37.6% | 100.0% | 72.5% | 54.6% | 133 | 0 |
| US_NPI | 3 | 4 | 75.0% | 100.0% | 100.0% | 85.7% | 1 | 0 |
| US_ROUTING_NUMBER | 5 | 12 | 41.7% | 100.0% | 100.0% | 58.8% | 7 | 0 |
| VAT_NUMBER | 154 | 154 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| VIN | 88 | 88 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |

## Per language

| language | GT | pred | P | R (partial) | R (exact) | F1 | FP | FN |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ar | 190 | 291 | 65.3% | 100.0% | 97.4% | 79.0% | 101 | 0 |
| cs | 186 | 347 | 53.6% | 100.0% | 98.4% | 69.8% | 161 | 0 |
| da | 270 | 474 | 59.7% | 99.3% | 97.8% | 74.6% | 191 | 2 |
| de | 261 | 452 | 57.1% | 98.9% | 96.2% | 72.4% | 194 | 3 |
| el | 219 | 368 | 59.5% | 100.0% | 99.5% | 74.6% | 149 | 0 |
| en | 236 | 716 | 35.5% | 100.0% | 96.2% | 52.4% | 462 | 0 |
| es | 239 | 363 | 65.3% | 99.2% | 97.5% | 78.7% | 126 | 2 |
| fa | 189 | 347 | 54.5% | 100.0% | 98.9% | 70.5% | 158 | 0 |
| fi | 230 | 422 | 54.3% | 99.6% | 95.2% | 70.2% | 193 | 1 |
| fr | 192 | 333 | 59.2% | 99.5% | 97.9% | 74.2% | 136 | 1 |
| he | 215 | 369 | 61.2% | 100.0% | 97.7% | 76.0% | 143 | 0 |
| hi | 229 | 370 | 63.0% | 99.6% | 97.4% | 77.1% | 137 | 1 |
| it | 216 | 353 | 60.6% | 99.1% | 95.8% | 75.2% | 139 | 2 |
| ja | 157 | 273 | 58.2% | 100.0% | 98.7% | 73.6% | 114 | 0 |
| ko | 214 | 376 | 56.9% | 100.0% | 98.1% | 72.5% | 162 | 0 |
| nl | 192 | 332 | 57.8% | 99.0% | 95.8% | 73.0% | 140 | 2 |
| pl | 229 | 400 | 58.0% | 99.1% | 98.3% | 73.2% | 168 | 2 |
| pt | 193 | 342 | 59.4% | 100.0% | 98.4% | 74.5% | 139 | 0 |
| ro | 209 | 347 | 60.2% | 100.0% | 99.0% | 75.2% | 138 | 0 |
| ru | 250 | 414 | 61.4% | 99.6% | 98.8% | 75.9% | 160 | 1 |
| sv | 217 | 391 | 57.5% | 99.1% | 97.7% | 72.8% | 166 | 2 |
| th | 228 | 371 | 61.2% | 99.6% | 98.7% | 75.8% | 144 | 1 |
| tr | 197 | 344 | 60.5% | 100.0% | 99.0% | 75.4% | 136 | 0 |
| uk | 194 | 327 | 60.6% | 99.5% | 97.4% | 75.3% | 129 | 1 |
| zh | 186 | 316 | 58.5% | 99.5% | 97.3% | 73.7% | 131 | 1 |

## Raw confidence vs. empirical precision (NOT calibration)

Stage 1 confidences are detector-local and only ordered; real calibration requires Stage 4 fusion (M8). This is a first look only.

| bucket | predictions | matched | precision |
| --- | ---: | ---: | ---: |
| HIGH(0.85) | 4824 | 4117 | 85.3% |
| LOW(0.3) | 3524 | 339 | 9.6% |
| MAXIMUM(0.99) | 100 | 100 | 100.0% |
| MEDIUM(0.6) | 990 | 865 | 87.4% |

## Hard-negative false positives by category

| category | sensitive detections (all FP) |
| --- | ---: |
| base64-blob | 100 |
| checksum-failures | 65 |
| hex-artifacts | 1 |
| labeled-examples | 67 |
| order-numbers | 47 |
| placeholder-code | 37 |
| version-numbers | 15 |

## Latency

p50 0.14ms · p95 0.48ms · p99 1.05ms · max 9.20ms per document (normalize + all detectors).

## Worst false positives (highest confidence first)

- **EMAIL** `email` conf 0.85 in doc-12648430-5 (tr/log)
  `…06Z INFO request from mongodb+srv://svc:lEJZBLRTkloYvrhcpdb@cluster0.mongodb.net:5432/appdb accepted⏎…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-5 (tr/log)
  `…⏎2026-08-20T11:32:06Z INFO request from mongodb+srv://svc:lEJZBLRTkloYvrhcpdb@cluster0.mongodb.net:5432/appdb accepted⏎…`
- **NATIONAL_ID** `national-id-in-aadhaar` conf 0.85 in doc-12648430-7 (pl/json)
  `…{⏎  "account": {⏎    "contact": "+558121345678",⏎    "reference": "6518849955",⏎    "n…`
- **NATIONAL_ID** `national-id-ca-sin` conf 0.85 in doc-12648430-28 (ro/cv)
  `…e⏎Email: o'brien@sub.domain.net⏎Tel: +6 141 234 567 8⏎세종대로 256⏎⏎Ședința a fost mutată joi.⏎…`
- **NATIONAL_ID** `national-id-th` conf 0.85 in doc-12648430-29 (ja/json)
  `…{⏎  "account": {⏎    "contact": "+8613912345678",⏎    "reference": "675932456964",⏎    …`
- **NATIONAL_ID** `national-id-ca-sin` conf 0.85 in doc-12648430-30 (ru/email)
  `…сено на четверг.⏎⏎С уважением,⏎Tel: +81 901 234 567 8⏎first.middle.last@gmail.com⏎…`
- **NATIONAL_ID** `national-id-in-aadhaar` conf 0.85 in doc-12648430-31 (sv/cv)
  `…mail: first.middle.last@gmail.com⏎Tel: +558121345678⏎⏎Mötet flyttades till torsdag.⏎…`
- **NATIONAL_ID** `national-id-hr-oib` conf 0.85 in doc-12648430-33 (de/email)
  `…men,⏎⏎Sie erreichen die Abteilung unter 93657824508 während der Bürozeiten.⏎Der Mitarbeiter…`
- **NATIONAL_ID** `national-id-th` conf 0.85 in doc-12648430-34 (ro/medical)
  `…istrată.⏎HbA1c 21.2 g/dL [21-46]⏎SNOMED 2697926275001⏎Mulțumim pentru răspunsul rapid.⏎…`
- **TAX_ID** `national-id-gr-afm` conf 0.85 in doc-12648430-35 (nl/csv)
  `…iVt3A7nRiw61DH1HwpVPY,ok⏎3,BE0279831043,794083101,ok⏎…`
- **NATIONAL_ID** `national-id-ca-sin` conf 0.85 in doc-12648430-38 (en/email)
  `… hours.⏎Please send the paperwork to +6 141 234 567 8 before Friday.⏎The quarterly review m…`
- **EMAIL** `email` conf 0.85 in doc-12648430-40 (da/yaml)
  `…service:⏎  owner_contact: redis://app:iX9irCCXPdb5e7v@prod-db.corp:5432/appdb⏎  billing_id: ghp_hN8mzZGriQ…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-40 (da/yaml)
  `…service:⏎  owner_contact: redis://app:iX9irCCXPdb5e7v@prod-db.corp:5432/appdb⏎  billing_id: ghp_hN8mzZGriQ7ex88w87JaD…`
- **NATIONAL_ID** `national-id-ca-sin` conf 0.85 in doc-12648430-43 (zh/log)
  `…6-08-22T15:34:04Z INFO request from +44 791 112 345 6 accepted⏎2026-08-26T20:22:09Z INFO re…`
- **TAX_ID** `national-id-pl-regon` conf 0.85 in doc-12648430-44 (he/prose)
  `…התשלום עם האסמכתא 543104905 התקבל. בתיק רשום xoxb-EM2ZdpYD0FKWdSRPF…`
- **TAX_ID** `national-id-gr-afm` conf 0.85 in doc-12648430-44 (he/prose)
  `…התשלום עם האסמכתא 543104905 התקבל. בתיק רשום xoxb-EM2ZdpYD0FKWdSRPF…`
- **EMAIL** `email` conf 0.85 in doc-12648430-48 (it/yaml)
  `…service:⏎  owner_contact: https://admin:s3cr3t_key_77@build.ci.dev/app⏎  billing_id: 6521020690694299⏎  no…`
- **TAX_ID** `national-id-gr-afm` conf 0.85 in doc-12648430-49 (fr/csv)
  `…artup.io,114.214.143.103,ok⏎2,79513-614,969142058,ok⏎3,TEwYZmbju2iJRbtrUDEqNyKYi9DpCwps2N…`
- **EMAIL** `email` conf 0.85 in doc-12648430-57 (da/code)
  `…tet til torsdag.⏎ENDPOINT = "amqp://svc:auBk4RV9mEsv0dFZn@db.internal:5432/appdb"⏎…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-57 (da/code)
  `…det er flyttet til torsdag.⏎ENDPOINT = "amqp://svc:auBk4RV9mEsv0dFZn@db.internal:5432/appdb"⏎…`
- **NATIONAL_ID** `national-id-in-aadhaar` conf 0.85 in doc-12648430-58 (el/cv)
  `…Vitae⏎Email: x.y.z@sub.domain.net⏎Tel: +558121345678⏎세종대로 425⏎⏎Ευχαριστούμε για την άμεση απ…`
- **EMAIL** `email` conf 0.85 in doc-12648430-61 (sv/markdown-table)
  `…y1k9h5K12ZV |⏎| reference | redis://svc:OJSfEsGxTOo3yuGI@cluster0.mongodb.net:5432/appdb |⏎…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-61 (sv/markdown-table)
  `…VlDjYajeHbEOy1k9h5K12ZV |⏎| reference | redis://svc:OJSfEsGxTOo3yuGI@cluster0.mongodb.net:5432/appdb |⏎…`
- **NATIONAL_ID** `national-id-ca-sin` conf 0.85 in doc-12648430-66 (uk/email)
  `… швидку відповідь.⏎⏎З повагою,⏎Tel: +44 791 112 345 6⏎a@gmail.com⏎…`
- **NATIONAL_ID** `national-id-in-aadhaar` conf 0.85 in doc-12648430-70 (zh/email)
  `…E5510585WH 的付款已经到账。⏎会议改到了周四。⏎⏎此致，⏎Tel: +558121345678⏎jane_doe@münchen.de⏎…`
- **EMAIL** `email` conf 0.85 in doc-12648430-83 (el/email)
  `…σας,⏎⏎Η πληρωμή με στοιχείο redis://svc:Qv3FB062QqErn74SNlP@cluster0.mongodb.net:5432/appdb καταχωρήθηκε.⏎Η πληρωμή με σ…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-83 (el/email)
  `…Γεια σας,⏎⏎Η πληρωμή με στοιχείο redis://svc:Qv3FB062QqErn74SNlP@cluster0.mongodb.net:5432/appdb καταχωρήθηκε.⏎Η πληρωμή με στοιχείο 790…`
- **EMAIL** `email` conf 0.85 in doc-12648430-91 (fa/markdown-table)
  `…9674532005 |⏎| reference | amqp://admin:kz6v9A7jzHPh@cluster0.mongodb.net:5432/appdb |⏎…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-91 (fa/markdown-table)
  `…contact | 6289674532005 |⏎| reference | amqp://admin:kz6v9A7jzHPh@cluster0.mongodb.net:5432/appdb |⏎…`
- **NATIONAL_ID** `national-id-th` conf 0.85 in doc-12648430-95 (es/csv)
  `…yOoQZ7,a@startup.io,ok⏎3,AOJE271212ZI4,+8613912345678,ok⏎…`

## False negatives (missed ground truth)

- **POSTAL_CODE** scheme `postal` in doc-12648430-35 (nl/csv)
  `…MNZC9qBa5zCqyucyVTZ5p2Ez1gdXx6HcV1,ok⏎2,9931-240,87mvekt9BDyfGL28gB2N4cYP7paanGpmr4NSuPu…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-151 (es/csv)
  `…83100-5,ok⏎2,261968100-0,94921575T,ok⏎3,56176-6397,23-36316784-5,ok⏎…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-161 (it/csv)
  `…row,contact,identifier,status⏎1,630-4728,144.248.98.3,ok⏎2,X6G 4B3,GFTJKD40S49H9…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-161 (it/csv)
  `…ier,status⏎1,630-4728,144.248.98.3,ok⏎2,X6G 4B3,GFTJKD40S49H999W,ok⏎…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-217 (ru/csv)
  `…contact,identifier,status⏎1,ZZQKBQZJEWG,733-1514,ok⏎2,EL499711334,https://db.internal.co…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-243 (pl/csv)
  `…ok⏎2,TG2G4JjoGekq4dia8stRdRaq295UagvQ5Z,X4M 6E3,ok⏎…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-370 (da/csv)
  `…secret@build.ci.dev/app,LU56173253,ok⏎2,89651-7031,Y4EUXAJL5LA3MXUK2,ok⏎3,SI85692999,hf_oR…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-392 (fr/csv)
  `…w,contact,identifier,status⏎1,56990-016,H3Y 0K7,ok⏎2,CNIE: Y002609,+55 81213-45678,ok⏎3…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-472 (da/csv)
  `…hKHdAHo27Kv9SJwDGyugdzPwbwwLangBb5,ok⏎2,199224,PS17UOKCT21M1LLCSBICN82QMT75H,ok⏎…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-535 (uk/csv)
  `…row,contact,identifier,status⏎1,X2E 2L4,ghp_HVJaLPnJk5H2a2UQYaoDMnlMEzDikg2hc1m…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-645 (es/csv)
  `…hkiXwJ-d3mNHqaPQXF1X,OTRB8208196H4,ok⏎2,54381-8428,_service@firma.de,ok⏎…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-655 (fi/csv)
  `…hp_A2HF1VGetNk5UPYZirfqtjBBmslLwK1BYSQJ,55332-610,ok⏎3,eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVC…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-760 (de/csv)
  `…,identifier,status⏎1,GL7324915947288142,549276,ok⏎2,björn.b@sub.domain.net,GX7NZ96CR8,…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-941 (nl/csv)
  `…3574750569,ok⏎2,user+tag@sub.domain.net,313203,ok⏎3,ghp_hAXqT1wrWwIA7aWOrEVOH4cE3dWwwI…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-1035 (sv/csv)
  `…2/appdb,528238012,ok⏎3,BE98746937224025,4340 XZ,ok⏎…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-1064 (de/csv)
  `…identifier,status⏎1,_service@corp.co.uk,4165 AB,ok⏎2,0x73A913f0f3Dc88758f73C471BE0A0dc8…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-1082 (hi/csv)
  `…dentifier,status⏎1,x.y.z@sub.domain.net,74757,ok⏎2,554876052164,HMGTC5219J,ok⏎…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-1370 (sv/csv)
  `…row,contact,identifier,status⏎1,787-9449,ghp_gW8zCQVP22EPFwgI4UZ1wZx08nJ6Oz0wr4O…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-1385 (th/csv)
  `…,4539000604408643,ok⏎2,5.3 mg/dL [9-44],47758,ok⏎…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-1854 (pl/csv)
  `…q0fmg6ym3sjle8qz,ok⏎2,78EJTF5G2EXZ23AXA,SW1A 1AA,ok⏎…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-1891 (zh/csv)
  `…hp_iEvV0leommqMOOnpbqgSbmz6fkWWMX2C65w1,495-8378,ok⏎…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-1949 (de/csv)
  `….internal:5432/appdb,4.138.147.211,ok⏎3,97074-7078,15stuxxtTg2qpQ3cuUXn9B5W2jMZRznQxVXUpcP…`
