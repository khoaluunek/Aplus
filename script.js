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

const form = document.getElementById("consultation-form");
const status = document.getElementById("form-status");
const phoneInput = document.getElementById("phone");
const phoneError = document.getElementById("phone-error");
const emailInput = document.getElementById("email");
const submitButton = form.querySelector("button[type='submit']");

function setPhoneError(message = "") {
  phoneError.textContent = message;
  phoneInput.setAttribute("aria-invalid", String(Boolean(message)));
}

phoneInput.addEventListener("input", () => {
  const normalized = phoneInput.value.replace(/\s/g, "");
  if (!normalized || /^0\d{9}$/.test(normalized)) setPhoneError();
});

form.addEventListener("submit", (event) => {
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

  status.classList.remove("is-error");
  status.textContent = "Đang kiểm tra thông tin yêu cầu...";
  submitButton.disabled = true;
  submitButton.textContent = "Đang kiểm tra...";
  window.setTimeout(() => {
    status.textContent = "Thông tin đã hợp lệ. Hãy nhắn Zalo hoặc gọi 0915 489 902 để Aplus Scholar tiếp nhận yêu cầu và tệp đính kèm.";
    submitButton.disabled = false;
    submitButton.textContent = "Kiểm tra yêu cầu";
  }, 450);
});
