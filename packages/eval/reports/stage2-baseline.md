# Stage 1+2 combined — model jiting/xlm-roberta-base-ner-hrl_onnx (q8), same corpus and seeds as the Stage 1 baseline

Corpus: 2611 documents, 6645 ground-truth entities, 9860 sensitive predictions. Mean document length 200 chars.

**This corpus is synthetic.** Values are generator-made, carriers are template sentences, and hard negatives are constructed categories. The numbers measure the detectors against this corpus, not against real-world text; real-world performance will differ, most likely downward on precision for the context-free detectors.

## Per entity type

| type | GT | pred | P | R (partial) | R (exact) | F1 | FP | FN |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| API_KEY | 456 | 474 | 95.8% | 99.6% | 99.6% | 97.6% | 20 | 2 |
| AU_BSB | 4 | 4 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| BR_AGENCIA | 8 | 8 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| CA_TRANSIT_NUMBER | 16 | 18 | 88.9% | 100.0% | 100.0% | 94.1% | 2 | 0 |
| CONNECTION_STRING | 140 | 140 | 100.0% | 100.0% | 98.6% | 100.0% | 0 | 0 |
| COORDINATES | 77 | 75 | 100.0% | 97.4% | 97.4% | 98.7% | 0 | 2 |
| CREDIT_CARD | 150 | 155 | 96.8% | 100.0% | 100.0% | 98.4% | 5 | 0 |
| CRYPTO_WALLET | 625 | 633 | 98.7% | 100.0% | 100.0% | 99.4% | 8 | 0 |
| DRIVERS_LICENSE | 3 | 15 | 20.0% | 100.0% | 100.0% | 33.3% | 12 | 0 |
| EMAIL | 594 | 600 | 99.0% | 100.0% | 100.0% | 99.5% | 6 | 0 |
| GENERIC_SECRET | 74 | 2117 | 2.0% | 56.8% | 56.8% | 3.8% | 2075 | 32 |
| HEALTH_DATA | 417 | 449 | 92.9% | 100.0% | 100.0% | 96.3% | 32 | 0 |
| IBAN | 178 | 178 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| IN_IFSC | 13 | 13 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| IP_ADDRESS | 231 | 263 | 87.8% | 100.0% | 100.0% | 93.5% | 32 | 0 |
| JWT | 162 | 162 | 100.0% | 100.0% | 99.4% | 100.0% | 0 | 0 |
| LOCATION | 216 | 341 | 63.3% | 99.1% | 98.1% | 77.3% | 125 | 2 |
| MAC_ADDRESS | 75 | 75 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| NATIONAL_ID | 495 | 844 | 68.2% | 100.0% | 100.0% | 81.1% | 268 | 0 |
| ORG | 283 | 285 | 88.1% | 85.9% | 69.3% | 87.0% | 34 | 40 |
| PASSPORT_MRZ | 48 | 48 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| PERSON | 917 | 977 | 98.0% | 97.1% | 87.9% | 97.5% | 20 | 27 |
| PHONE | 610 | 610 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| POSTAL_CODE | 91 | 293 | 23.5% | 75.8% | 75.8% | 35.9% | 224 | 22 |
| PRIVATE_KEY | 53 | 53 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| STREET_ADDRESS | 186 | 194 | 95.9% | 100.0% | 98.9% | 97.9% | 8 | 0 |
| SWIFT_BIC | 84 | 84 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| TAX_ID | 113 | 276 | 46.0% | 100.0% | 100.0% | 63.0% | 149 | 0 |
| UK_SORT_CODE | 4 | 4 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| URL_WITH_CREDENTIALS | 71 | 211 | 33.6% | 100.0% | 98.6% | 50.4% | 140 | 0 |
| US_NPI | 3 | 4 | 75.0% | 100.0% | 100.0% | 85.7% | 1 | 0 |
| US_ROUTING_NUMBER | 5 | 14 | 35.7% | 100.0% | 100.0% | 52.6% | 9 | 0 |
| VAT_NUMBER | 162 | 162 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| VIN | 81 | 81 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |

## Per language

