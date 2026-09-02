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
  panels.forEach((panel) => {
    panel.hidden = panel.id !== panelId;
  });
  if (focusPanel) document.getElementById(panelId).focus();
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
reasonItems.forEach((item) => {
  item.addEventListener("toggle", () => {
    if (!item.open) return;
    reasonItems.forEach((otherItem) => {
      if (otherItem !== item) otherItem.open = false;
    });
  });
});

const policyItems = [...document.querySelectorAll(".policy-library details")];
policyItems.forEach((item) => {
  item.addEventListener("toggle", () => {
    if (!item.open) return;
    policyItems.forEach((otherItem) => {
      if (otherItem !== item) otherItem.open = false;
    });
  });
});

const privacyPolicy = document.getElementById("privacy-policy");
const revealPrivacyPolicy = () => {
  if (!privacyPolicy) return;
  privacyPolicy.open = true;
};
document.querySelectorAll("a[href='#privacy-policy']").forEach((link) => link.addEventListener("click", revealPrivacyPolicy));
if (window.location.hash === "#privacy-policy") revealPrivacyPolicy();

const homeDisclosures = [...document.querySelectorAll(".home-disclosure")];
const openDisclosureFromHash = () => {
  const hashTarget = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
  const disclosure = hashTarget?.matches(".home-disclosure") ? hashTarget : hashTarget?.closest(".home-disclosure");
  if (disclosure) disclosure.open = true;
};
homeDisclosures.forEach((disclosure) => disclosure.addEventListener("toggle", () => {
  if (disclosure.open) window.dispatchEvent(new Event("resize"));
}));
window.addEventListener("hashchange", openDisclosureFromHash);
openDisclosureFromHash();

const menuToggle = document.querySelector(".menu-toggle");
const nav = document.querySelector(".main-nav");
menuToggle.addEventListener("click", () => {
  const isOpen = nav.classList.toggle("is-open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});
nav.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => {
  nav.classList.remove("is-open");
  menuToggle.setAttribute("aria-expanded", "false");
}));

const mobileContactBar = document.querySelector(".mobile-contact-bar");
const supportingServices = document.getElementById("supporting-services");
const contactSection = document.getElementById("contact");
if (mobileContactBar && supportingServices && contactSection && "IntersectionObserver" in window) {
  let hasReachedSupportingServices = false;
  let isContactSectionVisible = false;
  const updateMobileContactBar = () => {
    mobileContactBar.classList.toggle("is-suppressed", !hasReachedSupportingServices || isContactSectionVisible);
  };
  const contactBarObserver = new IntersectionObserver(([entry]) => {
    hasReachedSupportingServices = entry.isIntersecting || entry.boundingClientRect.top <= 0;
    updateMobileContactBar();
  }, { threshold: 0 });
  const contactSectionObserver = new IntersectionObserver(([entry]) => {
    isContactSectionVisible = entry.isIntersecting;
    updateMobileContactBar();
  }, { threshold: 0.08 });
  contactBarObserver.observe(supportingServices);
  contactSectionObserver.observe(contactSection);
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
    if (journeyStatus) {
      journeyStatus.textContent = index === endIndex
        ? `Mốc ${journeyCards[index].dataset.year}, ${index + 1} trên ${journeyCards.length}`
        : `Các mốc ${journeyCards[index].dataset.year} đến ${journeyCards[endIndex].dataset.year}`;
    }
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
  journeyTrack.addEventListener("scroll", () => {
    window.cancelAnimationFrame(journeyFrame);
    journeyFrame = window.requestAnimationFrame(updateJourney);
  }, { passive: true });
  journeyTrack.addEventListener("pointerdown", (event) => {
    if (event.pointerType !== "mouse") return;
    isJourneyDragging = true;
    journeyPointerStart = event.clientX;
    journeyScrollStart = journeyTrack.scrollLeft;
    journeyTrack.classList.add("is-dragging");
    journeyTrack.setPointerCapture(event.pointerId);
  });
  journeyTrack.addEventListener("pointermove", (event) => {
    if (!isJourneyDragging) return;
    journeyTrack.scrollLeft = journeyScrollStart - (event.clientX - journeyPointerStart);
  });

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

const form = document.getElementById("consultation-form");
const status = document.getElementById("form-status");
const phoneInput = document.getElementById("phone");
const phoneError = document.getElementById("phone-error");
const emailInput = document.getElementById("email");
const submitButton = form.querySelector("button[type='submit']");
const messageInput = document.getElementById("message");
const briefFileInput = document.getElementById("brief-file");
const emailFallback = document.getElementById("form-email-fallback");

function setPhoneError(message = "") {
  phoneError.textContent = message;
  phoneInput.setAttribute("aria-invalid", String(Boolean(message)));
}

phoneInput.addEventListener("input", () => {
  const normalized = phoneInput.value.replace(/\s/g, "");
  if (!normalized || /^0\d{9}$/.test(normalized)) setPhoneError();
});

const maximumBriefFileSize = 3 * 1024 * 1024;
const allowedBriefExtensions = /\.(pdf|doc|docx)$/i;

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result).split(",")[1] || ""), { once: true });
    reader.addEventListener("error", () => reject(new Error("Không thể đọc tệp đã chọn.")), { once: true });
    reader.readAsDataURL(file);
  });
}

