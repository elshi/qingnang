<?php

namespace App\Http\Controllers;

use App\Acupoint;
use App\Support\PlainText;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Throwable;

class AcupointController extends Controller
{
    private const FIELDS = [
        'acupoint_id', 'name', 'pinyin', 'alias', 'adscription', 'indications',
        'locate', 'acupoints', 'acupuncture', 'precautions', 'points', 'notes',
        'meridian', 'pulse', 'fivepoint', 'specificpoint', 'position', 'five',
        'abbreviation', 'item_order',
    ];

    private const SEARCH_FIELDS = [
        'name', 'pinyin', 'alias', 'adscription', 'indications', 'locate',
        'acupoints', 'acupuncture', 'precautions', 'points', 'notes', 'meridian',
        'pulse', 'fivepoint', 'specificpoint', 'position', 'five', 'abbreviation',
    ];

    public function index(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'page' => 'nullable|integer|min:1',
            'page_size' => 'nullable|integer|min:1|max:100',
            'keyword' => 'nullable|string|max:100',
            'channel' => 'nullable|string|max:30',
        ]);
        if ($validator->fails()) return $this->error($validator->errors()->first(), 422);

        try {
            $page = (int) ($request->input('page') ?: 1);
            $pageSize = (int) ($request->input('page_size') ?: 20);
            $query = Acupoint::query();
            if ($request->filled('channel')) {
                $channel = trim((string) $request->input('channel'));
                $query->where(function ($scope) use ($channel) {
                    $scope->where('meridian', $channel)->orWhere('pulse', $channel);
                });
            }
            foreach ($this->keywords($request->input('keyword')) as $keyword) {
                $query->where(function ($search) use ($keyword) {
                    foreach (self::SEARCH_FIELDS as $index => $field) {
                        $method = $index === 0 ? 'where' : 'orWhere';
                        $search->{$method}($field, 'like', '%' . $keyword . '%');
                    }
                });
            }
            $total = (clone $query)->count();
            $items = $query->orderBy('item_order')->orderBy('acupoint_id')
                ->forPage($page, $pageSize)->get(self::FIELDS)
                ->map(function (Acupoint $record) { return $this->listItem($record); })->values();

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
        if (!$this->validId($id)) return $this->error('穴位 ID 无效', 422);

        try {
            $record = Acupoint::query()->select(self::FIELDS)->find((int) $id);
            if (!$record) return $this->error('未找到该穴位', 404);
            return $this->success(array_merge($this->listItem($record), [
                'alias' => PlainText::clean($record->alias),
                'adscription' => PlainText::clean($record->adscription),
                'indications' => PlainText::clean($record->indications),
                'locate' => PlainText::clean($record->locate),
                'acupoints' => PlainText::clean($record->acupoints),
                'acupuncture' => PlainText::clean($record->acupuncture),
                'precautions' => PlainText::clean($record->precautions),
                'points' => PlainText::clean($record->points),
                'notes' => PlainText::clean($record->notes),
                'meridian' => PlainText::clean($record->meridian),
                'pulse' => PlainText::clean($record->pulse),
                'fivepoint' => PlainText::clean($record->fivepoint),
                'specificpoint' => PlainText::clean($record->specificpoint),
                'position' => PlainText::clean($record->position),
                'five' => PlainText::clean($record->five),
                'abbreviation' => PlainText::clean($record->abbreviation),
            ]));
        } catch (Throwable $error) {
            return $this->databaseError($error);
        }
    }

    private function listItem(Acupoint $record): array
    {
        $title = PlainText::clean($record->name) ?: '未命名穴位';
        [$name, $code] = $this->splitTitle($title);
        $summary = '';
        foreach ([$record->adscription, $record->locate, $record->indications] as $source) {
            $summary = PlainText::preview($source);
            if ($summary !== '') break;
        }
        $meridian = PlainText::clean($record->meridian);
        $pulse = PlainText::clean($record->pulse);
        return [
            'id' => (int) $record->acupoint_id,
            'title' => $title,
            'name' => $name,
            'code' => $code,
            'pinyin' => PlainText::clean($record->pinyin),
            'channel' => $meridian ?: $pulse,
            'summary' => $summary,
        ];
    }

    private function splitTitle(string $title): array
    {
        if (preg_match('/^(.*?)[（(]\s*([A-Za-z]{1,4}\s*\d+)\s*[）)]\s*$/u', $title, $matches)) {
            return [trim($matches[1]), strtoupper((string) preg_replace('/\s+/', '', $matches[2]))];
        }
        return [$title, ''];
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
            1044 => '数据库账号无法访问穴位数据库，请检查数据库配置与账号权限',
            1045 => '数据库账号无法访问穴位数据库，请检查数据库配置与账号权限',
            1142 => '数据库账号无权读取穴位表，请为 t_acupoints 授予 SELECT 权限',
            1146 => '未找到穴位数据表，请检查 ACUPOINTS_TABLE 配置',
            1054 => '穴位数据表字段不匹配，请检查 t_acupoints 表结构',
        ];
        return $this->error($messages[$driverCode] ?? '穴位加载失败，请稍后重试', 500);
    }

    private function success($data) { return response()->json(['code' => 0, 'data' => $data]); }
    private function error(string $message, int $status) { return response()->json(['code' => -1, 'errorMsg' => $message], $status); }
}
