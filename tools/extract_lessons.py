"""한 단원의 차시 PDF(세 교과서)에서 장마다 글자를 뽑아 work/{단원}/ 에 저장합니다.

실행: python -I -X utf8 tools/extract_lessons.py --unit 3
- work/{단원}/{교과서id}/{단원}-{차시}.txt : 장마다 '=== p.{인쇄 쪽} ===' 머리줄 + 본문 글자
- work/{단원}/png/{교과서id}_{단원}-{차시}_p{쪽}.png : 글자 레이어가 깨졌거나 거의 없는 장만, 눈으로 읽기 위한 그림
work/ 는 출판사 저작물이라 git 에 올리지 않습니다.
"""
import argparse
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parent.parent
TEXTBOOK = ROOT.parent / "classall" / "textbook"
BOOKS = [("chunjae", "천재_5-2"), ("icecream", "아이스크림_5-2"), ("visang", "비상_5-2")]
HANGUL = re.compile(r"[가-힣]")
BROKEN = re.compile(r"[�-]")


def printed_page(text: str) -> str | None:
    """장 아래쪽 두 줄에서 인쇄된 쪽 번호(2~3자리)를 찾습니다."""
    for line in reversed(text.strip().splitlines()[-2:]):
        # 줄 앞(짝수 쪽 "150 3. …", 비상 "141141…")이나 줄 끝(홀수 쪽 "… 151")
        m = re.match(r"\s*(\d{2,3})(?!\d)", line) or re.match(r"\s*(\d{3})", line) or re.search(r"(?<!\d)(\d{2,3})\s*$", line)
        if m:
            return m.group(1)
    return None


def needs_picture(text: str) -> bool:
    """한글이 30자 미만이거나 깨진 글자가 10% 넘으면 그림으로도 읽습니다."""
    chars = [c for c in text if not c.isspace()]
    if len(HANGUL.findall(text)) < 30:
        return True
    return bool(chars) and len(BROKEN.findall(text)) / len(chars) > 0.10


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--unit", type=int, required=True)
    unit = ap.parse_args().unit
    out = ROOT / "work" / str(unit)
    (out / "png").mkdir(parents=True, exist_ok=True)
    for tb, folder in BOOKS:
        files = sorted((TEXTBOOK / folder / "차시").glob(f"{unit}단원_*차시_*.pdf"))
        (out / tb).mkdir(exist_ok=True)
        pictures = 0
        for f in files:
            lesson = f"{unit}-{int(re.search(r'_(\d+)차시', f.name).group(1))}"
            doc = fitz.open(f)
            found = [printed_page(page.get_text()) for page in doc]
            anchor = next(((i, int(p)) for i, p in enumerate(found) if p), None)
            parts = []
            for i, page in enumerate(doc):
                text = page.get_text()
                # 쪽 번호를 못 찾은 장은 찾은 장에서 순번 차이만큼 더해 채우고 '?'를 붙입니다(펼침면이면 어긋날 수 있음)
                pg = found[i] or (f"{anchor[1] + i - anchor[0]}?" if anchor else f"x{i}")
                parts.append(f"=== p.{pg} ===\n{text.strip()}\n")
                if needs_picture(text):
                    page.get_pixmap(dpi=110).save(out / "png" / f"{tb}_{lesson}_p{pg.rstrip('?')}.png")
                    pictures += 1
            (out / tb / f"{lesson}.txt").write_text("\n".join(parts), encoding="utf-8")
            print(f"  {tb} {lesson}: {len(doc)}장, 쪽 {[p.split()[1] for p in parts]}")
        print(f"{tb}: 파일 {len(files)}개, 그림으로 만든 장 {pictures}개")
    return 0


if __name__ == "__main__":
    sys.exit(main())
