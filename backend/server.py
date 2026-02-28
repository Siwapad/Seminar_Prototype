from flask import Flask, jsonify, send_from_directory, Response, request
from flask_cors import CORS
from ultralytics import YOLO
import cv2, os, json, time
from datetime import datetime
from collections import deque
from behavior_analyzer import analyze_frame, get_behavior_label_th

app = Flask(__name__, static_folder="../dashboard")
CORS(app)

# โหลดโมเดล YOLO สำหรับตรวจจับคน — ลอง yolov8s ก่อน fallback ไป nano
_base_dir = os.path.dirname(os.path.abspath(__file__))
_small_det = os.path.join(_base_dir, "yolov8s.pt")
_nano_det  = os.path.join(_base_dir, "yolov8n.pt")
if os.path.exists(_small_det):
    model = YOLO(_small_det)
else:
    model = YOLO(_nano_det)
model.classes = [0]  # เฉพาะ class คน

# 📊 เก็บสถิติย้อนหลัง
stats_history = {}  # {lab_id: deque of stats}
activity_log = {}   # {lab_id: deque of activities}
MAX_HISTORY = 30

# 🔄 Inference cache — ป้องกัน double inference (behavior-frame + behavior ต่อ tick เดียวกัน)
analysis_cache = {}   # { (lab_id, cam_id): {"result": dict, "ts": float} }
CACHE_TTL = 4.0       # วินาที (มากกว่า poll interval 2s เล็กน้อย)

# 🔔 Alerts — รายการแจ้งเตือนสำหรับ frontend
alerts_list = []
_alert_id_ctr = [0]  # ใช้ list เพื่อให้ nested function แก้ไขได้

# 💾 Persistence — path สำหรับบันทึกข้อมูลลง disk
DATA_DIR   = os.path.join(_base_dir, "data")
STATS_FILE = os.path.join(DATA_DIR, "stats.json")


def _get_image_path(lab_id, cam_id):
    """หา path รูปภาพ รองรับ .png/.PNG"""
    base = os.path.dirname(os.path.abspath(__file__))
    for ext in (".png", ".PNG"):
        p = os.path.join(base, "test_images", f"{lab_id}_{cam_id}{ext}")
        if os.path.exists(p):
            return p
    return None


def _get_cached(lab_id, cam_id):
    entry = analysis_cache.get((lab_id, cam_id))
    if entry and (time.time() - entry["ts"]) < CACHE_TTL:
        return entry["result"]
    return None


def _set_cached(lab_id, cam_id, result):
    analysis_cache[(lab_id, cam_id)] = {"result": result, "ts": time.time()}


def push_alert(lab_id, alert_type, message):
    _alert_id_ctr[0] += 1
    alerts_list.append({
        "id":      _alert_id_ctr[0],
        "time":    datetime.now().strftime("%H:%M:%S"),
        "lab_id":  lab_id,
        "type":    alert_type,
        "message": message,
    })
    if len(alerts_list) > 50:
        alerts_list.pop(0)


def save_stats():
    """บันทึก stats_history และ activity_log ลง disk"""
    os.makedirs(DATA_DIR, exist_ok=True)
    try:
        with open(STATS_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "stats_history": {k: list(v) for k, v in stats_history.items()},
                "activity_log":  {k: list(v) for k, v in activity_log.items()},
            }, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"⚠️ บันทึกข้อมูลล้มเหลว: {e}")


