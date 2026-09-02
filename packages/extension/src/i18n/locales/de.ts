/** German. Machine-translated; needs native review before release (D53). */

import type { Catalogue, EntityLabels } from '../catalogue.js';

export const DE: Catalogue = {
  appName: 'PrivacyShield',
  appDescription:
    'Erkennt und maskiert sensible Informationen in Texten, bevor sie KI-Chats erreichen. Läuft vollständig auf Ihrem Gerät.',

  'panel.review.aria': 'PrivacyShield: Prüfen Sie vor dem Senden, was maskiert wird',
  'panel.review.title': { one: '$1 Element zu maskieren', other: '$1 Elemente zu maskieren' },
  'panel.exposure': 'Preisgabe $1/100',
  'panel.action.cancel': 'Abbrechen',
  'panel.action.maskAndSend': 'Maskieren und senden',
  'panel.action.protectAndSend': 'Schützen und senden',
  'panel.item.keepOriginal': 'Original behalten',
  'panel.item.maskThis': 'Dies maskieren',
  'panel.item.aria': '$1: $2, Element $3 von $4',

  'panel.unwitnessed.title': 'Prüfen Sie, ob das Ihre Nachricht ist',
  'panel.unwitnessed.body':
    'Dieser Text stand bereits im Feld – PrivacyShield hat nicht gesehen, wie Sie ihn eingegeben haben. Das ist normal bei einem gespeicherten Entwurf, einem Link, der das Feld für Sie ausfüllt, oder einem Vorschlag.',

  'panel.findings.aria': {
    one: 'PrivacyShield: $1 sensibles Element in dieser Nachricht erkannt',
    other: 'PrivacyShield: $1 sensible Elemente in dieser Nachricht erkannt',
  },
  'panel.findings.title': { one: '$1 Element erkannt', other: '$1 Elemente erkannt' },
  'panel.findings.note':
    'Beim Senden werden sie ersetzt, und Sie werden vorher um Bestätigung gebeten.',

  'panel.paste.title': '$1 in dem, was Sie gerade eingefügt haben',
  'panel.paste.body':
    'Sie werden beim Senden maskiert. Sie können sie auch jetzt schon maskieren.',
  'panel.paste.none': 'Darin wurde nichts Sensibles gefunden.',
  'panel.paste.dismiss': 'Schließen',
  'panel.paste.maskNow': 'Jetzt maskieren',
  'panel.paste.countOfType': { one: '$1 $2', other: '$1 $2' },

  'panel.degraded.pageTitle': 'PrivacyShield schützt diese Seite nicht',
  'panel.degraded.sendTitle': 'PrivacyShield hat diese Nachricht nicht gesendet',
  'panel.degraded.couldNotFind': 'Nicht gefunden: $1.',
  'panel.degraded.noReason':
    'Die Erweiterung hat ein Problem gemeldet, ohne zu sagen, welches.',

  'popup.title': 'PrivacyShield',
  'popup.tab.status': 'Status',
  'popup.tab.quickRedact': 'Schnell maskieren',
  'popup.tab.insights': 'Auswertung',
  'popup.status.protected': 'Diese Seite wird geschützt',
  'popup.status.unprotected': 'Diese Seite wird nicht geschützt',
  'popup.status.unsupported': 'PrivacyShield läuft auf dieser Website nicht',
  'popup.status.sessionCounts': 'In dieser Sitzung maskiert',
  'popup.status.sessionExposure': 'Preisgabe in dieser Sitzung',
  'popup.status.profile': 'Empfindlichkeit',
  'popup.profile.minimal': 'Minimal',
  'popup.profile.balanced': 'Ausgewogen',
  'popup.profile.strict': 'Streng',
  'popup.status.enabledHere': 'Auf dieser Website aktiviert',

  'quick.heading': 'Text für überall maskieren',
  'quick.explain':
    'Fügen Sie Text aus einer beliebigen App ein. Die maskierte Fassung können Sie gefahrlos senden. Fügen Sie eine Antwort hier ein, um die echten Werte wiederherzustellen.',
  'quick.input.aria': 'Zu maskierender Text',
  'quick.output.aria': 'Maskierter Text',
  'quick.action.mask': 'Maskieren',
  'quick.action.restore': 'Wiederherstellen',
  'quick.action.copy': 'Kopieren',
  'quick.copied': 'Kopiert',
  'quick.empty': 'Noch nichts zu maskieren.',
  'quick.found': { one: '$1 Element maskiert', other: '$1 Elemente maskiert' },
  'quick.memoryOnly':
    'Die Zuordnung zwischen Ihrem Text und den Ersetzungen wird nur im Arbeitsspeicher gehalten und beim Schließen dieses Fensters gelöscht.',

  'insights.heading': 'Was Sie geschützt haben',
  'insights.explain': 'Nur Zählwerte. Es werden nie Texte oder Werte gespeichert.',
  'insights.empty': 'Noch nichts maskiert.',
  'insights.thisMonth': 'Diesen Monat',
  'insights.allTime': 'Insgesamt',
  'insights.reset': 'Zähler zurücksetzen',
  'insights.resetConfirm':
    'Alle Zähler zurücksetzen? Das lässt sich nicht rückgängig machen.',

  'options.title': 'PrivacyShield-Einstellungen',
  'options.section.detection': 'Was erkannt wird',
  'options.section.substitution': 'Art der Ersetzung',
  'options.section.lists': 'Immer und nie',
  'options.mode.surrogate': 'Realistische Ersetzungen',
  'options.mode.token': 'Kennzeichnungen wie [EMAIL_1]',
  'options.allowlist': 'Diese nie maskieren',
  'options.denylist': 'Diese immer maskieren',
  'options.save': 'Speichern',
  'options.saved': 'Gespeichert',
};

export const DE_ENTITIES: EntityLabels = {
  EMAIL: 'E-Mail-Adresse',
  PHONE: 'Telefonnummer',
  IP_ADDRESS: 'IP-Adresse',
  MAC_ADDRESS: 'MAC-Adresse',
  URL_WITH_CREDENTIALS: 'URL mit Zugangsdaten',
  CREDIT_CARD: 'Kreditkarte',
  SWIFT_BIC: 'SWIFT/BIC',
  US_ROUTING_NUMBER: 'Routing-Nummer (USA)',
  UK_SORT_CODE: 'Bankleitzahl (UK)',
  CA_TRANSIT_NUMBER: 'Transit-Nummer (Kanada)',
  BR_AGENCIA: 'Bankfiliale (Brasilien)',
  CRYPTO_WALLET: 'Krypto-Wallet',
  NATIONAL_ID: 'Ausweisnummer',
  TAX_ID: 'Steuernummer',
  VAT_NUMBER: 'Umsatzsteuer-Identifikationsnummer',
  PASSPORT_MRZ: 'Reisepass (MRZ)',
  DRIVERS_LICENSE: 'Führerschein',
  HEALTH_DATA: 'Gesundheitsdaten',
  API_KEY: 'API-Schlüssel',
  PRIVATE_KEY: 'Privater Schlüssel',
  GENERIC_SECRET: 'Geheimnis',
  CONNECTION_STRING: 'Verbindungszeichenfolge',
  POSTAL_CODE: 'Postleitzahl',
  STREET_ADDRESS: 'Anschrift',
  COORDINATES: 'Koordinaten',
  PERSON: 'Person',
  ORG: 'Organisation',
  LOCATION: 'Ort',
  DATE_OF_BIRTH: 'Geburtsdatum',
};
