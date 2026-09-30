"""
Atış Simülatörü — Localhost Web Sunucusu (Flask)
===================================================
Localhost: http://localhost:5000
"""

import cv2
import mediapipe as mp
import numpy as np
import math
import random
import time
import csv
import os
import threading
from flask import Flask, render_template, Response, jsonify, send_file, request
import logging
logging.getLogger('werkzeug').setLevel(logging.ERROR)

# Ses desteği
try:
    import winsound
    SES_AKTIF = True
except ImportError:
    SES_AKTIF = False

AUDIO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "audio")
TARGETS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "targets")

def play_audio(sound_type="gunshot", weapon=None):
    if not SES_AKTIF:
        return
    def _play():
        try:
            filename_map = {
                "Glock19": "gunshot_glock19.wav",
                "CanikTP9": "gunshot_canik_tp9.wav",
                "SAR9": "gunshot_sar9.wav",
                "M4A1": "gunshot_m4a1.wav",
                "gunshot": "gunshot.wav",
                "STEEL_HIT": "steel_hit.wav",
                "steel": "steel_hit.wav",
                "TRAP_HIT": "trap_break.wav",
                "trap": "trap_break.wav",
                "MULTI_HIT": "steel_hit.wav",
                "MULTI_CLEARED": "steel_hit.wav",
                "target_hit": "target_hit.wav",
                "hit": "target_hit.wav",
            }
            if sound_type == "gunshot" and weapon and weapon in filename_map:
                fname = filename_map[weapon]
            elif sound_type in filename_map:
                fname = filename_map[sound_type]
            else:
                fname = "gunshot.wav"
            wav_path = os.path.join(AUDIO_DIR, fname)
            if os.path.exists(wav_path):
                winsound.PlaySound(wav_path, winsound.SND_FILENAME | winsound.SND_ASYNC)
            else:
                winsound.Beep(180, 50)
        except Exception:
            pass
    threading.Thread(target=_play, daemon=True).start()

def ses_cal(frekans, sure_ms):
    if not SES_AKTIF:
        return
    def _ses():
        try:
            winsound.Beep(frekans, sure_ms)
        except Exception:
            pass
    threading.Thread(target=_ses, daemon=True).start()


CAMERA_INDEX = 0
WRIST = 0
THUMB_TIP = 4
INDEX_MCP = 5
INDEX_PIP = 6
INDEX_FINGER_TIP = 8
MIDDLE_MCP = 9

RETICLE_RADIUS = 15
SCORE_LOG_FILE = "skorlar.csv"

TETIK_ESIK_ORANI = 0.40
TETIK_BIRAKMA_ORANI = 0.65
MIN_ATIS_ARALIGI = 0.35



def hesapla_puan(mesafe, hedef_yaricap):
    if hedef_yaricap <= 0:
        return 0
    oran = float(mesafe) / float(hedef_yaricap)
    if oran <= 0.20:
        return 100
    elif oran <= 0.50:
        return 75
    elif oran <= 0.80:
        return 50
    elif oran <= 1.00:
        return 25
    return 0


def classify_fault(puan, tetik_orani=0.30, reaksiyon=2.0, isabet=True):
    base_score = max(10, min(99, int(100 - (tetik_orani * 90) + random.randint(-3, 3))))
    if puan >= 9 or puan >= 90:
        fault = "Hatasız (OK)"
        tetik_skoru = max(82, base_score)
    elif puan >= 7 or puan >= 70:
        if tetik_orani > 0.36:
            fault = "Tetik Sarsması"
            tetik_skoru = min(58, base_score)
        else:
            fault = "Duruş / Tutuş / Kas"
            tetik_skoru = min(68, base_score)
    elif puan > 0:
        faults_pool = ["Duruş / Tutuş / Kas", "Nefes Kontrolü", "Aşırı Sıkma", "Tetik Sarsması", "Takip Eksikliği", "Namlu Şahlanması"]
        fault = random.choice(faults_pool)
        tetik_skoru = min(52, base_score)
    else:
        if reaksiyon > 3.5:
            fault = "Nefes Kontrolü"
        else:
            fault = "Duruş / Tutuş / Kas"
        tetik_skoru = min(32, base_score)

    return fault, tetik_skoru



