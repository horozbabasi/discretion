/** Hindi. Machine-translated; needs native review before release (D53). */

import type { Catalogue, EntityLabels } from '../catalogue.js';

export const HI: Catalogue = {
  appName: 'PrivacyShield',
  appDescription:
    'टेक्स्ट में मौजूद संवेदनशील जानकारी को AI चैट तक पहुँचने से पहले पहचानता और छिपाता है। पूरी तरह आपके डिवाइस पर चलता है।',

  'panel.review.aria': 'PrivacyShield: भेजने से पहले देखें कि क्या छिपाया जाएगा',
  'panel.review.title': { one: '$1 चीज़ छिपाई जाएगी', other: '$1 चीज़ें छिपाई जाएँगी' },
  'panel.exposure': 'जोखिम $1/100',
  'panel.action.cancel': 'रद्द करें',
  'panel.action.maskAndSend': 'छिपाकर भेजें',
  'panel.action.protectAndSend': 'सुरक्षित करके भेजें',
  'panel.item.keepOriginal': 'मूल रहने दें',
  'panel.item.maskThis': 'इसे छिपाएँ',
  'panel.item.aria': '$1: $2, $4 में से $3',

  'panel.unwitnessed.title': 'देख लें कि यह संदेश आपका ही है',
  'panel.unwitnessed.body':
    'यह टेक्स्ट पहले से ही बॉक्स में था — PrivacyShield ने आपको इसे टाइप करते नहीं देखा। सहेजे गए ड्राफ़्ट, बॉक्स भरने वाले लिंक या सुझाए गए प्रॉम्प्ट में यह सामान्य है।',

  'panel.findings.aria': {
    one: 'PrivacyShield: इस संदेश में $1 संवेदनशील चीज़ मिली',
    other: 'PrivacyShield: इस संदेश में $1 संवेदनशील चीज़ें मिलीं',
  },
  'panel.findings.title': { one: '$1 चीज़ मिली', other: '$1 चीज़ें मिलीं' },
  'panel.findings.note':
    'भेजते समय इन्हें बदल दिया जाएगा और पहले आपसे पुष्टि ली जाएगी।',

  'panel.paste.title': 'आपने अभी जो चिपकाया उसमें $1',
  'panel.paste.body': 'भेजते समय ये छिप जाएँगी। चाहें तो अभी भी छिपा सकते हैं।',
  'panel.paste.none': 'इसमें कुछ भी संवेदनशील नहीं मिला।',
  'panel.paste.dismiss': 'बंद करें',
  'panel.paste.maskNow': 'अभी छिपाएँ',
  'panel.paste.countOfType': { one: '$1 $2', other: '$1 $2' },

  'panel.degraded.pageTitle': 'PrivacyShield इस पेज की सुरक्षा नहीं कर रहा',
  'panel.degraded.sendTitle': 'PrivacyShield ने यह संदेश नहीं भेजा',
  'panel.degraded.couldNotFind': 'नहीं मिला: $1।',
  'panel.degraded.noReason':
    'एक्सटेंशन ने समस्या बताई, पर यह नहीं बताया कि समस्या क्या है।',

  'popup.title': 'PrivacyShield',
  'popup.tab.status': 'स्थिति',
  'popup.tab.quickRedact': 'तुरंत छिपाएँ',
  'popup.tab.insights': 'आँकड़े',
  'popup.status.protected': 'यह पेज सुरक्षित है',
  'popup.status.unprotected': 'यह पेज सुरक्षित नहीं है',
  'popup.status.unsupported': 'PrivacyShield इस साइट पर काम नहीं करता',
  'popup.status.sessionCounts': 'इस सत्र में छिपाया गया',
  'popup.status.sessionExposure': 'इस सत्र का जोखिम',
  'popup.status.profile': 'संवेदनशीलता',
  'popup.profile.minimal': 'कम से कम',
  'popup.profile.balanced': 'संतुलित',
  'popup.profile.strict': 'सख़्त',
  'popup.status.enabledHere': 'इस साइट पर चालू',

  'quick.heading': 'कहीं भी भेजने के लिए टेक्स्ट छिपाएँ',
  'quick.explain':
    'किसी भी ऐप से टेक्स्ट चिपकाएँ। छिपाया गया रूप भेजना सुरक्षित है। असली मान वापस पाने के लिए जवाब यहाँ चिपकाएँ।',
  'quick.input.aria': 'छिपाने के लिए टेक्स्ट',
  'quick.output.aria': 'छिपाया गया टेक्स्ट',
  'quick.action.mask': 'छिपाएँ',
  'quick.action.restore': 'वापस लाएँ',
  'quick.action.copy': 'कॉपी करें',
  'quick.copied': 'कॉपी हो गया',
  'quick.empty': 'अभी छिपाने के लिए कुछ नहीं है।',
  'quick.found': { one: '$1 चीज़ छिपाई गई', other: '$1 चीज़ें छिपाई गईं' },
  'quick.memoryOnly':
    'आपके टेक्स्ट और उसके बदले मानों का मिलान सिर्फ़ मेमोरी में रहता है और यह विंडो बंद होते ही मिट जाता है।',

  'insights.heading': 'आपने क्या सुरक्षित किया',
  'insights.explain': 'सिर्फ़ गिनती। कोई टेक्स्ट या मान कभी संग्रहित नहीं होता।',
  'insights.empty': 'अभी तक कुछ नहीं छिपाया गया।',
  'insights.thisMonth': 'इस महीने',
  'insights.allTime': 'कुल',
  'insights.reset': 'गिनती रीसेट करें',
  'insights.resetConfirm': 'सारी गिनती रीसेट करें? यह वापस नहीं होगा।',

  'options.title': 'PrivacyShield सेटिंग्स',
  'options.section.detection': 'क्या पहचानना है',
  'options.section.substitution': 'बदलने का तरीक़ा',
  'options.section.lists': 'हमेशा और कभी नहीं',
  'options.mode.surrogate': 'असली जैसे बदले हुए मान',
  'options.mode.token': '[EMAIL_1] जैसे लेबल',
  'options.allowlist': 'इन्हें कभी न छिपाएँ',
  'options.denylist': 'इन्हें हमेशा छिपाएँ',
  'options.save': 'सहेजें',
  'options.saved': 'सहेजा गया',
};

