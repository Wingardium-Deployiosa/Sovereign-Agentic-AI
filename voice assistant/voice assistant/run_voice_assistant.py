"""CLI entry point for the Sovereign Voice Assistant.

Supports:

  python run_voice_assistant.py --mode vad
  python run_voice_assistant.py --mode push-to-talk
  python run_voice_assistant.py --text
  python run_voice_assistant.py --demo
"""

from __future__ import annotations

import argparse
import logging
import sys
import threading
from pathlib import Path
from typing import Optional

# Make `app` importable when run as a script.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app.config import AppConfig, configure_logging  # noqa: E402
from app.models_check import check_all_models  # noqa: E402
from app.pipeline import VoiceAssistantPipeline  # noqa: E402

logger = logging.getLogger("voice_assistant")


def parse_args(argv: Optional[list] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        prog="sovereign-voice",
        description="Sovereign on-premise voice assistant.",
    )
    parser.add_argument(
        "--mode",
        choices=["vad", "push-to-talk", "continuous"],
        default="vad",
        help="Microphone recording mode.",
    )
    parser.add_argument(
        "--text",
        action="store_true",
        help="Use text input instead of microphone.",
    )
    parser.add_argument(
        "--demo",
        action="store_true",
        help="Run a deterministic demo conversation (no mic, no models).",
    )
    parser.add_argument(
        "--duration",
        type=float,
        default=None,
        help="Fixed recording duration in seconds (for push-to-talk).",
    )
    parser.add_argument(
        "--env-file",
        default=None,
        help="Optional path to a .env file.",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Process a single utterance and exit.",
    )
    parser.add_argument(
        "--check-models",
        action="store_true",
        help="Check that all required local model files are present and exit.",
    )
    return parser.parse_args(argv)


def run_demo(pipeline: VoiceAssistantPipeline) -> int:
    samples = [
        "Hello, are you online?",
        "Summarize the inspection report",
        "Initiate shutdown sequence",
        "Check the maintenance safety protocol",
    ]
    print("[DEMO] Starting deterministic demo. No microphone, no models.")
    for text in samples:
        print(f"\n> {text}")
        result = pipeline.run_text(text)
        print(f"< {result.response}")
    print("\n[DEMO] Complete.")
    return 0


def run_text_loop(
    pipeline: VoiceAssistantPipeline, once: bool
) -> int:
    print("[TEXT] Type a message and press Enter. Submit an empty line to exit.")
    while True:
        try:
            message = input("> ")
        except EOFError:
            break
        if not message.strip():
            if once:
                break
            print("[TEXT] Exiting.")
            break
        result = pipeline.run_text(message)
        print(f"< {result.response}")
        if once:
            break
    return 0


def run_voice(
    pipeline: VoiceAssistantPipeline,
    mode: str,
    once: bool,
    duration: Optional[float] = None,
) -> int:
    try:
        while True:
            fixed_seconds = duration if mode == "push-to-talk" else None
            result = pipeline.run_once(mode=mode, fixed_seconds=fixed_seconds)
            if result is not None:
                print(f"< {result.response}")
            if once:
                break
    except KeyboardInterrupt:
        print("\n[VOICE] Interrupted by user.")
    return 0


def run_continuous(pipeline: VoiceAssistantPipeline) -> int:
    microphone_on = threading.Event()
    stop_recording = threading.Event()
    shutdown = threading.Event()

    print("[MIC] OFF")
    print("[MIC] Turn microphone ON to start listening")

    def command_loop() -> None:
        while not shutdown.is_set():
            try:
                command = input("[MIC] Enter ON or OFF: ").strip().lower()
            except EOFError:
                shutdown.set()
                microphone_on.clear()
                stop_recording.set()
                return
            if command == "on":
                if not microphone_on.is_set():
                    microphone_on.set()
                    stop_recording.clear()
                    print("[MIC] ON")
            elif command == "off":
                if microphone_on.is_set():
                    microphone_on.clear()
                    stop_recording.set()
                    print("[MIC] OFF")
            elif command in {"quit", "exit"}:
                shutdown.set()
                microphone_on.clear()
                stop_recording.set()
                print("[MIC] OFF")
                return

    command_thread = threading.Thread(target=command_loop, daemon=True)
    command_thread.start()
    try:
        while not shutdown.is_set():
            if not microphone_on.wait(0.1):
                continue
            stop_recording.clear()
            result = pipeline.run_once(
                mode="vad",
                stop_event=stop_recording,
            )
            if result is not None:
                print(f"[STT] You said: {result.transcript}")
                print(f"< {result.response}")
    except KeyboardInterrupt:
        print("\n[MIC] OFF")
    finally:
        shutdown.set()
        microphone_on.clear()
        stop_recording.set()
    return 0


def main(argv: Optional[list] = None) -> int:
    args = parse_args(argv)
    config = AppConfig.from_env(Path(args.env_file) if args.env_file else None)
    configure_logging(config.log_level)

    logger.info("Loaded configuration: backend=%s", config.backend.url)

    if args.check_models:
        checks = check_all_models(config)
        all_ok = True
        for c in checks:
            print(c.format())
            if not c.ok:
                all_ok = False
        return 0 if all_ok else 1

    with VoiceAssistantPipeline(config) as pipeline:
        logger.info(
            "Whisper available=%s | Piper available=%s | VAD stub=%s",
            pipeline.stt.is_available,
            pipeline.tts.is_available,
            pipeline.vad.is_stub,
        )
        if args.demo:
            return run_demo(pipeline)
        if args.text:
            return run_text_loop(pipeline, once=args.once)
        if args.mode == "continuous":
            return run_continuous(pipeline)
        return run_voice(
            pipeline, args.mode, once=args.once, duration=args.duration
        )


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())