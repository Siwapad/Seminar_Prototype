"""
🧠 Behavior Analyzer - วิเคราะห์พฤติกรรมนักศึกษาจาก Pose Estimation
ใช้ YOLOv8-pose เพื่อตรวจจับท่าทางและวิเคราะห์พฤติกรรม
"""
from ultralytics import YOLO
import numpy as np
import cv2

# โหลดโมเดล YOLOv8-pose
pose_model = None

def get_pose_model():
    """โหลดโมเดล pose estimation (lazy loading)"""
    global pose_model
    if pose_model is None:
        pose_model = YOLO("yolov8n-pose.pt")
    return pose_model


def analyze_pose(keypoints):
    """
    วิเคราะห์ท่าทางจาก keypoints
    
    Keypoints index (COCO format):
    0: nose, 1: left_eye, 2: right_eye, 3: left_ear, 4: right_ear
    5: left_shoulder, 6: right_shoulder, 7: left_elbow, 8: right_elbow
    9: left_wrist, 10: right_wrist, 11: left_hip, 12: right_hip
    13: left_knee, 14: right_knee, 15: left_ankle, 16: right_ankle
    
    Returns:
        dict: ข้อมูลพฤติกรรมที่วิเคราะห์ได้
    """
    if keypoints is None or len(keypoints) < 17:
        return {"behavior": "unknown", "confidence": 0, "details": {}}
    
    # ดึงตำแหน่ง keypoints สำคัญ
    nose = keypoints[0][:2] if keypoints[0][2] > 0.3 else None
    left_eye = keypoints[1][:2] if keypoints[1][2] > 0.3 else None
    right_eye = keypoints[2][:2] if keypoints[2][2] > 0.3 else None
    left_shoulder = keypoints[5][:2] if keypoints[5][2] > 0.3 else None
    right_shoulder = keypoints[6][:2] if keypoints[6][2] > 0.3 else None
    
    behavior = "unknown"
    confidence = 0
    details = {}
    
    # คำนวณมุมก้มศีรษะ
    if nose is not None and left_shoulder is not None and right_shoulder is not None:
        # หาจุดกึ่งกลางไหล่
        shoulder_center = np.array([
            (left_shoulder[0] + right_shoulder[0]) / 2,
            (left_shoulder[1] + right_shoulder[1]) / 2
        ])
        
        # คำนวณความสูงของหัวเทียบกับไหล่
        head_height = shoulder_center[1] - nose[1]
        shoulder_width = abs(right_shoulder[0] - left_shoulder[0])
        
        if shoulder_width > 0:
            head_ratio = head_height / shoulder_width
            details["head_ratio"] = round(float(head_ratio), 2)
            
            # วิเคราะห์ท่าทาง
            if head_ratio < 0.3:
                # หัวต่ำมาก - อาจหลับหรือก้มดูโทรศัพท์
                behavior = "sleeping"
                confidence = min(95, int((0.3 - head_ratio) * 200 + 60))
            elif head_ratio < 0.5:
                # ก้มหน้าเล็กน้อย
                behavior = "looking_down"
                confidence = min(90, int((0.5 - head_ratio) * 150 + 50))
            elif head_ratio < 0.8:
                # ท่าทางปกติ - ตั้งใจเรียน
                behavior = "attentive"
                confidence = min(95, int(head_ratio * 80 + 30))
            else:
                # นั่งตรงมาก
                behavior = "attentive"
                confidence = 90
    
    # ตรวจสอบว่ามองหน้าจอหรือไม่ (ใช้ตำแหน่งตา)
    if left_eye is not None and right_eye is not None:
        eye_level = (left_eye[1] + right_eye[1]) / 2
        eye_distance = abs(right_eye[0] - left_eye[0])
        details["eye_distance"] = round(float(eye_distance), 2)
        
        # ถ้าระยะห่างตาแคบมาก = หันหน้าออกด้านข้าง
        if eye_distance < 10 and behavior == "attentive":
            behavior = "looking_away"
            confidence = 70
    
    return {
        "behavior": behavior,
        "confidence": confidence,
        "details": details
    }


def analyze_frame(frame):
    """
    วิเคราะห์ภาพทั้งเฟรม
    
    Args:
        frame: ภาพ (numpy array หรือ path)
    
    Returns:
        dict: ผลการวิเคราะห์ทั้งหมด
    """
    model = get_pose_model()
    results = model(frame, verbose=False)
    
    if len(results) == 0 or results[0].keypoints is None:
        return {
            "total_people": 0,
            "behaviors": {},
            "summary": {
                "attentive": 0,
                "sleeping": 0,
                "looking_down": 0,
                "looking_away": 0,
                "unknown": 0
            },
            "attention_rate": 0,
            "annotated_frame": frame if isinstance(frame, np.ndarray) else None
        }
    
    keypoints_data = results[0].keypoints.data.cpu().numpy()
    boxes = results[0].boxes
    
    behaviors = []
    behavior_counts = {
        "attentive": 0,
        "sleeping": 0,
        "looking_down": 0,
        "looking_away": 0,
        "unknown": 0
    }
    
    for i, kp in enumerate(keypoints_data):
        analysis = analyze_pose(kp)
        behaviors.append(analysis)
        
        if analysis["behavior"] in behavior_counts:
            behavior_counts[analysis["behavior"]] += 1
    
    total_people = len(behaviors)
    attention_rate = 0
    if total_people > 0:
        attentive_count = behavior_counts["attentive"]
        attention_rate = round((attentive_count / total_people) * 100, 1)
    
    # สร้างภาพที่มี annotation
    annotated_frame = results[0].plot()
    
    # เพิ่ม label พฤติกรรมบนภาพ
    if boxes is not None and len(boxes) > 0:
        for i, (box, behavior) in enumerate(zip(boxes, behaviors)):
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            
            # เลือกสีตามพฤติกรรม
            color = (0, 255, 0)  # เขียว = ตั้งใจ
            if behavior["behavior"] == "sleeping":
                color = (0, 0, 255)  # แดง = หลับ
            elif behavior["behavior"] == "looking_down":
                color = (0, 165, 255)  # ส้ม = ก้มหน้า
            elif behavior["behavior"] == "looking_away":
                color = (0, 255, 255)  # เหลือง = มองออก
            
            # วาด label
            label = get_behavior_label_th(behavior["behavior"])
            cv2.putText(annotated_frame, f"{label} {behavior['confidence']}%", 
                       (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
    
    return {
        "total_people": total_people,
        "behaviors": behaviors,
        "summary": behavior_counts,
        "attention_rate": attention_rate,
        "annotated_frame": annotated_frame
    }


def get_behavior_label_th(behavior):
    """แปลงชื่อพฤติกรรมเป็นภาษาไทย"""
    labels = {
        "attentive": "ตั้งใจเรียน",
        "sleeping": "หลับ",
        "looking_down": "ก้มหน้า",
        "looking_away": "มองออก",
        "unknown": "ไม่ทราบ"
    }
    return labels.get(behavior, behavior)


def get_behavior_label_en(behavior):
    """คืนค่า label ภาษาอังกฤษ"""
    labels = {
        "attentive": "Attentive",
        "sleeping": "Sleeping",
        "looking_down": "Looking Down",
        "looking_away": "Looking Away",
        "unknown": "Unknown"
    }
    return labels.get(behavior, behavior)
