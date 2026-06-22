import argparse
import json

from faster_whisper import WhisperModel


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio-path", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--device", required=True)
    parser.add_argument("--compute-type", required=True)
    parser.add_argument("--language", default="")
    args = parser.parse_args()

    model = WhisperModel(args.model, device=args.device, compute_type=args.compute_type)

    transcribe_kwargs = {
        "beam_size": 5,
        "vad_filter": True,
    }

    if args.language.strip():
        transcribe_kwargs["language"] = args.language.strip()

    segments, info = model.transcribe(args.audio_path, **transcribe_kwargs)
    text = " ".join(segment.text.strip() for segment in segments if segment.text.strip()).strip()

    print(
        json.dumps(
            {
                "text": text,
                "language": getattr(info, "language", None),
            },
            ensure_ascii=True,
        )
    )


if __name__ == "__main__":
    main()
