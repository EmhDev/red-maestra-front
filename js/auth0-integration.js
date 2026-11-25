(function () {
  const AUTH0_DOMAIN = window.REDTECNICA_AUTH0_DOMAIN || 'redtecnica.us.auth0.com';
  const AUTH0_CLIENT_ID = window.REDTECNICA_AUTH0_CLIENT_ID || 'HfnuB7nrbdLDx4mJfii2sdCvIR2iCKHh';
  const IS_LOCAL = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const BACKEND_API =
    window.REDTECNICA_API_URL ||
    (IS_LOCAL ? 'http://localhost:3000/api/v1/nosql' : 'https://redtecnica-backend.onrender.com/api/v1/nosql');

  let auth0Client = null;
  let currentUser = null;
  let isAuth0LoggedIn = false;

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
      // Fallback a token emitido por backend
    }
    const localToken = sessionStorage.getItem('redtecnica_jwt');
    if (localToken) {
      headers.Authorization = `Bearer ${localToken}`;
    }
    return headers;
  }

  async function syncAuth0UserToBackend(user, extraFields = {}) {
    if (!user || !user.sub) return null;
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
        return data.account || null;
      }
    } catch (err) {
      console.warn('No se pudo sincronizar usuario con backend:', err);
    }
    return null;
  }

  function applyLoggedInStateToAccountView(user, savedAccount) {
    const guestNotice = document.getElementById('account-guest-notice');
    const authContent = document.getElementById('account-authenticated-content');
    if (guestNotice) guestNotice.style.display = 'none';
    if (authContent) authContent.style.display = 'block';

    const displayName = (savedAccount && savedAccount.fullName) || user.name || user.nickname || 'Usuario RedTecnica';
    const email = (savedAccount && savedAccount.email) || user.email || '';
    const roleLabel = (savedAccount && savedAccount.role === 'professional') ? 'PROFESIONAL' : 'USUARIO';

    const headerName = document.getElementById('acc-header-name');
    const headerMeta = document.getElementById('acc-header-meta');
    const headerBadge = document.getElementById('acc-header-badge');
    const fullNameInput = document.getElementById('acc-fullName');
    const emailInput = document.getElementById('acc-email');
    const docInput = document.getElementById('acc-documentId');
    const mockupName = document.getElementById('mockup-user-name');
    const mockupRole = document.getElementById('mockup-user-role');

    if (headerName) headerName.textContent = displayName;
    if (headerMeta) headerMeta.textContent = email;
    if (headerBadge) headerBadge.textContent = roleLabel;
    if (fullNameInput && !fullNameInput.value) fullNameInput.value = displayName;
    if (emailInput) emailInput.value = email;
    if (docInput) {
      const existingDoc = (savedAccount && savedAccount.documentId) || docInput.value || '';
      if (existingDoc.trim()) {
        docInput.value = existingDoc.trim();
        docInput.readOnly = true;
        docInput.style.opacity = '0.75';
      } else {
        docInput.readOnly = false;
        docInput.style.opacity = '1';
      }
    }
    if (mockupName) mockupName.textContent = displayName;
    if (mockupRole) mockupRole.textContent = `${email} • Sesión activa`;

    // Botón Cambiar Contraseña vía enlace al correo (Auth0)
    const passBtn = document.getElementById('btn-request-password-change');
    const passStatus = document.getElementById('password-change-status');
    if (passBtn && !passBtn.dataset.bound) {
      passBtn.dataset.bound = '1';
      passBtn.onclick = async () => {
        if (!email) return;
        passStatus.textContent = 'Enviando enlace de cambio de contraseña a tu correo...';
        try {
          const res = await fetch(`https://${AUTH0_DOMAIN}/dbconnections/change_password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              client_id: AUTH0_CLIENT_ID,
              email,
              connection: 'Username-Password-Authentication',
            }),
          });
          if (res.ok) {
            passStatus.textContent = `Enlace enviado a ${email}. Abre el link en tu correo para completar el cambio.`;
          } else {
            passStatus.textContent = 'Si iniciaste con Google/Meta, gestiona tu contraseña desde tu proveedor o verifica tu correo.';
          }
        } catch {
          passStatus.textContent = 'No se pudo enviar el enlace en este momento. Intenta nuevamente.';
        }
      };
    }

    // Botón Desbloquear Métodos de Pago (protegido por contraseña)
    const unlockBtn = document.getElementById('btn-unlock-payment');
    const payPanel = document.getElementById('payment-protected-panel');
    if (unlockBtn && payPanel && !unlockBtn.dataset.bound) {
      unlockBtn.dataset.bound = '1';
      unlockBtn.onclick = () => {
        if (payPanel.style.display === 'block') {
          payPanel.style.display = 'none';
          unlockBtn.textContent = 'Desbloquear Métodos de Pago';
          return;
        }
        const pwd = window.prompt('Por tu seguridad, ingresa la contraseña de tu cuenta para acceder a Métodos de Pago:');
        if (pwd && pwd.trim().length >= 4) {
          payPanel.style.display = 'block';
          unlockBtn.textContent = 'Ocultar Métodos de Pago';
        } else if (pwd !== null) {
          alert('Debes ingresar una contraseña válida para desbloquear esta sección.');
        }
      };
    }
  }

  function renderProfileAvatarSection(user, savedAccount) {
    const authContent = document.getElementById('account-authenticated-content');
    if (!authContent || document.getElementById('profile-avatar-box')) return;

    const displayName = (savedAccount && savedAccount.fullName) || user.name || 'Usuario RedTecnica';
    const email = (savedAccount && savedAccount.email) || user.email || '';
    const isVerified = user.email_verified !== false;
    const avatarSrc = (savedAccount && savedAccount.avatarUrl) || user.picture || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(displayName) + '&background=312e81&color=fff';

    if (!isVerified && !document.getElementById('email-verify-banner')) {
      const warn = document.createElement('div');
      warn.id = 'email-verify-banner';
      warn.style.cssText = 'margin-bottom: 16px; padding: 16px 20px; border-radius: 12px; background: rgba(245,158,11,0.14); border: 1px solid rgba(245,158,11,0.45); color: #f59e0b; font-size: 0.9rem; font-weight: 600;';
      warn.innerHTML = 'Tu correo aún no está verificado. Por favor revisa tu bandeja de entrada y haz clic en el enlace de activación para habilitar tu cuenta y configurar la verificación en 2 pasos (MFA).';
      authContent.prepend(warn);
    }

    const verifyBadge = isVerified
      ? '<span style="font-size:0.72rem; font-weight:700; padding:3px 8px; border-radius:999px; background:rgba(16,185,129,0.15); color:#10b981;">Correo Verificado</span>'
      : '<span style="font-size:0.72rem; font-weight:700; padding:3px 8px; border-radius:999px; background:rgba(245,158,11,0.18); color:#f59e0b;">Activación Pendiente</span>';

    const mfaBadge = '<span style="font-size:0.72rem; font-weight:700; padding:3px 8px; border-radius:999px; background:rgba(79,70,229,0.16); color:#818cf8;">Protección MFA</span>';

    const box = document.createElement('div');
    box.id = 'profile-avatar-box';
    box.className = 'section-card';
    box.style.cssText = 'margin-bottom: 20px; padding: 24px; display: flex; align-items: center; justify-content: space-between; gap: 20px; flex-wrap: wrap;';
    box.innerHTML = `
      <div style="display: flex; align-items: center; gap: 18px; flex-wrap: wrap;">
        <img id="profile-avatar-preview" src="${avatarSrc}" alt="Foto de perfil"
             style="width: 76px; height: 76px; border-radius: 50%; object-fit: cover; border: 3px solid #4f46e5; box-shadow: 0 4px 14px rgba(79,70,229,0.25);" />
        <div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <h3 style="margin: 0; font-size: 1.2rem; font-weight: 800;">${displayName}</h3>
            ${verifyBadge}
            ${mfaBadge}
          </div>
          <p style="margin: 4px 0 10px 0; font-size: 0.88rem; opacity: 0.78;">${email}</p>
          <label for="profile-avatar-input" style="display:inline-flex; align-items:center; gap:6px; padding:7px 12px; border-radius:8px; background:#312e81; color:#fff; font-size:0.8rem; font-weight:600; cursor:pointer;">
            Cambiar foto de perfil
          </label>
          <input type="file" id="profile-avatar-input" accept="image/*" style="display:none;" />
          <span id="profile-avatar-status" style="margin-left: 10px; font-size: 0.8rem; opacity: 0.85;"></span>
        </div>
      </div>
      <button type="button" id="profile-logout-btn" class="btn btn-danger" style="padding: 9px 16px; font-size: 0.85rem; border-radius: 8px; cursor: pointer;">
        Cerrar Sesión
      </button>
    `;
    authContent.prepend(box);

    const input = document.getElementById('profile-avatar-input');
    const preview = document.getElementById('profile-avatar-preview');
    const status = document.getElementById('profile-avatar-status');
    const logoutBtn = document.getElementById('profile-logout-btn');

    input.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const dataUrl = reader.result;
        preview.src = dataUrl;
        status.textContent = 'Guardando...';
        await syncAuth0UserToBackend(currentUser, { avatarUrl: dataUrl });
        status.textContent = 'Foto actualizada';
      };
      reader.readAsDataURL(file);
    });

    if (logoutBtn) {
      logoutBtn.onclick = () => performFullLogout();
    }
  }

  function performFullLogout() {
    sessionStorage.removeItem('redtecnica_jwt');
    try {
      localStorage.removeItem('profesearch_v5_active_account');
      localStorage.removeItem('profesearch_active_account');
      window.currentAccount = null;
    } catch {}
    if (auth0Client && isAuth0LoggedIn) {
      auth0Client.logout({
        logoutParams: { returnTo: window.location.origin },
      });
    } else {
      window.location.reload();
    }
  }

  function renderSocialButtonsForForm(formId, boxId) {
    const targetForm = document.getElementById(formId);
    if (!targetForm || document.getElementById(boxId)) return;

    const box = document.createElement('div');
    box.id = boxId;
    box.style.cssText = 'display: flex; flex-direction: column; gap: 10px; margin-bottom: 18px; padding-bottom: 18px; border-bottom: 1px solid rgba(148,163,184,0.25);';
    box.innerHTML = `
      <button type="button" id="${boxId}-google-btn" style="width:100%; padding:11px 14px; border-radius:8px; border:1px solid #cbd5e1; background:#ffffff; color:#0f172a; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
        <span style="color:#db4437; font-weight:800;">G</span> Continuar con Google
      </button>
      <button type="button" id="${boxId}-meta-btn" style="width:100%; padding:11px 14px; border-radius:8px; border:none; background:#1877f2; color:#ffffff; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
        <span>f</span> Continuar con Meta
      </button>
      <button type="button" id="${boxId}-auth0-btn" style="width:100%; padding:11px 14px; border-radius:8px; border:none; background:#312e81; color:#ffffff; font-weight:600; cursor:pointer;">
        Iniciar Sesión / Registrarse con Correo
      </button>
    `;
    targetForm.parentNode.insertBefore(box, targetForm);

    document.getElementById(`${boxId}-google-btn`).onclick = () =>
      auth0Client.loginWithRedirect({ authorizationParams: { connection: 'google-oauth2' } });
    document.getElementById(`${boxId}-meta-btn`).onclick = () =>
      auth0Client.loginWithRedirect({ authorizationParams: { connection: 'facebook' } });
    document.getElementById(`${boxId}-auth0-btn`).onclick = () =>
      auth0Client.loginWithRedirect();
  }

  function renderRegisterSocialButtons() {
    renderSocialButtonsForForm('register-form', 'register-social-box');
    renderSocialButtonsForForm('login-form', 'login-social-box');
  }

  function guardNavigationWhenLoggedIn() {
    if (typeof window.switchView === 'function' && !window._rtSwitchViewWrapped) {
      const originalSwitchView = window.switchView;
      window.switchView = function (viewName) {
        if (isAuth0LoggedIn && (viewName === 'register' || viewName === 'login')) {
          originalSwitchView('account');
          applyLoggedInStateToAccountView(currentUser, null);
          return;
        }
        originalSwitchView(viewName);
        if (isAuth0LoggedIn && viewName === 'account') {
          applyLoggedInStateToAccountView(currentUser, null);
        }
      };
      window._rtSwitchViewWrapped = true;
    }

    if (typeof window.logoutCurrentAccount === 'function' && !window._rtLogoutWrapped) {
      window.logoutCurrentAccount = performFullLogout;
      window._rtLogoutWrapped = true;
    }
  }

  async function updateAuth0UI() {
    if (!auth0Client) return;

    renderRegisterSocialButtons();
    isAuth0LoggedIn = await auth0Client.isAuthenticated();
    const accountTab = document.getElementById('nav-account-tab');
    const registerTab = document.getElementById('nav-register-tab');
    const loginTab = document.getElementById('nav-login-tab');

    guardNavigationWhenLoggedIn();

    if (isAuth0LoggedIn) {
      if (registerTab) registerTab.style.display = 'none';
      if (loginTab) loginTab.style.display = 'none';
      if (accountTab) accountTab.style.display = '';
      currentUser = await auth0Client.getUser();
      const savedAccount = await syncAuth0UserToBackend(currentUser);
      applyLoggedInStateToAccountView(currentUser, savedAccount);
      renderProfileAvatarSection(currentUser, savedAccount);
    } else {
      if (registerTab) registerTab.style.display = '';
      if (loginTab) loginTab.style.display = '';
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

      const returnedFromLogin =
        window.location.search.includes('code=') && window.location.search.includes('state=');
      if (returnedFromLogin) {
        await auth0Client.handleRedirectCallback();
        window.history.replaceState({}, document.title, window.location.pathname);
      }

      await updateAuth0UI();
      if (returnedFromLogin && isAuth0LoggedIn && typeof window.switchView === 'function') {
        window.switchView('account');
      }
      window.redTecnicaAuth0 = auth0Client;
    } catch (err) {
      console.error('Error inicializando Auth0:', err);
    }
  }

  window.addEventListener('DOMContentLoaded', initAuth0);
})();
