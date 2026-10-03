// ==UserScript==
// @name         Portál farmáře – zjednodušený (prasata + ovce)
// @namespace    https://github.com/ceskyDJ/portal-farmare-simplified
// @version      1.4.7
// @description  Jednoduchý dashboard a registry pro malého chovatele prasat a ovcí v Portálu farmáře / IZR
// @author       Michal Šmahel (ceskyDJ)
// @match        https://mze.gov.cz/ssl/app/izr2far/*
// @run-at       document-start
// @grant        none
// @sandbox      raw
// ==/UserScript==

(function () {
  'use strict';

  const PF = (window.PF = window.PF || {});
  const STORAGE_KEY = 'pf-simple-enabled';

  /** One-shot: #pfFlushCache=1 clears herd count / Poslední změna caches then reloads clean. */
  function consumeFlushCacheFlag() {
    try {
      const hash = String(location.hash || '').replace(/^#/, '');
      const fromHash = new URLSearchParams(hash).get('pfFlushCache');
      const fromQuery = new URL(location.href).searchParams.get('pfFlushCache');
      const q = fromHash != null ? fromHash : fromQuery;
      if (q !== '1' && q !== 'on') return false;
      [
        'pf-count-pigs',
        'pf-pig-last-change-v4',
        'pf-count-sheep',
        'pf-count-sheep-male',
        'pf-count-sheep-female',
        'pf-sheep-last-change',
        'pf-sheep-last-change-v2',
      ].forEach((k) => {
        try {
          localStorage.removeItem(k);
        } catch (_) {}
      });
      const u = new URL(location.href);
      u.searchParams.delete('pfFlushCache');
      let nextHash = '';
      if (hash) {
        const hp = new URLSearchParams(hash);
        hp.delete('pfFlushCache');
        const s = hp.toString();
        nextHash = s ? '#' + s : '';
      }
      const clean = u.pathname + (u.search || '') + nextHash;
      const cur = location.pathname + location.search + location.hash;
      if (clean !== cur) {
        location.replace(clean);
        return 'nav';
      }
      return 'cleared';
    } catch (_) {
      return false;
    }
  }
  if (consumeFlushCacheFlag() === 'nav') return;

  /** Console/helper: PF.flushHerdCache() or PF.flushHerdCache('pig') */
  PF.flushHerdCache = function (kind) {
    if (PF.registers && typeof PF.registers.invalidateHerdCaches === 'function') {
      PF.registers.invalidateHerdCaches(kind || '');
      try {
        const k = typeof pageKind === 'function' ? pageKind() : '';
        if ((!kind || /pig/i.test(kind)) && (k === 'pig' || k === 'pig-history')) {
          PF.registers.renderPigRegisterSummary();
        }
        if (
          (!kind || /sheep/i.test(kind)) &&
          (k === 'sheep' || k === 'sheep-history')
        ) {
          PF.registers.renderSheepRegisterSummary();
        }
      } catch (_) {}
      return true;
    }
    try {
      [
        'pf-count-pigs',
        'pf-pig-last-change-v4',
        'pf-count-sheep',
        'pf-count-sheep-male',
        'pf-count-sheep-female',
        'pf-sheep-last-change',
        'pf-sheep-last-change-v2',
      ].forEach((k) => localStorage.removeItem(k));
      return true;
    } catch (_) {
      return false;
    }
  };

  function earlyEnabled() {
    try {
      const u = new URL(location.href);
      if (u.searchParams.get('pf') === 'off') {
        localStorage.setItem(STORAGE_KEY, '0');
        return false;
      }
      if (u.searchParams.get('pf') === 'on') {
        localStorage.setItem(STORAGE_KEY, '1');
        return true;
      }
      if (localStorage.getItem(STORAGE_KEY) === '0') return false;
    } catch (_) {}
    return true;
  }

  /* Early boot loader + in-app busy overlay (farmer animation) */
  PF.loader = {
    // Head silhouette + straw hat — same 64×64 filled style as pig/sheep icons
    farmerSvg: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" fill="currentColor" aria-hidden="true"><path d="M18 22c1.2-11 6.5-17 14-17s12.8 6 14 17c-2.8-1.4-7.8-2.2-14-2.2S20.8 20.6 18 22z"/><ellipse cx="32" cy="24" rx="23" ry="5.5"/><ellipse cx="32" cy="40" rx="16.5" ry="17"/><circle cx="25.5" cy="38" r="2.5" fill="#f7f4ec"/><circle cx="38.5" cy="38" r="2.5" fill="#f7f4ec"/><path fill="#f7f4ec" d="M26.5 46.5c2.2 2.8 8.8 2.8 11 0-.4 3.2-3.5 5.2-5.5 5.2s-5.1-2-5.5-5.2z"/><path d="M14 52.5c3.2-3.5 9-5.5 18-5.5s14.8 2 18 5.5c-3.5 1.8-10 2.8-18 2.8s-14.5-1-18-2.8z" opacity=".35"/></svg>`,
    _busyDepth: 0,
    _held: false,
    _hideTimer: null,
    _hookTimer: null,
    _busyMo: null,

    _overlayCss(extra) {
      return `
        ${extra || ''}
        #pf-boot-loader,
        #pf-busy-loader {
          visibility: visible !important;
          position: fixed !important;
          inset: 0 !important;
          z-index: 2147483647 !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 18px !important;
          background:
            radial-gradient(900px 420px at 15% 0%, #dfe8d8 0%, transparent 55%),
            radial-gradient(800px 380px at 100% 10%, #f0e0cc 0%, transparent 50%),
            #f3efe6 !important;
          font-family: "IBM Plex Sans", "Segoe UI", sans-serif !important;
          color: #1c401a !important;
        }
        /* Idle busy overlay stays mounted but invisible (no remount flash) */
        #pf-busy-loader:not(.pf-busy-on):not(.pf-busy-out) {
          opacity: 0 !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
        #pf-boot-loader .pf-boot-icon,
        #pf-busy-loader .pf-boot-icon {
          width: 88px;
          height: 88px;
          color: #1c401a;
          animation: pfBootBob 1.6s ease-in-out infinite;
        }
        #pf-boot-loader .pf-boot-icon svg,
        #pf-busy-loader .pf-boot-icon svg {
          width: 100%;
          height: 100%;
          display: block;
        }
        #pf-boot-loader .pf-boot-title,
        #pf-busy-loader .pf-boot-title {
          font-family: "IBM Plex Serif", Georgia, serif;
          font-size: 1.45rem;
          font-weight: 600;
          letter-spacing: -0.02em;
        }
        #pf-boot-loader .pf-boot-sub,
        #pf-busy-loader .pf-boot-sub {
          font-size: 0.92rem;
          color: #5a6456;
          font-weight: 500;
        }
        #pf-boot-loader .pf-boot-bar,
        #pf-busy-loader .pf-boot-bar {
          width: 168px;
          height: 4px;
          border-radius: 999px;
          background: rgba(28, 64, 26, 0.12);
          overflow: hidden;
          margin-top: 4px;
        }
        #pf-boot-loader .pf-boot-bar > span,
        #pf-busy-loader .pf-boot-bar > span {
          display: block;
          height: 100%;
          width: 40%;
          border-radius: inherit;
          background: #1c401a;
          animation: pfBootSlide 1.1s ease-in-out infinite;
        }
        @keyframes pfBootBob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes pfBootSlide {
          0% { transform: translateX(-120%); }
          100% { transform: translateX(320%); }
        }
        html.pf-booting-out #pf-boot-loader,
        #pf-busy-loader.pf-busy-out:not(.pf-busy-on) {
          opacity: 0;
          transition: opacity 0.28s ease;
          pointer-events: none;
        }
        /* Save hold: never fade / hide content — keep icon+text continuously visible */
        body.pf-save-busy #pf-busy-loader,
        #pf-busy-loader.pf-busy-on {
          opacity: 1 !important;
          visibility: visible !important;
          pointer-events: auto !important;
          transition: none !important;
          display: flex !important;
        }
        body.pf-save-busy #pf-busy-loader .pf-boot-icon,
        body.pf-save-busy #pf-busy-loader .pf-boot-title,
        body.pf-save-busy #pf-busy-loader .pf-boot-sub,
        body.pf-save-busy #pf-busy-loader .pf-boot-bar,
        #pf-busy-loader.pf-busy-on .pf-boot-icon,
        #pf-busy-loader.pf-busy-on .pf-boot-title,
        #pf-busy-loader.pf-busy-on .pf-boot-sub,
        #pf-busy-loader.pf-busy-on .pf-boot-bar {
          opacity: 1 !important;
          visibility: visible !important;
        }
        #pf-boot-loader .pf-boot-exit {
          position: absolute;
          bottom: max(24px, env(safe-area-inset-bottom, 0px));
          left: 50%;
          transform: translateX(-50%);
          margin: 0;
          padding: 10px 14px;
          border: 0;
          background: transparent;
          font-family: inherit;
          font-size: 0.82rem;
          font-weight: 500;
          letter-spacing: 0.01em;
          color: #8a9386;
          text-decoration: none;
          cursor: pointer;
          white-space: nowrap;
          transition: color 0.15s ease, opacity 0.15s ease;
          opacity: 0.9;
        }
        #pf-boot-loader .pf-boot-exit:hover,
        #pf-boot-loader .pf-boot-exit:focus-visible {
          color: #1c401a;
          opacity: 1;
          text-decoration: underline;
          outline: none;
        }
        /* Native "Čekejte prosím…" progress dialog — replaced by farmer overlay */
        body.pf-simple .progress-dialog,
        body.pf-simple .ui-dialog:has(.progress-dialog) {
          display: none !important;
          visibility: hidden !important;
          pointer-events: none !important;
        }
      `;
    },

    _exitEasyMode(e) {
      if (e) e.preventDefault();
      try {
        localStorage.setItem(STORAGE_KEY, '0');
      } catch (_) {}
      try {
        const u = new URL(location.href);
        u.searchParams.delete('pf');
        u.searchParams.set('pf', 'off');
        location.replace(u.pathname + '?' + u.searchParams.toString() + u.hash);
      } catch (_) {
        location.reload();
      }
    },

    _mountOverlay(id, subtitle) {
      if (document.getElementById(id)) return true;
      if (!document.body) return false;
      const el = document.createElement('div');
      el.id = id;
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      const exitHtml =
        id === 'pf-boot-loader'
          ? '<button type="button" class="pf-boot-exit" id="pf-boot-exit">Zobrazit původní Portál farmáře</button>'
          : '';
      el.innerHTML =
        '<div class="pf-boot-icon">' +
        this.farmerSvg +
        '</div>' +
        '<div class="pf-boot-title">Portál farmáře</div>' +
        '<div class="pf-boot-sub">' +
        subtitle +
        '</div>' +
        '<div class="pf-boot-bar"><span></span></div>' +
        exitHtml;
      document.body.appendChild(el);
      if (id === 'pf-boot-loader') {
        const btn = el.querySelector('#pf-boot-exit');
        if (btn) btn.addEventListener('click', (ev) => this._exitEasyMode(ev));
      }
      return true;
    },

    show() {
      if (!document.getElementById('pf-boot-style')) {
        const style = document.createElement('style');
        style.id = 'pf-boot-style';
        style.textContent = this._overlayCss(`
          html.pf-booting,
          html.pf-booting body {
            background: #f3efe6 !important;
          }
          html.pf-booting body > *:not(#pf-boot-loader):not(#pf-busy-loader) {
            visibility: hidden !important;
          }
        `);
        (document.head || document.documentElement).appendChild(style);
      }
      document.documentElement.classList.add('pf-booting');

      const mount = () =>
        this._mountOverlay('pf-boot-loader', 'Načítání…');

      if (!mount()) {
        const mo = new MutationObserver(() => {
          if (mount()) mo.disconnect();
        });
        mo.observe(document.documentElement, { childList: true, subtree: true });
      }
    },

    hide() {
      const html = document.documentElement;
      html.classList.add('pf-booting-out');
      const done = () => {
        html.classList.remove('pf-booting', 'pf-booting-out');
        const el = document.getElementById('pf-boot-loader');
        if (el) el.remove();
        // Drop boot stylesheet only when busy overlay is not using it
        if (this._busyDepth <= 0 && !document.getElementById('pf-busy-loader')) {
          const st = document.getElementById('pf-boot-style');
          if (st) st.remove();
        }
        // Boot CSS hid all body children — show queued toasts only after overlay is gone
        try {
          if (PF.toast && typeof PF.toast.flush === 'function') PF.toast.flush();
        } catch (_) {}
      };
      setTimeout(done, 300);
    },

    _ensureBusyStyle() {
      // Always use a dedicated busy stylesheet (don't share boot-style —
      // boot cleanup would strip rules from an in-flight save overlay).
      if (document.getElementById('pf-busy-style')) return;
      const style = document.createElement('style');
      style.id = 'pf-busy-style';
      style.textContent = this._overlayCss('');
      (document.head || document.documentElement).appendChild(style);
    },

    _fillBusyContent(el, subtitle) {
      if (!el) return;
      const sub = subtitle || 'Ukládám…';
      if (!el.querySelector('.pf-boot-icon')) {
        el.innerHTML =
          '<div class="pf-boot-icon">' +
          this.farmerSvg +
          '</div>' +
          '<div class="pf-boot-title">Portál farmáře</div>' +
          '<div class="pf-boot-sub">' +
          sub +
          '</div>' +
          '<div class="pf-boot-bar"><span></span></div>';
        return;
      }
      const s = el.querySelector('.pf-boot-sub');
      if (s && subtitle) s.textContent = subtitle;
    },

    _ensureBusyVisible(subtitle) {
      this._ensureBusyStyle();
      this._cancelBusyHide();
      let el = document.getElementById('pf-busy-loader');
      if (!el) {
        if (!document.body) {
          const mo = new MutationObserver(() => {
            if (document.body) {
              mo.disconnect();
              this._ensureBusyVisible(subtitle);
            }
          });
          mo.observe(document.documentElement, { childList: true, subtree: true });
          return;
        }
        el = document.createElement('div');
        el.id = 'pf-busy-loader';
        el.setAttribute('role', 'status');
        el.setAttribute('aria-live', 'polite');
        document.body.appendChild(el);
      }
      this._fillBusyContent(el, subtitle || 'Ukládám…');
      el.classList.remove('pf-busy-out');
      el.classList.add('pf-busy-on');
    },

    showBusy(subtitle) {
      if (!earlyEnabled()) return;
      // While a form-save holds the overlay, portal progress open/close is a no-op
      if (this._held) return;
      this._busyDepth = Math.max(0, this._busyDepth) + 1;
      this._ensureBusyVisible(subtitle || 'Čekejte prosím…');
    },

    holdBusy(subtitle) {
      this._held = true;
      this._busyDepth = Math.max(1, this._busyDepth);
      try {
        document.body.classList.add('pf-save-busy');
      } catch (_) {}
      this._cancelBusyHide();
      this._ensureBusyVisible(subtitle || 'Ukládám…');
      this._watchBusyDom();
    },

    hideBusy() {
      // Held overlay stays up until releaseBusy() — ignore portal closes entirely
      if (this._held) return;
      this._busyDepth = Math.max(0, this._busyDepth - 1);
      if (this._busyDepth > 0) return;
      this._scheduleBusyHide();
    },

    releaseBusy() {
      this._held = false;
      this._busyDepth = 0;
      this._unwatchBusyDom();
      try {
        document.body.classList.remove('pf-save-busy');
      } catch (_) {}
      this._scheduleBusyHide();
    },

    _watchBusyDom() {
      this._unwatchBusyDom();
      this._busyMo = new MutationObserver(() => {
        if (!this._held) return;
        const el = document.getElementById('pf-busy-loader');
        if (!el || !el.querySelector('.pf-boot-icon')) {
          this._ensureBusyVisible('Ukládám…');
        } else {
          el.classList.add('pf-busy-on');
          el.classList.remove('pf-busy-out');
          if (el.parentElement !== document.body && document.body) {
            document.body.appendChild(el);
          }
        }
      });
      this._busyMo.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    },

    _unwatchBusyDom() {
      if (this._busyMo) {
        try {
          this._busyMo.disconnect();
        } catch (_) {}
        this._busyMo = null;
      }
    },

    _cancelBusyHide() {
      if (this._hideTimer != null) {
        try {
          clearTimeout(this._hideTimer);
        } catch (_) {}
        this._hideTimer = null;
      }
      const el = document.getElementById('pf-busy-loader');
      if (el) {
        el.classList.remove('pf-busy-out');
        if (this._held) el.classList.add('pf-busy-on');
      }
    },

    _flushToastsWhenIdle() {
      if (this._held || this._busyDepth > 0) return;
      try {
        if (PF.toast && typeof PF.toast.flush === 'function') PF.toast.flush();
      } catch (_) {}
    },

    _scheduleBusyHide() {
      if (this._held) return;
      const el = document.getElementById('pf-busy-loader');
      if (!el) {
        this._flushToastsWhenIdle();
        return;
      }
      if (this._hideTimer != null) {
        try {
          clearTimeout(this._hideTimer);
        } catch (_) {}
        this._hideTimer = null;
      }
      el.classList.remove('pf-busy-on');
      el.classList.add('pf-busy-out');
      this._hideTimer = setTimeout(() => {
        this._hideTimer = null;
        if (this._held || this._busyDepth > 0) {
          el.classList.add('pf-busy-on');
          el.classList.remove('pf-busy-out');
          return;
        }
        // Keep node mounted for next save — only clear on-state
        el.classList.remove('pf-busy-on', 'pf-busy-out');
        this._flushToastsWhenIdle();
      }, 280);
    },

    /** Replace native $.progressDialog ("Čekejte prosím…") with farmer overlay */
    installProgressHooks() {
      if (!earlyEnabled()) return;
      const tryHook = () => {
        const $ = window.jQuery || window.$;
        if (!$ || typeof $.progressDialog !== 'function') return false;
        if ($.progressDialog._pfHooked) return true;

        const origOpen = $.progressDialog;
        const origClose = $.closeProgressDialog;

        $.progressDialog = function (progressMessage) {
          if (!earlyEnabled()) return origOpen.apply(this, arguments);
          PF.loader.showBusy('Čekejte prosím…');
          // Keep native dialog closed — CSS also hides it if something opens it
          try {
            const $dlg = $('.progress-dialog');
            if ($dlg.length && $dlg.data('ui-dialog')) $dlg.dialog('close');
          } catch (_) {}
        };
        $.progressDialog._pfHooked = true;

        $.closeProgressDialog = function (timeoutHandle) {
          if (timeoutHandle != null) {
            try {
              clearTimeout(timeoutHandle);
            } catch (_) {}
          }
          try {
            if ($.aq && $.aq.progressTimeoutHandle) {
              clearTimeout($.aq.progressTimeoutHandle);
              $.aq.progressTimeoutHandle = null;
            }
          } catch (_) {}
          if (earlyEnabled()) PF.loader.hideBusy();
          try {
            return origClose.apply(this, arguments);
          } catch (_) {}
        };

        return true;
      };

      if (tryHook()) return;
      if (this._hookTimer) return;
      let n = 0;
      this._hookTimer = setInterval(() => {
        n += 1;
        if (tryHook() || n > 200) {
          clearInterval(this._hookTimer);
          this._hookTimer = null;
        }
      }, 50);
    },
  };

  if (earlyEnabled()) {
    PF.loader.show();
    PF.loader.installProgressHooks();
  }

  /* ------------------------------------------------------------------ */
  /* Config                                                             */
  /* ------------------------------------------------------------------ */
  PF.config = {
    storageKey: STORAGE_KEY,
    base: '/ssl/app/izr2far',
    marksNew:
      '/ssl/app/izr2far/Hlaseni/HlaseniStareIzr?kam=ZnamkyNoveOvc',
    marksDup:
      '/ssl/app/izr2far/Hlaseni/HlaseniStareIzr?kam=ZnamkyDuplOvc',
    /** Free (unused) ordered ear marks — ranges table on MujSubjekt panel */
    freeMarksPath:
      '/ssl/app/izr2far/SubjektyProvozovny/VyhledaniUZNezavesene/NezaveseneZnamky',
    /** Portal species key for ovce (fiDruhZvirat) */
    sheepDruhKey: '8328837ecad54c558d7a3098d2b160db',
    home: '/ssl/app/izr2far/SubjektyProvozovny/MujSubjekt',

    sheepActions: [
      { code: '34', labels: ['narození', 'narozeni'], typ: 'Narozeni' },
      {
        code: '63',
        labels: ['domácí porážka', 'domaci porazka', 'porážka', 'porazka'],
        typ: 'DomaciPorazka',
      },
      {
        code: '30',
        labels: ['nákup/přísun', 'nakup/prisun', 'nákup', 'přísun', 'nakup', 'prisun'],
        typ: 'NakupPrisun',
      },
      {
        code: '70',
        labels: ['prodej/odsun', 'prodej', 'odsun'],
        typ: 'ProdejOdsun',
      },
      {
        code: '40',
        labels: ['zcizení', 'zcizeni'],
        typ: 'Zcizeni',
      },
    ],

    pigActions: [
      {
        labels: ['nákup', 'přísun', 'nakup', 'prisun', 'nákup/přísun'],
        typ: 'NakupPrisun',
      },
      {
        labels: ['domácí porážka', 'domaci porazka', 'porážka'],
        typ: 'DomaciPorazka',
      },
    ],

    sheepColumnsKeep: [
      'ušní',
      'usni',
      'pohlav',
      'matka',
      'narozen',
      'naroz',
      'datum nar',
      'dat.nar',
      'dat nar',
      'birth',
      'přích',
      'prich',
      'přidán',
      'pridan',
      'dat. přích',
      'dat přích',
      'dat.prich',
      'poznzvire',
      'pozn. zvire',
      'poznámka zvíře',
      'poznamka zvire',
    ],

    sheepHistoryKeep: [
      'ušní',
      'usni',
      'datum',
      'změna',
      'zmena',
      'událost',
      'udalost',
      'poznámka',
      'poznamka',
      'stav',
      'odeslán',
      'odeslan',
      'zpracov',
    ],

    pigColumnsKeep: [
      'počet',
      'pocet',
      'samec',
      'kanec',
      'kanc',
      'sameč',
      'samc',
      'samci',
      'celkem',
    ],

    pigHistoryKeep: [
      'datum',
      'změna',
      'zmena',
      'událost',
      'udalost',
      'operac',
      'nákup',
      'nakup',
      'přísun',
      'prisun',
      'poráž',
      'poraz',
      'počet',
      'pocet',
      'samec',
      'kanc',
      'stav',
      'odeslán',
      'odeslan',
      'ks',
    ],

    pigColumnExclude: [
      'prasnic',
      'samice',
      'samic',
      '♀',
      'female',
    ],

    dialogKeepLabels: [
      'ušní',
      'usni',
      'pohlav',
      'matka',
      'narozen',
      'datum',
      'partner',
      'počet',
      'pocet',
      'samec',
      'samice',
      'prasnic',
      'kanc',
      'kategorie',
      'provozovn',
      'stáj',
      'staj',
      'poznám',
      'poznam',
      'země',
      'zeme',
      'typ',
      'událost',
      'udalost',
      'změna',
      'zmena',
    ],
  };

  /* ------------------------------------------------------------------ */
  /* Utilities                                                          */
  /* ------------------------------------------------------------------ */
  // Prefer live lookup — jQuery is usually not ready at @run-at document-start
  // (Firefox Tampermonkey often hits true document-start; Chrome may inject later).
  function jq() {
    return window.jQuery || window.$;
  }
  // Module-level `$` is filled only via refresh$() — never trust a document-start capture.
  // eslint-disable-next-line no-unused-vars
  var $;
  /** Resolve current page jQuery into `$` and return it. Call before every `$` use. */
  function refresh$() {
    $ = jq();
    return $;
  }

  function norm(s) {
    return String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function textOf(el) {
    return String((el && el.textContent) || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Cell text for simplified tables — strip filter popups / inputs. */
  function cellText(el) {
    if (!el) return '';
    const clone = el.cloneNode(true);
    qsa(
      [
        '.popup',
        '.popup-filter',
        '.filter-info',
        'select',
        'input',
        'button',
        'textarea',
        '.show-filter',
        '.operator-info',
        '.fas',
        '.far',
        '.fa',
        'img',
      ].join(', '),
      clone
    ).forEach((n) => n.remove());
    return textOf(clone);
  }

  /** Czech display date: d. m. YYYY (no leading zeros, spaces after dots). */
  function formatCzDate(s) {
    const m = String(s || '')
      .trim()
      .match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
    if (!m) return String(s || '').trim();
    return (
      parseInt(m[1], 10) +
      '. ' +
      parseInt(m[2], 10) +
      '. ' +
      m[3]
    );
  }

  /** Rewrite every dd.mm.yyyy (optional spaces) inside a string to Czech form. */
  function formatCzDatesInText(s) {
    return String(s || '').replace(
      /\b(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})\b/g,
      (_, d, m, y) => parseInt(d, 10) + '. ' + parseInt(m, 10) + '. ' + y
    );
  }

  /** Map known event codes → friendly Czech labels. */
  function eventCodeLabel(code) {
    const map = {
      '34': 'Narození',
      '30': 'Nákup / přísun',
      '63': 'Domácí porážka',
      '70': 'Prodej / odsun',
      '40': 'Zcizení',
    };
    return map[String(code)] || '';
  }

  const EVENT_CODES = '34|30|63|70|40';

  /** Hide internal event codes (63, (30), …) from farmer-facing text. */
  function stripEventCodes(s) {
    let t = String(s || '');
    const onlyCode = t.trim().match(new RegExp('^\\(?\\s*(' + EVENT_CODES + ')\\s*\\)?$'));
    if (onlyCode) {
      return eventCodeLabel(onlyCode[1]) || t.trim();
    }
    // "Domácí porážka (63)" / any two-digit code in parentheses
    t = t.replace(/\(\s*\d{2}\s*\)/g, ' ');
    // "63 - Domácí porážka" / "63 Domácí…" (known codes only — don't eat counts)
    t = t.replace(new RegExp('^\\s*(?:' + EVENT_CODES + ')\\s*[-–:—]\\s*'), '');
    t = t.replace(new RegExp('^\\s*(?:' + EVENT_CODES + ')\\s+(?=\\S)'), '');
    t = t.replace(new RegExp('\\s*[-–:—]\\s*(?:' + EVENT_CODES + ')\\s*$'), '');
    t = t.replace(new RegExp('\\bkod(?:u)?\\s*(?:' + EVENT_CODES + ')\\b', 'gi'), ' ');
    return t.replace(/\s+/g, ' ').trim();
  }

  function friendlyDisplayText(s) {
    return formatCzDatesInText(stripEventCodes(s));
  }

  /** Keep only the date part of a Czech/ISO datetime string. */
  function dateOnlyText(s) {
    const t = String(s || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    // 30.09.2024 10:15:22 / 30. 9. 2024 10.15.22 / etc. — take first date, drop time
    const cz = t.match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
    if (cz) return formatCzDate(cz[1] + '.' + cz[2] + '.' + cz[3]);
    const iso = t.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return formatCzDate(iso[3] + '.' + iso[2] + '.' + iso[1]);
    return friendlyDisplayText(t);
  }

  function isNahlaseniColumn(kind, label, th) {
    if (
      kind !== 'pig-history' &&
      kind !== 'pig-send' &&
      kind !== 'sheep-history' &&
      kind !== 'sheep-send'
    ) {
      return false;
    }
    const shown = PF.registers.displayHeaderLabel(kind, label || '');
    if (shown === 'Datum nahlášení' || shown === 'Datum přidání') return true;
    const blob = norm(
      (label || '') +
        ' ' +
        ((th &&
          (th.getAttribute('data-colname') ||
            th.getAttribute('data-field') ||
            '')) ||
          '')
    );
    return /zalozen|nahlas|nahlás|odeslan|datumcas|caszalozen|casodeslan/.test(
      blob
    );
  }

  function isFilterChromeRow(tr) {
    if (!tr) return true;
    if (
      tr.classList.contains('filter') ||
      tr.classList.contains('filter-row') ||
      tr.classList.contains('filtering')
    ) {
      return true;
    }
    if (qs('th', tr)) return true;
    if (
      qs(
        '.popup-filter, .filter-info, select.operators, .grid-header-filter, .show-filter, .datepicker',
        tr
      )
    ) {
      return true;
    }
    const t = norm(textOf(tr));
    if (!t) return false;
    // Operator-only chrome that leaks from filter dropdowns
    if (
      /je prazdne|je zadane|od - do|neobsahuje|zacina na|konci na/.test(t) ||
      (/^(=|<=|>=|je|neni|obsahuje)(\s+(=|<=|>=|je|neni|obsahuje|od|do|neobsahuje|zacina|konci|prazdne|zadane|na|-))*$/.test(
        t
      ) &&
        t.length < 160)
    ) {
      return true;
    }
    return false;
  }

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  /** Run DOM writes without triggering PF MutationObserver refresh storms. */
  PF._pfQuietMutate = function (fn) {
    PF._pfMutating = true;
    try {
      return fn();
    } finally {
      // Defer clear so nested mutation records from this turn are ignored
      setTimeout(() => {
        PF._pfMutating = false;
      }, 0);
    }
  };

  function matchesAny(hay, needles) {
    const h = norm(hay);
    return needles.some((n) => h.includes(norm(n)));
  }

  function getParam(name) {
    try {
      return new URL(location.href).searchParams.get(name);
    } catch (_) {
      return null;
    }
  }

  function isEnabled() {
    if (getParam('pf') === 'off') {
      try {
        localStorage.setItem(STORAGE_KEY, '0');
      } catch (_) {}
      return false;
    }
    if (getParam('pf') === 'on') {
      try {
        localStorage.setItem(STORAGE_KEY, '1');
      } catch (_) {}
      return true;
    }
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === '0') return false;
    } catch (_) {}
    return true;
  }

  function setEnabled(on) {
    try {
      localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
    } catch (_) {}
  }

  function pageKind() {
    const p = location.pathname;
    if (/MujSubjekt/i.test(p)) return 'home';
    if (/StajovyRegistrIndivZmeny/i.test(p)) return 'sheep-send';
    if (/StajovyRegistrIndivPohyby/i.test(p)) return 'sheep-history';
    if (/StajovyRegistrIndiv/i.test(p)) return 'sheep';
    if (/StajovyRegistrPrasatZmeny/i.test(p)) return 'pig-send';
    // Dead/missing pig controllers — redirected in boot
    if (/StajovyRegistrPrasatPohyby/i.test(p)) return 'pig-history-redirect';
    if (/StajovyRegistrPrasatHlaseni/i.test(p)) return 'pig-reports';
    if (/StajovyRegistrPrasat/i.test(p)) {
      // Pig change history lives on the register page itself (not a separate URL)
      try {
        const u = new URL(location.href);
        if (
          u.searchParams.get('pfView') === 'history' ||
          u.hash === '#pf-history'
        )
          return 'pig-history';
      } catch (_) {}
      return 'pig';
    }
    if (/ZnamkyNoveOvc|ZnamkyDuplOvc/i.test(location.href)) return 'marks';
    return 'other';
  }

  function valueBeforeValidation(validationId) {
    const marker = qs('#' + validationId);
    if (!marker) return '';
    const prev = marker.previousElementSibling;
    if (prev) {
      const t = textOf(prev);
      if (t) return t;
    }
    // Fallback: first non-validation span in the same cell
    const cell = marker.closest('td') || marker.parentElement;
    if (!cell) return '';
    for (const span of qsa('span', cell)) {
      if (span === marker || span.id === validationId) continue;
      if (span.classList.contains('field-validation-valid')) continue;
      const t = textOf(span);
      if (t) return t;
    }
    return '';
  }

  function valueByCaption(caption) {
    const want = norm(caption);
    const cells = qsa('td.member-editor-caption');
    for (const td of cells) {
      if (norm(td.textContent) === want || norm(td.textContent).includes(want)) {
        const next = td.nextElementSibling;
        if (!next) continue;
        const span = next.querySelector('span[data-mask], span:not(.field-validation-valid)') || next;
        let t = textOf(span);
        // Strip grey internal codes
        t = t.replace(/\b\d{7,}\b$/, '').replace(/,\s*$/, '').trim();
        if (t) return t;
      }
    }
    return '';
  }

  function contactField(caption) {
    const want = norm(caption);
    // Prefer first (primary) contact block – skip hidden collapsable
    const rows = qsa(
      '.entity-editor-group-header h2, .entity-editor-group-header'
    )
      .filter((h) => /kontakty subjektu/i.test(h.textContent || ''))
      .map((h) => h.closest('.entity-editor-group'))
      .filter(Boolean);

    const root = rows[0] || document;
    for (const td of qsa('td.member-editor-caption', root)) {
      if (td.closest('tbody.collapsable.d-none, tbody[style*="display: none"]'))
        continue;
      if (norm(td.textContent).includes(want)) {
        const next = td.nextElementSibling;
        if (!next) continue;
        let t = textOf(next);
        t = t.replace(/\b\d{7,}\b/g, '').replace(/,\s*$/, '').trim();
        if (t) return t;
      }
    }
    return '';
  }

  /* ------------------------------------------------------------------ */
  /* Styles                                                             */
  /* ------------------------------------------------------------------ */
  PF.style = {
    css: `
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Serif:wght@600&display=swap');

:root {
  --pf-bg: #f3efe6;
  --pf-bg-2: #e8e1d2;
  --pf-ink: #1a2418;
  --pf-muted: #5a6456;
  --pf-green: #1c401a;
  --pf-green-2: #2f5d2c;
  --pf-accent: #c45c26;
  --pf-sex-male: #3a6b8c;
  --pf-sex-male-ink: #2a5169;
  --pf-sex-male-soft: rgba(58, 107, 140, 0.12);
  --pf-sex-female: #b86b3c;
  --pf-sex-female-ink: #8a4a24;
  --pf-sex-female-soft: rgba(184, 107, 60, 0.14);
  --pf-line: rgba(28, 64, 26, 0.14);
  --pf-card: #fffdf8;
  --pf-shadow: 0 12px 40px rgba(26, 36, 24, 0.08);
  --pf-radius: 14px;
  --pf-font: "IBM Plex Sans", "Segoe UI", sans-serif;
  --pf-display: "IBM Plex Serif", Georgia, serif;
}

body.pf-simple {
  background:
    radial-gradient(1200px 500px at 10% -10%, #dfe8d8 0%, transparent 55%),
    radial-gradient(900px 420px at 100% 0%, #f0e0cc 0%, transparent 50%),
    var(--pf-bg) !important;
  font-family: var(--pf-font) !important;
  color: var(--pf-ink) !important;
  overflow-x: hidden !important;
  max-width: 100% !important;
}

html.pf-simple {
  overflow-x: hidden !important;
  max-width: 100% !important;
}

body.pf-simple #preheader,
body.pf-simple #menu-header-bar,
body.pf-simple #header-info-bar,
body.pf-simple .tabs-navlist,
body.pf-simple .detail-header,
body.pf-simple .header-wrap,
body.pf-simple .napoveda,
body.pf-simple #cssmenu {
  display: none !important;
}

body.pf-simple #main {
  max-width: none !important;
  margin: 0 !important;
  padding: 0 !important;
  background: transparent !important;
  overflow-x: hidden !important;
  position: relative !important;
}

/* Keep original nodes reachable for scrapers without expanding page scroll */
body.pf-simple.pf-home #main > *:not(#pf-app):not(.ui-dialog):not(#messages-box),
body.pf-simple.pf-register #main > *:not(#pf-app):not(.ui-dialog):not(#messages-box) {
  position: absolute !important;
  left: 0 !important;
  top: 0 !important;
  width: 1px !important;
  height: 1px !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  clip-path: inset(50%) !important;
  border: 0 !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

/* Portal message toasts → PF.toast (keep #messages-box in DOM for $.aq appends) */
body.pf-simple #messages-box,
body.pf-simple #messages-box .message-box,
body.pf-simple #messages-box .errormessage-box {
  display: none !important;
  visibility: hidden !important;
  pointer-events: none !important;
}

#pf-app {
  position: relative;
  z-index: 50;
  max-width: 1100px;
  width: 100%;
  box-sizing: border-box;
  margin: 0 auto;
  padding: 20px 18px 20px;
  animation: pfFade 0.35s ease both;
}

@keyframes pfFade {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: none; }
}

@keyframes pfPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(196, 92, 38, 0.35); }
  50% { box-shadow: 0 0 0 8px rgba(196, 92, 38, 0); }
}

@keyframes pfDatePulse {
  0%, 100% { opacity: 0.35; }
  50% { opacity: 0.85; }
}

#pf-pig-last-change.pf-date-loading,
#pf-sheep-last-change.pf-date-loading {
  color: var(--pf-muted) !important;
  font-size: 1rem !important;
  font-weight: 500 !important;
  animation: pfDatePulse 1.2s ease-in-out infinite;
}

.pf-top {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 20px;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 22px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--pf-line);
}

.pf-brand {
  font-family: var(--pf-display);
  font-size: clamp(1.6rem, 3vw, 2.15rem);
  font-weight: 600;
  color: var(--pf-green);
  letter-spacing: -0.02em;
  line-height: 1.15;
}

.pf-brand small {
  display: block;
  font-family: var(--pf-font);
  font-size: 0.78rem;
  font-weight: 500;
  color: var(--pf-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-top: 4px;
}

.pf-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.pf-nav a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid var(--pf-line);
  background: var(--pf-card);
  color: var(--pf-green) !important;
  text-decoration: none !important;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: background 0.15s, transform 0.15s, border-color 0.15s;
}

.pf-nav a:hover {
  background: #fff;
  border-color: var(--pf-green-2);
  transform: translateY(-1px);
}

.pf-nav a.pf-active {
  background: var(--pf-green);
  color: #f7f4ec !important;
  border-color: var(--pf-green);
}

.pf-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 42px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid var(--pf-line);
  background: var(--pf-card);
  color: var(--pf-green) !important;
  text-decoration: none !important;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: background 0.15s, transform 0.15s, border-color 0.15s;
}

.pf-btn:hover {
  background: #fff;
  border-color: var(--pf-green-2);
  transform: translateY(-1px);
}

.pf-btn-primary {
  background: var(--pf-green) !important;
  color: #f7f4ec !important;
  border-color: var(--pf-green) !important;
}

.pf-btn-warn {
  background: var(--pf-accent) !important;
  color: #fff !important;
  border-color: var(--pf-accent) !important;
  animation: pfPulse 2s ease infinite;
}

/* In-page section tabs (Registr / Historie / Odeslat) */
.pf-context-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  margin: 4px 0 18px;
  border-bottom: 2px solid var(--pf-line);
}

.pf-context-nav a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 18px;
  margin-bottom: -2px;
  border: none !important;
  border-bottom: 2px solid transparent !important;
  border-radius: 0 !important;
  background: transparent !important;
  color: var(--pf-muted) !important;
  font-weight: 600;
  font-size: 0.95rem;
  text-decoration: none !important;
  box-shadow: none !important;
  transform: none !important;
}

.pf-context-nav a:hover {
  color: var(--pf-green) !important;
  background: transparent !important;
  transform: none !important;
}

.pf-context-nav a.pf-tab-active {
  color: var(--pf-green) !important;
  border-bottom-color: var(--pf-green) !important;
}

.pf-context-nav a.pf-tab-warn {
  color: var(--pf-accent) !important;
}

.pf-context-nav a.pf-tab-warn.pf-tab-active {
  border-bottom-color: var(--pf-accent) !important;
}

/* Animal actions — distinct from navigation */
.pf-actions-block {
  margin: 0 0 16px;
  padding: 14px 16px;
  background: var(--pf-bg-2);
  border: 1px solid var(--pf-line);
  border-radius: 12px;
}

.pf-actions-block > .pf-actions-label {
  display: block;
  margin: 0 0 10px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--pf-muted);
}

.pf-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 0;
}

.pf-toolbar .toolbutton,
.pf-toolbar a.grid-action,
.pf-toolbar button,
.pf-toolbar a[onclick],
.pf-toolbar .pf-action-btn {
  display: inline-flex !important;
  align-items: center;
  min-height: 40px;
  padding: 0 14px !important;
  border-radius: 10px !important;
  border: 1px solid var(--pf-green) !important;
  background: var(--pf-green) !important;
  color: #f7f4ec !important;
  font-weight: 600 !important;
  text-decoration: none !important;
  cursor: pointer;
  font-family: var(--pf-font) !important;
  font-size: 0.92rem !important;
}

.pf-toolbar .pf-action-btn:hover {
  background: var(--pf-green-2) !important;
  border-color: var(--pf-green-2) !important;
}

.pf-toolbar .pf-action-btn.is-disabled,
.pf-toolbar .pf-action-btn[aria-disabled="true"] {
  background: #d5d2c8 !important;
  border-color: #c4c0b4 !important;
  color: #7a776c !important;
  cursor: not-allowed !important;
  opacity: 1;
  box-shadow: none !important;
  position: relative;
}
.pf-toolbar .pf-action-btn.is-disabled:hover,
.pf-toolbar .pf-action-btn[aria-disabled="true"]:hover {
  background: #d5d2c8 !important;
  border-color: #c4c0b4 !important;
  color: #7a776c !important;
}
.pf-toolbar .pf-action-btn.is-disabled[data-pf-warn]:hover::after,
.pf-toolbar .pf-action-btn[aria-disabled="true"][data-pf-warn]:hover::after {
  content: attr(data-pf-warn);
  position: absolute;
  left: 50%;
  bottom: calc(100% + 8px);
  transform: translateX(-50%);
  z-index: 40;
  width: max-content;
  max-width: 240px;
  padding: 8px 10px;
  border-radius: 8px;
  background: #2a3226;
  color: #f7f4ec;
  font-size: 0.8rem;
  font-weight: 500;
  line-height: 1.35;
  letter-spacing: normal;
  text-transform: none;
  white-space: normal;
  box-shadow: 0 8px 20px rgba(26, 36, 24, 0.22);
  pointer-events: none;
}
.pf-toolbar .pf-action-btn.is-disabled[data-pf-warn]:hover::before,
.pf-toolbar .pf-action-btn[aria-disabled="true"][data-pf-warn]:hover::before {
  content: "";
  position: absolute;
  left: 50%;
  bottom: calc(100% + 2px);
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-top-color: #2a3226;
  z-index: 40;
  pointer-events: none;
}

.pf-toolbar .pf-action-hide { display: none !important; }

.pf-toolbar:empty {
  display: none;
}

.pf-actions-block:has(.pf-toolbar:empty) {
  display: none;
}

/* Secondary utility links (ear tags) */
.pf-util-links {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 14px 18px;
  margin: 0 0 14px;
}

.pf-util-links a {
  color: var(--pf-muted) !important;
  font-size: 0.9rem;
  font-weight: 500;
  text-decoration: underline !important;
  text-underline-offset: 3px;
}

.pf-util-links a:hover {
  color: var(--pf-green) !important;
}

.pf-grid {
  display: grid;
  gap: 16px;
}

.pf-grid-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.pf-grid-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

@media (max-width: 760px) {
  .pf-grid-2, .pf-grid-3 { grid-template-columns: 1fr; }
}

.pf-panel {
  background: var(--pf-card);
  border: 1px solid var(--pf-line);
  border-radius: var(--pf-radius);
  box-shadow: var(--pf-shadow);
  padding: 18px 20px;
}

.pf-panel h2 {
  margin: 0 0 12px;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--pf-muted);
  font-weight: 600;
}

.pf-page-title {
  margin: 0 0 16px !important;
  font-family: var(--pf-display) !important;
  font-size: 1.85rem !important;
  line-height: 1.15 !important;
  letter-spacing: -0.02em !important;
  text-transform: none !important;
  color: var(--pf-green) !important;
  font-weight: 600 !important;
}

.pf-stat {
  text-align: center;
  padding: 22px 12px;
}

.pf-stat .pf-num {
  font-family: var(--pf-display);
  font-size: 3rem;
  line-height: 1;
  color: var(--pf-green);
}

.pf-stat .pf-num.pf-stat-date {
  font-size: clamp(1.55rem, 3.6vw, 2.35rem);
  letter-spacing: -0.01em;
  padding: 0 4px;
  /* Match count number row height so "Poslední změna" lines up with count labels */
  min-height: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.pf-stat .pf-label {
  margin-top: 8px;
  font-weight: 600;
  color: var(--pf-muted);
}

.pf-stat-split {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 12px 28px;
  width: 100%;
}

.pf-stat-split > div {
  flex: 1;
  min-width: 0;
  text-align: center;
}

.pf-stat-split .pf-num {
  font-size: clamp(2.1rem, 5vw, 2.75rem);
  min-height: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
}

.pf-register-summary {
  margin: 8px 0 16px;
}

a.pf-herd {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  text-decoration: none !important;
  color: inherit !important;
  cursor: pointer;
  transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
  min-height: 248px;
  padding: 22px 16px 18px;
  box-sizing: border-box;
}

a.pf-herd:hover,
a.pf-herd:focus-visible {
  transform: translateY(-3px);
  border-color: var(--pf-green-2);
  background: #fff;
  box-shadow: 0 16px 36px rgba(28, 64, 26, 0.12);
  outline: none;
}

a.pf-herd:hover .pf-herd-icon,
a.pf-herd:focus-visible .pf-herd-icon {
  transform: scale(1.06);
  color: var(--pf-green-2);
}

.pf-herd-icon {
  width: 72px;
  height: 72px;
  flex: 0 0 72px;
  color: var(--pf-green);
  transition: transform 0.18s ease, color 0.18s ease;
}

.pf-herd-icon svg {
  width: 100%;
  height: 100%;
  display: block;
}

.pf-herd .pf-num {
  font-family: var(--pf-display);
  font-size: 2.75rem;
  line-height: 1;
  color: var(--pf-green);
  min-height: 2.75rem;
  margin-top: -2px;
}

.pf-herd .pf-label {
  font-weight: 600;
  color: var(--pf-muted);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  font-size: 0.85rem;
  min-height: 1.2em;
}

a.pf-herd .pf-stat-split {
  margin-top: 4px;
  width: 100%;
}

.pf-herd-breakdown {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: center;
  gap: 4px 14px;
  margin: 16px 0 0;
  padding: 0;
  border: none;
  width: 100%;
  min-height: 1.7rem;
  color: var(--pf-muted);
  line-height: 1.2;
}

.pf-herd-breakdown--empty {
  visibility: hidden;
  pointer-events: none;
}

.pf-herd-breakdown .pf-sex {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
}

.pf-herd-breakdown .pf-sex.pf-sex-male .pf-sex-num {
  color: var(--pf-sex-male-ink);
}

.pf-herd-breakdown .pf-sex.pf-sex-female .pf-sex-num {
  color: var(--pf-sex-female-ink);
}

.pf-herd-breakdown .pf-sex-num {
  font-family: var(--pf-display);
  font-size: 1.45rem;
  font-weight: 600;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--pf-green);
}

.pf-herd-breakdown .pf-sex-label {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--pf-muted);
  text-transform: none;
  letter-spacing: 0;
}

.pf-herd-breakdown .pf-sex-sep {
  opacity: 0.35;
  font-size: 1.2rem;
  font-weight: 400;
  -webkit-user-select: none;
  -moz-user-select: none;
  user-select: none;
  line-height: 1;
}

.pf-sex-stat {
  flex: 1;
  min-width: 0;
  text-align: center;
}

.pf-sex-stat--male .pf-num {
  color: var(--pf-sex-male-ink);
}

.pf-sex-stat--female .pf-num {
  color: var(--pf-sex-female-ink);
}

.pf-kv {
  display: grid;
  grid-template-columns: 140px 1fr;
  gap: 8px 12px;
  font-size: 1rem;
}

.pf-kv dt {
  color: var(--pf-muted);
  font-weight: 500;
}

.pf-kv dd {
  margin: 0;
  font-weight: 600;
}

.pf-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 8px;
}

.pf-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-radius: var(--pf-radius);
  background: #fff4ec;
  border: 1px solid rgba(196, 92, 38, 0.35);
  color: #6a2e0f;
  margin-bottom: 16px;
  font-weight: 500;
}

.pf-host {
  margin-top: 12px;
}

.pf-host .tabs-content,
.pf-host .grid-full-width,
.pf-host table.grid-table,
.pf-host .entity-editor-group {
  display: block !important;
  position: static !important;
  opacity: 1 !important;
  pointer-events: auto !important;
  width: auto !important;
  height: auto !important;
  left: auto !important;
}

body.pf-simple .pf-host .tabs-navlist { display: none !important; }

/* Hide portal grid chrome — filters, profiles, paging, exports */
body.pf-simple .pf-host .popup,
body.pf-simple .pf-host .popup-profiles,
body.pf-simple .pf-host .popup-columns,
body.pf-simple .pf-host .popup-filter,
body.pf-simple .pf-host .paging,
body.pf-simple .pf-host .grid-paging,
body.pf-simple .pf-host .dataTables_wrapper .dataTables_filter,
body.pf-simple .pf-host .dataTables_wrapper .dataTables_length,
body.pf-simple .pf-host .dataTables_wrapper .dataTables_info,
body.pf-simple .pf-host .dataTables_wrapper .dataTables_paginate,
body.pf-simple .pf-host .dt-buttons,
body.pf-simple .pf-host .buttons-html5,
body.pf-simple .pf-host .grid-settings,
body.pf-simple .pf-host .save-profile,
body.pf-simple .pf-host .profiles,
body.pf-simple .pf-host .columns,
body.pf-simple .pf-host .sorting-title,
body.pf-simple .pf-host .all-select,
body.pf-simple .pf-host .all-deselect,
body.pf-simple .pf-host .fas.fa-check-double,
body.pf-simple .pf-host img[src*="spinner"],
body.pf-simple .pf-host .radky-popelnice,
body.pf-simple .pf-native-grid-hide {
  display: none !important;
}

/* Single farm / single stable — no site or stable pickers (not inside dialogs) */
body.pf-simple .header-wrap,
body.pf-simple .selector-caption,
body.pf-simple .selector-value,
body.pf-simple #stajVyberId,
body.pf-simple select[name="VybranaStajIdKombinace"],
body.pf-simple .wideInputs:has(#stajVyberId),
body.pf-simple .wideInputs:has(select[name="VybranaStajIdKombinace"]),
body.pf-simple label[for="stajVyberId"],
body.pf-simple #main #stajVyberId,
body.pf-simple #pf-host #stajVyberId,
body.pf-simple #main select[name="VybranaStajIdKombinace"],
body.pf-simple #pf-host select[name="VybranaStajIdKombinace"],
body.pf-simple #main select[id*="StajVyber"],
body.pf-simple #pf-host select[id*="StajVyber"] {
  display: none !important;
}

/* No print / export / bulk print chrome (page chrome only — keep dialog controls) */
body.pf-simple a[href*="Tisk"],
body.pf-simple a[href*="tisk"],
body.pf-simple a[href*="Print"],
body.pf-simple a[href*="print"],
body.pf-simple a[title*="Tisk" i],
body.pf-simple a[title*="tisk" i],
body.pf-simple a[title*="Print" i],
body.pf-simple a[onclick*="Tisk" i],
body.pf-simple a[onclick*="tisk" i],
body.pf-simple a[onclick*="Print" i],
body.pf-simple a[onclick*="print" i],
body.pf-simple .buttons-print,
body.pf-simple .dt-button.buttons-print,
body.pf-simple .dt-button.buttons-excel,
body.pf-simple .dt-button.buttons-csv,
body.pf-simple .dt-button.buttons-copy,
body.pf-simple button.buttons-print,
body.pf-simple button.buttons-excel,
body.pf-simple #main input[value*="Tisk" i],
body.pf-simple #main input[value*="tisk" i],
body.pf-simple #pf-host input[value*="Tisk" i],
body.pf-simple #pf-host input[value*="tisk" i],
body.pf-simple #main .fa-print,
body.pf-simple #pf-host .fa-print,
body.pf-simple #main [id*="TiskSestav"],
body.pf-simple #pf-host [id*="TiskSestav"],
body.pf-simple #main a.toolbutton[title*="tisk" i],
body.pf-simple #pf-host a.toolbutton[title*="tisk" i] {
  display: none !important;
}

/* Native wait dialog — farmer overlay replaces it */
body.pf-simple .progress-dialog,
body.pf-simple .ui-dialog:has(.progress-dialog) {
  display: none !important;
  visibility: hidden !important;
  pointer-events: none !important;
}

/* Pig history: 7-day ÚE movements jump */
body.pf-simple a[href*="HlaseniPrasata7Dni"],
body.pf-simple a[title*="pohyby prasat do 7" i],
body.pf-simple a[title*="7 dnů v ÚE" i] {
  display: none !important;
}

.pf-simple-table-wrap {
  width: 100%;
  overflow-x: auto;
  border: 1px solid var(--pf-line);
  border-radius: 12px;
  background: #fff;
}

.pf-simple-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
}

.pf-simple-table th,
.pf-simple-table td {
  padding: 12px 14px;
  text-align: left;
  border-bottom: 1px solid var(--pf-line);
  vertical-align: top;
}

.pf-simple-table th {
  background: var(--pf-bg-2);
  color: var(--pf-muted);
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
}

.pf-simple-table tbody tr:last-child td {
  border-bottom: none;
}

.pf-simple-table tbody tr:hover td {
  background: rgba(28, 64, 26, 0.04);
}

.pf-simple-table td {
  color: var(--pf-ink);
  font-weight: 500;
}

.pf-simple-table th.pf-select-col,
.pf-simple-table td.pf-select-col {
  width: 44px;
  text-align: center;
  vertical-align: middle;
}

.pf-simple-table input.pf-row-check {
  width: 18px;
  height: 18px;
  accent-color: var(--pf-green);
  cursor: pointer;
}

.pf-simple-table tbody tr.pf-row-selected td {
  background: rgba(28, 64, 26, 0.08);
}

.pf-simple-table tbody tr.pf-row-selectable {
  cursor: pointer;
}

.pf-simple-table tbody tr.pf-sex-male > td:first-child,
.pf-simple-table tbody tr.pf-sex-female > td:first-child {
  box-shadow: inset 4px 0 0 0 transparent;
}
.pf-simple-table tbody tr.pf-sex-male > td:first-child {
  box-shadow: inset 4px 0 0 0 var(--pf-sex-male);
}
.pf-simple-table tbody tr.pf-sex-female > td:first-child {
  box-shadow: inset 4px 0 0 0 var(--pf-sex-female);
}
.pf-simple-table tbody tr.pf-sex-male td {
  background: rgba(58, 107, 140, 0.06);
}
.pf-simple-table tbody tr.pf-sex-female td {
  background: rgba(184, 107, 60, 0.07);
}
.pf-simple-table tbody tr.pf-sex-male:hover td {
  background: rgba(58, 107, 140, 0.11);
}
.pf-simple-table tbody tr.pf-sex-female:hover td {
  background: rgba(184, 107, 60, 0.12);
}
.pf-simple-table tbody tr.pf-row-selected.pf-sex-male td {
  background: rgba(58, 107, 140, 0.16);
}
.pf-simple-table tbody tr.pf-row-selected.pf-sex-female td {
  background: rgba(184, 107, 60, 0.16);
}

.pf-sex-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}
.pf-sex-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.55em;
  height: 1.55em;
  border-radius: 6px;
  font-size: 0.92rem;
  line-height: 1;
  flex: 0 0 auto;
}
.pf-sex-male .pf-sex-mark {
  background: var(--pf-sex-male-soft);
  color: var(--pf-sex-male-ink);
}
.pf-sex-female .pf-sex-mark {
  background: var(--pf-sex-female-soft);
  color: var(--pf-sex-female-ink);
}

.pf-select-hint {
  margin: 0;
  padding: 14px 16px 12px;
  color: var(--pf-muted);
  font-size: 0.9rem;
  line-height: 1.45;
  border-bottom: 1px solid var(--pf-line);
}

.pf-simple-empty {
  padding: 28px 16px;
  text-align: center;
  color: var(--pf-muted);
}

body.pf-simple .pf-col-hide,
body.pf-simple .pf-action-hide {
  display: none !important;
}

/* Pending changes panel on Registr */
.pf-pending-panel {
  margin-top: 18px;
  border-color: rgba(196, 92, 38, 0.35);
  background:
    linear-gradient(180deg, rgba(196, 92, 38, 0.06), transparent 48px),
    var(--pf-card);
}
.pf-pending-panel[hidden] {
  display: none !important;
}
.pf-pending-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.pf-pending-head h2 {
  margin: 0;
  color: var(--pf-accent);
  font-family: var(--pf-display);
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.2;
}
.pf-pending-hint {
  margin: 0 0 14px;
  padding: 12px 14px;
  border-radius: 10px;
  background: #fff4ec;
  border: 1px solid rgba(196, 92, 38, 0.35);
  color: #6a2e0f;
  font-size: 0.95rem;
  font-weight: 500;
  line-height: 1.45;
}
.pf-pending-status {
  margin: 0 0 10px;
  color: var(--pf-muted);
  font-size: 0.92rem;
}
.pf-pending-status:empty {
  display: none;
}
/* Native yellow portal banner — replaced by .pf-pending-hint */
body.pf-simple .registrNeodeslane {
  display: none !important;
}
.pf-pending-native {
  position: absolute !important;
  left: 0 !important;
  top: 0 !important;
  width: 1px !important;
  height: 1px !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  clip-path: inset(50%) !important;
  opacity: 0 !important;
  pointer-events: none !important;
}
.pf-pending-cancel {
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  border: 1px solid var(--pf-line);
  background: #fff;
  color: var(--pf-accent);
  border-radius: 8px;
  padding: 6px 10px;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.pf-pending-cancel:hover {
  border-color: var(--pf-accent);
  background: rgba(196, 92, 38, 0.08);
}

.pf-footer {
  margin-top: 28px;
  padding: 8px 4px 0;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: flex-end;
  border: none;
  background: transparent;
  box-shadow: none;
}

.pf-footer a {
  color: var(--pf-muted) !important;
  font-size: 0.85rem;
  font-weight: 500;
  text-decoration: underline !important;
  text-underline-offset: 3px;
  background: none !important;
  border: none !important;
  padding: 0 !important;
  min-height: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
}

.pf-footer a:hover {
  color: var(--pf-green) !important;
  transform: none !important;
}

/* Custom pig action modal */
.pf-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2147483645;
  background: rgba(26, 36, 24, 0.42);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  animation: pfFade 0.18s ease both;
}
.pf-modal {
  width: min(440px, 100%);
  max-height: calc(100vh - 36px);
  max-height: calc(100dvh - 36px);
  display: flex;
  flex-direction: column;
  background: var(--pf-card);
  color: var(--pf-ink);
  border-radius: 16px;
  box-shadow: 0 24px 60px rgba(0,0,0,0.22);
  font-family: var(--pf-font);
  overflow: hidden;
  animation: pfFade 0.2s ease both;
}
.pf-modal-head {
  flex: 0 0 auto;
  padding: 18px 20px 12px;
  border-bottom: 1px solid var(--pf-line);
}
.pf-modal-head h3 {
  margin: 0;
  font-family: var(--pf-display);
  font-size: 1.25rem;
  color: var(--pf-green);
  font-weight: 600;
}
.pf-modal-body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 16px 20px 8px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.pf-modal-field label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--pf-muted);
  margin-bottom: 6px;
}
.pf-modal-field input,
.pf-modal-field select {
  width: 100%;
  box-sizing: border-box;
  min-height: 42px;
  padding: 10px 12px;
  border: 1px solid var(--pf-line);
  border-radius: 10px;
  background: #fff;
  color: var(--pf-ink);
  font: inherit;
  font-size: 1rem;
}
.pf-modal-field input:focus,
.pf-modal-field select:focus {
  outline: 2px solid rgba(28, 64, 26, 0.25);
  border-color: var(--pf-green-2);
}
.pf-modal-field input.pf-invalid,
.pf-modal-field select.pf-invalid {
  border-color: #c45c5c;
  background: #fff8f8;
}
.pf-modal-field input.pf-invalid:focus,
.pf-modal-field select.pf-invalid:focus {
  outline: 2px solid rgba(196, 92, 92, 0.28);
  border-color: #c45c5c;
}
.pf-field-error {
  color: #a33;
  font-size: 0.82rem;
  margin: 6px 0 0;
  min-height: 0;
}
.pf-field-error:empty {
  display: none;
}
.pf-modal-field input.pf-has-cal {
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='%236a7a62' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='3' y='5' width='18' height='16' rx='2'/%3E%3Cpath d='M8 3v4M16 3v4M3 11h18'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 18px;
  padding-right: 40px;
}

/* Minimal date calendar */
.pf-cal {
  position: absolute;
  z-index: 2147483646;
  width: 268px;
  padding: 12px;
  background: #fff;
  color: var(--pf-ink);
  border: 1px solid var(--pf-line);
  border-radius: 12px;
  box-shadow: 0 14px 36px rgba(26, 36, 24, 0.16);
  font-family: var(--pf-font);
  animation: pfFade 0.12s ease both;
}
.pf-cal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.pf-cal-title {
  font-family: var(--pf-display);
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--pf-green);
  text-transform: capitalize;
}
.pf-cal-nav {
  width: 30px;
  height: 30px;
  border: 1px solid var(--pf-line);
  border-radius: 8px;
  background: #f7f5ef;
  color: var(--pf-ink);
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
}
.pf-cal-nav:hover:not(:disabled) {
  background: #ebe6da;
}
.pf-cal-nav:disabled {
  opacity: 0.35;
  cursor: default;
}
.pf-cal-dow {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  margin-bottom: 4px;
}
.pf-cal-dow span {
  text-align: center;
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--pf-muted);
  padding: 4px 0;
}
.pf-cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}
.pf-cal-day {
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--pf-ink);
  font: inherit;
  font-size: 0.9rem;
  cursor: pointer;
}
.pf-cal-day:hover:not(:disabled):not(.is-empty) {
  background: #e8efe4;
}
.pf-cal-day.is-today {
  box-shadow: inset 0 0 0 1px var(--pf-green-2);
}
.pf-cal-day.is-selected {
  background: var(--pf-green);
  color: #fff;
  font-weight: 600;
}
.pf-cal-day.is-selected:hover:not(:disabled) {
  background: var(--pf-green);
}
.pf-cal-day:disabled,
.pf-cal-day.is-out {
  color: #b7b7b0;
  cursor: default;
}
.pf-cal-day.is-empty {
  cursor: default;
  visibility: hidden;
}
.pf-cal-hint {
  margin: 8px 2px 0;
  font-size: 0.75rem;
  color: var(--pf-muted);
  text-align: center;
}
.pf-modal-hint {
  font-size: 0.85rem;
  color: var(--pf-muted);
  margin: 0;
}
.pf-modal-error {
  color: #a33;
  font-size: 0.9rem;
  margin: 0;
  min-height: 1.2em;
}
.pf-modal-foot {
  flex: 0 0 auto;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 12px 20px 18px;
  border-top: 1px solid var(--pf-line);
  background: var(--pf-card);
}
.pf-modal-foot .pf-btn {
  min-width: 110px;
  font-family: var(--pf-font) !important;
  font-size: 0.95rem !important;
  font-weight: 600 !important;
  letter-spacing: normal !important;
  text-transform: none !important;
  line-height: 1.25 !important;
  white-space: nowrap !important;
  text-indent: 0 !important;
  background-image: none !important;
}

/* Confirm dialog (replaces window.confirm) */
.pf-confirm-backdrop {
  z-index: 2147483000;
}
.pf-confirm-modal {
  max-width: 420px;
  width: calc(100vw - 32px);
}
.pf-confirm-modal .pf-modal-body {
  padding: 8px 20px 4px;
}
.pf-confirm-msg {
  margin: 0;
  font-size: 1.02rem;
  line-height: 1.45;
  color: var(--pf-ink);
  font-weight: 500;
}
.pf-confirm-detail {
  margin: 10px 0 0;
  font-size: 0.9rem;
  line-height: 1.4;
  color: var(--pf-muted);
}
.pf-confirm-modal.is-danger .pf-modal-head h3 {
  color: var(--pf-accent);
}
.pf-confirm-modal .pf-btn-danger {
  background: var(--pf-accent) !important;
  border-color: var(--pf-accent) !important;
  color: #fffdf8 !important;
}
.pf-confirm-modal .pf-btn-danger:hover {
  filter: brightness(0.95);
  background: var(--pf-accent) !important;
}

/* Toasts (bottom-right; replaces portal #messages-box) */
#pf-toast-root {
  position: fixed;
  top: auto;
  bottom: 16px;
  right: 16px;
  z-index: 2147483600;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  max-width: min(380px, calc(100vw - 24px));
  width: max-content;
  pointer-events: none;
  font-family: var(--pf-font);
}
.pf-toast {
  pointer-events: auto;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  box-sizing: border-box;
  padding: 12px 14px 12px 14px;
  border-radius: 12px;
  background: var(--pf-card);
  color: var(--pf-ink);
  border: 1px solid var(--pf-line);
  box-shadow: 0 10px 28px rgba(26, 36, 24, 0.14);
  font-size: 0.95rem;
  font-weight: 500;
  line-height: 1.4;
  cursor: pointer;
  transform: translateY(12px);
  opacity: 0;
  transition: transform 0.22s ease, opacity 0.22s ease;
}
.pf-toast.is-in {
  transform: translateY(0);
  opacity: 1;
}
.pf-toast.is-out {
  transform: translateY(12px);
  opacity: 0;
}
.pf-toast-bar {
  flex: 0 0 4px;
  align-self: stretch;
  border-radius: 4px;
  margin: -2px 0;
  background: var(--pf-muted);
}
.pf-toast-body {
  flex: 1 1 auto;
  min-width: 0;
  padding-top: 1px;
}
.pf-toast-close {
  flex: 0 0 auto;
  margin: -4px -6px -4px 0;
  padding: 4px 8px;
  border: 0;
  background: transparent;
  color: var(--pf-muted);
  font-size: 1.15rem;
  line-height: 1;
  cursor: pointer;
  border-radius: 8px;
}
.pf-toast-close:hover {
  color: var(--pf-ink);
  background: rgba(26, 36, 24, 0.06);
}
.pf-toast.is-success .pf-toast-bar {
  background: var(--pf-green-2);
}
.pf-toast.is-success {
  border-color: rgba(47, 93, 44, 0.28);
  background: linear-gradient(135deg, #fffdf8 0%, #eef5ea 100%);
}
.pf-toast.is-error .pf-toast-bar {
  background: var(--pf-accent);
}
.pf-toast.is-error {
  border-color: rgba(196, 92, 38, 0.35);
  background: linear-gradient(135deg, #fffdf8 0%, #f8efe8 100%);
}
.pf-toast.is-info .pf-toast-bar {
  background: var(--pf-sex-male);
}
@media (max-width: 520px) {
  #pf-toast-root {
    top: auto;
    bottom: 10px;
    right: 10px;
    left: 10px;
    max-width: none;
    align-items: stretch;
  }
}

body.pf-native-pig-fill .ui-dialog,
body.pf-native-pig-fill .ui-widget-overlay,
body.pf-native-pig-fill .ui-dialog-titlebar,
body.pf-native-pig-fill .ui-dialog-buttonpane,
body.pf-native-sheep-fill .ui-dialog,
body.pf-native-sheep-fill .ui-widget-overlay,
body.pf-native-sheep-fill .ui-dialog-titlebar,
body.pf-native-sheep-fill .ui-dialog-buttonpane {
  /* Native portal dialog stays off-screen while we instrument it */
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
  left: -10000px !important;
  top: -10000px !important;
}
/* Also hide nested partner-picker dialogs spawned during fill */
body.pf-native-pig-fill .ui-dialog + .ui-dialog,
body.pf-native-sheep-fill .ui-dialog + .ui-dialog {
  opacity: 0 !important;
  visibility: hidden !important;
  pointer-events: none !important;
}
body.pf-native-pig-fill,
body.pf-native-sheep-fill {
  overflow: hidden !important;
}
.pf-modal.pf-modal-wide {
  width: min(520px, 100%);
}
.pf-sheep-ear-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: min(36vh, 320px);
  overflow-x: hidden;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding-right: 2px;
}
.pf-sheep-ear-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.pf-sheep-ear-row .pf-sheep-ear-field {
  flex: 1;
  min-width: 0;
}
.pf-sheep-ear-row select,
.pf-sheep-ear-row input[type='text'] {
  width: 100%;
  box-sizing: border-box;
  min-height: 42px;
  padding: 10px 12px;
  border: 1px solid var(--pf-line);
  border-radius: 10px;
  background: #fff;
  color: var(--pf-ink);
  font: inherit;
  font-size: 1rem;
}
.pf-sheep-ear-row select.pf-invalid,
.pf-sheep-ear-row input.pf-invalid {
  border-color: #c45c5c;
  background: #fff8f8;
}
.pf-sheep-ear-remove {
  flex: 0 0 auto;
  min-width: 42px;
  min-height: 42px;
  margin-top: 0;
  border: 1px solid var(--pf-line);
  border-radius: 10px;
  background: #fff;
  color: #8a4a4a;
  font-size: 1.15rem;
  line-height: 1;
  cursor: pointer;
  padding: 0 10px;
}
.pf-sheep-ear-remove:hover {
  background: #fff5f5;
  border-color: #c45c5c;
}
.pf-sheep-ear-remove:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.pf-sheep-ear-rows-err {
  color: #a33;
  font-size: 0.82rem;
  margin: 0;
}
.pf-sheep-ear-rows-err:empty {
  display: none;
}
.pf-modal-field textarea {
  width: 100%;
  box-sizing: border-box;
  min-height: 72px;
  padding: 10px 12px;
  border: 1px solid var(--pf-line);
  border-radius: 10px;
  background: #fff;
  color: var(--pf-ink);
  font: inherit;
  font-size: 1rem;
  resize: vertical;
}
.pf-modal-field textarea:focus {
  outline: 2px solid rgba(28, 64, 26, 0.25);
  border-color: var(--pf-green-2);
}
.pf-check-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
}
.pf-carrier-name-row {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.pf-carrier-name-row > .pf-modal-field {
  flex: 1;
  min-width: 0;
  margin: 0;
}
.pf-check-row input[type='checkbox'] {
  width: 18px;
  height: 18px;
  margin: 0;
  accent-color: var(--pf-green);
  outline: none;
  border: none;
  box-shadow: none;
}
.pf-check-row input[type='checkbox']:focus,
.pf-check-row input[type='checkbox']:focus-visible,
.pf-modal-field .pf-check-row input[type='checkbox']:focus,
.pf-modal-field .pf-check-row input[type='checkbox']:focus-visible {
  outline: none;
  border: none;
  box-shadow: none;
}
.pf-check-row label {
  margin: 0;
  text-transform: none;
  letter-spacing: 0;
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--pf-ink);
  cursor: pointer;
}
.pf-modal-section-title {
  margin: 4px 0 0;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--pf-muted);
}
.pf-modal.is-busy .pf-modal-body,
.pf-modal.is-busy .pf-modal-foot {
  opacity: 0.55;
  pointer-events: none;
}
.pf-modal-status {
  margin: 0;
  font-size: 0.92rem;
  color: var(--pf-green);
  font-weight: 600;
}

/* Native MZe / portal footer — restyle to match simplified UI */
body.pf-simple #footer {
  display: none !important;
}

body.pf-simple footer.footer {
  display: block !important;
  position: relative !important;
  z-index: 40 !important;
  margin: 0 !important;
  padding: 0 18px 28px !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  color: var(--pf-muted) !important;
  font-family: var(--pf-font) !important;
  font-size: 0.82rem !important;
  line-height: 1.45 !important;
  float: none !important;
  clear: both !important;
}

body.pf-simple footer.footer::before {
  content: "";
  display: block;
  max-width: 1100px;
  margin: 0 auto 16px;
  border-top: 1px solid var(--pf-line);
}

body.pf-simple footer.footer .container {
  max-width: 1100px !important;
  width: 100% !important;
  margin: 0 auto !important;
  padding: 0 !important;
  background: transparent !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 10px !important;
  float: none !important;
}

body.pf-simple footer.footer hr,
body.pf-simple footer.footer #errbtn {
  display: none !important;
}

body.pf-simple footer.footer .footer-info {
  display: flex !important;
  flex-wrap: wrap !important;
  align-items: baseline !important;
  justify-content: space-between !important;
  gap: 8px 20px !important;
  margin: 0 !important;
  padding: 0 !important;
  background: transparent !important;
  border: none !important;
  float: none !important;
  clear: none !important;
  width: 100% !important;
  color: var(--pf-muted) !important;
  font-size: inherit !important;
  line-height: inherit !important;
}

body.pf-simple footer.footer .footer-info > span {
  float: none !important;
  display: inline !important;
  margin: 0 !important;
  padding: 0 !important;
  color: inherit !important;
  font-size: inherit !important;
  line-height: inherit !important;
  background: none !important;
}

body.pf-simple footer.footer .footer-info:first-of-type {
  color: var(--pf-ink) !important;
  font-weight: 500 !important;
  opacity: 0.72;
}

body.pf-simple footer.footer a {
  color: var(--pf-green) !important;
  text-decoration: underline !important;
  text-underline-offset: 2px !important;
  background: none !important;
  border: none !important;
  padding: 0 !important;
  font-weight: 500 !important;
}

body.pf-simple footer.footer a:hover {
  color: var(--pf-accent) !important;
}

body.pf-simple footer.footer #version-info,
body.pf-simple footer.footer #environment-info {
  display: none !important;
}

@media (max-width: 640px) {
  body.pf-simple footer.footer {
    padding: 0 14px 22px !important;
  }
  body.pf-simple footer.footer .footer-info {
    flex-direction: column !important;
    align-items: flex-start !important;
    gap: 6px !important;
  }
}

/* Dialog skin */
body.pf-simple .ui-dialog {
  border: none !important;
  border-radius: 16px !important;
  box-shadow: 0 24px 60px rgba(0,0,0,0.22) !important;
  font-family: var(--pf-font) !important;
  overflow: hidden;
  animation: pfFade 0.2s ease both;
  max-width: min(720px, 96vw) !important;
}

body.pf-simple .ui-dialog .ui-dialog-titlebar {
  background: var(--pf-green) !important;
  color: #f7f4ec !important;
  border: none !important;
  border-radius: 0 !important;
  padding: 14px 18px !important;
  font-weight: 600;
  font-size: 1.05rem !important;
}

body.pf-simple .ui-dialog .ui-dialog-title {
  font-family: var(--pf-display) !important;
  font-size: 1.15rem !important;
}

body.pf-simple .ui-dialog .ui-dialog-titlebar-close {
  background: rgba(255,255,255,0.15) !important;
  border: none !important;
  border-radius: 8px !important;
  right: 12px !important;
}

body.pf-simple .ui-dialog .ui-dialog-content {
  background: var(--pf-card) !important;
  padding: 18px 20px !important;
  max-height: 70vh;
  color: var(--pf-ink) !important;
}

body.pf-simple .ui-dialog .ui-dialog-buttonpane {
  background: var(--pf-bg-2) !important;
  border-top: 1px solid var(--pf-line) !important;
  margin: 0 !important;
  padding: 12px 16px !important;
}

body.pf-simple .ui-dialog .ui-dialog-buttonset {
  display: flex !important;
  flex-wrap: wrap;
  gap: 8px;
  float: none !important;
}

body.pf-simple .ui-dialog .ui-button {
  border-radius: 10px !important;
  border: none !important;
  background: var(--pf-green) !important;
  color: #fff !important;
  font-weight: 600 !important;
  padding: 8px 16px !important;
  margin: 0 !important;
  font-family: var(--pf-font) !important;
}

body.pf-simple .ui-dialog .ui-button:hover {
  background: var(--pf-green-2) !important;
}

body.pf-simple .ui-widget-overlay {
  background: rgba(26, 36, 24, 0.45) !important;
  opacity: 1 !important;
}

body.pf-simple .pf-dialog-row-hide,
body.pf-simple .pf-dialog-section-hide {
  display: none !important;
}

/* Cleaner form fields inside dialogs */
body.pf-simple .ui-dialog .member-editor-caption {
  color: var(--pf-muted) !important;
  font-weight: 600 !important;
  font-size: 0.82rem !important;
  letter-spacing: 0.03em;
  padding-right: 12px !important;
  white-space: nowrap;
}

body.pf-simple .ui-dialog input[type="text"],
body.pf-simple .ui-dialog input[type="date"],
body.pf-simple .ui-dialog input:not([type]),
body.pf-simple .ui-dialog select,
body.pf-simple .ui-dialog textarea {
  border: 1px solid var(--pf-line) !important;
  border-radius: 10px !important;
  padding: 8px 12px !important;
  background: #fff !important;
  font-family: var(--pf-font) !important;
  font-size: 0.95rem !important;
  min-height: 38px;
  box-shadow: none !important;
}

body.pf-simple .ui-dialog table.full-width,
body.pf-simple .ui-dialog table.zebra {
  border-collapse: separate !important;
  border-spacing: 0 8px !important;
}

body.pf-simple .ui-dialog .entity-editor-group-header h2,
body.pf-simple .ui-dialog .entity-editor-group-header {
  font-size: 0.78rem !important;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--pf-muted) !important;
  background: transparent !important;
  border: none !important;
}

body.pf-simple .ui-dialog .entity-editor-group {
  border: 1px solid var(--pf-line) !important;
  border-radius: 12px !important;
  padding: 8px 12px !important;
  margin-bottom: 12px !important;
  background: #fff !important;
}

body.pf-simple .ui-dialog .grid-table {
  border: 1px solid var(--pf-line) !important;
  border-radius: 10px !important;
  overflow: hidden;
}

.pf-empty {
  padding: 24px;
  text-align: center;
  color: var(--pf-muted);
}

.pf-chip {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--pf-bg-2);
  font-size: 0.85rem;
  font-weight: 600;
}
`,
    inject() {
      if (qs('#pf-style')) return;
      const el = document.createElement('style');
      el.id = 'pf-style';
      el.textContent = this.css;
      document.head.appendChild(el);
    },
  };

  /* ------------------------------------------------------------------ */
  /* Scrape                                                             */
  /* ------------------------------------------------------------------ */
  PF.scrape = {
    subject() {
      const name =
        textOf(qs('.detail-header-name')) ||
        contactField('Kontaktní osoba') ||
        textOf(qs('.personal-right strong')) ||
        '';

      let reg =
        valueBeforeValidation('RegistracniCislo_validationMessage') ||
        valueByCaption('Registrační číslo');
      if (!reg) {
        const info = textOf(qs('.detail-header-info'));
        const m = info.match(/Reg\.?\s*číslo:\s*(\d+)/i);
        if (m) reg = m[1];
      }
      reg = String(reg).replace(/\D/g, '');

      const address =
        contactField('Doruč') ||
        contactField('Adresa') ||
        (textOf(qs('.detail-header-info')).split(',')[0] || '').trim();

      return {
        name: name.replace(/\s+/g, ' ').trim(),
        regNumber: reg,
        regDisplay: reg ? 'CZ' + reg : '',
        szr:
          valueBeforeValidation('IdSubjektuVSzr_validationMessage') ||
          valueByCaption('ID subjektu v SZR'),
        szif:
          valueBeforeValidation('JI_validationMessage') ||
          valueByCaption('Jednotný identifikátor SZIF'),
        address,
        phone: contactField('Telefon'),
        email: contactField('Email'),
        contactName: contactField('Kontaktní osoba') || name,
      };
    },

    herdCounts() {
      let pigs = null;
      let sheep = null;

      // Counts live in AKTIVNÍ PROVOZOVNY — never use the left SR overview
      // (its first numeric column is "Neodeslané události", often 0).
      let root = null;
      qsa('.entity-editor-group-header h2, h2').forEach((el) => {
        if (root) return;
        if (/aktivni provozovny/.test(norm(el.textContent || ''))) {
          root =
            el.closest('.entity-editor-group') ||
            el.closest('fieldset') ||
            el.parentElement;
        }
      });

      const scope = root || document;

      const readCountAfterSpecies = (species) => {
        const nodes = root
          ? qsa('td span, td', scope)
          : []; // if section missing, don't fall back to whole document
        for (const sp of nodes) {
          if (norm(sp.textContent) !== species) continue;
          const td = sp.closest('td') || sp;
          const tr = td.closest('tr');
          if (!tr) continue;
          // Skip overview/register grids that snuck in
          if (tr.querySelector('a.detail-icon, a.detail-icon-pra7, a.grid-action'))
            continue;
          const cells = qsa('td', tr);
          const idx = cells.indexOf(td);
          if (idx >= 0 && cells[idx + 1]) {
            const n = parseInt(textOf(cells[idx + 1]), 10);
            if (!isNaN(n)) return n;
          }
          const after = textOf(tr).split(new RegExp(species, 'i'))[1] || '';
          const m = after.match(/\b(\d+)\b/);
          if (m) return parseInt(m[1], 10);
        }
        return null;
      };

      pigs = readCountAfterSpecies('prasata');
      sheep = readCountAfterSpecies('ovce');

      let sheepMale = null;
      let sheepFemale = null;
      try {
        if (pigs == null) {
          const c = localStorage.getItem('pf-count-pigs');
          if (c != null && c !== '') pigs = parseInt(c, 10);
        }
        if (sheep == null) {
          const c = localStorage.getItem('pf-count-sheep');
          if (c != null && c !== '') sheep = parseInt(c, 10);
        }
        const sm = localStorage.getItem('pf-count-sheep-male');
        const sf = localStorage.getItem('pf-count-sheep-female');
        if (sm != null && sm !== '') sheepMale = parseInt(sm, 10);
        if (sf != null && sf !== '') sheepFemale = parseInt(sf, 10);
      } catch (_) {}

      return { pigs, sheep, sheepMale, sheepFemale };
    },

    classifySex(text) {
      const t = norm(text);
      if (!t) return null;
      if (
        /samice|bahnice|zens|žens|female|\bf\b|♀/.test(t) ||
        t === 'o'
      )
        return 'female';
      if (/samec|beran|muzsk|mužsk|male|\bm\b|♂/.test(t) || t === 'm')
        return 'male';
      return null;
    },

    countSheepSexFromRoot(root) {
      const scope = root || document;
      let male = 0;
      let female = 0;
      let found = false;

      const countFromTable = (table, getLabel, nativeHerdFilter) => {
        const headRow =
          qs('thead tr', table) ||
          qsa('tr', table).find((tr) => qs('th', tr));
        if (!headRow) return;
        const ths = qsa('th', headRow);
        let sexIdx = -1;
        ths.forEach((th, i) => {
          if (/pohlav|POHLAVI/i.test(getLabel(th))) sexIdx = i;
        });
        if (sexIdx < 0) return;
        qsa('tbody tr', table).forEach((tr) => {
          if (qs('th', tr)) return;
          if (nativeHerdFilter) {
            try {
              if (
                PF.registers &&
                typeof PF.registers.isSheepHerdRow === 'function'
              ) {
                if (!PF.registers.isSheepHerdRow(tr, table)) return;
              } else if (qs('.cervene', tr)) {
                return;
              }
            } catch (_) {}
          }
          const cells = qsa(':scope > td', tr);
          // Account for leading select column in our simple table
          let idx = sexIdx;
          if (
            table.classList.contains('pf-simple-table') &&
            cells[0] &&
            cells[0].classList.contains('pf-select-col')
          ) {
            // headers include select col as first th — sexIdx already accounts for it
          }
          if (!cells[idx]) return;
          const sex = PF.scrape.classifySex(textOf(cells[idx]));
          if (sex === 'male') {
            male++;
            found = true;
          } else if (sex === 'female') {
            female++;
            found = true;
          }
        });
      };

      const simpleTables = qsa('.pf-simple-table', scope).filter(
        (table) =>
          !(
            table.closest &&
            table.closest('#pf-pending-section, #pf-pending-table, .pf-modal')
          )
      );
      if (simpleTables.length) {
        simpleTables.forEach((table) =>
          countFromTable(
            table,
            (th) =>
              norm(
                th.textContent + ' ' + (th.getAttribute('data-colname') || '')
              ),
            false
          )
        );
      } else {
        qsa('table.grid-table, table.dataTable', scope).forEach((table) => {
          if (
            table.closest &&
            table.closest('#pf-pending-section, #pf-pending-table, .pf-modal')
          )
            return;
          countFromTable(
            table,
            (th) => {
              const h4 = th.querySelector('.popup-filter h4, span.a');
              return norm(
                textOf(th) +
                  ' ' +
                  (h4 ? h4.textContent : '') +
                  ' ' +
                  (th.getAttribute('data-colname') || '')
              );
            },
            true
          );
        });
      }

      if (!found) return null;
      return { male, female, total: male + female };
    },

    saveSheepSexCounts(male, female) {
      try {
        if (male != null && !isNaN(male))
          localStorage.setItem('pf-count-sheep-male', String(male));
        if (female != null && !isNaN(female))
          localStorage.setItem('pf-count-sheep-female', String(female));
        if (male != null && female != null && !isNaN(male) && !isNaN(female))
          localStorage.setItem('pf-count-sheep', String(male + female));
      } catch (_) {}
    },

    fetchSheepSexCounts(sheepHref, cb) {
      if (!sheepHref || sheepHref === '#') {
        if (cb) cb(null);
        return;
      }
      let gridUrl = '';
      try {
        const u = new URL(sheepHref, location.origin);
        const idProv =
          u.searchParams.get('idProvozovnySR') ||
          '00000000000000000000000000000000';
        const idSR = u.searchParams.get('idStajovyRegistr');
        const idStaj =
          u.searchParams.get('idStaj') ||
          '00000000000000000000000000000000';
        if (!idSR) {
          if (cb) cb(null);
          return;
        }
        gridUrl =
          '/ssl/app/izr2far/StajoveRegistry/StajovyRegistrIndivGrid/Indiv' +
          '?provozovnaSRKey=' +
          encodeURIComponent(idProv) +
          '&stajovyRegistrKey=' +
          encodeURIComponent(idSR) +
          '&stajKey=' +
          encodeURIComponent(idStaj) +
          '&stavZvirat=A';
      } catch (_) {
        if (cb) cb(null);
        return;
      }

      const finish = (html) => {
        try {
          const doc = new DOMParser().parseFromString(html, 'text/html');
          // Temporary helper for headerLabel during parse
          const counts = this.countSheepSexFromParsedDoc(doc);
          if (counts) this.saveSheepSexCounts(counts.male, counts.female);
          if (cb) cb(counts);
        } catch (_) {
          if (cb) cb(null);
        }
      };

      if (refresh$() && $.ajax) {
        $.ajax({
          url: gridUrl,
          method: 'GET',
          dataType: 'html',
          pfInternal: true,
          success: finish,
          error: () => {
            if (cb) cb(null);
          },
        });
      } else {
        fetch(gridUrl, { credentials: 'same-origin' })
          .then((r) => r.text())
          .then(finish)
          .catch(() => cb && cb(null));
      }
    },

    countSheepSexFromParsedDoc(doc) {
      let male = 0;
      let female = 0;
      let found = false;
      const tables = doc.querySelectorAll('table.grid-table, table');
      tables.forEach((table) => {
        const headRow =
          table.querySelector('thead tr') ||
          Array.from(table.querySelectorAll('tr')).find((tr) =>
            tr.querySelector('th')
          );
        if (!headRow) return;
        const ths = Array.from(headRow.querySelectorAll('th'));
        let sexIdx = -1;
        ths.forEach((th, i) => {
          const clone = th.cloneNode(true);
          clone
            .querySelectorAll('.popup, select, input, table')
            .forEach((n) => n.remove());
          const lab = norm(clone.textContent || '');
          const col = norm(th.getAttribute('data-colname') || '');
          const h4 = th.querySelector('.popup-filter h4, span.a');
          const lab2 = h4 ? norm(h4.textContent) : '';
          if (/pohlav|POHLAVI/i.test(lab + ' ' + lab2 + ' ' + col)) sexIdx = i;
        });
        if (sexIdx < 0) return;
        const stavIdx = (() => {
          let idx = -1;
          ths.forEach((th, i) => {
            const col = String(
              th.getAttribute('data-colname') || ''
            ).toUpperCase();
            const lab = norm(
              (th.querySelector('.popup-filter h4, span.a') || th).textContent ||
                ''
            );
            if (col === 'STAV' || /^stav(\s+prisun)?$/.test(lab)) idx = i;
          });
          return idx;
        })();
        table.querySelectorAll('tbody tr.grid-row, tbody tr').forEach((tr) => {
          if (tr.querySelector('th')) return;
          const cells = tr.querySelectorAll(':scope > td');
          if (!cells[sexIdx]) return;
          // Red ear marks = already removed in ÚE — not in our herd
          if (tr.querySelector('.cervene')) return;
          // Only zpracováno přísun; založeno etc. belong in pending, not herd
          if (stavIdx >= 0 && cells[stavIdx]) {
            const stav = norm(cells[stavIdx].textContent || '');
            if (!/zpracovano/.test(stav)) return;
          }
          const sex = this.classifySex(cells[sexIdx].textContent || '');
          if (sex === 'male') {
            male++;
            found = true;
          } else if (sex === 'female') {
            female++;
            found = true;
          }
        });
      });
      if (!found) return null;
      return { male, female, total: male + female };
    },

    registerLinks() {
      let sheep = null;
      let pigs = null;
      let sheepPending = 0;
      let pigsPending = 0;

      const pendingColIndex = (table) => {
        if (!table) return 2; // Registr | Druh | Neodeslané …
        const headers = qsa('thead th', table);
        for (let i = 0; i < headers.length; i++) {
          if (/neodeslan/i.test(norm(headers[i].textContent))) return i;
        }
        return 2;
      };

      // Only the "PŘEHLED STÁJOVÝCH REGISTRŮ" / new-SR overview rows —
      // never AKTIVNÍ PROVOZOVNY (its trailing number is ear-tag stock).
      qsa('tr.grid-row').forEach((tr) => {
        const sheepA =
          qs('a.detail-icon[href*="StajovyRegistrIndiv"]', tr) ||
          qs('a.detail-icon', tr);
        const pigA =
          qs('a.detail-icon-pra7', tr) ||
          qs('a[href*="StajovyRegistrPrasat"][class*="detail-icon"]', tr);

        const species = norm(textOf(tr));
        const table = tr.closest('table');
        const col = pendingColIndex(table);
        const tds = qsa('td', tr);

        if (sheepA && /ovce/.test(species) && !sheep) {
          sheep = sheepA.href;
          const n = parseInt(textOf(tds[col] || ''), 10);
          sheepPending = isNaN(n) ? 0 : n;
        }
        if (pigA && /prasata/.test(species) && !pigs) {
          pigs = pigA.href;
          const n = parseInt(textOf(tds[col] || ''), 10);
          pigsPending = isNaN(n) ? 0 : n;
        }
      });

      // Fallback register links from elsewhere on the page (not pending)
      if (!pigs) {
        const a =
          qs('a.detail-icon-pra7') || qs('a[href*="StajovyRegistrPrasat"]');
        if (a) pigs = a.href;
      }
      if (!sheep) {
        const a = qs(
          'a.detail-icon[href*="StajovyRegistrIndiv"], a[href*="StajovyRegistrIndiv"]'
        );
        if (a) sheep = a.href;
      }

      return { sheep, pigs, sheepPending, pigsPending };
    },

    tabLinks() {
      const out = {};
      qsa('.tabs-navlist a').forEach((a) => {
        const t = norm(a.textContent);
        if (t.includes('registr') && !t.includes('zmen')) out.registr = a.href;
        if (t.includes('pohyby') && !t.includes('nevyr')) out.pohyby = a.href;
        if (t.includes('zmeny') || t.includes('odesl')) out.zmeny = a.href;
        if (t.includes('archiv') || (t.includes('hlaseni') && !t.includes('odesl')))
          out.archiv = a.href;
      });
      return out;
    },

    cacheLinks(links) {
      try {
        if (links.sheep)
          localStorage.setItem('pf-link-sheep', links.sheep);
        if (links.pigs) localStorage.setItem('pf-link-pigs', links.pigs);
      } catch (_) {}
    },

    cached(kind) {
      try {
        return localStorage.getItem('pf-link-' + kind) || '';
      } catch (_) {
        return '';
      }
    },

    linksFromLocation() {
      const p = location.pathname + location.search;
      const out = { sheep: '', pigs: '' };
      if (/StajovyRegistrIndiv/i.test(p)) {
        try {
          const u = new URL(location.href);
          u.pathname = u.pathname.replace(
            /StajovyRegistrIndiv\w*/,
            'StajovyRegistrIndiv'
          );
          if (!u.searchParams.has('stavDefault'))
            u.searchParams.set('stavDefault', 'True');
          out.sheep = u.pathname + '?' + u.searchParams.toString();
        } catch (_) {
          out.sheep = location.href;
        }
      }
      if (/StajovyRegistrPrasat/i.test(p)) {
        try {
          const u = new URL(location.href);
          u.pathname = u.pathname.replace(
            /StajovyRegistrPrasat\w*/,
            'StajovyRegistrPrasat'
          );
          u.searchParams.delete('pfView');
          if (!u.searchParams.has('zaznamyZvirat'))
            u.searchParams.set('zaznamyZvirat', 'Platne');
          out.pigs = u.pathname + '?' + u.searchParams.toString();
        } catch (_) {
          out.pigs = location.href;
        }
      }
      return out;
    },

    all() {
      const subject = this.subject();
      const counts = this.herdCounts();
      const links = this.registerLinks();
      const fromLoc = this.linksFromLocation();
      this.cacheLinks(links);
      if (!links.sheep) links.sheep = fromLoc.sheep || this.cached('sheep');
      if (!links.pigs) links.pigs = fromLoc.pigs || this.cached('pigs');
      try {
        if (counts.pigs != null && !isNaN(counts.pigs))
          localStorage.setItem('pf-count-pigs', String(counts.pigs));
        if (counts.sheep != null && !isNaN(counts.sheep))
          localStorage.setItem('pf-count-sheep', String(counts.sheep));
      } catch (_) {}
      return { subject, counts, links, tabs: this.tabLinks() };
    },
  };

  /* ------------------------------------------------------------------ */
  /* Shell                                                              */
  /* ------------------------------------------------------------------ */
  PF.shell = {
    ensure() {
      let app = qs('#pf-app');
      if (!app) {
        app = document.createElement('div');
        app.id = 'pf-app';
        const main = qs('#main') || document.body;
        main.insertBefore(app, main.firstChild);
      }
      this.bindPigActionDelegation(app);
      return app;
    },

    /** Event delegation so pig action buttons keep working after toolbar rebuilds. */
    bindPigActionDelegation(root) {
      const app = root || qs('#pf-app');
      if (!app || app.dataset.pfPigDelegate === '1') return;
      app.dataset.pfPigDelegate = '1';
      app.addEventListener('click', (e) => {
        const btn = e.target && e.target.closest && e.target.closest('[data-pf-pig]');
        if (!btn || !btn.closest('#pf-toolbar')) return;
        e.preventDefault();
        e.stopPropagation();
        const typ = btn.getAttribute('data-pf-pig');
        try {
          if (typ === 'NakupPrisun') PF.pigForms.openBuy();
          else if (typ === 'DomaciPorazka') PF.pigForms.openKill();
        } catch (err) {
          PF.toast.error(
            'Akci se nepodařilo otevřít: ' +
              (err && err.message ? err.message : err)
          );
        }
      });
    },

    navHtml(active, data) {
      const sheepHref =
        (data.links && data.links.sheep) || PF.scrape.cached('sheep') || '#';
      const pigsHref =
        (data.links && data.links.pigs) || PF.scrape.cached('pigs') || '#';

      return `
        <div class="pf-top">
          <div>
            <div class="pf-brand">Portál farmáře</div>
          </div>
          <nav class="pf-nav">
            <a href="${PF.config.home}" class="${active === 'home' ? 'pf-active' : ''}">Domů</a>
            <a href="${sheepHref}" class="${active.startsWith('sheep') ? 'pf-active' : ''}">Ovce</a>
            <a href="${pigsHref}" class="${active.startsWith('pig') ? 'pf-active' : ''}">Prasata</a>
          </nav>
        </div>`;
    },

    contextLinks(kind, data) {
      const isPig = kind.startsWith('pig');
      const tabs = data.tabs || {};
      const baseHref = isPig
        ? (data.links && data.links.pigs) || PF.scrape.cached('pigs') || '#'
        : (data.links && data.links.sheep) || PF.scrape.cached('sheep') || '#';

      let registrHref = isPig
        ? this.swapController(baseHref, 'StajovyRegistrPrasat', []) || baseHref
        : this.swapController(baseHref, 'StajovyRegistrIndiv', []) || baseHref;

      // Strip our history flag from Registr link
      try {
        if (registrHref && registrHref !== '#') {
          const u = new URL(registrHref, location.origin);
          u.searchParams.delete('pfView');
          u.hash = '';
          if (isPig && !u.searchParams.has('zaznamyZvirat'))
            u.searchParams.set('zaznamyZvirat', 'Platne');
          const q = u.searchParams.toString();
          registrHref = u.pathname + (q ? '?' + q : '');
        }
      } catch (_) {}

      // Sheep: separate Pohyby page. Pigs: same register URL, pfView=history
      // (the register grid IS the change history — there is no PrasatPohyby).
      const histHref = (() => {
        if (!isPig && tabs.pohyby) return tabs.pohyby;
        if (isPig) {
          try {
            const u = new URL(registrHref, location.origin);
            u.searchParams.set('pfView', 'history');
            u.hash = '';
            return u.pathname + '?' + u.searchParams.toString();
          } catch (_) {
            return registrHref;
          }
        }
        return this.swapController(baseHref, 'StajovyRegistrIndivPohyby', [
          'stavDefault',
        ]);
      })();

      const pending = isPig
        ? (data.links && data.links.pigsPending) || 0
        : (data.links && data.links.sheepPending) || 0;

      return `
        <nav class="pf-context-nav" aria-label="Sekce registru">
          <a class="${kind === 'sheep' || kind === 'pig' || kind.includes('send') ? 'pf-tab-active' : ''}" href="${registrHref}${pending > 0 ? '#pf-pending' : ''}">Registr</a>
          <a class="${kind.includes('history') ? 'pf-tab-active' : ''}" href="${histHref}">Historie</a>
        </nav>`;
    },

    swapController(href, controller, dropParams) {
      if (!href || href === '#') return '#';
      try {
        const u = new URL(href, location.origin);
        u.pathname = u.pathname.replace(
          /StajovyRegistr(?:Indiv|Prasat)\w*/,
          controller
        );
        (dropParams || []).forEach((p) => u.searchParams.delete(p));
        const q = u.searchParams.toString();
        return u.pathname + (q ? '?' + q : '');
      } catch (_) {
        return href;
      }
    },

    deriveSheepTab(href, controller) {
      return this.swapController(href, controller, ['stavDefault']);
    },

    derivePigHistory(href) {
      // Change history is on the register page / its Prasata grid
      let h = this.swapController(href, 'StajovyRegistrPrasat', []);
      try {
        const u = new URL(h, location.origin);
        u.searchParams.delete('pfView');
        if (!u.searchParams.has('zaznamyZvirat'))
          u.searchParams.set('zaznamyZvirat', 'Platne');
        const q = u.searchParams.toString();
        return u.pathname + (q ? '?' + q : '');
      } catch (_) {
        return h;
      }
    },

    footer() {
      return `
        <div class="pf-footer">
          <a href="#" id="pf-toggle-off">Zobrazit původní Portál farmáře</a>
        </div>`;
    },

    bindFooter() {
      const a = qs('#pf-toggle-off');
      if (a) {
        a.addEventListener('click', (e) => {
          e.preventDefault();
          setEnabled(false);
          const u = new URL(location.href);
          u.searchParams.set('pf', 'off');
          location.href = u.toString();
        });
      }
      this.skinNativeFooter();
    },

    skinNativeFooter() {
      const foot = qs('footer.footer');
      if (!foot || foot.getAttribute('data-pf-skinned') === '1') return;
      foot.setAttribute('data-pf-skinned', '1');

      const err = foot.querySelector('#errbtn');
      if (err) err.remove();

      foot.querySelectorAll('.footer-info').forEach((box) => {
        if (box.querySelector('a')) return;
        let html = box.innerHTML;
        html = html.replace(
          /(\+?420[\s\u00a0]?\d{3}[\s\u00a0]?\d{3}[\s\u00a0]?\d{3})/g,
          '<a href="tel:+420222312977">$1</a>'
        );
        html = html.replace(
          /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi,
          '<a href="mailto:$1">$1</a>'
        );
        if (html !== box.innerHTML) box.innerHTML = html;
      });
    },

    pendingBanner(data) {
      const sp = (data.links && data.links.sheepPending) || 0;
      const pp = (data.links && data.links.pigsPending) || 0;
      if (sp + pp <= 0) return '';
      const sheepHref = data.links.sheep
        ? data.links.sheep + '#pf-pending'
        : '#';
      const pigsHref = data.links.pigs ? data.links.pigs + '#pf-pending' : '#';
      return `
        <div class="pf-banner">
          <div>Máte neodeslané změny${sp ? ' (ovce: ' + sp + ')' : ''}${pp ? ' (prasata: ' + pp + ')' : ''}.</div>
          <div class="pf-actions">
            ${sp ? `<a class="pf-btn pf-btn-warn" href="${sheepHref}">Ovce – odeslat</a>` : ''}
            ${pp ? `<a class="pf-btn pf-btn-warn" href="${pigsHref}">Prasata – odeslat</a>` : ''}
          </div>
        </div>`;
    },

    pendingBannerFor(kind, data) {
      const isPig = kind.startsWith('pig');
      const n = isPig
        ? (data.links && data.links.pigsPending) || 0
        : (data.links && data.links.sheepPending) || 0;
      if (n <= 0 || kind === 'sheep' || kind === 'pig') return '';
      const href = isPig
        ? ((data.links && data.links.pigs) || PF.scrape.cached('pigs') || '#') +
          '#pf-pending'
        : ((data.links && data.links.sheep) || PF.scrape.cached('sheep') || '#') +
          '#pf-pending';
      return `
        <div class="pf-banner">
          <div>Máte neodeslané změny (${n}).</div>
          <div class="pf-actions">
            <a class="pf-btn pf-btn-warn" href="${href}">Zobrazit na Registru</a>
          </div>
        </div>`;
    },
  };

  /* ------------------------------------------------------------------ */
  /* Views                                                              */
  /* ------------------------------------------------------------------ */
  PF.views = {
    icons: {
      // Clear pig head: round face, triangle ears, oval snout with nostrils
      pig: `<span class="pf-herd-icon" aria-hidden="true"><svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M18.5 14.5c-2.2-3.8-8.2-3.2-9.2 1.2-.6 2.6.6 4.8 2.4 6.2 2.2-1.8 4.6-3.2 6.8-4.2z"/><path d="M45.5 14.5c2.2-3.8 8.2-3.2 9.2 1.2.6 2.6-.6 4.8-2.4 6.2-2.2-1.8-4.6-3.2-6.8-4.2z"/><ellipse cx="32" cy="34" rx="20" ry="18"/><ellipse cx="32" cy="42" rx="9" ry="7" fill="#f7f4ec"/><circle cx="28.5" cy="42" r="1.8"/><circle cx="35.5" cy="42" r="1.8"/><circle cx="24" cy="30" r="2.6" fill="#f7f4ec"/><circle cx="40" cy="30" r="2.6" fill="#f7f4ec"/></svg></span>`,
      // Clear sheep head: woolly crown, long hanging ears, simple muzzle
      sheep: `<span class="pf-herd-icon" aria-hidden="true"><svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><path d="M12 28c-1.5 6-1 12 2 14 1.2-4 3-7.5 5.2-10.2-3-.8-5.4-2.2-7.2-3.8z"/><path d="M52 28c1.5 6 1 12-2 14-1.2-4-3-7.5-5.2-10.2 3-.8 5.4-2.2 7.2-3.8z"/><circle cx="20" cy="18" r="7"/><circle cx="32" cy="14" r="8"/><circle cx="44" cy="18" r="7"/><circle cx="24" cy="26" r="7"/><circle cx="40" cy="26" r="7"/><ellipse cx="32" cy="36" rx="15" ry="14"/><ellipse cx="32" cy="44" rx="7" ry="5.5" fill="#f7f4ec"/><circle cx="25.5" cy="33" r="2.4" fill="#f7f4ec"/><circle cx="38.5" cy="33" r="2.4" fill="#f7f4ec"/><rect x="30.2" y="42.5" width="3.6" height="5" rx="1.2" fill="#f7f4ec"/></svg></span>`,
    },

    home(data) {
      const s = data.subject;
      const c = data.counts;
      const L = data.links;
      const sheepTotal =
        c.sheepMale != null && c.sheepFemale != null
          ? c.sheepMale + c.sheepFemale
          : c.sheep;
      return `
        ${PF.shell.navHtml('home', data)}
        ${PF.shell.pendingBanner(data)}
        <div class="pf-grid" style="gap:18px">
          <div class="pf-panel">
            <h2>Hospodářství</h2>
            <div style="font-family:var(--pf-display);font-size:1.6rem;color:var(--pf-green);margin-bottom:6px">${escapeHtml(s.name)}</div>
            <span class="pf-chip">${escapeHtml(s.regDisplay || '—')}</span>
          </div>

          <div class="pf-grid pf-grid-2">
            <a class="pf-panel pf-herd" href="${L.pigs || '#'}" title="Otevřít registr prasat">
              ${PF.views.icons.pig}
              <div class="pf-num">${c.pigs == null ? '—' : c.pigs}</div>
              <div class="pf-label" id="pf-pigs-label">${CZ.pigs(c.pigs)}</div>
              <div class="pf-herd-breakdown pf-herd-breakdown--empty" aria-hidden="true"></div>
            </a>
            <a class="pf-panel pf-herd" href="${L.sheep || '#'}" title="Otevřít registr ovcí">
              ${PF.views.icons.sheep}
              <div class="pf-num" id="pf-sheep-total">${
                sheepTotal == null ? '—' : sheepTotal
              }</div>
              <div class="pf-label" id="pf-sheep-label">${CZ.sheep(sheepTotal)}</div>
              <div class="pf-herd-breakdown" id="pf-sheep-breakdown">
                <span class="pf-sex pf-sex-male">
                  <span class="pf-sex-num" id="pf-sheep-male">${c.sheepMale == null ? '—' : c.sheepMale}</span>
                  <span class="pf-sex-label" id="pf-sheep-male-label">${CZ.males(c.sheepMale)}</span>
                </span>
                <span class="pf-sex-sep" aria-hidden="true">·</span>
                <span class="pf-sex pf-sex-female">
                  <span class="pf-sex-num" id="pf-sheep-female">${c.sheepFemale == null ? '—' : c.sheepFemale}</span>
                  <span class="pf-sex-label" id="pf-sheep-female-label">${CZ.females(c.sheepFemale)}</span>
                </span>
              </div>
            </a>
          </div>

          <div class="pf-grid pf-grid-2">
            <div class="pf-panel">
              <h2>Identifikátory</h2>
              <dl class="pf-kv">
                <dt>Reg. číslo</dt><dd>${escapeHtml(s.regDisplay || '—')}</dd>
                <dt>SZR</dt><dd>${escapeHtml(s.szr || '—')}</dd>
                <dt>SZIF</dt><dd>${escapeHtml(s.szif || '—')}</dd>
              </dl>
            </div>
            <div class="pf-panel">
              <h2>Vlastník hospodářství</h2>
              <dl class="pf-kv">
                <dt>Jméno</dt><dd>${escapeHtml(s.contactName || s.name || '—')}</dd>
                <dt>Adresa</dt><dd>${escapeHtml(s.address || '—')}</dd>
                <dt>Telefon</dt><dd>${escapeHtml(s.phone || '—')}</dd>
                <dt>E-mail</dt><dd>${escapeHtml(s.email || '—')}</dd>
              </dl>
            </div>
          </div>
        </div>
        ${PF.shell.footer()}`;
    },

    register(kind, data) {
      const active = kind;
      const isRegister = kind === 'sheep' || kind === 'pig';
      const title =
        kind === 'sheep'
          ? 'Registr ovcí'
          : kind === 'sheep-history'
            ? 'Historie ovcí'
            : kind === 'sheep-send'
              ? 'Registr ovcí'
              : kind === 'pig'
                ? 'Registr prasat'
                : kind === 'pig-history'
                  ? 'Historie prasat'
                  : kind === 'pig-send'
                    ? 'Registr prasat'
                    : 'Registr';

      const marks =
        kind === 'sheep' || kind === 'sheep-send'
          ? `<div class="pf-util-links">
              <a href="${PF.config.marksNew}" target="_blank" rel="noopener">Objednat známky</a>
              <a href="${PF.config.marksDup}" target="_blank" rel="noopener">Duplikáty známek</a>
            </div>`
          : '';

      const actionsLabel =
        kind === 'sheep' || kind === 'pig' || kind.includes('send')
          ? 'Akce se zvířaty'
          : '';

      const pendingBlock =
        isRegister || kind.includes('send')
          ? `
        <div class="pf-panel pf-pending-panel" id="pf-pending-section" hidden>
          <div class="pf-pending-head">
            <h2 id="pf-pending">Neodeslané změny</h2>
            <div class="pf-actions" id="pf-pending-actions">
              <button type="button" class="pf-btn pf-btn-warn" id="pf-pending-confirm">Odeslat změny</button>
              <button type="button" class="pf-btn" id="pf-pending-cancel-all">Zrušit vše</button>
            </div>
          </div>
          <p class="pf-pending-hint" id="pf-pending-hint">
            Máte neodeslané změny. Odesláním je zapíšete do ústřední evidence.
          </p>
          <p class="pf-pending-status" id="pf-pending-status">Načítám neodeslané změny…</p>
          <div id="pf-pending-table"></div>
          <div id="pf-pending-native" class="pf-pending-native" aria-hidden="true"></div>
        </div>`
          : '';

      return `
        ${PF.shell.navHtml(active, data)}
        ${PF.shell.pendingBannerFor(kind, data)}
        <div class="pf-panel">
          <h2 class="pf-page-title">${title}</h2>
          ${PF.shell.contextLinks(kind, data)}
          ${marks}
          <div class="pf-actions-block" id="pf-actions-block">
            ${actionsLabel ? `<span class="pf-actions-label">${actionsLabel}</span>` : ''}
            <div class="pf-toolbar" id="pf-toolbar"></div>
          </div>
          <div class="pf-host" id="pf-host"></div>
        </div>
        ${pendingBlock}
        ${PF.shell.footer()}`;
    },

    marks(data) {
      return `
        ${PF.shell.navHtml('other', data)}
        <div class="pf-panel">
          <h2>Objednávka ušních známek</h2>
          <div class="pf-actions">
            <a class="pf-btn pf-btn-primary" href="${PF.config.home}">Zpět domů</a>
          </div>
          <div class="pf-host" id="pf-host"></div>
        </div>
        ${PF.shell.footer()}`;
    },

    other(data) {
      return `
        ${PF.shell.navHtml('other', data)}
        <div class="pf-panel">
          <h2>Portál farmáře</h2>
          <div class="pf-actions">
            <a class="pf-btn pf-btn-primary" href="${PF.config.home}">Domů</a>
            <a class="pf-btn" href="#" id="pf-toggle-off-2">Původní UI</a>
          </div>
        </div>
        ${PF.shell.footer()}`;
    },
  };

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /** Czech plural: 1 → one, 2–4 → few, 0/5+ → many */
  function czechWord(n, one, few, many) {
    const i = Math.abs(Math.floor(Number(n)));
    if (!Number.isFinite(i)) return few;
    if (i === 1) return one;
    if (i >= 2 && i <= 4) return few;
    return many;
  }

  const CZ = {
    pigs: (n) => czechWord(n, 'Prase', 'Prasata', 'Prasat'),
    pigsInStable: (n) =>
      czechWord(n, 'Prase ve stáji', 'Prasata ve stáji', 'Prasat ve stáji'),
    sheep: (n) => czechWord(n, 'Ovce', 'Ovce', 'Ovcí'),
    males: (n) => czechWord(n, 'samec', 'samci', 'samců'),
    females: (n) => czechWord(n, 'samice', 'samice', 'samic'),
    malesInStable: (n) =>
      czechWord(n, 'Samec ve stáji', 'Samci ve stáji', 'Samců ve stáji'),
    femalesInStable: (n) =>
      czechWord(n, 'Samice ve stáji', 'Samice ve stáji', 'Samic ve stáji'),
    changes: (n) =>
      czechWord(n, 'neodeslanou změnu', 'neodeslané změny', 'neodeslaných změn'),
    allChangesPhrase: (n) => {
      const i = Math.abs(Math.floor(Number(n)));
      if (i === 1) return 'tuto neodeslanou změnu';
      if (i >= 2 && i <= 4)
        return 'všechny ' + i + ' neodeslané změny';
      return 'všech ' + i + ' neodeslaných změn';
    },
  };

  /* ------------------------------------------------------------------ */
  /* Confirm dialog (styled replacement for window.confirm)             */
  /* ------------------------------------------------------------------ */
  PF.confirmDialog = function confirmDialog(opts) {
    const o = opts || {};
    const title = o.title || 'Potvrzení';
    const message = o.message || '';
    const detail = o.detail || '';
    const confirmLabel = o.confirmLabel || 'Potvrdit';
    const cancelLabel = o.cancelLabel || 'Zpět';
    const danger = !!o.danger;

    return new Promise((resolve) => {
      const existing = qs('#pf-confirm-modal');
      if (existing) existing.remove();

      const wrap = document.createElement('div');
      wrap.id = 'pf-confirm-modal';
      wrap.className = 'pf-modal-backdrop pf-confirm-backdrop';
      wrap.innerHTML =
        '<div class="pf-modal pf-confirm-modal' +
        (danger ? ' is-danger' : '') +
        '" role="alertdialog" aria-modal="true" aria-labelledby="pf-confirm-title" aria-describedby="pf-confirm-msg">' +
        '<div class="pf-modal-head"><h3 id="pf-confirm-title">' +
        escapeHtml(title) +
        '</h3></div>' +
        '<div class="pf-modal-body">' +
        '<p class="pf-confirm-msg" id="pf-confirm-msg">' +
        escapeHtml(message) +
        '</p>' +
        (detail
          ? '<p class="pf-confirm-detail">' + escapeHtml(detail) + '</p>'
          : '') +
        '</div>' +
        '<div class="pf-modal-foot">' +
        '<button type="button" class="pf-btn" id="pf-confirm-cancel">' +
        escapeHtml(cancelLabel) +
        '</button>' +
        '<button type="button" class="pf-btn ' +
        (danger ? 'pf-btn-danger' : 'pf-btn-primary') +
        '" id="pf-confirm-ok">' +
        escapeHtml(confirmLabel) +
        '</button>' +
        '</div></div>';
      document.body.appendChild(wrap);

      const done = (val) => {
        try {
          wrap.remove();
        } catch (_) {}
        document.removeEventListener('keydown', onKey, true);
        resolve(val);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          done(false);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          done(true);
        }
      };
      document.addEventListener('keydown', onKey, true);

      qs('#pf-confirm-cancel', wrap).addEventListener('click', () =>
        done(false)
      );
      qs('#pf-confirm-ok', wrap).addEventListener('click', () => done(true));
      wrap.addEventListener('click', (e) => {
        if (e.target === wrap) done(false);
      });

      setTimeout(() => {
        const ok = qs('#pf-confirm-ok', wrap);
        if (ok) ok.focus();
      }, 30);
    });
  };

  /* ------------------------------------------------------------------ */
  /* Toasts (styled replacement for portal #messages-box / alert)       */
  /* ------------------------------------------------------------------ */
  PF.toast = {
    _root: null,
    _seq: 0,
    _queue: [],
    _boxMo: null,
    _hookTimer: null,
    _navigating: false,
    _paintedSig: '',

    ensureRoot() {
      let root = this._root || qs('#pf-toast-root');
      if (root && root.isConnected) {
        this._root = root;
        return root;
      }
      root = document.createElement('div');
      root.id = 'pf-toast-root';
      root.setAttribute('aria-live', 'polite');
      root.setAttribute('aria-relevant', 'additions');
      (document.body || document.documentElement).appendChild(root);
      this._root = root;
      return root;
    },

    /** Strip portal HTML fragments to plain text. */
    plain(message) {
      const raw = String(message == null ? '' : message).trim();
      if (!raw) return '';
      if (!/[<>&]/.test(raw)) return raw;
      try {
        const tmp = document.createElement('div');
        tmp.innerHTML = raw;
        return String(tmp.textContent || tmp.innerText || '')
          .replace(/\s+/g, ' ')
          .trim();
      } catch (_) {
        return raw.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    },

    /** Block paint during boot/busy or right before a full navigation. */
    isBlocked() {
      if (this._navigating) return true;
      try {
        if (document.documentElement.classList.contains('pf-booting'))
          return true;
      } catch (_) {}
      const boot = document.getElementById('pf-boot-loader');
      if (boot) return true;
      const busy = document.getElementById('pf-busy-loader');
      if (busy && busy.classList.contains('pf-busy-on')) return true;
      try {
        if (PF.loader && (PF.loader._held || PF.loader._busyDepth > 0))
          return true;
      } catch (_) {}
      return false;
    },

    /** Call immediately before location.href / replace navigations. */
    beginNavigate() {
      this._navigating = true;
    },

    enqueue(message, type) {
      const text = this.plain(message);
      const t = type === 'error' || type === 'info' ? type : 'success';
      if (!text) return;
      const last = this._queue[this._queue.length - 1];
      if (last && last.text === text && last.type === t) return;
      this._queue.push({ text, type: t });
    },

    /**
     * Persist across reloads. Cleared only after the toast is dismissed
     * (so a reload right after paint can still restore it once).
     */
    stash(message, type) {
      const text = this.plain(message);
      const t = type === 'error' || type === 'info' ? type : 'success';
      if (!text) return;
      try {
        sessionStorage.setItem(
          'pf-toast-stash',
          JSON.stringify({ text, type: t, t: Date.now() })
        );
      } catch (_) {}
    },

    clearStash() {
      try {
        sessionStorage.removeItem('pf-toast-stash');
      } catch (_) {}
    },

    peekStash() {
      let raw = null;
      try {
        raw = sessionStorage.getItem('pf-toast-stash');
      } catch (_) {
        return null;
      }
      if (!raw) return null;
      try {
        const o = JSON.parse(raw);
        if (!o || !o.text) return null;
        if (Date.now() - (Number(o.t) || 0) > 60000) {
          this.clearStash();
          return null;
        }
        return {
          text: String(o.text),
          type: o.type === 'error' || o.type === 'info' ? o.type : 'success',
        };
      } catch (_) {
        return null;
      }
    },

    /**
     * Action outcome that must survive reload: stash + queue, never paint now.
     * flush() paints only when boot/busy are gone and we are not navigating.
     */
    announce(message, type) {
      const text = this.plain(message);
      const t = type === 'error' || type === 'info' ? type : 'success';
      if (!text) return;
      if (!earlyEnabled() && !isEnabled()) return;
      this.stash(text, t);
      this.enqueue(text, t);
    },

    /**
     * Drop portal #messages-box nodes without showing their copy.
     * Farmer-facing text comes only from PF.toast.saved / announce helpers.
     */
    consumePortalBoxes() {
      const nodes = qsa(
        '#messages-box .message-box, #messages-box .errormessage-box, #messages-box .message-error'
      );
      nodes.forEach((n) => {
        try {
          n.remove();
        } catch (_) {}
      });
    },

    /** Short ear-mark label for toast copy (keep last meaningful chunk). */
    _earLabel(ear) {
      const s = String(ear || '').replace(/\s+/g, ' ').trim();
      if (!s) return '';
      // Prefer trailing national number chunk when present (e.g. "CZ… 956")
      const parts = s.split(' ').filter(Boolean);
      if (parts.length >= 2 && /^\d{2,}$/.test(parts[parts.length - 1])) {
        return parts.slice(-2).join(' ');
      }
      return s.length > 28 ? s.slice(0, 26) + '…' : s;
    },

    _countFromData(data) {
      const d = data || {};
      if (Array.isArray(d.ears) && d.ears.length) return d.ears.length;
      if (d.ear) return 1;
      const n = Number(d.count);
      if (Number.isFinite(n) && n > 0) return Math.floor(n);
      return 0;
    },

    /**
     * Farmer-friendly success copy for a saved register action.
     * kind: 'sheep' | 'pig'; typ: portal typZmeny; data: form payload.
     */
    describeSaved(kind, typ, data) {
      const d = data || {};
      const n = this._countFromData(d);
      const ear = this._earLabel(d.ear || (d.ears && d.ears[0]) || '');
      const pending = ' mezi neodeslané změny';
      const isSheep = String(kind || '').startsWith('sheep');

      if (isSheep) {
        if (typ === 'Narozeni') {
          return ear
            ? 'Narození ovce ' + ear + ' bylo přidáno' + pending + '.'
            : 'Narození ovce bylo přidáno' + pending + '.';
        }
        if (typ === 'NakupPrisun') {
          return ear
            ? 'Nákup / přísun ovce ' + ear + ' byl přidán' + pending + '.'
            : 'Nákup / přísun ovce byl přidán' + pending + '.';
        }
        if (typ === 'ProdejOdsun') {
          if (n > 1)
            return (
              'Prodej / odsun ' +
              n +
              ' ' +
              czechWord(n, 'ovce', 'ovce', 'ovcí') +
              ' byl přidán' +
              pending +
              '.'
            );
          return ear
            ? 'Prodej / odsun ovce ' + ear + ' byl přidán' + pending + '.'
            : 'Prodej / odsun ovce byl přidán' + pending + '.';
        }
        if (typ === 'DomaciPorazka') {
          if (n > 1)
            return (
              'Domácí porážka ' +
              n +
              ' ' +
              czechWord(n, 'ovce', 'ovce', 'ovcí') +
              ' byla přidána' +
              pending +
              '.'
            );
          return ear
            ? 'Domácí porážka ovce ' + ear + ' byla přidána' + pending + '.'
            : 'Domácí porážka ovce byla přidána' + pending + '.';
        }
        if (typ === 'Zcizeni') {
          if (n > 1)
            return (
              'Zcizení ' +
              n +
              ' ' +
              czechWord(n, 'ovce', 'ovce', 'ovcí') +
              ' bylo přidáno' +
              pending +
              '.'
            );
          return ear
            ? 'Zcizení ovce ' + ear + ' bylo přidáno' + pending + '.'
            : 'Zcizení ovce bylo přidáno' + pending + '.';
        }
        return 'Změna v registru ovcí byla přidána' + pending + '.';
      }

      // pigs
      const pigsWord = czechWord(n || 1, 'prase', 'prasata', 'prasat');
      if (typ === 'NakupPrisun') {
        if (n > 0)
          return (
            'Nákup / přísun ' + n + ' ' + pigsWord + ' byl přidán' + pending + '.'
          );
        return 'Nákup / přísun prasat byl přidán' + pending + '.';
      }
      if (typ === 'DomaciPorazka') {
        if (n > 0)
          return (
            'Domácí porážka ' +
            n +
            ' ' +
            pigsWord +
            ' byla přidána' +
            pending +
            '.'
          );
        return 'Domácí porážka prasat byla přidána' + pending + '.';
      }
      return 'Změna v registru prasat byla přidána' + pending + '.';
    },

    /** Persist a contextual success toast for a completed register action. */
    saved(kind, typ, data) {
      const msg = this.describeSaved(kind, typ, data);
      if (msg) this.announce(msg, 'success');
    },

    watchPortalBoxes() {
      if (this._boxMo) return;
      const attach = () => {
        const box = document.getElementById('messages-box');
        if (!box) return false;
        if (this._boxMo) return true;
        // Only strip portal nodes — never flush here (that stole stashes before navigate)
        this._boxMo = new MutationObserver(() => {
          try {
            this.consumePortalBoxes();
          } catch (_) {}
        });
        this._boxMo.observe(box, { childList: true, subtree: true });
        this.consumePortalBoxes();
        return true;
      };
      if (attach()) return;
      const mo = new MutationObserver(() => {
        if (attach()) mo.disconnect();
      });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    },

    /** Paint queued/stashed toasts once boot/busy overlays are gone. */
    flush() {
      if (!earlyEnabled() && !isEnabled()) {
        this._queue.length = 0;
        return;
      }
      try {
        this.consumePortalBoxes();
      } catch (_) {}
      if (this.isBlocked()) return;

      const stashed = this.peekStash();
      if (stashed) this.enqueue(stashed.text, stashed.type);

      if (!this._queue.length) return;
      const items = this._queue.splice(0, this._queue.length);
      items.forEach((item, i) => {
        const sig = item.type + '\0' + item.text;
        // Same page: don't paint the same announce twice (busy hide + boot hide)
        if (this._paintedSig === sig) return;
        this._paintedSig = sig;
        setTimeout(() => {
          this._paint(item.text, item.type, {});
        }, i * 80);
      });
    },

    _paint(text, type, opts) {
      const o = opts || {};
      if (!text) return null;
      if (!earlyEnabled() && !isEnabled()) return null;
      // Keep stash until dismiss so a reload during the toast can restore it
      this.stash(text, type);

      const root = this.ensureRoot();
      const el = document.createElement('div');
      const id = 'pf-toast-' + ++this._seq;
      el.id = id;
      el.className = 'pf-toast is-' + type;
      el.setAttribute('role', type === 'error' ? 'alert' : 'status');
      el.innerHTML =
        '<span class="pf-toast-bar" aria-hidden="true"></span>' +
        '<div class="pf-toast-body"></div>' +
        '<button type="button" class="pf-toast-close" aria-label="Zavřít">×</button>';
      qs('.pf-toast-body', el).textContent = text;
      root.appendChild(el);

      // Long enough to read; click the toast (or ×) to dismiss sooner
      const duration =
        typeof o.duration === 'number'
          ? o.duration
          : type === 'error'
            ? 14000
            : 12000;
      let hideTimer = null;
      const dismiss = () => {
        if (hideTimer != null) {
          try {
            clearTimeout(hideTimer);
          } catch (_) {}
          hideTimer = null;
        }
        el.classList.remove('is-in');
        el.classList.add('is-out');
        // Clear only if stash still matches this toast
        try {
          const cur = this.peekStash();
          if (cur && cur.text === text && cur.type === type) this.clearStash();
        } catch (_) {}
        setTimeout(() => {
          try {
            el.remove();
          } catch (_) {}
        }, 240);
      };

      // Click anywhere on the toast (including ×) dismisses immediately
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dismiss();
      });

      const raf =
        window.requestAnimationFrame ||
        function (fn) {
          return setTimeout(fn, 16);
        };
      raf(() => {
        el.classList.add('is-in');
      });
      if (duration > 0) hideTimer = setTimeout(dismiss, duration);
      return { id, dismiss };
    },

    show(message, opts) {
      const o = opts || {};
      const type = o.type === 'error' || o.type === 'info' ? o.type : 'success';
      const text = this.plain(message);
      if (!text) return null;
      if (!earlyEnabled() && !isEnabled()) return null;
      // Immediate errors/info (no navigation): queue while blocked, else paint
      if (this.isBlocked()) {
        this.enqueue(text, type);
        return null;
      }
      return this._paint(text, type, o);
    },

    success(message, opts) {
      return this.show(message, Object.assign({}, opts, { type: 'success' }));
    },
    error(message, opts) {
      return this.show(message, Object.assign({}, opts, { type: 'error' }));
    },
    info(message, opts) {
      return this.show(message, Object.assign({}, opts, { type: 'info' }));
    },

    /**
     * Swallow portal $.aq.zobrazitZpravu / zobrazitChybu (unfriendly copy).
     * Native #messages-box stays hidden; PF owns farmer-facing text.
     */
    installHooks() {
      if (!earlyEnabled()) return;
      this.watchPortalBoxes();
      const tryHook = () => {
        const $ = window.jQuery || window.$;
        if (!$ || !$.aq) return false;
        if ($.aq._pfToastHooked) return true;

        const origOk = $.aq.zobrazitZpravu;
        const origErr = $.aq.zobrazitChybu;

        $.aq.zobrazitZpravu = function (message) {
          if (!earlyEnabled()) {
            if (typeof origOk === 'function') return origOk.apply(this, arguments);
            return;
          }
          // Ignore portal success flashes ("Data byla uložena", …)
        };
        $.aq.zobrazitChybu = function (message) {
          if (!earlyEnabled()) {
            if (typeof origErr === 'function')
              return origErr.apply(this, arguments);
            return;
          }
          // Ignore portal error flashes — PF surfaces failures in-modal / PF.toast.error
        };
        $.aq._pfToastHooked = true;

        try {
          PF.toast.consumePortalBoxes();
        } catch (_) {}
        return true;
      };

      if (tryHook()) return;
      if (this._hookTimer) return;
      let n = 0;
      this._hookTimer = setInterval(() => {
        n += 1;
        if (tryHook() || n > 200) {
          clearInterval(this._hookTimer);
          this._hookTimer = null;
        }
      }, 50);
    },
  };

  if (earlyEnabled()) {
    PF.toast.installHooks();
  }

  /* ------------------------------------------------------------------ */
  /* Pending changes (embedded on Registr)                              */
  /* ------------------------------------------------------------------ */
  PF.pending = {
    state: {
      kind: null,
      rows: [],
      odeslatHref: '',
      smazatHref: '',
      changeRowUrl: '',
    },

    zmenyPageUrl(kind) {
      const isPig = kind.startsWith('pig');
      if (!isPig) {
        // Prefer the portal's own "Změny k odeslání" link when present
        try {
          const a =
            qs('a[href*="StajovyRegistrIndivZmeny"]') ||
            qs('a.link-selected-action[href*="IndivZmeny"]');
          const href = a && a.getAttribute('href');
          if (href && !/^javascript:/i.test(href)) {
            const u = new URL(href, location.origin);
            return u.pathname + (u.search ? u.search : '');
          }
        } catch (_) {}
      }
      const base = isPig
        ? PF.scrape.cached('pigs') || location.href
        : PF.scrape.cached('sheep') || location.href;
      return PF.shell.swapController(
        base,
        isPig ? 'StajovyRegistrPrasatZmeny' : 'StajovyRegistrIndivZmeny',
        isPig ? ['zaznamyZvirat'] : ['stavDefault']
      );
    },

    zmenyGridUrl(kind) {
      const isPig = kind.startsWith('pig');
      try {
        const u = new URL(this.zmenyPageUrl(kind), location.origin);
        const idProv =
          u.searchParams.get('idProvozovnySR') ||
          u.searchParams.get('idProvozovnaSr') ||
          '00000000000000000000000000000000';
        const idSR = u.searchParams.get('idStajovyRegistr') || '';
        const idStaj =
          u.searchParams.get('idStaj') ||
          '00000000000000000000000000000000';
        if (!idSR) return '';
        if (isPig) {
          return (
            '/ssl/app/izr2far/StajoveRegistry/StajovyRegistrPrasatZmenyGrid/Zmeny' +
            '?idProvozovnaSr=' +
            encodeURIComponent(idProv) +
            '&idStajovyRegistr=' +
            encodeURIComponent(idSR) +
            '&idStaj=' +
            encodeURIComponent(idStaj)
          );
        }
        const druhKey =
          this.resolveSheepDruhKey() ||
          (PF.config && PF.config.sheepDruhKey) ||
          '';
        return (
          '/ssl/app/izr2far/StajoveRegistry/StajovyRegistrIndivZmenyGrid/Zmeny' +
          '?provozovnaSRKey=' +
          encodeURIComponent(idProv) +
          '&stajovyRegistrKey=' +
          encodeURIComponent(idSR) +
          '&stajKey=' +
          encodeURIComponent(idStaj) +
          (druhKey ? '&druhKey=' + encodeURIComponent(druhKey) : '')
        );
      } catch (_) {
        return '';
      }
    },

    /** druhKey from page links, then config (sheep species GUID). */
    resolveSheepDruhKey() {
      try {
        const nodes = qsa(
          'a[href*="druhKey="], a[data-href*="druhKey="], [data-url*="druhKey="], span[data-href*="druhKey="]'
        );
        for (let i = 0; i < nodes.length; i++) {
          const blob =
            (nodes[i].getAttribute('href') || '') +
            ' ' +
            (nodes[i].getAttribute('data-href') || '') +
            ' ' +
            (nodes[i].getAttribute('data-url') || '');
          const m = blob.match(/[?&]druhKey=([a-f0-9]{32})/i);
          if (m) return m[1];
        }
      } catch (_) {}
      return (PF.config && PF.config.sheepDruhKey) || '';
    },

    /** Exact Zmeny grid URL embedded in the Změny page (includes druhKey). */
    findSheepZmenyGridUrlFromHtml(html) {
      let best = '';
      const re =
        /\/ssl\/app\/izr2far\/StajoveRegistry\/StajovyRegistrIndivZmenyGrid\/Zmeny\?[^"'\\\s<>]+/gi;
      String(html || '').replace(re, (m) => {
        const u = m.replace(/&amp;/g, '&');
        if (/druhKey=/i.test(u)) best = u;
        else if (!best) best = u;
      });
      return best;
    },

    /** True when HTML is a portal 404 / error document — must not enter #pf-host. */
    isPortalErrorHtml(html) {
      const s = String(html || '');
      if (!s) return false;
      return (
        /Dokument nebyl nalezen/i.test(s) ||
        /Document not found/i.test(s) ||
        /požadovaná stránka nebyla na serveru nalezena/i.test(s) ||
        /requested page was not found/i.test(s)
      );
    },

    setStatus(msg) {
      const el = qs('#pf-pending-status');
      if (el) el.textContent = msg || '';
    },

    showSection(on) {
      const sec = qs('#pf-pending-section');
      if (!sec) return;
      if (on) sec.removeAttribute('hidden');
      else sec.setAttribute('hidden', '');
    },

    bindChrome() {
      const conf = qs('#pf-pending-confirm');
      const all = qs('#pf-pending-cancel-all');
      if (conf && !conf._pfBound) {
        conf._pfBound = true;
        conf.addEventListener('click', () => this.confirmAll());
      }
      if (all && !all._pfBound) {
        all._pfBound = true;
        all.addEventListener('click', () => this.cancelAll());
      }
    },

    /** Load pending changes once per page kind unless forced. */
    refresh(kind, opts) {
      const section = qs('#pf-pending-section');
      if (!section) return Promise.resolve();
      const force = opts && opts.force;
      if (this._inflight) {
        if (!force) return this._inflight;
        // Force: wait for current load then run again
        return this._inflight.finally(() => this.refresh(kind, { force: true }));
      }
      if (!force && this._loadedKind === kind) return Promise.resolve();

      this.bindChrome();
      this.state.kind = kind;
      if (!this._loadedKind) this.setStatus('Načítám neodeslané změny…');

      const pageUrl = this.zmenyPageUrl(kind);
      const isSheep = String(kind).startsWith('sheep');

      const get = (url) =>
        new Promise((resolve) => {
          if (!url) return resolve('');
          if (refresh$() && $.ajax) {
            $.ajax({
              url,
              method: 'GET',
              dataType: 'html',
              pfInternal: true,
              success: (html) => resolve(html || ''),
              error: () => resolve(''),
            });
          } else {
            fetch(url, { credentials: 'same-origin' })
              .then((r) => r.text())
              .then((html) => resolve(html || ''))
              .catch(() => resolve(''));
          }
        });

      // Sheep: Zmeny only for cancel/send IDs + URLs (display already painted from Indiv).
      // Pigs: page + grid in parallel for the pending table itself.
      const loadPair = isSheep
        ? get(pageUrl).then((pageHtml) => {
            const safePage = this.isPortalErrorHtml(pageHtml) ? '' : pageHtml;
            let gridUrl =
              this.findSheepZmenyGridUrlFromHtml(safePage) ||
              this.zmenyGridUrl(kind);
            if (gridUrl && !/druhKey=/i.test(gridUrl)) {
              const dk = this.resolveSheepDruhKey();
              if (dk) {
                gridUrl +=
                  (gridUrl.includes('?') ? '&' : '?') +
                  'druhKey=' +
                  encodeURIComponent(dk);
              }
            }
            return get(gridUrl).then((gridHtml) => [safePage, gridHtml || '']);
          })
        : Promise.all([get(pageUrl), get(this.zmenyGridUrl(kind))]);

      this._inflight = loadPair
        .then(([pageHtml, gridHtml]) => {
          const safePage = this.isPortalErrorHtml(pageHtml) ? '' : pageHtml;
          const safeGrid = this.isPortalErrorHtml(gridHtml) ? '' : gridHtml;
          const fromPage = this.parse(safePage, kind);
          const fromGrid = this.parse(safeGrid || safePage, kind);
          const urls = {
            odeslatHref:
              fromPage.odeslatHref ||
              fromGrid.odeslatHref ||
              this.state.odeslatHref ||
              '',
            smazatHref:
              fromPage.smazatHref ||
              fromGrid.smazatHref ||
              this.state.smazatHref ||
              '',
            changeRowUrl:
              fromGrid.changeRowUrl ||
              fromPage.changeRowUrl ||
              this.state.changeRowUrl ||
              '',
          };

          if (isSheep) {
            const zmenyIdx = this.indexSheepZmenyByEar(safeGrid || safePage);
            PF._pfQuietMutate(() => {
              // One paint after Indiv + Zmeny are both ready (no partial flash)
              const rows = this.finalizeSheepPendingRows(zmenyIdx.byEar);
              this.apply(
                {
                  rows,
                  odeslatHref: urls.odeslatHref,
                  smazatHref: urls.smazatHref,
                  changeRowUrl: urls.changeRowUrl,
                },
                safeGrid || safePage
              );
            });
          } else {
            let rows = fromGrid.rows.length ? fromGrid.rows : fromPage.rows;
            if (!rows.length && this.state.rows && this.state.rows.length) {
              rows = this.state.rows;
            }
            PF._pfQuietMutate(() =>
              this.apply(
                {
                  rows,
                  odeslatHref: urls.odeslatHref,
                  smazatHref: urls.smazatHref,
                  changeRowUrl: urls.changeRowUrl,
                },
                safeGrid || safePage
              )
            );
          }
          this._loadedKind = kind;
        })
        .finally(() => {
          this._inflight = null;
        });
      return this._inflight;
    },

    parse(html, kind) {
      if (this.isPortalErrorHtml(html)) {
        return { rows: [], odeslatHref: '', smazatHref: '', changeRowUrl: '' };
      }
      const doc = new DOMParser().parseFromString(html || '', 'text/html');
      let odeslatHref = '';
      let smazatHref = '';
      qsa('a, button, input[type=button], input[type=submit]', doc).forEach(
        (el) => {
          const t = norm(textOf(el) || el.value || el.getAttribute('title') || '');
          const href = el.getAttribute('href') || '';
          if (/odeslat/.test(t) || /Odeslat/i.test(href)) {
            if (href && href !== '#') odeslatHref = href;
            else if (el.getAttribute('onclick'))
              odeslatHref = 'javascript:' + el.getAttribute('onclick');
          }
          if (/smazat|zrusit|zrušit/.test(t) || /Smazat/i.test(href)) {
            if (href && href !== '#') smazatHref = href;
          }
        }
      );

      // Fallback Smazat URL from page pattern
      if (!smazatHref) {
        try {
          const u = new URL(this.zmenyPageUrl(kind), location.origin);
          u.pathname = u.pathname.replace(/\/?$/, '') + '/Smazat';
          smazatHref = u.pathname + '?' + u.searchParams.toString();
        } catch (_) {}
      }
      if (!odeslatHref) {
        try {
          const u = new URL(this.zmenyPageUrl(kind), location.origin);
          u.pathname = u.pathname.replace(/\/?$/, '') + '/Odeslat';
          odeslatHref = u.pathname + '?' + u.searchParams.toString();
        } catch (_) {}
      }

      const table =
        qs('table.grid-table', doc) ||
        qs('table.dataTable', doc) ||
        qs('table', doc);
      let changeRowUrl = '';
      if (table) {
        changeRowUrl =
          table.getAttribute('data-changerowsel') ||
          table.getAttribute('data-changeRowSel') ||
          '';
      }

      const rows = [];
      if (table) {
        const headRow =
          qs('thead tr', table) ||
          qsa('tr', table).find((tr) => qs('th', tr));
        const ths = headRow
          ? qsa(':scope > th, :scope > td', headRow).length
            ? qsa(':scope > th, :scope > td', headRow)
            : qsa('th', headRow)
          : [];
        const labels = ths.map((th) => PF.registers.headerLabel(th));
        const keepIdx = [];
        labels.forEach((label, idx) => {
          const col = String(ths[idx].getAttribute('data-colname') || '').toUpperCase();
          if (col === 'CHECK_ID' || ths[idx].classList.contains('check-column'))
            return;
          if (!norm(label) && !col) return;
          if (PF.registers.shouldKeepColumn(kind.includes('pig') ? 'pig-send' : 'sheep-send', label, ths[idx]))
            keepIdx.push(idx);
        });
        if (!keepIdx.length) {
          labels.forEach((label, idx) => {
            const col = String(ths[idx].getAttribute('data-colname') || '').toUpperCase();
            if (col === 'CHECK_ID' || ths[idx].classList.contains('check-column'))
              return;
            if (!norm(label) && !col) return;
            if (
              /\bprovozovn|\bstaj\b|hlasici|zalozen|odeslan|nahlas|pridan/.test(
                norm(label + ' ' + col)
              )
            )
              return;
            if (
              kind.includes('pig') &&
              (col === 'KONECNYSTAV' ||
                /konecnystav|konecny_stav|stavkonecn/.test(
                  norm(label + ' ' + col).replace(/\s/g, '')
                ) ||
                (/konecn/.test(norm(label + ' ' + col)) &&
                  /stav/.test(norm(label + ' ' + col))))
            )
              return;
            keepIdx.push(idx);
          });
        }

        const dataRows = qsa('tbody tr.grid-row, tbody tr', table).filter(
          (tr) => !isFilterChromeRow(tr) && qsa(':scope > td', tr).length
        );
        dataRows.forEach((tr) => {
          const cb = qs(
            'td.check-column input[type="checkbox"], input[name="ids"], input[type="checkbox"]',
            tr
          );
          const id = (cb && (cb.value || cb.getAttribute('data-id') || cb.name)) || '';
          if (!id && !textOf(tr)) return;
          const sendKind = kind.includes('pig') ? 'pig-send' : 'sheep-send';
          const shownLabels = keepIdx.map((i) =>
            PF.registers.displayHeaderLabel(sendKind, labels[i] || '')
          );
          const cells = keepIdx.map((i, j) => {
            const td = qsa(':scope > td', tr)[i];
            const raw = cellText(td);
            const shown = shownLabels[j] || '';
            if (
              shown === 'Datum přidání' ||
              shown === 'Datum nahlášení' ||
              isNahlaseniColumn(sendKind, labels[i], ths[i])
            ) {
              return dateOnlyText(raw);
            }
            return friendlyDisplayText(raw);
          });
          if (cells.every((c) => !c)) return;
          rows.push({
            id: String(id || ''),
            cells,
            labels: shownLabels,
          });
        });
      }

      return { rows, odeslatHref, smazatHref, changeRowUrl };
    },

    earKey(raw) {
      return norm(String(raw || '').replace(/\s+/g, '').replace(/\u00a0/g, ''));
    },

    /** Zmeny grid → ear → { id, change, date } for cancel/send + labels. */
    indexSheepZmenyByEar(html) {
      const byEar = new Map();
      if (this.isPortalErrorHtml(html) || !html) return { byEar };
      try {
        const doc = new DOMParser().parseFromString(html || '', 'text/html');
        const table =
          qs('table.grid-table', doc) ||
          qs('table.dataTable', doc) ||
          qs('table', doc);
        if (!table) return { byEar };
        const headRow =
          qs('thead tr', table) ||
          qsa('tr', table).find((tr) => qs('th', tr));
        if (!headRow) return { byEar };
        const ths = qsa(':scope > th, :scope > td', headRow).length
          ? qsa(':scope > th, :scope > td', headRow)
          : qsa('th', headRow);
        let uz = -1;
        let id1 = -1;
        let datum = -1;
        ths.forEach((th, i) => {
          const col = String(
            th.getAttribute('data-colname') || ''
          ).toUpperCase();
          if (col === 'UZ' || col === 'ZNAMKA') uz = i;
          else if (col === 'ID1') id1 = i;
          else if (col === 'DATUM') datum = i;
        });
        qsa('tbody tr.grid-row, tbody tr', table).forEach((tr) => {
          if (isFilterChromeRow(tr)) return;
          const cells = qsa(':scope > td', tr);
          if (!cells.length) return;
          const cb = qs(
            'td.check-column input[type="checkbox"], input[name="ids"], input[type="checkbox"]',
            tr
          );
          const id =
            (cb && (cb.value || cb.getAttribute('data-id') || '')) ||
            tr.getAttribute('data-id') ||
            '';
          const earRaw =
            uz >= 0 ? cellText(cells[uz]) : '';
          const key = this.earKey(earRaw);
          if (!key || key.length < 5) return;
          byEar.set(key, {
            id: String(id || ''),
            change: friendlyDisplayText(
              id1 >= 0 ? cellText(cells[id1]) : ''
            ),
            date: dateOnlyText(datum >= 0 ? cellText(cells[datum]) : ''),
            ear: friendlyDisplayText(earRaw),
          });
        });
      } catch (_) {}
      return { byEar };
    },

    /** Pending on Indiv A-list: yellow/orange mark or založeno; never red. */
    isSheepPendingIndivRow(row, table) {
      if (!row) return false;
      try {
        if (qs('.cervene', row)) return false;
      } catch (_) {}
      try {
        const marked = qsa('[style]', row).some((el) => {
          const st = String(el.getAttribute('style') || '').toLowerCase();
          return (
            st.includes('yellow') ||
            st.includes('orange') ||
            /#ff0|#ffff00|#ffa500|rgb\(\s*255\s*,\s*255\s*,\s*0/.test(st)
          );
        });
        if (marked) return true;
      } catch (_) {}
      return !!(
        PF.registers &&
        PF.registers.isSheepPendingHerdRow &&
        PF.registers.isSheepPendingHerdRow(row, table)
      );
    },

    /** Column map for a native Indiv grid thead. */
    sheepIndivColMap(table) {
      const map = {};
      if (!table) return map;
      const headRow =
        qs('thead tr', table) ||
        qsa('tr', table).find((tr) => qs('th', tr));
      if (!headRow) return map;
      const ths = qsa(':scope > th, :scope > td', headRow).length
        ? qsa(':scope > th, :scope > td', headRow)
        : qsa('th', headRow);
      ths.forEach((th, i) => {
        const col = String(
          th.getAttribute('data-colname') || ''
        ).toUpperCase();
        if (col) map[col] = i;
      });
      return map;
    },

    /** Scan native Indiv grids (A filter) → ear → animal display fields. */
    indexSheepIndivAnimals() {
      const byEar = new Map();
      const tables = qsa(
        '#pf-host table.grid-table, #main table.grid-table, table.grid-table'
      );
      tables.forEach((table) => {
        if (
          table.closest &&
          table.closest('#pf-pending-section, .pf-modal, #pf-pending-table')
        )
          return;
        // Only Indiv register grids (not Zmeny)
        const changer =
          table.getAttribute('data-changerowsel') ||
          table.getAttribute('data-changeRowSel') ||
          '';
        if (changer && /ZMENY|Zmeny/i.test(changer)) return;
        const cols = this.sheepIndivColMap(table);
        if (cols.ZNAMKA == null && cols.UZ == null) return;
        qsa('tbody tr.grid-row, tbody tr', table).forEach((tr) => {
          if (isFilterChromeRow(tr)) return;
          const cells = qsa(':scope > td', tr);
          const earIdx = cols.ZNAMKA != null ? cols.ZNAMKA : cols.UZ;
          const earRaw = earIdx != null ? cellText(cells[earIdx]) : '';
          const key = this.earKey(earRaw);
          if (!key || key.length < 5) return;
          const sexRaw =
            cols.ID2 != null ? textOf(cells[cols.ID2]) : '';
          const sex = PF.scrape.classifySex(sexRaw) || '';
          const note =
            cols.POZNZVIRE != null
              ? friendlyDisplayText(cellText(cells[cols.POZNZVIRE]))
              : '';
          const mother =
            cols.MATKA != null
              ? friendlyDisplayText(cellText(cells[cols.MATKA]))
              : '';
          const datNar =
            cols.DATNAR != null
              ? dateOnlyText(cellText(cells[cols.DATNAR]))
              : '';
          const datOdch =
            cols.DATODCH != null
              ? dateOnlyText(cellText(cells[cols.DATODCH]))
              : '';
          const poznPrisun =
            cols.POZNPRISUN != null
              ? friendlyDisplayText(cellText(cells[cols.POZNPRISUN]))
              : '';
          const cb = qs(
            'td.check-column input[type="checkbox"], input[name="ids"], input[type="checkbox"]',
            tr
          );
          const registerId =
            (cb && (cb.value || cb.getAttribute('data-id') || '')) || '';
          byEar.set(key, {
            ear: friendlyDisplayText(earRaw),
            sex,
            note,
            mother,
            datNar,
            datOdch,
            poznPrisun,
            registerId: String(registerId || ''),
            tr,
            table,
            pending: this.isSheepPendingIndivRow(tr, table),
            red: !!qs('.cervene', tr),
          });
        });
      });
      return byEar;
    },

    /**
     * Pending display rows from Indiv (stav=A) only — note, sex, mother, dates.
     * finalizeSheepPendingRows() merges Zmeny change/id before the first paint.
     */
    harvestSheepPendingFromIndiv() {
      const labels = [
        'Ušní číslo',
        'Datum změny',
        'Změna',
        'Matka',
        'Poznámka',
      ];
      const animals = this.indexSheepIndivAnimals();
      const out = [];

      animals.forEach((a) => {
        if (!a.pending || a.red) return;
        const change = this.sheepIndivChangeLabel(a);
        const date = a.datOdch || a.datNar || '';
        out.push({
          id: a.registerId || '',
          registerId: a.registerId || '',
          ear: a.ear,
          sex: a.sex || '',
          cells: [
            a.ear || '',
            date,
            change,
            a.mother || '',
            a.note || '',
          ],
          labels,
        });
      });

      return this.sortSheepPendingRows(out);
    },

    /** Event label from Indiv přísun note; skip useless "Počáteční stav". */
    sheepIndivChangeLabel(a) {
      const raw = String((a && a.poznPrisun) || '')
        .replace(/;+\s*$/, '')
        .trim();
      if (!raw) return '';
      if (/^pocatecni\s*stav$/i.test(norm(raw))) return '';
      return this.lowerFirstZmena(friendlyDisplayText(raw));
    },

    /** Unify Změna column: lowercase first letter (narození, domácí porážka…). */
    lowerFirstZmena(s) {
      const t = String(s || '')
        .replace(/\s+/g, ' ')
        .trim();
      if (!t) return '';
      try {
        return t.charAt(0).toLocaleLowerCase('cs') + t.slice(1);
      } catch (_) {
        return t.charAt(0).toLowerCase() + t.slice(1);
      }
    },

    isGenericSheepChangeLabel(label) {
      const t = norm(label || '');
      return !t || /^pocatecni\s*stav$/.test(t);
    },

    /** Newest change first (latest on top, oldest at bottom). */
    parsePendingSortDate(s) {
      const m = String(s || '')
        .replace(/\u00a0/g, ' ')
        .match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/);
      if (!m) return 0;
      return Date.UTC(
        parseInt(m[3], 10),
        parseInt(m[2], 10) - 1,
        parseInt(m[1], 10)
      );
    },

    sortSheepPendingRows(rows) {
      return (rows || []).slice().sort((a, b) => {
        const db = this.parsePendingSortDate(
          (b.cells && b.cells[1]) || ''
        );
        const da = this.parsePendingSortDate(
          (a.cells && a.cells[1]) || ''
        );
        if (db !== da) return db - da;
        return this.earKey((a.cells && a.cells[0]) || a.ear || '').localeCompare(
          this.earKey((b.cells && b.cells[0]) || b.ear || '')
        );
      });
    },

    /**
     * Build pending rows once: Indiv (note/sex/mother) + Zmeny (id/change/date).
     * Call only when both sources are available so the UI never flashes empties.
     */
    finalizeSheepPendingRows(zmenyByEar) {
      let rows = [];
      try {
        rows = this.harvestSheepPendingFromIndiv() || [];
      } catch (_) {
        rows = [];
      }
      rows.forEach((r) => {
        const key = this.earKey((r.cells && r.cells[0]) || r.ear || '');
        const z = zmenyByEar && key ? zmenyByEar.get(key) : null;
        if (z) {
          if (z.id) r.id = z.id;
          if (z.change) r.cells[2] = z.change;
          if (z.date) r.cells[1] = z.date;
        }
        if (r.cells) r.cells[2] = this.lowerFirstZmena(r.cells[2]);
      });
      rows = this.mergeSheepZmenyOnlyRows(rows, zmenyByEar);
      rows.forEach((r) => {
        if (r.cells) r.cells[2] = this.lowerFirstZmena(r.cells[2]);
      });
      return this.sortSheepPendingRows(rows);
    },

    /** Zmeny ears missing from Indiv pending harvest — still show, enrich from A-list. */
    mergeSheepZmenyOnlyRows(rows, zmenyByEar) {
      if (!zmenyByEar || !zmenyByEar.size) return rows || [];
      const out = rows ? rows.slice() : [];
      const have = new Set(
        out.map((r) => this.earKey((r.cells && r.cells[0]) || r.ear || ''))
      );
      const animals = this.indexSheepIndivAnimals();
      const labels = [
        'Ušní číslo',
        'Datum změny',
        'Změna',
        'Matka',
        'Poznámka',
      ];
      zmenyByEar.forEach((z, key) => {
        if (have.has(key)) return;
        const a = animals.get(key);
        if (a && a.red) return;
        out.push({
          id: z.id || (a && a.registerId) || '',
          registerId: (a && a.registerId) || '',
          ear: (a && a.ear) || z.ear || '',
          sex: (a && a.sex) || '',
          cells: [
            (a && a.ear) || z.ear || '',
            z.date || (a && (a.datOdch || a.datNar)) || '',
            this.lowerFirstZmena(
              z.change || this.sheepIndivChangeLabel(a) || ''
            ),
            (a && a.mother) || '',
            (a && a.note) || '',
          ],
          labels,
        });
        have.add(key);
      });
      return out;
    },

    apply(parsed, rawHtml) {
      this.state.rows = parsed.rows || [];
      this.state.odeslatHref = parsed.odeslatHref || '';
      this.state.smazatHref = parsed.smazatHref || '';
      this.state.changeRowUrl = parsed.changeRowUrl || '';

      const native = qs('#pf-pending-native');
      if (native) {
        // Keep a copy of native tools for form posts if present
        native.innerHTML = '';
        try {
          const doc = new DOMParser().parseFromString(rawHtml || '', 'text/html');
          const tools = document.createElement('div');
          qsa('a, button, form', doc).forEach((el) => {
            const t = norm(textOf(el) || el.value || '');
            const href = el.getAttribute('href') || '';
            if (/odeslat|smazat/.test(t) || /Odeslat|Smazat/.test(href)) {
              tools.appendChild(el.cloneNode(true));
            }
          });
          native.appendChild(tools);
        } catch (_) {}
      }

      if (!this.state.rows.length) {
        this.showSection(false);
        this.setStatus('');
        return;
      }

      this.showSection(true);
      // Count line removed — heading + hint + table are enough
      this.setStatus('');
      this.renderTable();

      this.scrollToHashOnce();
    },

    /**
     * Smooth-scroll to #pf-pending once after paint. If the user scrolls up
     * (wheel / touch / keys), cancel so the page does not fight them.
     */
    scrollToHashOnce() {
      if (location.hash !== '#pf-pending') return;
      if (this._hashScrollDone) return;
      this._hashScrollDone = true;
      const sec = qs('#pf-pending-section');
      if (!sec) return;

      let cancelled = false;
      let touchY = null;
      let lastY = window.scrollY;
      const opts = { capture: true, passive: true };

      const cleanup = () => {
        window.removeEventListener('wheel', onWheel, opts);
        window.removeEventListener('touchstart', onTouchStart, opts);
        window.removeEventListener('touchmove', onTouchMove, opts);
        window.removeEventListener('keydown', onKey, opts);
        window.removeEventListener('scroll', onScroll, opts);
        if (this._hashScrollTimer != null) {
          try {
            clearTimeout(this._hashScrollTimer);
          } catch (_) {}
          this._hashScrollTimer = null;
        }
      };

      const cancel = () => {
        if (cancelled) return;
        cancelled = true;
        // Interrupt in-flight smooth scroll without jumping elsewhere
        try {
          window.scrollTo(window.scrollX, window.scrollY);
        } catch (_) {}
        cleanup();
      };

      const onWheel = (e) => {
        if (e.deltaY < 0) cancel();
      };
      const onTouchStart = (e) => {
        try {
          touchY = e.touches && e.touches[0] ? e.touches[0].clientY : null;
        } catch (_) {
          touchY = null;
        }
      };
      const onTouchMove = (e) => {
        try {
          const y = e.touches && e.touches[0] ? e.touches[0].clientY : null;
          if (touchY != null && y != null && y - touchY > 8) cancel();
          if (y != null) touchY = y;
        } catch (_) {}
      };
      const onKey = (e) => {
        if (
          e.key === 'ArrowUp' ||
          e.key === 'PageUp' ||
          e.key === 'Home' ||
          (e.key === ' ' && e.shiftKey)
        ) {
          cancel();
        }
      };
      const onScroll = () => {
        const y = window.scrollY;
        if (y < lastY - 1) cancel();
        else lastY = y;
      };

      window.addEventListener('wheel', onWheel, opts);
      window.addEventListener('touchstart', onTouchStart, opts);
      window.addEventListener('touchmove', onTouchMove, opts);
      window.addEventListener('keydown', onKey, opts);
      window.addEventListener('scroll', onScroll, opts);

      this._hashScrollTimer = setTimeout(() => {
        this._hashScrollTimer = null;
        if (cancelled) return;
        lastY = window.scrollY;
        try {
          sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (_) {
          try {
            sec.scrollIntoView(true);
          } catch (_) {}
        }
        // Drop listeners after the smooth scroll should have finished
        setTimeout(() => {
          if (!cancelled) cleanup();
        }, 1500);
      }, 100);
    },

    /** Ear → sex from Indiv A-list (includes založeno; herd simple table does not). */
    sheepSexByEar() {
      const map = new Map();
      try {
        this.indexSheepIndivAnimals().forEach((a, key) => {
          if (key && a.sex && !a.red) map.set(key, a.sex);
        });
      } catch (_) {}
      if (map.size) return map;
      try {
        const animals =
          (PF.sheepForms &&
            PF.sheepForms.listHerdAnimals &&
            PF.sheepForms.listHerdAnimals()) ||
          [];
        animals.forEach((a) => {
          const key = this.earKey(a.ear);
          if (key && a.sex) map.set(key, a.sex);
        });
      } catch (_) {}
      return map;
    },

    renderTable() {
      const host = qs('#pf-pending-table');
      if (!host) return;
      const rows = this.state.rows;
      if (!rows.length) {
        host.innerHTML = '';
        return;
      }
      const labels = rows[0].labels || [];
      const isSheep = String(this.state.kind || pageKind() || '').startsWith(
        'sheep'
      );
      const sexColIdx = isSheep
        ? labels.findIndex((l) => /pohlav/.test(norm(l)))
        : -1;
      const earColIdx = isSheep
        ? labels.findIndex((l) =>
            /usni|(?:^|[^a-z])znamka/.test(norm(l))
          )
        : -1;
      const sexByEar = isSheep && earColIdx >= 0 ? this.sheepSexByEar() : null;
      // Prefer sex from Indiv A-list harvest (includes založeno newborns)
      const sexFromRow = isSheep
        ? (() => {
            const m = new Map();
            rows.forEach((r) => {
              const key = this.earKey(
                (r.cells && r.cells[earColIdx >= 0 ? earColIdx : 0]) ||
                  r.ear ||
                  ''
              );
              if (key && r.sex) m.set(key, r.sex);
            });
            return m;
          })()
        : null;

      const wrap = document.createElement('div');
      wrap.className = 'pf-simple-table-wrap';
      const table = document.createElement('table');
      table.className = 'pf-simple-table';
      const thead = document.createElement('thead');
      const hr = document.createElement('tr');
      labels.forEach((l) => {
        const th = document.createElement('th');
        th.textContent = l || '';
        hr.appendChild(th);
      });
      const thAct = document.createElement('th');
      thAct.textContent = 'Akce';
      hr.appendChild(thAct);
      thead.appendChild(hr);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      rows.forEach((r, idx) => {
        const tr = document.createElement('tr');
        tr.setAttribute('data-pf-pending-idx', String(idx));

        let rowSex = r.sex || null;
        if (isSheep && !rowSex && sexColIdx >= 0 && r.cells && r.cells[sexColIdx] != null) {
          rowSex = PF.scrape.classifySex(r.cells[sexColIdx]);
        }
        if (isSheep && !rowSex) {
          const earKey = this.earKey(
            (r.cells && r.cells[earColIdx >= 0 ? earColIdx : 0]) || r.ear || ''
          );
          if (earKey) {
            rowSex =
              (sexFromRow && sexFromRow.get(earKey)) ||
              (sexByEar && sexByEar.get(earKey)) ||
              null;
          }
        }
        if (rowSex === 'male') tr.classList.add('pf-sex-male');
        else if (rowSex === 'female') tr.classList.add('pf-sex-female');

        (r.cells || []).forEach((c, ci) => {
          const td = document.createElement('td');
          const text = c == null ? '' : String(c);
          if (isSheep && ci === sexColIdx && (rowSex === 'male' || rowSex === 'female')) {
            const wrapSex = document.createElement('span');
            wrapSex.className = 'pf-sex-cell';
            const mark = document.createElement('span');
            mark.className = 'pf-sex-mark';
            mark.setAttribute('aria-hidden', 'true');
            mark.textContent = rowSex === 'male' ? '♂' : '♀';
            const txt = document.createElement('span');
            txt.textContent =
              text || (rowSex === 'male' ? 'Samec' : 'Samice');
            wrapSex.appendChild(mark);
            wrapSex.appendChild(txt);
            td.appendChild(wrapSex);
          } else {
            td.textContent = text;
          }
          tr.appendChild(td);
        });

        const tdAct = document.createElement('td');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pf-pending-cancel';
        btn.setAttribute('data-pf-pending-cancel', String(idx));
        btn.textContent = 'Zrušit';
        tdAct.appendChild(btn);
        tr.appendChild(tdAct);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      host.innerHTML = '';
      host.appendChild(wrap);

      qsa('[data-pf-pending-cancel]', host).forEach((btn) => {
        btn.addEventListener('click', () => {
          const idx = parseInt(btn.getAttribute('data-pf-pending-cancel'), 10);
          this.cancelRow(idx);
        });
      });
    },

    setRowState(ids, selected) {
      const base = this.state.changeRowUrl;
      if (!base || !ids.length) {
        return Promise.resolve();
      }
      const reqs = ids.map((id) => {
        const url =
          base +
          (base.includes('?') ? '&' : '?') +
          'rows=' +
          encodeURIComponent(id) +
          '&state=' +
          (selected ? 'true' : 'false');
        if (refresh$() && $.ajax) {
          return new Promise((resolve) => {
            $.ajax({
              url,
              method: 'GET',
              pfInternal: true,
              complete: resolve,
            });
          });
        }
        return fetch(url, { credentials: 'same-origin' }).catch(() => {});
      });
      return Promise.all(reqs);
    },

    go(href) {
      if (!href) return;
      if (/^javascript:/i.test(href)) {
        const code = href.replace(/^javascript:/i, '');
        // Prefer a live control with the same onclick — avoids eval under page CSP
        // (Firefox Tampermonkey is stricter when CSP blocks unsafe-eval).
        try {
          const normCode = code.replace(/\s+/g, ' ').trim();
          const hit = qsa(
            'a[onclick], button[onclick], input[onclick]'
          ).find((el) => {
            const oc = String(el.getAttribute('onclick') || '')
              .replace(/\s+/g, ' ')
              .trim();
            return oc && (oc === normCode || normCode.indexOf(oc) === 0);
          });
          if (hit) {
            hit.click();
            return;
          }
        } catch (_) {}
        try {
          // Page-context fallback when the control is gone from the live DOM
          // eslint-disable-next-line no-eval
          eval(code);
        } catch (_) {}
        return;
      }
      // Full navigation — don't paint toasts on this dying page
      try {
        PF.toast.beginNavigate();
      } catch (_) {}
      location.href = href;
    },

    /** Native "Smazat hlášení (událost)" control on the register/history page. */
    findSmazatHlaseniButton() {
      const btns = qsa(
        'a.toolbutton, a.tb-confirm-question, a[href*="Odstranit"], a, button'
      );
      return (
        btns.find((a) => {
          if (a.closest('#pf-app .pf-pending-panel, #pf-pig-modal, #pf-sheep-modal'))
            return false;
          const t = norm(
            textOf(a) +
              ' ' +
              (a.getAttribute('title') || '') +
              ' ' +
              (a.getAttribute('data-question') || '') +
              ' ' +
              (a.getAttribute('href') || '')
          );
          return (
            /smazat hlaseni/.test(t) ||
            (/smazat/.test(t) && /udalost|hlaseni/.test(t)) ||
            (/odstranit/i.test(a.getAttribute('href') || '') &&
              /smaze vybrane|vybrane udalosti/.test(t))
          );
        }) || null
      );
    },

    /** Stav column index inside a native grid table. */
    nativeStavColumnIndex(table) {
      if (!table) return -1;
      const headRow =
        qs('thead tr', table) ||
        qsa('tr', table).find((tr) => qs('th', tr));
      if (!headRow) return -1;
      const ths = qsa(':scope > th, :scope > td', headRow).length
        ? qsa(':scope > th, :scope > td', headRow)
        : qsa('th', headRow);
      let idx = -1;
      ths.forEach((th, i) => {
        const col = String(
          th.getAttribute('data-colname') || th.getAttribute('data-field') || ''
        ).toUpperCase();
        const label = norm(PF.registers.headerLabel(th));
        const blob = norm(label + ' ' + col);
        if (/konecn|pocatec|zvirat|zive|celkem|pocet/.test(blob)) return;
        if (
          col === 'STAV' ||
          label === 'stav' ||
          /^stav$/.test(label) ||
          (/\bstav\b/.test(blob) && blob.length <= 24)
        ) {
          idx = i;
        }
      });
      return idx;
    },

    rowCheckbox(tr) {
      return qs(
        'td.check-column input[type="checkbox"], input[name="ids"], input[type="checkbox"]',
        tr
      );
    },

    rowIdOf(tr) {
      const cb = this.rowCheckbox(tr);
      return cb
        ? String(cb.value || cb.getAttribute('data-id') || '').trim()
        : '';
    },

    rowIsKOdeslani(tr, stavIdx) {
      if (!tr) return false;
      if (stavIdx >= 0) {
        const cells = qsa(':scope > td', tr);
        const t = norm(cellText(cells[stavIdx]));
        if (/k\s*odeslani/.test(t)) return true;
      }
      return /k\s*odeslani/.test(norm(textOf(tr)));
    },

    /** Live native grid rows for pending delete (register / history tables). */
    findNativePendingGridRows() {
      const out = [];
      qsa(
        '#main table.grid-table, #main table.dataTable, #pf-host table.grid-table, #pf-host table.dataTable, table.grid-table, table.dataTable'
      ).forEach((table) => {
        if (table.closest('#pf-pending-section, #pf-pending-table, .pf-modal'))
          return;
        if (table.closest('.popup, .popup-filter, .ui-dialog')) return;
        const stavIdx = this.nativeStavColumnIndex(table);
        qsa('tbody tr.grid-row, tbody tr', table).forEach((tr) => {
          if (isFilterChromeRow(tr)) return;
          if (!this.rowCheckbox(tr)) return;
          out.push({ tr, table, stavIdx });
        });
      });
      return out;
    },

    /**
     * Select native checkboxes for pending cancel.
     * @param {string[]|null} ids  specific row ids, or null = all "K odeslání"
     */
    selectNativePendingRows(ids) {
      const wantIds = ids && ids.length ? new Set(ids.map(String)) : null;
      const all = this.findNativePendingGridRows();
      let selected = 0;
      const tables = new Set();

      // Deselect everything in involved tables first
      all.forEach(({ tr, table }) => {
        tables.add(table);
      });
      tables.forEach((table) => {
        qsa('tbody tr.grid-row, tbody tr', table).forEach((tr) => {
          if (isFilterChromeRow(tr)) return;
          PF.registers.syncNativeRowSelect(tr, false);
        });
      });

      all.forEach(({ tr, stavIdx }) => {
        const id = this.rowIdOf(tr);
        const isK = this.rowIsKOdeslani(tr, stavIdx);
        let pick = false;
        if (wantIds) {
          pick = id && wantIds.has(id);
          // Fallback: still require K odeslání when id matched elsewhere poorly
          if (pick && stavIdx >= 0 && !isK) {
            // id match wins even if stav column text differs
            pick = true;
          }
        } else {
          pick = isK;
        }
        if (!pick) return;
        PF.registers.syncNativeRowSelect(tr, true);
        if (this.rowCheckbox(tr) && this.rowCheckbox(tr).checked) selected += 1;
        else {
          // Force-check if portal click didn't stick
          const cb = this.rowCheckbox(tr);
          if (cb) {
            cb.checked = true;
            try {
              if (refresh$()) $(cb).trigger('change');
              else cb.dispatchEvent(new Event('change', { bubbles: true }));
            } catch (_) {}
            selected += 1;
          }
        }
      });

      return { selected, total: all.length, tables: tables.size };
    },

    /** Portal jQuery UI "Dotaz" after Smazat — click Ano. */
    findPortalConfirmAno() {
      const dialogs = qsa('.ui-dialog').filter((d) => {
        const st = window.getComputedStyle(d);
        if (st.display === 'none' || st.visibility === 'hidden') return false;
        const body =
          qs('.confirmation-dialog, .ui-dialog-content', d) || d;
        const t = norm(textOf(body) + ' ' + textOf(qs('.ui-dialog-title', d)));
        return (
          /opravdu chcete smazat|smazat vybrane|dotaz/.test(t) ||
          (!!qs('.confirmation-dialog', d) && /smazat|vybrane/.test(t))
        );
      });
      const dlg = dialogs[dialogs.length - 1];
      if (!dlg) return null;
      const btns = qsa(
        '.ui-dialog-buttonpane button, .ui-dialog-buttonset button',
        dlg
      );
      return (
        btns.find((b) => {
          const t = norm(textOf(b) || b.value || '');
          return t === 'ano' || /^ano\b/.test(t);
        }) || null
      );
    },

    async confirmPortalDeleteDialog() {
      const waitFor =
        (PF.pigForms && PF.pigForms.waitFor.bind(PF.pigForms)) ||
        ((check, { timeout = 8000, interval = 100 } = {}) =>
          new Promise((resolve, reject) => {
            const t0 = Date.now();
            const tick = () => {
              let v = null;
              try {
                v = check();
              } catch (_) {}
              if (v) return resolve(v);
              if (Date.now() - t0 > timeout)
                return reject(new Error('Vypršel čas: potvrzení smazání'));
              setTimeout(tick, interval);
            };
            tick();
          }));

      const ano = await waitFor(() => this.findPortalConfirmAno(), {
        timeout: 8000,
        interval: 100,
        label: 'potvrzení smazání (Ano)',
      });
      try {
        ano.click();
      } catch (_) {
        try {
          if (refresh$()) $(ano).trigger('click');
        } catch (__) {}
      }
      // Brief pause so portal can start the delete request
      await new Promise((r) => setTimeout(r, 300));
      return true;
    },

    async runNativeSmazat(ids, opts) {
      const allowFallback = !opts || opts.allowKOdeslaniFallback !== false;
      let result = this.selectNativePendingRows(ids && ids.length ? ids : null);
      // Pending ids may come from Zmeny grid while Odstranit acts on the register
      // grid — fall back to selecting every "K odeslání" row when allowed.
      if (!result.selected && allowFallback && ids && ids.length) {
        result = this.selectNativePendingRows(null);
      }
      if (!result.selected) {
        throw new Error(
          'V portálové tabulce se nepodařilo vybrat řádky „K odeslání“.' +
            (ids && ids.length ? ' (id: ' + ids.join(', ') + ')' : '')
        );
      }

      // Let ChangeRowState AJAX settle after checkbox clicks
      await new Promise((r) => setTimeout(r, 450));

      const btn = this.findSmazatHlaseniButton();
      if (!btn) {
        throw new Error(
          'Tlačítko „Smazat hlášení (událost)“ nebylo v portálu nalezeno.'
        );
      }
      try {
        btn.click();
      } catch (_) {
        try {
          if (refresh$()) $(btn).trigger('click');
        } catch (__) {}
      }

      // Native toolbutton opens jQuery UI "Dotaz" — confirm with Ano
      try {
        await this.confirmPortalDeleteDialog();
      } catch (ex) {
        throw new Error(
          'Po kliknutí na Smazat se nepodařilo potvrdit dialog (Ano). ' +
            (ex && ex.message ? ex.message : '')
        );
      }

      this.setStatus('');
      // Refresh pending list after portal finishes
      setTimeout(() => {
        try {
          this._loadedKind = null;
          this.refresh(this.state.kind || pageKind(), { force: true });
        } catch (_) {}
      }, 1200);

      return { selected: result.selected };
    },

    async confirmAll() {
      if (!this.state.rows.length) return;
      const n = this.state.rows.length;
      const ok = await PF.confirmDialog({
        title: 'Odeslat změny',
        message:
          'Opravdu odeslat ' + CZ.allChangesPhrase(n) + ' do ústřední evidence?',
        detail: 'Po odeslání už změny nepůjde v tomto seznamu upravit.',
        confirmLabel: 'Odeslat',
        cancelLabel: 'Zpět',
      });
      if (!ok) return;
      // Stale herd count / Poslední změna would stick after ÚE accepts the batch
      PF.registers.invalidateHerdCaches(this.state.kind || pageKind());
      const ids = this.state.rows.map((r) => r.id).filter(Boolean);
      try {
        await this.setRowState(ids, true);
      } catch (_) {}
      if (this.state.odeslatHref) {
        const n = this.state.rows.length;
        PF.toast.announce(
          'Odesílám ' + CZ.allChangesPhrase(n) + ' do ústřední evidence…',
          'info'
        );
        this.go(this.state.odeslatHref);
      } else PF.toast.error('Tlačítko Odeslat nebylo v portálu nalezeno.');
    },

    async cancelRow(idx) {
      const row = this.state.rows[idx];
      if (!row) return;
      const ok = await PF.confirmDialog({
        title: 'Zrušit změnu',
        message: 'Opravdu zrušit tuto neodeslanou změnu?',
        detail: 'Záznam se smaže z portálu a nebude odeslán do ústřední evidence.',
        confirmLabel: 'Zrušit změnu',
        cancelLabel: 'Nechat',
        danger: true,
      });
      if (!ok) return;
      const isSheep = String(this.state.kind || pageKind() || '').startsWith(
        'sheep'
      );
      const doneMsg =
        'Neodeslaná změna byla zrušena a neodejde do evidence.';
      try {
        // Sheep: cancel via Zmeny (register row ids ≠ change ids)
        if (isSheep && this.state.smazatHref && row.id) {
          try {
            await this.setRowState([row.id], true);
          } catch (_) {}
          PF.toast.announce(doneMsg, 'success');
          this.go(this.state.smazatHref);
          return;
        }
        const ids = row.id ? [row.id] : null;
        try {
          await this.runNativeSmazat(ids && ids.length ? ids : null, {
            allowKOdeslaniFallback: false,
          });
          PF.toast.announce(doneMsg, 'success');
          // Portal may reload; if not, show after pending refresh settles
          setTimeout(() => {
            try {
              PF.toast.flush();
            } catch (_) {}
          }, 1400);
        } catch (ex) {
          // If this is the only pending row, select the sole "K odeslání" line
          if (this.state.rows.length === 1) {
            await this.runNativeSmazat(null);
            PF.toast.announce(doneMsg, 'success');
            setTimeout(() => {
              try {
                PF.toast.flush();
              } catch (_) {}
            }, 1400);
          } else {
            throw ex;
          }
        }
      } catch (ex) {
        this.setStatus('');
        PF.toast.error(
          'Zrušení se nepodařilo: ' +
            (ex && ex.message ? ex.message : String(ex))
        );
      }
    },

    async cancelAll() {
      if (!this.state.rows.length) return;
      const n = this.state.rows.length;
      const ok = await PF.confirmDialog({
        title: 'Zrušit všechny změny',
        message: 'Opravdu zrušit ' + CZ.allChangesPhrase(n) + '?',
        detail:
          'Všechny vybrané neodeslané záznamy se smažou a nebudou odeslány do ústřední evidence.',
        confirmLabel: 'Zrušit vše',
        cancelLabel: 'Nechat',
        danger: true,
      });
      if (!ok) return;
      const isSheep = String(this.state.kind || pageKind() || '').startsWith(
        'sheep'
      );
      const doneMsg =
        'Všechny neodeslané změny byly zrušeny a neodejdou do evidence.';
      try {
        if (isSheep && this.state.smazatHref) {
          const ids = this.state.rows.map((r) => r.id).filter(Boolean);
          try {
            await this.setRowState(ids, true);
          } catch (_) {}
          PF.toast.announce(doneMsg, 'success');
          this.go(this.state.smazatHref);
          return;
        }
        // All "K odeslání" rows (ids from Zmeny may not match register grid)
        await this.runNativeSmazat(null, { allowKOdeslaniFallback: true });
        PF.toast.announce(doneMsg, 'success');
        setTimeout(() => {
          try {
            PF.toast.flush();
          } catch (_) {}
        }, 1400);
      } catch (ex) {
        this.setStatus('');
        PF.toast.error(
          'Zrušení se nepodařilo: ' +
            (ex && ex.message ? ex.message : String(ex))
        );
      }
    },
  };

  /* ------------------------------------------------------------------ */
  /* Register filters                                                   */
  /* ------------------------------------------------------------------ */
  PF.registers = {
    moveContentToHost() {
      const host = qs('#pf-host');
      if (!host) return;

      // Prefer tabs-content (register body)
      const tabsContent = qs('#main > .tabs-content, #main .tabs-content');
      if (
        tabsContent &&
        !host.contains(tabsContent) &&
        !tabsContent.closest('#pf-app')
      ) {
        try {
          if (
            !(
              PF.pending &&
              PF.pending.isPortalErrorHtml &&
              PF.pending.isPortalErrorHtml(
                tabsContent.innerHTML || textOf(tabsContent)
              )
            )
          ) {
            host.appendChild(tabsContent);
          }
        } catch (_) {
          host.appendChild(tabsContent);
        }
      }

      // Mark native action sources for the toolbar (do not move these nodes)
      qsa(
        '#main a, #main button, #main input[type=button], #main span[onclick]'
      ).forEach((el) => {
        if (el.closest('#pf-app')) return;
        const oc = el.getAttribute('onclick') || '';
        const href = el.getAttribute('href') || '';
        const title = el.getAttribute('title') || '';
        const txt = textOf(el);
        const blob = oc + ' ' + href + ' ' + title + ' ' + txt;
        if (
          /otevritDialogZmeny|zobrazitDialogSRSkup|DialogPorizeni|DialogSRSkup/i.test(
            blob
          ) ||
          /narozen|nákup|nakup|přísun|prisun|prodej|odsun|poráž|poraz|zcizen|odeslat/i.test(
            blob
          )
        ) {
          el.classList.add('pf-native-action-src');
        }
      });

      // Move stray register grids that sit as #main siblings (outside tabs-content).
      // Do NOT move bare <form> / large shells — that can swallow the page.
      // Do NOT move portal 404 / error documents into the register host.
      qsa('#main > *').forEach((ch) => {
        if (ch.id === 'pf-app' || ch.id === 'messages-box') return;
        if (ch.classList && ch.classList.contains('ui-dialog')) return;
        if (host.contains(ch) || ch.closest('#pf-app')) return;
        if (ch.matches && ch.matches('form') && !ch.classList.contains('grid'))
          return;
        try {
          if (
            PF.pending &&
            PF.pending.isPortalErrorHtml &&
            PF.pending.isPortalErrorHtml(ch.innerHTML || textOf(ch))
          ) {
            return;
          }
        } catch (_) {}
        const hasGrid = !!qs(
          'table.grid-table, table.dataTable, .grid, .dataTables_wrapper',
          ch
        );
        const isGridRoot =
          ch.matches &&
          ch.matches(
            '.tabs-content, .grid, .grid-full-width, .dataTables_wrapper'
          );
        if (hasGrid || isGridRoot) host.appendChild(ch);
      });

      // Last resort: if host is still empty, move remaining main children
      if (!host.children.length) {
        qsa('#main > *').forEach((ch) => {
          if (ch.id === 'pf-app' || ch.id === 'messages-box') return;
          if (ch.classList && ch.classList.contains('ui-dialog')) return;
          try {
            if (
              PF.pending &&
              PF.pending.isPortalErrorHtml &&
              PF.pending.isPortalErrorHtml(ch.innerHTML || textOf(ch))
            ) {
              return;
            }
          } catch (_) {}
          host.appendChild(ch);
        });
      }
    },

    buildToolbar(kind) {
      const toolbar = qs('#pf-toolbar');
      if (!toolbar) return;
      toolbar.innerHTML = '';

      const actionsBlock = qs('#pf-actions-block');
      if (kind.includes('history')) {
        if (actionsBlock) actionsBlock.style.display = 'none';
        return;
      }
      if (actionsBlock) actionsBlock.style.display = '';

      const allow =
        kind === 'sheep'
          ? PF.config.sheepActions
          : kind === 'pig'
            ? PF.config.pigActions
            : kind.includes('send')
              ? []
              : [];

      const sources = qsa(
        [
          '.pf-native-action-src',
          '#main a[onclick]',
          '#pf-host a[onclick]',
          '#pf-host .toolbutton',
          '#main .toolbutton',
          '#main a[title]',
          '#pf-host a[title]',
          '#main button[onclick]',
          '#main input.toolbutton',
          '#main .menu-board a',
          '#main [class*="action"] a',
        ].join(', ')
      );
      const used = new Set();
      const matchedTyps = new Set();

      sources.forEach((el) => {
        if (el.closest('#pf-toolbar')) return;
        const label = textOf(el) || el.getAttribute('title') || '';
        const oc = el.getAttribute('onclick') || '';
        const href = el.getAttribute('href') || '';
        const blob = norm(
          label + ' ' + oc + ' ' + href + ' ' + (el.getAttribute('title') || '')
        );

        // Send button on zmeny pages – always keep
        if (
          kind.includes('send') &&
          /odeslat|potvrd|odeslání|odeslani/.test(blob)
        ) {
          const btn = this.proxyButton(el, label || 'Odeslat');
          toolbar.appendChild(btn);
          used.add(el);
          return;
        }

        if (!allow.length) return;

        const match = allow.find((a) => {
          if (a.typ && new RegExp(a.typ, 'i').test(oc + href)) return true;
          if (a.code && (blob.includes('(' + a.code + ')') || blob.includes(' ' + a.code + ' ')))
            return true;
          return (a.labels || []).some((l) => blob.includes(norm(l)));
        });

        if (match) {
          // Pig actions use custom PF dialogs — don't proxy the unified native opener
          if (kind === 'pig') {
            el.classList.add('pf-action-hide');
            used.add(el);
            return;
          }
          if (match.typ && matchedTyps.has(match.typ)) {
            el.classList.add('pf-action-hide');
            return;
          }
          if (match.typ) matchedTyps.add(match.typ);
          const btn = this.proxyButton(el, this.prettyLabel(match, label));
          if (match.typ) btn.dataset.pfSheep = match.typ;
          if (match.needsSelection) {
            btn.dataset.pfNeedsSelection = '1';
            btn.dataset.pfWarn = 'Nejdříve vyberte alespoň jednu ovci.';
          }
          toolbar.appendChild(btn);
          used.add(el);
          el.classList.add('pf-action-hide');
        } else if (
          /otevritDialogZmeny|zobrazitDialogSRSkup|DialogPorizeni|typZmeny=/i.test(
            oc + href
          )
        ) {
          el.classList.add('pf-action-hide');
        }
      });

      // Also scan select options for pig event types – expose as buttons that set select + open dialog
      if (kind === 'pig') {
        this.ensurePigActionButtons(toolbar, allow, matchedTyps);
      }

      if (kind === 'sheep') {
        this.ensureSheepActionButtons(toolbar, allow, matchedTyps);
        this.orderSheepToolbar(toolbar, allow);
        this.applySheepActionSelectionGuards(toolbar, allow);
        this.updateSheepActionAvailability();
      }

      if (kind.includes('send')) {
        // Promote any remaining Odeslat in host
        qsa('#pf-host .toolbutton, #pf-host a, #pf-host button, #pf-host input[type=submit]').forEach(
          (el) => {
            if (used.has(el)) return;
            const t = norm(textOf(el) || el.value || '');
            if (/odeslat|potvrdit/.test(t)) {
              toolbar.appendChild(this.proxyButton(el, textOf(el) || el.value || 'Odeslat'));
            }
          }
        );
      }

      if (!toolbar.children.length && (kind === 'sheep' || kind === 'pig')) {
        toolbar.innerHTML =
          '<span class="pf-empty" style="padding:0">Akční tlačítka se načtou z registru… Pokud ne, otevřete akci v původním UI.</span>';
      }
    },

    prettyLabel(match, fallback) {
      const map = {
        Narozeni: 'Narození',
        NakupPrisun: 'Nákup / přísun',
        ProdejOdsun: 'Prodej / odsun',
        DomaciPorazka: 'Domácí porážka',
        Zcizeni: 'Zcizení',
      };
      if (match.typ && map[match.typ]) return map[match.typ];
      const cleaned = stripEventCodes(fallback || '');
      if (cleaned && cleaned.length > 1 && cleaned !== '.') return cleaned;
      return (match.labels && match.labels[0]) || 'Akce';
    },

    proxyButton(srcEl, label) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pf-action-btn';
      btn.textContent = label;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (btn.classList.contains('is-disabled') || btn.getAttribute('aria-disabled') === 'true') {
          e.stopPropagation();
          if (btn.dataset.pfWarn) PF.toast.info(btn.dataset.pfWarn);
          return;
        }
        // Sheep: never click native otevritDialogZmeny — it calls .dialog('close')
        // on an uninitialized widget under the simplified UI.
        const sheepTyp = btn.dataset.pfSheep || '';
        if (sheepTyp) {
          try {
            PF.registers.openSheepDialog(sheepTyp);
          } catch (err) {
            PF.toast.error(
              'Akci se nepodařilo otevřít: ' +
                (err && err.message ? err.message : err)
            );
          }
          return;
        }
        // Prefer native click to preserve handlers
        try {
          srcEl.click();
        } catch (_) {
          if (srcEl.href && !/^javascript:/i.test(srcEl.href)) {
            location.href = srcEl.href;
          }
        }
      });
      return btn;
    },

    sheepDialogUrl(typ) {
      const idSR =
        getParam('idStajovyRegistr') ||
        (location.search.match(/idStajovyRegistr=([a-f0-9]{32})/i) || [])[1] ||
        '';
      // DialogPorizeni expects a plain staj GUID (or all-zeros). Never pass
      // #stajVyberId / VybranaStajIdKombinace — those are provozna_staj combos
      // and make the portal AJAX return the "Vyskytla se chyba!" alert.
      let idStaj =
        getParam('idStaj') ||
        '00000000000000000000000000000000';
      if (!/^[a-f0-9]{32}$/i.test(idStaj)) {
        idStaj = '00000000000000000000000000000000';
      }
      if (!idSR) throw new Error('Chybí id stájového registru.');
      return (
        '/ssl/app/izr2far/StajoveRegistry/StajovyRegistrIndiv/DialogPorizeni?typZmeny=' +
        encodeURIComponent(typ) +
        '&stajovyRegistrId=' +
        encodeURIComponent(idSR) +
        '&stajId=' +
        encodeURIComponent(idStaj)
      );
    },

    resetDialogHost() {
      if (!refresh$()) return;
      try {
        const $d = $('#dialogDiv');
        if (!$d.length) return;
        try {
          if ($d.data('ui-dialog')) $d.dialog('destroy');
        } catch (_) {}
        $d.remove();
      } catch (_) {}
    },

    openSheepDialog(typ) {
      if (!typ) throw new Error('Chybí typ akce.');
      // Custom farmer forms (same idea as pigs) → fill native DialogPorizeni
      if (PF.sheepForms && typeof PF.sheepForms.openByTyp === 'function') {
        if (PF.sheepForms.openByTyp(typ)) return;
      }
      const url = this.sheepDialogUrl(typ);
      const title = this.prettyLabel({ typ }, typ);
      PF.dialogs.ensureSafeDialogApi();
      this.resetDialogHost();
      if (typeof window.ShowModalWithMaxWidthStretch === 'function') {
        window.ShowModalWithMaxWidthStretch(url, title, '95%');
        return;
      }
      if (typeof window.ShowModal === 'function') {
        window.ShowModal(url, title, '95%');
        return;
      }
      if (typeof window.ShowModalInner === 'function') {
        window.ShowModalInner(url, title, '95%');
        return;
      }
      window.open(url, '_blank');
    },

    sheepSelectedCount() {
      return qsa('#pf-host .pf-simple-table tbody .pf-row-check:checked').length;
    },

    applySheepActionSelectionGuards(toolbar, allow) {
      const byTyp = new Map((allow || []).map((a) => [a.typ, a]));
      qsa('.pf-action-btn', toolbar || document).forEach((btn) => {
        const typ = btn.dataset.pfSheep || '';
        const conf = byTyp.get(typ);
        if (conf && conf.needsSelection) {
          btn.dataset.pfNeedsSelection = '1';
          btn.dataset.pfWarn =
            btn.dataset.pfWarn || 'Nejdříve vyberte alespoň jednu ovci.';
        }
      });
    },

    updateSheepActionAvailability() {
      const toolbar = qs('#pf-toolbar');
      if (!toolbar) return;
      const hasSel = this.sheepSelectedCount() > 0;
      qsa('.pf-action-btn[data-pf-needs-selection="1"]', toolbar).forEach(
        (btn) => {
          btn.classList.toggle('is-disabled', !hasSel);
          btn.setAttribute('aria-disabled', hasSel ? 'false' : 'true');
          if (!hasSel) {
            btn.dataset.pfWarn =
              btn.dataset.pfWarn || 'Nejdříve vyberte alespoň jednu ovci.';
          }
        }
      );
    },

    ensurePigActionButtons(toolbar, allow, matchedTyps) {
      allow.forEach((a) => {
        if (!a.typ) return;
        if (toolbar.querySelector('[data-pf-pig="' + a.typ + '"]')) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pf-action-btn';
        b.dataset.pfPig = a.typ;
        b.textContent = this.prettyLabel(a, '');
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          try {
            if (a.typ === 'NakupPrisun') PF.pigForms.openBuy();
            else if (a.typ === 'DomaciPorazka') PF.pigForms.openKill();
          } catch (err) {
            PF.toast.error(
              'Akci se nepodařilo otevřít: ' +
                (err && err.message ? err.message : err)
            );
          }
        });
        toolbar.appendChild(b);
        if (matchedTyps) matchedTyps.add(a.typ);
      });
    },

    orderSheepToolbar(toolbar, allow) {
      if (!toolbar) return;
      const priority = (allow || []).map((a) => a.typ).filter(Boolean);
      const buttons = qsa('.pf-action-btn', toolbar);
      if (!buttons.length) return;
      const rank = (btn) => {
        const typ = btn.dataset.pfSheep || '';
        const i = priority.indexOf(typ);
        return i === -1 ? 1000 : i;
      };
      buttons
        .slice()
        .sort((a, b) => rank(a) - rank(b))
        .forEach((btn) => toolbar.appendChild(btn));
    },

    configureSheepActionButton(btn, action) {
      if (!btn || !action) return btn;
      if (action.typ) btn.dataset.pfSheep = action.typ;
      if (action.needsSelection) {
        btn.dataset.pfNeedsSelection = '1';
        btn.dataset.pfWarn = 'Nejdříve vyberte alespoň jednu ovci.';
        btn.classList.add('is-disabled');
        btn.setAttribute('aria-disabled', 'true');
      }
      return btn;
    },

    ensureSheepActionButtons(toolbar, allow, matchedTyps) {
      // If some actions missing from DOM proxies, open DialogPorizeni ourselves
      const missing = allow.filter((a) => a.typ && !matchedTyps.has(a.typ));
      if (!missing.length) return;

      missing.forEach((a) => {
        if (toolbar.querySelector('[data-pf-sheep="' + a.typ + '"]')) return;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pf-action-btn';
        b.textContent = this.prettyLabel(a, '');
        this.configureSheepActionButton(b, a);
        b.addEventListener('click', (e) => {
          e.preventDefault();
          if (
            b.classList.contains('is-disabled') ||
            b.getAttribute('aria-disabled') === 'true'
          ) {
            e.stopPropagation();
            if (b.dataset.pfWarn) PF.toast.info(b.dataset.pfWarn);
            return;
          }
          try {
            PF.registers.openSheepDialog(a.typ);
          } catch (err) {
            PF.toast.error(
              'Akci se nepodařilo otevřít: ' +
                (err && err.message ? err.message : err)
            );
          }
        });
        toolbar.appendChild(b);
      });
    },

    filterColumns(kind) {
      // Kept for refresh() compatibility — real work is in simplifyTables
      this.simplifyTables(kind);
    },

    headerLabel(th) {
      const col = th.getAttribute('data-colname') || '';
      const titled = th.querySelector(
        'span.a, .popup-filter h4, .sorting-title, .popup-body h4'
      );
      if (titled) {
        const t = textOf(titled);
        if (t && t.length < 80 && t !== '.') return t;
      }
      // Prefer title attribute on th / sort link
      const titleAttr =
        th.getAttribute('title') ||
        (th.querySelector('[title]') &&
          th.querySelector('[title]').getAttribute('title')) ||
        '';
      if (titleAttr && titleAttr.length < 80) return titleAttr;

      const clone = th.cloneNode(true);
      qsa(
        '.popup, select, input, table, button, .fas, .far, .fa, img',
        clone
      ).forEach((n) => n.remove());
      let t = textOf(clone);
      if (t && t !== '.') return t;

      // Fall back to known field codes
      const codeMap = {
        USNIZNAMKA: 'Ušní číslo',
        USNIZNAMKA2: 'Ušní číslo',
        ZNAMKA: 'Ušní číslo',
        POHLAVI: 'Pohlaví',
        ID2: 'Pohlaví',
        MATKA: 'Matka',
        DATUMNAROZENI: 'Datum narození',
        DATUM_NAROZENI: 'Datum narození',
        DATNAR: 'Datum narození',
        POZNZVIRE: 'Poznámka',
        DATUMPRICHODU: 'Datum přidání',
        DATUM_PRICHODU: 'Datum přidání',
        DATPRICH: 'Datum přidání',
        DATPRICHODU: 'Datum přidání',
        PRICHOD: 'Datum přidání',
        DATUMPRIDANI: 'Datum přidání',
        DATUMZMENY: 'Datum změny',
        DATUM_ZMENY: 'Datum změny',
        DATZMENY: 'Datum změny',
        STAV: 'Stav',
      };
      const up = String(col).toUpperCase();
      for (const [k, label] of Object.entries(codeMap)) {
        if (up.includes(k)) return label;
      }
      return col || '';
    },

    displayHeaderLabel(kind, label) {
      const t = norm(label);
      // Short birth-date headers → full label
      if (
        t === 'dat. nar.' ||
        t === 'dat. nar' ||
        t === 'dat nar.' ||
        t === 'dat nar' ||
        t === 'dat.nar.' ||
        t === 'dat.nar' ||
        t === 'dn' ||
        t === 'datum nar.' ||
        t === 'datum nar'
      ) {
        return 'Datum narození';
      }
      // Arrival / add-to-register date → Datum přidání
      if (
        /dat\.?\s*prich/.test(t) ||
        /datum\s*prich/.test(t) ||
        t === 'prichod' ||
        t === 'prich.' ||
        /datumprich|datprich|prichod/.test(t.replace(/\s/g, ''))
      ) {
        return 'Datum přidání';
      }
      if (
        (kind.includes('history') || kind.includes('send')) &&
        (t === 'datum' || t === 'dat.')
      ) {
        return 'Datum změny';
      }
      // Pending "Neodeslané změny": "Datum a čas založení" → Datum přidání
      if (
        kind === 'pig-send' &&
        (/datum\s*a\s*cas\s*zalozen|datum.*zalozen|cas\s*zalozen/.test(t) ||
          t === 'zalozeni' ||
          /datzalozen|datumzalozeni|datumcaszalozeni|caszalozeni/.test(t))
      ) {
        return 'Datum přidání';
      }
      // Pigs history: "Datum a čas založení" → Datum nahlášení
      if (
        kind === 'pig-history' &&
        (/datum\s*a\s*cas\s*zalozen|datum.*zalozen|cas\s*zalozen/.test(t) ||
          t === 'zalozeni' ||
          /datzalozen|datumzalozeni|datumcaszalozeni|caszalozeni/.test(t))
      ) {
        return 'Datum nahlášení';
      }
      // Pending sheep: "Datum odeslání" → Datum přidání
      if (
        kind === 'sheep-send' &&
        (/datum\s*(a\s*cas\s*)?odeslan/.test(t) ||
          t === 'odeslani' ||
          /datumodeslan|casodeslan|datodeslan/.test(t.replace(/\s/g, '')))
      ) {
        return 'Datum přidání';
      }
      // Sheep history: "Datum odeslání" → Datum nahlášení
      if (
        kind === 'sheep-history' &&
        (/datum\s*(a\s*cas\s*)?odeslan/.test(t) ||
          t === 'odeslani' ||
          /datumodeslan|casodeslan|datodeslan/.test(t.replace(/\s/g, '')))
      ) {
        return 'Datum nahlášení';
      }
      // Sheep register / pending / history: animal note column
      if (
        (kind === 'sheep' ||
          kind === 'sheep-send' ||
          kind === 'sheep-history') &&
        (/poznamka\s*zvire|poznzvire/.test(t) || t === 'poznamka')
      ) {
        return 'Poznámka';
      }
      // Sheep register only: ID2 was pohlaví on Indiv herd grid (not on Zmeny)
      if (kind === 'sheep' && (/^pohlav/.test(t) || t === 'id2')) {
        return 'Pohlaví';
      }
      // Sheep pending (Zmeny): ID1 = change type
      if (kind === 'sheep-send' && (t === 'id1' || /^zmena$/.test(t))) {
        return 'Změna';
      }
      return label || '';
    },

    shouldKeepColumn(kind, label, th) {
      const t = norm(label);
      const col = norm(
        (th && (th.getAttribute('data-colname') || th.getAttribute('data-field') || '')) ||
          ''
      );
      const blob = t + ' ' + col;

      // Sheep pending: never show Stav / Stav přísun / ID3
      if (
        kind === 'sheep-send' &&
        (col === 'stav' ||
          col === 'id3' ||
          /^stav(\s+prisun)?$/.test(t) ||
          /^stav(\s+prisun)?$/.test(blob))
      ) {
        return false;
      }

      // Sheep pending: never "Poznámka přísun" (only animal note POZNZVIRE / POZNAMKA)
      if (
        kind === 'sheep-send' &&
        (/poznprisun|poznamka\s*prisun/.test(blob) ||
          (/poznamka|pozn/.test(blob) && /prisun/.test(blob)))
      ) {
        return false;
      }

      // Sheep pending from Zmeny: UZ, DATUM, ID1 (Změna), MATKA, POZNAMKA
      // ID2 on this grid is Provozovna/země — never keep as sex
      if (kind === 'sheep-send') {
        if (col === 'id2' || /provozovn|zeme/.test(blob)) return false;
        if (
          col === 'uz' ||
          col === 'datum' ||
          col === 'id1' ||
          col === 'matka' ||
          col === 'poznamka' ||
          /usni|(?:^|[^a-z])znamka|matka|^zmena$|\bid1\b|naroz|dat\.?\s*nar|datnar|poznzvire|poznamka\s*zvire|^poznamka$|^datum$/.test(
            blob
          )
        ) {
          return true;
        }
      }

      // Pending changes: drop "Datum přidání" (založení / odeslání timestamp)
      if (
        kind.includes('send') &&
        (this.displayHeaderLabel(kind, label || '') === 'Datum přidání' ||
          /datum\s*a\s*cas\s*zalozen|cas\s*zalozen|datzalozen|datumzalozeni|datumcaszalozeni|caszalozeni/.test(
            blob
          ) ||
          /datum\s*(a\s*cas\s*)?odeslan|datumodeslan|casodeslan|datodeslan/.test(
            blob
          ))
      ) {
        return false;
      }

      // Never keep site/stable/sow columns
      if (/\bprovozovn|\bstaj\b|\bstaje\b|hlasici/.test(blob)) return false;
      // Pig history: noise columns
      if (
        kind.startsWith('pig') &&
        (/typ\s*hlaseni|typhlaseni/.test(blob) ||
          /^akce$/.test(t) ||
          /\bakce\b/.test(t) ||
          /datum\s*aktualiz|dataktual|aktualizace/.test(blob))
      )
        return false;
      // Pig history / pending: drop Konečný stav (keep plain Stav); still scraped for headcount
      if (
        (kind === 'pig-history' || kind === 'pig-send') &&
        (col === 'konecnystav' ||
          /konecnystav|konecny_stav|stavkonecn/.test(blob.replace(/\s/g, '')) ||
          (/konecn/.test(blob) && /stav/.test(blob) && !/pocatec/.test(blob)))
      ) {
        return false;
      }
      // Pig female/sow columns only matter on pig pages
      if (kind.startsWith('pig') && (this.isExcludedColumn(label) || this.isExcludedColumn(col)))
        return false;

      // Sheep history/send: hide creation date (keep change date only)
      if (
        (kind === 'sheep-history' || kind === 'sheep-send') &&
        /zalozen/.test(blob)
      ) {
        return false;
      }

      // Sheep history: no Matka (pending still keeps it)
      if (kind === 'sheep-history' && /matka/.test(blob)) {
        return false;
      }

      if (kind === 'sheep' || (kind.startsWith('sheep') && !kind.includes('history') && !kind.includes('send'))) {
        // Never keep "Poznámka přísun" — only the animal note (POZNZVIRE)
        if (
          /poznprisun|poznamka\s*prisun/.test(blob) ||
          (/poznamka|pozn/.test(blob) && /prisun/.test(blob))
        ) {
          return false;
        }
        // Ear, sex, mother, birth, arrival, animal note — match short headers too
        if (/usni|pohlav|matka/.test(blob)) return true;
        if (/naroz|dat\.?\s*nar|\bdn\b|birth|datumzar|datumnar/.test(blob))
          return true;
        if (/datum/.test(blob) && /nar/.test(blob)) return true;
        if (/prich|pridan|dat\.?\s*prich|datumprich/.test(blob)) return true;
        // Poznámka zvíře (POZNZVIRE)
        if (/poznzvire|poznamka\s*zvire/.test(blob)) return true;
        if (
          (/^poznamka$/.test(t) || t === 'pozn') &&
          !/prisun|odsun|prich|partner|transport/.test(blob)
        )
          return true;
      }

      const keep = this.keepListFor(kind);
      if (!keep) return true;
      if (keep.some((k) => blob.includes(norm(k)))) return true;

      if (
        (kind.includes('history') || kind.includes('send')) &&
        /zmena|udalost|operac|nakup|prisun|poraz|prodej|odsun|zcizen/.test(
          blob
        )
      ) {
        return true;
      }
      // Pig register-grid history: event type column (not "Typ hlášení" / "Akce")
      if (
        kind === 'pig-history' &&
        /typ|udalost|operac|druh/.test(blob) &&
        !/hlaseni|akce|aktualiz/.test(blob)
      ) {
        return true;
      }

      if (
        kind.startsWith('pig') &&
        !kind.includes('history') &&
        !kind.includes('send') &&
        (/ks|celkem|stav|platn/.test(blob) || /^\d+$/.test(t))
      ) {
        return true;
      }

      return false;
    },

    hideFarmChrome(root) {
      const scope = root || document;
      const isAnimalGridHost = (el) => {
        if (!el || !el.querySelector) return false;
        // Never hide a wrapper that still holds the register/history grid —
        // that left sheep Registr blank when stáj/tisk chrome shared a parent.
        return !!qs(
          'table.grid-table, table.dataTable, .grid > table, .pf-simple-table-wrap',
          el
        );
      };
      const hideChrome = (el) => {
        if (!el) return;
        if (el.closest && el.closest('.ui-dialog')) return;
        // Never hide our shell
        if (
          el.id === 'pf-app' ||
          el.id === 'pf-host' ||
          (el.classList &&
            (el.classList.contains('pf-panel') ||
              el.classList.contains('pf-top') ||
              el.classList.contains('pf-host')))
        ) {
          return;
        }
        if (isAnimalGridHost(el)) {
          // Hide only the chrome node itself, not a parent that owns the grid
          if (
            el.matches &&
            el.matches(
              'a, button, input, select, label, span, i, .toolbutton, .dt-buttons'
            )
          ) {
            el.classList.add('pf-native-grid-hide');
          }
          return;
        }
        el.classList.add('pf-native-grid-hide');
      };

      // Provozovna / stáj picker (only one of each)
      qsa(
        [
          '#stajVyberId',
          'select[name="VybranaStajIdKombinace"]',
          'select[id*="StajVyber"]',
          'select[id*="stajVyber"]',
          '.selector-caption',
          '.selector-value',
          '.header-wrap',
        ].join(', '),
        scope
      ).forEach((el) => {
        if (el.closest('.ui-dialog')) return;
        const wrap =
          el.closest('.header-wrap') ||
          el.closest('.wideInputs') ||
          el.closest('.entity-editor-group') ||
          el.closest('tr') ||
          el.parentElement ||
          el;
        hideChrome(wrap);
        if (wrap !== el) hideChrome(el);
      });

      // Labels like "Výběr provozovny/stáje"
      qsa('.detail-header, .member-editor-caption, label, span, strong, b', scope).forEach(
        (el) => {
          if (
            el.closest('#pf-app .pf-nav') ||
            el.closest('#pf-pig-summary') ||
            el.closest('#pf-sheep-summary')
          )
            return;
          if (el.closest('.ui-dialog')) return;
          const t = norm(el.textContent);
          if (
            t.includes('vyber provozovny') ||
            t.includes('vyber staje') ||
            t.includes('vyber provozovny/staje') ||
            /^provozovna\s*\/\s*staj/.test(t) ||
            t === 'staj:' ||
            t === 'staje:' ||
            t === 'provozovna:'
          ) {
            const box =
              el.closest('.header-wrap') ||
              el.closest('.wideInputs') ||
              el.closest('.entity-editor-group') ||
              el.closest('tr') ||
              el.parentElement ||
              el;
            hideChrome(box);
          }
        }
      );

      // Print / export elsewhere on page (outside simplified toolbar)
      qsa('a, button, input[type=button], input[type=submit], span[onclick], i.fa-print', scope).forEach(
        (el) => {
          if (el.closest('#pf-toolbar') || el.closest('.pf-nav') || el.closest('.pf-context-nav'))
            return;
          if (el.closest('.ui-dialog')) return;
          const t = norm(
            textOf(el) +
              ' ' +
              (el.getAttribute('title') || '') +
              ' ' +
              (el.value || '') +
              ' ' +
              (el.getAttribute('href') || '') +
              ' ' +
              (el.getAttribute('onclick') || '') +
              ' ' +
              (el.className || '')
          );
          if (
            /tisk|print|hromadne tisky|hromadny tisk|excel|export.*csv|\.pdf|sestavy/.test(
              t
            ) ||
            /zobrazit pohyby prasat.*7 dn|pohyby prasat do 7|7 dnu v ue|HlaseniPrasata7Dni/i.test(
              t
            )
          ) {
            const box =
              el.closest('.dt-buttons') ||
              el.closest('li') ||
              el.closest('.toolbutton') ||
              el;
            // Prefer tight wrappers — never climb to entity-editor-group that owns the grid
            if (box.closest && box.closest('.entity-editor-group') && isAnimalGridHost(box.closest('.entity-editor-group'))) {
              hideChrome(el);
            } else {
              const wider =
                el.closest('.dt-buttons') ||
                el.closest('fieldset') ||
                el.closest('.entity-editor-group') ||
                el.closest('.header-wrap') ||
                el.closest('.wideInputs') ||
                el.closest('.toolbutton') ||
                el.closest('li') ||
                el;
              hideChrome(wider);
            }
          }
        }
      );

      // "Zvířata dle vyřazení" / "Tisk registru" leftover sections — not needed
      qsa(
        'fieldset, .entity-editor-group, .detail-header, legend, label, h2, h3, h4, span, div, strong, b',
        scope
      ).forEach((el) => {
        if (el.closest('#pf-app .pf-panel > h2, #pf-app .pf-page-title')) return;
        if (el.closest('#pf-pig-summary') || el.closest('#pf-sheep-summary'))
          return;
        if (el.closest('.ui-dialog')) return;
        if (el.closest && el.closest('.pf-simple-table-wrap')) return;
        if (
          el.closest &&
          el.closest(
            '.pf-top, .pf-nav, .pf-context-nav, .pf-pending-panel, .pf-toolbar, .pf-actions-block'
          )
        )
          return;
        if (el.id === 'pf-app' || el.id === 'pf-host') return;
        const t = norm(el.textContent || '');
        // Match the label itself, not huge containers that merely contain it
        const own =
          norm(
            Array.from(el.childNodes)
              .filter((n) => n.nodeType === 3)
              .map((n) => n.textContent)
              .join(' ')
          ) || norm(el.textContent).slice(0, 80);
        const isVyrazeni =
          /zvirata dle vyrazen/.test(own) ||
          (/zvirata dle vyrazen/.test(t) && t.length < 120);
        const isTisk =
          /^tisk registru$/.test(own) ||
          /^tisk$/.test(own) ||
          (/tisk registru/.test(own) && own.length < 40) ||
          /^tisk registru$/.test(t) ||
          (/tisk registru/.test(t) && t.length < 80);
        if (!isVyrazeni && !isTisk) return;
        const box =
          el.closest('fieldset') ||
          el.closest('.detail-header') ||
          el.closest('.header-wrap') ||
          el.closest('.wideInputs') ||
          el.parentElement ||
          el;
        // Do not hide .entity-editor-group when it also hosts the animal grid
        if (box && box.matches && box.matches('.entity-editor-group') && isAnimalGridHost(box)) {
          hideChrome(el);
          return;
        }
        hideChrome(box);
      });
    },

    /**
     * Sheep still waiting to send (založeno / not yet in evidence).
     * Shown in pending panel, not the main herd table.
     */
    isSheepPendingHerdRow(row, table) {
      if (!row) return false;
      let stavIdx = -1;
      try {
        if (
          PF.pending &&
          typeof PF.pending.nativeStavColumnIndex === 'function'
        ) {
          stavIdx = PF.pending.nativeStavColumnIndex(
            table || row.closest('table')
          );
        }
      } catch (_) {
        stavIdx = -1;
      }
      if (stavIdx == null || stavIdx < 0) stavIdx = -1;
      const cells = qsa(':scope > td', row);
      if (stavIdx >= 0 && cells[stavIdx]) {
        const stav = norm(textOf(cells[stavIdx]));
        if (/zalozeno/.test(stav)) return true;
        if (/smazano/.test(stav)) return true;
        return false;
      }
      // Fallback: unsent rows often have yellow/orange highlight + založeno text
      try {
        const marked = qsa('[style]', row).some((el) => {
          const st = String(el.getAttribute('style') || '').toLowerCase();
          return st.includes('yellow') || st.includes('orange');
        });
        if (marked && /zalozeno/.test(norm(textOf(row)))) return true;
      } catch (_) {}
      return false;
    },

    /**
     * Sheep that belong in the main herd table:
     * - Stav přísun = zpracováno (in evidence; may still have pending outbound change)
     * - not red ear mark (.cervene) — those are already removed in ÚE
     * Animals with pending home-kill etc. stay until ÚE processes them (not red yet).
     */
    isSheepHerdRow(row, table) {
      if (!row) return false;
      try {
        if (qs('.cervene', row)) return false;
      } catch (_) {}
      let stavIdx = -1;
      try {
        if (
          PF.pending &&
          typeof PF.pending.nativeStavColumnIndex === 'function'
        ) {
          stavIdx = PF.pending.nativeStavColumnIndex(
            table || row.closest('table')
          );
        }
      } catch (_) {
        stavIdx = -1;
      }
      if (stavIdx == null || stavIdx < 0) stavIdx = -1;
      const cells = qsa(':scope > td', row);
      if (stavIdx >= 0 && cells[stavIdx]) {
        return /zpracovano/.test(norm(textOf(cells[stavIdx])));
      }
      // No Stav column: keep rows that are not clearly pending births
      return !this.isSheepPendingHerdRow(row, table);
    },

    /**
     * Portal "Stav zvířat" must be "vše" (A) so animals with pending outbound
     * changes still appear until ÚE confirms removal (they leave "ve stavu").
     * Returns true when a navigation was triggered.
     */
    ensureSheepStavVse() {
      try {
        const sel =
          qs('#stavVyberId') ||
          qs('select[name="StavZvirat"]') ||
          qs('#main select[name="StavZvirat"]');
        if (!sel) return false;
        if (String(sel.value || '') === 'A') return false;
        if (this._sheepStavNavTried) return false;
        this._sheepStavNavTried = true;

        sel.value = 'A';
        const oc = String(sel.getAttribute('onchange') || '');
        const m = oc.match(
          /ulozitStavANavigovat\s*\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]/
        );
        if (m && typeof window.ulozitStavANavigovat === 'function') {
          window.ulozitStavANavigovat(
            String(m[1]).replace(/&amp;/g, '&'),
            m[2]
          );
          return true;
        }
        if (typeof sel.onchange === 'function') {
          sel.onchange();
          return true;
        }
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      } catch (_) {
        return false;
      }
    },

    keepListFor(kind) {
      if (kind.includes('history')) {
        if (kind.startsWith('sheep')) return PF.config.sheepHistoryKeep;
        return PF.config.pigHistoryKeep;
      }
      if (kind.includes('send')) {
        if (kind.startsWith('sheep')) return PF.config.sheepHistoryKeep;
        return PF.config.pigHistoryKeep;
      }
      if (kind.startsWith('sheep')) return PF.config.sheepColumnsKeep;
      if (kind === 'pig') return null; // handled by summary, not table
      if (kind.startsWith('pig')) return PF.config.pigColumnsKeep;
      return null;
    },

    isExcludedColumn(label) {
      const t = norm(label);
      return (PF.config.pigColumnExclude || []).some((k) => t.includes(norm(k)));
    },

    scrapePigHeadcount() {
      // Prefer Konečný stav from the same latest zpracováno history row as Poslední změna
      const snap = this.extractLatestProcessedSnapshotFromRoot(document, {
        processedOnly: true,
      });
      let count = snap.count != null ? snap.count : null;
      let fromHistory = count != null;

      if (count == null) {
        const parsed = this.parsePigCountFromRoot(document);
        count = parsed.count;
        // Prefer the dashboard herd total when the register grid is empty/ambiguous
        try {
          const cached = localStorage.getItem('pf-count-pigs');
          if (cached != null && cached !== '') {
            const c = parseInt(cached, 10);
            if (!isNaN(c) && (count == null || parsed.weak)) count = c;
          }
        } catch (_) {}
      } else {
        try {
          localStorage.setItem('pf-count-pigs', String(count));
        } catch (_) {}
      }

      const lastDate =
        snap.date || this.readPigLastChange() || '';
      if (snap.date) this.savePigLastChange(snap.date, { force: true });

      return {
        count: count == null || isNaN(count) ? null : count,
        lastDate,
        fromHistory,
      };
    },

    pigLastChangeKey: 'pf-pig-last-change-v4',

    /**
     * Drop remembered herd totals / last-change dates so the next register paint
     * re-scrapes live portal data (e.g. after Odeslat do ÚE).
     */
    invalidateHerdCaches(kind) {
      const k = String(kind || '');
      const doPig = !k || /pig/i.test(k);
      const doSheep = !k || /sheep/i.test(k);
      try {
        if (doPig) {
          localStorage.removeItem('pf-count-pigs');
          localStorage.removeItem(this.pigLastChangeKey);
        }
        if (doSheep) {
          localStorage.removeItem('pf-count-sheep');
          localStorage.removeItem('pf-count-sheep-male');
          localStorage.removeItem('pf-count-sheep-female');
          localStorage.removeItem(this.sheepLastChangeKey);
        }
      } catch (_) {}
      if (doPig) {
        this._pigSummaryLoading = false;
        this._pigSummaryPromise = null;
        const box = qs('#pf-pig-summary');
        if (box) {
          try {
            delete box.dataset.pfSettled;
          } catch (_) {}
          try {
            box.remove();
          } catch (_) {}
        }
      }
      if (doSheep) {
        this._sheepSummaryLoading = false;
        this._sheepSummaryPromise = null;
        const box = qs('#pf-sheep-summary');
        if (box) {
          try {
            delete box.dataset.pfSettled;
          } catch (_) {}
          try {
            box.remove();
          } catch (_) {}
        }
      }
    },

    readPigLastChange() {
      // v4 = processed-only (stav=zpracováno). Do not fall back to older caches —
      // those mixed in pending / unprocessed dates.
      try {
        const v = localStorage.getItem(this.pigLastChangeKey) || '';
        if (v && this.dateKey(v) >= 0) return v;
      } catch (_) {}
      return '';
    },

    /** Extract a count from a row, ignoring dates / years. */
    rowHeadcount(tr) {
      if (!tr || isFilterChromeRow(tr)) return null;
      let raw = textOf(tr);
      if (!raw) return null;
      // Strip Czech dates so years are not taken as counts
      raw = raw.replace(/\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/g, ' ');
      const nums = [];
      String(raw).replace(/\b(\d+)\b/g, (_, n) => {
        const v = parseInt(n, 10);
        // Ignore years and huge ids
        if (!isNaN(v) && v <= 100000 && !(v >= 1900 && v <= 2100)) nums.push(v);
      });
      if (!nums.length) return null;
      return nums[nums.length - 1];
    },

    /**
     * History / pending / movements tables must not feed the herd total —
     * their "samec" + počet/konečný stav rows sum into nonsense (e.g. 35).
     */
    isPigHistoryOrEventTable(table) {
      if (!table) return true;
      if (
        table.closest(
          '#pf-pending-section, #pf-pending-table, .registrNeodeslane, .pf-modal, .ui-dialog, .popup, .popup-filter'
        )
      )
        return true;
      const urlBlob = norm(
        String(table.getAttribute('data-url') || '') +
          ' ' +
          String(
            (table.closest('[data-url]') &&
              table.closest('[data-url]').getAttribute('data-url')) ||
              ''
          ) +
          ' ' +
          String(table.id || '') +
          ' ' +
          String(table.className || '')
      );
      if (/zmeny|pohyby|udalost|neodeslan|hlaseni/.test(urlBlob)) return true;
      // Explicit "Datum změny" only — plain "Datum" is too broad (changeDateColumnIndex
      // falls back to any Datum column and would skip the inventory grid).
      const headRow =
        qs('thead tr', table) ||
        qsa('tr', table).find((tr) => qs('th', tr));
      if (headRow) {
        const labels = norm(
          qsa('th, td', headRow)
            .map((th) => this.headerLabel(th))
            .join(' ')
        );
        if (
          /datum zmeny|typ zmeny|konecn|pocatec|odeslan|zpracov|partner|cislo hlaseni|událost|udalost/.test(
            labels
          )
        )
          return true;
      }
      return false;
    },

    /** True when a table looks like the Prasata inventory (sex/category + count). */
    isPigInventoryTable(table) {
      if (!table || this.isPigHistoryOrEventTable(table)) return false;
      // Event history also has "Stav prasnic" — require a real sex/category row
      const rows = qsa('tbody tr.grid-row, tbody tr', table);
      return rows.some((tr) => {
        if (isFilterChromeRow(tr)) return false;
        const row = norm(textOf(tr));
        return /^(kanec|prasnice|samec|samice|samci)\b/.test(row) ||
          /\b(kanec|prasnice)\b/.test(row);
      });
    },

    parsePigCountFromRoot(root) {
      const scope = root || document;
      let fromMales = 0;
      let foundMales = false;
      let fromTotal = null;

      const tables = qsa('table.grid-table, table.dataTable', scope).filter(
        (table) => this.isPigInventoryTable(table)
      );
      // Isolated Prasata AJAX fragments may lack history markers — allow any table
      // that still isn't an event log when no explicit inventory table matched.
      const targets =
        tables.length > 0
          ? tables
          : qsa('table.grid-table, table.dataTable, table', scope).filter(
              (table) =>
                !this.isPigHistoryOrEventTable(table) &&
                /kanec|prasnic|samec|samice|prasata|celkem|platn/.test(
                  norm(textOf(table))
                )
            );

      targets.forEach((table) => {
        qsa('tr', table).forEach((tr) => {
          if (tr.closest('#pf-app .pf-simple-table-wrap')) return;
          if (tr.closest('.popup, .popup-filter, .ui-dialog')) return;
          if (isFilterChromeRow(tr)) return;

          const row = norm(textOf(tr));
          if (!row || /prasnic|samice/.test(row)) return;

          const n = this.rowHeadcount(tr);
          if (/kanec|kanc\b|samec|samci/.test(row) && n != null) {
            foundMales = true;
            fromMales += n;
          } else if (
            /prasata|celkem|platn|\bks\b|pocet/.test(row) &&
            n != null
          ) {
            if (/celkem|platn|prasata/.test(row)) fromTotal = n;
          }
        });
      });

      let count = foundMales ? fromMales : fromTotal;
      const weak = !foundMales;
      return { count, weak };
    },

    pickLatestDate(dates) {
      if (!dates || !dates.length) return '';
      let best = '';
      let bestKey = -1;
      dates.forEach((d) => {
        const key = this.dateKey(d);
        if (key >= bestKey) {
          bestKey = key;
          best = d;
        }
      });
      return best;
    },

    dateKey(d) {
      const m = String(d || '')
        .trim()
        .match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
      if (!m) return -1;
      return (
        parseInt(m[3], 10) * 10000 +
        parseInt(m[2], 10) * 100 +
        parseInt(m[1], 10)
      );
    },

    /**
     * Remember a change date. By default never replace a newer value with an older
     * one (that was the original bug: async shell scrape overwrote a good date).
     */
    savePigLastChange(date, opts) {
      if (!date || this.dateKey(date) < 0) return false;
      const force = opts && opts.force;
      try {
        const prev = this.readPigLastChange() || '';
        if (!force && prev && this.dateKey(date) < this.dateKey(prev)) return false;
        localStorage.setItem(this.pigLastChangeKey, date);
        return true;
      } catch (_) {
        return false;
      }
    },

    /** Index of "Datum změny" column; -1 if not found. Skips narození/založení. */
    changeDateColumnIndex(table) {
      if (!table) return -1;
      const headRow =
        qs('thead tr', table) ||
        qsa('tr', table).find((tr) => qs('th', tr));
      if (!headRow) return -1;
      const ths = qsa(':scope > th, :scope > td', headRow).length
        ? qsa(':scope > th, :scope > td', headRow)
        : qsa('th', headRow);
      let changeIdx = -1;
      let plainDatumIdx = -1;
      ths.forEach((th, i) => {
        const col = String(th.getAttribute('data-colname') || '').toUpperCase();
        const label = norm(this.headerLabel(th) + ' ' + col);
        if (/zalozen|naroz|datumnar|datnar/.test(label)) return;
        if (
          /datumzmeny|datzmeny|datum_zmeny/.test(label.replace(/\s/g, '')) ||
          (/datum/.test(label) && /zmen/.test(label))
        ) {
          changeIdx = i;
        } else if (
          (label === 'datum' || label === 'dat.' || /^datum$/.test(label) || col === 'DATUM') &&
          plainDatumIdx < 0
        ) {
          plainDatumIdx = i;
        }
      });
      return changeIdx >= 0 ? changeIdx : plainDatumIdx;
    },

    /** Index of processing "Stav" column (zpracováno / …); -1 if not found.
     *  Ignores "Konečný stav" / "Počáteční stav" / herd-status columns. */
    stateColumnIndex(table) {
      if (!table) return -1;
      const headRow =
        qs('thead tr', table) ||
        qsa('tr', table).find((tr) => qs('th', tr));
      if (!headRow) return -1;
      const ths = qsa(':scope > th, :scope > td', headRow).length
        ? qsa(':scope > th, :scope > td', headRow)
        : qsa('th', headRow);
      let idx = -1;
      ths.forEach((th, i) => {
        const col = String(
          th.getAttribute('data-colname') ||
            th.getAttribute('data-field') ||
            ''
        ).toUpperCase();
        const label = norm(this.headerLabel(th));
        const blob = norm(label + ' ' + col);
        // Not inventory / result-count "stav"
        if (/konecn|pocatec|zvirat|zive|celkem|pocet|ks\b|prasnic/.test(blob))
          return;
        // Portal pig history: data-colname="STAVID"
        if (
          col === 'STAV' ||
          col === 'STAVID' ||
          label === 'stav' ||
          /^stav$/.test(label) ||
          (/\bstav\b/.test(blob) && blob.length <= 24)
        ) {
          idx = i;
        }
      });
      return idx;
    },

    /** True when a history row is processed in ÚE (stav = zpracováno). */
    rowIsProcessed(tr, stateIdx) {
      if (!tr) return false;
      if (stateIdx != null && stateIdx >= 0) {
        const cells = qsa(':scope > td', tr);
        if (!cells[stateIdx]) return false;
        const t = norm(cellText(cells[stateIdx]));
        return /^zpracovano\b/.test(t);
      }
      // No Stav column — require the word in the row (strict; don't treat all as processed)
      const blob = norm(textOf(tr));
      return (
        /\bzpracovano\b/.test(blob) && !/\bnezpracovano\b/.test(blob)
      );
    },

    /** Index of "Konečný stav" (herd size after the event); -1 if missing. */
    finalCountColumnIndex(table) {
      if (!table) return -1;
      const headRow =
        qs('thead tr', table) ||
        qsa('tr', table).find((tr) => qs('th', tr));
      if (!headRow) return -1;
      const ths = qsa(':scope > th, :scope > td', headRow).length
        ? qsa(':scope > th, :scope > td', headRow)
        : qsa('th', headRow);
      let exactIdx = -1;
      let maleIdx = -1;
      let anyIdx = -1;
      ths.forEach((th, i) => {
        const col = String(
          th.getAttribute('data-colname') ||
            th.getAttribute('data-field') ||
            ''
        ).toUpperCase();
        // Portal pig history grid: data-colname="KONECNYSTAV"
        if (col === 'KONECNYSTAV') {
          if (exactIdx < 0) exactIdx = i;
          return;
        }
        const label = norm(this.headerLabel(th) + ' ' + col);
        const compact = label.replace(/\s/g, '');
        // Must be Konečný stav — not plain Stav / Počáteční stav / Stav prasnic
        if (
          !(
            /konecnystav|konecny_stav|stavkonecn/.test(compact) ||
            (/konecn/.test(label) && /stav/.test(label) && !/pocatec/.test(label))
          )
        ) {
          return;
        }
        if (/prasnic|samice|samic|female|♀/.test(label)) return;
        if (
          /^konecny\s*stav$/.test(label.trim()) ||
          /^konecnystav$/.test(compact) ||
          compact === 'konecny_stav'
        ) {
          if (exactIdx < 0) exactIdx = i;
          return;
        }
        if (/kanec|samec|samci|male|♂|\bm\b/.test(label)) {
          if (maleIdx < 0) maleIdx = i;
          return;
        }
        if (anyIdx < 0) anyIdx = i;
      });
      if (exactIdx >= 0) return exactIdx;
      if (maleIdx >= 0) return maleIdx;
      return anyIdx;
    },

    /** Parse a herd-size cell; if several numbers appear, prefer the last (total). */
    parseFinalCountCell(td) {
      if (!td) return null;
      let raw = cellText(td);
      if (!raw) return null;
      raw = raw.replace(/\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/g, ' ');
      const nums = [];
      String(raw).replace(/\b(\d+)\b/g, (_, n) => {
        const v = parseInt(n, 10);
        if (!isNaN(v) && v <= 100000 && !(v >= 1900 && v <= 2100)) nums.push(v);
      });
      if (!nums.length) return null;
      return nums[nums.length - 1];
    },

    /**
     * Snapshot from the history table that has Datum změny + Konečný stav:
     * first zpracováno data row (portal lists newest on top) — same row for
     * Poslední změna and herd count.
     */
    extractLatestProcessedSnapshotFromRoot(root, opts) {
      const empty = { date: '', count: null };
      if (!root || !root.querySelectorAll) return empty;
      const processedOnly = !opts || opts.processedOnly !== false;

      const readFirstProcessed = (table, requireCountCol) => {
        if (!table) return null;
        // Our simplified clone can mis-align columns — only trust native grids
        if (table.classList && table.classList.contains('pf-simple-table'))
          return null;
        if (table.closest('.popup, .popup-filter, .ui-dialog')) return null;
        if (table.closest('#pf-pending-section, #pf-pending-table')) return null;
        const dateIdx = this.changeDateColumnIndex(table);
        if (dateIdx < 0) return null;
        const countIdx = this.finalCountColumnIndex(table);
        if (requireCountCol && countIdx < 0) return null;
        const stateIdx = processedOnly ? this.stateColumnIndex(table) : -1;
        if (processedOnly) {
          const hasProcessedMarker =
            stateIdx >= 0 ||
            /zpracováno|zpracovano/i.test(textOf(table));
          if (!hasProcessedMarker) return null;
        }
        const rows = qsa('tbody tr.grid-row, tbody tr', table);
        for (let i = 0; i < rows.length; i++) {
          const tr = rows[i];
          if (isFilterChromeRow(tr)) continue;
          if (processedOnly && !this.rowIsProcessed(tr, stateIdx)) continue;
          const cells = qsa(':scope > td', tr);
          if (!cells[dateIdx]) continue;
          const dm = cellText(cells[dateIdx]).match(
            /\b(\d{1,2}\.\d{1,2}\.\d{4})\b/
          );
          if (!dm) continue;
          const date = dm[1];
          if (this.dateKey(date) < 0) continue;
          let count = null;
          if (countIdx >= 0) count = this.parseFinalCountCell(cells[countIdx]);
          return { date, count, hasFinalCol: countIdx >= 0 };
        }
        return null;
      };

      const tables = qsa('table.grid-table, table.dataTable', root);
      // Prefer the Prasata event grid (has KONECNYSTAV) over other tables
      const ranked = tables.slice().sort((a, b) => {
        const af = this.finalCountColumnIndex(a) >= 0 ? 1 : 0;
        const bf = this.finalCountColumnIndex(b) >= 0 ? 1 : 0;
        return bf - af;
      });
      // 1) Prefer a real history table with Konečný stav — first processed row
      for (let t = 0; t < ranked.length; t++) {
        const snap = readFirstProcessed(ranked[t], true);
        if (snap && snap.date) return snap;
      }
      // 2) Date-only history tables (count filled later from another grid)
      for (let t = 0; t < ranked.length; t++) {
        const snap = readFirstProcessed(ranked[t], false);
        if (snap && snap.date) return { date: snap.date, count: snap.count };
      }
      return empty;
    },

    extractLatestProcessedSnapshotFromHtml(html) {
      if (!html) return { date: '', count: null };
      try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return this.extractLatestProcessedSnapshotFromRoot(doc);
      } catch (_) {
        return { date: '', count: null };
      }
    },

    /** Collect Datum změny from history tables — only stav=zpracováno rows. */
    extractChangeDatesFromRoot(root, opts) {
      const dates = [];
      if (!root || !root.querySelectorAll) return dates;
      const processedOnly = !opts || opts.processedOnly !== false;
      root
        .querySelectorAll(
          'table.grid-table, table.dataTable, table.pf-simple-table'
        )
        .forEach((table) => {
          if (table.closest('.popup, .popup-filter, .ui-dialog')) return;
          // Skip pending-changes table — those rows are not processed yet
          if (table.closest('#pf-pending-section, #pf-pending-table')) return;
          const colIdx = this.changeDateColumnIndex(table);
          if (colIdx < 0) return;
          const stateIdx = processedOnly ? this.stateColumnIndex(table) : -1;
          // If filtering and the table has neither Stav nor any "zpracováno" cell, skip it
          if (processedOnly) {
            const hasProcessedMarker =
              stateIdx >= 0 ||
              /zpracováno|zpracovano/i.test(textOf(table));
            if (!hasProcessedMarker) return;
          }
          qsa('tbody tr.grid-row, tbody tr', table).forEach((tr) => {
            if (isFilterChromeRow(tr)) return;
            if (processedOnly && !this.rowIsProcessed(tr, stateIdx)) return;
            const cells = qsa(':scope > td', tr);
            if (!cells[colIdx]) return;
            const t = cellText(cells[colIdx]);
            const m = t.match(/\b(\d{1,2}\.\d{1,2}\.\d{4})\b/);
            if (m) dates.push(m[1]);
          });
        });
      return dates;
    },

    extractChangeDatesFromHtml(html) {
      if (!html) return [];
      try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return this.extractChangeDatesFromRoot(doc);
      } catch (_) {
        return [];
      }
    },

    /** Pull the portal's own grid AJAX URL out of the pig register page. */
    findPigHistoryGridUrls(html, histHref) {
      const found = [];
      const re =
        /\/ssl\/app\/izr2far\/StajoveRegistry\/StajovyRegistrPrasat\w*Grid\/\w+\?[^"'\\\s]+/gi;
      String(html || '').replace(re, (m) => {
        const u = m.replace(/&amp;/g, '&');
        if (!found.includes(u) && !this.isDeadUrl(u)) found.push(u);
      });

      // Prefer URLs already used by the portal (correct idStaje params).
      // Do NOT invent sheep-style provozovnaSRKey URLs — those 500 on Prasata.
      const built = this.buildPigPrasataGridUrl(histHref, html);
      if (built && !found.includes(built)) found.unshift(built);

      const prasata = found.filter((u) => /PrasatGrid\/Prasata/i.test(u));
      const rest = found.filter(
        (u) => !/Hlaseni|Pohyby/i.test(u) && !prasata.includes(u)
      );
      return [...prasata, ...rest].filter(
        (u, i, arr) => u && arr.indexOf(u) === i && !this.isDeadUrl(u)
      );
    },

    /** Real stable id used by Prasata grid / DialogSRSkup (not all-zeros). */
    pigStajeCacheKey: 'pf-pig-staje-id',

    cachePigStajeId(id) {
      const v = String(id || '').trim();
      if (!/^[a-f0-9]{32}$/i.test(v) || /^0+$/.test(v)) return false;
      try {
        localStorage.setItem(this.pigStajeCacheKey, v.toLowerCase());
      } catch (_) {}
      return true;
    },

    readCachedPigStajeId() {
      try {
        const v = localStorage.getItem(this.pigStajeCacheKey) || '';
        if (/^[a-f0-9]{32}$/i.test(v) && !/^0+$/.test(v)) return v;
      } catch (_) {}
      return '';
    },

    resolvePigStajeId(html) {
      const sources = [
        html || '',
        typeof document !== 'undefined' ? document.documentElement.innerHTML : '',
      ];
      for (const src of sources) {
        const m =
          String(src).match(
            /PrasatGrid\/Prasata[^"'<\s]*[?&]idStaje=([a-f0-9]{32})/i
          ) ||
          String(src).match(
            /DialogSRSkup[^"'<\s]*[?&]idStaj=([a-f0-9]{32})/i
          ) ||
          String(src).match(
            /data-url=["'][^"']*idStaje=([a-f0-9]{32})/i
          ) ||
          String(src).match(/[?&]idStaje=([a-f0-9]{32})/i);
        if (m && !/^0+$/.test(m[1])) {
          this.cachePigStajeId(m[1]);
          return m[1];
        }
      }
      try {
        const id =
          getParam('idStaj') ||
          getParam('idStaje') ||
          '';
        if (id && /^[a-f0-9]{32}$/i.test(id) && !/^0+$/.test(id)) {
          this.cachePigStajeId(id);
          return id;
        }
      } catch (_) {}
      // Opener links on the page often embed the correct DialogSRSkup id
      try {
        const opener = qsa(
          'a[onclick*="DialogSRSkup"], button[onclick*="DialogSRSkup"], a[href*="DialogSRSkup"]'
        )[0];
        const blob =
          (opener &&
            ((opener.getAttribute('onclick') || '') +
              ' ' +
              (opener.getAttribute('href') || ''))) ||
          '';
        const m = blob.match(/DialogSRSkup\?[^"'<\s]*idStaj=([a-f0-9]{32})/i);
        if (m && !/^0+$/.test(m[1])) {
          this.cachePigStajeId(m[1]);
          return m[1];
        }
      } catch (_) {}
      const cached = this.readCachedPigStajeId();
      if (cached) return cached;
      // Single non-empty option in a stáj select — only plain 32-char GUIDs
      try {
        const sels = qsa(
          'select[name*="Staj" i], select[id*="Staj" i], select[name=idStaj], select#idStaj'
        );
        for (const sel of sels) {
          const opts = qsa('option', sel).filter(
            (o) =>
              o.value &&
              /^[a-f0-9]{32}$/i.test(o.value) &&
              !/^0+$/.test(o.value)
          );
          if (opts.length === 1) {
            this.cachePigStajeId(opts[0].value);
            return opts[0].value;
          }
          if (
            sel.value &&
            /^[a-f0-9]{32}$/i.test(sel.value) &&
            !/^0+$/.test(sel.value)
          ) {
            this.cachePigStajeId(sel.value);
            return sel.value;
          }
        }
      } catch (_) {}
      return '';
    },

    buildPigPrasataGridUrl(pigsHref, html) {
      try {
        const u = new URL(pigsHref || location.href, location.origin);
        const idSR = u.searchParams.get('idStajovyRegistr');
        if (!idSR) return '';
        const idStaje = this.resolvePigStajeId(html);
        if (!idStaje) return '';
        this.cachePigStajeId(idStaje);
        const zaz =
          u.searchParams.get('zaznamyZvirat') || 'Platne';
        return (
          '/ssl/app/izr2far/StajoveRegistry/StajovyRegistrPrasatGrid/Prasata' +
          '?idStaje=' +
          encodeURIComponent(idStaje) +
          '&idStajovyRegistr=' +
          encodeURIComponent(idSR) +
          '&zaznamyZvirat=' +
          encodeURIComponent(zaz)
        );
      } catch (_) {
        return '';
      }
    },

    _deadUrls: Object.create(null),

    isDeadUrl(url) {
      if (!url) return true;
      try {
        const key = String(url).replace(/[?&]_=\d+/g, '');
        return !!this._deadUrls[key];
      } catch (_) {
        return false;
      }
    },

    markDeadUrl(url) {
      if (!url) return;
      try {
        const key = String(url).replace(/[?&]_=\d+/g, '');
        this._deadUrls[key] = 1;
      } catch (_) {}
    },

    getHtml(url) {
      return new Promise((resolve) => {
        if (!url || this.isDeadUrl(url)) {
          resolve('');
          return;
        }
        if (refresh$() && $.ajax) {
          $.ajax({
            url,
            method: 'GET',
            dataType: 'html',
            pfInternal: true,
            success: (html) => resolve(html || ''),
            error: (xhr) => {
              if (xhr && xhr.status >= 400) this.markDeadUrl(url);
              resolve('');
            },
          });
        } else {
          fetch(url, { credentials: 'same-origin' })
            .then((r) => {
              if (!r.ok) {
                this.markDeadUrl(url);
                return '';
              }
              return r.text();
            })
            .then((html) => resolve(html || ''))
            .catch(() => {
              this.markDeadUrl(url);
              resolve('');
            });
        }
      });
    },

    /**
     * Pig event history lives in StajovyRegistrPrasatGrid/Prasata
     * (Datum + KONECNYSTAV + STAVID), not a separate Zmeny-only grid.
     */
    fetchPigHistorySnapshot(pigsHref, cb) {
      const histHref = PF.shell.derivePigHistory(
        pigsHref || location.href || PF.scrape.cached('pigs')
      );
      if (!histHref || histHref === '#') {
        if (cb) cb({ date: '', count: null });
        return;
      }

      const live = this.extractLatestProcessedSnapshotFromRoot(document, {
        processedOnly: true,
      });
      // Trust live DOM whenever the Prasata history grid is already present
      // (register page keeps it hidden; historie shows it).
      if (live.date && live.count != null) {
        this.savePigLastChange(live.date, { force: true });
        try {
          localStorage.setItem('pf-count-pigs', String(live.count));
        } catch (_) {}
        if (cb) cb(live);
        return;
      }

      const publish = (snap, fromGrid) => {
        const out = snap || { date: '', count: null };
        if (out.date) this.savePigLastChange(out.date, { force: !!fromGrid });
        if (out.count != null) {
          try {
            localStorage.setItem('pf-count-pigs', String(out.count));
          } catch (_) {}
        }
        if (cb) cb(out);
      };

      const mergeSnap = (a, b) => {
        const cur = a || { date: '', count: null };
        const next = b || { date: '', count: null };
        const curFull = !!(cur.date && cur.count != null);
        const nextFull = !!(next.date && next.count != null);
        if (nextFull && !curFull) return next;
        if (curFull && !nextFull) return cur;
        if (!next.date) return cur;
        if (!cur.date) return next;
        const ck = this.dateKey(cur.date);
        const nk = this.dateKey(next.date);
        if (nk > ck) return next;
        if (nk < ck) return cur;
        if (cur.count == null && next.count != null) return next;
        return cur;
      };

      this.getHtml(histHref).then((pageHtml) => {
        let best = mergeSnap(
          live.date ? live : null,
          this.extractLatestProcessedSnapshotFromHtml(pageHtml)
        );
        let dates = this.extractChangeDatesFromHtml(pageHtml);
        if (live.date) dates.push(live.date);

        // Primary source: Prasata grid (event history with KONECNYSTAV)
        const prasataUrl = this.buildPigPrasataGridUrl(
          histHref,
          pageHtml || document.documentElement.innerHTML
        );
        const urls = this.findPigHistoryGridUrls(pageHtml, histHref);
        const allUrls = [prasataUrl, ...urls].filter(
          (u, i, arr) => u && u !== '#' && arr.indexOf(u) === i
        );

        const finish = () => {
          if (!best || !best.date) {
            const latest = this.pickLatestDate(dates);
            if (latest) best = mergeSnap(best, { date: latest, count: null });
          }
          if (best && best.date) publish(best, true);
          else if (live.date) publish(live, false);
          else publish({ date: '', count: null }, false);
        };

        const isComplete = (s) => s && s.date && s.count != null;

        const tryUrl = (i) => {
          if (i >= allUrls.length) return finish();
          this.getHtml(allUrls[i]).then((gridHtml) => {
            const snap = this.extractLatestProcessedSnapshotFromHtml(gridHtml);
            best = mergeSnap(best, snap);
            dates = dates.concat(this.extractChangeDatesFromHtml(gridHtml));
            if (isComplete(best)) finish();
            else tryUrl(i + 1);
          });
        };

        if (isComplete(best)) finish();
        else tryUrl(0);
      });
    },

    fetchPigLastChange(pigsHref, cb) {
      this.fetchPigHistorySnapshot(pigsHref, (snap) => {
        if (cb) cb(snap && snap.date ? snap.date : null);
      });
    },

    findPigZmenyGridUrls(html, zmenyHref) {
      const found = [];
      const re =
        /\/ssl\/app\/izr2far\/StajoveRegistry\/StajovyRegistrPrasatZmenyGrid\/\w+\?[^"'\\\s]+/gi;
      String(html || '').replace(re, (m) => {
        const u = m.replace(/&amp;/g, '&');
        if (!found.includes(u) && !this.isDeadUrl(u)) found.push(u);
      });
      try {
        if (zmenyHref && zmenyHref !== '#') {
          const { idProv, idSR, idStaj } = (() => {
            const u = new URL(zmenyHref, location.origin);
            return {
              idProv:
                u.searchParams.get('idProvozovnySR') ||
                u.searchParams.get('idProvozovnaSr') ||
                '',
              idSR: u.searchParams.get('idStajovyRegistr') || '',
              idStaj: u.searchParams.get('idStaj') || '',
            };
          })();
          if (idSR) {
            const built =
              '/ssl/app/izr2far/StajoveRegistry/StajovyRegistrPrasatZmenyGrid/Zmeny' +
              '?idProvozovnaSr=' +
              encodeURIComponent(idProv || '00000000000000000000000000000000') +
              '&idStajovyRegistr=' +
              encodeURIComponent(idSR) +
              (idStaj ? '&idStaj=' + encodeURIComponent(idStaj) : '');
            if (!found.includes(built)) found.push(built);
          }
        }
      } catch (_) {}
      return found;
    },

    fetchPigRegisterCount(pigsHref, cb) {
      // Primary: Konečný stav on the latest zpracováno history row
      this.fetchPigHistorySnapshot(pigsHref, (snap) => {
        if (snap && snap.count != null && !isNaN(snap.count)) {
          if (cb) cb(snap.count);
          return;
        }
        // Fallback: sex/category inventory grid (Kanec rows)
        const live = this.parsePigCountFromRoot(document);
        const gridUrl = this.buildPigPrasataGridUrl(
          pigsHref || location.href,
          document.documentElement.innerHTML
        );
        if (!gridUrl || this.isDeadUrl(gridUrl)) {
          if (cb) cb(live.count != null && !live.weak ? live.count : null);
          return;
        }
        const finish = (html) => {
          try {
            const doc = new DOMParser().parseFromString(html || '', 'text/html');
            const parsed = this.parsePigCountFromRoot(doc);
            const n =
              parsed.count != null && !parsed.weak
                ? parsed.count
                : live.count != null && !live.weak
                  ? live.count
                  : null;
            if (n != null) {
              try {
                localStorage.setItem('pf-count-pigs', String(n));
              } catch (_) {}
            }
            if (cb) cb(n);
          } catch (_) {
            if (cb)
              cb(live.count != null && !live.weak ? live.count : null);
          }
        };
        if (refresh$() && $.ajax) {
          $.ajax({
            url: gridUrl,
            method: 'GET',
            dataType: 'html',
            pfInternal: true,
            success: finish,
            error: (xhr) => {
              if (xhr && xhr.status >= 400) this.markDeadUrl(gridUrl);
              if (cb)
                cb(live.count != null && !live.weak ? live.count : null);
            },
          });
        } else {
          fetch(gridUrl, { credentials: 'same-origin' })
            .then((r) => {
              if (!r.ok) {
                this.markDeadUrl(gridUrl);
                return '';
              }
              return r.text();
            })
            .then(finish)
            .catch(() => {
              this.markDeadUrl(gridUrl);
              if (cb)
                cb(live.count != null && !live.weak ? live.count : null);
            });
        }
      });
    },

    renderPigRegisterSummary() {
      const host = qs('#pf-host');
      if (!host) return Promise.resolve();

      // Hide native grids / previous simple tables — registr is summary only
      qsa(
        '.grid, .grid-full-width, table.grid-table, table.dataTable, .pf-simple-table-wrap',
        host
      ).forEach((el) => el.classList.add('pf-native-grid-hide'));

      let box = qs('#pf-pig-summary');
      if (!box) {
        box = document.createElement('div');
        box.id = 'pf-pig-summary';
        host.insertBefore(box, host.firstChild);
      }

      const paint = (count, lastDate) => {
        box.innerHTML = `
        <div class="pf-grid pf-grid-2 pf-register-summary">
          <div class="pf-panel pf-stat" style="box-shadow:none;border-style:dashed">
            <div class="pf-num" id="pf-pig-count">${count == null ? '—' : count}</div>
            <div class="pf-label" id="pf-pig-count-label">${CZ.pigsInStable(count)}</div>
          </div>
          <div class="pf-panel pf-stat" style="box-shadow:none;border-style:dashed">
            <div class="pf-num pf-stat-date" id="pf-pig-last-change">${
              lastDate ? escapeHtml(formatCzDate(lastDate)) : '—'
            }</div>
            <div class="pf-label">Poslední změna</div>
          </div>
        </div>`;
        box.dataset.pfSettled = '1';
      };

      const pigsHref = PF.scrape.cached('pigs') || location.href;
      const scraped = this.scrapePigHeadcount();

      const loadSnapshot = () =>
        new Promise((resolve) => {
          this.fetchPigHistorySnapshot(pigsHref, (snap) => {
            const date =
              (snap && snap.date) ||
              scraped.lastDate ||
              this.readPigLastChange() ||
              '';
            if (snap && snap.count != null && !isNaN(snap.count)) {
              resolve({ count: snap.count, lastDate: date });
              return;
            }
            // No Konečný stav — fall back to inventory (Kanec) grid only
            const live = this.parsePigCountFromRoot(document);
            const gridUrl = this.buildPigPrasataGridUrl(
              pigsHref || location.href,
              document.documentElement.innerHTML
            );
            if (!gridUrl || this.isDeadUrl(gridUrl)) {
              resolve({
                count:
                  live.count != null && !live.weak
                    ? live.count
                    : scraped.count,
                lastDate: date,
              });
              return;
            }
            const finish = (html) => {
              try {
                const doc = new DOMParser().parseFromString(
                  html || '',
                  'text/html'
                );
                const parsed = this.parsePigCountFromRoot(doc);
                const n =
                  parsed.count != null && !parsed.weak
                    ? parsed.count
                    : live.count != null && !live.weak
                      ? live.count
                      : scraped.count;
                if (n != null) {
                  try {
                    localStorage.setItem('pf-count-pigs', String(n));
                  } catch (_) {}
                }
                resolve({ count: n, lastDate: date });
              } catch (_) {
                resolve({
                  count:
                    live.count != null && !live.weak
                      ? live.count
                      : scraped.count,
                  lastDate: date,
                });
              }
            };
            if (refresh$() && $.ajax) {
              $.ajax({
                url: gridUrl,
                method: 'GET',
                dataType: 'html',
                pfInternal: true,
                success: finish,
                error: () =>
                  resolve({
                    count:
                      live.count != null && !live.weak
                        ? live.count
                        : scraped.count,
                    lastDate: date,
                  }),
              });
            } else {
              fetch(gridUrl, { credentials: 'same-origin' })
                .then((r) => (r.ok ? r.text() : ''))
                .then(finish)
                .catch(() =>
                  resolve({
                    count:
                      live.count != null && !live.weak
                        ? live.count
                        : scraped.count,
                    lastDate: date,
                  })
                );
            }
          });
        });

      // Already settled — local DOM/cache only (never re-hit Prasata; that 500-looped)
      if (
        box.dataset.pfSettled === '1' &&
        qs('#pf-pig-last-change', box)
      ) {
        const snap = this.extractLatestProcessedSnapshotFromRoot(document, {
          processedOnly: true,
        });
        const n =
          snap.count != null
            ? snap.count
            : scraped.count;
        if (n != null) {
          try {
            localStorage.setItem('pf-count-pigs', String(n));
          } catch (_) {}
          const el = qs('#pf-pig-count', box);
          const lab = qs('#pf-pig-count-label', box);
          if (el) el.textContent = String(n);
          if (lab) lab.textContent = CZ.pigsInStable(n);
        }
        const d = snap.date || scraped.lastDate;
        if (d) {
          this.savePigLastChange(d, { force: true });
          const el = qs('#pf-pig-last-change', box);
          if (el) el.textContent = formatCzDate(d);
        }
        return Promise.resolve();
      }

      // Coalesce concurrent first loads (delayed refresh while boot loader waits)
      if (this._pigSummaryLoading && this._pigSummaryPromise) {
        return this._pigSummaryPromise;
      }

      // First paint: keep full-page loader up until count + date are ready
      this._pigSummaryLoading = true;
      this._pigSummaryPromise = loadSnapshot()
        .then(({ count, lastDate }) => {
          paint(count, lastDate);
        })
        .finally(() => {
          this._pigSummaryLoading = false;
        });
      return this._pigSummaryPromise;
    },

    sheepLastChangeKey: 'pf-sheep-last-change-v2',

    readSheepLastChange() {
      // v2 = processed-only (stav=zpracováno), same rule as pigs
      try {
        const v = localStorage.getItem(this.sheepLastChangeKey) || '';
        if (v && this.dateKey(v) >= 0) return v;
      } catch (_) {}
      return '';
    },

    saveSheepLastChange(date, opts) {
      if (!date || this.dateKey(date) < 0) return false;
      const force = opts && opts.force;
      try {
        const prev = this.readSheepLastChange() || '';
        if (!force && prev && this.dateKey(date) < this.dateKey(prev)) return false;
        localStorage.setItem(this.sheepLastChangeKey, date);
        return true;
      } catch (_) {
        return false;
      }
    },

    buildSheepPohybyGridUrl(histHref) {
      try {
        const u = new URL(histHref || location.href, location.origin);
        const idProv =
          u.searchParams.get('idProvozovnySR') ||
          u.searchParams.get('provozovnaSRKey') ||
          '00000000000000000000000000000000';
        const idSR =
          u.searchParams.get('idStajovyRegistr') ||
          u.searchParams.get('stajovyRegistrKey') ||
          '';
        const idStaj =
          u.searchParams.get('idStaj') ||
          u.searchParams.get('stajKey') ||
          '00000000000000000000000000000000';
        if (!idSR) return '';
        return (
          '/ssl/app/izr2far/StajoveRegistry/StajovyRegistrIndivPohybyGrid/RadkyPohyby' +
          '?provozovnaSRKey=' +
          encodeURIComponent(idProv) +
          '&stajovyRegistrKey=' +
          encodeURIComponent(idSR) +
          '&stajKey=' +
          encodeURIComponent(idStaj) +
          '&zvireKey=00000000000000000000000000000000'
        );
      } catch (_) {
        return '';
      }
    },

    /** Indiv grid URL (stav=A) — same source as register note / sex. */
    buildSheepIndivGridUrl(sheepHref) {
      try {
        const u = new URL(
          sheepHref ||
            PF.scrape.cached('sheep') ||
            location.href ||
            '',
          location.origin
        );
        const idProv =
          u.searchParams.get('idProvozovnySR') ||
          u.searchParams.get('provozovnaSRKey') ||
          '00000000000000000000000000000000';
        const idSR =
          u.searchParams.get('idStajovyRegistr') ||
          u.searchParams.get('stajovyRegistrKey') ||
          '';
        const idStaj =
          u.searchParams.get('idStaj') ||
          u.searchParams.get('stajKey') ||
          '00000000000000000000000000000000';
        if (!idSR) return '';
        return (
          '/ssl/app/izr2far/StajoveRegistry/StajovyRegistrIndivGrid/Indiv' +
          '?provozovnaSRKey=' +
          encodeURIComponent(idProv) +
          '&stajovyRegistrKey=' +
          encodeURIComponent(idSR) +
          '&stajKey=' +
          encodeURIComponent(idStaj) +
          '&stavZvirat=A'
        );
      } catch (_) {
        return '';
      }
    },

    /**
     * Ear → { sex, note } from Indiv (incl. red/removed) for history enrichment.
     * History Pohyby has event POZNAMKA / no sex — register uses POZNZVIRE + ID2.
     */
    parseSheepIndivByEar(html) {
      const byEar = new Map();
      if (!html) return byEar;
      try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        qsa('table.grid-table, table.dataTable, table', doc).forEach((table) => {
          const changer =
            table.getAttribute('data-changerowsel') ||
            table.getAttribute('data-changeRowSel') ||
            '';
          if (changer && /ZMENY|Zmeny/i.test(changer)) return;
          const cols =
            PF.pending && PF.pending.sheepIndivColMap
              ? PF.pending.sheepIndivColMap(table)
              : {};
          if (cols.ZNAMKA == null && cols.UZ == null) return;
          qsa('tbody tr.grid-row, tbody tr', table).forEach((tr) => {
            if (isFilterChromeRow(tr)) return;
            const cells = qsa(':scope > td', tr);
            const earIdx = cols.ZNAMKA != null ? cols.ZNAMKA : cols.UZ;
            const earRaw = earIdx != null ? cellText(cells[earIdx]) : '';
            const key =
              PF.pending && PF.pending.earKey
                ? PF.pending.earKey(earRaw)
                : norm(String(earRaw || '').replace(/\s+/g, ''));
            if (!key || key.length < 5) return;
            const sexRaw =
              cols.ID2 != null ? textOf(cells[cols.ID2]) : '';
            const sex = PF.scrape.classifySex(sexRaw) || '';
            const note =
              cols.POZNZVIRE != null
                ? friendlyDisplayText(cellText(cells[cols.POZNZVIRE]))
                : '';
            byEar.set(key, { sex, note });
          });
        });
      } catch (_) {}
      return byEar;
    },

    fetchSheepIndivByEar() {
      const sheepHref =
        PF.scrape.cached('sheep') ||
        (PF.shell &&
          PF.shell.swapController &&
          PF.shell.swapController(location.href, 'StajovyRegistrIndiv', [
            'stavDefault',
          ])) ||
        location.href;
      const gridUrl = this.buildSheepIndivGridUrl(sheepHref);
      if (!gridUrl) return Promise.resolve(new Map());
      return this.getHtml(gridUrl).then((html) =>
        this.parseSheepIndivByEar(html)
      );
    },

    findSheepHistoryGridUrls(html, histHref) {
      const found = [];
      const re =
        /\/ssl\/app\/izr2far\/StajoveRegistry\/StajovyRegistrIndivPohybyGrid\/\w+\?[^"'\\\s<>]+/gi;
      String(html || '').replace(re, (m) => {
        let url = m.replace(/&amp;/g, '&').replace(/([?&])_=\d+/g, '$1');
        url = url.replace(/[?&]$/, '').replace(/&&+/g, '&').replace(/\?&/, '?');
        if (url && !found.includes(url) && !this.isDeadUrl(url)) found.push(url);
      });
      const built = this.buildSheepPohybyGridUrl(histHref);
      if (built && !found.includes(built) && !this.isDeadUrl(built)) {
        found.unshift(built);
      }
      return found.filter((u, i, arr) => u && arr.indexOf(u) === i);
    },

    fetchSheepLastChange(sheepHref, cb) {
      const histHref = PF.shell.swapController(
        sheepHref || location.href || PF.scrape.cached('sheep'),
        'StajovyRegistrIndivPohyby',
        ['stavDefault']
      );
      if (!histHref || histHref === '#') {
        if (cb) cb(null);
        return;
      }

      // Only stav=zpracováno rows (same idea as pig Poslední změna)
      const live = this.pickLatestDate(
        this.extractChangeDatesFromRoot(document, { processedOnly: true })
      );
      const onHistory =
        /IndivPohyby/i.test(location.pathname || '') ||
        pageKind() === 'sheep-history';
      if (live && onHistory) {
        this.saveSheepLastChange(live, { force: true });
        if (cb) cb(live);
        return;
      }

      const publish = (latest, fromGrid) => {
        if (!latest) {
          if (cb) cb(null);
          return;
        }
        this.saveSheepLastChange(latest, { force: !!fromGrid });
        if (cb) cb(latest);
      };

      this.getHtml(histHref).then((pageHtml) => {
        const dates = this.extractChangeDatesFromHtml(pageHtml);
        const urls = this.findSheepHistoryGridUrls(pageHtml, histHref);
        const tryGrid = (i) => {
          if (i >= urls.length) {
            const best = this.pickLatestDate(dates);
            if (best) publish(best, false);
            else if (live) publish(live, false);
            else publish(null, false);
            return;
          }
          this.getHtml(urls[i]).then((gridHtml) => {
            const more = this.extractChangeDatesFromHtml(gridHtml);
            if (more.length) {
              publish(this.pickLatestDate(dates.concat(more)), true);
            } else {
              tryGrid(i + 1);
            }
          });
        };
        tryGrid(0);
      });
    },

    readCachedSheepSex() {
      let male = null;
      let female = null;
      try {
        const sm = localStorage.getItem('pf-count-sheep-male');
        const sf = localStorage.getItem('pf-count-sheep-female');
        if (sm != null && sm !== '') male = parseInt(sm, 10);
        if (sf != null && sf !== '') female = parseInt(sf, 10);
      } catch (_) {}
      return {
        male: male != null && !isNaN(male) ? male : null,
        female: female != null && !isNaN(female) ? female : null,
      };
    },

    renderSheepRegisterSummary() {
      const host = qs('#pf-host');
      if (!host) return Promise.resolve();

      let box = qs('#pf-sheep-summary');
      if (!box) {
        box = document.createElement('div');
        box.id = 'pf-sheep-summary';
        host.insertBefore(box, host.firstChild);
      }

      const paint = (male, female, lastDate) => {
        box.innerHTML = `
        <div class="pf-grid pf-grid-2 pf-register-summary">
          <div class="pf-panel pf-stat" style="box-shadow:none;border-style:dashed">
            <div class="pf-stat-split">
              <div class="pf-sex-stat pf-sex-stat--male">
                <div class="pf-num" id="pf-sheep-reg-male">${
                  male == null ? '—' : male
                }</div>
                <div class="pf-label" id="pf-sheep-reg-male-label">${CZ.malesInStable(
                  male
                )}</div>
              </div>
              <div class="pf-sex-stat pf-sex-stat--female">
                <div class="pf-num" id="pf-sheep-reg-female">${
                  female == null ? '—' : female
                }</div>
                <div class="pf-label" id="pf-sheep-reg-female-label">${CZ.femalesInStable(
                  female
                )}</div>
              </div>
            </div>
          </div>
          <div class="pf-panel pf-stat" style="box-shadow:none;border-style:dashed">
            <div class="pf-num pf-stat-date" id="pf-sheep-last-change">${
              lastDate ? escapeHtml(formatCzDate(lastDate)) : '—'
            }</div>
            <div class="pf-label">Poslední změna</div>
          </div>
        </div>`;
        box.dataset.pfSettled = '1';
      };

      const sheepHref = PF.scrape.cached('sheep') || location.href;
      const liveSex =
        PF.scrape.countSheepSexFromRoot(qs('#pf-host') || document) ||
        this.readCachedSheepSex();
      const cached = this.readCachedSheepSex();
      const male =
        liveSex && liveSex.male != null ? liveSex.male : cached.male;
      const female =
        liveSex && liveSex.female != null ? liveSex.female : cached.female;

      const loadDate = () =>
        new Promise((resolve) => {
          this.fetchSheepLastChange(sheepHref, (d) => {
            resolve(d || this.readSheepLastChange() || '');
          });
        });

      const updateCounts = (m, f) => {
        const mEl = qs('#pf-sheep-reg-male', box);
        const fEl = qs('#pf-sheep-reg-female', box);
        const mLab = qs('#pf-sheep-reg-male-label', box);
        const fLab = qs('#pf-sheep-reg-female-label', box);
        if (m != null) {
          if (mEl) mEl.textContent = String(m);
          if (mLab) mLab.textContent = CZ.malesInStable(m);
        }
        if (f != null) {
          if (fEl) fEl.textContent = String(f);
          if (fLab) fLab.textContent = CZ.femalesInStable(f);
        }
      };

      if (box.dataset.pfSettled === '1' && qs('#pf-sheep-last-change', box)) {
        updateCounts(male, female);
        // On Historie, refresh from zpracováno rows; on Registr keep cached date
        const onHistory = pageKind() === 'sheep-history';
        const d = onHistory
          ? this.pickLatestDate(
              this.extractChangeDatesFromRoot(document, {
                processedOnly: true,
              })
            ) || this.readSheepLastChange()
          : this.readSheepLastChange();
        if (d) {
          this.saveSheepLastChange(d, { force: true });
          const el = qs('#pf-sheep-last-change', box);
          if (el) el.textContent = formatCzDate(d);
        }
        return Promise.resolve();
      }

      if (this._sheepSummaryLoading && this._sheepSummaryPromise) {
        return this._sheepSummaryPromise;
      }

      this._sheepSummaryLoading = true;
      // Paint counts immediately; fill date when ready
      paint(male, female, this.readSheepLastChange() || null);
      this._sheepSummaryPromise = loadDate()
        .then((lastDate) => {
          const el = qs('#pf-sheep-last-change', box);
          if (el) el.textContent = lastDate ? formatCzDate(lastDate) : '—';
          const sex =
            PF.scrape.countSheepSexFromRoot(qs('#pf-host') || document) || {};
          updateCounts(
            sex.male != null ? sex.male : male,
            sex.female != null ? sex.female : female
          );
        })
        .finally(() => {
          this._sheepSummaryLoading = false;
        });
      return this._sheepSummaryPromise;
    },

    simplifyTables(kind) {
      const host = qs('#pf-host');
      if (!host) return;

      this.hideFarmChrome(host);

      // Pig Registr: summary only — hide native grids / leftover chrome
      if (kind === 'pig') {
        qsa(
          [
            '.grid',
            '.grid-full-width',
            'table.grid-table',
            'table.dataTable',
            '.paging',
            '.grid-paging',
            '.dt-buttons',
            '.popup',
            '.popup-profiles',
            '.popup-columns',
            '.dataTables_wrapper',
          ].join(', '),
          host
        ).forEach((el) => {
          el.classList.add('pf-native-grid-hide');
          if (el.matches && el.matches('table')) el.dataset.pfSimplified = '1';
          qsa('table.grid-table, table.dataTable', el).forEach((t) => {
            t.dataset.pfSimplified = '1';
          });
        });
        qsa(
          'a, button, input[type=button], input[type=submit], h2, h3, h4, legend, .detail-header, label, span, strong, b, div, fieldset, .entity-editor-group',
          host
        ).forEach((el) => {
          if (el.closest('#pf-pig-summary') || el.closest('#pf-sheep-summary'))
            return;
          const own =
            norm(
              Array.from(el.childNodes)
                .filter((n) => n.nodeType === 3)
                .map((n) => n.textContent)
                .join(' ')
            ) || '';
          const t = norm(
            textOf(el) +
              ' ' +
              (el.getAttribute('title') || '') +
              ' ' +
              (el.value || '') +
              ' ' +
              (el.getAttribute('href') || '') +
              ' ' +
              (el.getAttribute('onclick') || '')
          );
          const isTiskSection =
            /tisk registru/.test(own) ||
            (/tisk registru/.test(t) && t.length < 100);
          const isPrintCtrl =
            el.matches('a, button, input') &&
            /tisk|print|excel|export|csv|pdf|sestavy|hromadn/.test(t);
          if (!isTiskSection && !isPrintCtrl) return;
          const box =
            el.closest('fieldset') ||
            el.closest('.entity-editor-group') ||
            el.closest('.header-wrap') ||
            el.closest('.wideInputs') ||
            el.closest('.detail-header') ||
            (isTiskSection ? el.parentElement : null) ||
            el;
          box.classList.add('pf-native-grid-hide');
        });
        return this.renderPigRegisterSummary();
      }

      // Hide non-table chrome inside grids
      qsa(
        [
          '.popup',
          '.popup-profiles',
          '.popup-columns',
          '.paging',
          '.grid-paging',
          '.dt-buttons',
          '.dataTables_filter',
          '.dataTables_length',
          '.dataTables_info',
          '.dataTables_paginate',
          '.profiles',
          '.newprofile',
          '.columns',
          '.sorting-title',
          '.all-select',
          '.all-deselect',
        ].join(', '),
        host
      ).forEach((el) => el.classList.add('pf-native-grid-hide'));

      // Hide leftover intro paragraphs / delete tooling that is not our toolbar
      qsa('p', host).forEach((p) => {
        if (/filtruje|seznam pohyb/i.test(textOf(p))) {
          p.classList.add('pf-native-grid-hide');
        }
      });
      qsa('a.toolbutton, a.tb-confirm-question, a, button, input[type=button], input[type=submit]', host).forEach((a) => {
        const t = norm(
          textOf(a) +
            ' ' +
            (a.getAttribute('title') || '') +
            ' ' +
            (a.value || '')
        );
        const href = a.getAttribute('href') || '';
        if (/smazat/.test(t) && !kind.includes('send')) {
          a.classList.add('pf-native-grid-hide');
        }
        if (/tisk|print|excel|export|csv|pdf|kopirovat|kopírovat/.test(t)) {
          a.classList.add('pf-native-grid-hide');
        }
        // Pig history: "Zobrazit pohyby prasat do 7 dnů v ÚE"
        if (
          kind === 'pig-history' &&
          (/zobrazit pohyby prasat/.test(t) ||
            (/pohyby prasat/.test(t) && /7 dn/.test(t)) ||
            /7 dnu v ue/.test(t) ||
            /HlaseniPrasata7Dni/i.test(href))
        ) {
          const box = a.closest('li') || a.closest('.toolbutton') || a;
          box.classList.add('pf-native-grid-hide');
        }
      });

      qsa('table.grid-table, table.dataTable', host).forEach((table) => {
        if (table.dataset.pfSimplified === '1') return;
        if (table.closest('.pf-simple-table-wrap')) return;
        // Skip tiny nested tables inside headers/filters
        if (table.closest('th, .popup')) return;

        const headRow =
          qs('thead tr', table) ||
          qsa('tr', table).find((tr) => qs('th', tr));
        if (!headRow) return;

        const ths = qsa(':scope > th, :scope > td', headRow).length
          ? qsa(':scope > th, :scope > td', headRow)
          : qsa('th', headRow);
        if (!ths.length) return;

        const labels = ths.map((th) => this.headerLabel(th));
        const keepIdx = [];
        labels.forEach((label, idx) => {
          const t = norm(label);
          // Allow empty visible label if data-colname is meaningful
          if (!t && !ths[idx].getAttribute('data-colname')) return;
          // Skip checkbox / action chrome columns
          const col = String(ths[idx].getAttribute('data-colname') || '').toUpperCase();
          if (col === 'CHECK_ID' || ths[idx].classList.contains('check-column')) return;
          if (this.shouldKeepColumn(kind, label, ths[idx])) keepIdx.push(idx);
        });

        // Sheep register: put Poznámka (POZNZVIRE) last
        if (kind === 'sheep' && keepIdx.length > 1) {
          const isNoteCol = (idx) => {
            const blob = norm(
              (labels[idx] || '') +
                ' ' +
                (ths[idx].getAttribute('data-colname') || '')
            );
            return /poznzvire|poznamka\s*zvire|^poznamka$/.test(blob);
          };
          const notes = keepIdx.filter(isNoteCol);
          const rest = keepIdx.filter((i) => !isNoteCol(i));
          if (notes.length) keepIdx.splice(0, keepIdx.length, ...rest, ...notes);
        }

        // Sheep/pig history: put Stav last
        if (
          (kind === 'sheep-history' || kind === 'pig-history') &&
          keepIdx.length > 1
        ) {
          const isStavCol = (idx) => {
            const blob = norm(
              (labels[idx] || '') +
                ' ' +
                (ths[idx].getAttribute('data-colname') || '')
            );
            return (
              /^stav$/.test(norm(labels[idx] || '')) ||
              norm(ths[idx].getAttribute('data-colname') || '') === 'stav' ||
              /^stav(\s+prisun)?$/.test(blob)
            );
          };
          const stav = keepIdx.filter(isStavCol);
          const rest = keepIdx.filter((i) => !isStavCol(i));
          if (stav.length) keepIdx.splice(0, keepIdx.length, ...rest, ...stav);
        }

        // Sheep history: ear col for Indiv note/sex enrichment
        const historyEnrich =
          kind === 'sheep-history' ? this._sheepIndivByEar || null : null;
        let historyEarCol = -1;
        let historyNoteCol = -1;
        if (kind === 'sheep-history') {
          keepIdx.forEach((idx) => {
            const blob = norm(
              (labels[idx] || '') +
                ' ' +
                (ths[idx].getAttribute('data-colname') || '')
            );
            if (historyEarCol < 0 && /usni|(?:^|[^a-z])znamka/.test(blob)) {
              historyEarCol = idx;
            }
            if (
              historyNoteCol < 0 &&
              (/^poznamka$/.test(norm(labels[idx] || '')) ||
                norm(ths[idx].getAttribute('data-colname') || '') ===
                  'poznamka') &&
              !/prisun/.test(blob)
            ) {
              historyNoteCol = idx;
            }
          });
          // Also find ear among all native cols if not kept somehow
          if (historyEarCol < 0) {
            ths.forEach((th, idx) => {
              const blob = norm(
                (labels[idx] || '') +
                  ' ' +
                  (th.getAttribute('data-colname') || '')
              );
              if (/usni|(?:^|[^a-z])znamka/.test(blob)) historyEarCol = idx;
            });
          }
        }

        // Fallback: if filters matched nothing, keep every non-chrome column
        // so the register never goes blank after an AJAX refresh.
        if (!keepIdx.length) {
          labels.forEach((label, idx) => {
            const col = String(ths[idx].getAttribute('data-colname') || '').toUpperCase();
            if (col === 'CHECK_ID' || ths[idx].classList.contains('check-column'))
              return;
            if (!norm(label) && !col) return;
            if (/\bprovozovn|\bstaj\b|\bstaje\b|hlasici/.test(norm(label + ' ' + col)))
              return;
            if (
              (kind === 'sheep-history' || kind === 'sheep-send') &&
              /zalozen/.test(norm(label + ' ' + col))
            )
              return;
            if (
              kind.startsWith('pig') &&
              (/typ\s*hlaseni|typhlaseni/.test(norm(label + ' ' + col)) ||
                /^akce$/.test(norm(label)) ||
                /\bakce\b/.test(norm(label)) ||
                /datum\s*aktualiz|dataktual|aktualizace/.test(
                  norm(label + ' ' + col)
                ))
            )
              return;
            if (
              (kind === 'pig-history' || kind === 'pig-send') &&
              (col === 'KONECNYSTAV' ||
                /konecnystav|konecny_stav|stavkonecn/.test(
                  norm(label + ' ' + col).replace(/\s/g, '')
                ) ||
                (/konecn/.test(norm(label + ' ' + col)) &&
                  /stav/.test(norm(label + ' ' + col))))
            )
              return;
            if (
              kind.startsWith('pig') &&
              (this.isExcludedColumn(label) || this.isExcludedColumn(col))
            )
              return;
            keepIdx.push(idx);
          });
        }

        if (!keepIdx.length) return;

        const rawRows = qsa('tbody tr.grid-row', table);
        const candidateRows = rawRows.length
          ? rawRows
          : qsa('tbody tr', table);
        const dataRows = candidateRows.filter(
          (tr) =>
            !isFilterChromeRow(tr) &&
            qsa(':scope > td', tr).length > 0 &&
            !tr.closest('.popup, .popup-filter, .filter-info')
        );

        // Sheep herd: zpracováno + not red (pending outbound stay until ÚE)
        const herdRows =
          kind === 'sheep'
            ? dataRows.filter((tr) => this.isSheepHerdRow(tr, table))
            : dataRows;

        const needsSelect =
          kind === 'sheep' ||
          kind === 'sheep-send' ||
          (kind === 'pig-send');
        const rowHasNativeCheck = (row) =>
          !!(
            qs(
              'td.check-column input[type="checkbox"], input[name="ids"], input[type="checkbox"]',
              row
            )
          );
        const selectable = needsSelect && herdRows.some(rowHasNativeCheck);

        const wrap = document.createElement('div');
        wrap.className = 'pf-simple-table-wrap';
        if (selectable && kind === 'sheep') {
          const hint = document.createElement('p');
          hint.className = 'pf-select-hint';
          hint.textContent =
            'Zaškrtněte ovce v tabulce — akce (porážka, odsun, zcizení) je vezme všechny, každou na vlastní řádek.';
          wrap.appendChild(hint);
        }

        const simple = document.createElement('table');
        simple.className = 'pf-simple-table';

        const thead = document.createElement('thead');
        const hr = document.createElement('tr');
        let selectAllCb = null;
        if (selectable) {
          const th = document.createElement('th');
          th.className = 'pf-select-col';
          th.removeAttribute('title');
          selectAllCb = document.createElement('input');
          selectAllCb.type = 'checkbox';
          selectAllCb.className = 'pf-row-check';
          selectAllCb.setAttribute('aria-label', 'Vybrat vše');
          selectAllCb.removeAttribute('title');
          th.appendChild(selectAllCb);
          hr.appendChild(th);
        }
        keepIdx.forEach((i) => {
          const th = document.createElement('th');
          th.textContent = this.displayHeaderLabel(kind, labels[i] || '');
          hr.appendChild(th);
        });
        thead.appendChild(hr);
        simple.appendChild(thead);

        const tbody = document.createElement('tbody');
        const rowChecks = [];
        if (!herdRows.length) {
          const tr = document.createElement('tr');
          const td = document.createElement('td');
          td.colSpan = keepIdx.length + (selectable ? 1 : 0);
          td.className = 'pf-simple-empty';
          td.textContent = 'Žádné záznamy';
          tr.appendChild(td);
          tbody.appendChild(tr);
        } else {
          herdRows.forEach((row) => {
            const cells = qsa(':scope > td', row);
            if (!cells.length) return;
            const tr = document.createElement('tr');
            let cb = null;

            if (selectable && rowHasNativeCheck(row)) {
              const tdSel = document.createElement('td');
              tdSel.className = 'pf-select-col';
              cb = document.createElement('input');
              cb.type = 'checkbox';
              cb.className = 'pf-row-check';
              const nativeCb = qs(
                'td.check-column input[type="checkbox"], input[name="ids"], input[type="checkbox"]',
                row
              );
              cb.checked = !!(nativeCb && nativeCb.checked);
              const sync = (on, { fromSelectAll } = {}) => {
                cb.checked = on;
                tr.classList.toggle('pf-row-selected', on);
                PF.registers.syncNativeRowSelect(row, on);
                if (selectAllCb && !fromSelectAll && !wrap._pfSelectAllBusy) {
                  const allOn =
                    rowChecks.length && rowChecks.every((c) => c.checked);
                  selectAllCb.checked = allOn;
                  selectAllCb.indeterminate =
                    !allOn && rowChecks.some((c) => c.checked);
                }
                if (!fromSelectAll && !wrap._pfSelectAllBusy) {
                  PF.registers.updateSheepActionAvailability();
                }
              };
              cb.addEventListener('click', (e) => e.stopPropagation());
              cb.addEventListener('change', () => {
                if (wrap._pfSelectAllBusy) return;
                sync(cb.checked);
              });
              tdSel.appendChild(cb);
              tr.appendChild(tdSel);
              tr.classList.add('pf-row-selectable');
              if (cb.checked) tr.classList.add('pf-row-selected');
              tr.addEventListener('click', (e) => {
                if (e.target && e.target.closest && e.target.closest('a,button,input,label'))
                  return;
                if (wrap._pfSelectAllBusy) return;
                sync(!cb.checked);
              });
              // Keep a stable sync hook for select-all without going through change
              cb._pfSync = sync;
              rowChecks.push(cb);
            } else if (selectable) {
              const tdSel = document.createElement('td');
              tdSel.className = 'pf-select-col';
              tr.appendChild(tdSel);
            }

            // Sheep history: resolve ear → register note/sex (Indiv) once per row
            let historyAnimal = null;
            if (kind === 'sheep-history') {
              const earRaw =
                historyEarCol >= 0 && cells[historyEarCol]
                  ? cellText(cells[historyEarCol])
                  : '';
              const earKey =
                PF.pending && PF.pending.earKey
                  ? PF.pending.earKey(earRaw)
                  : norm(String(earRaw || '').replace(/\s+/g, ''));
              if (earKey && historyEnrich) {
                historyAnimal = historyEnrich.get(earKey) || null;
              }
              if (historyAnimal && historyAnimal.sex === 'male') {
                tr.classList.add('pf-sex-male');
              } else if (historyAnimal && historyAnimal.sex === 'female') {
                tr.classList.add('pf-sex-female');
              }
            }

            keepIdx.forEach((i) => {
              const td = document.createElement('td');
              const src = cells[i];
              const raw = src ? cellText(src) : '';
              const shown = this.displayHeaderLabel(kind, labels[i] || '');
              const labelBlob = norm(labels[i] + ' ' + shown);
              const asDateOnly =
                isNahlaseniColumn(kind, labels[i], ths[i]) ||
                shown === 'Datum přidání' ||
                shown === 'Datum narození' ||
                /prich|pridan/.test(labelBlob);

              // Sheep history: Poznámka = animal note from Registr (POZNZVIRE),
              // never Pohyby event note ("Domácí porážka;", "Počáteční stav")
              if (kind === 'sheep-history' && i === historyNoteCol) {
                td.textContent =
                  (historyAnimal && historyAnimal.note) || '';
              } else {
                td.textContent = asDateOnly
                  ? dateOnlyText(raw)
                  : friendlyDisplayText(raw);
              }

              // Sheep register: make sex obvious without reading the cell text
              if (
                (kind === 'sheep' || kind === 'sheep-history') &&
                /pohlav/.test(labelBlob)
              ) {
                const sex = PF.scrape.classifySex(raw) || PF.scrape.classifySex(td.textContent);
                if (sex === 'male' || sex === 'female') {
                  tr.classList.add(sex === 'male' ? 'pf-sex-male' : 'pf-sex-female');
                  const wrapSex = document.createElement('span');
                  wrapSex.className = 'pf-sex-cell';
                  const mark = document.createElement('span');
                  mark.className = 'pf-sex-mark';
                  mark.setAttribute('aria-hidden', 'true');
                  mark.textContent = sex === 'male' ? '♂' : '♀';
                  const txt = document.createElement('span');
                  txt.textContent =
                    td.textContent || (sex === 'male' ? 'Samec' : 'Samice');
                  wrapSex.appendChild(mark);
                  wrapSex.appendChild(txt);
                  td.textContent = '';
                  td.appendChild(wrapSex);
                }
              }
              tr.appendChild(td);
            });
            // If Pohlaví column was hidden, still try to classify from the native row
            if (
              kind === 'sheep' &&
              !tr.classList.contains('pf-sex-male') &&
              !tr.classList.contains('pf-sex-female')
            ) {
              const sexFromRow = PF.scrape.classifySex(textOf(row));
              if (sexFromRow === 'male') tr.classList.add('pf-sex-male');
              else if (sexFromRow === 'female') tr.classList.add('pf-sex-female');
            }
            // Skip completely empty data rows
            const dataCells = [...tr.querySelectorAll('td:not(.pf-select-col)')];
            if (dataCells.every((c) => !c.textContent.trim())) return;
            // Skip residual filter-operator chrome rows
            if (isFilterChromeRow(tr)) return;
            tbody.appendChild(tr);
          });
        }
        simple.appendChild(tbody);

        if (selectAllCb && rowChecks.length) {
          const updateSelectAllUi = () => {
            const allOn = rowChecks.every((c) => c.checked);
            const someOn = rowChecks.some((c) => c.checked);
            selectAllCb.checked = allOn;
            selectAllCb.indeterminate = !allOn && someOn;
          };
          updateSelectAllUi();
          selectAllCb.addEventListener('click', (e) => e.stopPropagation());
          selectAllCb.addEventListener('change', () => {
            const on = selectAllCb.checked;
            wrap._pfSelectAllBusy = true;
            selectAllCb.indeterminate = false;
            try {
              rowChecks.forEach((c) => {
                if (typeof c._pfSync === 'function') {
                  c._pfSync(on, { fromSelectAll: true });
                } else {
                  c.checked = on;
                }
              });
            } finally {
              wrap._pfSelectAllBusy = false;
            }
            // Force final header state after bulk sync (do not let mid-loop flips stick)
            selectAllCb.checked = on;
            selectAllCb.indeterminate = false;
            if (!on) updateSelectAllUi();
            PF.registers.updateSheepActionAvailability();
          });
        }

        wrap.appendChild(simple);

        // Hide original grid block, show simple table in #pf-host (never inside a
        // hidden ancestor — that caused blank Registr after AJAX refreshes).
        const gridRoot =
          table.closest('.grid') ||
          table.closest('.grid-full-width') ||
          table.parentElement;
        if (gridRoot && host.contains(gridRoot)) {
          gridRoot.classList.add('pf-native-grid-hide');
        } else {
          table.classList.add('pf-native-grid-hide');
        }
        // Strip old-UI checkbox tooltips so they cannot leak over the simple table
        qsa(
          'th.check-column, td.check-column, th.check-column *, td.check-column *, input[type="checkbox"]',
          table
        ).forEach((el) => {
          try {
            el.removeAttribute('title');
            el.removeAttribute('data-original-title');
            el.classList.remove('has-tooltip', 'tooltipstered');
          } catch (_) {}
        });
        host.appendChild(wrap);
        table.dataset.pfSimplified = '1';
      });
    },

    syncNativeRowSelect(nativeRow, selected) {
      if (!nativeRow) return;
      const cb = qs(
        'td.check-column input[type="checkbox"], input[name="ids"], input[type="checkbox"]',
        nativeRow
      );
      if (!cb) return;
      if (!!cb.checked === !!selected) return;
      try {
        // Click runs portal handlers (ChangeRowState, etc.)
        cb.click();
      } catch (_) {}
      if (!!cb.checked !== !!selected) {
        cb.checked = !!selected;
        try {
          if (refresh$() && $(cb).trigger) $(cb).trigger('change');
          else cb.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (_) {}
      }
      nativeRow.classList.toggle('selected', !!selected);
      nativeRow.classList.toggle('row-selected', !!selected);
    },

    hideNoiseActions(kind) {
      if (!(kind === 'sheep' || kind === 'pig')) return;
      const allow = kind === 'sheep' ? PF.config.sheepActions : PF.config.pigActions;
      qsa('#pf-host a, #pf-host button, #main a[onclick]').forEach((el) => {
        if (el.closest('#pf-toolbar') || el.closest('#pf-app .pf-nav')) return;
        const oc = el.getAttribute('onclick') || '';
        const blob = norm(textOf(el) + ' ' + oc + ' ' + (el.title || ''));
        if (!/otevritDialogZmeny|DialogPorizeni|zobrazitDialogSRSkup|typZmeny=/i.test(oc + (el.href || '')))
          return;
        const ok = allow.some(
          (a) =>
            (a.typ && new RegExp(a.typ, 'i').test(oc)) ||
            (a.labels || []).some((l) => blob.includes(norm(l))) ||
            (a.code && blob.includes('(' + a.code + ')'))
        );
        if (!ok) el.classList.add('pf-action-hide');
      });
    },

    refresh(kind) {
      const run = () =>
        PF._pfQuietMutate(() => {
          // Sheep: need "vše" so pending outbound animals remain in the list
          if (kind === 'sheep' && this.ensureSheepStavVse()) {
            return Promise.resolve();
          }

          // Pig register: don't restart while the initial date fetch is in flight
          if (kind === 'pig' && this._pigSummaryLoading) {
            return this._pigSummaryPromise || Promise.resolve();
          }

          this.moveContentToHost();
          this.hideFarmChrome(document);
          this.buildToolbar(kind);
          const pigSettled =
            kind === 'pig' &&
            qs('#pf-pig-summary') &&
            qs('#pf-pig-summary').dataset.pfSettled === '1';
          const sheepSettled =
            kind === 'sheep' &&
            qs('#pf-sheep-summary') &&
            qs('#pf-sheep-summary').dataset.pfSettled === '1';
          // Don't tear down a settled pig/sheep summary — that caused Načítám… flicker
          if (pigSettled || sheepSettled) {
            qsa('#pf-host .pf-simple-table-wrap').forEach((el) => el.remove());
          } else {
            qsa(
              '#pf-host .pf-simple-table-wrap, #pf-pig-summary, #pf-sheep-summary'
            ).forEach((el) => el.remove());
          }
          // Always restore native grids so a failed simplify cannot leave a blank host
          qsa('#pf-host .pf-native-grid-hide').forEach((el) =>
            el.classList.remove('pf-native-grid-hide')
          );
          qsa('#pf-host table[data-pf-simplified]').forEach((t) => {
            t.dataset.pfSimplified = '0';
          });
          const ready = this.simplifyTables(kind);
          this.hideNoiseActions(kind);

          // Sheep Registr: if simplify produced nothing, keep native grid visible
          // so the animal list never disappears after chrome/AJAX races.
          if (kind === 'sheep') {
            const host = qs('#pf-host');
            if (host && !qs('.pf-simple-table-wrap', host)) {
              qsa(
                'table.grid-table, table.dataTable, .grid, .grid-full-width',
                host
              ).forEach((el) => {
                el.classList.remove('pf-native-grid-hide');
                if (el.dataset) el.dataset.pfSimplified = '0';
              });
            }
            this.updateSheepActionAvailability();
          }

          // Refresh cached sheep sex breakdown from register table
          if (kind === 'sheep') {
            const sex = PF.scrape.countSheepSexFromRoot(
              qs('#pf-host') || document
            );
            if (sex) PF.scrape.saveSheepSexCounts(sex.male, sex.female);
            this.renderSheepRegisterSummary();
          }

          // Cache latest pig change date + herd size while browsing Historie
          if (kind === 'pig-history') {
            const host = qs('#pf-host') || document;
            const snap = this.extractLatestProcessedSnapshotFromRoot(host, {
              processedOnly: true,
            });
            if (snap.date) this.savePigLastChange(snap.date, { force: true });
            if (snap.count != null) {
              try {
                localStorage.setItem('pf-count-pigs', String(snap.count));
              } catch (_) {}
            } else {
              const latest = this.pickLatestDate(
                this.extractChangeDatesFromRoot(host, { processedOnly: true })
              );
              if (latest) this.savePigLastChange(latest, { force: true });
            }
          }
          if (kind === 'sheep-history') {
            const host = qs('#pf-host') || document;
            const latest = this.pickLatestDate(
              this.extractChangeDatesFromRoot(host, { processedOnly: true })
            );
            if (latest) this.saveSheepLastChange(latest, { force: true });
          }

          // Pending table: wait until Zmeny+Indiv merge is ready (sheep & pigs)
          let pendingReady = Promise.resolve();
          if (kind === 'pig' || kind === 'sheep') {
            // Hide stale pending until the fresh load paints once
            if (kind === 'sheep') {
              try {
                PF.pending.showSection(false);
                PF.pending.state.rows = [];
              } catch (_) {}
              if (sheepSettled) {
                try {
                  PF.loader.holdBusy('Načítám…');
                } catch (_) {}
              }
            }
            pendingReady =
              PF.pending.refresh(kind, {
                force: kind === 'sheep' ? !!sheepSettled : false,
              }) || Promise.resolve();
          }

          const base =
            ready && typeof ready.then === 'function'
              ? ready
              : Promise.resolve();
          return base
            .then(() => pendingReady)
            .catch(() => pendingReady)
            .finally(() => {
              if (kind === 'sheep' && sheepSettled) {
                try {
                  PF.loader.releaseBusy();
                } catch (_) {}
              }
            });
        });

      // Sheep history: load Indiv note/sex before paint (Pohyby lacks both)
      if (kind === 'sheep-history') {
        return this.fetchSheepIndivByEar()
          .then((map) => {
            this._sheepIndivByEar = map || new Map();
          })
          .catch(() => {
            this._sheepIndivByEar = new Map();
          })
          .then(() => run());
      }
      return run();
    },
  };

  /* ------------------------------------------------------------------ */
  /* Minimal date calendar (focus → popup)                              */
  /* ------------------------------------------------------------------ */
  PF.datePicker = {
    _open: null,
    _docBound: false,
    months: [
      'leden',
      'únor',
      'březen',
      'duben',
      'květen',
      'červen',
      'červenec',
      'srpen',
      'září',
      'říjen',
      'listopad',
      'prosinec',
    ],
    dow: ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'],

    startOfDay(d) {
      const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      x.setHours(0, 0, 0, 0);
      return x;
    },

    today() {
      return this.startOfDay(new Date());
    },

    addDays(d, n) {
      const x = this.startOfDay(d);
      x.setDate(x.getDate() + n);
      return x;
    },

    parse(s) {
      const m = String(s || '')
        .trim()
        .match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
      if (!m) return null;
      const d = new Date(
        parseInt(m[3], 10),
        parseInt(m[2], 10) - 1,
        parseInt(m[1], 10)
      );
      if (isNaN(d.getTime())) return null;
      return this.startOfDay(d);
    },

    format(d) {
      if (!d) return '';
      return formatCzDate(
        d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear()
      );
    },

    sameDay(a, b) {
      return (
        a &&
        b &&
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
      );
    },

    bounds(opts) {
      const max = this.today();
      let min = null;
      if (opts && opts.maxDaysBack != null && opts.maxDaysBack >= 0) {
        min = this.addDays(max, -opts.maxDaysBack);
      }
      return { min, max };
    },

    clamp(d, opts) {
      if (!d) return null;
      const { min, max } = this.bounds(opts);
      if (min && d < min) return min;
      if (max && d > max) return max;
      return d;
    },

    inRange(d, opts) {
      if (!d) return false;
      const { min, max } = this.bounds(opts);
      if (min && d < min) return false;
      if (max && d > max) return false;
      return true;
    },

    close() {
      if (this._open) {
        this._open.remove();
        this._open = null;
      }
    },

    ensureDocClose() {
      if (this._docBound) return;
      this._docBound = true;
      document.addEventListener(
        'mousedown',
        (e) => {
          if (!this._open) return;
          const t = e.target;
          if (this._open.contains(t)) return;
          if (t && t.closest && t.closest('input.pf-has-cal')) return;
          this.close();
        },
        true
      );
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.close();
      });
    },

    position(cal, input) {
      const r = input.getBoundingClientRect();
      const pad = 8;
      let top = r.bottom + pad + window.scrollY;
      let left = r.left + window.scrollX;
      const w = 268;
      if (left + w > window.scrollX + window.innerWidth - 12) {
        left = window.scrollX + window.innerWidth - w - 12;
      }
      if (left < window.scrollX + 8) left = window.scrollX + 8;
      // Flip above if not enough room below
      const spaceBelow = window.innerHeight - r.bottom;
      if (spaceBelow < 300 && r.top > spaceBelow) {
        top = r.top + window.scrollY - 292 - pad;
      }
      cal.style.top = Math.max(8, top) + 'px';
      cal.style.left = left + 'px';
    },

    renderMonth(cal, input, opts, view) {
      const { min, max } = this.bounds(opts);
      const selected = this.parse(input.value) || this.today();
      const today = this.today();
      const y = view.getFullYear();
      const m = view.getMonth();

      const title = qs('.pf-cal-title', cal);
      if (title) title.textContent = this.months[m] + ' ' + y;

      const prevBtn = qs('[data-pf-cal-prev]', cal);
      const nextBtn = qs('[data-pf-cal-next]', cal);
      if (prevBtn) {
        const prevMonthEnd = new Date(y, m, 0);
        prevBtn.disabled = !!(min && prevMonthEnd < min);
      }
      if (nextBtn) {
        const nextMonthStart = new Date(y, m + 1, 1);
        nextBtn.disabled = !!(max && nextMonthStart > max);
      }

      const grid = qs('.pf-cal-grid', cal);
      if (!grid) return;
      grid.innerHTML = '';

      // Monday-first offset
      const first = new Date(y, m, 1);
      let startDow = first.getDay() - 1;
      if (startDow < 0) startDow = 6;
      const daysInMonth = new Date(y, m + 1, 0).getDate();

      for (let i = 0; i < startDow; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'pf-cal-day is-empty';
        b.tabIndex = -1;
        b.disabled = true;
        grid.appendChild(b);
      }

      for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(y, m, day);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pf-cal-day';
        btn.textContent = String(day);
        const ok = this.inRange(d, opts);
        if (!ok) {
          btn.disabled = true;
          btn.classList.add('is-out');
        }
        if (this.sameDay(d, today)) btn.classList.add('is-today');
        if (this.sameDay(d, selected)) btn.classList.add('is-selected');
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!ok) return;
          input.value = this.format(d);
          try {
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
          } catch (_) {}
          // Suppress reopen from the focus/click handlers while we blur
          input.dataset.pfCalSuppress = '1';
          this.close();
          input.blur();
          setTimeout(() => {
            delete input.dataset.pfCalSuppress;
          }, 200);
        });
        grid.appendChild(btn);
      }
    },

    open(input, opts) {
      this.ensureDocClose();
      this.close();

      let view =
        this.parse(input.value) ||
        this.clamp(this.today(), opts) ||
        this.today();
      view = new Date(view.getFullYear(), view.getMonth(), 1);

      const cal = document.createElement('div');
      cal.className = 'pf-cal';
      cal.setAttribute('role', 'dialog');
      cal.setAttribute('aria-label', 'Kalendář');
      const hint =
        opts && opts.maxDaysBack != null && opts.maxDaysBack >= 0
          ? 'Povoleno: posledních ' +
            opts.maxDaysBack +
            ' dní'
          : 'Nelze zvolit budoucí datum';
      cal.innerHTML =
        '<div class="pf-cal-head">' +
        '<button type="button" class="pf-cal-nav" data-pf-cal-prev aria-label="Předchozí měsíc">‹</button>' +
        '<div class="pf-cal-title"></div>' +
        '<button type="button" class="pf-cal-nav" data-pf-cal-next aria-label="Další měsíc">›</button>' +
        '</div>' +
        '<div class="pf-cal-dow">' +
        this.dow.map((d) => '<span>' + d + '</span>').join('') +
        '</div>' +
        '<div class="pf-cal-grid"></div>' +
        '<p class="pf-cal-hint">' +
        escapeHtml(hint) +
        '</p>';

      document.body.appendChild(cal);
      this._open = cal;
      this.position(cal, input);
      this.renderMonth(cal, input, opts, view);

      qs('[data-pf-cal-prev]', cal).addEventListener('click', (e) => {
        e.preventDefault();
        view = new Date(view.getFullYear(), view.getMonth() - 1, 1);
        this.renderMonth(cal, input, opts, view);
      });
      qs('[data-pf-cal-next]', cal).addEventListener('click', (e) => {
        e.preventDefault();
        view = new Date(view.getFullYear(), view.getMonth() + 1, 1);
        this.renderMonth(cal, input, opts, view);
      });
    },

    /**
     * @param {HTMLInputElement} input
     * @param {{ maxDaysBack?: number|null }} opts
     *   maxDaysBack: 7 → pigs (today back 7 days); null/omit → sheep (no future only)
     */
    attach(input, opts) {
      if (!input || input.dataset.pfCal === '1') return;
      input.dataset.pfCal = '1';
      input.classList.add('pf-has-cal');
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('inputmode', 'numeric');

      const o = opts || {};
      // Clamp current value into allowed range
      const cur = this.parse(input.value);
      if (cur) {
        const clamped = this.clamp(cur, o);
        if (clamped && !this.sameDay(cur, clamped)) {
          input.value = this.format(clamped);
        } else {
          input.value = this.format(cur);
        }
      }

      // Drop native jQuery UI datepicker if present (sheep portal dialogs)
      try {
        if (refresh$() && input.classList.contains('hasDatepicker')) {
          $(input).datepicker('destroy');
        }
      } catch (_) {}

      const openCal = () => {
        if (input.dataset.pfCalSuppress === '1') return;
        this.open(input, o);
      };
      input.addEventListener('focus', openCal);
      input.addEventListener('click', openCal);

      input.addEventListener('blur', () => {
        // Normalize typed value after a tick (allow day-click first)
        setTimeout(() => {
          const d = this.parse(input.value);
          if (!d) return;
          const c = this.clamp(d, o);
          if (c) input.value = this.format(c);
        }, 180);
      });
    },

    /** Enhance date fields inside a portal dialog (sheep/pig). */
    enhanceDialog(root) {
      if (!root) return;
      const kind = typeof pageKind === 'function' ? pageKind() : '';
      const pig = String(kind).startsWith('pig');
      const opts = pig ? { maxDaysBack: 7 } : { maxDaysBack: null };
      qsa(
        [
          'input.datepicker',
          'input.hasDatepicker',
          'input[name*="atum" i]',
          'input[id*="atum" i]',
          'input[name*="Datum"]',
          'input[id*="Datum"]',
        ].join(', '),
        root
      ).forEach((inp) => {
        if (!inp || inp.type === 'hidden') return;
        // Skip non-date-looking fields
        const blob = norm(
          (inp.id || '') +
            ' ' +
            (inp.name || '') +
            ' ' +
            (inp.getAttribute('aria-label') || '') +
            ' ' +
            (inp.placeholder || '')
        );
        const row = inp.closest('tr, .member-editor, .form-group, .pf-modal-field');
        const rowBlob = row ? norm(textOf(row).slice(0, 80)) : '';
        if (
          !/datum|date|naroz|zmen/.test(blob + ' ' + rowBlob) &&
          !inp.classList.contains('datepicker') &&
          !inp.classList.contains('hasDatepicker')
        ) {
          return;
        }
        this.attach(inp, opts);
      });
    },
  };

  /* ------------------------------------------------------------------ */
  /* Pig custom forms (buy / home kill) → fill native DialogSRSkup      */
  /* Our modal is the only UI; native dialog is instrumented off-screen. */
  /* ------------------------------------------------------------------ */
  PF.pigForms = {
    todayCz() {
      const d = new Date();
      return formatCzDate(
        d.getDate() + '.' + (d.getMonth() + 1) + '.' + d.getFullYear()
      );
    },

    /** Portal datepickers usually expect dd.mm.yyyy without spaces. */
    toPortalDate(s) {
      const m = String(s || '')
        .trim()
        .match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
      if (!m) return String(s || '').trim();
      return (
        String(parseInt(m[1], 10)).padStart(2, '0') +
        '.' +
        String(parseInt(m[2], 10)).padStart(2, '0') +
        '.' +
        m[3]
      );
    },

    pageIds() {
      return {
        idProv:
          getParam('idProvozovnySR') ||
          '00000000000000000000000000000000',
        idSR: getParam('idStajovyRegistr') || '',
        idStaj: getParam('idStaj') || '00000000000000000000000000000000',
      };
    },

    dialogUrl() {
      const { idStaj } = this.pageIds();
      let staj = '';
      try {
        staj = this.resolvePigStajeId() || '';
      } catch (_) {}
      if (!staj) {
        try {
          staj = PF.registers.readCachedPigStajeId() || '';
        } catch (_) {}
      }
      if (!staj && idStaj && !/^0+$/.test(idStaj)) staj = idStaj;
      if (!staj || !/^[a-f0-9]{32}$/i.test(staj)) {
        throw new Error(
          'Chybí identifikátor stáje pro pořízení hlášení. Načtěte znovu registr prasat.'
        );
      }
      try {
        PF.registers.cachePigStajeId(staj);
      } catch (_) {}
      return (
        '/ssl/app/izr2far/StajoveRegistry/StajovyRegistrPrasat/DialogSRSkup?idStaj=' +
        encodeURIComponent(staj) +
        '&idZmenaZa=00000000000000000000000000000000'
      );
    },

    resolvePigStajeId() {
      try {
        return PF.registers.resolvePigStajeId('') || '';
      } catch (_) {
        return '';
      }
    },

    partnerPageUrl() {
      const { idProv, idSR, idStaj } = this.pageIds();
      if (!idSR) return '';
      return (
        '/ssl/app/izr2far/StajoveRegistry/StajovyRegistrPrasatPartneri?idProvozovnySR=' +
        encodeURIComponent(idProv) +
        '&idStajovyRegistr=' +
        encodeURIComponent(idSR) +
        '&idStaj=' +
        encodeURIComponent(this.resolvePigStajeId() || idStaj)
      );
    },

    /** Partner list endpoints that worked without opening DialogPartneri. */
    partnerListUrls() {
      const urls = [];
      const push = (u) => {
        if (u && !urls.includes(u)) urls.push(u);
      };
      push(this.partnerPageUrl());
      const { idProv, idSR, idStaj } = this.pageIds();
      if (idSR) {
        push(
          '/ssl/app/izr2far/StajoveRegistry/StajovyRegistrPrasat/Partneri?idStajovyRegistr=' +
            encodeURIComponent(idSR)
        );
        push(
          '/ssl/app/izr2far/StajoveRegistry/StajovyRegistrPrasatPartneri?idProvozovnySR=' +
            encodeURIComponent(idProv) +
            '&idStajovyRegistr=' +
            encodeURIComponent(idSR) +
            '&idStaj=' +
            encodeURIComponent(this.resolvePigStajeId() || idStaj)
        );
      }
      return urls;
    },

    /** Collect partner-dialog URLs from DialogSRSkup HTML / page scripts. */
    extractPartnerDialogUrls(html) {
      const urls = [];
      const push = (u) => {
        if (!u) return;
        let path = String(u).replace(/&amp;/g, '&').trim();
        if (!/DialogPartneri/i.test(path)) return;
        if (path.startsWith('http')) {
          try {
            path = new URL(path).pathname + new URL(path).search;
          } catch (_) {}
        }
        if (!path.startsWith('/')) path = '/' + path.replace(/^\/+/, '');
        if (!urls.includes(path)) urls.push(path);
      };

      String(html || '').replace(
        /(?:zobrazitDialogPartneri|ShowSecondModal|ShowModal[^(]*)\s*\(\s*['"]([^'"]*DialogPartneri[^'"]*)['"]/gi,
        (_, u) => push(u)
      );
      String(html || '').replace(
        /['"]([^'"]*\/StajoveRegistry\/StajovyRegistrPrasat\/DialogPartneri\?[^'"]+)['"]/gi,
        (_, u) => push(u)
      );
      String(html || '').replace(
        /\/ssl\/app\/izr2far\/StajoveRegistry\/StajovyRegistrPrasat\/DialogPartneri\?[^\s"'<>\\]+/gi,
        (u) => push(u)
      );

      // If we only found a radekKey, build the canonical URL
      const { idSR } = this.pageIds();
      const keys = new Set();
      String(html || '').replace(
        /radekKey=([a-f0-9]{32})/gi,
        (_, k) => keys.add(k.toLowerCase())
      );
      keys.forEach((radekKey) => {
        if (!idSR) return;
        push(
          '/ssl/app/izr2far/StajoveRegistry/StajovyRegistrPrasat/DialogPartneri?idStajovyRegistr=' +
            encodeURIComponent(idSR) +
            '&radekKey=' +
            encodeURIComponent(radekKey) +
            '&pohyb=NakupPrisun'
        );
      });
      return urls;
    },

    fetchHtml(url) {
      return new Promise((resolve) => {
        if (!url) return resolve('');
        if (refresh$() && $.ajax) {
          $.ajax({
            url,
            method: 'GET',
            dataType: 'html',
            pfInternal: true,
            success: (html) => resolve(html || ''),
            error: () => resolve(''),
          });
        } else {
          fetch(url, { credentials: 'same-origin' })
            .then((r) => (r.ok ? r.text() : ''))
            .then((html) => resolve(html || ''))
            .catch(() => resolve(''));
        }
      });
    },

    closeModal() {
      const el = qs('#pf-pig-modal');
      if (el) el.remove();
    },

    fieldErrorEl(field) {
      if (!field) return null;
      const wrap = field.closest('.pf-modal-field');
      return wrap ? qs('.pf-field-error', wrap) : null;
    },

    setFieldError(field, message) {
      if (!field) return;
      const msg = String(message || '');
      field.classList.toggle('pf-invalid', !!msg);
      field.setCustomValidity(msg);
      field.setAttribute('aria-invalid', msg ? 'true' : 'false');
      const errEl = this.fieldErrorEl(field);
      if (errEl) errEl.textContent = msg;
    },

    clearFieldError(field) {
      this.setFieldError(field, '');
    },

    /** Live + submit validation for pig buy/kill fields. */
    validatePigField(field, dateOpts) {
      if (!field || field.disabled) return true;
      const id = field.id || '';
      const raw = String(field.value || '').trim();

      if (id === 'pf-pig-form-partner') {
        if (!raw) {
          this.setFieldError(
            field,
            field.tagName === 'SELECT'
              ? 'Vyberte partnera.'
              : 'Zadejte ID partnera.'
          );
          return false;
        }
        if (field.tagName === 'INPUT' && !/^\d{8}$/.test(raw)) {
          this.setFieldError(field, 'ID partnera musí mít 8 číslic.');
          return false;
        }
        this.clearFieldError(field);
        return true;
      }

      if (id === 'pf-pig-form-count') {
        if (raw === '') {
          this.setFieldError(field, 'Zadejte počet prasat.');
          return false;
        }
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 1 || Math.floor(n) !== n) {
          this.setFieldError(field, 'Počet musí být kladné celé číslo.');
          return false;
        }
        this.clearFieldError(field);
        return true;
      }

      if (id === 'pf-pig-form-date') {
        const opts = dateOpts || { maxDaysBack: 7 };
        if (!raw) {
          this.setFieldError(field, 'Zadejte datum.');
          return false;
        }
        const parsed = PF.datePicker.parse(raw);
        if (!parsed) {
          this.setFieldError(field, 'Datum zadejte ve tvaru d. m. rrrr.');
          return false;
        }
        if (!PF.datePicker.inRange(parsed, opts)) {
          this.setFieldError(
            field,
            opts.maxDaysBack != null
              ? 'Datum musí být dnes nebo max. ' +
                  opts.maxDaysBack +
                  ' dní zpět.'
              : 'Datum nesmí být v budoucnosti.'
          );
          return false;
        }
        this.clearFieldError(field);
        return true;
      }

      return true;
    },

    validatePigForm(form, dateOpts) {
      if (!form) return false;
      const root = form.closest('.pf-modal') || form;
      const fields = [
        qs('#pf-pig-form-partner', root),
        qs('#pf-pig-form-count', root),
        qs('#pf-pig-form-date', root),
      ].filter(Boolean);
      let firstInvalid = null;
      fields.forEach((field) => {
        if (!this.validatePigField(field, dateOpts) && !firstInvalid) {
          firstInvalid = field;
        }
      });
      if (firstInvalid) {
        try {
          firstInvalid.focus();
        } catch (_) {}
        return false;
      }
      return true;
    },

    bindPigFormValidation(form, dateOpts) {
      if (!form) return;
      const revalidate = (e) => {
        const t = e && e.target;
        if (
          !t ||
          !t.id ||
          (t.id !== 'pf-pig-form-partner' &&
            t.id !== 'pf-pig-form-count' &&
            t.id !== 'pf-pig-form-date')
        )
          return;
        this.validatePigField(t, dateOpts);
      };
      form.addEventListener('change', revalidate);
      // Blur live-check only while focus stays inside the dialog.
      // Backdrop / Cancel move focus out and would flash red errors on dismiss.
      form.addEventListener(
        'blur',
        (e) => {
          const modalRoot = form.closest('.pf-modal') || form;
          const next = e.relatedTarget;
          if (!next || !modalRoot.contains(next)) return;
          if (next.id === 'pf-pig-cancel') return;
          revalidate(e);
        },
        true
      );
    },

    showModal({ title, fieldsHtml, onSubmit, dateOpts }) {
      this.closeModal();
      const wrap = document.createElement('div');
      wrap.id = 'pf-pig-modal';
      wrap.className = 'pf-modal-backdrop';
      wrap.innerHTML =
        '<div class="pf-modal" role="dialog" aria-modal="true">' +
        '<div class="pf-modal-head"><h3>' +
        escapeHtml(title) +
        '</h3></div>' +
        '<form class="pf-modal-body" id="pf-pig-form" novalidate>' +
        fieldsHtml +
        '<p class="pf-modal-error" id="pf-pig-modal-err"></p>' +
        '<p class="pf-modal-status" id="pf-pig-modal-status" hidden></p>' +
        '</form>' +
        '<div class="pf-modal-foot">' +
        '<button type="button" class="pf-btn" id="pf-pig-cancel">Zrušit</button>' +
        '<button type="button" class="pf-btn pf-btn-primary" id="pf-pig-ok">Uložit</button>' +
        '</div></div>';
      document.body.appendChild(wrap);

      const modal = qs('.pf-modal', wrap);
      const err = qs('#pf-pig-modal-err', wrap);
      const status = qs('#pf-pig-modal-status', wrap);
      const okBtn = qs('#pf-pig-ok', wrap);
      const cancelBtn = qs('#pf-pig-cancel', wrap);
      const form = qs('#pf-pig-form', wrap);
      const opts = dateOpts || { maxDaysBack: 7 };

      this.bindPigFormValidation(form, opts);

      cancelBtn.addEventListener('click', () => this.closeModal());
      okBtn.addEventListener('click', () => {
        if (err) err.textContent = '';
        if (!this.validatePigForm(form, opts)) return;
        form.dispatchEvent(
          new Event('submit', { cancelable: true, bubbles: true })
        );
      });
      // Only close when press AND release both start on the backdrop.
      // Otherwise dragging a number spinner (or text selection) and releasing
      // outside the dialog would fire click on the backdrop and close it.
      let backdropPointerDown = false;
      wrap.addEventListener('pointerdown', (e) => {
        backdropPointerDown = e.target === wrap;
      });
      wrap.addEventListener('click', (e) => {
        if (
          backdropPointerDown &&
          e.target === wrap &&
          !modal.classList.contains('is-busy')
        ) {
          this.closeModal();
        }
        backdropPointerDown = false;
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!this.validatePigForm(form, opts)) return;
        if (err) err.textContent = '';
        if (status) {
          status.hidden = true;
          status.textContent = '';
        }
        // Single continuous farmer overlay until save finishes
        PF.loader.holdBusy('Ukládám…');
        Promise.resolve()
          .then(() => onSubmit(wrap, err))
          .then(() => {
            this.closeModal();
            PF.loader.releaseBusy();
            // Busy-hide may be interrupted by portal progress — ensure toast flush
            setTimeout(() => {
              try {
                PF.toast.flush();
              } catch (_) {}
            }, 450);
          })
          .catch((ex) => {
            okBtn.disabled = false;
            cancelBtn.disabled = false;
            okBtn.textContent = 'Uložit';
            PF.loader.releaseBusy();
            if (err && !err.textContent) {
              err.textContent =
                'Nepodařilo se uložit: ' +
                (ex && ex.message ? ex.message : ex);
            }
          });
      });
      const first = qs('input, select', wrap);
      if (first) setTimeout(() => first.focus(), 50);
    },

    openBuy() {
      const self = this;
      this.showModal({
        title: 'Nákup / přísun',
        dateOpts: { maxDaysBack: 7 },
        fieldsHtml:
          '<div class="pf-modal-field">' +
          '<label for="pf-pig-form-partner">Partner</label>' +
          '<select id="pf-pig-form-partner" name="partner" required aria-required="true">' +
          '<option value="">Načítám partnery…</option></select>' +
          '<p class="pf-field-error" id="pf-pig-form-partner-err" role="alert"></p>' +
          '<p class="pf-modal-hint" id="pf-pig-form-partner-hint"></p>' +
          '</div>' +
          '<div class="pf-modal-field">' +
          '<label for="pf-pig-form-count">Počet prasat</label>' +
          '<input id="pf-pig-form-count" name="count" type="number" min="1" step="1" required aria-required="true" value="1" />' +
          '<p class="pf-field-error" id="pf-pig-form-count-err" role="alert"></p>' +
          '</div>' +
          '<div class="pf-modal-field">' +
          '<label for="pf-pig-form-date">Datum nákupu</label>' +
          '<input id="pf-pig-form-date" name="date" type="text" required aria-required="true" placeholder="d. m. rrrr" autocomplete="off" value="' +
          this.todayCz() +
          '" />' +
          '<p class="pf-field-error" id="pf-pig-form-date-err" role="alert"></p>' +
          '</div>',
        onSubmit(wrap) {
          const sel = qs('#pf-pig-form-partner', wrap);
          const count = parseInt(qs('#pf-pig-form-count', wrap).value, 10);
          const dateRaw = String(qs('#pf-pig-form-date', wrap).value || '').trim();
          const partnerId = sel ? String(sel.value || '').trim() : '';
          const partnerName =
            sel && sel.tagName === 'SELECT' && sel.selectedOptions[0]
              ? textOf(sel.selectedOptions[0])
                  .replace(new RegExp('\\s*\\(' + partnerId + '\\)\\s*$'), '')
                  .replace(partnerId, '')
                  .replace(/^[–\-\s(]+|[)\s]+$/g, '')
                  .trim()
              : '';
          return self.runNative('NakupPrisun', {
            partnerId,
            partnerName,
            count,
            date: self.toPortalDate(dateRaw),
            dateDisplay: formatCzDate(dateRaw),
          });
        },
      });
      this.loadPartnersInto(
        qs('#pf-pig-form-partner'),
        qs('#pf-pig-form-partner-hint')
      );
      PF.datePicker.attach(qs('#pf-pig-form-date'), { maxDaysBack: 7 });
    },

    openKill() {
      const self = this;
      this.showModal({
        title: 'Domácí porážka',
        dateOpts: { maxDaysBack: 7 },
        fieldsHtml:
          '<div class="pf-modal-field">' +
          '<label for="pf-pig-form-count">Počet prasat</label>' +
          '<input id="pf-pig-form-count" name="count" type="number" min="1" step="1" required aria-required="true" value="1" />' +
          '<p class="pf-field-error" id="pf-pig-form-count-err" role="alert"></p>' +
          '</div>' +
          '<div class="pf-modal-field">' +
          '<label for="pf-pig-form-date">Datum porážky</label>' +
          '<input id="pf-pig-form-date" name="date" type="text" required aria-required="true" placeholder="d. m. rrrr" autocomplete="off" value="' +
          this.todayCz() +
          '" />' +
          '<p class="pf-field-error" id="pf-pig-form-date-err" role="alert"></p>' +
          '</div>',
        onSubmit(wrap) {
          const count = parseInt(qs('#pf-pig-form-count', wrap).value, 10);
          const dateRaw = String(qs('#pf-pig-form-date', wrap).value || '').trim();
          return self.runNative('DomaciPorazka', {
            count,
            date: self.toPortalDate(dateRaw),
            dateDisplay: formatCzDate(dateRaw),
          });
        },
      });
      PF.datePicker.attach(qs('#pf-pig-form-date'), { maxDaysBack: 7 });
    },

    parsePartners(html) {
      const out = [];
      const byId = new Map();

      const isJunkName = (n) => {
        if (!n || n.length < 3) return true;
        if (/[<>{\}\\\/|=]/.test(n)) return true;
        if (/^\d+$/.test(n)) return true;
        if (
          /^(cz|sk|de|at|pl|hu|eu|id|partner|nazev|název|ano|ne|span|div|td|tr|th|a|option|label|table|tbody|html|body|script|style|class|href)$/i.test(
            n
          )
        )
          return true;
        if (/\b(span|div|tbody|thead|onclick|javascript|function)\b/i.test(n))
          return true;
        if (!/[A-Za-zÁ-žá-ž]{3,}/.test(n)) return true;
        return false;
      };

      const cleanName = (raw, id) => {
        let n = String(raw || '')
          .replace(/<[^>]*>/g, ' ')
          .replace(/&nbsp;|&amp;|&quot;|&#\d+;/gi, ' ')
          .replace(new RegExp('\\b' + id + '\\b', 'g'), ' ')
          .replace(/\b(CZ|SK|DE|AT|PL|HU|EU)\b/gi, ' ')
          .replace(/\b(ano|ne|true|false|null)\b/gi, ' ')
          .replace(/[<>]/g, ' ')
          .replace(/^[–\-|,\s.;:]+|[–\-|,\s.;:]+$/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        if (isJunkName(n)) return '';
        return n;
      };

      const scoreName = (n) => {
        if (!n || isJunkName(n)) return 0;
        let s = n.length;
        if (/\s/.test(n)) s += 12;
        if (/[A-Za-zÁ-žá-ž]{4,}/.test(n)) s += 5;
        if (/prasat|ovc|farm|agro|statek|druzst|s\.?\s*r\.?\s*o|a\.?\s*s/i.test(n))
          s += 25;
        // Stáj picker labels are never good partner names
        if (/^\d{0,3}\s*st[aá]j\b/i.test(n) || /\bst[aá]j\b/i.test(n)) s -= 40;
        return s;
      };

      const add = (id, name) => {
        // Portal partner keys are 8-digit registration numbers
        const pid = String(id || '').trim();
        if (!/^\d{8}$/.test(pid)) return;
        const cleaned = cleanName(name, pid);
        // Never keep a pure stáj-picker label as the partner name
        if (cleaned && /^\d{0,3}\s*st[aá]j\b/i.test(cleaned)) return;
        const prev = byId.get(pid);
        if (!prev) {
          byId.set(pid, { id: pid, name: cleaned });
          out.push(byId.get(pid));
          return;
        }
        if (scoreName(cleaned) > scoreName(prev.name)) prev.name = cleaned;
      };

      try {
        const doc = new DOMParser().parseFromString(html || '', 'text/html');
        // Strip stáj / provozovna pickers — they are not business partners
        qsa(
          '#stajVyberId, select[name="VybranaStajIdKombinace"], select[id*="stajVyber" i], select[id*="StajVyber"], select[id*="staj" i], select[name*="staj" i]',
          doc
        ).forEach((el) => {
          const wrap =
            el.closest(
              '.wideInputs, .form-group, .entity-editor-group, label, td, .field'
            ) || el;
          try {
            wrap.remove();
          } catch (_) {
            try {
              el.remove();
            } catch (_) {}
          }
        });

        // Prefer explicit partner grids / tables
        const tables = qsa(
          'table.grid-table, table.dataTable, table.pf-simple-table, table',
          doc
        );
        const parseTable = (table) => {
          qsa('tr', table).forEach((tr) => {
            if (isFilterChromeRow(tr)) return;
            const cells = qsa(':scope > td', tr).map((td) => textOf(td));
            const nonempty = cells.filter(Boolean);
            if (!nonempty.length) return;
            let id = '';
            let bestName = '';
            let bestScore = 0;
            nonempty.forEach((c) => {
              const onlyId = c.match(/^\s*(\d{8})\s*$/);
              if (onlyId) {
                if (!id) id = onlyId[1];
                return;
              }
              const embedded = c.match(/\b(\d{8})\b/);
              if (embedded && !id) id = embedded[1];
              const candidate = cleanName(c, id || '00000000');
              const sc = scoreName(candidate);
              if (sc > bestScore) {
                bestScore = sc;
                bestName = candidate;
              }
            });
            if (id) add(id, bestName);
          });
        };

        if (tables.length) tables.forEach(parseTable);
        else {
          qsa('tr', doc).forEach((tr) => {
            if (isFilterChromeRow(tr)) return;
            const cells = qsa(':scope > td', tr).map((td) => textOf(td));
            let id = '';
            let bestName = '';
            cells.forEach((c) => {
              const onlyId = c.match(/^\s*(\d{8})\s*$/);
              if (onlyId && !id) id = onlyId[1];
              else {
                const candidate = cleanName(c, id || '00000000');
                if (scoreName(candidate) > scoreName(bestName)) bestName = candidate;
              }
            });
            if (id) add(id, bestName);
          });
        }

        // Remaining <select>/<a> (stáj selects already removed)
        qsa('option', doc).forEach((el) => {
          const val = String(el.value || '').trim();
          const t = textOf(el);
          // Skip empty / placeholder options and stáj-looking labels
          if (!val || /^0+$/.test(val)) return;
          if (/^\d{0,3}\s*st[aá]j\b/i.test(t) || /\bst[aá]j\b/i.test(t)) return;
          const id =
            (/^\d{8}$/.test(val) && val) ||
            ((t.match(/\b(\d{8})\b/) || [])[1] || '');
          if (!id) return;
          add(id, t);
        });
        qsa('a', doc).forEach((el) => {
          const t = textOf(el);
          if (/^\d{0,3}\s*st[aá]j\b/i.test(t) || /\bst[aá]j\b/i.test(t)) return;
          const m = t.match(/\b(\d{8})\b/);
          if (!m) return;
          add(m[1], t);
        });
      } catch (_) {}

      return out;
    },

    /**
     * Page scrape that previously worked — but strip the local stáj picker first.
     * Own stable ("00 Stáj …") came from #stajVyberId inside #pf-host.
     */
    parsePartnersFromPage() {
      try {
        const root = qs('#pf-host') || document.body;
        if (!root) return [];
        const clone = root.cloneNode(true);
        qsa(
          '#stajVyberId, select[name="VybranaStajIdKombinace"], select[id*="stajVyber" i], select[id*="StajVyber"], select[id*="staj" i], select[name*="staj" i]',
          clone
        ).forEach((el) => {
          const wrap =
            el.closest(
              '.wideInputs, .form-group, .entity-editor-group, label, td, .field'
            ) || el;
          try {
            wrap.remove();
          } catch (_) {
            try {
              el.remove();
            } catch (_) {}
          }
        });
        // Also drop visible stáj chrome labels that aren't inside the select
        qsa('label, .wideInputs, span, div', clone).forEach((el) => {
          const t = norm(textOf(el) || '');
          if (
            t === 'staj' ||
            t === 'staje' ||
            t.includes('vyber staje') ||
            t.includes('vyber provozovny/staje') ||
            /^provozovna\s*\/\s*staj/.test(t)
          ) {
            try {
              el.remove();
            } catch (_) {}
          }
        });
        return this.parsePartners(clone.innerHTML);
      } catch (_) {
        return [];
      }
    },

    /** Labels from the page stáj picker (wrong source if they appear as "partners"). */
    stableSelectorLabels() {
      return qsa(
        '#stajVyberId option, select[name="VybranaStajIdKombinace"] option, select[id*="stajVyber" i] option, select[id*="StajVyber"] option'
      )
        .map((o) => textOf(o).trim())
        .filter(Boolean);
    },

    /** Own farm registration numbers (provozovna), not partner IDs. */
    ownRegistrationIds() {
      const ids = new Set();
      try {
        const reg = String(PF.scrape.subject().regNumber || '').replace(/\D/g, '');
        if (/^\d{6,12}$/.test(reg)) ids.add(reg);
      } catch (_) {}
      try {
        const info = textOf(qs('.detail-header-info')) || '';
        const m = info.match(/Reg\.?\s*číslo:\s*(\d+)/i);
        if (m) ids.add(m[1]);
      } catch (_) {}
      qsa('.entity-editor-group').forEach((g) => {
        const head = qs('h2, .entity-editor-group-header', g);
        if (!/aktivni provozovny/.test(norm(textOf(head) || ''))) return;
        qsa('td', g).forEach((td) => {
          const t = textOf(td);
          const m = t.match(/\bCZ\s*(\d{8})\b/i);
          if (m) ids.add(m[1]);
        });
      });
      return ids;
    },

    sanitizePartnerList(list) {
      const stableLabels = new Set(
        this.stableSelectorLabels().map((l) => norm(l))
      );
      const ownIds = this.ownRegistrationIds();
      return (list || []).filter((p) => {
        if (!p || !/^\d{8}$/.test(String(p.id || ''))) return false;
        if (ownIds.has(String(p.id))) return false;
        const label = String(p.name || '').trim();
        const n = norm(label);
        if (label && stableLabels.has(n)) return false;
        // Stáj picker entries look like "00 Stáj …"
        if (/^\d{0,3}\s*st[aá]j\b/i.test(label) || /\bst[aá]j\b/i.test(n))
          return false;
        return true;
      });
    },

    cachedPartners() {
      try {
        const raw =
          localStorage.getItem('pf-pig-partners-v6') ||
          localStorage.getItem('pf-pig-partners-v5');
        if (!raw) return [];
        const arr = JSON.parse(raw);
        if (!Array.isArray(arr)) return [];
        const mapped = arr
          .map((p) => {
            if (!p || !/^\d{8}$/.test(String(p.id || ''))) return null;
            let name = String(p.name || '')
              .replace(/<[^>]*>/g, ' ')
              .replace(/[<>]/g, ' ')
              .replace(new RegExp('\\b' + p.id + '\\b', 'g'), ' ')
              .replace(/\b(CZ|SK|DE|AT|PL|HU|EU)\b/gi, ' ')
              .replace(/\s+/g, ' ')
              .trim();
            if (
              !name ||
              name.length < 3 ||
              /[<>]|^(cz|sk|span|div|td)$/i.test(name) ||
              /\bspan\b/i.test(name) ||
              /^\d{0,3}\s*st[aá]j\b/i.test(name)
            ) {
              name = '';
            }
            return { id: String(p.id), name };
          })
          .filter(Boolean);
        return this.sanitizePartnerList(mapped);
      } catch (_) {
        return [];
      }
    },

    savePartners(list, { replace } = {}) {
      try {
        let arr;
        if (replace) {
          arr = this.sanitizePartnerList(list || []);
        } else {
          const merged = new Map();
          this.cachedPartners().forEach((p) => merged.set(p.id, p));
          this.sanitizePartnerList(list || []).forEach((p) => {
            const prev = merged.get(p.id);
            const name = String(p.name || '').trim();
            if (!prev) {
              merged.set(p.id, { id: p.id, name });
              return;
            }
            if (name && name.length > String(prev.name || '').length)
              prev.name = name;
          });
          arr = Array.from(merged.values());
        }
        localStorage.setItem('pf-pig-partners-v6', JSON.stringify(arr));
        [
          'pf-pig-partners-v5',
          'pf-pig-partners-v4',
          'pf-pig-partners-v3',
          'pf-pig-partners-v2',
          'pf-pig-partners',
        ].forEach((k) => {
          try {
            localStorage.removeItem(k);
          } catch (_) {}
        });
      } catch (_) {}
    },

    fillPartnerSelect(sel, list, hint) {
      if (!sel) return;
      const items = this.sanitizePartnerList(
        list && list.length ? list : this.cachedPartners()
      );
      sel.innerHTML = '';
      if (!items.length) {
        const o = document.createElement('option');
        o.value = '';
        o.textContent = 'Žádný partner nenalezen — zadejte ručně níže';
        sel.appendChild(o);
        const inp = document.createElement('input');
        inp.id = 'pf-pig-form-partner';
        inp.name = 'partner';
        inp.type = 'text';
        inp.required = true;
        inp.setAttribute('aria-required', 'true');
        inp.placeholder = '48192736';
        inp.inputMode = 'numeric';
        sel.replaceWith(inp);
        if (hint)
          hint.textContent = 'Seznam partnerů se nepodařilo načíst automaticky.';
        return;
      }
      const ph = document.createElement('option');
      ph.value = '';
      ph.textContent = 'Vyberte partnera…';
      sel.appendChild(ph);
      items.forEach((p) => {
        const o = document.createElement('option');
        o.value = p.id;
        const label = String(p.name || '').trim();
        o.textContent = label ? label + ' (' + p.id + ')' : p.id;
        sel.appendChild(o);
      });
      if (items.length === 1) sel.value = items[0].id;
      if (hint) hint.textContent = '';
      this.clearFieldError(sel);
    },

    applyPartnerList(list, hint, { replace } = {}) {
      const clean = this.sanitizePartnerList(list);
      if (!clean.length) return false;
      this.savePartners(clean, { replace: !!replace });
      let current = qs('#pf-pig-form-partner');
      // Restore <select> if a previous empty load swapped it for a text input
      if (current && current.tagName === 'INPUT') {
        const sel = document.createElement('select');
        sel.id = 'pf-pig-form-partner';
        sel.required = true;
        current.replaceWith(sel);
        current = sel;
      }
      if (current && current.tagName === 'SELECT')
        this.fillPartnerSelect(current, this.cachedPartners(), hint);
      return true;
    },

    findPartnerDialogOpener(root) {
      const scope = root || document;
      return (
        qsa(
          '[data-url*="DialogPartneri"], a[data-url*="Partneri"], button[data-url*="Partneri"], a[onclick*="DialogPartneri"], button[onclick*="DialogPartneri"]',
          scope
        ).find((el) => {
          const blob =
            (el.getAttribute('data-url') || '') +
            ' ' +
            (el.getAttribute('onclick') || '') +
            ' ' +
            textOf(el);
          return /DialogPartneri|partner/i.test(blob);
        }) || null
      );
    },

    partnerUrlFromEl(el) {
      if (!el) return '';
      let url = el.getAttribute('data-url') || '';
      if (!url) {
        const oc = el.getAttribute('onclick') || '';
        const m = oc.match(/['"]([^'"]*DialogPartneri[^'"]*)['"]/i);
        if (m) url = m[1];
      }
      if (!url) return '';
      url = url.replace(/&amp;/g, '&');
      if (url.startsWith('http')) {
        try {
          const u = new URL(url);
          url = u.pathname + u.search;
        } catch (_) {}
      }
      if (!url.startsWith('/')) url = '/' + url.replace(/^\/+/, '');
      return url;
    },

    /** Partner dialog shell often has an empty AJAX grid — follow data-url. */
    extractGridUrls(html) {
      const urls = [];
      const push = (u) => {
        if (!u) return;
        let path = String(u).replace(/&amp;/g, '&').trim();
        if (path.startsWith('http')) {
          try {
            const x = new URL(path);
            path = x.pathname + x.search;
          } catch (_) {}
        }
        if (!path.startsWith('/')) path = '/' + path.replace(/^\/+/, '');
        if (!urls.includes(path)) urls.push(path);
      };
      try {
        const doc = new DOMParser().parseFromString(html || '', 'text/html');
        qsa(
          '#partner-filter-wrapper, .grid[data-url], .grid[data-ajax], table.grid-table',
          doc
        ).forEach((el) => {
          const grid =
            el.classList.contains('grid') || el.id === 'partner-filter-wrapper'
              ? el.classList.contains('grid')
                ? el
                : el.closest('.grid')
              : el.closest('.grid');
          if (grid) {
            push(grid.getAttribute('data-url'));
            const form = qs('form', grid);
            if (form && form.getAttribute('action'))
              push(form.getAttribute('action'));
          }
        });
        qsa('[data-url]', doc).forEach((el) => {
          const u = el.getAttribute('data-url') || '';
          if (/Partner|Grid|partner/i.test(u)) push(u);
        });
      } catch (_) {}
      String(html || '').replace(
        /data-url=["']([^"']+)["']/gi,
        (_, u) => {
          if (/Partner|Grid|Prasat/i.test(u)) push(u);
        }
      );
      return urls;
    },

    async parsePartnersDeep(html) {
      let list = this.parsePartners(html);
      if (list.length) return list;
      const gridUrls = this.extractGridUrls(html);
      for (let i = 0; i < gridUrls.length; i++) {
        const gHtml = await this.fetchHtml(gridUrls[i]);
        list = this.parsePartners(gHtml);
        if (list.length) return list;
      }
      return [];
    },

    /** Open native buy dialog off-screen, read DialogPartneri URL, fetch partners. */
    async fetchPartnersViaNativeDialog() {
      this.beginNativeFill();
      let dialog = null;
      try {
        this.openNativeDialog();
        dialog = await this.waitFor(() => this.activeDialog(), {
          timeout: 15000,
          label: 'otevření dialogu pro partnery',
        });

        await this.waitFor(() => {
          const d = this.activeDialog() || dialog;
          this.setEventType(d, 'NakupPrisun');
          return this.findEventSelect(d);
        }, { timeout: 10000, label: 'načtení nákupu pro partnery' });
        dialog = this.activeDialog() || dialog;
        this.setEventType(dialog, 'NakupPrisun');

        // Form reloads after Událost change — wait for partner opener / URL
        const opener = await this.waitFor(() => {
          const d = this.activeDialog() || dialog;
          return (
            this.findPartnerDialogOpener(d) ||
            this.findPartnerDialogOpener(
              qs('.ui-dialog-content', d) || d
            ) ||
            this.findPartnerDialogOpener(document)
          );
        }, { timeout: 12000, label: 'načtení výběru partnera' });

        dialog = this.activeDialog() || dialog;
        const url =
          this.partnerUrlFromEl(opener) ||
          (this.extractPartnerDialogUrls(
            (dialog && dialog.innerHTML) || ''
          )[0] || '');
        if (!url) return [];

        let list = await this.parsePartnersDeep(await this.fetchHtml(url));
        if (list.length) return list;

        // Fallback: open second modal and scrape (+ follow its grid AJAX)
        try {
          opener.click();
        } catch (_) {}
        const partnerDlg = await this.waitFor(() => {
          const dialogs = qsa('.ui-dialog').filter((d) => {
            const st = window.getComputedStyle(d);
            if (st.display === 'none') return false;
            return (
              !!qs('#partner-filter-wrapper, [id*="partner" i]', d) ||
              /partner/i.test(
                textOf(qs('.ui-dialog-title', d) || d).slice(0, 80)
              )
            );
          });
          return dialogs[dialogs.length - 1] || null;
        }, { timeout: 10000 });

        list = await this.parsePartnersDeep(partnerDlg.innerHTML);
        try {
          this.closeNativeDialog(partnerDlg);
        } catch (_) {}
        return list;
      } finally {
        try {
          this.closeNativeDialog(dialog);
        } catch (_) {}
        qsa('.ui-dialog').forEach((d) => {
          try {
            this.closeNativeDialog(d);
          } catch (_) {}
        });
        this.endNativeFill();
      }
    },

    loadPartnersInto(sel, hint) {
      // Drop legacy caches that mixed in #stajVyberId options
      try {
        [
          'pf-pig-partners-v5',
          'pf-pig-partners-v4',
          'pf-pig-partners-v3',
          'pf-pig-partners-v2',
          'pf-pig-partners',
        ].forEach((k) => localStorage.removeItem(k));
      } catch (_) {}

      const cached = this.cachedPartners();
      if (cached.length) this.fillPartnerSelect(sel, cached, hint);
      else if (sel && sel.tagName === 'SELECT') {
        sel.innerHTML = '<option value="">Načítám partnery…</option>';
      }

      const finishEmpty = () => {
        if (!this.cachedPartners().length) {
          if (hint)
            hint.textContent = 'Partnery se nepodařilo načíst automaticky.';
          const current = qs('#pf-pig-form-partner');
          if (current && current.tagName === 'SELECT')
            this.fillPartnerSelect(current, [], hint);
        }
      };

      // 1) Same page scrape that previously worked — but with stáj picker removed
      const fromPage = this.parsePartnersFromPage();
      if (fromPage.length) this.applyPartnerList(fromPage, hint, { replace: false });

      // 2) Partneri endpoints (no DialogPartneri / radekKey needed) — the reliable source
      const urls = this.partnerListUrls();

      const tryUrls = (i) => {
        if (i >= urls.length) return Promise.resolve(!!this.cachedPartners().length);
        return this.fetchHtml(urls[i]).then((html) => {
          const list = this.parsePartners(html);
          // URL responses are the real partner list — replace page noise
          if (this.applyPartnerList(list, hint, { replace: true })) return true;
          return tryUrls(i + 1);
        });
      };

      tryUrls(0)
        .then((ok) => {
          if (ok || this.cachedPartners().length) return true;
          // 3) Last resort: DialogSRSkup HTML may embed DialogPartneri URL
          return this.fetchHtml(this.dialogUrl()).then((dialogHtml) => {
            const dlgUrls = this.extractPartnerDialogUrls(dialogHtml);
            const tryDlg = (j) => {
              if (j >= dlgUrls.length) return Promise.resolve(false);
              return this.fetchHtml(dlgUrls[j])
                .then((html) => this.parsePartnersDeep(html))
                .then((list) => {
                  if (this.applyPartnerList(list, hint, { replace: true }))
                    return true;
                  return tryDlg(j + 1);
                });
            };
            return tryDlg(0);
          });
        })
        .then((ok) => {
          if (!ok) finishEmpty();
        })
        .catch(() => finishEmpty());
    },

    waitFor(check, { timeout = 8000, interval = 120, label } = {}) {
      return new Promise((resolve, reject) => {
        const t0 = Date.now();
        const tick = () => {
          let v = null;
          try {
            v = check();
          } catch (_) {}
          if (v) return resolve(v);
          if (Date.now() - t0 > timeout)
            return reject(
              new Error(
                label
                  ? 'Vypršel čas: ' + label
                  : 'Vypršel čas čekání na dialog.'
              )
            );
          setTimeout(tick, interval);
        };
        tick();
      });
    },

    openNativeDialog() {
      PF.dialogs.ensureSafeDialogApi();
      // Leftover #dialogDiv without a live jQuery UI widget makes ShowModal
      // throw before AJAX — reset like sheep forms do.
      try {
        PF.registers.resetDialogHost();
      } catch (_) {}
      const url = this.dialogUrl();
      const title = 'Pořízení hlášení (události)';
      if (typeof window.ShowModalWithMaxWidthStretch === 'function') {
        window.ShowModalWithMaxWidthStretch(url, title, '95%');
        return;
      }
      if (typeof window.ShowModal === 'function') {
        window.ShowModal(url, title, '95%');
        return;
      }
      if (typeof window.ShowModalInner === 'function') {
        window.ShowModalInner(url, title, '95%');
        return;
      }
      if (typeof window.zobrazitDialogSRSkup === 'function') {
        window.zobrazitDialogSRSkup(url);
        return;
      }
      const opener = qsa(
        'a[onclick*="zobrazitDialogSRSkup"], button[onclick*="zobrazitDialogSRSkup"], a[onclick*="DialogSRSkup"], a[href*="DialogSRSkup"]'
      )[0];
      if (opener) {
        const oc = opener.getAttribute('onclick');
        const href = opener.getAttribute('href') || '';
        // Prefer .click() when it won't navigate away (CSP-safe vs new Function).
        const clickSafe =
          opener.tagName === 'BUTTON' ||
          opener.tagName === 'INPUT' ||
          !href ||
          href === '#' ||
          /^javascript:/i.test(href);
        if (clickSafe) {
          try {
            opener.click();
            return;
          } catch (_) {}
        }
        try {
          if (oc) {
            new Function(oc).call(opener);
            return;
          }
        } catch (_) {}
        try {
          opener.click();
          return;
        } catch (_) {}
      }
      throw new Error('Nelze otevřít dialog pořízení hlášení.');
    },

    activeDialog() {
      // While instrumenting off-screen, dialogs are visibility:hidden via CSS —
      // still treat them as active so waitFor/setEventType can see them.
      const allowHidden = document.body.classList.contains('pf-native-pig-fill');
      const dialogs = qsa('.ui-dialog').filter((d) => {
        const st = window.getComputedStyle(d);
        if (st.display === 'none') return false;
        if (!allowHidden && st.visibility === 'hidden') return false;
        return true;
      });
      return dialogs[dialogs.length - 1] || null;
    },

    /** Trigger input/change (and Select2 / datepicker when present). */
    setNativeValue(el, value) {
      if (!el) return false;
      const v = value == null ? '' : String(value);
      if (el.tagName === 'SELECT') {
        const hit =
          qsa('option', el).find(
            (o) =>
              o.value === v ||
              norm(o.textContent) === norm(v) ||
              norm(o.textContent + ' ' + o.value).includes(norm(v))
          ) || null;
        if (hit) el.value = hit.value;
        else el.value = v;
      } else {
        // Disabled fields (e.g. .rsrp-provozovna) must be enabled to submit
        if (el.disabled) el.disabled = false;
        el.value = v;
      }
      try {
        if (refresh$()) {
          const $el = $(el);
          if (el.tagName === 'SELECT' && $el.data('select2')) {
            $el.val(el.value).trigger('change');
          } else if (
            el.classList.contains('hasDatepicker') ||
            el.classList.contains('datepicker')
          ) {
            try {
              $el.datepicker('setDate', v);
            } catch (_) {}
            $el.trigger('input').trigger('change');
          } else {
            $el.trigger('input').trigger('change');
          }
        } else {
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } catch (_) {
        try {
          el.dispatchEvent(new Event('change', { bubbles: true }));
        } catch (__) {}
      }
      // Sync Select2 / fulltext autocomplete sibling UI
      try {
        if (el.tagName === 'SELECT' && $) {
          const $sel = $(el);
          if ($sel.data('select2')) {
            $sel.trigger('change.select2');
          }
          const ac = el.nextElementSibling;
          if (
            ac &&
            ac.classList &&
            ac.classList.contains('ui-autocomplete-input')
          ) {
            const opt = el.selectedOptions && el.selectedOptions[0];
            ac.value = opt ? textOf(opt) : v;
            $(ac).trigger('input').trigger('change');
          }
        }
      } catch (_) {}
      return true;
    },

    findEventSelect(dialog) {
      // Canonical group-register control (often Select2-hidden)
      const byClass =
        qs('select.rsrp-typ-zmeny', dialog) ||
        qs('select[name*="TypZmeny"]', dialog) ||
        qs('select[id*="TypZmeny"]', dialog);
      if (byClass) return byClass;
      const selects = qsa('select', dialog);
      return (
        selects.find((sel) => {
          const opts = qsa('option', sel).map((o) =>
            norm(o.textContent + ' ' + o.value)
          );
          return opts.some(
            (t) =>
              /nakup|prisun|domaci|poraz|udalost|narozeni|\(30\)|\(63\)/.test(t)
          );
        }) || null
      );
    },

    setEventType(dialog, typ) {
      const action = (PF.config.pigActions || []).find((a) => a.typ === typ) || {
        typ,
        labels: [typ],
      };
      const sel = this.findEventSelect(dialog);
      if (!sel) return false;
      // Prefer exact option value (DomaciPorazka / NakupPrisun)
      const hit =
        qsa('option', sel).find((o) => o.value === typ) ||
        qsa('option', sel).find((o) => {
          const t = norm(o.textContent + ' ' + o.value);
          return (
            t.includes(norm(typ)) ||
            (action.labels || []).some((l) => t.includes(norm(l))) ||
            (typ === 'NakupPrisun' && /\(30\)|nakup|prisun/.test(t)) ||
            (typ === 'DomaciPorazka' && /\(63\)|domaci|poraz/.test(t))
          );
        });
      if (!hit) return false;
      this.setNativeValue(sel, hit.value);
      // If change didn't fire portal handler (no jQuery), call it directly
      try {
        if (!refresh$() && typeof window.zmenaUdalosti === 'function') {
          const onchange = sel.getAttribute('onchange') || '';
          const m = onchange.match(
            /zmenaUdalosti\s*\(\s*this\s*,\s*['"]([^'"]+)['"]\s*\)/
          );
          if (m) window.zmenaUdalosti(sel, m[1]);
        }
      } catch (_) {}
      return true;
    },

    findDateInput(dialog) {
      return (
        qs('input.rsrp-datum', dialog) ||
        qs('input[name*="ZmenaSkupin.Datum"]', dialog) ||
        qs('input[name*=".Datum"]', dialog) ||
        qs('input.hasDatepicker[data-mask]', dialog) ||
        qs('input.datepicker', dialog) ||
        null
      );
    },

    findCountInput(dialog) {
      return (
        qs('input.rsrp-pocet', dialog) ||
        qs('input[name*="ZmenaSkupin.Pocet"]', dialog) ||
        qs('input[name*=".Pocet"]', dialog) ||
        null
      );
    },

    findPartnerInput(dialog) {
      return (
        qs('input.rsrp-provozovna', dialog) ||
        qs('input[name*="ZmenaSkupin.Provozovna"]', dialog) ||
        qs('input[name*=".Provozovna"]', dialog) ||
        null
      );
    },

    setDate(dialog, date) {
      if (!date) return false;
      const inp = this.findDateInput(dialog);
      if (!inp) return false;
      return this.setNativeValue(inp, date);
    },

    setInputByLabels(dialog, labelRe, value) {
      let filled = false;
      qsa('tr, .member-editor, .form-group, div', dialog).forEach((row) => {
        if (filled) return;
        const cap = row.querySelector(
          '.member-editor-caption, label, th, td:first-child, span'
        );
        if (!cap) return;
        const t = norm(textOf(cap));
        if (!labelRe.test(t)) return;
        const inp =
          row.querySelector(
            'input.datepicker, input.rsrp-datum, input.rsrp-pocet, input[type="text"], input[type="number"], input:not([type]), select'
          ) || null;
        if (!inp || inp.closest('.pf-modal')) return;
        if (inp.tagName === 'SELECT' && this.findEventSelect(dialog) === inp)
          return;
        this.setNativeValue(inp, value);
        filled = true;
      });
      return filled;
    },

    /** Fill ZmenaSkupin.Pocet (.rsrp-pocet) — single count for group register. */
    setMaleCount(dialog, count) {
      const n = String(count == null ? '' : count).trim();
      if (!n) return false;
      const inp = this.findCountInput(dialog);
      if (inp) return this.setNativeValue(inp, n);
      // Fallback: label-based (legacy layouts)
      if (
        this.setInputByLabels(
          dialog,
          /pocet prasat|pocet zvirat|^pocet$|počet/,
          n
        )
      )
        return true;
      return false;
    },

    readMaleCount(dialog) {
      const inp = this.findCountInput(dialog);
      if (inp) return String(inp.value || '').trim();
      return '';
    },

    setPartner(dialog, partnerId, partnerName) {
      if (!partnerId) return false;
      const inp = this.findPartnerInput(dialog);
      if (inp) {
        this.setNativeValue(inp, partnerId);
        // Portal name-lookup hooks
        try {
          qsa(
            'input.nactiNazevSubjektuPartnera, input.nactiNazevPartnera',
            dialog
          ).forEach((el) => {
            try {
              if (refresh$()) $(el).trigger('change').trigger('blur');
              else el.dispatchEvent(new Event('change', { bubbles: true }));
            } catch (_) {}
          });
        } catch (_) {}
        return true;
      }
      // Fallback: label / select / picker click
      let ok = this.setInputByLabels(
        dialog,
        /partner|provozovn|reg\.?\s*c|registracni|ico|ičo/,
        partnerId
      );
      if (!ok) {
        qsa('select', dialog).forEach((sel) => {
          if (ok) return;
          if (sel === this.findEventSelect(dialog)) return;
          const hit = qsa('option', sel).find((o) => {
            const t = norm(o.textContent + ' ' + o.value);
            return (
              t.includes(norm(partnerId)) ||
              (partnerName && t.includes(norm(partnerName)))
            );
          });
          if (hit) {
            this.setNativeValue(sel, hit.value);
            ok = true;
          }
        });
      }
      if (!ok) {
        qsa('a, button, tr, td', dialog).forEach((el) => {
          if (ok) return;
          if (textOf(el).includes(partnerId)) {
            const clickable =
              el.closest('a, button, tr.grid-row, .grid-row') || el;
            try {
              clickable.click();
              ok = true;
            } catch (_) {}
          }
        });
      }
      return ok;
    },

    clickSave(dialog) {
      const scope = dialog
        ? dialog.closest('.ui-dialog') || dialog
        : document;
      // Commit masked/datepicker values before submit
      try {
        const active = document.activeElement;
        if (active && typeof active.blur === 'function') active.blur();
      } catch (_) {}
      [this.findDateInput(dialog), this.findCountInput(dialog)]
        .filter(Boolean)
        .forEach((el) => {
          try {
            el.dispatchEvent(new Event('blur', { bubbles: true }));
            if (refresh$()) $(el).trigger('blur').trigger('change');
          } catch (_) {}
        });

      const btns = qsa(
        [
          '.ui-dialog-buttonpane button',
          '.ui-dialog-buttonset button',
          'button',
          'input[type="submit"]',
          'input[type="button"]',
          'a.toolbutton',
          'a.button',
          'a.tb-confirm',
        ].join(', '),
        scope
      ).filter((b) => {
        // Skip our own modal buttons
        if (b.closest('#pf-pig-modal, #pf-sheep-modal, .pf-modal')) return false;
        const st = window.getComputedStyle(b);
        if (st.display === 'none' || st.visibility === 'hidden') {
          // Off-screen native fill hides the whole dialog — still allow those
          if (
            !document.body.classList.contains('pf-native-pig-fill') &&
            !document.body.classList.contains('pf-native-sheep-fill')
          )
            return false;
        }
        return true;
      });

      const labelOf = (b) =>
        norm(textOf(b) || b.value || b.getAttribute('title') || '');

      // Prefer exact Uložit — never bare OK (closes without saving)
      const prefer = btns.find((b) => {
        const t = labelOf(b);
        return (
          t === 'ulozit' ||
          t === 'uloz' ||
          (/^ulozit\b/.test(t) &&
            !/zavrit|zrusit|cancel|close|zpet/.test(t))
        );
      });
      const hit =
        prefer ||
        btns.find((b) => {
          const t = labelOf(b);
          return (
            /potvrdit|uloz\b|save/.test(t) &&
            !/zavrit|zrusit|cancel|close|zpet|\bok\b/.test(t)
          );
        });
      if (hit) {
        try {
          if (refresh$()) $(hit).trigger('click');
          else hit.click();
        } catch (_) {
          try {
            hit.click();
          } catch (__) {}
        }
        return true;
      }
      return false;
    },

    /** Snapshot visible inputs for error messages. */
    describeDialogFields(dialog) {
      if (!dialog) return '';
      const lines = [];
      const push = (label, el) => {
        if (!el) {
          lines.push(label + ': (nenalezeno)');
          return;
        }
        let val = '';
        if (el.tagName === 'SELECT') {
          const opt = el.options[el.selectedIndex];
          val = (opt && textOf(opt)) || el.value || '';
        } else val = String(el.value || '').trim();
        lines.push(
          label +
            ': ' +
            (val || '(prázdné)') +
            (el.disabled ? ' [disabled]' : '')
        );
      };
      push('TypZmeny', this.findEventSelect(dialog));
      push('Datum', this.findDateInput(dialog));
      push('Pocet', this.findCountInput(dialog));
      push('Provozovna', this.findPartnerInput(dialog));
      return lines.join(' | ');
    },

    extractPortalErrors(dialog) {
      if (!dialog) return '';
      const chunks = [];
      qsa(
        [
          '.field-validation-error',
          '.validation-summary-errors',
          '.validation-summary-errors li',
          '.error',
          '.alert',
          '.alert-danger',
          '.ui-state-error',
          '[class*="chyba" i]',
          '[class*="error" i]',
          '.aq-error',
          '.message-error',
        ].join(', '),
        dialog
      ).forEach((el) => {
        const t = textOf(el);
        if (t && t.length > 2 && t.length < 200 && !chunks.includes(t))
          chunks.push(t);
      });
      // Also scan for Czech validation phrases in plain text nodes / spans
      if (!chunks.length) {
        const blob = textOf(dialog);
        const m = blob.match(
          /([^.!?\n]{0,40}(povinn|neplatn|vyplňte|vyplnte|chyba|mus[ií] b[yý]t)[^.!?\n]{0,60})/i
        );
        if (m) chunks.push(m[1].trim());
      }
      return chunks.join(' · ');
    },

    beginNativeFill() {
      document.body.classList.add('pf-native-pig-fill');
    },

    endNativeFill() {
      document.body.classList.remove('pf-native-pig-fill');
    },

    closeNativeDialog(dialog) {
      const d = dialog || this.activeDialog();
      if (!d) return;
      try {
        if (refresh$() && $(d).hasClass('ui-dialog') === false && $(d).dialog) {
          $(d).dialog('close');
          return;
        }
      } catch (_) {}
      try {
        const $dlg = refresh$() && $(d).closest('.ui-dialog');
        if ($dlg && $dlg.length) {
          const widget = $dlg.find('.ui-dialog-content');
          if (widget.length && widget.dialog) {
            widget.dialog('close');
            return;
          }
        }
      } catch (_) {}
      const closer = qsa(
        '.ui-dialog-titlebar-close, button.ui-dialog-titlebar-close, .ui-icon-closethick',
        d.closest ? d.closest('.ui-dialog') || d : d
      )[0];
      if (closer) {
        try {
          closer.click();
        } catch (_) {}
      }
    },

    async runNative(typ, data) {
      // Keep our modal visible; hide native DialogSRSkup completely while filling
      this.beginNativeFill();
      let dialog = null;
      try {
        this.openNativeDialog();
        dialog = await this.waitFor(() => this.activeDialog(), {
          timeout: 15000,
          label: 'otevření dialogu pořízení hlášení',
        });

        await this.waitFor(() => {
          dialog = this.activeDialog() || dialog;
          const sel = this.findEventSelect(dialog);
          if (!sel) return false;
          if (sel.value !== typ) this.setEventType(dialog, typ);
          return sel.value === typ;
        }, { timeout: 10000, label: 'načtení typu události' });
        if (!this.findEventSelect(dialog) || this.findEventSelect(dialog).value !== typ) {
          if (!this.setEventType(dialog, typ)) {
            throw new Error(
              'V dialogu se nepodařilo vybrat událost „' + typ + '“.'
            );
          }
        }

        // Form reloads after zmenaUdalosti — wait for canonical rsrp fields
        await this.waitFor(() => {
          dialog = this.activeDialog() || dialog;
          const hasDate = !!this.findDateInput(dialog);
          const hasCount = !!this.findCountInput(dialog);
          return hasDate && hasCount;
        }, { timeout: 12000, label: 'načtení formuláře události' });

        // Let portal AJAX finish replacing the form after event change
        await new Promise((r) => setTimeout(r, 500));
        dialog = this.activeDialog() || dialog;

        if (!this.setDate(dialog, data.date)) {
          throw new Error('V dialogu se nepodařilo vyplnit datum (.rsrp-datum).');
        }

        if (!this.setMaleCount(dialog, data.count)) {
          throw new Error(
            'V dialogu se nepodařilo vyplnit počet (.rsrp-pocet).'
          );
        }

        if (typ === 'NakupPrisun' && data.partnerId) {
          if (!this.setPartner(dialog, data.partnerId, data.partnerName)) {
            throw new Error(
              'V dialogu se nepodařilo vyplnit partnera (.rsrp-provozovna).'
            );
          }
          await new Promise((r) => setTimeout(r, 350));
          this.setPartner(dialog, data.partnerId, data.partnerName);
        }

        // Re-assert fields right before save (portal scripts may clear them)
        this.setDate(dialog, data.date);
        this.setMaleCount(dialog, data.count);
        if (typ === 'NakupPrisun' && data.partnerId) {
          this.setPartner(dialog, data.partnerId, data.partnerName);
        }

        // Brief settle so datepicker/mask commit values
        await new Promise((r) => setTimeout(r, 200));
        dialog = this.activeDialog() || dialog;

        const pendingBefore = (() => {
          try {
            return (
              (PF.pending.state &&
                PF.pending.state.rows &&
                PF.pending.state.rows.length) ||
              0
            );
          } catch (_) {
            return 0;
          }
        })();

        const saved = this.clickSave(dialog);
        if (!saved) {
          throw new Error(
            'V portálu se nepodařilo najít tlačítko Uložit.'
          );
        }

        // Wait until native dialog closes (or long enough for postback)
        try {
          await this.waitFor(() => !this.activeDialog(), {
            timeout: 12000,
            label: 'uložení hlášení',
          });
        } catch (_) {
          const still = this.activeDialog();
          if (still) {
            const portalErr = this.extractPortalErrors(still);
            const snap = this.describeDialogFields(still);
            const errText = norm(textOf(still)).slice(0, 240);
            if (
              portalErr ||
              /chyba|povinn|neplatn|vyplnte|vyplňte/.test(errText)
            ) {
              throw new Error(
                'Portál hlášení neuložil' +
                  (portalErr ? ': ' + portalErr : '.') +
                  (snap ? ' (' + snap + ')' : '')
              );
            }
          }
          this.closeNativeDialog(dialog);
        }

        // Announce as soon as portal accepted the save (before slow pending refresh)
        try {
          PF.toast.saved('pig', typ, data);
        } catch (_) {}

        // Refresh pending-changes strip and verify a row appeared when possible
        try {
          PF.pending._loadedKind = null;
          await Promise.resolve(PF.pending.refresh('pig', { force: true }));
          await new Promise((r) => setTimeout(r, 700));
          let pendingAfter =
            (PF.pending.state &&
              PF.pending.state.rows &&
              PF.pending.state.rows.length) ||
            0;
          if (pendingAfter <= pendingBefore) {
            PF.pending._loadedKind = null;
            await Promise.resolve(PF.pending.refresh('pig', { force: true }));
            await new Promise((r) => setTimeout(r, 900));
            pendingAfter =
              (PF.pending.state &&
                PF.pending.state.rows &&
                PF.pending.state.rows.length) ||
              0;
          }
          if (pendingAfter <= pendingBefore) {
            throw new Error(
              'Hlášení se neobjevilo v neodeslaných změnách. Zkuste akci znovu.'
            );
          }
        } catch (ex) {
          if (
            ex &&
            /neobjevilo|neuložil|nepodařilo/.test(
              String(ex.message || ex)
            )
          )
            throw ex;
        }
        // "Poslední změna" comes from processed history (stav=zpracováno), not pending saves
      } catch (e) {
        try {
          this.closeNativeDialog(dialog);
        } catch (_) {}
        throw e instanceof Error
          ? e
          : new Error(e && e.message ? e.message : String(e));
      } finally {
        this.endNativeFill();
        setTimeout(() => {
          this.endNativeFill();
          // Sweep any leftover invisible overlays
          qsa('.ui-widget-overlay').forEach((ov) => {
            if (window.getComputedStyle(ov).opacity === '0') ov.remove();
          });
          // Only reset host if no dialog is active (don't abort late AJAX)
          if (!this.activeDialog()) {
            try {
              PF.registers.resetDialogHost();
            } catch (_) {}
          }
        }, 800);
      }
    },
  };

  /* ------------------------------------------------------------------ */
  /* Sheep custom forms → fill native DialogPorizeni off-screen         */
  /* Structure differs from pigs (per-animal rows, matka/otec, dopravce)*/
  /* ------------------------------------------------------------------ */
  PF.sheepForms = {
    todayCz() {
      return PF.pigForms.todayCz();
    },
    toPortalDate(s) {
      return PF.pigForms.toPortalDate(s);
    },
    fetchHtml(url) {
      return PF.pigForms.fetchHtml(url);
    },
    waitFor(check, opts) {
      return PF.pigForms.waitFor(check, opts);
    },

    openByTyp(typ) {
      const map = {
        NakupPrisun: () => this.openBuy(),
        Narozeni: () => this.openBirth(),
        ProdejOdsun: () => this.openOut(),
        DomaciPorazka: () => this.openKill(),
        Zcizeni: () => this.openStolen(),
      };
      if (!map[typ]) return false;
      map[typ]();
      return true;
    },

    closeModal() {
      const el = qs('#pf-sheep-modal');
      if (el) el.remove();
    },

    fieldErrorEl(field) {
      if (!field) return null;
      const wrap = field.closest('.pf-modal-field');
      return wrap ? qs('.pf-field-error', wrap) : null;
    },

    setFieldError(field, message) {
      if (!field) return;
      const msg = String(message || '');
      field.classList.toggle('pf-invalid', !!msg);
      try {
        field.setCustomValidity(msg);
      } catch (_) {}
      field.setAttribute('aria-invalid', msg ? 'true' : 'false');
      const errEl = this.fieldErrorEl(field);
      if (errEl) errEl.textContent = msg;
    },

    clearFieldError(field) {
      this.setFieldError(field, '');
    },

    /** Animals currently visible in the simplified sheep register. */
    listHerdAnimals({ sex } = {}) {
      const out = [];
      const seen = new Set();
      const tables = qsa('#pf-host .pf-simple-table, .pf-simple-table');
      tables.forEach((table) => {
        if (
          table.closest &&
          table.closest('#pf-pending-section, .pf-modal, #pf-pending-table')
        )
          return;
        const headers = qsa('thead th', table).map((th) =>
          norm(textOf(th) + ' ' + (th.getAttribute('data-colname') || ''))
        );
        let earIdx = headers.findIndex((h) => /usni|znamka/.test(h));
        let sexIdx = headers.findIndex((h) => /pohlav/.test(h));
        if (earIdx < 0) earIdx = headers.findIndex((h, i) => i > 0 && h);
        qsa('tbody tr', table).forEach((tr) => {
          if (qs('.pf-simple-empty', tr)) return;
          const cells = qsa(':scope > td', tr);
          if (!cells.length) return;
          const earRaw = earIdx >= 0 ? textOf(cells[earIdx]) : '';
          const ear = String(earRaw || '')
            .replace(/\s+/g, ' ')
            .trim();
          if (!ear || ear.length < 5) return;
          let s =
            tr.classList.contains('pf-sex-male')
              ? 'male'
              : tr.classList.contains('pf-sex-female')
                ? 'female'
                : null;
          if (!s && sexIdx >= 0) s = PF.scrape.classifySex(textOf(cells[sexIdx]));
          if (!s) s = PF.scrape.classifySex(textOf(tr));
          if (sex && s !== sex) return;
          const key = norm(ear.replace(/\s+/g, ''));
          if (seen.has(key)) return;
          seen.add(key);
          out.push({ ear, sex: s || '' });
        });
      });
      return out;
    },

    selectedHerdEars() {
      const ears = [];
      qsa('#pf-host .pf-simple-table tbody tr.pf-row-selected').forEach((tr) => {
        const cells = qsa('td:not(.pf-select-col)', tr);
        const ear = cells[0] ? textOf(cells[0]).replace(/\s+/g, ' ').trim() : '';
        if (ear) ears.push(ear);
      });
      return ears;
    },

    /**
     * Display form for ear marks: CZ0000073842956 → "CZ0000073842 956"
     * (space before the last 3 digits).
     */
    formatEarMark(raw) {
      const compact = String(raw || '')
        .replace(/\s+/g, '')
        .toUpperCase();
      const m = compact.match(/^(CZ)(\d+)$/i);
      if (!m || m[2].length <= 3) return compact || String(raw || '').trim();
      return m[1] + m[2].slice(0, -3) + ' ' + m[2].slice(-3);
    },

    parseEarMarkDigits(raw) {
      const compact = String(raw || '')
        .replace(/\s+/g, '')
        .toUpperCase();
      const m = compact.match(/^CZ(\d+)$/);
      if (!m) return null;
      const d = m[1];
      if (d.length <= 3) return null;
      return { prefix: d.slice(0, -3), suffix: d.slice(-3), digits: d };
    },

    /** Expand "Volné známky od/do" into individual marks (inclusive). */
    expandEarMarkRange(fromRaw, toRaw) {
      const a = this.parseEarMarkDigits(fromRaw);
      const b = this.parseEarMarkDigits(toRaw);
      if (!a || !b || a.suffix !== b.suffix) return [];
      let start;
      let end;
      try {
        start = BigInt(a.prefix);
        end = BigInt(b.prefix);
      } catch (_) {
        return [];
      }
      if (end < start) return [];
      const width = a.prefix.length;
      const maxExpand = 500;
      const out = [];
      for (let i = start; i <= end; i++) {
        if (out.length >= maxExpand) break;
        const body = i.toString().padStart(width, '0');
        out.push(this.formatEarMark('CZ' + body + a.suffix));
      }
      return out;
    },

    resolveSubjectIdsFromHtml(html) {
      const out = { idSubjektu: '', idProvozovny: '' };
      const src = String(html || '');
      const sub =
        src.match(/NezaveseneZnamky\?[^"'<\s]*idSubjektu=([a-f0-9]{32})/i) ||
        src.match(/[?&]idSubjektu=([a-f0-9]{32})/i) ||
        src.match(/[?&]idChovatele=([a-f0-9]{32})/i);
      if (sub) out.idSubjektu = sub[1].toLowerCase();
      // Prefer sheep Nezavesene / stavy link with real provozovna (not all-zeros)
      const sheepLink = src.match(
        /NezaveseneZnamky\?[^"'<\s]*idProvozovny=([a-f0-9]{32})[^"'<\s]*fiDruhZvirat=8328837ecad54c558d7a3098d2b160db/i
      ) || src.match(
        /VyhledaniStavyIndiv\/Seznam\?[^"'<\s]*idProvozovny=([a-f0-9]{32})[^"'<\s]*fiDruhZvirat=8328837ecad54c558d7a3098d2b160db/i
      );
      if (sheepLink && !/^0+$/.test(sheepLink[1])) {
        out.idProvozovny = sheepLink[1].toLowerCase();
      } else {
        const anyProv = src.match(
          /NezaveseneZnamky\?[^"'<\s]*idProvozovny=([a-f0-9]{32})/i
        );
        if (anyProv && !/^0+$/.test(anyProv[1]))
          out.idProvozovny = anyProv[1].toLowerCase();
      }
      return out;
    },

    resolveSubjectIds() {
      const cached = {};
      try {
        const raw = localStorage.getItem('pf-sheep-subject-ids');
        if (raw) Object.assign(cached, JSON.parse(raw) || {});
      } catch (_) {}

      const fromDom = this.resolveSubjectIdsFromHtml(document.documentElement.innerHTML);
      const idSubjektu = fromDom.idSubjektu || cached.idSubjektu || '';
      const idProvozovny =
        fromDom.idProvozovny ||
        cached.idProvozovny ||
        '00000000000000000000000000000000';

      if (idSubjektu) {
        try {
          localStorage.setItem(
            'pf-sheep-subject-ids',
            JSON.stringify({ idSubjektu, idProvozovny })
          );
        } catch (_) {}
      }
      return { idSubjektu, idProvozovny };
    },

    freeMarksPageUrl(ids) {
      const idSubjektu = (ids && ids.idSubjektu) || '';
      if (!idSubjektu) return '';
      const idProvozovny =
        (ids && ids.idProvozovny) ||
        '00000000000000000000000000000000';
      return (
        PF.config.freeMarksPath +
        '?idSubjektu=' +
        encodeURIComponent(idSubjektu) +
        '&idProvozovny=' +
        encodeURIComponent(idProvozovny) +
        '&fiDruhZvirat=' +
        encodeURIComponent(PF.config.sheepDruhKey)
      );
    },

    /**
     * Parse NezaveseneZnamky table: ranges "Volné známky od/do" + pohlaví.
     * Returns [{ ear, sex: 'male'|'female'|'' }, ...]
     */
    parseFreeMarksPage(html) {
      const out = [];
      const seen = new Set();
      try {
        const doc = new DOMParser().parseFromString(html || '', 'text/html');
        const tables = qsa('table', doc);
        tables.forEach((table) => {
          const headRow =
            qs('thead tr', table) ||
            qsa('tr', table).find((tr) => qs('th', tr));
          if (!headRow) return;
          const headers = qsa('th, td', headRow).map((c) => norm(textOf(c)));
          const odIdx = headers.findIndex((h) => /volne znamky od|znamky od/.test(h));
          const doIdx = headers.findIndex((h) => /volne znamky do|znamky do/.test(h));
          if (odIdx < 0 || doIdx < 0) return;
          const sexIdx = headers.findIndex((h) => /pohlav/.test(h));
          qsa('tbody tr', table).forEach((tr) => {
            if (qs('th', tr)) return;
            const cells = qsa(':scope > td', tr);
            if (!cells.length) return;
            const od = textOf(cells[odIdx] || null);
            const doto = textOf(cells[doIdx] || null);
            if (!od || !doto) return;
            const sexRaw = sexIdx >= 0 ? textOf(cells[sexIdx]) : '';
            const sex = PF.scrape.classifySex(sexRaw) || '';
            this.expandEarMarkRange(od, doto).forEach((ear) => {
              const key = norm(ear.replace(/\s+/g, ''));
              if (seen.has(key)) return;
              seen.add(key);
              out.push({ ear, sex });
            });
          });
        });
      } catch (_) {}
      return out;
    },

    async loadAvailableMarks() {
      try {
        let ids = this.resolveSubjectIds();
        if (!ids.idSubjektu) {
          // Home page carries the NezaveseneZnamky link with real IDs
          const homeHtml = await this.fetchHtml(PF.config.home);
          const fromHome = this.resolveSubjectIdsFromHtml(homeHtml);
          if (fromHome.idSubjektu) {
            ids = {
              idSubjektu: fromHome.idSubjektu,
              idProvozovny:
                fromHome.idProvozovny ||
                ids.idProvozovny ||
                '00000000000000000000000000000000',
            };
            try {
              localStorage.setItem('pf-sheep-subject-ids', JSON.stringify(ids));
            } catch (_) {}
          }
        }
        const url = this.freeMarksPageUrl(ids);
        if (!url) return [];
        const html = await this.fetchHtml(url);
        const marks = this.parseFreeMarksPage(html);
        if (marks.length) return marks;
        // Retry with all-zeros provozovna (whole subject) if specific one failed
        if (ids.idProvozovny && !/^0+$/.test(ids.idProvozovny)) {
          const url2 = this.freeMarksPageUrl({
            idSubjektu: ids.idSubjektu,
            idProvozovny: '00000000000000000000000000000000',
          });
          const html2 = await this.fetchHtml(url2);
          return this.parseFreeMarksPage(html2);
        }
        return [];
      } catch (_) {
        return [];
      }
    },

    fillMarkSelect(sel, marks, { sex, hint } = {}) {
      if (!sel || sel.tagName !== 'SELECT') return;
      const list = (marks || []).filter((m) => {
        if (!sex) return true;
        return !m.sex || m.sex === sex;
      });
      const prev = String(sel.value || '').trim();
      sel.innerHTML = '';
      const ph = document.createElement('option');
      ph.value = '';
      ph.textContent = list.length
        ? 'Vyberte ušní číslo, které mládě dostalo…'
        : sex
          ? 'Žádná volná známka pro toto pohlaví'
          : 'Žádná volná známka';
      sel.appendChild(ph);
      list.forEach((m) => {
        const o = document.createElement('option');
        o.value = m.ear;
        o.textContent =
          m.ear +
          (m.sex === 'male' ? ' ♂' : m.sex === 'female' ? ' ♀' : '');
        sel.appendChild(o);
      });
      if (prev && qsa('option', sel).some((o) => o.value === prev)) {
        sel.value = prev;
      }
      if (hint) {
        hint.textContent = list.length
          ? ''
          : marks && marks.length
            ? 'Pro zvolené pohlaví nejsou volné známky — změňte pohlaví nebo zadejte ručně.'
            : '';
      }
    },

    partnerListUrls() {
      const idProv =
        getParam('idProvozovnySR') || '00000000000000000000000000000000';
      const idSR = getParam('idStajovyRegistr') || '';
      const idStaj = getParam('idStaj') || '00000000000000000000000000000000';
      if (!idSR) return [];
      return [
        '/ssl/app/izr2far/StajoveRegistry/StajovyRegistrIndivPartneri?idProvozovnySR=' +
          encodeURIComponent(idProv) +
          '&idStajovyRegistr=' +
          encodeURIComponent(idSR) +
          '&idStaj=' +
          encodeURIComponent(idStaj),
        '/ssl/app/izr2far/StajoveRegistry/StajovyRegistrIndiv/Partneri?idStajovyRegistr=' +
          encodeURIComponent(idSR),
      ];
    },

    loadPartnersInto(sel, hint) {
      // Reuse pig partner parsing — same 8-digit registration numbers
      const cached = PF.pigForms.cachedPartners();
      if (cached.length) {
        this.fillSheepPartnerSelect(sel, cached, hint);
      } else if (sel && sel.tagName === 'SELECT') {
        sel.innerHTML = '<option value="">Načítám partnery…</option>';
      }
      const urls = this.partnerListUrls();
      const tryUrls = (i) => {
        if (i >= urls.length) {
          if (!PF.pigForms.cachedPartners().length) {
            if (hint)
              hint.textContent =
                'Seznam prázdný — zvolte „Zadat ručně“ a vyplňte ID.';
            this.fillSheepPartnerSelect(sel, [], hint);
          }
          return;
        }
        this.fetchHtml(urls[i]).then((html) => {
          const list = PF.pigForms.parsePartners(html);
          if (list.length) {
            PF.pigForms.savePartners(list, { replace: true });
            this.fillSheepPartnerSelect(
              qs('#pf-sheep-form-partner') || sel,
              PF.pigForms.cachedPartners(),
              hint
            );
            return;
          }
          tryUrls(i + 1);
        });
      };
      tryUrls(0);
    },

    /** Sentinel select value that reveals the manual ID field. */
    PARTNER_MANUAL: '__manual__',

    fillSheepPartnerSelect(sel, list, hint) {
      if (!sel || sel.tagName !== 'SELECT') return;
      const items = PF.pigForms.sanitizePartnerList(
        list && list.length ? list : []
      );
      const prev = String(sel.value || '').trim();
      sel.innerHTML = '';
      const ph = document.createElement('option');
      ph.value = '';
      ph.textContent = items.length
        ? 'Vyberte partnera…'
        : 'Žádný partner v seznamu';
      sel.appendChild(ph);
      items.forEach((p) => {
        const o = document.createElement('option');
        o.value = p.id;
        o.textContent = p.name ? p.name + ' (' + p.id + ')' : p.id;
        sel.appendChild(o);
      });
      const manualOpt = document.createElement('option');
      manualOpt.value = this.PARTNER_MANUAL;
      manualOpt.textContent = 'Zadat ručně';
      sel.appendChild(manualOpt);
      if (prev === this.PARTNER_MANUAL) sel.value = this.PARTNER_MANUAL;
      else if (prev && items.some((p) => p.id === prev)) sel.value = prev;
      else if (items.length === 1) sel.value = items[0].id;
      if (hint) hint.textContent = '';
      const wrap = sel.closest('#pf-sheep-modal, .pf-modal') || document;
      this.syncPartnerManualVisibility(wrap);
    },

    earSelectHtml(id, label, animals, { required, placeholder } = {}) {
      const req = required !== false;
      let opts =
        '<option value="">' +
        escapeHtml(placeholder || 'Vyberte ušní číslo…') +
        '</option>';
      (animals || []).forEach((a) => {
        opts +=
          '<option value="' +
          escapeHtml(a.ear) +
          '">' +
          escapeHtml(a.ear) +
          (a.sex === 'male'
            ? ' ♂'
            : a.sex === 'female'
              ? ' ♀'
              : '') +
          '</option>';
      });
      return (
        '<div class="pf-modal-field">' +
        '<label for="' +
        id +
        '">' +
        escapeHtml(label) +
        '</label>' +
        '<select id="' +
        id +
        '" name="' +
        id +
        '"' +
        (req ? ' required aria-required="true"' : '') +
        '>' +
        opts +
        '</select>' +
        '<p class="pf-field-error" role="alert"></p>' +
        '</div>'
      );
    },

    earTextHtml(id, label) {
      return (
        '<div class="pf-modal-field">' +
        '<label for="' +
        id +
        '">' +
        escapeHtml(label) +
        '</label>' +
        '<input id="' +
        id +
        '" name="' +
        id +
        '" type="text" required aria-required="true" placeholder="CZ0000073841 956" autocomplete="off" />' +
        '<p class="pf-field-error" role="alert"></p>' +
        '</div>'
      );
    },

    /** Multi-row ear-mark block (bulk ops from table selection). */
    earRowsBlockHtml(label) {
      return (
        '<div class="pf-modal-field">' +
        '<label>' +
        escapeHtml(label || 'Ušní čísla') +
        '</label>' +
        '<div class="pf-sheep-ear-rows" id="pf-sheep-ear-rows"></div>' +
        '<p class="pf-sheep-ear-rows-err" id="pf-sheep-ear-rows-err" role="alert"></p>' +
        '</div>'
      );
    },

    earOptionHtml(animals, selected) {
      let opts =
        '<option value="">Vyberte ušní číslo…</option>';
      (animals || []).forEach((a) => {
        const sel =
          selected && norm(a.ear) === norm(selected) ? ' selected' : '';
        opts +=
          '<option value="' +
          escapeHtml(a.ear) +
          '"' +
          sel +
          '>' +
          escapeHtml(a.ear) +
          (a.sex === 'male' ? ' ♂' : a.sex === 'female' ? ' ♀' : '') +
          '</option>';
      });
      return opts;
    },

    /**
     * Build editable ear rows. initialEars from table selection (or ['']).
     * User can change any row and remove until one remains.
     */
    mountEarRows(wrap, { animals, initialEars } = {}) {
      const host = qs('#pf-sheep-ear-rows', wrap);
      if (!host) return;
      const herd = animals || this.listHerdAnimals();
      let ears = (initialEars || []).map((e) => String(e || '').trim()).filter(Boolean);
      if (!ears.length) ears = [''];
      wrap._pfEarAnimals = herd;

      const syncRemoveButtons = () => {
        const rows = qsa('.pf-sheep-ear-row', host);
        rows.forEach((row) => {
          const btn = qs('.pf-sheep-ear-remove', row);
          if (!btn) return;
          btn.disabled = rows.length <= 1;
          btn.title =
            rows.length <= 1
              ? 'Alespoň jedna ovce musí zůstat'
              : 'Odebrat';
        });
      };

      const render = () => {
        host.innerHTML = '';
        ears.forEach((ear, idx) => {
          const row = document.createElement('div');
          row.className = 'pf-sheep-ear-row';
          row.dataset.idx = String(idx);
          const field = document.createElement('div');
          field.className = 'pf-sheep-ear-field';
          const sel = document.createElement('select');
          sel.className = 'pf-sheep-ear-input';
          sel.setAttribute('aria-label', 'Ušní číslo ' + (idx + 1));
          sel.innerHTML = this.earOptionHtml(herd, ear);
          if (ear) {
            const has = qsa('option', sel).some((o) => o.value === ear);
            if (!has) {
              const o = document.createElement('option');
              o.value = ear;
              o.textContent = ear;
              o.selected = true;
              sel.appendChild(o);
            } else sel.value = ear;
          }
          sel.addEventListener('change', () => {
            ears[idx] = String(sel.value || '').trim();
            this.validateEarRows(wrap, { focus: false });
          });
          field.appendChild(sel);
          row.appendChild(field);

          const rm = document.createElement('button');
          rm.type = 'button';
          rm.className = 'pf-sheep-ear-remove';
          rm.setAttribute('aria-label', 'Odebrat ovci');
          rm.textContent = '×';
          rm.addEventListener('click', () => {
            if (ears.length <= 1) return;
            ears.splice(idx, 1);
            render();
          });
          row.appendChild(rm);
          host.appendChild(row);
        });
        syncRemoveButtons();
      };

      wrap._pfGetEars = () =>
        qsa('.pf-sheep-ear-input', host).map((el) =>
          String(el.value || '').trim()
        );
      wrap._pfSetEars = (next) => {
        ears = (next || []).slice();
        if (!ears.length) ears = [''];
        render();
      };
      render();
    },

    clearEarRowsError(wrap) {
      const err = qs('#pf-sheep-ear-rows-err', wrap);
      if (err) err.textContent = '';
      qsa('.pf-sheep-ear-input', wrap).forEach((el) =>
        el.classList.remove('pf-invalid')
      );
    },

    validateEarRows(wrap, { focus } = {}) {
      const ears = wrap._pfGetEars ? wrap._pfGetEars() : [];
      const err = qs('#pf-sheep-ear-rows-err', wrap);
      const inputs = qsa('.pf-sheep-ear-input', wrap);
      let firstBad = null;
      inputs.forEach((el) => {
        const v = String(el.value || '').trim();
        el.classList.toggle('pf-invalid', !v);
        if (!v && !firstBad) firstBad = el;
      });
      if (firstBad) {
        if (err) err.textContent = 'Vyberte ušní číslo u každého řádku.';
        if (focus !== false) {
          try {
            firstBad.focus();
          } catch (_) {}
        }
        return false;
      }
      const norms = ears.map((e) => norm(e));
      const dup = norms.some((n, i) => n && norms.indexOf(n) !== i);
      if (dup) {
        if (err) err.textContent = 'Stejné ušní číslo je vybrané vícekrát.';
        return false;
      }
      if (err) err.textContent = '';
      return true;
    },

    readEars(wrap) {
      const ears = wrap._pfGetEars ? wrap._pfGetEars() : [];
      return ears.map((e) => String(e || '').trim()).filter(Boolean);
    },

    /** Match simplified-table selection to the ears we will submit. */
    syncNativeSelectionToEars(ears) {
      const want = new Set(
        (ears || []).map((e) => norm(String(e).replace(/\s+/g, '')))
      );
      const earFromCells = (cells) => {
        for (let i = 0; i < cells.length; i++) {
          const t = textOf(cells[i]).replace(/\s+/g, ' ').trim();
          if (/CZ/i.test(t) && t.length >= 8) return t;
        }
        return cells[0] ? textOf(cells[0]).replace(/\s+/g, ' ').trim() : '';
      };

      // Prefer pairing via our simplified table (has native sync hooks)
      qsa('#pf-host .pf-simple-table tbody tr.pf-row-selectable').forEach(
        (tr) => {
          const cells = qsa('td:not(.pf-select-col)', tr);
          const ear = earFromCells(cells);
          const key = norm(String(ear).replace(/\s+/g, ''));
          const should = !!(key && want.has(key));
          const cb = qs('.pf-row-check', tr);
          if (cb && typeof cb._pfSync === 'function') {
            if (!!cb.checked !== should) cb._pfSync(should);
          } else if (cb && !!cb.checked !== should) {
            cb.checked = should;
            tr.classList.toggle('pf-row-selected', should);
          }
        }
      );

      // Also sync leftover native grids outside simplified table
      qsa(
        '#pf-host table.grid-table tbody tr.grid-row, #main table.grid-table tbody tr.grid-row'
      ).forEach((nativeRow) => {
        if (nativeRow.closest && nativeRow.closest('.pf-simple-table-wrap'))
          return;
        const ear = earFromCells(qsa(':scope > td', nativeRow));
        const key = norm(String(ear).replace(/\s+/g, ''));
        if (!key) return;
        PF.registers.syncNativeRowSelect(nativeRow, want.has(key));
      });
    },

    dateFieldHtml(id, label) {
      return (
        '<div class="pf-modal-field">' +
        '<label for="' +
        id +
        '">' +
        escapeHtml(label) +
        '</label>' +
        '<input id="' +
        id +
        '" name="' +
        id +
        '" type="text" required aria-required="true" placeholder="d. m. rrrr" autocomplete="off" value="' +
        escapeHtml(this.todayCz()) +
        '" />' +
        '<p class="pf-field-error" role="alert"></p>' +
        '</div>'
      );
    },

    partnerFieldHtml() {
      return (
        '<div class="pf-modal-field">' +
        '<label for="pf-sheep-form-partner">Partner</label>' +
        '<select id="pf-sheep-form-partner" name="partner">' +
        '<option value="">Načítám partnery…</option></select>' +
        '<p class="pf-field-error" id="pf-sheep-form-partner-sel-err" role="alert"></p>' +
        '<p class="pf-modal-hint" id="pf-sheep-form-partner-hint"></p>' +
        '</div>' +
        '<div class="pf-modal-field" id="pf-sheep-partner-manual-wrap" hidden>' +
        '<label for="pf-sheep-form-partner-manual">ID partnera</label>' +
        '<input id="pf-sheep-form-partner-manual" name="partnerManual" type="text" inputmode="numeric" maxlength="8" placeholder="48192736" autocomplete="off" />' +
        '<p class="pf-field-error" id="pf-sheep-form-partner-err" role="alert"></p>' +
        '</div>'
      );
    },

    syncPartnerManualVisibility(wrap) {
      const root = wrap || document;
      const sel = qs('#pf-sheep-form-partner', root);
      const manualWrap = qs('#pf-sheep-partner-manual-wrap', root);
      const manual = qs('#pf-sheep-form-partner-manual', root);
      if (!sel || !manualWrap) return false;
      const isManual = String(sel.value || '') === this.PARTNER_MANUAL;
      manualWrap.hidden = !isManual;
      if (!isManual && manual) {
        manual.value = '';
        this.clearFieldError(manual);
      }
      return isManual;
    },

    bindPartnerFields(wrap) {
      const sel = qs('#pf-sheep-form-partner', wrap);
      const manual = qs('#pf-sheep-form-partner-manual', wrap);
      if (!sel || !manual) return;
      sel.addEventListener('change', () => {
        this.syncPartnerManualVisibility(wrap);
        if (String(sel.value || '') === this.PARTNER_MANUAL) {
          this.clearFieldError(sel);
          setTimeout(() => {
            try {
              manual.focus();
            } catch (_) {}
          }, 30);
        } else {
          this.validatePartnerPair(wrap);
        }
      });
      manual.addEventListener('input', () => {
        const v = String(manual.value || '').replace(/\D/g, '').slice(0, 8);
        if (v !== manual.value) manual.value = v;
        if (/^\d{8}$/.test(v)) this.clearFieldError(manual);
      });
      this.syncPartnerManualVisibility(wrap);
    },

    validatePartnerPair(wrap) {
      const root = wrap || document;
      const sel = qs('#pf-sheep-form-partner', root);
      const manual = qs('#pf-sheep-form-partner-manual', root);
      const fromSelect = sel ? String(sel.value || '').trim() : '';
      if (!fromSelect) {
        this.setFieldError(sel, 'Vyberte partnera.');
        return false;
      }
      if (fromSelect === this.PARTNER_MANUAL) {
        const fromManual = manual ? String(manual.value || '').trim() : '';
        if (!fromManual) {
          this.setFieldError(manual, 'Zadejte ID partnera.');
          return false;
        }
        if (!/^\d{8}$/.test(fromManual)) {
          this.setFieldError(manual, 'ID partnera musí mít 8 číslic.');
          return false;
        }
        this.clearFieldError(manual);
        this.clearFieldError(sel);
        return true;
      }
      if (!/^\d{8}$/.test(fromSelect)) {
        this.setFieldError(sel, 'Neplatný partner.');
        return false;
      }
      this.clearFieldError(sel);
      if (manual) this.clearFieldError(manual);
      return true;
    },

    noteFieldHtml() {
      return (
        '<div class="pf-modal-field">' +
        '<label for="pf-sheep-form-note">Poznámka (volitelně)</label>' +
        '<textarea id="pf-sheep-form-note" name="note" rows="2"></textarea>' +
        '</div>'
      );
    },

    validateDateField(field) {
      const raw = String(field.value || '').trim();
      if (!raw) {
        this.setFieldError(field, 'Zadejte datum.');
        return false;
      }
      const parsed = PF.datePicker.parse(raw);
      if (!parsed) {
        this.setFieldError(field, 'Datum zadejte ve tvaru d. m. rrrr.');
        return false;
      }
      if (!PF.datePicker.inRange(parsed, {})) {
        this.setFieldError(field, 'Datum nesmí být v budoucnosti.');
        return false;
      }
      this.clearFieldError(field);
      return true;
    },

    validateEarField(field) {
      const raw = String(field.value || '').trim();
      if (!raw) {
        this.setFieldError(
          field,
          field.tagName === 'SELECT'
            ? 'Vyberte ušní číslo.'
            : 'Zadejte ušní číslo.'
        );
        return false;
      }
      this.clearFieldError(field);
      return true;
    },

    validatePartnerField(field) {
      // Legacy single-field path — prefer validatePartnerPair when both exist
      const wrap = field && field.closest ? field.closest('#pf-sheep-modal, .pf-modal') : null;
      if (wrap && qs('#pf-sheep-form-partner-manual', wrap)) {
        return this.validatePartnerPair(wrap);
      }
      const raw = String(field.value || '').trim();
      if (!raw) {
        this.setFieldError(
          field,
          field.tagName === 'SELECT'
            ? 'Vyberte partnera.'
            : 'Zadejte ID partnera.'
        );
        return false;
      }
      if (field.tagName === 'INPUT' && !/^\d{8}$/.test(raw)) {
        this.setFieldError(field, 'ID partnera musí mít 8 číslic.');
        return false;
      }
      this.clearFieldError(field);
      return true;
    },

    validateForm(form, { needPartner, needSex, needWalkSpz } = {}) {
      const root = form.closest('.pf-modal') || form;
      let first = null;
      const check = (sel, fn) => {
        const el = qs(sel, root);
        if (!el || el.disabled || el.closest('[hidden]')) return;
        if (!fn.call(this, el) && !first) first = el;
      };
      check('#pf-sheep-form-ear', this.validateEarField);
      check('#pf-sheep-form-mark', this.validateEarField);
      check('#pf-sheep-form-mother', this.validateEarField);
      if (qs('#pf-sheep-ear-rows', root)) {
        if (!this.validateEarRows(root) && !first) {
          first = qs('.pf-sheep-ear-input.pf-invalid', root) || qs('.pf-sheep-ear-input', root);
        }
      }
      if (needSex) {
        check('#pf-sheep-form-sex', (f) => {
          if (!String(f.value || '').trim()) {
            this.setFieldError(f, 'Vyberte pohlaví.');
            return false;
          }
          this.clearFieldError(f);
          return true;
        });
      }
      check('#pf-sheep-form-date', this.validateDateField);
      if (needPartner) {
        if (!this.validatePartnerPair(root) && !first) {
          const pSel = qs('#pf-sheep-form-partner', root);
          const isManual =
            pSel && String(pSel.value || '') === this.PARTNER_MANUAL;
          first = isManual
            ? qs('#pf-sheep-form-partner-manual', root) || pSel
            : pSel;
        }
      }
      if (needWalkSpz) {
        const walk = qs('#pf-sheep-form-walk', root);
        const byWalk = walk && walk.checked;
        check('#pf-sheep-form-carrier-first', (f) => {
          if (!String(f.value || '').trim()) {
            this.setFieldError(f, 'Zadejte jméno přepravce.');
            return false;
          }
          this.clearFieldError(f);
          return true;
        });
        check('#pf-sheep-form-carrier-last', (f) => {
          if (!String(f.value || '').trim()) {
            this.setFieldError(f, 'Zadejte příjmení přepravce.');
            return false;
          }
          this.clearFieldError(f);
          return true;
        });
        if (!byWalk) {
          check('#pf-sheep-form-spz', (f) => {
            if (!String(f.value || '').trim()) {
              this.setFieldError(f, 'Zadejte SPZ vozidla.');
              return false;
            }
            this.clearFieldError(f);
            return true;
          });
        }
      }
      if (first) {
        try {
          first.focus();
        } catch (_) {}
        return false;
      }
      return true;
    },

    /** Live validation for a single sheep modal field (blur / change). */
    validateSheepField(field, opts) {
      if (!field || field.disabled) return true;
      if (field.closest && field.closest('[hidden]')) return true;
      const options = opts || {};
      const id = field.id || '';
      const wrap =
        (field.closest && field.closest('#pf-sheep-modal, .pf-modal')) ||
        document;

      if (field.classList.contains('pf-sheep-ear-input')) {
        return this.validateEarRows(wrap, { focus: false });
      }
      if (
        id === 'pf-sheep-form-ear' ||
        id === 'pf-sheep-form-mark' ||
        id === 'pf-sheep-form-mother'
      ) {
        return this.validateEarField(field);
      }
      if (id === 'pf-sheep-form-father') {
        this.clearFieldError(field);
        return true;
      }
      if (id === 'pf-sheep-form-sex') {
        if (!options.needSex) return true;
        if (!String(field.value || '').trim()) {
          this.setFieldError(field, 'Vyberte pohlaví.');
          return false;
        }
        this.clearFieldError(field);
        return true;
      }
      if (id === 'pf-sheep-form-date') {
        return this.validateDateField(field);
      }
      if (
        id === 'pf-sheep-form-partner' ||
        id === 'pf-sheep-form-partner-manual'
      ) {
        if (!options.needPartner) return true;
        return this.validatePartnerPair(wrap);
      }
      if (options.needWalkSpz) {
        if (id === 'pf-sheep-form-carrier-first') {
          if (!String(field.value || '').trim()) {
            this.setFieldError(field, 'Zadejte jméno přepravce.');
            return false;
          }
          this.clearFieldError(field);
          return true;
        }
        if (id === 'pf-sheep-form-carrier-last') {
          if (!String(field.value || '').trim()) {
            this.setFieldError(field, 'Zadejte příjmení přepravce.');
            return false;
          }
          this.clearFieldError(field);
          return true;
        }
        if (id === 'pf-sheep-form-spz') {
          const walk = qs('#pf-sheep-form-walk', wrap);
          if (walk && walk.checked) {
            this.clearFieldError(field);
            return true;
          }
          if (!String(field.value || '').trim()) {
            this.setFieldError(field, 'Zadejte SPZ vozidla.');
            return false;
          }
          this.clearFieldError(field);
          return true;
        }
      }
      return true;
    },

    bindSheepFormValidation(form, opts) {
      if (!form) return;
      const options = opts || {};
      const revalidate = (e) => {
        const t = e && e.target;
        if (!t || !form.contains(t)) return;
        if (!(t.matches && t.matches('input, select, textarea'))) return;
        if (
          t.id === 'pf-sheep-form-note' ||
          t.id === 'pf-sheep-form-walk' ||
          t.type === 'checkbox' ||
          t.type === 'button' ||
          t.type === 'submit'
        ) {
          return;
        }
        this.validateSheepField(t, options);
      };
      form.addEventListener('change', revalidate);
      // Blur live-check only while focus stays inside the dialog.
      // Backdrop / Cancel move focus out and would flash red errors on dismiss.
      form.addEventListener(
        'blur',
        (e) => {
          const modalRoot = form.closest('.pf-modal') || form;
          const next = e.relatedTarget;
          if (!next || !modalRoot.contains(next)) return;
          if (next.id === 'pf-sheep-cancel') return;
          revalidate(e);
        },
        true
      );
    },

    showModal({ title, fieldsHtml, onSubmit, wide, validateOpts, afterOpen }) {
      this.closeModal();
      const wrap = document.createElement('div');
      wrap.id = 'pf-sheep-modal';
      wrap.className = 'pf-modal-backdrop';
      wrap.innerHTML =
        '<div class="pf-modal' +
        (wide ? ' pf-modal-wide' : '') +
        '" role="dialog" aria-modal="true">' +
        '<div class="pf-modal-head"><h3>' +
        escapeHtml(title) +
        '</h3></div>' +
        '<form class="pf-modal-body" id="pf-sheep-form" novalidate>' +
        fieldsHtml +
        '<p class="pf-modal-error" id="pf-sheep-modal-err"></p>' +
        '<p class="pf-modal-status" id="pf-sheep-modal-status" hidden></p>' +
        '</form>' +
        '<div class="pf-modal-foot">' +
        '<button type="button" class="pf-btn" id="pf-sheep-cancel">Zrušit</button>' +
        '<button type="button" class="pf-btn pf-btn-primary" id="pf-sheep-ok">Uložit</button>' +
        '</div></div>';
      document.body.appendChild(wrap);

      const modal = qs('.pf-modal', wrap);
      const err = qs('#pf-sheep-modal-err', wrap);
      const status = qs('#pf-sheep-modal-status', wrap);
      const okBtn = qs('#pf-sheep-ok', wrap);
      const cancelBtn = qs('#pf-sheep-cancel', wrap);
      const form = qs('#pf-sheep-form', wrap);
      const opts = validateOpts || {};

      this.bindSheepFormValidation(form, opts);

      cancelBtn.addEventListener('click', () => this.closeModal());
      okBtn.addEventListener('click', () => {
        if (err) err.textContent = '';
        if (!this.validateForm(form, opts)) return;
        form.dispatchEvent(
          new Event('submit', { cancelable: true, bubbles: true })
        );
      });

      let backdropPointerDown = false;
      wrap.addEventListener('pointerdown', (e) => {
        backdropPointerDown = e.target === wrap;
      });
      wrap.addEventListener('click', (e) => {
        if (
          backdropPointerDown &&
          e.target === wrap &&
          !modal.classList.contains('is-busy')
        ) {
          this.closeModal();
        }
        backdropPointerDown = false;
      });

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!this.validateForm(form, opts)) return;
        if (err) err.textContent = '';
        if (status) {
          status.hidden = true;
          status.textContent = '';
        }
        // Single continuous farmer overlay until save finishes
        PF.loader.holdBusy('Ukládám…');
        Promise.resolve()
          .then(() => onSubmit(wrap, err))
          .then(() => {
            this.closeModal();
            PF.loader.releaseBusy();
            // Busy-hide may be interrupted by portal progress — ensure toast flush
            setTimeout(() => {
              try {
                PF.toast.flush();
              } catch (_) {}
            }, 450);
          })
          .catch((ex) => {
            okBtn.disabled = false;
            cancelBtn.disabled = false;
            okBtn.textContent = 'Uložit';
            PF.loader.releaseBusy();
            if (err && !err.textContent) {
              err.textContent =
                'Nepodařilo se uložit: ' +
                (ex && ex.message ? ex.message : ex);
            }
          });
      });

      if (typeof afterOpen === 'function') afterOpen(wrap);
      const first = qs('input, select, textarea', wrap);
      if (first) setTimeout(() => first.focus(), 50);
    },

    readPartner(wrap) {
      const sel = qs('#pf-sheep-form-partner', wrap);
      const manual = qs('#pf-sheep-form-partner-manual', wrap);
      const fromSelect = sel ? String(sel.value || '').trim() : '';
      let partnerId = '';
      let partnerName = '';
      if (fromSelect === this.PARTNER_MANUAL) {
        partnerId = manual ? String(manual.value || '').trim() : '';
      } else {
        partnerId = fromSelect;
        if (
          sel &&
          sel.tagName === 'SELECT' &&
          sel.selectedOptions[0] &&
          partnerId
        ) {
          partnerName = textOf(sel.selectedOptions[0])
            .replace(new RegExp('\\s*\\(' + partnerId + '\\)\\s*$'), '')
            .replace(partnerId, '')
            .replace(/^[–\-\s(]+|[)\s]+$/g, '')
            .trim();
        }
      }
      return { partnerId, partnerName };
    },

    openBuy() {
      const self = this;
      this.showModal({
        title: 'Nákup / přísun',
        validateOpts: { needPartner: true },
        fieldsHtml:
          this.earTextHtml('pf-sheep-form-ear', 'Ušní číslo') +
          this.dateFieldHtml('pf-sheep-form-date', 'Datum přísunu') +
          this.partnerFieldHtml() +
          this.noteFieldHtml(),
        afterOpen(wrap) {
          self.bindPartnerFields(wrap);
          self.loadPartnersInto(
            qs('#pf-sheep-form-partner', wrap),
            qs('#pf-sheep-form-partner-hint', wrap)
          );
          PF.datePicker.attach(qs('#pf-sheep-form-date', wrap), {});
        },
        onSubmit(wrap) {
          const { partnerId, partnerName } = self.readPartner(wrap);
          return self.runNative('NakupPrisun', {
            ear: String(qs('#pf-sheep-form-ear', wrap).value || '').trim(),
            date: self.toPortalDate(
              qs('#pf-sheep-form-date', wrap).value || ''
            ),
            partnerId,
            partnerName,
            note: String(qs('#pf-sheep-form-note', wrap).value || '').trim(),
          });
        },
      });
    },

    openBirth() {
      const self = this;
      const females = this.listHerdAnimals({ sex: 'female' });
      const males = this.listHerdAnimals({ sex: 'male' });
      this.showModal({
        title: 'Narození',
        wide: true,
        validateOpts: { needSex: true },
        fieldsHtml:
          '<div class="pf-modal-field">' +
          '<label for="pf-sheep-form-sex">Pohlaví</label>' +
          '<select id="pf-sheep-form-sex" required aria-required="true">' +
          '<option value="">Vyberte…</option>' +
          '<option value="female">Samice</option>' +
          '<option value="male">Samec</option>' +
          '</select>' +
          '<p class="pf-field-error" role="alert"></p>' +
          '</div>' +
          '<div class="pf-modal-field">' +
          '<label for="pf-sheep-form-mark">Přiřazené ušní číslo</label>' +
          '<select id="pf-sheep-form-mark" required aria-required="true">' +
          '<option value="">Načítám známky…</option></select>' +
          '<p class="pf-field-error" role="alert"></p>' +
          '<p class="pf-modal-hint" id="pf-sheep-form-mark-hint"></p>' +
          '</div>' +
          this.dateFieldHtml('pf-sheep-form-date', 'Datum narození') +
          this.earSelectHtml(
            'pf-sheep-form-mother',
            'Ušní číslo matky',
            females,
            { placeholder: 'Vyberte matku…' }
          ) +
          this.earSelectHtml(
            'pf-sheep-form-father',
            'Ušní číslo otce (volitelně)',
            males,
            { required: false, placeholder: 'Neznámý otec / nevybráno' }
          ) +
          this.noteFieldHtml(),
        afterOpen(wrap) {
          PF.datePicker.attach(qs('#pf-sheep-form-date', wrap), {});
          const hint = qs('#pf-sheep-form-mark-hint', wrap);
          const sexSel = qs('#pf-sheep-form-sex', wrap);
          wrap._pfFreeMarks = [];
          const refreshMarks = () => {
            const current = qs('#pf-sheep-form-mark', wrap);
            if (!current) return;
            if (current.tagName !== 'SELECT') return;
            self.fillMarkSelect(current, wrap._pfFreeMarks || [], {
              sex: sexSel ? String(sexSel.value || '').trim() : '',
              hint,
            });
          };
          const syncSexFromMark = () => {
            const markSel = qs('#pf-sheep-form-mark', wrap);
            if (!markSel || markSel.tagName !== 'SELECT' || !sexSel) return;
            if (String(sexSel.value || '').trim()) return;
            const ear = String(markSel.value || '').trim();
            if (!ear) return;
            const mark = (wrap._pfFreeMarks || []).find((m) => m.ear === ear);
            if (!mark || (mark.sex !== 'male' && mark.sex !== 'female')) return;
            sexSel.value = mark.sex;
            refreshMarks();
          };
          if (sexSel) sexSel.addEventListener('change', refreshMarks);
          self.loadAvailableMarks().then((marks) => {
            wrap._pfFreeMarks = marks || [];
            const current = qs('#pf-sheep-form-mark', wrap);
            if (!current) return;
            if (!wrap._pfFreeMarks.length) {
              if (current.tagName === 'SELECT') {
                const inp = document.createElement('input');
                inp.id = 'pf-sheep-form-mark';
                inp.type = 'text';
                inp.required = true;
                inp.setAttribute('aria-required', 'true');
                inp.placeholder = 'CZ0000073842 956';
                inp.autocomplete = 'off';
                current.replaceWith(inp);
              }
              if (hint)
                hint.textContent =
                  'Volné známky se nepodařilo načíst — vyplňte ručně.';
              return;
            }
            refreshMarks();
            const markSel = qs('#pf-sheep-form-mark', wrap);
            if (markSel)
              markSel.addEventListener('change', syncSexFromMark);
            if (hint) hint.textContent = '';
          });
        },
        onSubmit(wrap) {
          return self.runNative('Narozeni', {
            ear: String(qs('#pf-sheep-form-mark', wrap).value || '').trim(),
            date: self.toPortalDate(
              qs('#pf-sheep-form-date', wrap).value || ''
            ),
            sex: String(qs('#pf-sheep-form-sex', wrap).value || '').trim(),
            mother: String(qs('#pf-sheep-form-mother', wrap).value || '').trim(),
            father: String(qs('#pf-sheep-form-father', wrap).value || '').trim(),
            note: String(qs('#pf-sheep-form-note', wrap).value || '').trim(),
          });
        },
      });
    },

    openOut() {
      const self = this;
      const animals = this.listHerdAnimals();
      const selected = this.selectedHerdEars();
      this.showModal({
        title: 'Prodej / odsun',
        wide: true,
        validateOpts: { needPartner: true, needWalkSpz: true },
        fieldsHtml:
          this.earRowsBlockHtml('Ovce') +
          this.dateFieldHtml('pf-sheep-form-date', 'Datum odsunu') +
          this.partnerFieldHtml() +
          '<p class="pf-modal-section-title">Přepravce</p>' +
          '<div class="pf-modal-field">' +
          '<div class="pf-check-row">' +
          '<input type="checkbox" id="pf-sheep-form-walk" checked />' +
          '<label for="pf-sheep-form-walk">Pěší přesun</label>' +
          '</div></div>' +
          '<div class="pf-modal-field">' +
          '<label id="pf-sheep-carrier-name-label">Jméno a příjmení přepravce</label>' +
          '<div class="pf-carrier-name-row">' +
          '<div class="pf-modal-field">' +
          '<input id="pf-sheep-form-carrier-first" type="text" placeholder="Jan" autocomplete="given-name" aria-labelledby="pf-sheep-carrier-name-label" />' +
          '<p class="pf-field-error" role="alert"></p>' +
          '</div>' +
          '<div class="pf-modal-field">' +
          '<input id="pf-sheep-form-carrier-last" type="text" placeholder="Novák" autocomplete="family-name" aria-label="Příjmení přepravce" />' +
          '<p class="pf-field-error" role="alert"></p>' +
          '</div>' +
          '</div>' +
          '</div>' +
          '<div class="pf-modal-field" id="pf-sheep-spz-wrap" hidden>' +
          '<label for="pf-sheep-form-spz">SPZ vozidla</label>' +
          '<input id="pf-sheep-form-spz" type="text" placeholder="1AB2345" autocomplete="off" />' +
          '<p class="pf-field-error" role="alert"></p>' +
          '</div>' +
          this.noteFieldHtml(),
        afterOpen(wrap) {
          self.mountEarRows(wrap, { animals, initialEars: selected });
          self.bindPartnerFields(wrap);
          self.loadPartnersInto(
            qs('#pf-sheep-form-partner', wrap),
            qs('#pf-sheep-form-partner-hint', wrap)
          );
          PF.datePicker.attach(qs('#pf-sheep-form-date', wrap), {});
          const walk = qs('#pf-sheep-form-walk', wrap);
          const spzWrap = qs('#pf-sheep-spz-wrap', wrap);
          const syncWalk = () => {
            const byWalk = !!(walk && walk.checked);
            if (spzWrap) spzWrap.hidden = byWalk;
          };
          if (walk) walk.addEventListener('change', syncWalk);
          syncWalk();
        },
        onSubmit(wrap) {
          const { partnerId, partnerName } = self.readPartner(wrap);
          const byWalk = !!(qs('#pf-sheep-form-walk', wrap) || {}).checked;
          return self.runNative('ProdejOdsun', {
            ears: self.readEars(wrap),
            date: self.toPortalDate(
              qs('#pf-sheep-form-date', wrap).value || ''
            ),
            partnerId,
            partnerName,
            byWalk,
            carrierFirst: String(
              qs('#pf-sheep-form-carrier-first', wrap).value || ''
            ).trim(),
            carrierLast: String(
              qs('#pf-sheep-form-carrier-last', wrap).value || ''
            ).trim(),
            spz: byWalk
              ? ''
              : String(qs('#pf-sheep-form-spz', wrap).value || '').trim(),
            note: String(qs('#pf-sheep-form-note', wrap).value || '').trim(),
          });
        },
      });
    },

    openKill() {
      const self = this;
      const animals = this.listHerdAnimals();
      const selected = this.selectedHerdEars();
      this.showModal({
        title: 'Domácí porážka',
        fieldsHtml:
          this.earRowsBlockHtml('Ovce') +
          this.dateFieldHtml('pf-sheep-form-date', 'Datum porážky'),
        afterOpen(wrap) {
          self.mountEarRows(wrap, { animals, initialEars: selected });
          PF.datePicker.attach(qs('#pf-sheep-form-date', wrap), {});
        },
        onSubmit(wrap) {
          return self.runNative('DomaciPorazka', {
            ears: self.readEars(wrap),
            date: self.toPortalDate(
              qs('#pf-sheep-form-date', wrap).value || ''
            ),
          });
        },
      });
    },

    openStolen() {
      const self = this;
      const animals = this.listHerdAnimals();
      const selected = this.selectedHerdEars();
      this.showModal({
        title: 'Zcizení',
        fieldsHtml:
          this.earRowsBlockHtml('Ovce') +
          this.dateFieldHtml('pf-sheep-form-date', 'Datum zcizení'),
        afterOpen(wrap) {
          self.mountEarRows(wrap, { animals, initialEars: selected });
          PF.datePicker.attach(qs('#pf-sheep-form-date', wrap), {});
        },
        onSubmit(wrap) {
          return self.runNative('Zcizeni', {
            ears: self.readEars(wrap),
            date: self.toPortalDate(
              qs('#pf-sheep-form-date', wrap).value || ''
            ),
          });
        },
      });
    },

    openNativeDialog(typ) {
      PF.dialogs.ensureSafeDialogApi();
      PF.registers.resetDialogHost();
      const url = PF.registers.sheepDialogUrl(typ);
      const title = PF.registers.prettyLabel({ typ }, typ);
      if (typeof window.ShowModalWithMaxWidthStretch === 'function') {
        window.ShowModalWithMaxWidthStretch(url, title, '95%');
        return;
      }
      if (typeof window.ShowModal === 'function') {
        window.ShowModal(url, title, '95%');
        return;
      }
      if (typeof window.ShowModalInner === 'function') {
        window.ShowModalInner(url, title, '95%');
        return;
      }
      throw new Error('Nelze otevřít dialog pořízení.');
    },

    activeDialog() {
      const allowHidden = document.body.classList.contains(
        'pf-native-sheep-fill'
      );
      const dialogs = qsa('.ui-dialog').filter((d) => {
        const st = window.getComputedStyle(d);
        if (st.display === 'none') return false;
        if (!allowHidden && st.visibility === 'hidden') return false;
        return (
          !!qs(
            '#dlg-porizeni-indiv, #radkyPorizeniIndiv, .usni-cislo, .datum-ukonu',
            d
          ) || /porizeni|narozeni|odsun|poraz|zcizen|prisun|nakup/i.test(
            textOf(qs('.ui-dialog-title', d) || d).slice(0, 80)
          )
        );
      });
      return dialogs[dialogs.length - 1] || null;
    },

    trigger($el) {
      try {
        if (refresh$() && $el && $el.jquery) {
          $el.trigger('input').trigger('change');
        } else if ($el) {
          const el = $el[0] || $el;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } catch (_) {}
    },

    setNativeValue(el, value) {
      if (!el) return false;
      const v = value == null ? '' : String(value);
      if (el.tagName === 'SELECT') {
        const hit =
          qsa('option', el).find((o) => {
            const t = norm(o.textContent + ' ' + o.value);
            return (
              o.value === v ||
              norm(o.textContent) === norm(v) ||
              t.includes(norm(v))
            );
          }) || null;
        if (hit) el.value = hit.value;
        else el.value = v;
      } else {
        el.value = v;
      }
      try {
        if (refresh$()) {
          const $el = $(el);
          if (
            el.classList.contains('datepicker') ||
            el.classList.contains('hasDatepicker')
          ) {
            try {
              $el.datepicker('setDate', v);
            } catch (_) {}
          }
          $el.trigger('input').trigger('change', [{ isProgrammatic: true }]);
        } else {
          this.trigger(el);
        }
      } catch (_) {
        this.trigger(el);
      }
      // Sync jQuery UI autocomplete sibling if present
      try {
        const ac = el.nextElementSibling;
        if (
          ac &&
          ac.classList &&
          ac.classList.contains('ui-autocomplete-input')
        ) {
          if (el.tagName === 'SELECT') {
            const opt = el.selectedOptions && el.selectedOptions[0];
            ac.value = opt ? textOf(opt) : v;
          } else ac.value = v;
          if (refresh$()) $(ac).trigger('input').trigger('change');
        }
      } catch (_) {}
      // Sync aq Selected param for combo-editors
      try {
        if (el.tagName === 'SELECT') {
          const box = el.closest('.combo-editor, .member-value-editor') || el.parentElement;
          const param = box && qs('object.aq-client-data param[name$=".Selected"]', box);
          if (param) param.setAttribute('value', el.value);
        }
      } catch (_) {}
      return true;
    },

    setByClass(dialog, className, value) {
      const el = qs('.' + className, dialog);
      if (!el) return false;
      return this.setNativeValue(el, value);
    },

    /** Active animal rows in DialogPorizeni grid (skip deleted placeholder). */
    activeAnimalRows(dialog) {
      return qsa(
        '#radkyPorizeniIndiv tr.grid-row:not(.row-deleted)',
        dialog
      ).filter((row) =>
        qs(
          'input.usni-cislo, input.rsri-datum, input.datum-ukonu, select.pohlavi, input.rsri-prov-staj',
          row
        )
      );
    },

    rowField(row, selector) {
      return row ? qs(selector, row) : null;
    },

    /**
     * Open stáj autocomplete ("Výběr z hodnot") and pick the available option.
     * Dynamic — uses whatever the portal lists (e.g. "49281735 01 Stáj pro ovce").
     */
    async pickStableFromAutocomplete(inp, row) {
      if (!inp) return false;
      const box = this.stableFieldBox(inp);
      const btn = box && qs('a.autocomplete-button', box);
      try {
        if (btn) btn.click();
        else if (refresh$() && $(inp).data('ui-autocomplete')) {
          $(inp).autocomplete('search', ' ');
          $(inp).focus();
        } else return false;
      } catch (_) {
        return false;
      }

      let items;
      try {
        items = await this.waitFor(() => {
          const list = this.visibleAutocompleteItems();
          return list.length ? list : null;
        }, { timeout: 8000 });
      } catch (_) {
        return false;
      }

      const pick = items[0];
      const label = String(textOf(pick) || '').trim();
      const target = qs('.ui-menu-item-wrapper', pick) || pick;
      let itemId = '';
      try {
        if (refresh$()) {
          const uiItem =
            $(pick).data('ui-autocomplete-item') ||
            $(target).data('ui-autocomplete-item');
          if (uiItem && uiItem.id) itemId = String(uiItem.id);
          $(target).trigger('mouseenter').click();
          // Prefer official select with {id, text} shape used by aq-mvc
          if (uiItem && $(inp).data('ui-autocomplete')) {
            const ac = $(inp).data('ui-autocomplete');
            ac._trigger('select', null, { item: uiItem });
            if (uiItem.text) this.setNativeValue(inp, uiItem.text);
            const lookupKey = this.stableLookupKey(inp);
            if (lookupKey && uiItem.id) {
              lookupKey.value = String(uiItem.id);
              $(lookupKey).trigger('change');
            }
          }
        } else {
          target.dispatchEvent(
            new MouseEvent('click', { bubbles: true, cancelable: true })
          );
        }
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 250));

      if (this.stableAlreadySet(inp) && String(inp.value || '').trim()) {
        return true;
      }

      // Manual apply: menu label + id from autocomplete item or row context
      if (label) this.setNativeValue(inp, label);
      const lookupKey = this.stableLookupKey(inp);
      const key =
        itemId ||
        this.rowStableKey(row || (inp && inp.closest('tr.grid-row')));
      if (lookupKey && key) {
        lookupKey.value = key;
        try {
          if (refresh$()) $(lookupKey).trigger('change');
          else this.trigger(lookupKey);
        } catch (_) {}
      } else {
        this.fillStableFromRowContext(inp, row);
      }
      if (label && !String(inp.value || '').trim()) this.setNativeValue(inp, label);
      try {
        qsa('ul.ui-autocomplete.ui-menu').forEach((ul) => {
          ul.style.display = 'none';
        });
      } catch (_) {}
      return this.stableAlreadySet(inp) && !!String(inp.value || '').trim();
    },

    /** Resolve stáj GUID already present on the animal row. */
    rowStableKey(row) {
      if (!row) return '';
      const keyEl =
        qs('input[name$="AktualneVybranaStajKey"]', row) ||
        qs('input[name*="AktualneVybranaStajKey"]', row);
      let key = String((keyEl && keyEl.value) || '').trim();
      if (!key || /^0+$/.test(key)) {
        const add = qs('a.add-new-row[data-action]', row);
        const action = (add && add.getAttribute('data-action')) || '';
        const m = action.match(/[?&]idStaj=([a-f0-9]{32})/i);
        if (m) key = m[1];
      }
      if (!key || /^0+$/.test(key)) return '';
      return key;
    },

    /** Fallback: use AktualneVybranaStajKey / PridatRadek idStaj already on the row. */
    fillStableFromRowContext(inp, row) {
      const r = row || (inp && inp.closest('tr.grid-row')) || null;
      if (!inp || !r) return false;
      const key = this.rowStableKey(r);
      if (!key) return false;
      const lookupKey = this.stableLookupKey(inp);
      if (lookupKey) {
        lookupKey.value = key;
        try {
          if (refresh$()) $(lookupKey).trigger('change');
          else this.trigger(lookupKey);
        } catch (_) {}
      }
      // Prefer label from page stáj picker if the input is still empty/GUID-like
      let label = String(inp.value || '').trim();
      if (!label || /^[a-f0-9]{32}$/i.test(label)) {
        const opt = qsa(
          '#stajVyberId option, select[name="VybranaStajIdKombinace"] option'
        ).find(
          (o) =>
            o.value &&
            !/^0+$/.test(o.value) &&
            String(o.value).replace(/-/g, '') === key
        ) ||
          qsa(
            '#stajVyberId option, select[name="VybranaStajIdKombinace"] option'
          ).find((o) => o.value && !/^0+$/.test(o.value) && textOf(o).trim());
        if (opt) label = textOf(opt).trim();
      }
      if (label && label !== String(inp.value || '').trim()) {
        this.setNativeValue(inp, label);
      }
      return this.stableAlreadySet(inp);
    },

    async fillStable(dialog) {
      const rows = this.activeAnimalRows(dialog);
      const targets = [];
      rows.forEach((row) => {
        const inp = qs(
          'input.rsri-prov-staj, input.rsri-staj, input[name*="StajRef.LookupText"]',
          row
        );
        if (inp) targets.push({ inp, row });
      });
      // Also header/hromadná stáj if present
      qsa('input.hromadna-staj', dialog).forEach((inp) => {
        if (targets.some((t) => t.inp === inp)) return;
        targets.push({
          inp,
          row: inp.closest('tr.grid-row') || null,
        });
      });
      if (!targets.length) return false;

      let ok = true;
      for (const { inp, row } of targets) {
        if (
          this.stableAlreadySet(inp) &&
          String(inp.value || '').trim() &&
          !/^[a-f0-9]{32}$/i.test(String(inp.value || '').trim())
        ) {
          continue;
        }
        let filled = await this.pickStableFromAutocomplete(inp, row);
        if (!filled) filled = this.fillStableFromRowContext(inp, row);
        if (!filled) ok = false;
      }
      return ok;
    },

    fillEar(dialog, ear) {
      ear = this.compactEarMark(ear);
      if (!ear) return false;
      const row = this.activeAnimalRows(dialog)[0];
      const inp = row
        ? this.rowField(row, 'input.usni-cislo')
        : qs('input.usni-cislo', dialog);
      if (inp) return this.setNativeValue(inp, ear);
      return this.setByClass(dialog, 'usni-cislo', ear);
    },

    animalRowInputs(dialog) {
      const rows = this.activeAnimalRows(dialog);
      const inputs = [];
      rows.forEach((row) => {
        const inp = qs('input.usni-cislo', row);
        if (inp) inputs.push({ row, inp });
      });
      if (!inputs.length) {
        qsa('input.usni-cislo', dialog).forEach((inp) => {
          if (inp.closest('.row-deleted')) return;
          inputs.push({ row: inp.closest('tr') || inp, inp });
        });
      }
      return inputs;
    },

    fillSex(dialog, sex) {
      if (!sex) return false;
      const row = this.activeAnimalRows(dialog)[0];
      const sel =
        (row && this.rowField(row, 'select.pohlavi')) ||
        qs('select.pohlavi', dialog);
      if (sel) {
        const wantFemale = sex === 'female';
        const hit = qsa('option', sel).find((o) => {
          const t = norm(o.textContent + ' ' + o.value);
          return wantFemale
            ? /samice|bahnice|female|\bf\b|zens/.test(t)
            : /samec|beran|male|\bm\b|muzsk/.test(t);
        });
        if (hit) {
          this.setNativeValue(sel, hit.value);
          return true;
        }
      }
      return false;
    },

    fillDate(dialog, date) {
      if (!date) return false;
      const row = this.activeAnimalRows(dialog)[0];
      const inp =
        (row &&
          (this.rowField(row, 'input.rsri-datum') ||
            this.rowField(row, 'input.datum-ukonu') ||
            this.rowField(row, 'input[name*="DatumNarozeni"]') ||
            this.rowField(row, 'input[name*="DatumUkonu"]'))) ||
        qs(
          'input.rsri-datum, input.datum-ukonu, input[name*="DatumNarozeni"]',
          dialog
        );
      if (inp) return this.setNativeValue(inp, date);
      return false;
    },

    fillMother(dialog, mother) {
      mother = this.compactEarMark(mother);
      if (!mother) return false;
      const row = this.activeAnimalRows(dialog)[0];
      const inp =
        (row &&
          this.rowField(
            row,
            'input[name*=".Matka"], input[id*="_Matka"]'
          )) ||
        qs('input[name*=".Matka"], input[id*="_Matka"]', dialog);
      if (inp) return this.setNativeValue(inp, mother);
      return false;
    },

    fillFather(dialog, father) {
      father = this.compactEarMark(father);
      if (!father) return false;
      const row = this.activeAnimalRows(dialog)[0];
      const inp =
        (row &&
          this.rowField(
            row,
            'input[name*=".Otec"], input[id*="_Otec"]'
          )) ||
        qs('input[name*=".Otec"], input[id*="_Otec"]', dialog);
      if (inp) return this.setNativeValue(inp, father);
      return false;
    },

    fillNote(dialog, note) {
      if (!note) return true;
      const row = this.activeAnimalRows(dialog)[0];
      const inp =
        (row &&
          (this.rowField(row, 'input.rsri-poznamka') ||
            this.rowField(row, 'input[name*="PoznamkaZvire"]'))) ||
        qs('input.rsri-poznamka, input[name*="PoznamkaZvire"]', dialog);
      if (inp) return this.setNativeValue(inp, note);
      return this.setByLabels(dialog, /poznam/, note);
    },

    fillPartner(dialog, partnerId) {
      if (!partnerId) return false;
      if (this.setByClass(dialog, 'rsri-provozovna', partnerId)) return true;
      const ok = this.setByLabels(
        dialog,
        /partner|provozovn|reg\.?\s*c|registracni/,
        partnerId,
        { avoid: /preprav|doprav|jmeno|prijmen/ }
      );
      // Trigger portal name lookup
      qsa(
        'input.nactiNazevSubjektuPartnera, input.nactiNazevPartnera, .rsri-provozovna',
        dialog
      ).forEach((el) => this.trigger(refresh$() ? $(el) : el));
      return ok;
    },

    setByLabels(dialog, labelRe, value, { avoid } = {}) {
      let filled = false;
      qsa('tr, .member-editor, .form-group, div', dialog).forEach((row) => {
        if (filled) return;
        if (row.closest && row.closest('.pf-modal')) return;
        const cap = row.querySelector(
          '.member-editor-caption, label, th, td:first-child, span'
        );
        if (!cap) return;
        const t = norm(textOf(cap));
        if (!labelRe.test(t)) return;
        if (avoid && avoid.test(t)) return;
        const inp =
          row.querySelector(
            'input.datepicker, input.usni-cislo, input[type="text"], input[type="number"], input:not([type]), select, textarea'
          ) || null;
        if (!inp) return;
        // Prefer the visible autocomplete input when paired with a hidden/select
        const visible =
          (inp.classList.contains('ui-autocomplete-input') && inp) ||
          row.querySelector('input.ui-autocomplete-input:not([type=hidden])') ||
          inp;
        this.setNativeValue(visible === inp ? inp : visible, value);
        if (visible !== inp && inp.tagName === 'SELECT') {
          this.setNativeValue(inp, value);
        } else if (visible !== inp) {
          this.setNativeValue(inp, value);
        }
        filled = true;
      });
      return filled;
    },

    /** Portal usni-znamka-formater expects CZ0000073842956 (no spaces). */
    compactEarMark(raw) {
      return String(raw || '')
        .replace(/[\s_]/g, '')
        .toUpperCase();
    },

    hideStableFields(dialog) {
      qsa(
        '.rsri-prov-staj, [class*="rsri-prov-staj"], select[id*="staj" i], select[name*="staj" i]',
        dialog
      ).forEach((el) => {
        const row =
          el.closest('tr, .member-editor, .form-group, .entity-editor-group') ||
          el;
        row.classList.add('pf-dialog-row-hide');
        row.classList.add('pf-dialog-section-hide');
      });
      qsa('tr, .member-editor', dialog).forEach((row) => {
        const cap = row.querySelector(
          '.member-editor-caption, label, td:first-child'
        );
        const t = norm(textOf(cap));
        if (/^staj$|vyber staje|provozovna\/staj|staj pro/.test(t) && /staj/.test(t)) {
          // Only hide pure stáj rows, not "stájový registr" titles
          if (/stajovy registr/.test(t)) return;
          if (/staj/.test(t) && !/partner|usni|datum|pohlav|matka|otec|poznam/.test(t))
            row.classList.add('pf-dialog-row-hide');
        }
      });
    },

    stableFieldBox(inp) {
      return (
        (inp &&
          inp.closest(
            '.ref-editor, .member-value-editor, .member-editor, td, .form-group'
          )) ||
        (inp && inp.parentElement) ||
        null
      );
    },

    stableLookupKey(inp) {
      const box = this.stableFieldBox(inp);
      if (!box) return null;
      return (
        qs('input[name$=".LookupKey"], input[name$="LookupKey"]', box) ||
        (inp.nextElementSibling &&
        /LookupKey/i.test(inp.nextElementSibling.name || '')
          ? inp.nextElementSibling
          : null)
      );
    },

    stableAlreadySet(inp) {
      const keyEl = this.stableLookupKey(inp);
      const key = String((keyEl && keyEl.value) || '').trim();
      if (!key || /^0+$/.test(key)) return false;
      return true;
    },

    visibleAutocompleteItems() {
      const menus = qsa('ul.ui-autocomplete.ui-menu').filter((ul) => {
        const st = window.getComputedStyle(ul);
        return st.display !== 'none' && st.visibility !== 'hidden';
      });
      const items = [];
      menus.forEach((ul) => {
        qsa('li.autocomplete-item, li.ui-menu-item', ul).forEach((li) => {
          if (li.classList.contains('autocomplete-item-info')) return;
          if (!String(textOf(li) || '').trim()) return;
          items.push(li);
        });
      });
      return items;
    },

    async loadSelectedAnimalsIntoDialog(dialog) {
      const btn = qs(
        '.btn-nacist-seznam, a.btn-nacist-seznam, button.btn-nacist-seznam',
        dialog
      );
      if (!btn) return false;
      try {
        btn.click();
      } catch (_) {
        return false;
      }
      // Form often rebuilds after load — wait for rows with ear values
      try {
        await this.waitFor(() => {
          const d = this.activeDialog() || dialog;
          const filled = this.animalRowInputs(d).filter(({ inp }) => {
            const v = String(inp.value || '').replace(/\s|_/g, '');
            return v.length >= 8 && !/^CZ0+$/i.test(v);
          });
          return filled.length > 0 ? filled : null;
        }, { timeout: 10000 });
        return true;
      } catch (_) {
        return false;
      }
    },

    async fillEars(dialog, ears) {
      const list = (ears || [])
        .map((e) => this.compactEarMark(e))
        .filter(Boolean);
      if (!list.length) return false;

      // Prefer portal "načíst seznam" after we synced register selection
      if (list.length > 1) {
        await this.loadSelectedAnimalsIntoDialog(dialog);
        dialog = this.activeDialog() || dialog;
      }

      let inputs = this.animalRowInputs(dialog);
      // If load didn't produce enough rows, fill what we have then set first/only
      for (let i = 0; i < list.length; i++) {
        inputs = this.animalRowInputs(this.activeDialog() || dialog);
        if (inputs[i]) {
          this.setNativeValue(inputs[i].inp, list[i]);
          continue;
        }
        // Try add-row controls once when short on rows
        if (i > 0) {
          const addBtn = qsa(
            'a, button, input[type="button"]',
            this.activeDialog() || dialog
          ).find((el) => {
            const t = norm(textOf(el) || el.value || '');
            return (
              /pridat radek|pridat zvire|novy radek|add row|\+$/.test(t) ||
              /pridat/i.test(el.className || '')
            );
          });
          if (addBtn) {
            try {
              addBtn.click();
            } catch (_) {}
            await new Promise((r) => setTimeout(r, 400));
            inputs = this.animalRowInputs(this.activeDialog() || dialog);
            if (inputs[i]) {
              this.setNativeValue(inputs[i].inp, list[i]);
              continue;
            }
          }
        }
        // Last resort: set by labels only works for first
        if (i === 0) this.fillEar(this.activeDialog() || dialog, list[i]);
      }
      return true;
    },

    fillCarrier(dialog, data) {
      // Expand carrier section if collapsed
      try {
        const body = qs('.dopravce-collapsable-body', dialog);
        if (body && window.getComputedStyle(body).display === 'none') {
          const btn = qs(
            '.dopravce-collapsable-header + .toggleButton, .dopravce-collapsable-header',
            dialog
          );
          if (btn) btn.click();
          body.style.display = 'table-row-group';
        }
      } catch (_) {}

      const byWalk = !!data.byWalk;
      // Toggle walk / pěšky / chůze controls
      qsa('input[type="checkbox"], input[type="radio"], select', dialog).forEach(
        (el) => {
          const row = el.closest('tr, .member-editor, label, div') || el;
          const blob = norm(
            textOf(row) + ' ' + (el.id || '') + ' ' + (el.name || '')
          );
          if (!/chuz|pesk|pesy|pochuz|bez vozid|odchod po/.test(blob)) return;
          if (el.tagName === 'SELECT') {
            const hit = qsa('option', el).find((o) => {
              const t = norm(o.textContent + ' ' + o.value);
              return byWalk
                ? /ano|chuz|pesk|true|1/.test(t)
                : /ne|vozid|auto|false|0/.test(t);
            });
            if (hit) this.setNativeValue(el, hit.value);
          } else if (el.type === 'checkbox' || el.type === 'radio') {
            el.checked = byWalk;
            this.trigger(refresh$() ? $(el) : el);
          }
        }
      );

      if (data.carrierFirst) {
        this.setByLabels(
          dialog,
          /jmeno(?!.*partner)|krestni|first/,
          data.carrierFirst,
          { avoid: /partner|subjekt|matka|otec/ }
        );
      }
      if (data.carrierLast) {
        this.setByLabels(
          dialog,
          /prijmen|last name|surname/,
          data.carrierLast,
          { avoid: /partner|subjekt/ }
        );
      }
      if (!byWalk && data.spz) {
        this.setByLabels(dialog, /\bspz\b|registracni znacka|znacka vozid/, data.spz);
      }
      return true;
    },

    clickSave(dialog) {
      return PF.pigForms.clickSave(dialog);
    },

    closeNativeDialog(dialog) {
      return PF.pigForms.closeNativeDialog(dialog);
    },

    beginNativeFill() {
      document.body.classList.add('pf-native-sheep-fill');
    },

    endNativeFill() {
      document.body.classList.remove('pf-native-sheep-fill');
    },

    describeDialogFields(dialog) {
      return PF.pigForms.describeDialogFields(dialog);
    },

    async runNative(typ, data) {
      // Hide native DialogPorizeni while filling
      this.beginNativeFill();
      let dialog = null;
      try {
        const ears = (
          data.ears && data.ears.length
            ? data.ears
            : data.ear
              ? [data.ear]
              : []
        )
          .map((e) => this.compactEarMark(e))
          .filter(Boolean);

        // Align portal register selection so "načíst seznam" can pull them in
        if (
          ears.length &&
          /DomaciPorazka|ProdejOdsun|Zcizeni/i.test(typ)
        ) {
          this.syncNativeSelectionToEars(ears);
          await new Promise((r) => setTimeout(r, 450));
        }

        this.openNativeDialog(typ);
        dialog = await this.waitFor(() => this.activeDialog(), {
          timeout: 14000,
        });

        // Wait for the real grid row (not just dialog chrome / action-bar)
        await this.waitFor(() => {
          const d = this.activeDialog() || dialog;
          const rows = this.activeAnimalRows(d);
          return rows.length ? rows : null;
        }, { timeout: 14000 });

        dialog = this.activeDialog() || dialog;

        // Stáj must be chosen via autocomplete (LookupKey) before save
        const stableOk = await this.fillStable(dialog);
        if (!stableOk) {
          throw new Error(
            'V portálu se nepodařilo vybrat stáj (Výběr z hodnot).'
          );
        }

        // Date / ear / sex / parents / note — target grid columns by class/name
        this.fillDate(dialog, data.date);
        await new Promise((r) => setTimeout(r, 200));

        await this.fillEars(dialog, ears);
        dialog = this.activeDialog() || dialog;

        if (data.sex) this.fillSex(dialog, data.sex);
        if (data.mother) this.fillMother(dialog, data.mother);
        if (data.father) this.fillFather(dialog, data.father);
        if (data.partnerId) {
          this.fillPartner(dialog, data.partnerId);
          await new Promise((r) => setTimeout(r, 300));
          this.fillPartner(dialog, data.partnerId);
        }
        this.fillNote(dialog, data.note);
        if (typ === 'ProdejOdsun') this.fillCarrier(dialog, data);

        // Re-assert after portal change handlers / row rebuilds
        dialog = this.activeDialog() || dialog;
        await this.fillStable(dialog);
        this.fillDate(dialog, data.date);
        if (ears[0]) this.fillEar(dialog, ears[0]);
        if (data.sex) this.fillSex(dialog, data.sex);
        if (data.mother) this.fillMother(dialog, data.mother);
        if (data.father) this.fillFather(dialog, data.father);
        this.fillNote(dialog, data.note);

        // Hide stáj chrome after LookupKey is set
        this.hideStableFields(dialog);

        await new Promise((r) => setTimeout(r, 200));
        dialog = this.activeDialog() || dialog;

        const saved = this.clickSave(dialog);
        if (!saved) {
          throw new Error('V portálu se nepodařilo najít tlačítko Uložit.');
        }

        try {
          await this.waitFor(() => !this.activeDialog(), { timeout: 10000 });
        } catch (_) {
          const still = this.activeDialog();
          if (still) {
            const portalErr =
              PF.pigForms.extractPortalErrors &&
              PF.pigForms.extractPortalErrors(still);
            if (portalErr) {
              throw new Error('Portál hlášení neuložil: ' + portalErr);
            }
          }
          this.closeNativeDialog(dialog);
        }

        // Announce as soon as portal accepted the save (before slow pending refresh)
        try {
          PF.toast.saved('sheep', typ, data);
        } catch (_) {}

        try {
          PF.pending._loadedKind = null;
          const pendingBefore =
            (PF.pending.state &&
              PF.pending.state.rows &&
              PF.pending.state.rows.length) ||
            0;
          await Promise.resolve(PF.pending.refresh('sheep', { force: true }));
          await new Promise((r) => setTimeout(r, 700));
          let pendingAfter =
            (PF.pending.state &&
              PF.pending.state.rows &&
              PF.pending.state.rows.length) ||
            0;
          if (pendingAfter <= pendingBefore) {
            PF.pending._loadedKind = null;
            await Promise.resolve(PF.pending.refresh('sheep', { force: true }));
            await new Promise((r) => setTimeout(r, 900));
          }
          // Re-build herd table so založeno animals leave the main list
          try {
            PF.registers.simplifyTables('sheep');
            const sex = PF.scrape.countSheepSexFromRoot(
              qs('#pf-host') || document
            );
            if (sex) PF.scrape.saveSheepSexCounts(sex.male, sex.female);
            PF.registers.renderSheepRegisterSummary();
          } catch (_) {}
        } catch (_) {}

        // "Poslední změna" comes from processed history (stav=zpracováno), not pending saves
      } catch (e) {
        try {
          this.closeNativeDialog(dialog);
        } catch (_) {}
        throw e instanceof Error
          ? e
          : new Error(e && e.message ? e.message : String(e));
      } finally {
        this.endNativeFill();
        setTimeout(() => {
          document.body.classList.remove('pf-native-sheep-fill');
          qsa('.ui-widget-overlay').forEach((ov) => {
            if (window.getComputedStyle(ov).opacity === '0') ov.remove();
          });
        }, 200);
      }
    },
  };

  /* ------------------------------------------------------------------ */
  /* Dialogs                                                            */
  /* ------------------------------------------------------------------ */
  PF.dialogs = {
    observe() {
      const obs = new MutationObserver((muts) => {
        let touched = false;
        muts.forEach((m) => {
          m.addedNodes.forEach((n) => {
            if (n.nodeType !== 1) return;
            if (n.classList && n.classList.contains('ui-dialog')) {
              this.skin(n);
              touched = true;
            } else {
              qsa('.ui-dialog', n).forEach((d) => {
                this.skin(d);
                touched = true;
              });
              if (n.closest && n.closest('.ui-dialog')) touched = true;
            }
          });
        });
        qsa('.ui-dialog:not(.pf-skinned-done)').forEach((d) => this.skin(d));
        if (touched) {
          clearTimeout(this._simpT);
          this._simpT = setTimeout(() => this.simplifyVisible(), 50);
        }
      });
      obs.observe(document.body, { childList: true, subtree: true });

      // Hook ShowModal if present
      this.hookShowModal();
      this.ensureSafeDialogApi();
      // Portal may define otevritDialogZmeny later
      const poll = setInterval(() => {
        this.ensureSafeDialogApi();
        if (window.otevritDialogZmeny && window.otevritDialogZmeny._pfSafe)
          clearInterval(poll);
      }, 400);
      setTimeout(() => clearInterval(poll), 15000);
    },

    /**
     * Portal otevritDialogZmeny / closeModal often call .dialog('close') on a
     * placeholder that was never initialized. Soften only those calls — do not
     * replace the whole $.fn.dialog bridge (that breaks ShowModalInner init).
     */
    ensureSafeDialogApi() {
      refresh$();
      try {
        if (
          typeof window.closeModal === 'function' &&
          !window.closeModal._pfSafe
        ) {
          window.closeModal = function () {
            refresh$();
            try {
              const $d = $('#dialogDiv');
              if ($d.length && $d.data('ui-dialog')) {
                try {
                  $d.dialog('close');
                } catch (_) {}
              }
              $d.remove();
            } catch (_) {
              try {
                $('#dialogDiv').remove();
              } catch (__) {}
            }
          };
          window.closeModal._pfSafe = true;
        }
      } catch (_) {}

      try {
        if (refresh$() && $.fn && $.fn.dialog && !$.fn.dialog._pfSafeClose) {
          const orig = $.fn.dialog;
          $.fn.dialog = function (method) {
            if (
              typeof method === 'string' &&
              (method === 'close' || method === 'destroy' || method === 'isOpen')
            ) {
              try {
                if (!this.data || !this.data('ui-dialog')) {
                  if (method === 'isOpen') return false;
                  if (method === 'destroy' || method === 'close') {
                    try {
                      this.remove();
                    } catch (_) {}
                  }
                  return this;
                }
              } catch (_) {
                if (method === 'isOpen') return false;
                return this;
              }
            }
            return orig.apply(this, arguments);
          };
          Object.keys(orig).forEach((k) => {
            try {
              $.fn.dialog[k] = orig[k];
            } catch (_) {}
          });
          $.fn.dialog._pfSafeClose = true;
        }
      } catch (_) {}

      try {
        if (
          typeof window.otevritDialogZmeny === 'function' &&
          !window.otevritDialogZmeny._pfSafe
        ) {
          const origOpen = window.otevritDialogZmeny;
          window.otevritDialogZmeny = function (typ) {
            try {
              PF.registers.resetDialogHost();
              return origOpen.apply(this, arguments);
            } catch (err) {
              const msg = String((err && err.message) || err || '');
              if (/prior to initialization/i.test(msg)) {
                try {
                  if (typ) PF.registers.openSheepDialog(typ);
                } catch (_) {}
                return;
              }
              throw err;
            }
          };
          window.otevritDialogZmeny._pfSafe = true;
        }
      } catch (_) {}
    },

    hookShowModal() {
      refresh$();
      this.ensureSafeDialogApi();
      const wrap = (name) => {
        if (!window[name] || window[name]._pf) return;
        const orig = window[name];
        const self = this;
        window[name] = function () {
          const r = orig.apply(this, arguments);
          setTimeout(() => self.simplifyVisible(), 200);
          setTimeout(() => self.simplifyVisible(), 600);
          return r;
        };
        window[name]._pf = true;
      };
      wrap('ShowModal');
      wrap('ShowModalInner');
      wrap('ShowModalWithMaxWidthStretch');
    },

    skin(dialog) {
      dialog.classList.add('pf-skinned');
      this.simplifyDialog(dialog);
      dialog.classList.add('pf-skinned-done');
    },

    simplifyVisible() {
      // Don't restyle/instrument while we are filling the native dialog off-screen
      if (
        document.body.classList.contains('pf-native-pig-fill') ||
        document.body.classList.contains('pf-native-sheep-fill')
      ) {
        return;
      }
      qsa('.ui-dialog').forEach((d) => this.simplifyDialog(d));
    },

    simplifyDialog(dialog) {
      const content = dialog.querySelector('.ui-dialog-content') || dialog;
      dialog.classList.add('pf-dialog-designed');

      this.hideDialogSections(content, [
        'soubor',
        'hromadny zapis',
        'hromadný zápis',
        'hromadne',
        'hromadné',
      ]);

      // Known bulk/file wrappers from portal JS
      qsa(
        [
          '.hromadny-pohyb-wrapper',
          '#hromadnyPohybForm',
          'input[type="file"]',
          '.nahrat-hromadne',
          '[class*="hromadn"]',
          '[id*="hromadn"]',
          '[id*="Hromadn"]',
          '[class*="soubor"]',
          '[id*="Soubor"]',
          '[id*="soubor"]',
        ].join(', '),
        content
      ).forEach((el) => {
        const box =
          el.closest('.entity-editor-group') ||
          el.closest('fieldset') ||
          el.closest('tr') ||
          el;
        box.classList.add('pf-dialog-section-hide');
      });

      // Hide rows whose captions are irrelevant
      qsa('tr', content).forEach((tr) => {
        const cap = tr.querySelector(
          '.member-editor-caption, td:first-child, label, th'
        );
        if (!cap) return;
        const t = norm(cap.textContent);
        if (!t) return;
        if (/soubor|hromadn|nahrat soubor|import/.test(t)) {
          tr.classList.add('pf-dialog-row-hide');
          return;
        }
        // Always keep required core fields
        const keep = PF.config.dialogKeepLabels.some((k) => t.includes(norm(k)));
        const alwaysHide = [
          'seurop',
          'cip',
          'elektron',
          'doprav',
          'jatka',
          'veterin',
          'plemeno',
          'uzitkov',
          'intenzit',
          'dotac',
          'poznamka k transportu',
        ].some((k) => t.includes(k));
        if (alwaysHide) tr.classList.add('pf-dialog-row-hide');
        else if (!keep && t.length > 2) {
          if (
            /kategorie jatec|klassifik|klasifik|hospodarsk|vyuziti|využití/.test(t)
          )
            tr.classList.add('pf-dialog-row-hide');
        }
      });

      // Force female pig counts to 0
      this.forceFemaleZero(content);

      // Our minimal calendar on date fields (sheep: no future; pigs: last 7 days)
      try {
        PF.datePicker.enhanceDialog(content);
      } catch (_) {}
    },

    hideDialogSections(root, titles) {
      const matchTitle = (text) => {
        const t = norm(text);
        return titles.some((x) => t.includes(norm(x)));
      };

      qsa(
        '.entity-editor-group, fieldset, .collapsable, .panel, .group',
        root
      ).forEach((box) => {
        const head = box.querySelector(
          '.entity-editor-group-header, h2, h3, h4, legend, .group-title'
        );
        const headText = head ? textOf(head) : '';
        // Also check leading text of the box
        if (matchTitle(headText) || matchTitle(textOf(box).slice(0, 80))) {
          box.classList.add('pf-dialog-section-hide');
        }
      });

      // Standalone headings + following sibling block
      qsa('h2, h3, h4, legend, .entity-editor-group-header', root).forEach(
        (h) => {
          if (!matchTitle(textOf(h))) return;
          h.classList.add('pf-dialog-section-hide');
          let n = h.nextElementSibling;
          let steps = 0;
          while (n && steps < 3) {
            if (/H[1-4]/i.test(n.tagName)) break;
            n.classList.add('pf-dialog-section-hide');
            n = n.nextElementSibling;
            steps++;
          }
          const parent = h.closest(
            '.entity-editor-group, fieldset, .collapsable, tr'
          );
          if (parent) parent.classList.add('pf-dialog-section-hide');
        }
      );
    },

    forceFemaleZero(root) {
      if (!root || !root.querySelectorAll) return;
      qsa('input, select', root).forEach((inp) => {
        if (!inp) return;
        const id = norm(
          (inp.id || '') +
            ' ' +
            (inp.name || '') +
            ' ' +
            (inp.getAttribute('aria-label') || '')
        );
        const tr = inp.closest('tr');
        const cap = tr
          ? tr.querySelector('.member-editor-caption, td:first-child, label')
          : null;
        const label = norm(textOf(cap));
        const blob = id + ' ' + label;
        if (
          /samice|prasnic|female|feminin|samic/.test(blob) ||
          (/pocet|počet|ks/.test(blob) && /samice|prasnic|♀|f\b/.test(blob))
        ) {
          if (inp.tagName === 'SELECT') {
            const opt0 = qsa('option', inp).find(
              (o) => o.value === '0' || textOf(o) === '0'
            );
            if (opt0) inp.value = opt0.value;
          } else if ('value' in inp) {
            if (!inp.value || inp.value === '') inp.value = '0';
          }
          try {
            inp.dispatchEvent(new Event('change', { bubbles: true }));
          } catch (_) {}
        }
      });

      // Also labels containing "prasnice" / "samice"
      qsa('label', root).forEach((lab) => {
        if (!lab || !/prasnic|samice|samic/.test(norm(lab.textContent))) return;
        const forId = lab.getAttribute('for');
        const inp =
          (forId && qs('#' + forId, root)) ||
          (lab.parentElement && lab.parentElement.querySelector('input'));
        if (inp && 'value' in inp && (!inp.value || inp.value === '')) {
          inp.value = '0';
        }
      });
    },

    selectPigEvent(action) {
      const dialog = qs('.ui-dialog:not([style*="display: none"])') || qs('.ui-dialog');
      if (!dialog) return;
      const selects = qsa('select', dialog);
      selects.forEach((sel) => {
        const opts = qsa('option', sel);
        const hit = opts.find((o) => {
          const t = norm(o.textContent + ' ' + o.value);
          return (
            (action.typ && t.includes(norm(action.typ))) ||
            (action.labels || []).some((l) => t.includes(norm(l)))
          );
        });
        if (hit) {
          sel.value = hit.value;
          try {
            if (refresh$()) $(sel).trigger('change');
            else sel.dispatchEvent(new Event('change', { bubbles: true }));
          } catch (_) {}
          this.forceFemaleZero(dialog);
        }
      });
    },
  };

  /* ------------------------------------------------------------------ */
  /* Boot                                                               */
  /* ------------------------------------------------------------------ */
  PF.boot = function () {
    refresh$();
    if (!isEnabled()) {
      PF.loader.hide();
      // Floating re-enable affordance
      if (!qs('#pf-enable-fab')) {
        if (!qs('#pf-enable-fab-style')) {
          const st = document.createElement('style');
          st.id = 'pf-enable-fab-style';
          st.textContent = `
            @keyframes pfFabPulse {
              0%, 100% { transform: translateY(0) scale(1); box-shadow: 0 10px 28px rgba(196,92,38,0.45), 0 0 0 0 rgba(196,92,38,0.35); }
              50% { transform: translateY(-2px) scale(1.03); box-shadow: 0 14px 36px rgba(196,92,38,0.55), 0 0 0 10px rgba(196,92,38,0); }
            }
            #pf-enable-fab {
              position: fixed !important;
              right: 20px !important;
              bottom: 20px !important;
              z-index: 2147483646 !important;
              display: inline-flex !important;
              align-items: center !important;
              gap: 10px !important;
              min-height: 52px !important;
              padding: 14px 22px !important;
              border-radius: 999px !important;
              background: linear-gradient(135deg, #c45c26 0%, #a8481a 100%) !important;
              color: #fff !important;
              font-family: "IBM Plex Sans", "Segoe UI", sans-serif !important;
              font-size: 16px !important;
              font-weight: 700 !important;
              letter-spacing: 0.01em !important;
              text-decoration: none !important;
              border: 2px solid rgba(255,255,255,0.35) !important;
              cursor: pointer !important;
              animation: pfFabPulse 2s ease-in-out infinite !important;
            }
            #pf-enable-fab:hover {
              filter: brightness(1.08);
            }
          `;
          document.head.appendChild(st);
        }
        const fab = document.createElement('a');
        fab.id = 'pf-enable-fab';
        fab.href = '#';
        fab.innerHTML =
          '<span aria-hidden="true" style="font-size:1.25em;line-height:1">✦</span> Zapnout jednoduchý režim';
        fab.addEventListener('click', (e) => {
          e.preventDefault();
          setEnabled(true);
          const u = new URL(location.href);
          u.searchParams.delete('pf');
          u.searchParams.set('pf', 'on');
          location.href = u.toString();
        });
        document.body.appendChild(fab);
      }
      return;
    }

    // Old "Změny k odeslání" subpages → Registr (pending section lives there)
    // Archiv hlášení (sent reports) → Pohyby (actual change history)
    {
      const k0 = pageKind();
      if (k0 === 'sheep-send' || k0 === 'pig-send') {
        const isPig = k0 === 'pig-send';
        try {
          const u = new URL(location.href);
          u.pathname = u.pathname.replace(
            /StajovyRegistr(?:Indiv|Prasat)\w*/,
            isPig ? 'StajovyRegistrPrasat' : 'StajovyRegistrIndiv'
          );
          if (isPig) {
            if (!u.searchParams.has('zaznamyZvirat'))
              u.searchParams.set('zaznamyZvirat', 'Platne');
          } else if (!u.searchParams.has('stavDefault')) {
            u.searchParams.set('stavDefault', 'True');
          }
          u.hash = 'pf-pending';
          location.replace(u.pathname + '?' + u.searchParams.toString() + u.hash);
          return;
        } catch (_) {}
      }
      if (k0 === 'pig-history-redirect' || k0 === 'pig-reports') {
        try {
          const u = new URL(location.href);
          u.pathname = u.pathname.replace(
            /StajovyRegistrPrasat\w*/,
            'StajovyRegistrPrasat'
          );
          if (!u.searchParams.has('zaznamyZvirat'))
            u.searchParams.set('zaznamyZvirat', 'Platne');
          u.searchParams.set('pfView', 'history');
          u.hash = '';
          location.replace(u.pathname + '?' + u.searchParams.toString());
          return;
        } catch (_) {}
      }
    }

    document.body.classList.add('pf-simple');
    PF.style.inject();
    PF.loader.installProgressHooks();
    PF.toast.installHooks();

    const kind = pageKind();
    if (kind === 'home') document.body.classList.add('pf-home');
    else document.body.classList.add('pf-register');

    let homeTimer = null;
    let lastHomeCounts = '';
    let loaderHidden = false;

    const hideLoaderOnce = () => {
      if (loaderHidden) return;
      loaderHidden = true;
      PF.loader.hide();
    };

    const run = () => {
      const data = PF.scrape.all();
      // Enrich pending from registrNeodeslane / tab text if home pending is 0
      qsa('.tabs-navlist a').forEach((a) => {
        const t = textOf(a);
        const m = t.match(/Změny k odeslání\s*\((\d+)\)/i);
        if (m) {
          const n = parseInt(m[1], 10) || 0;
          if (kind.startsWith('sheep')) data.links.sheepPending = Math.max(data.links.sheepPending || 0, n);
          if (kind.startsWith('pig')) data.links.pigsPending = Math.max(data.links.pigsPending || 0, n);
        }
      });

      const app = PF.shell.ensure();
      let pageReady = Promise.resolve();
      if (kind === 'home') {
        app.innerHTML = PF.views.home(data);
      } else if (
        kind === 'sheep' ||
        kind === 'sheep-history' ||
        kind === 'sheep-send' ||
        kind === 'pig' ||
        kind === 'pig-history' ||
        kind === 'pig-send'
      ) {
        app.innerHTML = PF.views.register(kind, data);
        pageReady = PF.registers.refresh(kind) || Promise.resolve();
      } else if (kind === 'marks') {
        app.innerHTML = PF.views.marks(data);
        PF.registers.moveContentToHost();
      } else {
        app.innerHTML = PF.views.other(data);
        const t2 = qs('#pf-toggle-off-2');
        if (t2) {
          t2.addEventListener('click', (e) => {
            e.preventDefault();
            setEnabled(false);
            location.reload();
          });
        }
      }
      PF.shell.bindFooter();

      // Keep farmer loader until register + pending (Změny) are fully ready
      if (kind === 'pig' || kind === 'sheep') {
        pageReady.then(() => hideLoaderOnce()).catch(() => hideLoaderOnce());
      } else {
        hideLoaderOnce();
      }

      // Dashboard: load male/female sheep counts from register grid
      if (kind === 'home') {
        const sheepHref =
          (data.links && data.links.sheep) || PF.scrape.cached('sheep');
        PF.scrape.fetchSheepSexCounts(sheepHref, (sex) => {
          if (!sex) return;
          const m = qs('#pf-sheep-male');
          const f = qs('#pf-sheep-female');
          const tot = qs('#pf-sheep-total');
          const ml = qs('#pf-sheep-male-label');
          const fl = qs('#pf-sheep-female-label');
          const sl = qs('#pf-sheep-label');
          if (m) m.textContent = String(sex.male);
          if (f) f.textContent = String(sex.female);
          if (tot) tot.textContent = String(sex.total);
          if (ml) ml.textContent = CZ.males(sex.male);
          if (fl) fl.textContent = CZ.females(sex.female);
          if (sl) sl.textContent = CZ.sheep(sex.total);
        });
      }
    };

    run();
      try {
        const c0 = PF.scrape.herdCounts();
        lastHomeCounts =
          String(c0.pigs) +
          '|' +
          String(c0.sheepMale) +
          '|' +
          String(c0.sheepFemale);
      } catch (_) {}

    const scheduleHome = () => {
      if (kind !== 'home') return;
      clearTimeout(homeTimer);
      homeTimer = setTimeout(() => {
        // Avoid pointless full re-renders; only refresh when herd counts change
        const next = PF.scrape.herdCounts();
        const key =
          String(next.pigs) +
          '|' +
          String(next.sheepMale) +
          '|' +
          String(next.sheepFemale);
        if (key === lastHomeCounts && qs('#pf-app .pf-herd')) return;
        lastHomeCounts = key;
        run();
      }, 120);
    };

    // Wait for AJAX grids — jQuery may arrive after document-start (esp. Firefox TM).
    let ajaxCompleteBound = false;
    const bindAjaxComplete = () => {
      if (ajaxCompleteBound) return true;
      if (!refresh$()) return false;
      $(document).ajaxComplete((_event, _xhr, settings) => {
        // Ignore our own helper requests (and the bad Prasata URL that used to 500-loop)
        if (settings && settings.pfInternal) return;
        const reqUrl = (settings && settings.url) || '';
        if (/PrasatGrid\/Prasata/i.test(reqUrl)) return;
        // Pending Zmeny fetches must never rebuild the register (404 HTML pollution)
        if (/IndivZmeny|PrasatZmeny|ZmenyGrid|\/Zmeny(\?|$)/i.test(reqUrl))
          return;
        // Row checkbox toggles — must not rebuild the simplified table (wipes select-all)
        if (/ChangeRowState/i.test(reqUrl)) return;
        // Modal content loads — never rebuild the page while a dialog is opening
        if (/DialogPorizeni|DialogSRSkup|DialogPartneri|\/Dialog/i.test(reqUrl))
          return;
        setTimeout(() => {
          if (kind === 'home') scheduleHome();
          else if (kind === 'pig') {
            // Settled pig Registr: no full refresh storm; still pick up live DOM
            const settled =
              qs('#pf-pig-summary') &&
              qs('#pf-pig-summary').dataset.pfSettled === '1';
            if (settled) {
              PF.registers.buildToolbar(kind);
              PF.registers.hideNoiseActions(kind);
              PF.registers.renderPigRegisterSummary();
              return;
            }
            PF.registers.refresh(kind);
          } else if (kind === 'sheep') {
            // Match pigs: once settled, don't tear down the herd table on every AJAX
            const settled =
              qs('#pf-sheep-summary') &&
              qs('#pf-sheep-summary').dataset.pfSettled === '1';
            if (settled) {
              PF.registers.buildToolbar(kind);
              PF.registers.hideNoiseActions(kind);
              PF.registers.renderSheepRegisterSummary();
              return;
            }
            PF.registers.refresh(kind);
          } else if (kind !== 'other' && kind !== 'marks') {
            PF.registers.refresh(kind);
          }
        }, 50);
      });
      ajaxCompleteBound = true;
      return true;
    };
    if (!bindAjaxComplete()) {
      let n = 0;
      const t = setInterval(() => {
        n += 1;
        if (bindAjaxComplete() || n > 200) clearInterval(t);
      }, 50);
    }

    const mo = new MutationObserver(() => {
      if (kind === 'home') return;
      if (PF._pfMutating) return;
      const host = qs('#pf-host');
      if (!host) return;

      // Pig/sheep Registr already settled: never kick a full refresh (pending Zmeny loop)
      if (
        (kind === 'pig' &&
          qs('#pf-pig-summary') &&
          qs('#pf-pig-summary').dataset.pfSettled === '1') ||
        (kind === 'sheep' &&
          qs('#pf-sheep-summary') &&
          qs('#pf-sheep-summary').dataset.pfSettled === '1')
      ) {
        return;
      }

      const raw = host.querySelector(
        'table.grid-table:not([data-pf-simplified="1"]), table.dataTable:not([data-pf-simplified="1"])'
      );
      // Sheep: pull in a grid that landed under #main (outside #pf-app) after AJAX
      let pullSheepGrid = false;
      if (kind === 'sheep' || kind === 'sheep-history') {
        const outside = qsa('#main > *:not(#pf-app):not(#messages-box)').some(
          (ch) =>
            !!qs(
              'table.grid-table, table.dataTable, .grid, .dataTables_wrapper',
              ch
            )
        );
        if (outside && !qs('.pf-simple-table-wrap', host)) pullSheepGrid = true;
      }
      if (raw || pullSheepGrid) {
        clearTimeout(mo._pfT);
        mo._pfT = setTimeout(() => {
          if (PF._pfMutating) return;
          PF.registers.refresh(kind);
        }, 120);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    // Delayed passes for slow AJAX (skip once pig summary has settled)
    [300, 800, 1600, 3000].forEach((ms) =>
      setTimeout(() => {
        if (kind === 'home') scheduleHome();
        else if (kind === 'pig') {
          if (
            qs('#pf-pig-summary') &&
            qs('#pf-pig-summary').dataset.pfSettled === '1'
          )
            return;
          PF.registers.refresh(kind);
        } else if (kind !== 'other') PF.registers.refresh(kind);
      }, ms)
    );

    // Safety: never leave the loader stuck if first paint is slow
    setTimeout(hideLoaderOnce, 4000);

    PF.dialogs.observe();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PF.boot());
  } else {
    PF.boot();
  }
})();
