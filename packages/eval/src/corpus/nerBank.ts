/**
 * Per-language NER banks: people, organizations, and locations planted as
 * ground truth for Stage 2 evaluation, plus carrier templates with a single
 * {P} / {O} / {L} slot.
 *
 * AUTHORING RULES (they keep the benchmark valid):
 *  • Slots sit in SUBJECT POSITION or after a COLON in inflected languages
 *    (pl, cs, ru, uk, fi, tr, el, he …), so the nominative surface form in
 *    the bank is grammatical in the sentence. No template requires an
 *    inflected name.
 *  • Person names are culturally plausible for the language and written in
 *    its native script. Organizations carry a legal-form or industry word
 *    where that is idiomatic. Locations are real, unambiguous cities.
 *  • No bank value may collide with another bank's role in the same
 *    language (no surname-only orgs, no city-named companies), and none of
 *    them appear in the language's fillers/carriers — an unlabeled entity
 *    in filler text would corrupt precision measurement.
 *  • Gendered verb forms are avoided (colon constructions or present tense
 *    with the name as subject), because the people lists mix genders.
 */

export interface NerBank {
  readonly code: string;
  readonly people: readonly string[];
  readonly orgs: readonly string[];
  readonly locations: readonly string[];
  /** Templates with exactly one {P} slot. */
  readonly personCarriers: readonly string[];
  /** Templates with exactly one {O} slot. */
  readonly orgCarriers: readonly string[];
  /** Templates with exactly one {L} slot. */
  readonly locationCarriers: readonly string[];
}

