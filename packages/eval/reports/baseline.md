# Stage 1 baseline — 2611 documents (2000 labeled + 600 hard-negative), seeds 12648430/48879

Corpus: 2611 documents, 6645 ground-truth entities, 9335 sensitive predictions. Mean document length 200 chars.

**This corpus is synthetic.** Values are generator-made, carriers are template sentences, and hard negatives are constructed categories. The numbers measure the detectors against this corpus, not against real-world text; real-world performance will differ, most likely downward on precision for the context-free detectors.

## Per entity type

| type | GT | pred | P | R (partial) | R (exact) | F1 | FP | FN |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| API_KEY | 456 | 489 | 92.8% | 99.6% | 99.6% | 96.1% | 35 | 2 |
| AU_BSB | 4 | 4 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| BR_AGENCIA | 8 | 8 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| CA_TRANSIT_NUMBER | 16 | 18 | 88.9% | 100.0% | 100.0% | 94.1% | 2 | 0 |
| CONNECTION_STRING | 140 | 140 | 100.0% | 100.0% | 98.6% | 100.0% | 0 | 0 |
| COORDINATES | 77 | 75 | 100.0% | 97.4% | 97.4% | 98.7% | 0 | 2 |
| CREDIT_CARD | 150 | 155 | 96.8% | 100.0% | 100.0% | 98.4% | 5 | 0 |
| CRYPTO_WALLET | 625 | 633 | 98.7% | 100.0% | 100.0% | 99.4% | 8 | 0 |
| DRIVERS_LICENSE | 3 | 15 | 20.0% | 100.0% | 100.0% | 33.3% | 12 | 0 |
| EMAIL | 594 | 735 | 80.8% | 100.0% | 100.0% | 89.4% | 141 | 0 |
| GENERIC_SECRET | 74 | 2248 | 3.3% | 100.0% | 100.0% | 6.4% | 2174 | 0 |
| HEALTH_DATA | 417 | 449 | 92.9% | 100.0% | 100.0% | 96.3% | 32 | 0 |
| IBAN | 178 | 178 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| IN_IFSC | 13 | 13 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| IP_ADDRESS | 231 | 263 | 87.8% | 100.0% | 100.0% | 93.5% | 32 | 0 |
| JWT | 162 | 162 | 100.0% | 100.0% | 99.4% | 100.0% | 0 | 0 |
| LOCATION | 216 | 0 | 100.0% | 0.0% | 0.0% | 0.0% | 0 | 216 |
| MAC_ADDRESS | 75 | 75 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| NATIONAL_ID | 495 | 894 | 64.4% | 100.0% | 100.0% | 78.4% | 318 | 0 |
| ORG | 283 | 0 | 100.0% | 0.0% | 0.0% | 0.0% | 0 | 283 |
| PASSPORT_MRZ | 48 | 48 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| PERSON | 917 | 0 | 100.0% | 0.0% | 0.0% | 0.0% | 0 | 917 |
| PHONE | 610 | 610 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| POSTAL_CODE | 91 | 1031 | 6.7% | 75.8% | 75.8% | 12.3% | 962 | 22 |
| PRIVATE_KEY | 53 | 53 | 100.0% | 100.0% | 100.0% | 100.0% | 0 | 0 |
| STREET_ADDRESS | 186 | 194 | 95.9% | 100.0% | 98.9% | 97.9% | 8 | 0 |
| SWIFT_BIC | 84 | 93 | 90.3% | 100.0% | 100.0% | 94.9% | 9 | 0 |
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
| ar | 281 | 362 | 60.5% | 76.9% | 76.9% | 67.7% | 143 | 65 |
| cs | 280 | 417 | 54.0% | 80.4% | 80.4% | 64.6% | 192 | 55 |
| da | 345 | 458 | 61.4% | 78.0% | 77.7% | 68.7% | 177 | 76 |
| de | 285 | 389 | 59.1% | 80.7% | 80.7% | 68.2% | 159 | 55 |
| el | 248 | 354 | 56.2% | 80.2% | 80.2% | 66.1% | 155 | 49 |
| en | 317 | 820 | 32.0% | 77.0% | 77.0% | 45.2% | 558 | 73 |
| es | 230 | 297 | 62.6% | 80.9% | 80.9% | 70.6% | 111 | 44 |
| fa | 259 | 343 | 59.8% | 79.2% | 79.2% | 68.1% | 138 | 54 |
| fi | 295 | 423 | 54.6% | 78.3% | 78.0% | 64.3% | 192 | 64 |
| fr | 234 | 335 | 57.0% | 77.8% | 77.8% | 65.8% | 144 | 52 |
| he | 256 | 372 | 56.2% | 78.9% | 78.9% | 65.6% | 163 | 54 |
| hi | 205 | 264 | 62.5% | 79.5% | 79.5% | 70.0% | 99 | 42 |
| it | 235 | 307 | 62.2% | 81.3% | 81.3% | 70.5% | 116 | 44 |
| ja | 242 | 313 | 61.0% | 78.5% | 78.5% | 68.7% | 122 | 52 |
| ko | 248 | 363 | 53.7% | 78.6% | 78.6% | 63.8% | 168 | 53 |
| nl | 259 | 350 | 56.9% | 76.8% | 76.4% | 65.4% | 151 | 60 |
| pl | 284 | 398 | 57.8% | 77.1% | 77.1% | 66.1% | 168 | 65 |
| pt | 200 | 253 | 60.9% | 75.0% | 75.0% | 67.2% | 99 | 50 |
| ro | 241 | 319 | 58.9% | 78.0% | 77.6% | 67.1% | 131 | 53 |
| ru | 280 | 399 | 57.4% | 80.0% | 80.0% | 66.8% | 170 | 56 |
| sv | 291 | 362 | 63.5% | 75.6% | 75.6% | 69.0% | 132 | 71 |
| th | 277 | 366 | 59.6% | 78.7% | 78.7% | 67.8% | 148 | 59 |
| tr | 283 | 365 | 61.9% | 77.4% | 77.4% | 68.8% | 139 | 64 |
| uk | 268 | 324 | 64.2% | 75.4% | 75.4% | 69.3% | 116 | 66 |
| zh | 302 | 382 | 61.8% | 78.1% | 77.5% | 69.0% | 146 | 66 |

