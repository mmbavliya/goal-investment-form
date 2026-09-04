// Gujarati Goal-Based Investment Planner Application Logic

// Purge any legacy profile saved in browser storage so Section 1 always stays blank
try {
  localStorage.removeItem('goal_form_user_profile');
} catch (e) {}

// Live Google Sheet / Google Drive Webhook URL (Direct sync to Master Investor Leads)
let GOOGLE_SHEET_WEBHOOK_URL = "https://script.google.com/macros/s/AKfycbylQZGGfd5EyfHUf-4CMYAjsbDQMdXNcuv2-Il_93jpy6Uuhrc2p_BiYpZjtg3XGkIiVA/exec"; 

let currentExpectedReturn = 12; // Default 12% for Moderate

// 24-Hour (1 Day) Cooldown Duration between Goal Submissions to prevent duplicate dumping
const COOLDOWN_HOURS = 24;
const COOLDOWN_MS = COOLDOWN_HOURS * 60 * 60 * 1000;
let cooldownTimerInterval = null;

document.addEventListener('DOMContentLoaded', () => {
  // Always ensure Section 1 fields start completely blank
  clearSection1Fields();

  if (window.lucide) {
    lucide.createIcons();
  }
  syncGoalCardStyles();
  syncPriorityCardStyles();
  syncRiskCardStyles();
  updateCalculationPreview();
  calculateAndShowSummary();
  checkOneTimeSubmissionStatus();

  // Advisor Shortcut: Press Ctrl + Shift + M (or Cmd + Shift + M) to view Master Lead Database
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'M' || e.key === 'm')) {
      e.preventDefault();
      openMasterLeadsModal();
    } else if (e.key === 'Escape') {
      closeMasterLeadsModal();
    }
  });
});

// Helper: Determine expected return rate based on checked risk radio
function getSelectedRiskReturn() {
  const selectedRisk = document.querySelector('input[name="riskProfile"]:checked')?.value || '';
  if (selectedRisk.includes('Conservative') || selectedRisk.includes('સુરક્ષિત')) return 9;
  if (selectedRisk.includes('Aggressive') || selectedRisk.includes('આક્રમક')) return 14;
  return 12; // Moderate default
}

// Check 24-hour cooldown status per user/device
function getSubmissionCooldownStatus() {
  const isSubmitted = localStorage.getItem('goal_form_user_submitted') === 'true';
  if (!isSubmitted) {
    return { isLocked: false, remainingMs: 0, expired: false };
  }

  const savedData = JSON.parse(localStorage.getItem('goal_form_submitted_user') || 'null');
  let submissionTime = 0;
  if (savedData && savedData.submittedAt) {
    submissionTime = new Date(savedData.submittedAt).getTime();
  }
  const rawTime = parseInt(localStorage.getItem('goal_form_last_submission_time') || '0', 10);
  if (!submissionTime || (rawTime && rawTime > submissionTime)) {
    submissionTime = rawTime;
  }

  if (!submissionTime || isNaN(submissionTime)) {
    return { isLocked: true, remainingMs: COOLDOWN_MS, unlockTime: Date.now() + COOLDOWN_MS, savedData };
  }

  const now = Date.now();
  const elapsed = now - submissionTime;

  if (elapsed >= COOLDOWN_MS) {
    // 24 hours (1 day) passed: Form can be reused for another goal!
    return { isLocked: false, remainingMs: 0, expired: true, savedData, unlockTime: submissionTime + COOLDOWN_MS };
  } else {
    // Still in cooldown period (< 24 hours)
    return { isLocked: true, remainingMs: COOLDOWN_MS - elapsed, expired: false, savedData, unlockTime: submissionTime + COOLDOWN_MS };
  }
}

// Format remaining milliseconds into Gujarati readable time
function formatCooldownTime(ms) {
  if (ms <= 0) return '૦ સેકન્ડ';
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (hours > 0) parts.push(`${hours} કલાક`);
  if (minutes > 0 || hours > 0) parts.push(`${minutes} મિનિટ`);
  parts.push(`${seconds} સેકન્ડ`);
  return parts.join(' ');
}

// Live Countdown Timer on Cooldown Banner
function startCooldownTimer(unlockTime) {
  if (cooldownTimerInterval) {
    clearInterval(cooldownTimerInterval);
    cooldownTimerInterval = null;
  }

  const updateTimer = () => {
    const now = Date.now();
    const remainingMs = Math.max(0, unlockTime - now);

    const countdownBadge = document.getElementById('cooldownCountdownBadge');
    if (countdownBadge) {
      countdownBadge.textContent = formatCooldownTime(remainingMs);
    }

    const unlockTimeEl = document.getElementById('cooldownUnlockTime');
    if (unlockTimeEl && unlockTime) {
      const d = new Date(unlockTime);
      const timeStr = d.toLocaleTimeString('gu-IN', { hour: '2-digit', minute: '2-digit' });
      const dateStr = d.toLocaleDateString('gu-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
      unlockTimeEl.textContent = `${dateStr}, ${timeStr}`;
    }

    if (remainingMs <= 0) {
      if (cooldownTimerInterval) {
        clearInterval(cooldownTimerInterval);
        cooldownTimerInterval = null;
      }
      unlockFormForNextGoalAuto();
    }
  };

  updateTimer();
  cooldownTimerInterval = setInterval(updateTimer, 1000);
}

// Auto-unlock form after 24 hours for submitting a second / different goal
function unlockFormForNextGoalAuto() {
  localStorage.removeItem('goal_form_user_submitted');

  const banner = document.getElementById('alreadySubmittedBanner');
  if (banner) banner.classList.add('hidden');

  const returningBanner = document.getElementById('returningUserWelcomeBanner');
  if (returningBanner) returningBanner.classList.remove('hidden');

  const form = document.getElementById('goalInvestmentForm');
  if (form) {
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(el => {
      el.disabled = false;
      el.classList.remove('bg-slate-100', 'cursor-not-allowed', 'opacity-85');
    });
  }

  const submitBtn = document.getElementById('submitFormBtn');
  const submitText = document.getElementById('submitBtnText');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.className = 'w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold text-base shadow-lg shadow-emerald-600/30 transition transform hover:-translate-y-0.5 flex items-center justify-center gap-2';
    if (submitText) {
      submitText.textContent = 'નવા ગોલ માટે રિપોર્ટ તૈયાર કરો (Generate Next Goal Report)';
    }
  }

  const resetBtn = document.getElementById('resetFormBtn');
  if (resetBtn) {
    resetBtn.disabled = false;
    resetBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  }

  // Keep Section 1 contact info blank for fresh entry
  clearSection1Fields();

  onInvestorDetailsInput();
  if (window.lucide) {
    lucide.createIcons();
  }
}

// Helper: Ensure all data fields in Section 1 are kept completely blank
function clearSection1Fields() {
  const fullNameEl = document.getElementById('fullName');
  if (fullNameEl) fullNameEl.value = '';

  const phoneEl = document.getElementById('phone');
  if (phoneEl) phoneEl.value = '';

  const emailEl = document.getElementById('email');
  if (emailEl) emailEl.value = '';

  const ageEl = document.getElementById('age');
  if (ageEl) ageEl.value = '';

  const occupationEl = document.getElementById('occupation');
  if (occupationEl) occupationEl.selectedIndex = 0;

  const annualIncomeEl = document.getElementById('annualIncome');
  if (annualIncomeEl) annualIncomeEl.selectedIndex = 0;
}

// Check and enforce 24-Hour Cooldown & One-Time per Day Submission
function checkOneTimeSubmissionStatus() {
  const status = getSubmissionCooldownStatus();
  if (status.isLocked) {
    lockFormAsSubmitted(status.savedData, status.unlockTime);
    startCooldownTimer(status.unlockTime);
  } else if (status.expired) {
    unlockFormForNextGoalAuto();
  } else {
    // Keep Section 1 data fields blank for fresh entry
    clearSection1Fields();
    onInvestorDetailsInput();
  }
}

