
const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

const reply = (statusCode, body) => ({
  statusCode,
  headers,
  body: JSON.stringify(body)
});

const norm = (s) => String(s || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const num = (x) =>
  x === null || x === undefined || x === ''
    ? null
    : Number.isFinite(Number(x)) ? Number(x) : null;

function mapProduct(p) {
  const n = p.nutriments || {};
  const kcal = num(n['energy-kcal_100g']);
  const protein = num(n.proteins_100g);
  const fat = num(n.fat_100g);
  const carbs = num(n.carbohydrates_100g);

  return {
    ean: String(p.code || ''),
    name: p.product_name_pl || p.product_name || '',
    brand: p.brands || '',
    quantity: p.quantity || '',
    kcal,
    protein,
    fat,
    carbs,
    complete: [kcal, protein, fat, carbs].every(v => v !== null),
    image: p.image_front_small_url || null,
    url: `https://pl.openfoodfacts.org/product/${encodeURIComponent(p.code || '')}`,
    source: 'Open Food Facts'
  };
}

exports.handler = async (event) => {
  const query = String(event.queryStringParameters?.q || '').trim();
  const ean = String(event.queryStringParameters?.ean || '').trim();

  if (!query && !ean) {
    return reply(400, { error: 'Podaj nazwę produktu lub EAN.' });
  }

  if (query.length > 100) {
    return reply(400, { error: 'Nazwa jest za długa.' });
  }

  if (ean && !/^\d{8,14}$/.test(ean)) {
    return reply(400, { error: 'EAN musi mieć 8–14 cyfr.' });
  }

  try {
    let url;

    if (ean) {
      url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(ean)}.json?fields=code,product_name,product_name_pl,brands,quantity,nutriments,image_front_small_url`;
    } else {
      const qs = new URLSearchParams({
        search_terms: query,
        search_simple: '1',
        action: 'process',
        json: '1',
        page_size: '30',
        fields: 'code,product_name,product_name_pl,brands,quantity,nutriments,image_front_small_url'
      });

      url = `https://world.openfoodfacts.org/cgi/search.pl?${qs}`;
    }

    const r = await fetch(url, {
      headers: {
        'User-Agent': 'MojDziennikTester/1.0 (personal non-commercial nutrition research)',
        'Accept': 'application/json'
      },
      signal: AbortSignal.timeout(15000)
    });

    if (r.status === 404 && ean) {
      return reply(200, {
        results: [],
        count: 0,
        notice: 'Nie znaleziono produktu o tym kodzie.'
      });
    }

    if (!r.ok) {
      return reply(502, {
        error: `Open Food Facts zwrócił HTTP ${r.status}. Spróbuj ponownie później.`
      });
    }

    const data = await r.json();

    const products = ean
      ? (data.status === 0 || !data.product ? [] : [data.product])
      : (Array.isArray(data.products) ? data.products : []);

    const terms = norm(query).split(' ').filter(Boolean);

    const scored = products.map(p => {
      const v = mapProduct(p);
      const hay = norm(`${v.name} ${v.brand}`);
      const score = terms.reduce(
        (a, t) => a + (hay.includes(t) ? 1 : 0), 0
      );
      return { ...v, score };
    })
    .filter(v => v.name)
    .sort((a, b) =>
      b.score - a.score ||
      Number(b.complete) - Number(a.complete)
    );

    return reply(200, {
      results: scored,
      count: scored.length,
      notice: scored.length
        ? ''
        : 'Nie znaleziono pasujących produktów. Spróbuj krótszej nazwy.'
    });

  } catch (e) {
    return reply(502, {
      error: 'Nie udało się pobrać danych: ' +
        (e?.name === 'TimeoutError'
          ? 'przekroczony czas oczekiwania'
          : e.message)
    });
  }
};
