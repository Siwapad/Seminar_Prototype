from flask import Flask, jsonify, send_from_directory, Response
from flask_cors import CORS
from ultralytics import YOLO
import cv2, os

app = Flask(__name__, static_folder="../dashboard")
CORS(app)

# โหลดโมเดล YOLO (ตรวจจับเฉพาะคน)
model = YOLO("yolov8n.pt")
model.classes = [0]

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


# ✅ หน้าเว็บหลัก
@app.route("/")
def serve_dashboard():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(app.static_folder, path)


if __name__ == "__main__":
    app.run(debug=True)
