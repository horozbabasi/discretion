# WASM NER latency benchmark

Measures Stage 2 inference latency in **a real browser on onnxruntime-web**,
which is what the extension ships. Every other latency number in this
repository uses onnxruntime-node on native CPU, and the Node build of
transformers.js has no WASM execution provider at all — it offers only
`dml`, `webgpu` and `cpu` — so the shipped configuration could not be measured
from Node even in principle.

Deliberately the **same benchmark as M8**: inputs of exactly 2000 characters,
warmup discarded, same model (`jiting/xlm-roberta-base-ner-hrl_onnx`, q8), same
machine. Only the runtime differs, so the comparison isolates it.

## Running

```
cd bench/wasm-latency
python ../../.claude/skills/webapp-testing/scripts/with_server.py \
  --server "npx.cmd vite --config vite.config.mjs" --port 5199 -- python -u run.py
```

`DEVICE=webgpu` switches the execution provider.

The Vite config serves the already-downloaded model cache at `/hfmodels/` so
the browser fetches exactly the bytes the Node benchmark used, and sets the
cross-origin isolation headers WASM multi-threading requires — without them
onnxruntime-web silently falls back to single-threaded, which would understate
the shipped configuration.

## Why it measures two window sizes

Stage 2 windows input at 400 characters, a bound set at M6 by the model's
512-token limit under the worst case of one token per character (CJK). For
Latin-script text that is far below 512 tokens, so most windows are underfilled
and a 2000-character input pays for seven inferences instead of two. The
benchmark measures both so the value of script-aware sizing is a number rather
than an assumption.
