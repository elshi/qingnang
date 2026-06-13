<?php

namespace App\Http\Controllers;

use App\Book;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Validator;
use RuntimeException;
use Throwable;

class BookController extends Controller
{
    private const CHAPTER_FIELD_CANDIDATES = [
        'id' => ['id', 'chapter_id', 'chapterid'],
        'book_id' => ['book_id', 'bookid', 'books_id', 'bookId', 'bid'],
        'book_name' => ['book_name', 'bookname', 'book_title'],
        'title' => ['title', 'chapter_title', 'chapter_name', 'chapter', 'name'],
        'content' => ['content', 'chapter_content', 'chapter_text', 'text', 'body', 'original'],
        'volume' => ['volume'],
        'shiyi' => ['shiyi'],
    ];

    public function index(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'dynasty' => 'nullable|string|max:50',
            'keyword' => 'nullable|string|max:100',
        ]);

        if ($validator->fails()) {
            return $this->error($validator->errors()->first(), 422);
        }

        try {
            $query = Book::query();

            if ($request->filled('dynasty')) {
                $query->where('dynasty', trim($request->input('dynasty')));
            }

            if ($request->filled('keyword')) {
                $keyword = trim($request->input('keyword'));
                $query->where(function ($searchQuery) use ($keyword) {
                    $searchQuery->where('name', 'like', '%' . $keyword . '%')
                        ->orWhere('summary', 'like', '%' . $keyword . '%')
                        ->orWhere('author', 'like', '%' . $keyword . '%');
                });
            }

            $books = $query->orderBy('id')->get();
            $chapterCounts = $this->chapterCounts($books);
            $items = $books->map(function (Book $book) use ($chapterCounts) {
                return $this->transformBook($book, $chapterCounts[$book->id] ?? 0);
            })->values();

            return $this->success([
                'items' => $items,
                'dynasties' => $items->pluck('dynasty')->filter()->unique()->values(),
            ]);
        } catch (Throwable $exception) {
            report($exception);
            return $this->error($this->databaseAccessError($exception, '医书列表加载失败，请稍后重试'), 500);
        }
    }

    public function show($id)
    {
        if (!$this->validId($id)) {
            return $this->error('医书 ID 无效', 422);
        }

        try {
            $book = Book::query()->find((int) $id);

            if (!$book) {
                return $this->error('未找到该医书', 404);
            }

            $chapters = $this->chaptersForBook($book);
            $data = $this->transformBook($book, $chapters->count());
            $data['chapters'] = $chapters->map(function ($chapter) {
                return [
                    'id' => $chapter->chapter_id,
                    'title' => $chapter->chapter_title ?: '未命名章节',
                    'volume' => $chapter->chapter_volume,
                ];
            })->values();

            return $this->success($data);
        } catch (Throwable $exception) {
            report($exception);
            return $this->error($this->databaseAccessError($exception, '医书详情加载失败，请稍后重试'), 500);
        }
    }

    public function chapter($id, $chapterId)
    {
        if (!$this->validId($id) || !$this->validId($chapterId)) {
            return $this->error('章节 ID 无效', 422);
        }

        try {
            $book = Book::query()->find((int) $id);
            if (!$book) {
                return $this->error('未找到该医书', 404);
            }

            $fields = $this->chapterFields();
            $select = [
                $fields['id'] . ' as chapter_id',
                $fields['title'] . ' as chapter_title',
                $fields['content'] . ' as chapter_content',
                $fields['shiyi']
                    ? $fields['shiyi'] . ' as chapter_shiyi'
                    : DB::raw('NULL as chapter_shiyi'),
            ];
            $chapter = DB::table(config('database.book_chapters_table'))
                ->where($fields['relation'], $this->chapterRelationValue($book, $fields))
                ->where($fields['id'], (int) $chapterId)
                ->first($select);

            if (!$chapter) {
                return $this->error('未找到该章节', 404);
            }

            return $this->success([
                'id' => (int) $chapter->chapter_id,
                'book_id' => $book->id,
                'title' => $chapter->chapter_title ?: '未命名章节',
                'content' => $chapter->chapter_content,
                'shiyi' => $chapter->chapter_shiyi,
            ]);
        } catch (Throwable $exception) {
            report($exception);
            return $this->error($this->databaseAccessError($exception, '章节内容加载失败，请稍后重试'), 500);
        }
    }

    private function chaptersForBook(Book $book): Collection
    {
        $fields = $this->chapterFields();

        $select = [
            $fields['id'] . ' as chapter_id',
            $fields['title'] . ' as chapter_title',
            $fields['volume']
                ? $fields['volume'] . ' as chapter_volume'
                : DB::raw('NULL as chapter_volume'),
        ];

        return DB::table(config('database.book_chapters_table'))
            ->where($fields['relation'], $this->chapterRelationValue($book, $fields))
            ->orderBy($fields['id'])
            ->get($select);
    }

    private function chapterCounts(Collection $books): array
    {
        if ($books->isEmpty()) {
            return [];
        }

        try {
            $fields = $this->chapterFields();
            $relationValues = $fields['relation_type'] === 'book_name'
                ? $books->pluck('name')->filter()->values()
                : $books->pluck('id')->values();
            $counts = DB::table(config('database.book_chapters_table'))
                ->select($fields['relation'], DB::raw('COUNT(*) as chapter_count'))
                ->whereIn($fields['relation'], $relationValues)
                ->groupBy($fields['relation'])
                ->pluck('chapter_count', $fields['relation']);

            return $books->mapWithKeys(function (Book $book) use ($counts, $fields) {
                $key = $fields['relation_type'] === 'book_name' ? $book->name : $book->id;
                return [$book->id => (int) ($counts[$key] ?? 0)];
            })->all();
        } catch (Throwable $exception) {
            report($exception);
            return [];
        }
    }

    private function chapterFields(): array
    {
        $columns = $this->tableColumns(config('database.book_chapters_table'));
        $id = $this->resolveField($columns, null, self::CHAPTER_FIELD_CANDIDATES['id']);
        $title = $this->resolveField(
            $columns,
            config('database.book_chapter_title_field'),
            self::CHAPTER_FIELD_CANDIDATES['title']
        );
        $content = $this->resolveField(
            $columns,
            config('database.book_chapter_content_field'),
            self::CHAPTER_FIELD_CANDIDATES['content']
        );
        $volume = $this->resolveField(
            $columns,
            config('database.book_chapter_volume_field'),
            self::CHAPTER_FIELD_CANDIDATES['volume'],
            false
        );
        $shiyi = $this->resolveField(
            $columns,
            config('database.book_chapter_shiyi_field'),
            self::CHAPTER_FIELD_CANDIDATES['shiyi'],
            false
        );
        $bookId = $this->resolveField(
            $columns,
            config('database.book_chapter_book_id_field'),
            self::CHAPTER_FIELD_CANDIDATES['book_id'],
            false
        );
        $bookName = $this->resolveField($columns, null, self::CHAPTER_FIELD_CANDIDATES['book_name'], false);

        if (!$bookId && !$bookName) {
            throw new RuntimeException('章节表缺少书籍关联字段');
        }

        return [
            'id' => $id,
            'title' => $title,
            'content' => $content,
            'volume' => $volume,
            'shiyi' => $shiyi,
            'relation' => $bookId ?: $bookName,
            'relation_type' => $bookId ? 'book_id' : 'book_name',
        ];
    }

    private function resolveField(array $columns, ?string $configured, array $candidates, bool $required = true): ?string
    {
        $values = array_values(array_unique(array_filter(array_merge([$configured], $candidates))));
        foreach ($values as $field) {
            if (in_array($field, $columns, true)) {
                return $field;
            }
        }

        if ($required) {
            throw new RuntimeException('章节表字段不完整');
        }

        return null;
    }

    private function tableColumns(string $configuredTable): array
    {
        if (DB::connection()->getDriverName() === 'sqlite') {
            return Schema::getColumnListing($configuredTable);
        }

        [$database, $table] = $this->splitTableName($configuredTable);
        $rows = DB::table('information_schema.COLUMNS')
            ->where('TABLE_SCHEMA', $database)
            ->where('TABLE_NAME', $table)
            ->orderBy('ORDINAL_POSITION')
            ->pluck('COLUMN_NAME');

        if ($rows->isEmpty()) {
            throw new RuntimeException('无法读取章节表结构');
        }

        return $rows->all();
    }

    private function splitTableName(string $configuredTable): array
    {
        if (strpos($configuredTable, '.') !== false) {
            return explode('.', $configuredTable, 2);
        }

        return [DB::connection()->getDatabaseName(), $configuredTable];
    }

    private function chapterRelationValue(Book $book, array $fields)
    {
        return $fields['relation_type'] === 'book_name' ? $book->name : $book->id;
    }

    private function transformBook(Book $book, int $chapterCount): array
    {
        return [
            'id' => $book->id,
            'name' => $book->name,
            'summary' => $book->summary,
            'dynasty' => $book->dynasty,
            'author' => $book->author,
            'chapter_count' => $chapterCount,
        ];
    }

    private function databaseAccessError(Throwable $exception, string $fallback): string
    {
        $driverCode = isset($exception->errorInfo[1]) ? (int) $exception->errorInfo[1] : 0;
        if ($driverCode === 1142) {
            return '数据库账号无权读取书籍数据，请为 t_books 和 t_book_chapters 授予 SELECT 权限';
        }
        if ($driverCode === 1146) {
            return '未找到书籍数据表，请检查 BOOKS_TABLE 和 BOOK_CHAPTERS_TABLE 配置';
        }
        if ($driverCode === 1054) {
            return '书籍数据表字段不匹配，请检查章节字段配置';
        }
        if ($exception instanceof QueryException) {
            return $fallback;
        }
        if ($exception instanceof RuntimeException) {
            return $exception->getMessage() . '，请检查章节表字段配置与 SELECT 权限';
        }

        return $fallback;
    }

    private function validId($id): bool
    {
        return ctype_digit((string) $id) && (int) $id > 0;
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
