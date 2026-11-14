<?php

namespace App\Http\Controllers;

use App\Prescription;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Throwable;

class PrescriptionController extends Controller
{
    private const SEARCH_FIELDS = ['name', 'cited', 'indications', 'modern_dose', 'explanation', 'tags', 'abbreviation'];

    public function index(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'page' => 'nullable|integer|min:1',
            'page_size' => 'nullable|integer|min:1|max:50',
            'keyword' => 'nullable|string|max:100',
        ]);
        if ($validator->fails()) return $this->error($validator->errors()->first(), 422);

        try {
            $page = (int) ($request->input('page') ?: 1);
            $pageSize = (int) ($request->input('page_size') ?: 20);
            $query = Prescription::query();
            $keywords = preg_split('/\s+/u', trim((string) $request->input('keyword', '')), -1, PREG_SPLIT_NO_EMPTY);
            foreach ($keywords as $keyword) {
                $query->where(function ($search) use ($keyword) {
                    foreach (self::SEARCH_FIELDS as $index => $field) {
                        $method = $index === 0 ? 'where' : 'orWhere';
                        $search->{$method}($field, 'like', '%' . $keyword . '%');
                    }
                });
            }
            $total = (clone $query)->count();
            $items = $query->orderBy('id')->forPage($page, $pageSize)
                ->get(['id', 'name', 'cited', 'tags', 'indications'])
                ->map(function (Prescription $record) { return $this->listItem($record); })->values();
            return response()->json(['code' => 0, 'data' => [
                'items' => $items, 'total' => $total, 'page' => $page,
                'page_size' => $pageSize, 'has_more' => $page * $pageSize < $total,
            ]]);
        } catch (Throwable $error) {
            return $this->databaseError($error);
        }
    }

    public function show($id)
    {
        if (!ctype_digit((string) $id) || strlen((string) $id) > 10 || (float) $id > 4294967295) {
            return $this->error('处方 ID 无效', 422);
        }
        try {
            $record = Prescription::query()->find((int) $id);
            if (!$record) return $this->error('未找到该处方', 404);
            return response()->json(['code' => 0, 'data' => array_merge($this->listItem($record), [
                'modern_dose' => $record->modern_dose,
                'decoction' => $record->decoction,
                'indications' => $record->indications,
                'explanation' => $record->explanation,
            ])]);
        } catch (Throwable $error) {
            return $this->databaseError($error);
        }
    }

    private function listItem(Prescription $record): array
    {
        $tags = preg_split('/[\/，,、；;\r\n]+/u', (string) $record->tags);
        $tags = array_values(array_unique(array_filter(array_map('trim', $tags ?: []), function ($tag) {
            return $tag !== '';
        })));
        $summary = trim((string) $record->indications);
        return [
            'id' => $record->id,
            'title' => trim((string) $record->name) ?: '未命名处方',
            'source' => trim((string) $record->cited),
            'tags' => $tags,
            'summary' => mb_strlen($summary) > 120 ? mb_substr($summary, 0, 120) . '…' : $summary,
        ];
    }

    private function databaseError(Throwable $error)
    {
        report($error);
        $driverCode = $error instanceof QueryException ? (int) ($error->errorInfo[1] ?? 0) : 0;
        $messages = [
            1044 => '数据库账号无法访问处方数据库，请检查数据库配置与账号权限',
            1045 => '数据库账号无法访问处方数据库，请检查数据库配置与账号权限',
            1142 => '数据库账号无权读取处方表，请为 t_prescriptions 授予 SELECT 权限',
            1146 => '未找到处方数据表，请检查 PRESCRIPTIONS_TABLE 配置',
            1054 => '处方数据表字段不匹配，请检查 t_prescriptions 表结构',
        ];
        return $this->error($messages[$driverCode] ?? '处方加载失败，请稍后重试', 500);
    }

    private function error(string $message, int $status)
    {
        return response()->json(['code' => -1, 'errorMsg' => $message], $status);
    }
}
