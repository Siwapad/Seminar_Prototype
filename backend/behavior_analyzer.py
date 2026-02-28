"""
🧠 Behavior Analyzer v2 - วิเคราะห์พฤติกรรมนักศึกษาจาก Pose Estimation
แก้ไขให้แม่นขึ้นสำหรับห้องแล็บ:
  - Multi-signal scoring แทน single threshold
  - ตรวจจับโทรศัพท์จาก wrist position
  - CLAHE preprocessing สำหรับแสงสว่างไม่สม่ำเสมอ
  - ใช้ yolov8s-pose (small) แทน nano ถ้ามี
  - Calibrate threshold สำหรับกล้องมุมสูงห้องแล็บ
"""
from ultralytics import YOLO
import numpy as np
import cv2
import os

# ──────────────────────────────────────────────
# โมเดล (lazy-loading)
# ──────────────────────────────────────────────
pose_model = None
_MODEL_NAME = "yolov8s-pose.pt"   # small > nano (ดาวน์โหลดอัตโนมัติถ้ายังไม่มี)

def get_pose_model():
    global pose_model
    if pose_model is None:
        base = os.path.dirname(os.path.abspath(__file__))
        small_path = os.path.join(base, _MODEL_NAME)
        nano_path  = os.path.join(base, "yolov8n-pose.pt")
        if os.path.exists(small_path):
            pose_model = YOLO(small_path)
        elif os.path.exists(nano_path):
            print("⚠️  yolov8s-pose.pt ไม่พบ — ใช้ yolov8n-pose.pt แทน")
            pose_model = YOLO(nano_path)
        else:
            pose_model = YOLO(_MODEL_NAME)   # ให้ ultralytics ดาวน์โหลดเอง
    return pose_model


# ──────────────────────────────────────────────
# Preprocessing
# ──────────────────────────────────────────────
def preprocess_frame(frame: np.ndarray) -> np.ndarray:
    """CLAHE บน L-channel เพื่อ normalize แสงหลายระดับในห้องเรียน"""
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    l = clahe.apply(l)
    return cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)


# ──────────────────────────────────────────────
# Keypoint helpers
# ──────────────────────────────────────────────
KP_CONF_THRESHOLD = 0.40   # keypoint confidence ต่ำกว่านี้ถือว่าไม่น่าเชื่อถือ

_KP_IDX = dict(
    nose=0,
    left_eye=1,  right_eye=2,
    left_ear=3,  right_ear=4,
    left_shoulder=5,  right_shoulder=6,
    left_elbow=7,     right_elbow=8,
    left_wrist=9,     right_wrist=10,
    left_hip=11,      right_hip=12,
)

def _get(kp, name):
    """คืน (x, y) ถ้า confidence ผ่าน threshold, ไม่งั้น None"""
    idx = _KP_IDX.get(name)
    if idx is None or idx >= len(kp):
        return None
    x, y, c = kp[idx]
    return np.array([float(x), float(y)]) if c >= KP_CONF_THRESHOLD else None

def _midpoint(a, b):
    return (a + b) / 2 if (a is not None and b is not None) else None

def _dist(a, b):
    return float(np.linalg.norm(a - b)) if (a is not None and b is not None) else None


