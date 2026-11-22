/* Green Mile Construction RD — Lógica Completa del Portal Administrativo, Facturación e-CF, Tarjetas, Estado (E45) y Liquidaciones */
(function () {
  const GM = window.GM_CATALOG;
  const BILL = window.GM_BILLING;
  const API = window.GM_API;
  const ADMIN_SESSION_KEY = 'gm_rd_admin_session_v1';

  let state = GM.loadState();
  let ownersList = [];
  let adminConfig = BILL.loadAdminConfig();
  let activeSection = 'overview';
  let orderFilter = 'all';
  let orderSearch = '';
  let manualDgiiCtrl = null;
  let currentPrintBookingId = null;
  let currentPrintDocTab = 'invoice';
  let backendHealth = null;
  let backendChecking = false;

  const SECTION_META = {
    overview: {
      title: 'Resumen Ejecutivo y Control Operativo',
      sub: 'Vista consolidada de facturación e-CF, cobros, cartera estatal (E45) y liquidaciones'
    },
    orders: {
      title: 'Facturación e-CF, Órdenes y Cobros',
      sub: 'Validación de pagos (Tarjeta / Transferencia / OC), emisión de e-NCF y control de conduces'
    },
    gov: {
      title: 'Gestión Gubernamental — Comprobante e-CF 45 (Ley 340-06)',
      sub: 'Expedientes públicos, Orden de Compra DGCP, Retención 5% ISR (Art. 309) y Libramientos SIGEF'
    },
    payouts: {
      title: 'Liquidaciones a Propietarios de Flota (Cuentas por Pagar)',
      sub: 'Cálculo de comisión Green Mile RD, retenciones Persona Física (e-CF 41) / Jurídica (e-CF 31) y transferencias'
    },
    fiscal: {
      title: 'Conciliación Tarjetas (Norma 06-23), Secuencias e-NCF y Reportes DGII',
      sub: 'Retención 2% ITBIS adquirentes, control de rangos e-NCF y exportación de Formatos 607, 606 e IT-1'
    },
    sop: {
      title: 'Proceso Administrativo Integral — Manual Operativo (SOP)',
      sub: 'Procedimiento paso a paso de facturación, pagos con tarjeta, ventas al Estado y calendario fiscal RD'
    },
    config: {
      title: 'Configuración Corporativa, Cuentas Bancarias y Cumplimiento',
      sub: 'Datos fiscales de Green Mile RD, RPE Estado, certificaciones DGII/TSS, comisiones y PIN'
    }
  };

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function toast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.style.display = 'none'; }, 3200);
  }

  function openModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('open');
  }

  function closeModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
  }

  function getBookings() {
    return (state.bookings || []).map((b) => BILL.normalizeBooking(b));
  }

  function findRawBooking(id) {
    return (state.bookings || []).find((b) => String(b.id) === String(id)) || null;
  }

  function persistBooking(updatedRaw) {
    const idx = (state.bookings || []).findIndex((b) => String(b.id) === String(updatedRaw.id));
    if (idx >= 0) {
      state.bookings[idx] = updatedRaw;
    } else {
      state.bookings.unshift(updatedRaw);
    }
    GM.saveState(state);
    if (window.GM_FIREBASE && window.GM_FIREBASE.isReady && window.GM_FIREBASE.isReady()) {
      if (window.GM_FIREBASE.updateBooking) {
        window.GM_FIREBASE.updateBooking(updatedRaw.id, updatedRaw).catch(() => {});
      }
    }
    syncNavCounts();
    renderSection();
  }

  function syncNavCounts() {
    const list = getBookings().filter((b) => b.stage !== 'cancelled');
    const govList = list.filter((b) => b.ncfType === 'E45');
    const pendingPayouts = list.filter((b) => b.settlement.status !== 'paid');

    const elOrders = document.getElementById('navCountOrders');
    const elGov = document.getElementById('navCountGov');
    const elPay = document.getElementById('navCountPayouts');
    if (elOrders) elOrders.textContent = String(list.length);
    if (elGov) elGov.textContent = String(govList.length);
    if (elPay) elPay.textContent = String(pendingPayouts.length);
  }

  /* =========================================================
     ACCESO CON PIN ADMINISTRATIVO
     ========================================================= */
  function isUnlocked() {
    return sessionStorage.getItem(ADMIN_SESSION_KEY) === '1';
  }

  async function refreshBackendHealth(silent = false) {
    if (!API || !API.getHealth) return null;
    backendChecking = true;
    if (activeSection === 'config') renderSection();
    try {
      backendHealth = await API.getHealth();
    } catch (err) {
      backendHealth = { reachable: false, apiBaseUrl: API.getApiBaseUrl(), error: err.message || 'Sin conexión' };
    }
    backendChecking = false;
    const stEl = document.getElementById('sidebarCloudStatus');
    if (stEl && backendHealth && backendHealth.reachable) {
      const payLabel = backendHealth.payment?.activeMode === 'live'
        ? `Pago: ${String(backendHealth.payment.configuredProvider || '').toUpperCase()} LIVE`
        : 'Pago: Sandbox';
      const dgiiLabel = backendHealth.dgii?.activeMode !== 'sandbox'
        ? `DGII: ${backendHealth.dgii.dgiiEnv}`
        : 'DGII: Sandbox';
      stEl.innerHTML = `<strong>☁️ API Cloud Functions Activa</strong>${esc(payLabel)} • ${esc(dgiiLabel)}`;
    }
    if (activeSection === 'config') renderSection();
    if (!silent) {
      if (backendHealth && backendHealth.reachable) {
        toast(`✓ Backend conectado (${backendHealth.payment?.activeMode === 'live' ? backendHealth.payment.configuredProvider.toUpperCase() + ' LIVE' : 'Modo Sandbox'})`);
      } else {
        toast('ℹ️ Backend Cloud Functions aún no desplegado — operando en modo Sandbox local');
      }
    }
    return backendHealth;
  }

  function saveBackendUrl(e) {
    if (e && e.preventDefault) e.preventDefault();
    const val = (document.getElementById('cfgApiBaseUrl')?.value || '').trim();
    if (API && API.setApiBaseUrl) {
      API.setApiBaseUrl(val);
    }
    adminConfig.apiBaseUrl = val;
    BILL.saveAdminConfigLocal(adminConfig);
    toast(val ? '✓ URL de Backend API guardada' : '✓ URL de Backend restablecida al valor predeterminado');
    refreshBackendHealth(false);
  }

  function showApp() {
    document.getElementById('adminGate').style.display = 'none';
    document.getElementById('adminApp').style.display = 'grid';
    syncNavCounts();
    renderSection();
    refreshBackendHealth(true);
  }

  function submitPin(e) {
    e.preventDefault();
    const entered = (document.getElementById('adminPinInput')?.value || '').trim();
    const expected = String(adminConfig.adminPin || '2026').trim();
    if (entered !== expected) {
      toast('PIN administrativo incorrecto');
      return;
    }
    sessionStorage.setItem(ADMIN_SESSION_KEY, '1');
    showApp();
    toast('✓ Bienvenido al Centro Administrativo Green Mile RD');
  }

  function logoutAdmin() {
    sessionStorage.removeItem(ADMIN_SESSION_KEY);
    document.getElementById('adminApp').style.display = 'none';
    document.getElementById('adminGate').style.display = 'flex';
    const inp = document.getElementById('adminPinInput');
    if (inp) { inp.value = ''; inp.focus(); }
  }

  function switchSection(sec) {
    activeSection = sec;
    document.querySelectorAll('.sb-btn, .m-tab').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.sec === sec);
    });
    const meta = SECTION_META[sec] || SECTION_META.overview;
    const tEl = document.getElementById('topbarTitle');
    const sEl = document.getElementById('topbarSubtitle');
    if (tEl) tEl.textContent = meta.title;
    if (sEl) sEl.textContent = meta.sub;
    renderSection();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderSection() {
    const root = document.getElementById('adminContent');
    if (!root) return;
    if (activeSection === 'overview') root.innerHTML = renderOverview();
    else if (activeSection === 'orders') root.innerHTML = renderOrders();
    else if (activeSection === 'gov') root.innerHTML = renderGovModule();
    else if (activeSection === 'payouts') root.innerHTML = renderPayoutsModule();
    else if (activeSection === 'fiscal') root.innerHTML = renderFiscalModule();
    else if (activeSection === 'sop') root.innerHTML = renderSopModule();
    else if (activeSection === 'config') root.innerHTML = renderConfigModule();
  }

  /* =========================================================
     CARGA DE CASOS DEMO REALISTAS (OPCIONAL SI ESTÁ VACÍO)
     ========================================================= */
  function seedDemoOperations() {
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];
    const in5 = new Date(now + 5 * 86400000).toISOString().split('T')[0];
    const in10 = new Date(now + 10 * 86400000).toISOString().split('T')[0];

    const demo1Encf = BILL.issueNextEncf('E31');
    const demo2Encf = BILL.issueNextEncf('E45');

    const demos = [
      {
        id: now - 300000,
        equipmentId: 1001,
        title: 'Retroexcavadora CAT 416F2 4x4',
        city: 'Santo Domingo',
        owner: 'Equipos Ozama SRL',
        ownerRnc: '1-31-48291-5',
        ownerPhone: '809-555-0141',
        renter: 'CONSTRUCTORA METROPOLITANA DEL CARIBE SRL',
        renterRnc: '1-31-88420-9',
        dgiiVerified: true,
        address: 'Torre Residencial Evaristo Morales, Distrito Nacional',
        startDate: today,
        endDate: in5,
        qty: 5,
        unitLabel: 'días',
        baseAmount: 82500,
        proDiscount: 0,
        transportCost: 6500,
        netSubtotal: 89000,
        itbis: 16020,
        total: 105020,
        ncf: true,
        ncfType: 'E31',
        encfNumber: demo1Encf.encf,
        encfSecurityCode: demo1Encf.securityCode,
        encfExpires: demo1Encf.expires,
        encfIssuedAt: demo1Encf.issuedAt,
        paymentMethod: 'card',
        paymentStatus: 'paid',
        cardInfo: {
          brand: 'Visa',
          last4: '4242',
          holder: 'ING. CARLOS MENDEZ',
          expiry: '08/28',
          authCode: 'GM748219',
          processedAt: new Date(now - 300000).toISOString()
        },
        cardGatewayFee: Math.round(105020 * ((adminConfig.cardFeePct || 3.25) / 100)),
        cardItbisRetention: Math.round(105020 * 0.02),
        gmCommissionPct: 12,
        conduce: { number: 'COND-2026-041', signedDate: today, receiverName: 'Ing. Marcos Polanco', notes: 'Entregada con operador y combustible lleno.' },
        stage: 'conduce_signed'
      },
      {
        id: now - 180000,
        equipmentId: 1004,
        title: 'Bulldozer CAT D8T XL con Ripper',
        city: 'La Romana',
        owner: 'Terracería Romana SRL',
        ownerRnc: '1-31-77210-9',
        ownerPhone: '849-555-0194',
        renter: 'MINISTERIO DE OBRAS PUBLICAS Y COMUNICACIONES (MOPC)',
        renterRnc: '4-01-00755-1',
        dgiiVerified: true,
        address: 'Rehabilitación Camino Vecinal Villa Hermosa, La Romana',
        startDate: today,
        endDate: in10,
        qty: 10,
        unitLabel: 'días',
        baseAmount: 380000,
        proDiscount: 0,
        transportCost: 16500,
        netSubtotal: 396500,
        itbis: 71370,
        total: 467870,
        ncf: true,
        ncfType: 'E45',
        encfNumber: demo2Encf.encf,
        encfSecurityCode: demo2Encf.securityCode,
        encfExpires: demo2Encf.expires,
        encfIssuedAt: demo2Encf.issuedAt,
        paymentMethod: 'gov_po',
        paymentStatus: 'pending',
        govApplyItbisRet: false,
        govIsrRetention: Math.round(396500 * 0.05),
        govItbisRetention: 0,
        gmCommissionPct: 15,
        govData: {
          poNumber: 'MOPC-DAF-CM-2026-0312',
          capNumber: 'CAP-2026-01844',
          entityEmail: 'cuentasporpagar@mopc.gob.do',
          paymentTermsDays: 45,
          filedDate: today,
          libramientoNumber: '',
          isrLetterNumber: ''
        },
        govChecklist: {
          rncVerified: true,
          poReceived: true,
          capVerified: true,
          compliancePack: true,
          conduceStamped: true,
          encfFiled: true,
          treasuryPaid: false,
          isrLetterReceived: false
        },
        conduce: { number: 'ACTA-MOPC-0089', signedDate: today, receiverName: 'Ing. Juana Altagracia (Supervisión MOPC)', notes: 'Recepción conformada sellada en obra.' },
        stage: 'gov_filed'
      },
      {
        id: now - 60000,
        equipmentId: 1002,
        title: 'Excavadora Hidráulica JCB JS210LC',
        city: 'Punta Cana',
        owner: 'Pedro Almonte (Propietario Independiente)',
        ownerRnc: '001-1482910-4',
        ownerPhone: '829-555-0182',
        renter: 'DESARROLLO TURISTICO CORAL BAVARO SAS',
        renterRnc: '1-32-44910-2',
        dgiiVerified: true,
        address: 'Boulevard Turístico del Este Km 14, Punta Cana',
        startDate: today,
        endDate: in5,
        qty: 5,
        unitLabel: 'días',
        baseAmount: 142500,
        proDiscount: 0,
        transportCost: 12000,
        netSubtotal: 154500,
        itbis: 0,
        total: 154500,
        ncf: true,
        ncfType: 'E44',
        exemptionCode: 'RES-CONFOTUR-2026-0719',
        encfNumber: '',
        paymentMethod: 'transfer',
        paymentStatus: 'pending',
        transferBank: 'Banco Popular',
        transferRef: 'LBTR-9938412',
        gmCommissionPct: 12,
        stage: 'pending_validation'
      }
    ];

    demos.forEach((d) => {
      state.bookings.unshift(d);
      if (window.GM_FIREBASE && window.GM_FIREBASE.isReady && window.GM_FIREBASE.isReady()) {
        window.GM_FIREBASE.saveBooking(d, null).catch(() => {});
      }
    });
    GM.saveState(state);
    adminConfig = BILL.loadAdminConfig();
    syncNavCounts();
    renderSection();
    toast('✓ 3 operaciones de ejemplo cargadas (Tarjeta E31, MOPC Estatal E45 y CONFOTUR E44)');
  }

  /* =========================================================
     MÓDULO 1: RESUMEN EJECUTIVO
     ========================================================= */
  function renderOverview() {
    const all = getBookings();
    const active = all.filter((b) => b.stage !== 'cancelled');

    const totalBilled = active.reduce((s, b) => s + b.total, 0);
    const totalCollected = active.filter((b) => b.paymentStatus === 'paid').reduce((s, b) => s + b.total, 0);
    const govOrders = active.filter((b) => b.ncfType === 'E45');
    const govReceivable = govOrders.filter((b) => b.paymentStatus !== 'paid').reduce((s, b) => s + (b.total - b.govIsrRetention - b.govItbisRetention), 0);
    const govIsrCredits = govOrders.reduce((s, b) => s + (b.govIsrRetention || 0), 0);
    const cardRetNorma0623 = active.filter((b) => b.paymentMethod === 'card').reduce((s, b) => s + (b.cardItbisRetention || 0), 0);

    let pendingOwnerPay = 0;
    let totalGmComm = 0;
    active.forEach((b) => {
      const fin = BILL.calculateFinancials({
        baseAmount: b.netSubtotal,
        ncfType: b.ncfType,
        paymentMethod: b.paymentMethod,
        commissionPct: b.settlement.commissionPct,
        ownerRnc: b.ownerRnc,
        config: adminConfig
      });
      totalGmComm += fin.gmCommissionAmount;
      if (b.settlement.status !== 'paid') pendingOwnerPay += fin.ownerNetTransfer;
    });

    const stageCounts = {};
    Object.keys(BILL.ORDER_STAGES).forEach((k) => { stageCounts[k] = 0; });
    all.forEach((b) => { stageCounts[b.stage] = (stageCounts[b.stage] || 0) + 1; });

    const pendingValidations = active.filter((b) => b.paymentStatus !== 'paid' && b.ncfType !== 'E45').length;
    const pendingEncf = active.filter((b) => !b.encfNumber).length;
    const readyToSettle = active.filter((b) => b.conduce.number && b.settlement.status !== 'paid').length;

    return `
      ${all.length === 0 ? `
        <div class="panel" style="border:1.5px dashed var(--orange); background:var(--orange-soft);">
          <div class="panel-body" style="display:flex; justify-content:space-between; align-items:center; gap:14px; flex-wrap:wrap;">
            <div>
              <strong style="font-size:15px; color:var(--navy); display:block;">👋 Aún no hay órdenes registradas en el back-office</strong>
              <span style="font-size:12.5px; color:#475569;">Crea una factura manual, haz una reserva en el catálogo o carga 3 escenarios reales de prueba (Tarjeta e-CF 31, Ministerio MOPC e-CF 45 y CONFOTUR e-CF 44).</span>
            </div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <button type="button" class="btn btn-primary" onclick="window.GM_ADMIN.seedDemoOperations()">⚡ Cargar 3 Casos Demo RD</button>
              <button type="button" class="btn btn-navy" onclick="window.GM_ADMIN.openNewInvoiceModal()">+ Nueva Factura Manual</button>
            </div>
          </div>
        </div>
      ` : ''}

      <div class="kpi-grid kpi-grid-6">
        <div class="kpi-card">
          <span>Facturación Bruta (e-CF)</span>
          <strong>${BILL.fmtRD(totalBilled)}</strong>
          <small>${active.length} operación(es) activas</small>
        </div>
        <div class="kpi-card ok">
          <span>Cobrado Efectivo</span>
          <strong>${BILL.fmtRD(totalCollected)}</strong>
          <small>Tarjetas + Transferencias validadas</small>
        </div>
        <div class="kpi-card info">
          <span>Cartera Estatal (e-CF 45)</span>
          <strong>${BILL.fmtRD(govReceivable)}</strong>
          <small>${govOrders.length} expediente(s) • Ret. 5% ISR: ${BILL.fmtRD(govIsrCredits)}</small>
        </div>
        <div class="kpi-card accent">
          <span>Comisión Bruta Green Mile</span>
          <strong>${BILL.fmtRD(totalGmComm)}</strong>
          <small>Estándar ${adminConfig.standardCommissionPct}% / Estado ${adminConfig.govCommissionPct}%</small>
        </div>
        <div class="kpi-card">
          <span>Por Liquidar a Propietarios</span>
          <strong>${BILL.fmtRD(pendingOwnerPay)}</strong>
          <small>${readyToSettle} con conduce listo para pagar</small>
        </div>
        <div class="kpi-card">
          <span>Créditos Fiscales a Favor</span>
          <strong>${BILL.fmtRD(cardRetNorma0623 + govIsrCredits)}</strong>
          <small>2% Tarjeta IT-1: ${BILL.fmtRD(cardRetNorma0623)} • 5% ISR: ${BILL.fmtRD(govIsrCredits)}</small>
        </div>
      </div>

      <!-- EMBUDO DEL PROCESO ADMINISTRATIVO -->
      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Flujo Administrativo en Tiempo Real (Ciclo de Vida Operativo)</h3>
            <p>Haz clic en cualquier etapa para filtrar las órdenes correspondientes</p>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" onclick="window.GM_ADMIN.switchSection('sop')">📋 Ver Manual Completo SOP →</button>
        </div>
        <div class="panel-body">
          <div class="pipeline-grid">
            ${['pending_validation', 'gov_review', 'payment_verified', 'invoiced_dispatched', 'conduce_signed', 'gov_filed', 'settled'].map((key) => {
              const st = BILL.ORDER_STAGES[key];
              return `
                <div class="pipe-step" onclick="window.GM_ADMIN.jumpToOrdersFilter('${key}')">
                  <div class="pipe-num">Paso ${st.step}</div>
                  <strong>${stageCounts[key] || 0}</strong>
                  <span>${esc(st.label)}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- BANDEJA DE PENDIENTES ADMINISTRATIVOS -->
      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Acciones Prioritarias de Administración y Tesorería</h3>
            <p>Control diario de cumplimiento fiscal, cobros y liquidaciones</p>
          </div>
        </div>
        <div class="panel-body" style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:12px;">
          <div style="border:1px solid var(--border); border-radius:12px; padding:14px; background:#FFFBEB;">
            <strong style="color:#92400E; font-size:13px; display:block;">🏦 Pagos / Transferencias por Validar: ${pendingValidations}</strong>
            <p style="font-size:12px; color:#78350F; margin:4px 0 10px;">Verifica depósito en banco o aprobación de crédito antes de autorizar salida de equipo.</p>
            <button type="button" class="btn btn-navy btn-sm" onclick="window.GM_ADMIN.jumpToOrdersFilter('pending_pay')">Revisar Cobros →</button>
          </div>
          <div style="border:1px solid #BFDBFE; border-radius:12px; padding:14px; background:#EFF6FF;">
            <strong style="color:#1E3A8A; font-size:13px; display:block;">🏛️ Expedientes Gubernamentales (E45): ${govOrders.length}</strong>
            <p style="font-size:12px; color:#1E40AF; margin:4px 0 10px;">Control de OC DGCP, paquete RPE/DGII/TSS, radicación en Cuentas por Pagar y Carta 5% ISR.</p>
            <button type="button" class="btn btn-navy btn-sm" onclick="window.GM_ADMIN.switchSection('gov')">Abrir Módulo Estado →</button>
          </div>
          <div style="border:1px solid var(--border); border-radius:12px; padding:14px; background:#ECFDF5;">
            <strong style="color:#065F46; font-size:13px; display:block;">🧾 e-NCF por Emitir: ${pendingEncf} • Liquidaciones Listas: ${readyToSettle}</strong>
            <p style="font-size:12px; color:#047857; margin:4px 0 10px;">Asigna secuencia e-NCF DGII y liquida a propietarios con conduce conformado en obra.</p>
            <button type="button" class="btn btn-success btn-sm" onclick="window.GM_ADMIN.switchSection('payouts')">Ir a Liquidaciones →</button>
          </div>
        </div>
      </div>
    `;
  }

  /* =========================================================
     MÓDULO 2: FACTURACIÓN Y ÓRDENES
     ========================================================= */
  function jumpToOrdersFilter(f) {
    orderFilter = f;
    switchSection('orders');
  }

  function setOrderFilter(f) {
    orderFilter = f;
    renderSection();
  }

  function setOrderSearch(val) {
    orderSearch = String(val || '').trim().toLowerCase();
    renderSection();
  }

  function renderOrders() {
    const list = getBookings().filter((b) => {
      if (orderFilter === 'pending_pay' && (b.paymentStatus === 'paid' || b.stage === 'cancelled')) return false;
      else if (orderFilter === 'E45' && b.ncfType !== 'E45') return false;
      else if (orderFilter === 'card' && b.paymentMethod !== 'card') return false;
      else if (BILL.ORDER_STAGES[orderFilter] && b.stage !== orderFilter) return false;

      if (orderSearch) {
        const hay = `${b.id} ${b.renter} ${b.renterRnc} ${b.title} ${b.city} ${b.encfNumber || ''} ${b.govData.poNumber || ''}`.toLowerCase();
        if (!hay.includes(orderSearch)) return false;
      }
      return true;
    });

    const chips = [
      { id: 'all', label: 'Todas' },
      { id: 'pending_pay', label: 'Pendiente Pago' },
      { id: 'card', label: '💳 Tarjeta' },
      { id: 'E45', label: '🏛️ Gubernamental E45' },
      { id: 'invoiced_dispatched', label: 'En Obra' },
      { id: 'conduce_signed', label: 'Conduce Firmado' },
      { id: 'settled', label: 'Liquidadas' }
    ];

    return `
      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Registro Maestro de Órdenes y Facturas Electrónicas (e-CF)</h3>
            <p>Control de emisión e-NCF, pagos con tarjeta/transferencia, despachos y conduces</p>
          </div>
          <button type="button" class="btn btn-primary" onclick="window.GM_ADMIN.openNewInvoiceModal()">+ Nueva Factura / Orden</button>
        </div>
        <div class="panel-body">
          <div class="filter-bar">
            <div class="chip-row">
              ${chips.map((c) => `<button type="button" class="f-chip ${orderFilter === c.id ? 'active' : ''}" onclick="window.GM_ADMIN.setOrderFilter('${c.id}')">${c.label}</button>`).join('')}
            </div>
            <input type="text" class="search-inp" value="${esc(orderSearch)}" placeholder="Buscar RNC, empresa, e-NCF, OC..." oninput="window.GM_ADMIN.setOrderSearch(this.value)" />
          </div>

          ${list.length === 0 ? `
            <div class="empty-box">
              <strong>No hay órdenes con este filtro</strong>
              Crea una factura manual o realiza una reserva desde el catálogo de equipos.
            </div>
          ` : `
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Orden / Fecha</th>
                    <th>Cliente / RNC</th>
                    <th>Equipo / Obra</th>
                    <th>Comprobante e-CF</th>
                    <th>Pago y Estado</th>
                    <th>Total RD$</th>
                    <th>Etapa</th>
                    <th>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  ${list.map((b) => {
                    const st = BILL.ORDER_STAGES[b.stage] || BILL.ORDER_STAGES.pending_validation;
                    const pBadge = BILL.paymentStatusBadge(b);
                    return `
                      <tr>
                        <td>
                          <strong>#GM-${String(b.id).slice(-6)}</strong><br>
                          <span style="font-size:11px; color:var(--text-muted);">${esc(b.startDate || '')} (${b.qty} ${esc(b.unitLabel)})</span>
                        </td>
                        <td>
                          <strong>${esc(b.renter)}</strong><br>
                          <span style="font-size:11px; color:var(--text-muted);">RNC: ${esc(b.renterRnc)}</span>
                        </td>
                        <td>
                          <strong>${esc(b.title)}</strong><br>
                          <span style="font-size:11px; color:var(--text-muted);">${esc(b.city)} • Propietario: ${esc(b.owner)}</span>
                        </td>
                        <td>
                          <span class="pill ${b.ncfType === 'E45' ? 'pill-info' : 'pill-navy'}">${esc(b.ncfType)}</span><br>
                          <span style="font-size:11px; font-family:monospace; font-weight:700; color:${b.encfNumber ? 'var(--navy)' : 'var(--warn)'};">
                            ${b.encfNumber ? esc(b.encfNumber) : 'Sin emitir aún'}
                          </span>
                        </td>
                        <td>
                          <span class="pill" style="background:${pBadge.bg}; color:${pBadge.color};">${pBadge.text}</span><br>
                          <span style="font-size:11px; color:var(--text-muted);">${esc(BILL.paymentSummaryText(b))}</span>
                        </td>
                        <td>
                          <strong style="color:var(--navy);">${BILL.fmtRD(b.total)}</strong>
                          ${b.ncfType === 'E45' ? `<br><span style="font-size:10.5px; color:#1E40AF;">Neto SIGEF: ${BILL.fmtRD(b.total - b.govIsrRetention - b.govItbisRetention)}</span>` : ''}
                        </td>
                        <td><span class="pill pill-${st.tone}">${esc(st.label)}</span></td>
                        <td>
                          <div style="display:flex; gap:5px; flex-wrap:wrap;">
                            <button type="button" class="btn btn-navy btn-sm" onclick="window.GM_ADMIN.openManageOrder('${b.id}')">Gestionar</button>
                            <button type="button" class="btn btn-ghost btn-sm" onclick="window.GM_ADMIN.openPrintDoc('${b.id}', 'invoice')">🧾 PDF</button>
                          </div>
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      </div>
    `;
  }

  /* =========================================================
     MODAL GESTIÓN COMPLETA DE UNA ORDEN
     ========================================================= */
  function openManageOrder(id) {
    const raw = findRawBooking(id);
    if (!raw) return;
    const b = BILL.normalizeBooking(raw);
    const st = BILL.ORDER_STAGES[b.stage] || BILL.ORDER_STAGES.pending_validation;

    document.getElementById('moTitle').textContent = `Orden #GM-${String(b.id).slice(-6)} — ${b.renter}`;
    document.getElementById('moSub').textContent = `${b.title} • ${b.ncfType} • Etapa: ${st.label}`;

    document.getElementById('manageOrderBody').innerHTML = `
      <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:14px;">
        <span class="pill pill-navy">${esc(b.ncfMeta.badge)} · ${esc(b.ncfMeta.name)}</span>
        <span class="pill pill-${st.tone}">${esc(st.label)}</span>
        ${b.encfNumber ? `<span class="pill pill-orange">e-NCF: ${esc(b.encfNumber)}</span>` : `<span class="pill pill-warn">e-NCF pendiente de emitir</span>`}
        ${b.dgiiStatus ? `<span class="pill pill-info">DGII: ${esc(b.dgiiStatus)}</span>` : ''}
      </div>

      <!-- PASO 1: VALIDACIÓN DE COBRO -->
      <div class="panel" style="margin-bottom:12px;">
        <div class="panel-head" style="padding:11px 14px;">
          <h3 style="font-size:13.5px;">1. Validación de Cobro / Pago</h3>
          <span class="pill ${b.paymentStatus === 'paid' ? 'pill-ok' : 'pill-warn'}">${b.paymentStatus === 'paid' ? '✓ Pago Confirmado' : 'Pendiente Confirmación'}</span>
        </div>
        <div class="panel-body" style="padding:13px 14px; font-size:12.5px;">
          <div style="margin-bottom:10px;">
            <strong>Método:</strong> ${esc(BILL.paymentSummaryText(b))}<br>
            <strong>Total Factura:</strong> ${BILL.fmtRD(b.total)} (Neto: ${BILL.fmtRD(b.netSubtotal)} + ITBIS: ${BILL.fmtRD(b.itbis)})
            ${b.paymentMethod === 'card' ? `<br><span style="color:#065F46;">Conciliación Tarjeta: Comisión ${BILL.fmtRD(b.cardGatewayFee)} • Ret. 2% Norma 06-23: ${BILL.fmtRD(b.cardItbisRetention)} • Neto Banco: <strong>${BILL.fmtRD(b.total - b.cardGatewayFee - b.cardItbisRetention)}</strong></span>` : ''}
            ${b.dgiiTrackId ? `<br><span style="color:#1E40AF; font-family:monospace; font-size:11.5px;">TrackId DGII: <strong>${esc(b.dgiiTrackId)}</strong></span>` : ''}
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${b.paymentStatus !== 'paid' ? `
              <button type="button" class="btn btn-success btn-sm" onclick="window.GM_ADMIN.actionMarkPaid('${b.id}')">✓ Confirmar Pago Recibido en Banco</button>
            ` : `<span style="font-size:12px; color:var(--success); font-weight:700;">✓ Cobro validado por Tesorería</span>`}
            ${!b.encfNumber ? `
              <button type="button" class="btn btn-primary btn-sm" onclick="window.GM_ADMIN.actionIssueEncf('${b.id}')">🧾 Emitir ${esc(b.ncfType)} Oficial DGII Ahora</button>
            ` : ''}
            ${b.dgiiTrackId ? `
              <button type="button" class="btn btn-ghost btn-sm" onclick="window.GM_ADMIN.actionCheckDgiiStatus('${b.id}')">🔄 Consultar Estado DGII</button>
            ` : ''}
          </div>
        </div>
      </div>

      <!-- PASO 2: DESPACHO Y CONDUCE EN OBRA -->
      <div class="panel" style="margin-bottom:12px;">
        <div class="panel-head" style="padding:11px 14px;">
          <h3 style="font-size:13.5px;">2. Despacho y Conduce Conformado en Obra</h3>
          <span class="pill ${b.conduce.number ? 'pill-ok' : 'pill-warn'}">${b.conduce.number ? '✓ Conduce ' + esc(b.conduce.number) : 'Sin Conduce aún'}</span>
        </div>
        <div class="panel-body" style="padding:13px 14px;">
          <form onsubmit="window.GM_ADMIN.actionSaveConduce(event, '${b.id}')">
            <div class="f-grid">
              <div class="f-field">
                <label>No. Conduce / Acta de Entrega *</label>
                <div class="f-box"><input type="text" id="moCondNum" value="${esc(b.conduce.number)}" placeholder="Ej. COND-2026-084" required /></div>
              </div>
              <div class="f-field">
                <label>Fecha Recepción en Obra</label>
                <div class="f-box"><input type="date" id="moCondDate" value="${esc(b.conduce.signedDate || new Date().toISOString().split('T')[0])}" /></div>
              </div>
              <div class="f-field full">
                <label>Ingeniero / Encargado que Firmó en Obra *</label>
                <div class="f-box"><input type="text" id="moCondRec" value="${esc(b.conduce.receiverName)}" placeholder="Nombre y cargo de quien recibió la máquina" required /></div>
              </div>
              <div class="f-field full">
                <label>Observaciones de Entrega / Horómetro</label>
                <div class="f-box"><input type="text" id="moCondNotes" value="${esc(b.conduce.notes)}" placeholder="Ej. Horómetro salida 4,210h • Operador asignado" /></div>
              </div>
            </div>
            <div style="margin-top:10px; display:flex; gap:8px; flex-wrap:wrap;">
              <button type="submit" class="btn btn-navy btn-sm">💾 Guardar Conduce Conformado</button>
              <button type="button" class="btn btn-ghost btn-sm" onclick="window.GM_ADMIN.actionReleaseEquipment('${b.equipmentId}')">🔓 Liberar Equipo en Catálogo</button>
            </div>
          </form>
        </div>
      </div>

      <!-- PASO 3: DOCUMENTOS Y ANULACIÓN -->
      <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap; margin-top:14px;">
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button type="button" class="btn btn-navy btn-sm" onclick="window.GM_ADMIN.openPrintDoc('${b.id}', 'invoice')">🧾 Ver Factura ${esc(b.ncfType)}</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="window.GM_ADMIN.actionDownloadXml('${b.id}')">📥 XML e-CF</button>
          <button type="button" class="btn btn-ghost btn-sm" onclick="window.GM_ADMIN.openPrintDoc('${b.id}', 'contract')">📄 Contrato</button>
          ${b.ncfType === 'E45' ? `<button type="button" class="btn btn-ghost btn-sm" onclick="window.GM_ADMIN.openPrintDoc('${b.id}', 'gov')">🏛️ Carátula Estado</button>` : ''}
          ${b.ncfType === 'E45' ? `<button type="button" class="btn btn-ghost btn-sm" onclick="window.GM_ADMIN.actionNotifyGovEmail('${b.id}')">✉️ Enviar .gob.do</button>` : ''}
        </div>
        ${b.stage !== 'cancelled' ? `
          <button type="button" class="btn btn-danger btn-sm" onclick="window.GM_ADMIN.actionCancelOrder('${b.id}')">✖ Anular / Emitir Nota Crédito e-CF 34</button>
        ` : `<span class="pill pill-err">Anulada (${esc(b.creditNoteEncf || 'e-CF 34')})</span>`}
      </div>
    `;
    openModal('manageOrderModal');
  }

  function actionMarkPaid(id) {
    const raw = findRawBooking(id);
    if (!raw) return;
    raw.paymentStatus = 'paid';
    if (raw.ncfType === 'E45') {
      raw.govChecklist = Object.assign({}, raw.govChecklist, { treasuryPaid: true });
    }
    if (raw.stage === 'pending_validation' || raw.stage === 'gov_review') {
      raw.stage = raw.encfNumber ? 'invoiced_dispatched' : 'payment_verified';
    }
    persistBooking(raw);
    openManageOrder(id);
    toast('✓ Pago confirmado y registrado en Tesorería');
  }

  async function actionIssueEncf(id) {
    const raw = findRawBooking(id);
    if (!raw) return;
    const typeCode = raw.ncfType || 'E31';

    let issued = null;
    if (API && API.issueEcf) {
      toast(`⏳ Emitiendo ${typeCode} y firmando XML…`);
      const apiRes = await API.issueEcf({
        bookingId: raw.id,
        booking: raw,
        typeCode,
        recipientEmail: (raw.govData && raw.govData.entityEmail) || null,
        adminPin: adminConfig.adminPin || '2026'
      });
      if (!apiRes.fallbackLocal) {
        if (!apiRes.ok || !apiRes.ecf) {
          toast(`Error emitiendo e-CF en servidor: ${apiRes.error || 'Verifica credenciales DGII'}`);
          return;
        }
        issued = apiRes.ecf;
      }
    }

    if (!issued) {
      issued = BILL.issueNextEncf(typeCode);
      adminConfig = BILL.loadAdminConfig();
    }

    raw.encfNumber = issued.encf;
    raw.encfSecurityCode = issued.securityCode;
    raw.encfExpires = issued.expires;
    raw.encfIssuedAt = issued.issuedAt;
    if (issued.trackId) raw.dgiiTrackId = issued.trackId;
    if (issued.dgiiStatus) raw.dgiiStatus = issued.dgiiStatus;
    if (issued.dgiiQrUrl) raw.dgiiQrUrl = issued.dgiiQrUrl;
    if (issued.dgiiMode) raw.dgiiMode = issued.dgiiMode;

    if (raw.stage === 'pending_validation' || raw.stage === 'payment_verified' || raw.stage === 'gov_review') {
      raw.stage = 'invoiced_dispatched';
    }
    if (typeCode === 'E45') {
      raw.govChecklist = Object.assign({}, raw.govChecklist, { encfFiled: true });
    }
    persistBooking(raw);
    if (document.getElementById('manageOrderModal')?.classList.contains('open')) {
      openManageOrder(id);
    }
    toast(`✓ Comprobante ${issued.encf} emitido${issued.dgiiStatus ? ' (' + issued.dgiiStatus + ')' : ''}`);
  }

  async function actionCheckDgiiStatus(id) {
    const raw = findRawBooking(id);
    if (!raw || !raw.dgiiTrackId) {
      toast('Esta orden aún no posee TrackId de envío a la DGII.');
      return;
    }
    if (!API || !API.queryDgiiStatus) return;
    toast('🔄 Consultando estado en DGII…');
    const res = await API.queryDgiiStatus(raw.dgiiTrackId, raw.id);
    if (res.unreachable) {
      toast('ℹ️ Backend Cloud Functions aún no desplegado para consultar DGII en vivo.');
      return;
    }
    if (!res.ok) {
      toast(res.error || 'No se pudo consultar el TrackId en DGII.');
      return;
    }
    if (res.estado) {
      raw.dgiiStatus = res.estado;
      persistBooking(raw);
      if (document.getElementById('manageOrderModal')?.classList.contains('open')) {
        openManageOrder(id);
      }
    }
    toast(`✓ Estado DGII (${raw.dgiiTrackId}): ${res.estado || 'Consultado'}`);
  }

  async function actionDownloadXml(id) {
    const raw = findRawBooking(id);
    if (!raw) return;
    const b = BILL.normalizeBooking(raw);
    const emisorDigits = String(adminConfig.rnc || '132050738').replace(/\D/g, '');
    const encfLabel = b.encfNumber || `${b.ncfType || 'E31'}_PROFORMA_${String(b.id).slice(-6)}`;
    const filename = `${emisorDigits}${encfLabel}.xml`;

    if (API && API.getXmlDownloadUrl && backendHealth && backendHealth.reachable && b.encfNumber) {
      try {
        const res = await fetch(API.getXmlDownloadUrl(b.encfNumber));
        if (res.ok) {
          const xmlText = await res.text();
          BILL.downloadTextFile(filename, xmlText, 'application/xml;charset=utf-8;');
          toast(`📥 XML firmado DGII descargado (${filename})`);
          return;
        }
      } catch (_) {}
    }

    const previewXml = BILL.buildEcfXmlPreview(b, adminConfig);
    BILL.downloadTextFile(filename, previewXml, 'application/xml;charset=utf-8;');
    toast(`📥 XML e-CF descargado (${filename})`);
  }

  async function actionNotifyGovEmail(id) {
    const raw = findRawBooking(id);
    if (!raw) return;
    const email = (raw.govData && raw.govData.entityEmail) || '';
    if (!API || !API.notifyGovDossier) return;
    toast('✉️ Enviando expediente gubernamental…');
    const res = await API.notifyGovDossier({
      bookingId: raw.id,
      recipientEmail: email || null,
      adminPin: adminConfig.adminPin || '2026'
    });
    if (res.unreachable) {
      toast('ℹ️ Despliega Cloud Functions con RESEND_API_KEY o SMTP para envío automático por correo.');
      return;
    }
    if (!res.ok) {
      toast(res.error || 'No se pudo enviar el correo del expediente.');
      return;
    }
    const emailSent = res.notifications && res.notifications.email && res.notifications.email.sent;
    toast(emailSent
      ? `✓ Expediente e-CF 45 enviado a ${email || 'correo institucional'}`
      : 'ℹ️ Correo no configurado todavía (agrega RESEND_API_KEY o SMTP en functions/.env)');
  }

  function actionSaveConduce(e, id) {
    e.preventDefault();
    const raw = findRawBooking(id);
    if (!raw) return;
    raw.conduce = {
      number: document.getElementById('moCondNum').value.trim(),
      signedDate: document.getElementById('moCondDate').value,
      receiverName: document.getElementById('moCondRec').value.trim(),
      notes: document.getElementById('moCondNotes').value.trim()
    };
    if (raw.ncfType === 'E45') {
      raw.govChecklist = Object.assign({}, raw.govChecklist, { conduceStamped: true });
    }
    if (raw.stage !== 'settled' && raw.stage !== 'cancelled') {
      raw.stage = raw.ncfType === 'E45' && raw.govChecklist?.encfFiled ? 'gov_filed' : 'conduce_signed';
    }
    persistBooking(raw);
    openManageOrder(id);
    toast('✓ Conduce de obra conformado • Listo para liquidar al propietario');
  }

  function actionReleaseEquipment(eqId) {
    const eq = (state.equipment || []).find((x) => String(x.id) === String(eqId));
    if (eq) {
      eq.busy = false;
      GM.saveState(state);
    }
    if (window.GM_FIREBASE && window.GM_FIREBASE.isReady && window.GM_FIREBASE.isReady()) {
      window.GM_FIREBASE.updateEquipmentStatus(eqId, false).catch(() => {});
    }
    toast('🔓 Equipo liberado como "Disponible" en el catálogo público');
  }

  async function actionCancelOrder(id) {
    const raw = findRawBooking(id);
    if (!raw) return;
    let cnEncf = '';
    let cnTrackId = '';

    if (API && API.voidOrder) {
      const apiRes = await API.voidOrder({
        bookingId: raw.id,
        adminPin: adminConfig.adminPin || '2026'
      });
      if (!apiRes.fallbackLocal) {
        if (!apiRes.ok) {
          toast(apiRes.error || 'Error anulando orden en servidor.');
          return;
        }
        cnEncf = (apiRes.creditNote && apiRes.creditNote.encf) || '';
        cnTrackId = (apiRes.creditNote && apiRes.creditNote.trackId) || '';
      }
    }

    if (!cnEncf) {
      const cn = BILL.issueNextEncf('E34');
      adminConfig = BILL.loadAdminConfig();
      cnEncf = cn.encf;
    }

    raw.stage = 'cancelled';
    raw.creditNoteEncf = cnEncf;
    if (cnTrackId) raw.creditNoteTrackId = cnTrackId;
    persistBooking(raw);
    closeModal('manageOrderModal');
    toast(`Orden anulada • Nota de Crédito emitida: ${cnEncf}`);
  }

  /* =========================================================
     MÓDULO 3: GESTIÓN GUBERNAMENTAL (e-CF 45 · LEY 340-06)
     ========================================================= */
  function renderGovModule() {
    const govOrders = getBookings().filter((b) => b.ncfType === 'E45' && b.stage !== 'cancelled');
    const totalGovBruto = govOrders.reduce((s, b) => s + b.total, 0);
    const totalIsr5 = govOrders.reduce((s, b) => s + (b.govIsrRetention || 0), 0);
    const totalNetSigef = govOrders.reduce((s, b) => s + (b.total - b.govIsrRetention - b.govItbisRetention), 0);

    return `
      <!-- BARRA DE CUMPLIMIENTO ESTATAL GREEN MILE RD -->
      <div class="kpi-grid">
        <div class="kpi-card info">
          <span>RPE Proveedor del Estado</span>
          <strong style="font-size:18px;">${esc(adminConfig.rpeNumber)}</strong>
          <small>DGII al día: ${esc(adminConfig.dgiiCertExpiry)} • TSS: ${esc(adminConfig.tssCertExpiry)}</small>
        </div>
        <div class="kpi-card">
          <span>Facturado al Estado (e-CF 45)</span>
          <strong>${BILL.fmtRD(totalGovBruto)}</strong>
          <small>${govOrders.length} expediente(s) públicos activos</small>
        </div>
        <div class="kpi-card accent">
          <span>Retención 5% ISR (Art. 309)</span>
          <strong>${BILL.fmtRD(totalIsr5)}</strong>
          <small>Crédito fiscal deducible en declaración IR-2</small>
        </div>
        <div class="kpi-card ok">
          <span>Neto a Librar Tesorería SIGEF</span>
          <strong>${BILL.fmtRD(totalNetSigef)}</strong>
          <small>Transferencia directa a cuenta registrada DIGECOG</small>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Expedientes de Contratación Pública (Comprobante Gubernamental e-CF 45)</h3>
            <p>Seguimiento de requisitos Ley 340-06, radicación en Cuentas por Pagar y cartas de retención 5% ISR</p>
          </div>
          <button type="button" class="btn btn-primary btn-sm" onclick="window.GM_ADMIN.openNewInvoiceModal('E45')">+ Nuevo Expediente Estatal E45</button>
        </div>
        <div class="panel-body">
          ${govOrders.length === 0 ? `
            <div class="empty-box">
              <strong>Sin expedientes gubernamentales (e-CF 45) todavía</strong>
              Cuando un Ministerio, Alcaldía o institución pública solicite alquiler con comprobante gubernamental, aparecerá aquí con su checklist completo Ley 340-06.
              <div style="margin-top:12px;">
                <button type="button" class="btn btn-navy" onclick="window.GM_ADMIN.openNewInvoiceModal('E45')">+ Registrar Expediente E45</button>
              </div>
            </div>
          ` : govOrders.map((b) => {
            const doneCount = BILL.GOV_CHECKLIST_ITEMS.filter((it) => Boolean(b.govChecklist[it.key])).length;
            const pct = Math.round((doneCount / BILL.GOV_CHECKLIST_ITEMS.length) * 100);
            const netSigef = b.total - b.govIsrRetention - b.govItbisRetention;
            const daysSince = b.govData.filedDate
              ? Math.max(0, Math.floor((Date.now() - new Date(b.govData.filedDate).getTime()) / 86400000))
              : 0;

            return `
              <div class="gov-card">
                <div class="gov-card-head">
                  <div>
                    <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin-bottom:5px;">
                      <span class="pill pill-info">🏛️ e-CF 45 Gubernamental</span>
                      <span class="pill pill-navy">${esc(b.encfNumber || 'e-CF 45 Pendiente')}</span>
                      <span class="pill ${b.paymentStatus === 'paid' ? 'pill-ok' : 'pill-warn'}">${b.paymentStatus === 'paid' ? '✓ Libramiento Cobrado' : `En trámite (${daysSince}d / ${b.govData.paymentTermsDays || 45}d)`}</span>
                    </div>
                    <strong style="font-size:16px; color:var(--navy); display:block;">${esc(b.renter)}</strong>
                    <div style="font-size:12px; color:var(--text-muted);">
                      RNC: <strong>${esc(b.renterRnc)}</strong> • OC/Contrato: <strong>${esc(b.govData.poNumber || 'Pendiente')}</strong> • CAP: <strong>${esc(b.govData.capNumber || 'N/A')}</strong> • Equipo: ${esc(b.title)}
                    </div>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-size:12px; color:var(--text-muted);">Bruto e-CF 45: <strong>${BILL.fmtRD(b.total)}</strong></div>
                    <div style="font-size:11.5px; color:#B45309;">Ret. 5% ISR: − ${BILL.fmtRD(b.govIsrRetention)}${b.govItbisRetention > 0 ? ' • Ret. ITBIS: − ' + BILL.fmtRD(b.govItbisRetention) : ''}</div>
                    <div style="font-size:15px; font-weight:900; color:#065F46;">Neto SIGEF: ${BILL.fmtRD(netSigef)}</div>
                  </div>
                </div>

                <div style="display:flex; justify-content:space-between; align-items:center; font-size:11.5px; font-weight:800; color:var(--navy); margin-bottom:5px;">
                  <span>Progreso Expediente Ley 340-06</span>
                  <span>${doneCount} / ${BILL.GOV_CHECKLIST_ITEMS.length} requisitos (${pct}%)</span>
                </div>
                <div class="progress-track"><div class="progress-fill" style="width:${pct}%;"></div></div>

                <div class="gov-checklist">
                  ${BILL.GOV_CHECKLIST_ITEMS.map((item) => {
                    const checked = Boolean(b.govChecklist[item.key]);
                    return `
                      <label class="gov-check-item ${checked ? 'checked' : ''}">
                        <input type="checkbox" ${checked ? 'checked' : ''} onchange="window.GM_ADMIN.toggleGovChecklist('${b.id}', '${item.key}', this.checked)" />
                        <span>${esc(item.label)}</span>
                      </label>
                    `;
                  }).join('')}
                </div>

                <!-- REGISTRO DE RADICACIÓN, LIBRAMIENTO Y CARTA ISR 5% -->
                <form onsubmit="window.GM_ADMIN.saveGovTracking(event, '${b.id}')" style="background:#F8FAFC; border:1px solid var(--border); border-radius:11px; padding:12px; margin-top:10px;">
                  <div class="f-grid" style="grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));">
                    <div class="f-field">
                      <label>Fecha Radicación Cuentas x Pagar</label>
                      <div class="f-box"><input type="date" id="gfDate_${b.id}" value="${esc(b.govData.filedDate || '')}" /></div>
                    </div>
                    <div class="f-field">
                      <label>No. Libramiento SIGEF</label>
                      <div class="f-box"><input type="text" id="gfLib_${b.id}" value="${esc(b.govData.libramientoNumber || '')}" placeholder="Ej. LIB-2026-88412" /></div>
                    </div>
                    <div class="f-field">
                      <label>No. Carta Retención 5% ISR</label>
                      <div class="f-box"><input type="text" id="gfIsr_${b.id}" value="${esc(b.govData.isrLetterNumber || '')}" placeholder="Ej. CERT-ISR-2026-044" /></div>
                    </div>
                  </div>
                  <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
                    <button type="submit" class="btn btn-navy btn-sm">💾 Actualizar Expediente</button>
                    ${!b.encfNumber ? `<button type="button" class="btn btn-primary btn-sm" onclick="window.GM_ADMIN.actionIssueEncf('${b.id}')">🧾 Emitir e-CF 45</button>` : ''}
                    ${b.dgiiTrackId ? `<button type="button" class="btn btn-ghost btn-sm" onclick="window.GM_ADMIN.actionCheckDgiiStatus('${b.id}')">🔄 Estado DGII</button>` : ''}
                    <button type="button" class="btn btn-ghost btn-sm" onclick="window.GM_ADMIN.actionDownloadXml('${b.id}')">📥 XML e-CF 45</button>
                    <button type="button" class="btn btn-ghost btn-sm" onclick="window.GM_ADMIN.actionNotifyGovEmail('${b.id}')">✉️ Enviar Correo (.gob.do)</button>
                    <button type="button" class="btn btn-ghost btn-sm" onclick="window.GM_ADMIN.openPrintDoc('${b.id}', 'gov')">🏛️ Carátula Radicación</button>
                    <button type="button" class="btn btn-ghost btn-sm" onclick="window.GM_ADMIN.openPrintDoc('${b.id}', 'invoice')">🧾 Factura e-CF 45</button>
                  </div>
                </form>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function toggleGovChecklist(bookingId, key, val) {
    const raw = findRawBooking(bookingId);
    if (!raw) return;
    raw.govChecklist = Object.assign({}, raw.govChecklist, { [key]: Boolean(val) });
    if (key === 'treasuryPaid' && val) {
      raw.paymentStatus = 'paid';
      raw.stage = raw.settlement?.status === 'paid' ? 'settled' : 'gov_filed';
    }
    if (key === 'encfFiled' && val && raw.stage === 'gov_review') {
      raw.stage = 'gov_filed';
    }
    persistBooking(raw);
    toast('✓ Checklist gubernamental actualizado');
  }

  function saveGovTracking(e, bookingId) {
    e.preventDefault();
    const raw = findRawBooking(bookingId);
    if (!raw) return;
    const filedDate = document.getElementById(`gfDate_${bookingId}`)?.value || '';
    const libramientoNumber = (document.getElementById(`gfLib_${bookingId}`)?.value || '').trim();
    const isrLetterNumber = (document.getElementById(`gfIsr_${bookingId}`)?.value || '').trim();

    raw.govData = Object.assign({}, raw.govData, { filedDate, libramientoNumber, isrLetterNumber });
    raw.govChecklist = Object.assign({}, raw.govChecklist);
    if (filedDate) {
      raw.govChecklist.encfFiled = true;
      if (raw.stage !== 'settled') raw.stage = 'gov_filed';
    }
    if (libramientoNumber) {
      raw.govChecklist.treasuryPaid = true;
      raw.paymentStatus = 'paid';
    }
    if (isrLetterNumber) {
      raw.govChecklist.isrLetterReceived = true;
    }
    persistBooking(raw);
    toast('✓ Datos de radicación SIGEF y retención 5% ISR guardados');
  }

  /* =========================================================
     MÓDULO 4: LIQUIDACIONES A PROPIETARIOS
     ========================================================= */
  function renderPayoutsModule() {
    const list = getBookings().filter((b) => b.stage !== 'cancelled');

    return `
      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Liquidación Centralizada a Propietarios de Maquinaria</h3>
            <p>Descuento automático de comisión Green Mile RD y cálculo fiscal según régimen del dueño (e-CF 31 Empresa vs. e-CF 41 Persona Física)</p>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" onclick="window.GM_ADMIN.export606()">📥 Exportar Formato 606 DGII</button>
        </div>
        <div class="panel-body">
          ${list.length === 0 ? `
            <div class="empty-box"><strong>No hay alquileres para liquidar</strong>Las órdenes registradas aparecerán aquí para calcular comisión y transferir al dueño del equipo.</div>
          ` : `
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Orden / Equipo</th>
                    <th>Propietario &amp; Régimen DGII</th>
                    <th>Conduce</th>
                    <th>Base Neta</th>
                    <th>Comisión GM</th>
                    <th>Retenciones</th>
                    <th>Neto a Transferir</th>
                    <th>Estado &amp; Pago</th>
                  </tr>
                </thead>
                <tbody>
                  ${list.map((b) => {
                    const fin = BILL.calculateFinancials({
                      baseAmount: b.netSubtotal,
                      ncfType: b.ncfType,
                      paymentMethod: b.paymentMethod,
                      commissionPct: b.settlement.commissionPct,
                      ownerRnc: b.ownerRnc,
                      config: adminConfig
                    });
                    const isPaid = b.settlement.status === 'paid';
                    return `
                      <tr>
                        <td>
                          <strong>#GM-${String(b.id).slice(-6)}</strong><br>
                          <span style="font-size:11px; color:var(--text-muted);">${esc(b.title)}</span>
                        </td>
                        <td>
                          <strong>${esc(b.owner)}</strong><br>
                          <span style="font-size:11px; color:var(--text-muted);">ID: ${esc(b.ownerRnc)} • ${fin.ownerIsIndividual ? 'Persona Física (e-CF 41)' : 'Persona Jurídica (e-CF 31)'}</span>
                        </td>
                        <td>
                          ${b.conduce.number
                            ? `<span class="pill pill-ok">✓ ${esc(b.conduce.number)}</span>`
                            : `<span class="pill pill-warn">Pendiente</span>`}
                        </td>
                        <td>${BILL.fmtRD(b.netSubtotal)}</td>
                        <td style="color:var(--orange); font-weight:800;">− ${BILL.fmtRD(fin.gmCommissionAmount)} <small>(${fin.gmCommissionPct}%)</small></td>
                        <td style="font-size:11px; color:#92400E;">
                          ${fin.ownerIsIndividual
                            ? `ISR 10%: −${BILL.fmtRD(fin.ownerIsrRetained)}<br>ITBIS 100%: ${BILL.fmtRD(fin.ownerItbisRetained)}`
                            : `+ITBIS 18%: ${BILL.fmtRD(fin.ownerItbisBilled)}<br>Ret. 30%: −${BILL.fmtRD(fin.ownerItbisRetained)}`}
                        </td>
                        <td><strong style="color:#065F46; font-size:14px;">${BILL.fmtRD(fin.ownerNetTransfer)}</strong></td>
                        <td>
                          ${isPaid ? `
                            <span class="pill pill-ok">✓ Liquidado</span><br>
                            <span style="font-size:10.5px; color:var(--text-muted);">Ref: ${esc(b.settlement.transferRef)}</span><br>
                            <button type="button" class="btn btn-ghost btn-sm" style="margin-top:4px;" onclick="window.GM_ADMIN.openPrintDoc('${b.id}', 'settlement')">🖨️ Comprobante</button>
                          ` : `
                            <button type="button" class="btn btn-success btn-sm" onclick="window.GM_ADMIN.openSettleOwnerModal('${b.id}')">💸 Registrar Liquidación</button>
                          `}
                        </td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      </div>
    `;
  }

  function openSettleOwnerModal(bookingId) {
    const raw = findRawBooking(bookingId);
    if (!raw) return;
    const b = BILL.normalizeBooking(raw);
    const fin = BILL.calculateFinancials({
      baseAmount: b.netSubtotal,
      ncfType: b.ncfType,
      paymentMethod: b.paymentMethod,
      commissionPct: b.settlement.commissionPct,
      ownerRnc: b.ownerRnc,
      config: adminConfig
    });

    document.getElementById('moTitle').textContent = `Liquidar a Propietario — #GM-${String(b.id).slice(-6)}`;
    document.getElementById('moSub').textContent = `${b.owner} (${fin.ownerIsIndividual ? 'Persona Física · e-CF 41' : 'Persona Jurídica · e-CF 31'})`;

    document.getElementById('manageOrderBody').innerHTML = `
      <div style="background:var(--navy-soft); border:1px solid #CBD5E1; border-radius:12px; padding:13px; font-size:12.5px; margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between;"><span>Base Servicio (Sin ITBIS):</span><strong>${BILL.fmtRD(b.netSubtotal)}</strong></div>
        <div style="display:flex; justify-content:space-between; color:var(--orange);"><span>(−) Comisión Green Mile RD (${fin.gmCommissionPct}%):</span><strong>− ${BILL.fmtRD(fin.gmCommissionAmount)}</strong></div>
        <div style="display:flex; justify-content:space-between;"><span>Subtotal Propietario:</span><strong>${BILL.fmtRD(fin.ownerGrossPayout)}</strong></div>
        ${fin.ownerIsIndividual ? `
          <div style="display:flex; justify-content:space-between; color:#92400E;"><span>(−) Retención 10% ISR (Persona Física):</span><span>− ${BILL.fmtRD(fin.ownerIsrRetained)}</span></div>
          <div style="display:flex; justify-content:space-between; color:#64748B;"><span>ITBIS 18% Auto-Retenido 100% (e-CF 41):</span><span>${BILL.fmtRD(fin.ownerItbisRetained)}</span></div>
        ` : `
          <div style="display:flex; justify-content:space-between;"><span>(+) ITBIS 18% Factura Propietario:</span><span>+ ${BILL.fmtRD(fin.ownerItbisBilled)}</span></div>
          <div style="display:flex; justify-content:space-between; color:#92400E;"><span>(−) Retención 30% ITBIS (Norma 02-05/07-07):</span><span>− ${BILL.fmtRD(fin.ownerItbisRetained)}</span></div>
        `}
        <div style="display:flex; justify-content:space-between; font-size:15px; font-weight:900; color:#065F46; border-top:1px solid #94A3B8; margin-top:6px; padding-top:6px;">
          <span>NETO A TRANSFERIR AL PROPIETARIO:</span><span>${BILL.fmtRD(fin.ownerNetTransfer)}</span>
        </div>
      </div>

      ${!b.conduce.number ? `<div style="background:#FFFBEB; border:1px solid #FCD34D; color:#92400E; padding:10px 12px; border-radius:10px; font-size:12px; margin-bottom:12px;">⚠️ Aviso: Esta orden aún no tiene un Conduce conformado registrado. Se recomienda validar recepción en obra antes de transferir.</div>` : ''}

      <form onsubmit="window.GM_ADMIN.confirmOwnerSettlement(event, '${b.id}')">
        <div class="f-grid">
          <div class="f-field">
            <label>NCF del Propietario (e-CF 31) o Emitir e-CF 41 *</label>
            <div class="f-box"><input type="text" id="stOwnerNcf" value="${esc(b.settlement.ownerNcf || (fin.ownerIsIndividual ? 'AUTO-E41' : ''))}" placeholder="${fin.ownerIsIndividual ? 'Dejar AUTO-E41 para emitir automático' : 'Ej. E310000000482'}" required /></div>
          </div>
          <div class="f-field">
            <label>No. Referencia Transferencia Bancaria *</label>
            <div class="f-box"><input type="text" id="stTransferRef" value="${esc(b.settlement.transferRef || '')}" placeholder="Ej. TRF-BPD-20269182" required /></div>
          </div>
          <div class="f-field">
            <label>Fecha de Transferencia</label>
            <div class="f-box"><input type="date" id="stPaidDate" value="${esc(b.settlement.paidDate || new Date().toISOString().split('T')[0])}" required /></div>
          </div>
          <div class="f-field">
            <label>Comisión Aplicada (%)</label>
            <div class="f-box"><input type="number" id="stCommPct" value="${fin.gmCommissionPct}" min="1" max="50" step="0.5" required /></div>
          </div>
        </div>
        <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:14px;">
          <button type="button" class="btn btn-ghost" onclick="window.GM_ADMIN.closeModal('manageOrderModal')">Cancelar</button>
          <button type="submit" class="btn btn-success">✓ Confirmar Transferencia y Cerrar Liquidación</button>
        </div>
      </form>
    `;
    openModal('manageOrderModal');
  }

  async function confirmOwnerSettlement(e, bookingId) {
    e.preventDefault();
    const raw = findRawBooking(bookingId);
    if (!raw) return;
    let ownerNcf = document.getElementById('stOwnerNcf').value.trim();
    if (ownerNcf.toUpperCase() === 'AUTO-E41') {
      let issued41 = null;
      if (API && API.issueEcf) {
        const res41 = await API.issueEcf({
          bookingId: raw.id,
          booking: raw,
          typeCode: 'E41',
          adminPin: adminConfig.adminPin || '2026'
        });
        if (!res41.fallbackLocal && res41.ok && res41.ecf) {
          issued41 = res41.ecf;
        }
      }
      if (!issued41) {
        issued41 = BILL.issueNextEncf('E41');
        adminConfig = BILL.loadAdminConfig();
      }
      ownerNcf = issued41.encf;
    }
    const commPct = Number(document.getElementById('stCommPct').value) || adminConfig.standardCommissionPct;
    const fin = BILL.calculateFinancials({
      baseAmount: raw.netSubtotal,
      ncfType: raw.ncfType || 'E31',
      paymentMethod: raw.paymentMethod || 'transfer',
      commissionPct: commPct,
      ownerRnc: raw.ownerRnc,
      config: adminConfig
    });

    raw.gmCommissionPct = commPct;
    raw.settlement = {
      status: 'paid',
      commissionPct: commPct,
      ownerGrossPayout: fin.ownerGrossPayout,
      ownerNetTransfer: fin.ownerNetTransfer,
      ownerFiscalDoc: fin.ownerFiscalDoc,
      ownerNcf,
      transferRef: document.getElementById('stTransferRef').value.trim(),
      paidDate: document.getElementById('stPaidDate').value
    };
    if (raw.paymentStatus === 'paid') {
      raw.stage = 'settled';
    }
    persistBooking(raw);
    if (API && API.notifyOwnerSettlement && backendHealth && backendHealth.reachable) {
      API.notifyOwnerSettlement({
        bookingId: raw.id,
        adminPin: adminConfig.adminPin || '2026'
      }).catch(() => {});
    }
    closeModal('manageOrderModal');
    openPrintDoc(bookingId, 'settlement');
    toast(`✓ Propietario liquidado • Soporte: ${ownerNcf}`);
  }

  /* =========================================================
     MÓDULO 5: TARJETAS (NORMA 06-23), e-NCF Y REPORTES DGII
     ========================================================= */
  function renderFiscalModule() {
    const active = getBookings().filter((b) => b.stage !== 'cancelled');
    const cardOrders = active.filter((b) => b.paymentMethod === 'card');

    const totalItbisFacturado = active.reduce((s, b) => s + (b.itbis || 0), 0);
    const totalCardRet2 = cardOrders.reduce((s, b) => s + (b.cardItbisRetention || 0), 0);
    const totalCardFees = cardOrders.reduce((s, b) => s + (b.cardGatewayFee || 0), 0);
    const totalGovItbisRet = active.reduce((s, b) => s + (b.govItbisRetention || 0), 0);
    const totalGovIsrRet = active.reduce((s, b) => s + (b.govIsrRetention || 0), 0);
    const itbisNetoEstimado = Math.max(0, totalItbisFacturado - totalCardRet2 - totalGovItbisRet);

    const seqs = Object.values(adminConfig.sequences || {});

    return `
      <!-- RESUMEN IT-1 E IR-17 -->
      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Resumen Tributario Mensual DGII (IT-1 · IR-17 · Formatos 607 / 606)</h3>
            <p>Exportación directa para declaración en Oficina Virtual DGII</p>
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button type="button" class="btn btn-primary btn-sm" onclick="window.GM_ADMIN.export607()">📥 Descargar 607 (Ventas CSV)</button>
            <button type="button" class="btn btn-navy btn-sm" onclick="window.GM_ADMIN.export606()">📥 Descargar 606 (Compras CSV)</button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="window.GM_ADMIN.exportFullJson()">💾 Backup JSON</button>
          </div>
        </div>
        <div class="panel-body">
          <div class="kpi-grid" style="margin-bottom:0;">
            <div class="kpi-card">
              <span>ITBIS Facturado (Ventas)</span>
              <strong>${BILL.fmtRD(totalItbisFacturado)}</strong>
              <small>Declarar en Formulario IT-1 (día 20)</small>
            </div>
            <div class="kpi-card ok">
              <span>Retención 2% Tarjetas (Norma 06-23)</span>
              <strong>${BILL.fmtRD(totalCardRet2)}</strong>
              <small>Pago a cuenta Casilla 27 Anexo A IT-1</small>
            </div>
            <div class="kpi-card info">
              <span>Retención 5% ISR Estado (Art. 309)</span>
              <strong>${BILL.fmtRD(totalGovIsrRet)}</strong>
              <small>Saldo a favor en Declaración Anual IR-2</small>
            </div>
            <div class="kpi-card accent">
              <span>ITBIS Neto Estimado antes Compras</span>
              <strong>${BILL.fmtRD(itbisNetoEstimado)}</strong>
              <small>Menos ITBIS pagado a propietarios (606)</small>
            </div>
          </div>
        </div>
      </div>

      <!-- CONCILIACIÓN DE TARJETAS -->
      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>💳 Conciliación de Pagos con Tarjeta (Adquirencia + Retención 2% DGII)</h3>
            <p>Comisión estimada ${adminConfig.cardFeePct}% + Retención ITBIS ${adminConfig.cardItbisRetentionPct}% (Norma 08-04 / 06-23)</p>
          </div>
          <span class="pill pill-ok">Total Comisiones Pasarela: ${BILL.fmtRD(totalCardFees)}</span>
        </div>
        <div class="panel-body">
          ${cardOrders.length === 0 ? `
            <div class="empty-box"><strong>Sin transacciones con tarjeta registradas</strong>Cuando un contratista pague con Visa, Mastercard o AMEX, el detalle de conciliación bancaria y retención del 2% aparecerá aquí.</div>
          ` : `
            <div class="table-wrap">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Orden / e-NCF</th>
                    <th>Tarjeta / Autorización</th>
                    <th>Monto Bruto</th>
                    <th>Comisión (${adminConfig.cardFeePct}%)</th>
                    <th>Ret. 2% ITBIS (Casilla 27)</th>
                    <th>Neto Depositado Banco</th>
                  </tr>
                </thead>
                <tbody>
                  ${cardOrders.map((b) => {
                    const netDep = b.total - b.cardGatewayFee - b.cardItbisRetention;
                    return `
                      <tr>
                        <td><strong>#GM-${String(b.id).slice(-6)}</strong><br><span style="font-size:11px; font-family:monospace;">${esc(b.encfNumber || 'Pend.')}</span></td>
                        <td>
                          <strong>${esc(b.cardInfo?.brand || 'Tarjeta')} •••• ${esc(b.cardInfo?.last4 || '****')}</strong><br>
                          <span style="font-size:11px; color:var(--text-muted);">Aut: ${esc(b.cardInfo?.authCode || 'N/A')} • ${esc(b.cardInfo?.holder || b.renter)}</span>
                        </td>
                        <td><strong>${BILL.fmtRD(b.total)}</strong></td>
                        <td style="color:var(--danger);">− ${BILL.fmtRD(b.cardGatewayFee)}</td>
                        <td style="color:var(--info); font-weight:700;">− ${BILL.fmtRD(b.cardItbisRetention)}</td>
                        <td style="color:var(--success); font-weight:900;">${BILL.fmtRD(netDep)}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      </div>

      <!-- CONTROL DE SECUENCIAS e-NCF -->
      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Control de Secuencias e-NCF Autorizadas por DGII</h3>
            <p>Numeración oficial de 13 caracteres (E + 2 dígitos tipo + 10 dígitos secuenciales)</p>
          </div>
        </div>
        <div class="panel-body">
          <div class="table-wrap">
            <table class="data-table">
              <thead>
                <tr>
                  <th>Tipo e-CF</th>
                  <th>Descripción</th>
                  <th>Próximo e-NCF</th>
                  <th>Disponibles</th>
                  <th>Vencimiento</th>
                  <th>Ajuste</th>
                </tr>
              </thead>
              <tbody>
                ${seqs.map((s) => {
                  const avail = Math.max(0, (Number(s.max) || 0) - (Number(s.next) || 1) + 1);
                  const pct = Math.min(100, Math.round(((Number(s.next) - 1) / Math.max(1, Number(s.max))) * 100));
                  return `
                    <tr>
                      <td><span class="pill pill-navy">${esc(s.prefix)}</span></td>
                      <td><strong>${esc(s.label)}</strong></td>
                      <td style="font-family:monospace; font-weight:800; color:var(--orange);">${esc(BILL.formatEncf(s.prefix, s.next))}</td>
                      <td style="min-width:140px;">
                        <strong style="font-size:12px;">${avail.toLocaleString('en-US')} restantes</strong>
                        <div class="progress-track" style="margin-top:4px;"><div class="progress-fill" style="width:${pct}%;"></div></div>
                      </td>
                      <td>${esc(s.expires)}</td>
                      <td><button type="button" class="btn btn-ghost btn-sm" onclick="window.GM_ADMIN.replenishSequence('${esc(s.prefix)}')">+ 500 Secuencias</button></td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  function replenishSequence(prefix) {
    if (!adminConfig.sequences[prefix]) return;
    adminConfig.sequences[prefix].max = (Number(adminConfig.sequences[prefix].max) || 500) + 500;
    BILL.saveAdminConfigLocal(adminConfig);
    renderSection();
    toast(`✓ Rango autorizado para ${prefix} ampliado (+500 secuencias)`);
  }

  /* =========================================================
     MÓDULO 6: PROCESO ADMINISTRATIVO COMPLETO (MANUAL SOP)
     ========================================================= */
  function renderSopModule() {
    return `
      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Manual del Proceso Administrativo Integral — Green Mile Construction RD</h3>
            <p>Procedimiento Operativo Estándar (SOP) para operaciones privadas, cobro con tarjeta, contratación estatal (e-CF 45) y cumplimiento DGII</p>
          </div>
          <button type="button" class="btn btn-navy btn-sm" onclick="window.print()">🖨️ Imprimir Manual</button>
        </div>
        <div class="panel-body">
          <div class="sop-grid">
            <div class="sop-card">
              <h4>1. Ciclo Operativo Estándar (8 Etapas)</h4>
              <ol>
                <li><strong>Alta de Propietario Verificado:</strong> Todo dueño de flota valida RNC/Cédula en DGII, firma acuerdo de intermediación (no bypass) y registra cuenta bancaria para liquidaciones.</li>
                <li><strong>Cotización y Reserva Digital:</strong> El contratista elige fechas en calendario, valida RNC en vivo, elige comprobante (<code>e-CF 31 / 32 / 45 / 44</code>) y firma contrato táctil.</li>
                <li><strong>Validación de Cobro u Orden de Compra:</strong> Tarjeta autoriza al instante; Transferencia se verifica en banca en línea; Estado (E45) pasa por revisión de OC + CAP.</li>
                <li><strong>Emisión de e-NCF (Ley 32-23):</strong> Emisión de XML firmado + Representación Impresa con QR verificable en DGII.</li>
                <li><strong>Despacho Logístico (Lowboy):</strong> Coordinación con propietario y operador; salida autorizada únicamente tras validación financiera o de OC.</li>
                <li><strong>Conduce de Recepción Conformada:</strong> Firma obligatoria del ingeniero en obra (y sello institucional si es obra pública) con horómetro y fecha.</li>
                <li><strong>Cobro Final / Libramiento:</strong> Conciliación en cuenta corporativa (o radicación en Tesorería Nacional para E45).</li>
                <li><strong>Liquidación al Propietario:</strong> Transferencia neta descontando comisión Green Mile RD (12% estándar / 15% estatal) + soporte fiscal (e-CF 31 del propietario o e-CF 41 si es Persona Física).</li>
              </ol>
            </div>

            <div class="sop-card">
              <h4>2. Protocolo de Cobro con Tarjeta en RD</h4>
              <ol>
                <li><strong>Pasarela Adquirente en Producción:</strong> Conectar el backend de Green Mile RD a <strong>Azul (Banco Popular)</strong>, <strong>CardNET</strong> o <strong>Visanet Dominicana</strong> con autenticación obligatoria <strong>3D Secure 2.0</strong> para minimizar contracargos en tickets altos de maquinaria.</li>
                <li><strong>Seguridad PCI-DSS:</strong> La plataforma jamás almacena el número completo de tarjeta ni el CVV; únicamente guarda token/autorización (<code>AUTH</code>), marca y últimos 4 dígitos.</li>
                <li><strong>Retención 2% ITBIS (Norma 08-04 / 06-23):</strong> La procesadora retiene automáticamente el <strong>2% del monto total facturado</strong> y lo deposita a la DGII a nombre de Green Mile RD. Contabilidad lo descuenta como <strong>pago a cuenta en Casilla 27 del Anexo A del IT-1</strong>.</li>
                <li><strong>Comisión Bancaria (~3.0%–3.5%):</strong> Se absorbe dentro de la comisión de intermediación de Green Mile RD (12%) para no trasladar recargos prohibidos al tarjetahabiente.</li>
                <li><strong>Defensa Anti-Contracargos:</strong> El expediente digital (Contrato firmado + validación RNC + Conduce firmado con foto de entrega en obra + autorización 3DS) constituye evidencia completa ante cualquier reclamo bancario.</li>
              </ol>
            </div>

            <div class="sop-card" style="background:#EFF6FF; border-color:#93C5FD;">
              <h4>3. Proceso Completo para Comprobante Gubernamental (e-CF 45 / B15)</h4>
              <ol>
                <li><strong>Requisitos Previos de Green Mile RD (Ley 340-06):</strong> Mantener siempre vigentes: (a) <strong>RPE Activo</strong> en DGCP con rubro UNSPSC 72141700 (alquiler maquinaria), (b) <strong>Certificación DGII al día</strong>, (c) <strong>Certificación TSS al día</strong>, y (d) <strong>Cuenta Bancaria registrada en DIGECOG / SIGEF</strong>.</li>
                <li><strong>Verificación de la Entidad (Norma 05-19):</strong> Confirmar que el RNC estatal (ej. <code>4-01-...</code>) corresponde a un ente público no comercial (Ministerios, Alcaldías, MOPC, INAPA, CAASD). Si es empresa estatal con actividad comercial (ej. bancos estatales), corresponde <code>e-CF 31</code>.</li>
                <li><strong>Orden de Compra + CAP Obligatorios:</strong> No despachar maquinaria sin <strong>Orden de Compra (OC) o Contrato DGCP</strong> firmado y preferiblemente <strong>Certificación de Apropiación Presupuestaria (CAP)</strong> que asegure fondos asignados en SIGEF.</li>
                <li><strong>Facturación e-CF 45 y Retención 5% ISR (Art. 309):</strong> Se factura con ITBIS 18% transparentado. Al momento del pago, el Estado retiene <strong>5% de ISR sobre el subtotal neto</strong> (sin ITBIS) y entrega Carta de Retención para acreditarlo en el IR-2 anual.</li>
                <li><strong>Radicación en Cuentas por Pagar:</strong> Depositar expediente físico/digital usando la <em>Carátula de Radicación</em> del módulo E45: Factura e-CF 45 + OC + Conduce/Acta de Recepción sellada + Certificaciones RPE/DGII/TSS vigentes.</li>
                <li><strong>Política de Flujo de Caja con Propietarios:</strong> Dado que Tesorería Nacional paga entre 30 y 60 días vía libramiento SIGEF, en contratos estatales se aplica <strong>comisión diferenciada (15%)</strong> y acuerdo con el propietario de <strong>liquidación contra libramiento estatal</strong> (o adelanto parcial mediante línea de capital de trabajo).</li>
              </ol>
            </div>

            <div class="sop-card">
              <h4>4. Comprobante Régimen Especial (e-CF 44) y Liquidación Flota</h4>
              <ul>
                <li><strong>Cuándo usar e-CF 44 (ITBIS 0%):</strong> Proyectos turísticos acogidos a <strong>Ley 158-01 (CONFOTUR)</strong> en Punta Cana/Bávaro/Samaná, empresas de <strong>Zona Franca</strong> u organismos internacionales. Es obligatorio archivar copia de la <strong>Resolución / Carnet de Exención DGII</strong> vigente.</li>
                <li><strong>Liquidación a Propietario Empresa (RNC 9 dígitos):</strong> El dueño emite su factura <code>e-CF 31</code> a Green Mile RD por el valor neto menos nuestra comisión. Si aplica Norma 02-05/07-07, Green Mile retiene el 30% del ITBIS y entrega carta de retención.</li>
                <li><strong>Liquidación a Propietario Persona Física (Cédula 11 dígitos sin NCF):</strong> Green Mile RD emite un <strong>Comprobante de Compras Electrónico (e-CF 41)</strong>, retiene el <strong>100% del ITBIS</strong> y el <strong>10% de ISR</strong> (servicios/alquiler persona física) y lo reporta en el Formato 606 e IR-17.</li>
              </ul>
            </div>
          </div>

          <div class="sop-callout">
            <strong>📅 Calendario Fiscal Mensual Obligatorio de Green Mile RD (DGII &amp; TSS):</strong>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:8px; margin-top:8px;">
              <div><strong>• Primeros 3 días hábiles:</strong> Pago nómina / seguridad social (TSS) para mantener certificación estatal al día.</div>
              <div><strong>• Día 10 de cada mes:</strong> Declaración y pago <strong>IR-17</strong> (retenciones ISR aplicadas a propietarios Persona Física en e-CF 41).</div>
              <div><strong>• Día 15 de cada mes:</strong> Envío de Formatos <strong>606</strong> (Compras), <strong>607</strong> (Ventas, si aplica contingencia/resumen) y <strong>608</strong> (Anulados).</div>
              <div><strong>• Día 20 de cada mes:</strong> Declaración jurada mensual de ITBIS (<strong>IT-1</strong>), aplicando crédito Casilla 27 (Retención 2% Tarjetas Norma 06-23).</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /* =========================================================
     MÓDULO 7: CONFIGURACIÓN CORPORATIVA
     ========================================================= */
  function renderConfigModule() {
    const c = adminConfig;
    const banks = c.banks || [];
    const h = backendHealth;
    const isReachable = Boolean(h && h.reachable);
    const currentApiUrl = (API && API.getApiBaseUrl) ? API.getApiBaseUrl() : '';

    const payProvider = isReachable ? String(h.payment?.configuredProvider || 'sandbox').toUpperCase() : 'SANDBOX LOCAL';
    const payLive = Boolean(isReachable && h.payment?.activeMode === 'live');
    const dgiiMode = isReachable ? String(h.dgii?.activeMode || 'sandbox') : 'sandbox';
    const dgiiEnv = isReachable ? String(h.dgii?.dgiiEnv || 'testecf').toUpperCase() : 'LOCAL';
    const dgiiLive = Boolean(isReachable && dgiiMode !== 'sandbox');
    const emailReady = Boolean(isReachable && h.notifications?.emailReady);
    const waReady = Boolean(isReachable && h.notifications?.whatsappReady);

    return `
      <!-- PANEL DE INTEGRACIONES BACKEND & API KEYS EN VIVO -->
      <div class="panel" id="backendIntegrationsPanel">
        <div class="panel-head">
          <div>
            <h3>🔌 Integraciones Backend &amp; API Keys (Estado en Vivo)</h3>
            <p>Diagnóstico seguro de pasarelas de tarjetas RD (Azul / CardNET / Visanet / Stripe), DGII e-CF y notificaciones</p>
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span class="pill ${isReachable ? 'pill-ok' : 'pill-warn'}">
              ${backendChecking ? '⏳ Verificando…' : (isReachable ? '● Cloud Functions Conectado' : '● Modo Sandbox Local')}
            </span>
            <button type="button" class="btn btn-navy btn-sm" onclick="window.GM_ADMIN.refreshBackendHealth(false)">🔄 Probar Conexión Backend</button>
          </div>
        </div>
        <div class="panel-body">
          <div class="kpi-grid" style="margin-bottom:14px;">
            <div class="kpi-card ${payLive ? 'ok' : ''}">
              <span>Pasarela de Tarjetas RD</span>
              <strong style="font-size:17px;">${esc(payProvider)}</strong>
              <small>${payLive ? `✓ Credenciales activas (${esc(h.payment?.environment || 'live')})` : 'Listo para recibir llaves de Azul, CardNET, Visanet o Stripe'}</small>
            </div>
            <div class="kpi-card ${dgiiLive ? 'ok' : 'info'}">
              <span>Facturación DGII e-CF</span>
              <strong style="font-size:17px;">${dgiiLive ? esc(dgiiMode === 'direct_dgii' ? 'DGII DIRECTO (.p12)' : 'API PROVEEDOR e-CF') : 'SANDBOX e-CF'}</strong>
              <small>${dgiiLive ? `✓ Ambiente ${esc(dgiiEnv)} • RNC ${esc(h.dgii?.emisorRnc || c.rnc)}` : 'Listo para Certificado .p12 (INDOTEL/Viafirma) o API Proveedor'}</small>
            </div>
            <div class="kpi-card ${emailReady ? 'ok' : ''}">
              <span>Correo Automático (Facturas / E45)</span>
              <strong style="font-size:17px;">${emailReady ? esc(String(h.notifications?.emailProvider || 'ACTIVO').toUpperCase()) : 'PENDIENTE'}</strong>
              <small>${emailReady ? '✓ Envío automático de XML + PDF activo' : 'Configura RESEND_API_KEY o SMTP en functions/.env'}</small>
            </div>
            <div class="kpi-card ${waReady ? 'ok' : ''}">
              <span>WhatsApp Business Cloud</span>
              <strong style="font-size:17px;">${waReady ? 'CONECTADO' : 'PENDIENTE'}</strong>
              <small>${waReady ? '✓ Alertas de cobro y liquidaciones activas' : 'Configura WHATSAPP_TOKEN y PHONE_NUMBER_ID'}</small>
            </div>
          </div>

          <form onsubmit="window.GM_ADMIN.saveBackendUrl(event)" style="background:#F8FAFC; border:1px solid var(--border); border-radius:12px; padding:12px 14px;">
            <div class="f-grid" style="grid-template-columns:1fr auto; align-items:end;">
              <div class="f-field">
                <label for="cfgApiBaseUrl">URL del Backend Cloud Functions v2 (dejar vacío para auto-detección)</label>
                <div class="f-box">
                  <input type="url" id="cfgApiBaseUrl" value="${esc(c.apiBaseUrl || '')}" placeholder="${esc(currentApiUrl)}" />
                </div>
              </div>
              <div style="display:flex; gap:8px;">
                <button type="submit" class="btn btn-primary btn-sm" style="height:40px;">💾 Guardar URL</button>
              </div>
            </div>
            <div style="margin-top:8px; font-size:11.5px; color:#475569; line-height:1.45;">
              🔐 <strong>Seguridad PCI-DSS y DGII:</strong> Todas las llaves secretas (<code>AZUL_AUTH1/2</code>, <code>CARDNET_PRIVATE_KEY</code>, <code>VISANET_API_SECRET</code>, <code>STRIPE_SECRET_KEY</code>, certificado <code>.p12</code> y claves SMTP/WhatsApp) residen únicamente en el servidor (<code>functions/.env</code> / Google Secret Manager) y <strong>jamás</strong> se exponen en el navegador. Ejecuta <code>./scripts/configure-secrets.sh</code> al cargar tus llaves.
            </div>
          </form>
        </div>
      </div>

      <div class="panel">
        <div class="panel-head">
          <div>
            <h3>Configuración Corporativa, Cumplimiento y Reglas Financieras</h3>
            <p>Estos datos se reflejan automáticamente en contratos, facturas e-CF, cuentas de transferencia y carátulas estatales</p>
          </div>
        </div>
        <div class="panel-body">
          <form onsubmit="window.GM_ADMIN.saveConfigForm(event)">
            <div class="f-grid">
              <div class="f-field">
                <label>Razón Social Legal</label>
                <div class="f-box"><input type="text" id="cfgCompanyName" value="${esc(c.companyName)}" required /></div>
              </div>
              <div class="f-field">
                <label>RNC Emisor (DGII)</label>
                <div class="f-box"><input type="text" id="cfgRnc" value="${esc(c.rnc)}" required /></div>
              </div>
              <div class="f-field full">
                <label>Dirección Fiscal</label>
                <div class="f-box"><input type="text" id="cfgAddress" value="${esc(c.address)}" required /></div>
              </div>
              <div class="f-field">
                <label>Correo Oficial de Facturación</label>
                <div class="f-box"><input type="email" id="cfgEmail" value="${esc(c.email)}" required /></div>
              </div>
              <div class="f-field">
                <label>Teléfono / WhatsApp Oficial</label>
                <div class="f-box"><input type="text" id="cfgPhone" value="${esc(c.phone)}" required /></div>
              </div>
              <div class="f-field">
                <label>Registro Proveedor del Estado (RPE · DGCP)</label>
                <div class="f-box"><input type="text" id="cfgRpe" value="${esc(c.rpeNumber)}" required /></div>
              </div>
              <div class="f-field">
                <label>PIN de Acceso al Centro Administrativo</label>
                <div class="f-box"><input type="text" id="cfgPin" value="${esc(c.adminPin || '2026')}" required /></div>
              </div>
              <div class="f-field">
                <label>Vigencia Certificación DGII (Al día)</label>
                <div class="f-box"><input type="date" id="cfgDgiiExp" value="${esc(c.dgiiCertExpiry)}" /></div>
              </div>
              <div class="f-field">
                <label>Vigencia Certificación TSS (Al día)</label>
                <div class="f-box"><input type="date" id="cfgTssExp" value="${esc(c.tssCertExpiry)}" /></div>
              </div>
              <div class="f-field">
                <label>Comisión Estándar Green Mile (%)</label>
                <div class="f-box"><input type="number" step="0.5" id="cfgStdComm" value="${c.standardCommissionPct}" required /></div>
              </div>
              <div class="f-field">
                <label>Comisión Gestión Gubernamental E45 (%)</label>
                <div class="f-box"><input type="number" step="0.5" id="cfgGovComm" value="${c.govCommissionPct}" required /></div>
              </div>
              <div class="f-field">
                <label>Comisión Pasarela Tarjeta (%)</label>
                <div class="f-box"><input type="number" step="0.05" id="cfgCardFee" value="${c.cardFeePct}" required /></div>
              </div>
              <div class="f-field">
                <label>Retención ITBIS Tarjetas Norma 06-23 (%)</label>
                <div class="f-box"><input type="number" step="0.1" id="cfgCardRet" value="${c.cardItbisRetentionPct}" required /></div>
              </div>

              <div class="f-field full" style="margin-top:8px;">
                <label>Cuentas Bancarias Corporativas (Popular / Banreservas SIGEF / BHD)</label>
                <div style="display:flex; flex-direction:column; gap:8px;">
                  ${[0, 1, 2].map((i) => {
                    const bk = banks[i] || { bank: '', type: 'Cuenta Corriente RD$', number: '' };
                    return `
                      <div class="f-grid" style="grid-template-columns:1.2fr 1.2fr 1fr; gap:8px;">
                        <div class="f-box"><input type="text" id="cfgBkName_${i}" value="${esc(bk.bank)}" placeholder="Banco" /></div>
                        <div class="f-box"><input type="text" id="cfgBkType_${i}" value="${esc(bk.type)}" placeholder="Tipo cuenta" /></div>
                        <div class="f-box"><input type="text" id="cfgBkNum_${i}" value="${esc(bk.number)}" placeholder="No. de cuenta" /></div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            </div>
            <div style="margin-top:16px; display:flex; justify-content:flex-end;">
              <button type="submit" class="btn btn-primary">💾 Guardar Configuración Corporativa</button>
            </div>
          </form>
        </div>
      </div>
    `;
  }

  function saveConfigForm(e) {
    e.preventDefault();
    const nextBanks = [];
    for (let i = 0; i < 3; i++) {
      const bank = (document.getElementById(`cfgBkName_${i}`)?.value || '').trim();
      const type = (document.getElementById(`cfgBkType_${i}`)?.value || '').trim();
      const number = (document.getElementById(`cfgBkNum_${i}`)?.value || '').trim();
      if (bank && number) {
        nextBanks.push({ bank, type: type || 'Cuenta Corriente RD$', number, sigefPrimary: i <= 1 });
      }
    }

    adminConfig = Object.assign({}, adminConfig, {
      companyName: document.getElementById('cfgCompanyName').value.trim(),
      rnc: document.getElementById('cfgRnc').value.trim(),
      address: document.getElementById('cfgAddress').value.trim(),
      email: document.getElementById('cfgEmail').value.trim(),
      phone: document.getElementById('cfgPhone').value.trim(),
      rpeNumber: document.getElementById('cfgRpe').value.trim(),
      adminPin: document.getElementById('cfgPin').value.trim() || '2026',
      dgiiCertExpiry: document.getElementById('cfgDgiiExp').value,
      tssCertExpiry: document.getElementById('cfgTssExp').value,
      standardCommissionPct: Number(document.getElementById('cfgStdComm').value) || 12,
      govCommissionPct: Number(document.getElementById('cfgGovComm').value) || 15,
      cardFeePct: Number(document.getElementById('cfgCardFee').value) || 3.25,
      cardItbisRetentionPct: Number(document.getElementById('cfgCardRet').value) || 2.0,
      banks: nextBanks.length ? nextBanks : adminConfig.banks
    });

    BILL.saveAdminConfigLocal(adminConfig);
    renderSection();
    toast('✓ Configuración corporativa guardada y sincronizada');
  }

  /* =========================================================
     MODAL CREAR NUEVA FACTURA / ORDEN MANUAL
     ========================================================= */
  function openNewInvoiceModal(presetNcf = 'E31') {
    const sel = document.getElementById('mEqId');
    if (sel) {
      sel.innerHTML = (state.equipment || []).map((eq) =>
        `<option value="${eq.id}">${esc(eq.title)} — ${esc(eq.city)} (${BILL.fmtRD(eq.priceDay)}/día)</option>`
      ).join('');
    }
    const form = document.getElementById('manualInvoiceForm');
    if (form) form.reset();

    document.getElementById('mStartDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('mQty').value = '5';
    document.getElementById('mNcfType').value = presetNcf;
    onManualEqChange();
    onManualNcfChange();

    if (!manualDgiiCtrl && window.GM_DGII && window.GM_DGII.attachPair) {
      manualDgiiCtrl = window.GM_DGII.attachPair({
        rncInputId: 'mRnc',
        nameInputId: 'mRenter',
        statusBoxId: 'mDgiiStatus',
        suggestionsBoxId: 'mDgiiSuggestions',
        onRecordChange: (rec) => {
          if (rec && rec.found) {
            const det = BILL.detectGovEntity(rec.digits, rec.razonSocial);
            if (det.isLikelyGov && document.getElementById('mNcfType').value !== 'E45') {
              document.getElementById('mNcfType').value = 'E45';
              onManualNcfChange();
              toast('🏛️ Entidad estatal detectada en DGII — cambiado a e-CF 45');
            }
          }
        }
      });
    }
    openModal('newInvoiceModal');
  }

  function onManualEqChange() {
    const id = document.getElementById('mEqId')?.value;
    const eq = (state.equipment || []).find((x) => String(x.id) === String(id));
    const qty = Math.max(1, Number(document.getElementById('mQty')?.value) || 5);
    if (eq) {
      document.getElementById('mNetSubtotal').value = (eq.priceDay * qty) + (eq.transportCost || 0);
    }
    updateManualPreview();
  }

  function onManualNcfChange() {
    const code = document.getElementById('mNcfType')?.value || 'E31';
    const isGov = code === 'E45';
    const isExempt = code === 'E44';
    document.getElementById('mGovBox').style.display = isGov ? 'block' : 'none';
    document.getElementById('mExemptBox').style.display = isExempt ? 'block' : 'none';
    document.getElementById('mCommPct').value = isGov ? adminConfig.govCommissionPct : adminConfig.standardCommissionPct;
    if (isGov) {
      document.getElementById('mPayMethod').value = 'gov_po';
    } else if (document.getElementById('mPayMethod').value === 'gov_po') {
      document.getElementById('mPayMethod').value = 'transfer';
    }
    updateManualPreview();
  }

  function updateManualPreview() {
    const net = Number(document.getElementById('mNetSubtotal')?.value) || 0;
    const ncfType = document.getElementById('mNcfType')?.value || 'E31';
    const paymentMethod = document.getElementById('mPayMethod')?.value || 'transfer';
    const commPct = Number(document.getElementById('mCommPct')?.value) || adminConfig.standardCommissionPct;
    const govApplyItbisRet = Boolean(document.getElementById('mGovItbisRet')?.checked);
    const id = document.getElementById('mEqId')?.value;
    const eq = (state.equipment || []).find((x) => String(x.id) === String(id));

    const fin = BILL.calculateFinancials({
      baseAmount: net,
      ncfType,
      paymentMethod,
      govApplyItbisRet,
      commissionPct: commPct,
      ownerRnc: eq?.rnc || '',
      config: adminConfig
    });

    const box = document.getElementById('manualCalcPreview');
    if (!box) return;
    box.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:3px;"><span>Subtotal Neto:</span><strong>${BILL.fmtRD(fin.netSubtotal)}</strong></div>
      <div style="display:flex; justify-content:space-between; margin-bottom:3px;"><span>${fin.ncfMeta.isExempt ? 'ITBIS 0% (Exento e-CF 44)' : `ITBIS 18% (${fin.ncfType})`}:</span><strong>${BILL.fmtRD(fin.itbis)}</strong></div>
      <div style="display:flex; justify-content:space-between; font-size:14.5px; color:var(--navy); font-weight:900; border-top:1px solid #CBD5E1; padding-top:5px; margin-top:4px;">
        <span>Total Factura ${fin.ncfType}:</span><span>${BILL.fmtRD(fin.total)}</span>
      </div>
      ${fin.ncfMeta.isGov ? `<div style="margin-top:5px; font-size:11.5px; color:#1E40AF;">Ret. 5% ISR Estado: −${BILL.fmtRD(fin.govIsrRetention)} ${fin.govItbisRetention > 0 ? '• Ret. ITBIS: −' + BILL.fmtRD(fin.govItbisRetention) : ''} → <strong>Neto Libramiento SIGEF: ${BILL.fmtRD(fin.expectedTreasuryNet)}</strong></div>` : ''}
      ${paymentMethod === 'card' ? `<div style="margin-top:5px; font-size:11.5px; color:#065F46;">Comisión Tarjeta: −${BILL.fmtRD(fin.cardGatewayFee)} • Ret. 2% Norma 06-23: −${BILL.fmtRD(fin.cardItbisRetention)} → <strong>Neto Banco: ${BILL.fmtRD(fin.expectedBankDeposit)}</strong></div>` : ''}
      <div style="margin-top:5px; font-size:11.5px; color:var(--orange);">Comisión Green Mile (${fin.gmCommissionPct}%): <strong>${BILL.fmtRD(fin.gmCommissionAmount)}</strong> • Neto Propietario: <strong>${BILL.fmtRD(fin.ownerNetTransfer)}</strong></div>
    `;
  }

  async function submitManualInvoice(e) {
    e.preventDefault();
    const ncfType = document.getElementById('mNcfType').value;
    const ncfMeta = BILL.NCF_TYPES[ncfType] || BILL.NCF_TYPES.E31;
    const paymentMethod = document.getElementById('mPayMethod').value;
    const eqId = document.getElementById('mEqId').value;
    const eq = (state.equipment || []).find((x) => String(x.id) === String(eqId)) || {
      id: Date.now(), title: 'Maquinaria Pesada', city: 'Santo Domingo', owner: 'Flota Green Mile RD', rnc: adminConfig.rnc, phone: adminConfig.phone
    };

    if (manualDgiiCtrl) {
      const check = await manualDgiiCtrl.validateBeforeSubmit({
        requireActiveForNcf: ncfMeta.requiresActiveRnc,
        ncfCode: ncfType
      });
      if (!check.valid) {
        toast(check.error);
        return;
      }
    }

    const net = Number(document.getElementById('mNetSubtotal').value) || 0;
    const qty = Math.max(1, Number(document.getElementById('mQty').value) || 1);
    const startDate = document.getElementById('mStartDate').value;
    const endDt = new Date(new Date(startDate).getTime() + Math.max(0, qty - 1) * 86400000);
    const endDate = endDt.toISOString().split('T')[0];
    const commPct = Number(document.getElementById('mCommPct').value) || adminConfig.standardCommissionPct;
    const govApplyItbisRet = Boolean(document.getElementById('mGovItbisRet')?.checked);
    const issueNow = Boolean(document.getElementById('mIssueNow')?.checked);

    const fin = BILL.calculateFinancials({
      baseAmount: net,
      ncfType,
      paymentMethod,
      govApplyItbisRet,
      commissionPct: commPct,
      ownerRnc: eq.rnc,
      config: adminConfig
    });

    const poNumber = (document.getElementById('mGovPo')?.value || '').trim();
    const capNumber = (document.getElementById('mGovCap')?.value || '').trim();
    const entityEmail = (document.getElementById('mGovEmail')?.value || '').trim();
    const paymentTermsDays = Number(document.getElementById('mGovTerms')?.value || 45);
    const exemptionCode = (document.getElementById('mExemptCode')?.value || '').trim();

    const rec = {
      id: Date.now(),
      equipmentId: eq.id,
      title: eq.title,
      city: eq.city,
      owner: eq.owner,
      ownerRnc: eq.rnc || 'N/A',
      ownerPhone: eq.phone || '',
      renter: document.getElementById('mRenter').value.trim(),
      renterRnc: document.getElementById('mRnc').value.trim(),
      dgiiVerified: true,
      address: document.getElementById('mAddress').value.trim(),
      startDate,
      endDate,
      qty,
      unitLabel: 'días',
      baseAmount: net,
      netSubtotal: fin.netSubtotal,
      itbis: fin.itbis,
      total: fin.total,
      ncf: ncfType !== 'E32',
      ncfType,
      encfNumber: '',
      encfSecurityCode: '',
      encfExpires: '',
      encfIssuedAt: '',
      exemptionCode,
      paymentMethod,
      paymentStatus: paymentMethod === 'card' ? 'paid' : 'pending',
      cardInfo: paymentMethod === 'card' ? { brand: 'Tarjeta POS/Link', last4: '0000', holder: document.getElementById('mRenter').value.trim(), authCode: 'GM' + String(Math.floor(100000 + Math.random() * 900000)) } : null,
      govApplyItbisRet,
      govIsrRetention: fin.govIsrRetention,
      govItbisRetention: fin.govItbisRetention,
      cardGatewayFee: fin.cardGatewayFee,
      cardItbisRetention: fin.cardItbisRetention,
      gmCommissionPct: commPct,
      govData: { poNumber, capNumber, entityEmail, paymentTermsDays, filedDate: '', libramientoNumber: '', isrLetterNumber: '' },
      govChecklist: ncfType === 'E45' ? {
        rncVerified: true,
        poReceived: Boolean(poNumber),
        capVerified: Boolean(capNumber),
        compliancePack: true,
        conduceStamped: false,
        encfFiled: false,
        treasuryPaid: false,
        isrLetterReceived: false
      } : {},
      stage: ncfType === 'E45' ? 'gov_review' : 'pending_validation'
    };

    let issued = null;
    if (issueNow) {
      if (API && API.issueEcf) {
        const apiRes = await API.issueEcf({
          bookingId: rec.id,
          booking: rec,
          typeCode: ncfType,
          recipientEmail: entityEmail || null,
          adminPin: adminConfig.adminPin || '2026'
        });
        if (!apiRes.fallbackLocal) {
          if (!apiRes.ok || !apiRes.ecf) {
            toast(`Error emitiendo e-CF: ${apiRes.error || 'Verifica credenciales DGII'}`);
            return;
          }
          issued = apiRes.ecf;
        }
      }
      if (!issued) {
        issued = BILL.issueNextEncf(ncfType);
        adminConfig = BILL.loadAdminConfig();
      }
      rec.encfNumber = issued.encf;
      rec.encfSecurityCode = issued.securityCode;
      rec.encfExpires = issued.expires;
      rec.encfIssuedAt = issued.issuedAt;
      if (issued.trackId) rec.dgiiTrackId = issued.trackId;
      if (issued.dgiiStatus) rec.dgiiStatus = issued.dgiiStatus;
      if (issued.dgiiQrUrl) rec.dgiiQrUrl = issued.dgiiQrUrl;
      if (issued.dgiiMode) rec.dgiiMode = issued.dgiiMode;
      if (ncfType === 'E45') rec.govChecklist.encfFiled = true;
      else rec.stage = 'invoiced_dispatched';
    }

    persistBooking(rec);
    closeModal('newInvoiceModal');
    openPrintDoc(rec.id, 'invoice');
    toast(issued ? `✓ Orden registrada y comprobante ${issued.encf} emitido` : '✓ Orden administrativa registrada');
  }

  /* =========================================================
     MODAL DOCUMENTOS IMPRIMIBLES (PDF)
     ========================================================= */
  function openPrintDoc(bookingId, docTab = 'invoice') {
    currentPrintBookingId = bookingId;
    currentPrintDocTab = docTab;
    renderPrintModal();
    openModal('printModal');
  }

  function switchPrintDocTab(tab) {
    currentPrintDocTab = tab;
    renderPrintModal();
  }

  function renderPrintModal() {
    const raw = findRawBooking(currentPrintBookingId);
    if (!raw) return;
    const b = BILL.normalizeBooking(raw);
    const isGov = b.ncfType === 'E45';
    const logoSrc = 'logo.png';

    let html = '';
    if (currentPrintDocTab === 'contract') html = BILL.buildPrintableContractHtml(b, adminConfig, logoSrc);
    else if (currentPrintDocTab === 'gov' && isGov) html = BILL.buildGovDossierHtml(b, adminConfig, logoSrc);
    else if (currentPrintDocTab === 'settlement') html = BILL.buildOwnerSettlementHtml(b, adminConfig, logoSrc);
    else html = BILL.buildPrintableInvoiceHtml(b, adminConfig, logoSrc);

    document.getElementById('printModalTitle').textContent = `Expediente #GM-${String(b.id).slice(-6)} — ${b.renter}`;
    document.getElementById('printModalBody').innerHTML = `
      <div class="doc-tabs no-print">
        <button type="button" class="doc-tab ${currentPrintDocTab === 'invoice' ? 'active' : ''}" onclick="window.GM_ADMIN.switchPrintDocTab('invoice')">🧾 Factura ${esc(b.ncfType)}</button>
        <button type="button" class="doc-tab ${currentPrintDocTab === 'contract' ? 'active' : ''}" onclick="window.GM_ADMIN.switchPrintDocTab('contract')">📄 Contrato Digital</button>
        ${isGov ? `<button type="button" class="doc-tab ${currentPrintDocTab === 'gov' ? 'active' : ''}" onclick="window.GM_ADMIN.switchPrintDocTab('gov')">🏛️ Carátula Estado</button>` : ''}
        <button type="button" class="doc-tab ${currentPrintDocTab === 'settlement' ? 'active' : ''}" onclick="window.GM_ADMIN.switchPrintDocTab('settlement')">💸 Liquidación Flota</button>
      </div>
      ${html}
      <div class="no-print" style="margin-top:14px; display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap;">
        ${currentPrintDocTab === 'invoice' ? `<button type="button" class="btn btn-ghost" onclick="window.GM_ADMIN.actionDownloadXml('${b.id}')">📥 Descargar XML e-CF</button>` : ''}
        <button type="button" class="btn btn-navy" onclick="window.print()">🖨️ Imprimir / Guardar como PDF</button>
      </div>
    `;
  }

  /* =========================================================
     EXPORTADORES 607 / 606 / JSON
     ========================================================= */
  function export607() {
    const csv = BILL.exportDGII607CSV(state.bookings || []);
    const ym = new Date().toISOString().slice(0, 7).replace('-', '');
    BILL.downloadTextFile(`DGII_607_GreenMileRD_${ym}.csv`, csv);
    toast('📥 Formato 607 (Ventas DGII) descargado');
  }

  function export606() {
    const csv = BILL.exportDGII606CSV(state.bookings || [], adminConfig);
    const ym = new Date().toISOString().slice(0, 7).replace('-', '');
    BILL.downloadTextFile(`DGII_606_GreenMileRD_${ym}.csv`, csv);
    toast('📥 Formato 606 (Compras / Propietarios DGII) descargado');
  }

  function exportFullJson() {
    const payload = JSON.stringify({
      exportedAt: new Date().toISOString(),
      config: adminConfig,
      bookings: state.bookings || [],
      equipmentCount: (state.equipment || []).length,
      ownersCount: ownersList.length
    }, null, 2);
    BILL.downloadTextFile('green-mile-rd-admin-backup.json', payload, 'application/json;charset=utf-8;');
    toast('💾 Respaldo administrativo completo descargado');
  }

  /* =========================================================
     INICIALIZACIÓN Y SINCRONIZACIÓN CLOUD FIRESTORE
     ========================================================= */
  window.GM_ADMIN = {
    submitPin,
    logoutAdmin,
    switchSection,
    openModal,
    closeModal,
    refreshBackendHealth,
    saveBackendUrl,
    seedDemoOperations,
    jumpToOrdersFilter,
    setOrderFilter,
    setOrderSearch,
    openManageOrder,
    actionMarkPaid,
    actionIssueEncf,
    actionCheckDgiiStatus,
    actionDownloadXml,
    actionNotifyGovEmail,
    actionSaveConduce,
    actionReleaseEquipment,
    actionCancelOrder,
    toggleGovChecklist,
    saveGovTracking,
    openSettleOwnerModal,
    confirmOwnerSettlement,
    replenishSequence,
    saveConfigForm,
    openNewInvoiceModal,
    onManualEqChange,
    onManualNcfChange,
    updateManualPreview,
    submitManualInvoice,
    openPrintDoc,
    switchPrintDocTab,
    export607,
    export606,
    exportFullJson
  };

  if (isUnlocked()) {
    showApp();
  }

  if (window.GM_FIREBASE && window.GM_FIREBASE.isReady && window.GM_FIREBASE.isReady()) {
    window.GM_FIREBASE.subscribeBookings((cloudList) => {
      state.bookings = cloudList;
      GM.saveState(state);
      if (isUnlocked()) {
        syncNavCounts();
        renderSection();
      }
    });
    window.GM_FIREBASE.subscribeEquipment((cloudEq) => {
      state.equipment = cloudEq;
      GM.saveState(state);
    }, GM.DEFAULT_EQUIPMENT);
    if (window.GM_FIREBASE.subscribeOwners) {
      window.GM_FIREBASE.subscribeOwners((list) => { ownersList = list; });
    }
    if (window.GM_FIREBASE.subscribeAdminConfig) {
      window.GM_FIREBASE.subscribeAdminConfig((cloudCfg) => {
        adminConfig = Object.assign({}, BILL.DEFAULT_ADMIN_CONFIG, cloudCfg);
        adminConfig.sequences = Object.assign({}, BILL.DEFAULT_ADMIN_CONFIG.sequences, cloudCfg.sequences || {});
        try { localStorage.setItem('gm_rd_admin_config_v1', JSON.stringify(adminConfig)); } catch (_) {}
        if (isUnlocked()) renderSection();
      });
    }
  } else {
    const stEl = document.getElementById('sidebarCloudStatus');
    if (stEl) {
      stEl.innerHTML = '<strong>💾 Modo Local Activo</strong>Datos guardados en este navegador';
    }
  }
})();
