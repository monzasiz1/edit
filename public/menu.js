document.addEventListener('DOMContentLoaded', function() {
  const toggle = document.getElementById('menu-toggle');
  const menu = document.getElementById('main-menu');
  if (!toggle || !menu) return;
  toggle.addEventListener('click', function(e) {
    e.stopPropagation();
    menu.classList.toggle('active');
  });
  // Menü schließen, wenn außerhalb geklickt
  document.body.addEventListener('click', function(e) {
    if (
      menu.classList.contains('active') &&
      !menu.contains(e.target) &&
      e.target !== toggle &&
      !toggle.contains(e.target)
    ) {
      menu.classList.remove('active');
    }
  });
});
