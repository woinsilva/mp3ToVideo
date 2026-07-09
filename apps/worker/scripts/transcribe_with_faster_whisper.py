import argparse
import json
import os
from pathlib import Path
import traceback

from faster_whisper import WhisperModel


def register_windows_dll_directories() -> None:
    if os.name != "nt" or not hasattr(os, "add_dll_directory"):
        return

    raw_paths = os.environ.get("WHISPER_EXTRA_PATHS", "")

    for path_str in raw_paths.split(";"):
        candidate = path_str.strip()

        if not candidate:
            continue

        path = Path(candidate)

        if path.exists():
            os.add_dll_directory(str(path))


def should_retry_on_cpu(error: Exception, device: str) -> bool:
    if device != "cuda":
        return False

    message = str(error).lower()
    markers = [
        "cublas",
        "cudnn",
        "cuda",
        "cannot be loaded",
        "not found",
    ]

    return any(marker in message for marker in markers)


def transcribe_once(
    audio_path: str,
    model_name: str,
    device: str,
    compute_type: str,
    language: str,
) -> dict:
    model = WhisperModel(model_name, device=device, compute_type=compute_type)

    transcribe_kwargs = {
        "beam_size": 5,
        "vad_filter": True,
    }

    if language.strip():
        transcribe_kwargs["language"] = language.strip()

    segments, info = model.transcribe(audio_path, **transcribe_kwargs)
    text = " ".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()

    if not text:
        raise RuntimeError("Whisper returned an empty transcript")

    return {
        "text": text,
        "language": getattr(info, "language", None),
        "device": device,
        "computeType": compute_type,
    }


def main() -> None:
    register_windows_dll_directories()

    parser = argparse.ArgumentParser()
    parser.add_argument("--audio-path", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--device", required=True)
    parser.add_argument("--compute-type", required=True)
    parser.add_argument("--fallback-device", default="cpu")
    parser.add_argument("--fallback-compute-type", default="int8")
    parser.add_argument("--language", default="")
    args = parser.parse_args()

    try:
        payload = transcribe_once(
            args.audio_path,
            args.model,
            args.device,
            args.compute_type,
            args.language,
        )
    except Exception as error:
        if should_retry_on_cpu(error, args.device):
            payload = transcribe_once(
                args.audio_path,
                args.model,
                args.fallback_device,
                args.fallback_compute_type,
                args.language,
            )
        else:
            raise

    print(
        json.dumps(
            payload,
            ensure_ascii=True,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception:
        traceback.print_exc()
        raise
