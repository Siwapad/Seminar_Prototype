let currentCamera = 1;
let totalCameras = 2;
let currentLab = "";
let useBehaviorMode = true; // ✅ เปิดโหมดวิเคราะห์พฤติกรรมเป็นค่าเริ่มต้น
let liveFeedInterval = null;

// 🎥 เริ่มโหลดภาพ + ดึงข้อมูลจาก Flask ทุก 2 วินาที
function startLiveFeed() {
  // หยุด interval เก่าก่อน (ป้องกันซ้ำซ้อน)
  if (liveFeedInterval) {
    clearInterval(liveFeedInterval);
  }

  const feed = document.getElementById("liveFeed");
  const detectionCount = document.getElementById("detectionCount");
  if (!feed) return;

  // เรียกทันทีครั้งแรก
  updateLiveFeed();

  // แล้วเรียกทุก 2 วินาที
  liveFeedInterval = setInterval(updateLiveFeed, 2000);
}

// 🔄 ฟังก์ชันอัปเดต feed และข้อมูล
async function updateLiveFeed() {
  const feed = document.getElementById("liveFeed");
  const detectionCount = document.getElementById("detectionCount");
  if (!feed || !currentLab) return;

  // เลือก API ตามโหมด
  const frameUrl = useBehaviorMode
    ? `http://127.0.0.1:5000/api/behavior-frame/${currentLab}/${currentCamera}?t=${Date.now()}`
    : `http://127.0.0.1:5000/api/frame/${currentLab}/${currentCamera}?t=${Date.now()}`;

  // โหลดภาพ
  feed.src = frameUrl;

  try {
    // ดึงข้อมูลการตรวจจับ
    const dataRes = await fetch(
      `http://127.0.0.1:5000/api/data/${currentLab}/${currentCamera}`,
    );
    const data = await dataRes.json();

    if (!data || data.error) {
      detectionCount.textContent = "❌ ไม่พบข้อมูลตรวจจับ";
      return;
    }

    // อัปเดตสถิติฝั่งขวา (จำนวนคน)
    const peopleEl = document.querySelector(".text-blue-600");
    const pcUsedEl = document.querySelector(
      ".text-green-600:not(#attentionRate)",
    );
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

    // ถ้าเปิดโหมดวิเคราะห์พฤติกรรม
    if (useBehaviorMode) {
      const behaviorRes = await fetch(
        `http://127.0.0.1:5000/api/behavior/${currentLab}/${currentCamera}`,
      );
      const behaviorData = await behaviorRes.json();

      if (behaviorData && !behaviorData.error) {
        updateBehaviorStats(behaviorData);
        detectionCount.textContent = `🧠 ตรวจพบ ${behaviorData.total_people} คน | ตั้งใจเรียน ${behaviorData.attention_rate}%`;
      }
    } else {
      detectionCount.textContent = `👥 ตรวจพบ ${data.num_people} คน (เชื่อมั่น ${data.avg_confidence}%)`;
    }
  } catch (e) {
    console.error("Error fetching data:", e);
    detectionCount.textContent = "⚠️ ข้อมูลไม่พร้อม";
  }
}

