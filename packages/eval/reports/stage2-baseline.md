# Stage 1+2 combined — model jiting/xlm-roberta-base-ner-hrl_onnx (q8), same corpus and seeds as the Stage 1 baseline

Corpus: 2618 documents, 6731 ground-truth entities, 10036 sensitive predictions. Mean document length 202 chars.

**This corpus is synthetic.** Values are generator-made, carriers are template sentences, and hard negatives are constructed categories. The numbers measure the detectors against this corpus, not against real-world text; real-world performance will differ, most likely downward on precision for the context-free detectors.

## Per entity type

| type | GT | pred | P | R (partial) | R (exact) | F1 | FP | FN |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| API_KEY | 470 | 490 | 95.9% | 100.0% | 99.6% | 97.9% | 20 | 0 |
| AU_BSB | 5 | 5 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| BR_AGENCIA | 11 | 11 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| CA_TRANSIT_NUMBER | 17 | 17 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| CONNECTION_STRING | 133 | 133 | 100.0% | 100.0% | 77.4% | 100.0% | 0 | 0 |
| COORDINATES | 71 | 71 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| CREDIT_CARD | 165 | 171 | 96.5% | 100.0% | 100.0% | 98.2% | 6 | 0 |
| CRYPTO_WALLET | 629 | 633 | 99.4% | 100.0% | 100.0% | 99.7% | 4 | 0 |
| DRIVERS_LICENSE | 5 | 19 | 26.3% | 100.0% | 100.0% | 41.7% | 14 | 0 |
| EMAIL | 644 | 654 | 98.5% | 100.0% | 100.0% | 99.2% | 10 | 0 |
| GENERIC_SECRET | 72 | 2171 | 1.9% | 56.9% | 56.9% | 3.7% | 2130 | 31 |
| HEALTH_DATA | 432 | 469 | 92.1% | 100.0% | 100.0% | 95.9% | 37 | 0 |
| IBAN | 185 | 185 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| IN_IFSC | 16 | 16 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| IP_ADDRESS | 209 | 233 | 89.7% | 100.0% | 100.0% | 94.6% | 24 | 0 |
| JWT | 155 | 155 | 100.0% | 100.0% | 97.4% | 100.0% | 0 | 0 |
| LOCATION | 211 | 359 | 59.1% | 100.0% | 99.1% | 74.3% | 147 | 0 |
| MAC_ADDRESS | 65 | 65 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| NATIONAL_ID | 509 | 838 | 71.8% | 100.0% | 99.8% | 83.6% | 236 | 0 |
| ORG | 259 | 300 | 80.0% | 88.4% | 72.2% | 84.0% | 60 | 30 |
| PASSPORT_MRZ | 37 | 37 | 100.0% | 100.0% | 0.0% | 100.0% | 0 | 0 |
| PERSON | 923 | 991 | 98.7% | 98.5% | 89.7% | 98.6% | 13 | 14 |
| PHONE | 604 | 604 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| POSTAL_CODE | 80 | 290 | 20.0% | 72.5% | 72.5% | 31.4% | 232 | 22 |
| PRIVATE_KEY | 63 | 63 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| STREET_ADDRESS | 209 | 222 | 94.1% | 100.0% | 98.1% | 97.0% | 13 | 0 |
| SWIFT_BIC | 75 | 75 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
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
| ar | 245 | 314 | 75.8% | 95.1% | 86.5% | 84.4% | 76 | 12 |
| cs | 233 | 362 | 64.1% | 99.6% | 97.9% | 78.0% | 130 | 1 |
| da | 344 | 517 | 70.8% | 98.5% | 93.9% | 82.4% | 151 | 5 |
| de | 329 | 481 | 68.2% | 98.8% | 95.4% | 80.7% | 153 | 4 |
| el | 269 | 395 | 68.1% | 99.3% | 98.1% | 80.8% | 126 | 2 |
| en | 286 | 600 | 50.2% | 99.0% | 95.5% | 66.6% | 299 | 3 |
| es | 290 | 405 | 71.4% | 98.6% | 95.9% | 82.8% | 116 | 4 |
| fa | 236 | 365 | 63.8% | 98.3% | 95.3% | 77.4% | 132 | 4 |
| fi | 284 | 438 | 64.6% | 98.2% | 93.3% | 78.0% | 155 | 5 |
| fr | 232 | 366 | 67.5% | 99.1% | 93.5% | 80.3% | 119 | 2 |
| he | 271 | 398 | 69.6% | 97.8% | 94.1% | 81.3% | 121 | 6 |
| hi | 275 | 390 | 71.3% | 96.7% | 92.0% | 82.1% | 112 | 9 |
| it | 267 | 364 | 74.5% | 99.3% | 94.0% | 85.1% | 93 | 2 |
| ja | 204 | 302 | 67.5% | 98.0% | 96.1% | 80.0% | 98 | 4 |
| ko | 274 | 416 | 64.7% | 98.2% | 96.0% | 78.0% | 147 | 5 |
| nl | 244 | 374 | 67.6% | 98.8% | 91.4% | 80.3% | 121 | 3 |
| pl | 275 | 418 | 67.2% | 99.3% | 97.5% | 80.2% | 137 | 2 |
| pt | 243 | 382 | 67.0% | 98.8% | 94.7% | 79.9% | 126 | 3 |
| ro | 278 | 378 | 73.8% | 99.3% | 95.7% | 84.7% | 99 | 2 |
| ru | 334 | 466 | 71.9% | 98.8% | 98.2% | 83.2% | 131 | 4 |
| sv | 275 | 426 | 66.2% | 98.9% | 97.5% | 79.3% | 144 | 3 |
| th | 288 | 409 | 69.2% | 97.9% | 94.8% | 81.1% | 126 | 6 |
| tr | 263 | 389 | 70.4% | 99.6% | 98.1% | 82.5% | 115 | 1 |
| uk | 255 | 348 | 74.1% | 99.2% | 97.6% | 84.9% | 90 | 2 |
| zh | 237 | 333 | 70.3% | 98.7% | 96.6% | 82.1% | 99 | 3 |

