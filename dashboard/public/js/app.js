function setupUserMenu() {
  const btn = document.querySelector('[data-action="user-menu"]');
  const menu = document.querySelector("[data-user-menu]");
  if (!btn || !menu) return;

  function openMenu() {
    menu.classList.remove("hidden");
    btn.setAttribute("aria-expanded", "true");
  }

  function closeMenu() {
    menu.classList.add("hidden");
    btn.setAttribute("aria-expanded", "false");
  }

  function toggleMenu(e) {
    e.preventDefault();
    e.stopPropagation();

    const isHidden = menu.classList.contains("hidden");
    if (isHidden) openMenu();
    else closeMenu();
  }

  btn.addEventListener("click", toggleMenu);

  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target) && !btn.contains(e.target)) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMenu();
  });
}
