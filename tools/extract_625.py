"""세 교과서의 6·25 관련 차시 PDF에서 장마다 글자와 그림을 뽑아 work/625/ 에 저장합니다.

실행: python -I -X utf8 tools/extract_625.py
- work/625/<교과서>_<차시>.txt : 장마다 '=== p.<인쇄 쪽> ===' 머리줄 + 본문 글자
- work/625/png/<교과서>_<차시>_p<쪽>.png : 글자 레이어가 깨진 교과서(비상)를 눈으로 읽기 위한 그림
work/ 는 출판사 저작물이라 git 에 올리지 않습니다.
"""
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF

ROOT = Path(__file__).resolve().parent.parent
TEXTBOOK = ROOT.parent / "classall" / "textbook"
OUT = ROOT / "work" / "625"

# (교과서 id, 폴더, 차시 파일 앞머리, 핵심 여부)
SOURCES = [
    ("chunjae", "천재_5-2", "3단원_11차시", True),
    ("chunjae", "천재_5-2", "3단원_12차시", True),
    ("chunjae", "천재_5-2", "3단원_01차시", False),
    ("chunjae", "천재_5-2", "3단원_08차시", False),
    ("chunjae", "천재_5-2", "3단원_10차시", False),
    ("chunjae", "천재_5-2", "3단원_14차시", False),
    ("icecream", "아이스크림_5-2", "3단원_10차시", True),
    ("icecream", "아이스크림_5-2", "3단원_12차시", True),
    ("icecream", "아이스크림_5-2", "3단원_01차시", False),
    ("icecream", "아이스크림_5-2", "3단원_08차시", False),
    ("icecream", "아이스크림_5-2", "3단원_13차시", False),
    ("icecream", "아이스크림_5-2", "3단원_14차시", False),
    ("visang", "비상_5-2", "3단원_11차시", True),
    ("visang", "비상_5-2", "3단원_08차시", False),
    ("visang", "비상_5-2", "3단원_10차시", False),
]
RENDER = {"visang"}  # 글자 레이어가 깨진 교과서는 그림도 만듭니다


def printed_page(text: str) -> str | None:
    """장 아래쪽 두 줄에서 인쇄된 쪽 번호(2~3자리)를 찾습니다."""
    for line in reversed(text.strip().splitlines()[-2:]):
        # 줄 앞(짝수 쪽 "150 3. …", 비상 "141141…")이나 줄 끝(홀수 쪽 "… 151")
        m = re.match(r"\s*(\d{3})", line) or re.search(r"(?<!\d)(\d{3})\s*$", line)
        if m:
            return m.group(1)
    return None


def main() -> int:
    (OUT / "png").mkdir(parents=True, exist_ok=True)
    for tb, folder, prefix, core in SOURCES:
        matches = sorted((TEXTBOOK / folder / "차시").glob(prefix + "_*.pdf"))
        if len(matches) != 1:
            print(f"!! {folder}/{prefix}: 파일 {len(matches)}개", file=sys.stderr)
            return 1
        lesson = prefix.replace("단원_", "-").replace("차시", "")  # 3단원_11차시 → 3-11
        doc = fitz.open(matches[0])
        found = [printed_page(page.get_text()) for page in doc]
        # 쪽 번호를 못 찾은 장은 찾은 장에서 순번 차이만큼 더하거나 빼서 채웁니다 (차시 PDF 안의 쪽은 이어짐)
        anchor = next(((i, int(p)) for i, p in enumerate(found) if p), None)
        parts = []
        for i, page in enumerate(doc):
            text = page.get_text()
            pg = found[i] or (str(anchor[1] + i - anchor[0]) if anchor else f"x{i}")
            parts.append(f"=== p.{pg} ===\n{text.strip()}\n")
            if tb in RENDER:
                page.get_pixmap(dpi=110).save(OUT / "png" / f"{tb}_{lesson}_p{pg}.png")
        name = f"{tb}_{lesson}{'' if core else '_ref'}.txt"
        (OUT / name).write_text("\n".join(parts), encoding="utf-8")
        print(f"{name}: {len(doc)}장, 쪽 {[p.split()[1] for p in parts]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