| language | GT | pred | P | R (partial) | R (exact) | F1 | FP | FN |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ar | 281 | 399 | 70.9% | 96.1% | 89.0% | 81.6% | 116 | 11 |
| cs | 280 | 417 | 66.4% | 98.2% | 96.8% | 79.3% | 140 | 5 |
| da | 345 | 500 | 72.0% | 99.1% | 96.2% | 83.4% | 140 | 3 |
| de | 285 | 413 | 68.8% | 98.9% | 98.2% | 81.1% | 129 | 3 |
| el | 248 | 393 | 62.8% | 99.2% | 98.8% | 76.9% | 146 | 2 |
| en | 317 | 680 | 49.0% | 98.7% | 97.8% | 65.5% | 347 | 4 |
| es | 230 | 324 | 71.0% | 100.0% | 100.0% | 83.0% | 94 | 0 |
| fa | 259 | 373 | 69.2% | 99.2% | 96.1% | 81.5% | 115 | 2 |
| fi | 295 | 440 | 65.7% | 96.9% | 94.9% | 78.3% | 151 | 9 |
| fr | 234 | 387 | 65.1% | 99.1% | 94.0% | 78.6% | 135 | 2 |
| he | 256 | 379 | 67.8% | 96.5% | 93.4% | 79.6% | 122 | 9 |
| hi | 205 | 276 | 72.5% | 95.6% | 93.7% | 82.4% | 76 | 9 |
| it | 235 | 330 | 70.9% | 97.0% | 94.0% | 81.9% | 96 | 7 |
| ja | 242 | 327 | 71.6% | 95.9% | 93.4% | 81.9% | 93 | 10 |
| ko | 248 | 387 | 61.5% | 96.0% | 96.0% | 75.0% | 149 | 10 |
| nl | 259 | 389 | 68.9% | 97.7% | 91.1% | 80.8% | 121 | 6 |
| pl | 284 | 428 | 68.2% | 98.6% | 98.2% | 80.6% | 136 | 4 |
| pt | 200 | 291 | 70.8% | 99.0% | 97.0% | 82.6% | 85 | 2 |
| ro | 241 | 339 | 71.1% | 99.2% | 95.9% | 82.8% | 98 | 2 |
| ru | 280 | 425 | 66.4% | 98.9% | 98.9% | 79.4% | 143 | 3 |
| sv | 291 | 414 | 72.7% | 99.7% | 98.6% | 84.1% | 113 | 1 |
| th | 277 | 381 | 69.8% | 95.7% | 92.8% | 80.7% | 115 | 12 |
| tr | 283 | 392 | 73.7% | 98.9% | 98.2% | 84.5% | 103 | 3 |
| uk | 268 | 358 | 76.3% | 99.3% | 98.5% | 86.2% | 85 | 2 |
| zh | 302 | 418 | 70.8% | 98.0% | 97.0% | 82.2% | 122 | 6 |

## Raw confidence vs. empirical precision (NOT calibration)

Stage 1 confidences are detector-local and only ordered; real calibration requires Stage 4 fusion (M8). This is a first look only.

| bucket | predictions | matched | precision |
| --- | ---: | ---: | ---: |
| HIGH(0.85) | 4958 | 4369 | 88.1% |
| LOW(0.3) | 1129 | 109 | 9.7% |
| MAXIMUM(0.99) | 1029 | 1007 | 97.9% |
| MEDIUM(0.6) | 2744 | 1205 | 43.9% |

## Hard-negative false positives by category

| category | sensitive detections (all FP) |
| --- | ---: |
| base64-blob | 1 |
| checksum-failures | 65 |
| hex-artifacts | 3 |
| labeled-examples | 42 |
| native-digit-noise | 61 |
| order-numbers | 51 |
| placeholder-code | 18 |
| version-numbers | 8 |

## Latency

p50 115.34ms · p95 407.51ms · p99 1099.86ms · max 2309.92ms per document (normalize + all detectors).

## Worst false positives (highest confidence first)

- **LOCATION** `ner:xlm-roberta-base-ner-hrl_onnx@q8` conf 0.9992491006851196 in doc-12648430-53 (hi/cv)
  `…ice@startup.io⏎Tel: +3 36123-45678⏎9974 Pennsylvania Avenue⏎⏎शीघ्र उत्तर के लिए धन्यवाद।⏎…`
- **LOCATION** `ner:xlm-roberta-base-ner-hrl_onnx@q8` conf 0.9982746243476868 in doc-12648430-148 (es/code)
  `…/ service configuration⏎const apiKey = "Atatürk Caddesi No: 100";⏎// La reunión s…`
