# Stage 1 baseline — 2618 documents (2000 labeled + 600 hard-negative), seeds 12648430/48879

Corpus: 2618 documents, 6731 ground-truth entities, 9438 sensitive predictions. Mean document length 202 chars.

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
| LOCATION | 211 | 0 | 100.0% | 0.0% | 0.0% | 0.0% | 0 | 211 |
| MAC_ADDRESS | 65 | 65 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| NATIONAL_ID | 509 | 896 | 67.2% | 100.0% | 99.8% | 80.4% | 294 | 0 |
| ORG | 259 | 0 | 100.0% | 0.0% | 0.0% | 0.0% | 0 | 259 |
| PASSPORT_MRZ | 37 | 37 | 100.0% | 100.0% | 0.0% | 100.0% | 0 | 0 |
| PERSON | 923 | 0 | 100.0% | 0.0% | 0.0% | 0.0% | 0 | 923 |
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
| ar | 245 | 291 | 65.3% | 77.6% | 75.5% | 70.9% | 101 | 55 |
| cs | 233 | 347 | 53.6% | 79.8% | 78.5% | 64.1% | 161 | 47 |
| da | 344 | 474 | 59.7% | 77.9% | 76.7% | 67.6% | 191 | 76 |
| de | 329 | 452 | 57.1% | 78.4% | 76.3% | 66.1% | 194 | 71 |
| el | 269 | 368 | 59.5% | 81.4% | 81.0% | 68.8% | 149 | 50 |
| en | 286 | 716 | 35.5% | 82.5% | 79.4% | 49.6% | 462 | 50 |
| es | 290 | 363 | 65.3% | 81.7% | 80.3% | 72.6% | 126 | 53 |
| fa | 236 | 347 | 54.5% | 80.1% | 79.2% | 64.8% | 158 | 47 |
| fi | 284 | 422 | 54.3% | 80.6% | 77.1% | 64.9% | 193 | 55 |
| fr | 232 | 333 | 59.2% | 82.3% | 81.0% | 68.8% | 136 | 41 |
| he | 271 | 369 | 61.2% | 79.3% | 77.5% | 69.1% | 143 | 56 |
| hi | 275 | 370 | 63.0% | 82.9% | 81.1% | 71.6% | 137 | 47 |
| it | 267 | 353 | 60.6% | 80.1% | 77.5% | 69.0% | 139 | 53 |
| ja | 204 | 273 | 58.2% | 77.0% | 76.0% | 66.3% | 114 | 47 |
| ko | 274 | 376 | 56.9% | 78.1% | 76.6% | 65.8% | 162 | 60 |
| nl | 244 | 332 | 57.8% | 77.9% | 75.4% | 66.4% | 140 | 54 |
| pl | 275 | 400 | 58.0% | 82.5% | 81.8% | 68.1% | 168 | 48 |
| pt | 243 | 342 | 59.4% | 79.4% | 78.2% | 67.9% | 139 | 50 |
| ro | 278 | 347 | 60.2% | 75.2% | 74.5% | 66.9% | 138 | 69 |
| ru | 334 | 414 | 61.4% | 74.6% | 74.0% | 67.3% | 160 | 85 |
| sv | 275 | 391 | 57.5% | 78.2% | 77.1% | 66.3% | 166 | 60 |
| th | 288 | 371 | 61.2% | 78.8% | 78.1% | 68.9% | 144 | 61 |
| tr | 263 | 344 | 60.5% | 74.9% | 74.1% | 66.9% | 136 | 66 |
| uk | 255 | 327 | 60.6% | 75.7% | 74.1% | 67.3% | 129 | 62 |
| zh | 237 | 316 | 58.5% | 78.1% | 76.4% | 66.9% | 131 | 52 |

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

p50 0.24ms · p95 0.95ms · p99 2.01ms · max 14.48ms per document (normalize + all detectors).

## Worst false positives (highest confidence first)

- **EMAIL** `email` conf 0.85 in doc-12648430-5 (tr/log)
  `…06Z INFO request from mongodb+srv://svc:lEJZBLRTkloYvrhcpdb@cluster0.mongodb.net:5432/appdb accepted⏎…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-5 (tr/log)
  `…⏎2026-08-20T11:32:06Z INFO request from mongodb+srv://svc:lEJZBLRTkloYvrhcpdb@cluster0.mongodb.net:5432/appdb accepted⏎…`
- **NATIONAL_ID** `national-id-in-aadhaar` conf 0.85 in doc-12648430-7 (pl/json)
  `…{⏎  "account": {⏎    "contact": "+558121345678",⏎    "reference": "6518849955",⏎    "n…`
- **NATIONAL_ID** `national-id-ca-sin` conf 0.85 in doc-12648430-28 (ro/cv)
  `….⏎Email: o'brien@sub.domain.net⏎Tel: +6 141 234 567 8⏎세종대로 256⏎⏎Ședința a fost mutată joi.⏎…`
