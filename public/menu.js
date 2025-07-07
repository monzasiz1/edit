// public/menu.js
document.addEventListener("DOMContentLoaded", function () {
  const menuToggle = document.getElementById("menu-toggle");
  const mainMenu = document.getElementById("main-menu");
  if (menuToggle && mainMenu) {
    menuToggle.addEventListener("click", function () {
      mainMenu.classList.toggle("active");
    });
    // Optional: Menü schließt bei Klick auf Link (mobil usability)
    mainMenu.querySelectorAll("a,button").forEach(el => {
      el.addEventListener("click", () => mainMenu.classList.remove("active"));
    });
  }
});
