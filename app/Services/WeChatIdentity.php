<?php

namespace App\Services;

use RuntimeException;

class WeChatIdentity
{
    public function exchange(string $code): array
    {
        if (!config('personal.secret')) {
            throw new RuntimeException('微信登录尚未配置，请联系管理员');
        }
        $query = http_build_query([
            'appid' => config('personal.appid'),
            'secret' => config('personal.secret'),
            'js_code' => $code,
            'grant_type' => 'authorization_code',
        ]);
        $curl = curl_init('https://api.weixin.qq.com/sns/jscode2session?' . $query);
        curl_setopt_array($curl, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 12, CURLOPT_CONNECTTIMEOUT => 5]);
        $body = curl_exec($curl);
        $status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
        curl_close($curl);
        $data = json_decode($body ?: '', true);
        if ($status !== 200 || !is_array($data) || empty($data['openid']) || !empty($data['errcode'])) {
            // Never log the URL, code, AppSecret, or session_key.
            throw new RuntimeException('微信身份验证失败，请重新登录');
        }
        return ['appid' => config('personal.appid'), 'openid' => $data['openid']];
    }
}
