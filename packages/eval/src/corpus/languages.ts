/**
 * Per-language phrase banks.
 *
 * 25 languages across every script Stage 0 distinguishes (Latin with
 * diacritics, Cyrillic, Greek, Arabic, Hebrew, Devanagari, Thai, Han, Kana,
 * Hangul). Each bank holds short carrier templates with an {E} slot where an
 * entity is planted, plus filler sentences with no entity at all. The
 * carriers are deliberately mundane — invoices, support requests, HR notes —
 * because that is the text this product actually sees.
 */

export interface LanguageBank {
  readonly code: string;
  readonly name: string;
  readonly script: string;
  /** Sentence templates containing exactly one {E} slot. */
  readonly carriers: readonly string[];
  /** Entity-free filler sentences. */
  readonly fillers: readonly string[];
  /** Email greeting / sign-off pair. */
  readonly greeting: string;
  readonly signoff: string;
}

export const LANGUAGES: readonly LanguageBank[] = [
  {
    code: 'en', name: 'English', script: 'latin',
    carriers: [
      'Please send the paperwork to {E} before Friday.',
      'The payment referencing {E} has been received.',
      'Her file lists {E} as the identifier on record.',
      'You can reach the office via {E} during business hours.',
      'The transfer to {E} completed this morning.',
    ],
    fillers: [
      'The quarterly review meeting was moved to Thursday.',
      'Thanks again for the quick turnaround on this.',
      'The updated draft is attached for your records.',
    ],
    greeting: 'Hi team,', signoff: 'Best regards,',
  },
  {
    code: 'de', name: 'German', script: 'latin',
    carriers: [
      'Bitte überweisen Sie den Betrag an {E} bis Monatsende.',
      'Die Unterlagen mit der Nummer {E} liegen im Ordner.',
      'Der Mitarbeiter hat {E} als Kennung angegeben.',
      'Sie erreichen die Abteilung unter {E} während der Bürozeiten.',
    ],
    fillers: [
      'Die Besprechung wurde auf Donnerstag verschoben.',
      'Der Vertrag liegt zur Unterschrift bereit.',
      'Vielen Dank für die schnelle Rückmeldung.',
    ],
    greeting: 'Hallo zusammen,', signoff: 'Mit freundlichen Grüßen,',
  },
  {
    code: 'fr', name: 'French', script: 'latin',
    carriers: [
      'Veuillez envoyer le dossier à {E} avant vendredi.',
      'Le virement référencé {E} a bien été reçu.',
      'Son dossier indique {E} comme identifiant.',
      'Vous pouvez joindre le service via {E} en journée.',
    ],
    fillers: [
      'La réunion a été déplacée à jeudi.',
      'Le contrat est prêt pour signature.',
      'Merci pour votre retour rapide.',
    ],
    greeting: 'Bonjour à tous,', signoff: 'Cordialement,',
  },
  {
    code: 'es', name: 'Spanish', script: 'latin',
    carriers: [
      'Por favor envíe la documentación a {E} antes del viernes.',
      'El pago con referencia {E} fue recibido.',
      'Su expediente registra {E} como identificador.',
      'Puede contactar la oficina en {E} en horario laboral.',
    ],
    fillers: [
      'La reunión se movió al jueves.',
      'El contrato está listo para firmar.',
      'Gracias por la respuesta rápida.',
    ],
    greeting: 'Hola a todos,', signoff: 'Saludos cordiales,',
  },
  {
    code: 'it', name: 'Italian', script: 'latin',
    carriers: [
      'Si prega di inviare i documenti a {E} entro venerdì.',
      'Il pagamento con riferimento {E} è stato ricevuto.',
      'La pratica riporta {E} come identificativo.',
    ],
    fillers: ['La riunione è stata spostata a giovedì.', 'Grazie per la rapida risposta.'],
    greeting: 'Ciao a tutti,', signoff: 'Cordiali saluti,',
  },
  {
    code: 'pt', name: 'Portuguese', script: 'latin',
    carriers: [
      'Por favor envie os documentos para {E} até sexta-feira.',
      'O pagamento com referência {E} foi recebido.',
      'O cadastro indica {E} como identificador.',
    ],
    fillers: ['A reunião foi transferida para quinta-feira.', 'Obrigado pela resposta rápida.'],
    greeting: 'Olá a todos,', signoff: 'Atenciosamente,',
  },
  {
    code: 'nl', name: 'Dutch', script: 'latin',
    carriers: [
      'Stuur de stukken vóór vrijdag naar {E}.',
      'De betaling met kenmerk {E} is ontvangen.',
      'Het dossier vermeldt {E} als identificatie.',
    ],
    fillers: ['De vergadering is verplaatst naar donderdag.', 'Dank voor de snelle reactie.'],
    greeting: 'Hallo allemaal,', signoff: 'Met vriendelijke groet,',
  },
  {
    code: 'pl', name: 'Polish', script: 'latin',
    carriers: [
      'Proszę przesłać dokumenty na {E} do piątku.',
      'Płatność z numerem {E} została zaksięgowana.',
      'W aktach widnieje {E} jako identyfikator.',
    ],
    fillers: ['Spotkanie przeniesiono na czwartek.', 'Dziękuję za szybką odpowiedź.'],
    greeting: 'Witam wszystkich,', signoff: 'Z poważaniem,',
  },
  {
    code: 'cs', name: 'Czech', script: 'latin',
    carriers: [
      'Zašlete prosím podklady na {E} do pátku.',
      'Platba s referencí {E} byla přijata.',
      'Ve spisu je uvedeno {E} jako identifikátor.',
    ],
    fillers: ['Schůzka byla přesunuta na čtvrtek.', 'Děkuji za rychlou odpověď.'],
    greeting: 'Dobrý den,', signoff: 'S pozdravem,',
  },
  {
    code: 'ro', name: 'Romanian', script: 'latin',
    carriers: [
      'Vă rugăm să trimiteți actele la {E} până vineri.',
      'Plata cu referința {E} a fost înregistrată.',
      'Dosarul menționează {E} ca identificator.',
    ],
    fillers: ['Ședința a fost mutată joi.', 'Mulțumim pentru răspunsul rapid.'],
    greeting: 'Bună ziua,', signoff: 'Cu stimă,',
  },
  {
    code: 'tr', name: 'Turkish', script: 'latin',
    carriers: [
      'Lütfen evrakları cuma gününe kadar {E} adresine gönderin.',
      '{E} referanslı ödeme hesabımıza geçti.',
      'Dosyada kimlik olarak {E} kayıtlı.',
      'Mesai saatlerinde {E} üzerinden ulaşabilirsiniz.',
    ],
    fillers: ['Toplantı perşembeye alındı.', 'Hızlı dönüş için teşekkürler.'],
    greeting: 'Merhaba,', signoff: 'Saygılarımla,',
  },
  {
    code: 'sv', name: 'Swedish', script: 'latin',
    carriers: [
      'Skicka handlingarna till {E} före fredag.',
      'Betalningen med referens {E} har mottagits.',
      'Akten anger {E} som identifierare.',
    ],
    fillers: ['Mötet flyttades till torsdag.', 'Tack för det snabba svaret.'],
    greeting: 'Hej alla,', signoff: 'Med vänliga hälsningar,',
  },
  {
    code: 'da', name: 'Danish', script: 'latin',
    carriers: [
      'Send venligst papirerne til {E} inden fredag.',
      'Betalingen med reference {E} er modtaget.',
      'Sagen angiver {E} som identifikation.',
    ],
    fillers: ['Mødet er flyttet til torsdag.', 'Tak for det hurtige svar.'],
    greeting: 'Hej alle,', signoff: 'Venlig hilsen,',
  },
  {
    code: 'fi', name: 'Finnish', script: 'latin',
    carriers: [
      'Lähetä asiakirjat osoitteeseen {E} perjantaihin mennessä.',
      'Maksu viitteellä {E} on vastaanotettu.',
      'Asiakirjoissa tunnisteena on {E}.',
    ],
    fillers: ['Kokous siirrettiin torstaihin.', 'Kiitos nopeasta vastauksesta.'],
    greeting: 'Hei kaikki,', signoff: 'Ystävällisin terveisin,',
  },
  {
    code: 'el', name: 'Greek', script: 'greek',
    carriers: [
      'Παρακαλώ στείλτε τα έγγραφα στο {E} μέχρι την Παρασκευή.',
      'Η πληρωμή με στοιχείο {E} καταχωρήθηκε.',
      'Ο φάκελος αναφέρει το {E} ως αναγνωριστικό.',
    ],
    fillers: ['Η συνάντηση μεταφέρθηκε για την Πέμπτη.', 'Ευχαριστούμε για την άμεση απάντηση.'],
    greeting: 'Γεια σας,', signoff: 'Με εκτίμηση,',
  },
  {
    code: 'ru', name: 'Russian', script: 'cyrillic',
    carriers: [
      'Пожалуйста, отправьте документы на {E} до пятницы.',
      'Платёж с реквизитом {E} поступил на счёт.',
      'В деле указан {E} как идентификатор.',
      'Связаться с отделом можно через {E} в рабочее время.',
    ],
    fillers: ['Совещание перенесено на четверг.', 'Спасибо за быстрый ответ.'],
    greeting: 'Здравствуйте,', signoff: 'С уважением,',
  },
  {
    code: 'uk', name: 'Ukrainian', script: 'cyrillic',
    carriers: [
      'Будь ласка, надішліть документи на {E} до п’ятниці.',
      'Платіж із реквізитом {E} зараховано.',
      'У справі вказано {E} як ідентифікатор.',
    ],
    fillers: ['Нараду перенесено на четвер.', 'Дякуємо за швидку відповідь.'],
    greeting: 'Доброго дня,', signoff: 'З повагою,',
  },
  {
    code: 'ar', name: 'Arabic', script: 'arabic',
    carriers: [
      'يرجى إرسال المستندات إلى {E} قبل يوم الجمعة.',
      'تم استلام الدفعة بالمرجع {E} هذا الصباح.',
      'يذكر الملف {E} كمعرّف مسجل.',
    ],
    fillers: ['تم نقل الاجتماع إلى يوم الخميس.', 'شكراً على الرد السريع.'],
    greeting: 'مرحباً بالجميع،', signoff: 'مع أطيب التحيات،',
  },
  {
    code: 'fa', name: 'Persian', script: 'arabic',
    carriers: [
      'لطفاً مدارک را تا جمعه به {E} ارسال کنید.',
      'پرداخت با شناسه {E} دریافت شد.',
      'در پرونده {E} به عنوان شناسه ثبت شده است.',
    ],
    fillers: ['جلسه به پنجشنبه موکول شد.', 'از پاسخ سریع شما متشکریم.'],
    greeting: 'با سلام،', signoff: 'با احترام،',
  },
  {
    code: 'he', name: 'Hebrew', script: 'hebrew',
    carriers: [
      'נא לשלוח את המסמכים אל {E} עד יום שישי.',
      'התשלום עם האסמכתא {E} התקבל.',
      'בתיק רשום {E} כמזהה.',
    ],
    fillers: ['הפגישה הועברה ליום חמישי.', 'תודה על המענה המהיר.'],
    greeting: 'שלום לכולם,', signoff: 'בברכה,',
  },
  {
    code: 'hi', name: 'Hindi', script: 'devanagari',
    carriers: [
      'कृपया दस्तावेज़ शुक्रवार तक {E} पर भेजें।',
      'संदर्भ {E} वाला भुगतान प्राप्त हो गया है।',
      'फ़ाइल में पहचान के रूप में {E} दर्ज है।',
    ],
    fillers: ['बैठक गुरुवार तक स्थगित कर दी गई है।', 'शीघ्र उत्तर के लिए धन्यवाद।'],
    greeting: 'नमस्ते,', signoff: 'सादर,',
  },
  {
    code: 'th', name: 'Thai', script: 'thai',
    carriers: [
      'กรุณาส่งเอกสารไปที่ {E} ภายในวันศุกร์',
      'ได้รับการชำระเงินอ้างอิง {E} แล้ว',
      'แฟ้มระบุ {E} เป็นรหัสประจำตัว',
    ],
    fillers: ['เลื่อนการประชุมเป็นวันพฤหัสบดี', 'ขอบคุณสำหรับการตอบกลับอย่างรวดเร็ว'],
    greeting: 'สวัสดีทุกท่าน', signoff: 'ขอแสดงความนับถือ',
  },
  {
    code: 'ja', name: 'Japanese', script: 'kana',
    carriers: [
      '書類は金曜日までに {E} へお送りください。',
      '整理番号 {E} の入金を確認しました。',
      'ファイルには識別子として {E} が記載されています。',
    ],
    fillers: ['会議は木曜日に変更になりました。', '迅速なご返信ありがとうございます。'],
    greeting: 'お疲れさまです。', signoff: 'よろしくお願いいたします。',
  },
  {
    code: 'ko', name: 'Korean', script: 'hangul',
    carriers: [
      '서류는 금요일까지 {E} 로 보내 주세요.',
      '참조번호 {E} 입금이 확인되었습니다.',
      '파일에는 식별자로 {E} 가 기재되어 있습니다.',
    ],
    fillers: ['회의가 목요일로 변경되었습니다.', '빠른 회신 감사합니다.'],
    greeting: '안녕하세요,', signoff: '감사합니다,',
  },
  {
    code: 'zh', name: 'Chinese', script: 'han',
    carriers: [
      '请在周五之前把材料发送到 {E}。',
      '参考号为 {E} 的付款已经到账。',
      '档案中登记的识别号是 {E}。',
    ],
    fillers: ['会议改到了周四。', '感谢您的快速回复。'],
    greeting: '大家好：', signoff: '此致，',
  },
];

export const LANGUAGE_CODES: readonly string[] = LANGUAGES.map((l) => l.code);
