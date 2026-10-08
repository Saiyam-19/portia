"""Quick sanity check for VesselAPI endpoints."""
import os, json, httpx
from dotenv import load_dotenv

load_dotenv()

BASE_URL = "https://api.vesselapi.com"
API_KEY  = os.environ["VESSEL_API_KEY"]
HEADERS  = {"Authorization": f"Bearer {API_KEY}", "Accept": "application/json"}


def search(q: str, limit: int = 5) -> dict:
    r = httpx.get(
        f"{BASE_URL}/v1/search/vessels",
        params={"q": q, "pagination.limit": limit},
        headers=HEADERS,
        timeout=10,
    )
    r.raise_for_status()
    return r.json()


def lookup(id: str, id_type: str = "imo") -> dict:
    r = httpx.get(
        f"{BASE_URL}/v1/vessel/{id}",
        params={"filter.idType": id_type},
        headers=HEADERS,
        timeout=10,
    )
    r.raise_for_status()
    return r.json()


if __name__ == "__main__":
    print("=== Search: EVER GIVEN ===")
    result = search("EVER GIVEN")
    print(json.dumps(result, indent=2))

    vessels = result.get("vessels") or result.get("data") or result.get("results") or []
    if vessels:
        first = vessels[0]
        imo  = first.get("imo")
        mmsi = first.get("mmsi")
        print(f"\n=== Lookup by IMO: {imo} ===")
        print(json.dumps(lookup(str(imo), "imo"), indent=2))
        print(f"\n=== Lookup by MMSI: {mmsi} ===")
        print(json.dumps(lookup(str(mmsi), "mmsi"), indent=2))
