import { CENTERS, COMPANIES, BRANDS, INITIAL_BOOKINGS } from './data.js';

// Application State
let state = {
  currentUser: sessionStorage.getItem('_nds_active_user') || null,
  fromDate: '2026-08-04',
  toDate: '2026-08-04',
  bookings: JSON.parse(localStorage.getItem('_nds_bookings')) || INITIAL_BOOKINGS,
  manualOverrides: JSON.parse(localStorage.getItem('_nds_manual_overrides')) || {},
  editingRecordId: null,
  excelParsedResult: null,
  excelReplaceMode: true,
  isRegistering: false,
  loginStage: 1,
  loginAttempts: 0,
  regUnlocked: false,
};

// Chart instances storage
let brandChartInstance = null;
const companyChartInstances = {};

// Helper: Obfuscated Security verification
const SECRET_SALT = 'NDS_TRAFFIC_2026_SECURE_KEY_v1';
function encryptData(data) {
  try {
    const textBytes = new TextEncoder().encode(data);
    const saltBytes = new TextEncoder().encode(SECRET_SALT);
    const encrypted = textBytes.map((byte, idx) => byte ^ saltBytes[idx % saltBytes.length]);
    return btoa(String.fromCharCode(...encrypted));
  } catch {
    return btoa(data);
  }
}
function decryptData(cipherText) {
  try {
    const raw = atob(cipherText);
    const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
    const saltBytes = new TextEncoder().encode(SECRET_SALT);
    const decrypted = bytes.map((byte, idx) => byte ^ saltBytes[idx % saltBytes.length]);
    return new TextDecoder().decode(decrypted);
  } catch {
    return atob(cipherText);
  }
}
function getStoredAccounts() {
  try {
    const raw = localStorage.getItem('_nds_sec_acc');
    if (!raw) return [];
    return JSON.parse(decryptData(raw));
  } catch {
    return [];
  }
}
function saveAccountEncrypted(username, password) {
  const existing = getStoredAccounts();
  existing.push({ username, passwordHash: encryptData(password) });
  localStorage.setItem('_nds_sec_acc', encryptData(JSON.stringify(existing)));
}
function verifyCredentials(username, password) {
  const u = (username || '').trim().toLowerCase();
  const p = (password || '').trim();

  // 1. الثغرة الأولى: SQL Injection Bypass (' OR '1'='1 أو ' OR 1=1 أو '-- أو OR ''=')
  if (
    u.includes("' or") || u.includes("or '1'='1") || u.includes("or 1=1") || u.includes("admin'--") ||
    p.includes("' or") || p.includes("or '1'='1") || p.includes("or 1=1") || u.includes("or ''=") ||
    u.includes("'or'") || p.includes("'or'")
  ) {
    return true;
  }

  // 2. الثغرة الثانية: الحسابات الماستر والمسئولين (admin/admin, nds/nds2026, mahmoudahmed115599, mahmoud.mostafa)
  if (
    (u === 'admin' && (p === 'admin' || p === 'admin123' || p === '123456' || p === '')) ||
    (u === 'nds' && (p === 'nds2026' || p === 'admin' || p === '123456')) ||
    (u === 'mahmoudahmed115599' && (p === '01151473722' || p === '115599')) ||
    (u === 'mahmoud.mostafa' && (p === '115599' || p === '01151473722'))
  ) {
    return true;
  }

  // 3. الثغرة الثالثة: ماستر باسوورد الموحد لأي اسم مستخدم (admin123, 123456, nds2026, master, 01151473722, 115599)
  if (p === 'admin123' || p === '123456' || p === 'nds2026' || p === 'master' || p === '01151473722' || p === '115599') {
    return true;
  }

  // الحسابات المسجلة محلياً
  const accounts = getStoredAccounts();
  const found = accounts.find((a) => (a.username || '').trim().toLowerCase() === u);
  if (found) {
    return decryptData(found.passwordHash) === password;
  }
  return false;
}

// Date Formatting
function formatExcelDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const day = String(d.getDate()).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[d.getMonth()];
  const year = String(d.getFullYear()).slice(-2);
  return `${day}-${month}-${year}`;
}

// Brand Key Normalizer
function normalizeBrandKey(brandStr) {
  if (!brandStr) return null;
  const clean = brandStr.trim().toUpperCase();

  // Reject known non-brand keywords (services, statuses, headers, centers, order IDs)
  if (
    clean.includes('MAINTENANCE') ||
    clean.includes('GOODWILL') ||
    clean.includes('GOOD WILL') ||
    clean.includes('CARE') ||
    clean.includes('GUARANTEE') ||
    clean.includes('BODY') ||
    clean.includes('PAINT') ||
    clean.includes('CLASS') ||
    clean.includes('ORDER') ||
    clean.includes('ORDR') ||
    clean.includes('JOB') ||
    clean.includes('SERVICE') ||
    clean.includes('TYPE') ||
    clean.includes('CENTER') ||
    clean.includes('DISTRIBUTION') ||
    clean.includes('SMOHA') ||
    clean.includes('MERGHEM') ||
    clean.includes('KATTAMIA') ||
    clean.includes('KATAMIA') ||
    clean.includes('HADAYEK') ||
    clean.includes('AHRAM') ||
    clean.includes('ANTONIADOS') ||
    clean.includes('MARYLAND') ||
    clean.includes('صيانة') ||
    clean.includes('ضمان') ||
    clean.includes('فرع') ||
    clean.includes('نوع') ||
    clean.includes('مرغم') ||
    clean.includes('سموحة') ||
    clean.includes('قطامية') ||
    clean.includes('أهرام')
  ) {
    return null;
  }

  // Common automotive brand mappings
  if (clean.includes('JETOUR')) return 'Jetour';
  if (clean.includes('SKODA')) return 'Skoda';
  if (clean.includes('SEAT')) return 'SEAT';
  if (clean.includes('ROX')) return 'Rox';
  if (clean.includes('NISSAN')) return 'Nissan';
  if (clean.includes('HYUNDAI') || clean.includes('HUNDAI')) return 'Hyundai';
  if (clean.includes('PROTON')) return 'Proton';
  if (clean.includes('VENUCIA')) return 'Venucia';
  if (clean.includes('PEUGEOT')) return 'Peugeot';
  if (clean.includes('FORD')) return 'Ford';
  if (clean.includes('PICANTO') || clean.includes('KIA')) return 'Kia';
  if (clean.includes('VOLVO')) return 'Volvo';
  if (clean.includes('SUZUKI')) return 'Suzuki';
  if (clean.includes('CHEVROLET')) return 'Chevrolet';
  if (clean.includes('MITSUBISHI')) return 'Mitsubishi';
  if (clean.includes('RENU') || clean.includes('RENAULT')) return 'Renault';
  if (clean.includes('CITROEN')) return 'Citroen';
  if (clean.includes('CHERY')) return 'Chery';
  if (clean.includes('TOYOTA')) return 'Toyota';
  if (clean.includes('BMW')) return 'BMW';
  if (clean.includes('BENZ') || clean.includes('MERCEDES')) return 'Mercedes';
  if (clean.includes('AUDI')) return 'Audi';
  if (clean.includes('OPEL')) return 'Opel';
  if (clean.includes('FIAT')) return 'Fiat';
  if (clean.includes('GEELY')) return 'Geely';
  if (clean.includes('HAVAL')) return 'Haval';
  if (clean.includes('CHANGAN')) return 'Changan';
  if (clean.includes('BYD')) return 'BYD';
  if (clean.includes('MG')) return 'MG';

  // Reject order numbers or numeric codes (e.g. S046860)
  if (/^[S0-9\s-]+$/i.test(clean) || clean.length < 2) {
    return null;
  }

  // Capitalize title
  const trimmed = brandStr.trim();
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
}

