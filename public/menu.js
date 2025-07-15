const btn = document.getElementById('hamburger-btn');
const nav = document.querySelector('nav.main-nav ul');

btn.addEventListener('click', () => {
  btn.classList.toggle('active');
  nav.classList.toggle('active');

  // ARIA‑Label wechseln
  btn.setAttribute(
    'aria-label',
    btn.classList.contains('active') ? 'Menü schließen' : 'Menü öffnen'
  );
});
