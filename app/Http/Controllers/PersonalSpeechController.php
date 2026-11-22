<?php

namespace App\Http\Controllers;

use App\Services\TencentSpeech;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use RuntimeException;

class PersonalSpeechController extends Controller
{
    public function recognize(Request $request, TencentSpeech $speech)
    {
        $input = Validator::make($request->all(), [
            'audio' => 'required|string|max:3145728',
            'format' => 'required|in:mp3',
            'duration' => 'required|integer|between:1,60000',
        ])->validate();
        $audio = base64_decode($input['audio'], true);
        if ($audio === false || $audio === '' || base64_encode($audio) !== $input['audio']) {
            return response()->json(['code' => 422, 'errorMsg' => '语音数据无效，请重新录入'], 422);
        }
        try {
            $text = $speech->recognize($audio, $input['format']);
        } catch (RuntimeException $error) {
            return response()->json(['code' => 503, 'errorMsg' => $error->getMessage()], 503);
        }
        return response()->json(['code' => 0, 'data' => ['text' => $text]]);
    }
}
