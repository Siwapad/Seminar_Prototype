let currentCamera = 1;
let totalCameras = 2;
let currentLab = "";
let useBehaviorMode = true; // ✅ เปิดโหมดวิเคราะห์พฤติกรรมเป็นค่าเริ่มต้น
let liveFeedInterval = null;
let lastAlertId = 0; // ID สุดท้ายที่ได้รับเพื่อหลีกเอา alert ซ้ำ
let alertPollInterval = null; // setInterval handle สำหรับดึง alerts
let latestExportData = null; // เก็บข้อมูลล่าสุดสำหรับ export

// 🎥 ติดตามว่ากล้องไหนมี live source กำลัง stream อยู่ (key: "labId/camId")
const activeSources = new Set();
function _srcKey(labId, camId) {
  return `${labId}/${camId}`;
}
function isStreamActive(labId, camId) {
  return activeSources.has(_srcKey(labId, camId));
}

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

  // ถ้า stream mode — browser จัดการ image เอง ไม่ต้อง set src
  if (!isStreamActive(currentLab, currentCamera)) {
    const frameUrl = useBehaviorMode
      ? `http://127.0.0.1:5000/api/behavior-frame/${currentLab}/${currentCamera}?t=${Date.now()}`
      : `http://127.0.0.1:5000/api/frame/${currentLab}/${currentCamera}?t=${Date.now()}`;
    feed.src = frameUrl;
  }

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
    if (isStreamActive(currentLab, currentCamera)) {
      feed.src = `http://127.0.0.1:5000/api/stream/${currentLab}/${currentCamera}`;
    } else {
      feed.src = `http://127.0.0.1:5000/api/frame/${currentLab}/${currentCamera}?t=${Date.now()}`;
    }
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
  startAlertPolling(); // 🔔 เริ่มยิงฟังการแจ้งเตือน
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
  stopAlertPolling(); // 🔔 หยุดยิงฟังแจ้งเตือน
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

// 📦 ดาวน์โหลดรายงานในรูปแบบที่เลือก
function downloadReport(format) {
  const labId = currentLab || "unknown";
  const fileName = `ClassMood_Report_${labId}_${Date.now()}`;

  // สร้าง object สรุปข้อมูลจาก latestExportData หรือ fallback
  let data;
  if (latestExportData) {
    const s = latestExportData.summary || {};
    const latest = s.latest_summary || {};
    data = {
      lab_id: latestExportData.lab_id,
      export_time: latestExportData.export_time,
      avg_attention_rate: s.avg_attention_rate,
      avg_people: s.avg_people,
      max_people: s.max_people,
      total_records: s.total_records,
      latest_attention_rate: s.latest_attention_rate,
      latest_total_people: s.latest_total_people,
      behavior_attentive: latest.attentive || 0,
      behavior_sleeping: latest.sleeping || 0,
      behavior_looking_down: latest.looking_down || 0,
      behavior_looking_away: latest.looking_away || 0,
    };
  } else {
    data = {
      lab_id: labId,
      export_time: new Date().toLocaleString("th-TH"),
      avg_attention_rate: 0,
      avg_people: 0,
      max_people: 0,
      total_records: 0,
      latest_attention_rate: 0,
      latest_total_people: 0,
      behavior_attentive: 0,
      behavior_sleeping: 0,
      behavior_looking_down: 0,
      behavior_looking_away: 0,
    };
  }

  switch (format) {
    case "json":
      downloadBlob(
        JSON.stringify(latestExportData || data, null, 2),
        "application/json",
        `${fileName}.json`,
      );
      break;

    case "csv":
      downloadBlob(
        buildCSV(data),
        "text/csv;charset=utf-8;",
        `${fileName}.csv`,
      );
      break;

    case "excel":
      downloadBlob(
        buildExcel(data),
        "application/vnd.ms-excel",
        `${fileName}.xls`,
      );
      break;

    case "pdf":
      generatePDF(labId);
      break;

    default:
      alert("ไม่รู้จักรูปแบบไฟล์ที่เลือก");
  }
}

