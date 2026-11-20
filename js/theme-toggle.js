(function () {
  const MOON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
  const SUN_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

  function applyTheme(isDark) {
    document.body.classList.toggle('theme-dark', isDark);
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) btn.innerHTML = isDark ? `${SUN_SVG}<span>Claro</span>` : `${MOON_SVG}<span>Nocturno</span>`;
  }

  window.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('profesearch_theme');
    const isDark = saved === 'dark';

    const navActions = document.querySelector('.nav-actions');
    if (navActions && !document.getElementById('theme-toggle-btn')) {
      const btn = document.createElement('button');
      btn.id = 'theme-toggle-btn';
      btn.className = 'btn';
      btn.style.cssText = 'padding: 8px 12px; font-size: 0.82rem; border-radius: 8px; cursor: pointer; border: 1px solid rgba(255,255,255,0.22); background: rgba(255,255,255,0.08); color: #ffffff; font-weight: 600; display:inline-flex; align-items:center; gap:6px;';
      btn.onclick = () => {
        const nextDark = !document.body.classList.contains('theme-dark');
        localStorage.setItem('profesearch_theme', nextDark ? 'dark' : 'light');
        applyTheme(nextDark);
      };
      navActions.prepend(btn);
    }

    applyTheme(isDark);

    // Carrusel automático con transición suave
    const slides = document.querySelectorAll('#rm-carousel .rm-slide');
    if (slides.length > 1) {
      let idx = 0;
      slides.forEach((s, i) => {
        s.style.display = 'flex';
        s.classList.toggle('active', i === 0);
      });
      setInterval(() => {
        slides[idx].classList.remove('active');
        idx = (idx + 1) % slides.length;
        slides[idx].classList.add('active');
      }, 4500);
    }
  });
})();