# ──────────────────────────────────────────────
# Multi-signal scoring
# ──────────────────────────────────────────────
def _score_behavior(kp) -> dict:
    """
    คำนวณ score สำหรับแต่ละพฤติกรรมจาก keypoints หลายจุด

    Signals ที่ใช้:
      S1  Head elevation ratio   (จมูก vs ไหล่)
      S2  Trunk uprightness      (ไหล่ vs สะโพก)
      S3  Eye separation ratio   (หน้าตรง vs หันข้าง)
      S4  Ear symmetry           (เห็นสองหู vs หูเดียว)
      S5  Wrist-to-face proximity (ถือโทรศัพท์)
      S6  Elbow raised           (วางข้อศอกสูง)
    """
    scores = {"attentive": 0.0, "looking_down": 0.0,
              "sleeping": 0.0, "looking_away": 0.0}

    nose           = _get(kp, "nose")
    left_eye       = _get(kp, "left_eye")
    right_eye      = _get(kp, "right_eye")
    left_shoulder  = _get(kp, "left_shoulder")
    right_shoulder = _get(kp, "right_shoulder")
    left_wrist     = _get(kp, "left_wrist")
    right_wrist    = _get(kp, "right_wrist")
    left_elbow     = _get(kp, "left_elbow")
    right_elbow    = _get(kp, "right_elbow")
    left_hip       = _get(kp, "left_hip")
    right_hip      = _get(kp, "right_hip")

    shoulder_center = _midpoint(left_shoulder, right_shoulder)
    hip_center      = _midpoint(left_hip, right_hip)
    shoulder_width  = (_dist(left_shoulder, right_shoulder) or 80.0)

    # ── S1: Head elevation ratio ─────────────────────────────────
    # กล้องห้องแล็บมักอยู่สูง ~30-45° calibrate threshold ให้เหมาะ
    if nose is not None and shoulder_center is not None:
        head_elev  = shoulder_center[1] - nose[1]   # บวก = หัวสูงกว่าไหล่ (ปกติ)
        head_ratio = head_elev / shoulder_width

        if   head_ratio > 0.55:                     # นั่งตรง หัวตั้งชัด
            scores["attentive"]    += 2.5
        elif head_ratio > 0.30:                     # นั่งตรงพอสมควร
            scores["attentive"]    += 1.5
            scores["looking_down"] += 0.5
        elif head_ratio > 0.10:                     # ก้มเล็กน้อย
            scores["looking_down"] += 2.5
        elif head_ratio > -0.10:                    # ก้มมาก
            scores["looking_down"] += 1.5
            scores["sleeping"]     += 1.5
        else:                                       # หัวต่ำมาก / หลับ
            scores["sleeping"]     += 3.0

    # ── S2: Trunk uprightness ────────────────────────────────────
    if shoulder_center is not None and hip_center is not None:
        trunk_dy = shoulder_center[1] - hip_center[1]  # ลบ = ไหล่สูงกว่าสะโพก (ปกติ)
        if trunk_dy > 5:          # ไหล่ต่ำกว่าสะโพก = โย้ตัวมาก / หลับ
            scores["sleeping"]  += 2.0
        elif trunk_dy < -20:      # ตั้งตรงดี
            scores["attentive"] += 1.0

    # ── S3: Eye separation ratio ─────────────────────────────────
    eye_dist = _dist(left_eye, right_eye)
    if eye_dist is not None:
        eye_ratio = eye_dist / shoulder_width
        if   eye_ratio > 0.25:   scores["attentive"]    += 2.0  # หน้าตรง
        elif eye_ratio > 0.12:   scores["attentive"]    += 0.5
        else:                    scores["looking_away"] += 1.5  # หันข้าง

    # ── S4: Ear symmetry ─────────────────────────────────────────
    left_ear_conf  = float(kp[3][2]) if len(kp) > 3 else 0.0
    right_ear_conf = float(kp[4][2]) if len(kp) > 4 else 0.0
    both_ears = (left_ear_conf  >= KP_CONF_THRESHOLD and
                 right_ear_conf >= KP_CONF_THRESHOLD)
    one_ear   = ((left_ear_conf  >= KP_CONF_THRESHOLD) ^
                 (right_ear_conf >= KP_CONF_THRESHOLD))
    if both_ears: scores["attentive"]    += 1.0
    elif one_ear: scores["looking_away"] += 1.0

    # ── S5: Wrist-to-face proximity (phone detection) ────────────
    face_center = nose if nose is not None else _midpoint(left_eye, right_eye)
    if face_center is not None:
        for wrist in [left_wrist, right_wrist]:
            if wrist is not None:
                wr = (_dist(wrist, face_center) or 9999) / shoulder_width
                if   wr < 0.6:   # wrist ใกล้หน้ามาก = ถือโทรศัพท์
                    scores["looking_down"] += 2.0
                    scores["attentive"]    -= 0.5
                elif wr < 1.0:
                    scores["looking_down"] += 0.5

    # ── S6: Elbow raised ─────────────────────────────────────────
    for elbow, shoulder in [(left_elbow, left_shoulder),
                            (right_elbow, right_shoulder)]:
        if elbow is not None and shoulder is not None:
            if shoulder[1] - elbow[1] > 10:   # ข้อศอกสูงกว่าไหล่
                scores["looking_down"] += 0.5

    # คลิปค่าลบออก
    for k in scores:
        scores[k] = max(0.0, scores[k])

    return scores


def analyze_pose(keypoints) -> dict:
    """
    วิเคราะห์ท่าทางจาก keypoints ด้วย multi-signal scoring

    Returns: {"behavior": str, "confidence": int, "details": dict}
    """
    if keypoints is None or len(keypoints) < 13:
        return {"behavior": "unknown", "confidence": 0, "details": {}}

    scores = _score_behavior(keypoints)
    total  = sum(scores.values())

    if total < 1.0:
        # signal น้อยเกินไป (keypoints ส่วนใหญ่ confidence ต่ำ / คนถูกบดบังมาก)
        return {"behavior": "unknown", "confidence": 0,
                "details": {"scores": {k: round(v, 2) for k, v in scores.items()}}}

    best  = max(scores, key=scores.get)
    best_score = scores[best]
    confidence = min(97, int(round((best_score / total) * 100)))

    # ถ้าคะแนนชนะไม่ชัดเจน ให้ fallback เป็น attentive (กรณี ambiguous)
    sorted_vals = sorted(scores.values(), reverse=True)
    if len(sorted_vals) > 1 and best_score - sorted_vals[1] < 0.5 and best != "attentive":
        best       = "attentive"
        confidence = max(40, confidence - 15)

    visible_kp = int(sum(
        1 for kp in keypoints if len(kp) >= 3 and kp[2] >= KP_CONF_THRESHOLD
    ))

    return {
        "behavior":   best,
        "confidence": confidence,
        "details": {
            "scores":           {k: round(v, 2) for k, v in scores.items()},
            "visible_keypoints": visible_kp,
        },
    }


