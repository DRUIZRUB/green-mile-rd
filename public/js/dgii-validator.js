/* Green Mile Construction RD — Validador en Vivo de RNC / Cédula y Razón Social ante la DGII */
(function (global) {
  const DGII_API_BASE = 'https://rnc.urbanstockpos.com/api/v1';
  const cacheByRnc = new Map();

  function cleanDigits(str) {
    return String(str || '').replace(/\D/g, '');
  }

  function formatRncOrCedula(raw) {
    const d = cleanDigits(raw);
    if (d.length <= 9) {
      if (d.length > 8) return `${d.slice(0, 1)}-${d.slice(1, 3)}-${d.slice(3, 8)}-${d.slice(8, 9)}`;
      if (d.length > 3) return `${d.slice(0, 1)}-${d.slice(1, 3)}-${d.slice(3)}`;
      if (d.length > 1) return `${d.slice(0, 1)}-${d.slice(1)}`;
      return d;
    }
    // 10-11 digits -> Cédula format XXX-XXXXXXX-X
    const c = d.slice(0, 11);
    if (c.length > 10) return `${c.slice(0, 3)}-${c.slice(3, 10)}-${c.slice(10, 11)}`;
    if (c.length > 3) return `${c.slice(0, 3)}-${c.slice(3)}`;
    return c;
  }

  /* Algoritmo Módulo 11 Oficial DGII para RNC (9 dígitos) */
  function validateMod11Rnc(digits) {
    if (!/^\d{9}$/.test(digits)) return false;
    const weights = [7, 9, 8, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < 8; i++) {
      sum += Number(digits[i]) * weights[i];
    }
    const rem = sum % 11;
    let check;
    if (rem === 0) check = 2;
    else if (rem === 1) check = 1;
    else check = 11 - rem;
    return check === Number(digits[8]);
  }

  /* Algoritmo Módulo 10 Oficial JCE para Cédula Dominicana (11 dígitos) */
  function validateMod10Cedula(digits) {
    if (!/^\d{11}$/.test(digits)) return false;
    if (/^(\d)\1{10}$/.test(digits)) return false;
    const weights = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2];
    let sum = 0;
    for (let i = 0; i < 10; i++) {
      let prod = Number(digits[i]) * weights[i];
      if (prod >= 10) prod = Math.floor(prod / 10) + (prod % 10);
      sum += prod;
    }
    const nextTen = Math.ceil(sum / 10) * 10;
    const check = (nextTen - sum) % 10;
    return check === Number(digits[10]);
  }

  function normalizeText(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, ' ')
      .replace(/\b(SRL|S\s*R\s*L|SAS|S\s*A\s*S|SA|S\s*A|EIRL|C\s*POR\s*A|CXA|INC|DOMINICANA|RD)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* Verifica si el nombre escrito coincide con la Razón Social o Nombre Comercial de la DGII */
  function namesMatch(typedName, razonSocial, nombreComercial) {
    const typed = normalizeText(typedName);
    if (!typed) return { match: false, empty: true };
    const officialA = normalizeText(razonSocial);
    const officialB = normalizeText(nombreComercial);

    if (officialA === typed || (officialB && officialB === typed)) {
      return { match: true, score: 1 };
    }
    if (typed.length >= 4 && (officialA.includes(typed) || typed.includes(officialA))) {
      return { match: true, score: 0.9 };
    }
    if (officialB && typed.length >= 4 && (officialB.includes(typed) || typed.includes(officialB))) {
      return { match: true, score: 0.9 };
    }

    const typedTokens = typed.split(' ').filter(t => t.length >= 3);
    const officialTokens = new Set([...officialA.split(' '), ...officialB.split(' ')].filter(Boolean));
    if (!typedTokens.length) return { match: false, score: 0 };

    let hits = 0;
    for (const tok of typedTokens) {
      if (officialTokens.has(tok)) hits++;
    }
    const ratio = hits / typedTokens.length;
    return { match: ratio >= 0.6 && hits >= 1, score: ratio };
  }

  async function lookupRnc(rawInput) {
    const digits = cleanDigits(rawInput);
    if (digits.length !== 9 && digits.length !== 11) {
      return {
        ok: false,
        code: 'INVALID_LENGTH',
        digits,
        message: 'Ingresa un RNC de 9 dígitos o una Cédula de 11 dígitos.'
      };
    }

    const isRnc = digits.length === 9;
    const validCheck = isRnc ? validateMod11Rnc(digits) : validateMod10Cedula(digits);
    if (!validCheck) {
      return {
        ok: false,
        code: 'INVALID_CHECK_DIGIT',
        digits,
        message: isRnc
          ? 'RNC inválido: el dígito verificador (Módulo 11 DGII) no coincide.'
          : 'Cédula inválida: el dígito verificador (Módulo 10 JCE) no coincide.'
      };
    }

    if (cacheByRnc.has(digits)) {
      return cacheByRnc.get(digits);
    }

    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5500);
      const res = await fetch(`${DGII_API_BASE}/rnc/${digits}`, { signal: ctrl.signal });
      clearTimeout(timer);
      const json = await res.json();

      if (json && json.found && json.data) {
        const result = {
          ok: true,
          found: true,
          digits,
          formattedRnc: json.data.formattedRnc || formatRncOrCedula(digits),
          razonSocial: json.data.razonSocial || '',
          nombreComercial: json.data.nombreComercial || '',
          estado: json.data.estado || 'ACTIVO',
          isActive: json.data.isActive !== false,
          regimenPago: json.data.regimenPago || 'NORMAL',
          actividadEconomica: json.data.actividadEconomica || '',
          padronFecha: (json.meta && json.meta.padronFecha) || ''
        };
        cacheByRnc.set(digits, result);
        return result;
      }

      const notFoundResult = {
        ok: false,
        found: false,
        validFormat: true,
        digits,
        formattedRnc: formatRncOrCedula(digits),
        code: isRnc ? 'RNC_NOT_IN_DGII' : 'CEDULA_NOT_IN_DGII',
        message: isRnc
          ? 'Este RNC no figura en el padrón vigente de la DGII.'
          : 'Cédula con formato válido (JCE), sin actividad fiscal registrada como contribuyente en DGII.'
      };
      cacheByRnc.set(digits, notFoundResult);
      return notFoundResult;
    } catch (err) {
      return {
        ok: false,
        networkError: true,
        validFormat: true,
        digits,
        formattedRnc: formatRncOrCedula(digits),
        code: 'NETWORK_FALLBACK',
        message: 'Formato verificador válido (sin conexión temporal al padrón en línea DGII).'
      };
    }
  }

  async function searchByName(query, limit = 6) {
    const q = String(query || '').trim();
    if (q.length < 3) return [];
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(`${DGII_API_BASE}/search?q=${encodeURIComponent(q)}&limit=${limit}`, {
        signal: ctrl.signal
      });
      clearTimeout(timer);
      const json = await res.json();
      if (json && Array.isArray(json.results)) {
        return json.results;
      }
    } catch (_) {
      // Ignore transient search errors
    }
    return [];
  }

  function escHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Conecta un par de inputs (Nombre/Empresa + RNC/Cédula) con validación en vivo DGII,
   * autocompletado bidireccional y verificación de coincidencia Razón Social ↔ RNC.
   */
  function attachPair({ rncInputId, nameInputId, statusBoxId, suggestionsBoxId, onRecordChange }) {
    const rncEl = document.getElementById(rncInputId);
    const nameEl = document.getElementById(nameInputId);
    const statusEl = document.getElementById(statusBoxId);
    const suggEl = suggestionsBoxId ? document.getElementById(suggestionsBoxId) : null;
    if (!rncEl || !nameEl || !statusEl) return null;

    let lastRecord = null;
    let rncTimer = null;
    let nameTimer = null;
    let suppressNameSearch = false;

    function notifyRecord() {
      if (typeof onRecordChange === 'function') {
        try {
          onRecordChange(lastRecord);
        } catch (_) {}
      }
    }

    function renderStatus() {
      const digits = cleanDigits(rncEl.value);
      const currentName = nameEl.value.trim();

      if (!digits) {
        statusEl.style.display = 'none';
        statusEl.innerHTML = '';
        rncEl.dataset.dgiiValid = '';
        return;
      }

      statusEl.style.display = 'block';

      if (digits.length !== 9 && digits.length !== 11) {
        rncEl.dataset.dgiiValid = 'invalid';
        statusEl.className = 'dgii-badge warn';
        statusEl.innerHTML = `<span>⏳ RNC (9 dígitos) o Cédula (11 dígitos) — llevas ${digits.length} dígitos.</span>`;
        return;
      }

      if (!lastRecord || lastRecord.digits !== digits) {
        statusEl.className = 'dgii-badge loading';
        statusEl.innerHTML = `<span>🔎 Consultando padrón oficial DGII...</span>`;
        return;
      }

      if (lastRecord.found) {
        const officialName = lastRecord.razonSocial;
        const cmp = namesMatch(currentName, officialName, lastRecord.nombreComercial);
        const activeTag = lastRecord.isActive
          ? `<strong class="dgii-pill ok">DGII ${escHtml(lastRecord.estado)}</strong>`
          : `<strong class="dgii-pill err">DGII ${escHtml(lastRecord.estado)}</strong>`;

        if (!lastRecord.isActive) {
          rncEl.dataset.dgiiValid = 'inactive';
          statusEl.className = 'dgii-badge err';
          statusEl.innerHTML = `
            <div class="dgii-head">${activeTag} <span>${escHtml(lastRecord.formattedRnc)}</span></div>
            <div class="dgii-title">${escHtml(officialName)}</div>
            <div class="dgii-note">⚠️ Contribuyente no activo en DGII para emitir e-CF 31 / e-CF 45 / e-CF 44.</div>
          `;
          return;
        }

        if (cmp.empty) {
          suppressNameSearch = true;
          nameEl.value = officialName;
          suppressNameSearch = false;
          rncEl.dataset.dgiiValid = 'verified';
          statusEl.className = 'dgii-badge ok';
          statusEl.innerHTML = `
            <div class="dgii-head">${activeTag} <span>✓ RNC y Razón Social autocompletados</span></div>
            <div class="dgii-title">${escHtml(officialName)}</div>
          `;
          return;
        }

        if (!cmp.match) {
          rncEl.dataset.dgiiValid = 'mismatch';
          statusEl.className = 'dgii-badge warn';
          statusEl.innerHTML = `
            <div class="dgii-head">${activeTag} <span>⚠️ El nombre no coincide con este RNC</span></div>
            <div class="dgii-title">Registrado en DGII: <strong>${escHtml(officialName)}</strong></div>
            <button type="button" class="dgii-use-btn" data-use-official="${escHtml(officialName)}">
              ✓ Usar nombre oficial DGII
            </button>
          `;
          const btn = statusEl.querySelector('[data-use-official]');
          if (btn) {
            btn.onclick = () => {
              suppressNameSearch = true;
              nameEl.value = officialName;
              suppressNameSearch = false;
              renderStatus();
            };
          }
          return;
        }

        rncEl.dataset.dgiiValid = 'verified';
        statusEl.className = 'dgii-badge ok';
        statusEl.innerHTML = `
          <div class="dgii-head">${activeTag} <span>✓ RNC y Razón Social verificados</span></div>
          <div class="dgii-title">${escHtml(officialName)}</div>
        `;
        return;
      }

      if (lastRecord.code === 'CEDULA_NOT_IN_DGII' || lastRecord.networkError) {
        rncEl.dataset.dgiiValid = 'cedula_ok';
        statusEl.className = 'dgii-badge info';
        statusEl.innerHTML = `<span>ℹ️ ${escHtml(lastRecord.message)}</span>`;
        return;
      }

      rncEl.dataset.dgiiValid = 'invalid';
      statusEl.className = 'dgii-badge err';
      statusEl.innerHTML = `<span>✖ ${escHtml(lastRecord.message)}</span>`;
    }

    async function triggerRncCheck() {
      const digits = cleanDigits(rncEl.value);
      if (digits.length !== 9 && digits.length !== 11) {
        lastRecord = null;
        renderStatus();
        notifyRecord();
        return;
      }
      renderStatus();
      const res = await lookupRnc(digits);
      if (cleanDigits(rncEl.value) === digits) {
        lastRecord = res;
        if (res.formattedRnc) rncEl.value = res.formattedRnc;
        renderStatus();
        notifyRecord();
      }
    }

    rncEl.addEventListener('input', () => {
      const formatted = formatRncOrCedula(rncEl.value);
      if (rncEl.value !== formatted) rncEl.value = formatted;
      clearTimeout(rncTimer);
      const digits = cleanDigits(formatted);
      if (digits.length === 9 || digits.length === 11) {
        rncTimer = setTimeout(triggerRncCheck, 220);
      } else {
        lastRecord = null;
        renderStatus();
        notifyRecord();
      }
    });

    rncEl.addEventListener('blur', () => {
      const digits = cleanDigits(rncEl.value);
      if (digits.length > 0) triggerRncCheck();
    });

    nameEl.addEventListener('input', () => {
      if (lastRecord && lastRecord.found) {
        renderStatus();
      }
      if (!suggEl || suppressNameSearch) return;
      clearTimeout(nameTimer);
      const q = nameEl.value.trim();
      if (q.length < 3) {
        suggEl.style.display = 'none';
        suggEl.innerHTML = '';
        return;
      }
      nameTimer = setTimeout(async () => {
        const items = await searchByName(q, 5);
        if (!items.length || document.activeElement !== nameEl) {
          suggEl.style.display = 'none';
          return;
        }
        suggEl.innerHTML = items.map((it) => `
          <button type="button" class="dgii-sugg-item" data-rnc="${escHtml(it.formattedRnc || it.rnc)}" data-name="${escHtml(it.razonSocial)}">
            <strong>${escHtml(it.razonSocial)}</strong>
            <span>RNC: ${escHtml(it.formattedRnc || it.rnc)} • ${escHtml(it.estado)}</span>
          </button>
        `).join('');
        suggEl.style.display = 'block';

        suggEl.querySelectorAll('.dgii-sugg-item').forEach((btn) => {
          btn.addEventListener('mousedown', (ev) => {
            ev.preventDefault();
            suppressNameSearch = true;
            nameEl.value = btn.dataset.name;
            rncEl.value = btn.dataset.rnc;
            suppressNameSearch = false;
            suggEl.style.display = 'none';
            triggerRncCheck();
          });
          btn.addEventListener('click', () => {
            suppressNameSearch = true;
            nameEl.value = btn.dataset.name;
            rncEl.value = btn.dataset.rnc;
            suppressNameSearch = false;
            suggEl.style.display = 'none';
            triggerRncCheck();
          });
        });
      }, 280);
    });

    nameEl.addEventListener('blur', () => {
      if (suggEl) setTimeout(() => { suggEl.style.display = 'none'; }, 200);
    });

    return {
      getLastRecord: () => lastRecord,
      validateBeforeSubmit: async ({ requireActiveForNcf = false, ncfCode = 'E31' } = {}) => {
        const digits = cleanDigits(rncEl.value);
        if (!digits) {
          return { valid: false, error: 'Ingresa el RNC (9 dígitos) o Cédula (11 dígitos).' };
        }
        if (digits.length !== 9 && digits.length !== 11) {
          return { valid: false, error: 'El RNC debe tener 9 dígitos o la Cédula 11 dígitos.' };
        }
        const res = await lookupRnc(digits);
        lastRecord = res;
        renderStatus();
        notifyRecord();

        if (res.code === 'INVALID_CHECK_DIGIT' || res.code === 'RNC_NOT_IN_DGII') {
          return { valid: false, error: res.message };
        }
        if (res.found) {
          if (requireActiveForNcf && !res.isActive) {
            return { valid: false, error: `El RNC ${res.formattedRnc} figura ${res.estado} en DGII y no aplica para comprobante ${ncfCode}.` };
          }
          const cmp = namesMatch(nameEl.value, res.razonSocial, res.nombreComercial);
          if (!cmp.match) {
            return {
              valid: false,
              error: `El nombre no coincide con el RNC en DGII (${res.razonSocial}). Toca "Usar nombre oficial DGII".`
            };
          }
        }
        return { valid: true, record: res };
      }
    };
  }

  global.GM_DGII = {
    cleanDigits,
    formatRncOrCedula,
    validateMod11Rnc,
    validateMod10Cedula,
    lookupRnc,
    searchByName,
    namesMatch,
    attachPair
  };
})(window);