// Helper: Format phone number cleanly
function cleanPhoneNumber(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return digits.slice(0, 10);
}

// Dynamic Section 1 Completion Checker & Sections 2-4 Gatekeeper
function onInvestorDetailsInput() {
  const fullNameEl = document.getElementById('fullName');
  const phoneEl = document.getElementById('phone');
  const emailEl = document.getElementById('email');
  const ageEl = document.getElementById('age');

  const fullName = fullNameEl?.value?.trim() || '';
  
  // Clean phone input
  if (phoneEl) {
    const raw = phoneEl.value || '';
    const clean = cleanPhoneNumber(raw);
    if (phoneEl.value !== clean && raw.replace(/\D/g, '').length >= 10) {
      phoneEl.value = clean;
    }
  }
  const phone = cleanPhoneNumber(phoneEl?.value?.trim() || '');

  const email = emailEl?.value?.trim() || '';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isEmailValid = emailRegex.test(email);

  const ageInput = ageEl?.value?.trim() || '';
  const ageVal = ageInput !== '' ? parseInt(ageInput, 10) : null;
  const isAgeValid = ageVal !== null && !isNaN(ageVal) && ageVal >= 18 && ageVal <= 100;

  const isSubmitted = localStorage.getItem('goal_form_user_submitted') === 'true';

  calculateAndShowSummary();

  if (isSubmitted) return;

  const gatedSection = document.getElementById('gatedCalculatorSections');
  const lockNotice = document.getElementById('calculatorLockNotice');
  const lockNoticeIcon = document.getElementById('lockNoticeIcon');
  const lockNoticeTitle = document.getElementById('lockNoticeTitle');
  const lockNoticeSub = document.getElementById('lockNoticeSub');
  const lockNoticeBadge = document.getElementById('lockNoticeBadge');

  const isNameValid = fullName.length >= 2;
  const isPhoneValid = phone.length === 10;
  const isValid = isNameValid && isPhoneValid && isEmailValid && isAgeValid;

  if (isValid) {
    // Unlock sections 2-4
    if (gatedSection) {
      gatedSection.classList.remove('opacity-40', 'pointer-events-none', 'select-none');
    }
    if (lockNotice) {
      lockNotice.className = 'p-4 sm:p-5 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-emerald-900 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all duration-300';
    }
    if (lockNoticeIcon) {
      lockNoticeIcon.className = 'p-2.5 bg-emerald-200/70 text-emerald-800 rounded-xl shrink-0';
      lockNoticeIcon.innerHTML = '<i data-lucide="check-circle" class="w-5 h-5"></i>';
    }
    if (lockNoticeTitle) {
      lockNoticeTitle.textContent = 'રોકાણકાર વિગતો માન્ય છે! ✅ (Calculator Unlocked)';
    }
    if (lockNoticeSub) {
      lockNoticeSub.innerHTML = 'હવે નીચે તમારા <strong>નાણાકીય લક્ષ્ય, સમયગાળો અને રોકાણ ક્ષમતા</strong> પસંદ કરો.';
    }
    if (lockNoticeBadge) {
      lockNoticeBadge.className = 'text-xs font-bold px-3 py-1 rounded-full bg-emerald-200/80 text-emerald-800 border border-emerald-300 shrink-0';
      lockNoticeBadge.textContent = 'અનલૉક થયેલ છે';
    }
  } else {
    // Keep locked
    if (gatedSection) {
      gatedSection.classList.add('opacity-40', 'pointer-events-none', 'select-none');
    }
    if (lockNotice) {
      lockNotice.className = 'p-4 sm:p-5 rounded-2xl bg-amber-50 border-2 border-amber-300 text-amber-900 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 transition-all duration-300';
    }
    if (lockNoticeIcon) {
      lockNoticeIcon.className = 'p-2.5 bg-amber-200/70 text-amber-800 rounded-xl shrink-0';
      lockNoticeIcon.innerHTML = '<i data-lucide="lock" class="w-5 h-5"></i>';
    }
    if (lockNoticeTitle) {
      lockNoticeTitle.textContent = 'ગોલ પસંદગી અને SIP કેલ્ક્યુલેટર લૉક છે 🔒';
    }
    if (lockNoticeSub) {
      if (!isNameValid) {
        lockNoticeSub.innerHTML = 'આગળ વધવા માટે કૃપા કરીને ઉપર તમારું <strong>પૂરું નામ</strong> દાખલ કરો.';
      } else if (!isPhoneValid) {
        lockNoticeSub.innerHTML = 'કૃપા કરીને સંપર્ક માટે <strong>૧૦ આંકડાનો મોબાઈલ નંબર</strong> દાખલ કરો.';
      } else if (!isEmailValid) {
        lockNoticeSub.innerHTML = 'કૃપા કરીને માન્ય <strong>ઈમેલ એડ્રેસ</strong> દાખલ કરો (દા.ત. name@example.com).';
      } else if (ageVal !== null && ageVal < 18) {
        lockNoticeSub.innerHTML = '⚠️ <strong>ઉંમર ઓછામાં ઓછી ૧૮ વર્ષ હોવી જરૂરી છે.</strong> કૃપા કરીને સાચી ઉંમર દાખલ કરો.';
      } else if (ageVal !== null && ageVal > 100) {
        lockNoticeSub.innerHTML = '⚠️ કૃપા કરીને માન્ય <strong>ઉંમર (૧૮ થી ૧૦૦ વર્ષ)</strong> દાખલ કરો.';
      } else if (!isAgeValid) {
        lockNoticeSub.innerHTML = 'કૃપા કરીને તમારી <strong>ઉંમર (૧૮ વર્ષ કે તેથી વધુ)</strong> દાખલ કરો.';
      } else {
        lockNoticeSub.innerHTML = 'આગળ વધવા માટે કૃપા કરીને ઉપર <strong>વિભાગ ૧</strong> ની તમામ વિગતો દાખલ કરો.';
      }
    }
    if (lockNoticeBadge) {
      lockNoticeBadge.className = 'text-xs font-bold px-3 py-1 rounded-full bg-amber-200/80 text-amber-800 border border-amber-300 shrink-0';
      lockNoticeBadge.textContent = (ageVal !== null && (ageVal < 18 || ageVal > 100)) ? 'ઉંમર ૧૮+ જરૂરી' : 'વિભાગ ૧ જરૂરી છે';
    }
  }

  if (window.lucide) {
    lucide.createIcons();
  }
}

