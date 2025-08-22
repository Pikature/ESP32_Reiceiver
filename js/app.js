// ================= 蓝牙照片接收应用 =================
// 应用状态变量
let isBluetoothAvailable = false;
let isConnected = false;
let currentDevice = null;
let photosReceived = 0;
let server = null;
let service = null;
let characteristic = null;

// 照片接收状态
let isReceivingPhoto = false;
let photoChunks = {};
let receivedBytes = 0;
let totalBytes = 0;
let maxFrameIndex = -1;
let frameCounter = 0;

// 蓝牙UUID配置 (需要与ESP32代码匹配)
const SERVICE_UUID = '19b10000-e8f2-537e-4f6c-d104768a1214';
const CHARACTERISTIC_UUID = '19b10005-e8f2-537e-4f6c-d104768a1214';

// DOM元素
const bluetoothStatus = document.getElementById('bluetooth-status');
const bluetoothStatusText = document.getElementById('bluetooth-status-text');
const deviceStatus = document.getElementById('device-status');
const deviceStatusText = document.getElementById('device-status-text');
const signalStrength = document.getElementById('signal-strength');
const deviceName = document.getElementById('device-name');
const deviceId = document.getElementById('device-id');
const serviceStatus = document.getElementById('service-status');
const photosReceivedEl = document.getElementById('photos-received');
const scanBtn = document.getElementById('scan-btn');
const receiveBtn = document.getElementById('receive-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const clearBtn = document.getElementById('clear-btn');
const downloadBtn = document.getElementById('download-btn');
const photoPlaceholder = document.getElementById('photo-placeholder');
const photoError = document.getElementById('photo-error');
const receivedPhoto = document.getElementById('received-photo');
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const notification = document.getElementById('notification');
const bluetoothError = document.getElementById('bluetooth-error');
const receivingIndicator = document.getElementById('receiving-indicator');
const frameCounterEl = document.getElementById('frame-counter');

// 初始化应用
function initApp() {
    // 检查浏览器支持
    if (!navigator.bluetooth) {
        showNotification('您的浏览器不支持Web Bluetooth API');
        bluetoothError.textContent = '错误：您的浏览器不支持蓝牙功能。请使用Android上的Chrome浏览器。';
        isBluetoothAvailable = false;
        scanBtn.disabled = true;
        bluetoothStatusText.textContent = "不支持";
    } else {
        isBluetoothAvailable = true;
        bluetoothStatus.classList.add('connected');
        bluetoothStatusText.textContent = "蓝牙开启";
    }

    updateStatusUI();

    // 添加事件监听器
    scanBtn.addEventListener('click', scanDevices);
    receiveBtn.addEventListener('click', receivePhoto);
    disconnectBtn.addEventListener('click', disconnectDevice);
    clearBtn.addEventListener('click', clearPhoto);
    downloadBtn.addEventListener('click', downloadPhoto);

    showNotification('应用已准备就绪，请扫描设备');
}

// 更新界面状态
function updateStatusUI() {
    deviceStatus.classList.toggle('connected', isConnected);
    deviceStatusText.textContent = isConnected ? '已连接' : '未连接';

    if (isConnected && currentDevice) {
        deviceName.textContent = currentDevice.name || 'ESP32设备';
        deviceId.textContent = currentDevice.id;
        serviceStatus.textContent = service ? '已连接服务' : '服务未连接';
        photosReceivedEl.textContent = photosReceived + ' 张照片';

        disconnectBtn.disabled = false;
        receiveBtn.disabled = false;
    } else {
        deviceName.textContent = '未连接';
        deviceId.textContent = '00:00:00:00:00';
        serviceStatus.textContent = '未连接';
        photosReceivedEl.textContent = '0 张照片';

        disconnectBtn.disabled = true;
        receiveBtn.disabled = true;
    }
}

// 扫描设备 - 使用Web Bluetooth API
async function scanDevices() {
    if (!isBluetoothAvailable) {
        showNotification('蓝牙不可用');
        return;
    }

    showNotification('正在扫描附近的蓝牙设备...');

    try {
        // 请求蓝牙设备
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ name: 'OpenGlass' }],
            optionalServices: [SERVICE_UUID]
        });

        // 用户选择了设备
        currentDevice = device;

        // 显示设备信息
        deviceName.textContent = device.name || 'ESP32设备';
        deviceId.textContent = device.id;

        // 连接设备
        connectToDevice();

    } catch (error) {
        showNotification('扫描失败: ' + error.message);
        console.error('扫描错误:', error);
    }
}