// 🛠️ สร้างเนื้อหา CSV
function buildCSV(data) {
  const rows = [
    ["รายงานการใช้งานห้องแล็บ - ClassMood AI"],
    [],
    ["ข้อมูลทั่วไป"],
    ["ห้องแล็บ", data.lab_id],
    ["เวลาส่งออก", data.export_time],
    [],
    ["สถิติรวม"],
    ["จำนวนนักศึกษาเฉลี่ย (คน)", data.avg_people],
    ["ความตั้งใจเรียนเฉลี่ย (%)", data.avg_attention_rate],
    ["นักเรียนสูงสุด (คน)", data.max_people],
    ["จำนวนบันทึกทั้งหมด", data.total_records],
    [],
    ["พฤติกรรมล่าสุด"],
    ["ตั้งใจเรียน (คน)", data.behavior_attentive],
    ["หลับ (คน)", data.behavior_sleeping],
    ["ก้มหน้า (คน)", data.behavior_looking_down],
    ["มองออก (คน)", data.behavior_looking_away],
    ["อัตราความตั้งใจล่าสุด (%)", data.latest_attention_rate],
  ];

  // เพิ่มข้อมูลย้อนหลัง
  if (
    latestExportData &&
    latestExportData.history &&
    latestExportData.history.length > 0
  ) {
    rows.push([]);
    rows.push(["ข้อมูลย้อนหลัง"]);
    rows.push(["เวลา", "ความตั้งใจ (%)", "จำนวนคน"]);
    for (const h of latestExportData.history) {
      rows.push([h.time, h.attention_rate, h.total_people]);
    }
  }

  return rows
    .map((r) => r.map((cell) => `"${cell ?? ""}"`).join(","))
    .join("\n");
}

// 🛠️ สร้างเนื้อหา Excel (TSV)
function buildExcel(data) {
  const rows = [
    ["รายงานการใช้งานห้องแล็บ - ClassMood AI"],
    [],
    ["ห้องแล็บ", data.lab_id],
    ["เวลาส่งออก", data.export_time],
    [],
    ["จำนวนนักศึกษาเฉลี่ย (คน)", data.avg_people],
    ["ความตั้งใจเรียนเฉลี่ย (%)", data.avg_attention_rate],
    ["นักเรียนสูงสุด (คน)", data.max_people],
    ["จำนวนบันทึก", data.total_records],
    [],
    ["ตั้งใจเรียน (คน)", data.behavior_attentive],
    ["หลับ (คน)", data.behavior_sleeping],
    ["ก้มหน้า (คน)", data.behavior_looking_down],
    ["มองออก (คน)", data.behavior_looking_away],
    ["อัตราความตั้งใจล่าสุด (%)", data.latest_attention_rate],
  ];

  if (
    latestExportData &&
    latestExportData.history &&
    latestExportData.history.length > 0
  ) {
    rows.push([]);
    rows.push(["เวลา", "ความตั้งใจ (%)", "จำนวนคน"]);
    for (const h of latestExportData.history) {
      rows.push([h.time, h.attention_rate, h.total_people]);
    }
  }

  return rows.map((r) => r.join("\t")).join("\n");
}

// 🛠️ สร้าง PDF จาก modal content
function generatePDF(labId) {
  const reportContent = document.querySelector("#reportModal .bg-white");
  if (!reportContent) {
    alert("❌ ไม่พบเนื้อหารายงาน");
    return;
  }
  if (typeof html2canvas === "undefined" || !window.jspdf) {
    alert("❌ ไม่สามารถสร้าง PDF ได้ กรุณาตรวจสอบการเชื่อมต่ออินเทอร์เน็ต");
    return;
  }

  // ซ่อนส่วนปุ่มดาวน์โหลดขณะ capture เพื่อไม่ให้ติดใน PDF
  const dlSection = reportContent.querySelector(".space-y-3");
  if (dlSection) dlSection.style.visibility = "hidden";

  html2canvas(reportContent, { scale: 2, useCORS: true }).then((canvas) => {
    if (dlSection) dlSection.style.visibility = "";

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 10;
    const imgWidth = pageWidth - margin * 2;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL("image/png");

    // แบ่งหน้าอัตโนมัติถ้าเนื้อหายาว
    const pageContentHeight = pageHeight - margin * 2;
    let yRemaining = imgHeight;
    let sourceY = 0;

    while (yRemaining > 0) {
      const sliceH = Math.min(yRemaining, pageContentHeight);
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = (sliceH / imgWidth) * canvas.width;
      const ctx = sliceCanvas.getContext("2d");
      ctx.drawImage(
        canvas,
        0,
        sourceY * (canvas.height / imgHeight),
        canvas.width,
        sliceCanvas.height,
        0,
        0,
        sliceCanvas.width,
        sliceCanvas.height,
      );
      pdf.addImage(
        sliceCanvas.toDataURL("image/png"),
        "PNG",
        margin,
        margin,
        imgWidth,
        sliceH,
      );
      yRemaining -= pageContentHeight;
      sourceY += pageContentHeight;
      if (yRemaining > 0) pdf.addPage();
    }

    pdf.save(`ClassMood_Report_${labId}_${Date.now()}.pdf`);
  });
}