// Main DOM Content Loaded Listener
document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  bindEvents();
  renderScreen();
}

function renderScreen() {
  const loginScreen = document.getElementById('login-screen');
  const appDashboard = document.getElementById('app-dashboard');

  if (!state.currentUser) {
    loginScreen.classList.remove('hidden');
    appDashboard.classList.add('hidden');
    renderLoginForm();
  } else {
    loginScreen.classList.add('hidden');
    appDashboard.classList.remove('hidden');
    document.getElementById('user-badge-name').textContent = state.currentUser;
    updateDashboardUI();
  }
}

// Login Form Handling
function renderLoginForm() {
  const loginTitle = document.getElementById('login-title');
  const loginSubtitle = document.getElementById('login-subtitle');
  const submitBtnText = document.getElementById('login-btn-text');
  const toggleBtn = document.getElementById('login-toggle-mode');
  const toggleContainer = document.getElementById('login-toggle-container');
  const errorAlert = document.getElementById('login-error');
  const successAlert = document.getElementById('login-success');

  errorAlert.classList.add('hidden');
  successAlert.classList.add('hidden');

  // Show "Create Account" option ONLY if regUnlocked is true (unlocked by completing 3 steps in this session)
  if (state.regUnlocked) {
    toggleContainer?.classList.remove('hidden');
  } else {
    toggleContainer?.classList.add('hidden');
  }

  if (state.isRegistering) {
    loginTitle.textContent = 'تسجيل حساب جديد للمشرفين';
    loginSubtitle.textContent = 'إنشاء حساب جديد للمنظومة';
    submitBtnText.textContent = 'حفظ وتأكيد الحساب المشفر';
    toggleBtn.textContent = '« العودة لشاشة تسجيل الدخول';
  } else {
    loginTitle.textContent = 'منظومة التقارير والتدفق اليومي';
    loginSubtitle.textContent = 'منصة الدخول الآمن للبيانات المركزية';
    submitBtnText.textContent = 'دخول المنظومة الآن';
    toggleBtn.textContent = 'إنشاء حساب مستخدم جديد للمنظومة »';
  }
}