# ──────────────────────────────────────────────
# Frame-level analysis
# ──────────────────────────────────────────────
def analyze_frame(frame: np.ndarray) -> dict:
    """
    วิเคราะห์ภาพทั้งเฟรม พร้อม preprocessing และ annotated output

    Args:
        frame: BGR numpy array
    Returns:
        dict: total_people, behaviors, summary, attention_rate, annotated_frame
    """
    processed = preprocess_frame(frame)

    model   = get_pose_model()
    results = model(
        processed,
        verbose=False,
        conf=0.35,   # detection confidence ต่ำลงเพื่อจับคนที่ถูกจอบดบัง
        iou=0.45,    # NMS IoU ป้องกัน duplicate detection
        imgsz=640,
    )

    _empty = {
        "total_people": 0,
        "behaviors": [],
        "summary": {"attentive": 0, "sleeping": 0,
                    "looking_down": 0, "looking_away": 0, "unknown": 0},
        "attention_rate": 0,
        "annotated_frame": frame,
    }

    if not results or results[0].keypoints is None:
        return _empty

    keypoints_data = results[0].keypoints.data.cpu().numpy()
    boxes          = results[0].boxes

    if len(keypoints_data) == 0:
        return _empty

    behaviors      = []
    behavior_counts = {"attentive": 0, "sleeping": 0,
                       "looking_down": 0, "looking_away": 0, "unknown": 0}

    for kp in keypoints_data:
        analysis = analyze_pose(kp)
        behaviors.append(analysis)
        beh = analysis["behavior"]
        if beh in behavior_counts:
            behavior_counts[beh] += 1

    total_people    = len(behaviors)
    attentive_count = behavior_counts["attentive"]
    attention_rate  = round((attentive_count / total_people) * 100, 1) if total_people else 0

    # ── Annotated frame ──────────────────────────────────────────
    annotated_frame = results[0].plot(conf=False, labels=False)

    _COLOR = {
        "attentive":    ( 50, 205,  50),  # เขียว
        "sleeping":     (  0,   0, 220),  # แดง
        "looking_down": (  0, 140, 255),  # ส้ม
        "looking_away": (  0, 200, 200),  # เหลือง
        "unknown":      (180, 180, 180),  # เทา
    }

    if boxes is not None and len(boxes) > 0:
        for box, beh in zip(boxes, behaviors):
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            color  = _COLOR.get(beh["behavior"], (180, 180, 180))
            label  = get_behavior_label_th(beh["behavior"])
            conf_t = beh["confidence"]

            cv2.rectangle(annotated_frame, (x1, y1), (x2, y2), color, 2)

            text = f"{label} {conf_t}%"
            (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)
            label_y = max(y1 - 5, th + 5)
            cv2.rectangle(annotated_frame,
                          (x1, label_y - th - 4), (x1 + tw + 4, label_y + 2),
                          color, cv2.FILLED)
            cv2.putText(annotated_frame, text, (x1 + 2, label_y),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 2)

    # ── HUD bar ──────────────────────────────────────────────────
    h, w = annotated_frame.shape[:2]
    hud = (f"Attention {attention_rate}%  |  "
           f"Students: {total_people}  |  "
           f"Sleeping: {behavior_counts['sleeping']}  |  "
           f"Phone/Down: {behavior_counts['looking_down']}")
    cv2.rectangle(annotated_frame, (0, h - 32), (w, h), (30, 30, 30), cv2.FILLED)
    cv2.putText(annotated_frame, hud, (8, h - 10),
                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (220, 220, 220), 1)

    return {
        "total_people":    total_people,
        "behaviors":       behaviors,
        "summary":         behavior_counts,
        "attention_rate":  attention_rate,
        "annotated_frame": annotated_frame,
    }


# ──────────────────────────────────────────────
# Label helpers
# ──────────────────────────────────────────────
def get_behavior_label_th(behavior: str) -> str:
    return {
        "attentive":    "ตั้งใจเรียน",
        "sleeping":     "หลับ",
        "looking_down": "ก้มหน้า/โทรศัพท์",
        "looking_away": "มองออก",
        "unknown":      "ไม่ทราบ",
    }.get(behavior, behavior)


def get_behavior_label_en(behavior: str) -> str:
    return {
        "attentive":    "Attentive",
        "sleeping":     "Sleeping",
        "looking_down": "Phone/Looking Down",
        "looking_away": "Looking Away",
        "unknown":      "Unknown",
    }.get(behavior, behavior)