- **LOCATION** `ner:xlm-roberta-base-ner-hrl_onnx@q8` conf 0.9871461391448975 in doc-12648430-90 (zh/cv)
  `…n.b@xn--bcher-kva.de⏎Tel: +558121345678⏎شارع الملك فهد 88⏎⏎感谢您的快速回复。⏎…`
- **LOCATION** `ner:xlm-roberta-base-ner-hrl_onnx@q8` conf 0.9772992134094238 in doc-12648430-16 (he/cv)
  `…müller@sub.domain.net⏎Tel: +14155550198⏎İstiklal Caddesi No: 140⏎⏎תודה על המענה המהיר.⏎…`
- **LOCATION** `ner:xlm-roberta-base-ner-hrl_onnx@q8` conf 0.9430261254310608 in doc-12648430-47 (pl/cv)
  `…y.z@corp.co.uk⏎Tel: +91 85270-12345⏎534 rue del Sol⏎⏎Spotkanie przeniesiono na czwartek.⏎…`
- **LOCATION** `ner:xlm-roberta-base-ner-hrl_onnx@q8` conf 0.941663920879364 in doc-12648430-148 (es/code)
  `… service configuration⏎const apiKey = "Atatürk Caddesi No: 100";⏎// La reunión se movió al jue…`
- **LOCATION** `ner:xlm-roberta-base-ner-hrl_onnx@q8` conf 0.8846341967582703 in doc-12648430-35 (ru/cv)
  `…z@xn--bcher-kva.de⏎Tel: +81 90123-45678⏎Hauptstraße 78⏎⏎Совещание перенесено на четверг.⏎…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-5 (tr/log)
  `…⏎2026-08-20T11:32:06Z INFO request from mongodb+srv://svc:lEJZBLRTkloYvrhcpdb@cluster0.mongodb.net:5432/appdb accepted⏎…`
- **NATIONAL_ID** `national-id-in-aadhaar` conf 0.85 in doc-12648430-7 (pl/json)
  `…{⏎  "account": {⏎    "contact": "+558121345678",⏎    "reference": "6518849955",⏎    "n…`
- **TAX_ID** `national-id-pt-nif` conf 0.85 in doc-12648430-9 (nl/contract)
  `…naar donderdag.⏎2. Het dossier vermeldt 88506​9250 als identificatie.⏎3. Stuur de stukken …`
- **NATIONAL_ID** `national-id-th` conf 0.85 in doc-12648430-25 (ja/json)
  `…{⏎  "account": {⏎    "contact": "+8613912345678",⏎    "reference": "675932456964",⏎    …`
- **NATIONAL_ID** `national-id-in-aadhaar` conf 0.85 in doc-12648430-27 (sv/cv)
  `…mail: first.middle.last@gmail.com⏎Tel: +558121345678⏎⏎Mötet flyttades till torsdag.⏎…`
- **NATIONAL_ID** `national-id-hr-oib` conf 0.85 in doc-12648430-29 (de/email)
  `…men,⏎⏎Sie erreichen die Abteilung unter 93657824508 während der Bürozeiten.⏎Der Mitarbeiter…`
- **NATIONAL_ID** `national-id-th` conf 0.85 in doc-12648430-30 (ro/medical)
  `…istrată.⏎HbA1c 21.2 g/dL [21-46]⏎SNOMED 2697926275001⏎Persoana de contact: Ana Marinescu.⏎Mul…`
- **TAX_ID** `national-id-gr-afm` conf 0.85 in doc-12648430-31 (nl/csv)
  `…iVt3A7nRiw61DH1HwpVPY,ok⏎3,BE0279831043,794083101,ok⏎…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-36 (da/yaml)
  `…service:⏎  owner_contact: redis://app:iX9irCCXPdb5e7v@prod-db.corp:5432/appdb⏎  billing_id: ghp_hN8mzZGriQ7ex88w87JaD…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-45 (tr/log)
  `…⏎2026-08-26T17:22:08Z INFO request from amqp://svc:g5ffRMOAAqi4wmt@10.0.3.4:5432/appdb accepted⏎2026-08-23T13:52:00Z INFO requ…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-50 (cs/prose)
  `…4DQ1W5 byla přijata. Platba s referencí redis://root:gTjI6dNuy0ILnPi9D@prod-db.corp:5432/appdb byla přijata. Zašlete prosím podklady n…`
