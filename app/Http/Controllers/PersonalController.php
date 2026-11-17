<?php

namespace App\Http\Controllers;

use App\Services\WeChatIdentity;
use App\Services\PersonalImages;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use RuntimeException;

/**
 * 个人登录
 */
class PersonalController extends Controller
{
    private function success($data = [])
    {
        return response()->json(['code' => 0, 'data' => $data]);
    }

    private function owner(Request $request): string
    {
        return $request->attributes->get('personal_owner');
    }

    public function login(Request $request, WeChatIdentity $wechat)
    {
        $input = $request->validate(['code' => 'required|string|max:256']);
        try {
            $identity = $wechat->exchange($input['code']);
        } catch (RuntimeException $error) {
            return response()->json(['code' => 503, 'errorMsg' => $error->getMessage()], 503);
        }
        $owner = substr(hash('sha256', $identity['appid'] . ':' . $identity['openid']), 0, 32);
        $token = bin2hex(random_bytes(32));
        $expires = now()->addDays(config('personal.session_days'));
        DB::transaction(function () use ($owner, $identity, $token, $expires) {
            DB::table('t_personal_users')->insertOrIgnore([
                'id' => $owner, 'appid' => $identity['appid'], 'openid' => $identity['openid'],
                'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('t_personal_users')->where('id', $owner)->update(['updated_at' => now()]);
            DB::table('t_personal_sessions')->where('owner_id', $owner)->where('expires_at', '<=', now())->delete();
            DB::table('t_personal_sessions')->insert([
                'token_hash' => hash('sha256', $token), 'owner_id' => $owner,
                'expires_at' => $expires, 'created_at' => now(),
            ]);
        });
        return $this->success(['id' => $owner, 'token' => $token, 'expiresAt' => $expires->getTimestamp() * 1000]);
    }

    public function me(Request $request)
    {
        return $this->success(['id' => $this->owner($request)]);
    }

    public function logout(Request $request)
    {
        DB::table('t_personal_sessions')->where('token_hash', $request->attributes->get('personal_token'))->delete();
        return $this->success();
    }

    public function index(Request $request)
    {
        $input = $request->validate(['cursor' => 'nullable|integer|min:0']);
        $rows = DB::table('t_personal_records')->where('owner_id', $this->owner($request))
            ->where('id', '>', $input['cursor'] ?? 0)->orderBy('id')->limit(101)->get();
        $page = $rows->take(100);
        return $this->success([
            'records' => $page->map(function ($row) { return $this->record($row); })->values(),
            'cursor' => $rows->count() > 100 ? (string) $page->last()->id : '',
        ]);
    }

    private function record($row): array
    {
        return array_merge(json_decode($row->payload, true), [
            'key' => $row->record_key, 'kind' => $row->kind, 'version' => (int) $row->revision,
            'deleted' => (bool) $row->deleted, 'mutationId' => $row->mutation_id,
        ]);
    }

    private function validateRecord(array $record): array
    {
        $data = Validator::make($record, [
            'key' => 'required|string|max:512', 'kind' => 'required|in:favorite,note,history,draft',
            'deleted' => 'sometimes|boolean', 'title' => 'nullable|string|max:200',
            'content' => 'nullable|string|max:20000', 'ref' => 'nullable|array',
            'ref.type' => 'required_with:ref|in:book,chapter,case,prescription,meridian,acupoint',
            'ref.id' => 'required_with:ref|string|max:100', 'ref.chapterId' => 'nullable|string|max:100',
            'ref.title' => 'required_with:ref|string|max:200', 'ref.source' => 'nullable|string|max:300',
            'scrollTop' => 'nullable|numeric|min:0|max:10000000', 'contentMode' => 'nullable|in:original,shiyi',
            'progressLabel' => 'nullable|string|max:200',
            'createdAt' => 'nullable|numeric|min:0', 'version' => 'nullable|integer|min:0',
            'noteVersion' => 'nullable|integer|min:0',
            'noteKey' => 'nullable|string|max:512',
        ])->validate();
        if (strpos($data['key'], $data['kind'] . ':') !== 0 || strlen($data['key']) <= strlen($data['kind']) + 1) {
            throw ValidationException::withMessages(['key' => '记录标识无效']);
        }
        if (empty($data['deleted'])) {
            if (in_array($data['kind'], ['favorite', 'history'], true)) {
                $ref = $data['ref'] ?? null;
                $expected = $ref ? $data['kind'] . ':' . $ref['type'] . ':' . $ref['id']
                    . (isset($ref['chapterId']) ? ':' . $ref['chapterId'] : '') : '';
                if ($expected !== $data['key']) throw ValidationException::withMessages(['ref' => '关联内容无效']);
            }
            if ($data['kind'] === 'note' && (empty(trim($data['title'] ?? '')) || empty(trim($data['content'] ?? ''))
                || mb_strlen($data['title']) > 80)) {
                throw ValidationException::withMessages(['content' => '请填写标题（80字以内）和笔记正文']);
            }
        }
        // Do not persist client-supplied owner, revision, audio, or arbitrary reference properties.
        if (!empty($data['ref'])) $data['ref'] = array_intersect_key($data['ref'], array_flip(['type', 'id', 'chapterId', 'title', 'source']));
        unset($data['version']);
        return $data;
    }

    public function save(Request $request)
    {
        $input = $request->validate([
            'record' => 'required|array', 'expectedVersion' => 'required|integer|min:0',
            'mutationId' => 'required|string|max:80|regex:/^[a-zA-Z0-9_-]+$/',
            'draftKey' => 'nullable|string|max:512|regex:/^draft:.+$/',
        ]);
        $record = $this->validateRecord($input['record']);
        return DB::transaction(function () use ($request, $input, $record) {
            $owner = $this->owner($request);
            DB::table('t_personal_users')->where('id', $owner)->lockForUpdate()->first();
            $query = DB::table('t_personal_records')->where('owner_id', $owner)->where('record_hash', hash('sha256', $record['key']));
            $old = $query->first();
            if ($old && $old->mutation_id === $input['mutationId']) return $this->success($this->record($old));
            if ((int) $input['expectedVersion'] !== ($old ? (int) $old->revision : 0)) {
                return response()->json(['code' => 409, 'errorMsg' => '内容已在其他设备更新，当前输入已保留，请刷新后再保存',
                    'data' => ['current' => $old ? $this->record($old) : null]], 409);
            }
            $saved = $this->writeRecord($owner, $record, $old, $input['mutationId']);
            if ($record['kind'] === 'note') {
                $draftKey = $input['draftKey'] ?? ('draft:' . $record['key']);
                $draft = DB::table('t_personal_records')->where('owner_id', $owner)->where('record_hash', hash('sha256', $draftKey))->first();
                $saved['clearedDraft'] = $this->writeRecord($owner, ['key' => $draftKey, 'kind' => 'draft', 'deleted' => true], $draft, $input['mutationId']);
            }
            if ($record['kind'] === 'history' && empty($record['deleted'])) {
                $extras = DB::table('t_personal_records')->where('owner_id', $owner)->where('kind', 'history')
                    ->where('deleted', false)->orderBy('updated_at', 'desc')->orderBy('id', 'desc')->skip(200)->take(10000)->get();
                foreach ($extras as $extra) $this->writeRecord($owner, ['key' => $extra->record_key, 'kind' => 'history', 'deleted' => true], $extra, bin2hex(random_bytes(16)));
            }
            return $this->success($saved);
        });
    }

    private function writeRecord(string $owner, array $record, $old, string $mutation): array
    {
        $record['updatedAt'] = (int) floor(microtime(true) * 1000);
        $values = [
            'owner_id' => $owner, 'record_hash' => hash('sha256', $record['key']), 'record_key' => $record['key'],
            'kind' => $record['kind'], 'payload' => json_encode($record, JSON_UNESCAPED_UNICODE),
            'revision' => $old ? $old->revision + 1 : 1, 'mutation_id' => $mutation,
            'deleted' => !empty($record['deleted']), 'updated_at' => now(),
        ];
        if ($old) DB::table('t_personal_records')->where('id', $old->id)->update($values);
        else DB::table('t_personal_records')->insert($values + ['created_at' => now()]);
        return $record + ['version' => $values['revision'], 'mutationId' => $mutation, 'deleted' => $values['deleted']];
    }

    public function clearHistory(Request $request)
    {
        return DB::transaction(function () use ($request) {
            $owner = $this->owner($request);
            DB::table('t_personal_users')->where('id', $owner)->lockForUpdate()->first();
            $rows = DB::table('t_personal_records')->where('owner_id', $owner)->where('kind', 'history')->where('deleted', false)->get();
            $records = [];
            foreach ($rows as $row) $records[] = $this->writeRecord($owner,
                ['key' => $row->record_key, 'kind' => 'history', 'deleted' => true], $row, bin2hex(random_bytes(16)));
            return $this->success(['records' => $records]);
        });
    }

    public function import(Request $request)
    {
        $input = $request->validate(['records' => 'required|array|min:1|max:20', 'records.*' => 'required|array']);
        $records = array_map(function ($record) { return $this->validateRecord($record); }, $input['records']);
        return DB::transaction(function () use ($request, $records) {
            $owner = $this->owner($request);
            DB::table('t_personal_users')->where('id', $owner)->lockForUpdate()->first();
            $saved = [];
            foreach ($records as $record) {
                $old = DB::table('t_personal_records')->where('owner_id', $owner)->where('record_hash', hash('sha256', $record['key']))->first();
                // Import never overwrites a remote edit or resurrects a tombstone.
                $saved[] = $old ? $this->record($old) : $this->writeRecord($owner, $record, null, 'import-' . bin2hex(random_bytes(16)));
            }
            return $this->success(['records' => $saved]);
        });
    }

    public function upload(Request $request, PersonalImages $images)
    {
        $input = $request->validate(['extension' => 'required|in:jpg,jpeg,png,webp']);
        try {
            return $this->success($images->ticket($this->owner($request), $input['extension']));
        } catch (RuntimeException $error) {
            return response()->json(['code' => 503, 'errorMsg' => $error->getMessage()], 503);
        }
    }

    public function feedback(Request $request, PersonalImages $images)
    {
        $data = $request->validate([
            'id' => 'required|string|max:80|regex:/^[a-zA-Z0-9_-]+$/',
            'type' => 'required|in:内容纠错,功能异常,产品建议,其他', 'content' => 'required|string|min:5|max:5000',
            'contact' => 'nullable|string|max:120', 'images' => 'present|array|max:3', 'images.*' => 'required|string|max:250',
        ]);
        if (!empty($data['contact']) && !filter_var($data['contact'], FILTER_VALIDATE_EMAIL)
            && !preg_match('/^\+?[\d ()-]{6,20}$/', $data['contact'])) {
            throw ValidationException::withMessages(['contact' => '请填写有效的手机号或邮箱']);
        }
        $owner = $this->owner($request);
        $existing = DB::table('t_personal_feedback')->where('owner_id', $owner)->where('submission_id', $data['id'])->first();
        if ($existing) return $this->success(['id' => $data['id']]);
        foreach ($data['images'] as $key) {
            if (!preg_match('#^personal/' . $owner . '/feedback/[a-f0-9]{32}\.(jpg|jpeg|png|webp)$#', $key)
                || !$images->exists($key)) {
                throw ValidationException::withMessages(['images' => '截图尚未上传成功，请重新选择后提交']);
            }
        }
        DB::table('t_personal_feedback')->insertOrIgnore([
            'owner_id' => $owner, 'submission_id' => $data['id'], 'type' => $data['type'], 'content' => $data['content'],
            'contact' => $data['contact'] ?? null, 'images' => json_encode($data['images']), 'created_at' => now(), 'updated_at' => now(),
        ]);
        return $this->success(['id' => $data['id']]);
    }
}