## Raw confidence vs. empirical precision (NOT calibration)

Stage 1 confidences are detector-local and only ordered; real calibration requires Stage 4 fusion (M8). This is a first look only.

| bucket | predictions | matched | precision |
| --- | ---: | ---: | ---: |
| HIGH(0.85) | 4987 | 4428 | 88.8% |
| LOW(0.3) | 1233 | 116 | 9.4% |
| MAXIMUM(0.99) | 1053 | 1033 | 98.1% |
| MEDIUM(0.6) | 2763 | 1243 | 45.0% |

## Hard-negative false positives by category

| category | sensitive detections (all FP) |
| --- | ---: |
| checksum-failures | 59 |
| hex-artifacts | 1 |
| labeled-examples | 50 |
| order-numbers | 47 |
| placeholder-code | 18 |
| version-numbers | 15 |

## Latency

p50 26.31ms · p95 56.85ms · p99 139.64ms · max 277.00ms per document (normalize + all detectors).

## Worst false positives (highest confidence first)

- **LOCATION** `ner:xlm-roberta-base-ner-hrl_onnx@q8` conf 0.9974849224090576 in doc-12648430-120 (de/markdown-table)
  `…TQvwz-y1Zz_e2LMNL0Rn_3H |⏎| reference | Bahnhofstraße 28 |⏎…`
- **LOCATION** `ner:xlm-roberta-base-ner-hrl_onnx@q8` conf 0.9958900809288025 in doc-12648430-104 (de/cv)
  `…le.last@firma.de⏎Tel: +90 532 123 456 7⏎İstiklal Caddesi No: 200⏎⏎Der Vertrag liegt zur Untersch…`
- **LOCATION** `ner:xlm-roberta-base-ner-hrl_onnx@q8` conf 0.9934576153755188 in doc-12648430-92 (el/cv)
  `…dle.last@münchen.de⏎Tel: +1 21255-50123⏎Atatürk Caddesi No: 191⏎⏎Ευχαριστούμε για την άμεση απά…`
- **LOCATION** `ner:xlm-roberta-base-ner-hrl_onnx@q8` conf 0.9846506714820862 in doc-12648430-82 (uk/csv)
  `…⏎1,x.y.z@a-b.org,21LND35Y5DF1GC5EK,ok⏎2,Atatürk Sokak No: 39,AIzaU3T0ZgqV5aCNS9xN…`