// 连接设备 - 连接到ESP32的GATT服务器
async function connectToDevice() {
    if (!currentDevice) {
        showNotification('请先选择设备');
        return;
    }

    showNotification(`正在连接 ${currentDevice.name || '设备'}...`);
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';

    try {
        // 连接到GATT服务器
        server = await currentDevice.gatt.connect();
        progressBar.style.width = '30%';

        // 获取服务
        service = await server.getPrimaryService(SERVICE_UUID);
        progressBar.style.width = '60%';

        // 获取特征
        characteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);
        progressBar.style.width = '100%';

        // 监听特征值变化
        await characteristic.startNotifications();
        characteristic.addEventListener('characteristicvaluechanged', handlePhotoData);

        // 监听设备断开连接
        currentDevice.addEventListener('gattserverdisconnected', onDisconnected);

        // 更新状态
        isConnected = true;
        updateStatusUI();
        showNotification('设备连接成功!');

        // 2秒后隐藏进度条
        setTimeout(() => {
            progressContainer.style.display = 'none';
        }, 2000);

    } catch (error) {
        showNotification('连接失败: ' + error.message);
        console.error('连接错误:', error);
        progressContainer.style.display = 'none';
    }
}

// 处理照片数据
function handlePhotoData(event) {
    if (!isReceivingPhoto) return;

    const value = event.target.value;
    const data = new Uint8Array(value.buffer);

    // 提取帧序号 (前2字节)
    const frameIndex = (data[0] << 8) | data[1];

    // 检查是否为结束帧 (0xFFFF)
    if (frameIndex === 0xFFFF) {
        // 照片接收完成
        isReceivingPhoto = false;
        receivingIndicator.style.display = 'none';
        frameCounterEl.style.display = 'none';

        // 合并所有接收到的数据块
        let totalLength = 0;

        // 计算总字节数
        for (let i = 0; i <= maxFrameIndex; i++) {
            if (photoChunks[i]) {
                totalLength += photoChunks[i].length;
            }
        }

        // 创建Uint8Array保存完整照片数据
        const photoData = new Uint8Array(totalLength);
        let offset = 0;

        // 按帧序号顺序填充数据
        for (let i = 0; i <= maxFrameIndex; i++) {
            if (photoChunks[i]) {
                photoData.set(photoChunks[i], offset);
                offset += photoChunks[i].length;
            }
        }

        // 创建图片并显示
        const blob = new Blob([photoData], { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);
        receivedPhoto.src = url;

        // 先隐藏所有状态
        photoPlaceholder.style.display = 'none';
        photoError.style.display = 'none';
        receivedPhoto.style.display = 'none';

        // 图片加载成功
        receivedPhoto.onload = function () {
            // 更新状态
            photosReceived++;
            updateStatusUI();
            showNotification('照片接收成功!');
            receivedPhoto.style.display = 'block';
            downloadBtn.disabled = false; // 启用下载按钮
        };

        // 图片加载失败
        receivedPhoto.onerror = function () {
            photoError.style.display = 'block';
            downloadBtn.disabled = true; // 禁用下载按钮
            showNotification('照片传输失败，请重试');
            URL.revokeObjectURL(url);// 清理无效的URL
        };

        // 重置接收状态
        photoChunks = {};
        receivedBytes = 0;
        totalBytes = 0;
        maxFrameIndex = -1;
        frameCounter = 0;
        return;
    }

    // 处理数据帧 - 跳过前两个字节的帧序号
    const chunkData = data.slice(2);

    // 存储数据块，使用帧序号作为键
    photoChunks[frameIndex] = chunkData;

    // 更新最大帧序号
    if (frameIndex > maxFrameIndex) {
        maxFrameIndex = frameIndex;
    }

    // 更新接收字节数
    receivedBytes += chunkData.length;

    // 更新帧计数器
    frameCounter++;
    frameCounterEl.textContent = `帧: ${frameCounter}/${maxFrameIndex + 1}`;
    frameCounterEl.style.display = 'block';

    // 更新进度条 (如果知道总大小)
    if (totalBytes > 0) {
        const progress = Math.min(100, Math.floor((receivedBytes / totalBytes) * 100));
        progressBar.style.width = progress + '%';
    }
}

// 接收照片
async function receivePhoto() {
    if (!isConnected || !characteristic) {
        showNotification('请先连接设备');
        return;
    }

    // 重置接收状态
    isReceivingPhoto = true;
    photoChunks = {};
    receivedBytes = 0;
    totalBytes = 0; // 总字节数未知
    maxFrameIndex = -1;
    frameCounter = 0;

    // 显示接收状态
    photoPlaceholder.style.display = 'none';
    receivedPhoto.style.display = 'none';
    progressContainer.style.display = 'block';
    progressBar.style.width = '0%';
    receivingIndicator.style.display = 'block';
    frameCounterEl.textContent = '帧: 0/0';
    frameCounterEl.style.display = 'block';

    showNotification('开始接收照片...');

    // 设置接收超时
    setTimeout(() => {
        if (isReceivingPhoto) {
            showNotification('照片接收超时');
            isReceivingPhoto = false;
            receivingIndicator.style.display = 'none';
            frameCounterEl.style.display = 'none';
            progressContainer.style.display = 'none';
            photoChunks = {};

            // 显示错误提示
            photoPlaceholder.style.display = 'none';
            receivedPhoto.style.display = 'none';
            photoError.style.display = 'block';
            downloadBtn.disabled = true; // 禁用下载按钮
        }
    }, 30000); // 超时时间30秒
}

// 断开连接
async function disconnectDevice() {
    if (!isConnected || !server) {
        showNotification('未连接设备');
        return;
    }

    showNotification('正在断开连接...');

    try {
        if (server.connected) {
            await server.disconnect();
        }

        // 重置状态
        isConnected = false;
        currentDevice = null;
        downloadBtn.disabled = true; // 禁止下载图片
        server = null;
        service = null;
        characteristic = null;
        isReceivingPhoto = false;
        photoChunks = {};
        frameCounter = 0;
        maxFrameIndex = -1;

        // 更新UI
        updateStatusUI();
        photoPlaceholder.style.display = 'block';
        receivedPhoto.style.display = 'none';
        receivingIndicator.style.display = 'none';
        frameCounterEl.style.display = 'none';

        showNotification('已断开连接');

    } catch (error) {
        showNotification('断开连接失败: ' + error.message);
        console.error('断开错误:', error);
    }
}

// 清除照片
function clearPhoto() {
    //
    downloadBtn.disabled = true; // 禁止下载图片
    receivedPhoto.style.display = 'none';
    photoPlaceholder.style.display = 'block';
    photoError.style.display = 'none'; // 隐藏错误提示
    frameCounterEl.style.display = 'none';
    showNotification('已清除照片');
    //receivedPhoto.src = '';
}

// 设备断开时的回调
function onDisconnected(event) {
    showNotification('设备已断开');
    isConnected = false;
    isReceivingPhoto = false;
    photoChunks = {};
    frameCounter = 0;
    maxFrameIndex = -1;
    updateStatusUI();
    photoPlaceholder.style.display = 'block';
    receivedPhoto.style.display = 'none';
    receivingIndicator.style.display = 'none';
    frameCounterEl.style.display = 'none';
}

// 下载照片的函数
function downloadPhoto() {
    if (!receivedPhoto.src) {
        showNotification('没有可下载的照片');
        return;
    }

    const link = document.createElement('a');
    link.href = receivedPhoto.src;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.download = `esp32-photo-${timestamp}.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification('照片已下载');
}

// 显示通知
function showNotification(message) {
    const notificationContent = notification.querySelector('.notification-content');
    notificationContent.textContent = message;
    notification.classList.add('show');

    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}

// 初始化应用
window.addEventListener('load', initApp);
