<?php

namespace App\Http\Controllers;

use App\CaseRecord;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Throwable;

class CaseController extends Controller
{
    private const SEARCH_FIELDS = [
        'diseases',
        'symptoms',
        'doctor',
        'dynasty',
        'bookname',
        'content',
        'origin_symptoms',
        'temp_tags',
        'summary',
        'method',
    ];

    public function index(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'page' => 'nullable|integer|min:1',
            'page_size' => 'nullable|integer|min:1|max:50',
            'keyword' => 'nullable|string|max:100',
            'doctor' => 'nullable|string|max:50',
            'bookname' => 'nullable|string|max:100',
        ]);

        if ($validator->fails()) {
            return $this->error($validator->errors()->first(), 422);
        }

        try {
            $page = (int) $request->input('page', 1);
            $pageSize = (int) $request->input('page_size', 20);
            $query = CaseRecord::query();

            if ($request->filled('doctor')) {
                $query->where('doctor', trim($request->input('doctor')));
            }

            if ($request->filled('bookname')) {
                $query->where('bookname', trim($request->input('bookname')));
            }

            if ($request->filled('keyword')) {
                foreach ($this->searchKeywords($request->input('keyword')) as $keyword) {
                    $query->where(function ($searchQuery) use ($keyword) {
                        foreach (self::SEARCH_FIELDS as $index => $field) {
                            $method = $index === 0 ? 'where' : 'orWhere';
                            $searchQuery->{$method}($field, 'like', '%' . $keyword . '%');
                        }
                    });
                }
            }

            $total = (clone $query)->count();
            $records = $query
                ->orderByDesc('confidence')
                ->orderByDesc('id')
                ->forPage($page, $pageSize)
                ->get();

            return $this->success([
                'items' => $records->map(function (CaseRecord $record) {
                    return $this->transformListItem($record);
                })->values(),
                'page' => $page,
                'page_size' => $pageSize,
                'has_more' => $page * $pageSize < $total,
                'total' => $total,
            ]);
        } catch (Throwable $exception) {
            report($exception);
            return $this->error('医案列表加载失败，请稍后重试', 500);
        }
    }

    public function facets()
    {
        try {
            return $this->success([
                'doctors' => $this->facet('doctor'),
                'books' => $this->facet('bookname'),
            ]);
        } catch (Throwable $exception) {
            report($exception);
            return $this->error('医案分类加载失败，请稍后重试', 500);
        }
    }

    public function show($id)
    {
        if (!ctype_digit((string) $id) || (int) $id < 1) {
            return $this->error('医案 ID 无效', 422);
        }

        try {
            $record = CaseRecord::query()->find((int) $id);

            if (!$record) {
                return $this->error('未找到该医案', 404);
            }

            return $this->success($this->transformDetail($record));
        } catch (Throwable $exception) {
            report($exception);
            return $this->error('医案详情加载失败，请稍后重试', 500);
        }
    }

    private function facet(string $field)
    {
        return CaseRecord::query()
            ->select($field, DB::raw('COUNT(*) as case_count'))
            ->whereNotNull($field)
            ->where($field, '<>', '')
            ->groupBy($field)
            ->orderByDesc('case_count')
            ->orderBy($field)
            ->get()
            ->map(function ($row) use ($field) {
                return [
                    'name' => $row->{$field},
                    'case_count' => (int) $row->case_count,
                ];
            })
            ->values();
    }

    private function transformListItem(CaseRecord $record): array
    {
        return [
            'id' => $record->id,
            'title' => $this->title($record),
            'diseases' => $record->diseases,
            'doctor' => $record->doctor,
            'dynasty' => $record->dynasty,
            'bookname' => $record->bookname,
            'source' => $record->bookname,
            'symptoms' => $record->symptoms,
            'symptom_tags' => $this->tags($record->symptoms),
            'summary' => $this->listSummary($record),
            'content_preview' => $this->contentPreview($record->content),
            'tags' => $this->tags($record->temp_tags),
            'confidence' => (float) $record->confidence,
        ];
    }

    private function transformDetail(CaseRecord $record): array
    {
        return array_merge($this->transformListItem($record), [
            'symptoms' => $record->symptoms,
            'subject' => $record->subject,
            'content' => $record->content,
            'origin_symptoms' => $record->origin_symptoms,
            'modern_prescription' => $record->modern_prescription,
            'analysis' => $record->summary,
            'method' => $record->method,
            'course_days' => $record->course_days,
        ]);
    }

    private function title(CaseRecord $record): string
    {
        $doctor = trim((string) $record->doctor);
        $diseases = trim((string) $record->diseases);
        $diseases = trim((string) preg_replace('/\s*\/+\s*/u', ' ', $diseases));

        if ($doctor && $diseases) {
            return $doctor . ' · ' . $diseases;
        }

        return $diseases ?: ($doctor ?: '经典医案');
    }

    private function listSummary(CaseRecord $record): string
    {
        foreach ([$record->symptoms, $record->summary, $record->content] as $value) {
            $value = trim((string) $value);
            if ($value !== '') {
                return mb_strlen($value) > 180 ? mb_substr($value, 0, 180) . '…' : $value;
            }
        }

        return '';
    }

    private function tags($value): array
    {
        $parts = preg_split('/[\/，,、；;]+/u', (string) $value);
        $parts = array_map('trim', $parts ?: []);
        return array_values(array_unique(array_filter($parts, function ($tag) {
            return $tag !== '';
        })));
    }

    private function searchKeywords($value): array
    {
        $parts = preg_split('/\s+/u', trim((string) $value));

        return array_values(array_filter($parts ?: [], function ($keyword) {
            return $keyword !== '';
        }));
    }

    private function contentPreview($value): string
    {
        $value = preg_replace('/\R+/u', '', trim((string) $value));

        return $value === '' ? '' : mb_substr($value, 0, 42) . '...';
    }

    private function success($data)
    {
        return response()->json(['code' => 0, 'data' => $data]);
    }

    private function error(string $message, int $status)
    {
        return response()->json([
            'code' => -1,
            'errorMsg' => $message,
        ], $status);
    }
}