- **NATIONAL_ID** `national-id-th` conf 0.85 in doc-12648430-52 (hi/markdown-table)
  `…fy5yPo1STliV64VQgdZHMk |⏎| reference | +८६१३९१२३४५६७८ |⏎…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-60 (it/log)
  `…2026-08-20T19:48:06Z INFO request from mongodb+srv://admin:lp2JOz0a0j3x@prod-db.corp:5432/appdb accepted⏎2026-08-21T18:33:06Z INFO heal…`
- **NATIONAL_ID** `national-id-ro-cnp` conf 0.85 in doc-12648430-63 (es/medical)
  `…iernes.⏎HbA1c 28.3 mmol/L [8-60]⏎SNOMED 7760630761010⏎Envíe la copia firmada a Pablo Cifuente…`
- **NATIONAL_ID** `national-id-th` conf 0.85 in doc-12648430-63 (es/medical)
  `…iernes.⏎HbA1c 28.3 mmol/L [8-60]⏎SNOMED 7760630761010⏎Envíe la copia firmada a Pablo Cifuente…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-66 (he/markdown-table)
  `…ntact | +55 81213-45678 |⏎| reference | mongodb://root:MEVAgfwrIjLs6@prod-db.corp:5432/appdb |⏎⏎```⏎P<INDYILMAZ<<JAN<<<<<<<<<<<<<<<<…`
- **TAX_ID** `national-id-pl-regon` conf 0.85 in doc-12648430-83 (fr/contract)
  `…vant vendredi.⏎3. Le virement référencé 555240415 a bien été reçu.⏎4. La facture de Ateli…`
- **NATIONAL_ID** `national-id-in-aadhaar` conf 0.85 in doc-12648430-86 (es/csv)
  `…97pvcxcpqvre6v8r4mw629xwrd9cz5e5qe6sh02,813917871003,ok⏎…`
- **NATIONAL_ID** `national-id-th` conf 0.85 in doc-12648430-86 (es/csv)
  `…row,contact,identifier,status⏎1,+8613912345678,bc1q4zzlj36zy3zs9s6fl2qha0ddfy56hj3wd4l…`
- **NATIONAL_ID** `national-id-jp-my-number` conf 0.85 in doc-12648430-88 (it/csv)
  `…⏎2,729:df30:70aa:438f:27a8:bae2:fe:6046,675909924887,ok⏎3,GI27SSCOFQ68V47CHWNM614,GMTZMB12E4…`
- **NATIONAL_ID** `national-id-in-aadhaar` conf 0.85 in doc-12648430-90 (zh/cv)
  `…。⏎Email: björn.b@xn--bcher-kva.de⏎Tel: +558121345678⏎شارع الملك فهد 88⏎⏎感谢您的快速回复。⏎…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-91 (hi/log)
  `…⏎2026-08-23T16:46:02Z INFO request from redis://app:९obehbzUbaEPUw६iYT@cluster०.mongodb.net:५४३२/appdb accepted⏎2026-08-24T10:32:03Z INFO heal…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-93 (he/contract)
  `…עם האסמכתא 99654013 התקבל.⏎3. בתיק רשום postgres://svc:BGvOhGqFLbdxXB@cluster0.mongodb.net:5432/appdb כמזהה.⏎4. החשבונית הופקה על ידי מפעלי א…`

## False negatives (missed ground truth)

- **GENERIC_SECRET** scheme `generic-secret` in doc-12648430-22 (uk/contract)
  `…0 як ідентифікатор.⏎3. У справі вказано A99cAXjL4yqONyd7ux6RgVHATH9ZEfMsMUvEWDl5 як ідентифікатор.⏎4. Новий постачальник…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-31 (nl/csv)
  `…MNZC9qBa5zCqyucyVTZ5p2Ez1gdXx6HcV1,ok⏎2,9931-240,87mvekt9BDyfGL28gB2N4cYP7paanGpmr4NSuPu…`
- **GENERIC_SECRET** scheme `generic-secret` in doc-12648430-54 (th/prose)
  `…็นรหัสประจำตัว ได้รับการชำระเงินอ้างอิง A๙๑๖๗GTj๑yoSOVttL_Dyps๑DvBG๑๔DTH๖KMyTWTahRLi แล้ว มะลิ ศรีสุข อนุมัติร่างเอกสารเมื่อ…`
- **PERSON** scheme `ner-person` in doc-12648430-99 (en/cv)
  `…Curriculum Vitae⏎Sophie Aldridge⏎Shipping to Cape Town takes about four …`
- **POSTAL_CODE** scheme `postal` in doc-12648430-158 (it/csv)
  `…row,contact,identifier,status⏎1,630-4728,144.248.98.3,ok⏎2,X6G 4B3,GFTJKD40S49H9…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-158 (it/csv)
  `…ier,status⏎1,630-4728,144.248.98.3,ok⏎2,X6G 4B3,GFTJKD40S49H999W,ok⏎…`
