<?php

namespace App\Services;

use RuntimeException;

class PersonalImages
{
    private function host(): string
    {
        foreach (['cos_bucket', 'cos_region', 'cos_secret_id', 'cos_secret_key'] as $name) {
            if (!config('personal.' . $name)) throw new RuntimeException('截图上传尚未配置，可先提交文字反馈');
        }
        return config('personal.cos_bucket') . '.cos.' . config('personal.cos_region') . '.myqcloud.com';
    }

    public function ticket(string $owner, string $extension): array
    {
        $host = $this->host();
        $key = 'personal/' . $owner . '/feedback/' . bin2hex(random_bytes(16)) . '.' . $extension;
        $time = (time() - 30) . ';' . (time() + 300);
        $mime = 'image/' . (in_array($extension, ['jpg', 'jpeg']) ? 'jpeg' : $extension);
        $form = ['key' => $key, 'acl' => 'private', 'Content-Type' => $mime,
            'success_action_status' => '204', 'q-sign-algorithm' => 'sha1', 'q-ak' => config('personal.cos_secret_id')];
        $conditions = [['bucket' => config('personal.cos_bucket')], ['content-length-range', 1, 5 * 1024 * 1024], ['q-sign-time' => $time]];
        foreach ($form as $name => $value) $conditions[] = [$name => $value];
        $policy = json_encode(['expiration' => gmdate('Y-m-d\TH:i:s\Z', time() + 300), 'conditions' => $conditions], JSON_UNESCAPED_SLASHES);
        $signKey = hash_hmac('sha1', $time, config('personal.cos_secret_key'));
        $form += ['q-key-time' => $time, 'policy' => base64_encode($policy), 'q-signature' => hash_hmac('sha1', sha1($policy), $signKey)];
        return ['fileID' => $key, 'url' => 'https://' . $host, 'formData' => $form];
    }

    public function exists(string $key): bool
    {
        $host = $this->host();
        $time = (time() - 30) . ';' . (time() + 120);
        $path = '/' . implode('/', array_map('rawurlencode', explode('/', $key)));
        $http = "head\n" . $path . "\n\nhost=" . rawurlencode($host) . "\n";
        $signKey = hash_hmac('sha1', $time, config('personal.cos_secret_key'));
        $signature = hash_hmac('sha1', "sha1\n" . $time . "\n" . sha1($http) . "\n", $signKey);
        $authorization = 'q-sign-algorithm=sha1&q-ak=' . config('personal.cos_secret_id') . '&q-sign-time=' . $time
            . '&q-key-time=' . $time . '&q-header-list=host&q-url-param-list=&q-signature=' . $signature;
        $curl = curl_init('https://' . $host . $path);
        curl_setopt_array($curl, [CURLOPT_NOBODY => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 8,
            CURLOPT_HTTPHEADER => ['Authorization: ' . $authorization]]);
        curl_exec($curl);
        $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
        $size = curl_getinfo($curl, CURLINFO_CONTENT_LENGTH_DOWNLOAD);
        $type = curl_getinfo($curl, CURLINFO_CONTENT_TYPE);
        curl_close($curl);
        return $status === 200 && $size > 0 && $size <= 5 * 1024 * 1024 && in_array($type, ['image/jpeg', 'image/png', 'image/webp'], true);
    }
}