- **LOCATION** `ner:xlm-roberta-base-ner-hrl_onnx@q8` conf 0.9845295548439026 in doc-12648430-77 (da/cv)
  `…: john.doe@münchen.de⏎Tel: +33612345678⏎Hauptstraße 121⏎⏎Mødet er flyttet til torsdag.⏎…`
- **ORG** `ner:xlm-roberta-base-ner-hrl_onnx@q8` conf 0.9713096618652344 in doc-12648430-72 (pl/medical)
  `…c3d7cd do piątku.⏎HbA1c 16.8 % [31-128]⏎SNOMED 22872007⏎Osoba kontaktowa: Agniesz…`
- **LOCATION** `ner:xlm-roberta-base-ner-hrl_onnx@q8` conf 0.9429213404655457 in doc-12648430-20 (he/cv)
  `…müller@sub.domain.net⏎Tel: +14155550198⏎İstiklal Caddesi No: 140⏎⏎תודה על המענה המהיר.⏎…`
- **LOCATION** `ner:xlm-roberta-base-ner-hrl_onnx@q8` conf 0.8846341967582703 in doc-12648430-39 (ru/cv)
  `…z@xn--bcher-kva.de⏎Tel: +81 90123-45678⏎Hauptstraße 78⏎⏎Совещание перенесено на четверг.⏎…`
- **LOCATION** `ner:xlm-roberta-base-ner-hrl_onnx@q8` conf 0.8697465658187866 in doc-12648430-64 (es/cv)
  `…björn.b@startup.io⏎Tel: +44 79111-23456⏎شارع الملك فهد 107⏎⏎Gracias por la respuesta rápida.⏎…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-5 (tr/log)
  `…⏎2026-08-20T11:32:06Z INFO request from mongodb+srv://svc:lEJZBLRTkloYvrhcpdb@cluster0.mongodb.net:5432/appdb accepted⏎…`
- **NATIONAL_ID** `national-id-in-aadhaar` conf 0.85 in doc-12648430-7 (pl/json)
  `…{⏎  "account": {⏎    "contact": "+558121345678",⏎    "reference": "6518849955",⏎    "n…`
- **NATIONAL_ID** `national-id-th` conf 0.85 in doc-12648430-29 (ja/json)
  `…{⏎  "account": {⏎    "contact": "+8613912345678",⏎    "reference": "675932456964",⏎    …`
- **NATIONAL_ID** `national-id-in-aadhaar` conf 0.85 in doc-12648430-31 (sv/cv)
  `…mail: first.middle.last@gmail.com⏎Tel: +558121345678⏎⏎Mötet flyttades till torsdag.⏎…`
- **NATIONAL_ID** `national-id-hr-oib` conf 0.85 in doc-12648430-33 (de/email)
  `…men,⏎⏎Sie erreichen die Abteilung unter 93657824508 während der Bürozeiten.⏎Der Mitarbeiter…`
- **NATIONAL_ID** `national-id-th` conf 0.85 in doc-12648430-34 (ro/medical)
  `…istrată.⏎HbA1c 21.2 g/dL [21-46]⏎SNOMED 2697926275001⏎Persoana de contact: Cristian Vasilescu…`
- **TAX_ID** `national-id-gr-afm` conf 0.85 in doc-12648430-35 (nl/csv)
  `…iVt3A7nRiw61DH1HwpVPY,ok⏎3,BE0279831043,794083101,ok⏎…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-40 (da/yaml)
  `…service:⏎  owner_contact: redis://app:iX9irCCXPdb5e7v@prod-db.corp:5432/appdb⏎  billing_id: ghp_hN8mzZGriQ7ex88w87JaD…`
- **TAX_ID** `national-id-pl-regon` conf 0.85 in doc-12648430-44 (he/prose)
  `…התשלום עם האסמכתא 543104905 התקבל. בתיק רשום xoxb-EM2ZdpYD0FKWdSRPF…`
- **TAX_ID** `national-id-gr-afm` conf 0.85 in doc-12648430-44 (he/prose)
  `…התשלום עם האסמכתא 543104905 התקבל. בתיק רשום xoxb-EM2ZdpYD0FKWdSRPF…`