// Lock form controls when submission is completed
function lockFormAsSubmitted(data = null, unlockTime = null) {
  // Show already submitted banner
  const banner = document.getElementById('alreadySubmittedBanner');
  if (banner) {
    banner.classList.remove('hidden');
  }

  // Hide returning user welcome banner if active
  const returningBanner = document.getElementById('returningUserWelcomeBanner');
  if (returningBanner) {
    returningBanner.classList.add('hidden');
  }

  // Reveal summary report
  const summaryEl = document.getElementById('summaryReportSection');
  if (summaryEl) {
    summaryEl.classList.remove('hidden');
  }

  // Unlock sections from blur
  const gatedSection = document.getElementById('gatedCalculatorSections');
  if (gatedSection) {
    gatedSection.classList.remove('opacity-40', 'pointer-events-none', 'select-none');
  }

  // Hide lock notice
  const lockNotice = document.getElementById('calculatorLockNotice');
  if (lockNotice) {
    lockNotice.classList.add('hidden');
  }

  // Always keep Section 1 contact fields completely blank as requested
  clearSection1Fields();

  // Populate saved goal & calculator data if available
  if (data) {
    if (data.targetAmount && document.getElementById('targetAmount')) document.getElementById('targetAmount').value = data.targetAmount;
    if (data.targetYears && document.getElementById('targetYears')) document.getElementById('targetYears').value = data.targetYears;
    if (data.currentSavings && document.getElementById('currentSavings')) document.getElementById('currentSavings').value = data.currentSavings;
    if (data.monthlyBudget && document.getElementById('monthlyBudget')) document.getElementById('monthlyBudget').value = data.monthlyBudget;
    if (data.investmentMode && document.getElementById('investmentMode')) document.getElementById('investmentMode').value = data.investmentMode;
    if (data.remarks && document.getElementById('investorRemarks')) document.getElementById('investorRemarks').value = data.remarks;
    if (typeof data.includeInflation === 'boolean' && document.getElementById('includeInflation')) {
      document.getElementById('includeInflation').checked = data.includeInflation;
    }
    
    if (data.primaryGoal) {
      document.querySelectorAll('input[name="primaryGoal"]').forEach(radio => {
        if (radio.value === data.primaryGoal || radio.value.startsWith(data.primaryGoal) || data.primaryGoal.startsWith(radio.value)) {
          radio.checked = true;
        }
      });
    }
    if (data.goalPriority) {
      document.querySelectorAll('input[name="goalPriority"]').forEach(radio => {
        if (radio.value === data.goalPriority || radio.value.startsWith(data.goalPriority) || data.goalPriority.startsWith(radio.value)) {
          radio.checked = true;
        }
      });
    }
    if (data.riskProfile) {
      document.querySelectorAll('input[name="riskProfile"]').forEach(radio => {
        if (radio.value === data.riskProfile || radio.value.startsWith(data.riskProfile) || data.riskProfile.startsWith(radio.value)) {
          radio.checked = true;
        }
      });
    }
  }

  // Update expected return based on loaded risk
  currentExpectedReturn = getSelectedRiskReturn();

  // Disable form inputs during the 24-hour cooldown
  const form = document.getElementById('goalInvestmentForm');
  if (form) {
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(el => {
      el.disabled = true;
      el.classList.add('bg-slate-100', 'cursor-not-allowed', 'opacity-85');
    });
  }

  // Update Submit Button to locked state with remaining time hint
  const submitBtn = document.getElementById('submitFormBtn');
  const submitText = document.getElementById('submitBtnText');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.className = 'w-full sm:w-auto px-8 py-3.5 rounded-xl bg-slate-600 text-white font-bold text-base shadow cursor-not-allowed opacity-90 flex items-center justify-center gap-2';
    if (submitText) {
      submitText.textContent = '🔒 આજનો રિપોર્ટ સબમિટ થયેલ છે (Locked for 24h)';
    }
  }

  // Hide or disable reset button
  const resetBtn = document.getElementById('resetFormBtn');
  if (resetBtn) {
    resetBtn.disabled = true;
    resetBtn.classList.add('opacity-50', 'cursor-not-allowed');
  }

  syncGoalCardStyles();
  syncPriorityCardStyles();
  syncRiskCardStyles();
  updateCalculationPreview();
  calculateAndShowSummary();
  if (window.lucide) {
    lucide.createIcons();
  }
}

// Advisor / Testing: Unlock form for a new client / user immediately
function unlockFormForNewUser(promptConfirm = true) {
  if (promptConfirm && !confirm('શું તમે ૨૪ કલાકની લિમિટ રીસેટ કરીને નવા રોકાણકાર માટે ફોર્મ અનલોક કરવા માંગો છો?')) {
    return;
  }

  if (cooldownTimerInterval) {
    clearInterval(cooldownTimerInterval);
    cooldownTimerInterval = null;
  }

  localStorage.removeItem('goal_form_user_submitted');
  localStorage.removeItem('goal_form_submitted_user');
  localStorage.removeItem('goal_form_last_submission_time');
  localStorage.removeItem('goal_form_user_profile');

  // Hide banners
  const banner = document.getElementById('alreadySubmittedBanner');
  if (banner) {
    banner.classList.add('hidden');
  }
  const returningBanner = document.getElementById('returningUserWelcomeBanner');
  if (returningBanner) {
    returningBanner.classList.add('hidden');
  }

  // Hide summary report
  const summaryEl = document.getElementById('summaryReportSection');
  if (summaryEl) {
    summaryEl.classList.add('hidden');
  }

  // Show lock notice
  const lockNotice = document.getElementById('calculatorLockNotice');
  if (lockNotice) {
    lockNotice.classList.remove('hidden');
  }

  // Enable form inputs and reset
  const form = document.getElementById('goalInvestmentForm');
  if (form) {
    form.reset();
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(el => {
      el.disabled = false;
      el.classList.remove('bg-slate-100', 'cursor-not-allowed', 'opacity-85');
    });
  }
  clearSection1Fields();

  // Restore Submit Button
  const submitBtn = document.getElementById('submitFormBtn');
  const submitText = document.getElementById('submitBtnText');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.className = 'w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 text-white font-bold text-base shadow-lg shadow-emerald-600/30 transition transform hover:-translate-y-0.5 flex items-center justify-center gap-2';
    if (submitText) {
      submitText.textContent = 'ગોલ પ્લાનિંગ રિપોર્ટ તૈયાર કરો (Generate Report)';
    }
  }

  // Restore Reset Button
  const resetBtn = document.getElementById('resetFormBtn');
  if (resetBtn) {
    resetBtn.disabled = false;
    resetBtn.classList.remove('opacity-50', 'cursor-not-allowed');
  }

  currentExpectedReturn = 12;
  syncGoalCardStyles();
  syncPriorityCardStyles();
  syncRiskCardStyles();
  updateCalculationPreview();
  calculateAndShowSummary();
  onInvestorDetailsInput();

  closeMasterLeadsModal();
  if (window.lucide) {
    lucide.createIcons();
  }

  alert('✅ ફોર્મ સફળતાપૂર્વક અનલોક થઈ ગયું છે. હવે નવા રોકાણકાર માટે ફોર્મ ભરી શકાશે.');
}

// Check if mobile number has already been used within the 24-hour cooldown
function isPhoneNumberDuplicate(phone) {
  if (!phone) return false;
  const cleanPhone = cleanPhoneNumber(phone);
  if (cleanPhone.length !== 10) return false;

  const existingLeads = JSON.parse(localStorage.getItem('goal_form_leads') || '[]');
  const now = Date.now();
  return existingLeads.some(lead => {
    const leadPhone = cleanPhoneNumber(lead['મોબાઈલ નંબર'] || '');
    if (leadPhone !== cleanPhone) return false;
    const leadTime = lead.timestamp ? new Date(lead.timestamp).getTime() : 0;
    if (leadTime && (now - leadTime) < COOLDOWN_MS) {
      return true; // submitted within last 24 hours
    }
    return false;
  });
}

// Smooth scroll to summary report
function scrollToSummaryReport() {
  const summaryEl = document.getElementById('summaryReportSection');
  if (summaryEl) {
    summaryEl.classList.remove('hidden');
    summaryEl.scrollIntoView({ behavior: 'smooth' });
  }
}

