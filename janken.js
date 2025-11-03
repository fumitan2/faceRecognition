// --- グローバル変数と定数 ---
const dom = {}; // DOM要素をキャッシュするオブジェクト
let latestLandmarks = null; // 最新の顔ランドマーク情報

// 設定値を管理するオブジェクト
const settings = {
    eyeThreshold: 0.15,
    mouthThreshold: 0.15,
    openEyeMultiplier: 1.3 // ウインク判定で開いているとみなす目の倍率
};

const HANDS = { rock: '✊ グー', scissors: '✌️ チョキ', paper: '✋ パー' };
const HAND_TYPES = Object.keys(HANDS);

// --- 初期化処理 ---
window.addEventListener('DOMContentLoaded', main);

function main() {
    cacheDOMElements();
    setupEventListeners();
    initializeApp();
}

/**
 * 使用するDOM要素を一度だけ取得し、キャッシュする
 */
function cacheDOMElements() {
    const ids = [
        'video', 'canvas', 'loading-message', 'container',
        'countdown', 'player-hand', 'computer-hand', 'game-result', 'janken-button',
        'left-eye-value', 'right-eye-value', 'mouth-value',
        'eye-threshold-slider', 'eye-threshold-value',
        'mouth-threshold-slider', 'mouth-threshold-value',
        'snap-left-eye', 'snap-right-eye', 'snap-mouth'
    ];
    ids.forEach(id => {
        const key = id.replace(/-(\w)/g, (_, c) => c.toUpperCase());
        dom[key] = document.getElementById(id);
    });
}

/**
 * すべてのイベントリスナーを設定する
 */
function setupEventListeners() {
    dom.jankenButton.addEventListener('click', startGame);

    // 感度設定スライダーのイベント
    dom.eyeThresholdSlider.addEventListener('input', (e) => {
        settings.eyeThreshold = parseFloat(e.target.value);
        dom.eyeThresholdValue.textContent = settings.eyeThreshold.toFixed(2);
    });
    dom.mouthThresholdSlider.addEventListener('input', (e) => {
        settings.mouthThreshold = parseFloat(e.target.value);
        dom.mouthThresholdValue.textContent = settings.mouthThreshold.toFixed(2);
    });
}

/**
 * face-apiモデルの読み込みとカメラの起動を行う
 */
async function initializeApp() {
    // スライダーの初期値を設定オブジェクトから反映
    dom.eyeThresholdSlider.value = settings.eyeThreshold;
    dom.eyeThresholdValue.textContent = settings.eyeThreshold.toFixed(2);
    dom.mouthThresholdSlider.value = settings.mouthThreshold;
    dom.mouthThresholdValue.textContent = settings.mouthThreshold.toFixed(2);

    try {
        await Promise.all([
            faceapi.nets.tinyFaceDetector.loadFromUri('./models'),
            faceapi.nets.faceLandmark68TinyNet.loadFromUri('./models')
        ]);
        await startVideo();

        dom.video.addEventListener('play', () => {
            dom.loadingMessage.style.display = 'none';
            dom.container.style.display = 'block'; // ← この行を追加！
            detectFacesLoop();
        });
    } catch (err) {
        console.error("初期化エラー:", err);
        dom.loadingMessage.textContent = "エラーが発生しました。カメラを許可し、リロードしてください。";
    }
}



// --- カメラ・顔認識関連 ---
async function startVideo() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: {} });
        dom.video.srcObject = stream;
    } catch (err) {
        console.error("カメラのアクセスに失敗:", err);
        dom.gameResult.textContent = "カメラを許可してください";
        dom.jankenButton.disabled = true;
    }
}

async function detectFacesLoop() {
    const video = dom.video;
    const detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320 });
    const detections = await faceapi.detectAllFaces(video, detectorOptions).withFaceLandmarks(true);

    if (detections && detections.length > 0) {
        latestLandmarks = detections[0].landmarks;
        updateRealtimeInfo(latestLandmarks);
    } else {
        latestLandmarks = null;
        // 顔が検出されない場合は表示をリセット
        dom.leftEyeValue.textContent = '-';
        dom.rightEyeValue.textContent = '-';
        dom.mouthValue.textContent = '-';
    }

    requestAnimationFrame(detectFacesLoop);
}

