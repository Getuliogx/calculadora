const IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const STORAGE_KEY = 'tmdb_calculator_settings_v1';

const el = {
  apiKey: document.getElementById('apiKey'),
  pricePerMinute: document.getElementById('pricePerMinute'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  clearSettingsBtn: document.getElementById('clearSettingsBtn'),
  mediaType: document.getElementById('mediaType'),
  searchInput: document.getElementById('searchInput'),
  searchBtn: document.getElementById('searchBtn'),
  status: document.getElementById('status'),
  resultsSection: document.getElementById('resultsSection'),
  results: document.getElementById('results'),
  detailsSection: document.getElementById('detailsSection'),
  details: document.getElementById('details')
};

function loadSettings() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return;
  try {
    const parsed = JSON.parse(saved);
    if (parsed.apiKey) el.apiKey.value = parsed.apiKey;
    if (parsed.pricePerMinute) el.pricePerMinute.value = parsed.pricePerMinute;
  } catch (_) {}
}

function saveSettings() {
  const apiKey = el.apiKey.value.trim();
  const pricePerMinute = Number(el.pricePerMinute.value || 0.45);
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ apiKey, pricePerMinute }));
  setStatus('Configurações salvas no navegador.');
}

function clearSettings() {
  localStorage.removeItem(STORAGE_KEY);
  el.apiKey.value = '';
  el.pricePerMinute.value = '0.45';
  setStatus('Chave salva apagada.');
}

function setStatus(message, isError = false) {
  el.status.textContent = message;
  el.status.style.color = isError ? '#fca5a5' : '#93c5fd';
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

function minutesToText(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0) return `${m} min`;
  return `${h}h ${m}min`;
}

function posterUrl(path) {
  return path ? `${IMAGE_BASE}${path}` : 'https://via.placeholder.com/500x750?text=Sem+Imagem';
}

function getApiKey() {
  return el.apiKey.value.trim();
}

