# Translation review — Portuguese (Brazil) (`pt_BR`)

**Status: NOT REVIEWED — this locale is not shipped**

Digest of the strings below: `4f8031b3`

---

## What you are being asked

These 21 strings are the ones where a mistranslation causes a **wrong safety
decision** rather than confusion. This extension masks sensitive data before it
is sent to an AI chat service; these strings are the buttons and notices the
user reads when deciding whether to send something.

You do not need to see the extension, and you do not need to judge style. For
each row, answer one question:

> **Could someone reading only the Portuguese (Brazil) text act in a way they did not
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

| key | English | Portuguese (Brazil) | If this is wrong | Verdict | Suggested replacement |
| --- | --- | --- | --- | --- | --- |
| `panel.action.cancel` | Cancel | **Cancelar** | If this reads as "send", the user sends unmasked text while trying to stop. | | |
| `panel.action.maskAndSend` | Mask and send | **Mascarar e enviar** | The button that sends. If it reads as "cancel", the user sends when they meant to stop. | | |
| `panel.action.protectAndSend` | Protect and send | **Proteger e enviar** | Same as above; this is the wording used when items are being replaced. | | |
| `panel.item.keepOriginal` | Keep original | **Manter original** | If this and "mask this" read as each other, the user LEAVES A SECRET IN PLAINTEXT believing they masked it. | | |
| `panel.item.maskThis` | Mask this | **Mascarar este** | If this and "keep original" read as each other, the user leaves a secret in plaintext believing they masked it. | | |
| `panel.degraded.pageTitle` | Discretion is not protecting this page | **O Discretion não está protegendo esta página** | Says the extension is NOT protecting this page. If it reads as protected, the user trusts a page that is not guarded. | | |
| `panel.degraded.sendTitle` | Discretion did not send this message | **O Discretion não enviou esta mensagem** | Says the message was NOT sent. If it reads as sent, the user believes something left that did not - or the reverse. | | |
| `panel.degraded.couldNotFind` | Could not find: $1. | **Não encontrado: $1.** | Names what the extension could not locate. Must read as a failure, not as a result. | | |
| `panel.degraded.noReason` | The extension reported a problem without saying what it was. | **A extensão relatou um problema sem dizer qual era.** | Says the extension failed without explaining why. Must not read as "nothing was found". | | |
| `panel.unwitnessed.title` | Check this is your message | **Confirme que esta mensagem é sua** | Warns the message may not be what the user wrote. Must read as a warning. | | |
| `panel.unwitnessed.body` | This text was already in the box - Discretion did not see you type it. That is normal for a saved draft, a link that fills the box for you, or a suggested prompt. | **Este texto já estava na caixa — o Discretion não viu você digitá-lo. Isso é normal em um rascunho salvo, em um link que preenche a caixa por você ou em uma sugestão.** | Explains that warning. Must not read as reassurance. | | |
| `panel.findings.note` | When you send, these will be replaced and you will be asked to confirm first. | **Ao enviar, eles serão substituídos e sua confirmação será pedida antes.** | Promises that these items WILL be replaced on send, and that the user will be asked first. A wrong tense or a negation changes what the user expects to happen. | | |
| `panel.paste.body` | These will be masked when you send. You can mask them now instead. | **Serão mascarados ao enviar. Você também pode mascará-los agora.** | Says pasted items will be masked when sending, and can be masked now instead. Must not read as "already masked". | | |
| `panel.paste.none` | Nothing sensitive was found in it. | **Nada sensível foi encontrado.** | Says nothing sensitive was found. If this reads as an error, the user distrusts a correct result; if an error reads as this, they trust a failure. | | |
| `popup.status.protected` | Protecting this page | **Protegendo esta página** | Says this page IS protected. Must not be confusable with the next string. | | |
| `popup.status.unprotected` | Not protecting this page | **Não está protegendo esta página** | Says this page is NOT protected. If these two read alike, the status display is worse than none. | | |
| `popup.status.unsupported` | Discretion does not run on this site | **O Discretion não funciona neste site** | Says the extension does not run here at all. Must not read as "protected". | | |
| `quick.action.mask` | Mask | **Mascarar** | Turns text into masked text. If it swaps with "restore", the user reveals values they meant to hide. | | |
| `quick.action.restore` | Restore | **Restaurar** | Turns masked text back into the real values. If it swaps with "mask", the user reveals values they meant to hide. | | |
| `quick.unavailable` | Masking is unavailable right now, so nothing was changed. | **O mascaramento está indisponível agora, então nada foi alterado.** | Says masking did NOT happen and nothing was changed. If it reads as success, the user copies unmasked text believing it is safe. | | |
| `quick.memoryOnly` | The mapping between your text and its replacements is kept in memory only, and is erased when this popup closes. | **A correspondência entre o seu texto e as substituições fica apenas na memória e é apagada quando esta janela é fechada.** | A privacy claim about where the text goes. Must not overstate or understate it. | | |

## Automated flags

None. Placeholders match English, nothing is empty, nothing is left in English.
That says nothing about whether the words are right.

## Recording the result

When every row is marked, add to `packages/extension/src/i18n/reviewed.ts`:

```ts
'pt_BR': {
  reviewer: '<name>',
  relationship: '<native speaker / fluent, how long>',
  date: '<YYYY-MM-DD>',
  digest: '4f8031b3',
},
```

The digest ties the sign-off to these exact words. If any of them is edited
afterwards the digest stops matching and the locale drops out of the build
again, which is intended: the record must not outlive what it describes.
