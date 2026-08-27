# Stage 1+2 combined — model jiting/xlm-roberta-base-ner-hrl_onnx (q8), same corpus and seeds as the Stage 1 baseline

Corpus: 2618 documents, 6731 ground-truth entities, 11088 sensitive predictions. Mean document length 202 chars.

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
| LOCATION | 211 | 359 | 59.1% | 100.0% | 99.1% | 74.3% | 147 | 0 |
| MAC_ADDRESS | 65 | 65 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| NATIONAL_ID | 509 | 896 | 67.2% | 100.0% | 99.8% | 80.4% | 294 | 0 |
| ORG | 259 | 300 | 80.0% | 88.4% | 72.2% | 84.0% | 60 | 30 |
| PASSPORT_MRZ | 37 | 37 | 100.0% | 100.0% | 0.0% | 100.0% | 0 | 0 |
| PERSON | 923 | 991 | 98.7% | 98.5% | 89.7% | 98.6% | 13 | 14 |
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
| ar | 245 | 344 | 69.5% | 95.5% | 86.9% | 80.4% | 105 | 11 |
| cs | 233 | 409 | 57.0% | 100.0% | 98.3% | 72.6% | 176 | 0 |
| da | 344 | 573 | 64.2% | 99.1% | 94.5% | 77.9% | 205 | 3 |
| de | 329 | 531 | 62.0% | 99.1% | 95.7% | 76.2% | 202 | 3 |
| el | 269 | 426 | 63.4% | 99.6% | 98.5% | 77.5% | 156 | 1 |
| en | 286 | 772 | 39.1% | 99.3% | 95.8% | 56.1% | 470 | 2 |
| es | 290 | 423 | 68.3% | 98.6% | 95.9% | 80.7% | 134 | 4 |
| fa | 236 | 398 | 59.3% | 99.6% | 96.6% | 74.3% | 162 | 1 |
| fi | 284 | 489 | 58.7% | 99.6% | 94.4% | 73.9% | 202 | 1 |
| fr | 232 | 386 | 64.0% | 99.1% | 93.5% | 77.8% | 139 | 2 |
| he | 271 | 432 | 64.4% | 98.2% | 94.5% | 77.7% | 154 | 5 |
| hi | 275 | 422 | 65.9% | 96.7% | 92.0% | 78.4% | 144 | 9 |
| it | 267 | 417 | 65.0% | 99.3% | 94.0% | 78.5% | 146 | 2 |
| ja | 204 | 332 | 62.0% | 99.0% | 97.1% | 76.3% | 126 | 2 |
| ko | 274 | 443 | 60.9% | 98.5% | 96.4% | 75.3% | 173 | 4 |
| nl | 244 | 404 | 62.9% | 99.2% | 91.8% | 77.0% | 150 | 2 |
| pl | 275 | 456 | 61.6% | 99.3% | 97.5% | 76.0% | 175 | 2 |
| pt | 243 | 404 | 64.1% | 100.0% | 95.9% | 78.1% | 145 | 0 |
| ro | 278 | 426 | 66.0% | 100.0% | 96.4% | 79.5% | 145 | 0 |
| ru | 334 | 509 | 66.4% | 99.7% | 99.1% | 79.7% | 171 | 1 |
| sv | 275 | 457 | 61.9% | 99.3% | 97.8% | 76.3% | 174 | 2 |
| th | 288 | 449 | 63.0% | 97.9% | 94.8% | 76.7% | 166 | 6 |
| tr | 263 | 423 | 65.0% | 100.0% | 98.5% | 78.8% | 148 | 0 |
| uk | 255 | 391 | 66.2% | 99.6% | 98.0% | 79.6% | 132 | 1 |
| zh | 237 | 372 | 63.2% | 99.2% | 97.0% | 77.2% | 137 | 2 |

## Raw confidence vs. empirical precision (NOT calibration)

Stage 1 confidences are detector-local and only ordered; real calibration requires Stage 4 fusion (M8). This is a first look only.

| bucket | predictions | matched | precision |
| --- | ---: | ---: | ---: |
| HIGH(0.85) | 5202 | 4428 | 85.1% |
| LOW(0.3) | 3644 | 392 | 10.8% |
| MAXIMUM(0.99) | 1053 | 1033 | 98.1% |
| MEDIUM(0.6) | 1189 | 998 | 83.9% |

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

p50 32.41ms · p95 82.65ms · p99 206.08ms · max 391.16ms per document (normalize + all detectors).

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

## False negatives (missed ground truth)

