document.addEventListener('DOMContentLoaded', function() {
  var menuToggle = document.getElementById('menu-toggle');
  var menu = document.getElementById('main-menu');
  if (menuToggle && menu) {
    menuToggle.addEventListener('click', function() {
      menu.classList.toggle('active');
    });
    // Optional: Menü nach Klick auf Link schließen
    menu.querySelectorAll('a,button').forEach(el =>
      el.addEventListener('click', () => menu.classList.remove('active'))
    );
  }
});
