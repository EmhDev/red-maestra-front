(function () {
  const AUTH0_DOMAIN = window.REDTECNICA_AUTH0_DOMAIN || 'redtecnica.us.auth0.com';
  const AUTH0_CLIENT_ID = window.REDTECNICA_AUTH0_CLIENT_ID || 'HfnuB7nrbdLDx4mJfii2sdCvIR2iCKHh';
  const BACKEND_API = window.REDTECNICA_API_URL || 'http://localhost:3000/api/v1/nosql';

  let auth0Client = null;
  let currentUser = null;

  async function getBearerHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    try {
      if (auth0Client && (await auth0Client.isAuthenticated())) {
        const token = await auth0Client.getTokenSilently();
        if (token) {
          headers.Authorization = `Bearer ${token}`;
          return headers;
        }
      }
    } catch {
      // Fallback a token emitido por backend si no hay audience configurada aún
    }
    const localToken = sessionStorage.getItem('redtecnica_jwt');
    if (localToken) {
      headers.Authorization = `Bearer ${localToken}`;
    }
    return headers;
  }

  async function syncAuth0UserToBackend(user, extraFields = {}) {
    if (!user || !user.sub) return;
    try {
      const headers = await getBearerHeaders();
      const res = await fetch(`${BACKEND_API}/accounts/upsert`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: user.sub,
          email: user.email || '',
          fullName: user.name || user.nickname || 'Usuario RedTecnica',
          avatarUrl: extraFields.avatarUrl || user.picture || '',
          authProvider: 'auth0',
          active: true,
          ...extraFields,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.accessToken) {
          sessionStorage.setItem('redtecnica_jwt', data.accessToken);
        }
      }
    } catch (err) {
      console.warn('No se pudo sincronizar usuario Auth0 con backend:', err);
    }
  }

  function renderProfileAvatarSection(user) {
    const accountView = document.getElementById('view-account');
    if (!accountView || document.getElementById('profile-avatar-box')) return;

    const box = document.createElement('div');
    box.id = 'profile-avatar-box';
    box.className = 'card';
    box.style.cssText = 'margin-bottom: 20px; padding: 20px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap;';
    box.innerHTML = `
      <img id="profile-avatar-preview" src="${user.picture || 'https://via.placeholder.com/72'}" alt="Foto de perfil"
           style="width: 72px; height: 72px; border-radius: 50%; object-fit: cover; border: 2px solid #635bff;" />
      <div style="flex: 1; min-width: 200px;">
        <h3 style="margin: 0 0 6px 0;">Foto de Perfil</h3>
        <input type="file" id="profile-avatar-input" accept="image/*" style="font-size: 0.85rem;" />
        <p id="profile-avatar-status" style="margin: 6px 0 0 0; font-size: 0.8rem; opacity: 0.8;"></p>
      </div>
    `;
    accountView.prepend(box);

    const input = document.getElementById('profile-avatar-input');
    const preview = document.getElementById('profile-avatar-preview');
    const status = document.getElementById('profile-avatar-status');

    input.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result;
        preview.src = dataUrl;
        status.textContent = 'Guardando foto en perfil...';
        await syncAuth0UserToBackend(currentUser, { avatarUrl: dataUrl });
        status.textContent = '✅ Foto de perfil actualizada.';
      };
      reader.readAsDataURL(file);
    });
  }

  function ensureSocialButton(id, label, bg, connection) {
    const navActions = document.querySelector('.nav-actions');
    if (!navActions) return null;
    let btn = document.getElementById(id);
    if (!btn) {
      btn = document.createElement('button');
      btn.id = id;
      btn.className = 'btn';
      btn.style.cssText = `padding: 8px 12px; font-size: 0.82rem; background: ${bg}; color: #fff; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;`;
      btn.textContent = label;
      btn.onclick = () =>
        auth0Client.loginWithRedirect({
          authorizationParams: connection ? { connection } : undefined,
        });
      navActions.appendChild(btn);
    }
    return btn;
  }

  function renderRegisterSocialButtons() {
    const regForm = document.getElementById('register-form');
    if (!regForm || document.getElementById('register-social-box')) return;

    const box = document.createElement('div');
    box.id = 'register-social-box';
    box.style.cssText = 'display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px; padding-bottom: 18px; border-bottom: 1px solid rgba(148,163,184,0.25);';
    box.innerHTML = `
      <button type="button" id="reg-google-btn" style="width:100%; padding:11px 14px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#0f172a; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
        <span style="color:#db4437; font-weight:800;">G</span> Continuar con Google
      </button>
      <button type="button" id="reg-meta-btn" style="width:100%; padding:11px 14px; border-radius:8px; border:none; background:#1877f2; color:#ffffff; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
        <span>f</span> Continuar con Meta
      </button>
      <button type="button" id="reg-auth0-btn" style="width:100%; padding:11px 14px; border-radius:8px; border:none; background:#635bff; color:#ffffff; font-weight:600; cursor:pointer;">
        🛡️ Entrar / Registrarse con Auth0
      </button>
    `;
    regForm.parentNode.insertBefore(box, regForm);

    document.getElementById('reg-google-btn').onclick = () =>
      auth0Client.loginWithRedirect({ authorizationParams: { connection: 'google-oauth2' } });
    document.getElementById('reg-meta-btn').onclick = () =>
      auth0Client.loginWithRedirect({ authorizationParams: { connection: 'facebook' } });
    document.getElementById('reg-auth0-btn').onclick = () =>
      auth0Client.loginWithRedirect();
  }

  async function updateAuth0UI() {
    if (!auth0Client) return;

    renderRegisterSocialButtons();
    const isAuthenticated = await auth0Client.isAuthenticated();
    const accountTab = document.getElementById('nav-account-tab');

    if (isAuthenticated) {
      if (accountTab) accountTab.style.display = '';
      currentUser = await auth0Client.getUser();
      await syncAuth0UserToBackend(currentUser);
      renderProfileAvatarSection(currentUser);
    } else {
      if (accountTab) accountTab.style.display = 'none';
    }
  }

  async function initAuth0() {
    if (!window.auth0 || !window.auth0.createAuth0Client) {
      console.warn('Auth0 SPA SDK no cargado.');
      return;
    }
    try {
      auth0Client = await window.auth0.createAuth0Client({
        domain: AUTH0_DOMAIN,
        clientId: AUTH0_CLIENT_ID,
        authorizationParams: {
          redirect_uri: window.location.origin,
        },
      });

      if (window.location.search.includes('code=') && window.location.search.includes('state=')) {
        await auth0Client.handleRedirectCallback();
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      await updateAuth0UI();
      window.profeSearchAuth0 = auth0Client;
    } catch (err) {
      console.error('Error inicializando Auth0:', err);
    }
  }

  window.addEventListener('DOMContentLoaded', initAuth0);
})();
