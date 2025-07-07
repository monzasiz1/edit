document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.menu-toggle');
  const menu = document.querySelector('.main-nav ul');

  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true' || false;
    toggle.setAttribute('aria-expanded', !expanded);
    menu.classList.toggle('active');
  });
});