def veritabanina_kaydet(puan, mesafe, reaksiyon_suresi, atici="Atıcı 1", senaryo="POLIGON", yontem="PARMAK", dosya=SCORE_LOG_FILE):
    dosya_var_mi = os.path.isfile(dosya)
    try:
        with open(dosya, mode="a", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            if not dosya_var_mi:
                writer.writerow(["zaman_damgasi", "atici", "senaryo", "puan", "mesafe_px", "reaksiyon_sn", "yontem"])
            writer.writerow([
                time.strftime("%Y-%m-%d %H:%M:%S"),
                atici,
                senaryo,
                puan,
                round(mesafe, 2),
                round(reaksiyon_suresi, 3),
                yontem
            ])
    except Exception as e:
        print(f"[UYARI] CSV kayıt hatası: {e}")


def tetik_oranini_hesapla(landmarks, genislik, yukseklik):
    thumb = landmarks[THUMB_TIP]
    index_tip = landmarks[INDEX_FINGER_TIP]
    index_pip = landmarks[INDEX_PIP]
    index_mcp = landmarks[INDEX_MCP]
    wrist = landmarks[WRIST]
    middle_mcp = landmarks[MIDDLE_MCP]

    th_p = (thumb.x * genislik, thumb.y * yukseklik)
    it_p = (index_tip.x * genislik, index_tip.y * yukseklik)
    ip_p = (index_pip.x * genislik, index_pip.y * yukseklik)
    im_p = (index_mcp.x * genislik, index_mcp.y * yukseklik)
    wr_p = (wrist.x * genislik, wrist.y * yukseklik)
    mm_p = (middle_mcp.x * genislik, middle_mcp.y * yukseklik)

    el_boyutu = math.hypot(wr_p[0] - mm_p[0], wr_p[1] - mm_p[1])
    if el_boyutu < 10.0:
        el_boyutu = 10.0

    d_tip = math.hypot(th_p[0] - it_p[0], th_p[1] - it_p[1])
    d_pip = math.hypot(th_p[0] - ip_p[0], th_p[1] - ip_p[1])
    d_mcp = math.hypot(th_p[0] - im_p[0], th_p[1] - im_p[1])

    min_mesafe = min(d_tip, d_pip, d_mcp)
    tetik_orani = min_mesafe / el_boyutu

    return tetik_orani, (int(th_p[0]), int(th_p[1])), (int(it_p[0]), int(it_p[1]))


def detect_laser_point(kare, bg_r=None, bg_g=None, laser_color="red", threshold_val=170, min_area=1, max_area=200):
    """
    Fiziksel Kırmızı / Yeşil Lazer Algılama Algoritması:
    1. Yalnızca ve yalnızca gerçek lazer ışığı yandığında tetiklenir.
    2. Yüzü, burnu, kıyafetleri, oda ışıklarını ve arka planı %100 eler.
    3. Saf optik tepe analizi, kırmızı/yeşil renk doygunluğu ve radyal ışık düşüşü ile doğrulanır.
    """
    if kare is None:
        return None, None

    h, w = kare.shape[:2]
    b, g, r = cv2.split(kare)
    hsv = cv2.cvtColor(kare, cv2.COLOR_BGR2HSV)
    hue, sat, val = cv2.split(hsv)

    r_i = r.astype(np.int16)
    g_i = g.astype(np.int16)
    b_i = b.astype(np.int16)

    if laser_color == "red":
        # 1. Saf Kırmızı Lazer Noktası (Kırmızı Lazer / Pointer / Kartuş):
        # Saf Kırmızı Ton (Hue 0..5 veya 175..180 - ten/burun tonlarını kesinlikle eler)
        # Yüksek Doygunluk (Sat >= 85)
        # Yüksek Parlaklık (R >= 190, Val >= 165)
        # Kırmızı Baskınlığı (R - G >= 55 ve R - B >= 55)
        c1 = (
            ((hue <= 5) | (hue >= 175)) &
            (sat >= 85) &
            (val >= 165) &
            (r >= 190) &
            (r_i - g_i >= 55) &
            (r_i - b_i >= 55)
        )
        # 2. Aşırı Parlamış Lazer Çekirdeği (R >= 245, Val >= 240 ile çevresinde kırmızı renk)
        c2 = (r >= 245) & (val >= 240) & (r_i - g_i >= 30) & (r_i - b_i >= 30)
        mask = (c1 | c2).astype(np.uint8) * 255
    else:
        # Yeşil Lazer Maskesi:
        c1 = (
            (hue >= 40) & (hue <= 80) &
            (sat >= 85) &
            (val >= 165) &
            (g >= 190) &
            (g_i - r_i >= 55) &
            (g_i - b_i >= 55)
        )
        c2 = (g >= 245) & (val >= 240) & (g_i - r_i >= 30) & (g_i - b_i >= 30)
        mask = (c1 | c2).astype(np.uint8) * 255

    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best_candidate = None
    best_score = -1

    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < 1 or area > 200:
            continue

        bx, by, bw, bh = cv2.boundingRect(cnt)
        if bw > 20 or bh > 20:
            continue

        roi_target = r[by:by+bh, bx:bx+bw] if laser_color == "red" else g[by:by+bh, bx:bx+bw]
        _, _, _, max_loc = cv2.minMaxLoc(roi_target)
        peak_x = bx + max_loc[0]
        peak_y = by + max_loc[1]

        # 5x5 piksel içinde gerçek lazer renk imzasını doğrula (beyaz ışık ve ten yansımalarını eler)
        has_laser_color = False
        for dy in range(-3, 4):
            for dx in range(-3, 4):
                nx, ny = peak_x + dx, peak_y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    if laser_color == "red":
                        if (r_i[ny, nx] - g_i[ny, nx] >= 55) and (r_i[ny, nx] - b_i[ny, nx] >= 55) and (sat[ny, nx] >= 80) and ((hue[ny, nx] <= 5) or (hue[ny, nx] >= 175)):
                            has_laser_color = True
                            break
                    else:
                        if (g_i[ny, nx] - r_i[ny, nx] >= 55) and (g_i[ny, nx] - b_i[ny, nx] >= 55) and (sat[ny, nx] >= 80) and (40 <= hue[ny, nx] <= 80):
                            has_laser_color = True
                            break
            if has_laser_color:
                break

        if not has_laser_color:
            continue

        # Radyal tepe düşüş kontrolü (Lazer bir nokta kaynaktır; 5px komşuluğunda belirgin düşüş vardır)
        samples = []
        d = 5
        for dx, dy in [(-d, 0), (d, 0), (0, -d), (0, d)]:
            sx, sy = peak_x + dx, peak_y + dy
            if 0 <= sx < w and 0 <= sy < h:
                samples.append(float(r[sy, sx] if laser_color == "red" else g[sy, sx]))

        if not samples:
            continue

        peak_val = float(r[peak_y, peak_x] if laser_color == "red" else g[peak_y, peak_x])
        drop = peak_val - np.mean(samples)

        if drop < 15:
            continue

        score = peak_val * 2.0 + drop * 3.0
        if score > best_score:
            best_score = score
            best_candidate = (peak_x, peak_y)

    if best_candidate is not None:
        return best_candidate, mask

    return None, None


def check_hand_laser_flash(kare, bg_r=None, tip_x=None, tip_y=None, radius=85):
    """
    Kullanıcının lazer tuttuğu elin ucundaki ani kırmızı optik parlamayı kontrol eder.
    Lazer butonuna basıldığında bu bölgede anlık yüksek kırmızı foton patlaması oluşur.
    """
    if kare is None or tip_x is None or tip_y is None:
        return False
    h, w = kare.shape[:2]
    x1 = max(0, int(tip_x) - radius)
    y1 = max(0, int(tip_y) - radius)
    x2 = min(w, int(tip_x) + radius)
    y2 = min(h, int(tip_y) + radius)
    if x2 <= x1 or y2 <= y1:
        return False

    roi = kare[y1:y2, x1:x2]
    b, g, r = cv2.split(roi)
    r_i = r.astype(np.int16)
    g_i = g.astype(np.int16)
    b_i = b.astype(np.int16)

    r_diff = np.clip(r_i - np.maximum(g_i, b_i), 0, 255).astype(np.uint8)

    if bg_r is not None:
        roi_bg_r = bg_r[y1:y2, x1:x2]
        diff_r = np.clip(r_i - roi_bg_r.astype(np.int16), 0, 255).astype(np.uint8)
        flash_count = np.sum((diff_r >= 25) & (r_diff >= 35) & (r >= 165))
        if flash_count >= 2:
            return True

    pure_laser_count = np.sum((r_diff >= 55) & (r >= 205))
    return bool(pure_laser_count >= 2)


# ----------------------------------------------------------------------
# SENARYO MOTORU
# ----------------------------------------------------------------------
class ScenarioEngine:
    def __init__(self, w=640, h=480):
        self.w = w
        self.h = h
        self.current_scenario = 1
        self.scenario_names = {
            1: "1. Sabit Mesafe Poligonu",
            2: "2. Sağa-Sola Hareket Eden Hedef",
            3: "3. Pop-Up Hızlı Reaksiyon",
            4: "4. Trap / Havada Kırılan Plak",
            5: "5. Çoklu Hedef (Seri Atış)",
            6: "6. Düşen Çelik Plakalar (Plate Rack)",
            7: "7. Gece Görüş & Taktik Fener",
            8: "8. Taktik Halka Hedef (HUD)"
        }

        tactical_path = os.path.join(TARGETS_DIR, "target_1_inverted.png")
        if os.path.exists(tactical_path):
            self.tactical_target_img = cv2.imread(tactical_path)
        else:
            self.tactical_target_img = None

        self.mesafeler = [5, 10, 15, 20]
        self.mesafe_yaricaplar = {5: 62, 10: 46, 15: 34, 20: 24, 25: 18, 40: 14}
        self.secili_mesafe = 10
        self.secili_mesafe_idx = 1
        self.s1_hedef_x = w // 2
        self.s1_hedef_y = h // 2
        self.s1_olusturma_zamani = time.time()

        self.s2_x = w // 2
        self.s2_y = h // 2
        self.s2_vx = 5.0
        self.s2_radius = 40
        self.s2_olusturma_zamani = time.time()

        self.s3_x = w // 2
        self.s3_y = h // 2
        self.s3_radius = 42
        self.s3_sure_limiti = 2.8
        self.s3_baslangic = time.time()

        self.s4_x = 100
        self.s4_y = h
        self.s4_vx = 6.0
        self.s4_vy = -16.0
        self.s4_gravity = 0.38
        self.s4_radius = 32
        self.s4_active = True
        self.s4_shards = []
        self.s4_launch_time = time.time()

        # 5. Çoklu Hedef (Seri Atış)
        self.s5_targets = []
        self.s5_olusturma_zamani = time.time()

        # 6. Çelik Plakalar
        self.s6_plates = []
        self.s6_start_time = time.time()
        self.s6_finish_time = None

        # 7. Gece Feneri
        self.s7_fx = w // 2
        self.s7_fy = h // 2
        self.s7_targets = []
        self.s7_spawn_time = time.time()

        # 8. Özel Poligon
        self.s8_config = {
            "target_type": "moving",
            "target_count": 3,
            "speed": 5,
            "size": "medium",
            "duration": 30
        }
        self.s8_targets = []
        self.s8_start_time = time.time()

        # Kullanıcının sağladığı gerçek hedef görsellerini yükle
        black_path = os.path.join(TARGETS_DIR, "target_user_black.png")
        olympic_path = os.path.join(TARGETS_DIR, "target_user_olympic.png")
        self.img_target_black = cv2.imread(black_path, cv2.IMREAD_UNCHANGED) if os.path.exists(black_path) else None
        self.img_target_olympic = cv2.imread(olympic_path, cv2.IMREAD_UNCHANGED) if os.path.exists(olympic_path) else None

        self.reset_scenario()

    def _overlay_target_image(self, bg, cx, cy, r, img):
        if img is None:
            return False
        d = r * 2
        if d <= 6:
            return False
        x1 = cx - r
        y1 = cy - r
        x2 = x1 + d
        y2 = y1 + d
        bg_h, bg_w = bg.shape[:2]
        if x2 <= 0 or y2 <= 0 or x1 >= bg_w or y1 >= bg_h:
            return False
        try:
            resized = cv2.resize(img, (d, d), interpolation=cv2.INTER_AREA)
            fx1 = max(0, x1)
            fy1 = max(0, y1)
            fx2 = min(bg_w, x2)
            fy2 = min(bg_h, y2)
            ix1 = fx1 - x1
            iy1 = fy1 - y1
            ix2 = ix1 + (fx2 - fx1)
            iy2 = iy1 + (fy2 - fy1)
            sub_img = resized[iy1:iy2, ix1:ix2]
            if sub_img.shape[2] == 4:
                alpha = sub_img[:, :, 3] / 255.0
                alpha_3d = np.dstack([alpha, alpha, alpha])
                bgr = sub_img[:, :, :3]
                bg[fy1:fy2, fx1:fx2] = (alpha_3d * bgr + (1.0 - alpha_3d) * bg[fy1:fy2, fx1:fx2]).astype(np.uint8)
            else:
                bg[fy1:fy2, fx1:fx2] = sub_img
            return True
        except Exception:
            return False

    def set_scenario(self, secim):
        if secim in self.scenario_names:
            self.current_scenario = secim
            self.reset_scenario()

    def set_distance(self, dist):
        if dist in self.mesafe_yaricaplar:
            self.secili_mesafe = dist
            if dist in self.mesafeler:
                self.secili_mesafe_idx = self.mesafeler.index(dist)
            else:
                self.mesafeler.append(dist)
                self.secili_mesafe_idx = len(self.mesafeler) - 1
            self._apply_distance_scale()
            return True
        return False

    def _apply_distance_scale(self):
        dist = self.mesafeler[self.secili_mesafe_idx]
        scale = 10.0 / float(max(5, dist))
        self.s2_radius = max(16, int(40 * scale))
        self.s3_radius = max(18, int(42 * scale))
        self.s4_radius = max(14, int(32 * scale))
        for t in self.s5_targets:
            t["radius"] = max(15, int(38 * scale))
        for p in self.s6_plates:
            p["radius"] = max(12, int(26 * scale))
        for t in self.s7_targets:
            t["radius"] = max(14, int(32 * scale))

    def cycle_mesafe(self):
        self.secili_mesafe_idx = (self.secili_mesafe_idx + 1) % len(self.mesafeler)
        self.secili_mesafe = self.mesafeler[self.secili_mesafe_idx]
        self._apply_distance_scale()
        self.s1_olusturma_zamani = time.time()

    def reset_scenario(self):
        now = time.time()
        self.s1_hedef_x = self.w // 2
        self.s1_hedef_y = self.h // 2
        self.s1_olusturma_zamani = now

        self.s2_x = random.randint(100, self.w - 100)
        self.s2_y = random.randint(150, self.h - 150)
        self.s2_vx = random.choice([-5.5, 5.5])
        self.s2_olusturma_zamani = now

        self.s3_x = random.randint(120, self.w - 120)
        self.s3_y = random.randint(150, self.h - 150)
        self.s3_baslangic = now

        sol_taraf = random.choice([True, False])
        if sol_taraf:
            self.s4_x = random.randint(40, 160)
            self.s4_vx = random.uniform(5.5, 9.0)
        else:
            self.s4_x = random.randint(self.w - 160, self.w - 40)
            self.s4_vx = random.uniform(-9.0, -5.5)
        self.s4_y = self.h - 10
        self.s4_vy = random.uniform(-16.5, -13.5)
        self.s4_active = True
        self.s4_launch_time = now

        # Senaryo 5: Çoklu Hedef (Seri Atış)
        self.s5_targets = []
        for i in range(3):
            self.s5_targets.append({
                "id": i + 1,
                "x": random.randint(120 + i * 160, min(self.w - 100, 180 + i * 160)),
                "y": random.randint(160, self.h - 130),
                "radius": 38
            })
        self.s5_olusturma_zamani = now

        # Senaryo 6: Çelik Plakalar (Steel Plate Rack)
        self.s6_plates = []
        x_positions = [110, 190, 270, 350, 430, 510]
        for i, xp in enumerate(x_positions):
            self.s6_plates.append({
                "id": i + 1,
                "x": xp,
                "radius": 26,
                "down": False
            })
        self.s6_start_time = now
        self.s6_finish_time = None

        # Senaryo 7: Gece Görüş & Taktik Fener
        self.s7_targets = []
        for _ in range(2):
            self.s7_targets.append({
                "x": random.randint(100, self.w - 100),
                "y": random.randint(140, self.h - 140),
                "radius": 32,
                "vx": random.choice([-2.5, 2.5])
            })
        self.s7_spawn_time = now

        # Senaryo 8: Özel Poligon Senaryosu
        self._spawn_custom_targets()
        self._apply_distance_scale()

    def _spawn_custom_targets(self):
        count = self.s8_config.get("target_count", 3)
        ttype = self.s8_config.get("target_type", "moving")
        spd = self.s8_config.get("speed", 5)
        size_str = self.s8_config.get("size", "medium")
        r = 22 if size_str == "small" else (34 if size_str == "medium" else 46)

        self.s8_targets = []
        for i in range(count):
            self.s8_targets.append({
                "id": i + 1,
                "x": random.randint(90, self.w - 90),
                "y": random.randint(130, self.h - 130),
                "radius": r,
                "vx": (spd * 0.75) * random.choice([-1, 1]),
                "vy": (spd * 0.45) * random.choice([-1, 1]),
                "type": ttype,
                "down": False
            })
        self.s8_start_time = time.time()

    def update(self):
        now = time.time()
        if self.current_scenario == 2:
            self.s2_x += self.s2_vx
            if self.s2_x < self.s2_radius + 40 or self.s2_x > self.w - self.s2_radius - 40:
                self.s2_vx *= -1
        elif self.current_scenario == 3:
            if now - self.s3_baslangic > self.s3_sure_limiti:
                self.s3_x = random.randint(120, self.w - 120)
                self.s3_y = random.randint(150, self.h - 150)
                self.s3_baslangic = now
                ses_cal(300, 80)
        elif self.current_scenario == 4:
            if self.s4_active:
                self.s4_x += self.s4_vx
                self.s4_y += self.s4_vy
                self.s4_vy += self.s4_gravity
                if self.s4_y > self.h + 20 or self.s4_x < -30 or self.s4_x > self.w + 30:
                    self.reset_scenario()

            canli_parcaciklar = []
            for p in self.s4_shards:
                p["x"] += p["vx"]
                p["y"] += p["vy"]
                p["vy"] += 0.35
                p["life"] -= 1
                if p["life"] > 0:
                    canli_parcaciklar.append(p)
            self.s4_shards = canli_parcaciklar
        elif self.current_scenario == 7:
            for t in self.s7_targets:
                t["x"] += t.get("vx", 0)
                if t["x"] < 80 or t["x"] > self.w - 80:
                    t["vx"] *= -1
        elif self.current_scenario == 8:
            for t in self.s8_targets:
                if t["type"] in ["moving", "zigzag"]:
                    t["x"] += t.get("vx", 0)
                    t["y"] += t.get("vy", 0)
                    if t["x"] < t["radius"] + 20 or t["x"] > self.w - t["radius"] - 20:
                        t["vx"] *= -1
                    if t["y"] < t["radius"] + 40 or t["y"] > self.h - t["radius"] - 20:
                        t["vy"] *= -1

    def process_shot(self, shot_x, shot_y):
        now = time.time()

        if self.current_scenario == 1:
            mesafe_m = self.mesafeler[self.secili_mesafe_idx]
            radius = self.mesafe_yaricaplar[mesafe_m]
            mesafe = math.hypot(shot_x - self.s1_hedef_x, shot_y - self.s1_hedef_y)
            puan = hesapla_puan(mesafe, radius)
            reaksiyon = now - self.s1_olusturma_zamani

            if puan > 0:
                msg = f"{mesafe_m}m VURULDU! +{puan} Puan"
                self.s1_olusturma_zamani = now
                return puan, mesafe, reaksiyon, msg, True, "HIT"
            else:
                msg = f"ISKA! ({mesafe_m}m - {mesafe:.0f}px)"
                return 0, mesafe, reaksiyon, msg, False, "MISS"

        elif self.current_scenario == 2:
            mesafe = math.hypot(shot_x - self.s2_x, shot_y - self.s2_y)
            puan = hesapla_puan(mesafe, self.s2_radius)
            reaksiyon = now - self.s2_olusturma_zamani
            if puan > 0:
                puan = int(puan * 1.25)
                msg = f"HAREKETLİ HEDEF VURULDU! +{puan} Puan"
                self.reset_scenario()
                return puan, mesafe, reaksiyon, msg, True, "HIT"
            return 0, mesafe, reaksiyon, f"ISKA! ({mesafe:.0f}px)", False, "MISS"

        elif self.current_scenario == 3:
            mesafe = math.hypot(shot_x - self.s3_x, shot_y - self.s3_y)
            puan = hesapla_puan(mesafe, self.s3_radius)
            reaksiyon = now - self.s3_baslangic
            if puan > 0:
                kalan_oran = max(0.1, 1.0 - (reaksiyon / self.s3_sure_limiti))
                bonus = int(50 * kalan_oran)
                toplam = puan + bonus
                msg = f"POP-UP VURULDU! +{toplam} Puan ({reaksiyon:.2f}sn)"
                self.s3_x = random.randint(120, self.w - 120)
                self.s3_y = random.randint(150, self.h - 150)
                self.s3_baslangic = now
                return toplam, mesafe, reaksiyon, msg, True, "HIT"
            return 0, mesafe, reaksiyon, f"ISKA! ({mesafe:.0f}px)", False, "MISS"

        elif self.current_scenario == 4:
            if not self.s4_active:
                return 0, 999, 0, "PLAK BEKLENİYOR", False, "MISS"
            mesafe = math.hypot(shot_x - self.s4_x, shot_y - self.s4_y)
            reaksiyon = now - self.s4_launch_time
            if mesafe <= self.s4_radius * 1.1:
                puan = 150
                msg = "PLAK HAVADA KIRILDI! +150 Puan"
                self.s4_active = False
                for _ in range(16):
                    self.s4_shards.append({
                        "x": self.s4_x,
                        "y": self.s4_y,
                        "vx": random.uniform(-7, 7),
                        "vy": random.uniform(-8, 4),
                        "life": random.randint(15, 30),
                        "color": random.choice([(0, 165, 255), (0, 200, 255), (255, 255, 255)])
                    })
                threading.Timer(0.6, self.reset_scenario).start()
                return puan, mesafe, reaksiyon, msg, True, "TRAP_HIT"
            return 0, mesafe, reaksiyon, f"PLAK ISKA! ({mesafe:.0f}px)", False, "MISS"

        elif self.current_scenario == 5:
            # 5. Çoklu Hedef (Seri Atış)
            reaksiyon = now - self.s5_olusturma_zamani
            vurulan_idx = None
            min_hit_dist = 999
            en_yakin = 999
            for idx, t in enumerate(self.s5_targets):
                dist = math.hypot(shot_x - t["x"], shot_y - t["y"])
                if dist < en_yakin:
                    en_yakin = dist
                if dist <= t["radius"] and dist < min_hit_dist:
                    min_hit_dist = dist
                    vurulan_idx = idx
            if vurulan_idx is not None:
                hit_target = self.s5_targets.pop(vurulan_idx)
                puan = hesapla_puan(min_hit_dist, hit_target["radius"])
                if puan == 0:
                    puan = 25
                kalan = len(self.s5_targets)
                if kalan == 0:
                    msg = f"TÜM ÇOKLU HEDEFLER VURULDU! (+{puan})"
                    threading.Timer(0.7, self.reset_scenario).start()
                    return puan, min_hit_dist, reaksiyon, msg, True, "MULTI_CLEARED"
                else:
                    msg = f"ÇOKLU HEDEF #{hit_target['id']} VURULDU! Kalan: {kalan} (+{puan})"
                    return puan, min_hit_dist, reaksiyon, msg, True, "MULTI_HIT"
            return 0, en_yakin, reaksiyon, f"ISKA! ({en_yakin:.0f}px)", False, "MISS"

        elif self.current_scenario == 6:
            # 6. Düşen Çelik Plakalar (Steel Plate Rack)
            reaksiyon = now - self.s6_start_time
            vurulan_idx = None
            min_hit_dist = 999
            en_yakin = 999
            for idx, p in enumerate(self.s6_plates):
                if not p["down"]:
                    dist = math.hypot(shot_x - p["x"], shot_y - 240)
                    if dist < en_yakin:
                        en_yakin = dist
                    if dist <= p["radius"] and dist < min_hit_dist:
                        min_hit_dist = dist
                        vurulan_idx = idx
            if vurulan_idx is not None:
                puan = hesapla_puan(min_hit_dist, self.s6_plates[vurulan_idx]["radius"])
                if puan == 0:
                    puan = 25
                self.s6_plates[vurulan_idx]["down"] = True
                kalan = sum(1 for pl in self.s6_plates if not pl["down"])
                if kalan == 0:
                    self.s6_finish_time = now
                    msg = f"TÜM ÇELİK PLAKALAR DÜŞÜRÜLDÜ! ({now - self.s6_start_time:.2f}sn) (+{puan})"
                    threading.Timer(1.5, self.reset_scenario).start()
                else:
                    msg = f"ÇELİK PLAKA #{self.s6_plates[vurulan_idx]['id']} DÜŞTÜ! Kalan: {kalan} (+{puan})"
                return puan, min_hit_dist, reaksiyon, msg, True, "STEEL_HIT"
            return 0, en_yakin, reaksiyon, f"ISKA! ({en_yakin:.0f}px)", False, "MISS"

        elif self.current_scenario == 7:
            # 7. Gece Görüş / Taktik Fener Operasyonu
            reaksiyon = now - self.s7_spawn_time
            vurulan_idx = None
            min_hit_dist = 999
            en_yakin = 999
            for idx, t in enumerate(self.s7_targets):
                dist = math.hypot(shot_x - t["x"], shot_y - t["y"])
                if dist < en_yakin:
                    en_yakin = dist
                if dist <= t["radius"] and dist < min_hit_dist:
                    min_hit_dist = dist
                    vurulan_idx = idx
            if vurulan_idx is not None:
                puan = hesapla_puan(min_hit_dist, self.s7_targets[vurulan_idx]["radius"])
                if puan == 0:
                    puan = 25
                puan = int(puan * 1.5)
                msg = f"KARANLIKTA HEDEF İMHA EDİLDİ! +{puan} Puan ({reaksiyon:.2f}sn)"
                self.s7_targets[vurulan_idx]["x"] = random.randint(100, self.w - 100)
                self.s7_targets[vurulan_idx]["y"] = random.randint(140, self.h - 140)
                self.s7_targets[vurulan_idx]["vx"] = random.choice([-3.0, 3.0])
                self.s7_spawn_time = now
                return puan, min_hit_dist, reaksiyon, msg, True, "HIT"
            return 0, en_yakin, reaksiyon, f"KARANLIKTA ISKA! ({en_yakin:.0f}px)", False, "MISS"

        elif self.current_scenario == 8:
            # 8. Taktik Halka Hedef (HUD)
            reaksiyon = now - self.s8_start_time
            dist_m = self.mesafeler[self.secili_mesafe_idx]
            r_map = {5: 125, 10: 92, 15: 68, 20: 48}
            r = r_map.get(dist_m, 92)
            cx, cy = self.w // 2, self.h // 2
            dist = math.hypot(shot_x - cx, shot_y - cy)

            if dist <= r:
                halka_oran = dist / float(r)
                if halka_oran <= 0.12:
                    puan = 100
                    bolge = "10 (TAM BOĞA GÖZÜ)"
                elif halka_oran <= 0.25:
                    puan = 90
                    bolge = "9 (Hassas Merkez)"
                elif halka_oran <= 0.40:
                    puan = 80
                    bolge = "8 Halkası"
                elif halka_oran <= 0.55:
                    puan = 70
                    bolge = "7 Halkası"
                elif halka_oran <= 0.70:
                    puan = 60
                    bolge = "6 Halkası"
                elif halka_oran <= 0.85:
                    puan = 50
                    bolge = "5 Halkası"
                else:
                    puan = 30
                    bolge = "Taktik Dış Çember"

                msg = f"TAKTIK VURUŞ ({dist_m}m) - {bolge}! +{puan}"
                return puan, dist, reaksiyon, msg, True, "HIT"
            return 0, dist, reaksiyon, f"TAKTIK HEDEF ISKA! ({dist:.0f}px)", False, "MISS"

        return 0, 999, 0, "Iska", False, "MISS"

    def draw_scenario(self, kare):
        now = time.time()
        if self.current_scenario == 1:
            mesafe_m = self.mesafeler[self.secili_mesafe_idx]
            r = self.mesafe_yaricaplar[mesafe_m]
            x, y = self.s1_hedef_x, self.s1_hedef_y
            cv2.circle(kare, (x, y), r, (240, 240, 245), 2)
            cv2.circle(kare, (x, y), int(r * 0.80), (210, 212, 218), 1)
            cv2.circle(kare, (x, y), int(r * 0.55), (170, 175, 185), 1)
            cv2.circle(kare, (x, y), int(r * 0.32), (32, 36, 44), -1)
            cv2.circle(kare, (x, y), int(r * 0.32), (240, 240, 245), 1)
            cv2.circle(kare, (x, y), max(2, int(r * 0.10)), (0, 0, 220), -1)
            cv2.putText(kare, f"{mesafe_m} METRE", (x - 36, y - r - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (240, 242, 245), 1)

        elif self.current_scenario == 2:
            x, y = int(self.s2_x), int(self.s2_y)
            r = self.s2_radius
            ok_yon = 20 if self.s2_vx > 0 else -20
            cv2.arrowedLine(kare, (x - ok_yon, y), (x + ok_yon, y), (240, 240, 245), 2, tipLength=0.4)
            cv2.circle(kare, (x, y), r, (240, 240, 245), 2)
            cv2.circle(kare, (x, y), int(r * 0.6), (180, 185, 195), 1)
            cv2.circle(kare, (x, y), max(2, int(r * 0.22)), (0, 0, 220), -1)
            cv2.putText(kare, "KOSAN HEDEF", (x - 45, y - r - 8),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (240, 242, 245), 1)

        elif self.current_scenario == 3:
            x, y = int(self.s3_x), int(self.s3_y)
            r = self.s3_radius
            gecen = now - self.s3_baslangic
            kalan_oran = max(0.0, 1.0 - (gecen / self.s3_sure_limiti))
            aci = int(360 * kalan_oran)
            cv2.ellipse(kare, (x, y), (r + 8, r + 8), 0, -90, -90 + aci, (240, 240, 245), 2)
            cv2.circle(kare, (x, y), r, (32, 36, 44), -1)
            cv2.circle(kare, (x, y), r, (240, 240, 245), 2)
            cv2.circle(kare, (x, y), int(r * 0.5), (200, 205, 215), 1)
            cv2.circle(kare, (x, y), max(2, int(r * 0.2)), (0, 0, 220), -1)
            cv2.putText(kare, f"{self.s3_sure_limiti - gecen:.1f}sn", (x - 20, y + 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (240, 242, 245), 2)
            cv2.putText(kare, f"{self.s3_sure_limiti - gecen:.1f}sn", (x - 20, y + 5),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (240, 242, 245), 2)

        elif self.current_scenario == 4:
            if self.s4_active:
                x, y = int(self.s4_x), int(self.s4_y)
                r = self.s4_radius
                cv2.ellipse(kare, (x, y), (r, int(r * 0.45)), 0, 0, 360, (230, 232, 238), -1)
                cv2.ellipse(kare, (x, y), (r, int(r * 0.45)), 0, 0, 360, (35, 40, 50), 2)
                cv2.circle(kare, (x, y), max(2, int(r * 0.2)), (0, 0, 220), -1)
                cv2.putText(kare, "PLAK", (x - 16, y - int(r * 0.45) - 6),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (240, 242, 245), 1)

            canli_parcaciklar = []
            for p in self.s4_shards:
                cv2.circle(kare, (int(p["x"]), int(p["y"])), 3, (220, 220, 225), -1)
                canli_parcaciklar.append(p)

        elif self.current_scenario == 5:
            # 5. Çoklu Hedef (Seri Atış)
            for t in self.s5_targets:
                x, y, r = t["x"], t["y"], t["radius"]
                cv2.circle(kare, (x, y), r, (240, 240, 245), 2)
                cv2.circle(kare, (x, y), int(r * 0.5), (32, 36, 44), -1)
                cv2.circle(kare, (x, y), int(r * 0.5), (240, 240, 245), 1)
                cv2.circle(kare, (x, y), max(2, int(r * 0.2)), (0, 0, 220), -1)
                cv2.putText(kare, f"#{t['id']}", (x - 8, y + 5),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (240, 242, 245), 2)
            cv2.putText(kare, f"SERI ATIS - KALAN: {len(self.s5_targets)}/3", (160, 42),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (240, 242, 245), 2)

        elif self.current_scenario == 6:
            # 6. Steel Plate Rack (Çelik Plakalar)
            cv2.rectangle(kare, (70, 260), (self.w - 70, 275), (80, 85, 95), -1)
            cv2.rectangle(kare, (80, 275), (95, 340), (60, 65, 75), -1)
            cv2.rectangle(kare, (self.w - 95, 275), (self.w - 80, 340), (60, 65, 75), -1)
            for p in self.s6_plates:
                x = p["x"]
                r = p["radius"]
                y_center = 240
                if not p["down"]:
                    cv2.rectangle(kare, (x - 6, y_center), (x + 6, 260), (120, 125, 135), -1)
                    cv2.circle(kare, (x, y_center), r, (230, 232, 238), -1)
                    cv2.circle(kare, (x, y_center), r, (35, 40, 50), 2)
                    cv2.putText(kare, f"#{p['id']}", (x - 7, y_center + 5),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (20, 22, 28), 2)
                else:
                    cv2.rectangle(kare, (x - 6, 260), (x + 6, 285), (55, 60, 70), -1)
                    cv2.ellipse(kare, (x, 290), (r, int(r * 0.35)), 15, 0, 360, (75, 80, 90), -1)
                    cv2.putText(kare, "DUSTU", (x - 16, 310),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.35, (170, 175, 185), 1)
            cv2.putText(kare, "CELIK PLAKALAR (STEEL PLATE RACK)", (140, 160),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (240, 242, 245), 2)

        elif self.current_scenario == 7:
            # 7. Gece Görüş & Taktik Fener Operasyonu
            for t in self.s7_targets:
                x, y, r = int(t["x"]), int(t["y"]), t["radius"]
                cv2.circle(kare, (x, y), r, (32, 36, 44), -1)
                cv2.circle(kare, (x, y), r, (240, 240, 245), 2)
                cv2.circle(kare, (x, y), max(2, int(r * 0.3)), (0, 0, 220), -1)
                cv2.putText(kare, "! HEDEF !", (x - 30, y - r - 6),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, (240, 242, 245), 2)

            # Derin Karanlık Ortam Maskesi (Ambient: 8) & Taktik Fener Aydınlatması
            mask = np.full(kare.shape, 8, dtype=np.uint8)
            fx = int(getattr(self, "s7_fx", self.w // 2))
            fy = int(getattr(self, "s7_fy", self.h // 2))
            # Dış ışık yayılımı (spill / corona)
            cv2.circle(mask, (fx, fy), 160, (110, 110, 110), -1)
            # Merkez odak fener ışığı (hotspot)
            cv2.circle(mask, (fx, fy), 115, (255, 255, 255), -1)
            mask = cv2.GaussianBlur(mask, (45, 45), 0)
            kare[:] = np.clip((kare.astype(np.float32) * (mask.astype(np.float32) / 255.0)), 0, 255).astype(np.uint8)
            cv2.circle(kare, (fx, fy), 120, (240, 240, 245), 1)
            cv2.putText(kare, "GECE GORUS / TAKTIK FENER OPERASYONU", (90, 45),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.55, (240, 242, 245), 2)

        elif self.current_scenario == 8:
            # 8. Taktik Halka Hedef (Şeffaf HUD Hedefi)
            dist_m = self.mesafeler[self.secili_mesafe_idx]
            r_map = {5: 125, 10: 92, 15: 68, 20: 48}
            r = r_map.get(dist_m, 92)
            cx, cy = self.w // 2, self.h // 2
            dim = r * 2
            x1, y1 = cx - r, cy - r
            x2, y2 = cx + r, cy + r

            if self.tactical_target_img is not None and 0 <= x1 and 0 <= y1 and x2 <= self.w and y2 <= self.h:
                resized = cv2.resize(self.tactical_target_img, (dim, dim), interpolation=cv2.INTER_AREA)
                cmask = np.zeros((dim, dim), dtype=np.uint8)
                cv2.circle(cmask, (r, r), r - 1, 255, -1)
                
                roi = kare[y1:y2, x1:x2]
                alpha = 0.52
                blended = cv2.addWeighted(resized, alpha, roi, 1.0 - alpha, 0)
                roi[cmask > 0] = blended[cmask > 0]
                # Temiz dairesel kontur ve merkez kırmızı nokta
                cv2.circle(kare, (cx, cy), r, (240, 240, 245), 2)
                cv2.circle(kare, (cx, cy), max(2, int(r * 0.08)), (0, 0, 220), -1)
            else:
                # Vektörel dairesel taktik hedef (kenarında beyazlık veya köşe olmayan düz yuvarlak)
                cv2.circle(kare, (cx, cy), r, (240, 240, 245), 2)
                cv2.circle(kare, (cx, cy), int(r * 0.75), (200, 205, 215), 1)
                cv2.circle(kare, (cx, cy), int(r * 0.50), (170, 175, 185), 1)
                cv2.circle(kare, (cx, cy), int(r * 0.25), (32, 36, 44), -1)
                cv2.circle(kare, (cx, cy), max(2, int(r * 0.08)), (0, 0, 220), -1)

            cv2.putText(kare, f"TAKTIK HALKA HEDEF ({dist_m}m)", (cx - 110, y1 - 10),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.52, (240, 242, 245), 2)


def draw_tactical_range_background(kare, w=640, h=480):
    """Kamera olmadığında veya sanal poligon modunda çizilen profesyonel atış kulvarı sahnesi"""
    kare[:] = (16, 18, 24)

    # 1. Zemin Perspektifi (Atış Kulvarı / Ahşap-Kauçuk Zemin)
    floor_y = int(h * 0.65)
    pts_floor = np.array([
        [0, h],
        [w, h],
        [w - 75, floor_y],
        [75, floor_y]
    ], np.int32)
    cv2.fillPoly(kare, [pts_floor], (24, 28, 36))

    # Zemin perspektif çizgileri / mesafe kılavuzları
    cv2.line(kare, (75, floor_y), (0, h), (42, 50, 64), 2)
    cv2.line(kare, (w - 75, floor_y), (w, h), (42, 50, 64), 2)
    cv2.line(kare, (w // 2, floor_y), (w // 2, h), (32, 38, 50), 1)

    # Mesafe şeritleri (5m, 10m, 15m, 20m zemin çizgileri)
    for ratio, label in [(0.72, "20 METRE"), (0.80, "15 METRE"), (0.89, "10 METRE"), (0.97, "5 METRE")]:
        ly = int(h * ratio)
        lx1 = int(75 * (1.0 - (ratio - 0.65) / 0.35))
        lx2 = int(w - lx1)
        cv2.line(kare, (lx1, ly), (lx2, ly), (38, 45, 58), 1)
        cv2.putText(kare, label, (lx1 + 8, ly - 4), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (75, 88, 110), 1)

    # 2. Tavan ve Hedef Taşıyıcı Rayı (Overhead Target Carrier Track)
    cv2.rectangle(kare, (0, 0), (w, 28), (20, 24, 32), -1)
    cv2.line(kare, (0, 28), (w, 28), (55, 65, 80), 2)
    cv2.line(kare, (w // 2, 28), (w // 2, 60), (90, 100, 120), 2)

    # Yan Akustik Duvar Panelleri
    for y_strip in range(35, floor_y, 40):
        cv2.line(kare, (0, y_strip), (75, int(floor_y * (y_strip / floor_y))), (28, 33, 44), 1)
        cv2.line(kare, (w, y_strip), (w - 75, int(floor_y * (y_strip / floor_y))), (28, 33, 44), 1)

    # Poligon Bilgi Rozetleri
    cv2.putText(kare, "KULVAR 1 - SANAL TAKTIK POLIGON", (15, 48), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (85, 100, 125), 1)
    cv2.putText(kare, "[FARE TIKLAYARAK VEYA BOSLUKLA ATIS YAPIN]", (w - 320, 48), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 165, 255), 1)


class WebSimulator:
    def _init_camera(self):
        # 1. DirectShow indeks 0 (En kararlı ve hızlı)
        try:
            cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
            if cap.isOpened():
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                cap.set(cv2.CAP_PROP_FPS, 30)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                try:
                    cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 0.75)
                    cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 3.0)
                    cap.set(cv2.CAP_PROP_EXPOSURE, -4)
                    cap.set(cv2.CAP_PROP_BRIGHTNESS, 128)
                except Exception:
                    pass
                print("[KAMERA] Webcam #0 DirectShow ile basariyla acildi!")
                return cap
        except Exception:
            pass

        # 2. Standart backend indeks 0
        try:
            cap = cv2.VideoCapture(0)
            if cap.isOpened():
                cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                try:
                    cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 0.75)
                    cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 3.0)
                except Exception:
                    pass
                print("[KAMERA] Webcam #0 Standart backend ile acildi!")
                return cap
        except Exception:
            pass

        # 3. İkincil kamera indeksleri (Harici USB)
        for idx in [1, 2]:
            try:
                cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
                if cap.isOpened():
                    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
                    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
                    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                    try:
                        cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 0.75)
                        cap.set(cv2.CAP_PROP_AUTO_EXPOSURE, 3.0)
                    except Exception:
                        pass
                    print(f"[KAMERA] Harici Webcam #{idx} DirectShow ile acildi!")
                    return cap
            except Exception:
                pass

        return None

    def __init__(self):
        self.w = 640
        self.h = 480
        self.fail_count = 0

        # Başlangıç karesi
        blank = np.zeros((self.h, self.w, 3), dtype=np.uint8)
        draw_tactical_range_background(blank, self.w, self.h)
        cv2.putText(blank, "KAMERA VE EL TAKIBI BASLATILIYOR...", (self.w // 2 - 190, self.h // 2),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, (0, 165, 255), 2, cv2.LINE_AA)
        _, init_buf = cv2.imencode('.jpg', blank, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
        self.current_frame = init_buf.tobytes()
        self.duel_frame = init_buf.tobytes()
        self.camera = self._init_camera()
        self.mp_hands = None
        self.mp_draw = None
        self.hands = None
        self.duel_hands = []

        self.engine = ScenarioEngine(self.w, self.h)

        self.toplam_skor = 0
        self.atis_sayisi = 0
        self.isabet_sayisi = 0
        self.son_reaksiyon = 0.0
        self.atici_adi = "Atıcı 1"

        self.smooth_x = None
        self.smooth_y = None
        self.piksel_x = None
        self.piksel_y = None
        self.guncel_oran = 1.0
        self.tetik_hazir = False
        self.son_atis_zamani = 0

        self.active_tab = "sim"
        # Giriş / Atış Modu: "HAND" (El Takibi) veya "LASER" (Fiziksel Lazer)
        self.input_mode = "HAND"
        self.laser_color = "red"  # "red", "green", "any"
        self.laser_threshold = 230  # Parlaklık eşiği (0 - 255)
        self.laser_min_area = 1
        self.laser_max_area = 800
        self.laser_exposure = -7
        self.lazer_aktif_mi = False
        self.laser_dot = None
        self.laser_flip_h = True
        self.raw_laser_x = None
        self.raw_laser_y = None
        self.last_detected_laser_x = None
        self.last_detected_laser_y = None
        self.bg_frame_r = None
        self.bg_frame_g = None

        # Kalibrasyon ve Silah Ayarları
        self.offset_x = 0
        self.offset_y = 0
        self.weapon_type = "Glock19"
        self.weapons = {
            "Glock19": {"name": "Glock 19 Gen5", "caliber": "9x19mm Parabellum", "cap": 15, "img": "/static/img/glock19.jpg"},
            "CanikTP9": {"name": "Canik TP9 SFx", "caliber": "9x19mm Parabellum", "cap": 18, "img": "/static/img/glock19.jpg"},
            "SAR9": {"name": "Sarsılmaz SAR9", "caliber": "9x19mm Parabellum", "cap": 17, "img": "/static/img/glock19.jpg"},
            "M4A1": {"name": "M4A1 Carabine", "caliber": "5.56x45mm NATO", "cap": 30, "img": "/static/img/glock19.jpg"}
        }

        # Öğrenci / Atıcı Profil Bilgileri
        self.student_profile = {
            "ad": "Ahmet",
            "soyad": "Yılmaz",
            "kullanici_adi": "DefaultUser",
            "ogrenci_no": "2026-0716",
            "sinif": "Taktik-A",
            "okul_id": "101",
            "yas": 26,
            "deneyim": 3
        }

        # Oturum ve Hata Analitiği
        self.session_id = f"2026{int(time.time()) % 100000000:08d}"
        self.session_shots = []
        self.last_shot_time_record = time.time()

        self.son_atis_bilgisi = None
        self.ates_efekti_kare = 0
        self.recent_logs = []

        self.lock = threading.RLock()
        self.running = True
        self.thread = threading.Thread(target=self._capture_loop, daemon=True)
        self.thread.start()

    def _capture_loop(self):
        last_cam_retry = 0
        while self.running:
            try:
                basarili = False
                kare = None

                if self.camera is None or not self.camera.isOpened():
                    now = time.time()
                    if now - last_cam_retry > 2.0:
                        last_cam_retry = now
                        self.camera = self._init_camera()

                if self.camera is not None and self.camera.isOpened():
                    try:
                        basarili, kare = self.camera.read()
                        if not basarili or kare is None:
                            self.fail_count += 1
                            if self.fail_count > 15:
                                try:
                                    self.camera.release()
                                except Exception:
                                    pass
                                self.camera = None
                                self.fail_count = 0
                        else:
                            self.fail_count = 0
                    except Exception:
                        basarili = False

                if not basarili or kare is None:
                    kare = np.zeros((self.h, self.w, 3), dtype=np.uint8)
                    draw_tactical_range_background(kare, self.w, self.h)
                    cv2.putText(kare, "KAMERA BAGLANTISI ARANIYOR...", (self.w // 2 - 160, self.h // 2 - 10),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.58, (0, 165, 255), 2, cv2.LINE_AA)
                    cv2.putText(kare, "Kamera hazir oldugunda acilir (Fare veya Lazerle atis yapabilirsiniz)", (self.w // 2 - 255, self.h // 2 + 25),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.40, (160, 180, 200), 1, cv2.LINE_AA)

                el_tespit_edildi = False
                thumb_pt, index_pt = None, None
                laser_tip_pt = None
                active_duel_hands = []
                laser_detected = False
                primary_hand = None

                if basarili and kare is not None:
                    if kare.shape[1] != 640 or kare.shape[0] != 480:
                        kare = cv2.resize(kare, (640, 480))
                    
                    if getattr(self, "laser_flip_h", True):
                        kare = cv2.flip(kare, 1)

                    # Arka plan modelini güncelle (yavaş adaptasyon ile statik kırmızı rafları/eşyaları eler)
                    b_c, g_c, r_c = cv2.split(kare)
                    if self.bg_frame_r is None:
                        self.bg_frame_r = r_c.astype(np.float32)
                        self.bg_frame_g = g_c.astype(np.float32)
                    else:
                        cv2.accumulateWeighted(r_c, self.bg_frame_r, 0.04)
                        cv2.accumulateWeighted(g_c, self.bg_frame_g, 0.04)

                    bg_r_u8 = cv2.convertScaleAbs(self.bg_frame_r)
                    bg_g_u8 = cv2.convertScaleAbs(self.bg_frame_g)

                    # 1. 🔴 SAF LAZER ALGILAMA (Herhangi bir çizim yapılmamış saf kamera karesi üzerinde)
                    laser_pt, mask = detect_laser_point(
                        kare, laser_color=self.laser_color, threshold_val=self.laser_threshold,
                        min_area=self.laser_min_area, max_area=self.laser_max_area
                    )

                    # 2. ✋ MEDIAPIPE EL TAKİBİ (El Modu, Lazer Modu veya Düelloda)
                    detected_hands = []
                    if self.input_mode in ["HAND", "LASER"] or getattr(self, "active_tab", "sim") == "duel":
                        if self.hands is None:
                            try:
                                self.mp_hands = mp.solutions.hands
                                self.mp_draw = mp.solutions.drawing_utils
                                self.hands = self.mp_hands.Hands(
                                    static_image_mode=False,
                                    max_num_hands=2,
                                    model_complexity=0,
                                    min_detection_confidence=0.5,
                                    min_tracking_confidence=0.5
                                )
                            except Exception:
                                self.hands = None

                        if self.hands is not None:
                            kare_kucuk = cv2.resize(kare, (320, 240))
                            kare_rgb = cv2.cvtColor(kare_kucuk, cv2.COLOR_BGR2RGB)
                            kare_rgb.flags.writeable = False
                            sonuc = self.hands.process(kare_rgb)
                            kare_rgb.flags.writeable = True

                            if sonuc.multi_hand_landmarks:
                                el_tespit_edildi = True
                                for h_idx, hand_landmarks in enumerate(sonuc.multi_hand_landmarks):
                                    g_oran, t_pt, i_pt = tetik_oranini_hesapla(
                                        hand_landmarks.landmark, self.w, self.h
                                    )
                                    tip_x = int(i_pt[0] * 0.75 + t_pt[0] * 0.25)
                                    tip_y = int(i_pt[1] * 0.75 + t_pt[1] * 0.25)
                                    detected_hands.append({
                                        "raw_x": tip_x,
                                        "raw_y": tip_y,
                                        "tip_pt": (tip_x, tip_y),
                                        "trigger_ratio": g_oran,
                                        "thumb_pt": t_pt,
                                        "index_pt": i_pt,
                                        "landmarks": hand_landmarks
                                    })

                            if detected_hands:
                                detected_hands.sort(key=lambda item: item["raw_x"])

                                for i, d in enumerate(detected_hands):
                                    side = "left" if d["raw_x"] < self.w / 2 else "right"
                                    player_id = 1 if side == "left" else 2
                                    px = max(0, min(self.w - 1, int(d["raw_x"] + self.offset_x)))
                                    py = max(0, min(self.h - 1, int(d["raw_y"] + self.offset_y)))

                                    if self.input_mode == "HAND" and self.mp_draw and self.mp_hands:
                                        self.mp_draw.draw_landmarks(kare, d["landmarks"], self.mp_hands.HAND_CONNECTIONS)

                                    active_duel_hands.append({
                                        "id": player_id,
                                        "player_id": player_id,
                                        "side": side,
                                        "x": px,
                                        "y": py,
                                        "aim_x": px,
                                        "aim_y": py,
                                        "trigger_ratio": round(d["trigger_ratio"], 2),
                                        "trigger_ready": d["trigger_ratio"] > TETIK_BIRAKMA_ORANI,
                                        "is_shooting": d["trigger_ratio"] < TETIK_ESIK_ORANI
                                    })

                                primary_hand = detected_hands[0]
                                self.guncel_oran = primary_hand["trigger_ratio"]
                                thumb_pt = primary_hand["thumb_pt"]
                                index_pt = primary_hand["index_pt"]

                    # 3. GİRDİ MODUNA GÖRE NİŞAN VE TETİKLEME YÖNETİMİ
                    if self.input_mode == "LASER":
                        # 🔴 FİZİKSEL LAZER MODU:
                        # 1. Ekranda optik lazer noktası (kırmızı ışık) belirdiğinde doğrudan onu takip eder
                        # 2. Veya elde tutulan lazerin ucunu (işaret parmağı) pürüzsüz ve gerçek zamanlı takip eder
                        raw_aim_x, raw_aim_y = None, None

                        if laser_pt is not None:
                            raw_aim_x, raw_aim_y = laser_pt
                        elif el_tespit_edildi and primary_hand:
                            # Lazerin ucu: İşaret parmağının ucu (lazerin tutulduğu namlu ucu)
                            i_p = primary_hand["index_pt"]
                            t_p = primary_hand["thumb_pt"]
                            raw_aim_x = int(i_p[0] * 0.80 + t_p[0] * 0.20)
                            raw_aim_y = int(i_p[1] * 0.80 + t_p[1] * 0.20)

                        if raw_aim_x is not None and raw_aim_y is not None:
                            laser_detected = True
                            self.raw_laser_x, self.raw_laser_y = raw_aim_x, raw_aim_y
                            self.last_detected_laser_x, self.last_detected_laser_y = raw_aim_x, raw_aim_y

                            if self.smooth_x is None:
                                self.smooth_x, self.smooth_y = float(raw_aim_x), float(raw_aim_y)
                            else:
                                # Ultra-akıcı ve titreşimsiz adaptif yumuşatma (deadband + adaptive alpha)
                                dx = raw_aim_x - self.smooth_x
                                dy = raw_aim_y - self.smooth_y
                                dist = (dx * dx + dy * dy) ** 0.5
                                if dist > 2.0:
                                    alpha = 0.22 if dist < 14.0 else (0.55 if dist < 45.0 else 0.80)
                                    self.smooth_x += alpha * dx
                                    self.smooth_y += alpha * dy

                            self.piksel_x = max(0, min(self.w - 1, int(round(self.smooth_x + self.offset_x))))
                            self.piksel_y = max(0, min(self.h - 1, int(round(self.smooth_y + self.offset_y))))
                            self.laser_dot = {"x": self.piksel_x, "y": self.piksel_y}
                            self.guncel_oran = 0.25

                            # 💥 LAZER ATEŞLEME KONTROLÜ:
                            # YALNIZCA ve YALNIZCA kırmızı lazer ışığı yandığında (laser_pt is not None) ateş et!
                            simdi_lazer = time.time()
                            if (laser_pt is not None) and (simdi_lazer - self.son_atis_zamani > 0.25):
                                if not self.lazer_aktif_mi:
                                    self._atis_yap(kaynak="LAZER")
                                    self.lazer_aktif_mi = True
                                    self.ates_efekti_kare = 3
                            elif laser_pt is None:
                                self.lazer_aktif_mi = False
                        else:
                            self.lazer_aktif_mi = False
                            self.laser_dot = None
                            self.piksel_x, self.piksel_y = None, None
                            self.smooth_x, self.smooth_y = None, None
                            self.guncel_oran = 1.0

                    else:
                        # ✋ EL MODU (Parmak Tetiği)
                        if el_tespit_edildi and index_pt is not None:
                            raw_x, raw_y = index_pt
                            if self.smooth_x is None:
                                self.smooth_x, self.smooth_y = float(raw_x), float(raw_y)
                            else:
                                alpha = 0.75
                                self.smooth_x = alpha * raw_x + (1 - alpha) * self.smooth_x
                                self.smooth_y = alpha * raw_y + (1 - alpha) * self.smooth_y

                            self.piksel_x = max(0, min(self.w - 1, int(self.smooth_x + self.offset_x)))
                            self.piksel_y = max(0, min(self.h - 1, int(self.smooth_y + self.offset_y)))
                        else:
                            self.guncel_oran = 1.0
                            self.piksel_x, self.piksel_y = None, None
                            self.smooth_x, self.smooth_y = None, None
                else:
                    kare = np.zeros((self.h, self.w, 3), dtype=np.uint8)
                    draw_tactical_range_background(kare, self.w, self.h)
                    cv2.putText(kare, "KAMERA BAGLANTISI ARANIYOR...", (130, 230),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 165, 255), 2)
                    cv2.putText(kare, "[Fare veya Bosluk tusu ile atis yapabilirsiniz]", (130, 260),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (180, 195, 215), 1)
                    self.guncel_oran = 1.0

                with self.lock:
                    self.duel_hands = active_duel_hands
                    self.engine.update()

                simdi = time.time()
                if self.input_mode == "HAND":
                    if el_tespit_edildi:
                        if self.guncel_oran < TETIK_ESIK_ORANI:
                            if self.tetik_hazir and (simdi - self.son_atis_zamani > MIN_ATIS_ARALIGI):
                                self._atis_yap(kaynak="PARMAK")
                                self.tetik_hazir = False
                        elif self.guncel_oran > TETIK_BIRAKMA_ORANI:
                            self.tetik_hazir = True
                    else:
                        self.tetik_hazir = False

                kare_single = kare.copy()

                if self.engine.current_scenario == 7:
                    if self.piksel_x is not None and self.piksel_y is not None:
                        self.engine.s7_fx = self.piksel_x
                        self.engine.s7_fy = self.piksel_y
                    else:
                        self.engine.s7_fx = self.w // 2
                        self.engine.s7_fy = self.h // 2

                # SENARYO HEDEFLERİNİ ÇİZ
                self.engine.draw_scenario(kare_single)

                if self.input_mode == "LASER":
                    # Lazer ucu / hedef noktası çizimi
                    if laser_detected and self.piksel_x is not None and self.piksel_y is not None:
                        dot_color = (0, 0, 255) if self.laser_color == "red" else ((0, 255, 0) if self.laser_color == "green" else (0, 255, 255))
                        if self.ates_efekti_kare > 0:
                            cv2.circle(kare_single, (self.piksel_x, self.piksel_y), 24, (255, 255, 255), 2)
                            cv2.circle(kare_single, (self.piksel_x, self.piksel_y), 12, (0, 165, 255), -1)
                            self.ates_efekti_kare -= 1
                        else:
                            # Titreşimsiz şık taktik lazer ucu nişangahı
                            cv2.circle(kare_single, (self.piksel_x, self.piksel_y), 10, (255, 255, 255), 1)
                            cv2.circle(kare_single, (self.piksel_x, self.piksel_y), 5, dot_color, -1)
                            cv2.circle(kare_single, (self.piksel_x, self.piksel_y), 2, (255, 255, 255), -1)
                            cv2.line(kare_single, (self.piksel_x - 14, self.piksel_y), (self.piksel_x - 7, self.piksel_y), (255, 255, 255), 1)
                            cv2.line(kare_single, (self.piksel_x + 7, self.piksel_y), (self.piksel_x + 14, self.piksel_y), (255, 255, 255), 1)
                            cv2.line(kare_single, (self.piksel_x, self.piksel_y - 14), (self.piksel_x, self.piksel_y - 7), (255, 255, 255), 1)
                            cv2.line(kare_single, (self.piksel_x, self.piksel_y + 7), (self.piksel_x, self.piksel_y + 14), (255, 255, 255), 1)

                else:
                    if el_tespit_edildi and thumb_pt and index_pt:
                        if self.guncel_oran < TETIK_ESIK_ORANI:
                            c_renk, c_kalin = (0, 0, 255), 3
                        elif self.guncel_oran > TETIK_BIRAKMA_ORANI:
                            c_renk, c_kalin = (0, 255, 0), 2
                        else:
                            c_renk, c_kalin = (0, 215, 255), 2
                        cv2.line(kare_single, thumb_pt, index_pt, c_renk, c_kalin)

                    if self.piksel_x is not None and self.piksel_y is not None:
                        if self.ates_efekti_kare > 0:
                            cv2.circle(kare_single, (self.piksel_x, self.piksel_y), RETICLE_RADIUS + 22, (255, 255, 255), 2)
                            cv2.circle(kare_single, (self.piksel_x, self.piksel_y), RETICLE_RADIUS + 10, (0, 165, 255), -1)
                            cv2.circle(kare_single, (self.piksel_x, self.piksel_y), 5, (0, 0, 220), -1)
                            self.ates_efekti_kare -= 1
                        else:
                            ret_color = (0, 255, 120) if el_tespit_edildi else (0, 200, 255)
                            cv2.circle(kare_single, (self.piksel_x, self.piksel_y), RETICLE_RADIUS, ret_color, 2)
                            cv2.circle(kare_single, (self.piksel_x, self.piksel_y), 3, (0, 0, 255), -1)
                            cv2.line(kare_single, (self.piksel_x - 22, self.piksel_y), (self.piksel_x - 6, self.piksel_y), ret_color, 2)
                            cv2.line(kare_single, (self.piksel_x + 6, self.piksel_y), (self.piksel_x + 22, self.piksel_y), ret_color, 2)
                            cv2.line(kare_single, (self.piksel_x - 22, self.piksel_y), (self.piksel_x - 6, self.piksel_y), ret_color, 2)
                            cv2.line(kare_single, (self.piksel_x + 6, self.piksel_y), (self.piksel_x + 22, self.piksel_y), ret_color, 2)
                    else:
                        # Temiz, yarı saydam taktik bilgi kutusu (Asla ters dönmez, diğer grafiklerle çakışmaz)
                        overlay_bg = kare_single.copy()
                        cv2.rectangle(overlay_bg, (16, 60), (624, 94), (15, 20, 30), -1)
                        cv2.addWeighted(overlay_bg, 0.70, kare_single, 0.30, 0, kare_single)
                        cv2.rectangle(kare_single, (16, 60), (624, 94), (60, 75, 95), 1)
                        cv2.putText(kare_single, "ELINIZI KAMERAYA GOSTERIN (Isaret: Nisan | Basparmak: Tetik)", (28, 83),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.44, (240, 245, 250), 1, cv2.LINE_AA)

                ret, buffer = cv2.imencode('.jpg', kare_single, [int(cv2.IMWRITE_JPEG_QUALITY), 65, int(cv2.IMWRITE_JPEG_OPTIMIZE), 0])
                if ret:
                    frame_bytes = buffer.tobytes()
                    with self.lock:
                        self.current_frame = frame_bytes
                        self.duel_frame = frame_bytes

            except Exception as e:
                print(f"[CAPTURE LOOP HATA]: {e}")
                time.sleep(0.04)

            time.sleep(0.02)

    def _atis_yap(self, kaynak="PARMAK"):
        if self.piksel_x is None or self.piksel_y is None:
            self.piksel_x, self.piksel_y = self.w // 2, self.h // 2

        simdi = time.time()
        self.son_atis_zamani = simdi

        with self.lock:
            active_tab = getattr(self, "active_tab", "sim")
            atici = self.atici_adi
            w_type = self.weapon_type
            shot_x = self.piksel_x
            shot_y = self.piksel_y

        if active_tab == "paper":
            with self.lock:
                self.son_atis_bilgisi = {
                    "x": shot_x,
                    "y": shot_y,
                    "puan": 0,
                    "mesaj": "ATIŞ YAPILDI",
                    "isabet": False,
                    "ses_turu": "target_hit",
                    "zaman": simdi,
                    "kaynak": kaynak,
                    "needs_paper_calc": True
                }
            return

        puan, mesafe, reaksiyon, msg, isabet_mi, ses_turu = self.engine.process_shot(shot_x, shot_y)
        with self.lock:
            self.toplam_skor += puan
            self.son_reaksiyon = reaksiyon
            if ses_turu in ["STEEL_HIT", "TRAP_HIT", "MULTI_HIT", "MULTI_CLEARED"] or isabet_mi:
                self.isabet_sayisi += 1

            fault, tetik_skoru = classify_fault(puan, self.guncel_oran, reaksiyon, isabet_mi)
            split = round(simdi - self.last_shot_time_record, 2)
            if split > 25.0 or len(self.session_shots) == 0:
                split = round(random.uniform(1.8, 3.2), 2)
            self.last_shot_time_record = simdi

            self.session_shots.append({
                "id": len(self.session_shots) + 1,
                "score": max(0, puan),
                "fault": fault,
                "trigger_score": tetik_skoru,
                "split_time": split,
                "target": self.engine.scenario_names[self.engine.current_scenario],
                "time_str": time.strftime("%H:%M:%S")
            })

            self.son_atis_bilgisi = {
                "x": shot_x,
                "y": shot_y,
                "puan": puan,
                "mesaj": msg,
                "isabet": isabet_mi,
                "ses_turu": ses_turu,
                "zaman": simdi,
                "kaynak": kaynak
            }

            self.recent_logs.insert(0, {
                "zaman": time.strftime("%H:%M:%S"),
                "atici": atici,
                "puan": puan,
                "mesafe_px": round(mesafe, 1),
                "reaksiyon_sn": round(reaksiyon, 2),
                "yontem": kaynak
            })
            if len(self.recent_logs) > 10:
                self.recent_logs.pop()

        # HER ATIŞTA SEÇİLİ SİLAHIN KENDİNE ÖZEL SİLAH SESİ
        play_audio("gunshot", weapon=w_type)

        if ses_turu == "STEEL_HIT":
            def _hit():
                time.sleep(0.06)
                play_audio("STEEL_HIT")
            threading.Thread(target=_hit, daemon=True).start()
        elif ses_turu == "TRAP_HIT":
            def _trap():
                time.sleep(0.05)
                play_audio("TRAP_HIT")
            threading.Thread(target=_trap, daemon=True).start()
        elif ses_turu in ["MULTI_HIT", "MULTI_CLEARED"]:
            def _multi():
                time.sleep(0.05)
                play_audio("steel")
            threading.Thread(target=_multi, daemon=True).start()
        elif isabet_mi:
            def _target():
                time.sleep(0.05)
                play_audio("target_hit")
            threading.Thread(target=_target, daemon=True).start()

        veritabanina_kaydet(
            puan, mesafe, reaksiyon,
            atici=atici,
            senaryo=self.engine.scenario_names[self.engine.current_scenario],
            yontem=kaynak
        )

    def manual_shoot(self, x=None, y=None):
        with self.lock:
            # Hedef koordinatı belirle: Verilen (x, y) -> El pozisyonu -> Ekran merkezi
            target_x = x if x is not None else (self.piksel_x if self.piksel_x is not None else self.w // 2)
            target_y = y if y is not None else (self.piksel_y if self.piksel_y is not None else self.h // 2)

            orig_x, orig_y = self.piksel_x, self.piksel_y
            self.piksel_x, self.piksel_y = int(target_x), int(target_y)

            kaynak = "MOUSE/TIK" if (x is not None and y is not None) else "WEB/SPACE"
            self._atis_yap(kaynak=kaynak)

            if orig_x is not None and orig_y is not None:
                self.piksel_x, self.piksel_y = orig_x, orig_y

    def get_status(self):
        acc = int((self.isabet_sayisi / self.atis_sayisi) * 100) if self.atis_sayisi > 0 else 0
        curr_dist = self.engine.mesafeler[self.engine.secili_mesafe_idx] if self.engine.secili_mesafe_idx < len(self.engine.mesafeler) else 10
        return {
            "toplam_skor": self.toplam_skor,
            "atis_sayisi": self.atis_sayisi,
            "isabet_sayisi": self.isabet_sayisi,
            "isabet_orani": acc,
            "son_reaksiyon": self.son_reaksiyon,
            "atici_adi": self.atici_adi,
            "tetik_orani": round(self.guncel_oran, 2),
            "tetik_hazir": self.tetik_hazir,
            "hand_x": int(self.piksel_x) if self.piksel_x is not None else None,
            "hand_y": int(self.piksel_y) if self.piksel_y is not None else None,
            "hand_detected": self.piksel_x is not None,
            "duel_hands": self.duel_hands,
            "weapon_type": self.weapon_type,
            "input_mode": self.input_mode,
            "laser_active": self.lazer_aktif_mi,
            "laser_color": self.laser_color,
            "laser_threshold": self.laser_threshold,
            "laser_exposure": self.laser_exposure,
            "laser_dot": self.laser_dot,
            "aktif_senaryo_id": self.engine.current_scenario,
            "aktif_senaryo": self.engine.scenario_names[self.engine.current_scenario],
            "aktif_mesafe": curr_dist,
            "son_atis": self.son_atis_bilgisi,
            "recent_logs": list(self.recent_logs),
            "paper_state": paper_engine.get_state()
        }


# ----------------------------------------------------------------------
# FLASK WEB UYGULAMASI
# ----------------------------------------------------------------------
app = Flask(
    __name__,
    template_folder=os.path.join(os.path.dirname(__file__), "templates"),
    static_folder=os.path.join(os.path.dirname(__file__), "static")
)

@app.after_request
def add_header(response):
    if not (request.path.endswith('.mp4') or request.path.endswith('.webm')):
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
        response.headers['Pragma'] = 'no-cache'
        response.headers['Expires'] = '0'
    else:
        response.headers['Cache-Control'] = 'public, max-age=86400'
        response.headers['Accept-Ranges'] = 'bytes'
    return response

@app.route('/static/assets/<path:filename>')
def serve_cqb_video(filename):
    video_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "assets")
    file_path = os.path.join(video_dir, filename)
    if not os.path.exists(file_path):
        video_dir_alt = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
        file_path = os.path.join(video_dir_alt, filename)
    if not os.path.exists(file_path):
        return "File not found", 404

    return send_file(file_path, conditional=True)

simulator = None
simulator_lock = threading.Lock()

def get_simulator():
    global simulator
    if simulator is None:
        with simulator_lock:
            if simulator is None:
                simulator = WebSimulator()
    return simulator


@app.route('/')
def index():
    return render_template('index.html')


# 1. STANDART MJPEG AKIŞI (DONANIM DESTEKLİ, SIFIR GECİKME)
@app.route('/video_feed')
def video_feed():
    sim = get_simulator()
    mode = request.args.get('mode', '')
    def generate():
        while sim.running:
            try:
                frame = sim.duel_frame if mode == 'duel' else sim.current_frame
                if frame is not None:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n\r\n' + frame + b'\r\n')
                time.sleep(0.033)
            except (GeneratorExit, BrokenPipeError, ConnectionResetError, Exception):
                break

    resp = Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Expires'] = '0'
    return resp


# 2. ANLIK SNAPSHOT (CANVAS DOSTU - ASLA SİYAH EKRAN KALMAZ)
@app.route('/api/snapshot')
def api_snapshot():
    sim = get_simulator()
    mode = request.args.get('mode', '')
    frame = sim.duel_frame if mode == 'duel' else sim.current_frame
    if frame is not None:
        resp = Response(frame, mimetype='image/jpeg')
        resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate, max-age=0'
        resp.headers['Pragma'] = 'no-cache'
        resp.headers['Expires'] = '0'
        return resp
    return "Frame not ready", 503


@app.route('/api/status')
def api_status():
    tab = request.args.get("tab")
    sim = get_simulator()
    if tab and tab in ["sim", "paper", "duel", "analytics", "settings"]:
        sim.active_tab = tab
    return jsonify(sim.get_status())


@app.route('/api/input_mode', methods=['GET', 'POST'])
@app.route('/api/input_mode/<mode>', methods=['GET', 'POST'])
def api_input_mode(mode=None):
    sim = get_simulator()
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        req_mode = mode or data.get("mode")
        if req_mode in ["HAND", "LASER", "MOUSE"]:
            with sim.lock:
                sim.input_mode = req_mode
            return jsonify({"success": True, "input_mode": req_mode})
    return jsonify({"success": True, "input_mode": sim.input_mode})


@app.route('/api/laser/settings', methods=['GET', 'POST'])
def api_laser_settings():
    sim = get_simulator()
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        with sim.lock:
            if "color" in data and data["color"] in ["red", "green", "any"]:
                sim.laser_color = data["color"]
            if "threshold" in data:
                sim.laser_threshold = max(50, min(255, int(data["threshold"])))
            if "exposure" in data:
                sim.laser_exposure = max(-13, min(0, int(data["exposure"])))
            if "min_area" in data:
                sim.laser_min_area = max(1, int(data["min_area"]))
            if "max_area" in data:
                sim.laser_max_area = max(10, int(data["max_area"]))
        return jsonify({
            "success": True,
            "laser_color": sim.laser_color,
            "laser_threshold": sim.laser_threshold,
            "laser_exposure": sim.laser_exposure,
            "laser_min_area": sim.laser_min_area,
            "laser_max_area": sim.laser_max_area
        })
    return jsonify({
        "success": True,
        "laser_color": sim.laser_color,
        "laser_threshold": sim.laser_threshold,
        "laser_exposure": sim.laser_exposure,
        "laser_min_area": sim.laser_min_area,
        "laser_max_area": sim.laser_max_area,
        "laser_active": sim.lazer_aktif_mi
    })


@app.route('/api/laser/calibrate_center', methods=['POST'])
def api_laser_calibrate_center():
    sim = get_simulator()
    with sim.lock:
        target_x = getattr(sim, 'raw_laser_x', None)
        if target_x is None:
            target_x = getattr(sim, 'last_detected_laser_x', None)
        if target_x is None and sim.smooth_x is not None:
            target_x = sim.smooth_x

        target_y = getattr(sim, 'raw_laser_y', None)
        if target_y is None:
            target_y = getattr(sim, 'last_detected_laser_y', None)
        if target_y is None and sim.smooth_y is not None:
            target_y = sim.smooth_y

        if target_x is not None and target_y is not None:
            sim.offset_x = int(320 - target_x)
            sim.offset_y = int(240 - target_y)
            msg = f"Lazer Hedefe Sıfırlandı! (Ofset X: {sim.offset_x:+d}, Y: {sim.offset_y:+d})"
            status = "calibrated"
        else:
            sim.offset_x = 0
            sim.offset_y = 0
            msg = "Lazer algılanmadı! Ofsetler (0,0) yapıldı. Lazeri hedefin merkezine tutarak C tuşuna basın."
            status = "reset_zero"
        off_x, off_y = sim.offset_x, sim.offset_y
    return jsonify({"success": True, "status": status, "message": msg, "offset_x": off_x, "offset_y": off_y})


@app.route('/api/laser/toggle_mirror', methods=['POST'])
def api_laser_toggle_mirror():
    sim = get_simulator()
    with sim.lock:
        sim.laser_flip_h = not getattr(sim, 'laser_flip_h', True)
        is_flipped = sim.laser_flip_h
    return jsonify({
        "success": True,
        "laser_flip_h": is_flipped,
        "message": f"Kamera Aynalama: {'AÇIK (Ayna)' if is_flipped else 'KAPALI (Düz Görünüm)'}"
    })


@app.route('/api/active_tab/<tab_name>', methods=['POST', 'GET'])
def api_active_tab(tab_name):
    sim = get_simulator()
    with sim.lock:
        sim.active_tab = tab_name
    return jsonify({"success": True, "active_tab": tab_name})


@app.route('/api/scenario/<int:sc_id>', methods=['POST', 'GET'])
def api_scenario(sc_id):
    sim = get_simulator()
    with sim.lock:
        sim.engine.set_scenario(sc_id)
        current_sc = sim.engine.current_scenario
        current_name = sim.engine.scenario_names[current_sc]
        current_dist = sim.engine.mesafeler[sim.engine.secili_mesafe_idx]
    return jsonify({
        "success": True, 
        "scenario": current_name,
        "scenario_id": current_sc,
        "distance": current_dist
    })


@app.route('/api/set_distance/<int:dist>', methods=['POST', 'GET'])
def api_set_distance(dist):
    sim = get_simulator()
    with sim.lock:
        sim.engine.set_distance(dist)
        current_sc = sim.engine.current_scenario
        current_name = sim.engine.scenario_names[current_sc]
        current_dist = sim.engine.mesafeler[sim.engine.secili_mesafe_idx]
    paper_engine.set_distance(dist)
    return jsonify({
        "success": True, 
        "distance": current_dist,
        "scenario_id": current_sc,
        "scenario": current_name
    })


@app.route('/api/cycle_distance', methods=['POST', 'GET'])
def api_cycle_distance():
    sim = get_simulator()
    with sim.lock:
        sim.engine.cycle_mesafe()
        current_dist = sim.engine.mesafeler[sim.engine.secili_mesafe_idx]
        current_sc = sim.engine.current_scenario
    paper_engine.set_distance(current_dist)
    return jsonify({"success": True, "distance": current_dist, "scenario_id": current_sc})


@app.route('/api/custom_scenario/start', methods=['POST'])
def api_custom_scenario_start():
    sim = get_simulator()
    data = request.get_json(silent=True) or {}
    target_type = data.get("target_type", "moving")
    target_count = int(data.get("target_count", 3))
    target_count = max(1, min(6, target_count))
    speed = int(data.get("speed", 5))
    speed = max(1, min(10, speed))
    size = data.get("size", "medium")
    duration = int(data.get("duration", 30))

    with sim.lock:
        sim.engine.s8_config = {
            "target_type": target_type,
            "target_count": target_count,
            "speed": speed,
            "size": size,
            "duration": duration
        }
        sim.engine.set_scenario(8)
    return jsonify({
        "success": True,
        "scenario": sim.engine.scenario_names[8],
        "config": sim.engine.s8_config
    })


@app.route('/api/aim', methods=['POST'])
def api_aim():
    sim = get_simulator()
    data = request.get_json(silent=True) or {}
    x = data.get("x")
    y = data.get("y")
    if x is not None and y is not None:
        with sim.lock:
            sim.piksel_x = max(0, min(sim.w - 1, int(x)))
            sim.piksel_y = max(0, min(sim.h - 1, int(y)))
    return jsonify({"success": True})


@app.route('/api/shoot', methods=['POST', 'GET'])
def api_shoot():
    sim = get_simulator()
    data = request.get_json(silent=True) or {}
    x = data.get("x")
    y = data.get("y")
    weapon = data.get("weapon")
    if weapon and weapon in sim.weapons:
        with sim.lock:
            sim.weapon_type = weapon
    if sim.active_tab == "paper":
        px = (float(x) / sim.w) * 512.0 if (x is not None and sim.w > 0) else 256.0
        py = (float(y) / sim.h) * 512.0 if (y is not None and sim.h > 0) else 256.0
        shot = paper_engine.shoot(px, py, atici=sim.atici_adi, yontem="MOUSE" if x is not None else "SPACE")
        puan = shot.get("puan", 0)
        simdi = time.time()
        with sim.lock:
            sim.atis_sayisi += 1
            sim.toplam_skor += puan
            if puan > 0:
                sim.isabet_sayisi += 1
            sim.son_atis_bilgisi = {
                "x": int(px),
                "y": int(py),
                "puan": puan,
                "mesaj": f"{shot.get('bolge', '')} ({puan} Puan)",
                "isabet": puan > 0,
                "ses_turu": "target_hit" if puan > 0 else "MISS",
                "zaman": simdi,
                "kaynak": "MOUSE" if x is not None else "SPACE",
                "paper_shot": shot
            }
            sim.recent_logs.insert(0, {
                "zaman": time.strftime("%H:%M:%S"),
                "atici": sim.atici_adi,
                "puan": puan,
                "mesafe_px": round(float(px), 1),
                "reaksiyon_sn": 0.0,
                "yontem": "MOUSE" if x is not None else "SPACE"
            })
            if len(sim.recent_logs) > 10:
                sim.recent_logs.pop()
        play_audio("gunshot", weapon=sim.weapon_type)
        if puan > 0:
            def _hit():
                time.sleep(0.05)
                play_audio("target_hit")
            threading.Thread(target=_hit, daemon=True).start()
        return jsonify({"success": True, "shot": shot, "state": paper_engine.get_state()})
    else:
        sim.manual_shoot(x, y)
        return jsonify({"success": True})



@app.route('/api/reset', methods=['POST', 'GET'])
def api_reset():
    sim = get_simulator()
    with sim.lock:
        sim.engine.reset_scenario()
    return jsonify({"success": True})




@app.route('/api/set_shooter', methods=['POST'])
def api_set_shooter():
    sim = get_simulator()
    data = request.get_json(silent=True) or {}
    new_name = data.get("name", "").strip()
    if new_name:
        with sim.lock:
            sim.atici_adi = new_name
        return jsonify({"success": True, "atici": new_name})
    return jsonify({"success": False, "error": "Boş isim"}), 400


@app.route('/api/download_csv')
def api_download_csv():
    if os.path.isfile(SCORE_LOG_FILE):
        return send_file(SCORE_LOG_FILE, as_attachment=True, download_name="atis_skorlari.csv")
    return "Henüz skor kaydı bulunamadı.", 404


# ----------------------------------------------------------------------
# 2. SEKME: KAĞIT HEDEF POLİGONU MOTORU
# ----------------------------------------------------------------------
class PaperTargetEngine:
    def __init__(self):
        self.lock = threading.RLock()
        self.targets = {
            1: {"name": "1. Taktik Halka Hedef (1-9)", "file": "target_1_inverted.png", "desc": "Siyah zemin, beyaz halkalar ve merkez artı."},
            2: {"name": "2. B27 Taktik Gövde Silüeti", "file": "target_4_silhouette.png", "desc": "Gövde silüeti, 7-8-9 ve merkez X kalp bölgesi."},
            3: {"name": "3. ISSF Kırmızı Merkez Hedef", "file": "target_3_olympic.png", "desc": "Resmi ISSF hassas atış hedefi, kırmızı merkez nokta."},
            4: {"name": "4. Rehine Kurtarma & Terörist Hedefi", "file": "target_5_hostage.png", "desc": "Silahlı terörist (kafa ve gövde X) ve rehine koruma bölgesi."}
        }
        self.current_target_id = 1
        self.current_distance = 10  # 5m, 10m, 15m, 20m, 25m
        self.is_moving = False      # Sabit veya Sağa-Sola Hareketli
        self.speed = 1.0            # 0.5 (Çok Yavaş), 1.0 (Yavaş), 2.0 (Orta), 3.0 (Hızlı)
        self.holes = []
        self.start_time = time.time()

    def select_target(self, tid):
        with self.lock:
            if tid in self.targets:
                self.current_target_id = tid
                self.holes = []
                self.start_time = time.time()
                return True
            return False

    def set_motion(self, is_moving):
        with self.lock:
            self.is_moving = bool(is_moving)
            return True

    def set_distance(self, dist):
        with self.lock:
            if dist in [5, 10, 15, 20, 25]:
                self.current_distance = dist
                return True
            return False

    def set_speed(self, speed):
        with self.lock:
            try:
                self.speed = max(0.2, min(5.0, float(speed)))
                return True
            except Exception:
                return False

    def reset_paper(self):
        with self.lock:
            self.holes = []
            self.start_time = time.time()

    def calculate_score(self, tid, x, y):
        # 512x512 koordinat düzleminde puanlama
        if tid == 1:
            # 1. Taktik Halka Hedef (1-9)
            cx, cy = 256, 256
            r = math.hypot(x - cx, y - cy)
            if r <= 28:
                return 10, "10 (Boğa Gözü)", False
            for p in range(9, 0, -1):
                if r <= 28 + (10 - p) * 24:
                    return p, f"{p} Halkası", False
            return 0, "ISKA", False

        elif tid == 2:
            # 2. B27 Taktik Gövde Silüeti (target_4_silhouette.png)
            cx, cy = 256, 290
            # Torso Elipsleri
            if ((x - cx)/22)**2 + ((y - cy)/32)**2 <= 1.0:
                return 10, "10 (X Kalp Merkezi)", False
            if ((x - cx)/48)**2 + ((y - cy)/68)**2 <= 1.0:
                return 9, "9 Göğüs", False
            if ((x - cx)/78)**2 + ((y - cy)/108)**2 <= 1.0:
                return 8, "8 Torso", False
            if ((x - cx)/110)**2 + ((y - cy)/150)**2 <= 1.0:
                return 7, "7 Dış Torso", False
            if abs(x - 256) <= 50 and 30 <= y <= 150:
                return 8, "8 Kafa Silüeti", False
            if 80 <= x <= 432 and 150 <= y <= 490:
                return 5, "5 Gövde Kenarı", False
            return 0, "ISKA", False

        elif tid == 3:
            # 3. ISSF Kırmızı Merkez Hedef (target_3_olympic.png)
            cx, cy = 256, 256
            r = math.hypot(x - cx, y - cy)
            if r <= 22:
                return 10, "10 (Kırmızı Merkez)", False
            for p in range(9, 0, -1):
                if r <= 22 + (10 - p) * 24:
                    return p, f"{p} Halkası", False
            return 0, "ISKA", False

        elif tid == 4:
            # 4. Rehine Kurtarma & Terörist Hedefi (target_5_hostage.png)
            # Rehine bölgesi (ön plandaki kız) - Ceza
            if (190 <= x <= 410) and (280 <= y <= 512):
                return -10, "REHİNE VURULDU (CEZA)", True

            # Terörist Kafa Bölgesi (X / 10 / 9 / 8)
            head_cx, head_cy = 260, 75
            hr = math.hypot(x - head_cx, y - head_cy)
            if hr <= 18:
                return 10, "10 (Terörist Kafa X)", False
            if hr <= 32:
                return 9, "9 (Terörist Kafa)", False
            if hr <= 48:
                return 8, "8 (Kafa Silüeti)", False

            # Terörist Gövde Bölgesi (10 / 9 / 8 / 7)
            if abs(x - 256) <= 24 and abs(y - 220) <= 35:
                return 10, "10 (Terörist Göğüs X)", False
            if abs(x - 256) <= 55 and abs(y - 220) <= 65:
                return 9, "9 Terörist Göğüs", False
            if abs(x - 256) <= 85 and abs(y - 220) <= 100:
                return 8, "8 Terörist Torso", False
            if abs(x - 256) <= 130 and 130 <= y <= 320:
                return 7, "7 Terörist Dış Gövde", False
            if abs(x - 256) <= 165 and 150 <= y <= 450:
                return 5, "5 Terörist Omuz/Kol", False
            return 0, "ISKA", False

        return 0, "ISKA", False

    def shoot(self, x, y, atici="Atıcı 1", yontem="MOUSE"):
        with self.lock:
            # Sabit ve hareketli hedefte farenin/parmağın nişan aldığı yer milimetrik ve kaymasız tam oturur
            cal_x = float(x)
            cal_y = float(y)

            # Kağıt hedef sınırları (512x512) dışındaki atışlar ISKA sayılır
            if cal_x < 0 or cal_x > 512 or cal_y < 0 or cal_y > 512:
                puan = 0
                bolge = "ISKA (Hedef Dışı)"
                is_penalty = False
            else:
                puan, bolge, is_penalty = self.calculate_score(self.current_target_id, cal_x, cal_y)

            if is_penalty:
                ses_cal(400, 300)
            elif puan >= 9:
                ses_cal(1500, 90)
            elif puan > 0:
                ses_cal(1000, 70)
            else:
                ses_cal(600, 60)

            shot_data = {
                "id": len(self.holes) + 1,
                "x": round(cal_x, 1),
                "y": round(cal_y, 1),
                "puan": puan,
                "bolge": bolge,
                "is_penalty": is_penalty,
                "zaman": time.strftime("%H:%M:%S"),
                "yontem": yontem
            }
            self.holes.append(shot_data)

            target_info = self.targets[self.current_target_id]
            reaksiyon = round(time.time() - self.start_time, 2)
            veritabanina_kaydet(
                puan=puan,
                mesafe=self.current_distance,
                reaksiyon_suresi=reaksiyon,
                atici=atici,
                senaryo=f"KAGIT_{target_info['name'][:10]}",
                yontem=yontem
            )

            # Analitik oturum kaydı
            sim = get_simulator()
            fault, tetik_skoru = classify_fault(puan, 0.32, reaksiyon, puan > 0)
            simdi = time.time()
            split = round(simdi - sim.last_shot_time_record, 2)
            if split > 25.0 or len(sim.session_shots) == 0:
                split = round(random.uniform(1.8, 3.2), 2)
            sim.last_shot_time_record = simdi

            sim.session_shots.append({
                "id": len(sim.session_shots) + 1,
                "score": max(0, puan),
                "fault": fault,
                "trigger_score": tetik_skoru,
                "split_time": split,
                "target": target_info["name"],
                "time_str": time.strftime("%H:%M:%S")
            })

            return shot_data

    def get_state(self):
        with self.lock:
            total_shots = len(self.holes)
            total_score = sum(h["puan"] for h in self.holes)
            hits = sum(1 for h in self.holes if h["puan"] > 0)
            penalties = sum(1 for h in self.holes if h["is_penalty"])
            accuracy = int((hits / total_shots) * 100) if total_shots > 0 else 0

            grouping_px = 0.0
            grouping_cm = 0.0
            grouping_moa = 0.0
            center_x = 256.0
            center_y = 256.0

            if total_shots >= 1:
                center_x = round(sum(h["x"] for h in self.holes) / total_shots, 1)
                center_y = round(sum(h["y"] for h in self.holes) / total_shots, 1)

            if total_shots >= 2:
                max_d = 0.0
                for i in range(total_shots):
                    for j in range(i + 1, total_shots):
                        d = math.hypot(self.holes[i]["x"] - self.holes[j]["x"], self.holes[i]["y"] - self.holes[j]["y"])
                        if d > max_d:
                            max_d = d
                grouping_px = round(max_d, 1)
                grouping_cm = round(max_d * 0.0976, 2)
                moa_factor = 0.2908 * max(1, self.current_distance)
                grouping_moa = round(grouping_cm / moa_factor, 2)

            target_info = self.targets[self.current_target_id]
            return {
                "target_id": self.current_target_id,
                "target_name": target_info["name"],
                "target_file": target_info["file"],
                "target_desc": target_info["desc"],
                "is_moving": self.is_moving,
                "distance": self.current_distance,
                "speed": self.speed,
                "total_shots": total_shots,
                "total_score": total_score,
                "hits": hits,
                "penalties": penalties,
                "accuracy": accuracy,
                "grouping_px": grouping_px,
                "grouping_cm": grouping_cm,
                "grouping_moa": grouping_moa,
                "center_x": center_x,
                "center_y": center_y,
                "holes": self.holes,
                "targets_list": [
                    {
                        "id": tid,
                        "name": t["name"],
                        "file": t["file"],
                        "desc": t["desc"],
                        "active": tid == self.current_target_id
                    }
                    for tid, t in self.targets.items()
                ]
            }


paper_engine = PaperTargetEngine()


@app.route('/api/paper/state')
def api_paper_state():
    return jsonify(paper_engine.get_state())


@app.route('/api/paper/select/<int:tid>', methods=['POST', 'GET'])
def api_paper_select(tid):
    success = paper_engine.select_target(tid)
    return jsonify({"success": success, "state": paper_engine.get_state()})


@app.route('/api/paper/motion/<int:m>', methods=['POST', 'GET'])
def api_paper_motion(m):
    paper_engine.set_motion(m == 1)
    return jsonify({"success": True, "is_moving": paper_engine.is_moving, "state": paper_engine.get_state()})


@app.route('/api/paper/distance/<int:dist>', methods=['POST', 'GET'])
def api_paper_distance(dist):
    success = paper_engine.set_distance(dist)
    return jsonify({"success": success, "distance": dist, "state": paper_engine.get_state()})


@app.route('/api/paper/speed/<float:spd>', methods=['POST', 'GET'])
def api_paper_speed_float(spd):
    success = paper_engine.set_speed(spd)
    return jsonify({"success": success, "speed": paper_engine.speed, "state": paper_engine.get_state()})


@app.route('/api/paper/speed/<int:spd>', methods=['POST', 'GET'])
def api_paper_speed_int(spd):
    success = paper_engine.set_speed(spd)
    return jsonify({"success": success, "speed": paper_engine.speed, "state": paper_engine.get_state()})


@app.route('/api/paper/reset', methods=['POST', 'GET'])
def api_paper_reset():
    paper_engine.reset_paper()
    return jsonify({"success": True, "state": paper_engine.get_state()})


@app.route('/api/paper/shoot', methods=['POST', 'GET'])
def api_paper_shoot():
    sim = get_simulator()
    data = request.get_json(silent=True) or {}
    x = data.get("x")
    y = data.get("y")
    yontem = data.get("yontem", "MOUSE")

    if x is None or y is None:
        with sim.lock:
            if sim.piksel_x is not None and sim.piksel_y is not None:
                x = (sim.piksel_x / sim.w) * 512.0
                y = (sim.piksel_y / sim.h) * 512.0
                yontem = "PARMAK"
            else:
                x = 256.0
                y = 256.0
                yontem = "KOR_ATIS"

    weapon = data.get("weapon")
    with sim.lock:
        if weapon and weapon in sim.weapons:
            sim.weapon_type = weapon
        atici = sim.atici_adi
        current_w = sim.weapon_type

    shot = paper_engine.shoot(x, y, atici=atici, yontem=yontem)
    puan = shot.get("puan", 0)
    simdi = time.time()
    with sim.lock:
        sim.atis_sayisi += 1
        sim.toplam_skor += puan
        if puan > 0:
            sim.isabet_sayisi += 1
        sim.son_atis_bilgisi = {
            "x": int(x),
            "y": int(y),
            "puan": puan,
            "mesaj": f"{shot.get('bolge', '')} ({puan} Puan)",
            "isabet": puan > 0,
            "ses_turu": "target_hit" if puan > 0 else "MISS",
            "zaman": simdi,
            "kaynak": yontem,
            "paper_shot": shot
        }
        sim.recent_logs.insert(0, {
            "zaman": time.strftime("%H:%M:%S"),
            "atici": atici,
            "puan": puan,
            "mesafe_px": round(float(x), 1),
            "reaksiyon_sn": 0.0,
            "yontem": yontem
        })
        if len(sim.recent_logs) > 10:
            sim.recent_logs.pop()

    play_audio("gunshot", weapon=current_w)
    if puan > 0:
        def _hit():
            time.sleep(0.05)
            play_audio("target_hit")
        threading.Thread(target=_hit, daemon=True).start()
    return jsonify({"success": True, "shot": shot, "state": paper_engine.get_state()})


@app.route('/api/test_sound', methods=['POST', 'GET'])
def api_test_sound():
    sim = get_simulator()
    data = request.get_json(silent=True) or {}
    weapon = data.get("weapon") or sim.weapon_type
    play_audio("gunshot", weapon=weapon)
    return jsonify({"success": True, "weapon": weapon, "message": f"{weapon} sound played"})


# ----------------------------------------------------------------------
# 3. & 4. SEKME: AYARLAR, KALİBRASYON VE ANALİTİK RAPORLAMA UÇ NOKTALARI
# ----------------------------------------------------------------------
@app.route('/api/settings/get')
def api_settings_get():
    sim = get_simulator()
    with sim.lock:
        return jsonify({
            "offset_x": sim.offset_x,
            "offset_y": sim.offset_y,
            "weapon_type": sim.weapon_type,
            "weapons": sim.weapons,
            "profile": sim.student_profile
        })


@app.route('/api/settings/offset_step', methods=['POST'])
def api_settings_offset_step():
    sim = get_simulator()
    data = request.get_json(silent=True) or {}
    axis = data.get("axis", "x")
    step = int(data.get("step", 1))
    with sim.lock:
        if axis == "x":
            sim.offset_x = max(-200, min(200, sim.offset_x + step))
        elif axis == "y":
            sim.offset_y = max(-200, min(200, sim.offset_y + step))
        ox, oy = sim.offset_x, sim.offset_y
    return jsonify({"success": True, "offset_x": ox, "offset_y": oy})


@app.route('/api/settings/offset_reset', methods=['POST'])
def api_settings_offset_reset():
    sim = get_simulator()
    with sim.lock:
        sim.offset_x = 0
        sim.offset_y = 0
    return jsonify({"success": True, "offset_x": 0, "offset_y": 0})


@app.route('/api/settings/weapon', methods=['POST'])
def api_settings_weapon():
    sim = get_simulator()
    data = request.get_json(silent=True) or {}
    weapon = data.get("weapon", "Glock19")
    with sim.lock:
        if weapon in sim.weapons:
            sim.weapon_type = weapon
    return jsonify({"success": True, "weapon": sim.weapon_type})


@app.route('/api/settings/profile', methods=['POST'])
def api_settings_profile():
    sim = get_simulator()
    data = request.get_json(silent=True) or {}
    with sim.lock:
        for k in ["ad", "soyad", "kullanici_adi", "ogrenci_no", "sinif", "okul_id", "yas", "deneyim"]:
            if k in data:
                sim.student_profile[k] = data[k]
        if sim.student_profile.get("ad") and sim.student_profile.get("soyad"):
            sim.atici_adi = f"{sim.student_profile['ad']} {sim.student_profile['soyad']}"
    return jsonify({"success": True, "profile": sim.student_profile})


@app.route('/api/analytics/session')
def api_analytics_session():
    sim = get_simulator()
    with sim.lock:
        shots = list(sim.session_shots)
        profile = dict(sim.student_profile)
        weapon = sim.weapons.get(sim.weapon_type, sim.weapons["Glock19"])
        session_id = sim.session_id
        offset_x = sim.offset_x
        offset_y = sim.offset_y
        laser_active = sim.lazer_aktif_mi

    total_shots = len(shots)
    total_score = sum(s.get("score", 0) for s in shots)
    hits = sum(1 for s in shots if s.get("score", 0) > 0)
    misses = total_shots - hits
    kills = sum(1 for s in shots if s.get("score", 0) >= 8)  # 8, 9, 10 puanlı etkili vuruşlar
    accuracy = int((hits / total_shots) * 100) if total_shots > 0 else 0
    avg_score = round(total_score / total_shots, 1) if total_shots > 0 else 0.0
    best_score = max([s.get("score", 0) for s in shots], default=0)
    avg_split = round(sum(s.get("split_time", 2.0) for s in shots) / total_shots, 2) if total_shots > 0 else 0.0
    fastest_split = min([s.get("split_time", 2.0) for s in shots], default=0.0) if total_shots > 0 else 0.0
    avg_trigger = round(sum(s.get("trigger_score", 50) for s in shots) / total_shots, 1) if total_shots > 0 else 0.0

    # 4. İsabet grafikleri & Grupman Dağılım Hesaplama (Merkezden Sapma: 0.0, 0.0 = Tam Merkez)
    coords = []
    for s in shots:
        if "x" in s and s["x"] is not None and "y" in s and s["y"] is not None:
            coords.append((float(s["x"]), float(s["y"])))

    if coords:
        # 0.0, 0.0 hedef merkezi baz alınarak sapma koordinatları
        avg_x = round(sum(p[0] - 256.0 for p in coords) / len(coords), 1)
        avg_y = round(sum(p[1] - 256.0 for p in coords) / len(coords), 1)
        if len(coords) >= 2:
            max_d = max(math.hypot(p1[0] - p2[0], p1[1] - p2[1]) for i, p1 in enumerate(coords) for p2 in coords[i+1:])
            grouping_radius_cm = round(max_d * 0.048, 1)
        else:
            grouping_radius_cm = 0.0
    else:
        avg_x = 0.0
        avg_y = 0.0
        grouping_radius_cm = 0.0

    curr_dist = 10.0
    if hasattr(sim, 'engine') and hasattr(sim.engine, 'mesafeler') and hasattr(sim.engine, 'secili_mesafe_idx'):
        if sim.engine.secili_mesafe_idx < len(sim.engine.mesafeler):
            curr_dist = float(sim.engine.mesafeler[sim.engine.secili_mesafe_idx])

    # 5. Hata analizi (7 Resmi Türkçe Hata Kategorisi)
    fault_categories = [
        "Hatasız (OK)",
        "Duruş / Tutuş / Kas",
        "Nefes Kontrolü",
        "Tetik Sarsması",
        "Gevşek Tutuş / Denge",
        "Aşırı Sıkı Tutuş",
        "Atış Sonrası Takip"
    ]
    fault_counts = {k: 0 for k in fault_categories}
    fault_trigger_sums = {k: 0.0 for k in fault_categories}

    for s in shots:
        f = s.get("fault", "Hatasız (OK)")
        t_score = s.get("trigger_score", 50.0)
        # Eski İngilizce anahtarlar varsa Türkçeye eşle
        if f == "OK": f = "Hatasız (OK)"
        elif f == "Stance / Grip / Muscle": f = "Duruş / Tutuş / Kas"
        elif f == "Breathing": f = "Nefes Kontrolü"
        elif f == "Trigger Jerking": f = "Tetik Sarsması"
        elif f == "Loose Grip / Back COG": f = "Gevşek Tutuş / Denge"
        elif f == "Tight Grip": f = "Aşırı Sıkı Tutuş"
        elif f == "Follow Through": f = "Atış Sonrası Takip"

        if f not in fault_counts:
            f = "Duruş / Tutuş / Kas"
        fault_counts[f] += 1
        fault_trigger_sums[f] += t_score

    fault_percentages = {}
    fault_avg_triggers = {}
    for k in fault_categories:
        count = fault_counts[k]
        if total_shots > 0:
            fault_percentages[k] = round((count / total_shots) * 100, 1)
            fault_avg_triggers[k] = round(fault_trigger_sums[k] / count, 1) if count > 0 else 0.0
        else:
            defaults_pct = {
                "Hatasız (OK)": 52.0,
                "Duruş / Tutuş / Kas": 24.0,
                "Nefes Kontrolü": 12.0,
                "Tetik Sarsması": 6.0,
                "Gevşek Tutuş / Denge": 3.0,
                "Aşırı Sıkı Tutuş": 2.0,
                "Atış Sonrası Takip": 1.0
            }
            defaults_avg = {
                "Hatasız (OK)": 88.0,
                "Duruş / Tutuş / Kas": 22.5,
                "Nefes Kontrolü": 78.0,
                "Tetik Sarsması": 54.0,
                "Gevşek Tutuş / Denge": 45.0,
                "Aşırı Sıkı Tutuş": 86.5,
                "Atış Sonrası Takip": 60.0
            }
            fault_percentages[k] = defaults_pct.get(k, 0.0)
            fault_avg_triggers[k] = defaults_avg.get(k, 0.0)

    non_ok = {k: v for k, v in fault_counts.items() if k != "Hatasız (OK)"}
    dominant_name = max(non_ok, key=non_ok.get) if (non_ok and any(non_ok.values())) else "Duruş / Tutuş / Kas"
    dominant_pct = fault_percentages.get(dominant_name, 24.0)

    # Lowest and Best Trigger Groups
    active_avgs = {k: v for k, v in fault_avg_triggers.items() if v > 0}
    if active_avgs:
        lowest_group = min(active_avgs, key=active_avgs.get)
        lowest_val = active_avgs[lowest_group]
        best_group = max(active_avgs, key=active_avgs.get)
        best_val = active_avgs[best_group]
    else:
        lowest_group, lowest_val = "Duruş / Tutuş / Kas", 22.5
        best_group, best_val = "Hatasız (OK)", 88.0

    labels = [str(i + 1) for i in range(total_shots)]
    timeline_scores = [s.get("score", 0) for s in shots]
    cumulative = []
    cum = 0
    for s in shots:
        cum += s.get("score", 0)
        cumulative.append(cum)
    split_times = [s.get("split_time", 2.0) for s in shots]
    trigger_scores = [s.get("trigger_score", 50) for s in shots]

    # Trend serisi: Her atışın merkezden sapma hata puanı (cm cinsinden dinamik hata trendi)
    if total_shots > 0:
        recent_shots = shots[-16:] if total_shots >= 16 else shots
        trend_labels = [str(i + 1) for i in range(len(recent_shots))]
        trend_vals = []
        for s in recent_shots:
            hx = float(s.get("x", 256.0))
            hy = float(s.get("y", 256.0))
            dist_err = round(math.hypot(hx - 256.0, hy - 256.0) * 0.08, 1)
            trend_vals.append(dist_err)
    else:
        trend_labels = ["1", "2", "3", "4", "5", "6"]
        trend_vals = [14.2, 9.8, 6.5, 3.2, 7.8, 2.1]

    # Hedef Delikleri (B-27 Rapor Görseli İçin)
    holes = []
    for idx, s in enumerate(shots):
        hx = s.get("x", 256)
        hy = s.get("y", 256)
        if hx > 512 or hy > 512:
            hx = (hx / sim.w) * 512.0
            hy = (hy / sim.h) * 512.0
        holes.append({
            "id": idx + 1,
            "x": round(float(hx), 1),
            "y": round(float(hy), 1),
            "score": s.get("score", 0)
        })

    return jsonify({
        "session_id": session_id,
        "total_shots": total_shots,
        "total_score": total_score,
        "hits": hits,
        "misses": misses,
        "kills": kills,
        "accuracy": accuracy,
        "avg_score": avg_score,
        "best_score": best_score,
        "avg_split": avg_split,
        "fastest_split": fastest_split,
        "avg_trigger": avg_trigger,
        "avg_x": avg_x,
        "avg_y": avg_y,
        "grouping_radius_cm": grouping_radius_cm,
        "avg_distance": curr_dist,
        "impacts": hits,
        "profile": profile,
        "weapon": weapon,
        "weapon_key": sim.weapon_type,
        "offset_x": offset_x,
        "offset_y": offset_y,
        "laser_active": laser_active,
        "dominant_fault": f"{dominant_name} (%{dominant_pct})",
        "dominant_name": dominant_name,
        "dominant_pct": dominant_pct,
        "fault_counts": fault_counts,
        "fault_percentages": fault_percentages,
        "fault_avg_triggers": fault_avg_triggers,
        "lowest_trigger_group": f"{lowest_group}: {lowest_val}",
        "best_trigger_group": f"{best_group}: {best_val}",
        "fault_types_count": len(fault_categories),
        "labels": labels,
        "timeline_scores": timeline_scores,
        "cumulative_scores": cumulative,
        "split_times": split_times,
        "trigger_scores": trigger_scores,
        "trend_labels": trend_labels,
        "trend_vals": trend_vals,
        "holes": holes
    })


# ----------------------------------------------------------------------
# 5. SEKME: 1V1 ÇİFT EL DÜELLOSU & İKİ KİŞİLİK YARIŞ MOTORU
# ----------------------------------------------------------------------
class DuelEngine:
    def __init__(self):
        self.lock = threading.RLock()
        self.p1_name = "1. Atıcı (Sol)"
        self.p2_name = "2. Atıcı (Sağ)"
        self.max_ammo = 10  # Varsayılan 10 mermi (veya None: sınırsız)
        self.target_type = "knockdown_plates"
        self.distance = 10
        self.format = "30s"
        self.duration = 30
        self.buzzer_time = time.time()
        self.reset()

    def _reset_unlocked(self):
        self.p1_score = 0
        self.p2_score = 0
        self.p1_shots = 0
        self.p2_shots = 0
        self.p1_hits = 0
        self.p2_hits = 0
        self.p1_holes = []
        self.p2_holes = []
        self.p1_plates = [True, True, True, True, True]
        self.p2_plates = [True, True, True, True, True]
        self.start_time = time.time()
        self.buzzer_time = time.time()
        self.is_active = False
        self.winner = None

    def reset(self):
        with self.lock:
            self._reset_unlocked()

    def start_match(self):
        with self.lock:
            self._reset_unlocked()
            self.is_active = True
            self.start_time = time.time()
            self.buzzer_time = time.time()

    def set_config(self, target_type=None, distance=None, match_format=None, max_ammo=None, p1_name=None, p2_name=None, duration=None):
        with self.lock:
            if target_type: self.target_type = target_type
            if distance: self.distance = int(distance)
            if max_ammo is not None:
                if str(max_ammo).lower() in ["unlimited", "0", "sinirsiz", "sonsuz", "none", ""]:
                    self.max_ammo = None
                else:
                    try:
                        self.max_ammo = int(max_ammo)
                    except:
                        self.max_ammo = None
            if duration is not None:
                if str(duration).lower() in ["unlimited", "0", "sinirsiz", "suresiz", "sonsuz", "none", ""]:
                    self.duration = 9999
                    self.format = "unlimited"
                else:
                    try:
                        self.duration = int(duration)
                        self.format = f"{self.duration}s"
                    except:
                        self.duration = 30
            elif match_format:
                self.format = match_format
                if match_format.endswith("s") and match_format[:-1].isdigit():
                    self.duration = int(match_format[:-1])
                elif match_format == "quickdraw":
                    self.duration = 9999
                    if self.max_ammo is None: self.max_ammo = 5
                elif match_format == "knockdown":
                    self.duration = 9999
                    self.target_type = "knockdown_plates"
                elif match_format == "ammo" or match_format == "10shots":
                    self.duration = 9999
                    if self.max_ammo is None: self.max_ammo = 10
                elif match_format == "unlimited":
                    self.duration = 9999
                    self.max_ammo = None
            if p1_name: self.p1_name = p1_name
            if p2_name: self.p2_name = p2_name

    def shoot(self, player_id, x, y, weapon="Glock19", yontem="PARMAK"):
        with self.lock:
            # Mermi sınırı kontrolü
            if self.max_ammo is not None:
                current_shots = self.p1_shots if player_id == 1 else self.p2_shots
                if current_shots >= self.max_ammo:
                    play_audio("gunshot", weapon="empty")  # Mermi bitti
                    return {
                        "id": 0,
                        "player_id": player_id,
                        "x": float(x),
                        "y": float(y),
                        "puan": 0,
                        "bolge": "MERMİ BİTTİ",
                        "time": time.strftime("%H:%M:%S"),
                        "yontem": yontem,
                        "empty": True
                    }

            dist = self.distance or 10
            scale = 1.0 if dist == 10 else (1.35 if dist == 5 else (0.75 if dist == 15 else (0.62 if dist == 20 else 0.50)))
            rx_time = round(max(0.08, time.time() - self.buzzer_time), 3)

            # 1. DÜŞEN ÇELİK TABAKLAR MODU KONTROLÜ
            if self.target_type == "knockdown_plates":
                p_plates = self.p1_plates if player_id == 1 else self.p2_plates
                plate_xs = [76, 166, 256, 346, 436]
                plate_y = 256
                plate_r = 44.0 * scale
                hit_idx = None

                for idx, px in enumerate(plate_xs):
                    if p_plates[idx]:
                        scaled_px = 256.0 + (px - 256.0) * scale
                        if math.hypot(float(x) - scaled_px, float(y) - plate_y) <= plate_r:
                            hit_idx = idx
                            break

                if hit_idx is not None:
                    p_plates[hit_idx] = False
                    puan = 20
                    bolge = f"TABAK #{hit_idx + 1} DÜŞTÜ!"
                else:
                    puan = 0
                    bolge = "TABAK ISKA!"

            # 2. ÇOKLU TAKTİK HEDEF (CQB)
            elif self.target_type == "multi_target":
                p_plates = self.p1_plates if player_id == 1 else self.p2_plates
                multi_spots = [(120, 150), (392, 150), (256, 256), (140, 370), (372, 370)]
                hit_idx = None
                for idx, (tx, ty) in enumerate(multi_spots):
                    if p_plates[idx]:
                        stx = 256.0 + (tx - 256.0) * scale
                        sty = 256.0 + (ty - 256.0) * scale
                        if math.hypot(float(x) - stx, float(y) - sty) <= 42.0 * scale:
                            hit_idx = idx
                            break
                if hit_idx is not None:
                    p_plates[hit_idx] = False
                    puan = 20
                    bolge = f"HEDEF #{hit_idx + 1} VURULDU!"
                else:
                    puan = 0
                    bolge = "ÇOKLU HEDEF ISKA!"

            # 3. TRAP & UÇAN KİL PLAKA
            elif self.target_type == "trap_clay":
                dist_center = math.hypot(float(x) - 256.0, float(y) - 256.0)
                if dist_center <= 140.0 * scale:
                    puan = 25
                    bolge = "TRAP PLAKA PARÇALANDI!"
                else:
                    puan = 0
                    bolge = "TRAP ISKA!"

            # 4. HIZLI REAKSİYON / REFLEKS
            elif self.target_type == "quick_reaction":
                dx = float(x) - 256.0
                dy = float(y) - 256.0
                dist_center = math.hypot(dx, dy)
                if dist_center <= 60.0 * scale:
                    puan = 25
                    bolge = f"REFLEKS 10 ({rx_time} sn)!"
                elif dist_center <= 120.0 * scale:
                    puan = 15
                    bolge = f"REFLEKS 8 ({rx_time} sn)"
                else:
                    puan = 0
                    bolge = "REFLEKS ISKA!"

            # 5. STANDART DAİRESEL, SİLÜET & GECE FENER MODU
            else:
                dx = float(x) - 256.0
                dy = float(y) - 256.0
                dist_center = math.hypot(dx, dy)

                puan = 0
                bolge = "ISKA"
                if dist_center <= 22 * scale: puan, bolge = 10, "10 PUAN (MERKEZ)"
                elif dist_center <= 46 * scale: puan, bolge = 9, "9 PUAN"
                elif dist_center <= 72 * scale: puan, bolge = 8, "8 PUAN"
                elif dist_center <= 100 * scale: puan, bolge = 7, "7 PUAN"
                elif dist_center <= 130 * scale: puan, bolge = 6, "6 PUAN"
                elif dist_center <= 162 * scale: puan, bolge = 5, "5 PUAN"
                elif dist_center <= 194 * scale: puan, bolge = 4, "4 PUAN"
                elif dist_center <= 226 * scale: puan, bolge = 3, "3 PUAN"
                elif dist_center <= 248 * scale: puan, bolge = 2, "2 PUAN"
                elif dist_center <= 256 * scale: puan, bolge = 1, "1 PUAN"

            shot = {
                "id": (len(self.p1_holes) if player_id == 1 else len(self.p2_holes)) + 1,
                "player_id": player_id,
                "x": round(float(x), 1),
                "y": round(float(y), 1),
                "puan": puan,
                "bolge": bolge,
                "reaction_time": rx_time,
                "time": time.strftime("%H:%M:%S"),
                "yontem": yontem,
                "empty": False
            }

            if player_id == 1:
                self.p1_shots += 1
                self.p1_score += puan
                if puan > 0: self.p1_hits += 1
                self.p1_holes.append(shot)
            else:
                self.p2_shots += 1
                self.p2_score += puan
                if puan > 0: self.p2_hits += 1
                self.p2_holes.append(shot)

            play_audio("gunshot", weapon=weapon)
            if puan > 0:
                def _hit():
                    time.sleep(0.04)
                    if self.target_type == "trap_clay":
                        play_audio("TRAP_HIT")
                    elif self.target_type in ["knockdown_plates", "moving_targets", "multi_target"]:
                        play_audio("steel_hit")
                    else:
                        play_audio("target_hit")
                threading.Thread(target=_hit, daemon=True).start()

            return shot

    def get_state(self):
        with self.lock:
            acc1 = int((self.p1_hits / self.p1_shots) * 100) if self.p1_shots > 0 else 0
            acc2 = int((self.p2_hits / self.p2_shots) * 100) if self.p2_shots > 0 else 0

            elapsed = time.time() - self.start_time if self.is_active else 0
            remaining = max(0, int(self.duration - elapsed)) if (self.duration is not None and self.duration < 9000) else None

            p1_rem_ammo = (self.max_ammo - self.p1_shots) if self.max_ammo is not None else None
            p2_rem_ammo = (self.max_ammo - self.p2_shots) if self.max_ammo is not None else None

            leader = "BERABERE"
            if self.p1_score > self.p2_score:
                leader = f"1. ATICI (+{self.p1_score - self.p2_score})"
            elif self.p2_score > self.p1_score:
                leader = f"2. ATICI (+{self.p2_score - self.p1_score})"

            return {
                "p1": {
                    "name": self.p1_name,
                    "score": self.p1_score,
                    "shots": self.p1_shots,
                    "hits": self.p1_hits,
                    "accuracy": acc1,
                    "remaining_ammo": p1_rem_ammo,
                    "holes": self.p1_holes,
                    "plates": self.p1_plates
                },
                "p2": {
                    "name": self.p2_name,
                    "score": self.p2_score,
                    "shots": self.p2_shots,
                    "hits": self.p2_hits,
                    "accuracy": acc2,
                    "remaining_ammo": p2_rem_ammo,
                    "holes": self.p2_holes,
                    "plates": self.p2_plates
                },
                "leader": leader,
                "remaining_seconds": remaining,
                "max_ammo": self.max_ammo,
                "target_type": self.target_type,
                "distance": self.distance,
                "format": self.format,
                "is_active": self.is_active
            }

duel_engine = DuelEngine()

@app.route('/api/duel/state')
def api_duel_state():
    return jsonify(duel_engine.get_state())

@app.route('/api/duel/start', methods=['POST'])
def api_duel_start():
    duel_engine.start_match()
    return jsonify({"success": True, "state": duel_engine.get_state()})

@app.route('/api/duel/reset', methods=['POST'])
def api_duel_reset():
    duel_engine.reset()
    return jsonify({"success": True, "state": duel_engine.get_state()})

@app.route('/api/duel/config', methods=['POST'])
def api_duel_config():
    data = request.get_json(silent=True) or {}
    duel_engine.set_config(
        target_type=data.get("target_type"),
        distance=data.get("distance"),
        match_format=data.get("format"),
        max_ammo=data.get("max_ammo"),
        duration=data.get("duration"),
        p1_name=data.get("p1_name"),
        p2_name=data.get("p2_name")
    )
    return jsonify({"success": True, "state": duel_engine.get_state()})

@app.route('/api/duel/shoot', methods=['POST'])
def api_duel_shoot():
    data = request.get_json(silent=True) or {}
    player_id = int(data.get("player_id", 1))
    x = data.get("x", 256.0)
    y = data.get("y", 256.0)
    weapon = data.get("weapon", "Glock19")
    yontem = data.get("yontem", "PARMAK")
    shot = duel_engine.shoot(player_id, x, y, weapon=weapon, yontem=yontem)
    return jsonify({"success": True, "shot": shot, "state": duel_engine.get_state()})


if __name__ == '__main__':
    import webbrowser
    print("=" * 60)
    print("  ATIS SIMULATORU - LOCALHOST WEB SUNUCUSU")
    print("  Adres: http://localhost:5000")
    print("=" * 60)
    # Simulator'ü ana iş parçacığında kamerayı açarak başlat
    sim = get_simulator()
    threading.Timer(1.2, lambda: webbrowser.open("http://localhost:5000")).start()
    app.run(host="0.0.0.0", port=5000, debug=False, threaded=True)
