import threading

from run_voice_assistant import parse_args
from run_voice_assistant import run_continuous


def test_parse_args_supports_continuous_mode() -> None:
    args = parse_args(["--mode", "continuous"])
    assert args.mode == "continuous"


def test_continuous_mode_toggles_microphone_and_stops_recording(
    monkeypatch,
) -> None:
    recording_started = threading.Event()
    calls = []

    class FakePipeline:
        def run_once(self, **kwargs):
            calls.append(kwargs)
            recording_started.set()
            kwargs["stop_event"].wait()
            return None

    commands = iter(["on", "off", "exit"])

    def fake_input(prompt):
        command = next(commands)
        if command == "off":
            assert recording_started.wait(1)
        return command

    monkeypatch.setattr("builtins.input", fake_input)
    assert run_continuous(FakePipeline()) == 0
    assert calls[0]["mode"] == "vad"
    assert calls[0]["stop_event"].is_set()