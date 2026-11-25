/**
 * ProfeSearch v5.0 — Web Portal & NoSQL Real-Time Sync Engine
 * Sincroniza Registro, Login, Recuperación de Contraseña, Ficha Profesional y
 * Configuración de Pago (Crédito / Débito) con la App Android (profeSearch_v5-demo.apk).
 */

const API_HOST = window.location.hostname || 'localhost';
const IS_LOCAL_HOST = API_HOST === 'localhost' || API_HOST === '127.0.0.1';
const PROD_BACKEND_API = 'https://redtecnica-backend.onrender.com/api/v1/nosql';
const NOSQL_API_CANDIDATES = IS_LOCAL_HOST
  ? [
      `http://localhost:3000/api/v1/nosql`,
      PROD_BACKEND_API,
    ]
  : [
      PROD_BACKEND_API,
      `http://${API_HOST}:3000/api/v1/nosql`,
    ];

let activeApiBase = NOSQL_API_CANDIDATES[0];
let currentRegisterRole = 'seeker';
let currentRegPayType = 'CREDITO';
let currentAccPayType = 'CREDITO';
let currentAccount = null;
let cachedAccounts = [];
let leafletMap = null;
let leafletMarkers = [];

// Pure JS SHA-256 implementation (works in both localhost and LAN HTTP contexts)
function sha256Hex(ascii) {
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = 'length';
  let i, j;
  let result = '';
  const words = [];
  const asciiBitLength = ascii[lengthProperty] * 8;
  let hash = (sha256Hex.h = sha256Hex.h || []);
  const k = (sha256Hex.k = sha256Hex.k || []);
  let primeCounter = k[lengthProperty];
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) {
        isComposite[i] = candidate;
      }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  ascii += '\x80';
  while ((ascii[lengthProperty] % 64) - 56) ascii += '\x00';
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return '';
    words[i >> 2] |= j << ((3 - i) % 4) * 8;
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength;
  for (j = 0; j < words[lengthProperty]; ) {
    const w = words.slice(j, (j += 16));
    const oldHash = hash;
    hash = hash.slice(0, 8);
    for (i = 0; i < 64; i++) {
      const i2 = i + j;
      const w15 = w[i - 15],
        w2 = w[i - 2];
      const a = hash[0],
        e = hash[4];
      const temp1 =
        hash[7] +
        (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25)) +
        ((e & hash[5]) ^ (~e & hash[6])) +
        k[i] +
        (w[i] =
          i < 16
            ? w[i]
            : (w[i - 16] +
                (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3)) +
                w[i - 7] +
                (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))) |
              0);
      const temp2 =
        (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22)) +
        ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }
    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }
  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      const b = (hash[i] >> (j * 8)) & 255;
      result += (b < 16 ? 0 : '') + b.toString(16);
    }
  }
  return result;
}

function maskCardNumber(rawNumber) {
  const digits = (rawNumber || '').replace(/\D/g, '');
  const last4 = digits.length >= 4 ? digits.slice(-4) : '4242';
  return {
    masked: `•••• •••• •••• ${last4}`,
    last4,
  };
}

function detectCardBrand(rawNumber, paymentType) {
  const digits = (rawNumber || '').replace(/\D/g, '');
  if (paymentType === 'DEBITO' && !digits.startsWith('4') && !digits.startsWith('5')) {
    return 'REDCOMPRA';
  }
  if (digits.startsWith('4')) return 'VISA';
  if (digits.startsWith('5') || digits.startsWith('2')) return 'MASTERCARD';
  if (digits.startsWith('3')) return 'AMEX';
  return paymentType === 'DEBITO' ? 'REDCOMPRA' : 'VISA';
}