// Hidden Background Submission to Advisor's Email & Google Sheet / Drive
async function sendHiddenSubmission() {
  try {
    const fullName = document.getElementById('fullName')?.value?.trim() || '';
    const phone = cleanPhoneNumber(document.getElementById('phone')?.value?.trim() || '');
    const email = document.getElementById('email')?.value?.trim() || '';
    
    // Guard against blank/dummy submission (e.g. print before filling)
    if (fullName.length < 2 || phone.length !== 10) {
      return;
    }

    const age = document.getElementById('age')?.value || 'N/A';
    const occupation = document.getElementById('occupation')?.value || 'N/A';
    const annualIncome = document.getElementById('annualIncome')?.value || 'N/A';

    const selectedGoal = document.querySelector('input[name="primaryGoal"]:checked')?.value || 'N/A';
    const selectedPriority = document.querySelector('input[name="goalPriority"]:checked')?.value || 'N/A';
    const targetAmount = document.getElementById('targetAmount')?.value || '0';
    const targetYears = document.getElementById('targetYears')?.value || '0';
    const currentSavings = document.getElementById('currentSavings')?.value || '0';
    const includeInflation = document.getElementById('includeInflation')?.checked ? 'હા (Yes - 6% Inflation)' : 'ના (No)';

    const riskProfile = document.querySelector('input[name="riskProfile"]:checked')?.value || 'N/A';
    const monthlyBudget = document.getElementById('monthlyBudget')?.value || '0';
    const investmentMode = document.getElementById('investmentMode')?.value || 'N/A';
    const remarks = document.getElementById('investorRemarks')?.value?.trim() || 'None';

    const futureCorpus = document.getElementById('resFutureTargetAmount')?.textContent || 'N/A';
    const requiredSIP = document.getElementById('resRequiredMonthlySIP')?.textContent || 'N/A';
    const totalInvest = document.getElementById('resTotalInvestmentAmount')?.textContent || 'N/A';
    const estReturns = document.getElementById('resEstimatedReturns')?.textContent || 'N/A';

    const submissionData = {
      _subject: `🎯 નવું ગોલ રોકાણ ફોર્મ લીડ: ${fullName} (${phone})`,
      "રોકાણકારનું નામ": fullName,
      "મોબાઈલ નંબર": phone,
      "ઈમેલ": email || 'N/A',
      "ઉંમર": `${age} વર્ષ`,
      "વ્યવસાય": occupation,
      "વાર્ષિક આવક": annualIncome,
      "પસંદ કરેલ લક્ષ્ય": selectedGoal,
      "લક્ષ્ય પ્રાથમિકતા": selectedPriority,
      "લક્ષ્ય રકમ (હાલના મૂલ્ય)": `₹ ${Number(targetAmount).toLocaleString('en-IN')}`,
      "સમયગાળો": `${targetYears} વર્ષ (${Math.round(Number(targetYears) * 12)} મહિના)`,
      "હાલની બચત": `₹ ${Number(currentSavings).toLocaleString('en-IN')}`,
      "મોંઘવારી ગણતરી": includeInflation,
      "જોખમ ક્ષમતા (Risk)": riskProfile,
      "માસિક રોકાણ ક્ષમતા": `₹ ${Number(monthlyBudget).toLocaleString('en-IN')}`,
      "રોકાણ મોડ": investmentMode,
      "વિશેષ નોંધ / પ્રશ્ન": remarks,
      "--- નાણાકીય પરિણામ ---": "-------------------------",
      "જરૂરી માસિક SIP": requiredSIP,
      "લક્ષ્ય સમયે ભવિષ્યનું ફંડ": futureCorpus,
      "કુલ SIP રોકાણ": totalInvest,
      "અંદાજિત વળતર/નફો": estReturns,
      "સબમિશન સમય": new Date().toLocaleString('gu-IN')
    };

    // Save locally as backup master database
    const existingLeads = JSON.parse(localStorage.getItem('goal_form_leads') || '[]');
    existingLeads.unshift({ ...submissionData, timestamp: new Date().toISOString() });
    localStorage.setItem('goal_form_leads', JSON.stringify(existingLeads.slice(0, 500)));

    // Direct Live Google Drive Sheet Webhook Sync
    if (GOOGLE_SHEET_WEBHOOK_URL && GOOGLE_SHEET_WEBHOOK_URL.startsWith('http')) {
      fetch(GOOGLE_SHEET_WEBHOOK_URL, {
        method: "POST",
        mode: "no-cors",
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(submissionData)
      }).catch(err => {
        console.warn("Google Sheet sync notice:", err);
      });
    }
  } catch (err) {
    console.error("Master sheet submission error:", err);
  }
}

// Print Handler (Submits in background only if not already submitted, before printing)
function handlePrintReport() {
  calculateAndShowSummary();
  const summaryEl = document.getElementById('summaryReportSection');
  if (summaryEl) {
    summaryEl.classList.remove('hidden');
  }
  const isSubmitted = localStorage.getItem('goal_form_user_submitted') === 'true';
  if (!isSubmitted) {
    sendHiddenSubmission();
  }
  setTimeout(() => {
    window.print();
  }, 150);
}

