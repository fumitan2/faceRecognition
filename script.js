// アプリケーション全体の状態を管理するオブジェクトmouth
const appState = {
    intervalTime: 200,
    eyeThreshold: 0.15,
    openEyeMultiplier: 1.2,
    mouthThreshold: 0.15,
    mouthFrameIndex: 0, // ★ 口のアニメーションフレーム番号を追加
};

// DOM要素をまとめて管理するオブジェクト
const domElements = {};

// 画像リソースを管理するオブジェクト
const images = {
    mouthFrames: [], // ★ 口の画像を配列で管理するように変更
    //mouth: new Image(),
    wink: new Image(),
};

/**
 * アプリケーションの初期化
 */
function main() {
    cacheDOMElements();
    loadImages();
    setupEventListeners();
    initializeApp();
}

/**
 * DOM要素を一度だけ取得し、キャッシュする
 */
function cacheDOMElements() {
    const ids = [
        'video', 'canvas', 'loading-message', 'container', 'toggle-ui-button', 'ui-container',
        'resolution-selector', 'interval-slider', 'eye-threshold-slider', 'open-eye-multiplier-slider', 'mouth-threshold-slider',
        'interval-value', 'eye-threshold-value', 'open-eye-multiplier-value', 'mouth-threshold-value',
        'left-eye-value', 'right-eye-value', 'mouth-value'
    ];
    ids.forEach(id => {
        // 'el-id' を 'elId' のようなキャメルケースに変換
        const key = id.replace(/-(\w)/g, (_, c) => c.toUpperCase());
        domElements[key] = document.getElementById(id);
    });
}

/**
 * 使用する画像を読み込む
 */
function loadImages() {
    //images.mouth.src = 'images/mouth_open.png';
    // ★ 口の連番画像を読み込む
    const MOUTH_FRAME_COUNT = 6; // 画像の枚数を指定
    for (let i = 0; i < MOUTH_FRAME_COUNT; i++) {
        const img = new Image();
        // ファイル名を 'mouse00.png', 'mouse01.png', ... のように生成
        img.src = `images/mlogo${i.toString().padStart(2, '0')}.png`;
        images.mouthFrames.push(img);
    }
    //images.mouth.src = 'images/mlogo.gif';
    images.wink.src = 'images/wink_eye.png';
}

/**
 * すべてのイベントリスナーを設定する
 */
function setupEventListeners() {
    domElements.toggleUiButton.addEventListener('click', () => {
        domElements.uiContainer.classList.toggle('visible');
    });

    domElements.resolutionSelector.addEventListener('change', () => {
        stopVideoStream();
        startVideo();
    });

    // スライダーのイベントを共通化
    setupSlider(domElements.intervalSlider, domElements.intervalValue, 'intervalTime', 0);
    setupSlider(domElements.eyeThresholdSlider, domElements.eyeThresholdValue, 'eyeThreshold', 2);
    setupSlider(domElements.openEyeMultiplierSlider, domElements.openEyeMultiplierValue, 'openEyeMultiplier', 1);
    setupSlider(domElements.mouthThresholdSlider, domElements.mouthThresholdValue, 'mouthThreshold', 2);
}

/**
 * スライダーのイベントリスナー設定を共通化するヘルパー関数
 * @param {HTMLInputElement} slider - スライダー要素
 * @param {HTMLElement} display - 値を表示するspan要素
 * @param {string} stateKey - appStateのキー
 * @param {number} precision - toFixedの小数点以下の桁数
 */
function setupSlider(slider, display, stateKey, precision) {
    slider.addEventListener('input', e => {
        const value = precision === 0 ? parseInt(e.target.value) : parseFloat(e.target.value);
        appState[stateKey] = value;
        display.textContent = value.toFixed(precision);
    });
}

/**
 * face-apiモデルの読み込みとカメラの起動を行う
 */
async function initializeApp() {
    await faceapi.nets.tinyFaceDetector.loadFromUri('./models');
    await faceapi.nets.faceLandmark68TinyNet.loadFromUri('./models');
    await startVideo();

    domElements.video.addEventListener('play', () => {
        // UIの初期値を設定
        Object.keys(appState).forEach(key => {
            const displayKey = key.replace(/([A-Z])/g, '-$1').toLowerCase() + '-value';
            const sliderKey = key.replace(/([A-Z])/g, '-$1').toLowerCase() + '-slider';
            if (domElements[displayKey]) {
                domElements[displayKey].textContent = domElements[sliderKey].value;
            }
        });

        domElements.loadingMessage.style.display = 'none';
        domElements.container.style.display = 'block';
        detectFacesLoop();
    });
}

/**
 * カメラを起動する
 */
async function startVideo() {
    const [width, height] = domElements.resolutionSelector.value.split('x').map(Number);
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: width }, height: { ideal: height } }
        });
        domElements.video.srcObject = stream;
    } catch (err) {
        console.error(err);
        alert('カメラの起動に失敗しました。カメラへのアクセスを許可してください。');
    }
}

/**
 * 既存のビデオストリームを停止する
 */
function stopVideoStream() {
    if (domElements.video.srcObject) {
        domElements.video.srcObject.getTracks().forEach(track => track.stop());
    }
}

/**
 * 顔検出のメインループ
 */
