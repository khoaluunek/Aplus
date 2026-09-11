const tabs = [...document.querySelectorAll(".service-tab")];
const panels = [...document.querySelectorAll(".service-feature[role='tabpanel']")];

function activateService(tab, focusPanel = false) {
  const panelId = tab.getAttribute("aria-controls");
  tabs.forEach((item) => {
    const isActive = item === tab;
    item.classList.toggle("is-active", isActive);
    item.setAttribute("aria-selected", String(isActive));
    item.tabIndex = isActive ? 0 : -1;
  });
  panels.forEach((panel) => { panel.hidden = panel.id !== panelId; });
  if (focusPanel) document.getElementById(panelId)?.focus();
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => activateService(tab));
  tab.addEventListener("keydown", (event) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    let nextIndex = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + tabs.length) % tabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = tabs.length - 1;
    tabs[nextIndex].focus();
    activateService(tabs[nextIndex]);
  });
});

const reasonItems = [...document.querySelectorAll(".why-accordion details")];
reasonItems.forEach((item) => item.addEventListener("toggle", () => {
  if (item.open) reasonItems.forEach((otherItem) => { if (otherItem !== item) otherItem.open = false; });
}));

const policyItems = [...document.querySelectorAll(".policy-library details")];
policyItems.forEach((item) => item.addEventListener("toggle", () => {
  if (item.open) policyItems.forEach((otherItem) => { if (otherItem !== item) otherItem.open = false; });
}));

function getHashTarget(hash = window.location.hash) {
  if (!hash || hash === "#") return null;
  try { return document.getElementById(decodeURIComponent(hash.slice(1))); }
  catch { return null; }
}

function revealHashTarget(hash = window.location.hash, behavior = "smooth") {
  const target = getHashTarget(hash);
  if (!target) return;
  const disclosure = target.matches("details") ? target : target.closest("details");
  if (disclosure) disclosure.open = true;
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    target.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : behavior });
  }));
}

document.addEventListener("click", (event) => {
  const link = event.target.closest("a[href^='#']");
  if (!link || !link.hash) return;
  const target = getHashTarget(link.hash);
  if (!target) return;
  event.preventDefault();
  history.pushState(null, "", link.hash);
  revealHashTarget(link.hash);
});
window.addEventListener("hashchange", () => revealHashTarget());
window.addEventListener("DOMContentLoaded", () => { if (window.location.hash) revealHashTarget(window.location.hash, "auto"); });
if (window.location.hash) revealHashTarget(window.location.hash, "auto");

const menuToggle = document.querySelector(".menu-toggle");
const nav = document.querySelector(".main-nav");
if (menuToggle && nav) {
  const backdrop = document.createElement("button");
  backdrop.className = "menu-backdrop";
  backdrop.type = "button";
  backdrop.tabIndex = -1;
  backdrop.setAttribute("aria-label", "Đóng danh mục");
  document.body.append(backdrop);
  let previouslyFocused = null;
  const focusableMenuItems = () => [...nav.querySelectorAll("a[href], button:not([disabled])")];
  const closeMenu = ({ restoreFocus = true } = {}) => {
    if (!nav.classList.contains("is-open")) return;
    nav.classList.remove("is-open");
    backdrop.classList.remove("is-visible");
    document.body.classList.remove("menu-is-open");
    menuToggle.setAttribute("aria-expanded", "false");
    if (restoreFocus) previouslyFocused?.focus();
  };
  const openMenu = () => {
    previouslyFocused = document.activeElement;
    nav.classList.add("is-open");
    backdrop.classList.add("is-visible");
    document.body.classList.add("menu-is-open");
    menuToggle.setAttribute("aria-expanded", "true");
    window.setTimeout(() => focusableMenuItems()[0]?.focus(), 0);
  };
  menuToggle.addEventListener("click", () => nav.classList.contains("is-open") ? closeMenu() : openMenu());
  backdrop.addEventListener("click", () => closeMenu());
  nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => closeMenu({ restoreFocus: false })));
  document.addEventListener("keydown", (event) => {
    if (!nav.classList.contains("is-open")) return;
    if (event.key === "Escape") { event.preventDefault(); closeMenu(); return; }
    if (event.key !== "Tab") return;
    const items = focusableMenuItems();
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
}

const mobileContactBar = document.querySelector(".mobile-contact-bar");
if (mobileContactBar) {
  const heroSection = document.querySelector(".hero");
  const suppressTargets = [document.getElementById("contact"), document.querySelector(".final-cta"), document.querySelector(".site-footer")].filter(Boolean);
  const visibleTargets = new Set();
  let hasLeftHero = !heroSection;
  const updateMobileContactBar = () => {
    const hasScrolled = window.scrollY > 120;
    mobileContactBar.classList.toggle("is-suppressed", !hasScrolled || !hasLeftHero || visibleTargets.size > 0);
  };
  if ("IntersectionObserver" in window) {
    if (heroSection) new IntersectionObserver(([entry]) => {
      hasLeftHero = !entry.isIntersecting && entry.boundingClientRect.bottom <= 0;
      updateMobileContactBar();
    }, { threshold: 0 }).observe(heroSection);
    const suppressObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => entry.isIntersecting ? visibleTargets.add(entry.target) : visibleTargets.delete(entry.target));
      updateMobileContactBar();
    }, { threshold: 0.08 });
    suppressTargets.forEach((target) => suppressObserver.observe(target));
  }
  window.addEventListener("scroll", updateMobileContactBar, { passive: true });
  updateMobileContactBar();
}