- **TAX_ID** `national-id-gr-afm` conf 0.85 in doc-12648430-49 (fr/csv)
  `…artup.io,114.214.143.103,ok⏎2,79513-614,969142058,ok⏎3,TEwYZmbju2iJRbtrUDEqNyKYi9DpCwps2N…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-57 (da/code)
  `…det er flyttet til torsdag.⏎ENDPOINT = "amqp://svc:auBk4RV9mEsv0dFZn@db.internal:5432/appdb"⏎…`
- **NATIONAL_ID** `national-id-in-aadhaar` conf 0.85 in doc-12648430-58 (el/cv)
  `…όλος.⏎Email: x.y.z@sub.domain.net⏎Tel: +558121345678⏎세종대로 425⏎⏎Ευχαριστούμε για την άμεση απ…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-61 (sv/markdown-table)
  `…VlDjYajeHbEOy1k9h5K12ZV |⏎| reference | redis://svc:OJSfEsGxTOo3yuGI@cluster0.mongodb.net:5432/appdb |⏎…`
- **NATIONAL_ID** `national-id-in-aadhaar` conf 0.85 in doc-12648430-70 (zh/email)
  `…0585WH 的付款已经到账。⏎会议改到了周四。⏎⏎此致，⏎陈美玲⏎Tel: +558121345678⏎jane_doe@münchen.de⏎…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-83 (el/email)
  `…Γεια σας,⏎⏎Η πληρωμή με στοιχείο redis://svc:Qv3FB062QqErn74SNlP@cluster0.mongodb.net:5432/appdb καταχωρήθηκε.⏎Η πληρωμή με στοιχείο 790…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-91 (fa/markdown-table)
  `…contact | 6289674532005 |⏎| reference | amqp://admin:kz6v9A7jzHPh@cluster0.mongodb.net:5432/appdb |⏎…`
- **NATIONAL_ID** `national-id-th` conf 0.85 in doc-12648430-95 (es/csv)
  `…yOoQZ7,a@startup.io,ok⏎3,AOJE271212ZI4,+8613912345678,ok⏎…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-109 (da/email)
  `…Hej alle,⏎⏎Betalingen med reference redis://svc:9E6RsPlTfBMIhpKcy9@cluster0.mongodb.net:5432/appdb er modtaget.⏎Sagen angiver 87SvyHayXXNS…`
- **NATIONAL_ID** `national-id-in-aadhaar` conf 0.85 in doc-12648430-111 (el/csv)
  `…c,sk_live_TvGK23tv6xUQ4gdpJrgOW0M8,ok⏎3,607319821007,TR14343598QUY2LKRT0UWHVLWG,ok⏎…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-112 (ko/csv)
  `…E75mvScbwQxYQH5PhoFj,6943894401107,ok⏎2,postgres://app:uVtI2Pp7eVuebahM@prod-db.corp:5432/appdb,QIVJLC79,ok⏎…`

## False negatives (missed ground truth)

- **GENERIC_SECRET** scheme `generic-secret` in doc-12648430-26 (uk/contract)
  `…0 як ідентифікатор.⏎3. У справі вказано A99cAXjL4yqONyd7ux6RgVHATH9ZEfMsMUvEWDl5 як ідентифікатор.⏎4. Новий постачальник…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-35 (nl/csv)
  `…MNZC9qBa5zCqyucyVTZ5p2Ez1gdXx6HcV1,ok⏎2,9931-240,87mvekt9BDyfGL28gB2N4cYP7paanGpmr4NSuPu…`
- **GENERIC_SECRET** scheme `generic-secret` in doc-12648430-70 (zh/email)
  `…大家好：⏎⏎档案中登记的识别号是 A9OsA9sEbWFkRIh5bPQu47wDZgj。⏎参考号为 IE5510585WH 的付款已经到账。⏎会议改到了周四。⏎⏎此致…`
- **PERSON** scheme `ner-person` in doc-12648430-77 (da/cv)
  `…Curriculum Vitae⏎Anders Holm⏎Levering til Aarhus tager fire dage.⏎Em…`
- **ORG** scheme `ner-org` in doc-12648430-97 (ko/contract)
  `… 참조번호 jane_doe@firma.de 입금이 확인되었습니다.⏎4. 새벽전자에서 수정 제안을 승인했습니다.⏎5. 초안은 어제 강민재 팀장이 승인했습…`
- **ORG** scheme `ner-org` in doc-12648430-107 (ko/contract)
  `…일에는 식별자로 36652910559349 가 기재되어 있습니다.⏎4. 한빛물류의 청구서가 어제 도착했습니다.⏎5. 담당자는 최수빈입니다.⏎…`
- **PERSON** scheme `ner-person` in doc-12648430-124 (th/cv)
  `…Curriculum Vitae⏎ประวิทย์ แสงทอง⏎สำนักงานใหม่: เชียงใหม่⏎Email: dev-ops@…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-151 (es/csv)
  `…83100-5,ok⏎2,261968100-0,94921575T,ok⏎3,56176-6397,23-36316784-5,ok⏎…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-161 (it/csv)
  `…row,contact,identifier,status⏎1,630-4728,144.248.98.3,ok⏎2,X6G 4B3,GFTJKD40S49H9…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-161 (it/csv)
  `…ier,status⏎1,630-4728,144.248.98.3,ok⏎2,X6G 4B3,GFTJKD40S49H999W,ok⏎…`
