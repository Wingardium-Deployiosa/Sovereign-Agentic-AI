"""Place model assets here.

  models/whisper/  - Faster-Whisper CTranslate2 model directory
                     (model.bin, config.json, tokenizer.json, vocabulary.txt)
  models/silero/   - silero_vad.onnx
  models/piper/    - <voice>.onnx + <voice>.onnx.json (e.g. en_US-amy-low.onnx)
"""

# Directories exist for local model placement. They are intentionally empty
# in source control. Do NOT check large model weights into git.
#
# The application never downloads models. Use --check-models to verify
# what is present, and obtain files manually from:
#   * Systran/faster-whisper-*       -> models/whisper/
#   * snakers4/silero-vad            -> models/silero/silero_vad.onnx
#   * rhasspy/piper-voices          -> models/piper/<voice>.onnx
