// Measures tokens-per-character for the shipped model's tokenizer, per script.
//
// The Stage 2 window bound (400 characters) rests on a claim inherited from
// M6: that the worst case is about one token per character for CJK, so 512
// tokens corresponds to roughly 512 characters and 400 leaves headroom. That
// claim is now the load-bearing argument for keeping the window at 400
// (ARCHITECTURE.md D28), and a load-bearing claim should be measured rather
// than inherited.
//
// Tokenization needs no execution provider, so unlike the latency benchmark
// this runs correctly in Node.
//
// Run: node bench/wasm-latency/tokens-per-char.mjs
import { AutoTokenizer, env } from '@huggingface/transformers';

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = 'C:/Users/Pc/dev/privacyshield/.hf-cache';

const MODEL = 'jiting/xlm-roberta-base-ner-hrl_onnx';
const MAX_TOKENS = 512;

// Realistic prose, not repeated single characters: repetition can hit the
// tokenizer's merge behaviour and understate the ratio.
const SAMPLES = [
  {
    script: 'Latin (English)',
    text: 'The invoice from Acme Holdings was approved by Maria Gomez in Madrid last spring, and the payment reference is on the second page of the attached statement. ',
  },
  {
    script: 'Latin (German)',
    text: 'Die Rechnung der Firma Hoffmann wurde von Frau Schmidt in Duesseldorf genehmigt, und die Zahlungsreferenz steht auf der zweiten Seite der beigefuegten Aufstellung. ',
  },
  {
    script: 'Chinese (Simplified)',
    text: '这份来自北京的发票由玛丽亚在上海批准，付款参考编号在所附对账单的第二页上。请在下周之前完成审核并回复确认。',
  },
  {
    script: 'Japanese',
    text: '東京の田中さんが承認した請求書は、添付の明細書の二ページ目に支払い参照番号が記載されています。来週までに確認して返信してください。',
  },
  {
    script: 'Korean',
    text: '서울의 김민수 씨가 승인한 청구서는 첨부된 명세서 두 번째 페이지에 지급 참조 번호가 기재되어 있습니다. 다음 주까지 확인 후 회신해 주세요.',
  },
  {
    script: 'Thai',
    text: 'ใบแจ้งหนี้จากกรุงเทพมหานครได้รับการอนุมัติจากคุณสมชาย และหมายเลขอ้างอิงการชำระเงินอยู่ในหน้าที่สองของใบแจ้งยอดที่แนบมา',
  },
  {
    script: 'Arabic',
    text: 'تمت الموافقة على الفاتورة الصادرة من شركة الأمل في دبي، ورقم مرجع الدفع موجود في الصفحة الثانية من كشف الحساب المرفق. ',
  },
  {
    script: 'Hindi (Devanagari)',
    text: 'दिल्ली की कंपनी से प्राप्त चालान को श्रीमती शर्मा ने स्वीकृत किया, और भुगतान संदर्भ संख्या संलग्न विवरण के दूसरे पृष्ठ पर है। ',
  },
  {
    script: 'Russian (Cyrillic)',
    text: 'Счет от компании в Москве был утвержден Марией Петровой, а номер платежной ссылки указан на второй странице приложенной выписки. ',
  },
];

function grow(text, minChars) {
  let out = '';
  while (out.length < minChars) out += text;
  return out.slice(0, minChars);
}

const tokenizer = await AutoTokenizer.from_pretrained(MODEL);

const rows = [];
for (const { script, text } of SAMPLES) {
  // Measure on a 400-character sample: the actual shipped window.
  const sample = grow(text, 400);
  const ids = tokenizer.encode(sample);
  const perChar = ids.length / sample.length;

  // What a 1200-character window of this script would cost.
  const at1200 = perChar * 1200;
  rows.push({
    script,
    chars: sample.length,
    tokensAt400: ids.length,
    tokensPerChar: perChar,
    projectedTokensAt1200: Math.round(at1200),
    fitsAt400: ids.length <= MAX_TOKENS,
    fitsAt1200: at1200 <= MAX_TOKENS,
    // How many characters fit in 512 tokens for this script.
    maxSafeChars: Math.floor(MAX_TOKENS / perChar),
  });
}

const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);
console.log(
  `${pad('script', 22)} ${padL('tok@400', 8)} ${padL('tok/char', 9)} ${padL('proj@1200', 10)} ${padL('fits 400', 9)} ${padL('fits 1200', 10)} ${padL('max chars', 10)}`,
);
console.log('-'.repeat(84));
for (const r of rows) {
  console.log(
    `${pad(r.script, 22)} ${padL(r.tokensAt400, 8)} ${padL(r.tokensPerChar.toFixed(3), 9)} ${padL(r.projectedTokensAt1200, 10)} ${padL(r.fitsAt400 ? 'yes' : 'NO', 9)} ${padL(r.fitsAt1200 ? 'yes' : 'NO', 10)} ${padL(r.maxSafeChars, 10)}`,
  );
}

const worst = rows.reduce((a, b) => (a.tokensPerChar > b.tokensPerChar ? a : b));
console.log(
  `\nworst script: ${worst.script} at ${worst.tokensPerChar.toFixed(3)} tokens/char ` +
    `-> ${worst.maxSafeChars} characters fit in ${MAX_TOKENS} tokens.`,
);
console.log(
  rows.every((r) => r.fitsAt400)
    ? 'window 400: every script fits within the token limit.'
    : 'window 400: AT LEAST ONE SCRIPT OVERFLOWS - the shipped bound is wrong.',
);
const overflow1200 = rows.filter((r) => !r.fitsAt1200).map((r) => r.script);
console.log(
  overflow1200.length > 0
    ? `window 1200: would TRUNCATE for ${overflow1200.join(', ')}`
    : 'window 1200: no script overflows.',
);