## Raw confidence vs. empirical precision (NOT calibration)

Stage 1 confidences are detector-local and only ordered; real calibration requires Stage 4 fusion (M8). This is a first look only.

| bucket | predictions | matched | precision |
| --- | ---: | ---: | ---: |
| HIGH(0.85) | 4789 | 4048 | 84.5% |
| LOW(0.3) | 3485 | 329 | 9.4% |
| MAXIMUM(0.99) | 101 | 101 | 100.0% |
| MEDIUM(0.6) | 960 | 820 | 85.4% |

## Hard-negative false positives by category

| category | sensitive detections (all FP) |
| --- | ---: |
| base64-blob | 92 |
| checksum-failures | 71 |
| hex-artifacts | 3 |
| labeled-examples | 60 |
| native-digit-noise | 121 |
| order-numbers | 51 |
| placeholder-code | 33 |
| version-numbers | 8 |

## Latency

p50 0.49ms · p95 1.53ms · p99 2.85ms · max 23.58ms per document (normalize + all detectors).

## Worst false positives (highest confidence first)

- **EMAIL** `email` conf 0.85 in doc-12648430-5 (tr/log)
  `…06Z INFO request from mongodb+srv://svc:lEJZBLRTkloYvrhcpdb@cluster0.mongodb.net:5432/appdb accepted⏎…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-5 (tr/log)
  `…⏎2026-08-20T11:32:06Z INFO request from mongodb+srv://svc:lEJZBLRTkloYvrhcpdb@cluster0.mongodb.net:5432/appdb accepted⏎…`
- **NATIONAL_ID** `national-id-in-aadhaar` conf 0.85 in doc-12648430-7 (pl/json)
  `…{⏎  "account": {⏎    "contact": "+558121345678",⏎    "reference": "6518849955",⏎    "n…`
- **TAX_ID** `national-id-pt-nif` conf 0.85 in doc-12648430-9 (nl/contract)
  `…naar donderdag.⏎2. Het dossier vermeldt 88506​9250 als identificatie.⏎3. Stuur de stukken …`
- **NATIONAL_ID** `national-id-ca-sin` conf 0.85 in doc-12648430-24 (ro/cv)
  `….⏎Email: o'brien@sub.domain.net⏎Tel: +6 141 234 567 8⏎세종대로 256⏎⏎Ședința a fost mutată joi.⏎…`
- **NATIONAL_ID** `national-id-th` conf 0.85 in doc-12648430-25 (ja/json)
  `…{⏎  "account": {⏎    "contact": "+8613912345678",⏎    "reference": "675932456964",⏎    …`
