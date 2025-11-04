// --- グローバル変数と定数 ---
const dom = {}; // DOM要素をキャッシュするオブジェクト
const audio = {}; // Audioオブジェクトをキャッシュするオブジェクト
let latestLandmarks = null; // 最新の顔ランドマーク情報

const settings = {
    eyeThreshold: 0.15,
    mouthThreshold: 0.15,
    openEyeMultiplier: 1.3
};

const HANDS = { rock: '✊ グー', scissors: '✌️ チョキ', paper: '✋ パー' };
const HAND_TYPES = Object.keys(HANDS);

// --- 初期化処理 ---
window.addEventListener('DOMContentLoaded', main);

function main() {
    cacheDOMElements();
    cacheAudioElements();
    setupEventListeners();
    initializeApp();
}

function cacheDOMElements() {
    const ids = [
        'video', 'canvas', 'loading-message', 'container',
        'countdown', 'player-hand', 'computer-hand', 'game-result', 'janken-button',
        'left-eye-value', 'right-eye-value', 'mouth-value',
        'eye-threshold-slider', 'eye-threshold-value',
        'mouth-threshold-slider', 'mouth-threshold-value',
        'snap-left-eye', 'snap-right-eye', 'snap-mouth',
        'toggle-settings-button', 'info-panel' // [修正] ボタンとパネルを追加
    ];
    ids.forEach(id => {
        const key = id.replace(/-(\w)/g, (_, c) => c.toUpperCase());
        dom[key] = document.getElementById(id);
    });
}

function cacheAudioElements() {
    audio.jankenpon = new Audio('audio/jankenpon.m4a');
    audio.yappy = new Audio('audio/yappy.m4a');
    audio.zuko = new Audio('audio/zuko.m4a');
    audio.aikodesho = new Audio('audio/aikodesho.m4a');
}

function playAudio(audioElement) {
    audioElement.currentTime = 0;
    audioElement.play().catch(error => console.error("音声の再生に失敗:", error));
}

function setupEventListeners() {
    dom.jankenButton.addEventListener('click', startGame);

    // [修正] 設定パネルの表示/非表示イベント
    dom.toggleSettingsButton.addEventListener('click', () => {
        dom.infoPanel.classList.toggle('hidden');
        if (dom.infoPanel.classList.contains('hidden')) {
            dom.toggleSettingsButton.textContent = '設定を表示';
        } else {
            dom.toggleSettingsButton.textContent = '設定を隠す';
        }
    });

    dom.eyeThresholdSlider.addEventListener('input', (e) => {
        settings.eyeThreshold = parseFloat(e.target.value);
        dom.eyeThresholdValue.textContent = settings.eyeThreshold.toFixed(2);
    });
    dom.mouthThresholdSlider.addEventListener('input', (e) => {
        settings.mouthThreshold = parseFloat(e.target.value);
        dom.mouthThresholdValue.textContent = settings.mouthThreshold.toFixed(2);
    });
}

// --- ▼▼▼ [修正] 初期化処理の改善 ▼▼▼ ---
async function initializeApp() {
    dom.eyeThresholdSlider.value = settings.eyeThreshold;
    dom.eyeThresholdValue.textContent = settings.eyeThreshold.toFixed(2);
    dom.mouthThresholdSlider.value = settings.mouthThreshold;
    dom.mouthThresholdValue.textContent = settings.mouthThreshold.toFixed(2);

    try {
        console.log("face-api.jsのモデルを読み込んでいます...");
        dom.loadingMessage.textContent = "モデルを読み込み中...";
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri('./models'),
            faceapi.nets.faceLandmark68TinyNet.loadFromUri('./models')
        ]);
        console.log("モデルの読み込みが完了しました。");

        console.log("カメラを起動しています...");
        dom.loadingMessage.textContent = "カメラを起動中...";
        await startVideo();
        console.log("カメラの準備ができました。");

        dom.video.addEventListener('play', () => {
            dom.loadingMessage.style.display = 'none';
            dom.container.style.display = 'block';
            detectFacesLoop();
        });
    } catch (err) {
        console.error("初期化中にエラーが発生しました:", err);
        dom.loadingMessage.textContent = "エラー発生。コンソールを確認してください。";
        // エラー内容に応じたメッセージを表示
        if (err.name === 'NotAllowedError') {
             dom.loadingMessage.textContent = "カメラへのアクセスが拒否されました。";
        } else if (err.toString().includes('failed to fetch')) {
             dom.loadingMessage.textContent = "モデルファイルの読み込みに失敗しました。";
        }
    }
}

// --- カメラ・顔認識関連 (変更なし) ---
async function startVideo() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
    dom.video.srcObject = stream;
    return new Promise((resolve) => {
        dom.video.onloadedmetadata = () => {
            resolve();
        };
    });
}

async function detectFacesLoop() {
    // ... (この関数は変更なし)
    const video = dom.video;
    const detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320 });
    const detections = await faceapi.detectAllFaces(video, detectorOptions).withFaceLandmarks(true);

    if (detections && detections.length > 0) {
        latestLandmarks = detections[0].landmarks;
        updateRealtimeInfo(latestLandmarks);
    } else {
        latestLandmarks = null;
        dom.leftEyeValue.textContent = '-';
        dom.rightEyeValue.textContent = '-';
        dom.mouthValue.textContent = '-';
    }
    requestAnimationFrame(detectFacesLoop);
}

