import cv2
from ultralytics import YOLO

# 1. 모델 로드
model = YOLO('good.pt') 

# 2. 웹캠 연결 및 해상도 조절 (속도 향상을 위해 640x480 권장)
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

while cap.isOpened():
    success, frame = cap.read()
    if not success: break

    # imgsz=320: 추론 속도를 대폭 향상 (평상시 움직임 대응 핵심)
    # conf=0.3: 살짝 번져도 일단 잡고, BoT-SORT가 검증하게 함
    # iou=0.5: 박스가 겹칠 때 정확도 향상
    results = model.track(
        frame, 
        persist=True, 
        conf=0.3,      # 0.7에서 0.3으로 낮춰 탐지율 확보
        iou=0.5, 
        imgsz=320,     # 속도를 위해 해상도 다이어트 (성능 체감 클 겁니다)
        tracker="botsort.yaml",
        verbose=False  # 터미널 로그를 줄여 연산 자원 확보
    )

    for r in results:
        annotated_frame = r.plot() 
        
        if r.boxes.id is not None:
            ids = r.boxes.id.int().cpu().tolist()
            # 화면 중앙에 현재 추적 중인 개수 표시
            cv2.putText(annotated_frame, f"Tracking: {len(ids)}nd", (20, 40), 
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

    cv2.imshow("Hyper YOLOv11 Tracking", annotated_frame)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