// Form Submission Handler with 24-Hour Cooldown Enforcement per User
function onFormSubmit() {
  // Check 1: Is this device in active 24-hour cooldown?
  const cooldownStatus = getSubmissionCooldownStatus();
  if (cooldownStatus.isLocked) {
    const remainingText = formatCooldownTime(cooldownStatus.remainingMs);
    alert(`⚠️ તમે આ ફોર્મ અગાઉ સબમિટ કરેલું છે.\n\nડુપ્લિકેટ ડેટા અટકાવવા માટે ૧ દિવસમાં ૧ રિપોર્ટ માન્ય છે.\nઅન્ય લક્ષ્ય (Second Goal) માટે તમે હજુ [ ${remainingText} ] પછી નવો રિપોર્ટ બનાવી શકશો.\n\nતમારો વર્તમાન રિપોર્ટ નીચે જોઈ શકો છો.`);
    scrollToSummaryReport();
    return;
  }

  const fullName = document.getElementById('fullName')?.value?.trim() || '';
  if (fullName.length < 2) {
    alert('⚠️ કૃપા કરીને તમારું પૂરું નામ દાખલ કરો.');
    document.getElementById('fullName')?.focus();
    return;
  }

  const rawPhone = document.getElementById('phone')?.value?.trim() || '';
  const phone = cleanPhoneNumber(rawPhone);
  if (phone.length !== 10) {
    alert('⚠️ કૃપા કરીને ૧૦ આંકડાનો માન્ય મોબાઈલ નંબર દાખલ કરો.');
    document.getElementById('phone')?.focus();
    return;
  }

  // Check 2: Has this phone number already been submitted in the last 24 hours?
  if (isPhoneNumberDuplicate(phone)) {
    alert(`⚠️ આ મોબાઈલ નંબર (${phone}) પરથી છેલ્લા ૨૪ કલાકમાં ફોર્મ સબમિટ થયેલ છે.\n\nડુપ્લિકેટ ડેટા રોકવા માટે કૃપા કરીને ૨૪ કલાક પછી અન્ય લક્ષ્ય માટે નવો રિપોર્ટ બનાવો.`);
    scrollToSummaryReport();
    return;
  }

  // Check 3: Is Email valid?
  const email = document.getElementById('email')?.value?.trim() || '';
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    alert('⚠️ કૃપા કરીને સાચું ઈમેલ એડ્રેસ દાખલ કરો (દા.ત. name@example.com).');
    document.getElementById('email')?.focus();
    return;
  }

  // Check 4: Is age at least 18 years?
  const ageVal = parseInt(document.getElementById('age')?.value, 10);
  if (isNaN(ageVal) || ageVal < 18 || ageVal > 100) {
    alert('⚠️ રોકાણકારની ઉંમર ઓછામાં ઓછી ૧૮ વર્ષ અને વધુમાં વધુ ૧૦૦ વર્ષ હોવી જરૂરી છે.');
    document.getElementById('age')?.focus();
    return;
  }

  // Check 4b: Is Occupation selected?
  const occupation = document.getElementById('occupation')?.value?.trim() || '';
  if (!occupation) {
    alert('⚠️ કૃપા કરીને તમારો વ્યવસાય (Occupation) પસંદ કરો.');
    document.getElementById('occupation')?.focus();
    return;
  }

  // Check 4c: Is Annual Income selected?
  const annualIncome = document.getElementById('annualIncome')?.value?.trim() || '';
  if (!annualIncome) {
    alert('⚠️ કૃપા કરીને તમારી વાર્ષિક આવક (Annual Income) પસંદ કરો.');
    document.getElementById('annualIncome')?.focus();
    return;
  }

  // Check 5: Target Amount & Horizon
  const targetAmount = parseFloat(document.getElementById('targetAmount')?.value) || 0;
  if (targetAmount < 10000) {
    alert('⚠️ કૃપા કરીને લક્ષ્ય રકમ ઓછામાં ઓછી ₹ ૧૦,૦૦૦ દાખલ કરો.');
    document.getElementById('targetAmount')?.focus();
    return;
  }

  const targetYears = parseFloat(document.getElementById('targetYears')?.value) || 0;
  if (targetYears < 1 || targetYears > 50) {
    alert('⚠️ કૃપા કરીને લક્ષ્ય સમયગાળો ૧ થી ૫૦ વર્ષ વચ્ચે દાખલ કરો.');
    document.getElementById('targetYears')?.focus();
    return;
  }

  // Check 6: Monthly Budget
  const monthlyBudget = parseFloat(document.getElementById('monthlyBudget')?.value) || 0;
  if (monthlyBudget < 500) {
    alert('⚠️ કૃપા કરીને માસિક રોકાણ ક્ષમતા ઓછામાં ઓછી ₹ ૫૦૦ દાખલ કરો.');
    document.getElementById('monthlyBudget')?.focus();
    return;
  }

  // Calculate & finalize report
  calculateAndShowSummary();
  
  const now = Date.now();
  const unlockTime = now + COOLDOWN_MS;

  // Create snapshot of user's submission
  const userSnapshot = {
    fullName: fullName,
    phone: phone,
    email: email,
    age: ageVal,
    occupation: document.getElementById('occupation')?.value || '',
    annualIncome: document.getElementById('annualIncome')?.value || '',
    primaryGoal: document.querySelector('input[name="primaryGoal"]:checked')?.value || '',
    goalPriority: document.querySelector('input[name="goalPriority"]:checked')?.value || '',
    targetAmount: document.getElementById('targetAmount')?.value || '0',
    targetYears: document.getElementById('targetYears')?.value || '0',
    currentSavings: document.getElementById('currentSavings')?.value || '0',
    includeInflation: document.getElementById('includeInflation')?.checked ?? true,
    riskProfile: document.querySelector('input[name="riskProfile"]:checked')?.value || '',
    monthlyBudget: document.getElementById('monthlyBudget')?.value || '0',
    investmentMode: document.getElementById('investmentMode')?.value || '',
    remarks: document.getElementById('investorRemarks')?.value || '',
    submittedAt: new Date(now).toISOString()
  };

  // Perform background submission
  sendHiddenSubmission();

  // Mark device as submitted and store snapshot + timestamp
  localStorage.setItem('goal_form_last_submission_time', String(now));
  localStorage.setItem('goal_form_user_submitted', 'true');
  localStorage.setItem('goal_form_submitted_user', JSON.stringify(userSnapshot));
  
  // Lock form for 24 hours
  lockFormAsSubmitted(userSnapshot, unlockTime);
  startCooldownTimer(unlockTime);

  // Friendly Gujarati confirmation alert explaining the 24-hour reuse rule
  alert('🎉 ધન્યવાદ! તમારો ગોલ પ્લાનિંગ રિપોર્ટ સફળતાપૂર્વક સબમિટ થઈ ગયો છે.\n\nડુપ્લિકેટ ડેટા અટકાવવા માટે ૧ દિવસમાં ૧ સબમિશન માન્ય છે. તમે ૨૪ કલાક પછી તમારા અન્ય લક્ષ્ય (Second Goal) માટે નવો રિપોર્ટ બનાવી શકશો.\n\nતમારો ગોલ પ્લાનિંગ રિપોર્ટ નીચે તૈયાર છે.');

  scrollToSummaryReport();
}

