const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const loadingMessage = document.getElementById('loading-message');
const container = document.getElementById('container');

// 表示する画像をあらかじめ読み込んでおく
const openMouthImage = new Image();
openMouthImage.src = 'images/mouth_open.png';
const winkEyeImage = new Image();
winkEyeImage.src = 'images/wink_eye.png';

// face-api.jsのモデルを読み込む関数
async function loadModels() {
    // 処理が軽いTinyモデルを使用
    await faceapi.nets.tinyFaceDetector.loadFromUri('./models');
    await faceapi.nets.faceLandmark68TinyNet.loadFromUri('./models');
}

// カメラを起動する関数
// async function startVideo() {
//     try {
//         const stream = await navigator.mediaDevices.getUserMedia({
//             video: {}
//         });
//         video.srcObject = stream;
//     } catch (err) {
//         console.error(err);
//         alert('カメラの起動に失敗しました。カメラへのアクセスを許可してください。');
//     }
// }
async function startVideo() {
    try {
        // 解像度を指定してカメラを取得
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },  // 幅を640pxに
                height: { ideal: 480 } // 高さを480pxに
            }
        });
        video.srcObject = stream;
    } catch (err) {
        console.error(err);
        alert('カメラの起動に失敗しました。カメラへのアクセスを許可してください。');
    }
}

// 顔検出と描画を行うメインの処理
async function detectFaces() {
    const context = canvas.getContext('2d');

    // 100ミリ秒ごとに顔を検出し続ける
    setInterval(async () => {
        const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks(true); // 顔のパーツ（ランドマーク）も検出する

        // canvasのサイズをvideoに合わせる
        const displaySize = { width: video.clientWidth, height: video.clientHeight };
        faceapi.matchDimensions(canvas, displaySize);
        const resizedDetections = faceapi.resizeResults(detections, displaySize);

        // canvasをクリア
        context.clearRect(0, 0, canvas.width, canvas.height);
        
        // 鏡写しにするためcanvasも左右反転
        context.translate(canvas.width, 0);
        context.scale(-1, 1);

        if (resizedDetections && resizedDetections.length > 0) {
            const landmarks = resizedDetections[0].landmarks;

            // --- 判定ロジック ---
            const isMouthOpen = checkMouthOpen(landmarks);
            const winkState = checkWink(landmarks);

            // --- 描画ロジック ---
            if (isMouthOpen) {
                // 口が開いていれば、顔全体を置き換え
                const box = resizedDetections[0].detection.box;
                context.drawImage(openMouthImage, box.x, box.y, box.width, box.height);
            } else if (winkState.isWinking) {
                // ウィンクしていれば、閉じている目に画像を描画
                const eyeToDrawOn = winkState.winkedEye === 'left' ? landmarks.getLeftEye() : landmarks.getRightEye();
                const eyeCenterX = eyeToDrawOn.reduce((sum, pos) => sum + pos.x, 0) / eyeToDrawOn.length;
                const eyeCenterY = eyeToDrawOn.reduce((sum, pos) => sum + pos.y, 0) / eyeToDrawOn.length;
                const eyeWidth = landmarks.getJawOutline()[16].x - landmarks.getJawOutline()[0].x; // 顎の幅を目安に画像の大きさを決める
                const imageSize = eyeWidth * 0.3; // 目に合わせる画像のサイズ調整
                context.drawImage(winkEyeImage, eyeCenterX - imageSize / 2, eyeCenterY - imageSize / 2, imageSize, imageSize);
            }
        }
    }, 100);
}

// 口の開き具合を判定する関数
function checkMouthOpen(landmarks) {
    const upperLipTop = landmarks.getMouth()[2]; // 上唇の上
    const lowerLipBottom = landmarks.getMouth()[9]; // 下唇の下
    const mouthOpening = lowerLipBottom.y - upperLipTop.y;
    
    const jawOutline = landmarks.getJawOutline();
    const faceHeight = jawOutline[8].y - jawOutline[0].y; // 顔の高さの目安
    
    // 口の開きが顔の高さの15%以上なら「開いている」と判定
    return mouthOpening > faceHeight * 0.15;
}

// ウィンクを判定する関数
function checkWink(landmarks) {
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();

    const leftEyeAspectRatio = getEyeAspectRatio(leftEye);
    const rightEyeAspectRatio = getEyeAspectRatio(rightEye);

    // --- ここからデバッグ用のコードを追加 ---
    // コンソールに左右の目のアスペクト比を常時出力する
    // toFixed(2) は小数点以下2桁まで表示するという意味です
    console.log(`Left Eye: ${leftEyeAspectRatio.toFixed(2)}, Right Eye: ${rightEyeAspectRatio.toFixed(2)}`);
    // --- ここまで ---

    // 目のアスペクト比の閾値（この値を後で調整します）
    const EYE_AR_THRESH = 0.3;

    let isWinking = false;
    let winkedEye = null;

    if (leftEyeAspectRatio < EYE_AR_THRESH && rightEyeAspectRatio > EYE_AR_THRESH) {
        isWinking = true;
        winkedEye = 'left';
    } else if (rightEyeAspectRatio < EYE_AR_THRESH && leftEyeAspectRatio > EYE_AR_THRESH) {
        isWinking = true;
        winkedEye = 'right';
    }
    
    return { isWinking, winkedEye };
}

// 目のアスペクト比（縦横比）を計算するヘルパー関数
function getEyeAspectRatio(eye) {
    const verticalDist1 = Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y);
    const verticalDist2 = Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y);
    const horizontalDist = Math.hypot(eye[0].x - eye[3].x, eye[0].y - eye[3].y);
    return (verticalDist1 + verticalDist2) / (2.0 * horizontalDist);
}


// --- メインの実行処理 ---
async function main() {
    await loadModels();
    await startVideo();
    
    video.addEventListener('play', () => {
        // ロードメッセージを非表示にし、コンテナを表示
        loadingMessage.style.display = 'none';
        container.style.display = 'block';
        detectFaces();
    });
}

main();