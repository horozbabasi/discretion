/**
 * Arabic. Machine-translated; needs native review before release (D53).
 *
 * This is the locale the plural design exists for. Arabic has all SIX CLDR
 * categories and uses every one of them:
 *
 *   zero  0            لا عناصر
 *   one   1            عنصر واحد
 *   two   2            عنصران          ← a dual form, not a plural
 *   few   3-10         ٣ عناصر
 *   many  11-99        ١١ عنصرًا        ← singular noun, accusative
 *   other 100, 101 …   ١٠٠ عنصر
 *
 * The `one` and `two` forms deliberately omit `$1`: Arabic carries the count in
 * the noun itself, and "1 عنصر واحد" reads as a mistake. `plural()` substitutes
 * only what a form asks for, so dropping the placeholder is safe.
 *
 * The UI also mirrors for this locale - see `isRtl()`, and the `direction`
 * declaration in `ui/styles.ts`.
 */

import type { Catalogue, EntityLabels } from '../catalogue.js';

export const AR: Catalogue = {
  appName: 'PrivacyShield',
  appDescription:
    'يكتشف المعلومات الحساسة في النص ويخفيها قبل وصولها إلى واجهات الدردشة بالذكاء الاصطناعي. يعمل بالكامل على جهازك.',

  'panel.review.aria': 'PrivacyShield: راجع ما سيتم إخفاؤه قبل الإرسال',
  'panel.review.title': {
    zero: 'لا عناصر لإخفائها',
    one: 'عنصر واحد لإخفائه',
    two: 'عنصران لإخفاؤهما',
    few: '$1 عناصر لإخفائها',
    many: '$1 عنصرًا لإخفائه',
    other: '$1 عنصر لإخفائه',
  },
  'panel.exposure': 'درجة الانكشاف $1/100',
  'panel.action.cancel': 'إلغاء',
  'panel.action.maskAndSend': 'إخفاء وإرسال',
  'panel.action.protectAndSend': 'حماية وإرسال',
  'panel.item.keepOriginal': 'إبقاء الأصل',
  'panel.item.maskThis': 'إخفاء هذا',
  'panel.item.aria': '$1: $2، العنصر $3 من $4',

  'panel.unwitnessed.title': 'تأكد من أن هذه رسالتك',
  'panel.unwitnessed.body':
    'كان هذا النص موجودًا في الحقل من قبل — لم يرَ PrivacyShield أنك كتبته. هذا طبيعي في مسودة محفوظة، أو رابط يملأ الحقل نيابةً عنك، أو اقتراح جاهز.',

  'panel.findings.aria': {
    zero: 'PrivacyShield: لم يُرصد أي عنصر حساس في هذه الرسالة',
    one: 'PrivacyShield: رُصد عنصر حساس واحد في هذه الرسالة',
    two: 'PrivacyShield: رُصد عنصران حساسان في هذه الرسالة',
    few: 'PrivacyShield: رُصدت $1 عناصر حساسة في هذه الرسالة',
    many: 'PrivacyShield: رُصد $1 عنصرًا حساسًا في هذه الرسالة',
    other: 'PrivacyShield: رُصد $1 عنصر حساس في هذه الرسالة',
  },
  'panel.findings.title': {
    zero: 'لا عناصر مرصودة',
    one: 'عنصر واحد مرصود',
    two: 'عنصران مرصودان',
    few: '$1 عناصر مرصودة',
    many: '$1 عنصرًا مرصودًا',
    other: '$1 عنصر مرصود',
  },
  'panel.findings.note': 'عند الإرسال ستُستبدل، وسيُطلب منك التأكيد أولًا.',

  'panel.paste.title': '$1 فيما لصقته للتو',
  'panel.paste.body': 'ستُخفى عند الإرسال، ويمكنك إخفاؤها الآن بدلًا من ذلك.',
  'panel.paste.none': 'لم يُعثر على أي شيء حساس فيه.',
  'panel.paste.dismiss': 'إغلاق',
  'panel.paste.maskNow': 'إخفاء الآن',
  'panel.paste.countOfType': {
    zero: 'لا $2',
    one: '$2 واحد',
    two: '$2 اثنان',
    few: '$1 $2',
    many: '$1 $2',
    other: '$1 $2',
  },

  'panel.degraded.pageTitle': 'PrivacyShield لا يحمي هذه الصفحة',
  'panel.degraded.sendTitle': 'لم يُرسل PrivacyShield هذه الرسالة',
  'panel.degraded.couldNotFind': 'تعذّر العثور على: $1.',
  'panel.degraded.noReason': 'أبلغت الإضافة عن مشكلة دون أن تحدد ما هي.',

  // Layout direction, not a translation. See catalogue.ts.
  'ui.dir': 'rtl',
  'popup.title': 'PrivacyShield',
  'popup.tab.status': 'الحالة',
  'popup.tab.quickRedact': 'إخفاء سريع',
  'popup.tab.insights': 'إحصاءات',
  'popup.status.protected': 'يجري حماية هذه الصفحة',
  'popup.status.unprotected': 'هذه الصفحة غير محمية',
  'popup.status.unsupported': 'PrivacyShield لا يعمل على هذا الموقع',
  'popup.status.sessionCounts': 'ما أُخفي في هذه الجلسة',
  'popup.status.sessionExposure': 'انكشاف الجلسة',
  'popup.status.profile': 'مستوى الحساسية',
  'popup.profile.minimal': 'الحد الأدنى',
  'popup.profile.balanced': 'متوازن',
  'popup.profile.strict': 'صارم',
  'popup.status.enabledHere': 'مُفعّل على هذا الموقع',

  'quick.heading': 'إخفاء نص لأي مكان',
  'quick.explain':
    'الصق نصًا من أي تطبيق. النسخة المُخفاة آمنة للإرسال. الصق الرد هنا لاستعادة القيم الحقيقية.',
  'quick.input.aria': 'النص المراد إخفاؤه',
  'quick.output.aria': 'النص المُخفى',
  'quick.action.mask': 'إخفاء',
  'quick.action.restore': 'استعادة',
  'quick.action.copy': 'نسخ',
  'quick.copied': 'تم النسخ',
  'quick.empty': 'لا يوجد ما يُخفى بعد.',
  'quick.found': {
    zero: 'لم يُخفَ أي عنصر',
    one: 'أُخفي عنصر واحد',
    two: 'أُخفي عنصران',
    few: 'أُخفيت $1 عناصر',
    many: 'أُخفي $1 عنصرًا',
    other: 'أُخفي $1 عنصر',
  },
  'quick.memoryOnly':
    'الربط بين نصك والقيم البديلة يُحفظ في الذاكرة فقط، ويُمحى عند إغلاق هذه النافذة.',

  'insights.heading': 'ما الذي حميته',
  'insights.explain': 'أعداد فقط. لا يُخزَّن أي نص ولا أي قيمة إطلاقًا.',
  'insights.empty': 'لم يُخفَ أي شيء بعد.',
  'insights.thisMonth': 'هذا الشهر',
  'insights.allTime': 'الإجمالي',
  'insights.reset': 'تصفير الأعداد',
  'insights.resetConfirm': 'تصفير جميع الأعداد؟ لا يمكن التراجع عن ذلك.',

  'popup.status.session': 'هذه الجلسة',
  'popup.status.nothingYet': 'لم يُخفَ أي شيء في هذه الصفحة بعد.',
  'popup.status.peak': 'الأعلى',
  'popup.status.mean': 'المعتاد',
  'popup.status.toggleAria': 'حماية هذا الموقع',
  'popup.profile.hint': 'الوضع الصارم يرصد أكثر ويسألك أكثر.',
  'popup.health.ok': 'تتم قراءة هذه الصفحة بشكل صحيح',
  'popup.health.degraded': 'تعذّرت قراءة هذه الصفحة',
  'popup.health.degradedWhy': 'الإرسال محظور إلى أن يُتعرَّف على التخطيط مجددًا.',
  'quick.unavailable': 'الإخفاء غير متاح الآن، لذا لم يتغير شيء.',
  'quick.placeholder': 'الصق أي شيء هنا',
  'family.contact': 'بيانات تواصل',
  'family.financial': 'بيانات مالية',
  'family.identity': 'هوية',
  'family.document': 'وثائق',
  'family.health': 'صحة',
  'family.secret': 'أسرار',
  'family.network': 'شبكة',
  'family.location': 'موقع',
  'family.person': 'أسماء',
  'family.other': 'أخرى',

  'options.title': 'إعدادات PrivacyShield',
  'options.section.detection': 'ما الذي يُرصد',
  'options.section.substitution': 'أسلوب الاستبدال',
  'options.section.lists': 'دائمًا وأبدًا',
  'options.mode.surrogate': 'بدائل واقعية',
  'options.mode.token': 'تسميات مثل [EMAIL_1]',
  'options.allowlist': 'لا تُخفِ هذه أبدًا',
  'options.denylist': 'أخفِ هذه دائمًا',
  'options.intro': 'كل ما هنا يُحفظ على هذا الجهاز فقط.',
  'options.section.types': 'الأنواع المراد رصدها',
  'options.types.hint': 'يُرصد كل شيء ما لم توقفه من هنا.',
  'options.section.rules': 'أنماطك الخاصة',
  'options.section.region': 'أرقام الهاتف',
  'options.section.data': 'ملف إعداداتك',
  'options.section.about': 'ما الذي يحميه هذا وما الذي لا يحميه',
  'options.lists.hint': 'إدخال واحد في كل سطر. تُحفظ على هذا الجهاز كما تكتبها.',
  'options.rules.name': 'الاسم',
  'options.rules.pattern': 'النمط',
  'options.rules.add': 'إضافة نمط',
  'options.rules.matches': { zero: 'لا تطابق', one: 'تطابق واحد', two: 'تطابقان', few: '$1 تطابقات', many: '$1 تطابقًا', other: '$1 تطابق' },
  'options.rules.remove': 'إزالة',
  'options.rules.empty': 'لا توجد أنماط خاصة بك بعد.',
  'options.rules.invalid': 'ليس نمطًا صالحًا.',
  'options.rules.tryIt': 'جرّبه على نص',
  'options.rules.notStored': 'صندوق التجربة هذا لا يُحفظ في أي مكان.',
  'options.region.hint': 'يُستخدم للأرقام المكتوبة دون رمز الدولة.',
  'options.export': 'الحفظ في ملف',
  'options.import': 'التحميل من ملف',
  'options.imported': 'تم تحميل الإعدادات.',
  'options.importFailed': 'تعذّرت قراءة هذا الملف كإعدادات.',
  'options.exportWarn': 'يتضمن الملف قائمتيك بنص صريح.',
  'options.about.does': 'يفحص ما تكتبه أو تلصقه في ChatGPT وClaude وGemini، ويستبدل القيم الحساسة قبل إرسال الرسالة. وإذا تعذّر عليه الفحص، فإنه يوقف الرسالة بدلًا من تمريرها.',
  'options.about.notFiles': 'لا يحمي الملفات أو الصور أو لقطات الشاشة التي ترفقها.',
  'options.about.notElsewhere': 'لا يحمي ما ترسله من تطبيق آخر، إلا إذا أخفيته أولًا عبر الإخفاء السريع.',
  'options.about.notPerfect': 'سيفوته بعض الأشياء وسيشير إلى أشياء غير ضارة. اقرأ لوحة المراجعة قبل الإرسال.',
  'options.about.notTyping': 'يمكن للموقع رؤية ما في الحقل أثناء كتابتك. لا يُخفى إلا ما تُرسله.',
  'options.saved': 'تم الحفظ',
};