- **ORG** scheme `ner-org` in doc-12648430-162 (pt/contract)
  `…0940100 até sexta-feira.⏎4. A fatura da Transportes Beiramar chegou ontem.⏎5. Envie a cópia assinada…`
- **ORG** scheme `ner-org` in doc-12648430-180 (cs/contract)
  `…ako identifikátor.⏎4. Fakturu vystavuje Strojírny Vichr.⏎5. Podklady připraví Ondřej Beneš.⏎…`
- **ORG** scheme `ner-org` in doc-12648430-193 (ar/contract)
  `…80750688 كمعرّف مسجل.⏎4. وصلت فاتورة من مجموعة الأفق أمس.⏎5. سيقدم ليلى الحسن النتائج يوم ال…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-204 (ru/csv)
  `…contact,identifier,status⏎1,ZZQKBQZJEWG,733-1514,ok⏎2,EL499711334,https://db.internal.co…`
- **ORG** scheme `ner-org` in doc-12648430-209 (ar/contract)
  `…ملف +442079460958 كمعرّف مسجل.⏎4. وافقت مصنع الأمل على العرض المعدل.⏎5. وقّع فاطمة النجار …`
- **POSTAL_CODE** scheme `postal` in doc-12648430-220 (nl/csv)
  `…6dQVY4JiqIJVIznkKvaNqZCSmc8fXHdC8n8kM7g,72140,ok⏎…`
- **PERSON** scheme `ner-person` in doc-12648430-223 (tr/cv)
  `…Curriculum Vitae⏎Selin Çelik⏎Yeni ofis adresi: Eskişehir.⏎Email: mül…`
- **PERSON** scheme `ner-person` in doc-12648430-236 (th/prose)
  `…AVxHqNsA9-S5-fBufsnkDi เป็นรหัสประจำตัว ดารา บุญมี จะนำเสนอผลประกอบการวันศุกร์ …`
- **PERSON** scheme `ner-person` in doc-12648430-316 (th/medical)
  `… ภายในวันศุกร์⏎HbA1c ๑๑.๒ mg/dL [๗-๑๑๓]⏎ดารา บุญมี จะนำเสนอผลประกอบการวันศุกร์⏎ขอบคุณสำหรั…`
- **GENERIC_SECRET** scheme `generic-secret` in doc-12648430-329 (pl/log)
  `…⏎2026-08-26T21:11:05Z INFO request from A9F942-uYLjOFPxj365SigGloZS accepted⏎2026-08-25T16:40:05Z INFO requ…`
- **PERSON** scheme `ner-person` in doc-12648430-337 (en/cv)
  `…Curriculum Vitae⏎Sophie Aldridge⏎Shipping to Portland takes about four d…`
- **ORG** scheme `ner-org` in doc-12648430-358 (he/contract)
  `…שום 103.168.94.117 כמזהה.⏎4. הספק החדש: הוצאת דקל.⏎5. איש הקשר: איתי כהן.⏎…`
- **ORG** scheme `ner-org` in doc-12648430-359 (th/prose)
  `…7@db.internal.corp/app เป็นรหัสประจำตัว กลุ่มบริษัทรุ่งเรือง ตอบรับข้อเสนอฉบับแก้ไขแล้ว …`
- **ORG** scheme `ner-org` in doc-12648430-375 (hi/prose)
  `… दर्ज है। संपर्क व्यक्ति: अर्जुन वर्मा। सूर्या समूह का चालान कल प्राप्त हुआ। …`
- **GENERIC_SECRET** scheme `generic-secret` in doc-12648430-376 (el/contract)
  `…ευή.⏎3. Παρακαλώ στείλτε τα έγγραφα στο A9FZXnp0qZR6DsMDHEZu-J5eFNFCIsL6LZLwj1gBN μέχρι την Παρασκευή.⏎4. Νέος προμηθευτή…`
- **ORG** scheme `ner-org` in doc-12648430-379 (zh/contract)
  `…的付款已经到账。⏎3. 请在周五之前把材料发送到 H113522639。⏎4. 长风机械已接受修订后的报价。⏎5. 联系人:李静。⏎…`
