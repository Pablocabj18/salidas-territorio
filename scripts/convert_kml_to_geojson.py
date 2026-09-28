"""Convierte el KML territorial exportado desde My Maps a GeoJSON.

Uso:
    python scripts/convert_kml_to_geojson.py origen.kml public/territorios.geojson
"""

from __future__ import annotations

import json
import sys
from datetime import date
from pathlib import Path
from xml.etree import ElementTree as ET


KML = {"k": "http://www.opengis.net/kml/2.2"}


def parse_coordinates(text: str) -> list[list[float]]:
    coordinates: list[list[float]] = []
    for value in text.split():
        longitude, latitude, *_ = value.split(",")
        coordinates.append([float(longitude), float(latitude)])
    if coordinates and coordinates[0] != coordinates[-1]:
        coordinates.append(coordinates[0])
    return coordinates


def convert(source: Path, destination: Path) -> None:
    root = ET.parse(source).getroot()
    features = []

    for placemark in root.findall(".//k:Placemark", KML):
        name = (placemark.findtext("k:name", default="", namespaces=KML)).strip()
        polygon = placemark.find(".//k:Polygon", KML)
        coordinates_node = placemark.find(".//k:outerBoundaryIs/k:LinearRing/k:coordinates", KML)
        if polygon is None or coordinates_node is None or not coordinates_node.text:
            continue
        try:
            territory_id = int(name)
        except ValueError as error:
            raise ValueError(f"El territorio {name!r} no tiene un número válido") from error

        features.append(
            {
                "type": "Feature",
                "properties": {
                    "id": territory_id,
                    "source": source.name,
                    "updatedAt": date.today().isoformat(),
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [parse_coordinates(coordinates_node.text)],
                },
            }
        )

    features.sort(key=lambda feature: feature["properties"]["id"])
    ids = [feature["properties"]["id"] for feature in features]
    expected = list(range(1, 97))
    if ids != expected:
        missing = sorted(set(expected) - set(ids))
        duplicates = sorted({value for value in ids if ids.count(value) > 1})
        raise ValueError(f"Se esperaban los territorios 1–96. Faltan: {missing}; duplicados: {duplicates}")

    all_points = [point for feature in features for point in feature["geometry"]["coordinates"][0]]
    bounds = {
        "west": min(point[0] for point in all_points),
        "south": min(point[1] for point in all_points),
        "east": max(point[0] for point in all_points),
        "north": max(point[1] for point in all_points),
    }
    collection = {
        "type": "FeatureCollection",
        "metadata": {
            "source": source.name,
            "updatedAt": date.today().isoformat(),
            "territories": len(features),
            "bounds": bounds,
        },
        "features": features,
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(collection, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{len(features)} territorios escritos en {destination}")
    print(json.dumps(bounds, ensure_ascii=False))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Uso: convert_kml_to_geojson.py origen.kml destino.geojson")
    convert(Path(sys.argv[1]), Path(sys.argv[2]))
