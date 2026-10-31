---
license: apache-2.0
pipeline_tag: image-segmentation
library_name: onnx
tags:
  - onnxruntime
  - onnx
  - segment-anything
  - image-segmentation
  - edge-ai
  - anylabeling
authors:
  - Viet-Anh Nguyen
---

# Segment Anything (SAM) — ONNX Models

ONNX exports of Meta's original [Segment Anything](https://github.com/facebookresearch/segment-anything) family, plus [MobileSAM](https://github.com/ChaoningZhang/MobileSAM), packaged for direct use with [`onnxruntime`](https://onnxruntime.ai) and [AnyLabeling](https://github.com/vietanhdev/anylabeling).

## Why this repo exists

Running SAM through the original PyTorch checkpoint is heavy on a CPU laptop or an edge device. ONNX gives you a portable, dependency-light runtime that works in Python, C++, JavaScript, and most embedded targets. These exports are the ones AnyLabeling consumes for its smart-labeling features.

## Variants

Each `.zip` bundles the encoder + decoder ONNX files for that backbone.

| File | Backbone | Size | Notes |
|---|---|---|---|
| `mobile_sam_20230629.zip` | MobileSAM | 35 MB | Smallest — best for mobile / low-power |
| `mobile_sam_20230629_quant.zip` | MobileSAM | 10.5 MB | Quantized MobileSAM |
| `sam_vit_b_01ec64.zip` | ViT-B | 332 MB | Base |
| `sam_vit_b_01ec64_quant.zip` | ViT-B | 72 MB | Quantized base |
| `sam_vit_l_0b3195.zip` | ViT-L | 1.1 GB | Large |
| `sam_vit_l_0b3195_quant.zip` | ViT-L | 213 MB | Quantized large |
| `sam_vit_h_4b8939.zip` | ViT-H | 2.3 GB | Huge — best quality |
| `sam_vit_h_4b8939_quant.zip` | ViT-H | 422 MB | Quantized huge |

## Quick start

```bash
pip install huggingface_hub onnxruntime
```

```python
from huggingface_hub import hf_hub_download
import zipfile, onnxruntime as ort

zip_path = hf_hub_download(repo_id="vietanhdev/segment-anything-onnx-models",
                           filename="sam_vit_b_01ec64_quant.zip")
with zipfile.ZipFile(zip_path) as z:
    z.extractall("./sam_vit_b_quant")

session = ort.InferenceSession("./sam_vit_b_quant/encoder.onnx",
                               providers=["CPUExecutionProvider"])
# Inspect expected inputs:
print([(i.name, i.shape, i.type) for i in session.get_inputs()])
```

For the full image → mask pipeline (encoder + decoder + prompt handling), see how AnyLabeling wires it: <https://github.com/vietanhdev/anylabeling>

## Use with AnyLabeling

These models drop into AnyLabeling's auto-labeling backend without conversion. See the [AnyLabeling docs](https://github.com/vietanhdev/anylabeling) for the model-config wiring.

## Source weights

- Original SAM weights & license: <https://github.com/facebookresearch/segment-anything>
- MobileSAM: <https://github.com/ChaoningZhang/MobileSAM>

This repo redistributes the same weights in ONNX format. License unchanged from upstream releases (Apache 2.0).

## Citation

```bibtex
@misc{nguyen2026sam_onnx,
  author = {Nguyen, Viet-Anh and {Neural Research Lab}},
  title  = {Segment Anything ONNX Models},
  year   = {2026},
  url    = {https://huggingface.co/vietanhdev/segment-anything-onnx-models}
}
```

For the underlying model, cite Meta's original SAM paper:

```bibtex
@article{kirillov2023sam,
  title   = {Segment Anything},
  author  = {Kirillov, Alexander and Mintun, Eric and Ravi, Nikhila and Mao, Hanzi and Rolland, Chloe and Gustafson, Laura and Xiao, Tete and Whitehead, Spencer and Berg, Alexander C. and Lo, Wan-Yen and Doll{\'a}r, Piotr and Girshick, Ross},
  journal = {arXiv:2304.02643},
  year    = {2023}
}
```

## Acknowledgments

Thanks to Meta AI Research for releasing the SAM family, and to the MobileSAM team for their efficient distillation. This repo packages their work for edge inference.
