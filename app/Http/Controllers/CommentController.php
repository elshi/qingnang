<?php

namespace App\Http\Controllers;

use App\Acupoint;
use App\Book;
use App\CaseRecord;
use App\Meridian;
use App\Prescription;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class CommentController extends Controller
{
    private function target(Request $request): array
    {
        $input = $request->validate([
            'type' => 'required|in:book,chapter,case,prescription,meridian,acupoint',
            'id' => 'required|integer|min:0|max:2147483647',
            'chapterId' => 'nullable|required_if:type,chapter|integer|min:0|max:2147483647',
        ]);
        if ($input['type'] !== 'chapter' && isset($input['chapterId'])) {
            throw ValidationException::withMessages(['chapterId' => '当前内容不支持章节编号']);
        }
        $input['id'] = (int) $input['id'];
        $input['key'] = $input['type'] . ':' . $input['id'];
        if ($input['type'] === 'chapter') {
            $input['chapterId'] = (int) $input['chapterId'];
            $input['key'] .= ':' . $input['chapterId'];
        }
        return $input;
    }

    private function success($data)
    {
        return response()->json(['code' => 0, 'data' => $data]);
    }

    private function record($row, ?string $owner): array
    {
        return [
            'id' => (string) $row->id,
            'author' => '书友' . strtoupper(substr(hash_hmac('sha256', $row->owner_id, config('app.key')), 0, 6)),
            'mine' => $owner !== null && $row->owner_id === $owner,
            'content' => $row->content,
            'createdAt' => \Carbon\Carbon::parse($row->created_at)->getTimestamp() * 1000,
        ];
    }

    public function index(Request $request)
    {
        $target = $this->target($request);
        $input = $request->validate(['cursor' => 'nullable|integer|min:1']);
        $query = DB::table('t_content_comments')->where('target_key', $target['key'])->where('deleted', false);
        $total = (clone $query)->count();
        if (!empty($input['cursor'])) $query->where('id', '<', $input['cursor']);
        $rows = $query->orderByDesc('id')->limit(21)->get();
        $page = $rows->take(20);
        $owner = $request->attributes->get('personal_owner');
        return $this->success([
            'items' => $page->map(function ($row) use ($owner) { return $this->record($row, $owner); })->values(),
            'total' => $total,
            'cursor' => $rows->count() > 20 ? (string) $page->last()->id : '',
        ]);
    }

    public function store(Request $request)
    {
        $target = $this->target($request);
        if (is_string($request->input('content'))) {
            $request->merge(['content' => preg_replace('/^\s+|\s+$/u', '', $request->input('content'))]);
        }
        $input = $request->validate([
            'content' => 'required|string|max:1000',
            'submissionId' => 'required|string|max:80|regex:/^[a-zA-Z0-9_-]+$/',
        ], [
            'content.required' => '请先填写点评内容',
            'content.max' => '点评最多1000字',
        ]);

        // Reuse the reader's chapter resolver, including legacy chapter field mappings.
        if ($target['type'] === 'chapter') {
            $response = app(BookController::class)->chapter($target['id'], $target['chapterId']);
            if ($response->getStatusCode() !== 200) return $response;
        } else {
            $models = ['book' => Book::class, 'case' => CaseRecord::class, 'prescription' => Prescription::class,
                'meridian' => Meridian::class, 'acupoint' => Acupoint::class];
            if (!$models[$target['type']]::query()->whereKey($target['id'])->exists()) {
                return response()->json(['code' => 404, 'errorMsg' => '当前内容不存在或已下架'], 404);
            }
        }

        $owner = $request->attributes->get('personal_owner');
        DB::table('t_content_comments')->insertOrIgnore([
            'target_key' => $target['key'], 'owner_id' => $owner, 'submission_id' => $input['submissionId'],
            'content' => $input['content'], 'deleted' => false, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $row = DB::table('t_content_comments')->where('owner_id', $owner)->where('submission_id', $input['submissionId'])->first();
        if ($row->deleted) return response()->json(['code' => 410, 'errorMsg' => '这条点评已删除'], 410);
        if ($row->target_key !== $target['key'] || $row->content !== $input['content']) {
            return response()->json(['code' => 409, 'errorMsg' => '提交内容已变更，请重新发表'], 409);
        }
        return $this->success($this->record($row, $owner));
    }

    public function destroy(Request $request, $id)
    {
        $row = DB::table('t_content_comments')->where('id', $id)
            ->where('owner_id', $request->attributes->get('personal_owner'))->first();
        if (!$row) return response()->json(['code' => 404, 'errorMsg' => '点评不存在或不可删除'], 404);
        // Keep the submission ID so a delayed retry cannot recreate a deleted comment.
        DB::table('t_content_comments')->where('id', $row->id)->update(['deleted' => true, 'content' => '', 'updated_at' => now()]);
        return $this->success(['id' => (string) $row->id]);
    }
}