async function detectFacesLoop() {
    const video = domElements.video;
    const detectorOptions = new faceapi.TinyFaceDetectorOptions({ inputSize: 320 });
    const detections = await faceapi.detectAllFaces(video, detectorOptions).withFaceLandmarks(true);

    if (detections && detections.length > 0) {
        const landmarks = detections[0].landmarks;
        updateDebugInfo(landmarks);
        drawOverlays(detections);
    } else {
        // 顔が検出されなかったらcanvasをクリア
        const context = domElements.canvas.getContext('2d');
        context.clearRect(0, 0, domElements.canvas.width, domElements.canvas.height);
    }

    setTimeout(detectFacesLoop, appState.intervalTime);
}

/**
 * リアルタイム情報パネルを更新する
 * @param {faceapi.FaceLandmarks68} landmarks - 検出された顔のパーツ
 */
function updateDebugInfo(landmarks) {
    const leftEyeAspectRatio = getEyeAspectRatio(landmarks.getLeftEye());
    const rightEyeAspectRatio = getEyeAspectRatio(landmarks.getRightEye());
    const mouthOpenRatio = getMouthOpenRatio(landmarks);

    domElements.leftEyeValue.textContent = leftEyeAspectRatio.toFixed(2);
    domElements.rightEyeValue.textContent = rightEyeAspectRatio.toFixed(2);
    domElements.mouthValue.textContent = mouthOpenRatio.toFixed(2);
}

/**
 * 検出結果に応じてcanvasに画像を描画する
 * @param {Array} detections - 顔の検出結果
 */
function drawOverlays(detections) {
    const { video, canvas } = domElements;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const displaySize = { width: video.clientWidth, height: video.clientHeight };
    faceapi.matchDimensions(canvas, displaySize);
    const resizedDetections = faceapi.resizeResults(detections, displaySize);
    const landmarks = resizedDetections[0].landmarks;

    context.clearRect(0, 0, canvas.width, canvas.height);
    context.save(); // 現在の状態を保存
    context.translate(canvas.width, 0);
    context.scale(-1, 1);

    const isMouthOpen = getMouthOpenRatio(landmarks) > appState.mouthThreshold;
    const winkState = checkWink(getEyeAspectRatio(landmarks.getLeftEye()), getEyeAspectRatio(landmarks.getRightEye()));

    if (isMouthOpen) {
        const box = resizedDetections[0].detection.box;
        // ★ 現在のフレーム番号の画像を描画
        const currentFrame = images.mouthFrames[appState.mouthFrameIndex];
        drawImageWithAspectRatio(context, currentFrame, box);

        // ★ 次のフレームのためにインデックスを更新（ループさせる）
        appState.mouthFrameIndex = (appState.mouthFrameIndex + 1) % images.mouthFrames.length;

        //const box = resizedDetections[0].detection.box;
        //drawImageWithAspectRatio(context, images.mouth, box);
    } else if (winkState.isWinking) {
        const eyeToDrawOn = winkState.winkedEye === 'left' ? landmarks.getLeftEye() : landmarks.getRightEye();
        const eyeWidth = Math.hypot(eyeToDrawOn[3].x - eyeToDrawOn[0].x, eyeToDrawOn[3].y - eyeToDrawOn[0].y);
        const imageSize = eyeWidth * 1.8;
        const eyeCenter = {
            x: eyeToDrawOn.reduce((sum, pos) => sum + pos.x, 0) / eyeToDrawOn.length,
            y: eyeToDrawOn.reduce((sum, pos) => sum + pos.y, 0) / eyeToDrawOn.length,
        };
        const box = { x: eyeCenter.x - imageSize / 2, y: eyeCenter.y - imageSize / 2, width: imageSize, height: imageSize };
        drawImageWithAspectRatio(context, images.wink, box);
    }
    context.restore(); // 座標系を元に戻す
}

/**
 * アスペクト比を維持して画像を描画するヘルパー関数
 * @param {CanvasRenderingContext2D} context - 描画コンテキスト
 * @param {HTMLImageElement} image - 描画する画像
 * @param {object} box - {x, y, width, height} を持つ描画先の矩形
 */
function drawImageWithAspectRatio(context, image, box) {
    const aspectRatio = image.width / image.height;
    const drawWidth = box.width;
    const drawHeight = drawWidth / aspectRatio;
    const drawX = box.x;
    const drawY = box.y + (box.height - drawHeight) / 2;
    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
}

// --- 判定ロジックのヘルパー関数群 ---
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
    const mouthOpening = mouth[14].y - mouth[18].y; // 内唇の距離
    const faceHeight = jaw[8].y - jaw[0].y;
    return faceHeight > 0 ? Math.abs(mouthOpening / faceHeight) : 0;
}

function checkWink(leftEyeAspectRatio, rightEyeAspectRatio) {
    const isLeftWink = leftEyeAspectRatio < appState.eyeThreshold && rightEyeAspectRatio > appState.eyeThreshold * appState.openEyeMultiplier;
    const isRightWink = rightEyeAspectRatio < appState.eyeThreshold && leftEyeAspectRatio > appState.eyeThreshold * appState.openEyeMultiplier;
    return {
        isWinking: isLeftWink || isRightWink,
        winkedEye: isLeftWink ? 'left' : (isRightWink ? 'right' : null),
    };
}

// スクリプトのエントリーポイント
main();