# AI眼镜 - 项目说明

该项目基于OpenGlass与OpenCameraLLM进行优化构建

OpenCameraLLM：https://github.com/DFQX/openCameraLLM

OpenGlass：https://github.com/BasedHardware/OpenGlass

## 项目概述

AI眼镜是一个基于ESP32开发的智能眼镜系统，通过网页端与ESP32设备的蓝牙连接，实现照片的接收、显示与下载功能。该系统可用于实时采集并传输图像数据，为AI视觉应用提供硬件基础。

## 功能特点
- 蓝牙设备扫描与连接
- 实时接收ESP32传输的照片数据
- 照片显示与下载功能
- 传输状态监控与进度显示
- 错误处理与友好提示

## 网页端使用说明
1. 打开index.html文件启动网页应用
2. 点击"扫描设备"按钮搜索附近的ESP32设备
3. 选择对应的AI眼镜设备进行连接
4. 连接成功后，点击"接收照片"获取图像
5. 照片显示成功后可点击"下载照片"保存图片
6. 可通过"清除照片"按钮重置显示区域

## 技术栈
- 前端：HTML5, JavaScript, Tailwind CSS, Font Awesome
- 通信：Web Bluetooth API
- 硬件：ESP32（负责图像采集与传输）

## 注意事项
- 网页端需在支持Web Bluetooth API的浏览器中运行（如Chrome, Edge）
- 确保ESP32设备已正确配置并开启蓝牙
- 照片传输过程中请保持设备距离不要过远
- 若出现"传输失败请重试"提示，可重新点击"接收照片"按钮

## 故障排除
- 无法扫描到设备：检查ESP32是否开机并已启用蓝牙
- 连接失败：确保设备在有效范围内，尝试重新扫描
- 照片传输失败：检查设备电量，尝试靠近后重新传输



>  注：该README.md适用于version0.2.0