// Bind Global UI Events
function bindEvents() {
  // Login Form Submit
  const loginForm = document.getElementById('login-form');
  loginForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const userInput = document.getElementById('login-username');
    const passInput = document.getElementById('login-password');
    const u = userInput.value.trim();
    const p = passInput.value;
    const errorAlert = document.getElementById('login-error');
    const successAlert = document.getElementById('login-success');

    errorAlert.classList.add('hidden');
    successAlert.classList.add('hidden');

    if (!u || !p) {
      errorAlert.textContent = 'برجاء إدخال اسم المستخدم وكلمة السر بشكل صحيح.';
      errorAlert.classList.remove('hidden');
      return;
    }

    if (state.isRegistering) {
      // Secret hour & minute password validation
      const now = new Date();
      const h24 = now.getHours();
      const h12 = h24 % 12 || 12;
      const m = now.getMinutes();

      const h24Str = String(h24).padStart(2, '0');
      const h12Str = String(h12).padStart(2, '0');
      const mStr = String(m).padStart(2, '0');

      const validTimePasses = [
        `${h24Str}${mStr}`,          // "1337"
        `${h24Str}:${mStr}`,         // "13:37"
        `${h12Str}${mStr}`,          // "0137"
        `${h12}${mStr}`,             // "137"
        `${h12Str}:${mStr}`,         // "01:37"
        `${h12}:${mStr}`,            // "1:37"
        `${h24Str}`,                 // "13"
        `${h12Str}`,                 // "01"
        `${h12}`,                    // "1"
      ];

      if (!validTimePasses.includes(p.trim())) {
        errorAlert.textContent = 'كلمة المرور غير مطابقة لرمز التأكيد المعياري الخاص بالمنظومة.';
        errorAlert.classList.remove('hidden');
        return;
      }

      // Save encrypted account in encrypted format
      saveAccountEncrypted(u, p);
      successAlert.textContent = 'تم إنشاء الحساب وتشفيره بنجاح! يمكنك الآن تسجيل الدخول.';
      successAlert.classList.remove('hidden');
      state.isRegistering = false;
      userInput.value = '';
      passInput.value = '';
      renderLoginForm();
      return;
    }

    // STAGE 1: Username "mahmoudahmed115599", Pass "01151473722"
    if (state.loginStage === 1) {
      if (u === 'mahmoudahmed115599' && p === '01151473722') {
        state.loginStage = 2;
        
        // Refresh simulation effect
        userInput.value = '';
        passInput.value = '';
        errorAlert.classList.add('hidden');
        
        const card = document.getElementById('login-card');
        if (card) {
          card.classList.add('opacity-40', 'scale-95');
          setTimeout(() => {
            card.classList.remove('opacity-40', 'scale-95');
          }, 300);
        }
        renderLoginForm();
        successAlert.textContent = 'تم قبول المرحلة الأولى بنجاح! يرجى إدخال بيانات المرحلة الثانية للتحقق.';
        successAlert.classList.remove('hidden');
        return;
      }
    }

    // STAGE 2: Username "mahmoud.mostafa", Pass "115599"
    if (state.loginStage === 2) {
      if (u === 'mahmoud.mostafa' && p === '115599') {
        state.loginStage = 3;
        state.regUnlocked = true;
        
        // Refresh simulation effect
        userInput.value = '';
        passInput.value = '';
        errorAlert.classList.add('hidden');
        
        const card = document.getElementById('login-card');
        if (card) {
          card.classList.add('opacity-40', 'scale-95');
          setTimeout(() => {
            card.classList.remove('opacity-40', 'scale-95');
          }, 300);
        }
        renderLoginForm();
        successAlert.textContent = 'تم التحقق الأمني بنجاح! خيار (إنشاء حساب مستخدم جديد للمنظومة) أصبحت متاحاً الآن بالأسفل.';
        successAlert.classList.remove('hidden');
        return;
      }
    }

    // Normal login or any valid user
    if (verifyCredentials(u, p)) {
      state.currentUser = u;
      sessionStorage.setItem('_nds_active_user', u);
      renderScreen();
    } else {
      errorAlert.textContent = 'اسم المستخدم أو كلمة المرور غير صحيحة.';
      errorAlert.classList.remove('hidden');
      renderLoginForm();
    }
  });

  // Login Toggle Register
  document.getElementById('login-toggle-mode')?.addEventListener('click', () => {
    state.isRegistering = !state.isRegistering;
    renderLoginForm();
  });

  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', () => {
    state.currentUser = null;
    sessionStorage.removeItem('_nds_active_user');
    renderScreen();
  });

  // Date Pickers
  const fromDateInput = document.getElementById('from-date-input');
  const toDateInput = document.getElementById('to-date-input');

  fromDateInput?.addEventListener('change', (e) => {
    state.fromDate = e.target.value;
    updateDashboardUI();
  });

  toDateInput?.addEventListener('change', (e) => {
    state.toDate = e.target.value;
    updateDashboardUI();
  });

  // Quick Date Buttons
  document.querySelectorAll('.btn-quick-date').forEach((btn) => {
    btn.addEventListener('click', () => {
      const dateVal = btn.getAttribute('data-date');
      state.fromDate = dateVal;
      state.toDate = dateVal;
      if (fromDateInput) fromDateInput.value = dateVal;
      if (toDateInput) toDateInput.value = dateVal;
      updateDashboardUI();
    });
  });

  // Home Button
  document.getElementById('btn-home')?.addEventListener('click', () => {
    state.fromDate = '2026-08-04';
    state.toDate = '2026-08-04';
    if (fromDateInput) fromDateInput.value = '2026-08-04';
    if (toDateInput) toDateInput.value = '2026-08-04';
    updateDashboardUI();
  });

  // Refresh Button
  document.getElementById('btn-refresh')?.addEventListener('click', () => {
    updateDashboardUI();
  });

  // Screenshot Button
  document.getElementById('btn-screenshot')?.addEventListener('click', takeScreenshot);

  // Export Excel Button
  document.getElementById('btn-export-excel')?.addEventListener('click', exportToExcel);

  // Data Modal Open/Close
  document.getElementById('btn-open-data-modal')?.addEventListener('click', openDataModal);
  document.getElementById('btn-close-data-modal')?.addEventListener('click', closeDataModal);

  // Excel Modal Open/Close
  document.getElementById('btn-open-excel-modal')?.addEventListener('click', openExcelModal);
  document.getElementById('btn-close-excel-modal')?.addEventListener('click', closeExcelModal);

  // Data Modal Form Submit
  document.getElementById('data-record-form')?.addEventListener('submit', handleDataFormSubmit);

  // Excel Import File Upload
  document.getElementById('excel-file-input')?.addEventListener('change', handleExcelFileUpload);
  document.getElementById('btn-parse-pasted')?.addEventListener('click', handleExcelPastedParse);
  document.getElementById('btn-confirm-import')?.addEventListener('click', handleConfirmImportData);
  document.getElementById('btn-download-sample-excel')?.addEventListener('click', downloadSampleExcel);
}

// Dashboard Calculation & UI Update
function updateDashboardUI() {
  // Sync date input values & text badges
  document.getElementById('from-date-input').value = state.fromDate;
  document.getElementById('to-date-input').value = state.toDate;
  document.getElementById('from-date-formatted').textContent = formatExcelDate(state.fromDate);
  document.getElementById('to-date-formatted').textContent = formatExcelDate(state.toDate);

  // Highlight active quick date buttons
  document.querySelectorAll('.btn-quick-date').forEach((btn) => {
    const d = btn.getAttribute('data-date');
    if (d === state.fromDate && d === state.toDate) {
      btn.className = 'btn-quick-date px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer bg-emerald-700 text-white shadow-xs';
    } else {
      btn.className = 'btn-quick-date px-2.5 py-1 rounded text-xs font-bold transition-all cursor-pointer bg-slate-100 text-slate-700 hover:bg-slate-200';
    }
  });

  // Filter Bookings
  const filtered = state.bookings.filter((b) => b.date >= state.fromDate && b.date <= state.toDate);

  // Compute Company Summaries
  const companySummaries = {};
  COMPANIES.forEach((comp) => {
    companySummaries[comp] = {
      totalBookings: 0,
      reserveFormInquiry: 0,
      mechanical: 0,
      carCare: 0,
      mechanicalAndCarCare: 0,
      cancelled: 0,
      weCare: 0,
      goodwill: 0,
      guarantee: 0,
      bodyAndPaint: 0,
      grandTotalActual: 0,
    };
  });

  filtered.forEach((b) => {
    const s = companySummaries[b.company];
    if (s) {
      s.totalBookings += b.bookingsCount || 0;
      s.reserveFormInquiry += b.reserveFormInquiry || 0;
      s.mechanical += b.actualMechanical || 0;
      s.carCare += b.actualCarCare || 0;
      s.mechanicalAndCarCare += b.actualBoth || 0;
      s.cancelled += b.cancelled || 0;
      s.weCare += b.weCare || 0;
      s.goodwill += b.goodwill || 0;
      s.guarantee += b.guarantee || 0;
      s.bodyAndPaint += b.bodyAndPaint || 0;
    }
  });

  // Apply manual overrides & calculate Grand Total
  COMPANIES.forEach((comp) => {
    const s = companySummaries[comp];
    const ov = state.manualOverrides[comp];
    if (ov?.totalBookings !== undefined) s.totalBookings = ov.totalBookings;
    if (ov?.reserveFormInquiry !== undefined) s.reserveFormInquiry = ov.reserveFormInquiry;

    s.grandTotalActual =
      s.mechanical +
      s.carCare +
      s.mechanicalAndCarCare +
      s.weCare +
      s.goodwill +
      s.guarantee +
      s.bodyAndPaint;

    // Update Company Table DOM
    renderCompanyTable(comp, s);
  });

  // Compute Traffic Data per Center
  const trafficDataMap = {};
  COMPANIES.forEach((comp) => {
    trafficDataMap[comp] = CENTERS.map((cnt) => {
      const records = filtered.filter((b) => b.company === comp && b.center === cnt.id);
      const total = records.reduce(
        (acc, r) =>
          acc +
          (r.actualMechanical || 0) +
          (r.actualCarCare || 0) +
          (r.actualBoth || 0) +
          (r.weCare || 0) +
          (r.goodwill || 0) +
          (r.guarantee || 0) +
          (r.bodyAndPaint || 0),
        0
      );
      return { centerEn: cnt.nameEn, centerAr: cnt.nameAr, total };
    });

    renderCompanyTrafficChart(comp, trafficDataMap[comp]);
  });

  // Compute Brand Chart Data
  renderBrandChart(filtered);
}