- **NATIONAL_ID** `national-id-ca-sin` conf 0.85 in doc-12648430-26 (ru/email)
  `…С уважением,⏎Ольга Виноградова⏎Tel: +81 901 234 567 8⏎first.middle.last@gmail.com⏎…`
- **NATIONAL_ID** `national-id-in-aadhaar` conf 0.85 in doc-12648430-27 (sv/cv)
  `…mail: first.middle.last@gmail.com⏎Tel: +558121345678⏎⏎Mötet flyttades till torsdag.⏎…`
- **NATIONAL_ID** `national-id-hr-oib` conf 0.85 in doc-12648430-29 (de/email)
  `…men,⏎⏎Sie erreichen die Abteilung unter 93657824508 während der Bürozeiten.⏎Der Mitarbeiter…`
- **NATIONAL_ID** `national-id-th` conf 0.85 in doc-12648430-30 (ro/medical)
  `…istrată.⏎HbA1c 21.2 g/dL [21-46]⏎SNOMED 2697926275001⏎Persoana de contact: Ana Marinescu.⏎Mul…`
- **TAX_ID** `national-id-gr-afm` conf 0.85 in doc-12648430-31 (nl/csv)
  `…iVt3A7nRiw61DH1HwpVPY,ok⏎3,BE0279831043,794083101,ok⏎…`
- **NATIONAL_ID** `national-id-ca-sin` conf 0.85 in doc-12648430-34 (en/email)
  `… hours.⏎Please send the paperwork to +6 141 234 567 8 before Friday.⏎Martha Ellison joined …`
- **EMAIL** `email` conf 0.85 in doc-12648430-36 (da/yaml)
  `…service:⏎  owner_contact: redis://app:iX9irCCXPdb5e7v@prod-db.corp:5432/appdb⏎  billing_id: ghp_hN8mzZGriQ…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-36 (da/yaml)
  `…service:⏎  owner_contact: redis://app:iX9irCCXPdb5e7v@prod-db.corp:5432/appdb⏎  billing_id: ghp_hN8mzZGriQ7ex88w87JaD…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-45 (tr/log)
  `…⏎2026-08-26T17:22:08Z INFO request from amqp://svc:g5ffRMOAAqi4wmt@10.0.3.4:5432/appdb accepted⏎2026-08-23T13:52:00Z INFO requ…`
- **EMAIL** `email` conf 0.85 in doc-12648430-50 (cs/prose)
  `…řijata. Platba s referencí redis://root:gTjI6dNuy0ILnPi9D@prod-db.corp:5432/appdb byla přijata. Zašlete prosím…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-50 (cs/prose)
  `…4DQ1W5 byla přijata. Platba s referencí redis://root:gTjI6dNuy0ILnPi9D@prod-db.corp:5432/appdb byla přijata. Zašlete prosím podklady n…`
- **NATIONAL_ID** `national-id-th` conf 0.85 in doc-12648430-52 (hi/markdown-table)
  `…fy5yPo1STliV64VQgdZHMk |⏎| reference | +८६१३९१२३४५६७८ |⏎…`
- **EMAIL** `email` conf 0.85 in doc-12648430-60 (it/log)
  `…Z INFO request from mongodb+srv://admin:lp2JOz0a0j3x@prod-db.corp:5432/appdb accepted⏎2026-08-21T18:33:06…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-60 (it/log)
  `…2026-08-20T19:48:06Z INFO request from mongodb+srv://admin:lp2JOz0a0j3x@prod-db.corp:5432/appdb accepted⏎2026-08-21T18:33:06Z INFO heal…`
- **NATIONAL_ID** `national-id-ro-cnp` conf 0.85 in doc-12648430-63 (es/medical)
  `…iernes.⏎HbA1c 28.3 mmol/L [8-60]⏎SNOMED 7760630761010⏎Envíe la copia firmada a Pablo Cifuente…`
- **NATIONAL_ID** `national-id-th` conf 0.85 in doc-12648430-63 (es/medical)
  `…iernes.⏎HbA1c 28.3 mmol/L [8-60]⏎SNOMED 7760630761010⏎Envíe la copia firmada a Pablo Cifuente…`
