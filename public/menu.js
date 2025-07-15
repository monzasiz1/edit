// public/menu.js
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('menu-toggle');
  const menu   = document.getElementById('main-menu');

  toggle.addEventListener('click', () => {
    toggle.classList.toggle('open');
    menu.classList.toggle('active');
  });

  // Schließe Mobil‑Menü beim Klick auf einen Link
  menu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      if (menu.classList.contains('active')) {
        toggle.classList.remove('open');
        menu.classList.remove('active');
      }
    });
  });
});
