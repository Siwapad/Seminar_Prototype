from flask import Flask, jsonify, send_from_directory, Response
from flask_cors import CORS
from ultralytics import YOLO
import cv2, os
from datetime import datetime
from collections import deque
from behavior_analyzer import analyze_frame, get_behavior_label_th

app = Flask(__name__, static_folder="../dashboard")
CORS(app)

# โหลดโมเดล YOLO (ตรวจจับเฉพาะคน)
model = YOLO("yolov8n.pt")
model.classes = [0]

# โหลดโมเดล Pose สำหรับวิเคราะห์พฤติกรรม
pose_model = YOLO("yolov8n-pose.pt")

# 📊 เก็บสถิติย้อนหลัง (เก็บ 30 รายการล่าสุด = 1 นาที ถ้าอัปเดตทุก 2 วินาที)
stats_history = {}  # {lab_id: deque of stats}
activity_log = {}   # {lab_id: deque of activities}
MAX_HISTORY = 30

# ✅ API 1: ส่งเฟรมภาพพร้อมกรอบตรวจจับ
@app.route("/api/frame/<lab_id>/<int:cam_id>")
def get_lab_frame(lab_id, cam_id):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    image_path = os.path.join(base_dir, "test_images", f"{lab_id}_{cam_id}.png")

    if not os.path.exists(image_path):
        print(f"⚠️ ไม่พบรูปภาพที่: {image_path}")
        return jsonify({"error": "Image not found"}), 404

    frame = cv2.imread(image_path)
    if frame is None:
        return jsonify({"error": "Unable to read image"}), 400

    results = model(frame)
    annotated_frame = results[0].plot()

    _, buffer = cv2.imencode(".jpg", annotated_frame)
    return Response(buffer.tobytes(), mimetype="image/jpeg")


# ✅ API 2: ส่งข้อมูลการตรวจจับ (จำนวนคน, ความมั่นใจเฉลี่ย)
@app.route("/api/data/<lab_id>/<int:cam_id>")
def get_lab_data(lab_id, cam_id):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    image_path = os.path.join(base_dir, "test_images", f"{lab_id}_{cam_id}.png")

    if not os.path.exists(image_path):
        return jsonify({"error": "Image not found"}), 404

    frame = cv2.imread(image_path)
    if frame is None:
        return jsonify({"error": "Unable to read image"}), 400

    results = model(frame)
    boxes = results[0].boxes

    num_people = 0
    confs = []

    for box in boxes:
        cls_id = int(box.cls[0])
        conf = float(box.conf[0])
        confs.append(conf)
        if cls_id == 0:
            num_people += 1

    avg_conf = round(sum(confs) / len(confs) * 100, 2) if confs else 0
    print("🔍 Detections:", [(float(b.conf[0]), int(b.cls[0])) for b in boxes])

    return jsonify({
        "lab_id": lab_id,
        "camera_id": cam_id,
        "num_people": num_people,
        "avg_confidence": avg_conf,
        "detected_objects": len(confs)
    })


# ✅ API 3: วิเคราะห์พฤติกรรมนักศึกษา (Pose Estimation)
@app.route("/api/behavior/<lab_id>/<int:cam_id>")
def get_behavior_analysis(lab_id, cam_id):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    image_path = os.path.join(base_dir, "test_images", f"{lab_id}_{cam_id}.png")

    if not os.path.exists(image_path):
        # ลองหา .PNG (uppercase)
        image_path = os.path.join(base_dir, "test_images", f"{lab_id}_{cam_id}.PNG")
        if not os.path.exists(image_path):
            return jsonify({"error": "Image not found"}), 404

    frame = cv2.imread(image_path)
    if frame is None:
        return jsonify({"error": "Unable to read image"}), 400

    # วิเคราะห์พฤติกรรมด้วย pose estimation
    analysis = analyze_frame(frame)
    
    # บันทึกสถิติ
    record_stats(lab_id, analysis)
    
    print(f"🧠 Behavior Analysis: {analysis['summary']} | Attention: {analysis['attention_rate']}%")

    return jsonify({
        "lab_id": lab_id,
        "camera_id": cam_id,
        "total_people": analysis["total_people"],
        "attention_rate": analysis["attention_rate"],
        "summary": analysis["summary"],
        "behaviors": [
            {
                "behavior": b["behavior"],
                "behavior_th": get_behavior_label_th(b["behavior"]),
                "confidence": b["confidence"]
            } for b in analysis["behaviors"]
        ]
    })