// 🧠 อัปเดตสถิติพฤติกรรม
function updateBehaviorStats(data) {
  const attentiveEl = document.getElementById("behaviorAttentive");
  const sleepingEl = document.getElementById("behaviorSleeping");
  const lookingDownEl = document.getElementById("behaviorLookingDown");
  const lookingAwayEl = document.getElementById("behaviorLookingAway");
  const attentionRateEl = document.getElementById("attentionRate");
  const attentionBarEl = document.getElementById("attentionBar");

  if (data.summary) {
    if (attentiveEl)
      attentiveEl.textContent = `${data.summary.attentive || 0} คน`;
    if (sleepingEl) sleepingEl.textContent = `${data.summary.sleeping || 0} คน`;
    if (lookingDownEl)
      lookingDownEl.textContent = `${data.summary.looking_down || 0} คน`;
    if (lookingAwayEl)
      lookingAwayEl.textContent = `${data.summary.looking_away || 0} คน`;
  }

  if (attentionRateEl) {
    attentionRateEl.textContent = `${data.attention_rate || 0}%`;

    // เปลี่ยนสีตามระดับความตั้งใจ
    if (data.attention_rate >= 70) {
      attentionRateEl.className = "text-xl font-bold text-green-600";
    } else if (data.attention_rate >= 40) {
      attentionRateEl.className = "text-xl font-bold text-yellow-600";
    } else {
      attentionRateEl.className = "text-xl font-bold text-red-600";
    }
  }

  if (attentionBarEl) {
    attentionBarEl.style.width = `${data.attention_rate || 0}%`;

    // เปลี่ยนสี bar ตามระดับ
    if (data.attention_rate >= 70) {
      attentionBarEl.className =
        "bg-green-500 h-3 rounded-full transition-all duration-500";
    } else if (data.attention_rate >= 40) {
      attentionBarEl.className =
        "bg-yellow-500 h-3 rounded-full transition-all duration-500";
    } else {
      attentionBarEl.className =
        "bg-red-500 h-3 rounded-full transition-all duration-500";
    }
  }
}

// 🎯 Toggle โหมดวิเคราะห์พฤติกรรม
function toggleBehaviorMode() {
  useBehaviorMode = !useBehaviorMode;
  const btn = document.getElementById("behaviorModeBtn");
  if (btn) {
    if (useBehaviorMode) {
      btn.textContent = "🧠 โหมด: วิเคราะห์พฤติกรรม";
      btn.className =
        "bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded-lg text-sm transition-colors";
    } else {
      btn.textContent = "👥 โหมด: นับจำนวนคน";
      btn.className =
        "bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded-lg text-sm transition-colors";
    }
  }
  updateLiveFeed(); // อัปเดตทันที
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
  initCharts(); // 📊 สร้างกราฟ
  startChartUpdates(); // 📊 เริ่มอัปเดตกราฟ
}

// 🔙 กลับไปหน้าเมนู
function backToMenu() {
  document.getElementById("labInterface").classList.add("hidden");
  document.getElementById("labMenu").classList.remove("hidden");
  currentLab = "";

  // หยุด intervals
  if (liveFeedInterval) {
    clearInterval(liveFeedInterval);
    liveFeedInterval = null;
  }
  stopChartUpdates();
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
          "❗ ต้องติดตั้ง jsPDF และ html2canvas ก่อนถึงจะบันทึกเป็น PDF ได้",
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

// ===== 📊 CHART FUNCTIONS =====
let attentionChart = null;
let behaviorPieChart = null;
let chartUpdateInterval = null;

// 📊 สร้างกราฟเริ่มต้น
function initCharts() {
  // ทำลายกราฟเก่าถ้ามี
  if (attentionChart) {
    attentionChart.destroy();
    attentionChart = null;
  }
  if (behaviorPieChart) {
    behaviorPieChart.destroy();
    behaviorPieChart = null;
  }

  // กราฟเส้น - ความตั้งใจเรียน
  const lineCtx = document.getElementById("attentionChart");
  if (lineCtx) {
    attentionChart = new Chart(lineCtx, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "ความตั้งใจเรียน (%)",
            data: [],
            borderColor: "rgb(34, 197, 94)",
            backgroundColor: "rgba(34, 197, 94, 0.1)",
            fill: true,
            tension: 0.4,
          },
          {
            label: "จำนวนนักศึกษา",
            data: [],
            borderColor: "rgb(59, 130, 246)",
            backgroundColor: "rgba(59, 130, 246, 0.1)",
            fill: false,
            tension: 0.4,
            yAxisID: "y1",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: "index",
          intersect: false,
        },
        scales: {
          y: {
            type: "linear",
            display: true,
            position: "left",
            min: 0,
            max: 100,
            title: {
              display: true,
              text: "ความตั้งใจ (%)",
            },
          },
          y1: {
            type: "linear",
            display: true,
            position: "right",
            min: 0,
            max: 50,
            title: {
              display: true,
              text: "จำนวนคน",
            },
            grid: {
              drawOnChartArea: false,
            },
          },
        },
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              usePointStyle: true,
              boxWidth: 8,
            },
          },
        },
      },
    });
  }

  // กราฟวงกลม - สัดส่วนพฤติกรรม
  const pieCtx = document.getElementById("behaviorPieChart");
  if (pieCtx) {
    behaviorPieChart = new Chart(pieCtx, {
      type: "doughnut",
      data: {
        labels: ["ตั้งใจเรียน", "หลับ", "ก้มหน้า", "มองออก"],
        datasets: [
          {
            data: [0, 0, 0, 0],
            backgroundColor: [
              "rgba(34, 197, 94, 0.8)",
              "rgba(239, 68, 68, 0.8)",
              "rgba(249, 115, 22, 0.8)",
              "rgba(234, 179, 8, 0.8)",
            ],
            borderWidth: 2,
            borderColor: "#fff",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              usePointStyle: true,
              boxWidth: 8,
              font: {
                size: 11,
              },
            },
          },
        },
      },
    });
  }
}

