import cv2
import torch
from ultralytics import YOLO
from torchvision import models, transforms
from PIL import Image
import numpy as np
import time

# --- [1. 경로 및 설정] ---
YOLO_MODEL_PATH = 'best_t.pt' 
CNN_MODEL_PATH = 'best_phone_classifier.pth'
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# --- [2. 모델 로드] ---
yolo_model = YOLO(YOLO_MODEL_PATH)

def load_cnn(path):
    model = models.efficientnet_b0(weights=None)
    model.classifier[1] = torch.nn.Linear(model.classifier[1].in_features, 2)
    model.load_state_dict(torch.load(path, map_location=DEVICE))
    model.to(DEVICE)
    model.eval()
    return model

classifier = load_cnn(CNN_MODEL_PATH)

preprocess = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
])

# --- [3. 실시간 추론 루프] ---
cap = cv2.VideoCapture(0)

# FPS 계산을 위한 변수 초기화
prev_time = 0

print("🚀 이중 검증 시스템 가동 중... (q를 누르면 종료)")

while cap.isOpened():
    ret, frame = cap.read()
    if not ret: break

    # --- [FPS 계산 시작] ---
    current_time = time.time()
    sec = current_time - prev_time
    prev_time = current_time
    fps = 1 / sec  # 1초를 프레임 간격으로 나누어 FPS 산출
    # -----------------------

    # 1단계: YOLO로 후보군 탐지
    results = yolo_model.predict(frame, conf=0.4, verbose=False)
    
    for r in results:
        for box in r.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            
            # 2단계: 영역 Crop 및 CNN 검증
            roi = frame[y1:y2, x1:x2]
            if roi.size == 0: continue
            
            roi_pil = Image.fromarray(cv2.cvtColor(roi, cv2.COLOR_BGR2RGB))
            input_tensor = preprocess(roi_pil).unsqueeze(0).to(DEVICE)
            
            with torch.no_grad():
                output = classifier(input_tensor)
                prob = torch.nn.functional.softmax(output[0], dim=0)
                score = prob[1].item() 

            if score > 0.8:
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 3) 
                cv2.putText(frame, f"PHONE DETECTED ({score:.2f})", (x1, y1-15), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)

    # --- [화면에 FPS 출력] ---
    fps_text = f"FPS: {fps:.1f}"
    cv2.putText(frame, fps_text, (20, 50), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 0), 3)
    # -----------------------

    cv2.imshow('Final Phone Guard', frame)
    if cv2.waitKey(1) & 0xFF == ord('q'): break

cap.release()
cv2.destroyAllWindows()