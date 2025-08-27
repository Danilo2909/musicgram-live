
document.addEventListener('DOMContentLoaded', () => {
  const urlInput = document.querySelector('[data-preview-url]');
  if (urlInput) {
    const preview = document.querySelector('[data-preview-img]');
    const update = () => {
      const v = urlInput.value.trim();
      if (!v) { preview.style.display='none'; return; }
      preview.src = v; preview.style.display='block';
    };
    urlInput.addEventListener('input', update);
  }
});
