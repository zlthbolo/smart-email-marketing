(() => {
  const native = Boolean(window.Capacitor?.isNativePlatform?.());
  if (native) return;

  const TOKEN_KEY = 'jareed_server_session';
  const appView = document.getElementById('appView');

  async function request(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (auth) {
      const token = localStorage.getItem(TOKEN_KEY);
      if (!token) throw new Error('AUTH_REQUIRED');
      headers.Authorization = `Bearer ${token}`;
    }
    const response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) {
      const error = new Error(payload?.error?.message || `Request failed (${response.status})`);
      error.code = payload?.error?.code || `HTTP_${response.status}`;
      error.status = response.status;
      throw error;
    }
    return payload.data ?? payload;
  }

  async function remoteApi(path, options = {}) {
    try {
      return await request(`/v1${path}`, options);
    } catch (error) {
      if (error.status === 401 || error.code === 'SESSION_INVALID' || error.code === 'AUTH_REQUIRED') {
        localStorage.removeItem(TOKEN_KEY);
        showAuth();
      }
      throw error;
    }
  }

  // app.js deliberately uses a replaceable global API function. Browser production uses the real server.
  window.api = remoteApi;

  function authShell({ registrationOpen = false, error = '' } = {}) {
    return `<div id="serverAuth" class="server-auth">
      <div class="server-auth-card">
        <div class="server-auth-logo">جريد <span>سوفت</span></div>
        <h1>${registrationOpen ? 'إعداد المالك' : 'تسجيل الدخول'}</h1>
        <p>${registrationOpen ? 'هذه الخطوة تظهر مرة واحدة فقط. بعد إنشاء المالك يُغلق التسجيل نهائيًا.' : 'هذا النظام خاص بمالكه فقط.'}</p>
        ${error ? `<div class="server-auth-error">${escapeHtml(error)}</div>` : ''}
        <form id="serverAuthForm">
          ${registrationOpen ? '<input name="displayName" placeholder="اسم المالك" required><input name="workspaceName" value="جريد سوفت" type="hidden">' : ''}
          <input name="email" type="email" autocomplete="username" placeholder="البريد الإلكتروني" required>
          <input name="password" type="password" autocomplete="current-password" placeholder="كلمة المرور" minlength="8" required>
          <button class="primary" type="submit">${registrationOpen ? 'إنشاء المالك والدخول' : 'دخول'}</button>
        </form>
      </div>
    </div>`;
  }

  async function setupStatus() {
    try { return await request('/v1/auth/setup-status', { auth: false }); }
    catch { return { registrationOpen: false }; }
  }

  async function showAuth(message = '') {
    appView.classList.add('server-locked');
    document.getElementById('serverAuth')?.remove();
    const status = await setupStatus();
    document.body.insertAdjacentHTML('beforeend', authShell({ registrationOpen: status.registrationOpen, error: message }));
    const form = document.getElementById('serverAuthForm');
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const endpoint = status.registrationOpen ? '/v1/auth/register' : '/v1/auth/login';
      try {
        const result = await request(endpoint, { method: 'POST', body: data, auth: false });
        localStorage.setItem(TOKEN_KEY, result.token);
        document.getElementById('serverAuth')?.remove();
        await unlock(result.user);
      } catch (error) {
        showAuth(error.message);
      }
    });
  }

  async function unlock(user) {
    appView.classList.remove('server-locked');
    const userBox = document.querySelector('.user');
    if (userBox) {
      userBox.classList.remove('hidden');
      userBox.removeAttribute('aria-hidden');
      const name = document.getElementById('userName');
      if (name) name.textContent = user?.display_name || user?.email || 'المالك';
      userBox.title = 'اضغط لتسجيل الخروج';
      userBox.onclick = async () => {
        try { await request('/v1/auth/logout', { method: 'POST' }); } catch {}
        localStorage.removeItem(TOKEN_KEY);
        showAuth();
      };
    }
    try { await window.refreshAll?.(); } catch (error) { window.notice?.(error.message, 'error'); }
  }

  async function verifySession() {
    appView.classList.add('server-locked');
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return showAuth();
    try {
      const me = await request('/v1/auth/me');
      return unlock(me);
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      return showAuth();
    }
  }

  function oauthButton(id, provider) {
    const button = document.getElementById(id);
    if (!button) return;
    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        const result = await remoteApi(`/oauth/${provider}/start`);
        location.href = result.authorizationUrl;
      } catch (error) {
        window.notice?.(error.message, 'error');
      }
    }, true);
  }

  oauthButton('googleConnect', 'google');
  oauthButton('microsoftConnect', 'microsoft');

  const oauth = new URLSearchParams(location.search).get('oauth');
  if (oauth) history.replaceState({}, '', location.pathname);
  verifySession();
})();
