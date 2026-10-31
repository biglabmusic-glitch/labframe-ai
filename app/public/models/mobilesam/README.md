# Local MobileSAM

MobileSAM is a general prompted segmentation model, not a dental segmentation
model, diagnostic tool or FDI tooth-number classifier. A person must review every
mask. SAM ranking scores are not calibrated probabilities of dental accuracy.

Original model and weights: https://github.com/ChaoningZhang/MobileSAM (Apache-2.0).
The q8 encoder comes from vietanhdev/segment-anything-onnx-models, pinned revision
`9effc01a9e135621d710d49159f1ffb0b6f724dc` (Apache-2.0; ENCODER_CARD.md).
The multi-mask decoder comes from Acly/MobileSAM, pinned revision
`0d3b403339b4674a82493d5e97964dd78089ddc8` (MIT conversion; DECODER_CARD.md).
The original weights remain attributed under Apache-2.0. ONNX Runtime 1.31.1 is MIT.
Bundled license notices accompany these assets.

`manifest.json` records SHA-256, exact sizes and source URLs. After npm ci in app,
run `node scripts/prepare-mobile-sam.mjs` from the repository root to verify or
restore pinned assets. The model and runtime total approximately 42.4 MB; all
files are below GitHub's 100 MiB limit. The browser verifies model hashes before use.

The CPU/WASM encoder runs once per local mouth crop in an image-specific Worker.
Positive/negative point changes reuse its embedding; a new crop re-encodes.
Closing/replacing the image terminates the Worker and its retained WASM arena.
The interface remains on the main thread. No GPU, SharedArrayBuffer or cross-origin
isolation is required. Model files are requested only from LabFrame; model caches
contain public weights only. Photo pixels, crops, points and embeddings never
leave the device during segmentation. The separate image-edit request to Polza
still uses the disclosed external processing flow.

Positive edge prompts may first snap to nearby enamel interior; colour is used
only to position that prompt. Candidate selection preserves predicted contours,
tolerates a prompt by two crop pixels and discards unprompted components.
Negative prompts exclude components rather than painting holes. Crowns are
proposed separately and unioned; tiny native crops use a compact arch proposal.
Compact candidates are preferred over a whole-mouth interpretation. These are
prompt selection heuristics and cannot guarantee anatomy or boundary accuracy.
