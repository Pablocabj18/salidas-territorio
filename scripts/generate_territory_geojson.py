import json
import math
import re
import xml.etree.ElementTree as ET
import unicodedata
from pathlib import Path

import pdfplumber
from shapely.geometry import LineString, mapping, Point
from shapely.ops import polygonize, unary_union

ROOT = Path(__file__).resolve().parents[1]
OSM_FILE = Path(r"C:\tmp\sf-map.osm")
PDF_FILE = Path(r"C:\Users\Pablo\Desktop\Territorios.pdf")
DATA_FILE = ROOT / "src" / "data" / "territorios.ts"
OUTPUT_FILE = ROOT / "public" / "territorios.geojson"

GEO = {"north": -31.385, "south": -31.478, "west": -62.137, "east": -62.027}


def load_territories():
    source = DATA_FILE.read_text(encoding="utf-8")
    match = re.search(r"const base: TerritorioBase\[\] = (\[.*?\]);", source, re.S)
    if not match:
        raise RuntimeError("No se encontro el catalogo territorial")
    return json.loads(match.group(1))


STOP_WORDS = {"avenida", "av", "bv", "bulevar", "boulevard", "calle", "pasaje", "pje", "norte", "sur", "del", "los", "las", "san", "santa", "doctor", "dr"}


def normalize(value):
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]", "", value)


def load_pdf_context():
    with pdfplumber.open(PDF_FILE) as document:
        page = document.pages[0]
        labels = []
        for word in page.extract_words():
            if (
                re.fullmatch(r"(?:[1-9]|[1-8][0-9]|9[0-6])", word["text"])
                and word["upright"]
                and word["height"] > 20
            ):
                labels.append(
                    (
                        int(word["text"]),
                        (word["x0"] + word["x1"]) / 2,
                        (word["top"] + word["bottom"]) / 2,
                    )
                )
        words = page.extract_words()
        rects = [
            rect
            for rect in page.rects
            if rect.get("fill")
            and rect.get("non_stroking_color") is not None
            and rect["width"] > 12
            and rect["height"] > 12
            and rect["width"] * rect["height"] > 500
        ]
        counts = {territory_id: 0 for territory_id, _, _ in labels}
        for rect in rects:
            cx = (rect["x0"] + rect["x1"]) / 2
            cy = (rect["top"] + rect["bottom"]) / 2
            territory_id, x, y = min(
                labels, key=lambda label: (label[1] - cx) ** 2 + (label[2] - cy) ** 2
            )
            if math.hypot(x - cx, y - cy) < 240:
                counts[territory_id] += 1
        contexts = {}
        for territory_id, x, y in labels:
            tokens = set()
            for word in words:
                wx = (word["x0"] + word["x1"]) / 2
                wy = (word["top"] + word["bottom"]) / 2
                if abs(wx - x) < 260 and abs(wy - y) < 190:
                    token = normalize(word["text"])
                    if len(token) >= 4 and token not in STOP_WORDS and not token.isdigit():
                        tokens.add(token)
                        tokens.add(token[::-1])
            contexts[territory_id] = tokens
    targets = {key: max(1, min(6, round(value / 2))) for key, value in counts.items()}
    return targets, contexts


def load_city_blocks():
    root = ET.parse(OSM_FILE).getroot()
    nodes = {
        node.attrib["id"]: (float(node.attrib["lon"]), float(node.attrib["lat"]))
        for node in root.findall("node")
    }
    lines = []
    named_lines = []
    for way in root.findall("way"):
        tags = {tag.attrib["k"]: tag.attrib["v"] for tag in way.findall("tag")}
        if "highway" not in tags:
            continue
        points = [nodes[nd.attrib["ref"]] for nd in way.findall("nd") if nd.attrib["ref"] in nodes]
        if len(points) > 1:
            line = LineString(points)
            lines.append(line)
            if tags.get("name"):
                tokens = {normalize(part) for part in re.split(r"\s+", tags["name"]) if len(normalize(part)) >= 4 and normalize(part) not in STOP_WORDS}
                named_lines.append((line, tokens, tags["name"]))
    network = unary_union(lines)
    blocks = []
    for polygon in polygonize(network):
        center = polygon.centroid
        if not (GEO["west"] < center.x < GEO["east"] and GEO["south"] < center.y < GEO["north"]):
            continue
        if 1e-9 < polygon.area < 4e-6:
            blocks.append(polygon)
    block_tokens = []
    for block in blocks:
        tokens = set()
        names = set()
        boundary = block.boundary.buffer(0.000035)
        for line, line_tokens, name in named_lines:
            if line.intersects(boundary):
                tokens.update(line_tokens)
                names.add(name)
        block_tokens.append((tokens, names))
    return blocks, block_tokens


def location(territory):
    lat = GEO["north"] + territory["y"] / 100 * (GEO["south"] - GEO["north"])
    lon = GEO["west"] + territory["x"] / 100 * (GEO["east"] - GEO["west"])
    return Point(lon, lat)


def assign_blocks(territories, blocks, block_tokens, targets, contexts):
    available = set(range(len(blocks)))
    assignments = {}
    document_frequency = {}
    for tokens, _ in block_tokens:
        for token in tokens:
            document_frequency[token] = document_frequency.get(token, 0) + 1

    def street_score(territory, index):
        matches = contexts[territory["id"]] & block_tokens[index][0]
        return sum(math.log((len(blocks) + 1) / (document_frequency.get(token, 0) + 1)) for token in matches)

    def best_score(territory):
        return max((street_score(territory, index) for index in range(len(blocks))), default=0)

    ordered = sorted(territories, key=lambda item: (best_score(item), targets[item["id"]]), reverse=True)
    for territory in ordered:
        target = targets[territory["id"]]
        marker = location(territory)
        nearest = sorted(
            available,
            key=lambda index: (
                -street_score(territory, index),
                blocks[index].distance(marker),
            ),
        )
        if not nearest:
            assignments[territory["id"]] = []
            continue
        chosen = [nearest[0]]
        available.remove(nearest[0])
        while len(chosen) < target and available:
            current = unary_union([blocks[index] for index in chosen])
            adjacent = sorted(
                available,
                key=lambda index: (
                    0 if blocks[index].distance(current) < 0.00008 else 1,
                    blocks[index].distance(current),
                    blocks[index].distance(marker),
                ),
            )
            selected = adjacent[0]
            if blocks[selected].distance(marker) > 0.012:
                break
            chosen.append(selected)
            available.remove(selected)
        assignments[territory["id"]] = chosen
        if territory["id"] in {1, 20, 36, 59, 63, 73, 96}:
            print(
                "anchor",
                territory["id"],
                round(street_score(territory, chosen[0]), 2),
                sorted(block_tokens[chosen[0]][1]),
            )
    return assignments


def main():
    territories = load_territories()
    targets, contexts = load_pdf_context()
    blocks, block_tokens = load_city_blocks()
    assignments = assign_blocks(territories, blocks, block_tokens, targets, contexts)
    features = []
    for territory in territories:
        selected = assignments[territory["id"]]
        if not selected:
            continue
        geometry = unary_union([blocks[index] for index in selected])
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "id": territory["id"],
                    "categoria": territory["categoria"],
                    "blocks": len(selected),
                    "preliminary": True,
                },
                "geometry": mapping(geometry),
            }
        )
    collection = {"type": "FeatureCollection", "features": features}
    OUTPUT_FILE.write_text(json.dumps(collection, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"blocks={len(blocks)} features={len(features)} output={OUTPUT_FILE}")


if __name__ == "__main__":
    main()
