/**
 * Turkish. Machine-translated; needs native review before release (D53).
 *
 * Only `other` is supplied for plural messages, and that is deliberate rather
 * than incomplete: Turkish does not mark the plural on a noun that follows a
 * numeral - "3 öğe", never "3 öğeler". `Intl.PluralRules('tr').select(1)` is
 * `one`, so `one` would be consulted and correctly falls through to `other`,
 * which is the same sentence. Writing both would be two copies of one string.
 */

import type { Catalogue, EntityLabels } from '../catalogue.js';

export const TR: Catalogue = {
  appName: 'PrivacyShield',
  appDescription:
    'Metindeki hassas bilgileri yapay zekâ sohbet arayüzlerine ulaşmadan önce tespit eder ve maskeler. Tamamen cihazınızda çalışır.',

  'panel.review.aria': 'PrivacyShield: göndermeden önce nelerin maskeleneceğini gözden geçirin',
  'panel.review.title': { other: '$1 öğe maskelenecek' },
  'panel.exposure': 'açığa çıkma $1/100',
  'panel.action.cancel': 'İptal',
  'panel.action.maskAndSend': 'Maskele ve gönder',
  'panel.action.protectAndSend': 'Koru ve gönder',
  'panel.item.keepOriginal': 'Aslını koru',
  'panel.item.maskThis': 'Bunu maskele',
  'panel.item.aria': '$1: $2, $4 öğeden $3. öğe',

  'panel.unwitnessed.title': 'Bu mesajın sizin olduğunu doğrulayın',
  'panel.unwitnessed.body':
    'Bu metin kutuda zaten vardı — PrivacyShield sizin yazdığınızı görmedi. Kaydedilmiş bir taslakta, kutuyu sizin için dolduran bir bağlantıda veya hazır bir öneride bu normaldir.',

  'panel.findings.aria': { other: 'PrivacyShield: bu mesajda $1 hassas öğe bulundu' },
  'panel.findings.title': { other: '$1 öğe bulundu' },
  'panel.findings.note':
    'Gönderdiğinizde bunlar değiştirilecek ve önce onayınız istenecek.',

  'panel.paste.title': 'Az önce yapıştırdığınız metinde $1',
  'panel.paste.body':
    'Gönderirken maskelenecekler. İsterseniz şimdi de maskeleyebilirsiniz.',
  'panel.paste.none': 'İçinde hassas bir şey bulunmadı.',
  'panel.paste.dismiss': 'Kapat',
  'panel.paste.maskNow': 'Şimdi maskele',
  'panel.paste.countOfType': { other: '$1 $2' },

  'panel.degraded.pageTitle': 'PrivacyShield bu sayfayı korumuyor',
  'panel.degraded.sendTitle': 'PrivacyShield bu mesajı göndermedi',
  'panel.degraded.couldNotFind': 'Bulunamadı: $1.',
  'panel.degraded.noReason': 'Uzantı bir sorun bildirdi ama ne olduğunu söylemedi.',

  'popup.title': 'PrivacyShield',
  'popup.tab.status': 'Durum',
  'popup.tab.quickRedact': 'Hızlı maskeleme',
  'popup.tab.insights': 'İstatistikler',
  'popup.status.protected': 'Bu sayfa korunuyor',
  'popup.status.unprotected': 'Bu sayfa korunmuyor',
  'popup.status.unsupported': 'PrivacyShield bu sitede çalışmaz',
  'popup.status.sessionCounts': 'Bu oturumda maskelenen',
  'popup.status.sessionExposure': 'Oturumun açığa çıkma puanı',
  'popup.status.profile': 'Hassasiyet',
  'popup.profile.minimal': 'En az',
  'popup.profile.balanced': 'Dengeli',
  'popup.profile.strict': 'Katı',
  'popup.status.enabledHere': 'Bu sitede etkin',

  'quick.heading': 'Her yer için metin maskeleyin',
  'quick.explain':
    'Herhangi bir uygulamadan metin yapıştırın. Maskelenmiş sürümü güvenle gönderebilirsiniz. Gerçek değerleri geri getirmek için yanıtı buraya yapıştırın.',
  'quick.input.aria': 'Maskelenecek metin',
  'quick.output.aria': 'Maskelenmiş metin',
  'quick.action.mask': 'Maskele',
  'quick.action.restore': 'Geri getir',
  'quick.action.copy': 'Kopyala',
  'quick.copied': 'Kopyalandı',
  'quick.empty': 'Henüz maskelenecek bir şey yok.',
  'quick.found': { other: '$1 öğe maskelendi' },
  'quick.memoryOnly':
    'Metniniz ile karşılıkları arasındaki eşleme yalnızca bellekte tutulur ve bu pencere kapandığında silinir.',

  'insights.heading': 'Neleri korudunuz',
  'insights.explain': 'Yalnızca sayılar. Hiçbir metin ve hiçbir değer saklanmaz.',
  'insights.empty': 'Henüz hiçbir şey maskelenmedi.',
  'insights.thisMonth': 'Bu ay',
  'insights.allTime': 'Tüm zamanlar',
  'insights.reset': 'Sayaçları sıfırla',
  'insights.resetConfirm': 'Tüm sayaçlar sıfırlansın mı? Bu geri alınamaz.',

  'options.title': 'PrivacyShield ayarları',
  'options.section.detection': 'Neler algılansın',
  'options.section.substitution': 'Değiştirme biçimi',
  'options.section.lists': 'Her zaman ve asla',
  'options.mode.surrogate': 'Gerçekçi karşılıklar',
  'options.mode.token': '[EMAIL_1] gibi etiketler',
  'options.allowlist': 'Bunları asla maskeleme',
  'options.denylist': 'Bunları her zaman maskele',
  'options.save': 'Kaydet',
  'options.saved': 'Kaydedildi',
};

export const TR_ENTITIES: EntityLabels = {
  EMAIL: 'E-posta adresi',
  PHONE: 'Telefon numarası',
  IP_ADDRESS: 'IP adresi',
  MAC_ADDRESS: 'MAC adresi',
  URL_WITH_CREDENTIALS: 'Kimlik bilgisi içeren URL',
  CREDIT_CARD: 'Kredi kartı',
  SWIFT_BIC: 'SWIFT/BIC',
  US_ROUTING_NUMBER: 'Yönlendirme numarası (ABD)',
  UK_SORT_CODE: 'Banka şube kodu (Birleşik Krallık)',
  CA_TRANSIT_NUMBER: 'Transit numarası (Kanada)',
  BR_AGENCIA: 'Banka şubesi (Brezilya)',
  CRYPTO_WALLET: 'Kripto cüzdanı',
  NATIONAL_ID: 'Kimlik numarası',
  TAX_ID: 'Vergi numarası',
  VAT_NUMBER: 'KDV numarası',
  PASSPORT_MRZ: 'Pasaport (MRZ alanı)',
  DRIVERS_LICENSE: 'Sürücü belgesi',
  HEALTH_DATA: 'Sağlık verisi',
  API_KEY: 'API anahtarı',
  PRIVATE_KEY: 'Özel anahtar',
  GENERIC_SECRET: 'Gizli değer',
  CONNECTION_STRING: 'Bağlantı dizesi',
  POSTAL_CODE: 'Posta kodu',
  STREET_ADDRESS: 'Açık adres',
  COORDINATES: 'Koordinatlar',
  PERSON: 'Kişi',
  ORG: 'Kurum',
  LOCATION: 'Yer',
  DATE_OF_BIRTH: 'Doğum tarihi',
};
