import time
import cv2
from flask import Flask, Response

TARGET_W, TARGET_H = 320, 180
FPS = 5
JPEG_QUALITY = 50
FRAME_DELAY = 1.0 / FPS

app = Flask(__name__)
cap = cv2.VideoCapture(0)

def gen():
    last_sent = 0.0

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        frame = cv2.resize(frame, (TARGET_W, TARGET_H), interpolation=cv2.INTER_AREA)

        now = time.time()
        if now - last_sent < FRAME_DELAY:
            continue
        last_sent = now

        ok, jpg = cv2.imencode(
            ".jpg",
            frame,
            [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY],
        )
        if not ok:
            continue

        yield (b"--frame\r\n"
               b"Content-Type: image/jpeg\r\n\r\n" + jpg.tobytes() + b"\r\n")

@app.get("/mjpeg")
def mjpeg():
    return Response(gen(), mimetype="multipart/x-mixed-replace; boundary=frame")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, threaded=True)