async function sendConsultationRequest(action, payload) {
  const response = await fetch(action, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify(payload)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || "Hệ thống chưa thể tiếp nhận yêu cầu.");
  return result;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = form.elements.name.value.trim();
  const phone = phoneInput.value.replace(/\s/g, "");
  const email = emailInput.value.trim();
  const need = form.elements.need.value;
  const consent = form.elements.consent.checked;
  const validPhone = /^0\d{9}$/.test(phone);
  const validEmail = !email || emailInput.validity.valid;

  setPhoneError(validPhone ? "" : "Nhập số điện thoại Việt Nam gồm 10 chữ số.");
  if (!name || !need || !consent || !validPhone || !validEmail) {
    status.textContent = "Vui lòng hoàn thiện các thông tin bắt buộc trước khi tiếp tục.";
    status.classList.add("is-error");
    return;
  }

  const briefFile = briefFileInput.files[0];
  if (briefFile && (!allowedBriefExtensions.test(briefFile.name) || briefFile.size > maximumBriefFileSize)) {
    status.textContent = briefFile.size > maximumBriefFileSize
      ? "Tệp vượt quá 3 MB. Vui lòng chọn tệp nhỏ hơn."
      : "Định dạng tệp chưa được hỗ trợ. Vui lòng chọn PDF, DOC hoặc DOCX.";
    status.classList.add("is-error");
    return;
  }

  status.classList.remove("is-error", "is-success");
  status.textContent = "Đang gửi yêu cầu bảo mật...";
  emailFallback.hidden = true;
  submitButton.disabled = true;
  submitButton.textContent = "Đang gửi...";

  try {
    const fileContent = briefFile ? await readFileAsBase64(briefFile) : "";
    const result = await sendConsultationRequest(form.action, {
      name,
      phone,
      email,
      need,
      message: messageInput.value.trim(),
      website: form.elements.website.value,
      file: briefFile ? { name: briefFile.name, type: briefFile.type, size: briefFile.size, content: fileContent } : null
    });

    form.reset();
    setPhoneError();
    status.classList.add("is-success");
    status.textContent = `Đã tiếp nhận yêu cầu ${result.requestId}. Aplus Scholar dự kiến phản hồi trong vòng 1 ngày làm việc.`;
  } catch (error) {
    status.classList.add("is-error");
    status.textContent = error.message || "Chưa thể gửi yêu cầu. Vui lòng thử lại sau.";
    emailFallback.hidden = false;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Nhận tư vấn";
  }
});