export const NER_BANKS: readonly NerBank[] = [
  {
    code: 'en',
    people: ['Eleanor Brooks', 'Daniel Croft', 'Sophie Aldridge', 'James Holloway', 'Martha Ellison', 'Henry Padgett'],
    orgs: ['Halcyon Analytics', 'Bramblewood Press', 'Northgate Logistics', 'Veltrix Systems'],
    locations: ['Manchester', 'Portland', 'Cape Town', 'Wellington', 'Bristol'],
    personCarriers: [
      '{P} will present the quarterly numbers on Friday.',
      'Please forward the signed copy to {P}.',
      '{P} joined the onboarding call this morning.',
    ],
    orgCarriers: ['{O} has approved the revised offer.', 'The invoice from {O} arrived yesterday.'],
    locationCarriers: ['The new office in {L} opens next month.', 'Shipping to {L} takes about four days.'],
  },
  {
    code: 'de',
    people: ['Lukas Brandt', 'Katharina Vogel', 'Jonas Keller', 'Franziska Weber', 'Annika Schröder', 'Tobias Lindner'],
    orgs: ['Nordwind Logistik', 'Steinbach Verlag', 'Adlerwerk Maschinenbau', 'Quellhof Versicherung'],
    locations: ['München', 'Leipzig', 'Salzburg', 'Freiburg', 'Hamburg'],
    personCarriers: [
      '{P} übernimmt ab Montag die Projektleitung.',
      'Bitte senden Sie die Unterlagen an {P}.',
      '{P} hat den Entwurf gestern freigegeben.',
    ],
    orgCarriers: ['{O} hat das Angebot angenommen.', 'Die Rechnung von {O} liegt bei.'],
    locationCarriers: ['Die neue Niederlassung in {L} öffnet im März.', 'Der Versand nach {L} dauert vier Tage.'],
  },
  {
    code: 'fr',
    people: ['Camille Moreau', 'Julien Lefèvre', 'Élodie Garnier', 'Mathieu Rousseau', 'Margaux Chevalier', 'Antoine Perrin'],
    orgs: ['Éditions Lumesnil', 'Ateliers Bréval', 'Groupe Sorentis', 'Transports Kervadec'],
    locations: ['Lyon', 'Bordeaux', 'Montréal', 'Toulouse', 'Marseille'],
    personCarriers: [
      '{P} présentera le bilan vendredi.',
      'Merci de transmettre le dossier à {P}.',
      '{P} a validé la maquette hier.',
    ],
    orgCarriers: ['{O} a accepté la proposition révisée.', 'La facture de {O} est arrivée hier.'],
    locationCarriers: ['Le nouveau bureau de {L} ouvrira en mars.', 'La livraison vers {L} prend quatre jours.'],
  },
  {
    code: 'es',
    people: ['Lucía Herrera', 'Álvaro Domínguez', 'Marta Cabrera', 'Sergio Valverde', 'Irene Salgado', 'Pablo Cifuentes'],
    orgs: ['Grupo Almadera', 'Editorial Cendra', 'Talleres Robledal', 'Logística Miravent'],
    locations: ['Sevilla', 'Valparaíso', 'Guadalajara', 'Zaragoza', 'Montevideo'],
    personCarriers: [
      '{P} presentará los resultados el viernes.',
      'Envíe la copia firmada a {P}.',
      '{P} aprobó el borrador ayer.',
    ],
    orgCarriers: ['{O} aceptó la oferta revisada.', 'La factura de {O} llegó ayer.'],
    locationCarriers: ['La nueva oficina de {L} abre en marzo.', 'El envío a {L} tarda cuatro días.'],
  },
  {
    code: 'it',
    people: ['Chiara Lombardi', 'Matteo Ferraro', 'Silvia Petrucci', 'Lorenzo Vitale', 'Federica Colombo', 'Davide Marino'],
    orgs: ['Gruppo Terraviva', 'Editrice Salmastra', 'Logistica Adriamar', 'Officine Brancaleone'],
    locations: ['Torino', 'Palermo', 'Bologna', 'Verona', 'Trieste'],
    personCarriers: [
      '{P} presenterà i risultati venerdì.',
      'Inviare la copia firmata a {P}.',
      '{P} ha approvato la bozza ieri.',
    ],
    orgCarriers: ["{O} ha accettato l'offerta rivista.", 'La fattura di {O} è arrivata ieri.'],
    locationCarriers: ['La nuova sede di {L} apre a marzo.', 'La spedizione verso {L} richiede quattro giorni.'],
  },
  {
    code: 'pt',
    people: ['Mariana Azevedo', 'Tiago Barbosa', 'Inês Carvalho', 'Rodrigo Antunes', 'Beatriz Nogueira', 'Henrique Tavares'],
    orgs: ['Grupo Alvorada', 'Editora Cravinho', 'Transportes Beiramar', 'Seguros Costaverde'],
    locations: ['Coimbra', 'Recife', 'Braga', 'Curitiba', 'Aveiro'],
    personCarriers: [
      '{P} apresentará os resultados na sexta-feira.',
      'Envie a cópia assinada para {P}.',
      '{P} aprovou o rascunho ontem.',
    ],
    orgCarriers: ['{O} aceitou a proposta revista.', 'A fatura da {O} chegou ontem.'],
    locationCarriers: ['O novo escritório em {L} abre em março.', 'O envio para {L} demora quatro dias.'],
  },
  {
    code: 'nl',
    people: ['Sanne de Vries', 'Daan Vermeulen', 'Lotte Janssen', 'Bram Hoekstra', 'Femke van Dijk', 'Ruben Mulder'],
    orgs: ['Zeewind Logistiek', 'Uitgeverij Bloemhof', 'Kompas Verzekeringen', 'Duinrand Techniek'],
    locations: ['Utrecht', 'Groningen', 'Antwerpen', 'Eindhoven', 'Maastricht'],
    personCarriers: [
      '{P} presenteert vrijdag de kwartaalcijfers.',
      'Stuur het getekende exemplaar naar {P}.',
      '{P} heeft het concept gisteren goedgekeurd.',
    ],
    orgCarriers: ['{O} heeft het herziene voorstel aanvaard.', 'De factuur van {O} is gisteren binnengekomen.'],
    locationCarriers: ['Het nieuwe kantoor in {L} opent in maart.', 'Verzending naar {L} duurt vier dagen.'],
  },
  {
    code: 'pl',
    people: ['Zofia Kamińska', 'Piotr Zieliński', 'Agnieszka Nowicka', 'Marek Szymański', 'Karolina Wójcik', 'Tomasz Lewandowski'],
    orgs: ['Grupa Borowik', 'Wydawnictwo Jantar', 'Logistyka Piastpol', 'Zakłady Wierzbex'],
    locations: ['Kraków', 'Gdańsk', 'Wrocław', 'Poznań', 'Lublin'],
    personCarriers: [
      'Osoba kontaktowa: {P}.',
      'Wyniki w piątek przedstawia {P}.',
      'Dokumenty podpisuje {P}.',
    ],
    orgCarriers: ['Fakturę wystawia {O}.', 'Nowym dostawcą jest {O}.'],
    locationCarriers: ['Nowe biuro: {L}.', 'Miasto dostawy: {L}.'],
  },
  {
    code: 'cs',
    people: ['Tereza Dvořáková', 'Jakub Novotný', 'Eliška Marešová', 'Ondřej Beneš', 'Lucie Pokorná', 'Martin Sedláček'],
    orgs: ['Skupina Vltavan', 'Nakladatelství Krkonoš', 'Moravex Logistika', 'Strojírny Vichr'],
    locations: ['Brno', 'Ostrava', 'Plzeň', 'Olomouc', 'Liberec'],
    personCarriers: [
      'Kontaktní osoba: {P}.',
      'Výsledky v pátek představí {P}.',
      'Podklady připraví {P}.',
    ],
    orgCarriers: ['Fakturu vystavuje {O}.', 'Novým dodavatelem je {O}.'],
    locationCarriers: ['Nová pobočka: {L}.', 'Město doručení: {L}.'],
  },
  {
    code: 'ro',
    people: ['Ioana Petrescu', 'Andrei Dumitrescu', 'Elena Stanciu', 'Mihai Ionescu', 'Ana Marinescu', 'Cristian Vasilescu'],
    orgs: ['Grupul Carpatex', 'Editura Luceafărul', 'Transporturi Dunavia', 'Asigurări Meridianul'],
    locations: ['Cluj-Napoca', 'Timișoara', 'Iași', 'Brașov', 'Constanța'],
    personCarriers: [
      '{P} va prezenta rezultatele vineri.',
      'Persoana de contact: {P}.',
      '{P} a aprobat ieri schița.',
    ],
    orgCarriers: ['{O} a acceptat oferta revizuită.', 'Factura de la {O} a sosit ieri.'],
    locationCarriers: ['Noul birou din {L} se deschide în martie.', 'Livrarea către {L} durează patru zile.'],
  },
  {
    code: 'tr',
    people: ['Elif Aydın', 'Mehmet Kaya', 'Zeynep Demir', 'Emre Yılmaz', 'Selin Çelik', 'Burak Şahin'],
    orgs: ['Aytek Holding', 'Mavikent Yayıncılık', 'Gökberk Nakliyat', 'Anka Sigorta'],
    locations: ['İzmir', 'Ankara', 'Bursa', 'Antalya', 'Eskişehir'],
    personCarriers: [
      '{P} sonuçları cuma günü sunacak.',
      'İlgili kişi: {P}.',
      'Taslağı dün {P} onayladı.',
    ],
    orgCarriers: ['Faturayı {O} düzenledi.', 'Yeni tedarikçimiz: {O}.'],
    locationCarriers: ['Yeni ofis adresi: {L}.', 'Teslimat şehri: {L}.'],
  },
  {
    code: 'sv',
    people: ['Astrid Lindqvist', 'Erik Sandberg', 'Maja Holmgren', 'Oskar Nyström', 'Elsa Bergström', 'Johan Åkesson'],
    orgs: ['Norrsken Logistik', 'Bokförlaget Lärkan', 'Fjällvind Teknik', 'Sjöfart Vinga'],
    locations: ['Göteborg', 'Uppsala', 'Malmö', 'Luleå', 'Örebro'],
    personCarriers: [
      '{P} presenterar kvartalssiffrorna på fredag.',
      'Skicka det signerade exemplaret till {P}.',
      '{P} godkände utkastet i går.',
    ],
    orgCarriers: ['{O} har accepterat det reviderade anbudet.', 'Fakturan från {O} kom i går.'],
    locationCarriers: ['Det nya kontoret i {L} öppnar i mars.', 'Frakt till {L} tar fyra dagar.'],
  },
  {
    code: 'da',
    people: ['Freja Mortensen', 'Mikkel Østergaard', 'Ida Kristensen', 'Anders Holm', 'Signe Poulsen', 'Rasmus Bruun'],
    orgs: ['Nordlys Logistik', 'Forlaget Havterne', 'Bølgekraft Teknik', 'Fjordsikring Forsikring'],
    locations: ['Aarhus', 'Odense', 'Aalborg', 'Esbjerg', 'Roskilde'],
    personCarriers: [
      '{P} fremlægger kvartalstallene på fredag.',
      'Send den underskrevne kopi til {P}.',
      '{P} godkendte udkastet i går.',
    ],
    orgCarriers: ['{O} har accepteret det reviderede tilbud.', 'Fakturaen fra {O} kom i går.'],
    locationCarriers: ['Det nye kontor i {L} åbner i marts.', 'Levering til {L} tager fire dage.'],
  },
  {
    code: 'fi',
    people: ['Aino Korhonen', 'Eero Virtanen', 'Helmi Mäkelä', 'Juhani Nieminen', 'Venla Laitinen', 'Onni Heikkinen'],
    orgs: ['Revontuli Logistiikka', 'Kustannus Kanerva', 'Konepaja Ilves', 'Vakuutus Kaisla'],
    locations: ['Tampere', 'Turku', 'Oulu', 'Jyväskylä', 'Rovaniemi'],
    personCarriers: [
      'Yhteyshenkilö: {P}.',
      'Tulokset esittelee perjantaina {P}.',
      'Luonnoksen hyväksyi eilen {P}.',
    ],
    orgCarriers: ['Laskun toimittaa {O}.', 'Uusi toimittajamme on {O}.'],
    locationCarriers: ['Uusi toimisto: {L}.', 'Toimituskaupunki: {L}.'],
  },
  {
    code: 'el',
    people: ['Ελένη Παπαδοπούλου', 'Νίκος Οικονόμου', 'Μαρία Καραγιάννη', 'Γιώργος Αντωνίου', 'Κατερίνα Βασιλείου', 'Δημήτρης Σταθόπουλος'],
    orgs: ['Εκδόσεις Μελτέμι', 'Μεταφορές Δίας', 'Όμιλος Νηρέας', 'Τεχνική Άτλας'],
    locations: ['Θεσσαλονίκη', 'Πάτρα', 'Ηράκλειο', 'Λάρισα', 'Βόλος'],
    personCarriers: [
      'Υπεύθυνος επικοινωνίας: {P}.',
      'Την παρουσίαση αναλαμβάνει: {P}.',
      'Τα έγγραφα υπογράφει: {P}.',
    ],
    orgCarriers: ['Το τιμολόγιο εκδίδει η εταιρεία {O}.', 'Νέος προμηθευτής: {O}.'],
    locationCarriers: ['Νέο γραφείο: {L}.', 'Πόλη παράδοσης: {L}.'],
  },
  {
    code: 'ru',
    people: ['Анна Соколова', 'Дмитрий Волков', 'Екатерина Морозова', 'Алексей Богданов', 'Ольга Виноградова', 'Сергей Ковалёв'],
    orgs: ['Группа Северлес', 'Издательство Парус', 'Меридиан Логистик', 'Завод Вымпел'],
    locations: ['Новосибирск', 'Казань', 'Екатеринбург', 'Самара', 'Владивосток'],
    personCarriers: [
      'Контактное лицо: {P}.',
      'Отчёт в пятницу представит {P}.',
      'Документы подписывает {P}.',
    ],
    orgCarriers: ['Счёт выставляет компания {O}.', 'Новый поставщик: {O}.'],
    locationCarriers: ['Новый офис: {L}.', 'Город доставки: {L}.'],
  },
  {
    code: 'uk',
    people: ['Оксана Шевченко', 'Тарас Бондаренко', 'Ірина Мельник', 'Андрій Ковальчук', 'Соломія Ткаченко', 'Богдан Кравченко'],
    orgs: ['Видавництво Соняшник', 'Логістика Вирій', 'Завод Стріла', 'Група Калина'],
    locations: ['Львів', 'Одеса', 'Харків', 'Дніпро', 'Чернівці'],
    personCarriers: [
      'Контактна особа: {P}.',
      'Звіт у п’ятницю представить {P}.',
      'Документи підписує {P}.',
    ],
    orgCarriers: ['Рахунок виставляє компанія {O}.', 'Новий постачальник: {O}.'],
    locationCarriers: ['Новий офіс: {L}.', 'Місто доставки: {L}.'],
  },
  {
    code: 'ar',
    people: ['ليلى الحسن', 'عمر الخطيب', 'فاطمة النجار', 'يوسف العلي', 'مريم السيد', 'خالد الرشيد'],
    orgs: ['مجموعة الأفق', 'دار النخيل للنشر', 'شركة الشروق للنقل', 'مصنع الأمل'],
    locations: ['الرياض', 'جدة', 'الدار البيضاء', 'عمّان', 'الإسكندرية'],
    personCarriers: [
      'مسؤول التواصل: {P}.',
      'سيقدم {P} النتائج يوم الجمعة.',
      'وقّع {P} على المسودة أمس.',
    ],
    orgCarriers: ['وافقت {O} على العرض المعدل.', 'وصلت فاتورة من {O} أمس.'],
    locationCarriers: ['المكتب الجديد: {L}.', 'مدينة التسليم: {L}.'],
  },
  {
    code: 'fa',
    people: ['سارا محمدی', 'رضا کریمی', 'مریم احمدی', 'حسین رضایی', 'نازنین موسوی', 'امیر جعفری'],
    orgs: ['گروه آفتاب', 'انتشارات سپهر', 'شرکت حمل و نقل آریا', 'کارخانه پولاد'],
    locations: ['اصفهان', 'شیراز', 'تبریز', 'مشهد', 'رشت'],
    personCarriers: [
      'مسئول پیگیری: {P}.',
      '{P} نتایج را جمعه ارائه می‌دهد.',
      '{P} پیش‌نویس را دیروز تأیید کرد.',
    ],
    orgCarriers: ['{O} پیشنهاد اصلاح‌شده را پذیرفت.', 'صورتحساب {O} دیروز رسید.'],
    locationCarriers: ['دفتر جدید: {L}.', 'شهر تحویل: {L}.'],
  },
  {
    code: 'he',
    people: ['נועה לוי', 'איתי כהן', 'שירה פרידמן', 'יונתן אברמוביץ', 'מיכל רוזן', 'דניאל שפירא'],
    orgs: ['קבוצת אופק', 'הוצאת דקל', 'חברת שחר להובלה', 'מפעלי אלון'],
    locations: ['חיפה', 'באר שבע', 'אשדוד', 'טבריה', 'נתניה'],
    personCarriers: [
      'איש הקשר: {P}.',
      'חתימת המסמכים: {P}.',
      'הצגת התוצאות ביום שישי: {P}.',
    ],
    orgCarriers: ['החשבונית הופקה על ידי {O}.', 'הספק החדש: {O}.'],
    locationCarriers: ['המשרד החדש: {L}.', 'עיר המשלוח: {L}.'],
  },
  {
    code: 'hi',
    people: ['प्रिया शर्मा', 'अर्जुन वर्मा', 'अनन्या गुप्ता', 'रोहन मेहता', 'काव्या अय्यर', 'विक्रम सिंह'],
    orgs: ['सूर्या समूह', 'प्रकाशन वटवृक्ष', 'गरुड़ परिवहन', 'शक्ति उद्योग'],
    locations: ['जयपुर', 'लखनऊ', 'पुणे', 'भोपाल', 'वाराणसी'],
    personCarriers: [
      'संपर्क व्यक्ति: {P}।',
      '{P} शुक्रवार को परिणाम प्रस्तुत करेंगे।',
      '{P} ने कल मसौदे को मंज़ूरी दी।',
    ],
    orgCarriers: ['{O} ने संशोधित प्रस्ताव स्वीकार किया।', '{O} का चालान कल प्राप्त हुआ।'],
    locationCarriers: ['नया कार्यालय: {L}।', 'डिलीवरी शहर: {L}।'],
  },
  {
    code: 'th',
    people: ['สมชาย วงศ์สวัสดิ์', 'มะลิ ศรีสุข', 'อานนท์ จันทร์เพ็ญ', 'กมลา พูนสุข', 'ประวิทย์ แสงทอง', 'ดารา บุญมี'],
    orgs: ['กลุ่มบริษัทรุ่งเรือง', 'สำนักพิมพ์ดอกบัว', 'ขนส่งไทยเจริญ', 'โรงงานช้างเผือก'],
    locations: ['เชียงใหม่', 'ขอนแก่น', 'ภูเก็ต', 'หาดใหญ่', 'นครราชสีมา'],
    personCarriers: [
      'ผู้ประสานงาน: {P}',
      '{P} จะนำเสนอผลประกอบการวันศุกร์',
      '{P} อนุมัติร่างเอกสารเมื่อวานนี้',
    ],
    orgCarriers: ['{O} ตอบรับข้อเสนอฉบับแก้ไขแล้ว', 'ใบแจ้งหนี้จาก {O} มาถึงเมื่อวาน'],
    locationCarriers: ['สำนักงานใหม่: {L}', 'เมืองปลายทาง: {L}'],
  },
  {
    code: 'ja',
    people: ['田中美咲', '佐藤健一', '鈴木陽子', '高橋大輔', '山本さくら', '中村隆'],
    orgs: ['青葉電機', '山風出版', 'みどり運送', '若葉精機'],
    locations: ['名古屋', '札幌', '福岡', '仙台', '広島'],
    personCarriers: [
      '担当者は{P}です。',
      '{P}が金曜日に結果を報告します。',
      '{P}が昨日、草案を承認しました。',
    ],
    orgCarriers: ['{O}が修正案を承認しました。', '{O}からの請求書が昨日届きました。'],
    locationCarriers: ['新しいオフィスは{L}にあります。', '配送先は{L}です。'],
  },
  {
    code: 'ko',
    people: ['김서연', '이준호', '박지민', '최수빈', '정하늘', '강민재'],
    orgs: ['한빛물류', '푸른숲출판사', '새벽전자', '하늘운송'],
    locations: ['부산', '대구', '인천', '광주', '대전'],
    personCarriers: [
      '담당자는 {P}입니다.',
      '{P} 팀장이 금요일에 결과를 발표합니다.',
      '초안은 어제 {P} 팀장이 승인했습니다.',
    ],
    orgCarriers: ['{O}에서 수정 제안을 승인했습니다.', '{O}의 청구서가 어제 도착했습니다.'],
    locationCarriers: ['새 사무실은 {L}에 있습니다.', '배송 도시는 {L}입니다.'],
  },
  {
    code: 'zh',
    people: ['王小明', '李静', '张伟华', '陈美玲', '刘志强', '杨丽娜'],
    orgs: ['明远科技', '青山出版社', '华信物流', '长风机械'],
    locations: ['上海', '成都', '杭州', '西安', '深圳'],
    personCarriers: [
      '联系人:{P}。',
      '{P}将于周五汇报季度结果。',
      '{P}昨天批准了草案。',
    ],
    orgCarriers: ['{O}已接受修订后的报价。', '{O}的发票昨天已送达。'],
    locationCarriers: ['新办公室位于{L}。', '交货城市:{L}。'],
  },
];

const BY_CODE = new Map(NER_BANKS.map((b) => [b.code, b]));

export function nerBankFor(code: string): NerBank | undefined {
  return BY_CODE.get(code);
}
