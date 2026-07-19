// Marks the current page's nav link as active — safe no-op if not found.
(function () {
  const page = document.body.dataset.page;
  if (!page) return;
  const link = document.querySelector(`.nav__links a[data-page="${page}"]`);
  if (link) link.setAttribute('aria-current', 'page');
})();
