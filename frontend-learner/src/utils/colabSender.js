/**
 * Colab HTTP 전송 — colab_sender.py의 JS 포팅
 * 캔버스 프레임을 JPEG blob으로 Colab /analyze 엔드포인트에 전송
 * 결과: { emotion, phone_detected, phone_confidence, ... }
 */

export class ColabSender {
  constructor(baseUrl, interval = 1.0) {
    this._url       = baseUrl.replace(/\/$/, '') + '/analyze';
    this._interval  = interval * 1000; // ms
    this._result    = {};
    this._connected = false;
    this._sending   = false;
    this._lastSent  = 0;
    this._canvas    = document.createElement('canvas');
    this._canvas.width  = 320;
    this._canvas.height = 240;
    this._ctx = this._canvas.getContext('2d');
  }

  get result()    { return this._result; }
  get connected() { return this._connected; }

  /** 매 프레임 호출. interval 이하면 스킵. */
  async push(videoEl) {
    const now = Date.now();
    if (this._sending || now - this._lastSent < this._interval) return;
    this._sending  = true;
    this._lastSent = now;

    try {
      this._ctx.drawImage(videoEl, 0, 0, 320, 240);
      const blob = await new Promise(resolve =>
        this._canvas.toBlob(resolve, 'image/jpeg', 0.6)
      );
      const form = new FormData();
      form.append('file', blob, 'frame.jpg');

      const res = await fetch(this._url, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      this._result    = await res.json();
      this._connected = true;
    } catch {
      this._connected = false;
    } finally {
      this._sending = false;
    }
  }

  updateUrl(newBaseUrl) {
    this._url = newBaseUrl.replace(/\/$/, '') + '/analyze';
  }
}
