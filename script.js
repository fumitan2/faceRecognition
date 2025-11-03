const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const loadingMessage = document.getElementById('loading-message');
const container = document.getElementById('container');

// --- UI要素を取得 ---
const toggleUiButton = document.getElementById('toggle-ui-button');
const uiContainer = document.getElementById('ui-container');
const resolutionSelector = document.getElementById('resolution-selector');
const intervalSlider = document.getElementById('interval-slider');
const eyeThresholdSlider = document.getElementById('eye-threshold-slider');
const openEyeMultiplierSlider = document.getElementById('open-eye-multiplier-slider'); // ★追加
const mouthThresholdSlider = document.getElementById('mouth-threshold-slider');
const intervalValueSpan = document.getElementById('interval-value');
const eyeThresholdValueSpan = document.getElementById('eye-threshold-value');
const openEyeMultiplierValueSpan = document.getElementById('open-eye-multiplier-value'); // ★追加
const mouthThresholdValueSpan = document.getElementById('mouth-threshold-value');
const leftEyeValueSpan = document.getElementById('left-eye-value');
const rightEyeValueSpan = document.getElementById('right-eye-value');
const mouthValueSpan = document.getElementById('mouth-value');

// --- パラメータの変数 ---
let intervalTime = parseInt(intervalSlider.value);
let eyeThreshold = parseFloat(eyeThresholdSlider.value);
let openEyeMultiplier = parseFloat(openEyeMultiplierSlider.value); // ★追加
let mouthThreshold = parseFloat(mouthThresholdSlider.value);

// --- 画像の読み込み ---
const openMouthImage = new Image();
openMouthImage.src = 'images/mouth_open.png';
const winkEyeImage = new Image();
winkEyeImage.src = 'images/wink_eye.png';

// --- イベントリスナーの設定 ---
toggleUiButton.addEventListener('click', () => {
    uiContainer.classList.toggle('visible');
});
resolutionSelector.addEventListener('change', () => {
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
    }
    startVideo();
});
intervalSlider.addEventListener('input', e => {
    intervalTime = parseInt(e.target.value);
    intervalValueSpan.textContent = intervalTime;
});
eyeThresholdSlider.addEventListener('input', e => {
    eyeThreshold = parseFloat(e.target.value);
    eyeThresholdValueSpan.textContent = eyeThreshold.toFixed(2);
});
// ★新しいスライダー用のイベントリスナーを追加
openEyeMultiplierSlider.addEventListener('input', e => {
    openEyeMultiplier = parseFloat(e.target.value);
    openEyeMultiplierValueSpan.textContent = openEyeMultiplier.toFixed(1);
});
mouthThresholdSlider.addEventListener('input', e => {
    mouthThreshold = parseFloat(e.target.value);
    mouthThresholdValueSpan.textContent = mouthThreshold.toFixed(2);
});

// --- face-api.jsのモデル読み込み ---
async function loadModels() {
    await faceapi.nets.tinyFaceDetector.loadFromUri('./models');
    await faceapi.nets.faceLandmark68TinyNet.loadFromUri('./models');
}

// --- カメラ起動 ---
async function startVideo() {
    const selectedOption = resolutionSelector.value.split('x');
    const width = parseInt(selectedOption[0]);
    const height = parseInt(selectedOption[1]);
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: width }, height: { ideal: height } }
        });
        video.srcObject = stream;
    } catch (err) {
        console.error(err);
        alert('カメラの起動に失敗しました。カメラへのアクセスを許可してください。');
    }
}

