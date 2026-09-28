"""Genera cuadras dentro de los territorios a partir de calles de OpenStreetMap.

Uso:
  pip install -r scripts/requirements-geometry.txt
  python scripts/generate_blocks_from_osm.py public/territorios.geojson public/cuadras.geojson

La salida conserva procedencia, fecha y parámetros. Las geometrías son una ayuda
operativa y deben revisarse cuando OSM tenga calles incompletas o pasajes privados.
"""

from __future__ import annotations

import json
import math
import sys
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date
from pathlib import Path

from shapely.geometry import LineString, MultiPolygon, Polygon, mapping, shape
from shapely.ops import transform, unary_union

LAT0 = -31.42
LON0 = -62.108
METERS_PER_LAT = 110_540.0
METERS_PER_LON = 111_320.0 * math.cos(math.radians(LAT0))

ROAD_WIDTHS = {
    "motorway": 12.0,
    "trunk": 10.0,
    "primary": 8.0,
    "secondary": 7.0,
    "tertiary": 6.0,
    "residential": 5.0,
    "living_street": 4.5,
    "unclassified": 4.5,
    "service": 3.0,
}
MIN_BLOCK_AREA_M2 = 650.0


def to_meters(geometry):
    return transform(lambda x, y, z=None: ((x - LON0) * METERS_PER_LON, (y - LAT0) * METERS_PER_LAT), geometry)


def to_lonlat(geometry):
    return transform(lambda x, y, z=None: (x / METERS_PER_LON + LON0, y / METERS_PER_LAT + LAT0), geometry)


def fetch_roads(bounds: tuple[float, float, float, float]) -> dict:
    west, south, east, north = bounds
    highway_values = "|".join(ROAD_WIDTHS)
    query = f'''[out:json][timeout:90];
      way["highway"~"^({highway_values})$"]({south},{west},{north},{east});
      out tags geom;'''
    body = urllib.parse.urlencode({"data": query}).encode()
    endpoints = (
        "https://overpass-api.de/api/interpreter",
        "https://overpass.kumi.systems/api/interpreter",
    )
    last_error: Exception | None = None
    for endpoint in endpoints:
        try:
            request = urllib.request.Request(
                endpoint,
                data=body,
                headers={"User-Agent": "salidas-territorio/1.0 (geometry generation)"},
            )
            with urllib.request.urlopen(request, timeout=120) as response:
                return json.load(response)
        except Exception as error:  # pragma: no cover - fallback de red
            last_error = error
    raise RuntimeError(f"No se pudo consultar Overpass: {last_error}")


def road_buffers(osm: dict):
    buffers = []
    included = Counter()
    for element in osm.get("elements", []):
        tags = element.get("tags", {})
        road_type = tags.get("highway")
        geometry = element.get("geometry", [])
        if road_type not in ROAD_WIDTHS or len(geometry) < 2:
            continue
        if road_type == "service" and not tags.get("name"):
            continue
        coords = [(point["lon"], point["lat"]) for point in geometry]
        line = to_meters(LineString(coords))
        buffers.append(line.buffer(ROAD_WIDTHS[road_type] / 2, cap_style="flat", join_style="round"))
        included[road_type] += 1
    if not buffers:
        raise RuntimeError("La consulta no devolvió calles utilizables")
    return unary_union(buffers), included


def polygon_parts(geometry):
    if geometry.is_empty:
        return []
    if isinstance(geometry, Polygon):
        return [geometry]
    if isinstance(geometry, MultiPolygon):
        return list(geometry.geoms)
    return [item for item in geometry.geoms if isinstance(item, Polygon)]


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("Uso: generate_blocks_from_osm.py territorios.geojson cuadras.geojson")

    source_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])
    territories = json.loads(source_path.read_text(encoding="utf-8"))
    metadata = territories.get("metadata", {})
    source_bounds = metadata.get("bounds")
    if not source_bounds:
        raise RuntimeError("El GeoJSON territorial no contiene metadata.bounds")

    margin = 0.002
    bounds = (
        source_bounds["west"] - margin,
        source_bounds["south"] - margin,
        source_bounds["east"] + margin,
        source_bounds["north"] + margin,
    )
    osm = fetch_roads(bounds)
    roads, road_counts = road_buffers(osm)

    features = []
    reviews = []
    count_by_territory = {}
    for territory_feature in territories["features"]:
        territory_id = int(territory_feature["properties"]["id"])
        territory = to_meters(shape(territory_feature["geometry"]))
        remaining = territory.difference(roads)
        pieces = [part.buffer(0) for part in polygon_parts(remaining) if part.area >= MIN_BLOCK_AREA_M2]
        pieces.sort(key=lambda part: (-round(part.centroid.y / 25), round(part.centroid.x / 25)))

        if not pieces:
            pieces = [territory]
            reviews.append(territory_id)

        retained_ratio = sum(part.area for part in pieces) / max(territory.area, 1)
        if len(pieces) > 8 or retained_ratio < 0.52:
            reviews.append(territory_id)

        count_by_territory[str(territory_id)] = len(pieces)
        for index, block in enumerate(pieces, start=1):
            block_id = f"T{territory_id:02d}-C{index:02d}"
            lonlat = to_lonlat(block)
            features.append({
                "type": "Feature",
                "properties": {
                    "id": block_id,
                    "territorioId": territory_id,
                    "numero": index,
                    "areaM2": round(block.area),
                    "source": "OpenStreetMap highways + Territorio OESTE.kml",
                    "updatedAt": date.today().isoformat(),
                    "needsReview": territory_id in reviews,
                },
                "geometry": mapping(lonlat),
            })

    result = {
        "type": "FeatureCollection",
        "metadata": {
            "source": "OpenStreetMap via Overpass API; recorte por Territorio OESTE.kml",
            "updatedAt": date.today().isoformat(),
            "method": "Diferencia entre cada territorio y corredores de calles vehiculares",
            "minimumBlockAreaM2": MIN_BLOCK_AREA_M2,
            "roadHalfWidthsM": {key: value / 2 for key, value in ROAD_WIDTHS.items()},
            "roadWaysUsed": dict(road_counts),
            "blocks": len(features),
            "territories": 96,
            "countByTerritory": count_by_territory,
            "territoriesNeedingReview": sorted(set(reviews)),
            "license": "Datos © contribuidores de OpenStreetMap, ODbL 1.0",
            "attributionUrl": "https://www.openstreetmap.org/copyright",
        },
        "features": features,
    }
    output_path.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    counts = Counter(count_by_territory.values())
    print(f"Cuadras generadas: {len(features)}")
    print(f"Distribución por territorio: {dict(sorted(counts.items(), key=lambda item: int(item[0])))}")
    print(f"Revisión sugerida: {sorted(set(reviews))}")


if __name__ == "__main__":
    main()