const journeyTrack = document.querySelector(".journey-track");
const journeyCards = [...document.querySelectorAll(".journey-card")];
const journeyPrevious = document.querySelector("[data-journey-direction='previous']");
const journeyNext = document.querySelector("[data-journey-direction='next']");
const journeyStatus = document.getElementById("journey-status");
if (journeyTrack && journeyCards.length && journeyPrevious && journeyNext) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let activeJourneyIndex = 0;
  let isJourneyDragging = false;
  let journeyPointerStart = 0;
  let journeyScrollStart = 0;
  let journeyFrame = 0;
  const getJourneyStep = () => {
    const styles = window.getComputedStyle(journeyTrack);
    return journeyCards[0].getBoundingClientRect().width + Number.parseFloat(styles.columnGap || styles.gap || "0");
  };
  const getJourneyIndex = () => Math.max(0, Math.min(journeyCards.length - 1, Math.round(journeyTrack.scrollLeft / getJourneyStep())));
  const updateJourney = () => {
    const index = getJourneyIndex();
    const visibleCount = Math.max(1, Math.round(journeyTrack.clientWidth / getJourneyStep()));
    const endIndex = Math.min(journeyCards.length - 1, index + visibleCount - 1);
    activeJourneyIndex = index;
    journeyPrevious.disabled = journeyTrack.scrollLeft <= 2;
    journeyNext.disabled = journeyTrack.scrollLeft >= journeyTrack.scrollWidth - journeyTrack.clientWidth - 2;
    if (journeyStatus) journeyStatus.textContent = index === endIndex ? `Mốc ${journeyCards[index].dataset.year}, ${index + 1} trên ${journeyCards.length}` : `Các mốc ${journeyCards[index].dataset.year} đến ${journeyCards[endIndex].dataset.year}`;
  };
  const goToJourney = (index) => {
    activeJourneyIndex = Math.max(0, Math.min(journeyCards.length - 1, index));
    journeyTrack.scrollTo({ left: activeJourneyIndex * getJourneyStep(), behavior: reduceMotion.matches ? "auto" : "smooth" });
  };
  journeyPrevious.addEventListener("click", () => goToJourney(getJourneyIndex() - 1));
  journeyNext.addEventListener("click", () => goToJourney(getJourneyIndex() + 1));
  journeyTrack.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    goToJourney(getJourneyIndex() + (event.key === "ArrowRight" ? 1 : -1));
  });
  journeyTrack.addEventListener("scroll", () => { window.cancelAnimationFrame(journeyFrame); journeyFrame = window.requestAnimationFrame(updateJourney); }, { passive: true });
  journeyTrack.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse") return;
    isJourneyDragging = true;
    journeyPointerStart = event.clientX;
    journeyScrollStart = journeyTrack.scrollLeft;
    journeyTrack.classList.add("is-dragging");
    journeyTrack.setPointerCapture(event.pointerId);
  });
  journeyTrack.addEventListener("pointermove", (event) => { if (isJourneyDragging) journeyTrack.scrollLeft = journeyScrollStart - (event.clientX - journeyPointerStart); });
  const endJourneyDrag = (event) => {
    if (!isJourneyDragging) return;
    isJourneyDragging = false;
    journeyTrack.classList.remove("is-dragging");
    if (journeyTrack.hasPointerCapture(event.pointerId)) journeyTrack.releasePointerCapture(event.pointerId);
    goToJourney(getJourneyIndex());
  };
  journeyTrack.addEventListener("pointerup", endJourneyDrag);
  journeyTrack.addEventListener("pointercancel", endJourneyDrag);
  window.addEventListener("resize", updateJourney);
  updateJourney();
}

