let currentCamera = 1;
let totalCameras = 2;
let currentLab = "";

// 🎥 เริ่มโหลดภาพ + ดึงข้อมูลจาก Flask ทุก 2 วินาที
function startLiveFeed() {
  const feed = document.getElementById("liveFeed");
  const detectionCount = document.getElementById("detectionCount");
  if (!feed) return;

  setInterval(async () => {
    const frameUrl = `http://127.0.0.1:5000/api/frame/${currentLab}/${currentCamera}?t=${Date.now()}`;
    const dataUrl = `http://127.0.0.1:5000/api/data/${currentLab}/${currentCamera}`;

    // โหลดภาพ
    feed.src = frameUrl;

    try {
      const res = await fetch(dataUrl);
      const data = await res.json();

      if (!data || data.error) {
        detectionCount.textContent = "❌ ไม่พบข้อมูลตรวจจับ";
        return;
      }

      // อัปเดตข้อมูลภาพ
      detectionCount.textContent = `👥 ตรวจพบ ${data.num_people} คน (เชื่อมั่น ${data.avg_confidence}%)`;

      // อัปเดตสถิติฝั่งขวา
      const peopleEl = document.querySelector(".text-blue-600");
      const pcUsedEl = document.querySelector(".text-green-600");
      const pcFreeEl = document.querySelector(".text-orange-600");
      const usageEl = document.querySelector(".text-purple-600");

      const total = 30;
      const used = Math.min(total, data.num_people);
      const free = total - used;
      const usage = Math.round((used / total) * 100);

      if (peopleEl) peopleEl.textContent = used;
      if (pcUsedEl) pcUsedEl.textContent = used;
      if (pcFreeEl) pcFreeEl.textContent = free;
      if (usageEl) usageEl.textContent = `${usage}%`;
    } catch (e) {
      detectionCount.textContent = "⚠️ ข้อมูลไม่พร้อม";
    }
  }, 2000);
}

// 🎯 ฟังก์ชันอัปเดตสถิติฝั่งขวาแบบเรียลไทม์
function updateRealtimeStats(data) {
  const peopleEl = document.querySelector(".text-blue-600"); // 👥 นักเรียนในห้อง
  const pcUsedEl = document.querySelector(".text-green-600"); // 💻 คอมพิวเตอร์ที่ใช้งาน
  const pcFreeEl = document.querySelector(".text-orange-600"); // ⚡ คอมพิวเตอร์ว่าง
  const usageEl = document.querySelector(".text-purple-600"); // 📊 อัตราการใช้งาน

  const totalPCs = 30; // สมมุติห้องมี 30 เครื่อง
  const people = data.num_people || 0;
  const used = Math.min(totalPCs, people);
  const free = totalPCs - used;
  const usage = Math.round((used / totalPCs) * 100);

  // ✅ อัปเดตค่าในหน้า
  animateNumber(peopleEl, people);
  animateNumber(pcUsedEl, used);
  animateNumber(pcFreeEl, free);
  if (usageEl) usageEl.textContent = `${usage}%`;
}

// ✨ แอนิเมชันเปลี่ยนค่าตัวเลขให้ดู smooth
function animateNumber(el, newValue) {
  if (!el) return;
  const oldValue = parseInt(el.textContent) || 0;
  const diff = newValue - oldValue;
  const step = diff / 10;
  let current = oldValue;
  const interval = setInterval(() => {
    current += step;
    el.textContent = Math.round(current);
    if (
      (step > 0 && current >= newValue) ||
      (step < 0 && current <= newValue)
    ) {
      el.textContent = newValue;
      clearInterval(interval);
    }
  }, 30);
}

// 🎥 สลับกล้องถัดไป
function nextCamera() {
  currentCamera = currentCamera < totalCameras ? currentCamera + 1 : 1;
  updateCameraFeed();
}

// 🎥 สลับกล้องก่อนหน้า
function previousCamera() {
  currentCamera = currentCamera > 1 ? currentCamera - 1 : totalCameras;
  updateCameraFeed();
}

// 🎥 อัปเดต feed ปัจจุบัน
function updateCameraFeed() {
  const feed = document.getElementById("liveFeed");
  const label = document.getElementById("camLabel");
  const cameraInfo = document.getElementById("cameraInfo");

  if (feed && label && cameraInfo) {
    label.textContent = currentCamera;
    cameraInfo.textContent = `กล้อง ${currentCamera}/${totalCameras}`;
    feed.src = `http://127.0.0.1:5000/api/frame/${currentLab}/${currentCamera}?t=${Date.now()}`;
  }
}

