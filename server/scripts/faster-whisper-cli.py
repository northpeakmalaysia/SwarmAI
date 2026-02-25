#!/usr/bin/env python3
"""
CLI wrapper for faster-whisper Python library.
Makes faster-whisper callable from LocalWhisperService.cjs.

Usage:
  faster-whisper audio.wav --model base --language auto --output_format txt --output_dir /tmp
"""

import argparse
import os
import sys

def main():
    parser = argparse.ArgumentParser(description='Transcribe audio using faster-whisper')
    parser.add_argument('audio', help='Path to audio file')
    parser.add_argument('--model', default='base', help='Whisper model size (tiny/base/small/medium/large-v3)')
    parser.add_argument('--language', default=None, help='Language code (e.g. en, zh, ms). Omit for auto-detect.')
    parser.add_argument('--output_format', default='txt', help='Output format (txt)')
    parser.add_argument('--output_dir', default=None, help='Directory to write output file')
    parser.add_argument('--version', action='store_true', help='Show version')
    args = parser.parse_args()

    if args.version:
        try:
            import faster_whisper
            print(f"faster-whisper {faster_whisper.__version__}")
        except ImportError:
            print("faster-whisper (version unknown)")
        sys.exit(0)

    if not os.path.exists(args.audio):
        print(f"Error: Audio file not found: {args.audio}", file=sys.stderr)
        sys.exit(1)

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("Error: faster-whisper not installed. Run: pip install faster-whisper", file=sys.stderr)
        sys.exit(1)

    # Load model (downloads on first use, cached afterward)
    # Use cpu since Docker typically runs without GPU
    model = WhisperModel(args.model, device="cpu", compute_type="int8")

    # Transcribe
    language = args.language if args.language and args.language != 'auto' else None
    segments, info = model.transcribe(args.audio, language=language, beam_size=5)

    # Collect text
    text_parts = []
    for segment in segments:
        text_parts.append(segment.text.strip())

    full_text = ' '.join(text_parts)

    # Report detected language to stderr (LocalWhisperService parses this)
    if info.language:
        print(f"Detected language: {info.language} (probability: {info.language_probability:.2f})", file=sys.stderr)

    # Write output
    if args.output_dir:
        base_name = os.path.splitext(os.path.basename(args.audio))[0]
        out_path = os.path.join(args.output_dir, f"{base_name}.txt")
        with open(out_path, 'w', encoding='utf-8') as f:
            f.write(full_text)

    # Also print to stdout
    print(full_text)

if __name__ == '__main__':
    main()
