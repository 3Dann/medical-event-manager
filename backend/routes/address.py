import json
import httpx
from fastapi import APIRouter, Query, HTTPException

router = APIRouter(prefix='/api/address', tags=['address'])

GOV_API       = 'https://data.gov.il/api/3/action/datastore_search'
CITIES_RID    = '5c78e9fa-c2e2-4771-93ff-7f400a12f7ba'
STREETS_RID   = 'a7296d1a-f8c9-4b70-96c2-6ebb4352f8e3'
NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'
TIMEOUT       = 10.0

_cities_cache: list | None = None


@router.get('/cities')
async def get_cities():
    global _cities_cache
    if _cities_cache is not None:
        return {'records': _cities_cache}

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            resp = await client.get(
                GOV_API,
                params={'resource_id': CITIES_RID, 'limit': 1500},
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            raise HTTPException(502, 'שגיאה בטעינת נתוני ישובים')

    records = data.get('result', {}).get('records', [])
    _cities_cache = [
        {'name': r.get('שם_ישוב', '').strip(), 'code': str(r.get('סמל_ישוב', ''))}
        for r in records
        if r.get('שם_ישוב', '').strip()
    ]
    return {'records': _cities_cache}


@router.get('/streets')
async def get_streets(city_code: int = Query(...)):
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            resp = await client.get(
                GOV_API,
                params={
                    'resource_id': STREETS_RID,
                    'filters': f'{{"סמל_ישוב":{city_code}}}',
                    'limit': 3000,
                },
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            raise HTTPException(502, 'שגיאה בטעינת נתוני רחובות')

    records = data.get('result', {}).get('records', [])
    streets = [
        {'name': r.get('שם_רחוב', '').strip(), 'code': str(r.get('סמל_רחוב', ''))}
        for r in records
        if r.get('שם_רחוב', '').strip()
    ]
    return {'records': streets}


@router.get('/postal-code')
async def get_postal_code(
    city: str = Query(...),
    street: str = Query(...),
):
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        try:
            resp = await client.get(
                NOMINATIM_URL,
                params={
                    'q': f'{street}, {city}',
                    'countrycodes': 'IL',
                    'format': 'json',
                    'addressdetails': '1',
                    'limit': '1',
                },
                headers={'User-Agent': 'OrlyMedical/1.0 (contact@ormed.co.il)'},
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception:
            return {'postal_code': None}

    postal_code = data[0]['address'].get('postcode') if data else None
    return {'postal_code': postal_code}