// 🎥 เข้าแต่ละห้อง
function enterLab(labId, labName) {
  currentLab = labId;
  currentCamera = 1;

  document.getElementById("labMenu").classList.add("hidden");
  document.getElementById("labInterface").classList.remove("hidden");
  document.getElementById("currentLabName").textContent = labName;

  updateCameraFeed();
  startLiveFeed();
}

// 🔙 กลับไปหน้าเมนู
function backToMenu() {
  document.getElementById("labInterface").classList.add("hidden");
  document.getElementById("labMenu").classList.remove("hidden");
  currentLab = "";
}

// 🌙 โหมดมืด / สว่าง
function toggleDarkMode() {
  const body = document.body;
  const isDark = body.classList.contains("dark");
  if (isDark) {
    body.classList.remove("dark");
    document.getElementById("themeIcon").textContent = "🌙";
    document.getElementById("themeText").textContent = "โหมดมืด";
    localStorage.setItem("darkMode", "false");
  } else {
    body.classList.add("dark");
    document.getElementById("themeIcon").textContent = "☀️";
    document.getElementById("themeText").textContent = "โหมดสว่าง";
    localStorage.setItem("darkMode", "true");
  }
}

// 📦 ฟังก์ชัน export ข้อมูลจาก dashboard
function downloadReport(format) {
  const data = {
    lab: currentLab || "unknown",
    camera: currentCamera || 1,
    timestamp: new Date().toLocaleString(),
    people: document.querySelector(".text-blue-600")?.textContent || 0,
    pcUsed: document.querySelector(".text-green-600")?.textContent || 0,
    pcFree: document.querySelector(".text-orange-600")?.textContent || 0,
    usage: document.querySelector(".text-purple-600")?.textContent || "0%",
  };

  let fileContent, mimeType, extension;

  switch (format) {
    case "json":
      fileContent = JSON.stringify(data, null, 2);
      mimeType = "application/json";
      extension = "json";
      break;
    case "csv":
      fileContent =
        Object.keys(data).join(",") + "\n" + Object.values(data).join(",");
      mimeType = "text/csv";
      extension = "csv";
      break;
    case "excel":
      fileContent =
        Object.keys(data).join("\t") + "\n" + Object.values(data).join("\t");
      mimeType = "application/vnd.ms-excel";
      extension = "xls";
      break;
    case "pdf":
      // ✅ ใช้ html2canvas + jsPDF ถ้ามีในโปรเจ็กต์
      if (window.jspdf && window.html2canvas) {
        html2canvas(document.body).then((canvas) => {
          const imgData = canvas.toDataURL("image/png");
          const pdf = new jsPDF();
          pdf.addImage(imgData, "PNG", 10, 10, 180, 0);
          pdf.save(`Report_${data.lab}_${Date.now()}.pdf`);
        });
        return;
      } else {
        alert(
          "❗ ต้องติดตั้ง jsPDF และ html2canvas ก่อนถึงจะบันทึกเป็น PDF ได้"
        );
        return;
      }
    default:
      alert("ไม่รู้จักรูปแบบไฟล์ที่เลือก");
      return;
  }

  const blob = new Blob([fileContent], { type: mimeType });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `Report_${data.lab}_${Date.now()}.${extension}`;
  link.click();
}

// 🔄 รีเฟรชข้อมูล (ภาพ + ตัวเลข)
function refreshData() {
  if (!currentLab) {
    alert("⚠️ กรุณาเลือกห้องก่อนรีเฟรช");
    return;
  }
  updateCameraFeed(); // โหลดภาพใหม่
  startLiveFeed(); // โหลดข้อมูลใหม่
  document.getElementById("lastUpdate").textContent =
    new Date().toLocaleTimeString();
}

// 📊 แสดง modal ส่งออกรายงาน
function exportReport() {
  const modal = document.getElementById("reportModal");
  if (modal) modal.classList.remove("hidden");

  const labName =
    document.getElementById("currentLabName")?.textContent || "ไม่ทราบห้อง";
  document.getElementById("reportLabName").textContent = labName;
}

// ❌ ปิด modal
function closeReportModal() {
  const modal = document.getElementById("reportModal");
  if (modal) modal.classList.add("hidden");
}

document.addEventListener("DOMContentLoaded", function () {
  const savedDarkMode = localStorage.getItem("darkMode");
  if (savedDarkMode === "true") {
    document.body.classList.add("dark");
    document.getElementById("themeIcon").textContent = "☀️";
    document.getElementById("themeText").textContent = "โหมดสว่าง";
  }
});