# ✅ API 4: ส่งภาพพร้อม behavior annotation
@app.route("/api/behavior-frame/<lab_id>/<int:cam_id>")
def get_behavior_frame(lab_id, cam_id):
    base_dir = os.path.dirname(os.path.abspath(__file__))
    image_path = os.path.join(base_dir, "test_images", f"{lab_id}_{cam_id}.png")

    if not os.path.exists(image_path):
        image_path = os.path.join(base_dir, "test_images", f"{lab_id}_{cam_id}.PNG")
        if not os.path.exists(image_path):
            return jsonify({"error": "Image not found"}), 404

    frame = cv2.imread(image_path)
    if frame is None:
        return jsonify({"error": "Unable to read image"}), 400

    # วิเคราะห์และสร้างภาพที่มี annotation
    analysis = analyze_frame(frame)
    annotated_frame = analysis["annotated_frame"]
    
    if annotated_frame is None:
        annotated_frame = frame

    _, buffer = cv2.imencode(".jpg", annotated_frame)
    return Response(buffer.tobytes(), mimetype="image/jpeg")


# ✅ API 5: ดึงข้อมูลสถิติย้อนหลังสำหรับกราฟ
@app.route("/api/stats/<lab_id>")
def get_stats_history(lab_id):
    if lab_id not in stats_history:
        return jsonify({
            "lab_id": lab_id,
            "history": [],
            "labels": []
        })
    
    history = list(stats_history[lab_id])
    labels = [item["time"] for item in history]
    attention_rates = [item["attention_rate"] for item in history]
    people_counts = [item["total_people"] for item in history]
    
    # สถิติพฤติกรรมล่าสุด
    latest = history[-1] if history else None
    
    return jsonify({
        "lab_id": lab_id,
        "labels": labels,
        "attention_rates": attention_rates,
        "people_counts": people_counts,
        "latest_summary": latest["summary"] if latest else None
    })


# ✅ API 6: ดึง Activity Log
@app.route("/api/activities/<lab_id>")
def get_activities(lab_id):
    if lab_id not in activity_log:
        return jsonify({"lab_id": lab_id, "activities": []})
    
    return jsonify({
        "lab_id": lab_id,
        "activities": list(activity_log[lab_id])
    })


# 📝 ฟังก์ชันบันทึกสถิติ (เรียกจาก behavior API)
def record_stats(lab_id, analysis):
    if lab_id not in stats_history:
        stats_history[lab_id] = deque(maxlen=MAX_HISTORY)
        activity_log[lab_id] = deque(maxlen=20)
    
    now = datetime.now()
    time_str = now.strftime("%H:%M:%S")
    
    stats_history[lab_id].append({
        "time": time_str,
        "attention_rate": analysis["attention_rate"],
        "total_people": analysis["total_people"],
        "summary": analysis["summary"]
    })
    
    # บันทึก activity ถ้ามีการเปลี่ยนแปลงสำคัญ
    summary = analysis["summary"]
    if summary.get("sleeping", 0) > 0:
        activity_log[lab_id].appendleft({
            "time": time_str,
            "type": "warning",
            "message": f"⚠️ ตรวจพบนักศึกษาหลับ {summary['sleeping']} คน"
        })
    
    if analysis["attention_rate"] < 50:
        activity_log[lab_id].appendleft({
            "time": time_str,
            "type": "alert",
            "message": f"🔴 ความตั้งใจต่ำ ({analysis['attention_rate']}%)"
        })


# ✅ หน้าเว็บหลัก
@app.route("/")
def serve_dashboard():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(app.static_folder, path)


if __name__ == "__main__":
    app.run(debug=True)