// --- 顔検出のメインループ ---
async function detectFacesLoop() {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320 });

    const detections = await faceapi.detectAllFaces(video, detectorOptions).withFaceLandmarks(true);

    const displaySize = { width: video.clientWidth, height: video.clientHeight };
    faceapi.matchDimensions(canvas, displaySize);
    const resizedDetections = faceapi.resizeResults(detections, displaySize);

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width, 0);
    context.scale(-1, 1);

    if (resizedDetections && resizedDetections.length > 0) {
        const landmarks = resizedDetections[0].landmarks;

        const leftEyeAspectRatio = getEyeAspectRatio(landmarks.getLeftEye());
        const rightEyeAspectRatio = getEyeAspectRatio(landmarks.getRightEye());
        const mouthOpenRatio = getMouthOpenRatio(landmarks);
        leftEyeValueSpan.textContent = leftEyeAspectRatio.toFixed(2);
        rightEyeValueSpan.textContent = rightEyeAspectRatio.toFixed(2);
        mouthValueSpan.textContent = mouthOpenRatio.toFixed(2);
        
        const isMouthOpen = mouthOpenRatio > mouthThreshold;
        const winkState = checkWink(leftEyeAspectRatio, rightEyeAspectRatio);

        // 描画ロジック
        if (isMouthOpen) {
            const box = resizedDetections[0].detection.box;
            const aspectRatio = openMouthImage.width / openMouthImage.height;
            let drawWidth = box.width;
            let drawHeight = drawWidth / aspectRatio;
            const drawX = box.x;
            const drawY = box.y + (box.height - drawHeight) / 2;
            context.drawImage(openMouthImage, drawX, drawY, drawWidth, drawHeight);
        } else if (winkState.isWinking) {
            const eyeToDrawOn = winkState.winkedEye === 'left' ? landmarks.getLeftEye() : landmarks.getRightEye();
            const eyeWidth = Math.hypot(eyeToDrawOn[3].x - eyeToDrawOn[0].x, eyeToDrawOn[3].y - eyeToDrawOn[0].y);
            const imageSize = eyeWidth * 1.8;
            const aspectRatio = winkEyeImage.width / winkEyeImage.height;
            const drawWidth = imageSize;
            const drawHeight = drawWidth / aspectRatio;
            const eyeCenterX = eyeToDrawOn.reduce((sum, pos) => sum + pos.x, 0) / eyeToDrawOn.length;
            const eyeCenterY = eyeToDrawOn.reduce((sum, pos) => sum + pos.y, 0) / eyeToDrawOn.length;
            const drawX = eyeCenterX - drawWidth / 2;
            const drawY = eyeCenterY - drawHeight / 2;
            context.drawImage(winkEyeImage, drawX, drawY, drawWidth, drawHeight);
        }
    }
    setTimeout(detectFacesLoop, intervalTime);
}

// --- ヘルパー関数群 ---
function getEyeAspectRatio(eye) {
    const verticalDist1 = Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y);
    const verticalDist2 = Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y);
    const horizontalDist = Math.hypot(eye[0].x - eye[3].x, eye[0].y - eye[3].y);
    return (verticalDist1 + verticalDist2) / (2.0 * horizontalDist);
}

function getMouthOpenRatio(landmarks) {
    const upperLipTop = landmarks.getMouth()[2];
    const lowerLipBottom = landmarks.getMouth()[9];
    const mouthOpening = lowerLipBottom.y - upperLipTop.y;
    const jawOutline = landmarks.getJawOutline();
    if (jawOutline.length < 17) return 0;
    const faceHeight = jawOutline[8].y - jawOutline[0].y;
    return faceHeight > 0 ? mouthOpening / faceHeight : 0;
}

function checkWink(leftEyeAspectRatio, rightEyeAspectRatio) {
    let isWinking = false;
    let winkedEye = null;
    const EYE_AR_THRESH = eyeThreshold; 
    // ★ openEyeMultiplierをローカル変数で定義するのではなく、グローバルな値を使用する
    if (leftEyeAspectRatio < EYE_AR_THRESH && rightEyeAspectRatio > EYE_AR_THRESH * openEyeMultiplier) {
        isWinking = true;
        winkedEye = 'left';
    } else if (rightEyeAspectRatio < EYE_AR_THRESH && leftEyeAspectRatio > EYE_AR_THRESH * openEyeMultiplier) {
        isWinking = true;
        winkedEye = 'right';
    }
    return { isWinking, winkedEye };
}

// --- メイン実行処理 ---
async function main() {
    await loadModels();
    await startVideo();
    
    video.addEventListener('play', () => {
        // UIの初期値をスライダーから設定
        intervalValueSpan.textContent = intervalSlider.value;
        eyeThresholdValueSpan.textContent = parseFloat(eyeThresholdSlider.value).toFixed(2);
        openEyeMultiplierValueSpan.textContent = parseFloat(openEyeMultiplierSlider.value).toFixed(1); // ★追加
        mouthThresholdValueSpan.textContent = parseFloat(mouthThresholdSlider.value).toFixed(2);

        loadingMessage.style.display = 'none';
        container.style.display = 'block';
        detectFacesLoop();
    });
}

main();