// Geocodificación de dirección (OpenStreetMap Nominatim + Diccionario Comunas igual que Android)
async function geocodeAddress(address) {
  const clean = (address || '').trim();
  const lower = clean.toLowerCase();

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(clean)}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'es' } });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return {
          latitude: parseFloat(data[0].lat),
          longitude: parseFloat(data[0].lon),
        };
      }
    }
  } catch (_) {
    // Fallback local dictionary
  }

  const communes = [
    { keys: ['providencia', 'tobalaba', 'los leones'], lat: -33.4288, lng: -70.611 },
    { keys: ['las condes', 'apoquindo', 'el golf', 'escuela militar'], lat: -33.4116, lng: -70.5665 },
    { keys: ['ñuñoa', 'nunoa', 'irarrazaval', 'irarrázaval'], lat: -33.4541, lng: -70.6038 },
    { keys: ['maipu', 'maipú', 'pajaritos'], lat: -33.511, lng: -70.7578 },
    { keys: ['la florida', 'vicuña mackenna', 'vicuna mackenna'], lat: -33.5227, lng: -70.5983 },
    { keys: ['vitacura'], lat: -33.3905, lng: -70.5724 },
    { keys: ['san miguel', 'gran avenida'], lat: -33.4985, lng: -70.6512 },
    { keys: ['valparaiso', 'valparaíso', 'viña', 'vina del mar'], lat: -33.0245, lng: -71.5518 },
    { keys: ['concepcion', 'concepción'], lat: -36.827, lng: -73.0503 },
    { keys: ['corrientes', 'caba', 'buenos aires', 'palermo'], lat: -34.6037, lng: -58.3816 },
  ];

  for (const item of communes) {
    if (item.keys.some((k) => lower.includes(k))) {
      return {
        latitude: +(item.lat + (Math.random() - 0.5) * 0.004).toFixed(5),
        longitude: +(item.lng + (Math.random() - 0.5) * 0.004).toFixed(5),
      };
    }
  }

  return {
    latitude: +(-33.4435 + (Math.random() - 0.5) * 0.008).toFixed(5),
    longitude: +(-70.6538 + (Math.random() - 0.5) * 0.008).toFixed(5),
  };
}

// ============================================================================
// VALIDADOR Y FORMATEADOR DE RUT CHILENO (MÓDULO 11)
// ============================================================================
function normalizeChileanRut(rut) {
  return String(rut || '').replace(/\./g, '').replace(/-/g, '').replace(/\s+/g, '').trim().toUpperCase();
}

function validateChileanRut(rut) {
  const clean = normalizeChileanRut(rut);
  if (clean.length < 7 || clean.length > 9) return false;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  if (!/^\d+$/.test(body) || !/^[0-9K]$/.test(dv)) return false;

  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const mod = 11 - (sum % 11);
  const expectedDv = mod === 11 ? '0' : mod === 10 ? 'K' : String(mod);
  return dv === expectedDv;
}