async function tmdbFetch(path, params = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Cole sua API key da TMDb e clique em Salvar configurações.');
  }

  const url = new URL(`https://api.themoviedb.org/3${path}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('language', 'pt-BR');

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString());
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.status_message || 'Erro ao consultar a TMDb.');
  }

  return data;
}

async function searchMedia() {
  const query = el.searchInput.value.trim();
  if (!query) {
    setStatus('Digite o nome de um filme ou série.', true);
    return;
  }

  el.resultsSection.classList.add('hidden');
  el.detailsSection.classList.add('hidden');
  el.results.innerHTML = '';
  el.details.innerHTML = '';
  setStatus('Pesquisando...');

  try {
    let data;
    const type = el.mediaType.value;

    if (type === 'multi') {
      data = await tmdbFetch('/search/multi', { query, include_adult: false });
    } else if (type === 'movie') {
      data = await tmdbFetch('/search/movie', { query, include_adult: false });
    } else {
      data = await tmdbFetch('/search/tv', { query, include_adult: false });
    }

    const filtered = (data.results || []).filter(item => ['movie', 'tv'].includes(item.media_type || type));

    if (!filtered.length) {
      setStatus('Nenhum resultado encontrado.', true);
      return;
    }

    renderResults(filtered, type);
    el.resultsSection.classList.remove('hidden');
    setStatus(`${filtered.length} resultado(s) encontrado(s).`);
  } catch (error) {
    setStatus(error.message, true);
  }
}

function renderResults(items, selectedType) {
  el.results.innerHTML = items.map(item => {
    const mediaType = item.media_type || selectedType;
    const title = item.title || item.name || 'Sem título';
    const date = item.release_date || item.first_air_date || '';
    const year = date ? date.slice(0, 4) : '—';
    return `
      <article class="result-card">
        <img class="result-poster" src="${posterUrl(item.poster_path)}" alt="Pôster de ${escapeHtml(title)}">
        <div class="result-content">
          <h3>${escapeHtml(title)}</h3>
          <div class="badges">
            <span class="badge">${mediaType === 'movie' ? 'Filme' : 'Série'}</span>
            <span class="badge">${year}</span>
          </div>
          <p class="muted small">${escapeHtml(item.overview || 'Sem descrição disponível.')}</p>
          <button onclick="loadDetails('${mediaType}', ${item.id})">Ver cálculo</button>
        </div>
      </article>
    `;
  }).join('');
}

async function loadDetails(mediaType, id) {
  setStatus('Carregando detalhes...');
  el.detailsSection.classList.remove('hidden');
  el.details.innerHTML = '<p class="muted">Carregando...</p>';

  try {
    if (mediaType === 'movie') {
      const movie = await tmdbFetch(`/movie/${id}`);
      renderMovie(movie);
      setStatus('Cálculo do filme carregado.');
      return;
    }

    const tv = await tmdbFetch(`/tv/${id}`);
    const seasonNumbers = (tv.seasons || [])
      .map(season => season.season_number)
      .filter(num => num > 0);

    const seasons = [];
    for (const seasonNumber of seasonNumbers) {
      const seasonData = await tmdbFetch(`/tv/${id}/season/${seasonNumber}`);
      seasons.push(seasonData);
    }

    renderTV(tv, seasons);
    setStatus('Cálculo da série carregado.');
  } catch (error) {
    el.details.innerHTML = `<p class="muted">Erro: ${escapeHtml(error.message)}</p>`;
    setStatus(error.message, true);
  }
}

function calculatePrice(minutes) {
  const price = Number(el.pricePerMinute.value || 0.45);
  return minutes * price;
}

function renderMovie(movie) {
  const runtime = Number(movie.runtime || 0);
  const price = calculatePrice(runtime);
  const title = movie.title || 'Sem título';
  const year = movie.release_date ? movie.release_date.slice(0, 4) : '—';

  el.details.innerHTML = `
    <div class="summary">
      <div>
        <img class="poster-lg" src="${posterUrl(movie.poster_path)}" alt="Pôster de ${escapeHtml(title)}">
      </div>
      <div>
        <h2>${escapeHtml(title)} (${year})</h2>
        <p class="muted">${escapeHtml(movie.overview || 'Sem descrição disponível.')}</p>

        <div class="kpis">
          <div class="kpi">
            <span>Duração</span>
            <strong>${runtime} min</strong>
          </div>
          <div class="kpi">
            <span>Tempo formatado</span>
            <strong>${minutesToText(runtime)}</strong>
          </div>
          <div class="kpi">
            <span>Valor total</span>
            <strong>${formatCurrency(price)}</strong>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderTV(tv, seasons) {
  const title = tv.name || 'Sem título';
  const year = tv.first_air_date ? tv.first_air_date.slice(0, 4) : '—';
  const fallbackEpisodeRuntime = Number((tv.episode_run_time || [])[0] || 0);

  const seasonSummaries = seasons.map(season => {
    let totalMinutes = 0;
    let episodeCount = 0;

    for (const episode of season.episodes || []) {
      const runtime = Number(episode.runtime || fallbackEpisodeRuntime || 0);
      totalMinutes += runtime;
      episodeCount += 1;
    }

    return {
      seasonNumber: season.season_number,
      name: season.name,
      episodeCount,
      totalMinutes,
      totalPrice: calculatePrice(totalMinutes)
    };
  });

  const grandMinutes = seasonSummaries.reduce((sum, item) => sum + item.totalMinutes, 0);
  const grandEpisodes = seasonSummaries.reduce((sum, item) => sum + item.episodeCount, 0);
  const grandPrice = calculatePrice(grandMinutes);

  const rows = seasonSummaries.map(item => `
    <tr>
      <td>${item.seasonNumber}</td>
      <td>${escapeHtml(item.name || `Temporada ${item.seasonNumber}`)}</td>
      <td>${item.episodeCount}</td>
      <td>${item.totalMinutes} min (${minutesToText(item.totalMinutes)})</td>
      <td>${formatCurrency(item.totalPrice)}</td>
    </tr>
  `).join('');

  el.details.innerHTML = `
    <div class="summary">
      <div>
        <img class="poster-lg" src="${posterUrl(tv.poster_path)}" alt="Pôster de ${escapeHtml(title)}">
      </div>
      <div>
        <h2>${escapeHtml(title)} (${year})</h2>
        <p class="muted">${escapeHtml(tv.overview || 'Sem descrição disponível.')}</p>

        <div class="kpis">
          <div class="kpi">
            <span>Temporadas carregadas</span>
            <strong>${seasonSummaries.length}</strong>
          </div>
          <div class="kpi">
            <span>Episódios somados</span>
            <strong>${grandEpisodes}</strong>
          </div>
          <div class="kpi">
            <span>Minutagem total</span>
            <strong>${minutesToText(grandMinutes)}</strong>
          </div>
          <div class="kpi">
            <span>Valor da série</span>
            <strong>${formatCurrency(grandPrice)}</strong>
          </div>
        </div>
      </div>
    </div>

    <div class="detail-box">
      <h3>Valor por temporada</h3>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Temp.</th>
              <th>Nome</th>
              <th>Episódios</th>
              <th>Minutagem</th>
              <th>Valor</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

el.saveSettingsBtn.addEventListener('click', saveSettings);
el.clearSettingsBtn.addEventListener('click', clearSettings);
el.searchBtn.addEventListener('click', searchMedia);
el.searchInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') searchMedia();
});

loadSettings();
window.loadDetails = loadDetails;
