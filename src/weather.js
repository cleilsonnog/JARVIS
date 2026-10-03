// ===== Weather (Open-Meteo: free, no API key) =====
// City from the briefing settings (or JARVIS_CITY, e.g. "São Pedro da Aldeia, RJ");
// geocoded once per city, forecast cached 30 min.

const CACHE_MS = 30 * 60 * 1000;
const places = new Map(); // city -> geocoding result
let cache = { at: 0, city: null, data: null };

// WMO weather codes -> Portuguese
const WMO = {
  0: "céu limpo", 1: "predominantemente limpo", 2: "parcialmente nublado", 3: "nublado",
  45: "neblina", 48: "neblina com geada",
  51: "garoa fraca", 53: "garoa", 55: "garoa forte", 56: "garoa congelante", 57: "garoa congelante forte",
  61: "chuva fraca", 63: "chuva", 65: "chuva forte", 66: "chuva congelante", 67: "chuva congelante forte",
  71: "neve fraca", 73: "neve", 75: "neve forte", 77: "grãos de neve",
  80: "pancadas de chuva fracas", 81: "pancadas de chuva", 82: "pancadas de chuva fortes",
  85: "pancadas de neve", 86: "pancadas de neve fortes",
  95: "trovoadas", 96: "trovoadas com granizo", 99: "trovoadas com granizo forte",
};

async function geocode(city) {
  const [name, uf] = city.split(",").map((s) => s.trim());
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=10&language=pt&country_code=BR`;
  const { results = [] } = await (await fetch(url, { signal: AbortSignal.timeout(8000) })).json();
  if (results.length === 0) throw new Error(`Cidade não encontrada: ${city}`);
  // Prefer the matching state when one was given (several cities share names)
  const STATES = { RJ: "Rio de Janeiro", SP: "São Paulo", MG: "Minas Gerais", ES: "Espírito Santo" };
  const wanted = uf && (STATES[uf.toUpperCase()] || uf);
  return results.find((r) => wanted && r.admin1?.toLowerCase() === wanted.toLowerCase()) || results[0];
}

async function findPlace(city) {
  if (!places.has(city)) places.set(city, await geocode(city));
  return places.get(city);
}

async function getWeather(city = process.env.JARVIS_CITY) {
  if (!city) return null;
  if (cache.data && cache.city === city && Date.now() - cache.at < CACHE_MS) return cache.data;

  const place = await findPlace(city);
  const url = "https://api.open-meteo.com/v1/forecast?" + new URLSearchParams({
    latitude: place.latitude,
    longitude: place.longitude,
    current: "temperature_2m,apparent_temperature,weather_code,wind_speed_10m",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code",
    timezone: "America/Sao_Paulo",
    forecast_days: 1,
  });
  const f = await (await fetch(url, { signal: AbortSignal.timeout(8000) })).json();

  cache = {
    at: Date.now(),
    city,
    data: {
      cidade: `${place.name}, ${place.admin1}`,
      agora: { temperatura: f.current.temperature_2m, sensacao: f.current.apparent_temperature, condicao: WMO[f.current.weather_code] ?? "—", vento_kmh: f.current.wind_speed_10m },
      hoje: { minima: f.daily.temperature_2m_min[0], maxima: f.daily.temperature_2m_max[0], chance_chuva: f.daily.precipitation_probability_max[0], condicao: WMO[f.daily.weather_code[0]] ?? "—" },
    },
  };
  return cache.data;
}

module.exports = { getWeather, findPlace };
