/* <photo-drop> — lightweight drag-and-drop image slot for the ACR site.
 *
 * Authoring aid: drop (or click to browse) an image onto any placeholder and
 * it appears instantly and persists in this browser via localStorage, so it
 * survives reloads while you work — and works for pages in /site/ (unlike the
 * sidecar-based starter slot, which only persists at the project root).
 *
 * The stored image is NOT in the deployed HTML yet. When you're happy with the
 * photos, say so and they get "baked" into real files in assets/photos/ with
 * proper <img> tags, so they ship with the live site.
 *
 * Usage:  <photo-drop id="range-rover-hero" label="Drop a Range Rover photo"></photo-drop>
 *   id     REQUIRED, unique per slot — the localStorage key + baked filename.
 *   label  Empty-state caption.
 * Size/position come from CSS (drop it in a .photo-feature / .photo box and it
 * fills it). The longest edge is downscaled to 1600px WebP before storing.
 */
(() => {
  const KEY = (id) => 'acrphoto:' + id;
  const MAX = 1600;
  // Authoring chrome (drag/replace/remove + placeholder text) only in edit mode:
  // open any page with ?edit in the URL. Public visitors never see it.
  const EDIT = /[?&]edit\b/.test(location.search) || location.hash === '#edit';
  const ACCEPT = ['image/png', 'image/jpeg', 'image/webp', 'image/avif'];

  async function downscale(file) {
    const bmp = await createImageBitmap(file);
    try {
      const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
      const w = Math.max(1, Math.round(bmp.width * scale));
      const h = Math.max(1, Math.round(bmp.height * scale));
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d').drawImage(bmp, 0, 0, w, h);
      return c.toDataURL('image/webp', 0.85);
    } finally { bmp.close && bmp.close(); }
  }

  class PhotoDrop extends HTMLElement {
    connectedCallback() {
      if (this._init) return; this._init = true;
      this.id_ = this.getAttribute('id') || '';
      this.label = this.getAttribute('label') || 'Drop an image';
      this.src_ = this.getAttribute('src') || '';
      if (EDIT) this.classList.add('editmode');
      const root = this.attachShadow({ mode: 'open' });
      root.innerHTML = `
        <style>
          :host{position:absolute;inset:0;display:block;cursor:pointer;
            font:500 13px/1.4 system-ui,-apple-system,sans-serif}
          .box{position:absolute;inset:0;display:flex;flex-direction:column;
            align-items:center;justify-content:center;gap:8px;text-align:center;
            padding:18px;background:
              radial-gradient(120% 120% at 50% 0,rgba(120,140,170,.10),rgba(10,16,28,.55));
            color:rgba(220,228,240,.72);transition:background .15s,box-shadow .15s}
          .box.over{background:radial-gradient(120% 120% at 50% 0,rgba(150,180,220,.30),rgba(10,16,28,.7));
            box-shadow:inset 0 0 0 2px rgba(170,195,230,.8)}
          svg{width:30px;height:30px;opacity:.85}
          .t{font-weight:600;color:rgba(232,238,248,.92)}
          .s{font-size:11.5px;color:rgba(190,200,216,.6);max-width:240px;line-height:1.45}
          img{position:absolute;inset:0;width:100%;height:100%;object-fit:var(--photo-fit,cover);object-position:var(--photo-pos,center);display:block}
          .tools{position:absolute;top:10px;right:10px;z-index:2;display:none;gap:7px}
          :host(.filled.editmode) .tools{display:flex}
          .tbtn{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;
            border-radius:999px;border:none;cursor:pointer;font:600 12px/1 system-ui,-apple-system,sans-serif;
            background:rgba(8,12,20,.72);color:#fff;backdrop-filter:blur(4px);transition:background .15s}
          .tbtn:hover{background:rgba(8,12,20,.92)}
          .tbtn.rm{width:30px;padding:0;justify-content:center;font-size:15px}
          .tbtn svg{width:14px;height:14px;opacity:.9}
          :host(.filled) .box{display:none}
          input{display:none}
          :host(:not(.editmode)) .t,:host(:not(.editmode)) .s{display:none}
          :host(:not(.editmode):not(.filled)){cursor:default}
        </style>
        <div class="box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"
            stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <circle cx="8.5" cy="8.5" r="1.6"/><path d="m21 15-5-5L5 21"/></svg>
          <span class="t"></span><span class="s">Drag a photo here or click to browse · JPG/PNG/WebP</span>
        </div>
        <div class="tools">
          <button class="tbtn rp" title="Replace photo" aria-label="Replace photo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>Replace</button>
          <button class="tbtn rm" title="Remove photo" aria-label="Remove photo">&times;</button>
        </div>
        <input type="file" accept="image/*">`;
      this._box = root.querySelector('.box');
      this._input = root.querySelector('input');
      this._rm = root.querySelector('.rm');
      this._rp = root.querySelector('.rp');
      root.querySelector('.t').textContent = this.label;

      if (EDIT) {
        this.addEventListener('click', (e) => {
          if (this.shadowRoot.querySelector('.tools').contains(e.target)) return;
          if (!this.classList.contains('filled')) this._input.click();
        });
        this._rp.addEventListener('click', (e) => { e.stopPropagation(); this._input.click(); });
        this._input.addEventListener('change', () => {
          if (this._input.files && this._input.files[0]) this._handle(this._input.files[0]);
        });
        ['dragenter', 'dragover'].forEach((t) =>
          this.addEventListener(t, (e) => { e.preventDefault(); this._box.classList.add('over'); }));
        ['dragleave', 'dragend'].forEach((t) =>
          this.addEventListener(t, () => this._box.classList.remove('over')));
        this.addEventListener('drop', (e) => {
          e.preventDefault(); this._box.classList.remove('over');
          const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
          if (f) this._handle(f);
        });
        this._rm.addEventListener('click', (e) => {
          e.stopPropagation();
          try { localStorage.removeItem(KEY(this.id_)); } catch (_) {}
          this._render(this.src_ || null);
        });
      }

      let saved = null;
      if (EDIT) { try { saved = localStorage.getItem(KEY(this.id_)); } catch (_) {} }
      this._render(saved || this.src_ || null);
    }

    async _handle(file) {
      if (file.type && !ACCEPT.includes(file.type)) { alert('Use a JPG, PNG or WebP image.'); return; }
      try {
        const url = await downscale(file);
        try { localStorage.setItem(KEY(this.id_), url); }
        catch (_) { alert('Browser storage is full — remove a photo or bake the current ones in first.'); return; }
        this._render(url);
      } catch (_) { alert('Could not read that image.'); }
    }

    _render(url) {
      const old = this.shadowRoot.querySelector('img');
      if (old) old.remove();
      if (url) {
        const img = document.createElement('img');
        img.src = url; img.alt = this.label;
        this.shadowRoot.insertBefore(img, this.shadowRoot.querySelector('.tools'));
        this.classList.add('filled');
      } else {
        this.classList.remove('filled');
      }
    }
  }
  if (!customElements.get('photo-drop')) customElements.define('photo-drop', PhotoDrop);
})();