- **POSTAL_CODE** scheme `postal` in doc-12648430-35 (nl/csv)
  `…MNZC9qBa5zCqyucyVTZ5p2Ez1gdXx6HcV1,ok⏎2,9931-240,87mvekt9BDyfGL28gB2N4cYP7paanGpmr4NSuPu…`
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
- **ORG** scheme `ner-org` in doc-12648430-204 (ar/contract)
  `…TGmMSvw1 كمعرّف مسجل.⏎4. وصلت فاتورة من مجموعة الأفق أمس.⏎5. مسؤول التواصل: عمر الخطيب.⏎…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-217 (ru/csv)
  `…contact,identifier,status⏎1,ZZQKBQZJEWG,733-1514,ok⏎2,EL499711334,https://db.internal.co…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-243 (pl/csv)
  `…ok⏎2,TG2G4JjoGekq4dia8stRdRaq295UagvQ5Z,X4M 6E3,ok⏎…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-370 (da/csv)
  `…secret@build.ci.dev/app,LU56173253,ok⏎2,89651-7031,Y4EUXAJL5LA3MXUK2,ok⏎3,SI85692999,hf_oR…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-392 (fr/csv)
  `…w,contact,identifier,status⏎1,56990-016,H3Y 0K7,ok⏎2,CNIE: Y002609,+55 81213-45678,ok⏎3…`
- **ORG** scheme `ner-org` in doc-12648430-427 (el/prose)
  `…F313cc7 καταχωρήθηκε. Νέος προμηθευτής: Μεταφορές Δίας. Την παρουσίαση αναλαμβάνει: Κατερίνα Β…`
- **ORG** scheme `ner-org` in doc-12648430-445 (hi/contract)
  `…7P6Yibwp6rhLTfmUonRX3p1TCO पर भेजें।⏎4. प्रकाशन वटवृक्ष का चालान कल प्राप्त हुआ।⏎5. अनन्या गुप्…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-472 (da/csv)
  `…hKHdAHo27Kv9SJwDGyugdzPwbwwLangBb5,ok⏎2,199224,PS17UOKCT21M1LLCSBICN82QMT75H,ok⏎…`
- **PERSON** scheme `ner-person` in doc-12648430-502 (fr/cv)
  `…Curriculum Vitae⏎Élodie Garnier⏎Le nouveau bureau de Marseille ouvrira …`
- **POSTAL_CODE** scheme `postal` in doc-12648430-535 (uk/csv)
  `…row,contact,identifier,status⏎1,X2E 2L4,ghp_HVJaLPnJk5H2a2UQYaoDMnlMEzDikg2hc1m…`
- **ORG** scheme `ner-org` in doc-12648430-615 (ar/contract)
  `…34-56789 كمعرّف مسجل.⏎4. وصلت فاتورة من مصنع الأمل أمس.⏎5. سيقدم فاطمة النجار النتائج يوم …`
- **POSTAL_CODE** scheme `postal` in doc-12648430-645 (es/csv)
  `…hkiXwJ-d3mNHqaPQXF1X,OTRB8208196H4,ok⏎2,54381-8428,_service@firma.de,ok⏎…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-655 (fi/csv)
  `…hp_A2HF1VGetNk5UPYZirfqtjBBmslLwK1BYSQJ,55332-610,ok⏎3,eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVC…`
- **PERSON** scheme `ner-person` in doc-12648430-665 (hi/cv)
  `…Curriculum Vitae⏎काव्या अय्यर⏎नया कार्यालय: वाराणसी।⏎Email: x.y.z@sta…`
- **ORG** scheme `ner-org` in doc-12648430-674 (ar/prose)
  `…. شكراً على الرد السريع. وصلت فاتورة من مجموعة الأفق أمس. …`
- **ORG** scheme `ner-org` in doc-12648430-729 (hi/contract)
  `…xzx4r वाला भुगतान प्राप्त हो गया है।⏎4. गरुड़ परिवहन ने संशोधित प्रस्ताव स्वीकार किया।⏎5. रो…`
- **ORG** scheme `ner-org` in doc-12648430-733 (ar/contract)
  `…944FG قبل يوم الجمعة.⏎4. وصلت فاتورة من مصنع الأمل أمس.⏎5. وقّع خالد الرشيد على المسودة أم…`
- **ORG** scheme `ner-org` in doc-12648430-740 (he/contract)
  `…ihy8nTKjOVfR0zLgT0 התקבל.⏎4. הספק החדש: הוצאת דקל.⏎5. איש הקשר: דניאל שפירא.⏎…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-760 (de/csv)
  `…,identifier,status⏎1,GL7324915947288142,549276,ok⏎2,björn.b@sub.domain.net,GX7NZ96CR8,…`
- **ORG** scheme `ner-org` in doc-12648430-854 (hi/prose)
  `…03531897 वाला भुगतान प्राप्त हो गया है। प्रकाशन वटवृक्ष का चालान कल प्राप्त हुआ। रोहन मेहता शुक…`
- **ORG** scheme `ner-org` in doc-12648430-912 (fa/contract)
  `…7anetr0tnqvaq25d دریافت شد.⏎4. صورتحساب شرکت حمل و نقل آریا دیروز رسید.⏎5. سارا محمدی نتایج را جمعه…`


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
