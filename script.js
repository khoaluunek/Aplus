const serviceData = {
  academic: {
    index: "01",
    kicker: "Hỗ trợ học thuật",
    title: "Từ đề cương đến bài nghiên cứu có cấu trúc.",
    description: "Làm rõ yêu cầu, phương pháp và cách trình bày để bạn tự tin phát triển bài làm.",
    items: ["Phương pháp nghiên cứu khoa học", "Nghiên cứu khoa học", "Khóa luận và chuyên đề tốt nghiệp", "Báo cáo thực tập, assignment, đề cương, tiểu luận"]
  },
  data: {
    index: "02",
    kicker: "Dữ liệu nghiên cứu",
    title: "Chuẩn bị nguồn dữ liệu có thể sử dụng được.",
    description: "Hỗ trợ xây dựng khảo sát, tổng hợp dữ liệu thứ cấp và làm sạch dữ liệu trước khi phân tích.",
    items: ["Thu thập dữ liệu sơ cấp bằng form khảo sát", "Tổng hợp dữ liệu tài chính", "Tổng hợp dữ liệu phi tài chính", "Làm sạch và chuẩn hóa số liệu"]
  },
  analysis: {
    index: "03",
    kicker: "Phân tích số liệu",
    title: "Chọn công cụ phù hợp với câu hỏi nghiên cứu.",
    description: "Tư vấn quy trình phân tích, đọc kết quả và cách diễn giải các chỉ số trong bài nghiên cứu.",
    items: ["SmartPLS", "SPSS", "STATA", "AMOS", "EViews"]
  },
  integrity: {
    index: "04",
    kicker: "Tính nguyên gốc",
    title: "Kiểm tra kỹ trước khi nộp bài.",
    description: "Hỗ trợ kiểm tra mức độ tương đồng và nhận diện dấu hiệu AI để bạn chủ động rà soát nội dung.",
    items: ["Kiểm tra độ tương đồng Turnitin", "Kiểm tra AI Turnitin", "Rà soát trích dẫn và nguồn tham khảo", "Gợi ý chỉnh sửa để nội dung rõ ràng hơn"]
  },
  creative: {
    index: "05",
    kicker: "Trình bày và dịch vụ số",
    title: "Truyền đạt ý tưởng bằng một trải nghiệm thuyết phục.",
    description: "Hoàn thiện phần trình bày để công việc học thuật, nghiên cứu hoặc dự án của bạn dễ theo dõi và chuyên nghiệp.",
    items: ["Thiết kế slide và pitch deck", "Design và thiết kế website", "Dịch thuật", "Hỗ trợ coding theo yêu cầu"]
  }
};

const panel = {
  index: document.getElementById("service-index"),
  kicker: document.getElementById("service-kicker"),
  title: document.getElementById("service-title"),
  description: document.getElementById("service-description"),
  list: document.getElementById("service-list")
};

document.querySelectorAll(".service-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    const service = serviceData[tab.dataset.service];
    document.querySelectorAll(".service-tab").forEach((item) => {
      item.classList.remove("is-active");
      item.setAttribute("aria-selected", "false");
    });
    tab.classList.add("is-active");
    tab.setAttribute("aria-selected", "true");
    panel.index.textContent = service.index;
    panel.kicker.textContent = service.kicker;
    panel.title.textContent = service.title;
    panel.description.textContent = service.description;
    panel.list.replaceChildren(...service.items.map((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      return li;
    }));
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
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = form.elements.name.value.trim();
  const phone = form.elements.phone.value.replace(/\s/g, "");
  const need = form.elements.need.value;
  if (!name || !/^0\d{9}$/.test(phone) || !need) {
    status.textContent = "Vui lòng điền họ tên, số điện thoại 10 chữ số và nhóm dịch vụ.";
    status.classList.add("is-error");
    return;
  }
  status.textContent = "Aplus Scholar đã ghi nhận yêu cầu. Chúng tôi sẽ liên hệ với bạn sớm.";
  status.classList.remove("is-error");
  form.reset();
});
