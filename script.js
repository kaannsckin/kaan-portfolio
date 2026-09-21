const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const items = [...document.querySelectorAll('.reveal')];
if (reduced || !('IntersectionObserver' in window)) {
  items.forEach(el => el.classList.add('is-visible'));
} else {
  const io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const delay = Number(entry.target.dataset.delay || 0) * 110;
        setTimeout(() => entry.target.classList.add('is-visible'), delay);
        io.unobserve(entry.target);
      }
    }
  }, { threshold: 0.12 });
  items.forEach(el => io.observe(el));
}