function normalizeVietnamPhone(value) {
  let phone = String(value || "").trim().replace(/[\s().-]/g, "");
  if (phone.startsWith("+84")) phone = `0${phone.slice(3)}`;
  else if (phone.startsWith("84") && phone.length === 11) phone = `0${phone.slice(2)}`;
  return phone;
}

async function loadTurnstileScript() {
  if (window.turnstile) return window.turnstile;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
  return window.turnstile;
}

const form = document.getElementById("consultation-form");
if (form) {
  const status = document.getElementById("form-status");
  const phoneInput = document.getElementById("phone");
  const phoneError = document.getElementById("phone-error");
  const emailInput = document.getElementById("email");
  const contactMethodInput = document.getElementById("contact-method");
  const submitButton = form.querySelector("button[type='submit']");
  const briefFileInput = document.getElementById("brief-file");
  const fileField = briefFileInput?.closest(".form-field-file");
  const emailFallback = document.getElementById("form-email-fallback");
  const idempotencyInput = document.getElementById("idempotency-key");
  const turnstileWrap = document.getElementById("turnstile-wrap");
  const turnstileHelp = document.getElementById("turnstile-help");
  const maximumBriefFileSize = 3 * 1024 * 1024;
  const allowedBriefExtensions = /\.(pdf|doc|docx)$/i;
  let turnstileRequired = false;
  let turnstileToken = "";
  let uploadsEnabled = false;
  const newIdempotencyKey = () => { if (idempotencyInput) idempotencyInput.value = crypto.randomUUID(); };
  newIdempotencyKey();

  function setPhoneError(message = "") {
    phoneError.textContent = message;
    phoneInput.setAttribute("aria-invalid", String(Boolean(message)));
  }
  phoneInput.addEventListener("input", () => {
    const normalized = normalizeVietnamPhone(phoneInput.value);
    if (!normalized || /^0\d{9}$/.test(normalized)) setPhoneError();
  });
  function syncContactRequirements() {
    const method = contactMethodInput.value;
    phoneInput.required = method === "phone" || method === "zalo";
    emailInput.required = method === "email";
    document.querySelectorAll(".channel-field").forEach((field) => {
      field.hidden = !(field.dataset.contactChannel || "").split(",").includes(method);
    });
    if (!phoneInput.required && !phoneInput.value.trim()) setPhoneError();
  }
  contactMethodInput.addEventListener("change", syncContactRequirements);
  syncContactRequirements();

  async function configureForm() {
    try {
      const response = await fetch("/api/consultation-config", { headers: { Accept: "application/json" } });
      const config = await response.json();
      uploadsEnabled = config.uploadsEnabled === true;
      if (fileField && !uploadsEnabled) {
        fileField.hidden = true;
        briefFileInput.disabled = true;
      }
      turnstileRequired = config.turnstileRequired === true;
      if (!config.turnstileSiteKey) {
        if (turnstileRequired) {
          turnstileWrap.hidden = false;
          turnstileHelp.textContent = "Biểu mẫu đang chờ cấu hình xác minh. Vui lòng dùng Zalo hoặc email trong lúc này.";
          submitButton.disabled = true;
        }
        return;
      }
      turnstileWrap.hidden = false;
      turnstileHelp.textContent = "Xác minh giúp bảo vệ biểu mẫu khỏi thư rác.";
      const turnstile = await loadTurnstileScript();
      turnstile.render("#turnstile-widget", {
        sitekey: config.turnstileSiteKey,
        theme: "light",
        callback: (token) => { turnstileToken = token; },
        "expired-callback": () => { turnstileToken = ""; },
        "error-callback": () => { turnstileToken = ""; }
      });
    } catch {
      if (fileField) { fileField.hidden = true; briefFileInput.disabled = true; }
      if (turnstileRequired) {
        turnstileWrap.hidden = false;
        turnstileHelp.textContent = "Không thể tải bước xác minh. Vui lòng dùng Zalo hoặc email trong lúc này.";
        submitButton.disabled = true;
      }
    }
  }
  configureForm();

  async function sendConsultationRequest(action, payload) {
    const response = await fetch(action, { method: "POST", headers: { Accept: "application/json" }, body: payload });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "Hệ thống chưa thể tiếp nhận yêu cầu.");
    return result;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = form.elements.name.value.trim();
    const phone = normalizeVietnamPhone(phoneInput.value);
    const email = emailInput.value.trim();
    const contactMethod = contactMethodInput.value;
    const need = form.elements.need.value;
    const consent = form.elements.consent.checked;
    const phoneIsRequired = contactMethod === "phone" || contactMethod === "zalo";
    const emailIsRequired = contactMethod === "email";
    const validPhone = !phone && !phoneIsRequired ? true : /^0\d{9}$/.test(phone);
    const validEmail = !email || emailInput.validity.valid;
    setPhoneError(validPhone ? "" : "Nhập số điện thoại Việt Nam hợp lệ gồm 10 chữ số.");
    if (!name || !contactMethod || !need || !consent || !validPhone || !validEmail || (emailIsRequired && !email) || (turnstileRequired && !turnstileToken)) {
      status.textContent = turnstileRequired && !turnstileToken ? "Vui lòng hoàn tất bước xác minh trước khi gửi." : "Vui lòng hoàn thiện các thông tin bắt buộc trước khi tiếp tục.";
      status.classList.add("is-error");
      form.reportValidity();
      return;
    }
    const briefFile = briefFileInput.files[0];
    if (briefFile && (!uploadsEnabled || !allowedBriefExtensions.test(briefFile.name) || briefFile.size > maximumBriefFileSize)) {
      status.textContent = !uploadsEnabled ? "Tính năng tải tệp đang tạm đóng để bảo đảm lưu trữ riêng tư." : briefFile.size > maximumBriefFileSize ? "Tệp vượt quá 3 MB. Vui lòng chọn tệp nhỏ hơn." : "Định dạng tệp chưa được hỗ trợ. Vui lòng chọn PDF, DOC hoặc DOCX.";
      status.classList.add("is-error");
      return;
    }
    status.classList.remove("is-error", "is-success");
    status.textContent = "Đang gửi yêu cầu bảo mật...";
    emailFallback.hidden = true;
    submitButton.disabled = true;
    submitButton.textContent = "Đang gửi...";
    try {
      const requestData = new FormData(form);
      requestData.set("phone", phone);
      if (turnstileToken) requestData.set("turnstileToken", turnstileToken);
      const result = await sendConsultationRequest(form.action, requestData);
      form.reset();
      syncContactRequirements();
      setPhoneError();
      newIdempotencyKey();
      turnstileToken = "";
      status.classList.add("is-success");
      status.textContent = `Đã tiếp nhận yêu cầu ${result.requestId}. Aplus Scholar dự kiến phản hồi trong vòng 1 ngày làm việc.`;
    } catch (error) {
      status.classList.add("is-error");
      status.textContent = error.message || "Chưa thể gửi yêu cầu. Vui lòng thử lại sau.";
      emailFallback.hidden = false;
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Nhận phạm vi và báo giá";
    }
  });
}

const privacyRequestForm = document.getElementById("privacy-request-form");
if (privacyRequestForm) {
  const privacyStatus = document.getElementById("privacy-request-status");
  privacyRequestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(privacyRequestForm));
    privacyStatus.textContent = "Đang ghi nhận yêu cầu...";
    try {
      const response = await fetch(privacyRequestForm.action, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Chưa thể ghi nhận yêu cầu.");
      privacyRequestForm.reset();
      privacyStatus.textContent = `Đã ghi nhận ${result.requestId}. Aplus Scholar sẽ xác minh danh tính trước khi xử lý.`;
      privacyStatus.className = "form-status is-success";
    } catch (error) {
      privacyStatus.textContent = error.message || "Chưa thể ghi nhận yêu cầu. Vui lòng gửi email tới aplusscholarr@gmail.com.";
      privacyStatus.className = "form-status is-error";
    }
  });
}
