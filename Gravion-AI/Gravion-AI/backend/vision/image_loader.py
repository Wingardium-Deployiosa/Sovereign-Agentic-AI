"""
Image loader — validates, resizes, and normalises uploaded equipment images.
Returns a PIL Image ready for the vision analyzer.
"""
from __future__ import annotations
from pathlib import Path
from PIL import Image
import io

SUPPORTED_FORMATS = {".jpg", ".jpeg", ".png", ".webp"}
MAX_SIDE = 1024   # resize so longest side ≤ 1024px — keeps VRAM/RAM manageable
MAX_BYTES = 20 * 1024 * 1024  # 20 MB hard limit


class ImageLoadError(ValueError):
    pass


def load_image(data: bytes, filename: str) -> Image.Image:
    """
    Validate and normalise raw image bytes.
    Returns an RGB PIL Image with longest side ≤ MAX_SIDE.
    Raises ImageLoadError on invalid input.
    """
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_FORMATS:
        raise ImageLoadError(
            f"Unsupported format '{suffix}'. Supported: {', '.join(SUPPORTED_FORMATS)}"
        )
    if len(data) > MAX_BYTES:
        raise ImageLoadError(f"Image too large ({len(data) // (1024*1024)} MB). Max 20 MB.")

    try:
        img = Image.open(io.BytesIO(data))
    except Exception as e:
        raise ImageLoadError(f"Cannot open image: {e}") from e

    # Convert to RGB (handles RGBA, palette, greyscale)
    img = img.convert("RGB")

    # Resize so longest side ≤ MAX_SIDE, preserving aspect ratio
    w, h = img.size
    if max(w, h) > MAX_SIDE:
        scale = MAX_SIDE / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    return img
