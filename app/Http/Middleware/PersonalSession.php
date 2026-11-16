<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Support\Facades\DB;

class PersonalSession
{
    public function handle($request, Closure $next)
    {
        $token = $request->bearerToken();
        $session = $token && preg_match('/^[a-f0-9]{64}$/', $token)
            ? DB::table('t_personal_sessions')->where('token_hash', hash('sha256', $token))->where('expires_at', '>', now())->first()
            : null;
        if (!$session) {
            return response()->json(['code' => 401, 'errorMsg' => '请先微信登录后再操作'], 401);
        }
        $request->attributes->set('personal_owner', $session->owner_id);
        $request->attributes->set('personal_token', $session->token_hash);
        return $next($request);
    }
}