def load_stats():
    """โหลดข้อมูลเดิมจาก disk เมื่อ server เริ่ม"""
    if not os.path.exists(STATS_FILE):
        return
    try:
        with open(STATS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        for lab_id, items in data.get("stats_history", {}).items():
            stats_history[lab_id] = deque(items, maxlen=MAX_HISTORY)
        for lab_id, items in data.get("activity_log", {}).items():
            activity_log[lab_id] = deque(items, maxlen=20)
        print(f"📂 โหลดข้อมูลเดิม: {list(data.get('stats_history', {}).keys())}")
    except Exception as e:
        print(f"⚠️ โหลดข้อมูลเดิมล้มเหลว: {e}")


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
    # ใช้ cache ก่อน — ป้องกัน double inference กับ behavior-frame
    analysis = _get_cached(lab_id, cam_id)
    if analysis is None:
        image_path = _get_image_path(lab_id, cam_id)
        if not image_path:
            return jsonify({"error": "Image not found"}), 404
        frame = cv2.imread(image_path)
        if frame is None:
            return jsonify({"error": "Unable to read image"}), 400
        analysis = analyze_frame(frame)
        _set_cached(lab_id, cam_id, analysis)
        record_stats(lab_id, analysis)
        print(f"🧠 [{lab_id}/{cam_id}] {analysis['summary']} | Attention: {analysis['attention_rate']}%")

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
    image_path = _get_image_path(lab_id, cam_id)
    if not image_path:
        return jsonify({"error": "Image not found"}), 404
    frame = cv2.imread(image_path)
    if frame is None:
        return jsonify({"error": "Unable to read image"}), 400

    # ใช้ cache ก่อน — ป้องกัน double inference
    analysis = _get_cached(lab_id, cam_id)
    if analysis is None:
        analysis = analyze_frame(frame)
        _set_cached(lab_id, cam_id, analysis)
        record_stats(lab_id, analysis)

    annotated_frame = analysis.get("annotated_frame")
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


# 📝 ฟังก์ชันบันทึกสถิติ (เรียกครั้งเดียวต่อ cache miss)
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

    summary      = analysis["summary"]
    sleeping     = summary.get("sleeping", 0)
    looking_down = summary.get("looking_down", 0)

    # • แจ้งเตือนนักศึกษาหลับ
    if sleeping > 0:
        msg = f"⚠️ ห้อง {lab_id}: ตรวจพบนักศึกษาหลับ {sleeping} คน"
        activity_log[lab_id].appendleft({"time": time_str, "type": "warning", "message": msg})
        push_alert(lab_id, "warning", msg)

    # • แจ้งเตือนความตั้งใจต่ำ
    if analysis["attention_rate"] < 50 and analysis["total_people"] > 0:
        msg = f"🔴 ห้อง {lab_id}: ความตั้งใจต่ำ ({analysis['attention_rate']}%)"
        activity_log[lab_id].appendleft({"time": time_str, "type": "alert", "message": msg})
        push_alert(lab_id, "alert", msg)

    # • แจ้งเตือนถือโทรศัพท์จำนวนมาก
    if looking_down >= 3:
        msg = f"📱 ห้อง {lab_id}: นักศึกษาก้มหน้า/โทรศัพท์ {looking_down} คน"
        push_alert(lab_id, "info", msg)

    # • บันทึกลง disk
    save_stats()


# ✅ API 7: ส่งออกข้อมูลรายงานแบบครบถ้วน
@app.route("/api/export/<lab_id>")
def export_lab_data(lab_id):
    history = list(stats_history.get(lab_id, []))
    activities = list(activity_log.get(lab_id, []))

    avg_attention = round(sum(h["attention_rate"] for h in history) / len(history), 1) if history else 0
    avg_people = round(sum(h["total_people"] for h in history) / len(history), 1) if history else 0
    max_people = max((h["total_people"] for h in history), default=0)
    latest = history[-1] if history else None

    return jsonify({
        "lab_id": lab_id,
        "export_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "summary": {
            "avg_attention_rate": avg_attention,
            "avg_people": avg_people,
            "max_people": max_people,
            "total_records": len(history),
            "latest_attention_rate": latest["attention_rate"] if latest else 0,
            "latest_total_people": latest["total_people"] if latest else 0,
            "latest_summary": latest["summary"] if latest else {
                "attentive": 0, "sleeping": 0, "looking_down": 0, "looking_away": 0
            }
        },
        "history": history,
        "activities": activities
    })


# ✅ API 8: ดึง Alerts ใหม่ (since_id)
@app.route("/api/alerts")
def get_alerts():
    since_id = int(request.args.get("since_id", 0))
    new_alerts = [a for a in alerts_list if a["id"] > since_id]
    return jsonify({"alerts": new_alerts, "latest_id": _alert_id_ctr[0]})


# ✅ API 9: สรุปทุกห้องสำหรับ Overview
@app.route("/api/overview")
def get_overview():
    all_labs = sorted(set(list(stats_history.keys()) + ["9226", "9227"]))
    result = {}
    for lab_id in all_labs:
        history = list(stats_history.get(lab_id, []))
        latest  = history[-1] if history else None
        result[lab_id] = {
            "total_people":   latest["total_people"]   if latest else 0,
            "attention_rate": latest["attention_rate"] if latest else 0,
            "summary":        latest["summary"]        if latest else None,
            "has_data":       latest is not None,
            "last_updated":   latest["time"]           if latest else "--:--",
        }
    return jsonify({"labs": result})


# ✅ โหลดข้อมูลเดิมเมื่อ server เริ่ม
load_stats()


# ✅ หน้าเว็บหลัก
@app.route("/")
def serve_dashboard():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(app.static_folder, path)


if __name__ == "__main__":
    app.run(debug=True)