/**
 * リアルタイム情報パネルを更新する
 * @param {faceapi.FaceLandmarks68} landmarks 
 */
function updateRealtimeInfo(landmarks) {
    const leftEyeAspectRatio = getEyeAspectRatio(landmarks.getLeftEye());
    const rightEyeAspectRatio = getEyeAspectRatio(landmarks.getRightEye());
    const mouthOpenRatio = getMouthOpenRatio(landmarks);

    dom.leftEyeValue.textContent = leftEyeAspectRatio.toFixed(3);
    dom.rightEyeValue.textContent = rightEyeAspectRatio.toFixed(3);
    dom.mouthValue.textContent = mouthOpenRatio.toFixed(3);
}


// --- じゃんけんゲームのロジック ---
function startGame() {
    dom.jankenButton.disabled = true;
    resetUI();

    setTimeout(() => { dom.countdown.textContent = "じゃん"; }, 0);
    setTimeout(() => { dom.countdown.textContent = "けん"; }, 1000);
    setTimeout(() => {
        dom.countdown.textContent = "ポン！";
        playJanken();
        dom.jankenButton.disabled = false;
    }, 2000);
}

function playJanken() {
    // 「ポン」の瞬間の顔の状態を取得・保存
    const snapshot = takeSnapshot();

    const playerHand = determinePlayerHand(snapshot);
    const computerHand = determineComputerHand();
    const result = judgeResult(playerHand, computerHand);

    updateResultUI(playerHand, computerHand, result, snapshot);
}

function resetUI() {
    dom.playerHand.textContent = '❓';
    dom.computerHand.textContent = '❓';
    dom.gameResult.textContent = "";
    dom.countdown.textContent = "";
    // スナップショット表示もリセット
    dom.snapLeftEye.textContent = '-';
    dom.snapRightEye.textContent = '-';
    dom.snapMouth.textContent = '-';
}

/**
 * 現在の顔のパラメータのスナップショットを取得する
 */
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

/**
 * プレイヤーの手を表情から決定する
 * @param {object} snapshot 「ポン」の瞬間の顔パラメータ
 * @returns {'rock' | 'scissors' | 'paper'}
 */
function determinePlayerHand(snapshot) {
    if (!snapshot.detected) {
        return HAND_TYPES[Math.floor(Math.random() * 3)]; // 顔が未検出ならランダム
    }

    // パー：口の開きを最優先
    if (snapshot.mouth > settings.mouthThreshold) {
        return 'paper';
    }
    // グー：左目ウインク
    const isLeftWink = snapshot.leftEye < settings.eyeThreshold && snapshot.rightEye > settings.eyeThreshold * settings.openEyeMultiplier;
    if (isLeftWink) {
        return 'rock';
    }
    // チョキ：右目ウインク
    const isRightWink = snapshot.rightEye < settings.eyeThreshold && snapshot.leftEye > settings.eyeThreshold * settings.openEyeMultiplier;
    if (isRightWink) {
        return 'scissors';
    }

    return 'rock'; // どれにも当てはまらない場合はグー
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

/**
 * UIに最終結果とスナップショットを表示する
 */
function updateResultUI(playerHand, computerHand, result, snapshot) {
    dom.playerHand.textContent = HANDS[playerHand];
    dom.computerHand.textContent = HANDS[computerHand];
    dom.gameResult.textContent = result;

    // スナップショットの値を表示
    if (snapshot.detected) {
        dom.snapLeftEye.textContent = snapshot.leftEye.toFixed(3);
        dom.snapRightEye.textContent = snapshot.rightEye.toFixed(3);
        dom.snapMouth.textContent = snapshot.mouth.toFixed(3);
    }
}


// --- 顔パーツの計算ヘルパー関数 (変更なし) ---
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