function formatChileanRut(rut) {
  const clean = normalizeChileanRut(rut);
  if (clean.length < 2) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formattedBody}-${dv}`;
}

function attachRutLiveValidation(inputId) {
  const el = document.getElementById(inputId);
  if (!el || el.dataset.rutBound) return;
  el.dataset.rutBound = '1';
  el.addEventListener('input', () => {
    if (el.readOnly) return;
    const raw = el.value.trim();
    if (!raw) {
      el.style.borderColor = '';
      return;
    }
    const clean = normalizeChileanRut(raw);
    if (clean.length >= 7) {
      const isValid = validateChileanRut(clean);
      el.style.borderColor = isValid ? '#10b981' : '#ef4444';
      if (isValid) {
        el.value = formatChileanRut(clean);
      }
    } else {
      el.style.borderColor = '';
    }
  });
}

// ============================================================================
// CONEXIÓN CON EL BACKEND NOSQL (/api/v1/nosql/*)
// ============================================================================
async function callNoSqlApi(endpoint, options = {}) {
  const token = sessionStorage.getItem('redtecnica_jwt');
  for (const base of [activeApiBase, ...NOSQL_API_CANDIDATES]) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      const headers = {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      };
      if (token && !headers.Authorization) {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch(`${base}${endpoint}`, {
        ...options,
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        activeApiBase = base;
        updateSyncIndicator(true);
        return await res.json();
      }
      let errMsg = `Error ${res.status}`;
      try {
        const errJson = await res.json();
        errMsg = (Array.isArray(errJson.message) ? errJson.message.join(', ') : errJson.message) || errJson.error || errMsg;
      } catch (_) {}
      activeApiBase = base;
      updateSyncIndicator(true);
      return { ok: false, status: res.status, error: errMsg };
    } catch (_) {
      // Try next candidate
    }
  }
  updateSyncIndicator(false);
  return null;
}

function updateSyncIndicator(online) {
  const pill = document.getElementById('nosql-sync-indicator');
  const text = document.getElementById('nosql-sync-text');
  if (!pill || !text) return;
  if (online) {
    pill.style.background = 'rgba(16, 185, 129, 0.14)';
    pill.style.color = '#34D399';
    text.textContent = 'NoSQL DB Sincronizada (Web ↔ Android)';
  } else {
    pill.style.background = 'rgba(251, 191, 36, 0.16)';
    pill.style.color = '#FBBF24';
    text.textContent = 'Modo Local (Esperando Backend :3000)';
  }
}

async function refreshNoSqlSnapshot() {
  const data = await callNoSqlApi('/snapshot');
  if (data && Array.isArray(data.accounts)) {
    cachedAccounts = data.accounts;
    localStorage.setItem('profesearch_v5_accounts_cache', JSON.stringify(cachedAccounts));
  } else {
    const saved = localStorage.getItem('profesearch_v5_accounts_cache');
    if (saved) {
      cachedAccounts = JSON.parse(saved);
    }
  }
  renderProfessionalsMapAndList();
}

// ============================================================================
// MAPA EN VIVO OPENSTREETMAP (LEAFLET) & LISTA DE PROFESIONALES
// ============================================================================
function initLeafletMap() {
  const mapEl = document.getElementById('live-osm-map');
  if (!mapEl || typeof L === 'undefined') return;

  if (!leafletMap) {
    leafletMap = L.map('live-osm-map').setView([-33.4372, -70.6306], 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors • ProfeSearch v5 NoSQL',
    }).addTo(leafletMap);
  }
  renderProfessionalsMapAndList();
}

function renderProfessionalsMapAndList() {
  const pros = cachedAccounts.filter((a) => a.role === 'professional');
  const statEl = document.getElementById('stat-total-pros');
  if (statEl) statEl.textContent = `${pros.length}`;

  const listEl = document.getElementById('live-pro-list');
  if (listEl) {
    listEl.innerHTML = pros
      .map(
        (pro) => `
      <div class="pro-item-card" onclick="focusProfessionalOnMap(${pro.latitude || -33.4489}, ${pro.longitude || -70.6693})">
        <div class="pro-item-top">
          <div>
            <div style="font-weight: 800; font-size: 1rem;">${pro.fullName}</div>
            <div style="color: #60A5FA; font-size: 0.85rem; font-weight: 600;">${pro.profession || 'Profesional Verificado'}</div>
          </div>
          <span class="tier-badge tier-${pro.tier || 'PRO'}">${pro.tier || 'PRO'}</span>
        </div>
        <div style="font-size: 0.82rem; color: #94A3B8; margin-bottom: 6px;">
          📍 ${pro.address || 'Santiago, Chile'}
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.82rem; border-top: 1px solid #1E293B; padding-top: 6px;">
          <span style="color: #FBBF24; font-weight: 700;">⭐ ${pro.rating || 5.0} (${pro.reviewsCount || 1} reseñas)</span>
          <span style="color: #34D399; font-weight: 800;">HH: $${Number(pro.hourlyRate || 20000).toLocaleString('es-CL')} | Visita: $${Number(pro.visitRate || 15000).toLocaleString('es-CL')}</span>
        </div>
      </div>
    `,
      )
      .join('');
  }

  if (leafletMap && typeof L !== 'undefined') {
    leafletMarkers.forEach((m) => leafletMap.removeLayer(m));
    leafletMarkers = [];

    pros.forEach((pro) => {
      const lat = Number(pro.latitude) || -33.4489;
      const lng = Number(pro.longitude) || -70.6693;
      const marker = L.marker([lat, lng]).addTo(leafletMap);
      marker.bindPopup(`
        <div style="color: #0F172A; min-width: 190px;">
          <strong>${pro.fullName}</strong> (${pro.tier || 'PRO'})<br/>
          <span style="color: #2563EB; font-weight: 600;">${pro.profession || 'Profesional'}</span><br/>
          <small>📍 ${pro.address}</small><br/>
          <strong>HH: $${Number(pro.hourlyRate || 20000).toLocaleString('es-CL')}</strong> • Visita: $${Number(pro.visitRate || 15000).toLocaleString('es-CL')}
        </div>
      `);
      leafletMarkers.push(marker);
    });
  }
}

function focusProfessionalOnMap(lat, lng) {
  if (leafletMap) {
    leafletMap.setView([lat, lng], 15, { animate: true });
  }
}

// ============================================================================
// NAVEGACIÓN DE VISTAS
// ============================================================================
function switchView(viewName) {
  document.querySelectorAll('.view-section').forEach((sec) => sec.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach((tab) => {
    tab.classList.toggle('active', tab.getAttribute('data-view') === viewName);
  });

  const target = document.getElementById(`view-${viewName}`);
  if (target) target.classList.add('active');

  if (viewName === 'home' && leafletMap) {
    setTimeout(() => leafletMap.invalidateSize(), 150);
  }
  if (viewName === 'account') {
    renderAccountDashboard();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showBanner(elementId, type, message) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.className = `status-banner ${type}`;
  el.textContent = message;
}

// ============================================================================
// REGISTRO DE CUENTA (CLIENTE O PROFESIONAL + MEDIO DE PAGO)
// ============================================================================
function selectRegisterRole(role) {
  currentRegisterRole = role;
  document.getElementById('reg-role-seeker').classList.toggle('selected', role === 'seeker');
  document.getElementById('reg-role-pro').classList.toggle('selected', role === 'professional');
  document.getElementById('reg-professional-fields').style.display = role === 'professional' ? 'block' : 'none';
  document.getElementById('reg-submit-btn').textContent =
    role === 'professional' ? 'Publicar Ficha Profesional y Crear Cuenta' : 'Crear Cuenta de Búsqueda';
}

function selectRegPaymentType(type) {
  currentRegPayType = type;
  const btnCredito = document.getElementById('reg-pay-credito');
  const btnDebito = document.getElementById('reg-pay-debito');
  btnCredito.className = type === 'CREDITO' ? 'pay-type-btn active-credito' : 'pay-type-btn';
  btnDebito.className = type === 'DEBITO' ? 'pay-type-btn active-debito' : 'pay-type-btn';
}

function openRegisterAsProfessional() {
  switchView('register');
  selectRegisterRole('professional');
}

function openRegisterWithTier(tier) {
  switchView('register');
  selectRegisterRole('professional');
  const tierSel = document.getElementById('reg-tier');
  if (tierSel) tierSel.value = tier;
}

async function handleRegisterSubmit(event) {
  event.preventDefault();
  const fullName = document.getElementById('reg-fullName').value.trim();
  const email = document.getElementById('reg-email').value.trim().toLowerCase();
  const rawDoc = document.getElementById('reg-documentId').value.trim().toUpperCase();
  if (rawDoc && !validateChileanRut(rawDoc)) {
    showBanner('register-status-banner', 'error', 'RUT inválido: verifica el número y dígito verificador.');
    return;
  }
  const documentId = rawDoc ? formatChileanRut(rawDoc) : '';
  const phone = document.getElementById('reg-phone').value.trim();
  const address = document.getElementById('reg-address').value.trim();
  const nationality = document.getElementById('reg-nationality').value.trim() || 'Chilena';
  const password = document.getElementById('reg-password').value;

  const cardHolder = (document.getElementById('reg-cardHolder').value.trim() || fullName).toUpperCase();
  const cardBank = document.getElementById('reg-cardBank').value;
  const rawCardNumber = document.getElementById('reg-cardNumber').value.trim() || '4532891023454242';
  const cardExpiry = document.getElementById('reg-cardExpiry').value.trim() || '08/28';
  const { masked, last4 } = maskCardNumber(rawCardNumber);
  const cardBrand = detectCardBrand(rawCardNumber, currentRegPayType);

  showBanner('register-status-banner', 'success', '⏳ Geocodificando dirección y guardando cuenta en la Base de Datos NoSQL...');

  const coords = await geocodeAddress(address);
  const passwordHash = sha256Hex(password.trim());

  const newAccount = {
    id: `acc-${Date.now()}`,
    fullName,
    email,
    documentId,
    phone,
    address,
    nationality,
    passwordHash,
    role: currentRegisterRole,
    provider: 'email',
    profession:
      currentRegisterRole === 'professional'
        ? document.getElementById('reg-profession').value.trim() || 'Especialista Certificado'
        : '',
    tier: currentRegisterRole === 'professional' ? document.getElementById('reg-tier').value : 'FREE',
    hourlyRate:
      currentRegisterRole === 'professional' ? Number(document.getElementById('reg-hourlyRate').value) || 20000 : 0,
    visitRate:
      currentRegisterRole === 'professional' ? Number(document.getElementById('reg-visitRate').value) || 15000 : 0,
    yearsExperience:
      currentRegisterRole === 'professional' ? Number(document.getElementById('reg-yearsExp').value) || 3 : 0,
    bio:
      currentRegisterRole === 'professional'
        ? document.getElementById('reg-bio').value.trim() ||
          `Profesional verificado en ${address}. Atención rápida y garantizada.`
        : '',
    skills:
      currentRegisterRole === 'professional'
        ? (document.getElementById('reg-skills').value || 'Atención a Domicilio, Garantía')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    attachedDocuments: currentRegisterRole === 'professional' ? ['Certificado_Identidad_Verificado.pdf'] : [],
    latitude: coords.latitude,
    longitude: coords.longitude,
    rating: 5.0,
    reviewsCount: 1,
    completedJobsCount: 1,
    isVerified: true,
    paymentType: currentRegPayType,
    cardHolderName: cardHolder,
    cardNumberMasked: masked,
    cardLast4: last4,
    cardBrand,
    cardExpiry,
    cardBank,
    createdAt: Date.now(),
  };

  const apiResponse = await callNoSqlApi('/accounts/upsert', {
    method: 'POST',
    body: JSON.stringify(newAccount),
  });

  if (apiResponse && apiResponse.ok === false) {
    showBanner('register-status-banner', 'error', apiResponse.error || 'No se pudo completar el registro.');
    return;
  }

  if (apiResponse && apiResponse.accessToken) {
    sessionStorage.setItem('redtecnica_jwt', apiResponse.accessToken);
  }
  const savedAcc = (apiResponse && apiResponse.account) || newAccount;
  setActiveAccount(savedAcc);
  await refreshNoSqlSnapshot();

  showBanner(
    'account-status-banner',
    'success',
    `✅ ¡Cuenta creada y sincronizada en la Base de Datos NoSQL! Ya puedes iniciar sesión en la App Android con ${savedAcc.email}.`,
  );
  switchView('account');
}

// ============================================================================
// LOGIN & RECUPERACIÓN DE CONTRASEÑA
// ============================================================================
function fillDemoLogin(email, password) {
  document.getElementById('login-email').value = email;
  document.getElementById('login-password').value = password;
}

async function handleLoginSubmit(event) {
  event.preventDefault();
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const password = document.getElementById('login-password').value.trim();
  const passwordHash = sha256Hex(password);

  const res = await callNoSqlApi('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, passwordHash }),
  });

  if (res && res.ok && res.account) {
    if (res.accessToken) {
      sessionStorage.setItem('redtecnica_jwt', res.accessToken);
    }
    setActiveAccount(res.account);
    showBanner(
      'account-status-banner',
      'success',
      `✅ Bienvenido/a ${res.account.fullName}. Tus datos están sincronizados.`,
    );
    switchView('account');
    return;
  }

  showBanner('login-status-banner', 'error', (res && res.error) || 'Correo o contraseña incorrectos.');
}

async function handleRecoverSubmit(event) {
  event.preventDefault();
  const email = document.getElementById('rec-email').value.trim().toLowerCase();
  const documentId = document.getElementById('rec-documentId').value.trim();
  const newPassword = document.getElementById('rec-newPassword').value.trim();
  const confirmPassword = document.getElementById('rec-confirmPassword').value.trim();

  if (newPassword !== confirmPassword) {
    showBanner('recover-status-banner', 'error', 'Las contraseñas nuevas no coinciden.');
    return;
  }

  const newPasswordHash = sha256Hex(newPassword);
  const res = await callNoSqlApi('/auth/recover-password', {
    method: 'POST',
    body: JSON.stringify({ email, documentId, newPassword, newPasswordHash }),
  });

  if (res && res.ok) {
    showBanner(
      'recover-status-banner',
      'success',
      '✅ Contraseña actualizada en la Base de Datos NoSQL. Ya puedes iniciar sesión aquí y en la App Android.',
    );
    if (res.account) {
      setActiveAccount(res.account);
    }
    return;
  }

  showBanner(
    'recover-status-banner',
    'error',
    (res && res.error) || 'No se encontró una cuenta que coincida con ese Correo y RUT/DNI.',
  );
}

// ============================================================================
// PANEL MI CUENTA, FICHA PROFESIONAL Y CONFIGURACIÓN DE PAGO (CRÉDITO / DÉBITO)
// ============================================================================
function setActiveAccount(account) {
  currentAccount = account;
  localStorage.setItem('profesearch_v5_active_account', JSON.stringify(account));
  updateNavbarAndMockupUser();
}

function logoutCurrentAccount() {
  currentAccount = null;
  sessionStorage.removeItem('redtecnica_jwt');
  localStorage.removeItem('profesearch_v5_active_account');
  localStorage.removeItem('profesearch_active_account');
  updateNavbarAndMockupUser();
  renderAccountDashboard();
}

async function refreshCurrentAccountFromCloud() {
  if (!currentAccount || !currentAccount.email) return;
  await refreshNoSqlSnapshot();
  const fresh = cachedAccounts.find((a) => a.email.toLowerCase() === currentAccount.email.toLowerCase());
  if (fresh) {
    setActiveAccount(fresh);
    renderAccountDashboard();
    showBanner(
      'account-status-banner',
      'success',
      '🔄 Datos sincronizados desde la Base de Datos NoSQL compartida con Android.',
    );
  }
}

function updateNavbarAndMockupUser() {
  const navAcc = document.getElementById('nav-account-tab');
  const mockName = document.getElementById('mockup-user-name');
  const mockRole = document.getElementById('mockup-user-role');
  const mockCardType = document.getElementById('mockup-card-type');
  const mockCardBrand = document.getElementById('mockup-card-brand');
  const mockCardNumber = document.getElementById('mockup-card-number');
  const mockCardHolder = document.getElementById('mockup-card-holder');
  const mockCardBank = document.getElementById('mockup-card-bank');

  if (currentAccount) {
    if (navAcc) navAcc.textContent = `💳 Mi Cuenta (${currentAccount.fullName.split(' ')[0]})`;
    if (mockName) mockName.textContent = currentAccount.fullName;
    if (mockRole) {
      mockRole.textContent =
        currentAccount.role === 'professional'
          ? `🛠️ ${currentAccount.profession || 'Profesional'} • Plan ${currentAccount.tier || 'PRO'}`
          : '🔍 Cuenta Buscador / Cliente';
    }
    if (mockCardType) {
      mockCardType.textContent =
        currentAccount.paymentType === 'DEBITO' ? '🏧 TARJETA DÉBITO / REDCOMPRA' : '💳 TARJETA DE CRÉDITO';
    }
    if (mockCardBrand) mockCardBrand.textContent = currentAccount.cardBrand || 'VISA';
    if (mockCardNumber) mockCardNumber.textContent = currentAccount.cardNumberMasked || '•••• •••• •••• 4242';
    if (mockCardHolder) mockCardHolder.textContent = currentAccount.cardHolderName || currentAccount.fullName.toUpperCase();
    if (mockCardBank) mockCardBank.textContent = currentAccount.cardBank || 'Banco de Chile';
  } else {
    if (navAcc) navAcc.textContent = '💳 Mi Cuenta & Pago';
  }
}

function toggleAccountProSection() {
  const role = document.getElementById('acc-role').value;
  document.getElementById('acc-pro-section').style.display = role === 'professional' ? 'block' : 'none';
}

function selectAccPaymentType(type) {
  currentAccPayType = type;
  document.getElementById('acc-pay-credito').className =
    type === 'CREDITO' ? 'pay-type-btn active-credito' : 'pay-type-btn';
  document.getElementById('acc-pay-debito').className =
    type === 'DEBITO' ? 'pay-type-btn active-debito' : 'pay-type-btn';
  if (type === 'DEBITO') {
    document.getElementById('acc-cardBrand').value = 'REDCOMPRA';
  } else if (document.getElementById('acc-cardBrand').value === 'REDCOMPRA') {
    document.getElementById('acc-cardBrand').value = 'VISA';
  }
  updateLiveCardPreview();
}

function updateLiveCardPreview() {
  const cardEl = document.getElementById('acc-visual-card');
  const holder = (document.getElementById('acc-cardHolder').value || 'NOMBRE TITULAR').toUpperCase();
  const rawNum = document.getElementById('acc-cardNumber').value || '4242';
  const brand = document.getElementById('acc-cardBrand').value || 'VISA';
  const expiry = document.getElementById('acc-cardExpiry').value || '08/28';
  const bank = document.getElementById('acc-cardBank').value || 'Banco de Chile';

  const { masked } = maskCardNumber(rawNum);
  cardEl.classList.toggle('debito', currentAccPayType === 'DEBITO');
  document.getElementById('card-preview-type').textContent =
    currentAccPayType === 'DEBITO' ? '🏧 TARJETA DE DÉBITO' : '💳 TARJETA DE CRÉDITO';
  document.getElementById('card-preview-brand').textContent = brand;
  document.getElementById('card-preview-number').textContent = masked;
  document.getElementById('card-preview-holder').textContent = holder;
  document.getElementById('card-preview-expiry').textContent = expiry;
  document.getElementById('card-preview-bank').textContent = bank;
}

function renderAccountDashboard() {
  const guestNotice = document.getElementById('account-guest-notice');
  const authContent = document.getElementById('account-authenticated-content');

  if (!currentAccount) {
    guestNotice.style.display = 'block';
    authContent.style.display = 'none';
    return;
  }

  guestNotice.style.display = 'none';
  authContent.style.display = 'block';

  document.getElementById('acc-header-name').textContent = currentAccount.fullName;
  document.getElementById('acc-header-badge').textContent =
    currentAccount.role === 'professional' ? `PROFESIONAL • ${currentAccount.tier || 'PRO'}` : 'CLIENTE BUSCADOR';
  document.getElementById('acc-header-meta').textContent =
    `${currentAccount.email} • RUT/DNI: ${currentAccount.documentId} • Tel: ${currentAccount.phone}`;

  document.getElementById('acc-fullName').value = currentAccount.fullName || '';
  document.getElementById('acc-email').value = currentAccount.email || '';
  document.getElementById('acc-documentId').value = currentAccount.documentId || '';
  document.getElementById('acc-phone').value = currentAccount.phone || '';
  document.getElementById('acc-nationality').value = currentAccount.nationality || 'Chilena';
  document.getElementById('acc-address').value = currentAccount.address || '';
  document.getElementById('acc-coords-label').textContent =
    `📍 Coordenadas Geocodificadas en Mapa: ${currentAccount.latitude || -33.4489}, ${currentAccount.longitude || -70.6693}`;

  document.getElementById('acc-role').value = currentAccount.role || 'seeker';
  toggleAccountProSection();

  document.getElementById('acc-profession').value = currentAccount.profession || '';
  document.getElementById('acc-tier').value = currentAccount.tier || 'PRO';
  document.getElementById('acc-hourlyRate').value = currentAccount.hourlyRate || 20000;
  document.getElementById('acc-visitRate').value = currentAccount.visitRate || 15000;
  document.getElementById('acc-skills').value = Array.isArray(currentAccount.skills)
    ? currentAccount.skills.join(', ')
    : '';
  document.getElementById('acc-bio').value = currentAccount.bio || '';

  // Payment fields
  currentAccPayType = currentAccount.paymentType || 'CREDITO';
  document.getElementById('acc-cardHolder').value =
    currentAccount.cardHolderName || (currentAccount.fullName || '').toUpperCase();
  document.getElementById('acc-cardNumber').value =
    currentAccount.cardNumberMasked || `•••• •••• •••• ${currentAccount.cardLast4 || '4242'}`;
  document.getElementById('acc-cardBrand').value = currentAccount.cardBrand || 'VISA';
  document.getElementById('acc-cardExpiry').value = currentAccount.cardExpiry || '08/28';
  document.getElementById('acc-cardBank').value = currentAccount.cardBank || 'Banco de Chile';
  selectAccPaymentType(currentAccPayType);
}

async function handleSaveProfileSubmit(event) {
  event.preventDefault();
  if (!currentAccount) return;

  const docInput = document.getElementById('acc-documentId');
  const rawDoc = docInput ? docInput.value.trim().toUpperCase() : '';
  if (rawDoc && !validateChileanRut(rawDoc)) {
    showBanner('account-status-banner', 'error', 'RUT inválido: verifica el número y dígito verificador.');
    return;
  }

  const codeEl = document.getElementById('acc-phone-code');
  const rawPhone = document.getElementById('acc-phone').value.trim();
  const combinedPhone = codeEl && rawPhone && !rawPhone.startsWith('+') ? `${codeEl.value} ${rawPhone}` : rawPhone;

  const newAddress = document.getElementById('acc-address').value.trim();
  let coords = { latitude: currentAccount.latitude, longitude: currentAccount.longitude };
  if (newAddress !== currentAccount.address) {
    coords = await geocodeAddress(newAddress);
  }

  const role = document.getElementById('acc-role').value;
  const formattedDoc = rawDoc ? formatChileanRut(rawDoc) : currentAccount.documentId || '';
  const updated = {
    ...currentAccount,
    fullName: document.getElementById('acc-fullName').value.trim(),
    documentId: currentAccount.documentId && String(currentAccount.documentId).trim() !== ''
      ? currentAccount.documentId
      : formattedDoc,
    phone: combinedPhone,
    nationality: document.getElementById('acc-nationality').value.trim(),
    address: newAddress,
    latitude: coords.latitude,
    longitude: coords.longitude,
    role,
    profession: role === 'professional' ? document.getElementById('acc-profession').value.trim() : '',
    tier: role === 'professional' ? document.getElementById('acc-tier').value : 'FREE',
    hourlyRate: role === 'professional' ? Number(document.getElementById('acc-hourlyRate').value) || 20000 : 0,
    visitRate: role === 'professional' ? Number(document.getElementById('acc-visitRate').value) || 15000 : 0,
    skills:
      role === 'professional'
        ? document
            .getElementById('acc-skills')
            .value.split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [],
    bio: role === 'professional' ? document.getElementById('acc-bio').value.trim() : '',
  };

  const res = await callNoSqlApi('/accounts/upsert', {
    method: 'POST',
    body: JSON.stringify(updated),
  });

  if (res && res.ok === false) {
    showBanner('account-status-banner', 'error', res.error || 'No se pudo guardar el perfil.');
    return;
  }

  if (docInput && updated.documentId) {
    docInput.value = updated.documentId;
    docInput.readOnly = true;
    docInput.style.opacity = '0.75';
  }
  setActiveAccount((res && res.account) || updated);
  await refreshNoSqlSnapshot();
  renderAccountDashboard();
  showBanner(
    'account-status-banner',
    'success',
    '✅ Perfil actualizado correctamente.',
  );
}

async function handleSavePaymentSubmit(event) {
  event.preventDefault();
  if (!currentAccount) return;

  const holder = document.getElementById('acc-cardHolder').value.trim().toUpperCase();
  const rawNum = document.getElementById('acc-cardNumber').value.trim();
  const brand = document.getElementById('acc-cardBrand').value;
  const expiry = document.getElementById('acc-cardExpiry').value.trim();
  const bank = document.getElementById('acc-cardBank').value;
  const { masked, last4 } = maskCardNumber(rawNum);

  const updated = {
    ...currentAccount,
    paymentType: currentAccPayType,
    cardHolderName: holder,
    cardNumberMasked: masked,
    cardLast4: last4,
    cardBrand: brand,
    cardExpiry: expiry,
    cardBank: bank,
  };

  const res = await callNoSqlApi('/accounts/upsert', {
    method: 'POST',
    body: JSON.stringify(updated),
  });

  setActiveAccount((res && res.account) || updated);
  await refreshNoSqlSnapshot();
  renderAccountDashboard();
  showBanner(
    'account-status-banner',
    'success',
    `💳 Medio de pago (${currentAccPayType} ${brand} •••• ${last4} - ${bank}) guardado en la Base de Datos NoSQL y disponible en la App Android.`,
  );
}

// ============================================================================
// INICIALIZACIÓN
// ============================================================================
window.addEventListener('DOMContentLoaded', async () => {
  const activeJwt = sessionStorage.getItem('redtecnica_jwt');
  const savedActive = localStorage.getItem('profesearch_v5_active_account');
  if (activeJwt && savedActive) {
    try {
      currentAccount = JSON.parse(savedActive);
    } catch (_) {}
  } else {
    localStorage.removeItem('profesearch_v5_active_account');
    localStorage.removeItem('profesearch_active_account');
  }
  attachRutLiveValidation('reg-documentId');
  attachRutLiveValidation('acc-documentId');
  updateNavbarAndMockupUser();
  initLeafletMap();
  await refreshNoSqlSnapshot();
});
