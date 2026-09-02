# Translation review — German (`de`)

**Status: NOT REVIEWED — this locale is not shipped**

Digest of the strings below: `e87fd151`

---

## What you are being asked

These 21 strings are the ones where a mistranslation causes a **wrong safety
decision** rather than confusion. This extension masks sensitive data before it
is sent to an AI chat service; these strings are the buttons and notices the
user reads when deciding whether to send something.

You do not need to see the extension, and you do not need to judge style. For
each row, answer one question:

> **Could someone reading only the German text act in a way they did not
> intend — send something they meant to keep, or believe a page is protected
> when it is not?**

Mark the **Verdict** column:

- **OK** — says what the English says, and could not be acted on wrongly.
- **REWORD** — understandable but risky, unnatural, or easy to misread. Put a
  better version in the last column.
- **WRONG** — says something materially different, or the opposite.

Style notes are welcome in the last column but are not what gates the release.
A stiff translation ships; a misleading one does not.

## The strings

| key | English | German | If this is wrong | Verdict | Suggested replacement |
| --- | --- | --- | --- | --- | --- |
| `panel.action.cancel` | Cancel | **Abbrechen** | If this reads as "send", the user sends unmasked text while trying to stop. | | |
| `panel.action.maskAndSend` | Mask and send | **Maskieren und senden** | The button that sends. If it reads as "cancel", the user sends when they meant to stop. | | |
| `panel.action.protectAndSend` | Protect and send | **Schützen und senden** | Same as above; this is the wording used when items are being replaced. | | |
| `panel.item.keepOriginal` | Keep original | **Original behalten** | If this and "mask this" read as each other, the user LEAVES A SECRET IN PLAINTEXT believing they masked it. | | |
| `panel.item.maskThis` | Mask this | **Dies maskieren** | If this and "keep original" read as each other, the user leaves a secret in plaintext believing they masked it. | | |
| `panel.degraded.pageTitle` | PrivacyShield is not protecting this page | **PrivacyShield schützt diese Seite nicht** | Says the extension is NOT protecting this page. If it reads as protected, the user trusts a page that is not guarded. | | |
| `panel.degraded.sendTitle` | PrivacyShield did not send this message | **PrivacyShield hat diese Nachricht nicht gesendet** | Says the message was NOT sent. If it reads as sent, the user believes something left that did not - or the reverse. | | |
| `panel.degraded.couldNotFind` | Could not find: $1. | **Nicht gefunden: $1.** | Names what the extension could not locate. Must read as a failure, not as a result. | | |
| `panel.degraded.noReason` | The extension reported a problem without saying what it was. | **Die Erweiterung hat ein Problem gemeldet, ohne zu sagen, welches.** | Says the extension failed without explaining why. Must not read as "nothing was found". | | |
| `panel.unwitnessed.title` | Check this is your message | **Prüfen Sie, ob das Ihre Nachricht ist** | Warns the message may not be what the user wrote. Must read as a warning. | | |
| `panel.unwitnessed.body` | This text was already in the box - PrivacyShield did not see you type it. That is normal for a saved draft, a link that fills the box for you, or a suggested prompt. | **Dieser Text stand bereits im Feld – PrivacyShield hat nicht gesehen, wie Sie ihn eingegeben haben. Das ist normal bei einem gespeicherten Entwurf, einem Link, der das Feld für Sie ausfüllt, oder einem Vorschlag.** | Explains that warning. Must not read as reassurance. | | |
| `panel.findings.note` | When you send, these will be replaced and you will be asked to confirm first. | **Beim Senden werden sie ersetzt, und Sie werden vorher um Bestätigung gebeten.** | Promises that these items WILL be replaced on send, and that the user will be asked first. A wrong tense or a negation changes what the user expects to happen. | | |
| `panel.paste.body` | These will be masked when you send. You can mask them now instead. | **Sie werden beim Senden maskiert. Sie können sie auch jetzt schon maskieren.** | Says pasted items will be masked when sending, and can be masked now instead. Must not read as "already masked". | | |
| `panel.paste.none` | Nothing sensitive was found in it. | **Darin wurde nichts Sensibles gefunden.** | Says nothing sensitive was found. If this reads as an error, the user distrusts a correct result; if an error reads as this, they trust a failure. | | |
| `popup.status.protected` | Protecting this page | **Diese Seite wird geschützt** | Says this page IS protected. Must not be confusable with the next string. | | |
| `popup.status.unprotected` | Not protecting this page | **Diese Seite wird nicht geschützt** | Says this page is NOT protected. If these two read alike, the status display is worse than none. | | |
| `popup.status.unsupported` | PrivacyShield does not run on this site | **PrivacyShield läuft auf dieser Website nicht** | Says the extension does not run here at all. Must not read as "protected". | | |
| `quick.action.mask` | Mask | **Maskieren** | Turns text into masked text. If it swaps with "restore", the user reveals values they meant to hide. | | |
| `quick.action.restore` | Restore | **Wiederherstellen** | Turns masked text back into the real values. If it swaps with "mask", the user reveals values they meant to hide. | | |
| `quick.unavailable` | Masking is unavailable right now, so nothing was changed. | **Maskieren ist gerade nicht möglich, daher wurde nichts geändert.** | Says masking did NOT happen and nothing was changed. If it reads as success, the user copies unmasked text believing it is safe. | | |
| `quick.memoryOnly` | The mapping between your text and its replacements is kept in memory only, and is erased when this popup closes. | **Die Zuordnung zwischen Ihrem Text und den Ersetzungen wird nur im Arbeitsspeicher gehalten und beim Schließen dieses Fensters gelöscht.** | A privacy claim about where the text goes. Must not overstate or understate it. | | |

## Automated flags

None. Placeholders match English, nothing is empty, nothing is left in English.
That says nothing about whether the words are right.

## Recording the result

When every row is marked, add to `packages/extension/src/i18n/reviewed.ts`:

```ts
'de': {
  reviewer: '<name>',
  relationship: '<native speaker / fluent, how long>',
  date: '<YYYY-MM-DD>',
  digest: 'e87fd151',
},
```

The digest ties the sign-off to these exact words. If any of them is edited
afterwards the digest stops matching and the locale drops out of the build
again, which is intended: the record must not outlive what it describes.