function updateRealtimeInfo(landmarks) {
    // ... (この関数は変更なし)
    const leftEyeAspectRatio = getEyeAspectRatio(landmarks.getLeftEye());
    const rightEyeAspectRatio = getEyeAspectRatio(landmarks.getRightEye());
    const mouthOpenRatio = getMouthOpenRatio(landmarks);
    dom.leftEyeValue.textContent = leftEyeAspectRatio.toFixed(3);
    dom.rightEyeValue.textContent = rightEyeAspectRatio.toFixed(3);
    dom.mouthValue.textContent = mouthOpenRatio.toFixed(3);
}


// --- ▼▼▼ [修正] じゃんけんゲームのロジック (音声タイミング修正) ▼▼▼ ---
function startGame() {
    dom.jankenButton.disabled = true;
    resetUI();
    
    playAudio(audio.jankenpon); // 「じゃん」の表示と同時に音声を再生
    setTimeout(() => { dom.countdown.textContent = "じゃん"; }, 0);
    setTimeout(() => { dom.countdown.textContent = "けん"; }, 1000);
    setTimeout(() => {
        dom.countdown.textContent = "ポン！";
        
        // 「ポン」の音声が終わるのを待ってから結果を判定・表示
        setTimeout(() => {
            evaluateJanken();
        }, 600); // 0.6秒後に判定（jankenpon.m4aの長さに合わせて調整）

    }, 2000);
}

function evaluateJanken(isAiko = false) {
    const snapshot = takeSnapshot();
    const playerHand = determinePlayerHand(snapshot);
    const computerHand = determineComputerHand();
    const result = judgeResult(playerHand, computerHand);

    updateHandsUI(playerHand, computerHand, snapshot);

    if (result === 'あいこ') {
        dom.gameResult.textContent = "あいこで...";
        handleAiko();
    } else {
        showFinalResult(result);
    }
}

function handleAiko() {
    playAudio(audio.aikodesho);
    setTimeout(() => { dom.countdown.textContent = "あい"; }, 500);
    setTimeout(() => { dom.countdown.textContent = "こで"; }, 1200);
    setTimeout(() => {
        dom.countdown.textContent = "しょ！";
         // 「しょ」の音声が終わるのを待ってから再判定
        setTimeout(() => {
            evaluateJanken(true);
        }, 600); // 0.6秒後に再判定
    }, 1900);
}

function showFinalResult(result) {
    dom.gameResult.textContent = result;
    if (result.includes('勝ち')) {
        playAudio(audio.yappy);
    } else {
        playAudio(audio.zuko);
    }
    dom.jankenButton.disabled = false;
}

function resetUI() {
    dom.playerHand.textContent = '❓';
    dom.computerHand.textContent = '❓';
    dom.gameResult.textContent = "ボタンを押してスタート！";
    dom.countdown.textContent = "";
    dom.snapLeftEye.textContent = '-';
    dom.snapRightEye.textContent = '-';
    dom.snapMouth.textContent = '-';
}

function updateHandsUI(playerHand, computerHand, snapshot) {
    dom.playerHand.textContent = HANDS[playerHand];
    dom.computerHand.textContent = HANDS[computerHand];
    if (snapshot.detected) {
        dom.snapLeftEye.textContent = snapshot.leftEye.toFixed(3);
        dom.snapRightEye.textContent = snapshot.rightEye.toFixed(3);
        dom.snapMouth.textContent = snapshot.mouth.toFixed(3);
    }
}

// --- 判定・計算ヘルパー関数 (このセクションは変更なし) ---
function takeSnapshot() {
    if (!latestLandmarks) {
        return { leftEye: 0, rightEye: 0, mouth: 0, detected: false };
    }
    return {
        leftEye: getEyeAspectRatio(latestLandmarks.getLeftEye()),
        rightEye: getEyeAspectRatio(latestLandmarks.getRightEye()),
        mouth: getMouthOpenRatio(latestLandmarks),
        detected: true
    };
}

function determinePlayerHand(snapshot) {
    if (!snapshot.detected) return HAND_TYPES[Math.floor(Math.random() * 3)];
    if (snapshot.mouth > settings.mouthThreshold) return 'paper';
    const isLeftWink = snapshot.leftEye < settings.eyeThreshold && snapshot.rightEye > settings.eyeThreshold * settings.openEyeMultiplier;
    if (isLeftWink) return 'rock';
    const isRightWink = snapshot.rightEye < settings.eyeThreshold && snapshot.leftEye > settings.eyeThreshold * settings.openEyeMultiplier;
    if (isRightWink) return 'scissors';
    return 'rock';
}

function determineComputerHand() {
    return HAND_TYPES[Math.floor(Math.random() * 3)];
}

function judgeResult(player, computer) {
    if (player === computer) return 'あいこ';
    if ((player === 'rock' && computer === 'scissors') ||
        (player === 'scissors' && computer === 'paper') ||
        (player === 'paper' && computer === 'rock')) {
        return '勝ち！🎉';
    }
    return '負け...😢';
}

function getEyeAspectRatio(eye) {
    const v1 = Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y);
    const v2 = Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y);
    const h = Math.hypot(eye[0].x - eye[3].x, eye[0].y - eye[3].y);
    return (v1 + v2) / (2.0 * h);
}

function getMouthOpenRatio(landmarks) {
    const mouth = landmarks.getMouth();
    const jaw = landmarks.getJawOutline();
    if (jaw.length < 17) return 0;
    const mouthOpening = mouth[14].y - mouth[18].y;
    const faceHeight = jaw[8].y - jaw[0].y;
    return faceHeight > 0 ? Math.abs(mouthOpening / faceHeight) : 0;
}