// Export Master Excel / CSV File (Ready for Google Drive & Microsoft Excel)
function downloadMasterExcel() {
  const leads = JSON.parse(localStorage.getItem('goal_form_leads') || '[]');
  if (!leads || leads.length === 0) {
    alert('હાલમાં કોઈ સેવ થયેલ લીડ્સ નથી. જ્યારે કોઈ ફોર્મ ભરશે ત્યારે અહીં માસ્ટર ડેટા આવી જશે.');
    return;
  }

  const headers = [
    'તારીખ & સમય',
    'રોકાણકારનું નામ',
    'મોબાઈલ નંબર',
    'ઈમેલ',
    'ઉંમર',
    'વ્યવસાય',
    'વાર્ષિક આવક',
    'પસંદ કરેલ લક્ષ્ય',
    'લક્ષ્ય પ્રાથમિકતા',
    'લક્ષ્ય રકમ (₹)',
    'સમયગાળો',
    'હાલની બચત (₹)',
    'મોંઘવારી ગણતરી',
    'જોખમ ક્ષમતા',
    'માસિક રોકાણ ક્ષમતા (₹)',
    'રોકાણ મોડ',
    'જરૂરી માસિક SIP',
    'ભવિષ્યનું ફંડ (Maturity)',
    'કુલ રોકાણ',
    'અંદાજિત વળતર',
    'વિશેષ નોંધ'
  ];

  const escapeCSV = (val) => `"${String(val || '').replace(/"/g, '""')}"`;

  const rows = leads.map(l => [
    escapeCSV(l['સબમિશન સમય']),
    escapeCSV(l['રોકાણકારનું નામ']),
    escapeCSV(l['મોબાઈલ નંબર']),
    escapeCSV(l['ઈમેલ']),
    escapeCSV(l['ઉંમર']),
    escapeCSV(l['વ્યવસાય']),
    escapeCSV(l['વાર્ષિક આવક']),
    escapeCSV(l['પસંદ કરેલ લક્ષ્ય']),
    escapeCSV(l['લક્ષ્ય પ્રાથમિકતા']),
    escapeCSV(l['લક્ષ્ય રકમ (હાલના મૂલ્ય)']),
    escapeCSV(l['સમયગાળો']),
    escapeCSV(l['હાલની બચત']),
    escapeCSV(l['મોંઘવારી ગણતરી']),
    escapeCSV(l['જોખમ ક્ષમતા (Risk)']),
    escapeCSV(l['માસિક રોકાણ ક્ષમતા']),
    escapeCSV(l['રોકાણ મોડ']),
    escapeCSV(l['જરૂરી માસિક SIP']),
    escapeCSV(l['લક્ષ્ય સમયે ભવિષ્યનું ફંડ']),
    escapeCSV(l['કુલ SIP રોકાણ']),
    escapeCSV(l['અંદાજિત વળતર/નફો']),
    escapeCSV(l['વિશેષ નોંધ / પ્રશ્ન'])
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `Master_Investor_Leads_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// 1-Click Copy Data formatted for Google Sheets
function copyLeadsForGoogleSheets() {
  const leads = JSON.parse(localStorage.getItem('goal_form_leads') || '[]');
  if (!leads || leads.length === 0) {
    alert('કોઈ સેવ થયેલ રેકોર્ડ્સ નથી.');
    return;
  }

  const headers = [
    'તારીખ & સમય',
    'રોકાણકારનું નામ',
    'મોબાઈલ નંબર',
    'ઈમેલ',
    'ઉંમર',
    'વ્યવસાય',
    'વાર્ષિક આવક',
    'પસંદ કરેલ લક્ષ્ય',
    'લક્ષ્ય પ્રાથમિકતા',
    'લક્ષ્ય રકમ (હાલના મૂલ્ય)',
    'સમયગાળો',
    'હાલની બચત',
    'મોંઘવારી ગણતરી',
    'જોખમ ક્ષમતા',
    'માસિક રોકાણ ક્ષમતા',
    'રોકાણ મોડ',
    'જરૂરી માસિક SIP',
    'ભવિષ્યનું ફંડ',
    'કુલ SIP રોકાણ',
    'અંદાજિત વળતર',
    'વિશેષ નોંધ'
  ];

  const cleanTSV = (str) => String(str || '').replace(/[\t\r\n]/g, ' ');

  const rows = leads.map(l => [
    cleanTSV(l['સબમિશન સમય']),
    cleanTSV(l['રોકાણકારનું નામ']),
    cleanTSV(l['મોબાઈલ નંબર']),
    cleanTSV(l['ઈમેલ']),
    cleanTSV(l['ઉંમર']),
    cleanTSV(l['વ્યવસાય']),
    cleanTSV(l['વાર્ષિક આવક']),
    cleanTSV(l['પસંદ કરેલ લક્ષ્ય']),
    cleanTSV(l['લક્ષ્ય પ્રાથમિકતા']),
    cleanTSV(l['લક્ષ્ય રકમ (હાલના મૂલ્ય)']),
    cleanTSV(l['સમયગાળો']),
    cleanTSV(l['હાલની બચત']),
    cleanTSV(l['મોંઘવારી ગણતરી']),
    cleanTSV(l['જોખમ ક્ષમતા (Risk)']),
    cleanTSV(l['માસિક રોકાણ ક્ષમતા']),
    cleanTSV(l['રોકાણ મોડ']),
    cleanTSV(l['જરૂરી માસિક SIP']),
    cleanTSV(l['લક્ષ્ય સમયે ભવિષ્યનું ફંડ']),
    cleanTSV(l['કુલ SIP રોકાણ']),
    cleanTSV(l['અંદાજિત વળતર/નફો']),
    cleanTSV(l['વિશેષ નોંધ / પ્રશ્ન'])
  ]);

  const tsvContent = [headers.join('\t'), ...rows.map(e => e.join('\t'))].join('\n');
  navigator.clipboard.writeText(tsvContent).then(() => {
    alert('✅ તમામ રેકોર્ડ્સ ક્લિપબોર્ડમાં કોપી થઈ ગયા છે!\n\nહવે નવી Google Sheet ખુલશે, તેમાં Cell A1 પર ક્લિક કરીને માત્ર (Ctrl + V) દબાવો. બધો જ ડેટા સરસ રીતે ગોઠવાઈ જશે.');
    window.open('https://sheets.new', '_blank');
  }).catch(() => {
    downloadMasterExcel();
  });
}

// Sync All Past Leads to Google Sheet in 1 Click
async function syncAllLeadsToGoogleSheet() {
  const leads = JSON.parse(localStorage.getItem('goal_form_leads') || '[]');
  if (!leads || leads.length === 0) {
    alert('કોઈ સેવ થયેલ રેકોર્ડ્સ નથી.');
    return;
  }

  if (!GOOGLE_SHEET_WEBHOOK_URL) {
    alert('Google Sheet Webhook URL સેટ નથી.');
    return;
  }

  let count = 0;
  for (const lead of leads) {
    try {
      await fetch(GOOGLE_SHEET_WEBHOOK_URL, {
        method: "POST",
        mode: "no-cors",
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(lead)
      });
      count++;
    } catch (err) {
      console.warn("Sync notice:", err);
    }
  }

  alert(`✅ સફળતાપૂર્વક ${count} રેકોર્ડ્સ તમારી Google Drive ની Master Sheet માં અપલોડ થઈ ગયા છે!\nતમારી Google Sheet રિફ્રેશ કરીને જુઓ.`);
}

// Delete single lead by index
function deleteLeadByIndex(index) {
  const leads = JSON.parse(localStorage.getItem('goal_form_leads') || '[]');
  if (index < 0 || index >= leads.length) return;

  const leadName = leads[index]['રોકાણકારનું નામ'] || 'આ લીડ';
  if (confirm(`શું તમે ${leadName} નો રેકોર્ડ ડિલીટ કરવા માંગો છો?`)) {
    leads.splice(index, 1);
    localStorage.setItem('goal_form_leads', JSON.stringify(leads));
    openMasterLeadsModal();
  }
}

// Clear all leads from localStorage
function clearAllLeads() {
  const leads = JSON.parse(localStorage.getItem('goal_form_leads') || '[]');
  if (leads.length === 0) {
    alert('કોઈ રેકોર્ડ્સ નથી.');
    return;
  }

  if (confirm('⚠️ ચેતવણી: શું તમે તમામ સેવ થયેલ લીડ્સ ડેટાબેઝમાંથી કાયમ માટે ડિલીટ કરવા માંગો છો?')) {
    localStorage.removeItem('goal_form_leads');
    openMasterLeadsModal();
    alert('તમામ લીડ્સ ડેટાબેઝ સફળતાપૂર્વક ક્લીયર થઈ ગયો છે.');
  }
}

// View and preview specific lead in Summary Report
function viewLeadReport(index) {
  const leads = JSON.parse(localStorage.getItem('goal_form_leads') || '[]');
  if (index < 0 || index >= leads.length) return;

  const lead = leads[index];
  closeMasterLeadsModal();

  // Populate Summary Report directly
  const resInvestorName = document.getElementById('resInvestorName');
  if (resInvestorName) resInvestorName.textContent = lead['રોકાણકારનું નામ'] || '-';

  const resInvestorContact = document.getElementById('resInvestorContact');
  if (resInvestorContact) resInvestorContact.textContent = `મો: ${lead['મોબાઈલ નંબર'] || '-'}`;

  const resGoalName = document.getElementById('resGoalName');
  if (resGoalName) resGoalName.textContent = (lead['પસંદ કરેલ લક્ષ્ય'] || 'નાણાકીય લક્ષ્ય').split('(')[0].trim();

  const resGoalHorizon = document.getElementById('resGoalHorizon');
  if (resGoalHorizon) resGoalHorizon.textContent = `સમયગાળો: ${lead['સમયગાળો'] || '-'}`;

  const resFutureTargetAmount = document.getElementById('resFutureTargetAmount');
  if (resFutureTargetAmount) resFutureTargetAmount.textContent = lead['લક્ષ્ય સમયે ભવિષ્યનું ફંડ'] || lead['લક્ષ્ય રકમ (હાલના મૂલ્ય)'] || '-';

  const resInflationStatus = document.getElementById('resInflationStatus');
  if (resInflationStatus) resInflationStatus.textContent = lead['મોંઘવારી ગણતરી'] || '';

  const resRequiredMonthlySIP = document.getElementById('resRequiredMonthlySIP');
  if (resRequiredMonthlySIP) resRequiredMonthlySIP.textContent = lead['જરૂરી માસિક SIP'] || '-';

  const resTotalInvestmentAmount = document.getElementById('resTotalInvestmentAmount');
  if (resTotalInvestmentAmount) resTotalInvestmentAmount.textContent = lead['કુલ SIP રોકાણ'] || '-';

  const resEstimatedReturns = document.getElementById('resEstimatedReturns');
  if (resEstimatedReturns) resEstimatedReturns.textContent = lead['અંદાજિત વળતર/નફો'] || '-';

  const resTotalMaturityCorpus = document.getElementById('resTotalMaturityCorpus');
  if (resTotalMaturityCorpus) resTotalMaturityCorpus.textContent = lead['લક્ષ્ય સમયે ભવિષ્યનું ફંડ'] || '-';

  const resCurrentCapacity = document.getElementById('resCurrentCapacity');
  if (resCurrentCapacity) resCurrentCapacity.textContent = lead['માસિક રોકાણ ક્ષમતા'] || '-';

  const resSignName = document.getElementById('resSignName');
  if (resSignName) resSignName.textContent = lead['રોકાણકારનું નામ'] || '-';

  scrollToSummaryReport();
}

// Open Master Leads Modal
function openMasterLeadsModal() {
  const modal = document.getElementById('masterLeadsModal');
  const leads = JSON.parse(localStorage.getItem('goal_form_leads') || '[]');
  const tableBody = document.getElementById('masterLeadsTableBody');
  const countEl = document.getElementById('masterLeadsCount');

  if (countEl) {
    countEl.textContent = `${leads.length} રેકોર્ડ્સ`;
  }

  if (tableBody) {
    if (leads.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="8" class="text-center py-8 text-slate-400 text-sm">હજુ સુધી કોઈ રેકોર્ડ્સ સેવ થયા નથી.</td></tr>`;
    } else {
      tableBody.innerHTML = leads.map((l, index) => `
        <tr class="border-b border-slate-100 hover:bg-slate-50/80 text-xs text-slate-700">
          <td class="py-3 px-3 font-semibold text-slate-400">${index + 1}</td>
          <td class="py-3 px-3">
            <div class="font-bold text-slate-800">${l['રોકાણકારનું નામ'] || '-'}</div>
            <div class="text-[11px] text-slate-400">${l['સબમિશન સમય'] || '-'}</div>
          </td>
          <td class="py-3 px-3 font-medium">${l['મોબાઈલ નંબર'] || '-'}</td>
          <td class="py-3 px-3">
            <span class="inline-block px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-semibold">${l['પસંદ કરેલ લક્ષ્ય'] ? l['પસંદ કરેલ લક્ષ્ય'].split('(')[0] : '-'}</span>
          </td>
          <td class="py-3 px-3 font-semibold">${l['સમયગાળો'] || '-'}</td>
          <td class="py-3 px-3 font-bold text-emerald-700">${l['જરૂરી માસિક SIP'] || '-'}</td>
          <td class="py-3 px-3 font-bold text-slate-900">${l['લક્ષ્ય સમયે ભવિષ્યનું ફંડ'] || '-'}</td>
          <td class="py-3 px-3 text-right whitespace-nowrap">
            <button type="button" onclick="viewLeadReport(${index})" class="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md font-semibold text-[11px] border border-emerald-200 transition mr-1" title="રિપોર્ટ જુઓ">
              જુઓ
            </button>
            <button type="button" onclick="deleteLeadByIndex(${index})" class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-md font-semibold text-[11px] border border-rose-200 transition" title="ડિલીટ કરો">
              ડિલીટ
            </button>
          </td>
        </tr>
      `).join('');
    }
  }

  if (modal) {
    modal.classList.remove('hidden');
    if (window.lucide) {
      lucide.createIcons();
    }
  }
}