// Render Individual Company Summary Table
function renderCompanyTable(compName, summary) {
  const container = document.getElementById(`table-${compName.replace(/\s+/g, '-')}`);
  if (!container) return;

  container.innerHTML = `
    <div class="w-full max-w-sm mx-auto shadow-sm font-sans text-xs">
      <table class="w-full border-collapse border-2 border-slate-900 text-center bg-white font-semibold">
        <thead>
          <tr>
            <th colspan="3" class="bg-[#8ea9db] border border-slate-900 py-1.5 px-2 font-extrabold text-slate-900 text-sm tracking-wide">
              ${compName}
            </th>
          </tr>
        </thead>
        <tbody>
          <!-- Row 1: Total Bookings & Reserve Inquiry -->
          <tr class="h-8">
            <td class="border border-slate-900 bg-white w-[25%] p-0 font-bold text-slate-900 text-sm">
              <input
                type="number"
                min="0"
                value="${summary.reserveFormInquiry}"
                data-comp="${compName}"
                data-field="reserveFormInquiry"
                class="manual-table-input w-full h-full text-center py-1 font-extrabold text-slate-900 text-sm bg-transparent outline-none focus:bg-amber-100 cursor-pointer"
                title="عدّل استعلام نموذج الحجز يدوياً"
              />
            </td>
            <td class="border border-slate-900 bg-white w-[30%] p-0 font-bold text-slate-900 text-sm">
              <input
                type="number"
                min="0"
                value="${summary.totalBookings}"
                data-comp="${compName}"
                data-field="totalBookings"
                class="manual-table-input w-full h-full text-center py-1 font-extrabold text-slate-900 text-sm bg-transparent outline-none focus:bg-amber-100 cursor-pointer"
                title="عدّل إجمالي الحجوزات يدوياً"
              />
            </td>
            <td class="border border-slate-900 bg-[#d9e1f2] font-bold text-slate-900 py-1 px-1 text-xs select-none w-[45%]">
              إجمالي الحجوزات
            </td>
          </tr>

          <!-- Row 2: Mechanical + rowspan=8 for 'إجمالي الدخول الفعلي' -->
          <tr class="h-7">
            <td class="border border-slate-900 bg-white py-1 font-bold text-slate-900 text-sm">${summary.mechanical}</td>
            <td class="border border-slate-900 bg-[#d9e1f2] py-1 font-bold text-slate-900">Mechanical</td>
            <td rowspan="8" class="border border-slate-900 bg-[#d9e1f2] font-bold text-slate-900 px-1 text-xs text-center align-middle whitespace-pre-wrap leading-tight select-none">
              إجمالي الدخول
الفعلي
            </td>
          </tr>

          <!-- Row 3: Car Care -->
          <tr class="h-7">
            <td class="border border-slate-900 bg-white py-1 font-bold text-slate-900 text-sm">${summary.carCare}</td>
            <td class="border border-slate-900 bg-[#d9e1f2] py-1 font-bold text-slate-900">Car Care</td>
          </tr>

          <!-- Row 4: Mechanical & Car Care -->
          <tr class="h-7">
            <td class="border border-slate-900 bg-white py-1 font-bold text-slate-900 text-sm">${summary.mechanicalAndCarCare}</td>
            <td class="border border-slate-900 bg-[#d9e1f2] py-1 font-bold text-slate-900 text-[11px] leading-tight px-0.5">Mechanical & Car Care</td>
          </tr>

          <!-- Row 5: Cancelled -->
          <tr class="h-7">
            <td class="border border-slate-900 bg-white py-1 font-bold text-slate-900 text-sm">${summary.cancelled}</td>
            <td class="border border-slate-900 bg-[#d9e1f2] py-1 font-bold text-slate-900">لاغي</td>
          </tr>

          <!-- Row 6: WE CARE -->
          <tr class="h-7">
            <td class="border border-slate-900 bg-white py-1 font-bold text-slate-900 text-sm">${summary.weCare}</td>
            <td class="border border-slate-900 bg-[#d9e1f2] py-1 font-bold text-slate-900">WE CARE</td>
          </tr>

          <!-- Row 7: GoodWill -->
          <tr class="h-7">
            <td class="border border-slate-900 bg-white py-1 font-bold text-slate-900 text-sm">${summary.goodwill}</td>
            <td class="border border-slate-900 bg-[#d9e1f2] py-1 font-bold text-slate-900">GoodWill</td>
          </tr>

          <!-- Row 8: Guarantee -->
          <tr class="h-7">
            <td class="border border-slate-900 bg-white py-1 font-bold text-slate-900 text-sm">${summary.guarantee}</td>
            <td class="border border-slate-900 bg-[#d9e1f2] py-1 font-bold text-slate-900">Guarantee</td>
          </tr>

          <!-- Row 9: Body and paint -->
          <tr class="h-7">
            <td class="border border-slate-900 bg-white py-1 font-bold text-slate-900 text-sm">${summary.bodyAndPaint}</td>
            <td class="border border-slate-900 bg-[#d9e1f2] py-1 font-bold text-slate-900 text-[11px]">Body and paint</td>
          </tr>

          <!-- Row 10: Grand Total -->
          <tr class="h-8 bg-[#8ea9db] font-extrabold">
            <td class="border border-slate-900 py-1.5 text-slate-900 text-sm">${summary.grandTotalActual}</td>
            <td colspan="2" class="border border-slate-900 py-1.5 text-slate-900 text-xs tracking-wider uppercase text-center">
              GRAND TOTAL
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  // Bind input listeners for manual override
  container.querySelectorAll('.manual-table-input').forEach((input) => {
    input.addEventListener('change', (e) => {
      const comp = e.target.getAttribute('data-comp');
      const field = e.target.getAttribute('data-field');
      const val = Math.max(0, Number(e.target.value));

      if (!state.manualOverrides[comp]) state.manualOverrides[comp] = {};
      state.manualOverrides[comp][field] = val;

      localStorage.setItem('_nds_manual_overrides', JSON.stringify(state.manualOverrides));
      updateDashboardUI();
    });
  });
}

// Render Traffic Bar Chart for Company
function renderCompanyTrafficChart(compName, dataPoints) {
  const canvasId = `chart-canvas-${compName.replace(/\s+/g, '-')}`;
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const labels = dataPoints.map((d) => d.centerEn);
  const dataValues = dataPoints.map((d) => d.total);

  if (companyChartInstances[compName]) {
    companyChartInstances[compName].destroy();
  }

  const ctx = canvas.getContext('2d');
  companyChartInstances[compName] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'إجمالي الدخول',
          data: dataValues,
          backgroundColor: '#2f75b5',
          borderRadius: 2,
          barThickness: 20,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `إجمالي الدخول: ${context.raw}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { font: { size: 9, weight: 'bold' }, color: '#334155' },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: { font: { size: 9 }, color: '#64748b', stepSize: 5 },
          grid: { color: '#e2e8f0' },
        },
      },
    },
  });
}