- **ORG** scheme `ner-org` in doc-12648430-191 (he/contract)
  `…z8ywxkWriJ3QYGMsWg התקבל.⏎4. הספק החדש: מפעלי אלון.⏎5. איש הקשר: שירה פרידמן.⏎…`
- **GENERIC_SECRET** scheme `generic-secret` in doc-12648430-199 (fi/contract)
  `…otettu.⏎3. Asiakirjoissa tunnisteena on A9TfqpMsJAy-NKtinP656pJgI6MMHGHNrmJTgaLwS3h.⏎4. Uusi toimittajamme on Revontuli Log…`
- **ORG** scheme `ner-org` in doc-12648430-204 (ar/contract)
  `…TGmMSvw1 كمعرّف مسجل.⏎4. وصلت فاتورة من مجموعة الأفق أمس.⏎5. مسؤول التواصل: عمر الخطيب.⏎…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-217 (ru/csv)
  `…contact,identifier,status⏎1,ZZQKBQZJEWG,733-1514,ok⏎2,EL499711334,https://db.internal.co…`
- **GENERIC_SECRET** scheme `generic-secret` in doc-12648430-242 (ru/prose)
  `… как идентификатор. Платёж с реквизитом A9tfuIhMJacdRzXd2T7ok0RnocdGVZr поступил на счёт. В деле указан 2907092…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-243 (pl/csv)
  `…ok⏎2,TG2G4JjoGekq4dia8stRdRaq295UagvQ5Z,X4M 6E3,ok⏎…`
- **GENERIC_SECRET** scheme `generic-secret` in doc-12648430-245 (he/medical)
  `…בתיק רשום A9VtIEYEMQVNxH42GnhCTfg2xF_5wIcFrudR8sEuhDLxgQl כמזהה.⏎HbA1c 236.0 mmol/L [75-93]⏎SNOME…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-370 (da/csv)
  `…secret@build.ci.dev/app,LU56173253,ok⏎2,89651-7031,Y4EUXAJL5LA3MXUK2,ok⏎3,SI85692999,hf_oR…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-392 (fr/csv)
  `…w,contact,identifier,status⏎1,56990-016,H3Y 0K7,ok⏎2,CNIE: Y002609,+55 81213-45678,ok⏎3…`
- **ORG** scheme `ner-org` in doc-12648430-427 (el/prose)
  `…F313cc7 καταχωρήθηκε. Νέος προμηθευτής: Μεταφορές Δίας. Την παρουσίαση αναλαμβάνει: Κατερίνα Β…`
- **ORG** scheme `ner-org` in doc-12648430-445 (hi/contract)
  `…7P6Yibwp6rhLTfmUonRX3p1TCO पर भेजें।⏎4. प्रकाशन वटवृक्ष का चालान कल प्राप्त हुआ।⏎5. अनन्या गुप्…`
- **GENERIC_SECRET** scheme `generic-secret` in doc-12648430-468 (pt/email)
  `…ira.⏎Por favor envie os documentos para A9s-KBkJTVafO73IZCCbbus3b7Tne até sexta-feira.⏎Henrique Tavares apres…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-472 (da/csv)
  `…hKHdAHo27Kv9SJwDGyugdzPwbwwLangBb5,ok⏎2,199224,PS17UOKCT21M1LLCSBICN82QMT75H,ok⏎…`