// Close Master Leads Modal
function closeMasterLeadsModal() {
  const modal = document.getElementById('masterLeadsModal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

// Format Indian Currency in Gujarati / Standard Style
function formatINR(amount) {
  if (isNaN(amount) || amount === null || !isFinite(amount)) return '₹ 0';
  return '₹ ' + Math.round(amount).toLocaleString('en-IN');
}

// Convert numbers to Gujarati readable words
function convertToGujaratiWords(amount) {
  const num = Number(amount);
  if (isNaN(num) || num <= 0 || !isFinite(num)) return '';
  if (num >= 10000000) {
    const cr = parseFloat((num / 10000000).toFixed(2));
    return `(આશરે ${cr} કરોડ રૂપિયા)`;
  } else if (num >= 100000) {
    const lakh = parseFloat((num / 100000).toFixed(2));
    return `(આશરે ${lakh} લાખ રૂપિયા)`;
  } else if (num >= 1000) {
    const thousand = parseFloat((num / 1000).toFixed(1));
    return `(આશરે ${thousand} હજાર રૂપિયા)`;
  }
  return `(₹ ${num.toLocaleString('en-IN')})`;
}

// Sync Visual Card States
function syncGoalCardStyles() {
  document.querySelectorAll('.goal-card').forEach(card => {
    const input = card.querySelector('input[type="radio"]');
    const dot = card.querySelector('.radio-dot');
    const inner = card.querySelector('.radio-inner');
    if (input && input.checked) {
      card.classList.add('active-selected', 'border-emerald-600', 'bg-emerald-50/40');
      card.classList.remove('border-slate-200');
      if (dot) {
        dot.classList.add('border-emerald-600', 'bg-emerald-600');
        dot.classList.remove('border-slate-300', 'bg-white');
      }
      if (inner) inner.classList.remove('hidden');
    } else {
      card.classList.remove('active-selected', 'border-emerald-600', 'bg-emerald-50/40');
      card.classList.add('border-slate-200');
      if (dot) {
        dot.classList.remove('border-emerald-600', 'bg-emerald-600');
        dot.classList.add('border-slate-300', 'bg-white');
      }
      if (inner) inner.classList.add('hidden');
    }
  });
}

function syncPriorityCardStyles() {
  document.querySelectorAll('.priority-card').forEach(card => {
    const input = card.querySelector('input[type="radio"]');
    if (input && input.checked) {
      card.classList.add('border-emerald-600', 'bg-emerald-50/40');
      card.classList.remove('border-slate-200');
    } else {
      card.classList.remove('border-emerald-600', 'bg-emerald-50/40');
      card.classList.add('border-slate-200');
    }
  });
}

function syncRiskCardStyles() {
  document.querySelectorAll('.risk-card').forEach(card => {
    const input = card.querySelector('input[type="radio"]');
    if (input && input.checked) {
      card.classList.add('border-emerald-600', 'bg-emerald-50/50');
      card.classList.remove('border-slate-200');
    } else {
      card.classList.remove('border-emerald-600', 'bg-emerald-50/50');
      card.classList.add('border-slate-200');
    }
  });
}

// When Goal Card is clicked
function onGoalChange(goalName, defaultAmount, defaultYears) {
  const targetAmountInput = document.getElementById('targetAmount');
  const targetYearsInput = document.getElementById('targetYears');
  
  if (targetAmountInput && defaultAmount) {
    targetAmountInput.value = defaultAmount;
  }
  if (targetYearsInput && defaultYears) {
    targetYearsInput.value = defaultYears;
  }

  syncGoalCardStyles();
  updateCalculationPreview();
}

// When Goal Priority Level is changed
function onPriorityChange() {
  syncPriorityCardStyles();
  calculateAndShowSummary();
}

// When Risk Profile is changed
function updateRiskExpectedReturn(returnRate) {
  currentExpectedReturn = returnRate;
  syncRiskCardStyles();
  updateCalculationPreview();
}

// Real-time input updates
function updateCalculationPreview() {
  const targetAmount = Math.max(0, parseFloat(document.getElementById('targetAmount')?.value) || 0);
  const targetYears = Math.max(1, parseFloat(document.getElementById('targetYears')?.value) || 1);
  
  const wordsEl = document.getElementById('targetAmountWords');
  if (wordsEl) {
    wordsEl.textContent = `${formatINR(targetAmount)} ${convertToGujaratiWords(targetAmount)}`;
  }

  const monthsEl = document.getElementById('targetMonthsCount');
  if (monthsEl) {
    monthsEl.textContent = `${Math.round(targetYears * 12)}`;
  }

  calculateAndShowSummary();
}

// Main Calculation Function
function calculateAndShowSummary() {
  const fullName = document.getElementById('fullName')?.value?.trim() || 'સન્માનનીય રોકાણકાર';
  const phone = cleanPhoneNumber(document.getElementById('phone')?.value?.trim() || '') || '-';
  const targetAmountToday = Math.max(0, parseFloat(document.getElementById('targetAmount')?.value) || 0);
  const targetYears = Math.max(1, parseFloat(document.getElementById('targetYears')?.value) || 1);
  const currentSavings = Math.max(0, parseFloat(document.getElementById('currentSavings')?.value) || 0);
  const monthlyBudget = Math.max(0, parseFloat(document.getElementById('monthlyBudget')?.value) || 0);
  const includeInflation = document.getElementById('includeInflation')?.checked ?? true;

  currentExpectedReturn = getSelectedRiskReturn();

  // Selected goal
  const selectedGoalRadio = document.querySelector('input[name="primaryGoal"]:checked');
  const goalText = selectedGoalRadio ? selectedGoalRadio.value : 'નાણાકીય લક્ષ્ય';
  const cleanGoalName = goalText.split('(')[0].trim();

  // Inflation adjusted future target amount
  const inflationRate = includeInflation ? 0.06 : 0.0;
  const futureTargetCorpus = targetAmountToday * Math.pow(1 + inflationRate, targetYears);

  // Future value of existing savings
  const annualReturnDecimal = currentExpectedReturn / 100;
  const monthlyReturnDecimal = annualReturnDecimal / 12;
  const totalMonths = Math.max(1, Math.round(targetYears * 12));

  const futureValueOfSavings = currentSavings * Math.pow(1 + annualReturnDecimal, targetYears);
  
  // Net corpus gap to be built via SIP
  const netCorpusGap = Math.max(0, futureTargetCorpus - futureValueOfSavings);

  // Monthly SIP Calculation Formula (Annuity Due):
  // FV = P * [((1 + r)^n - 1) / r] * (1 + r)
  // => P = FV * r / [ ((1 + r)^n - 1) * (1 + r) ]
  let requiredMonthlySIP = 0;
  if (netCorpusGap > 0 && monthlyReturnDecimal > 0) {
    const compoundFactor = Math.pow(1 + monthlyReturnDecimal, totalMonths);
    const denominator = (compoundFactor - 1) * (1 + monthlyReturnDecimal);
    requiredMonthlySIP = (netCorpusGap * monthlyReturnDecimal) / denominator;
  }

  // Total investment & gains
  const totalSIPInvested = requiredMonthlySIP * totalMonths;
  const totalInvestedOverall = totalSIPInvested + currentSavings;
  const maturityCorpus = Math.max(futureTargetCorpus, futureValueOfSavings);
  const estimatedReturnsOverall = Math.max(0, maturityCorpus - totalInvestedOverall);

  // Update DOM Summary Section
  const resInvestorName = document.getElementById('resInvestorName');
  if (resInvestorName) resInvestorName.textContent = fullName;

  const resInvestorContact = document.getElementById('resInvestorContact');
  if (resInvestorContact) resInvestorContact.textContent = `મો: ${phone}`;

  const resGoalName = document.getElementById('resGoalName');
  if (resGoalName) resGoalName.textContent = cleanGoalName;

  const resGoalHorizon = document.getElementById('resGoalHorizon');
  if (resGoalHorizon) resGoalHorizon.textContent = `સમયગાળો: ${targetYears} વર્ષ (${totalMonths} મહિના)`;
  
  // Goal Priority
  const selectedPriorityRadio = document.querySelector('input[name="goalPriority"]:checked');
  const priorityBadgeEl = document.getElementById('resGoalPriorityBadge');
  if (priorityBadgeEl && selectedPriorityRadio) {
    const priorityVal = selectedPriorityRadio.value;
    if (priorityVal.includes('High') || priorityVal.includes('ઉચ્ચ')) {
      priorityBadgeEl.className = 'text-[11px] font-bold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800';
      priorityBadgeEl.textContent = '🥇 ઉચ્ચ પ્રાથમિકતા';
    } else if (priorityVal.includes('Medium') || priorityVal.includes('મધ્યમ')) {
      priorityBadgeEl.className = 'text-[11px] font-bold px-2 py-0.5 rounded bg-blue-100 text-blue-800';
      priorityBadgeEl.textContent = '🥈 મધ્યમ પ્રાથમિકતા';
    } else {
      priorityBadgeEl.className = 'text-[11px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700';
      priorityBadgeEl.textContent = '🥉 સામાન્ય પ્રાથમિકતા';
    }
  }
  
  const resFutureTargetAmount = document.getElementById('resFutureTargetAmount');
  if (resFutureTargetAmount) resFutureTargetAmount.textContent = formatINR(futureTargetCorpus);

  const resInflationStatus = document.getElementById('resInflationStatus');
  if (resInflationStatus) {
    resInflationStatus.textContent = includeInflation 
      ? '(૬% વાર્ષિક મોંઘવારી સાથે)' 
      : '(મોંઘવારી વગર ગણતરી)';
  }

  const resRequiredMonthlySIP = document.getElementById('resRequiredMonthlySIP');
  if (resRequiredMonthlySIP) resRequiredMonthlySIP.textContent = `${formatINR(requiredMonthlySIP)} / મહિને`;

  const resReturnRateText = document.getElementById('resReturnRateText');
  if (resReturnRateText) resReturnRateText.textContent = `અંદાજિત ${currentExpectedReturn}% વાર્ષિક વળતર આધારે`;

  const resTotalInvestmentAmount = document.getElementById('resTotalInvestmentAmount');
  if (resTotalInvestmentAmount) resTotalInvestmentAmount.textContent = formatINR(totalSIPInvested);

  const resEstimatedReturns = document.getElementById('resEstimatedReturns');
  if (resEstimatedReturns) resEstimatedReturns.textContent = formatINR(estimatedReturnsOverall);

  const resTotalMaturityCorpus = document.getElementById('resTotalMaturityCorpus');
  if (resTotalMaturityCorpus) resTotalMaturityCorpus.textContent = formatINR(maturityCorpus);
  
  const resCurrentCapacity = document.getElementById('resCurrentCapacity');
  if (resCurrentCapacity) resCurrentCapacity.textContent = formatINR(monthlyBudget);
  
  // Budget Gap analysis
  const budgetGapEl = document.getElementById('resBudgetGapBadge');
  if (budgetGapEl) {
    const diff = requiredMonthlySIP - monthlyBudget;
    if (diff <= 0) {
      budgetGapEl.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30';
      budgetGapEl.textContent = 'ઉત્તમ! તમારી માસિક ક્ષમતા આ લક્ષ્ય માટે પૂરતી છે.';
    } else {
      budgetGapEl.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30';
      budgetGapEl.textContent = `અંદાજિત ${formatINR(diff)} વધારાના માસિક રોકાણની જરૂર છે (અથવા સ્ટેપ-અપ SIP અપનાવો)`;
    }
  }

  // Update date badge
  const today = new Date();
  const dateStr = today.toLocaleDateString('gu-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const dateBadge = document.getElementById('reportDateBadge');
  if (dateBadge) {
    dateBadge.textContent = `તારીખ: ${dateStr}`;
  }

  const signName = document.getElementById('resSignName');
  if (signName) {
    signName.textContent = fullName;
  }

  // Refresh icons
  if (window.lucide) {
    lucide.createIcons();
  }
}

// Reset Function
function resetAllFields() {
  const cooldownStatus = getSubmissionCooldownStatus();
  if (cooldownStatus.isLocked) {
    const remainingText = formatCooldownTime(cooldownStatus.remainingMs);
    alert(`🔒 આ ફોર્મ ૨૪ કલાક માટે લૉક છે (હજુ [ ${remainingText} ] બાકી).\n\nનવા રોકાણકાર માટે ફોર્મ ભરવા માટે એડવાઇઝર ટૂલબાર (Ctrl + Shift + M) માંથી અનલોક કરો.`);
    return;
  }
  if (confirm('શું તમે ફોર્મની તમામ વિગતો ફરીથી નવી ભરવા માંગો છો?')) {
    const form = document.getElementById('goalInvestmentForm');
    if (form) form.reset();
    clearSection1Fields();
    currentExpectedReturn = 12;
    syncGoalCardStyles();
    syncPriorityCardStyles();
    syncRiskCardStyles();
    updateCalculationPreview();
    calculateAndShowSummary();
    onInvestorDetailsInput();
  }
}