- **NATIONAL_ID** `national-id-th` conf 0.85 in doc-12648430-29 (ja/json)
  `…{⏎  "account": {⏎    "contact": "+8613912345678",⏎    "reference": "675932456964",⏎    …`
- **NATIONAL_ID** `national-id-ca-sin` conf 0.85 in doc-12648430-30 (ru/email)
  `…г.⏎⏎С уважением,⏎Анна Соколова⏎Tel: +81 901 234 567 8⏎first.middle.last@gmail.com⏎…`
- **NATIONAL_ID** `national-id-in-aadhaar` conf 0.85 in doc-12648430-31 (sv/cv)
  `…mail: first.middle.last@gmail.com⏎Tel: +558121345678⏎⏎Mötet flyttades till torsdag.⏎…`
- **NATIONAL_ID** `national-id-hr-oib` conf 0.85 in doc-12648430-33 (de/email)
  `…men,⏎⏎Sie erreichen die Abteilung unter 93657824508 während der Bürozeiten.⏎Der Mitarbeiter…`
- **NATIONAL_ID** `national-id-th` conf 0.85 in doc-12648430-34 (ro/medical)
  `…istrată.⏎HbA1c 21.2 g/dL [21-46]⏎SNOMED 2697926275001⏎Persoana de contact: Cristian Vasilescu…`
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
  `…όλος.⏎Email: x.y.z@sub.domain.net⏎Tel: +558121345678⏎세종대로 425⏎⏎Ευχαριστούμε για την άμεση απ…`
- **EMAIL** `email` conf 0.85 in doc-12648430-61 (sv/markdown-table)
  `…y1k9h5K12ZV |⏎| reference | redis://svc:OJSfEsGxTOo3yuGI@cluster0.mongodb.net:5432/appdb |⏎…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-61 (sv/markdown-table)
  `…VlDjYajeHbEOy1k9h5K12ZV |⏎| reference | redis://svc:OJSfEsGxTOo3yuGI@cluster0.mongodb.net:5432/appdb |⏎…`
- **NATIONAL_ID** `national-id-ca-sin` conf 0.85 in doc-12648430-66 (uk/email)
  `….⏎⏎З повагою,⏎Богдан Кравченко⏎Tel: +44 791 112 345 6⏎a@gmail.com⏎…`
- **NATIONAL_ID** `national-id-in-aadhaar` conf 0.85 in doc-12648430-70 (zh/email)
  `…0585WH 的付款已经到账。⏎会议改到了周四。⏎⏎此致，⏎陈美玲⏎Tel: +558121345678⏎jane_doe@münchen.de⏎…`
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

- **PERSON** scheme `ner-person` in doc-12648430-0 (en/medical)
  `…17009⏎Please forward the signed copy to Eleanor Brooks.⏎The updated draft is attached for your…`
- **ORG** scheme `ner-org` in doc-12648430-2 (da/contract)
  `…hwmJQaJRjmVIoBwj som identifikation.⏎4. Bølgekraft Teknik har accepteret det reviderede tilbud.⏎5…`
- **PERSON** scheme `ner-person` in doc-12648430-2 (da/contract)
  `…lbud.⏎5. Send den underskrevne kopi til Rasmus Bruun.⏎…`
- **PERSON** scheme `ner-person` in doc-12648430-4 (uk/medical)
  `…⏎HbA1c 186.0 % [23-47]⏎Контактна особа: Андрій Ковальчук.⏎Нараду перенесено на четвер.⏎…`
- **LOCATION** scheme `ner-location` in doc-12648430-11 (fr/prose)
  `… déplacée à jeudi. Le nouveau bureau de Lyon ouvrira en mars. Antoine Perrin a valid…`
- **PERSON** scheme `ner-person` in doc-12648430-11 (fr/prose)
  `…nouveau bureau de Lyon ouvrira en mars. Antoine Perrin a validé la maquette hier. …`
- **PERSON** scheme `ner-person` in doc-12648430-12 (nl/medical)
  `…entificatie.⏎HbA1c 377.0 mg/dL [31-133]⏎Daan Vermeulen presenteert vrijdag de kwartaalcijfers.…`
- **LOCATION** scheme `ner-location` in doc-12648430-15 (zh/email)
  `…请在周五之前把材料发送到 334136​198007010868。⏎新办公室位于深圳。⏎感谢您的快速回复。⏎⏎此致，⏎李静⏎Tel: +55 81213-45678…`
- **PERSON** scheme `ner-person` in doc-12648430-15 (zh/email)
  `…​198007010868。⏎新办公室位于深圳。⏎感谢您的快速回复。⏎⏎此致，⏎李静⏎Tel: +55 81213-45678⏎x.y.z@firma.de⏎…`
