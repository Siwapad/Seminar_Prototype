# ClassMood AI - ระบบวิเคราะห์พฤติกรรมนักศึกษาในห้องเรียนด้วย AI

ระบบตรวจสอบและวิเคราะห์พฤติกรรมนักศึกษาในห้องแล็บคอมพิวเตอร์แบบ Real-time โดยใช้ YOLOv8 Pose Estimation

---

![gif](https://media2.giphy.com/media/v1.Y2lkPTc5MGI3NjExNWhvdDJjM2pkaGFxNDdtYmpzM2U4eDd3c2UwaW9rcTMyYnplb2c3diZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/Lopx9eUi34rbq/giphy.gif)

## ฟีเจอร์หลัก

- **วิเคราะห์พฤติกรรมด้วย AI** - ตรวจจับท่าทาง (ตั้งใจเรียน/หลับ/ก้มหน้า/มองออก)
- **กราฟสถิติ Real-time** - แสดงความตั้งใจเรียนและสัดส่วนพฤติกรรม
- **รองรับหลายกล้อง** - ตรวจสอบหลายมุมมองในห้องเดียวกัน
- **ประวัติย้อนหลัง** - เก็บข้อมูลสถิติและกิจกรรม
- **Export รายงาน** - ส่งออกเป็น PDF, Excel, CSV, JSON

## เทคโนโลยีที่ใช้

### Backend

- Python 3.11
- Flask (Web Framework)
- YOLOv8 (Object Detection)
- YOLOv8-pose (Pose Estimation)
- OpenCV (Image Processing)

### Frontend

- HTML5 / CSS3 / JavaScript
- TailwindCSS (UI Framework)
- Chart.js (Data Visualization)

## การติดตั้ง

### 1. Clone Repository

```bash
git clone https://github.com/Siwapad/Seminar_Prototype.git
cd Seminar_Prototype
```

### 2. สร้าง Virtual Environment

```bash
python -m venv venv
```

### 3. เปิดใช้งาน Virtual Environment

**Windows (PowerShell):**

```powershell
venv\Scripts\Activate.ps1
```

**Windows (CMD):**

```cmd
venv\Scripts\activate.bat
```

**macOS/Linux:**

```bash
source venv/bin/activate
```

### 4. ติดตั้ง Dependencies

```bash
pip install flask flask-cors ultralytics opencv-python
```

### 5. ดาวน์โหลด YOLO Models

โมเดลจะดาวน์โหลดอัตโนมัติในครั้งแรกที่รัน หรือดาวน์โหลดเองได้ที่:

- [yolov8n.pt](https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n.pt) (~6MB)
- [yolov8n-pose.pt](https://github.com/ultralytics/assets/releases/download/v0.0.0/yolov8n-pose.pt) (~6MB)

วางไฟล์ไว้ใน root directory ของโปรเจกต์

## การใช้งาน

### รัน Server

```bash
cd backend
python server.py
```

Server จะรันที่ http://127.0.0.1:5000

### เปิดใช้งาน Dashboard

เปิดเว็บเบราว์เซอร์ไปที่:

```
http://127.0.0.1:5000
```

### การใช้งานหน้าเว็บ

1. **เลือกห้องแล็บ** - คลิกที่ห้องที่ต้องการตรวจสอบ
2. **สลับโหมด** - คลิกปุ่ม "โหมด: วิเคราะห์พฤติกรรม" เพื่อสลับโหมด
3. **สลับกล้อง** - ใช้ปุ่มลูกศรซ้าย/ขวา เพื่อเปลี่ยนมุมมอง
4. **ดูกราฟ** - กราฟจะอัปเดตทุก 2 วินาที
5. **Export รายงาน** - คลิกปุ่ม "ส่งออกรายงาน"

## โครงสร้างโปรเจกต์

```
Seminar_Prototype/
├── backend/
│   ├── server.py              # Flask API Server
│   ├── behavior_analyzer.py   # Pose Analysis Module
│   ├── detector.py           # Object Detection
│   └── test_images/          # รูปภาพทดสอบ
│       ├── 9226_1.png
│       ├── 9226_2.png
│       ├── 9227_1.PNG
│       └── 9227_2.PNG
├── dashboard/
│   ├── index.html            # หน้าเว็บหลัก
│   ├── shared.js            # JavaScript Functions
│   └── style.css            # Custom Styles
├── venv/                     # Virtual Environment (ignored)
├── yolov8n.pt               # YOLO Model (ignored)
├── yolov8n-pose.pt          # YOLO Pose Model (ignored)
├── .gitignore
└── README.md
```

## API Endpoints

| Endpoint                                | Method | คำอธิบาย                       |
| --------------------------------------- | ------ | ------------------------------ |
| `/`                                     | GET    | หน้าเว็บหลัก                   |
| `/api/frame/{lab_id}/{cam_id}`          | GET    | ภาพจากกล้อง + Object Detection |
| `/api/data/{lab_id}/{cam_id}`           | GET    | ข้อมูลจำนวนคน                  |
| `/api/behavior/{lab_id}/{cam_id}`       | GET    | ข้อมูลการวิเคราะห์พฤติกรรม     |
| `/api/behavior-frame/{lab_id}/{cam_id}` | GET    | ภาพ + Behavior Annotation      |
| `/api/stats/{lab_id}`                   | GET    | สถิติย้อนหลัง                  |
| `/api/activities/{lab_id}`              | GET    | Activity Log                   |

## การเพิ่มรูปภาพทดสอบ

วางรูปภาพใน `backend/test_images/` ตามรูปแบบ:

```
{lab_id}_{camera_id}.png
```

ตัวอย่าง:

- `9226_1.png` - ห้อง 9226 กล้องที่ 1
- `9226_2.png` - ห้อง 9226 กล้องที่ 2

## การพัฒนาต่อ

- [ ] เชื่อมต่อ Webcam/RTSP แบบ Real-time
- [ ] เพิ่ม Database (SQLite) บันทึกข้อมูลถาวร
- [ ] ระบบแจ้งเตือน (LINE/Email)
- [ ] หน้า Login สำหรับอาจารย์
- [ ] Face Recognition ระบุตัวตนนักศึกษา
- [ ] Emotion Detection วิเคราะห์อารมณ์

## ผู้พัฒนา

663380026-5 ศิวภาส ภูศรีอ่อน **(ข้าวปั้น)** || [PunKunGG](https://github.com/PunKunGG)

663380507-9 นิภาดา ยาญะนันท์ **(มิ้น)** || [MintNiphada](https://github.com/MintNiphada)

## License

MIT License
