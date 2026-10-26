// Просмотр фото на весь экран для страниц авто, отзывов и карточек в статьях.
// Клик по фото открывает галерею: стрелки, свайп, клавиатура (← → Esc), счётчик.
(function () {
  if (window.__plb) return; window.__plb = 1;
  var css = '.plb{position:fixed;inset:0;z-index:9999;display:none;background:rgba(5,8,7,.96);touch-action:pan-y}.plb.open{display:flex;align-items:center;justify-content:center}' +
    '.plb img{max-width:100vw;max-height:100vh;max-height:100dvh;object-fit:contain;user-select:none;-webkit-user-drag:none}' +
    '.plb button{position:absolute;border:0;cursor:pointer;color:#fff;background:rgba(255,255,255,.12);border-radius:50%;width:48px;height:48px;font:600 24px/1 system-ui,sans-serif;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent}' +
    '.plb button:hover,.plb button:focus-visible{background:rgba(52,211,153,.55);outline:none}' +
    '.plb-x{top:max(14px,env(safe-area-inset-top));right:max(14px,env(safe-area-inset-right))}.plb-p{left:max(10px,env(safe-area-inset-left));top:50%;margin-top:-24px}.plb-n{right:max(10px,env(safe-area-inset-right));top:50%;margin-top:-24px}' +
    '.plb-c{position:absolute;bottom:max(14px,env(safe-area-inset-bottom));left:50%;transform:translateX(-50%);color:#fff;font:600 14px system-ui,sans-serif;background:rgba(0,0,0,.45);padding:5px 12px;border-radius:999px}' +
    '.plb-one .plb-p,.plb-one .plb-n,.plb-one .plb-c{display:none}body.plb-lock{overflow:hidden}' +
    '.gallery .main img,.gallery .thumbs img,.rv-img img,.rv-thumbs img,.cc-thumbs img{cursor:zoom-in}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var el = document.createElement('div'); el.className = 'plb'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Просмотр фото');
  el.innerHTML = '<img alt=""><button class="plb-x" aria-label="Закрыть">✕</button><button class="plb-p" aria-label="Предыдущее фото">‹</button><button class="plb-n" aria-label="Следующее фото">›</button><div class="plb-c"></div>';
  document.body.appendChild(el);
  var im = el.querySelector('img'), cnt = el.querySelector('.plb-c'), list = [], idx = 0, startX = null;
  function full(src) { return src.replace('-card.webp', '.webp'); }
  function show(i) {
    idx = (i + list.length) % list.length; im.src = list[idx]; cnt.textContent = (idx + 1) + ' / ' + list.length;
    [1, -1].forEach(function (d) { var n = new Image(); n.src = list[(idx + d + list.length) % list.length]; });
  }
  function open(urls, i) { list = urls; el.classList.toggle('plb-one', urls.length < 2); el.classList.add('open'); document.body.classList.add('plb-lock'); show(i); el.querySelector('.plb-x').focus(); }
  function close() { el.classList.remove('open'); document.body.classList.remove('plb-lock'); im.removeAttribute('src'); }
  el.addEventListener('click', function (e) {
    if (e.target.closest('.plb-x')) return close();
    if (e.target.closest('.plb-p')) return show(idx - 1);
    if (e.target.closest('.plb-n')) return show(idx + 1);
    if (e.target === el) close();
  });
  document.addEventListener('keydown', function (e) {
    if (!el.classList.contains('open')) return;
    if (e.key === 'Escape') close(); else if (e.key === 'ArrowLeft') show(idx - 1); else if (e.key === 'ArrowRight') show(idx + 1);
  });
  el.addEventListener('touchstart', function (e) { startX = e.touches[0].clientX; }, { passive: true });
  el.addEventListener('touchend', function (e) {
    if (startX === null) return; var dx = e.changedTouches[0].clientX - startX; startX = null;
    if (Math.abs(dx) > 50) show(idx + (dx < 0 ? 1 : -1));
  }, { passive: true });
  // Открытие по клику: страница авто (.gallery), отзывы (.rv), миниатюры карточек в статьях (.cc-thumbs)
  document.addEventListener('click', function (e) {
    var img = e.target.closest && e.target.closest('.gallery img, .rv img, .cc-thumbs img');
    if (!img || el.contains(img)) return;
    var root = img.closest('.gallery, .rv, .cc'); if (!root) return;
    var imgs = Array.prototype.slice.call(root.querySelectorAll(root.matches('.cc') ? '.cc-thumbs img' : 'img'));
    var urls = imgs.map(function (x) { return full(x.currentSrc || x.src); });
    var i = imgs.indexOf(img); if (i < 0) return;
    e.preventDefault(); e.stopPropagation(); open(urls, i);
  }, true);
})();
