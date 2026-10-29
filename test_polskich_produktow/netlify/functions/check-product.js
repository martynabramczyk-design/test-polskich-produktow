
exports.handler = async (event) => {
  const code = (event.queryStringParameters?.ean || '').trim();

  const response = (statusCode, data) => ({
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300'
    },
    body: JSON.stringify(data)
  });

  if (!/^\d{8,14}$/.test(code)) {
    return response(400, {
      error: 'Wpisz kod EAN/UPC (8–14 cyfr).'
    });
  }

  try {
    const url =
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`;

    const r = await fetch(url, {
      headers: {
        'User-Agent': 'MojDziennikResearch/0.1 (personal food database testing)',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(12000)
    });

    if (!r.ok) {
      return response(502, {
        error: `Open Food Facts HTTP ${r.status}`
      });
    }

    const j = await r.json();

    if (j.status === 0 || !j.product) {
      return response(200, {
        ean: code,
        found: false,
        complete: false,
        name: '',
        brand: '',
        quantity: '',
        kcal: null,
        protein: null,
        fat: null,
        carbs: null,
        source: 'Open Food Facts',
        url: `https://world.openfoodfacts.org/product/${code}`
      });
    }

    const p = j.product;
    const n = p.nutriments || {};

    const val = (key) => {
      const value = n[key];
      if (value === undefined || value === null || value === '') {
        return null;
      }
      const number = Number(value);
      return Number.isFinite(number) ? number : null;
    };

    const result = {
      ean: code,
      found: true,
      name: p.product_name || '',
      brand: p.brands || '',
      quantity: p.quantity || '',
      kcal: val('energy-kcal_100g'),
      protein: val('proteins_100g'),
      fat: val('fat_100g'),
      carbs: val('carbohydrates_100g'),
      source: 'Open Food Facts',
      url: `https://world.openfoodfacts.org/product/${code}`
    };

    result.complete = [
      result.kcal,
      result.protein,
      result.fat,
      result.carbs
    ].every(value => value !== null);

    return response(200, result);

  } catch (error) {
    return response(502, {
      error: 'Nie udało się połączyć z Open Food Facts: ' +
        error.message
    });
  }
};