- **EMAIL** `email` conf 0.85 in doc-12648430-66 (he/markdown-table)
  `…13-45678 |⏎| reference | mongodb://root:MEVAgfwrIjLs6@prod-db.corp:5432/appdb |⏎⏎```⏎P<INDYILMAZ<<JAN<<<<<…`
- **URL_WITH_CREDENTIALS** `url-with-credentials` conf 0.85 in doc-12648430-66 (he/markdown-table)
  `…ntact | +55 81213-45678 |⏎| reference | mongodb://root:MEVAgfwrIjLs6@prod-db.corp:5432/appdb |⏎⏎```⏎P<INDYILMAZ<<JAN<<<<<<<<<<<<<<<<…`
- **NATIONAL_ID** `national-id-ca-sin` conf 0.85 in doc-12648430-67 (el/email)
  `…εκτίμηση,⏎Δημήτρης Σταθόπουλος⏎Tel: +44 791 112 345 6⏎first.middle.last@münchen.de⏎…`
- **NATIONAL_ID** `national-id-ca-sin` conf 0.85 in doc-12648430-71 (th/cv)
  `…สดิ์⏎Email: a@xn--bcher-kva.de⏎Tel: +๘๑ ๙๐๑ ๒๓๔ ๕๖๗ ๘⏎⏎ขอบคุณสำหรับการตอบกลับอย่างรวดเร็ว⏎…`
- **TAX_ID** `national-id-pl-regon` conf 0.85 in doc-12648430-83 (fr/contract)
  `…vant vendredi.⏎3. Le virement référencé 555240415 a bien été reçu.⏎4. La facture de Ateli…`
- **EMAIL** `email` conf 0.85 in doc-12648430-85 (zh/prose)
  `…感谢您的快速回复。 请在周五之前把材料发送到 https://admin:hunter2secret@cache.svc.local/app。 档案中登记的识别号是 +91 852 701 234 5。 档案中登…`
- **NATIONAL_ID** `national-id-in-aadhaar` conf 0.85 in doc-12648430-86 (es/csv)
  `…97pvcxcpqvre6v8r4mw629xwrd9cz5e5qe6sh02,813917871003,ok⏎…`
- **NATIONAL_ID** `national-id-th` conf 0.85 in doc-12648430-86 (es/csv)
  `…row,contact,identifier,status⏎1,+8613912345678,bc1q4zzlj36zy3zs9s6fl2qha0ddfy56hj3wd4l…`

## False negatives (missed ground truth)

- **PERSON** scheme `ner-person` in doc-12648430-0 (en/medical)
  `…17009⏎Please forward the signed copy to Eleanor Brooks.⏎The updated draft is attached for your…`
- **ORG** scheme `ner-org` in doc-12648430-2 (da/contract)
  `…hwmJQaJRjmVIoBwj som identifikation.⏎4. Bølgekraft Teknik har accepteret det reviderede tilbud.⏎5…`
- **PERSON** scheme `ner-person` in doc-12648430-2 (da/contract)
  `…lbud.⏎5. Send den underskrevne kopi til Rasmus Bruun.⏎…`
- **PERSON** scheme `ner-person` in doc-12648430-4 (uk/medical)
  `…⏎HbA1c 186.0 % [23-47]⏎Контактна особа: Андрій Ковальчук.⏎Нараду перенесено на четвер.⏎…`
- **ORG** scheme `ner-org` in doc-12648430-9 (nl/contract)
  `…ag naar +61412345678.⏎4. De factuur van Duinrand Techniek is gisteren binnengekomen.⏎5. Stuur het…`
- **PERSON** scheme `ner-person` in doc-12648430-9 (nl/contract)
  `….⏎5. Stuur het getekende exemplaar naar Sanne de Vries.⏎…`
- **PERSON** scheme `ner-person` in doc-12648430-10 (ru/cv)
  `…Curriculum Vitae⏎Анна Соколова⏎Email: jane_doe@xn--bcher-kva.de⏎Tel: +…`
- **ORG** scheme `ner-org` in doc-12648430-13 (fi/contract)
  `…ihin mennessä.⏎4. Uusi toimittajamme on Revontuli Logistiikka.⏎5. Yhteyshenkilö: Aino Korhonen.⏎…`
- **PERSON** scheme `ner-person` in doc-12648430-13 (fi/contract)
  `…evontuli Logistiikka.⏎5. Yhteyshenkilö: Aino Korhonen.⏎…`
- **ORG** scheme `ner-org` in doc-12648430-15 (fa/contract)
  `…abyiijSu۰۳thcvL ارسال کنید.⏎4. صورتحساب گروه آفتاب دیروز رسید.⏎5. رضا کریمی پیش‌نویس را دی…`