// 🛠️ สร้าง Blob และ trigger download
function downloadBlob(content, mimeType, filename) {
  const blob = new Blob(["\uFEFF" + content], { type: mimeType }); // BOM สำหรับ UTF-8 ภาษาไทย
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
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

// 📊 เปิด modal และดึงข้อมูลจริงจาก backend
async function exportReport() {
  if (!currentLab) {
    alert("⚠️ กรุณาเลือกห้องก่อน");
    return;
  }

  const modal = document.getElementById("reportModal");
  if (modal) modal.classList.remove("hidden");

  // ชื่อห้อง
  const labName =
    document.getElementById("currentLabName")?.textContent || "ไม่ทราบห้อง";
  const el = document.getElementById("reportLabName");
  if (el) el.textContent = labName;

  // วันที่/เวลา
  const now = new Date();
  const dateStr = now.toLocaleDateString("th-TH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeStr = now.toLocaleTimeString("th-TH");
  const dateEl = document.getElementById("reportDate");
  const timeEl = document.getElementById("reportTime");
  if (dateEl) dateEl.textContent = `วันที่: ${dateStr}`;
  if (timeEl) timeEl.textContent = `เวลาส่งออก: ${timeStr}`;

  // ดึงข้อมูลจาก backend
  try {
    const res = await fetch(`http://127.0.0.1:5000/api/export/${currentLab}`);
    const data = await res.json();
    latestExportData = data;

    const s = data.summary || {};
    const latest = s.latest_summary || {};

    const set = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    set("reportRecords", `บันทึก: ${s.total_records ?? 0} รายการ`);
    set("reportAvgPeople", `นักเรียนเฉลี่ย: ${s.avg_people ?? 0} คน`);
    set(
      "reportAvgAttention",
      `ความตั้งใจเฉลี่ย: ${s.avg_attention_rate ?? 0}%`,
    );
    set("reportMaxPeople", `นักเรียนสูงสุด: ${s.max_people ?? 0} คน`);
    set("reportAttentive", `${latest.attentive ?? 0} คน`);
    set("reportSleeping", `${latest.sleeping ?? 0} คน`);
    set("reportLookingDown", `${latest.looking_down ?? 0} คน`);
    set("reportLookingAway", `${latest.looking_away ?? 0} คน`);
    set("reportLatestAttention", `${s.latest_attention_rate ?? 0}%`);
  } catch (e) {
    console.error("Error fetching export data:", e);
    latestExportData = null;
    const recEl = document.getElementById("reportRecords");
    if (recEl) recEl.textContent = "⚠️ ไม่สามารถโหลดข้อมูลได้";
  }
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
        labels: ["ตั้งใจเรียน", "หลับ", "ก้มหน้า/โทรศัพท์", "มองออก"],
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
  // 🏠 อัปเดต overview card หน้าเมนูทุก 8 วินาที
  updateOverview();
  setInterval(updateOverview, 8000);
});

// =============================================
// 🔔  Alert polling (แจ้งเตือนแบบ real-time)
// =============================================

function startAlertPolling() {
  if (alertPollInterval) return; // กันทำซ้ำ
  alertPollInterval = setInterval(pollAlerts, 3000);
  pollAlerts(); // เรียกทันที
}

function stopAlertPolling() {
  if (alertPollInterval) {
    clearInterval(alertPollInterval);
    alertPollInterval = null;
  }
}

async function pollAlerts() {
  try {
    const res = await fetch(
      `http://127.0.0.1:5000/api/alerts?since_id=${lastAlertId}`,
    );
    if (!res.ok) return;
    const data = await res.json();
    for (const alert of data.alerts || []) {
      const icons = { warning: "⚠️", alert: "🔴", info: "📱" };
      showToast((icons[alert.type] || "🔔") + " " + alert.message, alert.type);
    }
    if (data.latest_id > lastAlertId) lastAlertId = data.latest_id;
  } catch (_) {
    /* server not running is fine */
  }
}

function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const colors = {
    warning: "bg-yellow-500",
    alert: "bg-red-600",
    info: "bg-blue-500",
  };
  const bg = colors[type] || "bg-gray-700";

  const toast = document.createElement("div");
  toast.className = `${bg} text-white text-sm font-medium px-4 py-3 rounded-lg shadow-lg
    pointer-events-auto opacity-0 transition-opacity duration-300`;
  toast.textContent = message;
  container.appendChild(toast);

  // Fade in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.classList.replace("opacity-0", "opacity-100");
    });
  });

  // Auto-dismiss after 6s
  setTimeout(() => {
    toast.classList.replace("opacity-100", "opacity-0");
    setTimeout(() => toast.remove(), 350);
  }, 6000);
}