// 📊 อัปเดตข้อมูลกราฟ
async function updateCharts() {
  if (!currentLab) return;

  try {
    const res = await fetch(`http://127.0.0.1:5000/api/stats/${currentLab}`);
    const data = await res.json();

    if (attentionChart && data.labels) {
      attentionChart.data.labels = data.labels;
      attentionChart.data.datasets[0].data = data.attention_rates;
      attentionChart.data.datasets[1].data = data.people_counts;
      attentionChart.update("none");
    }

    if (behaviorPieChart && data.latest_summary) {
      const summary = data.latest_summary;
      behaviorPieChart.data.datasets[0].data = [
        summary.attentive || 0,
        summary.sleeping || 0,
        summary.looking_down || 0,
        summary.looking_away || 0,
      ];
      behaviorPieChart.update("none");
    }

    // อัปเดต Activity Log
    await updateActivityLog();
  } catch (e) {
    console.error("Error updating charts:", e);
  }
}

// 📝 อัปเดต Activity Log
async function updateActivityLog() {
  if (!currentLab) return;

  try {
    const res = await fetch(
      `http://127.0.0.1:5000/api/activities/${currentLab}`,
    );
    const data = await res.json();

    const activityList = document.getElementById("activityList");
    if (!activityList || !data.activities) return;

    if (data.activities.length === 0) {
      activityList.innerHTML = `
        <div class="flex items-center space-x-3 text-sm">
          <div class="w-2 h-2 bg-gray-400 rounded-full"></div>
          <span class="text-gray-600">--:--</span>
          <span>ยังไม่มีกิจกรรม</span>
        </div>
      `;
      return;
    }

    activityList.innerHTML = data.activities
      .slice(0, 10)
      .map((activity) => {
        let dotColor = "bg-blue-500";
        if (activity.type === "warning") dotColor = "bg-yellow-500";
        if (activity.type === "alert") dotColor = "bg-red-500";
        if (activity.type === "success") dotColor = "bg-green-500";

        return `
        <div class="flex items-center space-x-3 text-sm">
          <div class="w-2 h-2 ${dotColor} rounded-full"></div>
          <span class="text-gray-600">${activity.time}</span>
          <span>${activity.message}</span>
        </div>
      `;
      })
      .join("");
  } catch (e) {
    console.error("Error updating activity log:", e);
  }
}

// 📊 เริ่มอัปเดตกราฟทุก 2 วินาที
function startChartUpdates() {
  if (chartUpdateInterval) {
    clearInterval(chartUpdateInterval);
  }
  updateCharts(); // เรียกทันที
  chartUpdateInterval = setInterval(updateCharts, 2000);
}

// 📊 หยุดอัปเดตกราฟ
function stopChartUpdates() {
  if (chartUpdateInterval) {
    clearInterval(chartUpdateInterval);
    chartUpdateInterval = null;
  }
}

document.addEventListener("DOMContentLoaded", function () {
  const savedDarkMode = localStorage.getItem("darkMode");
  if (savedDarkMode === "true") {
    document.body.classList.add("dark");
    document.getElementById("themeIcon").textContent = "☀️";
    document.getElementById("themeText").textContent = "โหมดสว่าง";
  }
});