- **PERSON** scheme `ner-person` in doc-12648430-502 (fr/cv)
  `…Curriculum Vitae⏎Élodie Garnier⏎Le nouveau bureau de Marseille ouvrira …`
- **POSTAL_CODE** scheme `postal` in doc-12648430-535 (uk/csv)
  `…row,contact,identifier,status⏎1,X2E 2L4,ghp_HVJaLPnJk5H2a2UQYaoDMnlMEzDikg2hc1m…`
- **ORG** scheme `ner-org` in doc-12648430-615 (ar/contract)
  `…34-56789 كمعرّف مسجل.⏎4. وصلت فاتورة من مصنع الأمل أمس.⏎5. سيقدم فاطمة النجار النتائج يوم …`
- **GENERIC_SECRET** scheme `generic-secret` in doc-12648430-628 (sv/contract)
  `… flyttades till torsdag.⏎2. Akten anger A9YyvIoVO6LLfixTsxb6jShPZqKuBiuVpmQtPP1wVfx som identifierare.⏎3. Betalningen med r…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-645 (es/csv)
  `…hkiXwJ-d3mNHqaPQXF1X,OTRB8208196H4,ok⏎2,54381-8428,_service@firma.de,ok⏎…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-655 (fi/csv)
  `…hp_A2HF1VGetNk5UPYZirfqtjBBmslLwK1BYSQJ,55332-610,ok⏎3,eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVC…`
- **GENERIC_SECRET** scheme `generic-secret` in doc-12648430-660 (fi/prose)
  `…tauksesta. Asiakirjoissa tunnisteena on A97nXZcB85UDUf5whRKmU3ymt7GctuCCP47U9x-B40J-. Kokous siirrettiin torstaihin. Kiitos …`


## Stage 2 per-language (PERSON/ORG/LOCATION only)

| language | GT | precision | recall (partial) | recall (exact) | F1 |
| --- | ---: | ---: | ---: | ---: | ---: |
| ar | 55 | 92.5% | 80.0% | 50.9% | 85.8% |
| cs | 47 | 75.8% | 100.0% | 97.9% | 86.2% |
| da | 74 | 85.9% | 98.6% | 82.4% | 91.8% |
| de | 68 | 89.9% | 100.0% | 94.1% | 94.7% |
| el | 50 | 87.9% | 98.0% | 94.0% | 92.7% |
| en | 50 | 85.7% | 96.0% | 94.0% | 90.6% |
| es | 51 | 86.7% | 96.1% | 88.2% | 91.1% |
| fa | 47 | 92.2% | 97.9% | 87.2% | 94.9% |
| fi | 54 | 86.6% | 100.0% | 90.7% | 92.8% |
| fr | 40 | 94.3% | 97.5% | 72.5% | 95.9% |
| he | 56 | 82.5% | 91.1% | 82.1% | 86.6% |
| hi | 46 | 86.5% | 82.6% | 65.2% | 84.5% |
| it | 51 | 89.1% | 100.0% | 86.3% | 94.2% |
| ja | 47 | 79.7% | 95.7% | 91.5% | 87.0% |
| ko | 60 | 83.6% | 93.3% | 90.0% | 88.2% |
| nl | 52 | 86.1% | 100.0% | 76.9% | 92.5% |
| pl | 46 | 87.5% | 100.0% | 93.5% | 93.3% |
| pt | 50 | 90.3% | 100.0% | 86.0% | 94.9% |
| ro | 69 | 91.1% | 100.0% | 88.4% | 95.4% |
| ru | 84 | 88.4% | 100.0% | 100.0% | 93.9% |
| sv | 58 | 87.9% | 100.0% | 98.3% | 93.5% |
| th | 60 | 71.8% | 91.7% | 80.0% | 80.5% |
| tr | 66 | 84.8% | 100.0% | 97.0% | 91.8% |
| uk | 61 | 95.3% | 100.0% | 100.0% | 97.6% |
| zh | 51 | 89.3% | 98.0% | 96.1% | 93.5% |