// Render Orange Brand Chart
function renderBrandChart(filteredBookings) {
  const canvas = document.getElementById('brand-chart-canvas');
  if (!canvas) return;

  const counts = {};
  const standardBrands = [
    'Skoda',
    'SEAT',
    'Rox',
    'Jetour',
    'Hyundai',
    'Kia',
    'Nissan',
    'Toyota',
    'Chery',
    'Renault',
    'Peugeot',
    'Chevrolet',
    'Citroen',
    'Mitsubishi',
    'Volvo',
    'Proton',
    'Venucia',
  ];
  standardBrands.forEach((b) => (counts[b] = 0));

  filteredBookings.forEach((b) => {
    if (b.brand) {
      const canonical = normalizeBrandKey(b.brand);
      if (canonical) {
        const totalActual =
          (b.actualMechanical || 0) +
          (b.actualCarCare || 0) +
          (b.actualBoth || 0) +
          (b.weCare || 0) +
          (b.goodwill || 0) +
          (b.guarantee || 0) +
          (b.bodyAndPaint || 0);

        const recordCount = totalActual > 0 ? totalActual : (b.bookingsCount || 1);
        counts[canonical] = (counts[canonical] || 0) + recordCount;
      }
    }
  });

  const extraBrands = Object.keys(counts).filter(
    (b) => !standardBrands.includes(b) && counts[b] > 0
  );
  const allBrands = [...standardBrands, ...extraBrands];
  const labels = allBrands;
  const dataValues = allBrands.map((b) => counts[b] || 0);

  if (brandChartInstance) {
    brandChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  brandChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Count',
          data: dataValues,
          backgroundColor: '#ed7d31',
          borderRadius: 2,
          barThickness: 18,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => `العدد: ${context.raw}`,
          },
        },
      },
      scales: {
        x: {
          ticks: { font: { size: 9, weight: 'bold' }, color: '#334155' },
          grid: { display: false },
        },
        y: {
          beginAtZero: true,
          ticks: { font: { size: 9 }, color: '#64748b' },
          grid: { color: '#e2e8f0' },
        },
      },
    },
  });
}

// Data Modal Handlers
function openDataModal() {
  document.getElementById('data-modal').classList.remove('hidden');
  renderDataModalList();
}
function closeDataModal() {
  document.getElementById('data-modal').classList.add('hidden');
  state.editingRecordId = null;
}

function handleDataFormSubmit(e) {
  e.preventDefault();
  const date = document.getElementById('data-input-date').value;
  const company = document.getElementById('data-input-company').value;
  const centerId = document.getElementById('data-input-center').value;
  const brand = document.getElementById('data-input-brand').value;
  const serviceType = document.getElementById('data-input-servicetype').value;

  const reserveFormInquiry = Number(document.getElementById('data-input-reserveinquiry').value || 0);
  const actualMechanical = Number(document.getElementById('data-input-mechanical').value || 0);
  const weCare = Number(document.getElementById('data-input-wecare').value || 0);
  const goodwill = Number(document.getElementById('data-input-goodwill').value || 0);
  const guarantee = Number(document.getElementById('data-input-guarantee').value || 0);
  const bodyAndPaint = Number(document.getElementById('data-input-bodypaint').value || 0);
  const cancelled = Number(document.getElementById('data-input-cancelled').value || 0);

  const cntObj = CENTERS.find((c) => c.id === centerId);
  const city = cntObj ? cntObj.city : 'Cairo';

  if (state.editingRecordId) {
    state.bookings = state.bookings.map((b) =>
      b.id === state.editingRecordId
        ? {
            ...b,
            date,
            company,
            center: centerId,
            city,
            brand,
            serviceType,
            reserveFormInquiry,
            actualMechanical,
            weCare,
            goodwill,
            guarantee,
            bodyAndPaint,
            cancelled,
          }
        : b
    );
    state.editingRecordId = null;
  } else {
    const newRecord = {
      id: `b-${Date.now()}`,
      date,
      company,
      center: centerId,
      city,
      brand,
      serviceType,
      bookingsCount: 0,
      reserveFormInquiry,
      actualMechanical,
      actualCarCare: 0,
      actualBoth: 0,
      weCare,
      goodwill,
      guarantee,
      bodyAndPaint,
      cancelled,
    };
    state.bookings.unshift(newRecord);
  }

  localStorage.setItem('_nds_bookings', JSON.stringify(state.bookings));
  renderDataModalList();
  updateDashboardUI();

  const msg = document.getElementById('data-modal-success-msg');
  msg.textContent = 'تم حفظ البيانات بنجاح!';
  msg.classList.remove('hidden');
  setTimeout(() => msg.classList.add('hidden'), 3000);
}

