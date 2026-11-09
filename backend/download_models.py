"""Download upstream OpenCV Zoo models. Review licenses before commercial use."""
import hashlib
import sys
import urllib.request
from pathlib import Path

HASHES = {
    'face_detection_yunet_2023mar.onnx': '8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4',
    'face_recognition_sface_2021dec.onnx': '0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79',
    'MobileNetSSD_deploy.prototxt': '2d180f723b3109e21f8287f6b3c691390d07b60eed998327cd3259ffa0e50608',
    'MobileNetSSD_deploy.caffemodel': '52eed8be80522c152a17fb56740de705b79881bde1a167e0e747310523685fc7',
}


def checked_write(path, data):
    if hashlib.sha256(data).hexdigest() != HASHES[path.name]:
        raise ValueError('Model checksum mismatch: ' + path.name)
    path.write_bytes(data)

def main():
    directory = Path(__file__).resolve().parent.parent / 'models'
    directory.mkdir(exist_ok=True)
    models = [('face_detection_yunet', 'face_detection_yunet_2023mar.onnx'),
              ('face_recognition_sface', 'face_recognition_sface_2021dec.onnx')]
    for folder, name in models:
        url = f'https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/{folder}/{name}'
        data = urllib.request.urlopen(url, timeout=120).read()
        if len(data) < 100_000:
            raise ValueError('Invalid model payload')
        checked_write(directory / name, data)
        print(name, len(data), 'sha256=' + hashlib.sha256(data).hexdigest())
    if '--objects' in sys.argv:
        for filename in ('MobileNetSSD_deploy.prototxt', 'MobileNetSSD_deploy.caffemodel'):
            upstream = {'MobileNetSSD_deploy.prototxt': 'deploy.prototxt', 'MobileNetSSD_deploy.caffemodel': 'mobilenet_iter_73000.caffemodel'}[filename]
            data = urllib.request.urlopen('https://raw.githubusercontent.com/chuanqi305/MobileNet-SSD/master/' + upstream, timeout=120).read()
            checked_write(directory / filename, data)
            print(filename, len(data), 'sha256=' + hashlib.sha256(data).hexdigest())

if __name__ == '__main__':
    main()
