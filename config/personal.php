<?php

return [
    'appid' => env('WECHAT_APP_ID', 'wxa71ced3f64d1a657'),
    'secret' => env('WECHAT_APP_SECRET'),
    'session_days' => 30,
    'cos_bucket' => env('PERSONAL_COS_BUCKET'),
    'cos_region' => env('PERSONAL_COS_REGION'),
    'cos_secret_id' => env('PERSONAL_COS_SECRET_ID'),
    'cos_secret_key' => env('PERSONAL_COS_SECRET_KEY'),
];