export const HI_ENTITIES: EntityLabels = {
  EMAIL: 'ईमेल पता',
  PHONE: 'फ़ोन नंबर',
  IP_ADDRESS: 'IP पता',
  MAC_ADDRESS: 'MAC पता',
  URL_WITH_CREDENTIALS: 'लॉगिन वाली URL',
  CREDIT_CARD: 'क्रेडिट कार्ड',
  SWIFT_BIC: 'SWIFT/BIC',
  US_ROUTING_NUMBER: 'रूटिंग नंबर (अमेरिका)',
  UK_SORT_CODE: 'सॉर्ट कोड (यूके)',
  CA_TRANSIT_NUMBER: 'ट्रांज़िट नंबर (कनाडा)',
  BR_AGENCIA: 'बैंक शाखा (ब्राज़ील)',
  CRYPTO_WALLET: 'क्रिप्टो वॉलेट',
  NATIONAL_ID: 'पहचान पत्र संख्या',
  TAX_ID: 'कर संख्या',
  VAT_NUMBER: 'वैट संख्या',
  PASSPORT_MRZ: 'पासपोर्ट (MRZ)',
  DRIVERS_LICENSE: 'ड्राइविंग लाइसेंस',
  HEALTH_DATA: 'स्वास्थ्य जानकारी',
  API_KEY: 'API कुंजी',
  PRIVATE_KEY: 'निजी कुंजी',
  GENERIC_SECRET: 'गोपनीय मान',
  CONNECTION_STRING: 'कनेक्शन स्ट्रिंग',
  POSTAL_CODE: 'पिन कोड',
  STREET_ADDRESS: 'पता',
  COORDINATES: 'निर्देशांक',
  PERSON: 'व्यक्ति',
  ORG: 'संस्था',
  LOCATION: 'स्थान',
  DATE_OF_BIRTH: 'जन्म तिथि',
};