// =============================================
// 🏠  Overview card updater
// =============================================

async function updateOverview() {
  try {
    const res = await fetch("http://127.0.0.1:5000/api/overview");
    if (!res.ok) return;
    const data = await res.json();
    for (const [labId, info] of Object.entries(data.labs || {})) {
      const elPeople = document.getElementById(`ov-${labId}-people`);
      const elAttention = document.getElementById(`ov-${labId}-attention`);
      const elTime = document.getElementById(`ov-${labId}-time`);
      if (!elPeople) continue;

      elPeople.textContent = info.has_data ? info.total_people : "-";
      elTime.textContent = info.last_updated;

      const pct = info.attention_rate;
      const color =
        pct >= 70
          ? "text-green-600"
          : pct >= 40
            ? "text-yellow-500"
            : "text-red-500";
      elAttention.className = `font-medium ${color}`;
      elAttention.textContent = info.has_data ? `${pct}%` : "-%";
    }
  } catch (_) {
    /* server not running is fine */
  }
}

// =============================================
// 🎥 Video Source Management
// =============================================

/**
 * ตั้ง live source สำหรับกล้องตัวและ lab นั้นๆ
 * @param {string} labId - เช่น "9226"
 * @param {number} camId - เช่น 1 หรือ 2
 * @param {number|string} source - webcam index (0,1,...) หรือ path ไฟล์ .mp4
 */
async function setVideoSource(labId, camId, source) {
  if (!labId) {
    showToast("⚠️ กรุณาเลือกห้องก่อน", "warning");
    return;
  }
  try {
    const res = await fetch(
      `http://127.0.0.1:5000/api/sources/${labId}/${camId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      },
    );
    const data = await res.json();
    if (data.ok) {
      activeSources.add(_srcKey(labId, camId));
      updateCameraFeed();
      const srcLabel = typeof source === "number" ? `Webcam ${source}` : source;
      showToast(`✅ เชื่อมต่อสำเร็จ: ${srcLabel}`, "success");
      _updateSourceStatus(labId, camId, srcLabel);
    } else {
      showToast(`❌ เชื่อมต่อไม่สำเร็จ: ${data.error || ""}`, "alert");
    }
  } catch (e) {
    showToast(`❌ เชื่อมต่อไม่สำเร็จ: ${e.message}`, "alert");
  }
}

/**
 * ยกเลิก live source — กลับสู่โหมดรูปนิ่ง
 */
async function clearVideoSource(labId, camId) {
  try {
    await fetch(`http://127.0.0.1:5000/api/sources/${labId}/${camId}`, {
      method: "DELETE",
    });
    activeSources.delete(_srcKey(labId, camId));
    updateCameraFeed();
    showToast("📷 กลับสู่โหมดรูปนิ่ง", "info");
    _updateSourceStatus(labId, camId, null);
  } catch (e) {
    console.error(e);
  }
}

function _updateSourceStatus(labId, camId, srcLabel) {
  const el = document.getElementById("sourceStatus");
  if (!el) return;
  el.textContent = srcLabel
    ? `● Live: ${srcLabel} (กล้อง ${camId})`
    : "○ โหมด: รูปนิ่ง";
  el.className = srcLabel
    ? "text-xs font-medium text-green-600"
    : "text-xs text-gray-500";
}

// ฟังก์ชันสำหรับปุ่มใน UI
function connectWebcam() {
  const idx = parseInt(document.getElementById("webcamSelect")?.value ?? "0");
  setVideoSource(currentLab, currentCamera, idx);
}

function connectVideoFile() {
  const path = document.getElementById("videoPathInput")?.value.trim();
  if (!path) {
    showToast("⚠️ กรุณาใส่ path ไฟล์วิดีโอ", "warning");
    return;
  }
  setVideoSource(currentLab, currentCamera, path);
}

function disconnectSource() {
  clearVideoSource(currentLab, currentCamera);
}
