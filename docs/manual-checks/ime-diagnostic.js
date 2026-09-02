/**
 * PrivacyShield — IME composition diagnostic.
 *
 * Paste this into the DevTools console on a signed-in chatgpt.com tab, then
 * follow docs/manual-checks/isComposing.md. It answers one question:
 *
 *   When you press Enter to COMMIT an IME candidate, does the site send the
 *   message?
 *
 * It only observes. It does not send anything, does not modify the page, and
 * does not touch the composer's contents. Call __psImeReport() at any time for
 * the verdict; call __psImeStop() to remove the listeners.
 */
(() => {
  const state = {
    enters: [],
    compositions: 0,
    sendsObserved: [],
    startedAt: new Date().toISOString(),
  };

  const composer =
    document.querySelector('#prompt-textarea') ??
    document.querySelector('[contenteditable="true"]') ??
    document.querySelector('textarea');

  if (composer === null) {
    console.error('[PrivacyShield] No composer found. Click into the message box and re-paste.');
    return;
  }

  const textOf = (node) =>
    typeof node.value === 'string' ? node.value : (node.textContent ?? '');

  /**
   * A send is inferred from the composer EMPTYING, which is what every one of
   * these sites does on submit. Watching for a new message bubble instead
   * would depend on markup that changes without notice; the composer clearing
   * is behaviour, not structure.
   */
  let lastText = textOf(composer);
  let lastEnterAt = 0;
  let lastEnterWasComposing = null;

  const onKeydown = (event) => {
    if (event.key !== 'Enter') return;
    const record = {
      at: performance.now(),
      isComposing: event.isComposing === true,
      keyCode: event.keyCode,
      shift: event.shiftKey,
      trusted: event.isTrusted,
      textLength: textOf(composer).length,
    };
    state.enters.push(record);
    lastEnterAt = record.at;
    lastEnterWasComposing = record.isComposing;

    // keyCode 229 is the other half of the story. Browsers report it while an
    // IME owns the keystroke, and some sites test for it INSTEAD of
    // isComposing. Recording both means the report can tell you which signal
    // the site could have used.
    console.log(
      `[PrivacyShield] Enter — isComposing=${record.isComposing} keyCode=${record.keyCode} trusted=${record.trusted}`,
    );
  };

  const onCompositionStart = () => {
    state.compositions += 1;
  };

  composer.addEventListener('keydown', onKeydown, true);
  composer.addEventListener('compositionstart', onCompositionStart, true);

  const observer = new MutationObserver(() => {
    const now = textOf(composer);
    const emptiedJustAfterEnter =
      lastText.trim().length > 0 &&
      now.trim().length === 0 &&
      performance.now() - lastEnterAt < 2000;
    if (emptiedJustAfterEnter) {
      state.sendsObserved.push({
        afterComposingEnter: lastEnterWasComposing === true,
        clearedFrom: lastText.length,
      });
      console.log(
        `[PrivacyShield] composer cleared — a send followed an Enter with isComposing=${String(lastEnterWasComposing)}`,
      );
    }
    lastText = now;
  });
  observer.observe(composer, { childList: true, subtree: true, characterData: true });
  if ('value' in composer) {
    composer.addEventListener('input', () => {
      lastText = textOf(composer);
    });
  }

  window.__psImeStop = () => {
    composer.removeEventListener('keydown', onKeydown, true);
    composer.removeEventListener('compositionstart', onCompositionStart, true);
    observer.disconnect();
    console.log('[PrivacyShield] diagnostic removed.');
  };

  window.__psImeReport = () => {
    const composingEnters = state.enters.filter((e) => e.isComposing).length;
    const sendsAfterComposing = state.sendsObserved.filter((s) => s.afterComposingEnter).length;

    let verdict;
    if (composingEnters === 0) {
      verdict =
        'INCONCLUSIVE — no Enter was seen while composing. Make sure the IME ' +
        'candidate window is OPEN when you press Enter.';
    } else if (sendsAfterComposing > 0) {
      verdict =
        'SENDS PREMATURELY — an Enter that only committed an IME candidate ' +
        'also submitted the message. This is the failure case.';
    } else {
      verdict =
        'WAITS CORRECTLY — Enter while composing committed the candidate ' +
        'without submitting.';
    }

    const report = {
      verdict,
      enters: state.enters.length,
      composingEnters,
      compositionsStarted: state.compositions,
      sendsObserved: state.sendsObserved.length,
      sendsAfterComposingEnter: sendsAfterComposing,
      keyCodesSeen: [...new Set(state.enters.map((e) => e.keyCode))],
      allEntersTrusted: state.enters.every((e) => e.trusted),
      startedAt: state.startedAt,
    };
    console.log('[PrivacyShield] ' + verdict);
    console.table(state.enters);
    return report;
  };

  console.log(
    '[PrivacyShield] IME diagnostic armed on',
    composer.tagName.toLowerCase() +
      (composer.id ? '#' + composer.id : ''),
    '\nSwitch to a CJK IME, type something that opens the candidate window, and press Enter to commit it.',
    '\nThen run: __psImeReport()',
  );
})();
