"""차시별 교과서 원문을 앱이 읽는 파일 하나로 묶습니다. 선생님 PC에서만 씁니다.

실행: python -I -X utf8 tools/build_local_texts.py --unit 3
- 읽는 곳: work/{단원}/{교과서id}/{차시id}.txt  (tools/extract_lessons.py 가 만든 파일)
- 쓰는 곳: app/local/texts.js  → window.SOKRATES_TEXTS = { 교과서id: { 차시id: 원문 } }
app/local/ 은 출판사 저작물이라 git 에 올리지 않습니다(.gitignore).
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "app" / "local" / "texts.js"


def clean(text: str) -> str:
    """빈 줄과 줄 끝 공백만 정리합니다. 쪽 표시(=== p.130 ===)는 남깁니다."""
    lines = [line.rstrip() for line in text.splitlines()]
    return "\n".join(line for line in lines if line.strip())


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--unit", action="append", required=True, help="단원 번호(여러 번 줄 수 있음)")
    args = ap.parse_args()

    texts: dict[str, dict[str, str]] = {}
    for unit in args.unit:
        base = ROOT / "work" / unit
        if not base.is_dir():
            print(f"없음: {base}", file=sys.stderr)
            return 1
        for book in sorted(p for p in base.iterdir() if p.is_dir() and p.name != "png"):
            for f in sorted(book.glob("*.txt")):
                texts.setdefault(book.name, {})[f.stem] = clean(f.read_text(encoding="utf-8"))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(texts, ensure_ascii=False, indent=1)
    OUT.write_text(
        "// 자동 생성: tools/build_local_texts.py — 교과서 원문(출판사 저작물). git 에 올리지 않습니다.\n"
        f"window.SOKRATES_TEXTS = {body};\n",
        encoding="utf-8",
    )
    count = sum(len(v) for v in texts.values())
    print(f"{OUT.relative_to(ROOT)}: 교과서 {len(texts)}종, 차시 {count}개, {OUT.stat().st_size:,}바이트")
    return 0


if __name__ == "__main__":
    sys.exit(main())