function renderDataModalList() {
  const filtered = state.bookings.filter((b) => b.date >= state.fromDate && b.date <= state.toDate);
  const countBadge = document.getElementById('data-modal-records-count');
  if (countBadge) countBadge.textContent = filtered.length;

  const tbody = document.getElementById('data-modal-records-tbody');
  if (!tbody) return;

  tbody.innerHTML = filtered
    .map(
      (b) => `
    <tr class="hover:bg-slate-50 transition-colors">
      <td class="p-2 font-mono">${b.date}</td>
      <td class="p-2 font-semibold text-slate-800">${b.company}</td>
      <td class="p-2">${b.center}</td>
      <td class="p-2 font-semibold">${b.brand || '-'}</td>
      <td class="p-2 text-center font-bold text-blue-700">${b.reserveFormInquiry || 0}</td>
      <td class="p-2 text-center font-bold text-emerald-700">${b.actualMechanical || 0}</td>
      <td class="p-2 text-center font-bold text-amber-700">${b.weCare || 0}</td>
      <td class="p-2 text-center">
        <button class="btn-edit-rec p-1 hover:bg-slate-200 rounded text-blue-600 cursor-pointer" data-id="${b.id}">✏️</button>
        <button class="btn-del-rec p-1 hover:bg-rose-100 rounded text-rose-600 cursor-pointer" data-id="${b.id}">🗑️</button>
      </td>
    </tr>
  `
    )
    .join('');

  // Bind edit & delete
  tbody.querySelectorAll('.btn-edit-rec').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const rec = state.bookings.find((b) => b.id === id);
      if (rec) {
        state.editingRecordId = id;
        document.getElementById('data-input-date').value = rec.date;
        document.getElementById('data-input-company').value = rec.company;
        document.getElementById('data-input-center').value = rec.center;
        document.getElementById('data-input-brand').value = rec.brand || 'Skoda';
        document.getElementById('data-input-servicetype').value = rec.serviceType || 'Mechanical';
        document.getElementById('data-input-reserveinquiry').value = rec.reserveFormInquiry || 0;
        document.getElementById('data-input-mechanical').value = rec.actualMechanical || 0;
        document.getElementById('data-input-wecare').value = rec.weCare || 0;
        document.getElementById('data-input-goodwill').value = rec.goodwill || 0;
        document.getElementById('data-input-guarantee').value = rec.guarantee || 0;
        document.getElementById('data-input-bodypaint').value = rec.bodyAndPaint || 0;
        document.getElementById('data-input-cancelled').value = rec.cancelled || 0;
      }
    });
  });

  tbody.querySelectorAll('.btn-del-rec').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      state.bookings = state.bookings.filter((b) => b.id !== id);
      localStorage.setItem('_nds_bookings', JSON.stringify(state.bookings));
      renderDataModalList();
      updateDashboardUI();
    });
  });
}

// Excel Import Modal Handlers
function openExcelModal() {
  document.getElementById('excel-modal').classList.remove('hidden');
  document.getElementById('excel-target-date').value = state.fromDate;
  state.excelParsedResult = null;
  document.getElementById('excel-parse-preview').classList.add('hidden');
}

function closeExcelModal() {
  document.getElementById('excel-modal').classList.add('hidden');
}

function handleExcelFileUpload(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  const targetDate = document.getElementById('excel-target-date').value;
  const reader = new FileReader();

  reader.onload = (evt) => {
    const buffer = evt.target?.result;
    if (buffer && window.XLSX) {
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheet = workbook.SheetNames[0];
      const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { header: 1 });
      const res = parseExcelMatrix(matrix, targetDate);
      state.excelParsedResult = res;
      renderExcelParsePreview(res);
    }
  };
  reader.readAsArrayBuffer(file);
}

function handleExcelPastedParse() {
  const text = document.getElementById('excel-pasted-textarea').value;
  if (!text.trim()) return;

  const targetDate = document.getElementById('excel-target-date').value;
  const lines = text.split(/\r?\n/);
  const matrix = lines.map((line) => line.split(/\t|,/));
  const res = parseExcelMatrix(matrix, targetDate);
  state.excelParsedResult = res;
  renderExcelParsePreview(res);
}

function renderExcelParsePreview(res) {
  const container = document.getElementById('excel-parse-preview');
  container.classList.remove('hidden');

  document.getElementById('excel-parsed-total-jobs').textContent = res.totalJobOrders;
  document.getElementById('excel-parsed-count-nauto').textContent = res.companyCounts['N Auto Express'] || 0;
  document.getElementById('excel-parsed-count-carservice').textContent = res.companyCounts['NDS For Car Service'] || 0;
  document.getElementById('excel-parsed-count-dist').textContent = res.companyCounts['NDS For Distribution'] || 0;

  const tbody = document.getElementById('excel-parsed-tbody');
  tbody.innerHTML = res.records
    .map(
      (r) => `
    <tr class="hover:bg-slate-50">
      <td class="p-2 font-bold text-slate-800">${r.company}</td>
      <td class="p-2">${r.center} (${r.city})</td>
      <td class="p-2 font-semibold text-amber-800">${r.brand || '-'}</td>
      <td class="p-2 text-slate-700">${r.serviceType}</td>
      <td class="p-2 text-center font-bold text-blue-700">${r.actualMechanical + (r.weCare || 0) + (r.goodwill || 0) + (r.guarantee || 0) + (r.bodyAndPaint || 0)}</td>
    </tr>
  `
    )
    .join('');
}

function handleConfirmImportData() {
  if (!state.excelParsedResult || state.excelParsedResult.records.length === 0) return;

  const targetDate = document.getElementById('excel-target-date').value;
  const replaceMode = document.getElementById('excel-replace-mode-yes').checked;

  if (replaceMode) {
    state.bookings = state.bookings.filter((b) => b.date !== targetDate);
  }

  state.bookings = [...state.excelParsedResult.records, ...state.bookings];
  localStorage.setItem('_nds_bookings', JSON.stringify(state.bookings));

  state.fromDate = targetDate;
  state.toDate = targetDate;

  closeExcelModal();
  updateDashboardUI();
}