- **PERSON** scheme `ner-person` in doc-12648430-16 (fa/cv)
  `…Curriculum Vitae⏎نازنین موسوی⏎Email: first.middle.last@sub.domain.net…`
- **PERSON** scheme `ner-person` in doc-12648430-17 (el/medical)
  `…NOMED 49718371004⏎Τα έγγραφα υπογράφει: Κατερίνα Βασιλείου.⏎Η συνάντηση μεταφέρθηκε για την Πέμπτη…`
- **ORG** scheme `ner-org` in doc-12648430-18 (es/contract)
  `… +1 212 555 012 3 antes del viernes.⏎4. Grupo Almadera aceptó la oferta revisada.⏎5. Lucía Her…`
- **PERSON** scheme `ner-person` in doc-12648430-18 (es/contract)
  `… Almadera aceptó la oferta revisada.⏎5. Lucía Herrera aprobó el borrador ayer.⏎…`
- **PERSON** scheme `ner-person` in doc-12648430-20 (he/cv)
  `…Curriculum Vitae⏎איתי כהן⏎Email: müller@sub.domain.net⏎Tel: +1415…`
- **LOCATION** scheme `ner-location` in doc-12648430-23 (es/prose)
  `…ias por la respuesta rápida. El envío a Zaragoza tarda cuatro días. La factura de Grupo …`
- **ORG** scheme `ner-org` in doc-12648430-23 (es/prose)
  `…ragoza tarda cuatro días. La factura de Grupo Almadera llegó ayer. …`
- **PERSON** scheme `ner-person` in doc-12648430-24 (de/medical)
  `…8102⏎Bitte senden Sie die Unterlagen an Annika Schröder.⏎Vielen Dank für die schnelle Rückmeldu…`
- **ORG** scheme `ner-org` in doc-12648430-26 (uk/contract)
  `…к ідентифікатор.⏎4. Новий постачальник: Група Калина.⏎5. Документи підписує Соломія Ткаченко…`
- **PERSON** scheme `ner-person` in doc-12648430-26 (uk/contract)
  `…ик: Група Калина.⏎5. Документи підписує Соломія Ткаченко.⏎…`
- **PERSON** scheme `ner-person` in doc-12648430-27 (sv/prose)
  `…öre fredag. Tack för det snabba svaret. Astrid Lindqvist presenterar kvartalssiffrorna på fredag…`
- **PERSON** scheme `ner-person` in doc-12648430-28 (ro/cv)
  `…Curriculum Vitae⏎Ioana Petrescu⏎Livrarea către Brașov durează patru zil…`
- **LOCATION** scheme `ner-location` in doc-12648430-28 (ro/cv)
  `…lum Vitae⏎Ioana Petrescu⏎Livrarea către Brașov durează patru zile.⏎Email: o'brien@sub.…`
- **PERSON** scheme `ner-person` in doc-12648430-30 (ru/email)
  `…ак идентификатор.⏎Документы подписывает Дмитрий Волков.⏎Совещание перенесено на четверг.⏎⏎С ув…`
- **PERSON** scheme `ner-person` in doc-12648430-30 (ru/email)
  `…ие перенесено на четверг.⏎⏎С уважением,⏎Анна Соколова⏎Tel: +81 901 234 567 8⏎first.middle.las…`
- **PERSON** scheme `ner-person` in doc-12648430-31 (sv/cv)
  `…Curriculum Vitae⏎Oskar Nyström⏎Email: first.middle.last@gmail.com⏎Tel:…`
- **PERSON** scheme `ner-person` in doc-12648430-33 (de/email)
  `…ben.⏎Bitte senden Sie die Unterlagen an Annika Schröder.⏎Der Vertrag liegt zur Unterschrift ber…`
- **PERSON** scheme `ner-person` in doc-12648430-33 (de/email)
  `…hrift bereit.⏎⏎Mit freundlichen Grüßen,⏎Lukas Brandt⏎Tel: +55 81213-45678⏎jane_doe@startup.i…`
- **PERSON** scheme `ner-person` in doc-12648430-34 (ro/medical)
  `…OMED 2697926275001⏎Persoana de contact: Cristian Vasilescu.⏎Mulțumim pentru răspunsul rapid.⏎…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-35 (nl/csv)
  `…MNZC9qBa5zCqyucyVTZ5p2Ez1gdXx6HcV1,ok⏎2,9931-240,87mvekt9BDyfGL28gB2N4cYP7paanGpmr4NSuPu…`
- **PERSON** scheme `ner-person` in doc-12648430-38 (en/email)
  `…g was moved to Thursday.⏎⏎Best regards,⏎Martha Ellison⏎Tel: +44 20794-60958⏎first.middle.last@…`