export const AR_ENTITIES: EntityLabels = {
  EMAIL: 'بريد إلكتروني',
  PHONE: 'رقم هاتف',
  IP_ADDRESS: 'عنوان IP',
  MAC_ADDRESS: 'عنوان MAC',
  URL_WITH_CREDENTIALS: 'رابط يحتوي بيانات دخول',
  CREDIT_CARD: 'بطاقة ائتمان',
  SWIFT_BIC: 'SWIFT/BIC',
  US_ROUTING_NUMBER: 'رقم التوجيه المصرفي (الولايات المتحدة)',
  UK_SORT_CODE: 'رمز الفرع المصرفي (المملكة المتحدة)',
  CA_TRANSIT_NUMBER: 'رقم العبور المصرفي (كندا)',
  BR_AGENCIA: 'فرع مصرفي (البرازيل)',
  CRYPTO_WALLET: 'محفظة عملات رقمية',
  NATIONAL_ID: 'رقم هوية',
  TAX_ID: 'رقم ضريبي',
  VAT_NUMBER: 'رقم ضريبة القيمة المضافة',
  PASSPORT_MRZ: 'جواز سفر (منطقة MRZ)',
  DRIVERS_LICENSE: 'رخصة قيادة',
  HEALTH_DATA: 'بيانات صحية',
  API_KEY: 'مفتاح API',
  PRIVATE_KEY: 'مفتاح خاص',
  GENERIC_SECRET: 'قيمة سرية',
  CONNECTION_STRING: 'سلسلة اتصال',
  POSTAL_CODE: 'رمز بريدي',
  STREET_ADDRESS: 'عنوان',
  COORDINATES: 'إحداثيات',
  PERSON: 'شخص',
  ORG: 'مؤسسة',
  LOCATION: 'مكان',
  DATE_OF_BIRTH: 'تاريخ الميلاد',
};