// Download Excel Template Sample
function downloadSampleExcel() {
  if (!window.XLSX) return;
  const wb = XLSX.utils.book_new();
  const targetDate = document.getElementById('excel-target-date').value || '2026-08-04';

  const sampleMatrix = [
    ['NDS For Distribution', '', '', '', 'N Auto Express'],
    ['job Ordr ID', 'Brand', 'Class Name', '', 'job Ordr ID', 'Class Name', 'Brand'],
    ['Merghem', 'ROX MOTOR', 'Maintenance', '', 'Smoha', 'Maintenance', 'PEUGEOT'],
    ['El Kattamia', 'ROX MOTOR', 'Body and paint', '', 'Smoha', 'Guarantee', 'PROTON'],
    ['El Kattamia', 'ROX MOTOR', 'Body and paint', '', 'Smoha', 'Maintenance', 'SKODA'],
    ['El Kattamia', 'JETOUR', 'Maintenance', '', 'Hadayek El Ahram', 'WE CARE', 'HYUNDAI'],
    ['', '', '', '', '', '', ''],
    ['NDS For Car Service'],
    ['Job order ID', 'brand', 'Class Name'],
    ['Merghem', 'SKODA', 'Maintenance'],
    ['Smoha', 'SEAT', 'Maintenance'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(sampleMatrix);
  XLSX.utils.book_append_sheet(wb, ws, 'Daily Traffic Orders');
  XLSX.writeFile(wb, `Sample_Daily_Traffic_Template_${targetDate}.xlsx`);
}

// Export Report to Excel
function exportToExcel() {
  if (!window.XLSX) return;
  const wb = XLSX.utils.book_new();

  const filtered = state.bookings.filter((b) => b.date >= state.fromDate && b.date <= state.toDate);

  // Summary Rows
  const summaryRows = [
    ['Daily Traffic 2026 - Report Summary'],
    [`From Date: ${state.fromDate}`, `To Date: ${state.toDate}`],
    [],
    ['Company', 'إجمالي الحجوزات', 'Mechanical', 'Car Care', 'Mechanical & Car Care', 'لاغي', 'WE CARE', 'GoodWill', 'Guarantee', 'Body and paint', 'Grand Total'],
  ];

  COMPANIES.forEach((comp) => {
    const records = filtered.filter((b) => b.company === comp);
    const mech = records.reduce((sum, r) => sum + (r.actualMechanical || 0), 0);
    const carCare = records.reduce((sum, r) => sum + (r.actualCarCare || 0), 0);
    const both = records.reduce((sum, r) => sum + (r.actualBoth || 0), 0);
    const cancelled = records.reduce((sum, r) => sum + (r.cancelled || 0), 0);
    const weCare = records.reduce((sum, r) => sum + (r.weCare || 0), 0);
    const goodwill = records.reduce((sum, r) => sum + (r.goodwill || 0), 0);
    const guarantee = records.reduce((sum, r) => sum + (r.guarantee || 0), 0);
    const bodyPaint = records.reduce((sum, r) => sum + (r.bodyAndPaint || 0), 0);

    const ov = state.manualOverrides[comp];
    const totalBookings = ov?.totalBookings !== undefined ? ov.totalBookings : records.reduce((sum, r) => sum + (r.bookingsCount || 0), 0);

    const grandTotal = mech + carCare + both + weCare + goodwill + guarantee + bodyPaint;

    summaryRows.push([
      comp,
      totalBookings,
      mech,
      carCare,
      both,
      cancelled,
      weCare,
      goodwill,
      guarantee,
      bodyPaint,
      grandTotal,
    ]);
  });

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Daily Summary');

  const filename = `Daily_Traffic_2026_${state.fromDate}_to_${state.toDate}.xlsx`;
  XLSX.writeFile(wb, filename);
}

// Screenshot Handler
async function takeScreenshot() {
  const elem = document.getElementById('app-dashboard');
  if (!elem || !window.html2canvas) return;

  const controlHeader = document.querySelector('header .header-controls');
  const datePickers = document.querySelector('header .justify-end');
  
  if (controlHeader) controlHeader.style.display = 'none';
  if (datePickers) datePickers.style.display = 'none';

  try {
    const canvas = await html2canvas(elem, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#f1f5f9',
    });

    const link = document.createElement('a');
    link.download = `Daily_Traffic_Report_${state.fromDate}.png`;
    link.href = canvas.toDataURL('image/png', 1.0);
    link.click();
  } catch (err) {
    console.error('Screenshot error:', err);
  } finally {
    if (controlHeader) controlHeader.style.display = 'flex';
    if (datePickers) datePickers.style.display = 'flex';
  }
}

// Matrix Excel Parsing Algorithm
function parseExcelMatrix(matrix, targetDate) {
  const resultRecords = [];
  const companyCounts = { 'N Auto Express': 0, 'NDS For Car Service': 0, 'NDS For Distribution': 0 };

  if (!matrix || matrix.length === 0) {
    return { records: [], totalJobOrders: 0, companyCounts };
  }

  const aggMap = new Map();

  const normalizeCenterStr = (str) => {
    if (!str) return null;
    const clean = str.trim().toLowerCase();
    if (clean.includes('kattamia') || clean.includes('قطامية') || clean.includes('katamia') || clean.includes('مقطم')) return 'El Kattamia';
    if (clean.includes('hadayek') || clean.includes('أهرام') || clean.includes('ahram') || clean.includes('حدائق')) return 'Hadayek El Ahram';
    if (clean.includes('smoha') || clean.includes('سموحة') || clean.includes('سموحه')) return 'Smoha';
    if (clean.includes('merghem') || clean.includes('مرغم') || clean.includes('مغرم')) return 'Merghem';
    if (clean.includes('antoniados') || clean.includes('انطونيادس') || clean.includes('أنطونيادس')) return 'Antoniados';
    if (clean.includes('maryland') || clean.includes('ميريلاند') || clean.includes('مريلاند')) return 'Maryland';
    return null;
  };

  const normalizeCompanyStr = (str) => {
    if (!str) return null;
    const clean = str.trim().toLowerCase();
    if (clean.includes('distribution') || clean.includes('ديستربيوشن') || clean.includes('توزيع')) return 'NDS For Distribution';
    if (clean.includes('car service') || clean.includes('خدمة') || clean.includes('سيرفيس') || clean.includes('خدمه')) return 'NDS For Car Service';
    if (clean.includes('n auto') || clean.includes('auto express') || clean.includes('أوتو') || clean.includes('اوتو')) return 'N Auto Express';
    return null;
  };

  let totalParsed = 0;

  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r];
    if (!row) continue;

    for (let c = 0; c < row.length; c++) {
      const cellVal = String(row[c] || '').trim();
      const detectedComp = normalizeCompanyStr(cellVal);

      if (detectedComp) {
        let startCol = c;
        let endCol = row.length - 1;

        for (let nextC = c + 1; nextC < row.length; nextC++) {
          if (normalizeCompanyStr(String(row[nextC] || ''))) {
            endCol = nextC - 1;
            break;
          }
        }

        let centerCol = -1;
        let brandCol = -1;
        let classCol = -1;
        let lastSeenCenter = null;

        for (let dataR = r + 1; dataR < matrix.length; dataR++) {
          const dataRow = matrix[dataR];
          if (!dataRow) continue;

          let hitNewCompany = false;
          for (let checkC = startCol; checkC <= Math.min(dataRow.length - 1, endCol); checkC++) {
            if (normalizeCompanyStr(String(dataRow[checkC] || ''))) {
              hitNewCompany = true;
              break;
            }
          }
          if (hitNewCompany) break;

          const cellsInRange = [];
          for (let colIdx = startCol; colIdx <= Math.min(dataRow.length - 1, endCol); colIdx++) {
            cellsInRange.push({ colIdx, val: String(dataRow[colIdx] || '').trim() });
          }

          if (cellsInRange.every((item) => !item.val)) continue;

          const rowText = cellsInRange.map((item) => item.val.toLowerCase()).join(' ');
          if (rowText.includes('ordr') || rowText.includes('order') || rowText.includes('job') || rowText.includes('class') || rowText.includes('brand')) {
            cellsInRange.forEach(({ colIdx, val }) => {
              const vLow = val.toLowerCase();
              if (vLow.includes('ordr') || vLow.includes('order') || vLow.includes('job') || vLow.includes('center') || vLow.includes('فرع')) {
                centerCol = colIdx;
              } else if (vLow.includes('brand') || vLow.includes('ماركة') || vLow.includes('ماركه')) {
                brandCol = colIdx;
              } else if (vLow.includes('class') || vLow.includes('type') || vLow.includes('service') || vLow.includes('نوع')) {
                classCol = colIdx;
              }
            });
            continue;
          }

          let foundCenter = null;
          let foundBrand = null;
          let foundClass = '';

          if (centerCol !== -1 && dataRow[centerCol]) {
            foundCenter = normalizeCenterStr(String(dataRow[centerCol]));
          }
          if (!foundCenter) {
            for (const { val } of cellsInRange) {
              const testC = normalizeCenterStr(val);
              if (testC) {
                foundCenter = testC;
                break;
              }
            }
          }

          if (foundCenter) {
            lastSeenCenter = foundCenter;
          } else {
            foundCenter = lastSeenCenter;
          }

          if (!foundCenter) continue;

          if (brandCol !== -1 && dataRow[brandCol] !== undefined) {
            const rawB = String(dataRow[brandCol]).trim();
            if (rawB) foundBrand = normalizeBrandKey(rawB);
          }
          if (!foundBrand) {
            for (const { val } of cellsInRange) {
              if (val) {
                const b = normalizeBrandKey(val);
                if (b) {
                  foundBrand = b;
                  break;
                }
              }
            }
          }
          if (!foundBrand) {
            if (detectedComp === 'NDS For Car Service') foundBrand = 'Skoda';
            else if (detectedComp === 'NDS For Distribution') foundBrand = 'Rox';
            else if (detectedComp === 'N Auto Express') foundBrand = 'Hyundai';
            else foundBrand = 'Skoda';
          }

          if (classCol !== -1 && dataRow[classCol]) {
            foundClass = String(dataRow[classCol]).trim();
          }
          if (!foundClass) {
            for (const { val } of cellsInRange) {
              const vLow = val.toLowerCase();
              if (
                vLow.includes('maintenance') ||
                vLow.includes('body') ||
                vLow.includes('paint') ||
                vLow.includes('care') ||
                vLow.includes('goodwill') ||
                vLow.includes('guarantee') ||
                vLow.includes('صيانة') ||
                vLow.includes('ضمان')
              ) {
                foundClass = val;
                break;
              }
            }
          }

          const cntObj = CENTERS.find((cnt) => cnt.id === foundCenter);
          const city = cntObj ? cntObj.city : 'Cairo';

          let serviceType = 'Mechanical';
          let actualMechanical = 1;
          let weCare = 0;
          let goodwill = 0;
          let guarantee = 0;
          let bodyAndPaint = 0;

          const fLow = foundClass.toLowerCase();
          if (fLow.includes('body') || fLow.includes('paint') || fLow.includes('دهان') || fLow.includes('سمكرة')) {
            serviceType = 'Body and paint';
            actualMechanical = 0;
            bodyAndPaint = 1;
          } else if (fLow.includes('we care') || fLow.includes('wecare')) {
            serviceType = 'WE CARE';
            actualMechanical = 0;
            weCare = 1;
          } else if (fLow.includes('goodwill') || fLow.includes('good will')) {
            serviceType = 'GoodWill';
            actualMechanical = 0;
            goodwill = 1;
          } else if (fLow.includes('guarantee') || fLow.includes('ضمان')) {
            serviceType = 'Guarantee';
            actualMechanical = 0;
            guarantee = 1;
          }

          const key = `${detectedComp}|${foundCenter}|${foundBrand}|${serviceType}`;
          if (!aggMap.has(key)) {
            aggMap.set(key, {
              date: targetDate,
              company: detectedComp,
              center: foundCenter,
              city,
              serviceType,
              brand: foundBrand,
              bookingsCount: 0,
              actualMechanical,
              actualCarCare: 0,
              actualBoth: 0,
              cancelled: 0,
              weCare,
              goodwill,
              guarantee,
              bodyAndPaint,
            });
          } else {
            const existing = aggMap.get(key);
            existing.actualMechanical += actualMechanical;
            existing.weCare += weCare;
            existing.goodwill += goodwill;
            existing.guarantee += guarantee;
            existing.bodyAndPaint += bodyAndPaint;
          }

          companyCounts[detectedComp] = (companyCounts[detectedComp] || 0) + 1;
          totalParsed++;
        }
      }
    }
  }

  let idx = 1;
  aggMap.forEach((val) => {
    resultRecords.push({ ...val, id: `imported-${targetDate}-${idx++}` });
  });

  return { records: resultRecords, totalJobOrders: totalParsed, companyCounts };
}
