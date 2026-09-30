# Shooting Simulator

Kamera ve görüntü işleme (OpenCV) tabanlı lazer atış simülasyonu yazılımı.

## Özellikler

- Lazer ve fare ile atış algılama
- Halka ve bölge bazlı puanlama sistemi
- Klasik, siluet, rehineli ve hareketli hedef modları
- Farklı silah modelleri ve ses simülasyonu
- Kamera ekran kalibrasyonu
- Skor ve atış geçmişi kaydı (CSV)

## Kurulum

Gereksinimleri yüklemek için:

```bash
pip install -r requirements.txt

Çalıştırma
Simülatörü başlatmak için baslat.bat dosyasını çalıştırın veya terminalden:

bash
python app.py
Tarayıcıdan http://localhost:5000 adresine gidin.

Proje Yapısı
app.py: Ana sunucu ve görüntü işleme modülü
baslat.bat: Başlatma betiği
requirements.txt: Python bağımlılıkları
skorlar.csv: Skor kayıtları
assets/: Hedef ve medya dosyaları
static/: Stil, ses ve JavaScript dosyaları
templates/: Web arayüzü

