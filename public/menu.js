document.addEventListener("DOMContentLoaded", () => {
  const menuToggle = document.getElementById("menu-toggle");
  const mainMenu = document.getElementById("main-menu");

  if (menuToggle && mainMenu) {
    menuToggle.addEventListener("click", () => {
      const isActive = mainMenu.classList.toggle("active");

      // ARIA Attribute zur Barrierefreiheit anpassen
      menuToggle.setAttribute("aria-expanded", isActive ? "true" : "false");
    });

    // Menü schließt bei Klick auf Link oder Button (mobile usability)
    mainMenu.querySelectorAll("a, button").forEach(el => {
      el.addEventListener("click", () => {
        mainMenu.classList.remove("active");
        menuToggle.setAttribute("aria-expanded", "false");
      });
    });
  }
});