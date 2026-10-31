# Local mouth-region detector

MediaPipe Tasks Vision 1.2.0 (Apache-2.0): JavaScript/WASM loader files copied
from the exact npm package, with the lockfile committed.

Face Landmarker model, official float16 v1 distribution:
https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

SHA-256: 64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff

The model detects facial landmarks only. Tooth pixels are a conservative local
colour/edge proposal inside the inner lips, not a trained medical segmentation
model and not an FDI tooth-number recognizer. A visible mask review is required.
Ambiguous images abstain and retain manual editing. Photos are not uploaded for
this step. The actual edit still uses the separately disclosed Polza service.

Documentation: https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker/web_js
Code licence: https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE
