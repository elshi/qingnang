<?php

namespace App\Http\Controllers;

use App\Meridian;
use App\Support\MeridianAtlas;
use App\Support\PlainText;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Throwable;

class MeridianController extends Controller
{
    private const FIELDS = [
        'meridian_id', 'name', 'english_name', 'indications', 'measured',
        'acupoints', 'section', 'classification', 'abbreviation', 'item_order',
    ];

    private const SEARCH_FIELDS = [
        'name', 'english_name', 'indications', 'measured', 'acupoints',
        'section', 'classification', 'abbreviation',
    ];

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
            $query = Meridian::query();
            foreach ($this->keywords($request->input('keyword')) as $keyword) {
                $query->where(function ($search) use ($keyword) {
                    foreach (self::SEARCH_FIELDS as $index => $field) {
                        $method = $index === 0 ? 'where' : 'orWhere';
                        $search->{$method}($field, 'like', '%' . $keyword . '%');
                    }
                });
            }
            $total = (clone $query)->count();
            $items = $query->orderBy('item_order')->orderBy('meridian_id')
                ->forPage($page, $pageSize)->get(self::FIELDS)
                ->map(function (Meridian $record) { return $this->listItem($record); })->values();

            return $this->success([
                'items' => $items, 'total' => $total, 'page' => $page,
                'page_size' => $pageSize, 'has_more' => $page * $pageSize < $total,
            ]);
        } catch (Throwable $error) {
            return $this->databaseError($error);
        }
    }

    public function show($id)
    {
        if (!$this->validId($id)) return $this->error('经络 ID 无效', 422);

        try {
            $record = Meridian::query()->select(self::FIELDS)->find((int) $id);
            if (!$record) return $this->error('未找到该经络', 404);
            return $this->success(array_merge($this->listItem($record), MeridianAtlas::detail((int)$record->meridian_id), [
                'indications' => PlainText::clean($record->indications),
                'measured' => PlainText::clean($record->measured),
                'acupoints' => PlainText::clean($record->acupoints),
            ]));
        } catch (Throwable $error) {
            return $this->databaseError($error);
        }
    }

    public function atlas()
    {
        try {
            return $this->success(MeridianAtlas::overview());
        } catch (Throwable $error) {
            report($error);
            return $this->error('经络图谱暂时无法加载，请稍后重试', 503);
        }
    }

    private function listItem(Meridian $record): array
    {
        $summary = '';
        foreach ([$record->indications, $record->measured, $record->acupoints] as $source) {
            $summary = PlainText::preview($source);
            if ($summary !== '') break;
        }
        return [
            'id' => (int) $record->meridian_id,
            'title' => PlainText::clean($record->name) ?: '未命名经络',
            'english_name' => PlainText::clean($record->english_name),
            'classification' => PlainText::clean($record->classification),
            'section' => PlainText::clean($record->section),
            'abbreviation' => PlainText::clean($record->abbreviation),
            'summary' => $summary,
        ];
    }

    private function keywords($value): array
    {
        return array_values(array_filter(preg_split('/\s+/u', trim((string) $value)) ?: []));
    }

    private function validId($id): bool
    {
        return ctype_digit((string) $id) && strlen((string) $id) <= 10 && (float) $id <= 4294967295;
    }

    private function databaseError(Throwable $error)
    {
        report($error);
        $driverCode = $error instanceof QueryException ? (int) ($error->errorInfo[1] ?? 0) : 0;
        $messages = [
            1044 => '数据库账号无法访问经络数据库，请检查数据库配置与账号权限',
            1045 => '数据库账号无法访问经络数据库，请检查数据库配置与账号权限',
            1142 => '数据库账号无权读取经络表，请为 t_meridians 授予 SELECT 权限',
            1146 => '未找到经络数据表，请检查 MERIDIANS_TABLE 配置',
            1054 => '经络数据表字段不匹配，请检查 t_meridians 表结构',
        ];
        return $this->error($messages[$driverCode] ?? '经络加载失败，请稍后重试', 500);
    }

    private function success($data) { return response()->json(['code' => 0, 'data' => $data]); }
    private function error(string $message, int $status) { return response()->json(['code' => -1, 'errorMsg' => $message], $status); }
}
