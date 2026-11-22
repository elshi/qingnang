<?php

namespace App\Services;

use RuntimeException;

class TencentSpeech
{
    private const HOST = 'asr.tencentcloudapi.com';
    private const CONTENT_TYPE = 'application/json; charset=utf-8';

    public function recognize(string $audio, string $format = 'mp3'): string
    {
        $secretId = config('services.tencent_asr.secret_id');
        $secretKey = config('services.tencent_asr.secret_key');
        if (!$secretId || !$secretKey) {
            throw new RuntimeException('语音识别尚未配置，请联系管理员');
        }

        $payload = json_encode([
            'EngSerViceType' => '16k_zh',
            'SourceType' => 1,
            'VoiceFormat' => $format,
            'Data' => base64_encode($audio),
            'DataLen' => strlen($audio),
        ], JSON_UNESCAPED_SLASHES);
        $timestamp = time();
        $date = gmdate('Y-m-d', $timestamp);
        $scope = $date . '/asr/tc3_request';
        $canonical = "POST\n/\n\ncontent-type:" . self::CONTENT_TYPE . "\nhost:" . self::HOST
            . "\n\ncontent-type;host\n" . hash('sha256', $payload);
        $signing = "TC3-HMAC-SHA256\n" . $timestamp . "\n" . $scope . "\n" . hash('sha256', $canonical);
        $dateKey = hash_hmac('sha256', $date, 'TC3' . $secretKey, true);
        $serviceKey = hash_hmac('sha256', 'asr', $dateKey, true);
        $signingKey = hash_hmac('sha256', 'tc3_request', $serviceKey, true);
        $signature = hash_hmac('sha256', $signing, $signingKey);
        $authorization = 'TC3-HMAC-SHA256 Credential=' . $secretId . '/' . $scope
            . ', SignedHeaders=content-type;host, Signature=' . $signature;

        [$status, $body] = $this->send($payload, [
            'Content-Type: ' . self::CONTENT_TYPE,
            'Host: ' . self::HOST,
            'X-TC-Action: SentenceRecognition',
            'X-TC-Version: 2019-06-14',
            'X-TC-Timestamp: ' . $timestamp,
            'Authorization: ' . $authorization,
        ]);
        $response = json_decode($body, true);
        if ($status !== 200 || !is_array($response) || isset($response['Response']['Error'])) {
            // Tencent's error payload may contain account details; never return it to a client.
            throw new RuntimeException('语音识别服务暂不可用，请稍后重试');
        }
        if (!isset($response['Response']['Result']) || !is_string($response['Response']['Result'])) {
            throw new RuntimeException('语音识别未返回文字，请重试');
        }
        return trim($response['Response']['Result']);
    }

    protected function send(string $payload, array $headers): array
    {
        $curl = curl_init('https://' . self::HOST . '/');
        if (!$curl) throw new RuntimeException('语音识别服务暂不可用，请稍后重试');
        curl_setopt_array($curl, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 20,
        ]);
        $body = curl_exec($curl);
        $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);
        return [$status, is_string($body) ? $body : ''];
    }
}