- **GENERIC_SECRET** scheme `generic-secret` in doc-12648430-393 (zh/prose)
  `…请在周五之前把材料发送到 A9TTdNT9ThCEZRKfAzGWg_AOOu3fVT1kPqR542u_pD7。 档案中登记的识别号是 9137-950。 交货城市:上海。 明远科技已接受修…`
- **PERSON** scheme `ner-person` in doc-12648430-415 (ar/cv)
  `…Curriculum Vitae⏎عمر الخطيب⏎المكتب الجديد: الدار البيضاء.⏎Email: us…`
- **ORG** scheme `ner-org` in doc-12648430-420 (cs/contract)
  `…v38uc do pátku.⏎4. Novým dodavatelem je Strojírny Vichr.⏎5. Podklady připraví Jakub Novotný.⏎…`
- **ORG** scheme `ner-org` in doc-12648430-436 (ro/contract)
  `…e a fost înregistrată.⏎4. Factura de la Asigurări Meridianul a sosit ieri.⏎5. Persoana de contact: I…`
- **GENERIC_SECRET** scheme `generic-secret` in doc-12648430-441 (pt/email)
  `…ira.⏎Por favor envie os documentos para A9s-KBkJTVafO73IZCCbbus3b7Tne até sexta-feira.⏎Beatriz Nogueira aprov…`
- **PERSON** scheme `ner-person` in doc-12648430-443 (hi/cv)
  `…Curriculum Vitae⏎काव्या अय्यर⏎नया कार्यालय: भोपाल।⏎Email: o'brien@xn-…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-512 (uk/csv)
  `…row,contact,identifier,status⏎1,X2E 2L4,ghp_HVJaLPnJk5H2a2UQYaoDMnlMEzDikg2hc1m…`
- **PERSON** scheme `ner-person` in doc-12648430-534 (ja/email)
  `…日届きました。⏎会議は木曜日に変更になりました。⏎⏎よろしくお願いいたします。⏎山本さくら⏎Tel: +90 53212-34567⏎jane_doe@firma.de⏎…`


## Stage 2 per-language (PERSON/ORG/LOCATION only)

| language | GT | precision | recall (partial) | recall (exact) | F1 |
| --- | ---: | ---: | ---: | ---: | ---: |
| ar | 65 | 87.7% | 83.1% | 52.3% | 85.3% |
| cs | 54 | 84.1% | 94.4% | 87.0% | 89.0% |
| da | 76 | 88.0% | 98.7% | 86.8% | 93.1% |
| de | 53 | 79.7% | 100.0% | 96.2% | 88.7% |
| el | 49 | 84.7% | 100.0% | 98.0% | 91.7% |
| en | 73 | 88.8% | 94.5% | 90.4% | 91.5% |
| es | 44 | 91.7% | 100.0% | 100.0% | 95.7% |
| fa | 54 | 90.0% | 98.1% | 83.3% | 93.9% |
| fi | 61 | 93.8% | 95.1% | 86.9% | 94.5% |
| fr | 51 | 89.7% | 98.0% | 74.5% | 93.7% |
| he | 54 | 96.1% | 85.2% | 70.4% | 90.3% |
| hi | 40 | 83.7% | 85.0% | 75.0% | 84.4% |
| it | 40 | 90.0% | 97.5% | 80.0% | 93.6% |
| ja | 52 | 78.0% | 86.5% | 75.0% | 82.0% |
| ko | 51 | 86.3% | 86.3% | 86.3% | 86.3% |
| nl | 55 | 92.1% | 100.0% | 70.9% | 95.9% |
| pl | 64 | 91.5% | 100.0% | 98.4% | 95.6% |
| pt | 50 | 88.3% | 98.0% | 90.0% | 92.9% |
| ro | 52 | 94.6% | 98.1% | 84.6% | 96.3% |
| ru | 54 | 87.1% | 100.0% | 100.0% | 93.1% |
| sv | 70 | 88.8% | 100.0% | 95.7% | 94.0% |
| th | 59 | 90.9% | 83.1% | 69.5% | 86.8% |
| tr | 64 | 92.9% | 98.4% | 95.3% | 95.6% |
| uk | 65 | 93.0% | 100.0% | 96.9% | 96.4% |
| zh | 66 | 88.7% | 95.5% | 93.9% | 92.0% |