- **PERSON** scheme `ner-person` in doc-12648430-15 (fa/contract)
  `….⏎4. صورتحساب گروه آفتاب دیروز رسید.⏎5. رضا کریمی پیش‌نویس را دیروز تأیید کرد.⏎…`
- **PERSON** scheme `ner-person` in doc-12648430-16 (he/cv)
  `…Curriculum Vitae⏎מיכל רוזן⏎Email: müller@sub.domain.net⏎Tel: +1415…`
- **ORG** scheme `ner-org` in doc-12648430-19 (es/prose)
  `…cador. Gracias por la respuesta rápida. Grupo Almadera aceptó la oferta revisada. La nueva ofi…`
- **LOCATION** scheme `ner-location` in doc-12648430-19 (es/prose)
  `…la oferta revisada. La nueva oficina de Sevilla abre en marzo. …`
- **PERSON** scheme `ner-person` in doc-12648430-20 (de/medical)
  `…8102⏎Bitte senden Sie die Unterlagen an Franziska Weber.⏎Vielen Dank für die schnelle Rückmeldu…`
- **ORG** scheme `ner-org` in doc-12648430-22 (uk/contract)
  `…к ідентифікатор.⏎4. Новий постачальник: Група Калина.⏎5. Звіт у п’ятницю представить Соломія…`
- **PERSON** scheme `ner-person` in doc-12648430-22 (uk/contract)
  `… Калина.⏎5. Звіт у п’ятницю представить Соломія Ткаченко.⏎…`
- **PERSON** scheme `ner-person` in doc-12648430-23 (sv/prose)
  `…t. Skicka det signerade exemplaret till Elsa Bergström. Frakt till Luleå tar fyra dagar. …`
- **LOCATION** scheme `ner-location` in doc-12648430-23 (sv/prose)
  `…mplaret till Elsa Bergström. Frakt till Luleå tar fyra dagar. …`
- **PERSON** scheme `ner-person` in doc-12648430-24 (ro/cv)
  `…Curriculum Vitae⏎Ana Marinescu⏎Noul birou din Timișoara se deschide în…`
- **LOCATION** scheme `ner-location` in doc-12648430-24 (ro/cv)
  `…ulum Vitae⏎Ana Marinescu⏎Noul birou din Timișoara se deschide în martie.⏎Email: o'brien@s…`
- **PERSON** scheme `ner-person` in doc-12648430-26 (ru/email)
  `…8xk как идентификатор.⏎Контактное лицо: Ольга Виноградова.⏎Совещание перенесено на четверг.⏎⏎С ув…`
- **PERSON** scheme `ner-person` in doc-12648430-26 (ru/email)
  `…ие перенесено на четверг.⏎⏎С уважением,⏎Ольга Виноградова⏎Tel: +81 901 234 567 8⏎first.middle.las…`
- **PERSON** scheme `ner-person` in doc-12648430-27 (sv/cv)
  `…Curriculum Vitae⏎Astrid Lindqvist⏎Frakt till Göteborg tar fyra dagar.⏎Ema…`
- **LOCATION** scheme `ner-location` in doc-12648430-27 (sv/cv)
  `…culum Vitae⏎Astrid Lindqvist⏎Frakt till Göteborg tar fyra dagar.⏎Email: first.middle.las…`
- **ORG** scheme `ner-org` in doc-12648430-29 (de/email)
  `…als Kennung angegeben.⏎Die Rechnung von Steinbach Verlag liegt bei.⏎Der Vertrag liegt zur Unters…`
- **PERSON** scheme `ner-person` in doc-12648430-29 (de/email)
  `…hrift bereit.⏎⏎Mit freundlichen Grüßen,⏎Jonas Keller⏎Tel: +55 81213-45678⏎jane_doe@startup.i…`
- **PERSON** scheme `ner-person` in doc-12648430-30 (ro/medical)
  `…OMED 2697926275001⏎Persoana de contact: Ana Marinescu.⏎Mulțumim pentru răspunsul rapid.⏎…`
- **POSTAL_CODE** scheme `postal` in doc-12648430-31 (nl/csv)
  `…MNZC9qBa5zCqyucyVTZ5p2Ez1gdXx6HcV1,ok⏎2,9931-240,87mvekt9BDyfGL28gB2N4cYP7paanGpmr4NSuPu…`
- **PERSON** scheme `ner-person` in doc-12648430-34 (en/email)
  `…work to +6 141 234 567 8 before Friday.⏎Martha Ellison joined the onboarding call this morning…`
