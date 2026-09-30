/**
 * SHOOTING SIMULATOR - PROFESYONEL 4 SEKME KONTROLCÜSÜ
 * 1. Senaryolar (Kamera & El Takibi & 6 Taktik Senaryo)
 * 2. Resmi Hedefler (5 Hedef Kağıdı, Grupman & Mesafe)
 * 3. Raporlar & Analiz (Oturum Analizi, Hata Pastası, Ritim Çizelgeleri, PDF Yazdır)
 * 4. Ayarlar & Kalibrasyon (Glock 19 Silah Seçimi, Yatay/Dikey Ofset Kalibrasyonu)
 */

document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------
    // 1. DÖRT SEKMELİ GEZİNTİ SİSTEMİ (4 TABS) - SAĞLAM & GECİKMESİZ
    // -------------------------------------------------------------
    let activeTab = 'sim';

    function switchTab(targetKey) {
        activeTab = targetKey;
        const tabMap = {
            'sim': { btnId: 'btnTabSim', viewId: 'viewSim' },
            'paper': { btnId: 'btnTabPaper', viewId: 'viewPaper' },
            'duel': { btnId: 'btnTabDuel', viewId: 'viewDuel' },
            'analytics': { btnId: 'btnTabAnalytics', viewId: 'viewAnalytics' },
            'settings': { btnId: 'btnTabSettings', viewId: 'viewSettings' }
        };

        Object.keys(tabMap).forEach(k => {
            const btn = document.getElementById(tabMap[k].btnId);
            const view = document.getElementById(tabMap[k].viewId);
            if (btn) btn.classList.toggle('active', k === targetKey);
            if (view) {
                if (k === targetKey) {
                    view.style.display = 'flex';
                    view.classList.add('active');
                } else {
                    view.style.display = 'none';
                    view.classList.remove('active');
                }
            }
        });

        if (targetKey === 'sim') {
            const lImg = document.getElementById('laserVideo');
            if (lImg && (!lImg.src || !lImg.src.includes('/video_feed'))) {
                lImg.src = '/video_feed';
            }
            if (typeof updateLiveStream === 'function') updateLiveStream();
        } else {
            const lImg = document.getElementById('laserVideo');
            if (lImg && lImg.src && lImg.src.includes('/video_feed')) {
                lImg.src = '';
            }
        }


        if (targetKey === 'paper') {
            if (typeof fetchPaperState === 'function') fetchPaperState();
            if (typeof isPaperMovingTarget !== 'undefined' && isPaperMovingTarget) startPaperMovingLoop();
            if (typeof isFpsModeActive !== 'undefined' && isFpsModeActive) startFpsRangeLoop();
            if (typeof startPaperArenaReticleLoop === 'function') startPaperArenaReticleLoop();
        }
        if (targetKey === 'duel') {
            if (typeof initDuelMode === 'function') initDuelMode();
        }
        if (targetKey === 'analytics') {
            if (typeof loadAnalytics === 'function') loadAnalytics();
        }
        if (targetKey === 'settings') {
            if (typeof loadSettings === 'function') loadSettings();
        }

        fetch('/api/active_tab/' + targetKey, { method: 'POST' }).catch(() => {});
    }

    const navTabsContainer = document.querySelector('.nav-tabs-container');
    if (navTabsContainer) {
        navTabsContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.nav-tab-btn');
            if (!btn) return;
            const dataTab = btn.getAttribute('data-tab');
            const keyMap = { 'viewSim': 'sim', 'viewPaper': 'paper', 'viewDuel': 'duel', 'viewAnalytics': 'analytics', 'viewSettings': 'settings' };
            const targetKey = keyMap[dataTab] || (btn.id.replace('btnTab', '').toLowerCase());
            switchTab(targetKey);
        });
    }

    // Tab buton tıklamaları navTabsContainer delegasyonu ile tekil ve hızlı olarak yönetilmektedir.


    // -------------------------------------------------------------
    // DİJİTAL SAAT & ATICI PROFİLİ MODALI
    // -------------------------------------------------------------
    const liveClock = document.getElementById('liveClock');
    function updateClock() {
        const now = new Date();
        const hrs = String(now.getHours()).padStart(2, '0');
        const mins = String(now.getMinutes()).padStart(2, '0');
        const secs = String(now.getSeconds()).padStart(2, '0');
        if (liveClock) liveClock.textContent = `${hrs}:${mins}:${secs}`;
    }
    setInterval(updateClock, 1000);
    updateClock();

    const shooterBadge = document.getElementById('shooterBadge');
    const shooterNameText = document.getElementById('shooterNameText');
    const shooterModal = document.getElementById('shooterModal');
    const inputShooterName = document.getElementById('inputShooterName');
    const btnCancelShooter = document.getElementById('btnCancelShooter');
    const btnSaveShooter = document.getElementById('btnSaveShooter');
    let isEditingShooter = false;

    if (shooterBadge && shooterModal) {
        shooterBadge.addEventListener('click', () => {
            isEditingShooter = true;
            inputShooterName.value = shooterNameText.textContent || 'Atıcı 1';
            shooterModal.style.display = 'flex';
            setTimeout(() => inputShooterName.focus(), 100);
        });

        btnCancelShooter.addEventListener('click', () => {
            isEditingShooter = false;
            shooterModal.style.display = 'none';
        });

        btnSaveShooter.addEventListener('click', async () => {
            const name = inputShooterName.value.trim();
            if (name) {
                try {
                    await fetch('/api/set_shooter', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name })
                    });
                    shooterNameText.textContent = name;
                } catch (e) {
                    console.error("Atıcı adı kaydedilemedi", e);
                }
            }
            isEditingShooter = false;
            shooterModal.style.display = 'none';
        });

        inputShooterName.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') btnSaveShooter.click();
            else if (e.key === 'Escape') btnCancelShooter.click();
        });
    }

    // =============================================================
    // 1. SEKME: SENARYOLAR (KAMERA, EL TAKİBİ, 6 EĞİTİM MODU)
    // =============================================================
    const laserCanvas = document.getElementById('laserCanvas');
    const laserCtx = laserCanvas ? laserCanvas.getContext('2d') : null;
    const hudFps = document.getElementById('hudFps');
    const videoContainer = document.getElementById('videoContainer');
    const headerActiveMode = document.getElementById('headerActiveMode');
    const statScore = document.getElementById('statScore');
    const statAccuracy = document.getElementById('statAccuracy');
    const statShots = document.getElementById('statShots');
    const statReaction = document.getElementById('statReaction');
    const triggerStatusText = document.getElementById('triggerStatusText');
    const triggerProgressFill = document.getElementById('triggerProgressFill');
    const hudCenterAlert = document.getElementById('hudCenterAlert');
    const shotLogsBody = document.getElementById('shotLogsBody');

    const btnShoot = document.getElementById('btnShoot');
    const btnReset = document.getElementById('btnReset');
    const btnCycleDistance = document.getElementById('btnCycleDistance');
    const btnFullscreen = document.getElementById('btnFullscreen');
    const scenarioCards = document.querySelectorAll('.scenario-card, .scenario-box');
    const scenarioBoxes = document.querySelectorAll('.scenario-box');
    const distChips = document.querySelectorAll('.chip-dist');
    const masterDistBtns = document.querySelectorAll('.btn-master-dist');
    const activeScenarioIndicator = document.getElementById('activeScenarioIndicator');

    let sonBilinenAtisZamani = 0;
    let frameCount = 0;
    let lastFpsTime = performance.now();
    let isFetchingSnapshot = false;
    let lastStatusData = null;

    const btnTestSound = document.getElementById('btnTestSound');
    const quickSelectWeapon = document.getElementById('quickSelectWeapon');

    // Taktik Ses Motoru: 4 Silaha Özel Gerçek WAV Dosyaları + Web Audio Sub-Bass Hibrit Sentez
    class TacticalAudio {
        constructor() {
            this.ctx = null;
            this._lastShotTime = 0;
            this.currentWeapon = 'Glock19';
            this.audioWeapons = {
                'Glock19': document.getElementById('sndGunshot_Glock19') || new Audio('/static/audio/gunshot_glock19.wav'),
                'CanikTP9': document.getElementById('sndGunshot_CanikTP9') || new Audio('/static/audio/gunshot_canik_tp9.wav'),
                'SAR9': document.getElementById('sndGunshot_SAR9') || new Audio('/static/audio/gunshot_sar9.wav'),
                'M4A1': document.getElementById('sndGunshot_M4A1') || new Audio('/static/audio/gunshot_m4a1.wav')
            };
            this.audioGunshot = document.getElementById('sndGunshot') || new Audio('/static/audio/gunshot.wav');
            this.audioSteelHit = document.getElementById('sndSteelHit') || new Audio('/static/audio/steel_hit.wav');
            this.audioTargetHit = document.getElementById('sndTargetHit') || new Audio('/static/audio/target_hit.wav');
            this.audioTrapBreak = document.getElementById('sndTrapBreak') || new Audio('/static/audio/trap_break.wav');
        }

        setWeapon(w) {
            if (w && this.audioWeapons[w]) {
                this.currentWeapon = w;
            }
        }

        init() {
            if (!this.ctx) {
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                if (AudioCtx) this.ctx = new AudioCtx();
            }
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume().catch(() => {});
            }
            const currentAudio = this.audioWeapons[this.currentWeapon] || this.audioGunshot;
            if (currentAudio && currentAudio.readyState < 2) {
                currentAudio.load();
            }
        }

        playWav(audioEl, vol = 1.0) {
            try {
                if (audioEl) {
                    const clone = audioEl.cloneNode();
                    clone.volume = vol;
                    const p = clone.play();
                    if (p !== undefined) {
                        p.catch(() => {});
                    }
                    return true;
                }
            } catch (e) {}
            return false;
        }

        playShot(customWeapon) {
            this.init();
            const nowMs = performance.now();
            if (this._lastShotTime && (nowMs - this._lastShotTime < 95)) {
                return;
            }
            this._lastShotTime = nowMs;

            const w = customWeapon || this.currentWeapon;
            const targetAudio = this.audioWeapons[w] || this.audioGunshot;

            // 1. Seçili Silaha Özel Gerçek WAV Dosyası Çal
            this.playWav(targetAudio, 1.0);

            // 2. Silah Türüne Göre Kalibre Edilmiş Sub-Bass Patlaması
            if (!this.ctx) return;
            try {
                const now = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const oscG = this.ctx.createGain();
                osc.type = 'triangle';

                const startFreq = (w === 'M4A1') ? 220 : ((w === 'SAR9') ? 145 : ((w === 'CanikTP9') ? 180 : 160));
                const endFreq = (w === 'M4A1') ? 45 : 32;
                const dur = (w === 'M4A1') ? 0.16 : 0.11;
                const vol = (w === 'M4A1') ? 0.95 : 0.85;

                osc.frequency.setValueAtTime(startFreq, now);
                osc.frequency.exponentialRampToValueAtTime(endFreq, now + dur);
                oscG.gain.setValueAtTime(vol, now);
                oscG.gain.exponentialRampToValueAtTime(0.01, now + dur);
                osc.connect(oscG);
                oscG.connect(this.ctx.destination);
                osc.start(now);
                osc.stop(now + dur);
            } catch (e) {}
        }

        playTone(freq, dur, type = 'sine', vol = 0.5) {
            this.init();
            if (!this.ctx) return;
            try {
                const now = this.ctx.currentTime;
                const osc = this.ctx.createOscillator();
                const g = this.ctx.createGain();
                osc.type = type;
                osc.frequency.setValueAtTime(freq, now);
                g.gain.setValueAtTime(vol, now);
                g.gain.exponentialRampToValueAtTime(0.001, now + dur);
                osc.connect(g);
                g.connect(this.ctx.destination);
                osc.start(now);
                osc.stop(now + dur);
            } catch (e) {}
        }

        playHit(sesTuru) {
            this.init();
            if (sesTuru === 'STEEL_HIT' || sesTuru === 'MULTI_HIT' || sesTuru === 'MULTI_CLEARED') {
                this.playWav(this.audioSteelHit, 0.95);
            } else if (sesTuru === 'TRAP_HIT') {
                this.playWav(this.audioTrapBreak, 0.95);
            } else if (sesTuru === 'FRIENDLY_FIRE') {
                this.playTone(220, 0.35, 'sawtooth', 0.75);
            } else {
                this.playWav(this.audioTargetHit, 0.90);
            }
        }

        playMiss() {
            this.init();
            this.playTone(280, 0.08, 'sine', 0.25);
        }
    }

    const tacticalAudio = new TacticalAudio();
    ['click', 'keydown', 'touchstart', 'pointerdown', 'mousedown'].forEach(evt => {
        window.addEventListener(evt, () => tacticalAudio.init());
    });

    // Donanım Destekli FPS Monitörü
    if (hudFps) hudFps.textContent = '30 FPS';

    // =============================================================
    // YÜKSEK HIZLI GPU DESTEKLİ CANLI KAMERA & EL TAKİBİ MOTORU
    // =============================================================
    let isCanvasStreamActive = true;
    let isFrameBusy = false;

    function renderCanvasLiveFeed() {
        if (!isCanvasStreamActive || activeTab !== 'sim') {
            setTimeout(() => requestAnimationFrame(renderCanvasLiveFeed), 250);
            return;
        }

        if (!isFrameBusy) {
            isFrameBusy = true;
            const img = new Image();
            img.onload = () => {
                if (laserCtx && laserCanvas) {
                    laserCtx.drawImage(img, 0, 0, laserCanvas.width, laserCanvas.height);
                }
                isFrameBusy = false;
                requestAnimationFrame(renderCanvasLiveFeed);
            };
            img.onerror = () => {
                isFrameBusy = false;
                setTimeout(() => requestAnimationFrame(renderCanvasLiveFeed), 100);
            };
            img.src = '/api/snapshot?t=' + performance.now();
        } else {
            requestAnimationFrame(renderCanvasLiveFeed);
        }
    }

    // Canlı Kamera Yayınını Anında Başlat
    renderCanvasLiveFeed();

    // Canvas / Video'ya fareyle tıklayınca anında atış & Nişan alma
    const laserTargetElem = document.getElementById('videoContainer') || document.getElementById('laserVideo') || laserCanvas;
    let lastAimSent = 0;
    let currentMouseX = 320;
    let currentMouseY = 240;

    function getExactVideoCoordinates(clientX, clientY) {
        const targetElem = document.getElementById('laserVideo') || document.getElementById('videoContainer') || laserTargetElem;
        if (!targetElem) return { x: 320, y: 240, visualX: 0, visualY: 0 };
        const rect = targetElem.getBoundingClientRect();
        const cWidth = rect.width;
        const cHeight = rect.height;
        if (cWidth <= 0 || cHeight <= 0) return { x: 320, y: 240, visualX: 0, visualY: 0 };

        const videoAspect = 640 / 480;
        const containerAspect = cWidth / cHeight;

        let rendWidth = cWidth;
        let rendHeight = cHeight;
        let offsetX = 0;
        let offsetY = 0;

        if (containerAspect > videoAspect) {
            rendHeight = cHeight;
            rendWidth = cHeight * videoAspect;
            offsetX = (cWidth - rendWidth) / 2;
        } else {
            rendWidth = cWidth;
            rendHeight = cWidth / videoAspect;
            offsetY = (cHeight - rendHeight) / 2;
        }

        const relX = clientX - rect.left - offsetX;
        const relY = clientY - rect.top - offsetY;

        const x = Math.max(0, Math.min(639, Math.round(relX * (640 / rendWidth))));
        const y = Math.max(0, Math.min(479, Math.round(relY * (480 / rendHeight))));

        return { x, y, visualX: clientX - rect.left, visualY: clientY - rect.top };
    }

    function createMuzzleFlash(x, y) {
        if (!videoContainer) return;
        const flash = document.createElement('div');
        flash.style.position = 'absolute';
        flash.style.left = `${x}px`;
        flash.style.top = `${y}px`;
        flash.style.width = '24px';
        flash.style.height = '24px';
        flash.style.transform = 'translate(-50%, -50%)';
        flash.style.borderRadius = '50%';
        flash.style.background = 'radial-gradient(circle, #ffffff 0%, #ffaa00 50%, rgba(255,50,0,0) 80%)';
        flash.style.boxShadow = '0 0 20px #ff9900, 0 0 40px #ff3300';
        flash.style.pointerEvents = 'none';
        flash.style.zIndex = '50';
        flash.style.animation = 'flashFade 0.18s ease-out forwards';
        videoContainer.appendChild(flash);
        setTimeout(() => flash.remove(), 200);
    }

    let lastSimShotTime = 0;
    if (laserTargetElem) {
        laserTargetElem.addEventListener('mousemove', (e) => {
            const coords = getExactVideoCoordinates(e.clientX, e.clientY);
            currentMouseX = coords.x;
            currentMouseY = coords.y;

            const now = performance.now();
            if (now - lastAimSent > 45) {
                lastAimSent = now;
                fetch('/api/aim', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ x: currentMouseX, y: currentMouseY })
                }).catch(() => {});
            }
        });

        const triggerSimShot = async (clientX, clientY) => {
            const now = performance.now();
            if (now - lastSimShotTime < 80) return;
            lastSimShotTime = now;

            tacticalAudio.playShot();
            const coords = getExactVideoCoordinates(clientX, clientY);
            currentMouseX = coords.x;
            currentMouseY = coords.y;

            createMuzzleFlash(coords.visualX, coords.visualY);

            try {
                await fetch('/api/shoot', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ x: coords.x, y: coords.y, weapon: tacticalAudio.currentWeapon })
                });
            } catch (err) {
                console.error("Atış gönderilemedi", err);
            }
        };

        laserTargetElem.addEventListener('pointerdown', async (e) => {
            if (e.button === 0) {
                await triggerSimShot(e.clientX, e.clientY);
            }
        });
    }


    // Telemetri Poller (Her 100ms)
    async function fetchStatus() {
        try {
            const res = await fetch('/api/status?tab=' + encodeURIComponent(activeTab));
            if (!res.ok) return;
            const data = await res.json();
            lastStatusData = data;

            if (statScore) statScore.textContent = data.toplam_skor;
            if (statShots) statShots.textContent = data.atis_sayisi;
            if (statAccuracy) statAccuracy.textContent = `%${data.isabet_orani}`;
            if (statReaction) statReaction.textContent = `${data.son_reaksiyon.toFixed(2)} sn`;

            if (shooterNameText && !isEditingShooter && data.atici_adi) {
                shooterNameText.textContent = data.atici_adi;
            }

            const currentDist = data.aktif_mesafe || 10;
            if (headerActiveMode) headerActiveMode.textContent = `MOD: ${data.aktif_senaryo} | ${currentDist}m`;
            if (activeScenarioIndicator) activeScenarioIndicator.textContent = `AKTİF: ${data.aktif_senaryo} | ${currentDist} m`;

            if (data.weapon_type) {
                tacticalAudio.setWeapon(data.weapon_type);
                if (quickSelectWeapon && quickSelectWeapon.value !== data.weapon_type) {
                    quickSelectWeapon.value = data.weapon_type;
                }
            }
            scenarioCards.forEach(card => {
                const id = parseInt(card.getAttribute('data-id'));
                if (id === data.aktif_senaryo_id) card.classList.add('active');
                else card.classList.remove('active');
            });

            distChips.forEach(chip => {
                const sc = parseInt(chip.getAttribute('data-sc'));
                const d = parseInt(chip.getAttribute('data-dist'));
                if (sc === data.aktif_senaryo_id && d === currentDist) {
                    chip.classList.add('active');
                } else if (sc === data.aktif_senaryo_id) {
                    chip.classList.remove('active');
                }
            });

            masterDistBtns.forEach(btn => {
                const d = parseInt(btn.getAttribute('data-dist'));
                if (d === currentDist) btn.classList.add('active');
                else btn.classList.remove('active');
            });

            // Input Mode (El Takibi vs Lazer Modu)
            const inputMode = data.input_mode || 'HAND';
            document.querySelectorAll('.btn-input-mode, #settingsInputModeGroup .btn-segment').forEach(btn => {
                const m = btn.getAttribute('data-mode');
                btn.classList.toggle('active', m === inputMode);
            });
            if (typeof updateLaserSettingsUI === 'function') {
                updateLaserSettingsUI(inputMode);
            }

            // Tetik / Lazer Barı
            if (inputMode === 'LASER') {
                if (data.laser_active) {
                    if (triggerStatusText) {
                        triggerStatusText.textContent = `🔴 LAZER ATEŞ! (${data.laser_dot ? `X:${data.laser_dot.x} Y:${data.laser_dot.y}` : 'Vuruldu'})`;
                        triggerStatusText.className = 'status-fire';
                    }
                    if (triggerProgressFill) {
                        triggerProgressFill.style.width = '100%';
                        triggerProgressFill.classList.add('fired');
                    }
                } else if (data.hand_detected) {
                    if (triggerStatusText) {
                        triggerStatusText.textContent = `🔴 LAZER KİLİTLENDİ (Hazır)`;
                        triggerStatusText.className = 'status-ready';
                    }
                    if (triggerProgressFill) {
                        triggerProgressFill.style.width = '70%';
                        triggerProgressFill.classList.remove('fired');
                    }
                } else {
                    if (triggerStatusText) {
                        triggerStatusText.textContent = `🔴 LAZER BEKLENİYOR...`;
                        triggerStatusText.className = 'status-ready';
                    }
                    if (triggerProgressFill) {
                        triggerProgressFill.style.width = '0%';
                        triggerProgressFill.classList.remove('fired');
                    }
                }
            } else {
                const ratio = (typeof data.tetik_orani === 'number') ? data.tetik_orani : 1.0;
                const ready = !!data.tetik_hazir;
                let fillPct = Math.max(0, Math.min(100, (1.0 - (ratio / 0.70)) * 100));
                if (triggerProgressFill) triggerProgressFill.style.width = `${fillPct}%`;

                if (triggerStatusText) {
                    if (ratio <= 0.42 || !ready) {
                        if (ratio <= 0.42) {
                            triggerStatusText.textContent = `ATEŞ! (${ratio.toFixed(2)})`;
                            triggerStatusText.className = 'status-fire';
                            if (triggerProgressFill) triggerProgressFill.classList.add('fired');
                        } else {
                            triggerStatusText.textContent = `PARMAKLARI AÇ (${ratio.toFixed(2)})`;
                            triggerStatusText.className = 'status-open';
                            if (triggerProgressFill) triggerProgressFill.classList.remove('fired');
                        }
                    } else {
                        triggerStatusText.textContent = `HAZIR (${ratio.toFixed(2)})`;
                        triggerStatusText.className = 'status-ready';
                        if (triggerProgressFill) triggerProgressFill.classList.remove('fired');
                    }
                }
            }

            // Laser Live Status Tag in Settings
            const laserLiveTag = document.getElementById('laserLiveStatusTag');
            if (laserLiveTag) {
                if (inputMode === 'HAND') {
                    laserLiveTag.innerHTML = '<span class="dot" style="background:#00ffcc;"></span> Mod: El Takibi Aktif';
                    laserLiveTag.className = 'laser-status-tag';
                } else if (inputMode === 'MOUSE') {
                    laserLiveTag.innerHTML = '<span class="dot" style="background:#38bdf8;"></span> Mod: Fare / Nişangah Aktif';
                    laserLiveTag.className = 'laser-status-tag';
                } else if (data.laser_active) {
                    laserLiveTag.innerHTML = '<span class="dot blink" style="background:#ff3366;"></span> 🔴 ATEŞ EDİLDİ!';
                    laserLiveTag.className = 'laser-status-tag active';
                } else if (data.hand_detected) {
                    laserLiveTag.innerHTML = '<span class="dot blink" style="background:#00f076;"></span> 🟢 Lazer Kilitlendi';
                    laserLiveTag.className = 'laser-status-tag active';
                } else {
                    laserLiveTag.innerHTML = '<span class="dot blink" style="background:#ffb703;"></span> 🟡 Lazer Işığı Bekleniyor';
                    laserLiveTag.className = 'laser-status-tag';
                }
            }

            if (data.son_atis && data.son_atis.zaman > sonBilinenAtisZamani) {
                sonBilinenAtisZamani = data.son_atis.zaman;
                if (activeTab === 'tactical') {
                    let tx = 640, ty = 360;
                    if (data.son_atis.x !== undefined && data.son_atis.y !== undefined) {
                        tx = data.son_atis.x > 1 ? data.son_atis.x : data.son_atis.x * 1280;
                        ty = data.son_atis.y > 1 ? data.son_atis.y : data.son_atis.y * 720;
                    } else if (data.laser_dot) {
                        tx = (data.laser_dot.x / 640) * 1280;
                        ty = (data.laser_dot.y / 480) * 720;
                    }
                    fireTacticalShot(tx, ty, data.son_atis.kaynak || 'KAMERA');
                } else if (activeTab === 'paper') {
                    if (data.son_atis.needs_paper_calc) {
                        triggerPaperHandShot(data, data.son_atis.kaynak || 'PARMAK');
                    } else {
                        showPaperHudAlert(data.son_atis.paper_shot || data.son_atis);
                        tacticalAudio.playShot();
                        if (data.son_atis.isabet) {
                            tacticalAudio.playHit(data.son_atis.ses_turu || 'PAPER_HIT');
                        } else if (data.son_atis.puan < 0) {
                            tacticalAudio.playHit('FRIENDLY_FIRE');
                        } else {
                            tacticalAudio.playMiss();
                        }
                    }
                } else {
                    showHudAlert(data.son_atis);
                    tacticalAudio.playShot();
                    if (data.son_atis.isabet) {
                        tacticalAudio.playHit(data.son_atis.ses_turu);
                    } else if (data.son_atis.puan < 0) {
                        tacticalAudio.playHit('FRIENDLY_FIRE');
                    } else {
                        tacticalAudio.playMiss();
                    }
                }
                updateRecentLogs(data.recent_logs);
            }

            if (activeTab === 'paper') {
                if (data.input_mode) {
                    document.querySelectorAll('.btn-paper-input-mode').forEach(b => {
                        b.classList.toggle('active', b.getAttribute('data-mode') === data.input_mode);
                    });
                }

                const desc = document.getElementById('paperInputStatusDesc');
                if (desc) {
                    if (data.input_mode === 'LASER') {
                        desc.innerHTML = data.laser_active ? '<strong style="color:#ff3366;"><i class="fa-solid fa-bullseye"></i> 🔴 LAZER ATEŞ EDİLDİ!</strong>' : (data.laser_dot ? '<span style="color:#00f076;"><i class="fa-solid fa-bullseye"></i> 🟢 Lazer Kilitlendi (Hedefe Doğrultun)</span>' : '<i class="fa-solid fa-bullseye"></i> 🔴 Lazer Modu: Lazer ışığını ekrandaki hedefe tutun = ANINDA VURUŞ!');
                    } else if (data.input_mode === 'HAND') {
                        const ratio = (typeof data.tetik_orani === 'number') ? data.tetik_orani : 1.0;
                        const ready = !!data.tetik_hazir;
                        if (data.hand_detected) {
                            if (ratio <= 0.40) {
                                desc.innerHTML = `<strong style="color:#ff3366;"><i class="fa-solid fa-hand"></i> 💥 TETİK DÜŞTÜ! (${ratio.toFixed(2)})</strong>`;
                            } else if (ready) {
                                desc.innerHTML = `<span style="color:#00ffcc;"><i class="fa-solid fa-hand"></i> ✋ Tetik Hazır (Oran: ${ratio.toFixed(2)} - Başparmağını Sık)</span>`;
                            } else {
                                desc.innerHTML = `<span style="color:#ffb703;"><i class="fa-solid fa-hand"></i> ✋ Parmaklarını Aç (Hazırlanıyor: ${ratio.toFixed(2)})</span>`;
                            }
                        } else {
                            desc.innerHTML = '✋ El Takibi: Kameraya elinizi gösterin (İşaret: Nişan | Başparmak: Tetik)';
                        }
                    } else {
                        desc.innerHTML = '🖱️ Fare Modu: Hedefe tıklayın veya boşluk tuşuna basın.';
                    }
                }

                if (data.paper_state) {
                    const newShots = data.paper_state.total_shots;
                    const oldShots = currentPaperState ? currentPaperState.total_shots : -1;
                    const newTid = data.paper_state.target_id;
                    const oldTid = currentPaperState ? currentPaperState.target_id : -1;

                    currentPaperState = data.paper_state;
                    if (newShots !== oldShots || newTid !== oldTid) {
                        updatePaperUI(data.paper_state);
                    } else {
                        renderPaperCanvas();
                    }
                }
            }

            if (activeTab === 'duel') {
                updateDuelWithTelemetri(data);
            }

        } catch (err) {
            // sessizce devam
        }
    }

    let isStatusPending = false;
    async function runStatusLoop() {
        if (!isStatusPending) {
            isStatusPending = true;
            try {
                await fetchStatus();
            } finally {
                isStatusPending = false;
            }
        }
        setTimeout(runStatusLoop, 120);
    }
    runStatusLoop();

    function showHudAlert(shot) {
        if (!hudCenterAlert) return;
        let alertClass = 'miss';
        if (shot.puan > 0) alertClass = 'hit';
        else if (shot.puan < 0) alertClass = 'penalty';

        hudCenterAlert.innerHTML = `
            <div class="hud-alert-box ${alertClass}">
                ${shot.mesaj}
            </div>
        `;
        clearTimeout(hudCenterAlert._timer);
        hudCenterAlert._timer = setTimeout(() => {
            hudCenterAlert.innerHTML = '';
        }, 1500);
    }

    function updateRecentLogs(logs) {
        if (!shotLogsBody || !logs || logs.length === 0) return;
        shotLogsBody.innerHTML = logs.map(l => {
            let scoreClass = 'miss';
            if (l.puan > 0) scoreClass = 'hit';
            else if (l.puan < 0) scoreClass = 'penalty';

            return `
                <tr>
                    <td>${l.zaman}</td>
                    <td><strong>${l.atici || 'Atıcı 1'}</strong></td>
                    <td><span class="badge-score ${scoreClass}">${l.puan > 0 ? '+' : ''}${l.puan}</span></td>
                    <td>${l.mesafe_px}px</td>
                    <td>${l.reaksiyon_sn}s</td>
                    <td>${l.yontem}</td>
                </tr>
            `;
        }).join('');
    }

    // Senaryo Kutuları & Mesafe Butonları
    scenarioBoxes.forEach(box => {
        box.addEventListener('click', async (e) => {
            if (e.target.closest('.chip-dist')) return; // Mesafe butonuna tıklandıysa çift tetiklemeyi önle
            const id = box.getAttribute('data-id');
            try {
                const res = await fetch(`/api/scenario/${id}`, { method: 'POST' });
                if (res.ok) {
                    scenarioBoxes.forEach(b => b.classList.remove('active'));
                    box.classList.add('active');
                }
            } catch (err) {
                console.error("Senaryo değiştirilemedi", err);
            }
        });
    });

    // Her Senaryo Kutusunun Altındaki 5m, 10m, 15m, 20m Mesafe Butonları
    distChips.forEach(chip => {
        chip.addEventListener('click', async (e) => {
            e.stopPropagation();
            const sc = chip.getAttribute('data-sc');
            const dist = chip.getAttribute('data-dist');
            try {
                // 1. Senaryoyu ayarla
                await fetch(`/api/scenario/${sc}`, { method: 'POST' });
                // 2. Mesafeyi ayarla
                await fetch(`/api/set_distance/${dist}`, { method: 'POST' });

                // UI aktif durumlarını güncelle
                scenarioBoxes.forEach(b => {
                    if (b.getAttribute('data-id') === sc) b.classList.add('active');
                    else b.classList.remove('active');
                });
                distChips.forEach(c => {
                    if (c.getAttribute('data-sc') === sc && c.getAttribute('data-dist') === dist) {
                        c.classList.add('active');
                    } else if (c.getAttribute('data-sc') === sc) {
                        c.classList.remove('active');
                    }
                });
                masterDistBtns.forEach(mb => {
                    if (mb.getAttribute('data-dist') === dist) mb.classList.add('active');
                    else mb.classList.remove('active');
                });
            } catch (err) {
                console.error("Mesafe/Senaryo ayarlanamadı", err);
            }
        });
    });

    // Araç Çubuğundaki Ana Mesafe Butonları (5m, 10m, 15m, 20m)
    masterDistBtns.forEach(mb => {
        mb.addEventListener('click', async () => {
            const dist = mb.getAttribute('data-dist');
            try {
                await fetch(`/api/set_distance/${dist}`, { method: 'POST' });
                masterDistBtns.forEach(b => b.classList.remove('active'));
                mb.classList.add('active');
            } catch (err) {
                console.error("Ana mesafe ayarlanamadı", err);
            }
        });
    });

    // =========================================================================
    // POLİGON & SENARYO MERMİ VE SÜRE SİSTEMİ
    // =========================================================================
    let simAmmoLimit = 'unlimited';
    let simAmmoRemaining = Infinity;
    let simTimerLimit = 0;
    let simTimerRemaining = 0;
    let simTimerRunning = false;
    let simTimerInterval = null;
    let isSimRoundFinished = false;

    const simLiveAmmoBadge = document.getElementById('simLiveAmmoBadge');
    const simLiveTimerBadge = document.getElementById('simLiveTimerBadge');
    const inputSimCustomAmmo = document.getElementById('inputSimCustomAmmo');
    const btnApplySimCustomAmmo = document.getElementById('btnApplySimCustomAmmo');
    const inputSimCustomTimer = document.getElementById('inputSimCustomTimer');
    const btnApplySimCustomTimer = document.getElementById('btnApplySimCustomTimer');

    function updateSimAmmoTimerUI() {
        if (simLiveAmmoBadge) {
            if (simAmmoLimit === 'unlimited' || simAmmoRemaining === Infinity) {
                simLiveAmmoBadge.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Kalan: ∞';
                simLiveAmmoBadge.style.color = '#f1f5f9';
            } else {
                simLiveAmmoBadge.innerHTML = `<i class="fa-solid fa-shield-halved"></i> Kalan: ${Math.max(0, simAmmoRemaining)}`;
                simLiveAmmoBadge.style.color = simAmmoRemaining <= 2 ? '#dc2626' : '#f1f5f9';
            }
        }
        if (simLiveTimerBadge) {
            if (simTimerLimit === 0) {
                simLiveTimerBadge.innerHTML = '<i class="fa-solid fa-clock"></i> Süre: Serbest';
                simLiveTimerBadge.style.color = '#f1f5f9';
            } else {
                simLiveTimerBadge.innerHTML = `<i class="fa-solid fa-clock"></i> Kalan: ${Math.max(0, simTimerRemaining).toFixed(1)}s`;
                simLiveTimerBadge.style.color = simTimerRemaining <= 5 ? '#dc2626' : '#d97706';
            }
        }
    }

    function resetSimRound() {
        if (simTimerInterval) {
            clearInterval(simTimerInterval);
            simTimerInterval = null;
        }
        simTimerRunning = false;
        isSimRoundFinished = false;
        simTimerRemaining = simTimerLimit;
        simAmmoRemaining = (simAmmoLimit === 'unlimited') ? Infinity : parseInt(simAmmoLimit);
        updateSimAmmoTimerUI();
    }

    // Poligon Mermi Seçimi
    document.querySelectorAll('.btn-sim-ammo').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-sim-ammo').forEach(b => b.classList.remove('active'));
            if (btnApplySimCustomAmmo) btnApplySimCustomAmmo.classList.remove('active');
            btn.classList.add('active');
            const ammo = btn.getAttribute('data-ammo');
            simAmmoLimit = (ammo === 'unlimited') ? 'unlimited' : parseInt(ammo);
            simAmmoRemaining = (ammo === 'unlimited') ? Infinity : parseInt(ammo);
            updateSimAmmoTimerUI();
        });
    });

    function applySimCustomAmmo() {
        if (!inputSimCustomAmmo) return;
        const val = parseInt(inputSimCustomAmmo.value);
        if (isNaN(val) || val <= 0) return;
        document.querySelectorAll('.btn-sim-ammo').forEach(b => b.classList.remove('active'));
        if (btnApplySimCustomAmmo) btnApplySimCustomAmmo.classList.add('active');
        simAmmoLimit = val;
        simAmmoRemaining = val;
        updateSimAmmoTimerUI();
    }
    if (btnApplySimCustomAmmo) btnApplySimCustomAmmo.addEventListener('click', applySimCustomAmmo);
    if (inputSimCustomAmmo) {
        inputSimCustomAmmo.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); applySimCustomAmmo(); }
        });
    }

    // Poligon Süre Seçimi
    document.querySelectorAll('.btn-sim-timer').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-sim-timer').forEach(b => b.classList.remove('active'));
            if (btnApplySimCustomTimer) btnApplySimCustomTimer.classList.remove('active');
            btn.classList.add('active');
            const t = parseInt(btn.getAttribute('data-time')) || 0;
            simTimerLimit = t;
            simTimerRemaining = t;
            resetSimRound();
        });
    });

    function applySimCustomTimer() {
        if (!inputSimCustomTimer) return;
        const val = parseInt(inputSimCustomTimer.value);
        if (isNaN(val) || val <= 0) return;
        document.querySelectorAll('.btn-sim-timer').forEach(b => b.classList.remove('active'));
        if (btnApplySimCustomTimer) btnApplySimCustomTimer.classList.add('active');
        simTimerLimit = val;
        simTimerRemaining = val;
        resetSimRound();
    }
    if (btnApplySimCustomTimer) btnApplySimCustomTimer.addEventListener('click', applySimCustomTimer);
    if (inputSimCustomTimer) {
        inputSimCustomTimer.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); applySimCustomTimer(); }
        });
    }

    if (btnShoot) {
        btnShoot.addEventListener('click', async () => {
            if (isSimRoundFinished || simAmmoRemaining <= 0) {
                tacticalAudio.playEmpty();
                const alertElem = document.getElementById('hudCenterAlert');
                if (alertElem) {
                    alertElem.textContent = 'MERMİ TÜKENDİ! [R] İLE SIFIRLAYIN';
                    alertElem.style.display = 'block';
                    setTimeout(() => { alertElem.style.display = 'none'; }, 1800);
                }
                return;
            }

            // Süre Sayacını İlk Atışta Başlat
            if (simTimerLimit > 0 && !simTimerRunning && !isSimRoundFinished) {
                simTimerRunning = true;
                simTimerRemaining = simTimerLimit;
                simTimerInterval = setInterval(() => {
                    simTimerRemaining -= 0.1;
                    if (simTimerRemaining <= 0) {
                        simTimerRemaining = 0;
                        clearInterval(simTimerInterval);
                        simTimerInterval = null;
                        simTimerRunning = false;
                        isSimRoundFinished = true;
                        tacticalAudio.playBuzzer();
                        const alertElem = document.getElementById('hudCenterAlert');
                        if (alertElem) {
                            alertElem.textContent = 'SÜRE TAMAMLANDI! ATIŞ SONA ERDİ';
                            alertElem.style.display = 'block';
                            setTimeout(() => { alertElem.style.display = 'none'; }, 2500);
                        }
                    }
                    updateSimAmmoTimerUI();
                }, 100);
            }

            if (simAmmoLimit !== 'unlimited' && simAmmoRemaining > 0) {
                simAmmoRemaining--;
                if (simAmmoRemaining === 0) {
                    isSimRoundFinished = true;
                }
            }
            updateSimAmmoTimerUI();

            tacticalAudio.playShot();
            await fetch('/api/shoot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ x: currentMouseX, y: currentMouseY, weapon: tacticalAudio.currentWeapon })
            });
        });
    }

    if (btnReset) {
        btnReset.addEventListener('click', async () => {
            resetSimRound();
            await fetch('/api/reset', { method: 'POST' });
        });
    }

    if (btnCycleDistance) {
        btnCycleDistance.addEventListener('click', async () => {
            await fetch('/api/cycle_distance', { method: 'POST' });
        });
    }

    if (btnTestSound) {
        btnTestSound.addEventListener('click', async () => {
            tacticalAudio.init();
            tacticalAudio.playShot();
            try {
                await fetch('/api/test_sound', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ weapon: tacticalAudio.currentWeapon })
                });
            } catch (e) {}
        });
    }

    // Hızlı Silah Değiştirici (Ana Ekran Araç Çubuğu)
    if (quickSelectWeapon) {
        quickSelectWeapon.addEventListener('change', async () => {
            const weapon = quickSelectWeapon.value;
            tacticalAudio.setWeapon(weapon);
            if (selectWeaponType) selectWeaponType.value = weapon;
            // Yeni seçilen silahın kendine has sesini anında kullanıcıya dinlet
            tacticalAudio.playShot(weapon);
            try {
                await fetch('/api/settings/weapon', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ weapon })
                });
                await loadSettings();
            } catch (err) {
                console.error(err);
            }
        });
    }

    if (btnFullscreen && videoContainer) {
        btnFullscreen.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                videoContainer.requestFullscreen().catch(err => alert(err.message));
            } else {
                document.exitFullscreen();
            }
        });
    }

    // =============================================================
    // 2. SEKME: RESMİ HEDEFLER (5 HEDEF KAĞIDI & GRUPMAN)
    // =============================================================
    const paperCanvas = document.getElementById('paperCanvas');
    const paperCtx = paperCanvas ? paperCanvas.getContext('2d') : null;
    const targetPaperHanger = document.getElementById('targetPaperHanger');
    const currentPaperName = document.getElementById('currentPaperName');
    const paperHudAlert = document.getElementById('paperHudAlert');

    const paperStatScore = document.getElementById('paperStatScore');
    const paperStatShots = document.getElementById('paperStatShots');
    const paperStatAccuracy = document.getElementById('paperStatAccuracy');
    const paperStatPenalties = document.getElementById('paperStatPenalties');

    const paperGroupingVal = document.getElementById('paperGroupingVal');
    const paperGroupingMoa = document.getElementById('paperGroupingMoa');
    const paperCenterImpact = document.getElementById('paperCenterImpact');
    const paperGroupingEval = document.getElementById('paperGroupingEval');

    const paperTargetInfoTitle = document.getElementById('paperTargetInfoTitle');
    const paperTargetInfoDesc = document.getElementById('paperTargetInfoDesc');
    const paperLogsBody = document.getElementById('paperLogsBody');

    const btnShootPaper = document.getElementById('btnShootPaper');
    const btnResetPaper = document.getElementById('btnResetPaper');
    const btnToggleGrouping = document.getElementById('btnToggleGrouping');
    const btnToggleIronSight = document.getElementById('btnToggleIronSight');
    const paperWeaponSelect = document.getElementById('paperWeaponSelect');
    const paperCards = document.querySelectorAll('.paper-card');
    const distBtns = document.querySelectorAll('.btn-dist');
    const speedBtns = document.querySelectorAll('.btn-speed');

    // Sabit Hedefler için Hareketli Mod (Mover Modu) Kontrolleri
    const btnTargetStatic = document.getElementById('btnTargetStatic');
    const btnTargetMoving = document.getElementById('btnTargetMoving');
    const fpsMotionToggleBtn = document.getElementById('fpsMotionToggleBtn');
    const fpsMotionBtnText = document.getElementById('fpsMotionBtnText');
    const paperLaneContainer = document.getElementById('paperLaneContainer');
    let isPaperMovingTarget = false;
    let paperMovingOffset = 0;
    let paperMovingTime = 0;
    let paperMovingAnimFrame = null;
    let paperSpeedMultiplier = 1.0;

    // KULLANICI ÖZELLEŞTİRME: MERMİ SAYISI & ZAMAN / SÜRE YÖNETİMİ
    let paperAmmoLimit = 'unlimited'; // 'unlimited' or number (5, 10, 15, 20, 30)
    let paperAmmoRemaining = Infinity;
    let paperTimerLimit = 0; // 0 for unlimited, or seconds (30, 60, 120)
    let paperTimerRemaining = 0;
    let paperTimerInterval = null;
    let paperTimerRunning = false;
    let isPaperRoundFinished = false;

    function updatePaperAmmoTimerUI() {
        const ammoBadge = document.getElementById('paperLiveAmmoBadge');
        if (ammoBadge) {
            if (paperAmmoLimit === 'unlimited') {
                ammoBadge.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Kalan: ∞';
                ammoBadge.style.color = '#00f076';
            } else {
                ammoBadge.innerHTML = `<i class="fa-solid fa-shield-halved"></i> Kalan: ${paperAmmoRemaining} / ${paperAmmoLimit}`;
                ammoBadge.style.color = paperAmmoRemaining <= 2 ? '#ff3366' : '#00f076';
            }
        }

        const timerBadge = document.getElementById('paperLiveTimerBadge');
        if (timerBadge) {
            if (paperTimerLimit === 0) {
                timerBadge.innerHTML = '<i class="fa-solid fa-clock"></i> Süre: Serbest';
                timerBadge.style.color = '#00e5ff';
            } else {
                timerBadge.innerHTML = `<i class="fa-solid fa-clock"></i> Kalan: ${paperTimerRemaining.toFixed(1)}s`;
                timerBadge.style.color = paperTimerRemaining <= 5 ? '#ff3366' : '#00e5ff';
            }
        }
    }

    function resetPaperRoundLocal() {
        if (paperTimerInterval) {
            clearInterval(paperTimerInterval);
            paperTimerInterval = null;
        }
        paperTimerRunning = false;
        isPaperRoundFinished = false;
        paperTimerRemaining = paperTimerLimit;
        paperAmmoRemaining = (paperAmmoLimit === 'unlimited') ? Infinity : parseInt(paperAmmoLimit);
        updatePaperAmmoTimerUI();
    }

    // Özel Mermi & Süre Girişi (Kağıt Hedef)
    const inputPaperCustomAmmo = document.getElementById('inputPaperCustomAmmo');
    const btnApplyPaperCustomAmmo = document.getElementById('btnApplyPaperCustomAmmo');
    function applyPaperCustomAmmo() {
        if (!inputPaperCustomAmmo) return;
        const val = parseInt(inputPaperCustomAmmo.value);
        if (isNaN(val) || val <= 0) return;
        document.querySelectorAll('.btn-paper-ammo').forEach(b => b.classList.remove('active'));
        if (btnApplyPaperCustomAmmo) btnApplyPaperCustomAmmo.classList.add('active');
        paperAmmoLimit = val;
        paperAmmoRemaining = val;
        updatePaperAmmoTimerUI();
    }
    if (btnApplyPaperCustomAmmo) btnApplyPaperCustomAmmo.addEventListener('click', applyPaperCustomAmmo);
    if (inputPaperCustomAmmo) {
        inputPaperCustomAmmo.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); applyPaperCustomAmmo(); }
        });
    }

    const inputPaperCustomTimer = document.getElementById('inputPaperCustomTimer');
    const btnApplyPaperCustomTimer = document.getElementById('btnApplyPaperCustomTimer');
    function applyPaperCustomTimer() {
        if (!inputPaperCustomTimer) return;
        const val = parseInt(inputPaperCustomTimer.value);
        if (isNaN(val) || val <= 0) return;
        document.querySelectorAll('.btn-paper-timer').forEach(b => b.classList.remove('active'));
        if (btnApplyPaperCustomTimer) btnApplyPaperCustomTimer.classList.add('active');
        paperTimerLimit = val;
        paperTimerRemaining = val;
        if (paperTimerInterval) {
            clearInterval(paperTimerInterval);
            paperTimerInterval = null;
        }
        paperTimerRunning = false;
        isPaperRoundFinished = false;
        updatePaperAmmoTimerUI();
    }
    if (btnApplyPaperCustomTimer) btnApplyPaperCustomTimer.addEventListener('click', applyPaperCustomTimer);
    if (inputPaperCustomTimer) {
        inputPaperCustomTimer.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); applyPaperCustomTimer(); }
        });
    }

    // Mermi Seçim Butonları
    document.querySelectorAll('.btn-paper-ammo').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-paper-ammo').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const ammo = btn.getAttribute('data-ammo');
            paperAmmoLimit = (ammo === 'unlimited') ? 'unlimited' : parseInt(ammo);
            paperAmmoRemaining = (ammo === 'unlimited') ? Infinity : parseInt(ammo);
            updatePaperAmmoTimerUI();
        });
    });

    // Süre Seçim Butonları
    document.querySelectorAll('.btn-paper-timer').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.btn-paper-timer').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const t = parseInt(btn.getAttribute('data-time')) || 0;
            paperTimerLimit = t;
            paperTimerRemaining = t;
            if (paperTimerInterval) {
                clearInterval(paperTimerInterval);
                paperTimerInterval = null;
            }
            paperTimerRunning = false;
            isPaperRoundFinished = false;
            updatePaperAmmoTimerUI();
        });
    });

    // GİRDİ MODU GEÇİŞİ: 1. FARE, 2. LAZER, 3. EL TAKİBİ
    let inputMode = 'MOUSE'; // 'MOUSE', 'LASER', 'HAND'

    function updateLaserSettingsUI(mode) {
        const isLaser = (mode === 'LASER');
        document.querySelectorAll('.laser-only-setting').forEach(item => {
            item.classList.toggle('setting-disabled', !isLaser);
            item.querySelectorAll('button, input').forEach(el => {
                el.disabled = !isLaser;
            });
        });
        const offTag = document.getElementById('laserColorOffTag');
        if (offTag) {
            offTag.style.display = isLaser ? 'none' : 'inline';
        }
    }

    async function setInputMode(mode) {
        inputMode = (mode || 'MOUSE').toUpperCase();
        document.querySelectorAll('.btn-input-mode').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-mode') === inputMode);
        });
        document.querySelectorAll('#settingsInputModeGroup .btn-segment').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-mode') === inputMode);
        });
        document.querySelectorAll('.btn-paper-input-mode').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-mode') === inputMode);
        });
        updateLaserSettingsUI(inputMode);

        const camBadge = document.getElementById('camInfoBadge');
        if (camBadge) {
            if (inputMode === 'LASER') {
                camBadge.innerHTML = '<i class="fa-solid fa-bullseye" style="color:#ff3366;"></i> 🔴 DONANIM LAZER MODU';
                camBadge.style.color = '#ff3366';
            } else if (inputMode === 'HAND') {
                camBadge.innerHTML = '<i class="fa-solid fa-hand"></i> WEBCAM (EL TAKİBİ)';
                camBadge.style.color = '#00ffcc';
            } else {
                camBadge.innerHTML = '<i class="fa-solid fa-mouse"></i> FARE & MANUEL NİŞAN';
                camBadge.style.color = '';
            }
        }

        const triggerTipText = document.getElementById('triggerTipText');
        if (triggerTipText) {
            if (inputMode === 'LASER') {
                triggerTipText.innerHTML = '<i class="fa-solid fa-bullseye" style="color:#ff3366;"></i> Kırmızı lazeri ekrandaki hedefe tutun = ANINDA ATEŞ!';
            } else if (inputMode === 'HAND') {
                triggerTipText.innerHTML = '<i class="fa-solid fa-circle-info"></i> Baş parmağını işaret parmağına dokundur = ATEŞ! (Veya Boşluk tuşuna bas)';
            } else {
                triggerTipText.innerHTML = '<i class="fa-solid fa-mouse"></i> Hedefe farenizle tıklayın veya [SPACE] boşluk tuşuna basın.';
            }
        }

        const desc = document.getElementById('paperInputStatusDesc');
        if (desc) {
            if (inputMode === 'LASER') {
                desc.textContent = '🔴 Lazer Modu Aktif: Kırmızı lazer noktasını hedefe tutun = ANINDA VURUŞ!';
            } else if (inputMode === 'HAND') {
                desc.textContent = '✋ El Takibi Aktif: İşaret parmağınızla nişan alın, baş parmağınızla ateş edin!';
            } else {
                desc.textContent = '🖱️ Fare Modu Aktif: Hedefe tıklayın veya [SPACE] tuşuna basın.';
            }
        }

        try {
            await fetch('/api/input_mode', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mode: inputMode })
            });
        } catch (e) {
            console.error("Girdi modu ayarlanamadı", e);
        }
    }

    document.querySelectorAll('.btn-input-mode, .btn-paper-input-mode, #settingsInputModeGroup .btn-segment').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const mode = btn.getAttribute('data-mode');
            if (mode) setInputMode(mode);
        });
    });

    let currentPaperState = null;
    const targetImagesCache = {};
    function getLoadedTargetImage(filename) {
        const file = filename || 'target_1_inverted.png';
        if (!targetImagesCache[file]) {
            const img = new Image();
            img.onload = () => {
                renderPaperCanvas();
            };
            img.src = `/static/targets/${file}`;
            targetImagesCache[file] = img;
        }
        return targetImagesCache[file];
    }
    // Tüm resmi hedef kağıtlarını hafızaya önceden yükle
    ['target_1_inverted.png', 'target_2_bullseye.png', 'target_3_olympic.png', 'target_4_silhouette.png', 'target_5_hostage.png'].forEach(f => getLoadedTargetImage(f));
    fetchPaperState();

    let showGroupingCircle = true;
    let lastHandShotTime = 0;

    // Gez - Göz - Arpacık (Iron Sights) Durum Değişkenleri
    let ironSightsEnabled = true;
    let paperAimX = 256;
    let paperAimY = 256;
    let isPaperAiming = false;
    let recoilY = 0;
    let muzzleFlashAlpha = 0;
    let ironSightAnimFrame = null;
    let breathTime = 0;

    function getPaperScale(dist) {
        const d = dist || (currentPaperState ? currentPaperState.distance : 10);
        const scaleMap = { 5: 1.15, 10: 1.0, 15: 0.88, 20: 0.76, 25: 0.68 };
        return scaleMap[d] || 1.0;
    }

    function setPaperMotionMode(isMoving) {
        isPaperMovingTarget = isMoving;
        if (btnTargetStatic) btnTargetStatic.classList.toggle('active', !isMoving);
        if (btnTargetMoving) btnTargetMoving.classList.toggle('active', isMoving);
        if (fpsMotionToggleBtn) fpsMotionToggleBtn.classList.toggle('active', isMoving);
        if (fpsMotionBtnText) fpsMotionBtnText.textContent = isMoving ? 'Hedef: Hareketli' : 'Hedef: Sabit';

        if (!isMoving) {
            paperMovingOffset = 0;
            if (paperMovingAnimFrame) {
                cancelAnimationFrame(paperMovingAnimFrame);
                paperMovingAnimFrame = null;
            }
            if (targetPaperHanger) {
                const s = getPaperScale();
                targetPaperHanger.style.transform = `scale(${s})`;
            }
            renderPaperCanvas();
        } else {
            startPaperMovingLoop();
        }
    }

    if (btnTargetStatic) {
        btnTargetStatic.addEventListener('click', async () => {
            setPaperMotionMode(false);
            try {
                await fetch('/api/paper/motion/0', { method: 'POST' });
            } catch (e) {}
        });
    }
    if (btnTargetMoving) {
        btnTargetMoving.addEventListener('click', async () => {
            setPaperMotionMode(true);
            try {
                await fetch('/api/paper/motion/1', { method: 'POST' });
            } catch (e) {}
        });
    }
    if (fpsMotionToggleBtn) {
        fpsMotionToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const newMotion = !isPaperMovingTarget;
            setPaperMotionMode(newMotion);
            fetch('/api/paper/motion/' + (newMotion ? 1 : 0), { method: 'POST' }).catch(() => {});
        });
    }

    // Hız Butonları (0.5x, 1x, 1.5x, 2x)
    speedBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const spd = parseFloat(btn.getAttribute('data-speed')) || 1.0;
            paperSpeedMultiplier = spd;
            speedBtns.forEach(b => {
                const bSpd = parseFloat(b.getAttribute('data-speed')) || 1.0;
                b.classList.toggle('active', Math.abs(bSpd - spd) < 0.1);
            });
            try {
                await fetch(`/api/paper/speed/${spd}`, { method: 'POST' });
            } catch (e) {}
        });
    });

    function startPaperMovingLoop() {
        if (paperMovingAnimFrame) cancelAnimationFrame(paperMovingAnimFrame);
        function moveLoop() {
            if (!isPaperMovingTarget || activeTab !== 'paper') {
                paperMovingAnimFrame = null;
                return;
            }

            // Kullanıcının ayarladığı hız katsayısıyla pürüzsüz sağa sola hareket
            paperMovingTime += 0.007 * paperSpeedMultiplier;

            // Ekranın/Kulvarın tamamını en solundan en sağına tam genişlikte kat etme
            let maxTravel = 260;
            if (paperLaneContainer && paperLaneContainer.clientWidth > 400) {
                const containerW = paperLaneContainer.clientWidth;
                const hangerW = targetPaperHanger ? targetPaperHanger.offsetWidth : 360;
                maxTravel = Math.max(150, Math.floor((containerW - hangerW - 20) / 2));
            }

            paperMovingOffset = Math.sin(paperMovingTime) * maxTravel;

            if (targetPaperHanger && !isFpsModeActive) {
                const s = getPaperScale();
                targetPaperHanger.style.transform = `translateX(${paperMovingOffset.toFixed(1)}px) scale(${s})`;
            }
            paperMovingAnimFrame = requestAnimationFrame(moveLoop);
        }
        paperMovingAnimFrame = requestAnimationFrame(moveLoop);
    }

    async function fetchPaperState() {
        try {
            const res = await fetch('/api/paper/state');
            if (!res.ok) return;
            const state = await res.json();
            currentPaperState = state;
            updatePaperUI(state);
        } catch (err) {
            console.error(err);
        }
    }

    function updatePaperUI(state) {
        if (!state) return;

        if (currentPaperName) currentPaperName.textContent = state.target_name;
        if (paperTargetInfoTitle) paperTargetInfoTitle.textContent = state.target_name;
        if (paperTargetInfoDesc) paperTargetInfoDesc.textContent = state.target_desc;

        if (paperStatScore) paperStatScore.textContent = (state.total_score !== undefined) ? state.total_score : 0;
        if (paperStatShots) paperStatShots.textContent = (state.total_shots !== undefined) ? state.total_shots : 0;
        if (paperStatAccuracy) paperStatAccuracy.textContent = `%${(state.accuracy !== undefined) ? state.accuracy : 0}`;
        if (paperStatPenalties) paperStatPenalties.textContent = (state.penalties !== undefined) ? state.penalties : 0;

        const gcm = (typeof state.grouping_cm === 'number') ? state.grouping_cm : 0;
        const gmoa = (typeof state.grouping_moa === 'number') ? state.grouping_moa : 0;
        const cx = (typeof state.center_x === 'number') ? state.center_x : 256;
        const cy = (typeof state.center_y === 'number') ? state.center_y : 256;
        const totalShots = (typeof state.total_shots === 'number') ? state.total_shots : 0;

        if (paperGroupingVal) paperGroupingVal.textContent = `${gcm.toFixed(2)} cm`;
        if (paperGroupingMoa) paperGroupingMoa.textContent = `${gmoa.toFixed(2)} MOA`;
        if (paperCenterImpact) paperCenterImpact.textContent = `X: ${Math.round(cx)}, Y: ${Math.round(cy)}`;

        if (state.speed) {
            paperSpeedMultiplier = state.speed;
            speedBtns.forEach(b => {
                const bSpd = parseFloat(b.getAttribute('data-speed')) || 1.0;
                b.classList.toggle('active', Math.abs(bSpd - state.speed) < 0.1);
            });
        }

        if (state.is_moving !== undefined) {
            if (state.is_moving && !isPaperMovingTarget) {
                setPaperMotionMode(true);
            } else if (!state.is_moving && isPaperMovingTarget) {
                setPaperMotionMode(false);
            }
        }

        if (paperGroupingEval) {
            if (totalShots < 2) {
                paperGroupingEval.textContent = "Grupman hesaplanabilmesi için en az 2 atış yapın.";
                paperGroupingEval.style.color = "var(--text-muted)";
            } else if (gcm < 3.5) {
                paperGroupingEval.textContent = "★ MÜKEMMEL GRUPMAN! (Keskin Nişancı Seviyesi)";
                paperGroupingEval.style.color = "var(--success)";
            } else if (gcm < 7.0) {
                paperGroupingEval.textContent = "✔ BAŞARILI GRUPMAN (Taktik Standart)";
                paperGroupingEval.style.color = "var(--primary)";
            } else if (gcm < 12.0) {
                paperGroupingEval.textContent = "▲ ORTA DAĞILIM (Tetik kontrolünü ve nefesi sabitleyin)";
                paperGroupingEval.style.color = "var(--secondary)";
            } else {
                paperGroupingEval.textContent = "● GENİŞ DAĞILIM (Hedefe odaklanın ve tetiği yavaşça ezin)";
                paperGroupingEval.style.color = "var(--danger)";
            }
        }

        const currentCards = document.querySelectorAll('.paper-card');
        currentCards.forEach(c => {
            const tid = parseInt(c.getAttribute('data-tid'));
            if (tid === state.target_id) c.classList.add('active');
            else c.classList.remove('active');
        });

        const currentDistBtns = document.querySelectorAll('.btn-dist');
        currentDistBtns.forEach(b => {
            const d = parseInt(b.getAttribute('data-dist'));
            if (d === state.distance) b.classList.add('active');
            else b.classList.remove('active');
        });

        if (targetPaperHanger && !isPaperMovingTarget && !isFpsModeActive) {
            const s = getPaperScale(state.distance);
            targetPaperHanger.style.transform = `scale(${s})`;
        }

        if (paperLogsBody) {
            if (!state.holes || state.holes.length === 0) {
                paperLogsBody.innerHTML = `<tr><td colspan="5" class="empty-state">Hedefe henüz atış yapılmadı.</td></tr>`;
            } else {
                const revHoles = [...state.holes].reverse();
                paperLogsBody.innerHTML = revHoles.map(h => {
                    let badgeClass = 'hit';
                    if (h.is_penalty) badgeClass = 'penalty';
                    else if (h.puan === 0) badgeClass = 'miss';

                    return `
                        <tr>
                            <td>#${h.id}</td>
                            <td>${h.zaman}</td>
                            <td><span class="badge-score ${badgeClass}">${h.puan > 0 ? '+' : ''}${h.puan}</span></td>
                            <td><strong>${h.bolge}</strong></td>
                            <td>${h.yontem}</td>
                        </tr>
                    `;
                }).join('');
            }
        }

        if (state.target_file) {
            getLoadedTargetImage(state.target_file);
        }
        renderPaperCanvas();
    }

    // =========================================================================
    // GEZ - GÖZ - ARPACIK (IRON SIGHTS) NİŞANGAH SİSTEMİ
    // =========================================================================
    function drawIronSights(ctx, weapon, cx, cy, recoilOffset, muzzleAlpha) {
        const sy = cy + recoilOffset;

        ctx.save();

        // 1. Namlu Alevi & Duman Patlaması (Recoil Muzzle Flash)
        if (muzzleAlpha > 0.04) {
            ctx.save();
            const flashGrad = ctx.createRadialGradient(cx, sy + 2, 4, cx, sy + 2, 40);
            flashGrad.addColorStop(0, `rgba(255, 240, 150, ${muzzleAlpha * 0.95})`);
            flashGrad.addColorStop(0.35, `rgba(255, 135, 35, ${muzzleAlpha * 0.70})`);
            flashGrad.addColorStop(1, 'rgba(255, 60, 0, 0)');
            ctx.fillStyle = flashGrad;
            ctx.beginPath();
            ctx.arc(cx, sy + 2, 40, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        if (weapon === 'Glock19') {
            // --- GLOCK 19 (U-Gez & Beyaz Kare Arpacık) ---
            // Sürgü Gövdesi (Polymer/Steel Slide Top)
            ctx.fillStyle = '#16181d';
            ctx.fillRect(cx - 68, sy + 18, 136, 44);
            ctx.strokeStyle = '#2d3340';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(cx - 68, sy + 18, 136, 44);

            // Gez Gövdesi (Rear Sight Notch Body)
            ctx.fillStyle = '#1e2129';
            ctx.fillRect(cx - 44, sy, 30, 24);
            ctx.fillRect(cx + 14, sy, 30, 24);
            ctx.fillRect(cx - 44, sy + 14, 88, 10);

            // Glock Beyaz U-Çerçevesi (Gez Çentiği)
            ctx.strokeStyle = '#f8f9fa';
            ctx.lineWidth = 2.5;
            ctx.lineJoin = 'miter';
            ctx.beginPath();
            ctx.moveTo(cx - 14, sy);
            ctx.lineTo(cx - 14, sy + 14);
            ctx.lineTo(cx + 14, sy + 14);
            ctx.lineTo(cx + 14, sy);
            ctx.stroke();

            // Arpacık (Front Sight Post)
            ctx.fillStyle = '#111317';
            ctx.fillRect(cx - 6, sy + 1, 12, 20);
            ctx.strokeStyle = '#2d3340';
            ctx.lineWidth = 1;
            ctx.strokeRect(cx - 6, sy + 1, 12, 20);

            // Arpacık Beyaz Noktası (Nişan Referansı)
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(cx, sy + 7, 3.6, 0, Math.PI * 2);
            ctx.fill();

            // Hassas Nişangah Ucu (Kırmızı Merkez Noktası)
            ctx.fillStyle = '#ff2244';
            ctx.beginPath();
            ctx.arc(cx, sy + 1, 1.6, 0, Math.PI * 2);
            ctx.fill();

        } else if (weapon === 'CanikTP9') {
            // --- CANIK TP9 SFx (Yeşil Trityum Gez & Kırmızı Fiber-Optik Arpacık) ---
            ctx.fillStyle = '#13151a';
            ctx.fillRect(cx - 68, sy + 18, 136, 44);
            ctx.strokeStyle = '#353c4b';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(cx - 68, sy + 18, 136, 44);

            // Taktik Çentikli Gez
            ctx.fillStyle = '#1a1d24';
            ctx.fillRect(cx - 46, sy, 32, 24);
            ctx.fillRect(cx + 14, sy, 32, 24);
            ctx.fillRect(cx - 46, sy + 14, 92, 10);

            // 2 Yeşil Trityum Arka Noktası
            const drawGlow = (dx, dy, col, glow) => {
                ctx.save();
                ctx.shadowColor = glow;
                ctx.shadowBlur = 6;
                ctx.fillStyle = col;
                ctx.beginPath();
                ctx.arc(dx, dy, 3.6, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            };
            drawGlow(cx - 28, sy + 7, '#00ff66', 'rgba(0, 255, 102, 0.9)');
            drawGlow(cx + 28, sy + 7, '#00ff66', 'rgba(0, 255, 102, 0.9)');

            // Arpacık (Front Post)
            ctx.fillStyle = '#101216';
            ctx.fillRect(cx - 6, sy + 1, 12, 20);

            // Kırmızı Fiber-Optik Ön Boncuk
            drawGlow(cx, sy + 7, '#ff2244', 'rgba(255, 34, 68, 0.9)');
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(cx, sy + 7, 1.4, 0, Math.PI * 2);
            ctx.fill();

            // Nişan Merkezi (Mavi-Yeşil Lazer Kılavuz)
            ctx.fillStyle = '#00ffff';
            ctx.beginPath();
            ctx.arc(cx, sy + 1, 1.6, 0, Math.PI * 2);
            ctx.fill();

        } else if (weapon === 'SAR9') {
            // --- SARSILMAZ SAR9 (3 Beyaz Noktalı Muharebe Gezi) ---
            ctx.fillStyle = '#14161a';
            ctx.fillRect(cx - 68, sy + 18, 136, 44);
            ctx.strokeStyle = '#2e3442';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(cx - 68, sy + 18, 136, 44);

            // Çelik Gez
            ctx.fillStyle = '#1c1f27';
            ctx.fillRect(cx - 44, sy, 30, 24);
            ctx.fillRect(cx + 14, sy, 30, 24);
            ctx.fillRect(cx - 44, sy + 14, 88, 10);

            // 3 Nokta Beyaz Muharebe Nişangahı
            ctx.fillStyle = '#f0f3f8';
            ctx.beginPath();
            ctx.arc(cx - 26, sy + 7, 3.5, 0, Math.PI * 2);
            ctx.arc(cx + 26, sy + 7, 3.5, 0, Math.PI * 2);
            ctx.fill();

            // Arpacık
            ctx.fillStyle = '#101216';
            ctx.fillRect(cx - 6, sy + 1, 12, 20);
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(cx, sy + 7, 3.5, 0, Math.PI * 2);
            ctx.fill();

            // Nişan Noktası
            ctx.fillStyle = '#ffb703';
            ctx.beginPath();
            ctx.arc(cx, sy + 1, 1.6, 0, Math.PI * 2);
            ctx.fill();

        } else if (weapon === 'M4A1') {
            // --- M4A1 CARABINE (Diopter Halka Gez & A2 Kanatlı Arpacık) ---
            // Arka Diopter Halka (Peep Aperture Sight)
            ctx.save();
            ctx.lineWidth = 13;
            ctx.strokeStyle = '#181b22';
            ctx.beginPath();
            ctx.arc(cx, sy + 16, 36, 0, Math.PI * 2);
            ctx.stroke();

            ctx.lineWidth = 2;
            ctx.strokeStyle = '#3e4554';
            ctx.beginPath();
            ctx.arc(cx, sy + 16, 42.5, 0, Math.PI * 2);
            ctx.arc(cx, sy + 16, 29.5, 0, Math.PI * 2);
            ctx.stroke();

            // A2 Yan Kanatları (Protective Wings)
            ctx.fillStyle = '#20242d';
            ctx.beginPath();
            ctx.moveTo(cx - 18, sy + 32);
            ctx.quadraticCurveTo(cx - 25, sy + 14, cx - 12, sy + 4);
            ctx.lineTo(cx - 7, sy + 11);
            ctx.quadraticCurveTo(cx - 15, sy + 20, cx - 12, sy + 32);
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(cx + 18, sy + 32);
            ctx.quadraticCurveTo(cx + 25, sy + 14, cx + 12, sy + 4);
            ctx.lineTo(cx + 7, sy + 11);
            ctx.quadraticCurveTo(cx + 15, sy + 20, cx + 12, sy + 32);
            ctx.fill();

            // A2 Ön Arpacık Direği (Front Post)
            ctx.fillStyle = '#0f1115';
            ctx.fillRect(cx - 3.5, sy + 2, 7, 30);
            ctx.strokeStyle = '#3a4150';
            ctx.lineWidth = 1;
            ctx.strokeRect(cx - 3.5, sy + 2, 7, 30);

            // Fosforlu Arpacık Ucu (Nişangah Odak Noktası)
            ctx.save();
            ctx.shadowColor = 'rgba(0, 255, 200, 0.9)';
            ctx.shadowBlur = 6;
            ctx.fillStyle = '#00ffcc';
            ctx.beginPath();
            ctx.arc(cx, sy + 3, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            ctx.restore();
        }

        ctx.restore();
    }

    function startIronSightLoop() {
        if (ironSightAnimFrame) return;
        function loop() {
            breathTime += 0.05;
            let needsContinue = false;

            // Silah tepmesi sıfır (sekme ve kayma yok, sabit nişangah)
            recoilY = 0;

            // Namlu alevi sönümlenmesi
            if (muzzleFlashAlpha > 0.04) {
                muzzleFlashAlpha *= 0.65;
                needsContinue = true;
            } else {
                muzzleFlashAlpha = 0;
            }

            if (isPaperAiming || needsContinue) {
                renderPaperCanvas();
                ironSightAnimFrame = requestAnimationFrame(loop);
            } else {
                ironSightAnimFrame = null;
                renderPaperCanvas();
            }
        }
        ironSightAnimFrame = requestAnimationFrame(loop);
    }

    function renderPaperCanvas() {
        if (!paperCanvas || !paperCtx) return;

        const w = paperCanvas.width;
        const h = paperCanvas.height;

        paperCtx.clearRect(0, 0, w, h);

        const tid = (currentPaperState && currentPaperState.target_id) ? currentPaperState.target_id : 1;
        const targetMapFiles = {
            1: 'target_1_inverted.png',
            2: 'target_4_silhouette.png',
            3: 'target_3_olympic.png',
            4: 'target_5_hostage.png'
        };
        const targetFile = (currentPaperState && currentPaperState.target_file) ? currentPaperState.target_file : (targetMapFiles[tid] || 'target_1_inverted.png');
        const img = getLoadedTargetImage(targetFile);
        let imageDrawn = false;

        if (img && img.complete && img.naturalWidth > 0) {
            try {
                paperCtx.drawImage(img, 0, 0, w, h);
                imageDrawn = true;
            } catch (e) {}
        }

        if (!imageDrawn) {
            if (tid === 2) {
                // 2. B27 Taktik Gövde Silüeti (target_4_silhouette.png)
                paperCtx.fillStyle = '#161a22';
                paperCtx.fillRect(0, 0, w, h);
                const cx = 256, cy = 290;
                paperCtx.fillStyle = '#222938';
                paperCtx.beginPath();
                paperCtx.ellipse(cx, 310, 155, 175, 0, 0, Math.PI * 2);
                paperCtx.fill();
                paperCtx.beginPath();
                paperCtx.ellipse(cx, 100, 48, 62, 0, 0, Math.PI * 2);
                paperCtx.fill();
                const rings = [
                    { rx: 110, ry: 150 },
                    { rx: 78, ry: 108 },
                    { rx: 48, ry: 68 },
                    { rx: 22, ry: 32 }
                ];
                rings.forEach(ring => {
                    paperCtx.strokeStyle = 'rgba(255,255,255,0.7)';
                    paperCtx.lineWidth = 1.5;
                    paperCtx.beginPath();
                    paperCtx.ellipse(cx, cy, ring.rx, ring.ry, 0, 0, Math.PI * 2);
                    paperCtx.stroke();
                });
                paperCtx.fillStyle = '#ff2244';
                paperCtx.font = 'bold 16px Rajdhani, sans-serif';
                paperCtx.textAlign = 'center';
                paperCtx.fillText('X', cx, cy + 6);
            } else if (tid === 3) {
                // 3. ISSF Kırmızı Merkez Hedef (target_3_olympic.png)
                paperCtx.fillStyle = '#ffffff';
                paperCtx.fillRect(0, 0, w, h);
                const cx = w / 2, cy = h / 2;
                for (let p = 1; p <= 9; p++) {
                    const r = 22 + (10 - p) * 24;
                    paperCtx.strokeStyle = '#111317';
                    paperCtx.lineWidth = 2.0;
                    paperCtx.beginPath();
                    paperCtx.arc(cx, cy, r, 0, Math.PI * 2);
                    paperCtx.stroke();
                }
                paperCtx.fillStyle = '#ff1133';
                paperCtx.beginPath();
                paperCtx.arc(cx, cy, 22, 0, Math.PI * 2);
                paperCtx.fill();
            } else if (tid === 4) {
                // 4. Rehine Kurtarma & Terörist Hedefi (target_5_hostage.png)
                paperCtx.fillStyle = '#0f1118';
                paperCtx.fillRect(0, 0, w, h);
                const cx = 256, cy = 220;
                paperCtx.fillStyle = '#1c2230';
                paperCtx.beginPath();
                paperCtx.ellipse(cx, 260, 160, 180, 0, 0, Math.PI * 2);
                paperCtx.fill();
                paperCtx.beginPath();
                paperCtx.ellipse(260, 75, 45, 55, 0, 0, Math.PI * 2);
                paperCtx.fill();
                paperCtx.fillStyle = '#2d3748';
                paperCtx.beginPath();
                paperCtx.ellipse(290, 420, 95, 110, 0, 0, Math.PI * 2);
                paperCtx.fill();
                paperCtx.strokeStyle = '#00f076';
                paperCtx.lineWidth = 2;
                paperCtx.stroke();
            } else {
                // 1. Taktik Halka Hedef (1-9) (target_1_inverted.png)
                paperCtx.fillStyle = '#0b0e14';
                paperCtx.fillRect(0, 0, w, h);
                const cx = w / 2, cy = h / 2;
                for (let p = 1; p <= 9; p++) {
                    const r = 28 + (10 - p) * 24;
                    paperCtx.strokeStyle = p >= 7 ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.45)';
                    paperCtx.lineWidth = p >= 7 ? 2 : 1;
                    paperCtx.beginPath();
                    paperCtx.arc(cx, cy, r, 0, Math.PI * 2);
                    paperCtx.stroke();
                }
                paperCtx.fillStyle = '#ffffff';
                paperCtx.beginPath();
                paperCtx.arc(cx, cy, 28, 0, Math.PI * 2);
                paperCtx.fill();
            }
        }

        if (!currentPaperState) return;

        // Grupman Çemberi
        if (showGroupingCircle && currentPaperState.total_shots >= 2) {
            const cx = currentPaperState.center_x;
            const cy = currentPaperState.center_y;
            const radius = currentPaperState.grouping_px / 2;

            paperCtx.save();
            paperCtx.beginPath();
            paperCtx.arc(cx, cy, radius, 0, Math.PI * 2);
            paperCtx.strokeStyle = 'rgba(0, 240, 118, 0.7)';
            paperCtx.lineWidth = 2.5;
            paperCtx.setLineDash([6, 4]);
            paperCtx.stroke();

            paperCtx.setLineDash([]);
            paperCtx.strokeStyle = '#00f076';
            paperCtx.lineWidth = 2;
            paperCtx.beginPath();
            paperCtx.moveTo(cx - 10, cy);
            paperCtx.lineTo(cx + 10, cy);
            paperCtx.moveTo(cx, cy - 10);
            paperCtx.lineTo(cx, cy + 10);
            paperCtx.stroke();

            paperCtx.fillStyle = '#00f076';
            paperCtx.font = 'bold 11px Rajdhani, sans-serif';
            paperCtx.fillText(`GRUPMAN: ${currentPaperState.grouping_cm}cm`, cx - 35, cy - radius - 6);
            paperCtx.restore();
        }

        // Mermi Delikleri
        if (currentPaperState && Array.isArray(currentPaperState.holes)) {
            currentPaperState.holes.forEach(hole => {
                if (!hole) return;
                const hx = hole.x;
                const hy = hole.y;
                if (hx < 0 || hx > 512 || hy < 0 || hy > 512) return;

                paperCtx.save();
                const burnGrad = paperCtx.createRadialGradient(hx, hy, 2, hx, hy, 12);
                burnGrad.addColorStop(0, 'rgba(20, 20, 20, 0.85)');
                burnGrad.addColorStop(0.5, 'rgba(60, 60, 60, 0.4)');
                burnGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
                paperCtx.fillStyle = burnGrad;
                paperCtx.beginPath();
                paperCtx.arc(hx, hy, 12, 0, Math.PI * 2);
                paperCtx.fill();

                paperCtx.fillStyle = '#0a0d12';
                paperCtx.beginPath();
                paperCtx.arc(hx, hy, 4.5, 0, Math.PI * 2);
                paperCtx.fill();

                paperCtx.strokeStyle = hole.is_penalty ? '#ff3366' : (hole.puan >= 9 ? '#00ffcc' : '#e0e0e0');
                paperCtx.lineWidth = 1.5;
                paperCtx.stroke();

                paperCtx.fillStyle = hole.is_penalty ? '#ff3366' : '#ffffff';
                paperCtx.font = 'bold 10px Rajdhani, sans-serif';
                paperCtx.fillText(`${hole.id || ''}`, hx + 7, hy - 6);
                paperCtx.restore();
            });
        }

        // Gez-Göz-Arpacık görseli YALNIZCA MOUSE modunda ve nişan alındığında çizilir
        // El ve Lazer modlarında hedef üzerinde silah sürgüsü ASLA çizilmez, temiz taktik reticle kullanılır
        if (ironSightsEnabled && isPaperAiming && (!lastStatusData || lastStatusData.input_mode === 'MOUSE')) {
            const effectiveWeapon = tacticalAudio.currentWeapon || (paperWeaponSelect ? paperWeaponSelect.value : 'Glock19');
            drawIronSights(paperCtx, effectiveWeapon, paperAimX, paperAimY, 0, 0);
        }
    }

    // =========================================================================
    // ARENA GENELİNDE AKICI 60 FPS EL VE LAZER NİŞANGAH KATMANI
    // =========================================================================
    const paperArenaReticleCanvas = document.getElementById('paperArenaReticleCanvas');
    const paperArenaReticleCtx = paperArenaReticleCanvas ? paperArenaReticleCanvas.getContext('2d') : null;
    let paperArenaReticleAnim = null;
    let arenaCurrentReticleX = -1;
    let arenaCurrentReticleY = -1;
    let arenaTargetReticleX = -1;
    let arenaTargetReticleY = -1;
    let arenaReticleHasTarget = false;
    let paperReticleFlash = 0.0;
    let paperShockwaveRadius = 10;

    function startPaperArenaReticleLoop() {
        if (paperArenaReticleAnim) cancelAnimationFrame(paperArenaReticleAnim);

        function arenaLoop() {
            if (activeTab !== 'paper' || !paperArenaReticleCanvas || !paperArenaReticleCtx || !paperLaneContainer) {
                if (paperArenaReticleCtx && paperArenaReticleCanvas) {
                    paperArenaReticleCtx.clearRect(0, 0, paperArenaReticleCanvas.width, paperArenaReticleCanvas.height);
                }
                paperArenaReticleAnim = null;
                return;
            }

            const containerW = paperLaneContainer.clientWidth || 960;
            const containerH = paperLaneContainer.clientHeight || 500;

            if (paperArenaReticleCanvas.width !== containerW || paperArenaReticleCanvas.height !== containerH) {
                paperArenaReticleCanvas.width = containerW;
                paperArenaReticleCanvas.height = containerH;
            }

            const ctx = paperArenaReticleCtx;
            ctx.clearRect(0, 0, containerW, containerH);

            const inputMode = (lastStatusData && lastStatusData.input_mode) ? lastStatusData.input_mode : 'HAND';
            arenaReticleHasTarget = false;

            if (inputMode === 'LASER') {
                if (lastStatusData && lastStatusData.laser_dot) {
                    arenaTargetReticleX = (lastStatusData.laser_dot.x / 640.0) * containerW;
                    arenaTargetReticleY = (lastStatusData.laser_dot.y / 480.0) * containerH;
                    arenaReticleHasTarget = true;
                } else if (lastStatusData && lastStatusData.hand_x !== null && lastStatusData.hand_x !== undefined) {
                    arenaTargetReticleX = (lastStatusData.hand_x / 640.0) * containerW;
                    arenaTargetReticleY = (lastStatusData.hand_y / 480.0) * containerH;
                    arenaReticleHasTarget = true;
                }
            } else if (inputMode === 'HAND') {
                if (lastStatusData && lastStatusData.hand_detected && lastStatusData.hand_x !== null && lastStatusData.hand_x !== undefined) {
                    arenaTargetReticleX = (lastStatusData.hand_x / 640.0) * containerW;
                    arenaTargetReticleY = (lastStatusData.hand_y / 480.0) * containerH;
                    arenaReticleHasTarget = true;
                }
            } else { // MOUSE
                if (isPaperAiming && lastMouseClientX >= 0 && lastMouseClientY >= 0) {
                    const rect = paperLaneContainer.getBoundingClientRect();
                    arenaTargetReticleX = lastMouseClientX - rect.left;
                    arenaTargetReticleY = lastMouseClientY - rect.top;
                    arenaReticleHasTarget = true;
                }
            }

            if (arenaReticleHasTarget) {
                if (arenaCurrentReticleX < 0) {
                    arenaCurrentReticleX = arenaTargetReticleX;
                    arenaCurrentReticleY = arenaTargetReticleY;
                } else {
                    arenaCurrentReticleX += (arenaTargetReticleX - arenaCurrentReticleX) * 0.45;
                    arenaCurrentReticleY += (arenaTargetReticleY - arenaCurrentReticleY) * 0.45;
                }

                const rx = arenaCurrentReticleX;
                const ry = arenaCurrentReticleY;

                // 1. FLASH / ŞOK DALGASI
                if (paperReticleFlash > 0.02) {
                    ctx.save();
                    paperShockwaveRadius += 4.5;
                    ctx.strokeStyle = `rgba(255, 60, 0, ${paperReticleFlash * 0.8})`;
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(rx, ry, paperShockwaveRadius, 0, Math.PI * 2);
                    ctx.stroke();

                    const fGrad = ctx.createRadialGradient(rx, ry, 2, rx, ry, 36);
                    fGrad.addColorStop(0, `rgba(255, 245, 200, ${paperReticleFlash * 0.9})`);
                    fGrad.addColorStop(0.4, `rgba(255, 120, 30, ${paperReticleFlash * 0.6})`);
                    fGrad.addColorStop(1, 'rgba(255, 40, 0, 0)');
                    ctx.fillStyle = fGrad;
                    ctx.beginPath();
                    ctx.arc(rx, ry, 36, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();

                    paperReticleFlash *= 0.78;
                } else {
                    paperReticleFlash = 0;
                    paperShockwaveRadius = 10;
                }

                // 2. MODA GÖRE NİŞANGAH ÇİZİMİ
                if (inputMode === 'LASER') {
                    // 🔴 Fiziksel Lazer Noktası & Taktik Kırmızı Nişangah
                    const isFired = lastStatusData && lastStatusData.laser_active;
                    ctx.save();
                    ctx.shadowColor = '#ff2244';
                    ctx.shadowBlur = isFired ? 24 : 14;

                    const dotGrad = ctx.createRadialGradient(rx, ry, 1, rx, ry, isFired ? 16 : 9);
                    dotGrad.addColorStop(0, '#ffffff');
                    dotGrad.addColorStop(0.35, '#ff2244');
                    dotGrad.addColorStop(1, 'rgba(255, 34, 68, 0)');
                    ctx.fillStyle = dotGrad;
                    ctx.beginPath();
                    ctx.arc(rx, ry, isFired ? 16 : 9, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(rx, ry, isFired ? 3.5 : 2.5, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.strokeStyle = isFired ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 60, 90, 0.85)';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.arc(rx, ry, 16, 0, Math.PI * 2);
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.moveTo(rx - 28, ry); ctx.lineTo(rx - 10, ry);
                    ctx.moveTo(rx + 10, ry); ctx.lineTo(rx + 28, ry);
                    ctx.moveTo(rx, ry - 28); ctx.lineTo(rx, ry - 10);
                    ctx.moveTo(rx, ry + 10); ctx.lineTo(rx, ry + 28);
                    ctx.stroke();

                    ctx.font = 'bold 11px Rajdhani, sans-serif';
                    ctx.fillStyle = '#ff3366';
                    ctx.textAlign = 'center';
                    ctx.fillText(isFired ? '🔴 LAZER ATEŞ!' : '🔴 LAZER NİŞAN', rx, ry + 32);
                    ctx.restore();

                } else if (inputMode === 'HAND') {
                    // ✋ El Takibi Nişangahı (Tetik hazırlık / düşme renkli)
                    const isReady = lastStatusData && !!lastStatusData.tetik_hazir;
                    const ratio = (lastStatusData && typeof lastStatusData.tetik_orani === 'number') ? lastStatusData.tetik_orani : 1.0;
                    const isFired = ratio <= 0.40;

                    let ringColor = '#00ffcc';
                    let glowColor = 'rgba(0, 255, 204, 0.8)';
                    let labelText = `✋ EL NİŞANI (HAZIR - ${ratio.toFixed(2)})`;

                    if (isFired) {
                        ringColor = '#ff2244';
                        glowColor = 'rgba(255, 34, 68, 0.9)';
                        labelText = `💥 TETİK DÜŞTÜ! (${ratio.toFixed(2)})`;
                    } else if (!isReady) {
                        ringColor = '#ffb703';
                        glowColor = 'rgba(255, 183, 3, 0.7)';
                        labelText = `✋ PARMAKLARI AÇ (${ratio.toFixed(2)})`;
                    }

                    ctx.save();
                    ctx.shadowColor = glowColor;
                    ctx.shadowBlur = 10;
                    ctx.strokeStyle = ringColor;
                    ctx.lineWidth = 2.0;

                    ctx.beginPath();
                    ctx.arc(rx, ry, 18, 0, Math.PI * 2);
                    ctx.stroke();

                    ctx.strokeStyle = `rgba(${isFired ? '255, 34, 68' : (isReady ? '0, 255, 204' : '255, 183, 3')}, 0.35)`;
                    ctx.lineWidth = 1.0;
                    ctx.beginPath();
                    ctx.arc(rx, ry, 28, 0, Math.PI * 2);
                    ctx.stroke();

                    ctx.strokeStyle = ringColor;
                    ctx.lineWidth = 2.0;
                    ctx.beginPath();
                    ctx.moveTo(rx - 26, ry); ctx.lineTo(rx - 8, ry);
                    ctx.moveTo(rx + 8, ry); ctx.lineTo(rx + 26, ry);
                    ctx.moveTo(rx, ry - 26); ctx.lineTo(rx - 8, ry);
                    ctx.moveTo(rx, ry + 8); ctx.lineTo(rx, ry + 26);
                    ctx.stroke();

                    ctx.fillStyle = isFired ? '#ffffff' : '#ff2244';
                    ctx.beginPath();
                    ctx.arc(rx, ry, 3.0, 0, Math.PI * 2);
                    ctx.fill();

                    ctx.font = 'bold 11px Rajdhani, sans-serif';
                    ctx.fillStyle = ringColor;
                    ctx.textAlign = 'center';
                    ctx.fillText(labelText, rx, ry + 36);
                    ctx.restore();

                } else {
                    // 🖱️ Mouse Mode
                    ctx.save();
                    ctx.strokeStyle = '#00ffcc';
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.arc(rx, ry, 14, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(rx - 22, ry); ctx.lineTo(rx - 6, ry);
                    ctx.moveTo(rx + 6, ry); ctx.lineTo(rx + 22, ry);
                    ctx.moveTo(rx, ry - 22); ctx.lineTo(rx - 6, ry);
                    ctx.moveTo(rx, ry + 6); ctx.lineTo(rx, ry + 22);
                    ctx.stroke();
                    ctx.fillStyle = '#ff2244';
                    ctx.beginPath();
                    ctx.arc(rx, ry, 2.5, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                }
            } else {
                arenaCurrentReticleX = -1;
                arenaCurrentReticleY = -1;
            }

            paperArenaReticleAnim = requestAnimationFrame(arenaLoop);
        }
        paperArenaReticleAnim = requestAnimationFrame(arenaLoop);
    }

    // Atış Girdi Yöntemi Butonları (El Takibi / Lazer / Fare)
    const paperInputModeBtns = document.querySelectorAll('.btn-paper-input-mode');
    paperInputModeBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const mode = btn.getAttribute('data-mode');
            paperInputModeBtns.forEach(b => b.classList.toggle('active', b.getAttribute('data-mode') === mode));
            try {
                await fetch('/api/input_mode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode: mode })
                });
            } catch (e) {}
        });
    });


    // =========================================================================
    // HEDEF KAĞIDI ATIŞ YÜRÜTME FONKSİYONU (SEKMESİZ, SABİT & SOUND INTEGRATED)
    // =========================================================================
    let lastMouseClientX = -1;
    let lastMouseClientY = -1;

    async function executePaperShot(shotX, shotY, yontem = 'MOUSE') {
        const effectiveWeapon = tacticalAudio.currentWeapon || (paperWeaponSelect ? paperWeaponSelect.value : 'Glock19');

        if (isPaperRoundFinished) {
            showPaperHudAlert({ puan: 0, bolge: "ETKİNLİK TAMAMLANDI! Yeniden başlamak için [R] / Sıfırla'ya basın.", is_penalty: true });
            return;
        }

        if (paperAmmoLimit !== 'unlimited') {
            if (paperAmmoRemaining <= 0) {
                tacticalAudio.playTone(320, 0.04, 'square', 0.2);
                showPaperHudAlert({ puan: 0, bolge: "ŞARJÖR BOŞ! Sıfırla / Bantla butonuna basın.", is_penalty: true });
                return;
            }
            paperAmmoRemaining--;
            updatePaperAmmoTimerUI();
            if (paperAmmoRemaining === 0) {
                isPaperRoundFinished = true;
            }
        }

        // Zamanlayıcıyı ilk atışta otomatik başlat
        if (paperTimerLimit > 0 && !paperTimerRunning && !isPaperRoundFinished) {
            paperTimerRunning = true;
            paperTimerRemaining = paperTimerLimit;
            if (paperTimerInterval) clearInterval(paperTimerInterval);
            paperTimerInterval = setInterval(() => {
                paperTimerRemaining = Math.max(0, paperTimerRemaining - 0.1);
                updatePaperAmmoTimerUI();
                if (paperTimerRemaining <= 0) {
                    clearInterval(paperTimerInterval);
                    paperTimerInterval = null;
                    paperTimerRunning = false;
                    isPaperRoundFinished = true;
                    tacticalAudio.playTone(880, 0.4, 'sawtooth', 0.8);
                    showPaperHudAlert({
                        puan: currentPaperState ? currentPaperState.total_score : 0,
                        bolge: `SÜRE DOLDU! Toplam Skor: ${currentPaperState ? currentPaperState.total_score : 0}`
                    });
                }
            }, 100);
        }

        // Sabit ve tamamen sekmesiz nişan: recoil ve namlu alevi sıfırlandı
        recoilY = 0;
        muzzleFlashAlpha = 0;
        startIronSightLoop();

        // Orijinal silah ateş sesini çal
        tacticalAudio.playShot(effectiveWeapon);

        // Sabit hedeflerde ve hareketli hedeflerde farenin nişan aldığı nokta doğrudan vurulur
        let calX = shotX;
        let calY = shotY;

        try {
            const res = await fetch('/api/paper/shoot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    x: Math.round(calX),
                    y: Math.round(calY),
                    yontem: yontem,
                    weapon: effectiveWeapon
                })
            });

            if (res.ok) {
                const data = await res.json();
                currentPaperState = data.state;
                updatePaperUI(data.state);
                showPaperHudAlert(data.shot);
                if (data.shot.is_penalty) {
                    tacticalAudio.playHit('FRIENDLY_FIRE');
                } else if (data.shot.score > 0 || data.shot.puan > 0) {
                    tacticalAudio.playHit('PAPER_HIT');
                } else {
                    tacticalAudio.playHit('MISS');
                }
            }
        } catch (err) {
            console.error(err);
        }
    }

    function updatePaperAim(clientX, clientY) {
        lastMouseClientX = clientX;
        lastMouseClientY = clientY;
        if (!paperCanvas) return;
        const rect = paperCanvas.getBoundingClientRect();
        const scaleX = paperCanvas.width / rect.width;
        const scaleY = paperCanvas.height / rect.height;
        paperAimX = (clientX - rect.left) * scaleX;
        paperAimY = (clientY - rect.top) * scaleY;
        isPaperAiming = true;
        if (ironSightsEnabled) {
            paperCanvas.classList.add('iron-sights-active');
            if (paperLaneContainer) paperLaneContainer.classList.add('iron-sights-lane-active');
        }
        startIronSightLoop();
    }

    if (paperLaneContainer) {
        // Fare Hareketi: Hem kulvar hem hareketli hedef üzerinde gerçek zamanlı takip
        paperLaneContainer.addEventListener('mousemove', (e) => {
            updatePaperAim(e.clientX, e.clientY);
        });

        paperLaneContainer.addEventListener('mouseenter', (e) => {
            updatePaperAim(e.clientX, e.clientY);
        });

        paperLaneContainer.addEventListener('mouseleave', () => {
            isPaperAiming = false;
            lastMouseClientX = -1;
            lastMouseClientY = -1;
            if (paperCanvas) paperCanvas.classList.remove('iron-sights-active');
            if (paperLaneContainer) paperLaneContainer.classList.remove('iron-sights-lane-active');
            renderPaperCanvas();
        });

        let lastPaperClickTime = 0;
        const triggerLaneShot = async (clientX, clientY) => {
            const now = performance.now();
            if (now - lastPaperClickTime < 80) return;
            lastPaperClickTime = now;

            if (!paperCanvas) return;
            const rect = paperCanvas.getBoundingClientRect();
            const scaleX = paperCanvas.width / rect.width;
            const scaleY = paperCanvas.height / rect.height;
            const clickX = Math.max(0, Math.min(512, Math.round((clientX - rect.left) * scaleX)));
            const clickY = Math.max(0, Math.min(512, Math.round((clientY - rect.top) * scaleY)));
            paperAimX = clickX;
            paperAimY = clickY;
            await executePaperShot(clickX, clickY, 'MOUSE');
        };

        if (paperCanvas) {
            ['pointerdown', 'mousedown', 'click'].forEach(evt => {
                paperCanvas.addEventListener(evt, async (e) => {
                    if (e.button === 0) {
                        e.preventDefault();
                        e.stopPropagation();
                        await triggerLaneShot(e.clientX, e.clientY);
                    }
                });
            });
        }

        ['pointerdown', 'mousedown', 'click'].forEach(evt => {
            paperLaneContainer.addEventListener(evt, async (e) => {
                if (e.button === 0 && e.target !== paperCanvas) {
                    e.preventDefault();
                    await triggerLaneShot(e.clientX, e.clientY);
                }
            });
        });
    }

    async function triggerPaperHandShot(data, kaynak = 'PARMAK') {
        const now = Date.now();
        if (now - lastHandShotTime < 350) return;
        lastHandShotTime = now;

        paperReticleFlash = 1.0;

        let shotX = 256;
        let shotY = 256;

        if (paperLaneContainer && paperCanvas) {
            const arenaRect = paperLaneContainer.getBoundingClientRect();
            const canvasRect = paperCanvas.getBoundingClientRect();

            let clientX = 0;
            let clientY = 0;

            if (arenaCurrentReticleX >= 0 && arenaCurrentReticleY >= 0) {
                clientX = arenaRect.left + arenaCurrentReticleX;
                clientY = arenaRect.top + arenaCurrentReticleY;
            } else {
                let rawX = (kaynak === 'LAZER' && data && data.laser_dot) ? data.laser_dot.x : (data && data.hand_x ? data.hand_x : 320);
                let rawY = (kaynak === 'LAZER' && data && data.laser_dot) ? data.laser_dot.y : (data && data.hand_y ? data.hand_y : 240);
                clientX = arenaRect.left + (rawX / 640.0) * arenaRect.width;
                clientY = arenaRect.top + (rawY / 480.0) * arenaRect.height;
            }

            if (canvasRect.width > 0 && canvasRect.height > 0) {
                shotX = Math.round((clientX - canvasRect.left) * (512.0 / canvasRect.width));
                shotY = Math.round((clientY - canvasRect.top) * (512.0 / canvasRect.height));
            }
        }

        await executePaperShot(shotX, shotY, kaynak);
    }

    function showPaperHudAlert(shot) {
        if (!paperHudAlert || !shot) return;
        let alertClass = 'miss';
        const p = (shot.puan !== undefined) ? shot.puan : (shot.score !== undefined ? shot.score : 0);
        if (shot.is_penalty) alertClass = 'penalty';
        else if (p > 0) alertClass = 'hit';

        const b = shot.bolge || shot.region || (p > 0 ? 'İSABET' : 'ISKA');

        paperHudAlert.innerHTML = `
            <div class="hud-alert-box ${alertClass}">
                ${b} (${p > 0 ? '+' : ''}${p} Puan)
            </div>
        `;
        clearTimeout(paperHudAlert._timer);
        paperHudAlert._timer = setTimeout(() => {
            paperHudAlert.innerHTML = '';
        }, 1600);
    }


    // -------------------------------------------------------------
    // RESMİ HEDEF SEÇİCİ (1, 2, 3, 4) & MESAFE KONTROLLERİ (5m-25m)
    // -------------------------------------------------------------
    const paperTargetCardsList = document.getElementById('paperTargetCardsList');
    if (paperTargetCardsList) {
        paperTargetCardsList.addEventListener('click', async (e) => {
            const card = e.target.closest('.paper-card');
            if (!card) return;
            const tid = parseInt(card.getAttribute('data-tid'));
            if (!tid) return;

            document.querySelectorAll('.paper-card').forEach(c => {
                c.classList.toggle('active', parseInt(c.getAttribute('data-tid')) === tid);
            });

            const targetMap = {
                1: { target_id: 1, target_name: '1. Taktik Halka Hedef (1-9)', target_file: 'target_1_inverted.png', target_desc: 'Siyah zemin, beyaz halkalar ve merkez artı.' },
                2: { target_id: 2, target_name: '2. B27 Taktik Gövde Silüeti', target_file: 'target_4_silhouette.png', target_desc: 'Gövde silüeti, 7-8-9 ve merkez X kalp bölgesi.' },
                3: { target_id: 3, target_name: '3. ISSF Kırmızı Merkez Hedef', target_file: 'target_3_olympic.png', target_desc: 'Resmi ISSF hassas atış hedefi, kırmızı merkez nokta.' },
                4: { target_id: 4, target_name: '4. Rehine Kurtarma & Terörist Hedefi', target_file: 'target_5_hostage.png', target_desc: 'Silahlı terörist (kafa ve gövde X) ve rehine koruma bölgesi.' }
            };

            if (targetMap[tid]) {
                if (!currentPaperState) currentPaperState = {};
                Object.assign(currentPaperState, targetMap[tid]);
                currentPaperState.holes = [];
                currentPaperState.total_shots = 0;
                currentPaperState.total_score = 0;
                updatePaperUI(currentPaperState);
            }

            try {
                const res = await fetch(`/api/paper/select/${tid}`, { method: 'POST' });
                if (res.ok) {
                    const data = await res.json();
                    currentPaperState = data.state;
                    updatePaperUI(data.state);
                }
            } catch (err) {
                console.error("Hedef seçilemedi:", err);
            }
        });
    }

    if (btnResetPaper) {
        btnResetPaper.addEventListener('click', async () => {
            resetPaperRoundLocal();
            try {
                const res = await fetch('/api/paper/reset', { method: 'POST' });
                if (res.ok) {
                    const data = await res.json();
                    currentPaperState = data.state;
                    updatePaperUI(data.state);
                }
            } catch (err) {
                console.error(err);
            }
        });
    }

    const laneDistControls = document.querySelector('.lane-distance-controls');
    if (laneDistControls) {
        laneDistControls.addEventListener('click', async (e) => {
            const btn = e.target.closest('.btn-dist');
            if (!btn) return;
            const dist = parseInt(btn.getAttribute('data-dist'));
            if (!dist) return;

            document.querySelectorAll('.btn-dist').forEach(b => {
                b.classList.toggle('active', parseInt(b.getAttribute('data-dist')) === dist);
            });

            try {
                const res = await fetch(`/api/paper/distance/${dist}`, { method: 'POST' });
                if (res.ok) {
                    const data = await res.json();
                    if (data.state) {
                        currentPaperState = data.state;
                        updatePaperUI(data.state);
                    }
                }
            } catch (err) {
                console.error("Mesafe ayarlanamadı:", err);
            }
        });
    }


    if (btnShootPaper) {
        btnShootPaper.addEventListener('click', async () => {
            await executePaperShot(paperAimX, paperAimY, isPaperAiming ? 'MOUSE' : 'BUTTON');
        });
    }

    if (btnToggleIronSight) {
        btnToggleIronSight.addEventListener('click', () => {
            ironSightsEnabled = !ironSightsEnabled;
            if (ironSightsEnabled) {
                btnToggleIronSight.classList.add('active');
                btnToggleIronSight.innerHTML = '<i class="fa-solid fa-crosshairs"></i> GEZ-GÖZ-ARPACIK: AÇIK';
                if (isPaperAiming) paperCanvas.classList.add('iron-sights-active');
            } else {
                btnToggleIronSight.classList.remove('active');
                btnToggleIronSight.innerHTML = '<i class="fa-solid fa-crosshairs"></i> GEZ-GÖZ-ARPACIK: KAPALI';
                paperCanvas.classList.remove('iron-sights-active');
            }
            renderPaperCanvas();
        });
    }

    if (paperWeaponSelect) {
        paperWeaponSelect.addEventListener('change', async () => {
            const weapon = paperWeaponSelect.value;
            tacticalAudio.setWeapon(weapon);
            tacticalAudio.playShot(weapon);
            if (selectWeaponType) selectWeaponType.value = weapon;
            if (quickSelectWeapon) quickSelectWeapon.value = weapon;
            try {
                await fetch('/api/weapon/select', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ weapon_type: weapon })
                });
            } catch (err) {
                console.error(err);
            }
            renderPaperCanvas();
        });
    }

    if (btnResetPaper) {
        btnResetPaper.addEventListener('click', async () => {
            const res = await fetch('/api/paper/reset', { method: 'POST' });
            if (res.ok) {
                const data = await res.json();
                currentPaperState = data.state;
                updatePaperUI(data.state);
            }
        });
    }

    if (btnToggleGrouping) {
        btnToggleGrouping.addEventListener('click', () => {
            showGroupingCircle = !showGroupingCircle;
            btnToggleGrouping.innerHTML = showGroupingCircle
                ? `<i class="fa-solid fa-circle-dot"></i> GRUPMAN ÇEMBERİ: AÇIK`
                : `<i class="fa-regular fa-circle"></i> GRUPMAN ÇEMBERİ: KAPALI`;
            renderPaperCanvas();
        });
    }

    // =========================================================================
    // 3D FPS POLİGON ALANI — ELDE SİLAH GÖRÜNÜMÜ & SERBEST NİŞAN (ZOOM & ATEŞ)
    // =========================================================================
    const btnModeClassicPaper = document.getElementById('btnModeClassicPaper');
    const btnModeFpsRange = document.getElementById('btnModeFpsRange');
    const fpsRangeContainer = document.getElementById('fpsRangeContainer');
    const fpsCanvas = document.getElementById('fpsCanvas');
    const fpsCtx = fpsCanvas ? fpsCanvas.getContext('2d') : null;
    const fpsZoomBadge = document.getElementById('fpsZoomBadge');
    const fpsZoomToggleBtn = document.getElementById('fpsZoomToggleBtn');
    const fpsZoomBtnText = document.getElementById('fpsZoomBtnText');

    let isFpsModeActive = false;
    let isFpsZoomed = false;
    let fpsTargetZoom = 1.0;
    let fpsCurrentZoom = 1.0;
    let fpsAimX = 480;
    let fpsAimY = 240;
    let fpsRecoilY = 0;
    let fpsRecoilAngle = 0;
    let fpsRecoilSlide = 0;
    let fpsMuzzleAlpha = 0;
    let fpsTime = 0;
    let fpsCasings = [];
    let fpsImpactSparks = [];
    let fpsFloatPopups = [];
    let fpsAnimLoop = null;

    if (btnModeClassicPaper && btnModeFpsRange) {
        btnModeClassicPaper.addEventListener('click', () => {
            isFpsModeActive = false;
            btnModeClassicPaper.classList.add('active');
            btnModeFpsRange.classList.remove('active');
            if (paperLaneContainer) paperLaneContainer.style.display = 'flex';
            if (fpsRangeContainer) fpsRangeContainer.style.display = 'none';
            renderPaperCanvas();
        });

        btnModeFpsRange.addEventListener('click', () => {
            isFpsModeActive = true;
            btnModeFpsRange.classList.add('active');
            btnModeClassicPaper.classList.remove('active');
            if (paperLaneContainer) paperLaneContainer.style.display = 'none';
            if (fpsRangeContainer) fpsRangeContainer.style.display = 'block';
            startFpsRangeLoop();
        });
    }

    function toggleFpsZoomState() {
        isFpsZoomed = !isFpsZoomed;
        fpsTargetZoom = isFpsZoomed ? 1.85 : 1.0;
        if (fpsZoomBadge) {
            if (isFpsZoomed) {
                fpsZoomBadge.innerHTML = '<i class="fa-solid fa-magnifying-glass-plus"></i> ZOOM: 1.8x (ODAKLANMA)';
                fpsZoomBadge.classList.add('active');
            } else {
                fpsZoomBadge.innerHTML = '<i class="fa-solid fa-eye"></i> 1.0x NORMAL BAKIŞ';
                fpsZoomBadge.classList.remove('active');
            }
        }
        if (fpsZoomToggleBtn) {
            fpsZoomToggleBtn.classList.toggle('active', isFpsZoomed);
        }
        if (fpsZoomBtnText) {
            fpsZoomBtnText.textContent = isFpsZoomed ? 'Uzaklaş (Normal)' : 'Yakınlaştır (Zoom)';
        }
    }

    if (fpsZoomToggleBtn) {
        fpsZoomToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            toggleFpsZoomState();
        });
    }

    function startFpsRangeLoop() {
        if (fpsAnimLoop) cancelAnimationFrame(fpsAnimLoop);

        function loop() {
            if (!isFpsModeActive || activeTab !== 'paper') {
                fpsAnimLoop = null;
                return;
            }

            fpsTime += 0.04;

            // Yumuşak kamera yakınlaştırma (Zoom Lerp)
            fpsCurrentZoom += (fpsTargetZoom - fpsCurrentZoom) * 0.14;

            // Silah tepmesi ve yay toparlanması (Recoil spring physics)
            if (Math.abs(fpsRecoilY) > 0.15) fpsRecoilY *= 0.72; else fpsRecoilY = 0;
            if (Math.abs(fpsRecoilAngle) > 0.003) fpsRecoilAngle *= 0.72; else fpsRecoilAngle = 0;
            if (Math.abs(fpsRecoilSlide) > 0.15) fpsRecoilSlide *= 0.65; else fpsRecoilSlide = 0;
            if (fpsMuzzleAlpha > 0.03) fpsMuzzleAlpha *= 0.58; else fpsMuzzleAlpha = 0;

            // Kovan fiziği güncelleme
            fpsCasings.forEach(c => {
                c.x += c.vx;
                c.y += c.vy;
                c.vy += 0.9;
                c.rot += c.vrot;
                c.life--;
            });
            fpsCasings = fpsCasings.filter(c => c.life > 0);

            // Kıvılcım fiziği
            fpsImpactSparks.forEach(s => {
                s.x += s.vx;
                s.y += s.vy;
                s.vy += 0.4;
                s.alpha -= 0.04;
            });
            fpsImpactSparks = fpsImpactSparks.filter(s => s.alpha > 0);

            // Kayan skor yazıları
            fpsFloatPopups.forEach(p => {
                p.y -= 1.2;
                p.alpha -= 0.025;
            });
            fpsFloatPopups = fpsFloatPopups.filter(p => p.alpha > 0);

            renderFpsScene();
            fpsAnimLoop = requestAnimationFrame(loop);
        }

        fpsAnimLoop = requestAnimationFrame(loop);
    }

    // Hedef boyut ve konumunu hesaplayan yardımcı
    function getFpsTargetMetrics(dist) {
        let baseSize = 160;
        let baseY = 230;
        if (dist === 5) {
            baseSize = 250;
            baseY = 250;
        } else if (dist === 10) {
            baseSize = 200;
            baseY = 240;
        } else if (dist === 15) {
            baseSize = 160;
            baseY = 230;
        } else if (dist === 20) {
            baseSize = 130;
            baseY = 224;
        } else if (dist === 25) {
            baseSize = 108;
            baseY = 218;
        }
        return { baseSize, baseY };
    }

    function renderFpsScene() {
        if (!fpsCanvas || !fpsCtx) return;
        const w = fpsCanvas.width;
        const h = fpsCanvas.height;
        const dist = (currentPaperState && currentPaperState.distance) ? currentPaperState.distance : 15;
        const { baseSize, baseY } = getFpsTargetMetrics(dist);

        fpsCtx.clearRect(0, 0, w, h);

        const inputMode = (lastStatusData && lastStatusData.input_mode) ? lastStatusData.input_mode : 'MOUSE';
        if (inputMode === 'LASER') {
            if (lastStatusData && lastStatusData.laser_dot) {
                fpsAimX = (lastStatusData.laser_dot.x / 640.0) * w;
                fpsAimY = (lastStatusData.laser_dot.y / 480.0) * h;
            } else if (lastStatusData && lastStatusData.hand_x !== null && lastStatusData.hand_x !== undefined) {
                fpsAimX = (lastStatusData.hand_x / 640.0) * w;
                fpsAimY = (lastStatusData.hand_y / 480.0) * h;
            }
        } else if (inputMode === 'HAND') {
            if (lastStatusData && lastStatusData.hand_x !== null && lastStatusData.hand_x !== undefined) {
                fpsAimX = (lastStatusData.hand_x / 640.0) * w;
                fpsAimY = (lastStatusData.hand_y / 480.0) * h;
            }
        }

        // =====================================================================
        // KATMAN 1: 3D POLİGON KULVARI VE HEDEF (Kamera Odak / Zoom Transformu)
        // =====================================================================
        fpsCtx.save();
        // Zoom merkezi: Poligonun hedef doğrultusundaki merkezi (w / 2 = 480, baseY)
        const camFocusX = w / 2;
        const camFocusY = 220;
        fpsCtx.translate(camFocusX, camFocusY);
        fpsCtx.scale(fpsCurrentZoom, fpsCurrentZoom);
        fpsCtx.translate(-camFocusX, -camFocusY);

        // 1.1 TAVAN & SES YALITIM PANELLERİ
        const ceilingGrad = fpsCtx.createLinearGradient(0, 0, 0, 160);
        ceilingGrad.addColorStop(0, '#0c0e13');
        ceilingGrad.addColorStop(0.7, '#161922');
        ceilingGrad.addColorStop(1, '#1e232f');
        fpsCtx.fillStyle = ceilingGrad;
        fpsCtx.beginPath();
        fpsCtx.moveTo(0, 0);
        fpsCtx.lineTo(w, 0);
        fpsCtx.lineTo(660, 140);
        fpsCtx.lineTo(300, 140);
        fpsCtx.closePath();
        fpsCtx.fill();

        // Tavan akustik kirişleri
        fpsCtx.strokeStyle = '#272d3b';
        fpsCtx.lineWidth = 2;
        for (let i = 1; i <= 5; i++) {
            const step = i / 6;
            const lx1 = 300 * (1 - step);
            const rx1 = w - (w - 660) * step;
            const y1 = 140 * (1 - step);
            fpsCtx.beginPath();
            fpsCtx.moveTo(lx1, y1);
            fpsCtx.lineTo(rx1, y1);
            fpsCtx.stroke();
        }

        // Tavan Floresan / LED Strip Işıkları
        for (let xOff of [420, 540]) {
            const lightGrad = fpsCtx.createLinearGradient(xOff, 0, xOff, 130);
            lightGrad.addColorStop(0, 'rgba(230, 245, 255, 0.9)');
            lightGrad.addColorStop(1, 'rgba(100, 180, 255, 0.3)');
            fpsCtx.fillStyle = lightGrad;
            fpsCtx.beginPath();
            fpsCtx.moveTo(xOff - 6, 0);
            fpsCtx.lineTo(xOff + 6, 0);
            fpsCtx.lineTo(480 + (xOff - 480) * 0.4 + 2, 130);
            fpsCtx.lineTo(480 + (xOff - 480) * 0.4 - 2, 130);
            fpsCtx.fill();
        }

        // 1.2 SOL DUVAR — Taktik Akustik Paneller
        const leftWallGrad = fpsCtx.createLinearGradient(0, 0, 300, 0);
        leftWallGrad.addColorStop(0, '#10141c');
        leftWallGrad.addColorStop(1, '#1b202c');
        fpsCtx.fillStyle = leftWallGrad;
        fpsCtx.beginPath();
        fpsCtx.moveTo(0, 0);
        fpsCtx.lineTo(300, 140);
        fpsCtx.lineTo(300, 360);
        fpsCtx.lineTo(0, h);
        fpsCtx.closePath();
        fpsCtx.fill();

        // Sol Duvar Detay Çizgileri & Uyarı Şeritleri
        fpsCtx.strokeStyle = '#242a3a';
        fpsCtx.lineWidth = 1.5;
        for (let yStep = 0.2; yStep <= 0.8; yStep += 0.2) {
            fpsCtx.beginPath();
            fpsCtx.moveTo(0, h * yStep);
            fpsCtx.lineTo(300, 140 + 220 * yStep);
            fpsCtx.stroke();
        }

        // 1.3 SAĞ DUVAR
        const rightWallGrad = fpsCtx.createLinearGradient(660, 0, w, 0);
        rightWallGrad.addColorStop(0, '#191e2a');
        rightWallGrad.addColorStop(1, '#0e1118');
        fpsCtx.fillStyle = rightWallGrad;
        fpsCtx.beginPath();
        fpsCtx.moveTo(w, 0);
        fpsCtx.lineTo(660, 140);
        fpsCtx.lineTo(660, 360);
        fpsCtx.lineTo(w, h);
        fpsCtx.closePath();
        fpsCtx.fill();

        // Sağ Duvar Detay Çizgileri
        fpsCtx.strokeStyle = '#242a3a';
        fpsCtx.lineWidth = 1.5;
        for (let yStep = 0.2; yStep <= 0.8; yStep += 0.2) {
            fpsCtx.beginPath();
            fpsCtx.moveTo(w, h * yStep);
            fpsCtx.lineTo(660, 140 + 220 * yStep);
            fpsCtx.stroke();
        }

        // 1.4 ARKA KURŞUN TUTUCU DUVAR (BULLET TRAP BACKSTOP)
        const trapGrad = fpsCtx.createLinearGradient(0, 140, 0, 360);
        trapGrad.addColorStop(0, '#2b3140');
        trapGrad.addColorStop(0.6, '#1a1e27');
        trapGrad.addColorStop(1, '#101217');
        fpsCtx.fillStyle = trapGrad;
        fpsCtx.fillRect(300, 140, 360, 220);

        // Çelik tuzak plakası katmanları
        fpsCtx.fillStyle = '#171a23';
        fpsCtx.fillRect(320, 260, 320, 100);
        fpsCtx.strokeStyle = '#384154';
        fpsCtx.lineWidth = 1;
        fpsCtx.strokeRect(300, 140, 360, 220);

        // Hedef Arkası Spot Aydınlatma
        const spotGrad = fpsCtx.createRadialGradient(480, 230, 10, 480, 230, 180);
        spotGrad.addColorStop(0, 'rgba(255, 245, 210, 0.28)');
        spotGrad.addColorStop(0.5, 'rgba(255, 210, 150, 0.12)');
        spotGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        fpsCtx.fillStyle = spotGrad;
        fpsCtx.fillRect(300, 140, 360, 220);

        // 1.5 POLİGON ZEMİNİ (BETON, YANSIMA, MESAFE ÇİZGİLERİ)
        const floorGrad = fpsCtx.createLinearGradient(0, 360, 0, h);
        floorGrad.addColorStop(0, '#151922');
        floorGrad.addColorStop(0.5, '#0e1117');
        floorGrad.addColorStop(1, '#080a0e');
        fpsCtx.fillStyle = floorGrad;
        fpsCtx.beginPath();
        fpsCtx.moveTo(300, 360);
        fpsCtx.lineTo(660, 360);
        fpsCtx.lineTo(w, h);
        fpsCtx.lineTo(0, h);
        fpsCtx.closePath();
        fpsCtx.fill();

        // Zemin Sarı Güvenlik Sınır Çizgileri
        fpsCtx.strokeStyle = 'rgba(255, 183, 3, 0.45)';
        fpsCtx.lineWidth = 2;
        fpsCtx.beginPath();
        fpsCtx.moveTo(300, 360);
        fpsCtx.lineTo(0, h);
        fpsCtx.moveTo(660, 360);
        fpsCtx.lineTo(w, h);
        fpsCtx.stroke();

        // Zemin Mesafe İşaretleri
        const distanceMarkers = [
            { d: 25, yRatio: 0.08, label: '25 METRE' },
            { d: 20, yRatio: 0.22, label: '20 METRE' },
            { d: 15, yRatio: 0.40, label: '15 METRE' },
            { d: 10, yRatio: 0.62, label: '10 METRE' },
            { d: 5,  yRatio: 0.88, label: '5 METRE' }
        ];

        distanceMarkers.forEach(m => {
            const my = 360 + (h - 360) * m.yRatio;
            const leftX = 300 * (1 - m.yRatio);
            const rightX = 660 + (w - 660) * m.yRatio;

            fpsCtx.strokeStyle = (dist === m.d) ? 'rgba(0, 240, 118, 0.8)' : 'rgba(255, 255, 255, 0.16)';
            fpsCtx.lineWidth = (dist === m.d) ? 2.5 : 1;
            fpsCtx.beginPath();
            fpsCtx.moveTo(leftX + 20, my);
            fpsCtx.lineTo(rightX - 20, my);
            fpsCtx.stroke();

            // Mesafe Yazısı
            fpsCtx.fillStyle = (dist === m.d) ? '#00f076' : 'rgba(200, 205, 215, 0.4)';
            fpsCtx.font = `${(dist === m.d) ? 'bold' : 'normal'} 10px Rajdhani, sans-serif`;
            fpsCtx.textAlign = 'center';
            fpsCtx.fillText(m.label, 480, my - 4);
        });

        // 1.6 TAVAN ASKI VE TAŞIYICI RAYI (TROLLEY RAIL)
        const tgtCenterX = 480 + (isPaperMovingTarget ? Math.sin(fpsTime * 1.1) * 150 : 0);
        const tgtX = tgtCenterX - baseSize / 2;
        const tgtY = baseY - baseSize / 2;

        fpsCtx.save();
        fpsCtx.strokeStyle = '#475166';
        fpsCtx.lineWidth = 4;
        fpsCtx.beginPath();
        if (isPaperMovingTarget) {
            fpsCtx.moveTo(270, tgtY - 22);
            fpsCtx.lineTo(690, tgtY - 22);
        } else {
            fpsCtx.moveTo(480, 50);
            fpsCtx.lineTo(480, tgtY - 22);
        }
        fpsCtx.stroke();

        // 1.7 MOTORLU HEDEF ASKI APARATI (CARRIER)
        // Taşıyıcı Kafa ve Makara
        fpsCtx.fillStyle = '#2c3342';
        fpsCtx.fillRect(tgtCenterX - 24, tgtY - 22, 48, 14);
        fpsCtx.fillStyle = isPaperMovingTarget ? '#ffb703' : '#00f076';
        fpsCtx.beginPath();
        fpsCtx.arc(tgtCenterX + 16, tgtY - 15, 2.5, 0, Math.PI * 2);
        fpsCtx.fill();

        // İki Askı Çubuğu
        fpsCtx.strokeStyle = '#8a96aa';
        fpsCtx.lineWidth = 2;
        fpsCtx.beginPath();
        fpsCtx.moveTo(tgtCenterX - 18, tgtY - 10);
        fpsCtx.lineTo(tgtCenterX - 18, tgtY);
        fpsCtx.moveTo(tgtCenterX + 18, tgtY - 10);
        fpsCtx.lineTo(tgtCenterX + 18, tgtY);
        fpsCtx.stroke();

        // Üst Kıskaç Mandalı (Hedefi Tutan Klips)
        fpsCtx.fillStyle = '#414b5e';
        fpsCtx.fillRect(tgtX - 4, tgtY - 6, baseSize + 8, 8);
        fpsCtx.restore();

        // 1.8 HEDEF KAĞIDI & MERMİ DELİKLERİ
        const targetFile = (currentPaperState && currentPaperState.target_file) ? currentPaperState.target_file : 'target_1_inverted.png';
        const fpsImg = getLoadedTargetImage(targetFile);
        if (fpsImg && (fpsImg.complete || fpsImg.naturalWidth > 0)) {
            fpsCtx.save();
            fpsCtx.shadowColor = 'rgba(0,0,0,0.85)';
            fpsCtx.shadowBlur = 18;
            fpsCtx.drawImage(fpsImg, tgtX, tgtY, baseSize, baseSize);
            fpsCtx.restore();
        } else {
            // Yedek hedef çizimi
            fpsCtx.fillStyle = '#f8f9fa';
            fpsCtx.fillRect(tgtX, tgtY, baseSize, baseSize);
            fpsCtx.strokeStyle = '#222';
            fpsCtx.lineWidth = 2;
            fpsCtx.strokeRect(tgtX, tgtY, baseSize, baseSize);
            for (let r = baseSize * 0.45; r > 10; r -= baseSize * 0.08) {
                fpsCtx.beginPath();
                fpsCtx.arc(tgtCenterX, baseY, r, 0, Math.PI * 2);
                fpsCtx.stroke();
            }
        }

        // Mermi Deliklerini Hedef Kağıdına Çiz
        if (currentPaperState && currentPaperState.holes) {
            const scaleFactor = baseSize / 512.0;
            currentPaperState.holes.forEach(hole => {
                const hx = tgtX + hole.x * scaleFactor;
                const hy = tgtY + hole.y * scaleFactor;

                fpsCtx.save();
                const burn = fpsCtx.createRadialGradient(hx, hy, 1, hx, hy, 5);
                burn.addColorStop(0, 'rgba(10,10,10,0.95)');
                burn.addColorStop(0.5, 'rgba(40,40,40,0.7)');
                burn.addColorStop(1, 'rgba(0,0,0,0)');
                fpsCtx.fillStyle = burn;
                fpsCtx.beginPath();
                fpsCtx.arc(hx, hy, 5, 0, Math.PI * 2);
                fpsCtx.fill();

                fpsCtx.fillStyle = '#05070a';
                fpsCtx.beginPath();
                fpsCtx.arc(hx, hy, 2.5, 0, Math.PI * 2);
                fpsCtx.fill();

                fpsCtx.strokeStyle = hole.is_penalty ? '#ff3366' : (hole.puan >= 9 ? '#00ffcc' : '#e0e0e0');
                fpsCtx.lineWidth = 1;
                fpsCtx.stroke();
                fpsCtx.restore();
            });
        }

        // Kıvılcım Parçacıkları (Duvardan seken)
        fpsImpactSparks.forEach(s => {
            fpsCtx.save();
            fpsCtx.fillStyle = `rgba(255, 200, 50, ${s.alpha})`;
            fpsCtx.beginPath();
            fpsCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
            fpsCtx.fill();
            fpsCtx.restore();
        });

        // Skor Yüzen Yazıları
        fpsFloatPopups.forEach(p => {
            fpsCtx.save();
            fpsCtx.font = 'bold 16px Rajdhani, sans-serif';
            fpsCtx.fillStyle = p.color.replace(')', `, ${p.alpha})`).replace('rgb', 'rgba');
            fpsCtx.textAlign = 'center';
            fpsCtx.fillText(p.text, p.x, p.y);
            fpsCtx.restore();
        });

        // 1.9 ATIŞ TEZGAHI (ATIŞ MASASI - POLİGON ÖN BANKETİ)
        const benchGrad = fpsCtx.createLinearGradient(0, 510, 0, h);
        benchGrad.addColorStop(0, '#20242e');
        benchGrad.addColorStop(0.3, '#141720');
        benchGrad.addColorStop(1, '#090b0e');
        fpsCtx.fillStyle = benchGrad;
        fpsCtx.fillRect(0, 505, w, h - 505);
        fpsCtx.strokeStyle = '#384154';
        fpsCtx.lineWidth = 2;
        fpsCtx.beginPath();
        fpsCtx.moveTo(0, 505);
        fpsCtx.lineTo(w, 505);
        fpsCtx.stroke();

        fpsCtx.restore(); // Zoom transformu kapat

        // =====================================================================
        // KATMAN 2: BOŞ KOVANLAR (CASINGS - Ekranda uçar)
        // =====================================================================
        fpsCasings.forEach(c => {
            fpsCtx.save();
            fpsCtx.translate(c.x, c.y);
            fpsCtx.rotate(c.rot);
            fpsCtx.fillStyle = '#ffd700';
            fpsCtx.fillRect(-5, -2, 10, 4);
            fpsCtx.fillStyle = '#b8860b';
            fpsCtx.fillRect(3, -2, 2, 4);
            fpsCtx.restore();
        });

        // =====================================================================
        // KATMAN 3: ELDE SİLAH GÖRÜNÜMÜ & FARE İLE AŞAĞI-YUKARI NİŞAN
        // =====================================================================
        const currentWeapon = tacticalAudio.currentWeapon || (paperWeaponSelect ? paperWeaponSelect.value : 'Glock19');

        // Yalnızca FARE modunda 3D silah modelini çiz; Lazer ve El Takibinde ekran temiz ve nişan serbest kalır
        if (inputMode === 'MOUSE') {
            // Silahı ekranın sağ-altında doğal, dik ve estetik FPS duruşunda konumlandır
            const handBaseX = 640 + (fpsAimX - 480) * 0.08;
            const handBaseY = 575 + (fpsAimY - 270) * 0.05 + (isFpsZoomed ? -18 : 0) + fpsRecoilY;

            // Silah ucu kalkık/eğik durmasın; doğal ve hafif mikro-açı (±0.035 rad)
            const targetSway = (fpsAimX - 480) * 0.0003;
            let gunAngle = Math.max(-0.035, Math.min(0.035, targetSway)) + fpsRecoilAngle;

            // EL VE SİLAHI ÇİZ
            drawHandsAndWeapon(fpsCtx, currentWeapon, handBaseX, handBaseY, gunAngle, fpsRecoilSlide, isFpsZoomed);

            // 3.1 NAMLU ALEVİ (MUZZLE FLASH)
            if (fpsMuzzleAlpha > 0.03) {
                fpsCtx.save();
                fpsCtx.translate(handBaseX, handBaseY);
                fpsCtx.rotate(gunAngle);

                const mLen = (currentWeapon === 'M4A1') ? 200 : 150;
                const flashY = -mLen;

                const flashGrad = fpsCtx.createRadialGradient(0, flashY, 4, 0, flashY, 55);
                flashGrad.addColorStop(0, `rgba(255, 250, 210, ${fpsMuzzleAlpha * 0.95})`);
                flashGrad.addColorStop(0.3, `rgba(255, 160, 40, ${fpsMuzzleAlpha * 0.75})`);
                flashGrad.addColorStop(0.7, `rgba(255, 60, 0, ${fpsMuzzleAlpha * 0.35})`);
                flashGrad.addColorStop(1, 'rgba(255, 60, 0, 0)');
                fpsCtx.fillStyle = flashGrad;
                fpsCtx.beginPath();
                fpsCtx.arc(0, flashY, 55, 0, Math.PI * 2);
                fpsCtx.fill();

                fpsCtx.fillStyle = `rgba(255, 255, 230, ${fpsMuzzleAlpha})`;
                fpsCtx.beginPath();
                fpsCtx.moveTo(-10, flashY + 15);
                fpsCtx.lineTo(0, flashY - 45);
                fpsCtx.lineTo(10, flashY + 15);
                fpsCtx.closePath();
                fpsCtx.fill();

                fpsCtx.restore();
            }
        }

        // =====================================================================
        // KATMAN 4: TAKTİK NİŞANGAH / RETICLE (FARENİN / LAZERİN OLDUĞU YERDE)
        // =====================================================================
        drawTacticalReticle(fpsCtx, fpsAimX, fpsAimY, dist, baseSize, baseY, tgtCenterX);
    }

    // Elde duran silahı, kolları ve elleri profesyonel AAA kalitesinde çizen fonksiyon
    function drawHandsAndWeapon(ctx, weapon, x, y, angle, recoilSlide, isZoomed) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        const zoomScale = isZoomed ? 0.90 : 0.80; // Görüşü kapatmayan gerçekçi ve estetik FPS boyutu
        ctx.scale(zoomScale, zoomScale);

        const flashGlow = Math.max(0, fpsMuzzleAlpha);

        // 1. KOLLAR VE ASKERİ TAKTİK KIYAFET (COMBAT SOFTSHELL SLEEVES)
        ctx.save();
        // Sol Kol (Destek kolu)
        const sleeveGradL = ctx.createLinearGradient(-150, 200, -20, 40);
        sleeveGradL.addColorStop(0, '#111513');
        sleeveGradL.addColorStop(0.5, '#1d231f');
        sleeveGradL.addColorStop(1, '#242c26');
        ctx.fillStyle = sleeveGradL;
        ctx.beginPath();
        ctx.moveTo(-160, 220);
        ctx.lineTo(-48, 42);
        ctx.lineTo(-14, 58);
        ctx.lineTo(-75, 235);
        ctx.closePath();
        ctx.fill();

        // Sol Kol kumaş kıvrımları
        ctx.strokeStyle = '#0b0e0c';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(-120, 170);
        ctx.quadraticCurveTo(-85, 140, -50, 95);
        ctx.moveTo(-140, 200);
        ctx.quadraticCurveTo(-100, 180, -70, 140);
        ctx.stroke();

        // Sağ Kol (Tetik kolu)
        const sleeveGradR = ctx.createLinearGradient(150, 200, 20, 40);
        sleeveGradR.addColorStop(0, '#0f1311');
        sleeveGradR.addColorStop(0.5, '#1a201c');
        sleeveGradR.addColorStop(1, '#222a25');
        ctx.fillStyle = sleeveGradR;
        ctx.beginPath();
        ctx.moveTo(160, 220);
        ctx.lineTo(48, 48);
        ctx.lineTo(14, 66);
        ctx.lineTo(75, 235);
        ctx.closePath();
        ctx.fill();

        // Sağ Kol dikişleri
        ctx.strokeStyle = '#0b0e0c';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(120, 170);
        ctx.quadraticCurveTo(85, 140, 50, 100);
        ctx.moveTo(140, 200);
        ctx.quadraticCurveTo(100, 180, 70, 145);
        ctx.stroke();

        // Bilek Manşetleri & Taktik Cırt Cırt (Velcro Cuffs)
        ctx.fillStyle = '#15181b';
        ctx.fillRect(-62, 40, 36, 14);
        ctx.fillRect(26, 44, 36, 14);
        ctx.strokeStyle = '#293035';
        ctx.lineWidth = 1;
        ctx.strokeRect(-62, 40, 36, 14);
        ctx.strokeRect(26, 44, 36, 14);
        ctx.restore();

        // 2. PROFESYONEL TAKTİK OPERATÖR ELDİVENLERİ (MECHANIX M-PACT / OAKLEY SI)
        ctx.save();
        // Sağ El (Grip / Ateş Eden El)
        const palmGrad = ctx.createRadialGradient(12, 20, 5, 12, 20, 36);
        palmGrad.addColorStop(0, '#2c323a');
        palmGrad.addColorStop(0.7, '#1a1e24');
        palmGrad.addColorStop(1, '#101216');
        ctx.fillStyle = palmGrad;
        ctx.beginPath();
        ctx.ellipse(12, 18, 30, 38, 0.12, 0, Math.PI * 2);
        ctx.fill();

        // Karbon Fiber Boğum Koruyucusu (Molded Knuckle Protector)
        const carbonGrad = ctx.createLinearGradient(0, 10, 26, 30);
        carbonGrad.addColorStop(0, '#16191e');
        carbonGrad.addColorStop(0.4, '#323a46');
        carbonGrad.addColorStop(0.7, '#181b21');
        carbonGrad.addColorStop(1, '#0d0f13');
        ctx.fillStyle = carbonGrad;
        ctx.beginPath();
        ctx.roundRect(0, 10, 26, 18, 5);
        ctx.fill();
        ctx.strokeStyle = '#445060';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Karbon Plaka Üzerindeki Parlama Çizgisi
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(3, 14);
        ctx.lineTo(23, 14);
        ctx.stroke();

        // Firing Hand Başparmak (Gövde boyunca uzanır)
        ctx.fillStyle = '#212730';
        ctx.beginPath();
        ctx.ellipse(-10, -8, 10, 24, -0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#303846';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Tetik Parmağı (İşaret Parmağı - tetik yuvasına uzanır)
        ctx.fillStyle = '#232933';
        ctx.beginPath();
        ctx.ellipse(15, -12, 7, 22, -0.16, 0, Math.PI * 2);
        ctx.fill();
        // Parmak eklem boğumu dikişleri
        ctx.strokeStyle = '#384250';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(10, -14);
        ctx.lineTo(20, -12);
        ctx.moveTo(11, -7);
        ctx.lineTo(20, -5);
        ctx.stroke();

        // Sol El (Destek Eli - İki elle taktik tutuş / Thumbs-Forward Grip)
        const leftPalmGrad = ctx.createRadialGradient(-18, 16, 4, -18, 16, 32);
        leftPalmGrad.addColorStop(0, '#2d343e');
        leftPalmGrad.addColorStop(0.7, '#1b1f26');
        leftPalmGrad.addColorStop(1, '#101318');
        ctx.fillStyle = leftPalmGrad;
        ctx.beginPath();
        ctx.ellipse(-18, 16, 28, 34, -0.22, 0, Math.PI * 2);
        ctx.fill();

        // Sol El Karbon Koruyucusu
        ctx.fillStyle = carbonGrad;
        ctx.beginPath();
        ctx.roundRect(-30, 8, 22, 16, 4);
        ctx.fill();
        ctx.strokeStyle = '#404c5c';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Sol elin sağ eli saran 4 parmağı (Eklem detaylı)
        for (let i = 0; i < 4; i++) {
            const fy = 8 + i * 11;
            const fx = -6 - i * 1.5;
            ctx.fillStyle = (i % 2 === 0) ? '#262d39' : '#202530';
            ctx.beginPath();
            ctx.roundRect(fx - 8, fy - 4, 16, 9, 3);
            ctx.fill();
            ctx.strokeStyle = '#36404e';
            ctx.lineWidth = 0.8;
            ctx.stroke();

            // Deri eklem katlantısı
            ctx.fillStyle = '#13161c';
            ctx.fillRect(fx - 4, fy - 1, 8, 2);
        }

        // Sol Başparmak (Gövdenin sol yanında ileriye doğru uzanır)
        ctx.fillStyle = '#242a34';
        ctx.beginPath();
        ctx.ellipse(-12, -18, 8, 22, -0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#384353';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.restore();

        // 3. SİLAH MODELİ (GLOCK 19, CANIK TP9, SAR9 VEYA M4A1)
        if (weapon === 'M4A1') {
            // =================================================================
            // M4A1 TACTICAL CARABINE (5.56x45mm NATO)
            // =================================================================
            ctx.save();
            ctx.translate(0, recoilSlide * 0.45);

            // Üst Gövde (Upper Receiver) & Düz Picatinny Rayı
            const m4RecGrad = ctx.createLinearGradient(-18, 0, 18, 0);
            m4RecGrad.addColorStop(0, '#15171c');
            m4RecGrad.addColorStop(0.5, '#282d38');
            m4RecGrad.addColorStop(1, '#131519');
            ctx.fillStyle = m4RecGrad;
            ctx.fillRect(-16, -45, 32, 85);
            ctx.strokeStyle = '#394152';
            ctx.lineWidth = 1.2;
            ctx.strokeRect(-16, -45, 32, 85);

            // Kurma Kolu (Charging Handle Latch)
            ctx.fillStyle = '#1a1d24';
            ctx.fillRect(-8, 36, 16, 10);
            ctx.fillStyle = '#2d3340';
            ctx.fillRect(-12, 42, 24, 5);

            // Pirinç Kovan Saptırıcı (Brass Deflector) & İleri İtici (Forward Assist)
            ctx.fillStyle = '#1e222b';
            ctx.beginPath();
            ctx.moveTo(16, -10);
            ctx.lineTo(24, -2);
            ctx.lineTo(16, 6);
            ctx.closePath();
            ctx.fill();

            // Picatinny T-İşaretli Üst Ray
            ctx.fillStyle = '#111317';
            ctx.fillRect(-10, -45, 20, 75);
            ctx.fillStyle = '#222731';
            for (let ry = -40; ry <= 25; ry += 8) {
                ctx.fillRect(-9, ry, 18, 3);
            }

            // Delta Halkası (Delta Ring)
            ctx.fillStyle = '#181b22';
            ctx.fillRect(-17, -56, 34, 11);
            ctx.strokeStyle = '#323a48';
            ctx.strokeRect(-17, -56, 34, 11);

            // El Kundağı (Cylindrical Ribbed Quad-Rail Handguard)
            const hgGrad = ctx.createLinearGradient(-16, 0, 16, 0);
            hgGrad.addColorStop(0, '#1b1f27');
            hgGrad.addColorStop(0.25, '#2c3342');
            hgGrad.addColorStop(0.5, '#353e50');
            hgGrad.addColorStop(0.75, '#2c3342');
            hgGrad.addColorStop(1, '#171a21');
            ctx.fillStyle = hgGrad;
            ctx.fillRect(-15, -175, 30, 120);
            ctx.strokeStyle = '#434e62';
            ctx.lineWidth = 1.2;
            ctx.strokeRect(-15, -175, 30, 120);

            // Ray Kapak Tırtıkları (Knights Armament Rail Ribs)
            ctx.fillStyle = '#12141a';
            for (let yRib = -168; yRib <= -62; yRib += 9) {
                ctx.fillRect(-14, yRib, 28, 4);
            }

            // Namlu (Cold Hammer-Forged Barrel)
            ctx.fillStyle = '#0f1115';
            ctx.fillRect(-6, -225, 12, 52);
            ctx.strokeStyle = '#272d38';
            ctx.strokeRect(-6, -225, 12, 52);

            // A2 Ön Nişangah Üçgeni (Triangular Front Sight Base)
            ctx.fillStyle = '#1c202a';
            ctx.beginPath();
            ctx.moveTo(-11, -180);
            ctx.lineTo(0, -212);
            ctx.lineTo(11, -180);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = '#374154';
            ctx.lineWidth = 1;
            ctx.stroke();

            // A2 Arpacık Pimi (Square Post with Glow Dot)
            ctx.fillStyle = '#0a0c0f';
            ctx.fillRect(-2, -218, 4, 10);
            ctx.fillStyle = '#00ffcc';
            ctx.beginPath();
            ctx.arc(0, -214, 2, 0, Math.PI * 2);
            ctx.fill();

            // A2 Kuş Kafesi Alev Gizleyen (Birdcage Flash Hider)
            ctx.fillStyle = '#161920';
            ctx.fillRect(-8, -236, 16, 13);
            ctx.fillStyle = '#0a0c0f';
            ctx.fillRect(-6, -234, 3, 7);
            ctx.fillRect(3, -234, 3, 7);

            // Arka Diopter Delik Gez (Rear Peep Sight Aperture Ring)
            ctx.save();
            ctx.lineWidth = 6;
            ctx.strokeStyle = '#181c24';
            ctx.beginPath();
            ctx.arc(0, 18, 18, 0, Math.PI * 2);
            ctx.stroke();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#434e62';
            ctx.stroke();
            ctx.restore();

            // Sol elin kundağı tutuşu (C-clamp tactical forward grip)
            ctx.fillStyle = '#1f252f';
            ctx.beginPath();
            ctx.ellipse(-16, -115, 16, 28, -0.35, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#3d485a';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.restore();

        } else {
            // =================================================================
            // TABANCA MODELLERİ: GLOCK 19 GEN5, CANIK TP9 SFX, SARSILMAZ SAR9
            // =================================================================
            const isGlock = (weapon === 'Glock19');
            const isCanik = (weapon === 'CanikTP9');
            const isSar9 = (weapon === 'SAR9');

            // 3.1 POLİMER ALT GÖVDE (FRAME)
            ctx.save();
            const frameW = 38;
            const frameH = 75;
            ctx.fillStyle = isCanik ? '#1a1d24' : (isSar9 ? '#181b22' : '#14161a');
            ctx.beginPath();
            ctx.roundRect(-frameW / 2, -15, frameW, frameH, [4, 4, 10, 10]);
            ctx.fill();
            ctx.strokeStyle = '#2d3442';
            ctx.lineWidth = 1.2;
            ctx.stroke();

            // Tetik Korkuluğu (Trigger Guard with Undercut)
            ctx.strokeStyle = '#272d3a';
            ctx.lineWidth = 3.2;
            ctx.beginPath();
            ctx.moveTo(9, -15);
            ctx.lineTo(15, -34);
            ctx.lineTo(0, -34);
            ctx.lineTo(-2, -15);
            ctx.stroke();

            // Metal Tetik Dili (Trigger Shoe)
            if (isCanik) {
                // Canik Kırmızı Emniyet Dilli Düz Yarış Tetiği
                ctx.fillStyle = '#181a20';
                ctx.fillRect(4, -28, 4, 14);
                ctx.fillStyle = '#ff2244';
                ctx.fillRect(5, -24, 2, 8);
            } else {
                ctx.fillStyle = '#3c4352';
                ctx.fillRect(5, -27, 3.5, 13);
                ctx.fillStyle = '#20242e';
                ctx.fillRect(6, -23, 1.5, 7);
            }

            // Sökme Mandalı (Takedown Slide Lock Lever)
            ctx.fillStyle = '#3a4252';
            ctx.fillRect(-15, -28, 6, 3);
            ctx.fillRect(9, -28, 6, 3);

            // Çift Taraflı Sürgü Düşürme Mandalı (Ambi Slide Stop)
            ctx.fillStyle = '#2c3340';
            ctx.fillRect(-17, -8, 4, 16);

            // Kabza RTF2 / Stippling Pütür Doku Deseni
            ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
            for (let py = 5; py <= 45; py += 5) {
                for (let px = -12; px <= 12; px += 5) {
                    ctx.fillRect(px, py, 2, 2);
                }
            }
            ctx.restore();

            // 3.2 ÇELİK SÜRGÜ (SLIDE) — ATIŞ SIRASINDA GERİ TEPME İLE KAYAR
            ctx.save();
            ctx.translate(0, recoilSlide * 0.75);

            const slideW = 34;
            const slideH = 165;
            const slideTop = -175;

            // Sürgü Gövde Rengi & Metalik Işık Geçişleri (3-Boyutlu Eğimli Profil)
            const slideGrad = ctx.createLinearGradient(-slideW / 2, 0, slideW / 2, 0);
            if (isCanik) {
                slideGrad.addColorStop(0, '#2d3340');
                slideGrad.addColorStop(0.2, '#485264');
                slideGrad.addColorStop(0.5, '#616e84');
                slideGrad.addColorStop(0.8, '#485264');
                slideGrad.addColorStop(1, '#272d38');
            } else if (isSar9) {
                slideGrad.addColorStop(0, '#1c2029');
                slideGrad.addColorStop(0.2, '#313745');
                slideGrad.addColorStop(0.5, '#454e60');
                slideGrad.addColorStop(0.8, '#313745');
                slideGrad.addColorStop(1, '#181b22');
            } else {
                // Glock 19 Gen5 Matte nDLC Siyahı
                slideGrad.addColorStop(0, '#16181e');
                slideGrad.addColorStop(0.25, '#282d38');
                slideGrad.addColorStop(0.5, '#383f4d');
                slideGrad.addColorStop(0.75, '#282d38');
                slideGrad.addColorStop(1, '#14161a');
            }

            // Sürgü Ana Bloğu (Gen5 Ön Eğimli Burun)
            ctx.fillStyle = slideGrad;
            ctx.beginPath();
            ctx.roundRect(-slideW / 2, slideTop, slideW, slideH, [6, 6, 2, 2]);
            ctx.fill();
            ctx.strokeStyle = '#4b5568';
            ctx.lineWidth = 1.2;
            ctx.stroke();

            // Sürgü Üstü Pah Kırma Çizgileri (Top Chamfer Facets)
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-slideW / 2 + 5, slideTop + 8);
            ctx.lineTo(-slideW / 2 + 5, slideTop + slideH - 12);
            ctx.moveTo(slideW / 2 - 5, slideTop + 8);
            ctx.lineTo(slideW / 2 - 5, slideTop + slideH - 12);
            ctx.stroke();

            // Kovan Fırlatma Penceresi & Namlu Yatağı (Ejection Port & Barrel Hood)
            const ejTop = slideTop + 42;
            const ejW = 15;
            const ejH = 34;
            ctx.fillStyle = '#0a0c10';
            ctx.fillRect(slideW / 2 - ejW, ejTop, ejW, ejH);
            ctx.strokeStyle = '#2a313d';
            ctx.lineWidth = 1;
            ctx.strokeRect(slideW / 2 - ejW, ejTop, ejW, ejH);

            // Namlu Yatağı ve Kalibre Yazısı (9x19)
            ctx.fillStyle = '#1c2028';
            ctx.fillRect(slideW / 2 - ejW + 2, ejTop + 2, ejW - 4, ejH - 4);
            ctx.fillStyle = '#8a96aa';
            ctx.font = 'bold 8px Rajdhani, sans-serif';
            ctx.fillText('9x19', slideW / 2 - ejW + 3, ejTop + 20);

            // Tırnak (Extractor with Loaded Chamber Indicator)
            ctx.fillStyle = '#424c5e';
            ctx.fillRect(slideW / 2 - 2, ejTop + 10, 3, 14);

            // Sürgü Kurma Tırtıkları (Front & Rear Cocking Serrations)
            const serrationColor = '#101217';
            const serrationHighlight = 'rgba(255, 255, 255, 0.14)';
            for (let sy = slideTop + 100; sy <= slideTop + 148; sy += 6) {
                ctx.fillStyle = serrationColor;
                ctx.fillRect(-slideW / 2 + 1, sy, slideW - 2, 2.5);
                ctx.fillStyle = serrationHighlight;
                ctx.fillRect(-slideW / 2 + 1, sy + 2.5, slideW - 2, 1);
            }
            for (let sy = slideTop + 12; sy <= slideTop + 34; sy += 5.5) {
                ctx.fillStyle = serrationColor;
                ctx.fillRect(-slideW / 2 + 1, sy, slideW - 2, 2.2);
                ctx.fillStyle = serrationHighlight;
                ctx.fillRect(-slideW / 2 + 1, sy + 2.2, slideW - 2, 0.8);
            }

            // Canik TP9 SFx Özel Ön Hafifletme Kesikleri
            if (isCanik) {
                ctx.fillStyle = '#0d0f14';
                for (let k = 0; k < 3; k++) {
                    const cy = slideTop + 14 + k * 9;
                    ctx.fillRect(-12, cy, 6, 5);
                    ctx.fillRect(6, cy, 6, 5);
                }
            }

            // Sürgü Arka Kapağı (Slide Back Plate)
            ctx.fillStyle = '#181b22';
            ctx.fillRect(-14, slideTop + slideH - 8, 28, 8);
            ctx.strokeStyle = '#323a48';
            ctx.lineWidth = 1;
            ctx.strokeRect(-14, slideTop + slideH - 8, 28, 8);
            ctx.fillStyle = isCanik ? '#ff2b44' : '#0a0c0f';
            ctx.beginPath();
            ctx.arc(0, slideTop + slideH - 4, 2, 0, Math.PI * 2);
            ctx.fill();

            // Namlu Ucu Taç Kısmı & Delik (Muzzle Crown & Bore)
            ctx.fillStyle = '#0d0f14';
            ctx.beginPath();
            ctx.arc(0, slideTop, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000000';
            ctx.beginPath();
            ctx.arc(0, slideTop, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#272d38';
            ctx.lineWidth = 1;
            ctx.stroke();

            // 3.3 HASSAS NİŞANGAH SİSTEMLERİ (ARPACIK & GEZ)
            // ARPACIK (Front Sight Post)
            ctx.fillStyle = '#0a0c10';
            ctx.fillRect(-3.5, slideTop + 2, 7, 14);
            ctx.strokeStyle = '#374152';
            ctx.lineWidth = 1;
            ctx.strokeRect(-3.5, slideTop + 2, 7, 14);

            ctx.save();
            if (isCanik) {
                ctx.shadowColor = 'rgba(255, 34, 68, 0.95)';
                ctx.shadowBlur = 8;
                ctx.fillStyle = '#ff2b44';
                ctx.beginPath();
                ctx.arc(0, slideTop + 7, 2.4, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(0, slideTop + 7, 1.0, 0, Math.PI * 2);
                ctx.fill();
            } else if (isSar9) {
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(0, slideTop + 7, 2.5, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(0, slideTop + 7, 2.6, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();

            // GEZ (Rear Sight)
            ctx.fillStyle = '#101318';
            ctx.fillRect(-15, slideTop + slideH - 22, 10, 10);
            ctx.fillRect(5, slideTop + slideH - 22, 10, 10);
            ctx.fillRect(-15, slideTop + slideH - 12, 30, 4);

            if (isGlock) {
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2.2;
                ctx.lineJoin = 'miter';
                ctx.beginPath();
                ctx.moveTo(-5, slideTop + slideH - 22);
                ctx.lineTo(-5, slideTop + slideH - 14);
                ctx.lineTo(5, slideTop + slideH - 14);
                ctx.lineTo(5, slideTop + slideH - 22);
                ctx.stroke();
            } else if (isCanik) {
                ctx.save();
                ctx.shadowColor = 'rgba(0, 255, 102, 0.9)';
                ctx.shadowBlur = 6;
                ctx.fillStyle = '#00ff66';
                ctx.beginPath();
                ctx.arc(-10, slideTop + slideH - 17, 2.2, 0, Math.PI * 2);
                ctx.arc(10, slideTop + slideH - 17, 2.2, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            } else {
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                ctx.arc(-10, slideTop + slideH - 17, 2.3, 0, Math.PI * 2);
                ctx.arc(10, slideTop + slideH - 17, 2.3, 0, Math.PI * 2);
                ctx.fill();
            }

            // Namlu alevi ışık parıltısı
            if (flashGlow > 0.04) {
                ctx.save();
                ctx.fillStyle = `rgba(255, 200, 100, ${flashGlow * 0.4})`;
                ctx.beginPath();
                ctx.ellipse(0, slideTop + 30, 18, 40, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            ctx.restore();
        }

        ctx.restore();
    }

    // Taktik nişangah reticle çizimi (Hareketli hedef duyarlı)
    function drawTacticalReticle(ctx, aimX, aimY, dist, baseSize, baseY, tgtCenterX = 480) {
        const camFocusX = 480;
        const camFocusY = 220;
        const worldAimX = (aimX - camFocusX) / fpsCurrentZoom + camFocusX;
        const worldAimY = (aimY - camFocusY) / fpsCurrentZoom + camFocusY;

        const tgtLeft = tgtCenterX - baseSize / 2;
        const tgtRight = tgtCenterX + baseSize / 2;
        const tgtTop = baseY - baseSize / 2;
        const tgtBottom = baseY + baseSize / 2;

        const isOverTarget = (worldAimX >= tgtLeft && worldAimX <= tgtRight && worldAimY >= tgtTop && worldAimY <= tgtBottom);

        ctx.save();
        const currentMode = (lastStatusData && lastStatusData.input_mode) ? lastStatusData.input_mode : 'MOUSE';

        if (currentMode === 'LASER') {
            const isFired = lastStatusData && lastStatusData.laser_active;
            ctx.shadowColor = '#ff1133';
            ctx.shadowBlur = isFired ? 22 : 14;

            // Parlak Kırmızı Lazer Noktası ve Işıma (Görünür Kırmızı Lazer Ucu)
            const dotGrad = ctx.createRadialGradient(aimX, aimY, 1, aimX, aimY, isFired ? 14 : 9);
            dotGrad.addColorStop(0, '#ffffff');
            dotGrad.addColorStop(0.35, '#ff2244');
            dotGrad.addColorStop(1, 'rgba(255, 34, 68, 0)');
            ctx.fillStyle = dotGrad;
            ctx.beginPath();
            ctx.arc(aimX, aimY, isFired ? 14 : 9, 0, Math.PI * 2);
            ctx.fill();

            // Merkez Beyaz Sıcak Nokta
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(aimX, aimY, 2.5, 0, Math.PI * 2);
            ctx.fill();

            // Dış Kırmızı Taktik Halka
            ctx.strokeStyle = isFired ? '#ffffff' : (isOverTarget ? '#ff3366' : 'rgba(255, 50, 80, 0.85)');
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(aimX, aimY, isFpsZoomed ? 12 : 16, 0, Math.PI * 2);
            ctx.stroke();

            // 4 Yönlü Kılavuz Çizgileri
            const gap = isFpsZoomed ? 5 : 7;
            const len = isFpsZoomed ? 12 : 16;
            ctx.beginPath();
            ctx.moveTo(aimX - gap - len, aimY); ctx.lineTo(aimX - gap, aimY);
            ctx.moveTo(aimX + gap, aimY); ctx.lineTo(aimX + gap + len, aimY);
            ctx.moveTo(aimX, aimY - gap - len); ctx.lineTo(aimX, aimY - gap);
            ctx.moveTo(aimX, aimY + gap); ctx.lineTo(aimX, aimY + gap + len);
            ctx.stroke();

        } else {
            const retColor = isOverTarget ? '#00f076' : 'rgba(255, 183, 3, 0.85)';
            const glowColor = isOverTarget ? 'rgba(0, 240, 118, 0.5)' : 'rgba(255, 183, 3, 0.3)';

            ctx.shadowColor = glowColor;
            ctx.shadowBlur = 8;
            ctx.strokeStyle = retColor;
            ctx.lineWidth = 1.5;

            // Dış hedef halkası
            ctx.beginPath();
            ctx.arc(aimX, aimY, isFpsZoomed ? 12 : 16, 0, Math.PI * 2);
            ctx.stroke();

            // 4 Yönlü Kılavuz Çizgileri
            const gap = isFpsZoomed ? 5 : 7;
            const len = isFpsZoomed ? 12 : 16;
            ctx.beginPath();
            ctx.moveTo(aimX - gap - len, aimY);
            ctx.lineTo(aimX - gap, aimY);
            ctx.moveTo(aimX + gap, aimY);
            ctx.lineTo(aimX + gap + len, aimY);
            ctx.moveTo(aimX, aimY - gap - len);
            ctx.lineTo(aimX, aimY - gap);
            ctx.moveTo(aimX, aimY + gap);
            ctx.lineTo(aimX, aimY + gap + len);
            ctx.stroke();

            // Lazer Noktası
            ctx.fillStyle = isOverTarget ? '#00ffcc' : '#ff3344';
            ctx.beginPath();
            ctx.arc(aimX, aimY, 2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    // Fare Etkinlikleri
    if (fpsCanvas) {
        fpsCanvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        fpsCanvas.addEventListener('mousemove', (e) => {
            const rect = fpsCanvas.getBoundingClientRect();
            const scaleX = fpsCanvas.width / rect.width;
            const scaleY = fpsCanvas.height / rect.height;
            fpsAimX = (e.clientX - rect.left) * scaleX;
            fpsAimY = (e.clientY - rect.top) * scaleY;
        });

        fpsCanvas.addEventListener('mousedown', async (e) => {
            e.preventDefault();
            if (e.button === 2) {
                // SAĞ TIK: ZOOM AÇ / KAPAT
                toggleFpsZoomState();
            } else if (e.button === 0) {
                // SOL TIK: ATEŞ ET (ZOOM OLSUN OLMASIN HER DURUMDA ÇALIŞIR)
                await executeFpsShot();
            }
        });
    }

    // Klavye Kısayolları (Z = Zoom)
    window.addEventListener('keydown', async (e) => {
        if (!isFpsModeActive || activeTab !== 'paper') return;
        if (e.code === 'KeyZ') {
            e.preventDefault();
            toggleFpsZoomState();
        }
    });

    async function executeFpsShot() {
        const currentWeapon = tacticalAudio.currentWeapon || (paperWeaponSelect ? paperWeaponSelect.value : 'Glock19');

        // Geri tepme tamamen sıfırlandı (Sekme, zıplama ve kayma yok)
        fpsRecoilY = 0;
        fpsRecoilAngle = 0;
        fpsRecoilSlide = 0;
        fpsMuzzleAlpha = 0;

        // Fırlayan kovan
        fpsCasings.push({
            x: 535,
            y: 500 + fpsRecoilY,
            vx: 7 + Math.random() * 4,
            vy: -8 - Math.random() * 4,
            rot: 0,
            vrot: 0.32,
            life: 45
        });

        // Silah patlama sesi
        tacticalAudio.playShot(currentWeapon);

        // Hedef kağıdı koordinat hesaplaması
        const dist = (currentPaperState && currentPaperState.distance) ? currentPaperState.distance : 15;
        const { baseSize, baseY } = getFpsTargetMetrics(dist);

        // Zoom transformunun tersini alarak dünya koordinatlarındaki nişan noktasını bul
        const camFocusX = 480;
        const camFocusY = 220;
        const worldAimX = (fpsAimX - camFocusX) / fpsCurrentZoom + camFocusX;
        const worldAimY = (fpsAimY - camFocusY) / fpsCurrentZoom + camFocusY;

        // Hareketli hedef koordinatını hesaba kat
        const tgtCenterX = 480 + (isPaperMovingTarget ? Math.sin(fpsTime * 1.1) * 150 : 0);
        const tgtLeft = tgtCenterX - baseSize / 2;
        const tgtTop = baseY - baseSize / 2;

        // 512x512 kağıt koordinatlarına izdüşür
        const paperX = ((worldAimX - tgtLeft) / baseSize) * 512.0;
        const paperY = ((worldAimY - tgtTop) / baseSize) * 512.0;

        const isHitTarget = (paperX >= 0 && paperX <= 512 && paperY >= 0 && paperY <= 512);

        if (!isHitTarget) {
            // Iska: Çelik duvardan kıvılcım çıkar
            for (let i = 0; i < 6; i++) {
                fpsImpactSparks.push({
                    x: worldAimX,
                    y: worldAimY,
                    vx: (Math.random() - 0.5) * 6,
                    vy: (Math.random() - 0.7) * 6,
                    r: 1.5 + Math.random() * 2,
                    alpha: 1.0
                });
            }
        }

        try {
            const res = await fetch('/api/paper/shoot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    x: Math.round(paperX),
                    y: Math.round(paperY),
                    yontem: isFpsZoomed ? 'FPS_ZOOM' : 'FPS_SERBEST',
                    weapon: currentWeapon
                })
            });

            if (res.ok) {
                const data = await res.json();
                currentPaperState = data.state;
                updatePaperUI(data.state);
                showPaperHudAlert(data.shot);

                // Yüzen skor efekti
                if (data.shot) {
                    const hitText = data.shot.is_penalty ? 'CEZA!' : (data.shot.puan > 0 ? `+${data.shot.puan}` : 'ISKA');
                    const hitColor = data.shot.is_penalty ? 'rgb(255, 51, 102)' : (data.shot.puan >= 9 ? 'rgb(0, 255, 204)' : 'rgb(255, 183, 3)');
                    fpsFloatPopups.push({
                        x: worldAimX,
                        y: worldAimY - 10,
                        text: hitText,
                        color: hitColor,
                        alpha: 1.0
                    });
                }

                if (data.shot.is_penalty) {
                    tacticalAudio.playHit('FRIENDLY_FIRE');
                } else if (data.shot.puan > 0) {
                    tacticalAudio.playHit('PAPER_HIT');
                } else {
                    tacticalAudio.playHit('STEEL_HIT');
                }
            }
        } catch (err) {
            console.error(err);
        }
    }

    // =============================================================
    // 3. SEKME: RAPORLAR & ANALİTİK (CHART.JS & DİNAMİK GRAFİKLER)
    // =============================================================
    let chartPieInstance = null;
    let chartTrendInstance = null;
    let chartBarInstance = null;
    let chartTriggerInstance = null;

    const btnPrintReport = document.getElementById('btnPrintReport');
    if (btnPrintReport) {
        btnPrintReport.addEventListener('click', () => {
            window.print();
        });
    }
    const btnPrintReportInner = document.getElementById('btnPrintReportInner');
    if (btnPrintReportInner) {
        btnPrintReportInner.addEventListener('click', () => {
            window.print();
        });
    }

    async function loadAnalytics() {
        try {
            const res = await fetch('/api/analytics/session');
            if (!res.ok) return;
            const data = await res.json();

            // 1. Bölüm 4: İsabet Grafikleri (Isı Haritası & Grupman Dağılımı)
            renderHitAccuracySection(data);

            // 2. Bölüm 5: Hata Analizi (Pasta, Trend & Tetik Skor Barları)
            renderFaultAnalysisSection(data);

            // 3. Bölüm: Oturum Raporu (Kullanıcı Künyesi, Genel Oturum Tablosu, B-27 Silüet & Tetik Eğrisi)
            renderOfficialReportSection(data);
        } catch (err) {
            console.error("Analitik verisi alınamadı", err);
        }
    }

    // -------------------------------------------------------------
    // BÖLÜM 4: İSABET GRAFİKLERİ (SCREENSHOT 1 - ÜST KISIM)
    // -------------------------------------------------------------
    function renderHitAccuracySection(data) {
        // A) Atış Isı Haritası (canvasHeatmap)
        const canvasHeat = document.getElementById('canvasHeatmap');
        if (canvasHeat) {
            drawHeatmapCanvas(canvasHeat, data.holes || []);
        }

        // B) Average Impact Point / Spread (canvasSpread)
        const canvasSpread = document.getElementById('canvasSpread');
        if (canvasSpread) {
            drawSpreadCanvas(canvasSpread, data);
        }

        // C) 5'li Gösterge Rozetleri
        const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setTxt('valAvgX', Number(data.avg_x || 0).toFixed(1));
        setTxt('valAvgY', Number(data.avg_y || 0).toFixed(1));
        setTxt('valGroupingRadius', Number(data.grouping_radius_cm || 0).toFixed(1));
        setTxt('valImpactsCount', data.impacts !== undefined ? data.impacts : (data.hits || 0));
        setTxt('valAvgDist', Number(data.avg_distance || 10).toFixed(1));

        // D) Özet Metin Listesi
        setTxt('txtAvgPointX', Number(data.avg_x || 0).toFixed(1));
        setTxt('txtAvgPointY', Number(data.avg_y || 0).toFixed(1));
        setTxt('txtGroupingRadius', Number(data.grouping_radius_cm || 0).toFixed(1));
        setTxt('txtVurusSayisi', data.impacts !== undefined ? data.impacts : (data.hits || 0));
        setTxt('txtOrtMesafe', Number(data.avg_distance || 10).toFixed(1));
    }

    function drawHeatmapCanvas(canvas, holes) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const cx = w / 2;
        const cy = h / 2;

        ctx.clearRect(0, 0, w, h);

        // Koyu Antrasit Taktik Arka Plan
        ctx.fillStyle = '#11141b';
        ctx.fillRect(0, 0, w, h);

        // Eş Merkezli Taktik Nişangah Halkaları
        const radii = [28, 62, 98, 134, 162];
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.lineWidth = 1;
        radii.forEach(r => {
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
        });

        // Çapraz / Artı Kılavuz Çizgileri
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.beginPath();
        ctx.moveTo(0, cy); ctx.lineTo(w, cy);
        ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
        ctx.stroke();

        // Isı Haritası Noktalarının Çizimi (Dinamik Kırmızı Işıma)
        if (holes && holes.length > 0) {
            holes.forEach(hole => {
                const hx = (hole.x / 512.0) * w;
                const hy = (hole.y / 512.0) * h;

                const heatGrad = ctx.createRadialGradient(hx, hy, 1, hx, hy, 26);
                heatGrad.addColorStop(0, 'rgba(239, 68, 68, 0.70)');
                heatGrad.addColorStop(0.35, 'rgba(239, 68, 68, 0.35)');
                heatGrad.addColorStop(0.7, 'rgba(248, 113, 113, 0.12)');
                heatGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');

                ctx.fillStyle = heatGrad;
                ctx.beginPath();
                ctx.arc(hx, hy, 26, 0, Math.PI * 2);
                ctx.fill();

                // Merkez Isı Çekirdeği
                ctx.beginPath();
                ctx.arc(hx, hy, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#f87171';
                ctx.fill();
            });
        } else {
            // Başlangıç Yumuşak Merkez Isı Noktası (Screenshot 1 Uyumu)
            const initGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 22);
            initGrad.addColorStop(0, '#ef4444');
            initGrad.addColorStop(0.5, 'rgba(239, 68, 68, 0.5)');
            initGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
            ctx.fillStyle = initGrad;
            ctx.beginPath();
            ctx.arc(cx, cy, 22, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.arc(cx, cy, 9, 0, Math.PI * 2);
            ctx.fillStyle = '#ef4444';
            ctx.fill();
        }
    }

    function drawSpreadCanvas(canvas, data) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const cx = w / 2;
        const cy = h / 2;

        ctx.clearRect(0, 0, w, h);

        // Koyu Antrasit Arka Plan
        ctx.fillStyle = '#11141b';
        ctx.fillRect(0, 0, w, h);

        // Nişangah Daireleri
        const radii = [24, 48, 72, 96];
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
        ctx.lineWidth = 1;
        radii.forEach(r => {
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.stroke();
        });

        // Kılavuz Çizgileri
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.beginPath();
        ctx.moveTo(0, cy); ctx.lineTo(w, cy);
        ctx.moveTo(cx, 0); ctx.lineTo(cx, h);
        ctx.stroke();

        // Ortalama Sapma Noktası (Avg Point & Spread Crosshair - 1:1 Senkronize)
        const avgX = Number(data.avg_x || 0);
        const avgY = Number(data.avg_y || 0);
        const spotX = cx + (avgX * 0.45);
        const spotY = cy + (avgY * 0.45);

        // Grupman Yayılım Dairesi (Kesikli Çizgi)
        const grRadius = Math.max(10, (data.grouping_radius_cm || 0) * 4.0);
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.40)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(spotX, spotY, grRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Soft Cyan Nişangah Artısı (+)
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2;
        const cLen = 9;
        ctx.beginPath();
        ctx.moveTo(spotX - cLen, spotY); ctx.lineTo(spotX + cLen, spotY);
        ctx.moveTo(spotX, spotY - cLen); ctx.lineTo(spotX, spotY + cLen);
        ctx.stroke();

        // Merkez Parlama Noktası
        ctx.beginPath();
        ctx.arc(spotX, spotY, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }

    // -------------------------------------------------------------
    // BÖLÜM 5: HATA ANALİZİ (SCREENSHOT 1 - ALT KISIM)
    // -------------------------------------------------------------
    function renderFaultAnalysisSection(data) {
        const categories = [
            "Hatasız (OK)",
            "Duruş / Tutuş / Kas",
            "Nefes Kontrolü",
            "Tetik Sarsması",
            "Gevşek Tutuş / Denge",
            "Aşırı Sıkı Tutuş",
            "Atış Sonrası Takip"
        ];
        // Soft, mat ve göz yormayan kurumsal pastel renkler (Asla Neon Değil)
        const softColors = [
            '#10b981', // Hatasız (OK) (Soft Zümrüt Yeşili)
            '#ef4444', // Duruş / Tutuş / Kas (Soft Mercan Kırmızı)
            '#0ea5e9', // Nefes Kontrolü (Soft Gök Mavisi)
            '#f59e0b', // Tetik Sarsması (Soft Kehribar Sarı)
            '#a855f7', // Gevşek Tutuş / Denge (Soft Mor)
            '#14b8a6', // Aşırı Sıkı Tutuş (Soft Turkuaz)
            '#fb923c'  // Atış Sonrası Takip (Soft Turuncu)
        ];

        const counts = data.fault_counts || {};
        const pcts = data.fault_percentages || {};
        const avgTriggers = data.fault_avg_triggers || {};

        const chartVals = categories.map(c => counts[c] || 0);
        const hasData = chartVals.some(v => v > 0);
        const displayVals = hasData ? chartVals : [52, 24, 12, 6, 3, 2, 1];

        // 1. SOL: Hata Kodu Pasta Grafiği (Doughnut Chart)
        const ctxPie = document.getElementById('chartFaultPie');
        if (ctxPie) {
            if (chartPieInstance) chartPieInstance.destroy();
            chartPieInstance = new Chart(ctxPie, {
                type: 'doughnut',
                data: {
                    labels: categories,
                    datasets: [{
                        data: displayVals,
                        backgroundColor: softColors,
                        borderColor: '#11141b',
                        borderWidth: 2,
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: (item) => ` ${item.label}: %${pcts[item.label] !== undefined ? pcts[item.label] : item.raw}`
                            }
                        }
                    },
                    cutout: '60%'
                }
            });
        }

        // Pasta Altı Rozet Izgarası (Screenshot 1 Alt Kutuları)
        const legendGrid = document.getElementById('faultLegendGrid');
        if (legendGrid) {
            legendGrid.innerHTML = categories.map((cat, idx) => {
                const pct = pcts[cat] !== undefined ? pcts[cat] : (displayVals[idx] || 0);
                const avgTrig = avgTriggers[cat] !== undefined ? avgTriggers[cat] : (cat === 'Hatasız (OK)' ? 88.0 : (cat === 'Duruş / Tutuş / Kas' ? 22.5 : 60.0));
                return `
                    <div class="fault-legend-item">
                        <span class="f-dot" style="background: ${softColors[idx]};"></span>
                        <span>${cat}: <strong>%${pct} | Ort. ${avgTrig}</strong></span>
                    </div>
                `;
            }).join('');
        }

        const txtAvgTrig = document.getElementById('txtAvgTriggerScore');
        if (txtAvgTrig) {
            txtAvgTrig.textContent = data.avg_trigger !== undefined ? Number(data.avg_trigger).toFixed(1) : '13.4';
        }

        // 2. ORTA: Oturumlara Göre Hata Trendi (Line / Scatter Chart)
        const ctxTrend = document.getElementById('chartErrorTrend');
        if (ctxTrend) {
            if (chartTrendInstance) chartTrendInstance.destroy();
            const trendLabels = data.trend_labels && data.trend_labels.length > 0 ? data.trend_labels : ['1', '2', '3', '4', '5', '6'];
            const trendVals = data.trend_vals && data.trend_vals.length > 0 ? data.trend_vals : [26, 20, 16, 2, 1, 26];

            chartTrendInstance = new Chart(ctxTrend, {
                type: 'line',
                data: {
                    labels: trendLabels,
                    datasets: [{
                        label: 'Hata Değeri',
                        data: trendVals,
                        borderColor: 'rgba(100, 116, 139, 0.4)',
                        borderWidth: 1.5,
                        pointBackgroundColor: '#ef4444',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 1,
                        pointRadius: 4,
                        tension: 0.2,
                        showLine: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            min: 0,
                            max: 30,
                            ticks: { stepSize: 6, color: '#64748b', font: { size: 9 } },
                            grid: { color: 'rgba(255, 255, 255, 0.08)' }
                        },
                        x: {
                            ticks: { color: '#64748b', font: { size: 9 } },
                            grid: { display: false }
                        }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }

        // Dominant Fault Başlığı
        const dominantVal = document.getElementById('dominantFaultVal');
        if (dominantVal) {
            dominantVal.textContent = data.dominant_fault || 'Duruş / Tutuş / Kas (%24.0)';
        }

        // Orta Kart Döküm Listesi (Screenshot 1 Orta Kısım)
        const breakdownList = document.getElementById('faultBreakdownList');
        if (breakdownList) {
            const listCats = [
                "Duruş / Tutuş / Kas",
                "Nefes Kontrolü",
                "Tetik Sarsması",
                "Gevşek Tutuş / Denge",
                "Aşırı Sıkı Tutuş",
                "Atış Sonrası Takip"
            ];
            breakdownList.innerHTML = listCats.map(cat => {
                const pct = pcts[cat] !== undefined ? pcts[cat] : (cat === 'Duruş / Tutuş / Kas' ? '24.0' : (cat === 'Nefes Kontrolü' ? '12.0' : '6.0'));
                return `
                    <div class="fault-breakdown-item">
                        <span>${cat}</span>
                        <strong>%${pct}</strong>
                    </div>
                `;
            }).join('');
        }

        // 3. SAĞ: Hata Türüne Göre Tetik Skoru (Bar Chart & Stat Kutuları)
        const ctxBar = document.getElementById('chartTriggerByFault');
        if (ctxBar) {
            if (chartBarInstance) chartBarInstance.destroy();
            const barVals = categories.map(cat => avgTriggers[cat] !== undefined ? avgTriggers[cat] : (cat === 'Hatasız (OK)' ? 88 : (cat === 'Aşırı Sıkı Tutuş' ? 87 : (cat === 'Nefes Kontrolü' ? 78 : 50))));

            chartBarInstance = new Chart(ctxBar, {
                type: 'bar',
                data: {
                    labels: categories,
                    datasets: [{
                        data: barVals,
                        backgroundColor: softColors,
                        borderRadius: 3,
                        barThickness: 16
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            min: 0,
                            max: 100,
                            ticks: { stepSize: 25, color: '#64748b', font: { size: 9 } },
                            grid: { color: 'rgba(255, 255, 255, 0.08)' }
                        },
                        x: {
                            display: false,
                            grid: { display: false }
                        }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }

        // 4 Stat Kutusu
        const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        setTxt('statAvgTriggerVal', data.avg_trigger !== undefined ? Number(data.avg_trigger).toFixed(1) : '13.4');
        setTxt('statLowestTrigger', data.lowest_trigger_group || 'Duruş / Tutuş / Kas: 22.5');
        setTxt('statBestTrigger', data.best_trigger_group || 'Hatasız (OK): 88.0');
        setTxt('statFaultTypesCount', data.fault_types_count || '7');
    }

    // -------------------------------------------------------------
    // RESMİ OTURUM RAPORU SAYFASI (SCREENSHOT 2)
    // -------------------------------------------------------------
    function renderOfficialReportSection(data) {
        const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

        // 2. Genel Oturum Bilgisi
        setTxt('repLaserId', data.laser_active ? '1' : '1');
        setTxt('repSessionId', data.session_id || '20260716000216');
        setTxt('repTotalShots', data.total_shots !== undefined ? data.total_shots : 0);
        setTxt('repTotalScore', data.total_score !== undefined ? data.total_score : 0);
        setTxt('repMisses', data.misses !== undefined ? data.misses : 0);
        setTxt('repKills', data.kills !== undefined ? data.kills : 0);
        setTxt('repDifficulty', 'Kolay');
        setTxt('repHealth', 'En Yüksek');
        setTxt('repLaserStatus', data.laser_active ? 'Açık' : 'Açık');
        setTxt('repAvgScore', Number(data.avg_score || 0).toFixed(1));
        setTxt('repBestScore', data.best_score || 0);
        setTxt('repAvgSplit', `${Number(data.avg_split || 2.90).toFixed(2)} sn`);
        setTxt('repFastestSplit', `${Number(data.fastest_split || 0.09).toFixed(2)} sn`);
        setTxt('repGrouping', `${Number(data.grouping_radius_cm || 0).toFixed(1)} cm`);
        setTxt('repAvgTrigger', Number(data.avg_trigger || 16.6).toFixed(1));

        // 3. Senaryo Atış Sonuçları (B-27 Silüet Tuvali)
        const canvasRepB27 = document.getElementById('canvasReportSilhouette');
        if (canvasRepB27) {
            drawReportSilhouetteCanvas(canvasRepB27, data.holes || []);
        }

        // 4. Tetik Skoru Grafiği (Screenshot 2 Alt Kısım)
        const ctxTrigger = document.getElementById('chartTriggerCurve');
        if (ctxTrigger) {
            if (chartTriggerInstance) chartTriggerInstance.destroy();
            const labels = data.labels && data.labels.length > 0 ? data.labels : Array.from({ length: Math.max(1, data.total_shots || 28) }, (_, i) => String(i + 1));
            const trgScores = data.trigger_scores && data.trigger_scores.length > 0 ? data.trigger_scores : [0, 0, 0, 0, 0, 58, 0, 30, 12, 85, 12, 8, 75, 78, 28, 9, 12, 88, 0, 0, 0, 0, 52, 0, 0, 26, 0, 4];

            chartTriggerInstance = new Chart(ctxTrigger, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Tetik Skoru',
                        data: trgScores,
                        borderColor: '#0284c7',
                        borderWidth: 2,
                        pointBackgroundColor: '#38bdf8',
                        pointBorderColor: '#ffffff',
                        pointBorderWidth: 1,
                        pointRadius: 2.5,
                        tension: 0.15
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            min: 0,
                            max: 100,
                            ticks: { stepSize: 20, color: '#94a3b8', font: { size: 10 } },
                            grid: { color: 'rgba(255, 255, 255, 0.08)' }
                        },
                        x: {
                            ticks: {
                                color: '#94a3b8',
                                font: { size: 9 },
                                maxRotation: 0,
                                autoSkip: true,
                                maxTicksLimit: 15
                            },
                            grid: { display: false }
                        }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }

        const repFooter = document.getElementById('repTriggerFooterText');
        if (repFooter) {
            repFooter.textContent = `Oturum ID ${data.session_id || '20260716000216'} için ${data.total_shots || 0} adet tetik skoru yüklendi`;
        }
    }

    function drawReportSilhouetteCanvas(canvas, holes) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const cx = w / 2;
        const cy = h / 2;

        ctx.clearRect(0, 0, w, h);

        // Koyu Tema / Dark Mode Uyumlu Mat Arka Plan
        ctx.fillStyle = '#131720';
        ctx.fillRect(0, 0, w, h);

        // B-27 Silüetini Çiz
        const b27Img = getLoadedTargetImage('target_4_silhouette.png');
        if (b27Img && b27Img.complete && b27Img.naturalWidth > 0) {
            const targetW = 280;
            const targetH = 380;
            ctx.drawImage(b27Img, cx - targetW / 2, cy - targetH / 2, targetW, targetH);
        } else {
            // Vektörel B-27 Taktik Gövde Silüeti (Dark Mode Uyumlu)
            ctx.fillStyle = '#1e2634';
            // Baş
            ctx.beginPath();
            ctx.arc(cx, cy - 120, 36, 0, Math.PI * 2);
            ctx.fill();
            // Gövde ve Omuzlar
            ctx.beginPath();
            ctx.moveTo(cx - 100, cy + 160);
            ctx.lineTo(cx - 95, cy - 50);
            ctx.quadraticCurveTo(cx - 90, cy - 90, cx - 45, cy - 95);
            ctx.lineTo(cx + 45, cy - 95);
            ctx.quadraticCurveTo(cx + 90, cy - 90, cx + 95, cy - 50);
            ctx.lineTo(cx + 100, cy + 160);
            ctx.closePath();
            ctx.fill();

            // Puan Halkaları (7, 8, 9, 10, X)
            const rings = [
                { rx: 75, ry: 105, text: '7' },
                { rx: 58, ry: 82, text: '8' },
                { rx: 42, ry: 60, text: '9' },
                { rx: 26, ry: 38, text: '10' },
                { rx: 12, ry: 18, text: 'X' }
            ];
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            rings.forEach(r => {
                ctx.beginPath();
                ctx.ellipse(cx, cy + 20, r.rx, r.ry, 0, 0, Math.PI * 2);
                ctx.stroke();
            });

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 12px Rajdhani, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('X', cx, cy + 20);
        }

        // Atış Delikleri (Holes) ve Numaraları
        if (holes && holes.length > 0) {
            holes.forEach((hole, idx) => {
                const hx = (hole.x / 512.0) * w;
                const hy = (hole.y / 512.0) * h;

                // Mavi Mermi İzi
                ctx.beginPath();
                ctx.arc(hx, hy, 4, 0, Math.PI * 2);
                ctx.fillStyle = '#0284c7';
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.stroke();

                // Numara Etiketi
                ctx.fillStyle = '#f8fafc';
                ctx.font = 'bold 10px Rajdhani, sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(String(idx + 1), hx + 5, hy - 4);
            });
        }
    }

    // =============================================================
    // 4. SEKME: AYARLAR & YAZILIM KALİBRASYONU (SCREENSHOT 1)
    // =============================================================
    const selectWeaponType = document.getElementById('selectWeaponType');
    const imgWeaponPreview = document.getElementById('imgWeaponPreview');
    const txtWeaponName = document.getElementById('txtWeaponName');
    const txtWeaponCaliber = document.getElementById('txtWeaponCaliber');

    const valOffsetX = document.getElementById('valOffsetX');
    const valOffsetY = document.getElementById('valOffsetY');
    const btnResetOffsets = document.getElementById('btnResetOffsets');
    const stepBtns = document.querySelectorAll('.btn-step');

    const inputProfAd = document.getElementById('inputProfAd');
    const inputProfSoyad = document.getElementById('inputProfSoyad');
    const inputProfUser = document.getElementById('inputProfUser');
    const inputProfNo = document.getElementById('inputProfNo');
    const inputProfSinif = document.getElementById('inputProfSinif');
    const inputProfOkul = document.getElementById('inputProfOkul');
    const inputProfYas = document.getElementById('inputProfYas');
    const inputProfDeneyim = document.getElementById('inputProfDeneyim');
    const btnSaveProfile = document.getElementById('btnSaveProfile');

    async function loadSettings() {
        try {
            const res = await fetch('/api/settings/get');
            if (!res.ok) return;
            const data = await res.json();

            // Ofsetler
            if (valOffsetX) valOffsetX.textContent = (data.offset_x > 0 ? '+' : '') + data.offset_x;
            if (valOffsetY) valOffsetY.textContent = (data.offset_y > 0 ? '+' : '') + data.offset_y;

            // Silah
            if (selectWeaponType) selectWeaponType.value = data.weapon_type;
            if (quickSelectWeapon) quickSelectWeapon.value = data.weapon_type;
            if (data.weapon_type) tacticalAudio.setWeapon(data.weapon_type);
            if (data.weapons && data.weapon_type && data.weapons[data.weapon_type]) {
                const wInfo = data.weapons[data.weapon_type];
                if (txtWeaponName) txtWeaponName.textContent = wInfo.name || data.weapon_type;
                if (txtWeaponCaliber) txtWeaponCaliber.textContent = `${wInfo.caliber || '9x19mm'} | ${wInfo.cap || 15} Mermi Kapasitesi`;
                if (imgWeaponPreview && wInfo.img) imgWeaponPreview.src = wInfo.img;
            }

            // Profil Formu
            const p = data.profile || {};
            if (inputProfAd) inputProfAd.value = p.ad || 'Ahmet';
            if (inputProfSoyad) inputProfSoyad.value = p.soyad || 'Yılmaz';
            if (inputProfUser) inputProfUser.value = p.kullanici_adi || 'DefaultUser';
            if (inputProfNo) inputProfNo.value = p.ogrenci_no || '2026-0716';
            if (inputProfSinif) inputProfSinif.value = p.sinif || 'Taktik-A';
            if (inputProfOkul) inputProfOkul.value = p.okul_id || '101';
            if (inputProfYas) inputProfYas.value = p.yas || 26;
            if (inputProfDeneyim) inputProfDeneyim.value = p.deneyim || 3;
        } catch (err) {
            console.error(err);
        }
    }

    // Silah Değişimi
    if (selectWeaponType) {
        selectWeaponType.addEventListener('change', async () => {
            const weapon = selectWeaponType.value;
            tacticalAudio.setWeapon(weapon);
            if (quickSelectWeapon) quickSelectWeapon.value = weapon;
            if (paperWeaponSelect) paperWeaponSelect.value = weapon;
            renderPaperCanvas();
            // Yeni seçilen silahın sesini hemen kullanıcıya dinlet
            tacticalAudio.playShot(weapon);
            try {
                await fetch('/api/settings/weapon', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ weapon })
                });
                await loadSettings();
            } catch (err) {
                console.error(err);
            }
        });
    }

    // Ofset Adım Butonları (-- / - / + / ++)
    stepBtns.forEach(btn => {
        btn.addEventListener('click', async () => {
            const axis = btn.getAttribute('data-axis');
            const step = parseInt(btn.getAttribute('data-step'));
            try {
                const res = await fetch('/api/settings/offset_step', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ axis, step })
                });
                if (res.ok) {
                    const data = await res.json();
                    if (valOffsetX) valOffsetX.textContent = (data.offset_x > 0 ? '+' : '') + data.offset_x;
                    if (valOffsetY) valOffsetY.textContent = (data.offset_y > 0 ? '+' : '') + data.offset_y;
                }
            } catch (err) {
                console.error(err);
            }
        });
    });

    // Ofsetleri Sıfırla
    if (btnResetOffsets) {
        btnResetOffsets.addEventListener('click', async () => {
            try {
                const res = await fetch('/api/settings/offset_reset', { method: 'POST' });
                if (res.ok) {
                    const data = await res.json();
                    if (valOffsetX) valOffsetX.textContent = '0';
                    if (valOffsetY) valOffsetY.textContent = '0';
                }
            } catch (err) {
                console.error(err);
            }
        });
    }

    // =========================================================================
    // FİZİKSEL LAZER VE GİRDİ MODU KONTROLLLERİ (OPENCV LAZER TAKİBİ)
    // =========================================================================
    document.querySelectorAll('.btn-input-mode, #settingsInputModeGroup .btn-segment').forEach(btn => {
        btn.addEventListener('click', async () => {
            const mode = btn.getAttribute('data-mode');
            if (!mode) return;
            document.querySelectorAll('.btn-input-mode, #settingsInputModeGroup .btn-segment').forEach(b => {
                b.classList.toggle('active', b.getAttribute('data-mode') === mode);
            });
            updateLaserSettingsUI(mode);
            try {
                await fetch('/api/input_mode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ mode })
                });
            } catch (e) {}
        });
    });

    document.querySelectorAll('#settingsLaserColorGroup .btn-segment').forEach(btn => {
        btn.addEventListener('click', async () => {
            const color = btn.getAttribute('data-color');
            if (!color) return;
            document.querySelectorAll('#settingsLaserColorGroup .btn-segment').forEach(b => {
                b.classList.toggle('active', b.getAttribute('data-color') === color);
            });
            try {
                await fetch('/api/laser/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ color })
                });
            } catch (e) {}
        });
    });

    const rangeLaserThreshold = document.getElementById('rangeLaserThreshold');
    const valLaserThreshold = document.getElementById('valLaserThreshold');
    if (rangeLaserThreshold) {
        rangeLaserThreshold.addEventListener('input', () => {
            if (valLaserThreshold) valLaserThreshold.textContent = rangeLaserThreshold.value;
        });
        rangeLaserThreshold.addEventListener('change', async () => {
            try {
                await fetch('/api/laser/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ threshold: parseInt(rangeLaserThreshold.value) })
                });
            } catch (e) {}
        });
    }

    const rangeLaserExposure = document.getElementById('rangeLaserExposure');
    const valLaserExposure = document.getElementById('valLaserExposure');
    if (rangeLaserExposure) {
        rangeLaserExposure.addEventListener('input', () => {
            if (valLaserExposure) valLaserExposure.textContent = `${rangeLaserExposure.value} EV`;
        });
        rangeLaserExposure.addEventListener('change', async () => {
            try {
                await fetch('/api/laser/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ exposure: parseInt(rangeLaserExposure.value) })
                });
            } catch (e) {}
        });
    }

    // Profil Kaydetme
    if (btnSaveProfile) {
        btnSaveProfile.addEventListener('click', async () => {
            const payload = {
                ad: inputProfAd.value.trim(),
                soyad: inputProfSoyad.value.trim(),
                kullanici_adi: inputProfUser.value.trim(),
                ogrenci_no: inputProfNo.value.trim(),
                sinif: inputProfSinif.value.trim(),
                okul_id: inputProfOkul.value.trim(),
                yas: parseInt(inputProfYas.value) || 26,
                deneyim: parseInt(inputProfDeneyim.value) || 3
            };
            try {
                const res = await fetch('/api/settings/profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    alert("Öğrenci ve Atıcı Profili Başarıyla Kaydedildi!");
                    if (shooterNameText) shooterNameText.textContent = `${payload.ad} ${payload.soyad}`;
                }
            } catch (e) {
                alert("Kayıt sırasında hata oluştu.");
            }
        });
    }

    // Global Klavye Kısayolları
    window.addEventListener('keydown', async (e) => {
        if (isEditingShooter) return;
        if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;

        // Space -> Ateş Et
        if (e.code === 'Space') {
            e.preventDefault();
            if (activeTab === 'sim') {
                tacticalAudio.playShot();
                await fetch('/api/shoot', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ x: currentMouseX, y: currentMouseY, weapon: tacticalAudio.currentWeapon })
                });
            } else if (activeTab === 'paper') {
                if (isFpsModeActive) {
                    await executeFpsShot();
                } else {
                    let sX = (paperAimX !== undefined && paperAimX !== null) ? paperAimX : 256;
                    let sY = (paperAimY !== undefined && paperAimY !== null) ? paperAimY : 256;
                    if (paperCanvas && lastMouseClientX >= 0 && lastMouseClientY >= 0) {
                        const rect = paperCanvas.getBoundingClientRect();
                        sX = Math.max(0, Math.min(512, Math.round((lastMouseClientX - rect.left) * (paperCanvas.width / rect.width))));
                        sY = Math.max(0, Math.min(512, Math.round((lastMouseClientY - rect.top) * (paperCanvas.height / rect.height))));
                    }
                    await executePaperShot(sX, sY, isPaperAiming ? 'MOUSE' : 'SPACE');
                }
            } else if (activeTab === 'duel') {
                fireDuelShot(1, 256, 256, 'KLAVYE');
            }
        }


        // G -> Gez-Göz-Arpacık Aç / Kapat
        if ((e.code === 'KeyG' || e.key === 'g' || e.key === 'G') && activeTab === 'paper') {
            if (btnToggleIronSight) btnToggleIronSight.click();
        }

        // R -> Sıfırla
        if (e.key === 'r' || e.key === 'R') {
            if (activeTab === 'sim') {
                await fetch('/api/reset', { method: 'POST' });
            } else if (activeTab === 'paper') {
                const res = await fetch('/api/paper/reset', { method: 'POST' });
                if (res.ok) {
                    const data = await res.json();
                    currentPaperState = data.state;
                    updatePaperUI(data.state);
                }
            }
        }

        // 1 - 8 tuşları (Tüm Eğitim Senaryoları)
        if (['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8'].includes(e.code)) {
            const num = parseInt(e.code.replace('Digit', ''));
            if (activeTab === 'sim') {
                await fetch(`/api/scenario/${num}`, { method: 'POST' });
            } else if (activeTab === 'paper' && num >= 1 && num <= 5) {
                const res = await fetch(`/api/paper/select/${num}`, { method: 'POST' });
                if (res.ok) {
                    const data = await res.json();
                    currentPaperState = data.state;
                    updatePaperUI(data.state);
                }
            }
        }

        // M -> Mesafe Döngüsü
        if (e.key === 'm' || e.key === 'M') {
            if (activeTab === 'sim') {
                await fetch('/api/cycle_distance', { method: 'POST' });
            } else if (activeTab === 'paper') {
                const currentDist = currentPaperState ? currentPaperState.distance : 15;
                const nextDist = currentDist === 5 ? 15 : (currentDist === 15 ? 25 : 5);
                const res = await fetch(`/api/paper/distance/${nextDist}`, { method: 'POST' });
                if (res.ok) fetchPaperState();
            }
        }
    });

    // -------------------------------------------------------------
    // ÖZEL POLİGON & SENARYO EDİTÖRÜ (SENARYO 8) KONTROLLERİ
    // -------------------------------------------------------------
    const s8SpeedSlider = document.getElementById('s8SpeedSlider') || document.getElementById('s9SpeedSlider');
    const s8SpeedVal = document.getElementById('s8SpeedVal') || document.getElementById('s9SpeedVal');
    const s8TargetType = document.getElementById('s8TargetType') || document.getElementById('s9TargetType');
    const s8TargetCount = document.getElementById('s8TargetCount') || document.getElementById('s9TargetCount');
    const s8TargetSize = document.getElementById('s8TargetSize') || document.getElementById('s9TargetSize');
    const btnLaunchCustom = document.getElementById('btnLaunchCustom');

    if (s8SpeedSlider && s8SpeedVal) {
        s8SpeedSlider.addEventListener('input', () => {
            s8SpeedVal.textContent = s8SpeedSlider.value;
        });
    }

    if (btnLaunchCustom) {
        btnLaunchCustom.addEventListener('click', async () => {
            const payload = {
                target_type: s8TargetType ? s8TargetType.value : 'moving',
                target_count: parseInt(s8TargetCount ? s8TargetCount.value : 3),
                speed: parseInt(s8SpeedSlider ? s8SpeedSlider.value : 5),
                size: s8TargetSize ? s8TargetSize.value : 'medium',
                duration: 30
            };
            try {
                const res = await fetch('/api/custom_scenario/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                if (res.ok) {
                    const simTabBtn = document.querySelector('.nav-tab-btn[data-tab="sim"]');
                    if (simTabBtn) simTabBtn.click();
                }
            } catch (err) {
                console.error("Özel senaryo başlatılamadı:", err);
            }
        });
    }

        // =========================================================================
    // 5. SEKME: 1V1 ÇİFT EL DÜELLOSU & YARIŞ SİSTEMİ
    // =========================================================================
    const duelCanvasLeft = document.getElementById('duelCanvasLeft');
    const duelCanvasRight = document.getElementById('duelCanvasRight');
    const duelCrosshairLeft = document.getElementById('duelCrosshairLeft');
    const duelCrosshairRight = document.getElementById('duelCrosshairRight');
    
    const duelP1Status = document.getElementById('duelP1Status');
    const duelP2Status = document.getElementById('duelP2Status');
    const duelP1Score = document.getElementById('duelP1Score');
    const duelP2Score = document.getElementById('duelP2Score');
    const duelP1Hits = document.getElementById('duelP1Hits');
    const duelP2Hits = document.getElementById('duelP2Hits');
    const duelP1Acc = document.getElementById('duelP1Acc');
    const duelP2Acc = document.getElementById('duelP2Acc');
    const duelP1Ammo = document.getElementById('duelP1Ammo');
    const duelP2Ammo = document.getElementById('duelP2Ammo');
    const duelTimerDisplay = document.getElementById('duelTimerDisplay');
    const duelLeaderText = document.getElementById('duelLeaderText');
    const duelP1TriggerState = document.getElementById('duelP1TriggerState');
    const duelP2TriggerState = document.getElementById('duelP2TriggerState');

    const btnDuelStartMatch = document.getElementById('btnDuelStartMatch');
    const btnDuelResetMatch = document.getElementById('btnDuelResetMatch');
    const duelP1SplitTime = document.getElementById('duelP1SplitTime');
    const duelP2SplitTime = document.getElementById('duelP2SplitTime');
    const duelArenaBoxLeft = document.getElementById('duelArenaBoxLeft');
    const duelArenaBoxRight = document.getElementById('duelArenaBoxRight');

    // Lobi & Ön-Hazırlık Öğeleri
    const btnDuelStartMatchBig = document.getElementById('btnDuelStartMatchBig');
    const duelLobbyCard = document.getElementById('duelLobbyCard');
    const duelIngameBar = document.getElementById('duelIngameBar');
    const duelHeaderBanner = document.getElementById('duelHeaderBanner');
    const duelArenasContainer = document.getElementById('duelArenasContainer');
    const btnReopenLobby = document.getElementById('btnReopenLobby');
    const duelActiveMetaText = document.getElementById('duelActiveMetaText');

    // AAR Zafer Modalı Öğeleri
    const duelVictoryModal = document.getElementById('duelVictoryModal');
    const victoryTitle = document.getElementById('victoryTitle');
    const victorySubtitle = document.getElementById('victorySubtitle');
    const victoryCardP1 = document.getElementById('victoryCardP1');
    const victoryCardP2 = document.getElementById('victoryCardP2');
    const vP1Score = document.getElementById('vP1Score');
    const vP2Score = document.getElementById('vP2Score');
    const vP1Hits = document.getElementById('vP1Hits');
    const vP2Hits = document.getElementById('vP2Hits');
    const vP1Acc = document.getElementById('vP1Acc');
    const vP2Acc = document.getElementById('vP2Acc');
    const vP1Rx = document.getElementById('vP1Rx');
    const vP2Rx = document.getElementById('vP2Rx');
    const vP1Grouping = document.getElementById('vP1Grouping');
    const vP2Grouping = document.getElementById('vP2Grouping');
    const vP1Diag = document.getElementById('vP1Diag');
    const vP2Diag = document.getElementById('vP2Diag');
    const btnDownloadDuelReport = document.getElementById('btnDownloadDuelReport');
    const btnCloseVictoryModal = document.getElementById('btnCloseVictoryModal');

    // Taktik Fener & Nişangah Takip Koordinatları
    let duelP1AimPos = { x: 256, y: 256, active: false };
    let duelP2AimPos = { x: 256, y: 256, active: false };
    let p1PlateTilt = [0, 0, 0, 0, 0];
    let p2PlateTilt = [0, 0, 0, 0, 0];

    let duelConfig = {
        target_type: 'knockdown_plates',
        distance: 10,
        format: '30s',
        duration: 30,
        max_ammo: 10,
        weapon: 'Glock19',
        input_mode: 'MOUSE'
    };

    let duelState = {
        is_active: false,
        remaining_seconds: 30,
        max_ammo: 10,
        p1: { score: 0, shots: 0, hits: 0, accuracy: 0, remaining_ammo: 10, holes: [], plates: [true,true,true,true,true] },
        p2: { score: 0, shots: 0, hits: 0, accuracy: 0, remaining_ammo: 10, holes: [], plates: [true,true,true,true,true] },
        leader: 'BERABERE'
    };

    let duelTargetImg = new Image();
    duelTargetImg.src = '/static/targets/' + duelConfig.target_type;

    // Hedef animasyonları (Moving Targets için)
    let duelMovingAngle = 0;
    let duelAnimFrameId = null;
    let lastDuelStateFetchTime = 0;
    let isDuelCountdownRunning = false;
    let duelMatchEndedModalShown = false;

    // Tetik ateşleme kilitleri ve kurma durumları (çift el bağımsız)
    let p1TriggerArmed = true;
    let p2TriggerArmed = true;
    let p1LastShotTime = 0;
    let p2LastShotTime = 0;

    // Taktik Parçacık Sistemi (Alev, Kıvılcım ve Pirinç Kovanlar)
    let duelParticles = [];

    // -------------------------------------------------------------
    // 1. IPSC 1000Hz DÜDÜK SESİ & SESLİ KOMUT MOTORU (WEB AUDIO API)
    // -------------------------------------------------------------
    function playIpscBuzzer() {
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (!AudioCtx) return;
            const ctx = new AudioCtx();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            // Resmi IPSC 1000Hz tiz düdük frekansı
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(1000, ctx.currentTime);
            
            gain.gain.setValueAtTime(0.75, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.38);
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.start();
            osc.stop(ctx.currentTime + 0.40);
        } catch (e) {
            console.warn("IPSC Buzzer ses hatası:", e);
        }
    }

    function speakTactical(text) {
        if ('speechSynthesis' in window) {
            try {
                window.speechSynthesis.cancel();
                const utter = new SpeechSynthesisUtterance(text);
                utter.rate = 1.05;
                utter.pitch = 0.95;
                utter.lang = 'en-US';
                window.speechSynthesis.speak(utter);
            } catch (e) {}
        }
    }

    // -------------------------------------------------------------
    // 2. DÜELLO BAŞLATMA & GERİ SAYIM DİZİSİ (SHOOTER READY... STAND BY...)
    // -------------------------------------------------------------
    async function startIpscCountdownSequence() {
        if (isDuelCountdownRunning) return;
        isDuelCountdownRunning = true;
        duelMatchEndedModalShown = false;

        const overlay = document.getElementById('duelCountdownOverlay');
        const lRed1 = document.getElementById('lightRed1');
        const lRed2 = document.getElementById('lightRed2');
        const lGreen = document.getElementById('lightGreen');
        const txtMain = document.getElementById('duelCountdownMainText');
        const txtSub = document.getElementById('duelCountdownSubText');

        if (duelP1SplitTime) duelP1SplitTime.innerHTML = '<i class="fa-solid fa-stopwatch"></i> -- ms';
        if (duelP2SplitTime) duelP2SplitTime.innerHTML = '<i class="fa-solid fa-stopwatch"></i> -- ms';

        if (overlay) {
            overlay.style.display = 'flex';
            if (lRed1) lRed1.classList.remove('active');
            if (lRed2) lRed2.classList.remove('active');
            if (lGreen) lGreen.classList.remove('active');

            // 1. Kademe: "ATICI HAZIR?"
            if (txtMain) txtMain.textContent = 'ATICI HAZIR...';
            if (txtSub) txtSub.textContent = 'ATIŞ HATTINA GEÇİN — NİŞAN ALIN';
            speakTactical('Atıcı hazır');

            await new Promise(r => setTimeout(r, 1200));

            // 2. Kademe: "HAZIR OL..." (Kırmızı Işıklar)
            if (txtMain) txtMain.textContent = 'HAZIR OL...';
            if (txtSub) txtSub.textContent = 'DÜDÜK SESİNİ BEKLEYİN';
            if (lRed1) lRed1.classList.add('active');
            if (lRed2) lRed2.classList.add('active');
            speakTactical('Hazır ol');

            // IPSC Rastgele Gecikme: 1.2 - 2.2 saniye
            const randomDelay = 1200 + Math.random() * 1000;
            await new Promise(r => setTimeout(r, randomDelay));

            // 3. Kademe: "BEEP! ATEŞ!" (Yeşil Işık + 1000Hz Buzzer)
            if (lRed1) lRed1.classList.remove('active');
            if (lRed2) lRed2.classList.remove('active');
            if (lGreen) lGreen.classList.add('active');
            if (txtMain) {
                txtMain.textContent = 'BEEP! ATEŞ!';
                txtMain.style.color = '#f1f5f9';
            }
            if (txtSub) txtSub.textContent = 'ATIŞ SERBEST!';
            playIpscBuzzer();

            // Backend motoruna başlat isteğini gönder
            fetch('/api/duel/start', { method: 'POST' })
                .then(() => fetchDuelState())
                .catch(e => console.error("Düello maçı başlatılamadı:", e));

            // 500ms sonra overlayi kapat
            setTimeout(() => {
                overlay.style.display = 'none';
                if (txtMain) txtMain.style.color = '#f1f5f9';
                isDuelCountdownRunning = false;
            }, 500);
        } else {
            fetch('/api/duel/start', { method: 'POST' })
                .then(() => fetchDuelState())
                .catch(() => {});
            isDuelCountdownRunning = false;
        }
    }

    const duelOverlayElem = document.getElementById('duelCountdownOverlay');
    if (duelOverlayElem) {
        duelOverlayElem.addEventListener('click', () => {
            duelOverlayElem.style.display = 'none';
            isDuelCountdownRunning = false;
        });
    }

    function initDuelMode() {
        if (duelState && duelState.is_active) {
            if (duelLobbyCard) duelLobbyCard.style.display = 'none';
            if (duelIngameBar) duelIngameBar.style.display = 'flex';
            if (duelHeaderBanner) duelHeaderBanner.style.display = 'flex';
            if (duelArenasContainer) duelArenasContainer.style.display = 'grid';
        } else {
            reopenDuelLobby();
        }
        fetchDuelState();
        startDuelRenderLoop();
    }

    async function fetchDuelState() {
        try {
            const res = await fetch('/api/duel/state');
            if (res.ok) {
                const data = await res.json();
                duelState = data;
                updateDuelUI();
                checkDuelEndConditions();
            }
        } catch (e) {
            console.error("Duel state çekilemedi:", e);
        }
    }

    function updateDuelUI() {
        if (!duelState || !duelState.p1 || !duelState.p2) return;

        if (duelP1Score) duelP1Score.textContent = duelState.p1.score;
        if (duelP2Score) duelP2Score.textContent = duelState.p2.score;
        if (duelP1Hits) duelP1Hits.textContent = `${duelState.p1.hits}/${duelState.p1.shots}`;
        if (duelP2Hits) duelP2Hits.textContent = `${duelState.p2.hits}/${duelState.p2.shots}`;
        if (duelP1Acc) duelP1Acc.textContent = duelState.p1.accuracy;
        if (duelP2Acc) duelP2Acc.textContent = duelState.p2.accuracy;

        // Kalan mermi göstergesi
        if (duelP1Ammo) {
            if (duelState.p1.remaining_ammo !== null && duelState.p1.remaining_ammo !== undefined) {
                duelP1Ammo.textContent = duelState.p1.remaining_ammo;
                duelP1Ammo.style.color = duelState.p1.remaining_ammo <= 2 ? '#dc2626' : '#f1f5f9';
            } else {
                duelP1Ammo.textContent = '∞';
                duelP1Ammo.style.color = '#f1f5f9';
            }
        }

        if (duelP2Ammo) {
            if (duelState.p2.remaining_ammo !== null && duelState.p2.remaining_ammo !== undefined) {
                duelP2Ammo.textContent = duelState.p2.remaining_ammo;
                duelP2Ammo.style.color = duelState.p2.remaining_ammo <= 2 ? '#dc2626' : '#f1f5f9';
            } else {
                duelP2Ammo.textContent = '∞';
                duelP2Ammo.style.color = '#f1f5f9';
            }
        }

        if (duelLeaderText) duelLeaderText.textContent = duelState.leader || 'BERABERE';

        if (duelTimerDisplay) {
            if (duelState.remaining_seconds !== null && duelState.remaining_seconds !== undefined) {
                duelTimerDisplay.textContent = `${duelState.remaining_seconds}s`;
                if (duelState.remaining_seconds <= 5 && duelState.is_active) {
                    duelTimerDisplay.style.color = '#dc2626';
                } else {
                    duelTimerDisplay.style.color = '#d97706';
                }
            } else if (duelState.max_ammo !== null && duelState.max_ammo !== undefined) {
                const p1Rem = Math.max(0, duelState.max_ammo - duelState.p1.shots);
                const p2Rem = Math.max(0, duelState.max_ammo - duelState.p2.shots);
                duelTimerDisplay.textContent = `${p1Rem} | ${p2Rem} Mermi`;
                duelTimerDisplay.style.color = (p1Rem === 0 && p2Rem === 0) ? '#dc2626' : '#d97706';
            } else {
                duelTimerDisplay.textContent = 'Sonsuz';
                duelTimerDisplay.style.color = '#d97706';
            }
        }

        if (btnDuelStartMatch) {
            if (duelState.is_active) {
                btnDuelStartMatch.innerHTML = '<i class="fa-solid fa-pause"></i> DÜELLO SÜRÜYOR';
                btnDuelStartMatch.classList.remove('btn-action');
                btnDuelStartMatch.classList.add('btn-danger');
            } else {
                btnDuelStartMatch.innerHTML = '<i class="fa-solid fa-play"></i> DÜELLOYU BAŞLAT';
                btnDuelStartMatch.classList.remove('btn-danger');
                btnDuelStartMatch.classList.add('btn-action');
            }
        }
    }

    // -------------------------------------------------------------
    // 3. PARÇACIK EKLEME (ALEV PATLAMASI & KOVAN FIRLATMA)
    // -------------------------------------------------------------
    function spawnShotParticles(isLeft, x, y) {
        duelParticles.push({
            type: 'flash',
            isLeft: isLeft,
            x: x,
            y: y,
            radius: 28,
            life: 1.0
        });

        for (let i = 0; i < 6; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 5;
            duelParticles.push({
                type: 'spark',
                isLeft: isLeft,
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1.0,
                color: Math.random() > 0.4 ? '#f59e0b' : '#dc2626'
            });
        }

        const spawnX = isLeft ? 140 : 372;
        const spawnY = 460;
        duelParticles.push({
            type: 'brass',
            isLeft: isLeft,
            x: spawnX,
            y: spawnY,
            vx: (isLeft ? -1 : 1) * (3 + Math.random() * 3),
            vy: -(6 + Math.random() * 3),
            rot: Math.random() * Math.PI,
            rotSpeed: (isLeft ? -0.3 : 0.3) + (Math.random() - 0.5) * 0.2,
            life: 1.0
        });
    }

    // -------------------------------------------------------------
    // 4. İKİ TUVALİN ÇİZİMİ (ANTRASİT POLİGON, HEDEFLER & DİNAMİK FENER MASKESİ)
    // -------------------------------------------------------------
    function drawDuelArenaCanvas(canvas, playerHoles, isLeft) {
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        const cx = w / 2;
        const cy = h / 2;

        const aim = isLeft ? duelP1AimPos : duelP2AimPos;
        const aimX = (aim && aim.x !== undefined) ? aim.x : cx;
        const aimY = (aim && aim.y !== undefined) ? aim.y : cy;

        ctx.clearRect(0, 0, w, h);

        // 1. TACTICAL RANGE BACKGROUND & ILLUMINATION
        if (duelConfig.target_type === 'night_flashlight') {
            // Gece Görüş & Fener Modu: Koyu Gece Ambiyansı
            const bgNight = ctx.createLinearGradient(0, 0, 0, h);
            bgNight.addColorStop(0, '#0a0d14');
            bgNight.addColorStop(0.5, '#07090e');
            bgNight.addColorStop(1, '#030508');
            ctx.fillStyle = bgNight;
            ctx.fillRect(0, 0, w, h);
        } else {
            // Normal Standart Poligon: Aydınlık, Net, Yüksek Görünürlüklü Taktik Zemin
            const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
            bgGrad.addColorStop(0, '#252e3d');
            bgGrad.addColorStop(0.35, '#1d2432');
            bgGrad.addColorStop(0.75, '#151b25');
            bgGrad.addColorStop(1, '#0e131c');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, w, h);

            // Üstten Hedefe Düşen Yumuşak Poligon Tavan Spot Işığı
            const topLight = ctx.createRadialGradient(cx, 50, 20, cx, 230, 300);
            topLight.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
            topLight.addColorStop(0.5, 'rgba(255, 255, 255, 0.04)');
            topLight.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = topLight;
            ctx.fillRect(0, 0, w, h);
        }

        // Poligon Izgara ve Kulvar Çizgileri
        ctx.strokeStyle = duelConfig.target_type === 'night_flashlight' ? 'rgba(255, 255, 255, 0.03)' : 'rgba(255, 255, 255, 0.07)';
        ctx.lineWidth = 1;
        for (let x = 32; x < w; x += 64) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let y = 32; y < h; y += 64) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        // Mesafe Zemin Hattı
        ctx.strokeStyle = duelConfig.target_type === 'night_flashlight' ? 'rgba(100, 116, 139, 0.2)' : 'rgba(148, 163, 184, 0.35)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, h - 28);
        ctx.lineTo(w, h - 28);
        ctx.stroke();

        ctx.fillStyle = duelConfig.target_type === 'night_flashlight' ? '#64748b' : '#94a3b8';
        ctx.font = 'bold 11px Rajdhani, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${duelConfig.distance} METRE POLİGON HATTI`, 12, h - 10);

        // 2. HEDEF ÇİZİMİ (SCALE BY DISTANCE)
        const dist = duelConfig.distance || 10;
        let scale = 1.0;
        if (dist === 5) scale = 1.35;
        else if (dist === 10) scale = 1.0;
        else if (dist === 15) scale = 0.75;
        else if (dist === 20) scale = 0.62;
        else if (dist === 25) scale = 0.50;

        // A) DÜŞEN 5 ÇELİK TABAK (KNOCKDOWN PLATES - FLAT MODERN VEKTÖR)
        if (duelConfig.target_type === 'knockdown_plates') {
            ctx.save();
            const plateBaseXs = [76, 166, 256, 346, 436];
            const plateY = 256;
            const plateR = 38 * scale;
            const plateTilts = isLeft ? p1PlateTilt : p2PlateTilt;

            // 1. Ağır Çelik Raf Barı & Destek Ayakları (Flat Tasarım)
            const barY = plateY + (36 * scale);
            const barH = 12 * scale;
            const railWidth = 430 * scale;
            const railX = cx - (railWidth / 2);

            // Destek Ayakları (Bacaklar - Flat)
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(railX + 20 * scale, barY + barH, 12 * scale, 120 * scale);
            ctx.fillRect(railX + railWidth - 32 * scale, barY + barH, 12 * scale, 120 * scale);
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1;
            ctx.strokeRect(railX + 20 * scale, barY + barH, 12 * scale, 120 * scale);
            ctx.strokeRect(railX + railWidth - 32 * scale, barY + barH, 12 * scale, 120 * scale);

            // Yatay Ana Çelik Ray (Raf - Flat)
            ctx.fillStyle = '#334155';
            ctx.fillRect(railX, barY, railWidth, barH);
            ctx.strokeStyle = '#475569';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(railX, barY, railWidth, barH);

            // 2. 5 Adet Çelik Tabak (Flat Modern Vektör)
            plateBaseXs.forEach((bx, idx) => {
                const scaledPx = 256 + (bx - 256) * scale;
                const tilt = Math.max(0, Math.min(1, plateTilts[idx] || 0));

                ctx.save();
                
                // Menteşe Konumu
                const hingeX = scaledPx;
                const hingeY = barY + 2;

                // Menteşe Taban Bloğu
                ctx.fillStyle = '#1e293b';
                ctx.fillRect(hingeX - 7 * scale, hingeY - 3 * scale, 14 * scale, 6 * scale);
                ctx.strokeStyle = '#334155';
                ctx.lineWidth = 1;
                ctx.strokeRect(hingeX - 7 * scale, hingeY - 3 * scale, 14 * scale, 6 * scale);

                if (tilt < 0.03) {
                    // --- AYAKTA DURAN ÇELİK TABAK (DİK KONUM - FLAT) ---
                    // Dikey Taşıyıcı Çubuk
                    ctx.fillStyle = '#334155';
                    ctx.fillRect(scaledPx - 4 * scale, plateY + 12 * scale, 8 * scale, 24 * scale);
                    ctx.strokeStyle = '#475569';
                    ctx.strokeRect(scaledPx - 4 * scale, plateY + 12 * scale, 8 * scale, 24 * scale);

                    // Yuvarlak Çelik Disk (Flat Slate)
                    ctx.beginPath();
                    ctx.arc(scaledPx, plateY, plateR, 0, Math.PI * 2);
                    ctx.fillStyle = '#475569';
                    ctx.fill();
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = '#64748b';
                    ctx.stroke();

                    // Kırmızı Merkez Hedef Noktası (Flat)
                    ctx.beginPath();
                    ctx.arc(scaledPx, plateY, 13 * scale, 0, Math.PI * 2);
                    ctx.fillStyle = '#dc2626';
                    ctx.fill();
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();

                    // Tabak Numarası
                    ctx.fillStyle = '#ffffff';
                    ctx.font = `bold ${Math.round(11 * scale)}px Orbitron, sans-serif`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(String(idx + 1), scaledPx, plateY);

                } else {
                    // --- DÜŞMÜŞ ÇELİK TABAK (FLAT GÖRÜNÜM) ---
                    const angle = tilt * (Math.PI * 0.48);
                    const currentPlateY = plateY + (tilt * 34 * scale);
                    const currentRadiusY = Math.max(4 * scale, plateR * Math.cos(angle));
                    const currentRadiusX = plateR * (1 - tilt * 0.08);

                    // Katlanan Taşıyıcı Kol
                    const stemTopY = currentPlateY + (currentRadiusY * 0.7);
                    ctx.beginPath();
                    ctx.moveTo(hingeX - 3 * scale, hingeY);
                    ctx.lineTo(hingeX + 3 * scale, hingeY);
                    ctx.lineTo(scaledPx + 3 * scale, stemTopY);
                    ctx.lineTo(scaledPx - 3 * scale, stemTopY);
                    ctx.closePath();
                    ctx.fillStyle = '#1e293b';
                    ctx.fill();

                    // Geriye Yatmış Metal Tabak Diski (Flat)
                    ctx.beginPath();
                    ctx.ellipse(scaledPx, currentPlateY, currentRadiusX, currentRadiusY, 0, 0, Math.PI * 2);
                    ctx.fillStyle = '#1e293b';
                    ctx.fill();
                    ctx.lineWidth = 1.5;
                    ctx.strokeStyle = '#dc2626';
                    ctx.stroke();

                    // "DÜŞTÜ" Etiketi
                    if (tilt > 0.6) {
                        ctx.fillStyle = '#f87171';
                        ctx.font = `bold ${Math.max(8, Math.round(9 * scale))}px Orbitron, sans-serif`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'middle';
                        ctx.fillText('DÜŞTÜ', scaledPx, currentPlateY);
                    }
                }
                ctx.restore();
            });
            ctx.restore();
        }
        // B) HIZLI REAKSİYON / REFLEKS HEDEFİ (QUICK REACTION)
        else if (duelConfig.target_type === 'quick_reaction') {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(scale, scale);

            // Taktik Refleks Çemberi & Nabız Animasyonu
            const pulse = 1.0 + Math.sin(Date.now() * 0.005) * 0.05;
            ctx.beginPath();
            ctx.arc(0, 0, 110 * pulse, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Dış Halka
            ctx.beginPath();
            ctx.arc(0, 0, 95, 0, Math.PI * 2);
            ctx.fillStyle = '#1e293b';
            ctx.fill();
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 3;
            ctx.stroke();

            // İç Hedef Çemberi
            ctx.beginPath();
            ctx.arc(0, 0, 55, 0, Math.PI * 2);
            ctx.fillStyle = '#dc2626';
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Merkez 10 Puan
            ctx.beginPath();
            ctx.arc(0, 0, 22, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();

            ctx.fillStyle = '#dc2626';
            ctx.font = 'bold 12px Orbitron, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('10', 0, 0);

            ctx.fillStyle = '#cbd5e1';
            ctx.font = 'bold 10px Rajdhani, sans-serif';
            ctx.fillText('REFLEKS', 0, 75);

            ctx.restore();
        }
        // C) ÇOKLU TAKTİK HEDEF (MULTI-TARGET CQB - 5 HEDEF)
        else if (duelConfig.target_type === 'multi_target') {
            ctx.save();
            const multiSpots = [
                { x: 120, y: 150, id: 1 },
                { x: 392, y: 150, id: 2 },
                { x: 256, y: 256, id: 3 },
                { x: 140, y: 370, id: 4 },
                { x: 372, y: 370, id: 5 }
            ];
            const pPlates = isLeft ? p1PlateTilt : p2PlateTilt;

            multiSpots.forEach((spot, idx) => {
                const sx = cx + (spot.x - 256) * scale;
                const sy = cy + (spot.y - 256) * scale;
                const isKnocked = (pPlates[idx] || 0) > 0.5;

                ctx.save();
                ctx.translate(sx, sy);
                ctx.scale(scale, scale);

                if (!isKnocked) {
                    // Ayakta Duran Çelik Plaka
                    ctx.beginPath();
                    ctx.arc(0, 0, 36, 0, Math.PI * 2);
                    const spGrad = ctx.createRadialGradient(-6, -6, 4, 0, 0, 36);
                    spGrad.addColorStop(0, '#ffffff');
                    spGrad.addColorStop(0.5, '#94a3b8');
                    spGrad.addColorStop(1, '#334155');
                    ctx.fillStyle = spGrad;
                    ctx.fill();
                    ctx.strokeStyle = '#475569';
                    ctx.lineWidth = 2;
                    ctx.stroke();

                    // Kırmızı Merkez
                    ctx.beginPath();
                    ctx.arc(0, 0, 14, 0, Math.PI * 2);
                    ctx.fillStyle = '#dc2626';
                    ctx.fill();

                    ctx.fillStyle = '#ffffff';
                    ctx.font = 'bold 10px Orbitron, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(String(spot.id), 0, 0);
                } else {
                    // Vurulmuş Devrik Plaka
                    ctx.beginPath();
                    ctx.ellipse(0, 8, 34, 12, 0, 0, Math.PI * 2);
                    ctx.fillStyle = '#1e293b';
                    ctx.fill();
                    ctx.strokeStyle = '#dc2626';
                    ctx.lineWidth = 1.5;
                    ctx.stroke();

                    ctx.fillStyle = '#ef4444';
                    ctx.font = 'bold 9px Orbitron, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText('VURULDU', 0, 8);
                }
                ctx.restore();
            });
            ctx.restore();
        }
        // D) TRAP / UÇAN KİL PLAKA (TRAP CLAY)
        else if (duelConfig.target_type === 'trap_clay') {
            ctx.save();
            // Zaman tabanlı uçuş simülasyonu
            const t = (Date.now() % 4000) / 4000.0;
            const clayX = cx + (Math.sin(t * Math.PI * 2) * 160 * scale);
            const clayY = cy - 60 + (Math.cos(t * Math.PI * 2) * 80 * scale);

            ctx.translate(clayX, clayY);
            ctx.scale(scale, scale);

            // Uçan Turuncu Kil Trap Diski
            ctx.beginPath();
            ctx.ellipse(0, 0, 48, 16, -0.2, 0, Math.PI * 2);
            const cGrad = ctx.createLinearGradient(-40, -10, 40, 10);
            cGrad.addColorStop(0, '#ea580c');
            cGrad.addColorStop(0.5, '#f97316');
            cGrad.addColorStop(1, '#c2410c');
            ctx.fillStyle = cGrad;
            ctx.fill();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Kil Çizgileri
            ctx.beginPath();
            ctx.ellipse(0, 0, 32, 10, -0.2, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.stroke();

            ctx.restore();
        }
        // E) HAREKETLİ HEDEFLER (MOVING TARGETS)
        else if (duelConfig.target_type === 'moving_targets') {
            ctx.save();
            const shiftX = Math.sin(duelMovingAngle + (isLeft ? 0 : Math.PI / 2)) * 90 * scale;
            const shiftY = Math.cos((duelMovingAngle * 0.7) + (isLeft ? 0 : 1.0)) * 40 * scale;
            ctx.translate(cx + shiftX, cy + shiftY);
            ctx.scale(scale, scale);

            // Ray Çizgisi
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 2;
            ctx.strokeRect(-120, -15, 240, 30);

            // Hareketli Hedef Diski
            ctx.beginPath();
            ctx.arc(0, 0, 75, 0, Math.PI * 2);
            const mGrad = ctx.createRadialGradient(-15, -15, 10, 0, 0, 75);
            mGrad.addColorStop(0, '#f8fafc');
            mGrad.addColorStop(0.7, '#cbd5e1');
            mGrad.addColorStop(1, '#475569');
            ctx.fillStyle = mGrad;
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#d97706';
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(0, 0, 25, 0, Math.PI * 2);
            ctx.fillStyle = '#dc2626';
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();

            ctx.fillStyle = '#0f172a';
            ctx.font = 'bold 11px Orbitron, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('10', 0, 0);

            ctx.restore();
        }
        // F) TAKTİK İNSAN SİLÜETİ (B-27 / target_4_silhouette.png)
        else if (duelConfig.target_type === 'target_4_silhouette.png') {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(scale, scale);

            const silImg = getLoadedTargetImage('target_4_silhouette.png');
            if (silImg && silImg.complete && silImg.naturalWidth > 0) {
                const sw = 320;
                const sh = 420;
                ctx.drawImage(silImg, -sw / 2, -sh / 2, sw, sh);
            } else {
                // Vektörel Silüet Çizimi
                ctx.fillStyle = '#1e293b';
                ctx.beginPath();
                ctx.arc(0, -120, 42, 0, Math.PI * 2);
                ctx.fill();

                ctx.beginPath();
                ctx.moveTo(-110, 160);
                ctx.lineTo(-100, -40);
                ctx.quadraticCurveTo(-90, -85, -50, -90);
                ctx.lineTo(50, -90);
                ctx.quadraticCurveTo(90, -85, 100, -40);
                ctx.lineTo(110, 160);
                ctx.closePath();
                ctx.fill();

                ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.ellipse(0, 25, 75, 105, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.ellipse(0, 25, 45, 65, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.ellipse(0, 25, 20, 30, 0, 0, Math.PI * 2);
                ctx.stroke();
            }
            ctx.restore();
        }
        // G) RESMİ DAİRESEL POLİGON HEDEFİ & GECE FENER MODU
        else {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(scale, scale);

            const rings = [
                { r: 210, fill: 'rgba(241, 245, 249, 0.12)', stroke: 'rgba(255, 255, 255, 0.70)', text: '1' },
                { r: 188, fill: 'rgba(241, 245, 249, 0.12)', stroke: 'rgba(255, 255, 255, 0.70)', text: '2' },
                { r: 166, fill: 'rgba(241, 245, 249, 0.12)', stroke: 'rgba(255, 255, 255, 0.70)', text: '3' },
                { r: 144, fill: 'rgba(241, 245, 249, 0.16)', stroke: 'rgba(255, 255, 255, 0.75)', text: '4' },
                { r: 122, fill: 'rgba(241, 245, 249, 0.16)', stroke: 'rgba(255, 255, 255, 0.75)', text: '5' },
                { r: 100, fill: 'rgba(241, 245, 249, 0.20)', stroke: 'rgba(255, 255, 255, 0.80)', text: '6' },
                { r: 78,  fill: 'rgba(15, 23, 42, 0.70)',   stroke: '#94a3b8', text: '7' },
                { r: 56,  fill: 'rgba(15, 23, 42, 0.75)',   stroke: '#94a3b8', text: '8' },
                { r: 36,  fill: 'rgba(15, 23, 42, 0.80)',   stroke: '#94a3b8', text: '9' },
                { r: 18,  fill: 'rgba(220, 38, 38, 0.90)',  stroke: '#ffffff', text: '10' }
            ];

            rings.forEach((ring) => {
                ctx.beginPath();
                ctx.arc(0, 0, ring.r, 0, Math.PI * 2);
                ctx.fillStyle = ring.fill;
                ctx.fill();
                ctx.lineWidth = ring.r <= 18 ? 2 : 1.2;
                ctx.strokeStyle = ring.stroke;
                ctx.stroke();

                if (ring.r > 18) {
                    ctx.fillStyle = ring.r <= 78 ? '#ffffff' : 'rgba(255, 255, 255, 0.85)';
                    ctx.font = 'bold 11px Orbitron, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(ring.text, ring.r - 10, 0);
                    ctx.fillText(ring.text, -(ring.r - 10), 0);
                }
            });

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-10, 0); ctx.lineTo(10, 0);
            ctx.moveTo(0, -10); ctx.lineTo(0, 10);
            ctx.stroke();

            ctx.restore();
        }

        // 3. MERMİ İZLERİ (BULLET HOLES)
        if (playerHoles && playerHoles.length > 0) {
            playerHoles.forEach((hole, idx) => {
                const hx = hole.x;
                const hy = hole.y;

                ctx.beginPath();
                ctx.arc(hx, hy, 8, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(241, 245, 249, 0.3)';
                ctx.fill();

                ctx.beginPath();
                ctx.arc(hx, hy, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#0a0d14';
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = isLeft ? '#94a3b8' : '#cbd5e1';
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(hx, hy, 2.5, 0, Math.PI * 2);
                ctx.fillStyle = '#000000';
                ctx.fill();

                ctx.fillStyle = '#f1f5f9';
                ctx.font = 'bold 9px Orbitron, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(String(idx + 1), hx + 10, hy - 8);
            });
        }

        // 4. DYNAMIC TACTICAL FLASHLIGHT / SPOTLIGHT ILLUMINATION MASK (SADECE GECE FENER MODUNDA)
        if (duelConfig.target_type === 'night_flashlight') {
            ctx.save();
            ctx.globalCompositeOperation = 'destination-out';
            const lightGrad = ctx.createRadialGradient(aimX, aimY, 20, aimX, aimY, 175);
            lightGrad.addColorStop(0, 'rgba(0, 0, 0, 0.88)');
            lightGrad.addColorStop(0.5, 'rgba(0, 0, 0, 0.65)');
            lightGrad.addColorStop(0.85, 'rgba(0, 0, 0, 0.25)');
            lightGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = lightGrad;
            ctx.beginPath();
            ctx.arc(aimX, aimY, 175, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            // Taktik gece gölge katmanı
            ctx.save();
            ctx.fillStyle = 'rgba(10, 14, 22, 0.70)';
            ctx.fillRect(0, 0, w, h);
            ctx.restore();
        }

        // 5. PARÇACIKLARIN ÇİZİMİ
        for (let i = duelParticles.length - 1; i >= 0; i--) {
            const p = duelParticles[i];
            if (p.isLeft !== isLeft) continue;

            if (p.type === 'flash') {
                ctx.save();
                const flareGrad = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.radius);
                flareGrad.addColorStop(0, `rgba(255, 255, 255, ${p.life})`);
                flareGrad.addColorStop(0.4, `rgba(245, 158, 11, ${p.life * 0.8})`);
                flareGrad.addColorStop(1, 'rgba(220, 38, 38, 0)');
                ctx.fillStyle = flareGrad;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();

                p.life -= 0.14;
                p.radius += 3;
            } 
            else if (p.type === 'spark') {
                ctx.save();
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, 2.5 * p.life, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();

                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.25;
                p.life -= 0.05;
            } 
            else if (p.type === 'brass') {
                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.rot);
                ctx.fillStyle = '#f59e0b';
                ctx.fillRect(-3, -7, 6, 14);
                ctx.fillStyle = '#d97706';
                ctx.fillRect(-3.5, 5, 7, 2.5);
                ctx.restore();

                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.32;
                p.rot += p.rotSpeed;
                p.life -= 0.025;
            }

            if (p.life <= 0) {
                duelParticles.splice(i, 1);
            }
        }
    }

    function startDuelRenderLoop() {
        if (duelAnimFrameId) return;

        function loop() {
            if (activeTab === 'duel') {
                duelMovingAngle += 0.03;

                // Tabakların geriye devrilme animasyonu interpolasyonu
                for (let i = 0; i < 5; i++) {
                    const targetP1 = (duelState.p1 && duelState.p1.plates && !duelState.p1.plates[i]) ? 1.0 : 0.0;
                    p1PlateTilt[i] += (targetP1 - p1PlateTilt[i]) * 0.24;

                    const targetP2 = (duelState.p2 && duelState.p2.plates && !duelState.p2.plates[i]) ? 1.0 : 0.0;
                    p2PlateTilt[i] += (targetP2 - p2PlateTilt[i]) * 0.24;
                }

                drawDuelArenaCanvas(duelCanvasLeft, duelState.p1 ? duelState.p1.holes : [], true);
                drawDuelArenaCanvas(duelCanvasRight, duelState.p2 ? duelState.p2.holes : [], false);
                duelAnimFrameId = requestAnimationFrame(loop);
            } else {
                duelAnimFrameId = null;
            }
        }
        duelAnimFrameId = requestAnimationFrame(loop);
    }

    // -------------------------------------------------------------
    // 5. KAMERA TELEMETRİSİ İLE ÇİFT EL & LAZER TAKİBİ VE KALİBRASYON
    // -------------------------------------------------------------
    function updateDuelWithTelemetri(data) {
        if (!data) return;

        const now = Date.now();
        if (now - lastDuelStateFetchTime > 1000) {
            lastDuelStateFetchTime = now;
            fetchDuelState();
        }

        const currentMode = duelConfig.input_mode || 'MOUSE';

        // 1. EL TAKİBİ MODU (HAND)
        if (currentMode === 'HAND') {
            const hands = data.duel_hands || [];
            const leftHand = hands.find(h => h.id === 1 || h.player_id === 1 || h.side === 'left');
            const rightHand = hands.find(h => h.id === 2 || h.player_id === 2 || h.side === 'right');

            // P1 (SOL)
            if (leftHand) {
                if (duelP1Status) {
                    duelP1Status.textContent = 'EL AKTİF';
                    duelP1Status.style.color = '#f1f5f9';
                }
                const lx = leftHand.aim_x !== undefined ? leftHand.aim_x : leftHand.x;
                const ly = leftHand.aim_y !== undefined ? leftHand.aim_y : leftHand.y;
                const targetX = Math.max(0, Math.min(512, (lx / 320) * 512));
                const targetY = Math.max(0, Math.min(512, (ly / 480) * 512));

                duelP1AimPos.x += (targetX - duelP1AimPos.x) * 0.45;
                duelP1AimPos.y += (targetY - duelP1AimPos.y) * 0.45;
                duelP1AimPos.active = true;

                if (duelCrosshairLeft) {
                    duelCrosshairLeft.style.left = `${(duelP1AimPos.x / 512) * 100}%`;
                    duelCrosshairLeft.style.top = `${(duelP1AimPos.y / 512) * 100}%`;
                }

                const r1 = leftHand.trigger_ratio !== undefined ? leftHand.trigger_ratio : 1.0;
                if (r1 > 0.46) p1TriggerArmed = true;

                if (duelP1TriggerState) {
                    if (r1 < 0.36) {
                        duelP1TriggerState.textContent = 'Tetik: ATEŞ!';
                        duelP1TriggerState.style.color = '#d97706';
                    } else if (p1TriggerArmed) {
                        duelP1TriggerState.textContent = `Tetik: Hazır (${r1.toFixed(2)})`;
                        duelP1TriggerState.style.color = '#cbd5e1';
                    } else {
                        duelP1TriggerState.textContent = `Tetik: Tekrar Aç (${r1.toFixed(2)})`;
                        duelP1TriggerState.style.color = '#94a3b8';
                    }
                }

                if (r1 < 0.36 && p1TriggerArmed && (now - p1LastShotTime > 280)) {
                    p1TriggerArmed = false;
                    p1LastShotTime = now;
                    fireDuelShot(1, duelP1AimPos.x, duelP1AimPos.y, 'PARMAK');
                }
            } else {
                p1TriggerArmed = true;
                if (duelP1Status) {
                    duelP1Status.textContent = 'EL BEKLENİYOR';
                    duelP1Status.style.color = '#64748b';
                }
                if (duelP1TriggerState) {
                    duelP1TriggerState.textContent = 'Tetik: Bekleniyor';
                    duelP1TriggerState.style.color = '#64748b';
                }
            }

            // P2 (SAĞ)
            if (rightHand) {
                if (duelP2Status) {
                    duelP2Status.textContent = 'EL AKTİF';
                    duelP2Status.style.color = '#f1f5f9';
                }
                const rx = rightHand.aim_x !== undefined ? rightHand.aim_x : rightHand.x;
                const ry = rightHand.aim_y !== undefined ? rightHand.aim_y : rightHand.y;
                const targetX = Math.max(0, Math.min(512, ((rx - 320) / 320) * 512));
                const targetY = Math.max(0, Math.min(512, (ry / 480) * 512));

                duelP2AimPos.x += (targetX - duelP2AimPos.x) * 0.45;
                duelP2AimPos.y += (targetY - duelP2AimPos.y) * 0.45;
                duelP2AimPos.active = true;

                if (duelCrosshairRight) {
                    duelCrosshairRight.style.left = `${(duelP2AimPos.x / 512) * 100}%`;
                    duelCrosshairRight.style.top = `${(duelP2AimPos.y / 512) * 100}%`;
                }

                const r2 = rightHand.trigger_ratio !== undefined ? rightHand.trigger_ratio : 1.0;
                if (r2 > 0.46) p2TriggerArmed = true;

                if (duelP2TriggerState) {
                    if (r2 < 0.36) {
                        duelP2TriggerState.textContent = 'Tetik: ATEŞ!';
                        duelP2TriggerState.style.color = '#d97706';
                    } else if (p2TriggerArmed) {
                        duelP2TriggerState.textContent = `Tetik: Hazır (${r2.toFixed(2)})`;
                        duelP2TriggerState.style.color = '#cbd5e1';
                    } else {
                        duelP2TriggerState.textContent = `Tetik: Tekrar Aç (${r2.toFixed(2)})`;
                        duelP2TriggerState.style.color = '#94a3b8';
                    }
                }

                if (r2 < 0.36 && p2TriggerArmed && (now - p2LastShotTime > 280)) {
                    p2TriggerArmed = false;
                    p2LastShotTime = now;
                    fireDuelShot(2, duelP2AimPos.x, duelP2AimPos.y, 'PARMAK');
                }
            } else {
                p2TriggerArmed = true;
                if (duelP2Status) {
                    duelP2Status.textContent = 'EL BEKLENİYOR';
                    duelP2Status.style.color = '#64748b';
                }
                if (duelP2TriggerState) {
                    duelP2TriggerState.textContent = 'Tetik: Bekleniyor';
                    duelP2TriggerState.style.color = '#64748b';
                }
            }
        }
        // 2. 🔴 LAZER MODU (LASER)
        else if (currentMode === 'LASER') {
            if (data.laser_dot && data.laser_dot.x !== null && data.laser_dot.y !== null) {
                const lx = data.laser_dot.x;
                const ly = data.laser_dot.y;

                if (lx < 320) {
                    const fireX = Math.max(0, Math.min(512, (lx / 320) * 512));
                    const fireY = Math.max(0, Math.min(512, (ly / 480) * 512));
                    duelP1AimPos.x += (fireX - duelP1AimPos.x) * 0.7;
                    duelP1AimPos.y += (fireY - duelP1AimPos.y) * 0.7;
                    duelP1AimPos.active = true;

                    if (duelCrosshairLeft) {
                        duelCrosshairLeft.style.left = `${(duelP1AimPos.x / 512) * 100}%`;
                        duelCrosshairLeft.style.top = `${(duelP1AimPos.y / 512) * 100}%`;
                    }
                    if (duelP1Status) {
                        duelP1Status.textContent = '🔴 LAZER GÖRÜLDÜ';
                        duelP1Status.style.color = '#f87171';
                    }

                    if (data.laser_active && (now - p1LastShotTime > 300)) {
                        p1LastShotTime = now;
                        fireDuelShot(1, duelP1AimPos.x, duelP1AimPos.y, 'LAZER');
                    }
                } else {
                    const fireX = Math.max(0, Math.min(512, ((lx - 320) / 320) * 512));
                    const fireY = Math.max(0, Math.min(512, (ly / 480) * 512));
                    duelP2AimPos.x += (fireX - duelP2AimPos.x) * 0.7;
                    duelP2AimPos.y += (fireY - duelP2AimPos.y) * 0.7;
                    duelP2AimPos.active = true;

                    if (duelCrosshairRight) {
                        duelCrosshairRight.style.left = `${(duelP2AimPos.x / 512) * 100}%`;
                        duelCrosshairRight.style.top = `${(duelP2AimPos.y / 512) * 100}%`;
                    }
                    if (duelP2Status) {
                        duelP2Status.textContent = '🔴 LAZER GÖRÜLDÜ';
                        duelP2Status.style.color = '#f87171';
                    }

                    if (data.laser_active && (now - p2LastShotTime > 300)) {
                        p2LastShotTime = now;
                        fireDuelShot(2, duelP2AimPos.x, duelP2AimPos.y, 'LAZER');
                    }
                }
            }
        }
        // 3. FARE MODU
        else {
            if (duelP1Status) {
                duelP1Status.textContent = 'FARE HAZIR';
                duelP1Status.style.color = '#94a3b8';
            }
            if (duelP2Status) {
                duelP2Status.textContent = 'FARE HAZIR';
                duelP2Status.style.color = '#94a3b8';
            }
        }
    }

    // -------------------------------------------------------------
    // 6. ATIŞ GÖNDERİMİ & TAKTİK TEPKİME
    // -------------------------------------------------------------
    async function fireDuelShot(playerId, x, y, method = 'FARE') {
        try {
            tacticalAudio.playShot();

            if (playerId === 1 && duelArenaBoxLeft) {
                duelArenaBoxLeft.classList.remove('recoil-shake-left');
                void duelArenaBoxLeft.offsetWidth;
                duelArenaBoxLeft.classList.add('recoil-shake-left');
            } else if (playerId === 2 && duelArenaBoxRight) {
                duelArenaBoxRight.classList.remove('recoil-shake-right');
                void duelArenaBoxRight.offsetWidth;
                duelArenaBoxRight.classList.add('recoil-shake-right');
            }

            spawnShotParticles(playerId === 1, x, y);

            const res = await fetch('/api/duel/shoot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    player_id: playerId,
                    x: Math.round(x),
                    y: Math.round(y),
                    weapon: duelConfig.weapon,
                    yontem: method
                })
            });

            if (res.ok) {
                const result = await res.json();
                duelState = result.state;
                updateDuelUI();

                if (result.shot && result.shot.reaction_time) {
                    const rxMs = Math.round(result.shot.reaction_time * 1000);
                    if (playerId === 1 && duelP1SplitTime) {
                        duelP1SplitTime.innerHTML = `<i class="fa-solid fa-stopwatch"></i> ${rxMs} ms`;
                    } else if (playerId === 2 && duelP2SplitTime) {
                        duelP2SplitTime.innerHTML = `<i class="fa-solid fa-stopwatch"></i> ${rxMs} ms`;
                    }
                }

                if (result.shot && result.shot.puan > 0) {
                    const isSteel = duelConfig.target_type === 'knockdown_plates' || duelConfig.target_type === 'moving_targets';
                    tacticalAudio.playHit(isSteel ? 'STEEL_HIT' : 'TARGET_HIT');
                } else {
                    tacticalAudio.playMiss();
                }

                checkDuelEndConditions();
            }
        } catch (e) {
            console.error("Düello atışı gönderilemedi:", e);
        }
    }

    // -------------------------------------------------------------
    // 7. BALİSTİK GRUPMAN & MOA HESAPLAMA VE ATICI TEŞHİSİ (AAR)
    // -------------------------------------------------------------
    function analyzePlayerBallistics(holes, dist) {
        if (!holes || holes.length === 0) {
            return { spreadCm: 0, moa: 0, diag: 'Atış Yok', isGood: false, avgRx: 0 };
        }

        let maxDistPx = 0;
        let sumX = 0, sumY = 0, sumRx = 0, rxCount = 0;

        for (let i = 0; i < holes.length; i++) {
            sumX += holes[i].x;
            sumY += holes[i].y;
            if (holes[i].reaction_time) {
                sumRx += holes[i].reaction_time;
                rxCount++;
            }
            for (let j = i + 1; j < holes.length; j++) {
                const d = Math.hypot(holes[i].x - holes[j].x, holes[i].y - holes[j].y);
                if (d > maxDistPx) maxDistPx = d;
            }
        }

        const avgX = sumX / holes.length;
        const avgY = sumY / holes.length;
        const avgRx = rxCount > 0 ? (sumRx / rxCount) : 0;

        const spreadCm = Number(((maxDistPx / 512) * 50).toFixed(1));
        const spreadMm = spreadCm * 10;
        const moa = Number(((dist && dist > 0) ? (spreadMm / (dist * 2.90888)) : 0).toFixed(1));

        const dx = avgX - 256;
        const dy = avgY - 256;
        let diag = 'Taktik İsabetli';
        let isGood = true;

        if (holes.length >= 2) {
            if (spreadCm <= 8.5) {
                diag = 'Mükemmel Grupman';
                isGood = true;
            } else if (dx < -25 && dy > 25) {
                diag = 'Tetik Ezme (Jerk)';
                isGood = false;
            } else if (dy > 35) {
                diag = 'Namlu Düşürme (Anticipation)';
                isGood = false;
            } else if (dy < -35) {
                diag = 'Geri Tepme Korkusu (Heeling)';
                isGood = false;
            } else if (dx > 30) {
                diag = 'Tetik Parmağı Fazla İtme';
                isGood = false;
            } else if (dx < -30) {
                diag = 'Kabze Sıkma / Başparmak Basısı';
                isGood = false;
            }
        }

        return { spreadCm, moa, diag, isGood, avgRx };
    }

    function checkDuelEndConditions() {
        if (!duelState || !duelState.p1 || !duelState.p2 || duelMatchEndedModalShown) return;

        let ended = false;

        if (duelConfig.max_ammo) {
            if (duelState.p1.shots >= duelConfig.max_ammo && duelState.p2.shots >= duelConfig.max_ammo) {
                ended = true;
            }
        }

        if (duelConfig.target_type === 'knockdown_plates') {
            const p1AllDown = duelState.p1.plates && duelState.p1.plates.every(p => !p);
            const p2AllDown = duelState.p2.plates && duelState.p2.plates.every(p => !p);
            if (p1AllDown || p2AllDown) {
                ended = true;
            }
        }

        if (ended) {
            duelMatchEndedModalShown = true;
            setTimeout(openVictoryModal, 600);
        }
    }

    function openVictoryModal() {
        if (!duelVictoryModal) return;

        const p1 = duelState.p1;
        const p2 = duelState.p2;
        const b1 = analyzePlayerBallistics(p1.holes, duelConfig.distance);
        const b2 = analyzePlayerBallistics(p2.holes, duelConfig.distance);

        let titleText = 'BERABERE!';
        let winnerSide = 0;

        if (duelConfig.target_type === 'knockdown_plates') {
            const p1Down = p1.plates ? p1.plates.filter(p => !p).length : 0;
            const p2Down = p2.plates ? p2.plates.filter(p => !p).length : 0;
            if (p1Down > p2Down) winnerSide = 1;
            else if (p2Down > p1Down) winnerSide = 2;
        } else {
            if (p1.score > p2.score) winnerSide = 1;
            else if (p2.score > p1.score) winnerSide = 2;
        }

        if (winnerSide === 1) {
            titleText = '1. ATICI (SOL) ZAFER KAZANDI!';
            speakTactical('Player one wins');
            if (victoryCardP1) victoryCardP1.classList.add('winner');
            if (victoryCardP2) victoryCardP2.classList.remove('winner');
        } else if (winnerSide === 2) {
            titleText = '2. ATICI (SAĞ) ZAFER KAZANDI!';
            speakTactical('Player two wins');
            if (victoryCardP2) victoryCardP2.classList.add('winner');
            if (victoryCardP1) victoryCardP1.classList.remove('winner');
        } else {
            titleText = 'DOSTLUK KAZANDI — BERABERE!';
            speakTactical('Draw match');
            if (victoryCardP1) victoryCardP1.classList.remove('winner');
            if (victoryCardP2) victoryCardP2.classList.remove('winner');
        }

        if (victoryTitle) victoryTitle.textContent = titleText;
        if (victorySubtitle) victorySubtitle.textContent = `Mesafe: ${duelConfig.distance}m | Silah: ${duelConfig.weapon}`;

        if (vP1Score) vP1Score.textContent = `${p1.score} PUAN`;
        if (vP1Hits) vP1Hits.textContent = `${p1.hits}/${p1.shots}`;
        if (vP1Acc) vP1Acc.textContent = `%${p1.accuracy}`;
        if (vP1Rx) vP1Rx.textContent = `${b1.avgRx.toFixed(2)} sn`;
        if (vP1Grouping) vP1Grouping.textContent = `${b1.spreadCm} cm (${b1.moa} MOA)`;
        if (vP1Diag) {
            vP1Diag.textContent = b1.diag;
            vP1Diag.className = `v-diag-badge ${b1.isGood ? '' : 'warning'}`;
        }

        if (vP2Score) vP2Score.textContent = `${p2.score} PUAN`;
        if (vP2Hits) vP2Hits.textContent = `${p2.hits}/${p2.shots}`;
        if (vP2Acc) vP2Acc.textContent = `%${p2.accuracy}`;
        if (vP2Rx) vP2Rx.textContent = `${b2.avgRx.toFixed(2)} sn`;
        if (vP2Grouping) vP2Grouping.textContent = `${b2.spreadCm} cm (${b2.moa} MOA)`;
        if (vP2Diag) {
            vP2Diag.textContent = b2.diag;
            vP2Diag.className = `v-diag-badge ${b2.isGood ? '' : 'warning'}`;
        }

        duelVictoryModal.style.display = 'flex';
    }

    if (btnCloseVictoryModal) {
        btnCloseVictoryModal.addEventListener('click', async () => {
            duelVictoryModal.style.display = 'none';
            try {
                await fetch('/api/duel/reset', { method: 'POST' });
                await fetchDuelState();
                reopenDuelLobby();
            } catch (e) {}
        });
    }

    // -------------------------------------------------------------
    // 8. DÜELLO SONUÇ RAPORUNU RESİM OLARAK İNDİRME (PNG EXPORTER)
    // -------------------------------------------------------------
    if (btnDownloadDuelReport) {
        btnDownloadDuelReport.addEventListener('click', () => {
            try {
                const repCanvas = document.createElement('canvas');
                repCanvas.width = 1100;
                repCanvas.height = 680;
                const rCtx = repCanvas.getContext('2d');

                const bgGrad = rCtx.createLinearGradient(0, 0, 0, 680);
                bgGrad.addColorStop(0, '#0a0e17');
                bgGrad.addColorStop(1, '#030712');
                rCtx.fillStyle = bgGrad;
                rCtx.fillRect(0, 0, 1100, 680);

                rCtx.fillStyle = '#d97706';
                rCtx.font = 'bold 28px Orbitron, sans-serif';
                rCtx.textAlign = 'center';
                rCtx.fillText('SHOOTING SIMULATOR — 1v1 DÜELLO RAPORU', 550, 50);

                rCtx.fillStyle = '#94a3b8';
                rCtx.font = '14px Rajdhani, sans-serif';
                rCtx.fillText(`Tarih: ${new Date().toLocaleString('tr-TR')} | Mesafe: ${duelConfig.distance}m | Silah: ${duelConfig.weapon}`, 550, 80);

                rCtx.fillStyle = '#f1f5f9';
                rCtx.font = 'bold 22px Orbitron, sans-serif';
                rCtx.fillText(victoryTitle ? victoryTitle.textContent : 'MÜSABAKA BİTTİ', 550, 125);

                if (duelCanvasLeft) {
                    rCtx.drawImage(duelCanvasLeft, 60, 160, 420, 420);
                    rCtx.strokeStyle = '#475569';
                    rCtx.lineWidth = 2;
                    rCtx.strokeRect(60, 160, 420, 420);

                    rCtx.fillStyle = '#f1f5f9';
                    rCtx.font = 'bold 15px Orbitron, sans-serif';
                    rCtx.textAlign = 'left';
                    rCtx.fillText(`1. ATICI: ${duelState.p1.score} Puan (%${duelState.p1.accuracy} İsabet)`, 60, 610);
                }

                if (duelCanvasRight) {
                    rCtx.drawImage(duelCanvasRight, 620, 160, 420, 420);
                    rCtx.strokeStyle = '#475569';
                    rCtx.lineWidth = 2;
                    rCtx.strokeRect(620, 160, 420, 420);

                    rCtx.fillStyle = '#f1f5f9';
                    rCtx.font = 'bold 15px Orbitron, sans-serif';
                    rCtx.textAlign = 'left';
                    rCtx.fillText(`2. ATICI: ${duelState.p2.score} Puan (%${duelState.p2.accuracy} İsabet)`, 620, 610);
                }

                rCtx.fillStyle = '#d97706';
                rCtx.font = 'bold 36px Orbitron, sans-serif';
                rCtx.textAlign = 'center';
                rCtx.fillText('VS', 550, 380);

                const link = document.createElement('a');
                link.download = `Duello_Raporu_${Date.now()}.png`;
                link.href = repCanvas.toDataURL('image/png');
                link.click();
            } catch (e) {
                console.error("Rapor PNG olarak indirilemedi:", e);
                alert("Rapor görseli oluşturulurken bir hata oluştu.");
            }
        });
    }

    // -------------------------------------------------------------
    // 9. LOBİ, BUTONLAR VE DÜĞME DİNLEYİCİLERİ
    // -------------------------------------------------------------
    // Fare Hareketi & Tıklama Dinleyicileri
    if (duelCanvasLeft) {
        duelCanvasLeft.addEventListener('mousemove', (e) => {
            const rect = duelCanvasLeft.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (512 / rect.width);
            const y = (e.clientY - rect.top) * (512 / rect.height);
            duelP1AimPos = { x, y, active: true };
            if (duelCrosshairLeft) {
                duelCrosshairLeft.style.left = `${(x / 512) * 100}%`;
                duelCrosshairLeft.style.top = `${(y / 512) * 100}%`;
            }
        });
        duelCanvasLeft.addEventListener('mouseleave', () => {
            if (duelConfig.input_mode === 'MOUSE') {
                duelP1AimPos = { x: 256, y: 256, active: false };
            }
        });
        duelCanvasLeft.addEventListener('click', (e) => {
            const rect = duelCanvasLeft.getBoundingClientRect();
            const clickX = (e.clientX - rect.left) * (512 / rect.width);
            const clickY = (e.clientY - rect.top) * (512 / rect.height);
            fireDuelShot(1, clickX, clickY, 'FARE');
        });
    }

    if (duelCanvasRight) {
        duelCanvasRight.addEventListener('mousemove', (e) => {
            const rect = duelCanvasRight.getBoundingClientRect();
            const x = (e.clientX - rect.left) * (512 / rect.width);
            const y = (e.clientY - rect.top) * (512 / rect.height);
            duelP2AimPos = { x, y, active: true };
            if (duelCrosshairRight) {
                duelCrosshairRight.style.left = `${(x / 512) * 100}%`;
                duelCrosshairRight.style.top = `${(y / 512) * 100}%`;
            }
        });
        duelCanvasRight.addEventListener('mouseleave', () => {
            if (duelConfig.input_mode === 'MOUSE') {
                duelP2AimPos = { x: 256, y: 256, active: false };
            }
        });
        duelCanvasRight.addEventListener('click', (e) => {
            const rect = duelCanvasRight.getBoundingClientRect();
            const clickX = (e.clientX - rect.left) * (512 / rect.width);
            const clickY = (e.clientY - rect.top) * (512 / rect.height);
            fireDuelShot(2, clickX, clickY, 'FARE');
        });
    }

    function updateDuelActiveMeta() {
        if (!duelActiveMetaText) return;
        const targetNames = {
            'knockdown_plates': 'Düşen Çelik Tabaklar',
            'quick_reaction': 'Hızlı Reaksiyon (Refleks)',
            'night_flashlight': 'Karanlık Mod (Gece Feneri)',
            'multi_target': 'Çoklu Hedef (CQB)',
            'trap_clay': 'Trap / Uçan Plaka',
            'moving_targets': 'Hareketli Hedefler',
            'target_1_inverted.png': 'Klasik Halka Hedef',
            'target_4_silhouette.png': 'Taktik İnsan Silüeti (B-27)'
        };
        const tName = targetNames[duelConfig.target_type] || duelConfig.target_type;
        const ammoTxt = duelConfig.max_ammo ? `${duelConfig.max_ammo} Mermi` : 'Sınırsız';
        const durTxt = duelConfig.duration && duelConfig.duration < 9999 ? `${duelConfig.duration}s` : 'Süresiz';
        duelActiveMetaText.textContent = `Mod: ${tName} | ${duelConfig.distance}m | ${ammoTxt} | ${durTxt}`;
    }

    function launchDuelMatch() {
        if (duelLobbyCard) duelLobbyCard.style.display = 'none';
        if (duelIngameBar) duelIngameBar.style.display = 'flex';
        if (duelHeaderBanner) duelHeaderBanner.style.display = 'flex';
        if (duelArenasContainer) duelArenasContainer.style.display = 'grid';
        updateDuelActiveMeta();
        startIpscCountdownSequence();
    }

    function reopenDuelLobby() {
        if (duelLobbyCard) duelLobbyCard.style.display = 'flex';
        if (duelIngameBar) duelIngameBar.style.display = 'none';
        if (duelHeaderBanner) duelHeaderBanner.style.display = 'none';
        if (duelArenasContainer) duelArenasContainer.style.display = 'none';
    }

    if (btnDuelStartMatchBig) {
        btnDuelStartMatchBig.addEventListener('click', launchDuelMatch);
    }

    if (btnReopenLobby) {
        btnReopenLobby.addEventListener('click', reopenDuelLobby);
    }

    if (btnDuelStartMatch) {
        btnDuelStartMatch.addEventListener('click', () => {
            launchDuelMatch();
        });
    }

    if (btnDuelResetMatch) {
        btnDuelResetMatch.addEventListener('click', async () => {
            try {
                duelMatchEndedModalShown = false;
                await fetch('/api/duel/reset', { method: 'POST' });
                await fetchDuelState();
            } catch (e) {
                console.error("Düello sıfırlanamadı:", e);
            }
        });
    }

    // 1. Girdi Modu Seçimi (Lobi)
    document.querySelectorAll('#duelLobbyInputModes .duel-lobby-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#duelLobbyInputModes .duel-lobby-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const mode = btn.getAttribute('data-mode') || 'MOUSE';
            duelConfig.input_mode = mode;
            setInputMode(mode);
        });
    });

    // 2. Hedef Modeli Seçimi (Lobi)
    document.querySelectorAll('#duelTargetOptions .duel-lobby-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll('#duelTargetOptions .duel-lobby-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            duelConfig.target_type = btn.getAttribute('data-target');
            if (duelConfig.target_type.endsWith('.png')) {
                duelTargetImg.src = '/static/targets/' + duelConfig.target_type;
            }
            await sendDuelConfig();
        });
    });

    // 3. Mesafe Seçimi (Lobi)
    document.querySelectorAll('#duelDistanceOptions .duel-lobby-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll('#duelDistanceOptions .duel-lobby-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            duelConfig.distance = parseInt(btn.getAttribute('data-dist'));
            await sendDuelConfig();
        });
    });

    // 4. Mermi Sınırı (Lobi)
    const inputDuelCustomAmmo = document.getElementById('inputDuelCustomAmmo');
    const btnApplyDuelCustomAmmo = document.getElementById('btnApplyDuelCustomAmmo');

    document.querySelectorAll('#duelAmmoOptions .duel-lobby-btn:not(#btnApplyDuelCustomAmmo)').forEach(btn => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll('#duelAmmoOptions .duel-lobby-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const val = btn.getAttribute('data-ammo');
            duelConfig.max_ammo = val === 'unlimited' ? null : parseInt(val);
            updateDuelActiveMeta();
            await sendDuelConfig();
        });
    });

    async function applyDuelCustomAmmo() {
        if (!inputDuelCustomAmmo) return;
        const val = parseInt(inputDuelCustomAmmo.value);
        if (isNaN(val) || val <= 0) return;
        document.querySelectorAll('#duelAmmoOptions .duel-lobby-btn').forEach(b => b.classList.remove('active'));
        if (btnApplyDuelCustomAmmo) btnApplyDuelCustomAmmo.classList.add('active');
        duelConfig.max_ammo = val;
        updateDuelActiveMeta();
        await sendDuelConfig();
    }
    if (btnApplyDuelCustomAmmo) btnApplyDuelCustomAmmo.addEventListener('click', applyDuelCustomAmmo);
    if (inputDuelCustomAmmo) {
        inputDuelCustomAmmo.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); applyDuelCustomAmmo(); }
        });
    }

    // 5. Süre Sınırı (Lobi)
    const inputDuelCustomDuration = document.getElementById('inputDuelCustomDuration');
    const btnApplyDuelCustomDuration = document.getElementById('btnApplyDuelCustomDuration');

    document.querySelectorAll('#duelDurationOptions .duel-lobby-btn:not(#btnApplyDuelCustomDuration)').forEach(btn => {
        btn.addEventListener('click', async () => {
            document.querySelectorAll('#duelDurationOptions .duel-lobby-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const dur = btn.getAttribute('data-duration');
            if (dur === 'unlimited') {
                duelConfig.format = 'unlimited';
                duelConfig.duration = 9999;
            } else {
                duelConfig.format = dur + 's';
                duelConfig.duration = parseInt(dur);
            }
            updateDuelActiveMeta();
            await sendDuelConfig();
        });
    });

    async function applyDuelCustomDuration() {
        if (!inputDuelCustomDuration) return;
        const val = parseInt(inputDuelCustomDuration.value);
        if (isNaN(val) || val <= 0) return;
        document.querySelectorAll('#duelDurationOptions .duel-lobby-btn').forEach(b => b.classList.remove('active'));
        if (btnApplyDuelCustomDuration) btnApplyDuelCustomDuration.classList.add('active');
        duelConfig.duration = val;
        duelConfig.format = `${val}s`;
        updateDuelActiveMeta();
        await sendDuelConfig();
    }
    if (btnApplyDuelCustomDuration) btnApplyDuelCustomDuration.addEventListener('click', applyDuelCustomDuration);
    if (inputDuelCustomDuration) {
        inputDuelCustomDuration.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); applyDuelCustomDuration(); }
        });
    }

    async function sendDuelConfig() {
        try {
            await fetch('/api/duel/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    target_type: duelConfig.target_type,
                    distance: duelConfig.distance,
                    format: duelConfig.format,
                    max_ammo: duelConfig.max_ammo,
                    duration: duelConfig.duration
                })
            });
            fetchDuelState();
        } catch (e) {
            console.error("Düello ayarları gönderilemedi:", e);
        }
    }

    // Sayfa Açıldığında Silah ve Profil Ayarlarını Otomatik Yükle
    loadSettings();

    // -------------------------------------------------------------
    // GİRDİ MODU GEÇİŞİ: EL TAKİBİ vs 🔴 LAZER MODU
    // -------------------------------------------------------------
    function setInputMode(mode) {
        fetch('/api/input_mode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: mode })
        }).then(res => res.json()).then(data => {
            if (data.success) {
                document.querySelectorAll('.btn-input-mode, #settingsInputModeGroup .btn-segment').forEach(btn => {
                    btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
                });
                const camInfo = document.getElementById('camInfoBadge');
                if (camInfo) {
                    if (mode === 'LASER') {
                        camInfo.innerHTML = '<i class="fa-solid fa-bullseye" style="color:#ef4444;"></i> 🔴 LAZER MODU';
                    } else {
                        camInfo.innerHTML = '<i class="fa-solid fa-video"></i> WEBCAM (EL TAKİBİ)';
                    }
                }
            }
        }).catch(err => console.error("Input mode error:", err));
    }

    document.querySelectorAll('.btn-input-mode, #settingsInputModeGroup .btn-segment').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.getAttribute('data-mode');
            if (mode) setInputMode(mode);
        });
    });


});
